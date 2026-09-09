import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freestandingFootprintOverlapsBuildings,
  getFreestandingCollisionPolygon,
} from '../src/services/freestandingFootprint';

const square = (cx: number, cz: number, half: number) => [
  { x: cx - half, z: cz - half },
  { x: cx + half, z: cz - half },
  { x: cx + half, z: cz + half },
  { x: cx - half, z: cz + half },
];

test('overlaps: freestanding footprint inside an OSM building is rejected', () => {
  // 12x12 OSM building centred at origin; a 10x12 facility centred inside it.
  const hit = freestandingFootprintOverlapsBuildings(
    { typeId: 'warehouse', position: { x: 0, z: 0 }, rotationDeg: 0, width: 10, length: 12 },
    [{ polygon: square(0, 0, 6) }]
  );
  assert.equal(hit, true);
});

test('overlaps: wall slicing through a building is rejected', () => {
  // A long wall run crossing the building's footprint.
  const hit = freestandingFootprintOverlapsBuildings(
    { typeId: 'wooden_palisade', position: { x: 0, z: 0 }, rotationDeg: 90, width: 2.4, length: 30 },
    [{ polygon: square(0, 0, 6) }]
  );
  assert.equal(hit, true);
});

test('clear: freestanding footprint fully outside buildings passes', () => {
  const hit = freestandingFootprintOverlapsBuildings(
    { typeId: 'warehouse', position: { x: 40, z: 40 }, rotationDeg: 0, width: 16, length: 22 },
    [{ polygon: square(0, 0, 6) }]
  );
  assert.equal(hit, false);
});

test('grazing: wall butted flush against a building edge is allowed (tolerance)', () => {
  // Building spans x in [-6, 6]. A wall running along Z (length axis), centred
  // on the building's right boundary (x = 6), spans x in [4.8, 7.2] — a 1.2 m
  // flush contact that the wall-family allowance (1.6 m) permits, matching the
  // fence-run snap behaviour.
  const flush = freestandingFootprintOverlapsBuildings(
    { typeId: 'wooden_palisade', position: { x: 6, z: 0 }, rotationDeg: 0, width: 2.4, length: 10 },
    [{ polygon: square(0, 0, 6) }]
  );
  assert.equal(flush, false, 'flush-butted wall should be allowed');

  // But the same wall shifted deeper inside IS a collision (3+ m penetration).
  const through = freestandingFootprintOverlapsBuildings(
    { typeId: 'wooden_palisade', position: { x: 3, z: 0 }, rotationDeg: 0, width: 2.4, length: 10 },
    [{ polygon: square(0, 0, 6) }]
  );
  assert.equal(through, true, 'wall through the building interior should be rejected');
});

test('rotation: rotated footprint that only intersects when rotated is rejected', () => {
  // Two axis-aligned rectangles that miss each other on the bounding box of
  // one orientation, but a 45°-rotated long wall crosses the building.
  const hit = freestandingFootprintOverlapsBuildings(
    { typeId: 'wooden_palisade', position: { x: 10, z: 0 }, rotationDeg: 45, width: 2.4, length: 20 },
    [{ polygon: square(0, 0, 6) }]
  );
  assert.equal(hit, true);
});

test('facility grazing tolerance: sub-metre graze passes, deeper penetration blocks', () => {
  // Warehouse 10 m wide centred at x = 11: footprint x in [6, 16], touching
  // the building's boundary (x = 6) exactly — a graze, allowed.
  const graze = freestandingFootprintOverlapsBuildings(
    { typeId: 'warehouse', position: { x: 11, z: 0 }, rotationDeg: 0, width: 10, length: 12 },
    [{ polygon: square(0, 0, 6) }]
  );
  assert.equal(graze, false, 'sub-metre edge graze should be allowed');

  // Centred at x = 10: footprint x in [5, 15] — a 1 m overlap, beyond the
  // 0.5 m facility tolerance, rejected.
  const inside = freestandingFootprintOverlapsBuildings(
    { typeId: 'warehouse', position: { x: 10, z: 0 }, rotationDeg: 0, width: 10, length: 12 },
    [{ polygon: square(0, 0, 6) }]
  );
  assert.equal(inside, true, 'facility overlapping 1 m into a building should be rejected');
});

test('empty candidate list never blocks', () => {
  const hit = freestandingFootprintOverlapsBuildings(
    { typeId: 'warehouse', position: { x: 0, z: 0 }, rotationDeg: 0 },
    []
  );
  assert.equal(hit, false);
});

test('collision polygon is a rotated rectangle matching requested dims', () => {
  const poly = getFreestandingCollisionPolygon({
    typeId: 'warehouse',
    position: { x: 100, z: 100 },
    rotationDeg: 0,
    width: 16,
    length: 22,
  });
  assert.equal(poly.length, 4);
  // Half-extents: 8 in x, 11 in z around the centre.
  const xs = poly.map((p) => p.x);
  const zs = poly.map((p) => p.z);
  assert.ok(Math.abs(Math.max(...xs) - 108) < 1e-6);
  assert.ok(Math.abs(Math.min(...xs) - 92) < 1e-6);
  assert.ok(Math.abs(Math.max(...zs) - 111) < 1e-6);
  assert.ok(Math.abs(Math.min(...zs) - 89) < 1e-6);
});
