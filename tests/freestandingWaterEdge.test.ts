/**
 * §7.1 Water-edge placement regression tests.
 *
 * Bug: freestanding walls were rejected whenever the footprint CENTRE or any
 * CORNER landed inside a mapped water polygon — no tolerance — and a dragged
 * wall RUN was cancelled wholesale if any single segment grazed the riverbank.
 * Result: players could not build to the water's edge even on visibly dry
 * ground (OSM water polygons are simplified/expanded, so the mapped waterline
 * is approximate).
 *
 * Fix: freestandingFootprintOverlapsWater insets the footprint by
 * WATER_EDGE_TOLERANCE and requires a real straddle (interior sample or edge
 * crossing); wall runs skip water segments instead of cancelling.
 * Run: node --import tsx --import ./tests/register-loader.cjs --test tests/freestandingWaterEdge.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freestandingFootprintOverlapsWater,
  WATER_EDGE_TOLERANCE,
  getFreestandingDimensions,
} from '../src/services/freestandingFootprint';
import type { Point2D } from '../src/types/map';

/** A big rectangular lake: x in [-100, 100], z in [-100, 100]. */
const LAKE: Point2D[] = [
  { x: -100, z: -100 },
  { x: 100, z: -100 },
  { x: 100, z: 100 },
  { x: -100, z: 100 },
];

/** A narrow east-west river strip 8m wide centred on z = 0. */
const RIVER: Point2D[] = [
  { x: -500, z: -4 },
  { x: 500, z: -4 },
  { x: 500, z: 4 },
  { x: -500, z: 4 },
];

function wallRun(width: number, rotationDeg: number) {
  return { typeId: 'wooden_palisade', width, length: 10, rotationDeg };
}

test('a wall whose leading edge grazes the waterline still builds (tolerance)', () => {
  // Wall thickness 2.4 along x, positioned so its leading edge pokes 0.5m past
  // the mapped lake boundary — most of the wall is on dry ground. Under the
  // old rule (any corner inside = blocked) this spot was unbuildable.
  const w = 2.4;
  const centreX = -100 - w / 2 + 0.5; // leading edge 0.5m inside the mapped waterline
  const res = freestandingFootprintOverlapsWater(
    { ...wallRun(w, 0), position: { x: centreX, z: 0 } },
    [LAKE]
  );
  assert.equal(res, false, 'a shallow poke past the mapped waterline must NOT block placement');
});

test('a wall fully straddling water is still rejected', () => {
  const res = freestandingFootprintOverlapsWater(
    { ...wallRun(2.4, 90), position: { x: 0, z: 0 } }, // length axis along z, centre in the river
    [RIVER]
  );
  assert.equal(res, true, 'a footprint in the middle of water must be blocked');
});

test('a wall whose long edge dips past the tolerance into a river IS rejected', () => {
  // Wall parallel to the river, its near edge more than WATER_EDGE_TOLERANCE
  // past the mapped waterline — genuinely in the water, not a bank graze.
  const centreZ = 4 + WATER_EDGE_TOLERANCE + 0.5; // edge sits 0.5m past the tolerance line
  const res = freestandingFootprintOverlapsWater(
    { ...wallRun(2.4, 0), position: { x: 0, z: centreZ } },
    [RIVER]
  );
  assert.equal(res, true, 'an edge genuinely past the waterline must block');
});

test('a wall running along the bank with only its side edge crossing is caught by edge intersection', () => {
  // Segment perpendicular to the river, spanning fully across it: corners are
  // both on dry ground, only the long edges cross the water — must be caught
  // by the edge-intersection check (this is a bridge-straddling placement).
  const res = freestandingFootprintOverlapsWater(
    { ...wallRun(2.4, 90), position: { x: 0, z: 0 } },
    [RIVER]
  );
  assert.equal(res, true);
});

test('empty/no water polygons never block placement', () => {
  const res = freestandingFootprintOverlapsWater(
    { ...wallRun(2.4, 0), position: { x: 0, z: 0 } },
    []
  );
  assert.equal(res, false);
});

test('walls keep their canonical dimensions (drag length overrides at runtime)', () => {
  const dims = getFreestandingDimensions('wooden_palisade');
  assert.ok(dims.width < 4, 'wall thickness stays thin');
});
