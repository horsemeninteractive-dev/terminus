import { TacticalSquadUnit, ZombieLair, ZombieUnit } from '../types/combat';
import { BuildingPolygon, Point2D } from '../types/map';
import { SettlementState } from '../types/settlement';
import {
  BuildingOccupation,
  OccupationState,
  OccupationThreatTier,
  createEmptyOccupationState,
} from '../types/occupation';
import { createZombieUnit } from './combatService';
import { getAdaptedEntriesForBuilding } from './buildingOperational';

// ==========================================
// Tuning constants
// ==========================================
/** Game-seconds between occupation attempts (pressure pass cadence). */
const SEED_INTERVAL_SEC = 60;
/** Hard cap on simultaneous occupied structures. */
const MAX_OCCUPIED = 5;
/** Lair pressure reach: a building this close to an active lair is at risk. */
const LAIR_PRESSURE_REACH_MULT = 1.8;
/** Chance a pressure-pass attempt actually takes a building over. */
const OCCUPY_CHANCE = 0.35;

function randomPointInPolygon(poly: Point2D[] | undefined, center: Point2D): Point2D {
  if (!poly || poly.length < 3) return { ...center };
  const xs = poly.map((p) => p.x);
  const zs = poly.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  for (let attempt = 0; attempt < 20; attempt++) {
    const pt = { x: minX + Math.random() * (maxX - minX), z: minZ + Math.random() * (maxZ - minZ) };
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > pt.z) !== (b.z > pt.z) && pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    if (inside) return pt;
  }
  return { ...center };
}

/** IFZ: only UNADAPTED structures can be occupied. Adapted buildings, the HQ,
 *  player-built freestanding structures and Lair buildings never are. */
export function getOccupationCandidates(state: SettlementState, buildings: BuildingPolygon[]): BuildingPolygon[] {
  const protectedIds = new Set<string>();
  for (const b of state.adaptedBuildings.values()) protectedIds.add(String(b.buildingId));
  for (const b of state.freestandingBuildings || []) protectedIds.add(String(b.buildingId));
  for (const key of state.zombieLairs?.keys() || []) protectedIds.add(String(key));
  const hq = (state.headquarters || []).find((h) => h && String(h.buildingId) === String(state.primaryHQId));
  if (hq) protectedIds.add(String(hq.buildingId));

  return buildings.filter((b) => {
    if (!b.polygon || b.polygon.length < 3) return false;
    const id = String(b.id);
    if (protectedIds.has(id)) return false;
    if (getAdaptedEntriesForBuilding(state.adaptedBuildings, b.id).length > 0) return false;
    const occ = state.occupiedBuildings?.buildings.get(b.id);
    if (occ && !occ.isCleared) return false;
    return true;
  });
}

export function getOccupation(state: SettlementState, buildingId: string | number): BuildingOccupation | undefined {
  return state.occupiedBuildings?.buildings.get(buildingId);
}

export interface OccupationTickResult {
  newState: SettlementState;
  spawnedZombies: ZombieUnit[];
  events: { title: string; desc: string; type: 'warn' | 'info' | 'success' | 'danger' }[];
}

/**
 * Pressure-driven building occupation (§IFZ):
 *  - UNADAPTED buildings near an active Lair can be taken over by infected
 *    (day or night); elsewhere, only night pressure attempts occupations.
 *  - The takeover seeds REAL infected inside the building, carrying
 *    occupationId + a home anchor, so they stay local and fight for real.
 *  - Occupations never regrow: when the last living infected is killed, the
 *    building is cleared.
 */
export function tickBuildingOccupations(
  state: SettlementState,
  zombies: ZombieUnit[],
  squads: TacticalSquadUnit[],
  buildings: BuildingPolygon[],
  lairs: Map<string | number, ZombieLair>,
  isNight: boolean,
  deltaSec: number,
  now: number
): OccupationTickResult {
  const events: OccupationTickResult['events'] = [];
  const occState = state.occupiedBuildings || createEmptyOccupationState();
  const occupied = new Map(occState.buildings);
  const spawnedZombies: ZombieUnit[] = [];

  const activeLairs = Array.from(lairs.values()).filter((l) => !l.isCleared && l.population > 0);
  const lairCenters = new Map<string, { x: number; z: number; reach: number }>();
  for (const l of activeLairs) {
    const bldg = buildings.find((b) => String(b.id) === String(l.buildingId));
    if (bldg) lairCenters.set(String(l.buildingId), { x: bldg.center.x, z: bldg.center.z, reach: (l.homeRadius ?? 40) * LAIR_PRESSURE_REACH_MULT });
  }

  // ---- 1. Pressure pass: attempt to occupy a new building ----
  let seedAccum = occState.seedAccumSec + deltaSec;
  const standing = Array.from(occupied.values()).filter((o) => !o.isCleared).length;
  if (seedAccum >= SEED_INTERVAL_SEC && standing < MAX_OCCUPIED) {
    seedAccum = 0;
    const candidates = getOccupationCandidates(state, buildings);
    // Weight candidates by lair pressure: buildings inside a lair's pressure
    // reach are the natural takeover targets.
    const weighted: { b: BuildingPolygon; pressure: boolean }[] = candidates.map((b) => {
      let pressure = false;
      for (const c of lairCenters.values()) {
        if (Math.hypot(b.center.x - c.x, b.center.z - c.z) <= c.reach) { pressure = true; break; }
      }
      return { b, pressure };
    });
    const pressured = weighted.filter((w) => w.pressure);
    const pool = pressured.length > 0 ? pressured : weighted.filter((w) => isNight);
    if (pool.length > 0 && Math.random() < OCCUPY_CHANCE) {
      const pick = pool[Math.floor(Math.random() * pool.length)].b;
      const nearLair = pressured.some((w) => w.b.id === pick.id);
      const footprint = Math.max(40, Math.round(polygonArea(pick.polygon)));
      const tier: OccupationThreatTier = footprint >= 500 || nearLair && footprint >= 250 ? 'high' : footprint >= 180 ? 'medium' : 'low';
      const count = tier === 'high' ? 7 + Math.floor(Math.random() * 3) : tier === 'medium' ? 5 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 2);
      const id = `occ_${pick.id}`;
      occupied.set(pick.id, {
        id,
        buildingId: pick.id,
        buildingName: pick.name || `Structure #${pick.id}`,
        threatTier: tier,
        maxInfected: count,
        infectedRemaining: count,
        occupiedAt: now,
        isCleared: false,
      });
      // Real infected move in, scattered across the footprint and home-bound.
      for (let i = 0; i < count; i++) {
        const pt = randomPointInPolygon(pick.polygon, pick.center);
        const zmb = createZombieUnit(i % 6 === 5 ? 'runner' : 'shambler', pt.x, pt.z, 0, isNight);
        zmb.occupationId = id;
        zmb.homeX = pick.center.x;
        zmb.homeZ = pick.center.z;
        zmb.homeRadius = 25;
        spawnedZombies.push(zmb);
      }
      events.push({
        title: 'BUILDING OCCUPIED',
        desc: `${pick.name || `Structure #${pick.id}`} has been taken over by infected — clear the building to reclaim it.`,
        type: 'warn',
      });
    }
  }

  // ---- 2. Sync each occupation to its living infected; clear at zero ----
  // The infected seeded THIS tick are in spawnedZombies, not the input list —
  // count both so a fresh occupation survives its own birth tick.
  const allZombies = [...zombies, ...spawnedZombies];
  for (const [key, occ] of occupied) {
    if (occ.isCleared) continue;
    const living = allZombies.filter((z) => z.occupationId === occ.id && z.currentHp > 0).length;
    if (living <= 0) {
      occupied.set(key, { ...occ, infectedRemaining: 0, isCleared: true });
      events.push({
        title: 'BUILDING RECLAIMED',
        desc: `${occ.buildingName} has been cleared — every infected inside is dead.`,
        type: 'success',
      });
    } else {
      occupied.set(key, { ...occ, infectedRemaining: living });
    }
  }

  return {
    newState: { ...state, occupiedBuildings: { buildings: occupied, seedAccumSec: seedAccum } },
    spawnedZombies,
    events,
  };
}

/** Breaks the occupation when a squad searches the building: every living
 *  infected inside wakes and fights. Returns the updated zombie list — the
 *  occupation's population is REAL, so no new units are conjured. */
export function breachOccupiedBuilding(
  zombies: ZombieUnit[],
  occupation: BuildingOccupation,
  bldgPos: Point2D
): ZombieUnit[] {
  return zombies.map((z) => {
    if (z.occupationId !== occupation.id || z.currentHp <= 0) return z;
    return {
      ...z,
      alertLevel: 2,
      state: 'chasing' as const,
      targetPos: { x: bldgPos.x + (Math.random() - 0.5) * 10, z: bldgPos.z + (Math.random() - 0.5) * 10 },
      x: bldgPos.x + (Math.random() - 0.5) * 6,
      z: bldgPos.z + (Math.random() - 0.5) * 6,
    };
  });
}

function polygonArea(poly: Point2D[]): number {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j].x + poly[i].x) * (poly[j].z - poly[i].z);
  }
  return Math.abs(area / 2);
}