import { BuildingCategory, BuildingPolygon, Point2D } from '../types/map';
import { StatTier } from '../types/population';
import { DeathCause, SurvivorInfection } from '../types/infection';
import { createSurvivorInfection, rollBiteChance } from './infectionService';
import {
  ARMOR_CATALOG,
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
  WEAPON_CATALOG,
  WeaponItemId,
  ZombieUnit,
  ZombieVariant,
  pickSurvivorFaceUrl,
} from '../types/combat';
import { AdaptedBuilding, SettlementState } from '../types/settlement';
import { isResearchUnlocked } from './researchService';
import { WEATHER_CONDITIONS, getZombieActivityModifiers } from './weatherService';
import { soundService } from './soundService';
import { PathGrid, stepAlongPath } from './pathfindingService';

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
    const w = WEAPON_CATALOG[m.weaponId];
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
  hasLeader = true
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
  };

  return recomputeSquadHealth(recomputeSquadStats(base));
}

// ==========================================
// 4. Escalating Horde Generator (§5.1, §6.1)
// ==========================================

export function generateHordeWave(
  day: number,
  centerPos: Point2D,
  radius: number = 180,
  isNight: boolean = true
): ZombieUnit[] {
  const zombies: ZombieUnit[] = [];

  // Horde scale formula based on in-game day
  const totalCount = Math.min(40, Math.floor(4 + day * 3.5 + Math.random() * 4));

  // Variant distribution
  let runnerRatio = 0.15;
  let bruteCount = 0;

  if (day >= 2) runnerRatio = 0.25;
  if (day >= 3) bruteCount = 1;
  if (day >= 5) {
    runnerRatio = 0.35;
    bruteCount = Math.floor(1 + (day - 3) * 0.5);
  }

  // Spawn around perimeter angle
  const baseAngle = Math.random() * Math.PI * 2;
  const spread = Math.PI * 0.7; // Come from an approach vector

  // 1. Spawn Brutes
  for (let i = 0; i < bruteCount; i++) {
    const angle = baseAngle + (Math.random() - 0.5) * spread;
    const dist = radius * (0.85 + Math.random() * 0.25);
    const x = centerPos.x + Math.cos(angle) * dist;
    const z = centerPos.z + Math.sin(angle) * dist;
    zombies.push(createZombieUnit('brute', x, z, 0, isNight));
  }

  // 2. Spawn remaining mix of Runners and Shamblers
  const remaining = totalCount - bruteCount;
  for (let i = 0; i < remaining; i++) {
    const angle = baseAngle + (Math.random() - 0.5) * spread;
    const dist = radius * (0.8 + Math.random() * 0.3);
    const x = centerPos.x + Math.cos(angle) * dist;
    const z = centerPos.z + Math.sin(angle) * dist;

    const variant: ZombieVariant = Math.random() < runnerRatio ? 'runner' : 'shambler';
    zombies.push(createZombieUnit(variant, x, z, 0, isNight));
  }

  return zombies;
}

/**
 * Generate initial ambient dormant zombie clusters across the map
 */
export function generateAmbientMapZombies(
  buildings: BuildingPolygon[],
  hqPos: Point2D | null,
  day: number = 1
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
  settlementNotifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' }[];
  newInfections: SurvivorInfection[];
  fallenHeroEvents: { survivorId: string; cause: DeathCause; location: string }[];
  droppedItems: DroppedItem[];
  // §5.2 rival factions: armed hostile-human occupants of Hideouts, plus any
  // player squads they overpowered this tick (captured for ransom, not killed).
  updatedHostileHumans: HostileHumanUnit[];
  capturedSquadIds: string[];
  ammoConsumed: number;
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
  const settlementNotifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' }[] = [];
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

  // Collect active floodlight emitters at night (§6.1, §10 Light Deterrent Mechanic)
  const lightEmitters: { x: number; z: number; radius: number; label: string }[] = [];
  if (clock.isNight) {
    // 1. Any functional floodlight tower
    for (const bldg of adaptedBuildings.values()) {
      if (bldg.constructionStatus === 'completed') {
        if (bldg.typeId === 'floodlight_tower') {
          lightEmitters.push({ x: bldg.position.x, z: bldg.position.z, radius: 80, label: bldg.name });
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
        if (free.constructionStatus === 'completed') {
          if (free.typeId === 'floodlight_tower') {
            lightEmitters.push({ x: free.position.x, z: free.position.z, radius: 80, label: free.name });
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

  // 2. Update Squad Units (RTS Movement, Target Acquisition, Firing)
  const updatedSquads = squads.map((squad) => {
    if (squad.currentHp <= 0) {
      return { ...squad, state: 'downed' as const };
    }

    let { x, z, y, rotation, currentHp, state, manualOrder, targetPos, targetZombieId } = squad;

    // Check if in safe zone near HQ or Infirmary to regenerate health
    let inSafeZone = false;
    if (hqPos && Math.hypot(x - hqPos.x, z - hqPos.z) < 35) {
      inSafeZone = true;
      // Heal each alive member individually (+6 HP/s per unit in base)
      for (const m of squad.members) {
        if (m.isAlive && m.currentHp < m.maxHp) {
          m.currentHp = Math.min(m.maxHp, m.currentHp + effectiveDelta * 6);
        }
      }
      currentHp = squad.members.reduce((acc, m) => (m.isAlive ? acc + m.currentHp : acc), 0);
    }

    // Determine squad weapon capabilities:
    // Check if squad has ranged weapons (pistol, shotgun, hunting_rifle, assault_rifle)
    const aliveMembers = squad.members.filter((m) => m.isAlive);
    const rangedMembers = aliveMembers.filter((m) => WEAPON_CATALOG[m.weaponId].ammoPerVolley > 0);
    const squadAmmoPerVolley = rangedMembers.reduce((sum, m) => sum + WEAPON_CATALOG[m.weaponId].ammoPerVolley, 0);
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
      // Execute path movement towards destination
      const step = stepAlongPath(
        pathGrid,
        squad.pathState,
        x,
        z,
        targetPos.x,
        targetPos.z,
        squad.moveSpeed,
        effectiveDelta,
        1.2
      );
      x = step.x;
      z = step.z;
      rotation = step.rotation;
      squad.pathState = step.state;

      if (!step.arrived) {
        state = isReturningOrRetreating ? state : 'moving';
      } else {
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
      // General pathing
      const step = stepAlongPath(
        pathGrid,
        squad.pathState,
        x,
        z,
        targetPos.x,
        targetPos.z,
        squad.moveSpeed,
        effectiveDelta,
        1.2
      );
      x = step.x;
      z = step.z;
      rotation = step.rotation;
      squad.pathState = step.state;

      if (!step.arrived) {
        state = 'moving';
      } else {
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
            const meleeBase = aliveMembers.reduce((sum, m) => sum + Math.max(10, WEAPON_CATALOG[m.weaponId].damage), 0) * moraleCombatMult;
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

      // A. Sound Detection Check (§5, §6.1, §9)
      // Check if any active noise event is within hearing radius
      for (const noise of activeNoiseEvents) {
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

      for (const sq of updatedSquads) {
        if (sq.currentHp <= 0) continue;
        const d = Math.hypot(sq.x - x, sq.z - z);
        if (d <= sightRange && d < squadDist) {
          squadDist = d;
          targetSquad = sq;
        }
      }

      // If already aggroed on a squad, continue giving chase as squad moves/retreats
      if (!targetSquad && targetUnitId) {
        const existingTarget = updatedSquads.find((sq) => sq.squadId === targetUnitId && sq.currentHp > 0);
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
              const armor = ARMOR_CATALOG[victim.armorId];
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
        // C. Target nearby building / barricade / HQ if active at night
        if (isNight && !targetPos && adaptedBuildings.size > 0) {
          // Find nearest adapted building
          let nearestBldg: AdaptedBuilding | null = null;
          let minBldgDist = Infinity;
          for (const bldg of adaptedBuildings.values()) {
            const d = Math.hypot(bldg.position.x - x, bldg.position.z - z);
            if (d < minBldgDist) {
              minBldgDist = d;
              nearestBldg = bldg;
            }
          }

          if (nearestBldg && minBldgDist < 120) {
            targetBuildingId = nearestBldg.buildingId;
            targetPos = { x: nearestBldg.position.x, z: nearestBldg.position.z };
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

                nearestBldg.currentDurability = Math.max(0, nearestBldg.currentDurability - siegeDmg);

                // Sound effect for siege hit
                soundService.playZombieSound(zombie.variant);
                soundService.playMelee(false);

                newVisualFx.push({
                  id: `bldg-hit-${nearestBldg.buildingId}-${now}`,
                  type: 'building_impact',
                  startX: nearestBldg.position.x,
                  startY: 3.0,
                  startZ: nearestBldg.position.z,
                  text: `-${siegeDmg} SIEGE`,
                  color: '#f97316',
                  isSiege: true,
                  createdAt: now,
                  durationMs: 900,
                });

                if (nearestBldg.currentDurability <= 0) {
                  settlementNotifications.push({
                    title: 'STRUCTURE BREACHED',
                    desc: `${nearestBldg.name} durability breached by infected assault!`,
                    type: 'warn',
                  });
                }
              }
            }
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
      } else if (!isDormant && Math.random() < 0.02) {
        // Random wandering nudge
        const wanderAngle = Math.random() * Math.PI * 2;
        targetPos = { x: x + Math.cos(wanderAngle) * 12, z: z + Math.sin(wanderAngle) * 12 };
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

      let { x, z, rotation, state, targetSquadId, lastAttackTime, pathState } = human;

      // Closest living squad
      let targetSquad: TacticalSquadUnit | null = null;
      let targetDist = Infinity;
      for (const sq of updatedSquads) {
        if (sq.currentHp <= 0) continue;
        const d = Math.hypot(sq.x - x, sq.z - z);
        if (d < targetDist) {
          targetDist = d;
          targetSquad = sq;
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
                Math.round(human.damage * (1 - ARMOR_CATALOG[victim.armorId].damageReduction))
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
      } else {
        targetSquadId = null;
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

      return { ...human, x, z, rotation, state, targetSquadId, lastAttackTime, pathState };
    })
    .filter((h) => h.state !== 'dead');

  // 4. Dropped equipment pickup (§4.3) — squads within 3m auto-equip dropped gear
  const remainingDrops: DroppedItem[] = [];
  for (const item of droppedItems) {
    let remainingItem = { ...item };
    for (const sq of updatedSquads) {
      if (sq.currentHp <= 0) continue;
      if (Math.hypot(sq.x - remainingItem.x, sq.z - remainingItem.z) > 3.0) continue;
      const alive = sq.members.filter((m) => m.isAlive);

      if (remainingItem.weaponId && remainingItem.weaponId !== 'knife') {
        const target =
          alive.find((m) => m.weaponId === 'knife') ||
          alive.find(
            (m) => WEAPON_CATALOG[m.weaponId].tier < WEAPON_CATALOG[remainingItem.weaponId as WeaponItemId].tier
          );
        if (target) {
          target.weaponId = remainingItem.weaponId;
          recomputeSquadStats(sq);
          settlementNotifications.push({
            title: 'EQUIPMENT RECOVERED',
            desc: `${target.name} of ${sq.name} recovered ${WEAPON_CATALOG[remainingItem.weaponId].name} from the field.`,
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
            desc: `${target.name} of ${sq.name} recovered ${ARMOR_CATALOG[remainingItem.armorId].name} from the field.`,
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
  const defensiveStructures: { id: string | number; x: number; z: number; name: string; isTower: boolean; isGate: boolean }[] = [];
  
  if (adaptedBuildings) {
    for (const [id, bldg] of adaptedBuildings.entries()) {
      const type = (bldg.typeId || '').toLowerCase();
      const isTower = type.includes('tower') || type.includes('watchtower') || type.includes('spotlight');
      const isGate = type.includes('gate') || type.includes('palisade') || type.includes('bastion');
      if (isTower || isGate) {
        defensiveStructures.push({
          id,
          x: bldg.position.x,
          z: bldg.position.z,
          name: bldg.name || (isTower ? 'Watchtower' : 'Fortified Gate'),
          isTower,
          isGate,
        });
      }
    }
  }

  if (settlement?.freestandingBuildings) {
    for (const fs of settlement.freestandingBuildings) {
      const type = (fs.typeId || '').toLowerCase();
      const isTower = type.includes('tower') || type.includes('watchtower') || type.includes('spotlight');
      const isGate = type.includes('gate') || type.includes('palisade') || type.includes('bastion');
      if (isTower || isGate) {
        defensiveStructures.push({
          id: String(fs.buildingId),
          x: fs.position.x,
          z: fs.position.z,
          name: isTower ? 'Watchtower' : 'Defense Gate',
          isTower,
          isGate,
        });
      }
    }
  }

  // Available worker check: Towers are manned by 1 worker by default.
  // Gates are manned when alarm is raised or workers are present.
  const popCount = settlement?.generalPopulation?.total ?? 10;
  const hasAvailableWorkers = popCount > 0;

  if (defensiveStructures.length > 0 && hasAvailableWorkers) {
    const fireIntervalSec = alarmActive ? 1.2 : 2.0;
    const towerRange = (hasFloodlightTech ? 65 : 50) * (alarmActive ? 1.2 : 1.0);
    const gateRange = 35 * (alarmActive ? 1.2 : 1.0);

    for (const struct of defensiveStructures) {
      // Gates only actively shoot when manned via alarm or automated turret tech
      if (struct.isGate && !alarmActive && !hasTurretsTech) continue;

      const range = struct.isTower ? towerRange : gateRange;
      
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
          const towerDamage = Math.round((struct.isTower ? 28 : 20) * (alarmActive ? 1.3 : 1.0) * (0.9 + Math.random() * 0.2));
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
    updatedSquads,
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
  const adapted = settlement.adaptedBuildings.get(buildingId);
  if (!adapted) {
    return { success: false, newState: settlement, error: 'Building not found.' };
  }

  const cost = calculateBuildingRepairCost(adapted);
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

  // Deduct materials
  const newStockpile = {
    ...settlement.stockpile,
    materials: {
      ...stock,
      wood: stock.wood - cost.woodCost,
      metal: stock.metal - cost.metalCost,
      bricks: stock.bricks - cost.bricksCost,
    },
  };

  const updatedBuilding: AdaptedBuilding = {
    ...adapted,
    currentDurability: adapted.maxDurability,
  };

  const newAdapted = new Map(settlement.adaptedBuildings);
  newAdapted.set(buildingId, updatedBuilding);

  return {
    success: true,
    newState: {
      ...settlement,
      stockpile: newStockpile,
      adaptedBuildings: newAdapted,
    },
    repairedHp: cost.missingHp,
  };
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
      targetZombieId: zombieId,
      targetPos: targetPos || s.targetPos,
      state: 'combat',
    };
  });
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
  const hqPos = settlement.hq?.center || { x: 0, z: 0 };
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
      hasLeader
    );
  });
}

