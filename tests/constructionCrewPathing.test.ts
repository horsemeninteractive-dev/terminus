import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialSettlementState,
  establishSettlementHQ,
  buildFreestanding,
} from '../src/services/settlementService';
import { tickSettlementSimulation } from '../src/services/populationService';
import { PathGrid } from '../src/services/pathfindingService';
import type { SettlementState } from '../src/types/settlement';
import type { BuildingPolygon, MapData } from '../src/types/map';

function makeHq(): BuildingPolygon {
  return {
    id: 'b_hq_stuck_test',
    type: 'residential' as unknown as BuildingPolygon['type'],
    rawType: 'headquarters',
    name: 'Test HQ',
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
}

function makeMap(): MapData {
  const b = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
  return {
    cityName: 'T',
    bounds: b,
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'S', country: 'X' },
    buildings: [], roads: [], landuse: [], resourceNodes: [],
    stats: {
      buildingCount: 0, roadCount: 0,
      resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 },
      elevationRangeMeters: 20, processedTimeMs: 0,
    },
    fetchedAt: 0, source: 'test',
  } as unknown as MapData;
}

test('with a real path grid, a builder crew must reach the wall and finish it', () => {
  let state = createInitialSettlementState('Grid Test');
  state = establishSettlementHQ(state, makeHq());

  const map = makeMap();
  const grid = new PathGrid(map);

  const placed = buildFreestanding(state, 'wooden_palisade' as never, { x: 60, z: 0 }, 8, 8, 4.5, 0);
  assert.ok(placed.success, placed.error);
  state = placed.newState;
  const palisadeId = state.freestandingBuildings[0].buildingId;

  state.stockpile.materials.wood = 400;
  state.stockpile.materials.metal = 400;
  state.stockpile.materials.bricks = 400;

  // Register the wall as a path obstacle (as useWorldEffects does).
  grid.setFreestandingObstacles(state.freestandingBuildings);
  const order = () => state.constructionOrders!.find((o) => String(o.buildingId) === String(palisadeId))!;
  const bldg = () => state.freestandingBuildings.find((f) => String(f.buildingId) === String(palisadeId))!;

  let completed = false;
  for (let i = 0; i < 2400; i++) {
    const isNight = Math.floor(i / 300) % 2 === 1;
    state = tickSettlementSimulation(state, 1, grid, isNight).newState;
    if (bldg().constructionStatus === 'completed') { completed = true; break; }
  }
  assert.ok(completed, `palisade must complete with a real grid (order=${order()?.state}, progress=${bldg().constructionProgress}%)`);
});
