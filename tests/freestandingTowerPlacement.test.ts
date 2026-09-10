import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freestandingFootprintOverlapsBuildings,
} from '../src/services/freestandingFootprint';

const square = (cx: number, cz: number, half: number) => [
  { x: cx - half, z: cz - half },
  { x: cx + half, z: cz - half },
  { x: cx + half, z: cz + half },
  { x: cx - half, z: cz + half },
];

// A wooden tower footprint: 5.2m square centred at the origin (the collision
// polygon the renderer/placement code generates for towers).
const towerPoly = square(0, 0, 2.6);

test('wall butted flush against a tower edge is allowed', () => {
  // Tower spans x in [-2.6, 2.6]. A palisade segment running along Z with its
  // centre on the tower's east edge (x = 2.6) spans x in [2.0, 3.2] — 0.6 m
  // of intended flush contact, well inside the wall-family 1.6 m allowance.
  const flush = freestandingFootprintOverlapsBuildings(
    { typeId: 'wooden_palisade', position: { x: 2.6, z: 0 }, rotationDeg: 0, width: 2.4, length: 10 },
    [{ polygon: towerPoly }]
  );
  assert.equal(flush, false, 'wall butted flush to a tower must be placeable');
});

test('wall overlapping a tower by more than the flush allowance is rejected', () => {
  // Same wall centred 1m inside the tower edge: its inner face reaches x = 0.2,
  // a ~2.8 m penetration — far past the 1.6 m flush allowance.
  const through = freestandingFootprintOverlapsBuildings(
    { typeId: 'wooden_palisade', position: { x: 1.4, z: 0 }, rotationDeg: 0, width: 2.4, length: 10 },
    [{ polygon: towerPoly }]
  );
  assert.equal(through, true, 'wall slicing into a tower must be rejected');
});

test('second tower overlapping the first is still rejected (no freestanding stack)', () => {
  const hit = freestandingFootprintOverlapsBuildings(
    { typeId: 'wooden_tower', position: { x: 1, z: 0 }, rotationDeg: 0, width: 5.2, length: 5.2 },
    [{ polygon: towerPoly }]
  );
  assert.equal(hit, true, 'towers must not overlap each other');
});
