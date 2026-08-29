import {
  HostileHumanUnit,
  TacticalSquadUnit,
  WEAPON_CATALOG,
  ZombieLair,
  ZombieUnit,
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

export function generateZombieLairs(
  buildings: BuildingPolygon[],
  hqBuildingId: string | number | null = null
): Map<string | number, ZombieLair> {
  const map = new Map<string | number, ZombieLair>();
  if (!buildings || buildings.length === 0) return map;

  const candidates = buildings.filter(
    (b) => String(b.id) !== String(hqBuildingId) && (b.levels || 1) >= 1
  );
  if (candidates.length === 0) return map;

  const shuffled = [...candidates].sort(() => 0.5 - Math.random());
  const count = Math.min(shuffled.length, Math.random() < 0.7 ? 1 : 2);

  for (let i = 0; i < count; i++) {
    const bldg = shuffled[i];
    const threatTier: ZombieLair['threatTier'] =
      bldg.levels >= 3 ? 'high' : bldg.levels >= 2 ? 'medium' : 'low';
    const occupantCount = 14 + Math.floor(Math.random() * 16); // standing garrison

    map.set(bldg.id, {
      id: `lair_${bldg.id}`,
      buildingId: bldg.id,
      buildingName: bldg.name || `Structure #${bldg.id}`,
      isDiscovered: false,
      isCleared: false,
      occupantCount,
      initialOccupantCount: occupantCount,
      spawnIntervalSec: 40,
      lastSpawnAt: Date.now(),
      escalation: 0,
      escalationAccumSec: 0,
      threatTier,
    });
  }

  return map;
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
    const weapon = WEAPON_CATALOG[weaponId];

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

const LAIR_ASSAULT_RADIUS = 26;
const LAIR_ESCALATION_INTERVAL_SEC = 120;

/**
 * Advances every Lair: persistent day/night spawning, escalation while uncleared,
 * and garrison depletion when a squad stands inside the assault radius.
 */
export function tickZombieLairs(
  lairs: Map<string | number, ZombieLair>,
  squads: TacticalSquadUnit[],
  buildings: BuildingPolygon[],
  now: number,
  deltaSec: number
): LairTickResult {
  const updatedLairs = new Map(lairs);
  const spawnedZombies: ZombieUnit[] = [];
  const clearedLairs: ZombieLair[] = [];
  const notifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' }[] = [];

  const buildingCenters = new Map<string, Point2D>();
  for (const b of buildings) buildingCenters.set(String(b.id), b.center);

  for (const [key, lair] of updatedLairs.entries()) {
    if (lair.isCleared) continue;

    const center = buildingCenters.get(String(lair.buildingId)) || { x: 0, z: 0 };

    // A. Escalation — the longer a Lair stands, the worse the surrounding area gets.
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

    // B. Persistent spawning (day and night) for as long as the Lair stands.
    const intervalSec = Math.max(15, lair.spawnIntervalSec - escalation * 4);
    let lastSpawnAt = lair.lastSpawnAt;
    if (now - lastSpawnAt >= intervalSec * 1000) {
      lastSpawnAt = now;
      const groupSize = Math.min(8, 2 + escalation);
      for (let i = 0; i < groupSize; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 8 + Math.random() * 12;
        const variant = Math.random() < 0.2 ? 'runner' : 'shambler';
        const zmb = createZombieUnit(
          variant,
          center.x + Math.cos(angle) * dist,
          center.z + Math.sin(angle) * dist,
          0,
          true // active day & night
        );
        zmb.alertLevel = 1; // stays active through the day (§6.1 weather gate)
        zmb.isDormant = false;
        spawnedZombies.push(zmb);
      }
    }

    // C. Deliberate clearance — a deployed squad standing in the assault radius
    //    depletes the garrison through sustained combat (§5).
    let occupantCount = lair.occupantCount;
    const assaultingSquad = squads.find(
      (sq) =>
        sq.isDeployed &&
        sq.currentHp > 0 &&
        Math.hypot(sq.x - center.x, sq.z - center.z) <= LAIR_ASSAULT_RADIUS
    );
    if (assaultingSquad) {
      const dps = Math.max(
        2,
        assaultingSquad.damagePerVolley / Math.max(1, assaultingSquad.fireRate)
      );
      occupantCount = Math.max(0, occupantCount - dps * deltaSec);
    }

    const clearedNow = occupantCount <= 0;
    updatedLairs.set(key, {
      ...lair,
      occupantCount,
      escalation,
      escalationAccumSec: escalationAccum,
      lastSpawnAt,
      isCleared: clearedNow || lair.isCleared,
    });

    if (clearedNow) {
      clearedLairs.push({ ...lair, occupantCount: 0, isCleared: true });
      notifications.push({
        title: 'LAIR CLEARED',
        desc: `${lair.buildingName} has been cleared — the persistent infected spawns from this nest have stopped.`,
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
