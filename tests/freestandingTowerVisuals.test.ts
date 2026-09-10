import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingRenderer } from '../src/render/BuildingRenderer';
import type { AdaptedBuilding } from '../src/types/settlement';

/**
 * The building texture factory paints into a 2d canvas; plain Node has none.
 * Install a minimal self-referential Proxy stub (mirrors deconstructionVisuals.test).
 */
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

function makeTower(status: AdaptedBuilding['constructionStatus']): AdaptedBuilding {
  return {
    buildingId: 'free_tower_test',
    typeId: 'wooden_tower',
    isHQ: false,
    name: 'Freestanding Wooden Tower',
    category: 'defense_towers',
    adaptedAt: 0,
    footprintAreaM2: 27,
    adaptedAreaM2: 27,
    adaptationPercentage: 100,
    totalFloorAreaM2: 27,
    volumeM3: 216,
    maxCapacity: 4,
    currentUsage: 0,
    capacityUnit: 'workers',
    maxDurability: 100,
    currentDurability: 100,
    defenseRating: 5,
    isFreestanding: true,
    position: { x: 0, z: 0 },
    height: 4.5,
    levels: 1,
    polygon: [
      { x: -2.6, z: -2.6 },
      { x: 2.6, z: -2.6 },
      { x: 2.6, z: 2.6 },
      { x: -2.6, z: 2.6 },
    ],
    width: 5.2,
    length: 5.2,
    rotationDeg: 0,
    constructionStatus: status,
    constructionProgress: status === 'completed' ? 100 : 0,
    constructionWorkRequired: 140,
    constructionWorkDone: status === 'completed' ? 140 : 0,
    assignedWorkers: 0,
  };
}

function firstBodyMaterial(renderer: BuildingRenderer, id: string | number): THREE.MeshLambertMaterial | null {
  const mesh = renderer.buildingMeshes.get(id);
  if (!mesh) return null;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const wall = mats[0] as THREE.MeshLambertMaterial | undefined;
  return wall ?? null;
}

function freestandingEdge(renderer: BuildingRenderer, id: string | number): THREE.LineSegments | null {
  const edges = (renderer as unknown as {
    freestandingEdges: Map<string | number, THREE.Object3D[]>;
  }).freestandingEdges;
  const list = edges.get(id);
  if (!list || list.length === 0) return null;
  return list[0] as THREE.LineSegments;
}

test('freestanding tower: edge wireframe is amber under construction, green once completed', () => {
  installCanvasStub();
  const renderer = new BuildingRenderer();

  // Under construction: amber edge (matches the amber shell).
  const uc = makeTower('in_progress');
  renderer.updateAdaptedStates(null, new Map(), [uc], new Map(), null, 1.0);
  const ucEdge = freestandingEdge(renderer, uc.buildingId);
  assert.ok(ucEdge, 'under-construction tower has an edge wireframe');
  const ucMat = ucEdge.material as THREE.LineBasicMaterial;
  assert.equal(ucMat.color.getHex(), 0xf59e0b, 'under-construction edge is amber');

  // Sim flips status to completed — the edge must turn green immediately.
  uc.constructionStatus = 'completed';
  uc.constructionProgress = 100;
  renderer.updateAdaptedStates(null, new Map(), [uc], new Map(), null, 1.0);

  const doneEdge = freestandingEdge(renderer, uc.buildingId);
  assert.ok(doneEdge, 'completed tower still has an edge wireframe');
  const doneMat = doneEdge.material as THREE.LineBasicMaterial;
  assert.equal(doneMat.color.getHex(), 0x22c55e, 'completed edge is green');
});

test('freestanding tower: completed body uses the real wood texture, not the amber shell', () => {
  installCanvasStub();
  const renderer = new BuildingRenderer();

  // Under construction: amber translucent placeholder.
  const uc = makeTower('in_progress');
  renderer.updateAdaptedStates(null, new Map(), [uc], new Map(), null, 1.0);
  const ucMat = firstBodyMaterial(renderer, uc.buildingId);
  assert.ok(ucMat, 'under-construction body exists');
  assert.equal(ucMat.color.getHex(), 0xb45309, 'under-construction shell is amber');

  // Sim flips status to completed (mutating the record in place + new array
  // identity, exactly like populationService does on completion).
  uc.constructionStatus = 'completed';
  uc.constructionProgress = 100;
  renderer.updateAdaptedStates(null, new Map(), [uc], new Map(), null, 1.0);

  const doneMat = firstBodyMaterial(renderer, uc.buildingId);
  assert.ok(doneMat, 'completed body exists');
  assert.notEqual(doneMat.color.getHex(), 0xb45309, 'completed tower is no longer amber');
  assert.ok(doneMat.map, 'completed tower carries a real material texture');
  assert.equal(doneMat.transparent, false, 'completed tower is opaque');
});

test('freestanding tower: body geometry is the real tower silhouette after completion', () => {
  installCanvasStub();
  const renderer = new BuildingRenderer();
  const tower = makeTower('completed');
  renderer.updateAdaptedStates(null, new Map(), [tower], new Map(), null, 1.0);

  const mesh = renderer.buildingMeshes.get(tower.buildingId);
  assert.ok(mesh, 'completed tower body exists');
  // The generic fallback box is 8×8; the tower footprint is 5.2×5.2. The
  // body geometry must match the placement footprint, not the fallback.
  const geom = mesh.geometry as THREE.BufferGeometry;
  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  assert.ok(Math.abs(size.x - 5.2) < 0.01, `tower width is 5.2 (got ${size.x})`);
  assert.ok(Math.abs(size.z - 5.2) < 0.01, `tower length is 5.2 (got ${size.z})`);
});
