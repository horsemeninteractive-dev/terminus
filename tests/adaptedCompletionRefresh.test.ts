import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptBuilding,
  buildFreestanding,
  createInitialSettlementState,
  establishSettlementHQ,
} from '../src/services/settlementService';
import { tickSettlementSimulation } from '../src/services/populationService';
import type { BuildingPolygon, Point2D } from '../src/types/map';
import type { SettlementState } from '../src/types/settlement';

const HQ: BuildingPolygon = {
  id: 'b_hq_refresh',
  type: 'residential' as unknown as BuildingPolygon['type'],
  rawType: 'headquarters',
  name: 'Refresh HQ',
  height: 12,
  levels: 3,
  center: { x: 0, z: 0 },
  polygon: [
    { x: -8, z: -8 },
    { x: 8, z: -8 },
    { x: 8, z: 8 },
    { x: -8, z: 8 },
  ],
  tags: {},
};

const WAREHOUSE: BuildingPolygon = {
  id: 'b_wh_refresh',
  type: 'warehouse' as unknown as BuildingPolygon['type'],
  rawType: 'warehouse',
  name: 'Refresh Warehouse',
  height: 8,
  levels: 2,
  center: { x: 12, z: 12 },
  polygon: [
    { x: 10, z: 10 },
    { x: 20, z: 10 },
    { x: 20, z: 20 },
    { x: 10, z: 20 },
  ],
  tags: {},
};

const SQUARE: Point2D[] = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
];

function seedState(name = 'Refresh Test'): SettlementState {
  const fresh = createInitialSettlementState(name);
  fresh.stockpile.materials = {
    wood: 99999,
    metal: 99999,
    bricks: 99999,
    tools: 999,
    scientific_materials: 0,
    logs: 0,
    scrap: 0,
    clay: 0,
    fertilizer: 0,
  } as never;
  fresh.buildingSearches = new Map([
    [
      'b_wh_refresh',
      {
        buildingId: 'b_wh_refresh',
        searched: true,
        searchProgress: 100,
        observed: true,
        unlootedItems: [],
        lootedItems: [],
        loot: [],
      },
    ],
  ]);
  return establishSettlementHQ(fresh, HQ);
}

/**
 * Regression test: when a construction order completes, tickSettlementSimulation
 * must hand back a NEW adaptedBuildings Map (and freestandingBuildings array)
 * reference. The completion mutates records in place, so without the copy the
 * GameCanvas overlay effect (keyed on the Map identity) never fires and the
 * renderer keeps the under-construction amber marker, orange edges and
 * blueprint tint forever — the sim knows the building is done, the screen
 * doesn't.
 */
test('adapted building completion returns a fresh adaptedBuildings map reference', () => {
  let state = seedState();
  const res = adaptBuilding(state, WAREHOUSE, 'warehouse', 100);
  assert.ok(res.success, res.error);
  state = res.newState;
  const record = state.adaptedBuildings.get('b_wh_refresh');
  assert.ok(record, 'adaptation record exists');
  assert.equal(record.constructionStatus, 'in_progress');

  let completed = false;
  for (let i = 0; i < 2400 && !completed; i++) {
    // 600 sim-seconds per day: 300 day / 300 night (crews rest at night).
    const isNight = Math.floor(i / 300) % 2 === 1;
    const prevMap = state.adaptedBuildings;
    const result = tickSettlementSimulation(state, 1, null, isNight);
    const done = result.newState.adaptedBuildings.get('b_wh_refresh');
    if (done && done.constructionStatus === 'completed') {
      completed = true;
      assert.notEqual(
        result.newState.adaptedBuildings,
        prevMap,
        'completed tick must return a fresh Map reference so the renderer refreshes'
      );
      assert.ok(
        result.completedConstructions.length >= 1,
        'completion is reported to the caller'
      );
      assert.equal(done.constructionProgress, 100);
    }
    state = result.newState;
  }
  assert.ok(completed, 'adaptation must complete with ample labour and materials');
});

test('freestanding construction completion returns a fresh freestanding array reference', () => {
  let state = seedState();
  const placed = buildFreestanding(state, 'wooden_palisade' as never, { x: 30, z: 0 }, 8, 8, 4.5, 0);
  assert.ok(placed.success, placed.error);
  state = placed.newState;

  let completed = false;
  for (let i = 0; i < 2400 && !completed; i++) {
    const isNight = Math.floor(i / 300) % 2 === 1;
    const prevArray = state.freestandingBuildings;
    const result = tickSettlementSimulation(state, 1, null, isNight);
    const done = result.newState.freestandingBuildings.find(
      (f) => f.buildingId === placed.newState.freestandingBuildings[0].buildingId
    );
    if (done && done.constructionStatus === 'completed') {
      completed = true;
      assert.notEqual(
        result.newState.freestandingBuildings,
        prevArray,
        'completed tick must return a fresh freestanding array so the renderer refreshes'
      );
    }
    state = result.newState;
  }
  assert.ok(completed, 'palisade must complete');
});