/**
 * Sim tick benchmark at LATE-GAME scale: full-size real-map building set
 * (thousands of OSM buildings), 80 wall segments, 6 squads, 120 zombies,
 * 6 resource orders, 8 deconstruction jobs. Reveals superlinear scaling.
 * Run: node --import tsx --import ./tests/register-loader.mjs tests/benchSimTickLarge.ts
 */
import {
  createInitialSettlementState,
  establishSettlementHQ,
  buildFreestanding,
} from '../src/services/settlementService';
import { runSimulationPipeline } from '../src/services/simulationPipeline';
import { PathGrid } from '../src/services/pathfindingService';
import { createZombieUnit } from '../src/services/combatService';
import type { SettlementState } from '../src/types/settlement';
import type { BuildingPolygon, MapData, Point2D } from '../src/types/map';

function makeMap(nBuildings: number): MapData {
  const b = { minX: -600, maxX: 600, minZ: -600, maxZ: 600 };
  const buildings: any[] = [];
  for (let i = 0; i < nBuildings; i++) {
    const x = -580 + (i % 40) * 29;
    const z = -580 + Math.floor(i / 40) * 29;
    buildings.push({
      id: `b_${i}`,
      type: 'residential',
      rawType: 'yes',
      name: `Building ${i}`,
      height: 8, levels: 2,
      center: { x, z },
      polygon: [{ x: x - 6, z: z - 6 }, { x: x + 6, z: z - 6 }, { x: x + 6, z: z + 6 }, { x: x - 6, z: z + 6 }],
      tags: {},
    });
  }
  return {
    cityName: 'BenchLarge',
    bounds: b,
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'S', country: 'X' },
    buildings, roads: [], landuse: [], resourceNodes: [
      { id: 'n_0', type: 'wood', position: { x: 50, z: 50 }, amount: 500 },
      { id: 'n_1', type: 'wood', position: { x: -80, z: 60 }, amount: 500 },
      { id: 'n_2', type: 'metal', position: { x: 90, z: -40 }, amount: 400 },
      { id: 'n_3', type: 'bricks', position: { x: -50, z: -90 }, amount: 400 },
      { id: 'n_4', type: 'wood', position: { x: 100, z: 100 }, amount: 600 },
      { id: 'n_5', type: 'scrap', position: { x: -110, z: 10 }, amount: 300 },
    ],
    stats: {
      buildingCount: nBuildings, roadCount: 0,
      resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 },
      elevationRangeMeters: 20, processedTimeMs: 0,
    },
    fetchedAt: 0, source: 'test',
  } as unknown as MapData;
}

function makeHq(): BuildingPolygon {
  return {
    id: 'b_hq_bench',
    type: 'residential' as unknown as BuildingPolygon['type'],
    rawType: 'headquarters',
    name: 'HQ',
    height: 12, levels: 3, center: { x: 0, z: 0 },
    polygon: [
      { x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 },
    ],
    tags: {},
  };
}

let state: SettlementState = createInitialSettlementState('BenchLarge');
state = establishSettlementHQ(state, makeHq());
state.stockpile.materials.wood = 50000;
state.stockpile.materials.metal = 50000;
state.stockpile.materials.bricks = 50000;

// 80-segment wall perimeter
for (let i = 0; i < 80; i++) {
  const ang = (i / 80) * Math.PI * 2;
  const r = buildFreestanding(state, 'wooden_palisade' as never, { x: Math.cos(ang) * 150, z: Math.sin(ang) * 150 }, 8, 8, 4.5, ang);
  if (r.success) state = r.newState;
}
// plus towers/gates mixed in
for (let i = 0; i < 20; i++) {
  const ang = (i / 20) * Math.PI * 2;
  const r = buildFreestanding(state, i % 2 ? 'wooden_tower' as never : 'wooden_gate' as never, { x: Math.cos(ang) * 140, z: Math.sin(ang) * 140 }, 8, 8, 4.5, ang);
  if (r.success) state = r.newState;
}

// Squads
const squads: any[] = [];
for (let i = 0; i < 6; i++) {
  const pos: Point2D = { x: 20 + i * 8, z: 10 + i * 5 };
  squads.push({
    squadId: `sq_${i}`, name: `Squad ${i}`, x: pos.x, z: pos.z,
    members: [
      { id: `m${i}a`, name: 'A', health: 100, weapon: 'pistol', isAlive: true },
      { id: `m${i}b`, name: 'B', health: 100, weapon: 'hunting_rifle', isAlive: true },
      { id: `m${i}c`, name: 'C', health: 100, weapon: 'shotgun', isAlive: true },
    ],
    state: 'idle', targetBuildingId: null, inventory: [],
  } as any);
}

const zombies: any[] = [];
for (let i = 0; i < 120; i++) {
  zombies.push(createZombieUnit(Math.random() < 0.6 ? 'walker' : 'brute', { x: -200 + Math.random() * 400, z: -200 + Math.random() * 400 }));
}

state.resourceWorkOrders = Array.from({ length: 6 }, (_, i) => ({
  id: `rwo_${i}`, nodeId: `n_${i % 6}`, resourceName: 'wood', resourceType: 'wood' as const,
  workerCount: 4, state: 'moving_to_node' as const, position: { x: 10 + i * 10, z: 40 },
  carried: 0,
})) as any;

// Deconstruction jobs (8)
const { orderDeconstruction } = await import('../src/services/settlementService');
const map = makeMap(1600);
for (let i = 0; i < 8; i++) {
  const b = map.buildings[i];
  const r = orderDeconstruction(state, b as any);
  if (r.success) state = r.newState;
}

const grid = new PathGrid(map);
const clock = { day: 3, phase: 'day', isNight: false, speed: 1, time: 10 } as any;
const noiseEvents: any[] = [];
const droppedItems: any[] = [];

for (let i = 0; i < 20; i++) {
  const r = runSimulationPipeline({ state, mapData: map, squads, zombies, hostileHumans: [], noiseEvents, droppedItems, clock, deltaSeconds: 0.1, pathGrid: grid });
  state = r.state;
}

const TICKS = 100;
const t0 = performance.now();
for (let i = 0; i < TICKS; i++) {
  const r = runSimulationPipeline({ state, mapData: map, squads, zombies, hostileHumans: [], noiseEvents, droppedItems, clock, deltaSeconds: 0.1, pathGrid: grid });
  state = r.state;
}
const total = performance.now() - t0;
console.log(`sim pipeline (late-game): ${(total / TICKS).toFixed(2)} ms per 100ms tick (budget: 100 ms)`);
console.log(`freestanding=${state.freestandingBuildings.length} deconJobs=${state.deconstructionJobs.size} buildings=${map.buildings.length}`);
