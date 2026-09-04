import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPointInArea, isPointInsidePolygon } from '../src/services/scavengingService';
import type { WorldAreaBounds } from '../src/types/map';

/**
 * Regression coverage for the drag-box area tools (scavenge / gather /
 * demolish). When the camera is pitched instead of directly overhead, the
 * on-screen selection rectangle projects to a TRAPEZOID on the ground: the
 * far edge is narrower than the near edge. The old implementation tested the
 * axis-aligned bounding box of the projected corners, which swallows the two
 * corner wedges outside the trapezoid — pulling in buildings/nodes the player
 * never boxed in. The selection must instead test the projected quad.
 */

function makeObliqueBounds(): WorldAreaBounds {
  // Screen rect viewed from a pitched camera: AABB spans x ∈ [0, 100],
  // z ∈ [0, 100], but the projected quad narrows toward the far edge (z=0):
  // far edge only covers x ∈ [25, 75] while the near edge (z=100) is full width.
  const polygon = [
    { x: 25, z: 0 },  // far-left
    { x: 75, z: 0 },  // far-right
    { x: 100, z: 100 }, // near-right
    { x: 0, z: 100 },   // near-left
  ];
  return { minX: 0, maxX: 100, minZ: 0, maxZ: 100, polygon };
}

test('quad area excludes points inside the AABB but outside the projected box', () => {
  const bounds = makeObliqueBounds();
  // Inside the AABB (x=10, z=10) but outside the trapezoid (far edge starts at x=25).
  assert.equal(isPointInArea({ x: 10, z: 10 }, bounds), false, 'far-left wedge must be excluded');
  assert.equal(isPointInArea({ x: 90, z: 10 }, bounds), false, 'far-right wedge must be excluded');
});

test('quad area includes points the player actually boxed in', () => {
  const bounds = makeObliqueBounds();
  assert.equal(isPointInArea({ x: 50, z: 10 }, bounds), true, 'center of the box');
  assert.equal(isPointInArea({ x: 30, z: 10 }, bounds), true, 'inside near the far edge');
  assert.equal(isPointInArea({ x: 90, z: 90 }, bounds), true, 'inside near the near edge');
  assert.equal(isPointInArea({ x: 5, z: 95 }, bounds), true, 'inside the near-left corner');
});

test('quad area boundary points are inclusive', () => {
  const bounds = makeObliqueBounds();
  assert.equal(isPointInArea({ x: 25, z: 0 }, bounds), true, 'on the far-left vertex');
  assert.equal(isPointInArea({ x: 50, z: 50 }, bounds), true, 'on an edge');
});

test('fallback to AABB when no polygon is provided', () => {
  const bounds: WorldAreaBounds = { minX: 0, maxX: 100, minZ: 0, maxZ: 100 };
  assert.equal(isPointInArea({ x: 10, z: 10 }, bounds), true);
  assert.equal(isPointInArea({ x: -1, z: 50 }, bounds), false);
  assert.equal(isPointInArea({ x: 101, z: 50 }, bounds), false);
});

test('isPointInsidePolygon handles the projected quad winding', () => {
  // Sanity: the ray-cast helper itself classifies the trapezoid correctly
  // regardless of the corner winding order used.
  const { polygon } = makeObliqueBounds();
  assert.equal(isPointInsidePolygon({ x: 50, z: 50 }, polygon!), true);
  assert.equal(isPointInsidePolygon({ x: 10, z: 10 }, polygon!), false);
  // Reversed winding must classify identically.
  const reversed = [...polygon!].reverse();
  assert.equal(isPointInsidePolygon({ x: 50, z: 50 }, reversed), true);
  assert.equal(isPointInsidePolygon({ x: 10, z: 10 }, reversed), false);
});
