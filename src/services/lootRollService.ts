import { LootProfile, LootProfileEntry, LocationSpec, ResolvedLocation } from '../types/osmLocation';
import { SquadLootItem } from '../types/population';
import { BuildingPolygon } from '../types/map';
import { getLootProfileForLocation } from '../data/lootProfiles';
import { describeResolution, resolveBuildingLocation } from './osmLocationResolver';

/** Same footprint math as scavengingService.calculateBuildingFootprintArea
 * (kept local to avoid a service import cycle). */
function buildingFootprintAreaM2(b: BuildingPolygon): number {
  if (b.polygon && b.polygon.length >= 3) {
    let sum = 0;
    for (let j = 0; j < b.polygon.length; j++) {
      const next = (j + 1) % b.polygon.length;
      sum += b.polygon[j].x * b.polygon[next].z - b.polygon[next].x * b.polygon[j].z;
    }
    const area = Math.abs(sum) / 2;
    if (area > 8) return Math.round(area);
  }
  return 180;
}

/** Physical kg per unit for each stockpile resource (matches historical loot weights). */
const RESOURCE_KG: Record<string, number> = {
  canned_goods: 1.2,
  dried_rations: 0.8,
  bottled_water: 1.0,
  first_aid_kits: 1.5,
  sterile_bandages: 0.4,
  antibiotics: 0.4,
  painkillers: 0.4,
  gasoline: 0.5,
  diesel: 0.5,
  ammunition: 0.15,
  wood: 1.2,
  metal: 1.5,
  bricks: 2.0,
  tools: 1.8,
  logs: 1.2,
  scrap: 0.9,
  scientific_materials: 0.8,
};

function makeId(label: string): string {
  return `${label}_${Math.random().toString(36).slice(2, 10)}`;
}

function entryWeightKg(e: LootProfileEntry): number {
  if (e.kind === 'resource') return RESOURCE_KG[e.label] ?? 1;
  if (e.kind === 'weapon') return 3.2;
  return 4.0; // armor
}

/** Inclusive random integer in [min, max] (same contract as the historic roll). */
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Diminishing-returns size scaling. A 100 m² building rolls at roughly 1.0×;
 * doubling footprint adds less and less until ~1.9× for enormous complexes.
 * Bigger buildings also roll a couple of extra pool stacks (capped).
 */
export function sizeScaleForArea(areaM2: number): { quantityScale: number; extraRolls: number } {
  const a = Math.max(0, areaM2 || 0);
  const quantityScale = Math.min(1.9, 0.92 + 0.95 * (1 - Math.exp(-a / 1400)));
  const extraRolls = Math.max(0, Math.min(2, Math.floor(Math.log2(Math.max(1, a / 220)))));
  return { quantityScale, extraRolls };
}

/**
 * Weighted sample of `k` distinct entries without replacement. Uses
 * Efraimidis–Spirakis keys; on ties (e.g. a stubbed Math.random of 0) the
 * earlier pool entries win deterministically.
 */
function sampleWeighted(entries: LootProfileEntry[], k: number): LootProfileEntry[] {
  if (k >= entries.length) return [...entries];
  const scored = entries.map((entry, index) => ({
    entry,
    index,
    key: Math.random() ** (1 / Math.max(0.0001, entry.weight)),
  }));
  scored.sort((a, b) => (b.key !== a.key ? b.key - a.key : a.index - b.index));
  return scored.slice(0, k).map((s) => s.entry);
}

/**
 * Builds a weighted candidate list for `count` rolls from an entry pool,
 * skipping entries whose kind+label already appears in `used` (dedupe across
 * guaranteed stacks and earlier rolls).
 */
function buildCandidates(
  pool: LootProfileEntry[],
  used: Set<string>,
  weightScale = 1
): LootProfileEntry[] {
  return pool
    .filter((e) => !used.has(`${e.kind}:${e.label}`))
    .map((e) => ({ ...e, weight: e.weight * weightScale }));
}

function rollQuantity(e: LootProfileEntry, multiplier: number, quantityScale: number): number {
  if (e.kind !== 'resource') return 1;
  const base = randInt(Math.max(1, e.minQuantity), Math.max(1, e.maxQuantity));
  return Math.max(1, Math.round(base * multiplier * quantityScale));
}

function toLootItem(e: LootProfileEntry, quantity: number): SquadLootItem {
  const item: SquadLootItem = {
    id: makeId(e.label),
    kind: e.kind,
    label: e.label,
    quantity,
    weight: entryWeightKg(e),
  };
  if (e.itemId) item.itemId = e.itemId;
  return item;
}

/**
 * Rolls the main profile for a resolved location: guaranteed stacks always
 * produce one item, then extra stacks are sampled from the weighted pool,
 * scaled by the building footprint with diminishing returns.
 */
function rollProfile(
  profile: LootProfile,
  areaM2: number,
  resourceMultiplier: number
): { items: SquadLootItem[]; used: Set<string> } {
  const { quantityScale, extraRolls } = sizeScaleForArea(areaM2);

  const items: SquadLootItem[] = [];
  const usedLabels = new Set<string>();

  // Guaranteed stacks first.
  for (const e of profile.guaranteed) {
    const quantity = rollQuantity(e, resourceMultiplier, quantityScale);
    items.push(toLootItem(e, quantity));
    usedLabels.add(`${e.kind}:${e.label}`);
  }

  // Weighted pool sampling (skip entries that duplicate an already-rolled kind+label).
  const available = profile.pool.filter((e) => !usedLabels.has(`${e.kind}:${e.label}`));
  const rollCount = Math.min(
    available.length,
    randInt(profile.minRolls, profile.maxRolls) + extraRolls
  );
  if (rollCount > 0) {
    for (const e of sampleWeighted(available, rollCount)) {
      items.push(toLootItem(e, rollQuantity(e, resourceMultiplier, quantityScale)));
      usedLabels.add(`${e.kind}:${e.label}`);
    }
  }
  return { items, used: usedLabels };
}

/**
 * Blends secondary (hybrid) functions into the roll at reduced strength: every
 * secondary profile entry becomes a candidate at 30% weight, and 1-2 extra
 * stacks are drawn (a secondary category's guaranteed staples still carry the
 * highest relative weights inside that candidate set). This keeps the primary
 * identity dominant while making the secondary genuinely influence loot — a
 * supermarket+pharmacy regularly turns up medicines.
 */
function rollSecondaryHybrids(
  location: ResolvedLocation,
  used: Set<string>,
  areaM2: number,
  resourceMultiplier: number
): SquadLootItem[] {
  if (location.secondary.length === 0) return [];

  // Deterministic order by declaration: secondary specs as recorded by the
  // resolver. A secondary in the SAME category as the primary only contributes
  // when it carries a distinct subtype (e.g. food/restaurant inside a
  // food/supermarket); a bare same-category spec would just re-roll the
  // primary profile, so it is skipped.
  const profiles = location.secondary
    .filter(
      (spec: LocationSpec) =>
        spec.category !== location.category || (!!spec.subtype && spec.subtype !== location.subtype)
    )
    .map((spec: LocationSpec) =>
      getLootProfileForLocation({ category: spec.category, subtype: spec.subtype })
    );
  if (profiles.length === 0) return [];

  // Guaranteed staples + thematic pool entries, deduped across the secondary
  // set and against anything the primary already rolled.
  const merged: LootProfileEntry[] = [];
  const seen = new Set<string>();
  for (const p of profiles) {
    for (const e of [...p.guaranteed, ...p.pool]) {
      const k = `${e.kind}:${e.label}`;
      if (used.has(k) || seen.has(k)) continue;
      seen.add(k);
      merged.push(e);
    }
  }
  if (merged.length === 0) return [];

  // Secondary functions add 1-2 rolls (capped by how many functions blended),
  // never flooding the squad's inventory — the primary dominates.
  const extraRolls = Math.max(0, Math.min(2, Math.floor(Math.log2(Math.max(1, areaM2 / 220)))));
  const cap = Math.max(1, Math.min(2, location.secondary.length));
  const drawCount = Math.min(merged.length, Math.min(cap, 1 + extraRolls));

  const { quantityScale } = sizeScaleForArea(areaM2);
  const items: SquadLootItem[] = [];
  if (drawCount > 0) {
    for (const e of sampleWeighted(buildCandidates(merged, used, 0.3), drawCount)) {
      items.push(toLootItem(e, rollQuantity(e, resourceMultiplier, quantityScale)));
    }
  }
  return items;
}

/**
 * Rolls a complete loot pool for a resolved location.
 *
 * The primary profile always rolls (guaranteed + weighted pool, footprint
 * scaled). When the resolver recorded hybrid secondary functions (e.g. a
 * supermarket+pharmacy or university+library), their specialties are blended
 * in at reduced weight so the mixed building genuinely yields a mix.
 */
export function rollLootForLocation(
  location: ResolvedLocation,
  areaM2: number,
  resourceMultiplier = 1
): SquadLootItem[] {
  const profile = getLootProfileForLocation(location);
  const primary = rollProfile(profile, areaM2, resourceMultiplier);

  // Secondary functions blend in AFTER the primary pool so they can only add
  // stacks the primary did not already provide.
  const secondary = rollSecondaryHybrids(location, primary.used, areaM2, resourceMultiplier);

  return [...primary.items, ...secondary];
}

/**
 * Rolls loot for a real map building: resolve its OSM tags to a canonical
 * location, then roll the matching profile scaled by its footprint.
 */
export function rollLootForBuilding(
  b: BuildingPolygon,
  resourceMultiplier = 1
): { loot: SquadLootItem[]; location: ResolvedLocation } {
  const location = resolveBuildingLocation(b);
  const area = buildingFootprintAreaM2(b);
  return { loot: rollLootForLocation(location, area, resourceMultiplier), location };
}

/**
 * Debug/inspection helper — printable classification + profile breakdown for a
 * building (see the OSM classification & loot profile requirements).
 */
export function summarizeBuildingLoot(b: BuildingPolygon): string {
  const location = resolveBuildingLocation(b);
  const profile = getLootProfileForLocation(location);
  const area = buildingFootprintAreaM2(b);
  const lines: string[] = [];

  lines.push(`Building: ${b.name || '(unnamed)'} (${b.type})`);
  const tagList = Object.entries(b.tags || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  lines.push(tagList ? `OSM:\n${tagList}` : 'OSM: (no tags)');
  lines.push(describeResolution(location));
  lines.push(`Loot Profile (${area}m²): ${profile.summary}`);

  const guaranteedLabels = profile.guaranteed.map((e) => e.label);
  if (guaranteedLabels.length > 0) {
    lines.push(`Guaranteed: ${guaranteedLabels.join(', ')}`);
  }
  if (profile.pool.length > 0) {
    const total = profile.pool.reduce((sum, e) => sum + e.weight, 0) || 1;
    const top = [...profile.pool]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map((e) => `${e.label}: ${Math.round((e.weight / total) * 100)}%`)
      .join(' · ');
    lines.push(`Top pool odds: ${top}`);
  }
  return lines.join('\n');
}
