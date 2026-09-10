/**
 * Weather-reactive field soil: fields swap their tilled-soil texture between
 * loam (clear), mud (rain/thunderstorm), cracked dust (heatwave) and a frost
 * powdering (freezing/blizzard). The swap goes through the renderer's
 * setSoilWeather -> barrier-visual refresh sweep, and greenhouses are exempt.
 * Run: node --import tsx --import ./tests/register-loader.mjs --test tests/fieldSoilWeather.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingRenderer } from '../src/render/BuildingRenderer';
import { soilVariantForWeather } from '../src/render/buildingTextures';
import type { AdaptedBuilding } from '../src/types/settlement';

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
  (globalThis as unknown as { document: unknown }).document = { createElement: () => canvas };
}

function makeField(typeId = 'field', status: AdaptedBuilding['constructionStatus'] = 'completed'): AdaptedBuilding {
  const w = 16;
  const l = 20;
  return {
    buildingId: 'free_field_' + typeId + '_' + Math.random().toString(36).slice(2, 7),
    typeId, isHQ: false, name: typeId, category: 'food',
    adaptedAt: 0, footprintAreaM2: w * l, adaptedAreaM2: w * l, adaptationPercentage: 100,
    totalFloorAreaM2: w * l, volumeM3: w * l, maxCapacity: 6, currentUsage: 0,
    capacityUnit: 'workers', maxDurability: 100, currentDurability: 100, defenseRating: 5,
    isFreestanding: true, position: { x: 0, z: 0 }, height: 0.7, levels: 1,
    polygon: [{ x: -w / 2, z: -l / 2 }, { x: w / 2, z: -l / 2 }, { x: w / 2, z: l / 2 }, { x: -w / 2, z: l / 2 }],
    width: w, length: l, rotationDeg: 0,
    constructionStatus: status, constructionProgress: status === 'completed' ? 100 : 0,
    constructionWorkRequired: 140, constructionWorkDone: status === 'completed' ? 140 : 0,
    assignedWorkers: 0,
  };
}

function firstBodyMaterial(renderer: BuildingRenderer, id: string | number): THREE.MeshLambertMaterial | null {
  const mesh = renderer.buildingMeshes.get(id);
  if (!mesh) return null;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return (mats[0] as THREE.MeshLambertMaterial) ?? null;
}

test('soilVariantForWeather maps weather types to soil variants', () => {
  assert.equal(soilVariantForWeather('clear'), 'default');
  assert.equal(soilVariantForWeather('overcast'), 'default');
  assert.equal(soilVariantForWeather('dense_fog'), 'default');
  assert.equal(soilVariantForWeather('rain'), 'mud');
  assert.equal(soilVariantForWeather('thunderstorm'), 'mud');
  assert.equal(soilVariantForWeather('heatwave'), 'dust');
  assert.equal(soilVariantForWeather('freezing_frost'), 'snow');
  assert.equal(soilVariantForWeather('blizzard'), 'snow');
});

test('a completed field swaps its soil texture when the weather changes', () => {
  installCanvasStub();
  const renderer = new BuildingRenderer();
  const field = makeField();
  renderer.updateAdaptedStates(null, new Map(), [field], new Map(), null, 1.0);
  const baseMat = firstBodyMaterial(renderer, field.buildingId);
  assert.ok(baseMat?.map, 'field carries the soil texture');
  const baseMap = baseMat!.map!;

  // Rain -> mud variant: the body must rebuild with a DIFFERENT texture.
  renderer.setSoilWeather('rain');
  renderer.updateAdaptedStates(null, new Map(), [field], new Map(), null, 1.0);
  const mudMat = firstBodyMaterial(renderer, field.buildingId);
  assert.ok(mudMat?.map, 'mud field carries a soil texture');
  assert.notEqual(mudMat!.map!, baseMap, 'rain swaps the soil texture to the mud variant');

  // Heatwave -> dust variant: texture changes again.
  renderer.setSoilWeather('heatwave');
  renderer.updateAdaptedStates(null, new Map(), [field], new Map(), null, 1.0);
  const dustMat = firstBodyMaterial(renderer, field.buildingId);
  assert.ok(dustMat?.map, 'dust field carries a soil texture');
  assert.notEqual(dustMat!.map!, mudMat!.map!, 'heatwave swaps the soil texture to the dust variant');

  // Back to clear -> the original loam texture returns. Bodies CLONE the
  // shared cached texture (per-plot repeat), so compare the underlying canvas
  // image identity rather than the material's map object.
  renderer.setSoilWeather('clear');
  renderer.updateAdaptedStates(null, new Map(), [field], new Map(), null, 1.0);
  const clearMat = firstBodyMaterial(renderer, field.buildingId);
  assert.equal(clearMat!.map!.image, baseMap.image, 'clearing the weather restores the base loam texture');
});

test('greenhouses do not swap to mud — glass stays glass in the rain', () => {
  installCanvasStub();
  const renderer = new BuildingRenderer();
  const gh = makeField('greenhouse');
  renderer.updateAdaptedStates(null, new Map(), [gh], new Map(), null, 1.0);
  const before = firstBodyMaterial(renderer, gh.buildingId)?.map;

  renderer.setSoilWeather('rain');
  renderer.updateAdaptedStates(null, new Map(), [gh], new Map(), null, 1.0);
  const after = firstBodyMaterial(renderer, gh.buildingId)?.map;
  assert.equal(after, before, 'greenhouse texture is unchanged by rain');
});
