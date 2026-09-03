import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptBuilding,
  buildFreestanding,
  createInitialSettlementState,
} from '../src/services/settlementService';
import { getAdaptedCost, getConstructionSurcharge } from '../src/data/functionalBuildings';
import type { BuildingPolygon, Point2D } from '../src/types/map';
import type { SettlementState } from '../src/types/settlement';

function makeState(withSciMat: boolean): SettlementState {
  const fresh = createInitialSettlementState('Surcharge Test');
  fresh.stockpile.materials = { wood: 99999, metal: 99999, bricks: 99999, tools: 99 };
  fresh.stockpile.materials.scientific_materials = withSciMat ? 5 : 0;
  return {
    ...fresh,
    buildingSearches: new Map([
      ['rc_bldg_1', { searched: true, searchProgress: 100, unlootedItems: [], lootedItems: [] }],
      ['rc_bldg_2', { searched: true, searchProgress: 100, unlootedItems: [], lootedItems: [] }],
    ]),
  } as unknown as SettlementState;
}

function makeBldg(id: string, poly: Point2D[]): BuildingPolygon {
  const xs = poly.map((p) => p.x);
  const zs = poly.map((p) => p.z);
  return {
    id,
    type: 'school',
    rawType: 'school',
    name: 'School',
    height: 8,
    levels: 2,
    center: { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 },
    polygon: poly,
  } as unknown as BuildingPolygon;
}

const SQUARE: Point2D[] = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
];

test('getConstructionSurcharge: research center costs a flat 1 SciMat, other types 0', () => {
  assert.equal(getConstructionSurcharge('research_center').scientific_materials, 1);
  assert.equal(getConstructionSurcharge('warehouse').scientific_materials, 0);
  assert.equal(getConstructionSurcharge('headquarters').scientific_materials, 0);
});

test('surcharge rides on the size-derived adaptation price at any volume (never scaled)', () => {
  const tiny = getAdaptedCost('research_center', 'school', 40, 4); // 160 m³
  const huge = getAdaptedCost('research_center', 'school', 400, 16); // 6400 m³
  assert.equal(tiny.scientific_materials, 1, 'tiny shell still costs exactly 1');
  assert.equal(huge.scientific_materials, 1, 'huge shell still costs exactly 1 (flat)');
  assert.ok(huge.wood > tiny.wood, 'volume scaling still applies to the material bill');
});

test('adapting a building into a research center requires the 1 SciMat up front', () => {
  const bldg = makeBldg('rc_bldg_1', SQUARE);
  // Research gate: createInitialSettlementState has no research unlocked, and
  // research_center has no researchRequirement — but the adaptation needs the
  // SciMat surcharge regardless.
  const denied = adaptBuilding(makeState(false), bldg, 'research_center', 100);
  assert.equal(denied.success, false);
  assert.ok((denied.error || '').includes('SciMat'), 'clear missing-SciMat error');

  const granted = adaptBuilding(makeState(true), bldg, 'research_center', 100);
  assert.equal(granted.success, true);
  const order = granted.newState.constructionOrders.find((o) => o.buildingId === 'rc_bldg_1');
  assert.ok(order, 'construction order created');
  assert.equal(order?.totalCost.scientific_materials, 1, 'order carries the surcharge');
});

test('expanding an existing research center does not charge a second SciMat', () => {
  const state = makeState(true);
  const bldg = makeBldg('rc_bldg_1', SQUARE);
  const first = adaptBuilding(state, bldg, 'research_center', 50);
  assert.equal(first.success, true);
  const order1 = first.newState.constructionOrders.find((o) => o.buildingId === 'rc_bldg_1');
  assert.equal(order1?.totalCost.scientific_materials, 1, 'first conversion: one SciMat');

  const second = adaptBuilding(first.newState, bldg, 'research_center', 100);
  assert.equal(second.success, true);
  const order2 = second.newState.constructionOrders.find((o) => o.buildingId === 'rc_bldg_1');
  assert.equal(
    (order2?.totalCost.scientific_materials || 0),
    0,
    'expansion to 100%: no additional SciMat'
  );
});

test('freestanding research centers carry the surcharge and honour it', () => {
  // Freestanding conversions require Advanced Masonry — unlock it so the test
  // reaches the SciMat affordability gate rather than the research gate.
  const noSciMat = makeState(false);
  noSciMat.research = { unlockedNodes: ['advanced_masonry'], activeResearchId: null, activeProgressSec: 0 };
  const denied = buildFreestanding(noSciMat, 'research_center', { x: 50, z: 50 });
  assert.equal(denied.success, false);
  assert.ok((denied.error || '').includes('SciMat'), 'freestanding build blocked without SciMat');

  const withSciMat = makeState(true);
  withSciMat.research = { unlockedNodes: ['advanced_masonry'], activeResearchId: null, activeProgressSec: 0 };
  const granted = buildFreestanding(withSciMat, 'research_center', { x: 50, z: 50 });
  assert.equal(granted.success, true);
  const freestanding = granted.newState.freestandingBuildings.find(
    (b) => b.typeId === 'research_center'
  );
  assert.ok(freestanding, 'freestanding research center created');
  const order = granted.newState.constructionOrders.find(
    (o) => String(o.buildingId) === String(freestanding?.buildingId)
  );
  assert.equal(order?.totalCost.scientific_materials, 1, 'order carries the surcharge');
});