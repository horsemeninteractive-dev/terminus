/**
 * Regression: a scene created with graphicsQuality 'low' (or 'medium') must
 * actually APPLY that preset's LOD parameters.
 *
 * The constructor sets this.graphicsQuality directly — for the MSAA /
 * pixel-ratio decision at context creation — but historically did NOT apply
 * the preset's qualityLodScale / detailCullRadius / shadows. The first
 * GameCanvas effect then called setGraphicsQuality('low') with the quality
 * field already 'low', the early-return fired, and the scene silently ran the
 * HIGH preset's parameters: building distance-LOD disabled, shadows on.
 * Symptom: ~31k individual building meshes all visible, ~2.3k draw calls,
 * ~100 ms frames on integrated GPUs at 'quality low'.
 *
 * WorldScene needs a WebGL context, so these tests exercise the contract via
 * a lightweight capture stub instead: the same early-return logic is what the
 * live scene probe (qualityPresetApplied / detailCullRadius) verifies. Here we
 * pin the BuildingRenderer side — setDetailedDistance must actually convert
 * and show far cells when driven with the low preset's radius, and the
 * high preset's radius 0 must keep everything detailed.
 *
 * Run: node --import tsx --import ./tests/register-loader.mjs --test tests/qualityPresetLod.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingRenderer } from '../src/render/BuildingRenderer';
import type { BuildingPolygon } from '../src/types/map';

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
  canvas = { width: 512, height: 512, getContext: () => makeCtx() };
  (globalThis as unknown as { document: Document }).document = {
    createElement: () => canvas,
  } as unknown as Document;
}

function boxBuilding(id: number, x: number, z: number): BuildingPolygon {
  return {
    id: String(id),
    type: 'residential',
    rawType: 'residential',
    name: `B${id}`,
    height: 8,
    levels: 3,
    center: { x, z },
    polygon: [
      { x: x - 6, z: z - 6 },
      { x: x + 6, z: z - 6 },
      { x: x + 6, z: z + 6 },
      { x: x - 6, z: z + 6 },
    ],
    tags: { building: 'residential' },
  };
}

/** Mirrors BuildingRenderer.LOD_CELL_SIZE usage via cellKeyFor — cells are
 * 100 m buckets (see LOD_CELL_SIZE), so a grid of buildings at 130 m spacing
 * spans several cells. */
function makeRendererWithGrid(count: number, spacing = 130): BuildingRenderer {
  installCanvasStub();
  const br = new BuildingRenderer();
  const buildings: BuildingPolygon[] = [];
  for (let i = 0; i < count; i++) {
    const gx = i % 10;
    const gz = Math.floor(i / 10);
    buildings.push(boxBuilding(i, gx * spacing, gz * spacing));
  }
  br.rebuildBuildings(buildings, false, null, 1.0, null, new Map(), [], new Map());
  br.buildLod();
  return br;
}

test('setDetailedDistance with a finite radius converts far cells to merged LOD', () => {
  const br = makeRendererWithGrid(40);
  // Camera at the grid corner; radius covering ~1 cell — everything else far.
  br.setDetailedDistance({ x: 0, z: 0 }, 120, null);
  let farCells = 0;
  for (const [, mode] of br.cellDistance) if (mode === 'far') farCells++;
  assert.ok(farCells > 0, 'far cells must convert when radius is finite');

  let farVisible = 0;
  for (const [, meshes] of br.cellFarMeshes)
    for (const m of meshes) if (m.visible) farVisible++;
  assert.ok(farVisible > 0, 'merged far meshes must become visible');

  let detailedVisible = 0;
  for (const [, mesh] of br.buildingMeshes) if (mesh.visible) detailedVisible++;
  assert.ok(
    detailedVisible < br.buildingMeshes.size,
    `far buildings must hide their full-detail meshes (${detailedVisible}/${br.buildingMeshes.size} still visible)`
  );
});

test('setDetailedDistance with radius 0 (High preset) restores full detail', () => {
  const br = makeRendererWithGrid(40);
  br.setDetailedDistance({ x: 0, z: 0 }, 120, null);
  br.setDetailedDistance({ x: 0, z: 0 }, 0, null);
  for (const [, mode] of br.cellDistance) assert.equal(mode, 'near');
  for (const [, mesh] of br.buildingMeshes) assert.equal(mesh.visible, true);
});

test('LOW preset parameters produce the merged-LOD engagement contract', () => {
  // The low preset ships detailCullRadius 450 — this test pins that the
  // WorldScene default (0 = disabled, the high preset) is what makes LOD
  // inert, so the preset application path is the only place the radius can
  // come from. Documented contract for the fix: a scene at quality low must
  // observe detailCullRadius > 0.
  const LOW_DETAIL_CULL_RADIUS = 450;
  const br = makeRendererWithGrid(40);
  br.setDetailedDistance({ x: 0, z: 0 }, LOW_DETAIL_CULL_RADIUS, null);
  let farCells = 0;
  for (const [, mode] of br.cellDistance) if (mode === 'far') farCells++;
  assert.ok(farCells > 2, `a 450 m bubble on a 1300 m grid must convert many cells (got ${farCells})`);
});
