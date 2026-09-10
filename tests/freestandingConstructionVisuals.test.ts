import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingRenderer } from '../src/render/BuildingRenderer';
import type { AdaptedBuilding } from '../src/types/settlement';

/** Mirror the canvas stub used by the other renderer tests. */
function installCanvasStub() {
  let canvas: { width: number; height: number; getContext: () => unknown };
  const makeCtx = () =>
    new Proxy({} as Record<string | symbol, unknown>, {
      get: (_t, prop) => {
        if (prop === 'canvas') return canvas;
        if (prop === 'measureText') return () => ({ width: 0 });
        return (..._args: unknown[]) => makeCtx();
      },
      set: () => true,
    });
  canvas = {
    width: 512,
    height: 512,
    getContext: () => makeCtx(),
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => canvas,
  };
}

function makeFree(
  buildingId: string,
  typeId: string,
  category: AdaptedBuilding['category'],
  status: AdaptedBuilding['constructionStatus'],
  width: number,
  length: number,
  height: number
): AdaptedBuilding {
  return {
    buildingId,
    typeId,
    isHQ: false,
    name: typeId,
    category,
    adaptedAt: 0,
    footprintAreaM2: width * length,
    adaptedAreaM2: width * length,
    adaptationPercentage: 100,
    totalFloorAreaM2: width * length,
    volumeM3: width * length * height,
    maxCapacity: 0,
    currentUsage: 0,
    capacityUnit: 'workers',
    maxDurability: 100,
    currentDurability: 100,
    defenseRating: 0,
    isFreestanding: true,
    position: { x: 0, z: 0 },
    height,
    levels: 1,
    polygon: [
      { x: -width / 2, z: -length / 2 },
      { x: width / 2, z: -length / 2 },
      { x: width / 2, z: length / 2 },
      { x: -width / 2, z: length / 2 },
    ],
    width,
    length,
    rotationDeg: 0,
    constructionStatus: status,
    constructionProgress: status === 'completed' ? 100 : 0,
    constructionWorkRequired: 140,
    constructionWorkDone: status === 'completed' ? 140 : 0,
    assignedWorkers: 0,
  };
}

function bodyChildrenCount(renderer: BuildingRenderer, id: string | number): number {
  const mesh = renderer.buildingMeshes.get(id);
  if (!mesh) return -1;
  return mesh.children.length;
}

test('under-construction tower already wears its watchtower silhouette, not a bare box', () => {
  installCanvasStub();
  const renderer = new BuildingRenderer();
  const uc = makeFree('t_uc', 'wooden_tower', 'defense_towers', 'in_progress', 5.2, 5.2, 8.0);
  renderer.updateAdaptedStates(null, new Map(), [uc], new Map(), null, 1.0);

  // Silhouette = 4 corner posts + platform + 3 rails + front lip + pyramid roof.
  assert.ok(
    bodyChildrenCount(renderer, uc.buildingId) >= 9,
    'under-construction tower has the full watchtower silhouette attached'
  );

  // The shell + silhouette are the amber translucent scaffold.
  const mesh = renderer.buildingMeshes.get(uc.buildingId)!;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const wall = mats[0] as THREE.MeshLambertMaterial;
  assert.equal(wall.color.getHex(), 0xb45309, 'under-construction shell stays amber');
  assert.equal(wall.transparent, true, 'under-construction shell is translucent');

  // Completing flips the body to the textured opaque tower with the same silhouette.
  uc.constructionStatus = 'completed';
  uc.constructionProgress = 100;
  renderer.updateAdaptedStates(null, new Map(), [uc], new Map(), null, 1.0);
  const done = renderer.buildingMeshes.get(uc.buildingId)!;
  const doneMats = Array.isArray(done.material) ? done.material : [done.material];
  const doneWall = doneMats[0] as THREE.MeshLambertMaterial;
  assert.notEqual(doneWall.color.getHex(), 0xb45309, 'completed tower shell is no longer amber');
  assert.equal(doneWall.transparent, false, 'completed tower is opaque');
  assert.ok(
    bodyChildrenCount(renderer, uc.buildingId) >= 9,
    'completed tower keeps the watchtower silhouette'
  );
});

test('under-construction palisade renders true log geometry (not an amber box shell)', () => {
  installCanvasStub();
  const renderer = new BuildingRenderer();
  const uc = makeFree('w_uc', 'wooden_palisade', 'defense_walls', 'in_progress', 1.2, 10, 3.2);
  renderer.updateAdaptedStates(null, new Map(), [uc], new Map(), null, 1.0);

  // The true-geometry barrier registers its root as a GROUP with log meshes —
  // a plain box shell would be a single Mesh with no children.
  const root = renderer.buildingMeshes.get(uc.buildingId);
  assert.ok(root, 'under-construction palisade body exists');
  assert.ok(root instanceof THREE.Group, 'palisade body is the true-geometry group');
  assert.ok(root.children.length >= 1, 'palisade body has log meshes');

  // Every log material is tinted toward amber + translucent while building.
  let sawAmber = false;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as THREE.Mesh).isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const lam = m as THREE.MeshLambertMaterial;
      if (lam && lam.color) {
        assert.ok(
          lam.color.r > 0.5 && lam.color.g > 0.2 && lam.color.g < 0.6,
          `log material leans amber (r=${lam.color.r.toFixed(2)} g=${lam.color.g.toFixed(2)})`
        );
        assert.equal(lam.transparent, true, 'under-construction log material translucent');
        sawAmber = true;
      }
    }
  });
  assert.ok(sawAmber, 'palisade log materials inspected');

  // Completing flips to the pristine stockade (opaque, no amber tint).
  uc.constructionStatus = 'completed';
  uc.constructionProgress = 100;
  renderer.updateAdaptedStates(null, new Map(), [uc], new Map(), null, 1.0);
  const doneRoot = renderer.buildingMeshes.get(uc.buildingId);
  assert.ok(doneRoot instanceof THREE.Group, 'completed palisade stays true geometry');
  let sawOpaque = false;
  doneRoot.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as THREE.Mesh).isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const lam = m as THREE.MeshLambertMaterial;
      if (lam && lam.color && lam.transparent === false) sawOpaque = true;
    }
  });
  assert.ok(sawOpaque, 'completed palisade has opaque materials');
});

test('under-construction gate keeps its real material texture tinted amber', () => {
  installCanvasStub();
  const renderer = new BuildingRenderer();
  const uc = makeFree('g_uc', 'wooden_gate', 'defense_walls', 'in_progress', 10, 3.2, 4.2);
  renderer.updateAdaptedStates(null, new Map(), [uc], new Map(), null, 1.0);

  // Gate body root is a Group carrying towers + doors.
  const root = renderer.buildingMeshes.get(uc.buildingId);
  assert.ok(root, 'under-construction gate body exists');
  assert.ok(root instanceof THREE.Group, 'gate body is the structure group');

  // The tower/beam materials keep a texture map (real wood) AND are amber
  // translucent — not the old flat amber box.
  let sawTexturedAmber = false;
  let sawFlatAmber = false;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as THREE.Mesh).isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const lam = m as THREE.MeshLambertMaterial;
      if (!lam || !lam.color) continue;
      if (lam.color.g > 0.2 && lam.color.g < 0.6 && lam.color.r > 0.5) {
        if (lam.map) sawTexturedAmber = true;
        else sawFlatAmber = true;
      }
    }
  });
  assert.ok(sawTexturedAmber, 'under-construction gate towers wear the real wood texture tinted amber');
});