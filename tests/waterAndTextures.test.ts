import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingRenderer } from '../src/render/BuildingRenderer';
import { PathGrid, stepAlongPath } from '../src/services/pathfindingService';
import type { AdaptedBuilding } from '../src/types/settlement';
import type { MapData } from '../src/types/map';

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

function makeFree(typeId: string, status: AdaptedBuilding['constructionStatus'], w: number, l: number): AdaptedBuilding {
  return {
    buildingId: 'free_' + typeId + status,
    typeId, isHQ: false, name: typeId, category: 'defense_towers',
    adaptedAt: 0, footprintAreaM2: w * l, adaptedAreaM2: w * l, adaptationPercentage: 100,
    totalFloorAreaM2: w * l, volumeM3: w * l * 4.5, maxCapacity: 4, currentUsage: 0,
    capacityUnit: 'workers', maxDurability: 100, currentDurability: 100, defenseRating: 5,
    isFreestanding: true, position: { x: 0, z: 0 }, height: 4.5, levels: 1,
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

// ---------------------------------------------------------------------------
// Texture fixes
// ---------------------------------------------------------------------------

test('wooden tower completes with a warm timber tint, not dark red brick', () => {
  installCanvasStub();
  const renderer = new BuildingRenderer();
  const tower = makeFree('wooden_tower', 'completed', 5.2, 5.2);
  renderer.updateAdaptedStates(null, new Map(), [tower], new Map(), null, 1.0);
  const mat = firstBodyMaterial(renderer, tower.buildingId);
  assert.ok(mat, 'tower body exists');
  assert.ok(mat.map, 'tower carries the wood texture');
  // 0x78350f (dark red-brown) read as brick; the warm timber palette
  // (0x854d0e like the palisade / 0x92400e like the gate) reads as wood.
  const hex = mat.color.getHex();
  assert.ok(hex !== 0x78350f, `tower no longer uses the brick-red tint (got 0x${hex.toString(16)})`);
  assert.ok(hex === 0x854d0e || hex === 0x92400e, `tower uses a warm timber tint (got 0x${hex.toString(16)})`);
});

test('open field uses the soil texture, not a flat box', () => {
  installCanvasStub();
  const renderer = new BuildingRenderer();

  // Under construction: soil texture, amber tinted.
  const uc = makeFree('field', 'in_progress', 16, 20);
  renderer.updateAdaptedStates(null, new Map(), [uc], new Map(), null, 1.0);
  const ucMat = firstBodyMaterial(renderer, uc.buildingId);
  assert.ok(ucMat, 'field shell exists');
  assert.ok(ucMat.map, 'field under construction carries the soil texture');
  assert.equal(ucMat.transparent, true, 'field shell is translucent while building');

  // Completed: soil texture, opaque, natural loam colour (not amber).
  uc.constructionStatus = 'completed';
  uc.constructionProgress = 100;
  renderer.updateAdaptedStates(null, new Map(), [uc], new Map(), null, 1.0);
  const doneMat = firstBodyMaterial(renderer, uc.buildingId);
  assert.ok(doneMat, 'completed field exists');
  assert.ok(doneMat.map, 'completed field carries the soil texture');
  assert.notEqual(doneMat.color.getHex(), 0xb45309, 'completed field is not the amber shell');
  assert.equal(doneMat.transparent, false, 'completed field is opaque');
});

// ---------------------------------------------------------------------------
// Water movement
// ---------------------------------------------------------------------------

function makeMapWithRiver(): MapData {
  const b = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
  // A river running east-west through the middle (z from 40 to 60). It spans
  // well past the map bounds so the PathGrid's padded ring has no dry way
  // around either end — an infected crossing attempt genuinely fails.
  const river = {
    id: 'r1',
    type: 'water' as const,
    polygon: [
      { x: -500, z: 40 },
      { x: 500, z: 40 },
      { x: 500, z: 60 },
      { x: -500, z: 60 },
    ],
  };
  return {
    cityName: 'T',
    bounds: b,
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'S', country: 'X' },
    buildings: [], roads: [], landuse: [river], resourceNodes: [],
    stats: {
      buildingCount: 0, roadCount: 0,
      resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 },
      elevationRangeMeters: 20, processedTimeMs: 0,
    },
    fetchedAt: 0, source: 'test',
  } as unknown as MapData;
}

test('humans wade across water at a movement penalty; isInWater is reported', () => {
  const grid = new PathGrid(makeMapWithRiver());
  // Point inside the river.
  assert.ok(grid.isWater(0, 50), 'river center is water');

  // Walk from south of the river to north of it — humans may cross.
  const south = { x: 0, z: 0 };
  const north = { x: 0, z: 100 };
  const step1 = stepAlongPath(grid, null, south.x, south.z, north.x, north.z, 4, 1.0, 1.2, {});
  assert.ok(step1.state.path.length > 0, 'a path across water exists for humans');
  assert.equal(step1.isInWater, false, 'start is dry');

  // Simulate the crossing: walk in 1s steps and confirm the unit enters water
  // (isInWater true) and that its per-second progress while wet is slower than
  // the dry-ground speed of 4 m/s.
  let x = south.x;
  let z = south.z;
  let state: any = null;
  let sawWater = false;
  let waterDistance = 0;
  let dryDistance = 0;
  for (let i = 0; i < 120 && z < 80; i++) {
    const step = stepAlongPath(grid, state, x, z, north.x, north.z, 4, 1.0, 1.2, {});
    const moved = Math.hypot(step.x - x, step.z - z);
    if (step.isInWater) {
      sawWater = true;
      waterDistance += moved;
    } else {
      dryDistance += moved;
    }
    x = step.x;
    z = step.z;
    state = step.state;
    if (step.arrived) break;
  }
  assert.ok(sawWater, 'unit actually entered the water');
  // Dry steps average ~4 m/s; wet steps must be noticeably slower (~1.8 m/s
  // at 0.45x). With 1s deltas and integer-ish steps this is a wide margin.
  const dryAvg = dryDistance / Math.max(1, dryDistance / 4);
  const wetAvg = waterDistance / Math.max(1, waterDistance / (4 * 0.45));
  assert.ok(wetAvg < dryAvg * 0.8, `wading is slower (wet avg ${wetAvg.toFixed(2)} vs dry avg ${dryAvg.toFixed(2)})`);
});

test('zombies cannot cross water: no path and no line of sight through a river', () => {
  const grid = new PathGrid(makeMapWithRiver());
  const south = { x: 0, z: 0 };
  const north = { x: 0, z: 100 };

  // Human LOS crosses the river (short-cut straight line is allowed).
  assert.ok(grid.hasLineOfSight(south.x, south.z, north.x, north.z, {}), 'humans have LOS across water');
  // Infected LOS is blocked by water.
  assert.equal(
    grid.hasLineOfSight(south.x, south.z, north.x, north.z, { waterImpassable: true }),
    false,
    'infected have no LOS across water'
  );

  // Infected pathfinding: with a straight strip of river blocking the way,
  // there is no walkable crossing in this map, so findPath must fail.
  const path = grid.findPath(south.x, south.z, north.x, north.z, {
    wallsImpassable: true,
    waterImpassable: true,
  });
  assert.equal(path, null, 'infected findPath cannot cross an unbroken river');
});

test('zombie paths never route through water cells when a dry detour exists', () => {
  // A small pond in the middle with open ground on both sides — a dry route
  // around it exists, so findPath succeeds but must avoid every water cell.
  const b = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
  const pond = {
    id: 'p1',
    type: 'water' as const,
    polygon: [
      { x: -40, z: 40 },
      { x: 40, z: 40 },
      { x: 40, z: 60 },
      { x: -40, z: 60 },
    ],
  };
  const map = {
    cityName: 'T',
    bounds: b,
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'S', country: 'X' },
    buildings: [], roads: [], landuse: [pond], resourceNodes: [],
    stats: {
      buildingCount: 0, roadCount: 0,
      resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 },
      elevationRangeMeters: 20, processedTimeMs: 0,
    },
    fetchedAt: 0, source: 'test',
  } as unknown as MapData;
  const grid = new PathGrid(map);

  const start = { x: 0, z: 0 };
  const goal = { x: 0, z: 100 };
  const path = grid.findPath(start.x, start.z, goal.x, goal.z, {
    wallsImpassable: true,
    waterImpassable: true,
  });
  assert.ok(path && path.length > 0, 'a dry route around the pond exists');
  for (const wp of path) {
    assert.equal(grid.isWater(wp.x, wp.z), false, `waypoint (${wp.x}, ${wp.z}) is dry`);
  }
});