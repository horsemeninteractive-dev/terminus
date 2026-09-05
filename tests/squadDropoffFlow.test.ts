// Integration regression tests for the scavenge / deposit / queue-resume flow.
// These mirror the scavenge + post-deposit-resume sections of useSimulationLoop
// (the loop code lives in a React hook and cannot run headless), driving the real
// services: runSimulationPipeline (combat movement + logistics deposit), the
// queue helpers and tickBuildingScavengeProgress, exactly as the hook composes
// them each tick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState } from '../src/services/settlementService';
import {
  tickBuildingScavengeProgress,
  hasStockpileRoomForHaul,
  findNearestStorageDropoff,
  isSettlementDropoffBuilding,
} from '../src/services/scavengingService';
import { orderSquadMove } from '../src/services/combatService';
import { runSimulationPipeline } from '../src/services/simulationPipeline';
import { findNextScavengeTarget, isBuildingExhausted } from '../src/lib/scavengeQueueHelpers';
import type { BuildingPolygon, MapData } from '../src/types/map';
import type { SettlementState } from '../src/types/settlement';
import type { TacticalSquadUnit } from '../src/types/combat';

const B = (id: string, cx: number, cz: number, w = 10, d = 10): BuildingPolygon => ({
  id, type: 'residential', rawType: 'terrace', name: id.toUpperCase(),
  height: 8, levels: 2, center: { x: cx, z: cz },
  polygon: [
    { x: cx - w / 2, z: cz - d / 2 },
    { x: cx + w / 2, z: cz - d / 2 },
    { x: cx + w / 2, z: cz + d / 2 },
    { x: cx - w / 2, z: cz + d / 2 },
  ],
  tags: {},
});

const HQ = B('b_hq', 0, 0, 24, 24);
const WAREHOUSE = B('b_wh', 80, 0, 16, 16);
const B1 = B('b_1', 200, 0);
const B2 = B('b_2', 300, 0);

function makeMap(buildings: BuildingPolygon[]): MapData {
  return {
    center: { lat: 51.5, lon: -0.12 }, radius: 900,
    elevation: {
      minElevation: 10, maxElevation: 30, baseElevation: 20, resolution: 2,
      grid: [[20, 20], [20, 20]], bounds: { minX: -900, maxX: 900, minZ: -900, maxZ: 900 },
    },
    buildings, roads: [], landuse: [], resourceNodes: [],
    bounds: { minX: -900, maxX: 900, minZ: -900, maxZ: 900 },
    stats: {
      buildingCount: buildings.length, roadCount: 0,
      resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 },
      elevationRangeMeters: 20, processedTimeMs: 0,
    },
    fetchedAt: 0, source: 'test',
  };
}

function mkSquad(squadId: string, x: number, z: number): TacticalSquadUnit {
  return {
    squadId, name: squadId, leaderId: 'L', leaderName: 'L',
    leaderCombatTier: 'veteran', generalCount: 3, x, z, y: 0,
    rotation: 0, currentHp: 50, maxHp: 50, attackRange: 8, fireRate: 2,
    lastFireTime: 0, damagePerVolley: 8, critChance: 0.05, moveSpeed: 10,
    state: 'idle', manualOrder: false, targetPos: null, targetZombieId: null,
    isDeployed: true, killCount: 0, isInSafeZone: false, mountedVehicleId: null,
    members: [0, 1, 2, 3].map((i) => ({
      id: `m${i}`, name: `m${i}`, isLeader: i === 0, weaponId: 'knife', armorId: null,
      isAlive: true, maxHp: 50, currentHp: 50,
    })),
  } as unknown as TacticalSquadUnit;
}

const LOOT = (id: string, label = 'wood', quantity = 1) =>
  ({ id, kind: 'resource' as const, label, quantity, weight: 1 });

function seedSearch(state: SettlementState, buildingId: string, loot: ReturnType<typeof LOOT>[]) {
  state.buildingSearches = state.buildingSearches || new Map();
  (state.buildingSearches as Map<string | number, any>).set(buildingId, {
    buildingId, buildingName: buildingId, observed: true, searched: false,
    searchProgress: 0, totalDurationSec: 5, elapsedDurationSec: 0,
    loot: [...loot], unlootedItems: [...loot], lootedItems: [],
  });
}

function seedHQ(state: SettlementState, hqBldg = HQ) {
  state.headquarters = [{
    buildingId: hqBldg.id, buildingName: 'HQ', establishedAt: 0,
    footprintAreaM2: 576, levels: 2, center: hqBldg.center,
    defenseRating: 50, maxCapacity: 40, maxDurability: 800, currentDurability: 800,
  }];
  state.primaryHQId = hqBldg.id as string;
}

function seedWarehouse(state: SettlementState, w = WAREHOUSE) {
  (state.adaptedBuildings as Map<string | number, any>).set(w.id, {
    buildingId: w.id, typeId: 'warehouse', isHQ: false, name: 'Warehouse',
    category: 'basic', adaptedAt: 0, footprintAreaM2: 256, adaptedAreaM2: 256,
    adaptationPercentage: 100, totalFloorAreaM2: 512, volumeM3: 2000,
    maxCapacity: 100, currentUsage: 0, capacityUnit: 'units',
    maxDurability: 100, currentDurability: 100, defenseRating: 1, isFreestanding: false,
    position: w.center, height: 6, levels: 1, polygon: w.polygon,
    constructionStatus: 'completed', constructionProgress: 100,
    constructionWorkRequired: 100, constructionWorkDone: 100, assignedWorkers: 0,
    center: w.center, customName: 'Warehouse',
  });
}

function inside(x: number, z: number, b: BuildingPolygon): boolean {
  const pts = b.polygon;
  let is = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, zi = pts[i].z, xj = pts[j].x, zj = pts[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) is = !is;
  }
  return is;
}

interface World {
  state: SettlementState;
  squads: TacticalSquadUnit[];
  queue: Array<string | number>;
  deposits: number;
  warehouseDeposits: number;
  hqDeposits: number;
  parkedTicks: number;
}

function tick(world: World, map: MapData, delta = 1): World {
  let { state, squads, queue, deposits, warehouseDeposits, hqDeposits } = world;
  const sqBefore = squads[0];
  const invBefore = state.squadInventories?.[sqBefore?.squadId];
  const carriedBefore = invBefore?.items?.length || 0;

  // A. Full pipeline: combat movement + logistics deposit.
  const pipe = runSimulationPipeline({
    state, mapData: map, squads,
    zombies: [], hostileHumans: [], noiseEvents: [], droppedItems: [],
    clock: { day: 1, hour: 8, minute: 0, speed: 1, phase: 'day', isNight: false, hordeWaveIntensity: 0, totalElapsedSeconds: 0 },
    deltaSeconds: delta,
  });
  state = pipe.state;
  squads = pipe.squads;
  // Detect deposit events: the squad arrived at a dropoff carrying loot and
  // the logistics stage emptied its backpack.
  const after = squads[0];
  const invAfter = state.squadInventories?.[after?.squadId];
  if (
    carriedBefore > 0 && (invAfter?.items?.length || 0) < carriedBefore && after
  ) {
    const dw = Math.hypot(after.x - WAREHOUSE.center.x, after.z - WAREHOUSE.center.z);
    const dh = Math.hypot(after.x - HQ.center.x, after.z - HQ.center.z);
    if (dw <= 10) warehouseDeposits += 1;
    else if (dh <= 10) hqDeposits += 1;
    deposits += 1;
  }

  // B. Post-deposit queue resume.
  for (let i = 0; i < squads.length; i++) {
    const sq = squads[i];
    if (sq.currentHp <= 0 || sq.mountedVehicleId || sq.manualOrder || sq.holdHaul || sq.onExpedition) continue;
    if (!queue?.length) continue;
    const inv = state.squadInventories?.[sq.squadId];
    if (inv?.items?.length) continue;
    if (sq.targetPos) continue;
    if (sq.state !== 'idle') continue;
    const searches = state.buildingSearches || new Map();
    const next = findNextScavengeTarget(queue.filter((id) => !isSettlementDropoffBuilding(state, id)), map.buildings, searches);
    if (next) {
      squads[i] = orderSquadMove(squads, sq.squadId, next.center, next.id, next.name).find((s) => s.squadId === sq.squadId) || sq;
    } else {
      queue = [];
      squads[i] = { ...sq, state: 'idle', targetPos: null, targetBuildingId: null, targetBuildingName: null };
    }
  }

  // C. Scavenge over time.
  for (let i = 0; i < squads.length; i++) {
    const sq = squads[i];
    if (sq.currentHp <= 0 || sq.state === 'downed' || sq.state === 'retreating') continue;
    if (sq.holdHaul) continue;
    let targetBldg = sq.targetBuildingId
      ? map.buildings.find((b) => String(b.id) === String(sq.targetBuildingId))
      : undefined;
    if (!targetBldg && (sq.state === 'searching' || (sq.state === 'idle' && !sq.targetPos))) {
      targetBldg = map.buildings.find((b) => inside(sq.x, sq.z, b));
    }
    if (targetBldg && isSettlementDropoffBuilding(state, targetBldg.id) && sq.state === 'searching') {
      // Dropoff destination (HQ / warehouse): stand down — never loot it.
      squads[i] = { ...sq, state: 'idle', targetBuildingId: null, targetBuildingName: null, searchProgress: undefined };
      continue;
    }
    if (!targetBldg || isSettlementDropoffBuilding(state, targetBldg.id) || !inside(sq.x, sq.z, targetBldg)) continue;
    const bSearch = state.buildingSearches?.get(targetBldg.id);
    if (!bSearch?.searched) {
      const res = tickBuildingScavengeProgress(state, sq, targetBldg, delta, map.buildings);
      state = res.newState;
      squads[i] = res.updatedSquad;
      if (!res.isCompleted) continue;

      const searchesNow = state.buildingSearches || new Map();
      const stillHasLoot = !isBuildingExhausted(targetBldg.id, searchesNow);
      queue = stillHasLoot
        ? (queue.some((id) => String(id) === String(targetBldg.id)) ? queue : [targetBldg.id, ...queue])
        : queue.filter((id) => String(id) !== String(targetBldg.id));
      const fin = squads[i];
      const inv = state.squadInventories?.[sq.squadId];
      const carrying = !!inv?.items?.length;
      if (carrying && fin.state !== 'returning') {
        if (!hasStockpileRoomForHaul(state, inv.items)) {
          squads[i] = { ...fin, state: 'idle', manualOrder: false, holdHaul: true, targetPos: null, targetBuildingId: null, targetBuildingName: null, searchProgress: undefined, pathState: undefined };
        } else {
          const dropoff = findNearestStorageDropoff(state, { x: fin.x, z: fin.z }, map.buildings);
          squads[i] = { ...fin, state: 'returning', manualOrder: false, targetPos: { x: dropoff.x, z: dropoff.z }, targetBuildingId: null, targetBuildingName: dropoff.name, searchProgress: undefined, pathState: undefined };
        }
      } else if (!carrying && fin.state !== 'returning') {
        const next = findNextScavengeTarget(queue.filter((id) => !isSettlementDropoffBuilding(state, id)), map.buildings, searchesNow);
        if (next) {
          squads[i] = orderSquadMove(squads, sq.squadId, next.center, next.id, next.name).find((s) => s.squadId === sq.squadId) || fin;
        }
      }
    }
  }

  return { state, squads, queue, deposits, warehouseDeposits, hqDeposits, parkedTicks: world.parkedTicks };
}

function wood(world: World): number {
  return (world.state.stockpile.materials as any).wood || 0;
}

function setup(withWarehouse: boolean, withB2 = true): { world: World; map: MapData } {
  const state = createInitialSettlementState('Repro');
  (state as any).totalStorageCapacity = 5000;
  seedHQ(state);
  const buildings = [HQ, ...(withWarehouse ? [WAREHOUSE] : []), B1, ...(withB2 ? [B2] : [])];
  const map = makeMap(buildings);
  if (withWarehouse) seedWarehouse(state);
  seedSearch(state, B1.id, [LOOT('l1'), LOOT('l2'), LOOT('l3'), LOOT('l4')]);
  if (withB2) seedSearch(state, B2.id, [LOOT('l5'), LOOT('l6')]);
  state.squadInventories = {
    sq1: { squadId: 'sq1', capacity: 4, used: 0, items: [] },
  };
  const world: World = {
    state,
    squads: [{
      ...mkSquad('sq1', B1.center.x, B1.center.z),
      state: 'searching', targetBuildingId: B1.id, targetBuildingName: B1.name, targetPos: { ...B1.center },
    }],
    queue: [B1.id, ...(withB2 ? [B2.id] : [])],
    deposits: 0, warehouseDeposits: 0, hqDeposits: 0, parkedTicks: 0,
  };
  return { world, map };
}

function run(world: World, map: MapData, maxTicks: number): World {
  let parkedStreak = 0;
  for (let t = 1; t <= maxTicks; t++) {
    const before = parkedStreak;
    world = tick(world, map);
    const s = world.squads[0];
    const inv = world.state.squadInventories?.[s.squadId];
    const idleEmptyQueued = s.state === 'idle' && !s.targetPos && !inv?.items?.length && world.queue.length > 0;
    parkedStreak = idleEmptyQueued ? parkedStreak + 1 : 0;
    if (parkedStreak > 6) break; // permanently parked mid-queue — failure
    const settled = s.state === 'idle' && !s.targetPos && !inv?.items?.length && world.queue.length === 0;
    if (settled && t > 10) { world.parkedTicks = 0; break; }
    void before;
  }
  return world;
}

test('S1 warehouse: loot B1 -> deposit at warehouse -> continue to B2 -> deposit -> settle', () => {
  const { world, map } = setup(true);
  const base = wood(world);
  const end = run(world, map, 400);
  const s = end.squads[0];
  const inv = end.state.squadInventories?.[s.squadId];
  assert.equal(end.queue.length, 0, 'queue fully consumed');
  assert.equal(inv?.items?.length, 0, 'squad deposited everything');
  assert.equal(wood(end) - base, 6, 'all 6 loot units reached the stockpile');
  assert.ok(end.warehouseDeposits >= 2, `deposited at the warehouse (${end.warehouseDeposits}x)`);
  assert.ok(world.parkedTicks <= 6, 'never parked idle mid-queue at the warehouse');
});

test('S2 no warehouse: loot B1 -> deposit at HQ -> continue to B2 -> deposit -> settle', () => {
  const { world, map } = setup(false);
  const base = wood(world);
  const end = run(world, map, 400);
  const s = end.squads[0];
  const inv = end.state.squadInventories?.[s.squadId];
  assert.equal(end.queue.length, 0, 'queue fully consumed');
  assert.equal(inv?.items?.length, 0, 'squad deposited everything');
  assert.equal(wood(end) - base, 6, 'all 6 loot units reached the stockpile at HQ');
  assert.ok(end.hqDeposits >= 2, `deposited at the HQ (${end.hqDeposits}x)`);
  assert.ok(Math.abs(s.x) < 40, `ended at/near the HQ (${s.x.toFixed(0)},${s.z.toFixed(0)})`);
});

test('S3 manual move to HQ with loot deposits there and never scavenges the HQ', () => {
  const { world, map } = setup(true, false);
  const start = world;
  // Squad carries loot, player right-clicks the HQ (outside its footprint edge).
  const hqEdge = { x: 0, z: 16 }; // 4 m beyond the 24×24 HQ's edge
  start.squads = [{
    ...mkSquad('sq1', B1.center.x, B1.center.z),
    state: 'idle', manualOrder: false, targetPos: null, targetBuildingId: null,
  }];
  start.state.squadInventories = {
    sq1: { squadId: 'sq1', capacity: 4, used: 2, items: [LOOT('a'), LOOT('b')] },
  };
  const base = wood(start);
  start.squads[0] = orderSquadMove(start.squads, 'sq1', hqEdge, HQ.id, HQ.name).find((s) => s.squadId === 'sq1')!;
  const end = run(start, map, 200);
  const s = end.squads[0];
  const inv = end.state.squadInventories?.[s.squadId];
  assert.equal(wood(end) - base, 2, 'manual HQ move deposited the carried loot');
  assert.equal(inv?.items?.length, 0, 'backpack emptied at HQ');
  assert.equal(s.state === 'searching' && s.targetBuildingId === null, false, 'squad is not stuck searching nothing');
});
