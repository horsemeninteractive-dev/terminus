import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialSettlementState,
  establishSettlementHQ,
  buildFreestanding,
} from '../src/services/settlementService';
import { tickSettlementSimulation } from '../src/services/populationService';
import { PathGrid, stepAlongPath } from '../src/services/pathfindingService';
import type { SettlementState } from '../src/types/settlement';
import type { BuildingPolygon, MapData } from '../src/types/map';

function makeHq(): BuildingPolygon {
  return {
    id: 'b_hq_field_regression',
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
  return {
    cityName: 'T',
    bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 },
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

test('a freestanding field with assigned builders must be constructed', () => {
  let state = createInitialSettlementState('Field Regression');
  state = establishSettlementHQ(state, makeHq());

  const map = makeMap();
  const grid = new PathGrid(map);

  const placed = buildFreestanding(state, 'field' as never, { x: 40, z: 30 }, 12, 12, 1, 0);
  assert.ok(placed.success, placed.error);
  state = placed.newState;

  state.stockpile.materials.wood = 400;
  state.stockpile.materials.metal = 400;
  state.stockpile.materials.bricks = 400;

  // Register the field footprint as a path obstacle (as useWorldEffects does).
  grid.setFreestandingObstacles(state.freestandingBuildings);

  const bldg = () => state.freestandingBuildings[0];
  const order = () => state.constructionOrders!.find(
    (o) => String(o.buildingId) === String(bldg().buildingId)
  )!;

  // The crew is assigned (labour distribution gave the site builders), the
  // stockpile covers the cost, and the field's own footprint is a pathing
  // obstacle. The crew must still reach the site edge and finish it — the
  // footprint must never trap its own construction crew at HQ.
  assert.ok((bldg().assignedWorkers || 0) > 0, 'labour distribution must staff the site');
  assert.ok(
    grid.isFreestandingBlocked(bldg().position.x, bldg().position.z),
    'precondition: the field centre sits inside its own blocked footprint cells'
  );

  let completed = false;
  for (let i = 0; i < 600; i++) {
    const isNight = Math.floor(i / 300) % 2 === 1;
    state = tickSettlementSimulation(state, 1, grid, isNight).newState;
    if (bldg().constructionStatus === 'completed') { completed = true; break; }
  }

  const o = order();
  assert.ok(
    completed,
    `field must complete (order=${o?.state}, progress=${bldg().constructionProgress}%)`
  );
});

test('a crew whose goal is unreachable stays put rather than phasing through walls', () => {
  let state = createInitialSettlementState('Enclosed Regression');
  state = establishSettlementHQ(state, makeHq());

  const map = makeMap();
  const grid = new PathGrid(map);

  // Fully-enclosed 20×20 box: four wall segments, no gate.
  const vL = buildFreestanding(state, 'wooden_palisade' as never, { x: -30, z: -20 }, 2.4, 20, 3, 0);
  assert.ok(vL.success, vL.error);
  state = vL.newState;
  const vR = buildFreestanding(state, 'wooden_palisade' as never, { x: -10, z: -20 }, 2.4, 20, 3, 0);
  assert.ok(vR.success, vR.error);
  state = vR.newState;
  const hT = buildFreestanding(state, 'wooden_palisade' as never, { x: -20, z: -29.4 }, 20, 2.4, 3, 90);
  assert.ok(hT.success, hT.error);
  state = hT.newState;
  const hB = buildFreestanding(state, 'wooden_palisade' as never, { x: -20, z: -10.6 }, 20, 2.4, 3, 90);
  assert.ok(hB.success, hB.error);
  state = hB.newState;
  grid.setFreestandingObstacles(state.freestandingBuildings);

  // A goal deep inside the enclosure is unreachable for a crew standing
  // outside. The fallback may walk the crew toward the enclosure's outer
  // edge, but it must NEVER end up inside a blocked cell (no phasing through
  // walls) — that is the invariant the dead-path branch protects.
  const unreachable = { x: -20, z: -20 };
  let x = 0, z = 0;
  let ps: import('../src/services/pathfindingService').PathState | null = null;
  for (let i = 0; i < 120; i++) {
    const res = stepAlongPath(grid, ps, x, z, unreachable.x, unreachable.z, 6.0, 1, 2.5);
    x = res.x; z = res.z; ps = res.state;
  }
  assert.ok(
    !grid.isFreestandingBlocked(x, z),
    `crew must never stand inside blocked cells (got ${x.toFixed(2)},${z.toFixed(2)})`
  );
});
