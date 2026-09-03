import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORESTER_GROWTH_UNITS_PER_WORKER_SEC,
  FORESTER_PLANT_INTERVAL_SEC,
  FORESTER_TARGET_LIVE_TREES,
  FORESTER_WORK_RADIUS_M,
  SAWMILL_CUT_RATE_PER_WORKER,
  SAWMILL_WORK_RADIUS_M,
  tickForestryWork,
} from '../src/services/forestryService';
import { createInitialSettlementState } from '../src/services/settlementService';
import type { MapData, Point2D, ResourceNode } from '../src/types/map';
import type { AdaptedBuilding, SettlementState } from '../src/types/settlement';

function mkBuilding(
  id: string,
  typeId: string,
  x: number,
  z: number,
  workers: number
): AdaptedBuilding {
  return {
    buildingId: id,
    typeId,
    name: typeId,
    constructionStatus: 'completed',
    currentDurability: 100,
    maxDurability: 100,
    isUnderRepair: false,
    footprintAreaM2: 200,
    assignedWorkers: workers,
    adaptedAt: Date.now(),
    isHQ: false,
    category: 'production',
    adaptedAreaM2: 200,
    adaptationPercentage: 100,
    totalFloorAreaM2: 200,
    volumeM3: 800,
    maxCapacity: 10,
    fullCapacity: 10,
    currentUsage: 0,
    capacityUnit: 'Units',
    defenseRating: 10,
    isFreestanding: false,
    position: { x, z },
    height: 4,
    levels: 1,
  } as unknown as AdaptedBuilding;
}

function woodNode(id: string, x: number, z: number, amount: number, maxAmount: number): ResourceNode {
  return {
    id,
    type: 'wood',
    subType: 'tree',
    position: { x, z },
    rotation: 0,
    scale: 1,
    source: 'park_scatter',
    amount,
    maxAmount,
    isDepleted: amount <= 0,
  };
}

function mkState(buildings: AdaptedBuilding[]): SettlementState {
  const fresh = createInitialSettlementState('Forestry Test');
  return {
    ...fresh,
    adaptedBuildings: new Map(buildings.map((b) => [b.buildingId, b])),
    freestandingBuildings: [],
    stockpile: {
      ...fresh.stockpile,
      materials: { wood: 0, metal: 0, bricks: 0, tools: 0 },
    },
    totalStorageCapacity: 100000,
  } as unknown as SettlementState;
}

function mkMap(nodes: ResourceNode[]): MapData {
  return {
    resourceNodes: nodes,
    buildings: [],
    roads: [],
    landuse: [],
  } as unknown as MapData;
}

const HUT = () => mkBuilding('hut1', 'foresters_hut', 0, 0, 2);
const MILL = () => mkBuilding('mill1', 'sawmill', 0, 0, 2);

test('no forestry buildings → state and map pass through untouched', () => {
  const state = mkState([]);
  const map = mkMap([woodNode('t1', 10, 0, 40, 40)]);
  const r = tickForestryWork(state, map, 120);
  assert.equal(r.newState, state, 'state identity preserved');
  assert.equal(r.mapData, map, 'map identity preserved');
});

test('staffed hut replants and regrows depleted trees inside its radius', () => {
  const state = mkState([HUT()]);
  // Stump at 10 m (inside the 40 m radius): amount 0 / max 10.
  const stump = woodNode('stump1', 10, 0, 0, 10);
  const map = mkMap([stump]);
  const r = tickForestryWork(state, map, 120, false, false);
  const n = r.mapData.resourceNodes[0];
  assert.equal(n.source, 'forester', 'stump replanted by the hut crew');
  assert.ok(n.amount > 0 && n.amount <= n.maxAmount, `tree regrowing (${n.amount})`);
  // 2 workers × growth units × 120 s = 12 budget; single tree → capped at max.
  assert.equal(n.amount, n.maxAmount, 'a lone tended tree receives the full budget');
  assert.equal(
    n.amount,
    10,
    'budget of 12 on one 10-cap tree tops it out (deterministic)'
  );
});

test('unstaffed hut leaves stumps alone', () => {
  const state = mkState([mkBuilding('hut1', 'foresters_hut', 0, 0, 0)]);
  const map = mkMap([woodNode('stump1', 10, 0, 0, 10)]);
  const r = tickForestryWork(state, map, 600);
  const n = r.mapData.resourceNodes[0];
  assert.equal(n.amount, 0, 'no workers → no tending');
  assert.equal(n.isDepleted, true);
});

test('growth budget is shared across several tended trees (constant throughput)', () => {
  const state = mkState([HUT()]);
  const a = woodNode('a', 10, 0, 0, 20);
  const b = woodNode('b', -10, 0, 0, 20);
  const map = mkMap([a, b]);
  const r = tickForestryWork(state, map, 60, false, false);
  const na = r.mapData.resourceNodes.find((n) => n.id === 'a')!;
  const nb = r.mapData.resourceNodes.find((n) => n.id === 'b')!;
  const budget = 2 * FORESTER_GROWTH_UNITS_PER_WORKER_SEC * 60;
  const expectedShare = 1 + budget / 2; // replant kick (1) + half the budget each
  assert.ok(Math.abs(na.amount - expectedShare) < 1e-6, `tree a grew by its share (${na.amount})`);
  assert.ok(Math.abs(nb.amount - expectedShare) < 1e-6, 'tree b got the same share');
});

test('hut plants new saplings when the radius is thin (renewable wood)', () => {
  const state = mkState([HUT()]);
  const map = mkMap([]); // no trees at all — below the target
  const r = tickForestryWork(state, map, FORESTER_PLANT_INTERVAL_SEC * 12, false, false);
  const planted = r.mapData.resourceNodes.filter((n) => n.source === 'forester');
  assert.ok(planted.length >= 1, `new forester saplings appeared (${planted.length})`);
  for (const n of planted) {
    assert.equal(n.type, 'wood');
    assert.equal(n.subType, 'tree');
    const d = Math.hypot(n.position.x, n.position.z);
    assert.ok(d >= 3 && d <= FORESTER_WORK_RADIUS_M, 'sapling inside the working radius');
    assert.ok(n.amount >= 1, 'sapling starts small');
  }
});

test('dense forest does not trigger planting', () => {
  const nodes: ResourceNode[] = [];
  for (let i = 0; i < FORESTER_TARGET_LIVE_TREES + 2; i++) {
    nodes.push(woodNode(`t${i}`, 5 + i * 2, 5, 10, 10));
  }
  const state = mkState([HUT()]);
  const r = tickForestryWork(state, mkMap(nodes), FORESTER_PLANT_INTERVAL_SEC * 12);
  assert.equal(
    r.mapData.resourceNodes.filter((n) => n.source === 'forester').length,
    0,
    'no planting while the radius is well stocked'
  );
});

test('staffed sawmill auto-cuts the nearest mature tree inside its radius', () => {
  const state = mkState([MILL()]);
  const near = woodNode('near', 10, 0, 30, 30); // inside 30 m radius
  const far = woodNode('far', 60, 0, 30, 30); // outside
  const map = mkMap([near, far]);
  const r = tickForestryWork(state, map, 60, false, false);
  const nn = r.mapData.resourceNodes.find((n) => n.id === 'near')!;
  const nf = r.mapData.resourceNodes.find((n) => n.id === 'far')!;
  const cut = 2 * SAWMILL_CUT_RATE_PER_WORKER * 60; // 192 — capped by the tree
  assert.equal(nn.amount, Math.max(0, 30 - cut), 'nearby tree felled by the crew');
  assert.equal(nf.amount, 30, 'tree outside the working radius untouched');
  assert.equal(r.newState.stockpile.materials.wood, cut - (30 - nn.amount) === 0 ? 30 : 30, 'cut wood deposited');
  assert.ok(r.newState.stockpile.materials.wood >= 30, 'whole tree landed in the stockpile');
});

test('night or colony alarm pauses forestry crews', () => {
  const day = mkState([MILL(), mkBuilding('hut1', 'foresters_hut', 0, 0, 2)]);
  const map1 = mkMap([woodNode('t1', 10, 0, 30, 30)]);
  const night = tickForestryWork(day, map1, 600, true, false);
  assert.equal(night.mapData.resourceNodes[0].amount, 30, 'no sawing at night');
  assert.equal(night.newState.stockpile.materials.wood, 0);

  const map2 = mkMap([woodNode('t2', 10, 0, 30, 30)]);
  const alarm = tickForestryWork(day, map2, 600, false, true);
  assert.equal(alarm.mapData.resourceNodes[0].amount, 30, 'no sawing during an alarm');
  assert.equal(alarm.newState.stockpile.materials.wood, 0);
});