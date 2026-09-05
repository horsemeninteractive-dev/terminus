import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingRenderer } from '../src/render/BuildingRenderer';
import type { BuildingPolygon } from '../src/types/map';
import type { AdaptedBuilding } from '../src/types/settlement';

/**
 * The building texture factory paints into a 2d canvas; plain Node has none.
 * Install a minimal self-referential Proxy stub: every method call returns a
 * fresh stub (so chained calls like createLinearGradient().addColorStop() keep
 * working) and every property assignment is swallowed. Pixel contents never
 * matter — these tests only assert scene-graph membership and raycasts.
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

// A regular 20×16m footprint under 24m tall gets a PITCHED roof — the roof is
// a sibling mesh of the body in `group`, which is exactly what used to survive
// deconstruction (and stayed clickable).
const GABLED: BuildingPolygon = {
  id: 'b_decon_test',
  type: 'residential',
  rawType: 'terrace',
  name: 'Test Terrace',
  height: 10,
  levels: 3,
  center: { x: 0, z: 0 },
  polygon: [
    { x: -10, z: -8 },
    { x: -10, z: 8 },
    { x: 10, z: 8 },
    { x: 10, z: -8 },
  ],
  tags: { building: 'residential' },
};

const ADAPTED: AdaptedBuilding = {
  buildingId: GABLED.id,
  typeId: 'house',
  isHQ: false,
  name: 'Test House',
  category: 'civilian',
  adaptedAt: 0,
  footprintAreaM2: 320,
  adaptedAreaM2: 320,
  adaptationPercentage: 100,
  totalFloorAreaM2: 960,
  volumeM3: 3200,
  maxCapacity: 12,
  currentUsage: 0,
  capacityUnit: 'beds',
  maxDurability: 100,
  currentDurability: 100,
  defenseRating: 1,
  isFreestanding: false,
  position: { x: 0, z: 0 },
  height: 10,
  levels: 3,
  polygon: GABLED.polygon,
  constructionStatus: 'completed',
  constructionProgress: 100,
  constructionWorkRequired: 100,
  constructionWorkDone: 100,
  assignedWorkers: 0,
};

function raycastBuildingIds(renderer: BuildingRenderer): string[] {
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(0, 120, 0), new THREE.Vector3(0, -1, 0));
  const hits = raycaster.intersectObjects(renderer.group.children, true);
  return hits
    .map((h) => h.object.userData?.buildingId as string | number | undefined)
    .filter((id): id is string | number => id !== undefined && id !== null)
    .map(String);
}

test('deconstructing a gabled building removes body, roof and edge — no click-through', () => {
  installCanvasStub();
  const renderer = new BuildingRenderer();
  renderer.rebuildBuildings([GABLED], true, null, 1.0, null, new Map(), [], new Map());

  const body = renderer.buildingMeshes.get(GABLED.id);
  assert.ok(body, 'body mesh exists');

  const roof = renderer.group.children.find(
    (c) => c.userData?.buildingId === GABLED.id && c.userData?.type === 'roof'
  );
  assert.ok(roof, 'pitched roof sibling exists');
  assert.equal(roof.parent, renderer.group, 'roof is a direct child of the building group');

  const edges = (renderer as unknown as {
    buildingEdgeObjs: Map<string | number, THREE.LineSegments>;
  }).buildingEdgeObjs;
  assert.ok(edges.has(GABLED.id), 'edge silhouette exists');

  // Sanity: before demolish the building IS clickable from above.
  assert.ok(raycastBuildingIds(renderer).includes(String(GABLED.id)), 'building raycastable before demolish');

  renderer.updateAdaptedStates(null, new Map(), [], new Map([[GABLED.id, true]]), null, 1.0);

  assert.equal(renderer.buildingMeshes.has(GABLED.id), false, 'body mesh removed from registry');
  assert.equal(renderer.group.children.includes(body), false, 'body detached from scene');
  assert.equal(roof.parent, null, 'roof detached from scene');
  assert.equal(edges.has(GABLED.id), false, 'edge removed from registry');
  assert.equal(
    raycastBuildingIds(renderer).includes(String(GABLED.id)),
    false,
    'demolished building is not clickable'
  );
});

test('deconstructing an adapted building removes the green edge wireframe and its badge', () => {
  installCanvasStub();
  const renderer = new BuildingRenderer();
  renderer.rebuildBuildings(
    [GABLED],
    true,
    null,
    1.0,
    null,
    new Map([[GABLED.id, ADAPTED]]),
    [],
    new Map()
  );

  const edges = (renderer as unknown as {
    buildingEdgeObjs: Map<string | number, THREE.LineSegments>;
  }).buildingEdgeObjs;
  const edge = edges.get(GABLED.id);
  assert.ok(edge, 'adapted building has an edge wireframe');
  assert.ok(edge.visible, 'edge visible before demolish');

  // Completed adaptation also wears a badge sprite + leader line in the overlay.
  assert.ok(renderer.overlayGroup.children.length > 0, 'adapted badge rendered before demolish');

  renderer.updateAdaptedStates(null, new Map(), [], new Map([[GABLED.id, true]]), null, 1.0);

  assert.equal(edges.has(GABLED.id), false, 'adapted edge removed from registry');
  assert.equal(edge.parent, null, 'adapted edge detached from scene');
  // The overlay is rebuilt from the current (now empty) adapted set.
  assert.equal(renderer.overlayGroup.children.length, 0, 'adapted badge gone after demolish');
  assert.equal(
    raycastBuildingIds(renderer).includes(String(GABLED.id)),
    false,
    'demolished adapted building is not clickable'
  );
});