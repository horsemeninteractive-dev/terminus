import {
  BuildingCategory,
  BuildingPolygon,
} from '../types/map';
import {
  LocationConfidence,
  LocationSpec,
  OSMLocationCategory,
  OSMLocationSubtype,
  ResolvedLocation,
} from '../types/osmLocation';
import {
  BUILDING_VALUE_TABLE,
  CATCH_ALL_TAG_KEYS,
  FUNCTION_TAG_PRIORITY,
  FUNCTION_VALUE_TABLES,
  LANDUSE_VALUE_TABLE,
  NAME_KEYWORD_FALLBACKS,
} from '../data/osmLocationRules';

/** Values that never carry functional meaning on their own. */
const GENERIC_VALUES = new Set(['yes', 'no', 'true', 'false', 'none', 'unknown', 'undefined']);

/**
 * Splits a raw OSM tag value into normalized tokens. Handles uppercase values,
 * semicolon/comma separated lists ("doityourself;tools") and stray whitespace.
 */
export function normalizeOsmTagValue(value: string | undefined | null): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const raw of value.toLowerCase().split(/[;,]/)) {
    const t = raw.trim();
    if (t) out.push(t);
  }
  return out;
}

/** Lower-cases tag keys and normalizes each value into its token list. */
export function normalizeOsmTags(tags: Record<string, string> | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!tags) return out;
  for (const [key, value] of Object.entries(tags)) {
    const tokens = normalizeOsmTagValue(value);
    if (tokens.length > 0) out[key.toLowerCase()] = tokens;
  }
  return out;
}

interface RuleCandidate {
  priority: number;
  key: string;
  value: string;
  catchAll: boolean;
  /** Declaration order within a tag value list (first token wins ties). */
  seq: number;
  spec: LocationSpec;
}

/** Every building=* value a typical resolver run cares about (for keyword upgrades). */
const GENERIC_BUILDING_RESULTS = new Set<OSMLocationCategory>([
  'residential',
  'unknown',
  'generic_public',
  'generic_commercial',
]);

interface NameMatch {
  category: OSMLocationCategory;
  subtype?: OSMLocationSubtype;
  matchedTerm: string;
}

/** Explicit keyword lookup (word boundaries, whole-phrase aware) over a name/operator string. */
function matchNameKeywords(text: string): NameMatch | null {
  const t = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  let best: NameMatch | null = null;
  let bestLen = 0;
  for (const rule of NAME_KEYWORD_FALLBACKS) {
    for (const term of rule.terms) {
      const probe = term.trim();
      if (probe.length <= bestLen) continue;
      const escaped = probe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}`, 'i').test(t) || new RegExp(`${escaped}\\b`, 'i').test(t)) {
        best = { category: rule.category, subtype: rule.subtype, matchedTerm: term.trim() };
        bestLen = probe.length;
      }
    }
  }
  return best;
}

function collectFunctionalCandidates(tags: Record<string, string[]>): RuleCandidate[] {
  const candidates: RuleCandidate[] = [];
  for (const [key, tokens] of Object.entries(tags)) {
    const table = FUNCTION_VALUE_TABLES[key];
    const priority = FUNCTION_TAG_PRIORITY[key];
    if (!table && priority === undefined && !CATCH_ALL_TAG_KEYS[key]) continue;

    const catchAllSpec = CATCH_ALL_TAG_KEYS[key];
    for (let seq = 0; seq < tokens.length; seq++) {
      const token = tokens[seq];
      if (GENERIC_VALUES.has(token)) continue;
      const spec = table?.[token];
      if (spec) {
        candidates.push({ priority: priority ?? 0, key, value: token, catchAll: false, seq, spec });
      } else if (catchAllSpec) {
        candidates.push({ priority: priority ?? 0, key, value: token, catchAll: true, seq, spec: catchAllSpec });
      }
    }
  }
  return candidates;
}

function fmtPair(key: string, value: string): string {
  return `${key}=${value}`;
}

function buildResolved(
  category: OSMLocationCategory,
  subtype: OSMLocationSubtype | undefined,
  confidence: LocationConfidence,
  source: ResolvedLocation['source'],
  matchedTags: string[],
  secondary: LocationSpec[] = []
): ResolvedLocation {
  return { category, subtype, confidence, source, matchedTags, secondary };
}

/**
 * Fallback mapping from the coarse map-level BuildingCategory (used when a
 * building has no usable OSM tags, e.g. legacy saves).
 */
export function locationFromBuildingCategory(
  category: BuildingCategory
): { category: OSMLocationCategory; subtype?: OSMLocationSubtype } {
  switch (category) {
    case 'supermarket':
      return { category: 'food', subtype: 'supermarket' };
    case 'pharmacy':
      return { category: 'medical', subtype: 'pharmacy' };
    case 'hospital':
      return { category: 'medical', subtype: 'hospital' };
    case 'school':
      return { category: 'education', subtype: 'school' };
    case 'gas_station':
      return { category: 'fuel', subtype: 'fuel_station' };
    case 'police':
      return { category: 'police', subtype: 'police' };
    case 'warehouse':
      return { category: 'warehouse', subtype: 'warehouse' };
    case 'industrial':
      return { category: 'industrial' };
    case 'restaurant':
      return { category: 'food', subtype: 'restaurant' };
    case 'commercial':
      return { category: 'generic_commercial' };
    case 'residential':
      return { category: 'residential' };
    case 'civic':
      return { category: 'generic_public' };
    case 'other':
      return { category: 'unknown' };
    default:
      return { category: 'unknown' };
  }
}

export interface ResolveContext {
  /** building=* raw value (may equal tags.building). */
  rawType?: string;
  name?: string;
  operator?: string;
  /** Coarse map-level category from the existing processor (legacy fallback). */
  fallbackCategory?: BuildingCategory;
}

/**
 * Translates raw OSM tags into a canonical Terminus location.
 *
 * Priority order (deterministic):
 *   1. functional tags (healthcare > amenity/shop > craft > industrial > office > ...)
 *   2. specialist building=* values
 *   3. landuse context
 *   4. name/operator keywords (explicit terms, low confidence)
 *   5. legacy BuildingCategory fallback when the building has NO tags at all
 *   6. 'unknown' — always scavengable via the generic profile
 */
export function resolveOsmLocation(
  rawTags: Record<string, string> | undefined,
  ctx: ResolveContext = {}
): ResolvedLocation {
  const tags = normalizeOsmTags(rawTags);
  const hasAnyTag = Object.keys(tags).length > 0;

  const functional = collectFunctionalCandidates(tags);
  if (functional.length > 0) {
    // Deterministic order: highest priority first; within a priority,
    // specific rules beat catch-alls, then declaration order (the order tags
    // appear in the object, and the order tokens appear inside each value).
    const keysInOrder = Object.keys(tags);
    functional.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.catchAll !== b.catchAll) return a.catchAll ? 1 : -1;
      const ki = keysInOrder.indexOf(a.key);
      const kj = keysInOrder.indexOf(b.key);
      if (ki !== kj) return ki - kj;
      if (a.seq !== b.seq) return a.seq - b.seq;
      const ka = `${a.key}=${a.value}`;
      const kb = `${b.key}=${b.value}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    const best = functional[0];
    const topTier = best.priority;
    const secondary: LocationSpec[] = [];
    const matched: string[] = [fmtPair(best.key, best.value)];
    for (const c of functional) {
      if (c.priority !== topTier) continue;
      const pair = fmtPair(c.key, c.value);
      if (c === best) continue;
      // A candidate is hybrid when it names a DIFFERENT category (e.g.
      // medical/pharmacy next to food/supermarket) OR a more specific
      // subtype of the same category (e.g. a restaurant inside a
      // supermarket). Same-category secondaries are recorded only with their
      // subtype so the roll layer blends the exact profile instead of the
      // category default (which would duplicate the primary profile).
      const differsByCategory = c.spec.category !== best.spec.category;
      const differsBySubtype =
        c.spec.category === best.spec.category &&
        !!c.spec.subtype &&
        c.spec.subtype !== best.spec.subtype;
      if (differsByCategory || differsBySubtype) {
        const existing = secondary.find((s) => s.category === c.spec.category);
        if (existing) {
          if (!existing.subtype && c.spec.subtype) existing.subtype = c.spec.subtype;
        } else {
          secondary.push({ category: c.spec.category, subtype: c.spec.subtype });
        }
      }
      if (matched.length < 4 && !matched.includes(pair)) matched.push(pair);
    }
    return buildResolved(
      best.spec.category,
      best.spec.subtype,
      'high',
      'tags',
      matched,
      secondary
    );
  }

  // Specialist building=* value
  const buildingTokens = normalizeOsmTagValue(rawTags?.building ?? ctx.rawType);
  for (const token of buildingTokens) {
    const spec = BUILDING_VALUE_TABLE[token];
    if (spec && !GENERIC_VALUES.has(token)) {
      let resolved = buildResolved(spec.category, spec.subtype, 'medium', 'building_value', [
        `building=${token}`,
      ]);
      // A strong name keyword can refine a generic building shell (e.g. a
      // house-shaped building that is actually "West High School").
      if (GENERIC_BUILDING_RESULTS.has(resolved.category)) {
        const keyword = matchNameKeywords(ctx.name || ctx.operator || '');
        if (keyword && keyword.category !== 'residential') {
          resolved = buildResolved(keyword.category, keyword.subtype, 'low', 'name', [
            `name*=${keyword.matchedTerm}`,
          ]);
        }
      }
      return resolved;
    }
  }

  // Landuse context
  const landuseTokens = tags.landuse ?? [];
  for (const token of landuseTokens) {
    const spec = LANDUSE_VALUE_TABLE[token];
    if (spec) {
      return buildResolved(spec.category, spec.subtype, 'medium', 'landuse', [`landuse=${token}`]);
    }
  }

  // Name / operator keyword fallback
  const keyword = matchNameKeywords(ctx.name || ctx.operator || '');
  if (keyword) {
    return buildResolved(keyword.category, keyword.subtype, 'low', 'name', [
      `name*=${keyword.matchedTerm}`,
    ]);
  }

  // Legacy fallback: no tags at all but the map processor stored a category.
  if (!hasAnyTag && ctx.fallbackCategory) {
    const fb = locationFromBuildingCategory(ctx.fallbackCategory);
    return buildResolved(fb.category, fb.subtype, 'low', 'category_fallback', []);
  }

  return buildResolved('unknown', undefined, 'low', 'default', []);
}

/**
 * Convenience resolver for a full BuildingPolygon. Falls back to the stored
 * coarse category only when the building carries no OSM tags at all.
 */
export function resolveBuildingLocation(b: BuildingPolygon): ResolvedLocation {
  return resolveOsmLocation(b.tags, {
    rawType: b.rawType,
    name: b.name,
    operator: b.tags?.operator,
    fallbackCategory: Object.keys(b.tags || {}).length === 0 ? b.type : undefined,
  });
}

/**
 * Human-readable label for a resolved location. Prefers the specific subtype
 * ("Library", "Fuel Station", "Hospital") and falls back to the category
 * name ("Residential", "Office") when no subtype is known.
 */
export function humanLocationLabel(r: Pick<ResolvedLocation, 'category' | 'subtype'>): string {
  const raw = r.subtype || r.category || 'unknown';
  return raw
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Debug inspection helper: readable summary of how a building was classified.
 */
export function describeResolution(r: ResolvedLocation): string {
  const lines = [
    `Classification: ${r.category.toUpperCase()}${r.subtype ? ` (${r.subtype})` : ''}`,
    `Confidence: ${r.confidence.toUpperCase()}`,
    `Source: ${r.source}`,
  ];
  if (r.matchedTags.length > 0) lines.push(`Matched tags: ${r.matchedTags.join(', ')}`);
  if (r.secondary.length > 0) {
    lines.push(
      `Hybrid modifiers: ${r.secondary
        .map((s) => s.category.toUpperCase() + (s.subtype ? ` (${s.subtype})` : ''))
        .join(', ')}`
    );
  }
  return lines.join('\n');
}
