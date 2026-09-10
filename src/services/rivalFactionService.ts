import {
  HostileHumanUnit,
  LairThreatTier,
  TacticalSquadUnit,
  ZombieLair,
  ZombieUnit,
  ZombieVariant,
  getWeaponDefinition,
} from '../types/combat';
import { BuildingPolygon, Point2D } from '../types/map';
import {
  RansomDemand,
  RivalFactionDef,
  RivalFactionId,
  RivalHideout,
} from '../types/rivalFaction';
import { SettlementState } from '../types/settlement';
import { createZombieUnit } from './combatService';

// ==========================================
// 1. Rival Faction Definitions (§5.2)
// ==========================================

export const RIVAL_FACTIONS: Record<RivalFactionId, RivalFactionDef> = {
  iron_vultures: {
    id: 'iron_vultures',
    name: 'Iron Vultures',
    blurb: 'A territorial scavenger gang fortified behind salvaged barricades. They shoot first and trade only at gunpoint.',
    markerColor: '#f97316',
    defenderCountMin: 4,
    defenderCountMax: 7,
    weaponPool: ['pistol', 'shotgun', 'assault_rifle'],
    ransomFoodPerMember: 10,
  },
  blackout_marauders: {
    id: 'blackout_marauders',
    name: 'Blackout Marauders',
    blurb: 'Well-armed raiders who live by taking from anyone weaker. They will ransom captives for food rather than spare them out of mercy.',
    markerColor: '#ef4444',
    defenderCountMin: 5,
    defenderCountMax: 8,
    weaponPool: ['shotgun', 'assault_rifle', 'hunting_rifle'],
    ransomFoodPerMember: 12,
  },
};

// ==========================================
// 2. Hideout & Lair Generation (§5.2)
// ==========================================

export function generateRivalHideouts(
  buildings: BuildingPolygon[],
  hqBuildingId: string | number | null = null
): Map<string | number, RivalHideout> {
  const map = new Map<string | number, RivalHideout>();
  if (!buildings || buildings.length === 0) return map;

  const candidates = buildings.filter(
    (b) => String(b.id) !== String(hqBuildingId) && (b.levels || 1) >= 1
  );
  if (candidates.length === 0) return map;

  const shuffled = [...candidates].sort(() => 0.5 - Math.random());
  const count = Math.min(shuffled.length, Math.random() < 0.7 ? 1 : 2);
  const factionIds: RivalFactionId[] = ['iron_vultures', 'blackout_marauders'];

  for (let i = 0; i < count; i++) {
    const bldg = shuffled[i];
    const factionId = factionIds[i % factionIds.length];
    const def = RIVAL_FACTIONS[factionId];
    const occupantCount =
      def.defenderCountMin +
      Math.floor(Math.random() * (def.defenderCountMax - def.defenderCountMin + 1));
    const threatTier: RivalHideout['threatTier'] =
      bldg.levels >= 3 ? 'high' : bldg.levels >= 2 ? 'medium' : 'low';

    map.set(bldg.id, {
      id: `hideout_${bldg.id}`,
      buildingId: bldg.id,
      buildingName: bldg.name || `Structure #${bldg.id}`,
      factionId,
      factionName: def.name,
      isDiscovered: false,
      isCleared: false,
      occupantCount,
      initialOccupantCount: occupantCount,
      threatTier,
      position: bldg.center,
      defendersSpawned: false,
      captiveSquadId: null,
      captiveSquadName: null,
      ransom: null,
    });
  }

  return map;
}

/** Shoelace polygon area (m²) — used to scale a lair's population with the
 *  real footprint instead of a flat 14–29 garrison. */
function polygonArea(poly?: Point2D[]): number {
  if (!poly || poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    sum += (poly[j].x - poly[i].x) * (poly[j].z + poly[i].z);
  }
  return Math.abs(sum) / 2;
}

export interface LairGenerationResult {
  lairs: Map<string | number, ZombieLair>;
  /** The lair's initial population as REAL infected units, seeded inside the
   *  building and sheltered (dormant by day, waking at night or when a squad
   *  enters). The lair's `population` field is synced from these units — there
   *  is no abstract head-count separate from the zombies in the world. */
  seededZombies: ZombieUnit[];
}

// ================================================================
// Data-driven lair density (§5.2 balance) — how many nests a map holds
// is no longer a coin flip between 1 and 2. The expected count scales with:
//   • map size  — nest density per km² of fetch area (one nest per ~3 km²
//     at normal intensity on day 1),
//   • scenario infected intensity (zombieAggression / hordesLevel),
//   • colony population (a thriving colony attracts more nests),
//   • outbreak maturity (game day).
// Nests are then spaced out (LAIR_MIN_SPACING_M) so a big map feels varied
// rather than clumped, and the count is capped — each lair is a regional
// threat with a garrison of REAL infected, not a pin on the map.
// ================================================================
const LAIR_DENSITY_PER_KM2 = 0.32;
const LAIR_COUNT_MAX = 12;
const LAIR_MIN_SPACING_M = 350;
const LAIR_DEFAULT_MAP_RADIUS_M = 1200;
const LAIR_DEFAULT_POPULATION = 20;
const LAIR_AGGRESSION_MULT: Record<string, number> = {
  low: 0.7,
  normal: 1.0,
  high: 1.35,
};

export interface LairGenerationContext {
  /** Map fetch radius in metres (MapData.radius) — nest count scales with
   *  land area. Omit for a compact map default (~1–2 nests). */
  mapRadiusM?: number;
  /** Colony population (named survivors + general pool) — bigger colonies
   *  attract more nests. */
  colonyPopulation?: number;
  /** 1-based in-game day — the outbreak matures and nests multiply. */
  day?: number;
  /** Scenario infected intensity (zombieAggression). */
  aggression?: 'low' | 'normal' | 'high';
  /** Scenario hordes level (1–3) — extra regional pressure on top. */
  hordesLevel?: number;
}

/** Expected nest count for a map under the colony's pressure context. */
export function computeLairTargetCount(ctx: LairGenerationContext = {}): number {
  const radiusM = ctx.mapRadiusM && ctx.mapRadiusM > 0 ? ctx.mapRadiusM : LAIR_DEFAULT_MAP_RADIUS_M;
  const areaKm2 = Math.PI * Math.pow(radiusM / 1000, 2);
  const aggression = LAIR_AGGRESSION_MULT[ctx.aggression ?? 'normal'] ?? LAIR_AGGRESSION_MULT.normal;
  const hordesBoost =
    ctx.hordesLevel && ctx.hordesLevel >= 1 ? 1 + (ctx.hordesLevel - 1) * 0.1 : 1;
  const pop = Math.max(0, ctx.colonyPopulation ?? LAIR_DEFAULT_POPULATION);
  const popScale = Math.min(1.6, Math.max(0.75, 0.75 + pop / 80));
  const day = Math.max(1, ctx.day ?? 1);
  const dayScale = Math.min(1.7, Math.max(0.9, 0.9 + (day - 1) * 0.045));
  const expected =
    areaKm2 * LAIR_DENSITY_PER_KM2 * aggression * hordesBoost * popScale * dayScale;
  // ±10% run-to-run jitter so the same map is not always identical.
  const jittered = expected * (0.9 + Math.random() * 0.2);
  return Math.max(1, Math.min(LAIR_COUNT_MAX, Math.round(jittered)));
}

export function generateZombieLairs(
  buildings: BuildingPolygon[],
  hqBuildingId: string | number | null = null,
  context: LairGenerationContext = {}
): LairGenerationResult {
  const map = new Map<string | number, ZombieLair>();
  const seededZombies: ZombieUnit[] = [];
  if (!buildings || buildings.length === 0) return { lairs: map, seededZombies };

  const candidates = buildings.filter(
    (b) => String(b.id) !== String(hqBuildingId) && (b.levels || 1) >= 1
  );
  if (candidates.length === 0) return { lairs: map, seededZombies };

  const shuffled = [...candidates].sort(() => 0.5 - Math.random());
  // Data-driven target count, spaced across the map: greedily accept a
  // shuffled candidate while it keeps LAIR_MIN_SPACING_M from the nests
  // already chosen, then top up from the remainder if spacing ran out.
  const target = Math.min(shuffled.length, computeLairTargetCount(context));
  const chosen: BuildingPolygon[] = [];
  for (const b of shuffled) {
    if (chosen.length >= target) break;
    const spaced = chosen.every((c) => {
      const dx = (b.center?.x ?? 0) - (c.center?.x ?? 0);
      const dz = (b.center?.z ?? 0) - (c.center?.z ?? 0);
      return Math.hypot(dx, dz) >= LAIR_MIN_SPACING_M;
    });
    if (spaced) chosen.push(b);
  }
  if (chosen.length < target) {
    for (const b of shuffled) {
      if (chosen.length >= target) break;
      if (!chosen.includes(b)) chosen.push(b);
    }
  }

  for (const bldg of chosen) {
    const threatTier: ZombieLair['threatTier'] =
      bldg.levels >= 3 ? 'high' : bldg.levels >= 2 ? 'medium' : 'low';
    // IFZ: a Lair holds dozens of infected, scaled by how much of a sanctuary
    // the structure is (footprint area + floors). Small sheds stay modest;
    // big industrial blocks become genuine hives of 60–120+.
    const footprint = Math.max(40, Math.round(polygonArea(bldg.polygon)));
    const floors = Math.max(1, bldg.levels || 1);
    const population =
      18 +
      Math.floor(Math.random() * 18) +
      Math.min(70, Math.round(footprint / 28)) +
      (floors - 1) * 14;
    const homeRadius = Math.min(
      70,
      26 + Math.round(Math.sqrt(footprint) * 1.1) + floors * 5
    );
    // Randomized per-lair cadence + a random initial offset so this lair does
    // not stir at the same wall-clock instant as every other lair.
    const intervalSec = LAIR_SPAWN_BASE_MIN_SEC + Math.floor(Math.random() * LAIR_SPAWN_JITTER_SEC);

    // DOMINANT VARIANT — each nest has a recognisable infected type, fixed at
    // founding and stable for its life. Derived deterministically from the
    // building id (same map → same nest types on replay) and weighted by
    // threat tier: bigger structures skew toward runners and brutes.
    const dominantVariant = pickLairDominantVariant(bldg.id, threatTier);

    const lairId = `lair_${bldg.id}`;
    const center = bldg.center || { x: 0, z: 0 };

    // The lair's initial population is REAL infected sheltering inside the
    // building: seed one ZombieUnit per head of population, scattered across
    // the footprint so the player actually fights them in the interior. Most
    // of the garrison is the dominant type; a minority varies so the nest is
    // recognisable without being homogeneous.
    const variantFor = (i: number): 'shambler' | 'runner' | 'brute' =>
      Math.random() < 0.75 ? dominantVariant : pickMinorityVariant(dominantVariant, i, bldg.levels);
    for (let s = 0; s < population; s++) {
      const pt = randomPointInPolygon(bldg.polygon, center);
      const zmb = createZombieUnit(variantFor(s), pt.x, pt.z, 0, false);
      zmb.lairId = lairId;
      zmb.homeX = center.x;
      zmb.homeZ = center.z;
      zmb.homeRadius = homeRadius;
      // Locality (§5.2): most of the nest's population stays put; a small
      // minority become roamers that spread into the neighbourhood.
      zmb.isRoamer = Math.random() < 0.15;
      seededZombies.push(zmb);
    }

    map.set(bldg.id, {
      id: lairId,
      buildingId: bldg.id,
      buildingName: bldg.name || `Structure #${bldg.id}`,
      isDiscovered: false,
      isCleared: false,
      population,
      baselinePopulation: population,
      // At founding (escalation 0) the sustainable ceiling equals the founding
      // garrison; escalation later swells it. Emergence capacity starts at a
      // fraction of that so most of the nest stays inside the building.
      garrisonCeiling: population,
      emergenceCapacity: lairEmergenceCapacity(population),
      homeRadius,
      spawnAccumSec: Math.random() * intervalSec,
      lastActivity: Date.now(),
      escalation: 0,
      escalationAccumSec: 0,
      threatTier,
      replenishAccumSec: 0,
      hordeAccumSec: 0,
      dominantVariant,
    });
  }

  return { lairs: map, seededZombies };
}

// ==========================================
// 3. Hideout Defender Spawning (§5.2)
// ==========================================

export function spawnHideoutDefenders(hideout: RivalHideout): HostileHumanUnit[] {
  const def = RIVAL_FACTIONS[hideout.factionId];
  const units: HostileHumanUnit[] = [];
  const count = Math.max(1, hideout.occupantCount);

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const dist = 6 + Math.random() * 9;
    const weaponId = def.weaponPool[Math.floor(Math.random() * def.weaponPool.length)];
    const weapon = getWeaponDefinition(weaponId);

    units.push({
      id: `rival_${hideout.id}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${hideout.factionName} Raider`,
      hideoutId: hideout.id,
      factionName: hideout.factionName,
      x: hideout.position.x + Math.cos(angle) * dist,
      z: hideout.position.z + Math.sin(angle) * dist,
      y: 0,
      rotation: angle,
      currentHp: 55 + Math.floor(Math.random() * 20),
      maxHp: 75,
      speed: 3.2,
      damage: Math.round(weapon.damage * 0.8),
      attackRange: Math.max(18, weapon.range * 0.6),
      aggroRange: 55,
      attackCooldown: 1.5 + Math.random() * 0.7,
      lastAttackTime: 0,
      state: 'guarding',
      targetSquadId: null,
      weaponId,
      homeX: hideout.position.x,
      homeZ: hideout.position.z,
    });
  }

  return units;
}

// ==========================================
// 3b. Hideout Simulation (§5.2)
// ==========================================

export interface HideoutTickResult {
  updatedHideouts: Map<string | number, RivalHideout>;
  spawnedDefenders: HostileHumanUnit[];
  clearedHideouts: RivalHideout[];
  notifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' }[];
}

const HIDEOUT_DEFENDER_SPAWN_RADIUS = 70;

/**
 * Advances every Hideout: spawns armed defenders the first time a squad
 * approaches, syncs its occupant count to its living defenders, and marks it
 * cleared (freeing any captive) once the defenders are eliminated.
 */
export function tickRivalHideouts(
  hideouts: Map<string | number, RivalHideout>,
  existingHostiles: HostileHumanUnit[],
  squads: TacticalSquadUnit[]
): HideoutTickResult {
  const updatedHideouts = new Map(hideouts);
  const spawnedDefenders: HostileHumanUnit[] = [];
  const clearedHideouts: RivalHideout[] = [];
  const notifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' }[] = [];

  const liveByHideout = new Map<string, number>();
  for (const human of existingHostiles) {
    if (human.currentHp <= 0) continue;
    liveByHideout.set(human.hideoutId, (liveByHideout.get(human.hideoutId) || 0) + 1);
  }

  for (const [key, hideout] of updatedHideouts.entries()) {
    if (hideout.isCleared) continue;

    const live = liveByHideout.get(hideout.id) || 0;
    let next = hideout;
    let changed = false;

    // First approach spawns the armed defenders (hostile on sight).
    if (!hideout.defendersSpawned && hideout.isDiscovered && live === 0) {
      const squadNear = squads.some(
        (sq) =>
          sq.isDeployed &&
          sq.currentHp > 0 &&
          Math.hypot(sq.x - hideout.position.x, sq.z - hideout.position.z) <=
            HIDEOUT_DEFENDER_SPAWN_RADIUS
      );
      if (squadNear) {
        spawnedDefenders.push(...spawnHideoutDefenders(hideout));
        next = { ...next, defendersSpawned: true };
        changed = true;
        notifications.push({
          title: 'HIDEOUT ENGAGED',
          desc: `${hideout.factionName} defenders opened fire from ${hideout.buildingName}!`,
          type: 'warn',
        });
      }
    }

    // Keep the occupant count in sync with living defenders.
    if (hideout.defendersSpawned && live !== hideout.occupantCount) {
      next = { ...next, occupantCount: live };
      changed = true;
    }

    // Cleared once the defenders are eliminated.
    if (hideout.defendersSpawned && live === 0) {
      const cleared: RivalHideout = { ...next, isCleared: true, occupantCount: 0, defendersSpawned: false };
      clearedHideouts.push(cleared);
      next = cleared;
      changed = true;
      notifications.push({
        title: 'HIDEOUT CLEARED',
        desc: `${hideout.factionName} was driven out of ${hideout.buildingName}.`,
        type: 'success',
      });
    }

    if (changed) updatedHideouts.set(key, next);
  }

  return { updatedHideouts, spawnedDefenders, clearedHideouts, notifications };
}

// ==========================================
// 4. Zombie Lair Simulation (§5.2)
// ==========================================

export interface LairTickResult {
  updatedLairs: Map<string | number, ZombieLair>;
  spawnedZombies: ZombieUnit[];
  clearedLairs: ZombieLair[];
  notifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' }[];
}

// Escalation ticks roughly every 10 real minutes at 1x speed — previously 120s
// made every lair ramp up and notify far too often.
const LAIR_ESCALATION_INTERVAL_SEC = 600;
// Each lair stirs on its own randomized cadence with an independent initial
// offset, so lairs never all emerge in lockstep. The base is the NIGHT
// interval; daylight emergence is throttled (see LAIR_EMERGE_DAY_MULT) so
// normal sunlight dormancy applies instead of a 24/7 factory.
const LAIR_SPAWN_BASE_MIN_SEC = 70;
const LAIR_SPAWN_JITTER_SEC = 90;
const LAIR_EMERGE_DAY_MULT = 3;
// A partially cleared lair regrows one interior infected per interval while no
// squad is nearby (you must commit enough firepower to finish the job).
const LAIR_REPLENISH_INTERVAL_SEC: Record<LairThreatTier, number> = {
  low: 500,
  medium: 380,
  high: 280,
};
// The founding garrison is a SOFT baseline, not a ceiling: a neglected nest's
// emergence swells its garrison by +40% of the baseline per escalation level
// (escalation 0 keeps it at founding strength, 3 → ~2.2×, 6 → ~3.4×), so an
// old unmolested lair becomes a genuine 100+ hive. The absolute cap is purely
// a sim-safety bound for how many real infected one lair can hold alive.
const LAIR_GARRISON_GROWTH_PER_ESCALATION = 0.4;
const LAIR_GARRISON_HARD_CAP = 220;
// EMERGENCE CAPACITY — the share of the garrison that may be ACTIVE OUTSIDE
// the building at once. IFZ's locality model keeps most infected around/inside
// the Lair; only this fraction emerges into the home radius, roams or is
// mobilized. The rest of the population shelters inside the structure.
const LAIR_EMERGENCE_CAP_FRACTION = 0.35;
const LAIR_EMERGENCE_CAP_FLOOR = 8;

/** Garrison ceiling for a lair at a given escalation — baseline × growth
 *  multiplier, hard-capped. Never below the founding garrison. */
function lairGarrisonCeiling(baselinePopulation: number, escalation: number): number {
  const grown = Math.round(
    baselinePopulation * (1 + LAIR_GARRISON_GROWTH_PER_ESCALATION * Math.max(0, escalation))
  );
  return Math.max(baselinePopulation, Math.min(LAIR_GARRISON_HARD_CAP, grown));
}

/** EMERGENCE CAPACITY for a lair — a fraction of its garrison ceiling, with
 *  a floor so even small nests can field a meaningful local presence. */
function lairEmergenceCapacity(garrisonCeiling: number): number {
  return Math.max(LAIR_EMERGENCE_CAP_FLOOR, Math.round(garrisonCeiling * LAIR_EMERGENCE_CAP_FRACTION));
}
// NIGHT MOBILIZATION: a standing lair periodically commits a strike group of
// its OWN resident infected toward the settlement. The interval starts long and
// shrinks as the lair escalates, so an old, neglected nest becomes a nightly
// incursion engine. Escalation 0 → 300s, escalation 6 → 90s.
const LAIR_HORDE_BASE_SEC = 300;
const LAIR_HORDE_MIN_SEC = 90;
const LAIR_HORDE_ESCALATION_STEP_SEC = 35;
// A single strike group is capped so one lair can never out-produce the whole
// global nightfall wave; the floor keeps a healthy nest's raid meaningful.
const LAIR_HORDE_MAX_SIZE = 18;
const LAIR_HORDE_MIN_SIZE = 2;

/**
 * NIGHT MOBILIZATION (ecological model — a lair raid never conjures
 * population): commits a strike group of the lair's OWN resident infected
 * toward the settlement. `residents` are the living lair-affiliated ZombieUnits
 * currently gathered at / near the nest (the lair tick selects them); this
 * only RETARGETS those existing zombies — no ZombieUnit is created, so the
 * lair can never inflate its population by raiding. Their lairId stays intact:
 * killing a mobilized infected anywhere (en route or at the perimeter) thins
 * the lair's real population, and one that survives the incursion keeps its
 * home anchor and eventually returns to the nest, rejoining the population.
 *
 * Size scales with the lair's current population and escalation and never
 * exceeds the number of residents actually at home. The returned zombies are
 * mutated in place — they are the world's own records, the same objects the
 * caller keeps tick to tick.
 */
export function mobilizeLairHorde(
  lair: ZombieLair,
  residents: ZombieUnit[],
  hqPos: Point2D
): ZombieUnit[] {
  const escalation = lair.escalation ?? 0;
  const population = lair.population ?? residents.length;
  const desired = Math.min(
    LAIR_HORDE_MAX_SIZE,
    Math.max(LAIR_HORDE_MIN_SIZE, Math.floor(population * 0.3) + escalation)
  );
  const pool = [...residents].sort(() => Math.random() - 0.5);
  const strikeGroup = pool.slice(0, Math.min(desired, pool.length));
  for (const zmb of strikeGroup) {
    // March on the settlement: a committed raid order aimed at the HQ. The
    // home anchor is deliberately KEPT — survivors walk back to the nest once
    // the incursion ends (killing them anywhere still counts against the lair).
    zmb.targetPos = {
      x: hqPos.x + (Math.random() - 0.5) * 24,
      z: hqPos.z + (Math.random() - 0.5) * 24,
    };
  }
  return strikeGroup;
}

/** True when a point lies OUTSIDE the building's footprint bounding box —
 *  the definition of "emerged from the nest" for locality accounting.
 *  Shelterers inside the building are within the box; emerged/roaming/
 *  mobilized infected are outside it. */
function isOutsideBuildingPolygon(x: number, z: number, poly: Point2D[]): boolean {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return x < minX || x > maxX || z < minZ || z > maxZ;
}

/** Random point inside a polygon (rejection sampling, center fallback). */
function randomPointInPolygon(poly: Point2D[] | undefined, center: Point2D): Point2D {
  if (!poly || poly.length < 3) return { ...center };
  const xs = poly.map((p) => p.x);
  const zs = poly.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const inside = (pt: Point2D) => {
    let isIn = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > pt.z) !== (b.z > pt.z) && pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x) isIn = !isIn;
    }
    return isIn;
  };
  for (let attempt = 0; attempt < 24; attempt++) {
    const pt = {
      x: minX + Math.random() * (maxX - minX),
      z: minZ + Math.random() * (maxZ - minZ),
    };
    if (inside(pt)) return pt;
  }
  return { ...center };
}

/** Deterministic hash of a building id — used to derive a lair's stable
 *  dominant variant (same map always produces the same nest types). */
function lairIdHash(id: string | number): number {
  const s = String(id);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick a lair's dominant infected type: deterministic per building, with
 *  higher threat tiers skewing toward faster/tougher infected. */
export function pickLairDominantVariant(
  buildingId: string | number,
  threatTier: LairThreatTier
): ZombieVariant {
  const roll = lairIdHash(buildingId) % 100;
  if (threatTier === 'high') return roll < 45 ? 'brute' : roll < 80 ? 'runner' : 'shambler';
  if (threatTier === 'medium') return roll < 20 ? 'brute' : roll < 55 ? 'runner' : 'shambler';
  return roll < 5 ? 'brute' : roll < 25 ? 'runner' : 'shambler';
}

/** A non-dominant companion variant for the minority of a nest's garrison —
 *  keeps nests recognisable without making every infected identical. */
function pickMinorityVariant(
  dominant: ZombieVariant,
  salt: number,
  levels: number
): ZombieVariant {
  const others = (['shambler', 'runner', 'brute'] as ZombieVariant[]).filter((v) => v !== dominant);
  return others[(salt * 7 + levels) % others.length];
}

/**
 * Advances every Lair as the home base of a REAL infected population:
 *
 * - `population` is synced each tick to the count of living ZombieUnits carrying
 *   this lair's id — killing ANY lair-affiliated infected (inside or emerged)
 *   reduces the lair. There is no abstract counter and no "stand within 26m to
 *   drain the garrison" mechanic.
 * - `baselinePopulation` is the founding garrison — a SOFT baseline, not a
 *   ceiling. A partially cleared lair REGROWS toward it while no squad is in
 *   its home radius, so a raid must be finished or the nest recovers.
 * - Emergence emits affiliated infected into the home radius on a per-lair
 *   jittered cadence; daylight throttles it and spawned infected follow the
 *   normal sunlight-dormancy rules (no forced 24/7 alert level). A neglected
 *   lair SWELLS beyond its baseline as escalation climbs, up to
 *   `lairGarrisonCeiling` — old unmolested nests become hives of 100+.
 * - The lair is cleared only when its last living infected is killed.
 */
export function tickZombieLairs(
  lairs: Map<string | number, ZombieLair>,
  zombies: ZombieUnit[],
  squads: TacticalSquadUnit[],
  buildings: BuildingPolygon[],
  now: number,
  deltaSec: number,
  isNight: boolean,
  hqPos: Point2D | null = null
): LairTickResult {
  const updatedLairs = new Map(lairs);
  const spawnedZombies: ZombieUnit[] = [];
  const clearedLairs: ZombieLair[] = [];
  const notifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' }[] = [];

  const buildingCenters = new Map<string, Point2D>();
  const buildingPolys = new Map<string, Point2D[]>();
  for (const b of buildings) {
    buildingCenters.set(String(b.id), b.center);
    if (b.polygon) buildingPolys.set(String(b.id), b.polygon);
  }

  for (const [key, lair] of updatedLairs.entries()) {
    if (lair.isCleared) continue;

    const center = buildingCenters.get(String(lair.buildingId)) || { x: 0, z: 0 };
    const poly = buildingPolys.get(String(lair.buildingId));

    // A. Escalation — the longer a Lair stands, the more active its nights get.
    let escalation = lair.escalation;
    let escalationAccum = lair.escalationAccumSec + deltaSec;
    if (escalationAccum >= LAIR_ESCALATION_INTERVAL_SEC && escalation < 6) {
      escalation += 1;
      escalationAccum = 0;
      notifications.push({
        title: 'LAIR ESCALATION',
        desc: `${lair.buildingName} is stirring — infected are emerging more frequently around the nest!`,
        type: 'warn',
      });
    }

    // B. Population = the lair's actual living infected. Every lair-affiliated
    //    zombie that dies (inside the building or out roaming) reduces it.
    let population = zombies.filter(
      (z) => z.lairId === lair.id && z.currentHp > 0
    ).length;

    // C. Regrowth — a partially cleared lair replenishes while unmolested, back
    //    to its FOUNDING GARRISON (baselinePopulation) — never beyond it; only
    //    escalation-driven emergence (D) swells a nest past its baseline.
    //    Fresh infected spawn INSIDE the building (sheltered from the sun, so
    //    they follow normal day/night rules and wake when a squad enters or
    //    night falls).
    const squadNear = squads.some(
      (sq) =>
        sq.isDeployed &&
        sq.currentHp > 0 &&
        Math.hypot(sq.x - center.x, sq.z - center.z) <= lair.homeRadius
    );
    let replenishAccum = lair.replenishAccumSec;
    // Only a PARTIALLY cleared lair regrows: population must still be > 0, so
    // killing the last affiliated infected finishes the job rather than letting
    // the nest respawn from nothing.
    if (population > 0 && population < lair.baselinePopulation && !squadNear) {
      replenishAccum += deltaSec;
      const replenishInterval = LAIR_REPLENISH_INTERVAL_SEC[lair.threatTier];
      while (replenishAccum >= replenishInterval && population < lair.baselinePopulation) {
        replenishAccum -= replenishInterval;
        const pt = randomPointInPolygon(poly, center);
        const zmb = createZombieUnit(lair.dominantVariant ?? 'shambler', pt.x, pt.z, 0, isNight);
        zmb.lairId = lair.id;
        zmb.homeX = center.x;
        zmb.homeZ = center.z;
        zmb.homeRadius = lair.homeRadius;
        zmb.isRoamer = Math.random() < 0.15;
        spawnedZombies.push(zmb);
        population += 1;
      }
    }

    // D. Emergence — the lair's local infected ecosystem: affiliated infected
    //    periodically leave the nest into its home radius. Daylight throttles
    //    this (sunlight dormancy) and night quickens it. Spawned infected carry
    //    lairId and follow the normal isDormant rules — NOT a forced 24/7 alarm.
    //    Gated on population > 0 (a nest with no living infected is DESTROYED,
    //    never a factory conjuring infected out of nothing) AND on the garrison
    //    ceiling: emergence is what makes a NEGLECTED nest swell past its
    //    baseline as escalation climbs — at/above the ceiling the lair has as
    //    many real infected as it can support and pauses (the accumulator keeps
    //    banking, so it resumes the instant the garrison thins). ALSO gated on
    //    the EMERGENCE CAPACITY: only `emergenceCapacity` affiliated infected
    //    may be outside the building at once — most of the garrison shelters
    //    INSIDE, and the nest stops emitting while that many are already out.
    // The base cadence is stable per lair (derived from its id) so it never
    // re-rolls each tick.
    // MAXIMUM SUSTAINABLE POPULATION — synced explicitly every tick from the
    // escalation-grown garrison ceiling, so the record itself always shows how
    // many infected this nest can support RIGHT NOW (as opposed to the founding
    // `baselinePopulation` it regrows toward).
    const garrisonCeiling = lairGarrisonCeiling(lair.baselinePopulation, escalation);
    // EMERGENCE CAPACITY — how many affiliated infected may be outside the
    // building at once. The rest of the garrison shelters inside; only this
    // share emerges, roams or mobilizes (IFZ locality model).
    const emergenceCapacity = lairEmergenceCapacity(garrisonCeiling);
    let seed = 0;
    for (let c = 0; c < String(lair.id).length; c++) seed = (seed * 31 + String(lair.id).charCodeAt(c)) >>> 0;
    const lairBaseInterval = LAIR_SPAWN_BASE_MIN_SEC + (seed % LAIR_SPAWN_JITTER_SEC);
    const intervalSec = Math.max(30, lairBaseInterval - escalation * 6) * (isNight ? 1 : LAIR_EMERGE_DAY_MULT);
    let spawnAccum = (lair.spawnAccumSec ?? Math.random() * intervalSec) + deltaSec;
    // Count affiliated infected ALREADY outside the building (emerged, roaming
    // or mobilized) so emergence respects the capacity: most of the garrison
    // stays inside, only `emergenceCapacity` may be out at once.
    const emergedOutside = zombies.filter(
      (z) =>
        z.lairId === lair.id &&
        z.currentHp > 0 &&
        (poly ? isOutsideBuildingPolygon(z.x, z.z, poly) : false)
    ).length;
    const dominant: ZombieVariant = lair.dominantVariant ?? 'shambler';
    if (population > 0 && population < garrisonCeiling && spawnAccum >= intervalSec) {
      const groupSize = Math.min(5, 2 + escalation);
      if (emergedOutside + groupSize <= emergenceCapacity) {
        spawnAccum = 0;
        lair.lastActivity = now;
        for (let i = 0; i < groupSize; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 6 + Math.random() * 14;
          // Emerging groups carry the nest's identity: mostly the dominant
          // type, with occasional variety so combat stays interesting.
          const variant: ZombieVariant =
            Math.random() < 0.8 ? dominant : i % 5 === 4 ? 'runner' : dominant;
          const zmb = createZombieUnit(
            variant,
            center.x + Math.cos(angle) * dist,
            center.z + Math.sin(angle) * dist,
            0,
            isNight
          );
          // Normal sunlight rules apply — no forced alert level. Most stay local;
          // a minority are roamers that drift beyond the home radius.
          zmb.lairId = lair.id;
          zmb.homeX = center.x;
          zmb.homeZ = center.z;
          zmb.homeRadius = lair.homeRadius;
          zmb.isRoamer = Math.random() < 0.15;
          spawnedZombies.push(zmb);
          population += 1;
        }
      }
    }

    // E. NIGHT MOBILIZATION — the Lair feeds the regional incursion WITHOUT
    //    conjuring population. While the lair stands (population > 0) and the
    //    HQ is known, at NIGHT it periodically commits a strike group of its
    //    OWN resident infected toward the settlement: living lair-affiliated
    //    zombies currently at / near the nest are RETARGETED to march on the
    //    HQ (mobilizeLairHorde). No zombie is created — the lair can only raid
    //    as strong as the residents actually home, killing mobilized infected
    //    anywhere thins the nest, and survivors keep their anchor and return.
    //    Escalation shortens the interval: a neglected lair becomes a nightly
    //    engine.
    let hordeAccum = lair.hordeAccumSec ?? 0;
    let hordeMobilized = false;
    if (population > 0 && isNight && hqPos) {
      hordeAccum += deltaSec;
      const hordeInterval = Math.max(LAIR_HORDE_MIN_SEC, LAIR_HORDE_BASE_SEC - escalation * LAIR_HORDE_ESCALATION_STEP_SEC);
      if (hordeAccum >= hordeInterval) {
        hordeAccum = 0;
        // Residents must actually be gathered at / near the nest to be
        // committed — nothing is summoned out of thin air. Zombies already
        // fighting (a squad assaulting the lair) stay behind.
        const residentsHere = zombies.filter(
          (z) =>
            z.lairId === lair.id &&
            z.currentHp > 0 &&
            z.state !== 'chasing' &&
            z.state !== 'attacking_unit' &&
            z.state !== 'attacking_building' &&
            Math.hypot(z.x - center.x, z.z - center.z) <= (lair.homeRadius ?? 40)
        );
        const mobilized =
          residentsHere.length > 0 ? mobilizeLairHorde(lair, residentsHere, hqPos) : [];
        hordeMobilized = mobilized.length > 0;
      }
    } else if (!isNight) {
      // Daytime: the accumulator idles (sunlight dormancy applies) and does
      // NOT bank toward an instant horde at dusk — each night starts fresh
      // and the first mobilization takes a full interval of night.
      hordeAccum = 0;
    }
    if (hordeMobilized && lair.isDiscovered) {
      notifications.push({
        title: 'LAIR MOBILIZING',
        desc: `${lair.buildingName} is committing infected toward the settlement — intercept the horde to thin the nest, or assault the lair itself.`,
        type: 'warn',
      });
    }

    const clearedNow = population <= 0;
    updatedLairs.set(key, {
      ...lair,
      population,
      baselinePopulation: lair.baselinePopulation,
      // Explicit maximum sustainable population + emergence capacity at the
      // CURRENT escalation — synced every tick, never left to derived drift.
      garrisonCeiling,
      emergenceCapacity,
      homeRadius: lair.homeRadius,
      spawnAccumSec: spawnAccum,
      lastActivity: lair.lastActivity,
      escalation,
      escalationAccumSec: escalationAccum,
      replenishAccumSec: replenishAccum,
      hordeAccumSec: hordeAccum,
      isCleared: clearedNow || lair.isCleared,
      dominantVariant: lair.dominantVariant ?? 'shambler',
    });

    if (clearedNow) {
      clearedLairs.push({ ...lair, population: 0, isCleared: true });
      notifications.push({
        title: 'LAIR CLEARED',
        desc: `${lair.buildingName} has been cleared — every infected in the nest is dead and the neighbourhood is quiet again.`,
        type: 'success',
      });
    }
  }

  return { updatedLairs, spawnedZombies, clearedLairs, notifications };
}

// ==========================================
// 5. Ransom / Captive Resolution (§5.2)
// ==========================================

export function createRansomDemand(
  squadId: string,
  squadName: string,
  memberCount: number,
  factionId: RivalFactionId
): RansomDemand {
  const def = RIVAL_FACTIONS[factionId];
  return {
    squadId,
    squadName,
    foodCost: Math.max(15, memberCount * def.ransomFoodPerMember),
    demandedAt: Date.now(),
  };
}

export interface RansomResolution {
  success: boolean;
  newState: SettlementState;
  error?: string;
  freedSquadName?: string;
}

/**
 * Pays the ransom in food rations: the captured squad is returned unharmed.
 */
export function payRansomForCaptive(
  state: SettlementState,
  hideoutId: string | number
): RansomResolution {
  const hideout = state.rivalHideouts.get(hideoutId);
  if (!hideout || !hideout.captiveSquadId || !hideout.ransom) {
    return { success: false, newState: state, error: 'No captive is being held here.' };
  }

  const cost = hideout.ransom.foodCost;
  const availableFood = state.stockpile.food.canned_goods + state.stockpile.food.mre_rations;
  if (availableFood < cost) {
    return { success: false, newState: state, error: 'Not enough food rations to pay the ransom.' };
  }

  let remaining = cost;
  const canned = Math.min(state.stockpile.food.canned_goods, remaining);
  state.stockpile.food.canned_goods -= canned;
  remaining -= canned;
  if (remaining > 0) {
    state.stockpile.food.mre_rations = Math.max(0, state.stockpile.food.mre_rations - remaining);
  }

  return freeCaptive(state, hideoutId, hideout.captiveSquadId, hideout.captiveSquadName || 'Captured Squad');
}

/**
 * Frees a captive squad (used both by paying a ransom and by clearing the Hideout).
 */
export function freeCaptive(
  state: SettlementState,
  hideoutId: string | number,
  squadId: string,
  squadName: string
): RansomResolution {
  const updatedSquads = state.squads.map((sq) =>
    sq.id === squadId ? { ...sq, status: 'idle' as const, mission: undefined } : sq
  );
  const updatedHideouts = new Map(state.rivalHideouts);
  const hideout = updatedHideouts.get(hideoutId);
  if (hideout) {
    updatedHideouts.set(hideoutId, {
      ...hideout,
      captiveSquadId: null,
      captiveSquadName: null,
      ransom: null,
    });
  }

  return {
    success: true,
    newState: { ...state, squads: updatedSquads, rivalHideouts: updatedHideouts },
    freedSquadName: squadName,
  };
}

/**
 * Rescues a captive by force: the Hideout must be cleared (its defenders eliminated)
 * before the captive is released. Returns whether the hideout still holds a captive.
 */
export function rescueCaptiveOnHideoutClear(
  state: SettlementState,
  hideoutId: string | number
): RansomResolution {
  const hideout = state.rivalHideouts.get(hideoutId);
  if (!hideout || !hideout.captiveSquadId) {
    return { success: false, newState: state, error: 'No captive is being held here.' };
  }
  if (!hideout.isCleared) {
    return {
      success: false,
      newState: state,
      error: 'The Hideout is still defended. Eliminate its occupants to free the captive.',
    };
  }
  return freeCaptive(state, hideoutId, hideout.captiveSquadId, hideout.captiveSquadName || 'Captured Squad');
}
