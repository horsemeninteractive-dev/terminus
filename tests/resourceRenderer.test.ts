import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ResourceRenderer } from '../src/render/ResourceRenderer';
import { buildPitchedRoof } from '../src/render/BuildingRenderer';
import type { ResourceNode } from '../src/types/map';

function treeNode(over: Partial<ResourceNode> = {}): ResourceNode {
  return {
    id: 'tree_1', type: 'wood', subType: 'tree',
    position: { x: 0, z: 0 }, rotation: 0.5, scale: 1.2,
    source: 'park_scatter', amount: 100, maxAmount: 100, isDepleted: false,
    ...over,
  };
}

/** Ray straight down at the map origin — hits anything rendered there. */
function raycastAtOrigin(renderer: ResourceRenderer): ResourceNode | null {
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0));
  return renderer.raycastResource(raycaster);
}

test('resource renderer keeps visible nodes raycastable and unanimated', () => {
  const renderer = new ResourceRenderer();
  const node = treeNode();
  renderer.rebuildResources([node], null);
  renderer.update(0.016, 1000); // seed the frame clock
  renderer.updateNodeAmounts([{ ...node, amount: 60 }]); // partially harvested
  const hit = raycastAtOrigin(renderer);
  assert.ok(hit, 'partially harvested tree must still be visible');
  assert.equal(hit!.id, node.id);
  assert.equal(renderer.getStumpCount(), 0, 'no stump for a living tree');
});

test('depleted tree falls over, disappears and leaves a stump', () => {
  const renderer = new ResourceRenderer();
  const node = treeNode();
  renderer.rebuildResources([node], null);
  renderer.update(0.016, 1000); // seed the frame clock (animations use this)
  renderer.updateNodeAmounts([{ ...node, amount: 0, isDepleted: true }]);

  // Mid-fall: the tree is still present, just rotated part-way down.
  renderer.update(0.1, 1000.7);
  assert.ok(raycastAtOrigin(renderer), 'tree should still exist while falling');
  assert.equal(renderer.getStumpCount(), 0, 'stump only appears once felled');

  // Past the 1.4s fall (settling begins) and the 0.4s settle: tree hidden,
  // stump remains.
  renderer.update(0.1, 1002.0);
  renderer.update(0.1, 1002.5);
  assert.equal(renderer.getStumpCount(), 1, 'felled tree must leave a stump');
  const hit = raycastAtOrigin(renderer);
  assert.equal(hit, null, 'felled tree must no longer be visible/clickable');
});

/** Area of upward-facing roof triangles only (top hull faces, Y-up). */
function upwardArea(pos: THREE.BufferAttribute): number {
  let area = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const x1 = pos.getX(i), z1 = pos.getZ(i);
    const x2 = pos.getX(i + 1), z2 = pos.getZ(i + 1);
    const x3 = pos.getX(i + 2), z3 = pos.getZ(i + 2);
    const a = ((x2 - x1) * (z3 - z1) - (x3 - x1) * (z2 - z1)) / 2;
    if (a > 0) area += a; // CCW as seen from above = roof surface
  }
  return area;
}

test('pitched roof over a rectangle is a true gable: ridge, slopes AND vertical ends', () => {
  const rect = [
    { x: -10, z: -5 }, { x: 10, z: -5 }, { x: 10, z: 5 }, { x: -10, z: 5 },
  ];
  const res = buildPitchedRoof(rect, 10, 6);
  assert.ok(res, 'roof must build for a rectangle');
  const pos = res.geom.attributes.position as THREE.BufferAttribute;
  assert.equal(pos.count % 3, 0, 'roof must be emitted as closed triangles');

  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
  const y0 = 10.06;
  const ridgeH = Math.min(7.0, 5 * 0.8);
  assert.ok(
    Math.abs(maxY - (y0 + ridgeH)) < 0.01,
    `roof must rise to its ridge (${y0 + ridgeH}), got ${maxY}`
  );

  // Corners (|d| = maxD) sit on the eave line; ridge points rise above them.
  const ys: number[] = [];
  for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i));
  assert.ok(ys.some((y) => Math.abs(y - y0) < 0.01), 'eave corners must sit at wall-top height');

  // Projected x–z coverage of the roof TOP must fill the whole 20×10 footprint
  // (no holes) — the shadow/base side of the hull doubles the raw area, so
  // only upward-facing triangles count here.
  const area = upwardArea(pos);
  assert.ok(Math.abs(area - 200) < 5, `roof top must cover the footprint, got area ${area}`);

  // The user-visible gable ends: at least one triangle must be a VERTICAL
  // plane at an end of the building (all three vertices on x = +10 or x = -10,
  // i.e. the triangular end face of the roof). This is what the old hip tent
  // never showed.
  let hasGableEnd = false;
  for (let i = 0; i < pos.count; i += 3) {
    const x1 = pos.getX(i), x2 = pos.getX(i + 1), x3 = pos.getX(i + 2);
    const xs = [x1, x2, x3];
    if (xs.every((x) => Math.abs(x - 10) < 0.01) || xs.every((x) => Math.abs(x + 10) < 0.01)) {
      hasGableEnd = true;
      break;
    }
  }
  assert.ok(hasGableEnd, 'roof must include a vertical triangular gable end');
});

test('pitched roof also covers a complex hull without holes', () => {
  // L-shaped footprint — roof is built over its 5-point hull.
  const lShape = [
    { x: -8, z: -4 }, { x: 8, z: -4 }, { x: 8, z: 4 }, { x: 0, z: 4 },
    { x: 0, z: 1 }, { x: -8, z: 1 },
  ];
  const res = buildPitchedRoof(lShape, 8, 5);
  assert.ok(res, 'roof must build for an L-shaped footprint');
  const pos = res.geom.attributes.position as THREE.BufferAttribute;
  // Hull of the L-shape is a pentagon with area 102.
  const area = upwardArea(pos);
  assert.ok(area >= 100, `hull roof must cover the building, got area ${area}`);
  // And it must actually pitch up — not be a flat cap.
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
  assert.ok(maxY > 8.5, `complex-hull roof must rise to a ridge, got ${maxY}`);
});

test('non-tree nodes dissolve without leaving a stump', () => {
  const renderer = new ResourceRenderer();
  const car: ResourceNode = {
    id: 'car_1', type: 'metal', subType: 'car_sedan',
    position: { x: 0, z: 0 }, rotation: 0.3, scale: 1,
    source: 'road_side', amount: 80, maxAmount: 80, isDepleted: false,
  };
  renderer.rebuildResources([car], null);
  renderer.update(0.016, 1000);
  assert.ok(raycastAtOrigin(renderer), 'car should render initially');

  renderer.updateNodeAmounts([{ ...car, amount: 0, isDepleted: true }]);
  renderer.update(0.1, 1000.2);
  assert.ok(raycastAtOrigin(renderer), 'car should still exist part-way through dissolving');
  renderer.update(0.1, 1001.0); // past 0.8s dissolve
  assert.equal(raycastAtOrigin(renderer), null, 'dissolved car must be gone');
  assert.equal(renderer.getStumpCount(), 0, 'metal/vehicle nodes never leave stumps');
});