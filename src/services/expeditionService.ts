import { TacticalSquadUnit, getWeaponDefinition } from '../types/combat';
import { SquadLootItem } from '../types/population';
import { SettlementState } from '../types/settlement';
import { ExpeditionPhase, ExpeditionSite, ExpeditionState, createEmptyExpeditionState } from '../types/expedition';
import { getPrimaryHQ, isBuildingOperational } from './buildingOperational';
import { createEmptySquadInventory, getSquadInventoryCapacity } from './scavengingService';

// ==========================================
// Tuning constants (game-seconds unless noted)
// ==========================================
/** One expedition site per km of abstract distance (2.5 game-min/km). */
const TRAVEL_SEC_PER_KM = 150;
/** Slow IFZ-style scavenge: one carried item every N game-seconds. */
const SCAVENGE_SEC_PER_ITEM = 14;
/** Each garrisoned infected counts this much against the squad's volleys. */
const DEFENDER_HP = 35;
/** Cap on garrison counter-damage so a decent squad always has a fighting
 *  chance — an outmatched squad (one survivor, knives) still gets overwhelmed. */
const MAX_DEFENDER_DPS = 5;
const SITES_PER_REVEAL = 4;

type SiteTemplate = {
  name: string;
  description: string;
  distanceKm: number;
  tier: ExpeditionSite['threatTier'];
  defenders: number;
  loot: SquadLootItem[];
};

const SITE_NAMES = [
  'Riverside Industrial Park',
  'Highway Service Station',
  'Suburban Medical Plaza',
  'Rail Yard Depot',
  'Farmstead Compound',
  'Shopping Mall Ruin',
  'Fuel Storage Depot',
  'County Hospital Annex',
];

const SITE_DESCRIPTIONS = [
  'A sprawl of workshops and warehouses on the far bank.',
  'An abandoned motorway service area with a fuel forecourt.',
  'A gutted clinic complex — medical supplies rumored inside.',
  'Freight cars and container stacks along the old rail line.',
  'A walled farm with outbuildings and a machine shed.',
  'A collapsed retail centre; scavengers picked the edges.',
  'Tanker trucks and drums; the tanks may still hold fuel.',
  'A wing of the old county hospital, dark and quiet.',
];

function makeLootItem(label: string, quantity: number, weight = 1): SquadLootItem {
  return {
    id: `exp_${label}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'resource',
    label,
    quantity,
    weight,
  };
}

function makeWeaponItem(itemId: string, label: string): SquadLootItem {
  return {
    id: `exp_${itemId}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'weapon',
    label,
    quantity: 1,
    weight: 3,
    itemId,
  };
}

function buildLootPool(tier: ExpeditionSite['threatTier']): SquadLootItem[] {
  switch (tier) {
    case 'low':
      return [
        makeLootItem('wood', 4, 1),
        makeLootItem('metal', 3, 1),
        makeLootItem('canned_goods', 5, 1),
        makeLootItem('dried_rations', 4, 1),
        makeLootItem('tools', 1, 1),
      ];
    case 'medium':
      return [
        makeLootItem('metal', 6, 1),
        makeLootItem('bricks', 4, 1),
        makeLootItem('canned_goods', 6, 1),
        makeLootItem('ammo', 8, 1),
        makeLootItem('medical', 3, 1),
        makeWeaponItem('pistol', 'Pistol'),
      ];
    default:
      return [
        makeLootItem('metal', 10, 1),
        makeLootItem('bricks', 8, 1),
        makeLootItem('ammo', 14, 1),
        makeLootItem('tools', 3, 1),
        makeLootItem('medical', 5, 1),
        makeWeaponItem('hunting_rifle', 'Hunting Rifle'),
      ];
  }
}

/** The Antenna is the expedition gateway (IFZ: areas revealed through it). */
export function isAntennaOperational(state: SettlementState): boolean {
  return Array.from(state.adaptedBuildings.values())
    .concat(state.freestandingBuildings)
    .some((b) => b.typeId === 'antenna' && isBuildingOperational(b));
}

/**
 * Reveals the settlement's off-map expedition areas through the Antenna.
 * Idempotent per settlement: sites are generated once, when an operational
 * Antenna exists and no sites exist yet.
 */
export function ensureExpeditionsRevealed(state: SettlementState, now: number): ExpeditionState {
  const existing = state.expeditions;
  if (existing && existing.sites.length > 0) return existing;
  if (!isAntennaOperational(state)) return existing || createEmptyExpeditionState();

  const sites: ExpeditionSite[] = [];
  const namePool = [...SITE_NAMES].sort(() => 0.5 - Math.random());
  const descPool = [...SITE_DESCRIPTIONS].sort(() => 0.5 - Math.random());
  for (let i = 0; i < SITES_PER_REVEAL; i++) {
    const roll = Math.random();
    const tier: ExpeditionSite['threatTier'] = roll < 0.45 ? 'low' : roll < 0.8 ? 'medium' : 'high';
    const defenders = tier === 'low' ? 10 + Math.floor(Math.random() * 9) : tier === 'medium' ? 20 + Math.floor(Math.random() * 15) : 38 + Math.floor(Math.random() * 21);
    const loot = buildLootPool(tier);
    sites.push({
      id: `exp_${i + 1}`,
      name: namePool[i % namePool.length],
      description: descPool[i % descPool.length],
      distanceKm: Math.round((3 + Math.random() * 6) * 10) / 10,
      threatTier: tier,
      defenders,
      defendersRemaining: defenders * DEFENDER_HP,
      lootItems: loot,
      lootRemaining: loot.length,
      revealed: true,
      cleared: false,
      exhausted: false,
      phase: 'idle',
      travelRemainingSec: 0,
      scavengeAccumSec: 0,
      discoveredAt: now,
    });
  }
  return { sites, revealedAt: now };
}

export interface DispatchResult {
  success: boolean;
  newState: SettlementState;
  squads: TacticalSquadUnit[];
  error?: string;
}

/** Sends a squad off-map to an expedition site (travel → battle → scavenge). */
export function dispatchSquadOnExpedition(
  state: SettlementState,
  squads: TacticalSquadUnit[],
  squadId: string,
  siteId: string,
  now: number
): DispatchResult {
  const expeditions = ensureExpeditionsRevealed(state, now);
  if (expeditions.sites.length === 0) {
    return { success: false, newState: state, squads, error: 'No expedition areas available — build an operational Antenna to reveal them.' };
  }
  const site = expeditions.sites.find((s) => s.id === siteId);
  if (!site) return { success: false, newState: state, squads, error: 'Expedition area not found.' };
  if (site.assignedSquadId) return { success: false, newState: state, squads, error: 'Another squad is already at this site.' };
  if (site.exhausted) return { success: false, newState: state, squads, error: 'This site has been fully scavenged.' };

  const squad = squads.find((s) => s.squadId === squadId);
  if (!squad) return { success: false, newState: state, squads, error: 'Squad not found.' };
  if (squad.onExpedition) return { success: false, newState: state, squads, error: `${squad.name} is already on an expedition.` };
  if (squad.members.filter((m) => m.isAlive).length === 0) return { success: false, newState: state, squads, error: 'This squad has no living members.' };
  if (squad.pendingFuelDeliveryVehicleId) return { success: false, newState: state, squads, error: `${squad.name} is carrying a fuel delivery — finish or cancel it first.` };
  const mounted = state.vehicles?.find((v) => v.assignedSquadId === squadId);
  if (mounted) return { success: false, newState: state, squads, error: `Disembark ${squad.name} from ${mounted.name} before dispatching.` };

  const hq = getPrimaryHQ(state)?.center || { x: 0, z: 0 };
  const updatedSquad: TacticalSquadUnit = {
    ...squad,
    onExpedition: site.id,
    expeditionPhase: 'travel_out',
    state: 'idle',
    x: hq.x,
    z: hq.z,
    targetPos: null,
  };
  const updatedSites = expeditions.sites.map((s) =>
    s.id === site.id
      ? { ...s, assignedSquadId: squadId, phase: 'travel_out' as const, travelRemainingSec: s.distanceKm * TRAVEL_SEC_PER_KM, fullWarned: false }
      : s
  );
  return {
    success: true,
    newState: { ...state, expeditions: { ...expeditions, sites: updatedSites } },
    squads: squads.map((s) => (s.squadId === squadId ? updatedSquad : s)),
  };
}

/** Manually recalls an expedition squad — it never returns on its own. */
export function recallSquadFromExpedition(
  state: SettlementState,
  squads: TacticalSquadUnit[],
  squadId: string
): { success: boolean; newState: SettlementState; squads: TacticalSquadUnit[]; error?: string } {
  const expeditions = state.expeditions || createEmptyExpeditionState();
  const site = expeditions.sites.find((s) => s.assignedSquadId === squadId);
  if (!site) {
    return { success: false, newState: state, squads, error: 'This squad is not on an expedition.' };
  }
  if (site.phase === 'travel_back') {
    return { success: false, newState: state, squads, error: 'The squad is already returning.' };
  }
  const updatedSites = expeditions.sites.map((s) =>
    s.id === site.id
      ? { ...s, phase: 'travel_back' as const, travelRemainingSec: Math.max(30, s.distanceKm * TRAVEL_SEC_PER_KM) }
      : s
  );
  return {
    success: true,
    newState: { ...state, expeditions: { ...expeditions, sites: updatedSites } },
    squads: squads.map((sq) =>
      sq.squadId === squadId ? { ...sq, expeditionPhase: 'travel_back' as const } : sq
    ),
  };
}

export interface ExpeditionTickResult {
  newState: SettlementState;
  squads: TacticalSquadUnit[];
  events: { title: string; desc: string; type: 'warn' | 'info' | 'success' | 'danger' }[];
}

/** Advances every active expedition: travel, garrison battle, slow scavenge. */
export function tickExpeditions(
  state: SettlementState,
  squads: TacticalSquadUnit[],
  deltaSec: number,
  now: number
): ExpeditionTickResult {
  const events: ExpeditionTickResult['events'] = [];
  const expeditions = ensureExpeditionsRevealed(state, now);
  if (expeditions.sites.length === 0 || deltaSec <= 0) {
    return { newState: { ...state, expeditions }, squads, events };
  }

  let nextSquads = squads.map((s) => ({ ...s }));
  let inventories = state.squadInventories || {};

  const updatedSites = expeditions.sites.map((site) => {
    if (!site.assignedSquadId) return site;
    let next: ExpeditionSite = { ...site };
    const sqIdx = nextSquads.findIndex((s) => s.squadId === site.assignedSquadId);
    if (sqIdx === -1) {
      // Squad vanished (e.g. wiped elsewhere) — free the site.
      next.assignedSquadId = undefined;
      next.phase = 'idle';
      return next;
    }
    const squad = nextSquads[sqIdx];

    if (next.phase === 'travel_out' || next.phase === 'travel_back') {
      next.travelRemainingSec = Math.max(0, next.travelRemainingSec - deltaSec);
      if (next.travelRemainingSec <= 0) {
        if (next.phase === 'travel_out') {
          next.phase = next.defendersRemaining > 0 ? 'combat' : 'scavenging';
          events.push({
            title: 'EXPEDITION ARRIVED',
            desc: `${squad.name} reached ${next.name}. ${Math.ceil(next.defendersRemaining / DEFENDER_HP)} infected garrison it.`,
            type: 'warn',
          });
        } else {
          // Home. The squad re-enters the tactical map at the HQ.
          const hq = getPrimaryHQ(state)?.center || { x: 0, z: 0 };
          nextSquads[sqIdx] = {
            ...squad,
            onExpedition: null,
            expeditionPhase: null,
            state: 'idle',
            x: hq.x,
            z: hq.z,
            targetPos: null,
          };
          next.assignedSquadId = undefined;
          next.phase = 'idle';
          events.push({
            title: 'EXPEDITION RETURNED',
            desc: `${squad.name} returned with ${nextSquads[sqIdx].members.filter((m) => m.isAlive).length} survivors.`,
            type: 'success',
          });
        }
      }
      return next;
    }

    if (next.phase === 'combat') {
      // Squad volleys vs the garrison — real weapon damage & fire rates.
      const alive = squad.members.filter((m) => m.isAlive);
      const squadDps =
        alive.reduce((sum, m) => sum + getWeaponDefinition(m.weaponId).damage / Math.max(0.5, getWeaponDefinition(m.weaponId).fireRate), 0) ||
        3;
      const defendersBefore = next.defendersRemaining;
      const timeToClear = defendersBefore / Math.max(1, squadDps);
      // The garrison only fights back while it is still alive: counter-damage
      // is capped to the span of the battle, so a long tick cannot "overkill"
      // the squad after the defenders are already dead.
      const defenderAlive = Math.ceil(defendersBefore / DEFENDER_HP);
      const defenderDps = Math.min(MAX_DEFENDER_DPS, (defenderAlive * 9) / 1.2);
      const fightSec = Math.min(deltaSec, timeToClear);
      next.defendersRemaining = Math.max(0, defendersBefore - squadDps * deltaSec);
      const hpLost = Math.min(squad.currentHp, defenderDps * fightSec);
      nextSquads[sqIdx] = { ...squad, currentHp: Math.max(0, squad.currentHp - hpLost) };

      if (next.defendersRemaining <= 0) {
        next.cleared = true;
        next.phase = 'scavenging';
        next.scavengeAccumSec = 0;
        events.push({
          title: 'EXPEDITION SECURED',
          desc: `${squad.name} cleared the ${defenderAlive} infected at ${next.name} — scavenging can begin.`,
          type: 'success',
        });
      } else if (nextSquads[sqIdx].currentHp <= 0) {
        // The garrison overwhelmed the squad.
        nextSquads[sqIdx] = {
          ...nextSquads[sqIdx],
          members: nextSquads[sqIdx].members.map((m) => ({ ...m, isAlive: false, currentHp: 0 })),
          state: 'downed',
          onExpedition: null,
          expeditionPhase: null,
        };
        next.assignedSquadId = undefined;
        next.phase = 'idle';
        events.push({
          title: 'EXPEDITION LOST',
          desc: `${squad.name} was overwhelmed at ${next.name} and did not come back.`,
          type: 'danger',
        });
      }
      return next;
    }

    if (next.phase === 'scavenging') {
      // Slow scavenge. IMPORTANT (IFZ): the squad does NOT auto-return when its
      // backpack fills — it waits at the site until the player recalls it.
      const capacity = getSquadInventoryCapacity(squad);
      const inv = inventories[squad.squadId] || createEmptySquadInventory(capacity);
      if (next.lootRemaining > 0 && inv.items.length < capacity) {
        next.scavengeAccumSec += deltaSec;
        while (next.scavengeAccumSec >= SCAVENGE_SEC_PER_ITEM && next.lootRemaining > 0 && inv.items.length < capacity) {
          next.scavengeAccumSec -= SCAVENGE_SEC_PER_ITEM;
          const item = next.lootItems[next.lootItems.length - next.lootRemaining];
          next.lootRemaining -= 1;
          if (item) inv.items = [...inv.items, item];
        }
        inventories = { ...inventories, [squad.squadId]: inv };
        if (next.lootRemaining === 0) {
          next.exhausted = true;
          next.phase = 'idle';
          events.push({
            title: 'SITE EXHAUSTED',
            desc: `${squad.name} recovered everything at ${next.name} — recall the squad to bring the haul home.`,
            type: 'info',
          });
        }
      } else if (next.lootRemaining > 0 && inv.items.length >= capacity && !next.fullWarned) {
        // One-shot warning: the squad waits at the site (IFZ) — no auto-return.
        next.fullWarned = true;
        events.push({
          title: 'BACKPACK FULL',
          desc: `${squad.name} is fully loaded at ${next.name} but does not return on its own — issue a manual recall.`,
          type: 'warn',
        });
      }
      return next;
    }

    return next;
  });

  return {
    newState: { ...state, expeditions: { ...expeditions, sites: updatedSites }, squadInventories: inventories },
    squads: nextSquads,
    events,
  };
}

/** Phase label for UI. */
export function expeditionPhaseLabel(phase: ExpeditionPhase): string {
  switch (phase) {
    case 'travel_out': return 'EN ROUTE';
    case 'travel_back': return 'RETURNING';
    case 'combat': return 'COMBAT';
    case 'scavenging': return 'SCAVENGING';
    default: return 'IDLE';
  }
}