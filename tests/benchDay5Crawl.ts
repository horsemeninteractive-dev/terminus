/**
 * Day-5 crawl repro bench: a real OSM sector spans kilometres, unlike the
 * 1.2 km synthetic bench map. This bench scales bounds to ~3 km, spawns a
 * day-5 zombie population (5 night hordes + lair garrisons), construction
 * orders, resource work orders and lairs, then measures:
 *   1. PathGrid construction (happens on every map load / wall placement rev bump? no — grid is stable)
 *   2. a single findPath across the big grid
 *   3. stepAlongPath when the goal is UNREACHABLE (the worker-never-arrives loop)
 *   4. the full sim pipeline at that scale
 * Run: node --import tsx --import ./tests/register-loader.mjs tests/benchDay5Crawl.ts
 */
import {
  createInitialSettlementState,
  establishSettlementHQ,
  buildFreestanding,
} from '../src/services/settlementService';
import { runSimulationPipeline } from '../src/services/simulationPipeline';
import { PathGrid, stepAlongPath } from '../src/services/pathfindingService';
import { createZombieUnit } from '../src/services/combatService';
import { generateHordeWave } from '../src/services/combat/zombie';
import type { SettlementState } from '../src/types/settlement';
import type { BuildingPolygon, MapData, Point2D } from '../src/types/map';

// ---- Real-scale map: 3 km x 3 km, 1600 buildings spread across it ----
const HALF = 1500;
function makeMap(nBuildings: number): MapData {
  const b = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };
  const buildings: any[] = [];
  for (let i = 0; i < nBuildings; i++) {
    const x = -HALF + 30 + (i % 40) * 74;
    const z = -HALF + 30 + Math.floor(i / 40) * 74;
    buildings.push({
      id: `b_${i}`, type: 'residential', rawType: 'yes', name: `B${i}`,
      height: 8, levels: 2, center: { x, z },
      polygon: [{ x: x - 7, z: z - 7 }, { x: x + 7, z: z - 7 }, { x: x + 7, z: z + 7 }, { x: x - 7, z: z + 7 }],
      tags: {},
    });
  }
  return {
    cityName: 'RealScale', bounds: b,
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'S', country: 'X' },
    buildings, roads: [], landuse: [], resourceNodes: [
      { id: 'n_0', type: 'wood', position: { x: 50, z: 50 }, amount: 500 },
      { id: 'n_1', type: 'metal', position: { x: 90, z: -40 }, amount: 400 },
      { id: 'n_2', type: 'bricks', position: { x: -50, z: -90 }, amount: 400 },
    ],
    stats: { buildingCount: nBuildings, roadCount: 0, resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 }, elevationRangeMeters: 20, processedTimeMs: 0 },
    fetchedAt: 0, source: 'test',
  } as unknown as MapData;
}

function makeHq(): BuildingPolygon {
  return {
    id: 'b_hq', type: 'residential' as unknown as BuildingPolygon['type'], rawType: 'headquarters', name: 'HQ',
    height: 12, levels: 3, center: { x: 0, z: 0 },
    polygon: [{ x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 }], tags: {},
  };
}

let state: SettlementState = createInitialSettlementState('RealScale');
state = establishSettlementHQ(state, makeHq());
state.stockpile.materials.wood = 50000;
state.stockpile.materials.metal = 50000;
state.stockpile.materials.bricks = 50000;

const map = makeMap(1600);

// Perimeter wall + towers like a day-5 base
for (let i = 0; i < 80; i++) {
  const ang = (i / 80) * Math.PI * 2;
  const r = buildFreestanding(state, 'wooden_palisade' as never, { x: Math.cos(ang) * 150, z: Math.sin(ang) * 150 }, 8, 8, 4.5, ang);
  if (r.success) state = r.newState;
}
for (let i = 0; i < 8; i++) {
  const ang = (i / 8) * Math.PI * 2;
  const r = buildFreestanding(state, 'wooden_tower' as never, { x: Math.cos(ang) * 140, z: Math.sin(ang) * 140 }, 8, 8, 4.5, ang);
  if (r.success) state = r.newState;
}

// Day-5 zombie population: 5 hordes (4+day*3.5 ≈ 21-40 each) + 10 lairs × 25
let zombies: any[] = [];
for (let day = 1; day <= 5; day++) {
  const wave = generateHordeWave(day, { x: 0, z: 0 }, 180, true);
  zombies.push(...wave.zombies);
}
for (let i = 0; i < 10; i++) {
  const b = map.buildings[200 + i * 7];
  state.zombieLairs.set(`lair_${i}`, {
    id: `lair_${i}`, buildingId: b.id, buildingName: b.name,
    baselinePopulation: 25, population: 25, homeRadius: 60,
    isDiscovered: i < 3, isCleared: false, threatTier: 2, escalation: 2,
    dominantVariant: 'shambler',
  } as any);
  for (let k = 0; k < 25; k++) {
    const z = createZombieUnit('shambler', b.center.x + (Math.random() - 0.5) * 10, b.center.z + (Math.random() - 0.5) * 10, 0, false);
    (z as any).lairId = `lair_${i}`;
    (z as any).homeX = b.center.x; (z as any).homeZ = b.center.z; (z as any).homeRadius = 60;
    zombies.push(z);
  }
}
console.log(`zombies=${zombies.length} lairs=${state.zombieLairs.size}`);

// Squads (some outside the walls so zombies have visible prey)
const squads: any[] = [];
for (let i = 0; i < 4; i++) {
  const pos: Point2D = { x: 200 + i * 30, z: 100 + i * 20 };
  squads.push({
    squadId: `sq_${i}`, name: `Squad ${i}`, x: pos.x, z: pos.z,
    members: [
      { id: `m${i}a`, name: 'A', health: 100, weapon: 'pistol', isAlive: true },
      { id: `m${i}b`, name: 'B', health: 100, weapon: 'hunting_rifle', isAlive: true },
    ],
    currentHp: 200, maxHp: 200, isDeployed: true, state: 'idle', targetBuildingId: null, inventory: [],
  } as any);
}

// Resource work orders (workers) far from their nodes
state.resourceWorkOrders = Array.from({ length: 6 }, (_, i) => ({
  id: `rwo_${i}`, nodeId: `n_${i % 3}`, resourceName: 'wood', resourceType: 'wood' as const,
  workerCount: 4, state: 'moving_to_node' as const, position: { x: 20 + i * 5, z: 30 },
  carried: 0,
})) as any;

const grid = new PathGrid(map);
console.log(`grid=${grid.cols}x${grid.rows} cells=${grid.cols * grid.rows}`);

const clock = { day: 5, phase: 'day', isNight: false, speed: 1, time: 600, totalElapsedSeconds: 432000 } as any;
const noiseEvents: any[] = [];
let droppedItems: any[] = [];

// 1. PathGrid construction cost
{
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) new PathGrid(map);
  console.log(`PathGrid ctor: ${((performance.now() - t0) / 5).toFixed(1)} ms`);
}

// 2. A long findPath across the map (worst case: full A* over ~360k cells)
{
  const t0 = performance.now();
  const p = grid.findPath(-1400, -1400, 1400, 1400);
  console.log(`findPath cross-map: ${(performance.now() - t0).toFixed(1)} ms (${p?.length ?? 'null'} waypoints)`);
}

// 3. stepAlongPath to an UNREACHABLE goal (goal walled inside a footprint) —
//    the "workers never arrive" pattern, once per tick per stuck worker.
{
  const goal = { x: 0, z: 0 }; // inside the HQ footprint = blocked
  let pathState: any = undefined;
  const t0 = performance.now();
  for (let i = 0; i < 60; i++) { // 6 s of ticks at 10 Hz, one worker
    const r = stepAlongPath(grid, pathState, 400, 400, goal.x, goal.z, 2, 0.1, 1.2, { gatesOpen: false, wallsImpassable: true });
    pathState = r.state;
  }
  console.log(`60 × stepAlongPath stuck-worker (goal in blocked footprint): ${(performance.now() - t0).toFixed(1)} ms total`);
}

// 4. Full pipeline at day-5 scale
for (let i = 0; i < 10; i++) {
  const r = runSimulationPipeline({ state, mapData: map, squads, zombies, hostileHumans: [], noiseEvents, droppedItems, clock, deltaSeconds: 0.1, pathGrid: grid });
  state = r.state; zombies = r.zombies; droppedItems = r.combat.droppedItems;
}
const TICKS = 50;
const t0 = performance.now();
for (let i = 0; i < TICKS; i++) {
  const r = runSimulationPipeline({ state, mapData: map, squads, zombies, hostileHumans: [], noiseEvents, droppedItems, clock, deltaSeconds: 0.1, pathGrid: grid });
  state = r.state; zombies = r.zombies; droppedItems = r.combat.droppedItems;
}
const total = performance.now() - t0;
console.log(`sim pipeline (real-scale day 5): ${(total / TICKS).toFixed(2)} ms per 100ms tick`);
