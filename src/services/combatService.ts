import { BuildingCategory, BuildingPolygon, Point2D } from '../types/map';
import { StatTier } from '../types/population';
import { DeathCause, SurvivorInfection } from '../types/infection';
import { createSurvivorInfection, rollBiteChance } from './infectionService';
import {
  ArmorItemId,
  BuildingInfestation,
  CombatVisualFx,
  DroppedItem,
  GameClockState,
  HostileHumanUnit,
  NoiseEvent,
  SquadMemberUnit,
  TacticalSquadUnit,
  TimeOfDayPhase,
  WeaponItemId,
  ZombieLair,
  ZombieUnit,
  ZombieVariant,
  WEAPON_CATALOG,
  getArmorDefinition,
  getWeaponDefinition,
  pickSurvivorFaceUrl,
} from '../types/combat';
import { AdaptedBuilding, SettlementState } from '../types/settlement';
import { isResearchUnlocked } from './researchService';
import { FUNCTIONAL_BUILDING_DEFINITIONS, getCanonicalDefenseDef } from '../data/functionalBuildings';
import { getPrimaryAdaptedEntry, getPrimaryHQ, isBuildingOperational } from './buildingOperational';
import { getPoweredBuildingIds } from './powerService';
import { WEATHER_CONDITIONS, getZombieActivityModifiers } from './weatherService';
import { soundService } from './soundService';
import { PathGrid, stepAlongPath } from './pathfindingService';

// ==========================================
// 0. Medical Treatment Constants (§5.3)
// ==========================================
// One in-game hour in simulation seconds (a game day is 600 s, so 25 s/hour).
/** In-game hour length in simulation seconds (600 s day / 24). */
export const MED_CARE_HOUR_SEC = 25;
/** Reference: each assigned nurse heals ONE admitted patient +0.1 HP/hour. */
export const MED_CARE_HP_PER_HOUR_PER_NURSE = 0.1;
/** Distance a wounded squad must stand inside a medical facility to be treated. */
export const MED_CARE_RADIUS_M = 18;

/** Per-facility medical snapshot used by {@link tickMedicalFacilityCare}. */
export interface MedicalFacilitySnapshot {
  buildingId: string | number;
  x: number;
  z: number;
  bedCapacity: number;
  nurses: number;
  powered: boolean;
}

/**
 * §5.3 Patient-care model (Medbay / Hospital / Infirmary):
 *
 * 1. **Beds** — each operational medical facility admits wounded members up
 *    to its bed capacity (`medicalProperties.bedCapacity`, falling back to
 *    the building's own capacity).
 * 2. **Assigned nurses** — every assigned worker attends ONE admitted
 *    patient at +0.1 HP per in-game hour. Fewer nurses than patients means
 *    the surplus patients lie in beds without treatment.
 * 3. **Patient queue** — wounded beyond the bed count wait outside the
 *    facility (FIFO in roster order) and heal only when a bed frees.
 *
 * Bed occupancy is tracked across squads for the tick so several squads
 * parked at one facility genuinely contend for capacity. Unstaffed or
 * bed-less facilities heal nobody. Pure function — the flat +6 HP/s
 * regeneration it replaces no longer exists anywhere.
 */
export function tickMedicalFacilityCare(
  squads: TacticalSquadUnit[],
  settlement: SettlementState,
  effectiveDelta: number
): TacticalSquadUnit[] {
  if (!squads.length || effectiveDelta <= 0) return squads;
  // §Terminus power grid: a powered hospital runs ICU equipment — its nurses
  // heal 50% faster. An unpowered hospital still performs basic emergency
  // care, but advanced treatment slows down.
  const poweredIds = settlement ? getPoweredBuildingIds(settlement) : new Set<string>();
  const facilities: MedicalFacilitySnapshot[] = [
    ...Array.from(settlement.adaptedBuildings.values()),
    ...(settlement.freestandingBuildings || []),
  ]
    .filter(
      (building) =>
        isBuildingOperational(building) &&
        (building.typeId === 'medbay' ||
          building.typeId === 'infirmary_clinic' ||
          building.typeId === 'hospital')
    )
    .map((building) => {
      const def = FUNCTIONAL_BUILDING_DEFINITIONS[building.typeId];
      return {
        buildingId: building.buildingId,
        x: building.position?.x ?? 0,
        z: building.position?.z ?? 0,
        bedCapacity: Math.max(
          0,
          Math.floor(def?.medicalProperties?.bedCapacity ?? building.maxCapacity ?? 0)
        ),
        nurses: Math.max(0, building.assignedWorkers || 0),
        powered: poweredIds.has(String(building.buildingId)),
      };
    });
  if (facilities.length === 0) return squads;

  const bedsUsed = new Map<string, number>();
  return squads.map((squad) => {
    if (!squad.members?.some((m) => m.isAlive)) return squad;
    const wounded = squad.members
      .map((m, idx) => ({ m, idx }))
      .filter((entry) => entry.m.isAlive && entry.m.currentHp < entry.m.maxHp);
    if (wounded.length === 0) return { ...squad, isInSafeZone: false };

    const near = facilities
      .map((fac) => ({ fac, dist: Math.hypot(squad.x - fac.x, squad.z - fac.z) }))
      .filter((entry) => entry.dist < MED_CARE_RADIUS_M)
      .sort((a, b) => a.dist - b.dist);
    if (near.length === 0) return { ...squad, isInSafeZone: false };

    let members = squad.members;
    let healedAny = false;
    let remaining = wounded;
    for (const { fac } of near) {
      if (remaining.length === 0) break;
      const key = String(fac.buildingId);
      const used = bedsUsed.get(key) || 0;
      const freeBeds = Math.max(0, fac.bedCapacity - used);
      if (freeBeds <= 0) continue;
      const taking = remaining.slice(0, freeBeds);
      remaining = remaining.slice(freeBeds);
      bedsUsed.set(key, used + taking.length);
      // One nurse attends one patient at +0.1 HP per in-game hour.
      const treatCount = Math.min(taking.length, fac.nurses);
      if (treatCount <= 0) continue;
      const healAmt =
        (MED_CARE_HP_PER_HOUR_PER_NURSE / MED_CARE_HOUR_SEC) * effectiveDelta * (fac.powered ? 1.5 : 1);
      for (let i = 0; i < treatCount; i++) {
        const entry = taking[i];
        const healed = {
          ...entry.m,
          currentHp: Math.min(entry.m.maxHp, entry.m.currentHp + healAmt),
        };
        members = members.slice();
        members[entry.idx] = healed;
        healedAny = true;
      }
    }
    if (!healedAny) return { ...squad, isInSafeZone: false };
    const currentHp = members.reduce((acc, m) => (m.isAlive ? acc + m.currentHp : acc), 0);
    // Under real treatment: bed occupied + nurse attending this tick.
    return { ...squad, members, currentHp, isInSafeZone: true };
  });
}

// ==========================================
// 1. Initial State Helpers
// ==========================================

export function createInitialGameClock(): GameClockState {
  return {
    day: 1,
    hour: 8.0, // Starts at 8:00 AM on Day 1
    minute: 0,
    speed: 1, // 1x Normal speed
    phase: 'day',
    isNight: false,
    hordeWaveIntensity: 1,
    totalElapsedSeconds: 0,
  };
}

/**
 * Advance in-game clock by deltaTime seconds with speed multiplier
 * 1 in-game day = 360 real seconds at 1x speed (6 minutes per in-game day)
 * 1 in-game hour = 15 real seconds
 */
export function advanceGameClock(
  clock: GameClockState,
  realDeltaSeconds: number
): { newClock: GameClockState; dayChanged: boolean; nightfallTriggered: boolean; dawnTriggered: boolean } {
  if (clock.speed === 0) {
    return { newClock: clock, dayChanged: false, nightfallTriggered: false, dawnTriggered: false };
  }

  const effectiveDelta = realDeltaSeconds * clock.speed;
  // 1 in-game hour per 25 real seconds -> a full day-night cycle is 10 minutes at 1x.
  const inGameHoursAdvanced = effectiveDelta / 25.0;
  let newHour = clock.hour + inGameHoursAdvanced;
  let newDay = clock.day;
  let dayChanged = false;

  if (newHour >= 24.0) {
    newHour -= 24.0;
    newDay += 1;
    dayChanged = true;
  }

  const minute = Math.floor((newHour % 1) * 60);

  // Calculate phase (§6.1)
  let phase: TimeOfDayPhase = 'day';
  let isNight = false;

  if (newHour >= 5.0 && newHour < 7.0) {
    phase = 'dawn';
    isNight = false;
  } else if (newHour >= 7.0 && newHour < 19.0) {
    phase = 'day';
    isNight = false;
  } else if (newHour >= 19.0 && newHour < 21.0) {
    phase = 'dusk';
    isNight = false;
  } else {
    phase = 'night';
    isNight = true;
  }

  const nightfallTriggered = isNight && !clock.isNight;
  const dawnTriggered = !isNight && clock.isNight;

  const hordeWaveIntensity = Math.min(10, Math.floor(newDay * 1.5));

  const newClock: GameClockState = {
    day: newDay,
    hour: newHour,
    minute,
    speed: clock.speed,
    phase,
    isNight,
    hordeWaveIntensity,
    totalElapsedSeconds: clock.totalElapsedSeconds + effectiveDelta,
  };

  return { newClock, dayChanged, nightfallTriggered, dawnTriggered };
}

// ==========================================
// 2. Zombie Creation & Stats (§5.1)
// ==========================================

export function createZombieUnit(
  variant: ZombieVariant,
  x: number,
  z: number,
  y: number = 0,
  isNight: boolean = false
): ZombieUnit {
  const id = `zombie-${variant}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  switch (variant) {
    case 'runner':
      return {
        id,
        variant: 'runner',
        name: 'Infected Runner',
        x,
        z,
        y,
        rotation: Math.random() * Math.PI * 2,
        maxHp: 35,
        currentHp: 35,
        speed: isNight ? 5.4 : 3.0,
        baseDamage: 9,
        siegeDamage: 4,
        attackCooldown: 0.8,
        lastAttackTime: 0,
        state: isNight ? 'wandering' : 'dormant',
        targetUnitId: null,
        targetBuildingId: null,
        targetPos: null,
        investigatingSoundId: null,
        spawnedAt: Date.now(),
        isDormant: !isNight,
        alertLevel: 0,
      };

    case 'brute':
      return {
        id,
        variant: 'brute',
        name: 'Mutated Brute',
        x,
        z,
        y,
        rotation: Math.random() * Math.PI * 2,
        maxHp: 260,
        currentHp: 260,
        speed: isNight ? 1.6 : 0.9,
        baseDamage: 24,
        siegeDamage: 55, // Devastating against barricades/buildings!
        attackCooldown: 1.8,
        lastAttackTime: 0,
        state: isNight ? 'wandering' : 'dormant',
        targetUnitId: null,
        targetBuildingId: null,
        targetPos: null,
        investigatingSoundId: null,
        spawnedAt: Date.now(),
        isDormant: !isNight,
        alertLevel: 0,
      };

    case 'shambler':
    default:
      return {
        id,
        variant: 'shambler',
        name: 'Infected Shambler',
        x,
        z,
        y,
        rotation: Math.random() * Math.PI * 2,
        maxHp: 50,
        currentHp: 50,
        speed: isNight ? 2.3 : 1.2,
        baseDamage: 6,
        siegeDamage: 6,
        attackCooldown: 1.2,
        lastAttackTime: 0,
        state: isNight ? 'wandering' : 'dormant',
        targetUnitId: null,
        targetBuildingId: null,
        targetPos: null,
        investigatingSoundId: null,
        spawnedAt: Date.now(),
        isDormant: !isNight,
        alertLevel: 0,
      };
  }
}

// ==========================================
// 3. Tactical Squad Unit Initialization (§4.3, §5)
// ==========================================

/**
 * Builds the per-unit roster for a squad: exactly 1 named leader + N general
 * recruits by default. Leaderless squads (includeLeader = false) field N
 * generic recruits only — every member is a nameless citizen. All units default
 * to a combat knife and no armor (§4.3).
 */
export function buildSquadMembers(
  squadId: string,
  leaderName: string,
  generalCount: number,
  includeLeader = true
): SquadMemberUnit[] {
  const members: SquadMemberUnit[] = [];
  if (includeLeader) {
    members.push({
      id: `${squadId}_leader`,
      name: leaderName,
      faceUrl: pickSurvivorFaceUrl(),
      isLeader: true,
      maxHp: 100,
      currentHp: 100,
      weaponId: 'knife',
      armorId: null,
      isAlive: true,
    });
  }
  for (let i = 0; i < Math.max(0, generalCount); i++) {
    members.push({
      id: `${squadId}_member_${i}`,
      name: `Recruit ${i + 1}`,
      faceUrl: pickSurvivorFaceUrl(),
      isLeader: false,
      maxHp: 50,
      currentHp: 50,
      weaponId: 'knife',
      armorId: null,
      isAlive: true,
    });
  }
  return members;
}

/**
 * Recomputes squad aggregate health from the member roster. Marks the squad
 * downed when every member is dead.
 */
export function recomputeSquadHealth(squad: TacticalSquadUnit): TacticalSquadUnit {
  squad.maxHp = squad.members.reduce((acc, m) => acc + m.maxHp, 0);
  squad.currentHp = squad.members.reduce(
    (acc, m) => (m.isAlive ? acc + m.currentHp : acc),
    0
  );
  // generalCount = citizens other than the named leader. Leaderless squads have
  // no leader member, so every member counts as a general.
  squad.generalCount = Math.max(
    0,
    squad.members.length - (squad.members.some((m) => m.isLeader) ? 1 : 0)
  );
  const aliveCount = squad.members.filter((m) => m.isAlive).length;
  if (aliveCount === 0) {
    squad.state = 'downed';
  } else if (squad.state === 'downed') {
    squad.state = 'idle';
  }
  return squad;
}

/**
 * Recomputes squad combat stats from each member's equipped weapon. Leader
 * tier multipliers apply to the leader's weapon only.
 */
export function recomputeSquadStats(squad: TacticalSquadUnit): TacticalSquadUnit {
  const leader = squad.members.find((m) => m.isLeader && m.isAlive) || squad.members[0];
  const tierMult =
    squad.leaderCombatTier === 'expert' ? 1.75 : squad.leaderCombatTier === 'skilled' ? 1.35 : 1.0;

  let damage = 0;
  let range = 8;
  let fireRate = 2.2;
  for (const m of squad.members) {
    if (!m.isAlive) continue;
    const w = getWeaponDefinition(m.weaponId);
    damage += m.isLeader ? w.damage * tierMult : w.damage;
    range = Math.max(range, w.range);
    if (m.isLeader) fireRate = Math.min(fireRate, w.fireRate);
    else fireRate = Math.min(fireRate, w.fireRate + 0.2);
  }

  squad.damagePerVolley = Math.round(damage);
  squad.attackRange = Math.max(8, range);
  squad.fireRate = Math.max(0.9, fireRate);
  squad.critChance =
    squad.leaderCombatTier === 'expert' ? 0.3 : squad.leaderCombatTier === 'skilled' ? 0.15 : 0.05;

  // §Terminus Shooting Range: permanent training proficiency stacks on top of
  // gear and leadership — +6% damage, +1% crit, -5% fire rate per tier.
  const tier = squad.trainingTier ?? 0;
  if (tier > 0) {
    squad.damagePerVolley = Math.round(squad.damagePerVolley * (1 + 0.06 * tier));
    squad.critChance = Math.min(0.5, squad.critChance + 0.01 * tier);
    squad.fireRate = Math.max(0.9, squad.fireRate * Math.max(0.6, 1 - 0.05 * tier));
  }
  return squad;
}

export function assignMemberWeapon(
  squad: TacticalSquadUnit,
  memberId: string,
  weaponId: WeaponItemId | null
): TacticalSquadUnit {
  const member = squad.members.find((m) => m.id === memberId);
  if (!member) return squad;
  member.weaponId = weaponId || 'knife';
  return recomputeSquadStats(squad);
}

export function assignMemberArmor(
  squad: TacticalSquadUnit,
  memberId: string,
  armorId: ArmorItemId | null
): TacticalSquadUnit {
  const member = squad.members.find((m) => m.id === memberId);
  if (!member) return squad;
  member.armorId = armorId;
  return squad;
}

export function createTacticalSquadUnit(
  squadId: string,
  name: string,
  leaderId: string,
  leaderName: string,
  leaderCombatTier: StatTier,
  generalCount: number,
  spawnPos: Point2D,
  hasLeader = true,
  trainingTier = 0
): TacticalSquadUnit {
  const members = buildSquadMembers(squadId, leaderName, generalCount, hasLeader);

  const base: TacticalSquadUnit = {
    squadId,
    name,
    leaderId,
    leaderName,
    leaderCombatTier,
    generalCount,
    x: spawnPos.x,
    z: spawnPos.z,
    y: 0,
    rotation: 0,
    maxHp: (hasLeader ? 100 : 0) + generalCount * 50,
    currentHp: (hasLeader ? 100 : 0) + generalCount * 50,
    attackRange: 28, // 28 meters engagement range
    fireRate: 1.6,
    lastFireTime: 0,
    damagePerVolley: (hasLeader ? 12 : 0) + generalCount * 5,
    critChance: 0.05,
    moveSpeed: 10.0, // 10 m/s tactical run (~36 km/h); brisk enough to cross the 8km map, slower than vehicles on roads
    state: 'idle',
    manualOrder: false,
    targetPos: null,
    targetZombieId: null,
    isDeployed: true,
    killCount: 0,
    isInSafeZone: true,
    members,
    inventory: [],
    currentWeightKg: 0,
    maxWeightKg: (hasLeader ? 1 : 0) + generalCount,
    trainingTier,
  };

  return recomputeSquadHealth(recomputeSquadStats(base));
}

// ==========================================
// 4. Escalating Horde Generator (§5.1, §6.1)
// ==========================================

/** IFZ: a horde has a DOMINANT type and its composition follows from that. */
export type HordeDominantType = 'shambler' | 'runner' | 'brute';

export const HORDE_DOMINANT_LABEL: Record<HordeDominantType, string> = {
  shambler: 'Shambler',
  runner: 'Runner',
  brute: 'Brute',
};

/**
 * Rolls the horde's dominant type. Day 1 is always a shambler crawl; runner
 * hordes appear from Day 2, and rare brute hordes only from Day 4.
 */
export function rollHordeDominantType(day: number): HordeDominantType {
  const roll = Math.random();
  if (day >= 4 && roll < 0.15) return 'brute';
  if (day >= 2 && roll < 0.45) return 'runner';
  return 'shambler';
}

/** Composition shares per dominant type — the horde is built AROUND its core. */
export const HORDE_COMPOSITION: Record<
  HordeDominantType,
  { runner: number; shambler: number; brute: number }
> = {
  // Slow siege pressure: overwhelmingly shamblers, a few runners, rare brute.
  shambler: { runner: 0.12, shambler: 0.85, brute: 0.03 },
  // Speed threat: most of the wave is runners, backed by a shambler core.
  runner: { runner: 0.62, shambler: 0.33, brute: 0.05 },
  // Wrecking ball: a wall of brutes with a shambler escort.
  brute: { runner: 0.12, shambler: 0.66, brute: 0.22 },
};

export interface HordeWave {
  zombies: ZombieUnit[];
  dominant: HordeDominantType;
}

export function generateHordeWave(
  day: number,
  centerPos: Point2D,
  radius: number = 180,
  isNight: boolean = true,
  dominantOverride?: HordeDominantType
): HordeWave {
  const zombies: ZombieUnit[] = [];

  // Horde scale formula based on in-game day
  const totalCount = Math.min(40, Math.floor(4 + day * 3.5 + Math.random() * 4));

  // IFZ composition: the dominant type decides the mix, so each night's horde
  // reads as one coherent threat instead of a uniform random slurry.
  const dominant = dominantOverride || rollHordeDominantType(day);
  const shares = HORDE_COMPOSITION[dominant];
  const counts = {
    brute: Math.round(totalCount * shares.brute),
    runner: Math.round(totalCount * shares.runner),
    shambler: Math.max(0, totalCount - Math.round(totalCount * shares.brute) - Math.round(totalCount * shares.runner)),
  };

  // Spawn around perimeter angle
  const baseAngle = Math.random() * Math.PI * 2;
  const spread = Math.PI * 0.7; // Come from an approach vector

  const spawn = (variant: ZombieVariant) => {
    const angle = baseAngle + (Math.random() - 0.5) * spread;
    const dist = radius * (0.8 + Math.random() * 0.3);
    const x = centerPos.x + Math.cos(angle) * dist;
    const z = centerPos.z + Math.sin(angle) * dist;
    zombies.push(createZombieUnit(variant, x, z, 0, isNight));
  };

  // Interleave the variants so a horde reads as a formation, not blocks of
  // identical types arriving in three separate waves.
  const queue: ZombieVariant[] = [];
  queue.push(...Array.from({ length: counts.brute }, () => 'brute' as const));
  queue.push(...Array.from({ length: counts.runner }, () => 'runner' as const));
  queue.push(...Array.from({ length: counts.shambler }, () => 'shambler' as const));
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  for (const variant of queue) spawn(variant);

  return { zombies, dominant };
}

/**
 * Generate initial ambient dormant zombie clusters across the map
 */
export function generateAmbientMapZombies(
  buildings: BuildingPolygon[],
  hqPos: Point2D | null,
  day: number = 1,
  lairs?: Map<string | number, ZombieLair> | null
): ZombieUnit[] {
  const zombies: ZombieUnit[] = [];
  const count = Math.min(25, 8 + day * 3);

  for (let i = 0; i < count; i++) {
    const bldg = buildings[Math.floor(Math.random() * buildings.length)];
    if (!bldg) continue;

    // Don't spawn right on HQ
    if (hqPos) {
      const distToHq = Math.hypot(bldg.center.x - hqPos.x, bldg.center.z - hqPos.z);
      if (distToHq < 45) continue;
    }

    const offsetDist = 5 + Math.random() * 18;
    const offsetAng = Math.random() * Math.PI * 2;
    const x = bldg.center.x + Math.cos(offsetAng) * offsetDist;
    const z = bldg.center.z + Math.sin(offsetAng) * offsetDist;

    const rand = Math.random();
    let variant: ZombieVariant = 'shambler';
    if (rand < 0.2) variant = 'runner';
    else if (rand < 0.28 && day >= 2) variant = 'brute';

    zombies.push(createZombieUnit(variant, x, z, 0, false));
  }

  // Lair pressure (§5.2): every standing lair anchors a small AFFILIATED local
  // group roaming its home radius — the density bubble around the nest. These
  // are real lair zombies (lairId + home anchor), so killing them reduces the
  // lair's population and a cleared nest leaves a genuinely quiet neighbourhood.
  if (lairs && lairs.size > 0) {
    for (const lair of lairs.values()) {
      if (lair.isCleared) continue;
      const bldg = buildings.find((b) => String(b.id) === String(lair.buildingId));
      if (!bldg) continue;
      const radius = lair.homeRadius ?? 40;
      const groupSize = 2 + (lair.escalation ?? 0);
      for (let g = 0; g < groupSize; g++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = radius * (0.4 + Math.random() * 0.5);
        const zmb = createZombieUnit('shambler', bldg.center.x + Math.cos(angle) * dist, bldg.center.z + Math.sin(angle) * dist, 0, false);
        zmb.lairId = lair.id;
        zmb.homeX = bldg.center.x;
        zmb.homeZ = bldg.center.z;
        zmb.homeRadius = radius;
        zmb.isRoamer = Math.random() < 0.15;
        zombies.push(zmb);
      }
    }
  }

  return zombies;
}

// ==========================================
// 5. Sound & Acoustic Proximity System (§5, §6.1)
// ==========================================

export function emitNoiseEvent(
  type: NoiseEvent['type'],
  x: number,
  z: number,
  label?: string
): { event: NoiseEvent; visualFx: CombatVisualFx } {
  let radius = 40; // Default meters

  switch (type) {
    case 'gunfire':
      radius = 95;
      break;
    case 'brute_slam':
      radius = 65;
      break;
    case 'breach':
      radius = 50;
      break;
    case 'construction':
    case 'repair':
      radius = 42;
      break;
    case 'combat':
      radius = 35;
      break;
    case 'engine':
      radius = 55;
      break;
  }

  const id = `noise-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();

  const event: NoiseEvent = {
    id,
    type,
    x,
    z,
    radius,
    label: label || type.toUpperCase(),
    createdAt: now,
    durationMs: 2500,
  };

  const visualFx: CombatVisualFx = {
    id: `ring-${id}`,
    type: 'noise_ring',
    startX: x,
    startY: 0.3,
    startZ: z,
    radius,
    color: type === 'gunfire' ? '#ef4444' : type === 'brute_slam' ? '#a855f7' : '#38bdf8',
    createdAt: now,
    durationMs: 2000,
  };

  return { event, visualFx };
}

// ==========================================
// 6. Complete Real-Time Combat Tick Loop (§5, §5.1, §6.1)
// ==========================================

export interface CombatTickResult {
  updatedZombies: ZombieUnit[];
  updatedSquads: TacticalSquadUnit[];
  updatedAdaptedBuildings: Map<string | number, AdaptedBuilding>;
  activeNoiseEvents: NoiseEvent[];
  newVisualFx: CombatVisualFx[];
  settlementNotifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' | 'danger' }[];
  newInfections: SurvivorInfection[];
  fallenHeroEvents: { survivorId: string; cause: DeathCause; location: string }[];
  droppedItems: DroppedItem[];
  // §5.2 rival factions: armed hostile-human occupants of Hideouts, plus any
  // player squads they overpowered this tick (captured for ransom, not killed).
  updatedHostileHumans: HostileHumanUnit[];
  capturedSquadIds: string[];
  ammoConsumed: number;
}

/** True when stepAlongPath produced the dead one-point path: the goal is
 *  obstructed and A* could not find any route to it. This is the pathfinder's
 *  definitive "no path" signal — the unit stands still instead of phasing
 *  through construction. */
function isNoPathStep(step: { arrived: boolean; state: { path: unknown[] } }): boolean {
  return !step.arrived && step.state?.path?.length === 1;
}

export function tickCombatSimulation(
  zombies: ZombieUnit[],
  squads: TacticalSquadUnit[],
  adaptedBuildings: Map<string | number, AdaptedBuilding>,
  noiseEvents: NoiseEvent[],
  clock: GameClockState,
  hqPos: Point2D | null,
  deltaSec: number,
  settlement?: SettlementState,
  droppedItems: DroppedItem[] = [],
  hostileHumans: HostileHumanUnit[] = [],
  pathGrid?: PathGrid | null,
  alarmActive: boolean = false
): CombatTickResult {
  const now = Date.now();
  const effectiveDelta = deltaSec * (clock.speed === 0 ? 0 : clock.speed);

  const newVisualFx: CombatVisualFx[] = [];
  const settlementNotifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' | 'danger' }[] = [];
  const newInfections: SurvivorInfection[] = [];
  const fallenHeroEvents: { survivorId: string; cause: DeathCause; location: string }[] = [];
  const capturedSquadIds: string[] = [];
  let ammoAvailable = settlement?.stockpile?.ammo?.sharedPool ?? 0;
  let ammoConsumed = 0;

  // §6.1 weather & lunar modulation of the sunlight-dormancy gate.
  const activityMods = getZombieActivityModifiers(
    settlement?.weather?.currentWeather,
    settlement?.weather?.moonPhase
  );

  // Active Research Checks (§10)
  const hasFloodlightTech = settlement ? isResearchUnlocked(settlement, 'long_range_antenna') : false;
  const hasTurretsTech = settlement ? isResearchUnlocked(settlement, 'precision_machinery') : false;
  const hasSandbagTech = settlement ? isResearchUnlocked(settlement, 'advanced_masonry') : false;
  const hasBastionTech = settlement ? isResearchUnlocked(settlement, 'structural_bracing') : false;

  // Collect active floodlight emitters at night (§6.1, §10 Light Deterrent
  // Mechanic). §Terminus power grid: a floodlight burns its full 80m cone
  // while its generator feeds it; unpowered it falls back to a dim 30m
  // battery/emergency glow — so the power infrastructure genuinely matters.
  const poweredBuildingIds = settlement ? getPoweredBuildingIds(settlement) : new Set<string>();
  const floodlightRadius = (bldgId: string | number) =>
    poweredBuildingIds.has(String(bldgId)) ? 80 : 30;
  const lightEmitters: { x: number; z: number; radius: number; label: string }[] = [];
  if (clock.isNight) {
    // 1. Any functional floodlight tower
    for (const bldg of adaptedBuildings.values()) {
      if (isBuildingOperational(bldg)) {
        if (bldg.typeId === 'floodlight_tower') {
          lightEmitters.push({ x: bldg.position.x, z: bldg.position.z, radius: floodlightRadius(bldg.buildingId), label: bldg.name });
        } else if (
          hasFloodlightTech &&
          (bldg.typeId === 'guard_watchtower' ||
            bldg.typeId === 'wooden_tower' ||
            bldg.typeId === 'shelter_bunkhouse' ||
            bldg.typeId === 'shelter')
        ) {
          lightEmitters.push({ x: bldg.position.x, z: bldg.position.z, radius: 55, label: bldg.name });
        }
      }
    }

    // 2. Freestanding floodlights
    if (settlement?.freestandingBuildings) {
      for (const free of settlement.freestandingBuildings) {
        if (isBuildingOperational(free)) {
          if (free.typeId === 'floodlight_tower') {
            lightEmitters.push({ x: free.position.x, z: free.position.z, radius: floodlightRadius(free.buildingId), label: free.name });
          } else if (
            hasFloodlightTech &&
            (free.typeId === 'guard_watchtower' || free.typeId === 'wooden_tower')
          ) {
            lightEmitters.push({ x: free.position.x, z: free.position.z, radius: 55, label: free.name });
          }
        }
      }
    }

    // 3. HQ floodlight if tech unlocked
    if (hqPos && hasFloodlightTech) {
      lightEmitters.push({ x: hqPos.x, z: hqPos.z, radius: 60, label: 'HQ Perimeter Spotlight' });
    }
  }

  // 1. Filter out expired noise events
  const activeNoiseEvents = noiseEvents.filter((n) => now - n.createdAt < n.durationMs);

  // 2. Update Squad Units (RTS Movement, Target Acquisition, Firing).
  // Healing was historically an instant +6 HP/s regeneration near HQ or any
  // Medbay footprint regardless of staffing. That magic is gone: §5.3
  // treatment (beds + nurses + patient queue) runs once per tick AFTER this
  // pass via tickMedicalFacilityCare().
  const medSquads = squads.map((squad) => {
    // Off-map expedition squads (§IFZ) are away from the tactical map: the
    // combat tick leaves them untouched (they resolve in tickExpeditions).
    if (squad.onExpedition) {
      return { ...squad };
    }
    if (squad.currentHp <= 0) {
      return { ...squad, state: 'downed' as const };
    }

    let { x, z, y, rotation, currentHp, state, manualOrder, targetPos, targetZombieId } = squad;

    // `isInSafeZone` now means "genuinely under medical treatment this tick":
    // tickMedicalFacilityCare() (below) flips it for squads that actually got
    // bed space + a nurse. Merely being near the HQ no longer regenerates HP,
    // so it must not light up the HEALING indicator either.
    const inSafeZone = false;

    // Determine squad weapon capabilities:
    // Check if squad has ranged weapons (pistol, shotgun, hunting_rifle, assault_rifle)
    const aliveMembers = squad.members.filter((m) => m.isAlive);
    const rangedMembers = aliveMembers.filter((m) => getWeaponDefinition(m.weaponId).ammoPerVolley > 0);
    const squadAmmoPerVolley = rangedMembers.reduce((sum, m) => sum + getWeaponDefinition(m.weaponId).ammoPerVolley, 0);
    const hasSufficientAmmo = squadAmmoPerVolley === 0 || ammoAvailable >= squadAmmoPerVolley;

    // Base effective attack range:
    // If squad has guns and ammo -> weapon range (e.g. 28m pistol, 36m AR, 42m rifle)
    // If squad has only melee or is out of ammo -> melee engagement range (8.5m)
    const baseRange = rangedMembers.length > 0 && hasSufficientAmmo ? squad.attackRange : 8.5;
    const effectiveAttackRange = hasTurretsTech ? baseRange * 1.3 : baseRange;

    // 1. Resolve Active Target (if player commanded attack on a specific enemy or previously locked on)
    let activeTarget: ZombieUnit | HostileHumanUnit | null = null;
    if (targetZombieId) {
      const zTarget = zombies.find((z) => z.id === targetZombieId && z.currentHp > 0);
      const hTarget = hostileHumans.find((h) => h.id === targetZombieId && h.currentHp > 0);
      activeTarget = zTarget || hTarget || null;
      if (!activeTarget) {
        // Target is dead or missing!
        targetZombieId = null;
        if (state === 'combat' && !targetPos) {
          state = 'idle';
          targetPos = null;
          manualOrder = false;
        }
      }
    }

    // 2. If no active target assigned, Auto-Acquire closest enemy within weapon range
    if (!activeTarget) {
      let closestDist = Infinity;
      for (const zmb of zombies) {
        if (zmb.currentHp <= 0) continue;
        const d = Math.hypot(zmb.x - x, zmb.z - z);
        if (d <= effectiveAttackRange && d < closestDist) {
          closestDist = d;
          activeTarget = zmb;
        }
      }
      for (const human of hostileHumans) {
        if (human.currentHp <= 0) continue;
        const d = Math.hypot(human.x - x, human.z - z);
        if (d <= effectiveAttackRange && d < closestDist) {
          closestDist = d;
          activeTarget = human;
        }
      }
      if (activeTarget && !manualOrder) {
        targetZombieId = activeTarget.id;
      }
    }

    // 3. Movement Execution:
    // If the player gave a manual order (or retreating/returning/moving to targetPos),
    // the squad MUST execute movement along the path towards targetPos!
    const isPlayerOrderedMove = manualOrder && targetPos;
    const isReturningOrRetreating = (state === 'returning' || state === 'retreating') && targetPos;

    if (isPlayerOrderedMove || isReturningOrRetreating) {
      // Execute path movement towards destination. Player-built walls are hard
      // barriers for squads too (they route around them; gates stay open), so a
      // sealed perimeter produces a genuine "no path" failure instead of a
      // silent walk-into-the-wall.
      const step = stepAlongPath(
        pathGrid,
        squad.pathState,
        x,
        z,
        targetPos.x,
        targetPos.z,
        squad.moveSpeed,
        effectiveDelta,
        1.2,
        { wallsImpassable: true }
      );
      x = step.x;
      z = step.z;
      rotation = step.rotation;
      squad.pathState = step.state;

      if (!step.arrived) {
        state = isReturningOrRetreating ? state : 'moving';
        if (isNoPathStep(step)) {
          squad.noPath = squad.noPath ?? {
            buildingId: squad.targetBuildingId ?? undefined,
            x: targetPos.x,
            z: targetPos.z,
            since: now,
          };
        } else {
          squad.noPath = undefined;
        }
      } else {
        squad.noPath = undefined;
        targetPos = null;
        manualOrder = false;
        state = squad.targetBuildingId ? 'searching' : 'idle';
      }
    } else if (activeTarget && !targetPos) {
      // Stand and engage / close distance to enemy if no manual move order
      const distToTarget = Math.hypot(activeTarget.x - x, activeTarget.z - z);
      rotation = Math.atan2(activeTarget.x - x, activeTarget.z - z);

      if (distToTarget > effectiveAttackRange) {
        // Step closer to attack range
        const step = Math.min(distToTarget - effectiveAttackRange * 0.75, squad.moveSpeed * effectiveDelta);
        x += ((activeTarget.x - x) / distToTarget) * step;
        z += ((activeTarget.z - z) / distToTarget) * step;
        state = 'combat';
      } else {
        state = 'combat';
      }
    } else if (targetPos) {
      // General pathing (walls impassable for squads — see above)
      const step = stepAlongPath(
        pathGrid,
        squad.pathState,
        x,
        z,
        targetPos.x,
        targetPos.z,
        squad.moveSpeed,
        effectiveDelta,
        1.2,
        { wallsImpassable: true }
      );
      x = step.x;
      z = step.z;
      rotation = step.rotation;
      squad.pathState = step.state;

      if (!step.arrived) {
        state = 'moving';
        if (isNoPathStep(step)) {
          squad.noPath = squad.noPath ?? {
            buildingId: squad.targetBuildingId ?? undefined,
            x: targetPos.x,
            z: targetPos.z,
            since: now,
          };
        } else {
          squad.noPath = undefined;
        }
      } else {
        squad.noPath = undefined;
        targetPos = null;
        manualOrder = false;
        state = squad.targetBuildingId ? 'searching' : 'idle';
      }
    } else if (squad.targetBuildingId && squad.state === 'searching') {
      state = 'searching';
    } else {
      state = 'idle';
      targetZombieId = null;
    }

    // 4. Weapons & Combat Firing (Can fire while moving/kiting or holding ground if enemy in range!)
    if (activeTarget) {
      const distToTarget = Math.hypot(activeTarget.x - x, activeTarget.z - z);
      if (distToTarget <= effectiveAttackRange) {
        if (state !== 'returning' && state !== 'retreating' && !isPlayerOrderedMove) {
          state = 'combat';
        }
        rotation = Math.atan2(activeTarget.x - x, activeTarget.z - z);

        // Morale Combat Modifiers (§4.5)
        const moraleCombatMult = settlement?.morale?.modifiers.combatDamageMultiplier || 1.0;
        const moraleFireRateMult = settlement?.morale?.modifiers.combatFireRateMultiplier || 1.0;
        const moraleCritBonus = settlement?.morale?.modifiers.combatCritBonus || 0.0;

        const effectiveFireCooldown = (squad.fireRate / moraleFireRateMult) * 1000;

        if (now - squad.lastFireTime >= effectiveFireCooldown) {
          squad.lastFireTime = now;

          const isCrit = Math.random() < (squad.critChance + moraleCritBonus);
          const isGunfire = rangedMembers.length > 0 && ammoAvailable >= squadAmmoPerVolley;

          let damageDealt = 0;

          if (isGunfire) {
            // Firing guns
            ammoAvailable = Math.max(0, ammoAvailable - squadAmmoPerVolley);
            ammoConsumed += squadAmmoPerVolley;

            const baseVolley = squad.damagePerVolley * moraleCombatMult;
            damageDealt = Math.max(1, Math.round(
              baseVolley * (0.85 + Math.random() * 0.3) * (isCrit ? 2.2 : 1.0)
            ));

            soundService.playGunfire(isCrit);

            // Muzzle flash + Tracer
            newVisualFx.push({
              id: `muzzle-${squad.squadId}-${now}`,
              type: 'muzzle_flash',
              startX: x,
              startY: 1.2,
              startZ: z,
              createdAt: now,
              durationMs: 120,
            });

            newVisualFx.push({
              id: `tracer-${squad.squadId}-${now}`,
              type: 'bullet_tracer',
              startX: x,
              startY: 1.2,
              startZ: z,
              endX: activeTarget.x,
              endY: 1.0,
              endZ: activeTarget.z,
              createdAt: now,
              durationMs: 150,
            });

            const { event: noiseEvt, visualFx: ringFx } = emitNoiseEvent('gunfire', x, z, `${squad.name} Firefight`);
            activeNoiseEvents.push(noiseEvt);
            newVisualFx.push(ringFx);
          } else {
            // Melee strike
            const meleeBase = aliveMembers.reduce((sum, m) => sum + Math.max(10, getWeaponDefinition(m.weaponId).damage), 0) * moraleCombatMult;
            damageDealt = Math.max(1, Math.round(
              meleeBase * (0.85 + Math.random() * 0.3) * (isCrit ? 2.0 : 1.0)
            ));

            soundService.playMelee(false);

            newVisualFx.push({
              id: `slash-${squad.squadId}-${now}`,
              type: 'melee_slash',
              startX: activeTarget.x,
              startY: 1.0,
              startZ: activeTarget.z,
              createdAt: now,
              durationMs: 250,
            });

            const { event: noiseEvt, visualFx: ringFx } = emitNoiseEvent('combat', x, z, `${squad.name} Melee Clash`);
            activeNoiseEvents.push(noiseEvt);
            newVisualFx.push(ringFx);
          }

          // Apply damage to enemy
          activeTarget.currentHp = Math.max(0, activeTarget.currentHp - damageDealt);

          // Damage floating number
          newVisualFx.push({
            id: `dmg-${activeTarget.id}-${now}`,
            type: 'damage_number',
            startX: activeTarget.x,
            startY: 2.2,
            startZ: activeTarget.z,
            text: `-${damageDealt}${isCrit ? ' CRIT!' : ''}`,
            color: isCrit ? '#fbbf24' : '#ef4444',
            isCrit,
            createdAt: now,
            durationMs: 900,
          });

          // Check if enemy was killed
          if (activeTarget.currentHp <= 0) {
            squad.killCount += 1;
            targetZombieId = null;
            if (!manualOrder) {
              targetPos = null;
              state = 'idle';
            }

            newVisualFx.push({
              id: `death-${activeTarget.id}-${now}`,
              type: 'zombie_death',
              startX: activeTarget.x,
              startY: 0.5,
              startZ: activeTarget.z,
              createdAt: now,
              durationMs: 1500,
            });
          }
        }
      }
    }

    return {
      ...squad,
      x,
      z,
      y,
      rotation,
      currentHp,
      state,
      targetPos,
      targetZombieId,
      isInSafeZone: inSafeZone,
      pathState: squad.pathState,
    };
  });

  // §5.3 Medical treatment — one pure pass over the freshly moved squads.
  // Wounded survivors heal ONLY inside operational, staffed medical
  // facilities: beds cap admissions, each assigned nurse attends one patient
  // at +0.1 HP per in-game hour, and surplus wounded queue with no healing.
  const caredSquads =
    settlement && effectiveDelta > 0
      ? tickMedicalFacilityCare(medSquads, settlement, effectiveDelta)
      : medSquads;

  // 3. Update Zombies (Dormancy Lore, Noise Detection, Pathing, Combat vs Squads & Buildings)
  const updatedZombies = zombies
    .map((zombie) => {
      if (zombie.currentHp <= 0) {
        return { ...zombie, state: 'dead' as const };
      }

      let {
        x,
        z,
        y,
        rotation,
        speed,
        state,
        targetPos,
        targetUnitId,
        targetBuildingId,
        alertLevel,
        lastAttackTime,
      } = zombie;

      const isNight = clock.isNight;

      // §6.1 addition: overcast/rain/storm weather shields the infected from the
      // sunlight penalty, permitting daytime activity. Clear sun keeps them dormant.
      const daylightShielded = isNight ? 0 : activityMods.daytimeActivity;
      const isDormant = !isNight && alertLevel === 0 && daylightShielded <= 0;
      const nightCalmMult = isNight ? activityMods.nightActivityMult : 1.0;

      // Weather Modifiers (§9)
      const weatherDef = settlement?.weather ? WEATHER_CONDITIONS[settlement.weather.currentWeather] : null;
      const weatherSpeedMult = weatherDef ? weatherDef.zombieSpeedMult : 1.0;
      const weatherVisualMult = weatherDef ? weatherDef.zombieVisualRangeMult : 1.0;
      const weatherAcousticMult = weatherDef ? weatherDef.acousticSoundRadiusMult : 1.0;

      // Adjust speed for day vs night (§6.1) and weather (§9)
      let currentSpeed = (zombie.variant === 'runner' ? (isNight ? 5.4 : 3.0) : zombie.variant === 'brute' ? (isNight ? 1.6 : 0.9) : (isNight ? 2.3 : 1.2)) * weatherSpeedMult;

      // Sluggish during day (full dormancy), and weather-shielded daytime roams
      if (isDormant) {
        currentSpeed *= 0.35;
      } else if (!isNight && daylightShielded > 0) {
        // Active but hindered under overcast/storm cover.
        currentSpeed *= 0.6 + 0.4 * daylightShielded;
      }

      // Full moon calms the infected at night (§6.1).
      currentSpeed *= nightCalmMult;

      // Check Floodlight Suppression at Night (§6.1, §10 Light Deterrent Mechanic)
      let isLightSuppressed = false;
      let repellingLight: { x: number; z: number } | null = null;
      if (isNight && lightEmitters.length > 0) {
        for (const emitter of lightEmitters) {
          const distToEmitter = Math.hypot(emitter.x - x, emitter.z - z);
          if (distToEmitter <= emitter.radius) {
            isLightSuppressed = true;
            repellingLight = emitter;
            break;
          }
        }
      }

      if (isLightSuppressed && repellingLight) {
        // High-intensity light suppresses infected speed and causes disorientation/recoil (§6.1, §10)
        currentSpeed *= 0.45;
        if (state !== 'attacking_unit' && Math.random() < 0.08) {
          // Push zombie away from the light
          const pushAngle = Math.atan2(x - repellingLight.x, z - repellingLight.z);
          targetPos = {
            x: x + Math.sin(pushAngle) * 15,
            z: z + Math.cos(pushAngle) * 15,
          };
          state = 'wandering';
          alertLevel = 0;
        }
      }

      // A. Sound Detection Check (§5, §6.1, §9). Clear daylight dormancy is
      // authoritative: noise cannot wake an infected unless night or weather
      // explicitly grants daytime activity.
      if (!isDormant) for (const noise of activeNoiseEvents) {
        const distToNoise = Math.hypot(noise.x - x, noise.z - z);
        const hearingMult = (zombie.variant === 'runner' ? 1.4 : zombie.variant === 'brute' ? 1.0 : 1.1) * weatherAcousticMult;
        if (distToNoise <= noise.radius * hearingMult) {
          alertLevel = 2;
          targetPos = { x: noise.x + (Math.random() - 0.5) * 6, z: noise.z + (Math.random() - 0.5) * 6 };
          state = 'investigating_sound';
          break;
        }
      }

      // B. Proximity to Alive Squad Units (Sight & Aggro)
      let targetSquad: TacticalSquadUnit | null = null;
      let squadDist = Infinity;
      const baseSightRange = isNight
        ? isLightSuppressed
          ? 18
          : zombie.variant === 'runner'
          ? 45
          : 32
        : zombie.variant === 'runner'
        ? 24
        : 18;
      const sightRange = baseSightRange * weatherVisualMult * (isNight ? activityMods.nightSightMult : 1.0);

      for (const sq of caredSquads) {
        if (sq.currentHp <= 0) continue;
        const d = Math.hypot(sq.x - x, sq.z - z);
        if (d <= sightRange && d < squadDist) {
          squadDist = d;
          targetSquad = sq;
        }
      }

      // If already aggroed on a squad, continue giving chase as squad moves/retreats
      if (!targetSquad && targetUnitId) {
        const existingTarget = caredSquads.find((sq) => sq.squadId === targetUnitId && sq.currentHp > 0);
        if (existingTarget) {
          const d = Math.hypot(existingTarget.x - x, existingTarget.z - z);
          if (d < 95) {
            targetSquad = existingTarget;
            squadDist = d;
          } else {
            targetUnitId = null;
          }
        } else {
          targetUnitId = null;
        }
      }

      if (targetSquad) {
        targetUnitId = targetSquad.squadId;
        targetPos = { x: targetSquad.x, z: targetSquad.z };
        state = 'chasing';
        alertLevel = 2;

        // Melee attack if in range (2.0m)
        if (squadDist <= 2.2) {
          state = 'attacking_unit';
          if (now - lastAttackTime >= zombie.attackCooldown * 1000) {
            lastAttackTime = now;
            // Damage a random alive squad member; armor absorbs a fraction.
            const aliveMembers = targetSquad.members.filter((m) => m.isAlive);
            const victim = aliveMembers[Math.floor(Math.random() * aliveMembers.length)];
            let appliedDamage = zombie.baseDamage;
            if (victim && victim.armorId) {
              const armor = getArmorDefinition(victim.armorId);
              appliedDamage = Math.max(1, Math.round(zombie.baseDamage * (1 - armor.damageReduction)));
            }

            // Building cover / barricade defense buff (§5.1 & §5.3):
            // Squads inside a building footprint receive 50% damage reduction from structure barricades
            const isSquadInBuilding = Boolean(
              pathGrid?.isInsideBuilding(targetSquad.x, targetSquad.z) || targetSquad.targetBuildingId
            );
            if (isSquadInBuilding) {
              appliedDamage = Math.max(1, Math.round(appliedDamage * 0.5));
            }

            if (victim) {
              victim.currentHp = Math.max(0, victim.currentHp - appliedDamage);
              if (victim.currentHp <= 0) {
                victim.isAlive = false;
                // Drop equipped weapon & armor to the ground (§4.3)
                const dropWeapon = victim.weaponId !== 'knife' ? victim.weaponId : null;
                if (dropWeapon || victim.armorId) {
                  droppedItems.push({
                    id: `drop_${targetSquad.squadId}_${now}_${victim.id}`,
                    x: targetSquad.x,
                    z: targetSquad.z,
                    weaponId: dropWeapon,
                    armorId: victim.armorId,
                    droppedAt: now,
                  });
                }
                settlementNotifications.push({
                  title: 'SQUAD MEMBER FALLEN',
                  desc: `${victim.name} of ${targetSquad.name} was killed in combat${dropWeapon || victim.armorId ? ' — equipment dropped to the ground' : ''}.`,
                  type: 'warn',
                });
              }
            }
            recomputeSquadHealth(targetSquad);

            // SFX for melee hit and zombie variant sound
            soundService.playMelee(true);
            soundService.playZombieSound(zombie.variant);

            // Visual slash effect
            newVisualFx.push({
              id: `slash-${zombie.id}-${now}`,
              type: 'melee_slash',
              startX: targetSquad.x,
              startY: 1.0,
              startZ: targetSquad.z,
              createdAt: now,
              durationMs: 300,
            });

            newVisualFx.push({
              id: `squad-dmg-${targetSquad.squadId}-${now}`,
              type: 'damage_number',
              startX: targetSquad.x,
              startY: 2.2,
              startZ: targetSquad.z,
              text: isSquadInBuilding ? `-${appliedDamage} (COVER)` : `-${appliedDamage}`,
              color: isSquadInBuilding ? '#fbbf24' : '#f87171',
              createdAt: now,
              durationMs: 800,
            });

            // Melee bite roll check (§6.2 Field infection on bite, reduced by vaccine and building barricades)
            let biteChance = rollBiteChance(zombie.variant, settlement);
            if (isSquadInBuilding) {
              biteChance *= 0.5; // Barricade reduces bite angle
            }
            if (Math.random() < biteChance) {
              const inf = createSurvivorInfection(
                targetSquad.leaderId,
                targetSquad.leaderName,
                true,
                `${zombie.variant.toUpperCase()} Melee Claw/Bite`
              );
              newInfections.push(inf);
            }

            if (targetSquad.currentHp <= 0) {
              fallenHeroEvents.push({
                survivorId: targetSquad.leaderId,
                cause: 'combat_slain',
                location: `Tactical Grid (${Math.round(targetSquad.x)}, ${Math.round(targetSquad.z)})`,
              });

              settlementNotifications.push({
                title: 'SQUAD OVERWHELMED & LEADER FALLEN',
                desc: `${targetSquad.name} (${targetSquad.leaderName}) was killed in the line of duty!`,
                type: 'warn',
              });
            }
          }
        }
      } else {
        // C. Target nearby building / barricade / HQ if active at night. The
        // command center is a real siege target (§7.5): breaching it costs the
        // settlement its operational status, so it joins the candidate list.
        const hq = settlement ? getPrimaryHQ(settlement) : null;
        if (isNight && !targetPos && (adaptedBuildings.size > 0 || hq)) {
          // Nearest siege candidate among adapted buildings + the HQ.
          let nearestBldg: AdaptedBuilding | null = null;
          let targetIsHq = false;
          let minBldgDist = Infinity;
          for (const bldg of adaptedBuildings.values()) {
            const d = Math.hypot(bldg.position.x - x, bldg.position.z - z);
            if (d < minBldgDist) {
              minBldgDist = d;
              nearestBldg = bldg;
              targetIsHq = false;
            }
          }
          if (hq) {
            const d = Math.hypot(hq.center.x - x, hq.center.z - z);
            if (d < minBldgDist) {
              minBldgDist = d;
              targetIsHq = true;
            }
          }

          if (minBldgDist < 120) {
            const targetPosPoint = targetIsHq ? hq!.center : (nearestBldg!.position as { x: number; z: number });
            targetBuildingId = targetIsHq ? hq!.buildingId : nearestBldg!.buildingId;
            targetPos = { x: targetPosPoint.x, z: targetPosPoint.z };
            state = 'chasing';

            // If close to building, attack building / wall (§5.1 siege damage)
            if (minBldgDist < 15) {
              state = 'attacking_building';
              if (now - lastAttackTime >= zombie.attackCooldown * 1000) {
                lastAttackTime = now;
                let siegeDmg = zombie.siegeDamage;

                // Defense Research: Sandbags & Reinforced Bastions reduce siege damage (§10)
                if (hasSandbagTech) siegeDmg = Math.round(siegeDmg * 0.75);
                if (hasBastionTech) siegeDmg = Math.round(siegeDmg * 0.6);

                const wasAlive = targetIsHq ? (hq!.currentDurability ?? 1) > 0 : nearestBldg!.currentDurability > 0;
                if (targetIsHq) {
                  hq!.currentDurability = Math.max(0, (hq!.currentDurability ?? 0) - siegeDmg);
                } else {
                  nearestBldg!.currentDurability = Math.max(0, nearestBldg!.currentDurability - siegeDmg);
                }

                // Sound effect for siege hit
                soundService.playZombieSound(zombie.variant);
                soundService.playMelee(false);

                newVisualFx.push({
                  id: `bldg-hit-${targetBuildingId}-${now}`,
                  type: 'building_impact',
                  startX: targetPosPoint.x,
                  startY: 3.0,
                  startZ: targetPosPoint.z,
                  text: `-${siegeDmg} SIEGE`,
                  color: targetIsHq ? '#ef4444' : '#f97316',
                  isSiege: true,
                  createdAt: now,
                  durationMs: 900,
                });

                if (wasAlive && (targetIsHq ? hq!.currentDurability : nearestBldg!.currentDurability) <= 0) {
                  settlementNotifications.push(
                    targetIsHq
                      ? {
                          title: 'COMMAND CENTER BREACHED',
                          desc: `${hq!.buildingName} has been overrun — the colony is lost unless it can be reclaimed!`,
                          type: 'danger',
                        }
                      : {
                          title: 'STRUCTURE BREACHED',
                          desc: `${nearestBldg!.name} durability breached by infected assault!`,
                          type: 'warn',
                        }
                  );
                }
              }
            }
          }
        }
      }

      // §7.1 Barbed-wire hazard (NOT an obstacle): wire cells stay fully
      // passable, but an infected standing on one is slowed by the def's
      // percentage and bleeds damageOnContact HP per second. Movement below
      // then uses the slowed currentSpeed; the damage applies even when the
      // infected is pinned in place attacking.
      const wireHazard = pathGrid?.getHazardAt(x, z);
      if (wireHazard) {
        if (wireHazard.slowPct > 0) currentSpeed *= 1 - wireHazard.slowPct / 100;
        if (wireHazard.damagePerSec > 0 && zombie.currentHp > 0) {
          const bleed = wireHazard.damagePerSec * effectiveDelta;
          zombie.currentHp = Math.max(0, zombie.currentHp - bleed);
          if (zombie.currentHp <= 0) {
            newVisualFx.push({
              id: `wire-kill-${zombie.id}-${now}`,
              type: 'zombie_death',
              startX: x,
              startY: 0.5,
              startZ: z,
              createdAt: now,
              durationMs: 1500,
            });
          } else if (Math.random() < 0.2) {
            // Throttle the floating damage text so a crossing doesn't spam FX.
            newVisualFx.push({
              id: `wire-dmg-${zombie.id}-${now}`,
              type: 'damage_number',
              startX: x,
              startY: 2.0,
              startZ: z,
              text: `-${Math.max(1, Math.round(bleed))} WIRE`,
              color: '#e5e7eb',
              createdAt: now,
              durationMs: 700,
            });
          }
        }
      }

      // D. Move toward target position with A* pathfinding
      let zombiePathState = zombie.pathState;
      if (targetPos && state !== 'attacking_unit' && state !== 'attacking_building') {
        const step = stepAlongPath(
          pathGrid,
          zombiePathState,
          x,
          z,
          targetPos.x,
          targetPos.z,
          currentSpeed,
          effectiveDelta,
          1.2,
          // The infected cannot pass through gates, and walls are never
          // traversable for them — a fenced perimeter genuinely keeps them out.
          { gatesOpen: false, wallsImpassable: true }
        );
        x = step.x;
        z = step.z;
        rotation = step.rotation;
        zombiePathState = step.state;

        if (step.arrived) {
          targetPos = null;
          zombiePathState = undefined;
          state = isDormant ? 'dormant' : 'wandering';
        }
      } else if (!isDormant) {
        // FULL LOCALITY MODEL (§5.2, IFZ post-Lair behaviour):
        //   Lair → local population → most stay near the nest → some roam →
        //   hordes/swarms/ambient infected remain independent.
        // Lair-affiliated infected that are NOT roamers patrol their home
        // radius and walk home DETERMINISTICALLY the moment they stray beyond
        // it (no probabilistic luck involved). Building-occupation infected
        // carry the same home anchor and behave identically — they hold the
        // structure they took over until a squad breaches it. Roamers — and
        // every unaffiliated infected (hordes, swarms, ambient) — wander
        // freely with no home pull.
        const hasHomeAnchor =
          (!!zombie.lairId || !!zombie.occupationId) &&
          zombie.homeX !== undefined &&
          zombie.homeZ !== undefined;
        const wanderAngle = Math.random() * Math.PI * 2;
        if (hasHomeAnchor && !zombie.isRoamer) {
          const radius = zombie.homeRadius ?? 40;
          const distHome = Math.hypot(zombie.homeX - x, zombie.homeZ - z);
          if (distHome > radius * 1.15) {
            // Strayed beyond the nest's territory — walk home, now.
            targetPos = { x: zombie.homeX, z: zombie.homeZ };
          } else if (Math.random() < 0.15) {
            // Local patrol around the nest (most infected remain nearby).
            const r = Math.min(12, Math.max(3, radius * 0.5));
            targetPos = { x: x + Math.cos(wanderAngle) * r, z: z + Math.sin(wanderAngle) * r };
          }
        } else if (Math.random() < 0.02) {
          // Free wander — roamers and independent infected (swarms/hordes).
          targetPos = { x: x + Math.cos(wanderAngle) * 12, z: z + Math.sin(wanderAngle) * 12 };
        }
      }

      return {
        ...zombie,
        x,
        z,
        y,
        rotation,
        state,
        targetPos,
        targetUnitId,
        targetBuildingId,
        alertLevel,
        lastAttackTime,
        isDormant,
        pathState: zombiePathState,
      };
    })
    .filter((z) => z.state !== 'dead' || now - z.spawnedAt < 10000); // Clean dead after 10s

  // 3b. Update Hostile Human Faction Units (§5.2) — always active, armed, and
  // hostile on sight. They guard their Hideout and open fire on any squad that
  // enters aggro range, using the same damage/HP resolution as squads vs. zombies.
  const updatedHostileHumans = hostileHumans
    .map((human) => {
      if (human.currentHp <= 0) {
        return { ...human, state: 'dead' as const };
      }

      let { x, z, rotation, state, targetSquadId, targetBuildingId, lastAttackTime, pathState } = human;

      // Defend against nearby squads first; otherwise siege the nearest owned
      // structure so hostile factions can damage buildings, not just people.
      let targetSquad: TacticalSquadUnit | null = null;
      let targetDist = Infinity;
      for (const sq of caredSquads) {
        if (sq.currentHp <= 0) continue;
        const d = Math.hypot(sq.x - x, sq.z - z);
        if (d < targetDist) {
          targetDist = d;
          targetSquad = sq;
        }
      }

      let targetBuilding: AdaptedBuilding | null = null;
      if (!targetSquad || targetDist > human.aggroRange) {
        let nearestDistance = Infinity;
        for (const bldg of adaptedBuildings.values()) {
          if (!isBuildingOperational(bldg)) continue;
          const distance = Math.hypot(bldg.position.x - x, bldg.position.z - z);
          if (distance < nearestDistance) { nearestDistance = distance; targetBuilding = bldg; }
        }
      }

      if (targetSquad && targetDist <= human.aggroRange) {
        targetSquadId = targetSquad.squadId;
        rotation = Math.atan2(targetSquad.x - x, targetSquad.z - z);

        if (targetDist <= human.attackRange) {
          state = 'combat';
          if (now - lastAttackTime >= human.attackCooldown * 1000) {
            lastAttackTime = now;

            const aliveMembers = targetSquad.members.filter((m) => m.isAlive);
            const victim = aliveMembers[Math.floor(Math.random() * aliveMembers.length)];
            let appliedDamage = human.damage;
            if (victim && victim.armorId) {
              appliedDamage = Math.max(
                1,
                Math.round(human.damage * (1 - getArmorDefinition(victim.armorId).damageReduction))
              );
            }

            if (victim) {
              victim.currentHp = Math.max(0, victim.currentHp - appliedDamage);
              if (victim.currentHp <= 0) victim.isAlive = false;
              recomputeSquadHealth(targetSquad);

              settlementNotifications.push({
                title: 'UNDER RIVAL FIRE',
                desc: `${human.factionName} defenders shot ${victim.name} of ${targetSquad.name}!`,
                type: 'warn',
              });

              // Hostile muzzle flash + tracer + damage number
              newVisualFx.push({
                id: `rival-tracer-${human.id}-${now}`,
                type: 'bullet_tracer',
                startX: x,
                startY: 1.1,
                startZ: z,
                endX: targetSquad.x,
                endY: 1.0,
                endZ: targetSquad.z,
                createdAt: now,
                durationMs: 120,
              });
              newVisualFx.push({
                id: `rival-dmg-${targetSquad.squadId}-${now}`,
                type: 'damage_number',
                startX: targetSquad.x,
                startY: 2.2,
                startZ: targetSquad.z,
                text: `-${appliedDamage}`,
                color: '#fb923c',
                createdAt: now,
                durationMs: 800,
              });

              soundService.playGunfire(false);
            }

            // §5.2 ransom: a squad overpowered by a Hideout is captured, not killed.
            if (targetSquad.currentHp <= 0 && !capturedSquadIds.includes(targetSquad.squadId)) {
              capturedSquadIds.push(targetSquad.squadId);
              settlementNotifications.push({
                title: 'SQUAD CAPTURED',
                desc: `${targetSquad.name} was overpowered by ${human.factionName}. They are demanding a ransom for its return!`,
                type: 'warn',
              });
            }
          }
        } else {
          // Close to weapon range — route around walls/fences and buildings.
          // Rival defenders, like the infected, cannot pass through gates.
          const stepRes = stepAlongPath(
            pathGrid,
            pathState,
            x,
            z,
            targetSquad.x,
            targetSquad.z,
            human.speed,
            effectiveDelta,
            2.0,
            { gatesOpen: false, wallsImpassable: true }
          );
          x = stepRes.x;
          z = stepRes.z;
          rotation = stepRes.rotation;
          pathState = stepRes.state;
          state = stepRes.arrived ? 'combat' : 'moving';
        }
      } else if (targetBuilding) {
        targetBuildingId = targetBuilding.buildingId;
        targetSquadId = null;
        const buildingDistance = Math.hypot(targetBuilding.position.x - x, targetBuilding.position.z - z);
        if (buildingDistance <= 15) {
          state = 'combat';
          if (now - lastAttackTime >= human.attackCooldown * 1000) {
            lastAttackTime = now;
            targetBuilding.currentDurability = Math.max(0, targetBuilding.currentDurability - human.damage);
            settlementNotifications.push({ title: 'HOSTILE SIEGE', desc: `${human.factionName} damaged ${targetBuilding.name}.`, type: 'warn' });
            newVisualFx.push({ id: `rival-siege-${human.id}-${now}`, type: 'building_impact', startX: targetBuilding.position.x, startY: 2, startZ: targetBuilding.position.z, text: `-${human.damage} SIEGE`, color: '#fb923c', isSiege: true, createdAt: now, durationMs: 800 });
          }
        } else {
          const stepRes = stepAlongPath(pathGrid, pathState, x, z, targetBuilding.position.x, targetBuilding.position.z, human.speed, effectiveDelta, 2.0, { gatesOpen: false, wallsImpassable: true });
          x = stepRes.x; z = stepRes.z; rotation = stepRes.rotation; pathState = stepRes.state; state = stepRes.arrived ? 'combat' : 'moving';
        }
      } else {
        targetSquadId = null;
        targetBuildingId = null;
        // Return to guard anchor when no squad is near — also routed.
        const homeDist = Math.hypot(human.homeX - x, human.homeZ - z);
        if (homeDist > 24) {
          const stepRes = stepAlongPath(
            pathGrid,
            pathState,
            x,
            z,
            human.homeX,
            human.homeZ,
            human.speed,
            effectiveDelta,
            2.0,
            { gatesOpen: false, wallsImpassable: true }
          );
          x = stepRes.x;
          z = stepRes.z;
          rotation = stepRes.rotation;
          pathState = stepRes.state;
          state = stepRes.arrived ? 'guarding' : 'moving';
        } else {
          state = 'guarding';
        }
      }

      return { ...human, x, z, rotation, state, targetSquadId, targetBuildingId, lastAttackTime, pathState };
    })
    .filter((h) => h.state !== 'dead');

  // 4. Dropped equipment pickup (§4.3) — squads within 3m auto-equip dropped gear
  const remainingDrops: DroppedItem[] = [];
  for (const item of droppedItems) {
    let remainingItem = { ...item };
    for (const sq of caredSquads) {
      if (sq.currentHp <= 0) continue;
      if (Math.hypot(sq.x - remainingItem.x, sq.z - remainingItem.z) > 3.0) continue;
      const alive = sq.members.filter((m) => m.isAlive);

      if (remainingItem.weaponId && remainingItem.weaponId !== 'knife') {
        const target =
          alive.find((m) => m.weaponId === 'knife') ||
          alive.find(
            (m) => getWeaponDefinition(m.weaponId).tier < getWeaponDefinition(remainingItem.weaponId).tier
          );
        if (target) {
          target.weaponId = remainingItem.weaponId;
          recomputeSquadStats(sq);
          settlementNotifications.push({
            title: 'EQUIPMENT RECOVERED',
            desc: `${target.name} of ${sq.name} recovered ${getWeaponDefinition(remainingItem.weaponId).name} from the field.`,
            type: 'info',
          });
          remainingItem.weaponId = null;
        }
      }

      if (remainingItem.armorId) {
        const target = alive.find((m) => !m.armorId);
        if (target) {
          target.armorId = remainingItem.armorId;
          settlementNotifications.push({
            title: 'ARMOR RECOVERED',
            desc: `${target.name} of ${sq.name} recovered ${getArmorDefinition(remainingItem.armorId).name} from the field.`,
            type: 'info',
          });
          remainingItem.armorId = null;
        }
      }

      if (!remainingItem.weaponId && !remainingItem.armorId) break;
    }
    if (remainingItem.weaponId || remainingItem.armorId) {
      remainingDrops.push(remainingItem);
    }
  }

  // 5. Manned Defensive Towers & Gates Perimeter Engagement
  // "Towers do nothing without being manned but will always be manned by one worker even at night by default."
  // "When alarm is active, workers move to any owned gates/towers and man them."
  // Structures are classified by their explicit §7.1 flags (guardable /
  // weaponMountable / allowsFriendlyPassage), never by the type-id string.
  const defensiveStructures: {
    id: string | number;
    x: number;
    z: number;
    name: string;
    isTower: boolean;
    isGate: boolean;
    /** Declared §7.1 engagement range (m) from the facility's own def — the
     *  combat sim honours it instead of a hardcoded tower range. Absent on
     *  gates/legacy data, which fall back to the gate default below. */
    rangeM?: number;
    weaponId?: import('../types/combat').WeaponItemId;
    ammoPerShot: number;
    assignedWorkers: number;
  }[] = [];
  
  if (adaptedBuildings) {
    for (const [id, bldg] of adaptedBuildings.entries()) {
      const def = getCanonicalDefenseDef(bldg.typeId);
      // §IFZ: only mannable defences engage — a tower (weaponMountable) or a
      // guarded gate (guardable + allowsFriendlyPassage). Passive barriers —
      // walls, fences, barbed wire, floodlights — are never firing positions.
      if (!def || !(def.weaponMountable || (def.guardable && def.allowsFriendlyPassage))) continue;
      const isTower = !!def.weaponMountable;
      const isGate = !!def.allowsFriendlyPassage && !isTower;
      defensiveStructures.push({
        id,
        x: bldg.position.x,
        z: bldg.position.z,
        name: bldg.name || (isTower ? 'Watchtower' : 'Fortified Gate'),
        isTower,
        isGate,
        rangeM: def?.defenceProperties?.attackRangeM,
        weaponId: bldg.equippedWeaponId,
        ammoPerShot: bldg.ammoPerShot || 1,
        assignedWorkers: bldg.assignedWorkers || 0,
      });
    }
  }

  if (settlement?.freestandingBuildings) {
    for (const fs of settlement.freestandingBuildings) {
      const def = getCanonicalDefenseDef(fs.typeId);
      if (!def || !(def.weaponMountable || (def.guardable && def.allowsFriendlyPassage))) continue;
      const isTower = !!def.weaponMountable;
      const isGate = !!def.allowsFriendlyPassage && !isTower;
      defensiveStructures.push({
        id: String(fs.buildingId),
        x: fs.position.x,
        z: fs.position.z,
        name: isTower ? 'Watchtower' : 'Defense Gate',
        isTower,
        isGate,
        rangeM: def?.defenceProperties?.attackRangeM,
        weaponId: fs.equippedWeaponId,
        ammoPerShot: fs.ammoPerShot || 1,
        assignedWorkers: fs.assignedWorkers || 0,
      });
    }
  }

  // Defensive structures only operate when they have an actual assigned guard.
  // Colony population elsewhere is not sufficient to man every tower.
  if (defensiveStructures.length > 0) {
    const fireIntervalSec = alarmActive ? 1.2 : 2.0;
    // Legacy fallback when a mannable structure declares no §7.1 range.
    const defaultTowerRange = (hasFloodlightTech ? 65 : 50) * (alarmActive ? 1.2 : 1.0);
    const gateRange = 35 * (alarmActive ? 1.2 : 1.0);

    for (const struct of defensiveStructures) {
      if (struct.assignedWorkers <= 0) continue;
      // Gates only actively shoot when manned via alarm or automated turret tech
      if (struct.isGate && !alarmActive && !hasTurretsTech) continue;

      // §7.1: honour each tower's declared attack range (120m wooden, 160m
      // metal, 200m fortified) instead of a hardcoded 50/65m for every tower.
      const range = struct.isTower
        ? (struct.rangeM ?? defaultTowerRange) * (alarmActive ? 1.2 : 1.0)
        : gateRange;
      
      // Find nearest living hostile zombie within range
      let closestZombie: ZombieUnit | null = null;
      let minZombieDist = range;

      for (const z of updatedZombies) {
        if (z.currentHp <= 0 || z.state === 'dead') continue;
        const d = Math.hypot(z.x - struct.x, z.z - struct.z);
        if (d < minZombieDist) {
          minZombieDist = d;
          closestZombie = z;
        }
      }

      if (closestZombie) {
        // Deterministic firing interval based on time and structure ID hash
        const hashSeed = typeof struct.id === 'string' ? struct.id.charCodeAt(0) : Number(struct.id);
        const tickBucket = Math.floor((clock.totalElapsedSeconds + (hashSeed % 10) * 0.2) / fireIntervalSec);
        const prevTickBucket = Math.floor((clock.totalElapsedSeconds - effectiveDelta + (hashSeed % 10) * 0.2) / fireIntervalSec);

        if (tickBucket > prevTickBucket) {
          // Fire shot from manned tower / gate
          // §IFZ bow fallback: a tower with NO mounted FIREARM (unarmed, or
          // carrying only a melee weapon) fires a bow instead — INFINITE
          // ammunition. No ammo check, no ammo deduction; only real firearms
          // draw from the shared pool. Gates keep their built-in 20 dmg shot.
          const weapon = struct.weaponId ? getWeaponDefinition(struct.weaponId) : null;
          const isFirearm = !!weapon && weapon.ammoPerVolley > 0;
          const ammoCost = weapon?.ammoPerVolley || struct.ammoPerShot;
          if (struct.isTower && isFirearm && ammoAvailable < ammoCost) continue;
          const towerDamage = Math.round(
            (isFirearm ? weapon!.damage : struct.isTower ? WEAPON_CATALOG.bow.damage : 20) *
              (alarmActive ? 1.3 : 1.0) *
              (0.9 + Math.random() * 0.2)
          );
          if (struct.isTower && isFirearm) {
            ammoAvailable -= ammoCost;
            ammoConsumed += ammoCost;
          }
          closestZombie.currentHp = Math.max(0, closestZombie.currentHp - towerDamage);

          // SFX & Visual Tracers
          soundService.playGunfire(false);
          newVisualFx.push({
            id: `tower-flash-${struct.id}-${now}`,
            type: 'muzzle_flash',
            startX: struct.x,
            startY: struct.isTower ? 4.5 : 2.0,
            startZ: struct.z,
            createdAt: now,
            durationMs: 120,
          });

          newVisualFx.push({
            id: `tower-tracer-${struct.id}-${now}`,
            type: 'bullet_tracer',
            startX: struct.x,
            startY: struct.isTower ? 4.5 : 2.0,
            startZ: struct.z,
            endX: closestZombie.x,
            endY: 1.0,
            endZ: closestZombie.z,
            createdAt: now,
            durationMs: 140,
          });

          newVisualFx.push({
            id: `tower-dmg-${closestZombie.id}-${now}`,
            type: 'damage_number',
            startX: closestZombie.x,
            startY: 2.2,
            startZ: closestZombie.z,
            text: `-${towerDamage} (TOWER)`,
            color: '#38bdf8',
            createdAt: now,
            durationMs: 800,
          });

          const { event: noiseEvt, visualFx: ringFx } = emitNoiseEvent('gunfire', struct.x, struct.z, `${struct.name} Defense Fire`);
          activeNoiseEvents.push(noiseEvt);
          newVisualFx.push(ringFx);

          if (closestZombie.currentHp <= 0) {
            newVisualFx.push({
              id: `death-${closestZombie.id}-${now}`,
              type: 'zombie_death',
              startX: closestZombie.x,
              startY: 0.5,
              startZ: closestZombie.z,
              createdAt: now,
              durationMs: 1500,
            });
          }
        }
      }
    }
  }

  return {
    updatedZombies,
    updatedSquads: caredSquads,
    updatedAdaptedBuildings: adaptedBuildings,
    activeNoiseEvents,
    newVisualFx,
    settlementNotifications,
    newInfections,
    fallenHeroEvents,
    droppedItems: remainingDrops,
    updatedHostileHumans,
    capturedSquadIds,
    ammoConsumed,
  };
}

// ==========================================
// 7. Building Repair & Material Cost Logic (§5)
// ==========================================

export function calculateBuildingRepairCost(building: AdaptedBuilding): {
  woodCost: number;
  metalCost: number;
  bricksCost: number;
  canRepair: boolean;
  missingHp: number;
} {
  const missingHp = building.maxDurability - building.currentDurability;
  if (missingHp <= 0) {
    return { woodCost: 0, metalCost: 0, bricksCost: 0, canRepair: false, missingHp: 0 };
  }

  const damageRatio = missingHp / building.maxDurability;
  const woodCost = Math.max(2, Math.round(15 * damageRatio));
  const metalCost = Math.max(1, Math.round(10 * damageRatio));
  const bricksCost = Math.max(1, Math.round(8 * damageRatio));

  return {
    woodCost,
    metalCost,
    bricksCost,
    canRepair: true,
    missingHp,
  };
}

export function repairBuilding(
  settlement: SettlementState,
  buildingId: string | number
): { success: boolean; newState: SettlementState; error?: string; repairedHp?: number } {
  const adapted = getPrimaryAdaptedEntry(settlement.adaptedBuildings, buildingId);
  const freestanding = settlement.freestandingBuildings.find((building) => building.buildingId === buildingId);
  const target = adapted || freestanding;
  if (!target) {
    return { success: false, newState: settlement, error: 'Building not found.' };
  }

  const cost = calculateBuildingRepairCost(target);
  if (!cost.canRepair) {
    return { success: false, newState: settlement, error: 'Structure is already at 100% durability.' };
  }

  const stock = settlement.stockpile.materials;
  if (stock.wood < cost.woodCost || stock.metal < cost.metalCost || stock.bricks < cost.bricksCost) {
    return {
      success: false,
      newState: settlement,
      error: `Insufficient materials for repair. Required: ${cost.woodCost} Wood, ${cost.metalCost} Metal, ${cost.bricksCost} Bricks.`,
    };
  }

  // Deduct materials and create a worker-driven repair order. The structure
  // remains non-functional until the repair crew completes the work.
  const newStockpile = {
    ...settlement.stockpile,
    materials: {
      ...stock,
      wood: stock.wood - cost.woodCost,
      metal: stock.metal - cost.metalCost,
      bricks: stock.bricks - cost.bricksCost,
    },
  };

  const missingHp = cost.missingHp;
  const repairWorkRequired = Math.max(20, missingHp);
  const updatedBuilding: AdaptedBuilding = {
    ...target,
    isUnderRepair: true,
    repairProgress: 0,
    repairWorkRequired,
    repairWorkDone: 0,
  };

  const newAdapted = new Map(settlement.adaptedBuildings);
  const newFreestanding = [...settlement.freestandingBuildings];
  if (adapted) newAdapted.set(buildingId, updatedBuilding);
  else {
    const index = newFreestanding.findIndex((building) => building.buildingId === buildingId);
    if (index >= 0) newFreestanding[index] = updatedBuilding;
  }

  return {
    success: true,
    newState: {
      ...settlement,
      stockpile: newStockpile,
      adaptedBuildings: newAdapted,
      freestandingBuildings: newFreestanding,
    },
    repairedHp: cost.missingHp,
  };
}

/**
 * Player-facing tower armament workflow: moves a ranged weapon from the colony
 * armory into a weaponMountable structure (towers) or returns the mounted
 * weapon back to the armory. Mirrors squad-member assignment semantics — one
 * weapon, removed from the shared armory while equipped. Only weapons that can
 * actually fire (ammoPerVolley > 0) can be mounted; melee is rejected.
 */
export function equipBuildingWeapon(
  settlement: SettlementState,
  buildingId: string | number,
  weaponId: WeaponItemId | null
): { success: boolean; newState: SettlementState; error?: string } {
  const freestandingIdx = settlement.freestandingBuildings.findIndex(
    (f) => String(f.buildingId) === String(buildingId)
  );
  const freestanding =
    freestandingIdx >= 0 ? settlement.freestandingBuildings[freestandingIdx] : null;
  const adapted =
    freestanding || getPrimaryAdaptedEntry(settlement.adaptedBuildings, buildingId);
  const building = adapted;
  if (!building) {
    return { success: false, newState: settlement, error: 'Structure not found.' };
  }

  const def = getCanonicalDefenseDef(building.typeId);
  if (!def?.weaponMountable) {
    return {
      success: false,
      newState: settlement,
      error: 'This structure cannot mount a weapon — only towers can be armed.',
    };
  }
  if (building.constructionStatus !== 'completed') {
    return {
      success: false,
      newState: settlement,
      error: 'The tower must be fully built before a weapon can be mounted.',
    };
  }

  const armory = settlement.armory || { weapons: [], armor: [] };
  const equipped = building.equippedWeaponId;

  if (weaponId === null) {
    // Unequip: return the mounted weapon to the armory stockpile.
    if (!equipped) {
      return { success: false, newState: settlement, error: 'No weapon is mounted on this tower.' };
    }
    const updated: AdaptedBuilding = { ...building, equippedWeaponId: undefined };
    return {
      success: true,
      newState: {
        ...settlement,
        armory: { ...armory, weapons: [...armory.weapons, equipped] },
        ...applyBuildingUpdate(settlement, updated),
      },
    };
  }

  const weaponDef = getWeaponDefinition(weaponId);
  if (!weaponDef || weaponDef.ammoPerVolley <= 0) {
    return { success: false, newState: settlement, error: 'Only ranged firearms can be mounted on a tower.' };
  }
  if (equipped === weaponId) {
    return { success: false, newState: settlement, error: 'This tower already carries that weapon.' };
  }
  if (!armory.weapons.includes(weaponId)) {
    return { success: false, newState: settlement, error: 'That weapon is not in the colony armory.' };
  }

  // Remove the chosen weapon from the armory; a previously mounted weapon goes back.
  const newWeapons = armory.weapons.filter((w) => w !== weaponId);
  if (equipped) newWeapons.push(equipped);
  const updated: AdaptedBuilding = { ...building, equippedWeaponId: weaponId };

  return {
    success: true,
    newState: {
      ...settlement,
      armory: { ...armory, weapons: newWeapons },
      ...applyBuildingUpdate(settlement, updated),
    },
  };
}

/** Internal: writes an updated building record back into whichever collection
 *  (freestanding or adapted) it came from. */
function applyBuildingUpdate(
  settlement: SettlementState,
  updated: AdaptedBuilding
): Pick<SettlementState, 'freestandingBuildings' | 'adaptedBuildings'> {
  const idx = settlement.freestandingBuildings.findIndex(
    (f) => String(f.buildingId) === String(updated.buildingId)
  );
  if (idx >= 0) {
    const list = [...settlement.freestandingBuildings];
    list[idx] = updated;
    return { freestandingBuildings: list, adaptedBuildings: settlement.adaptedBuildings };
  }
  const map = new Map(settlement.adaptedBuildings);
  const key =
    settlement.adaptedBuildings.has(updated.buildingId)
      ? updated.buildingId
      : (() => {
          for (const [k, v] of settlement.adaptedBuildings.entries()) {
            if (String(v.sourceBuildingId) === String(updated.buildingId)) return k;
          }
          return updated.buildingId;
        })();
  map.set(key, updated);
  return { freestandingBuildings: settlement.freestandingBuildings, adaptedBuildings: map };
}

// ==========================================
// 8. Building Search & Infestation Trigger (Prompt 5 + Phase 6)
// ==========================================

export function generateBuildingInfestation(bldg: BuildingPolygon): BuildingInfestation {
  const rand = Math.random();
  let threatTier: BuildingInfestation['threatTier'] = 'low';
  let shamblers = 2 + Math.floor(Math.random() * 3), runners = 0, brutes = 0;
  if (rand > 0.7) { threatTier='high'; shamblers=4+Math.floor(Math.random()*4); runners=2+Math.floor(Math.random()*2); brutes=Math.random()>0.5?1:0; }
  else if (rand > 0.35) { threatTier='medium'; shamblers=3+Math.floor(Math.random()*3); runners=1; }
  return { buildingId:bldg.id, buildingName:bldg.name||`Structure #${bldg.id}`, isInfested:true, isCleared:false, threatTier, zombieCount:shamblers+runners+brutes, shamblers, runners, brutes };
}

export function breachInfestedBuilding(
  infestation: BuildingInfestation,
  bldgPos: Point2D
): ZombieUnit[] {
  const spawned: ZombieUnit[] = [];

  for (let i = 0; i < infestation.shamblers; i++) {
    const ox = bldgPos.x + (Math.random() - 0.5) * 8;
    const oz = bldgPos.z + (Math.random() - 0.5) * 8;
    const zmb = createZombieUnit('shambler', ox, oz, 0, true);
    zmb.alertLevel = 2;
    zmb.state = 'chasing';
    spawned.push(zmb);
  }

  for (let i = 0; i < infestation.runners; i++) {
    const ox = bldgPos.x + (Math.random() - 0.5) * 8;
    const oz = bldgPos.z + (Math.random() - 0.5) * 8;
    const zmb = createZombieUnit('runner', ox, oz, 0, true);
    zmb.alertLevel = 2;
    zmb.state = 'chasing';
    spawned.push(zmb);
  }

  for (let i = 0; i < infestation.brutes; i++) {
    const ox = bldgPos.x + (Math.random() - 0.5) * 8;
    const oz = bldgPos.z + (Math.random() - 0.5) * 8;
    const zmb = createZombieUnit('brute', ox, oz, 0, true);
    zmb.alertLevel = 2;
    zmb.state = 'chasing';
    spawned.push(zmb);
  }

  return spawned;
}

// ==========================================
// 9. RTS Command Dispatchers & State Synchronization
// ==========================================

export function orderSquadMove(
  squads: TacticalSquadUnit[],
  squadId: string,
  pos: Point2D,
  targetBuildingId?: string | number | null,
  targetBuildingName?: string | null
): TacticalSquadUnit[] {
  return squads.map((s) => {
    if (s.squadId !== squadId) return s;
    return {
      ...s,
      manualOrder: true,
      holdHaul: false, // a fresh player order overrides a storage-full hold
      pendingFuelDeliveryVehicleId: null, // a fresh move order cancels a fuel delivery
      noPath: undefined, // a fresh order may open a new route
      targetPos: pos,
      targetBuildingId: targetBuildingId !== undefined ? targetBuildingId : null,
      targetBuildingName: targetBuildingName !== undefined ? targetBuildingName : null,
      searchProgress: 0,
      targetZombieId: null,
      state: 'moving',
    };
  });
}

export function orderSquadAttack(
  squads: TacticalSquadUnit[],
  squadId: string,
  zombieId: string,
  targetPos?: Point2D
): TacticalSquadUnit[] {
  return squads.map((s) => {
    if (s.squadId !== squadId) return s;
    return {
      ...s,
      manualOrder: true,
      holdHaul: false, // a fresh player order overrides a storage-full hold
      noPath: undefined, // a fresh order may open a new route
      targetZombieId: zombieId,
      targetPos: targetPos || s.targetPos,
      state: 'combat',
    };
  });
}

export function orderAllSquadsRecall(
  squads: TacticalSquadUnit[],
  hqPos: Point2D
): TacticalSquadUnit[] {
  return squads.map((s) => ({
    ...s,
    manualOrder: true,
    holdHaul: false, // a fresh player order overrides a storage-full hold
    pendingFuelDeliveryVehicleId: null, // a recall cancels a fuel delivery
    noPath: undefined, // a fresh order may open a new route
    targetPos: { x: hqPos.x, z: hqPos.z },
    targetZombieId: null,
    state: 'moving',
  }));
}

export function orderSquadRecall(
  squads: TacticalSquadUnit[],
  squadId: string,
  hqPos: Point2D
): TacticalSquadUnit[] {
  return squads.map((s) => {
    if (s.squadId !== squadId) return s;
    return {
      ...s,
      manualOrder: true,
      holdHaul: false, // a fresh player order overrides a storage-full hold
      pendingFuelDeliveryVehicleId: null, // a recall cancels a fuel delivery
      noPath: undefined, // a fresh order may open a new route
      targetPos: { x: hqPos.x, z: hqPos.z },
      targetZombieId: null,
      state: 'moving',
    };
  });
}

/**
 * Synchronize TacticalSquadUnits with settlement.squads
 */
export function syncTacticalSquadUnits(
  settlement: SettlementState,
  existingCombatSquads: TacticalSquadUnit[]
): TacticalSquadUnit[] {
  const hqPos = getPrimaryHQ(settlement)?.center || { x: 0, z: 0 };
  const existingMap = new Map<string, TacticalSquadUnit>(
    existingCombatSquads.map((s) => [s.squadId, s])
  );

  // Captured squads (§5.2) are held by a rival Hideout — no live tactical unit.
  return settlement.squads
    .filter((sq) => sq.status !== 'captured')
    .map((sq, index) => {
    // An empty leaderId marks a leaderless squad: all members are generic
    // recruits with no named survivor at the head. The tactical unit still gets
    // a nominal leader name/tier so stats code keeps working, but no leader
    // member is generated.
    const hasLeader = !!sq.leaderId;
    const leaderSurvivor = sq.leaderId
      ? settlement.namedSurvivors.find((ns) => ns.id === sq.leaderId)
      : undefined;
    const leaderName = leaderSurvivor ? leaderSurvivor.name : 'Field Leader';
    const leaderCombatTier: StatTier = leaderSurvivor ? leaderSurvivor.stats.combat : 'novice';

    const existing = existingMap.get(sq.id);
    if (existing) {
      // Keep real-time position/health and update composition. Refresh the member
      // roster to match settlement composition while preserving each unit's HP & gear.
      const desired = buildSquadMembers(sq.id, leaderName, sq.generalCount, hasLeader);
      const preserved = desired.map((d) => {
        const prev = existing.members.find(
          (m) => m.id === d.id || (m.isLeader && d.isLeader)
        );
        return prev
          ? {
              ...d,
              currentHp: Math.min(d.maxHp, prev.currentHp),
              weaponId: prev.weaponId,
              armorId: prev.armorId,
              isAlive: prev.isAlive,
              // Newly-generated members carry a fresh random face; existing members
              // keep the portrait assigned when the squad was first created.
              faceUrl: prev.faceUrl || d.faceUrl,
            }
          : d;
      });
      const updated = {
        ...existing,
        name: sq.name,
        leaderName,
        leaderCombatTier,
        generalCount: sq.generalCount,
        maxHp: 100 + sq.generalCount * 50,
        members: preserved,
      };
      return recomputeSquadHealth(recomputeSquadStats(updated));
    }

    // New squad spawned near HQ
    const spawnAngle = (index / Math.max(1, settlement.squads.length)) * Math.PI * 2;
    const spawnPos: Point2D = {
      x: hqPos.x + Math.cos(spawnAngle) * 12,
      z: hqPos.z + Math.sin(spawnAngle) * 12,
    };

    return createTacticalSquadUnit(
      sq.id,
      sq.name,
      sq.leaderId,
      leaderName,
      leaderCombatTier,
      sq.generalCount,
      spawnPos,
      hasLeader,
      sq.trainingTier ?? 0
    );
  });
}

