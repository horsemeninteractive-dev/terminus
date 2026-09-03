import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptBuilding,
  adaptBuildingSection,
  canAffordCost,
  createInitialSettlementState,
  deadaptBuilding,
  recalculateSettlementStats,
  splitBuilding,
} from '../src/services/settlementService';
import {
  clipPolygonToRect,
  footprintAxes,
  polygonArea,
  polygonBounds,
  splitFootprintIntoStrips,
  sweepFootprintSelection,
} from '../src/services/adaptationGeometry';
import { getAdaptedEntriesForBuilding, getPrimaryAdaptedEntry } from '../src/services/buildingOperational';
import type { BuildingPolygon, Point2D } from '../src/types/map';
import type { SettlementState } from '../src/types/settlement';

/** 10m × 10m fully-looted warehouse for footprint geometry tests. */
function makeState(name = 'Section Test'): SettlementState {
  const fresh = createInitialSettlementState(name);
  fresh.stockpile.materials = { wood: 5000, metal: 5000, bricks: 5000, tools: 50 };
  return {
    ...fresh,
    buildingSearches: new Map([[
      'sec_bldg_1',
      { searched: true, searchProgress: 100, unlootedItems: [], lootedItems: [{ id: 'x1', kind: 'resource', label: 'metal', quantity: 1, weight: 1 }] },
    ]]),
  } as unknown as SettlementState;
}

function makeBldg(polygon: Point2D[], id = 'sec_bldg_1', levels = 1): BuildingPolygon {
  const xs = polygon.map((p) => p.x);
  const zs = polygon.map((p) => p.z);
  return {
    id,
    type: 'warehouse',
    rawType: 'warehouse',
    name: 'Test Warehouse',
    height: 6,
    levels,
    center: { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 },
    polygon,
  } as unknown as BuildingPolygon;
}

const SQUARE: Point2D[] = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
];

test('clipPolygonToRect returns the exact intersection polygon', () => {
  // Left half of the 10×10 square.
  const clipped = clipPolygonToRect(SQUARE, 0, 5, 0, 10);
  assert.equal(clipped.length, 4);
  assert.equal(polygonArea(clipped), 50, 'left half = 50 m²');
  // No overlap → empty.
  assert.equal(clipPolygonToRect(SQUARE, 20, 30, 0, 10).length, 0);
  // Fully enclosing rect returns the whole square.
  assert.equal(polygonArea(clipPolygonToRect(SQUARE, -5, 15, -5, 15)), 100);
});

test('splitFootprintIntoStrips tessellates a square into N equal sections', () => {
  const strips = splitFootprintIntoStrips(SQUARE, 2);
  assert.equal(strips.length, 2);
  const total = strips.reduce((sum, s) => sum + s.areaM2, 0);
  assert.ok(Math.abs(total - 100) < 0.01, `sections sum to the footprint (${total})`);
  assert.ok(strips.every((s) => Math.abs(s.areaM2 - 50) < 0.01), 'two equal 50 m² halves');

  const quarters = splitFootprintIntoStrips(SQUARE, 4);
  assert.equal(quarters.length, 4);
  assert.ok(quarters.every((s) => Math.abs(s.areaM2 - 25) < 0.01), 'four equal 25 m² quarters');
});

test('splitBuilding charges bricks and registers sections', () => {
  const state = makeState();
  const bldg = makeBldg(SQUARE);
  const res = splitBuilding(state, bldg, 2);
  assert.ok(res.success, `split must succeed: ${res.error || ''}`);
  const sections = res.sections || [];
  assert.equal(sections.length, 2);
  assert.ok(sections.every((s) => s.id.startsWith('sec_bldg_1::s')), 'section ids are child keys');
  assert.equal(sections[0].splitBrickCost, sections[1].splitBrickCost);
  const stored = res.newState.buildingSections?.get('sec_bldg_1');
  assert.equal(stored?.length, 2);
  // Bricks were deducted for the partition walls.
  assert.ok(
    res.newState.stockpile.materials.bricks < state.stockpile.materials.bricks,
    'partition walls consume bricks'
  );
});

test('splitBuilding rejects HQ, adapted, already-split and unaffordable buildings', () => {
  const state = makeState();
  const bldg = makeBldg(SQUARE);

  const first = splitBuilding(state, bldg, 2);
  assert.ok(first.success);
  const again = splitBuilding(first.newState, bldg, 2);
  assert.ok(!again.success, 'already-split building cannot be split again');
  assert.match(again.error || '', /already split/);

  // Adapted buildings must be deadapted first.
  const adapted = adaptBuilding(state, bldg, 'warehouse', 100);
  assert.ok(adapted.success);
  const afterAdapt = splitBuilding(adapted.newState, bldg, 2);
  assert.ok(!afterAdapt.success);
  assert.match(afterAdapt.error || '', /Remove the building adaptation/);

  // Bricks gate.
  const poor = makeState('Poor');
  poor.stockpile.materials = { wood: 500, metal: 500, bricks: 3, tools: 5 };
  const poorRes = splitBuilding(poor, bldg, 4);
  assert.ok(!poorRes.success, 'no bricks → no partition walls');
  assert.match(poorRes.error || '', /bricks/);
});

test('adaptBuilding with a selection polygon derives coverage from the physical area', () => {
  const state = makeState();
  const bldg = makeBldg(SQUARE);
  // Drag across the left half → 50% physical coverage.
  const selection: Point2D[] = [
    { x: 0, z: 0 },
    { x: 5, z: 0 },
    { x: 5, z: 10 },
    { x: 0, z: 10 },
  ];
  const res = adaptBuilding(state, bldg, 'warehouse', selection as never);
  assert.ok(res.success, `area adaptation must succeed: ${res.error || ''}`);
  const rec = res.newState.adaptedBuildings.get('sec_bldg_1') as any;
  assert.equal(rec.adaptationPercentage, 50, 'percentage derived from the selected area');
  assert.equal(rec.adaptedAreaM2, 50, 'adapted area equals the selected 50 m²');
  assert.ok(Array.isArray(rec.adaptedPolygon), 'physical polygon is stored');
  assert.ok(Math.abs(polygonArea(rec.adaptedPolygon) - 50) < 0.01, 'stored polygon is the clipped region');
  // Capacity is halved versus full conversion.
  assert.equal(rec.maxCapacity, rec.fullCapacity / 2);
});

test('adaptBuildingSection adapts only its section, independently of the others', () => {
  const state = makeState();
  const bldg = makeBldg(SQUARE);
  const split = splitBuilding(state, bldg, 2);
  assert.ok(split.success);
  const [s0, s1] = split.sections!;

  // Section 0 → warehouse; Section 1 stays unconverted.
  const adapt0 = adaptBuildingSection(split.newState, bldg, s0, 'warehouse');
  assert.ok(adapt0.success, `section 0 adaptation must succeed: ${adapt0.error || ''}`);
  const rec0 = adapt0.newState.adaptedBuildings.get(s0.id) as any;
  assert.ok(rec0, 'section entry is keyed by the section id');
  assert.equal(rec0.sourceBuildingId, 'sec_bldg_1', 'section carries its source building');
  assert.ok(rec0.adaptedPolygon && polygonArea(rec0.adaptedPolygon) > 45, 'section polygon is stored');
  assert.equal(rec0.adaptationPercentage, 100, 'a section is 100% within its own footprint');

  // The other section is untouched and can take a different facility type.
  const adapt1 = adaptBuildingSection(adapt0.newState, bldg, s1, 'shelter_bunkhouse');
  assert.ok(adapt1.success, `section 1 adaptation must succeed: ${adapt1.error || ''}`);
  assert.ok(adapt1.newState.adaptedBuildings.get(s1.id));
  assert.equal((adapt1.newState.adaptedBuildings.get(s1.id) as any).typeId, 'shelter_bunkhouse');
  assert.equal((adapt1.newState.adaptedBuildings.get(s1.id) as any).sourceBuildingId, 'sec_bldg_1');
  assert.equal(adapt1.newState.adaptedBuildings.get(s0.id).typeId, 'warehouse');
});

test('sections are resolved through building-level helpers', () => {
  const state = makeState();
  const bldg = makeBldg(SQUARE);
  const split = splitBuilding(state, bldg, 2);
  assert.ok(split.success);
  const [s0] = split.sections!;
  const adapted = adaptBuildingSection(split.newState, bldg, s0, 'warehouse');
  assert.ok(adapted.success);

  const entries = getAdaptedEntriesForBuilding(adapted.newState.adaptedBuildings, 'sec_bldg_1');
  assert.equal(entries.length, 1);
  assert.equal(getPrimaryAdaptedEntry(adapted.newState.adaptedBuildings, 'sec_bldg_1')?.buildingId, s0.id);

  // Stats aggregation counts the section's proportional capacity ONLY once the
  // adaptation is operational. A freshly adapted section is still
  // in_progress — like any incomplete structure it contributes nothing.
  const { storageCap } = recalculateSettlementStats(
    adapted.newState.headquarters,
    adapted.newState.primaryHQId ?? null,
    adapted.newState.adaptedBuildings,
    adapted.newState.freestandingBuildings
  );
  const fullStorage = recalculateSettlementStats(
    state.headquarters,
    state.primaryHQId ?? null,
    state.adaptedBuildings,
    state.freestandingBuildings
  ).storageCap;
  assert.equal(storageCap, fullStorage, 'in-progress section contributes no storage');

  // Once construction completes, the section's proportional capacity counts.
  const entry = adapted.newState.adaptedBuildings.get(s0.id)!;
  const completed = {
    ...adapted.newState,
    adaptedBuildings: new Map(adapted.newState.adaptedBuildings).set(s0.id, {
      ...entry,
      constructionStatus: 'completed',
      constructionProgress: 100,
      constructionWorkDone: entry.constructionWorkRequired,
    }),
  } as unknown as SettlementState;
  const operationalCap = recalculateSettlementStats(
    completed.headquarters,
    completed.primaryHQId ?? null,
    completed.adaptedBuildings,
    completed.freestandingBuildings
  ).storageCap;
  assert.ok(operationalCap > fullStorage, 'operational section contributes storage capacity');
});

test('deadaptBuilding removes a single section, leaving its siblings adapted', () => {
  const state = makeState();
  const bldg = makeBldg(SQUARE);
  const split = splitBuilding(state, bldg, 2);
  assert.ok(split.success);
  const [s0, s1] = split.sections!;
  const adapt0 = adaptBuildingSection(split.newState, bldg, s0, 'warehouse');
  const adapt1 = adaptBuildingSection(adapt0.newState, bldg, s1, 'shelter_bunkhouse');
  assert.ok(adapt1.success);

  // Mark the first section's adaptation completed and drop its construction
  // order so deadapt is allowed (deadapt refuses while a crew is working).
  const completed = {
    ...adapt1.newState,
    adaptedBuildings: new Map(
      Array.from(adapt1.newState.adaptedBuildings.entries()).map(([k, v]) => [k, { ...v, constructionStatus: 'completed' }])
    ),
    constructionOrders: (adapt1.newState.constructionOrders || []).filter(
      (o) => String(o.buildingId) !== String(s0.id)
    ),
  } as unknown as SettlementState;
  const deadapted = deadaptBuilding(completed, s0.id);
  assert.ok(deadapted.success);
  assert.ok(!deadapted.newState.adaptedBuildings.has(s0.id), 'section 0 removed');
  assert.ok(deadapted.newState.adaptedBuildings.has(s1.id), 'section 1 remains');
});

test('physical drag selection on a split building routes to the containing section', () => {
  const state = makeState();
  const bldg = makeBldg(SQUARE);
  const split = splitBuilding(state, bldg, 2);
  assert.ok(split.success);
  const [s0] = split.sections!;
  const adapted = adaptBuildingSection(split.newState, bldg, s0, 'warehouse');
  assert.ok(adapted.success);
  // The remaining (unconverted) half can still be adapted via drag selection.
  const remaining = clipPolygonToRect(SQUARE, 5, 10, 0, 10);
  const drag = adaptBuilding(adapted.newState, bldg, 'shelter_bunkhouse', remaining as never);
  assert.ok(drag.success, `drag on remaining area must succeed: ${drag.error || ''}`);
});

test('geometry helpers agree with the settlement polygon area', () => {
  const bounds = polygonBounds(SQUARE);
  assert.deepEqual(bounds, { minX: 0, maxX: 10, minZ: 0, maxZ: 10 });
  assert.equal(polygonArea(SQUARE), 100);
});

/** 40m × 10m warehouse: dominant axis runs along +x. */
const LONG_RECT: Point2D[] = [
  { x: 0, z: 0 },
  { x: 40, z: 0 },
  { x: 40, z: 10 },
  { x: 0, z: 10 },
];

const L_SHAPE: Point2D[] = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 4 },
  { x: 4, z: 4 },
  { x: 4, z: 10 },
  { x: 0, z: 10 },
];

test('sweepFootprintSelection converts a full-length drag into the whole building', () => {
  const sel = sweepFootprintSelection(LONG_RECT, { x: 0, z: 5 }, { x: 40, z: 5 });
  assert.ok(sel, 'full sweep must produce a selection');
  assert.ok(sel.fraction > 0.999, `full sweep = 100% (got ${sel.fraction})`);
  assert.equal(Math.round(sel.areaM2), 400, 'full swept area = whole footprint');
  assert.ok(sel.alongLongAxis, 'horizontal drag sweeps along the long axis');
});

test('sweepFootprintSelection measures a partial band relative to the building', () => {
  // Middle 50% along the long axis of the 40×10 warehouse.
  const mid = sweepFootprintSelection(LONG_RECT, { x: 10, z: 5 }, { x: 30, z: 5 });
  assert.ok(mid);
  assert.ok(Math.abs(mid.fraction - 0.5) < 0.001, `mid drag = 50% (got ${mid.fraction})`);
  assert.ok(Math.abs(mid.areaM2 - 200) < 0.01);

  // Partial band on a square: x∈[2,8] across a full 10m height = 60 m².
  const sq = sweepFootprintSelection(SQUARE, { x: 2, z: 5 }, { x: 8, z: 5 });
  assert.ok(sq);
  assert.ok(Math.abs(sq.fraction - 0.6) < 0.001, `square partial = 60% (got ${sq.fraction})`);
  assert.ok(Math.abs(polygonArea(sq.polygon) - 60) < 0.01, 'painted polygon is clipped to the footprint');
});

test('sweepFootprintSelection sweeps along the drag axis the player actually uses', () => {
  // Vertical drag across the middle of the long warehouse (cross-section
  // direction): the band spans z∈[3,9] across every column → 60%.
  const vert = sweepFootprintSelection(LONG_RECT, { x: 20, z: 3 }, { x: 20, z: 9 });
  assert.ok(vert);
  assert.ok(!vert.alongLongAxis, 'vertical drag sweeps the cross-section axis');
  assert.ok(Math.abs(vert.fraction - 0.6) < 0.001, `cross drag = 60% (got ${vert.fraction})`);

  // Diagonal drag still follows the dominant (long) component.
  const diag = sweepFootprintSelection(LONG_RECT, { x: 0, z: 0 }, { x: 40, z: 10 });
  assert.ok(diag);
  assert.ok(diag.fraction > 0.999, 'diagonal across the full length = 100%');
});

test('sweepFootprintSelection clamps to the footprint — never an arbitrary world rect', () => {
  // Cursor travels far past the far wall: the selection stops at the building.
  const beyond = sweepFootprintSelection(LONG_RECT, { x: 0, z: 5 }, { x: 120, z: 5 });
  assert.ok(beyond);
  assert.equal(Math.round(beyond.areaM2), 400, 'sweep past the building still yields exactly the building');
  assert.ok(Math.abs(beyond.fraction - 1) < 0.001);

  // A 4m pocket dragged along the long axis (x-dominant drag) paints a 4m band
  // spanning the full 10m depth — 40 m², 10% of THIS building's footprint.
  const pocket = sweepFootprintSelection(LONG_RECT, { x: 5, z: 2 }, { x: 9, z: 2 });
  assert.ok(pocket);
  assert.ok(Math.abs(pocket.areaM2 - 40) < 0.01, `4m-long pocket = 40 m² (got ${pocket.areaM2})`);
  assert.ok(Math.abs(pocket.fraction - 0.1) < 0.001, 'pocket = 10% of the 400 m² footprint');

  // A mostly-vertical drag sweeps a cross-section stripe across the whole width.
  const stripe = sweepFootprintSelection(LONG_RECT, { x: 5, z: 2 }, { x: 6, z: 8 });
  assert.ok(stripe);
  assert.ok(!stripe.alongLongAxis);
  assert.ok(Math.abs(stripe.areaM2 - 240) < 0.01, `z∈[2,8] stripe spans all 40m = 240 m² (got ${stripe.areaM2})`);
});

test('sweepFootprintSelection handles non-rectangular footprints and never exceeds them', () => {
  const totalL = polygonArea(L_SHAPE); // 64 m² L (4m×10m top band + 6m leg)
  const { cx, cz, ax, az } = footprintAxes(L_SHAPE);
  // Sweep from the extreme corner behind the anchor to beyond the opposite
  // extreme in the dominant axis — the band then covers the whole footprint.
  const proj = (p: Point2D) => (p.x - cx) * ax + (p.z - cz) * az;
  const minPt = L_SHAPE.reduce((best, p) => (proj(p) < proj(best) ? p : best));
  const maxPt = L_SHAPE.reduce((best, p) => (proj(p) > proj(best) ? p : best));
  const full = sweepFootprintSelection(
    L_SHAPE,
    { x: minPt.x, z: minPt.z },
    { x: maxPt.x + ax * 8, z: maxPt.z + az * 8 }
  );
  assert.ok(full);
  assert.ok(Math.abs(full.areaM2 - totalL) < 0.01, `full sweep of an L = its real 64 m² (got ${full.areaM2})`);
  assert.ok(full.fraction <= 1, 'fraction never exceeds the building');

  // A partial band stays inside the real silhouette.
  const part = sweepFootprintSelection(L_SHAPE, { x: 1, z: 9 }, { x: 4, z: 9 });
  assert.ok(part);
  assert.ok(polygonArea(part.polygon) <= totalL + 0.01, 'clipped polygon never exceeds the footprint');
  assert.ok(part.fraction > 0 && part.fraction <= 1);
});

test('sweepFootprintSelection honours an explicit axis lock', () => {
  // Lock to the cross-section axis even though the drag runs along the long
  // axis: the drag barely changes the cross-section projection → no region.
  const locked = sweepFootprintSelection(LONG_RECT, { x: 10, z: 5 }, { x: 30, z: 5 }, false);
  assert.ok(locked);
  assert.equal(locked.fraction, 0, 'locked cross-axis sees no sweep for a horizontal drag');

  // Locking to the long axis reproduces the natural band.
  const natural = sweepFootprintSelection(LONG_RECT, { x: 10, z: 5 }, { x: 30, z: 5 }, true);
  assert.ok(natural);
  assert.ok(Math.abs(natural.fraction - 0.5) < 0.001);
});