import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptBuilding,
  createInitialSettlementState,
} from '../src/services/settlementService';
import {
  ADAPT_REFERENCE_VOLUME_M3,
  FUNCTIONAL_BUILDING_DEFINITIONS,
  getAdaptedCost,
} from '../src/data/functionalBuildings';
import type { BuildingPolygon, Point2D } from '../src/types/map';
import type { SettlementState } from '../src/types/settlement';

/** A researched, fully-looted, unadapted warehouse fixture. */
function makeState(name = 'Econ Test'): SettlementState {
  const fresh = createInitialSettlementState(name);
  fresh.stockpile.materials = { wood: 99999, metal: 99999, bricks: 99999, tools: 999 };
  return {
    ...fresh,
    buildingSearches: new Map([[
      'econ_bldg_1',
      { searched: true, searchProgress: 100, unlootedItems: [], lootedItems: [] },
    ]]),
  } as unknown as SettlementState;
}

function makeBldg(polygon: Point2D[], height = 8, id = 'econ_bldg_1'): BuildingPolygon {
  const xs = polygon.map((p) => p.x);
  const zs = polygon.map((p) => p.z);
  return {
    id,
    type: 'warehouse',
    rawType: 'warehouse',
    name: 'Econ Warehouse',
    height,
    levels: Math.max(1, Math.round(height / 4)),
    center: { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 },
    polygon,
  } as unknown as BuildingPolygon;
}

/** 10×10 = 100 m² footprint. */
const SQUARE: Point2D[] = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
];

/** A tool-bearing, adaptation-eligible definition. */
const TOOL_DEF = Object.values(FUNCTIONAL_BUILDING_DEFINITIONS).find(
  (d) => d.adaptationAllowed && (d.adaptationCost.tools || 0) > 0
)!;
const TOOL_BASE = TOOL_DEF.adaptationCost.tools || 1;
const PLAIN_DEF = FUNCTIONAL_BUILDING_DEFINITIONS.warehouse;

test('reference shell (100 m² × 8 m) prices match the legacy reference costs', () => {
  assert.equal(ADAPT_REFERENCE_VOLUME_M3, 800, 'reference volume constant is documented');
  // Exact reference volume → scale 1, no fit modifier (OSM type not preferred).
  const full = getAdaptedCost('warehouse', 'residential', 100, 8);
  assert.equal(full.wood, PLAIN_DEF.adaptationCost.wood, 'wood at reference volume = reference cost');
  assert.equal(full.metal, PLAIN_DEF.adaptationCost.metal, 'metal at reference volume = reference cost');
  assert.equal(full.bricks, PLAIN_DEF.adaptationCost.bricks, 'bricks at reference volume = reference cost');
  assert.equal(full.tools || 0, 0, 'a tool-less type stays tool-free');
});

test('adaptation cost scales linearly with the real shell volume, not per type', () => {
  // 3200 m³ is exactly 4× the 800 m³ reference → 4× every material.
  const ref = getAdaptedCost('warehouse', 'residential', 100, 8);
  const big = getAdaptedCost('warehouse', 'residential', 200, 16);
  assert.equal(big.wood, ref.wood * 4, 'wood quadruples with a 4×-volume shell');
  assert.equal(big.metal, ref.metal * 4);
  assert.equal(big.bricks, ref.bricks * 4);

  // A genuinely tiny structure costs a fraction of the reference.
  const tiny = getAdaptedCost('warehouse', 'residential', 40, 4); // 160 m³ → ×0.2
  assert.equal(tiny.wood, Math.max(1, Math.round(PLAIN_DEF.adaptationCost.wood * 0.2)));
  assert.ok(
    tiny.wood < PLAIN_DEF.adaptationCost.wood,
    'a small building is genuinely cheaper than the flat legacy price'
  );
});

test('preferred-OSM discount is proportional to size, not a flat price cut', () => {
  const preferred = getAdaptedCost('warehouse', 'warehouse', 200, 16); // scale 4 × 0.75
  assert.equal(preferred.wood, Math.round(PLAIN_DEF.adaptationCost.wood * 4 * 0.75));
  assert.equal(preferred.metal, Math.round(PLAIN_DEF.adaptationCost.metal * 4 * 0.75));
  assert.equal(preferred.bricks, Math.round(PLAIN_DEF.adaptationCost.bricks * 4 * 0.75));
  // The discount is still recognisable at any size.
  const preferredRef = getAdaptedCost('warehouse', 'warehouse', 100, 8);
  assert.ok(preferredRef.wood < PLAIN_DEF.adaptationCost.wood, 'preferred fit discount applies');
});

test('tools scale with volume too, floor 1, and stay zero on tool-less types', () => {
  const toolRef = getAdaptedCost(TOOL_DEF.id, undefined, 100, 8);
  assert.equal(toolRef.tools, TOOL_BASE, `reference build keeps its ${TOOL_BASE} tool cost (got ${toolRef.tools})`);
  const toolBig = getAdaptedCost(TOOL_DEF.id, undefined, 200, 16); // 4× volume
  assert.equal(toolBig.tools, TOOL_BASE * 4, '4× volume → 4× the tools');
  const plain = getAdaptedCost('warehouse', undefined, 200, 16);
  assert.equal(plain.tools || 0, 0);
});

test('adaptBuilding charges the size-derived cost through the construction order', () => {
  const state = makeState();
  const bldg = makeBldg(SQUARE, 8); // 800 m³ → reference, warehouse-preferred fit
  const res = adaptBuilding(state, bldg, 'warehouse', 100);
  assert.ok(res.success, `adaptation must succeed: ${res.error || ''}`);
  const order = res.newState.constructionOrders?.find((o) => o.buildingId === 'econ_bldg_1');
  assert.ok(order, 'construction order queued');
  // warehouse is a preferred OSM type: 35 wood × 0.75 = 26.25 → 26.
  assert.equal(order!.totalCost.wood, 26, 'full conversion at reference volume uses the discounted size price');
});

test('a huge building is proportionally expensive AND its partial expansion stays additive', () => {
  const big = makeBldg(SQUARE, 16, 'econ_bldg_1');
  // Make the footprint 200 m² (10×20) so the volume is 3200 m³ → 4× reference.
  big.polygon = [
    { x: 0, z: 0 },
    { x: 20, z: 0 },
    { x: 20, z: 10 },
    { x: 0, z: 10 },
  ];
  big.center = { x: 10, z: 5 };

  const state = makeState('Big');
  const fullPrice = getAdaptedCost('warehouse', 'warehouse', 200, 16); // 105 wood
  const partial = adaptBuilding(state, big, 'warehouse', 50);
  assert.ok(partial.success, `50% must succeed: ${partial.error || ''}`);
  const p = partial.newState.adaptedBuildings.get('econ_bldg_1') as any;
  assert.equal(p.adaptationPercentage, 50);
  const partialOrder = partial.newState.constructionOrders?.find((o) => o.buildingId === 'econ_bldg_1');
  assert.equal(partialOrder!.totalCost.wood, Math.ceil(fullPrice.wood * 0.5), '50% of a huge building costs half its huge price');
  assert.ok(
    partialOrder!.totalCost.wood > getAdaptedCost('warehouse', 'warehouse', 100, 8).wood,
    'half of a 3200 m³ shell still costs more than a whole reference-size shell'
  );

  // Complete the partial, then expand to 100% — the expansion charges the rest.
  const completed = {
    ...partial.newState,
    adaptedBuildings: new Map([[
      'econ_bldg_1',
      { ...p, constructionStatus: 'completed', constructionProgress: 100, constructionWorkDone: p.constructionWorkRequired },
    ]]),
  } as unknown as SettlementState;
  const expanded = adaptBuilding(completed, big, 'warehouse', 100);
  assert.ok(expanded.success, `expansion must succeed: ${expanded.error || ''}`);
  const expandedOrder = expanded.newState.constructionOrders?.find((o) => o.buildingId === 'econ_bldg_1');
  assert.equal(expandedOrder!.totalCost.wood, Math.ceil(fullPrice.wood * 0.5), 'expansion charges the remaining half of the huge price');
});
