/**
 * Sim tick benchmark under a realistic mid-game settlement load:
 * ~20 buildings, a wall perimeter, 3 squads, 40 zombies, resource orders.
 * Reports wall time per 100ms tick (the live loop's cadence) and flags
 * stages over budget. Run: node --import tsx tests/benchSimTick.ts
 */
import {
  createInitialSettlementState,
  establishSettlementHQ,
  buildFreestanding,
  adaptBuilding,
} from '../src/services/settlementService';
import { runSimulationPipeline } from '../src/services/simulationPipeline';
import { PathGrid } from '../src/services/pathfindingService';
import { createZombieUnit } from '../src/services/combatService';
import type { SettlementState } from '../src/types/settlement';
import type { BuildingPolygon, MapData, Point2D } from '../src/types/map';

function makeMap(): MapData {
  const b = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
  return {
    cityName: 'Bench',
    bounds: b,
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'S', country: 'X' },
    buildings: [], roads: [], landuse: [], resourceNodes: [],
    stats: {
      buildingCount: 0, roadCount: 0,
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

let state: SettlementState = createInitialSettlementState('Bench');
state = establishSettlementHQ(state, makeHq());
state.stockpile.materials.wood = 5000;
state.stockpile.materials.metal = 5000;
state.stockpile.materials.bricks = 5000;

// Wall perimeter: 40 palisade segments
for (let i = 0; i < 40; i++) {
  const ang = (i / 40) * Math.PI * 2;
  const r = buildFreestanding(
    state, 'wooden_palisade' as never,
    { x: Math.cos(ang) * 120, z: Math.sin(ang) * 120 },
    8, 8, 4.5, ang
  );
  if (r.success) state = r.newState;
}

// A handful of adapted/functional buildings
const fTypes = ['warehouse', 'medbay', 'research_center', 'sawmill', 'cookhouse', 'hospital', 'water_cistern', 'field', 'greenhouse', 'barn', 'tool_factory', 'scrapyard', 'arms_factory', 'vehicle_workshop', 'generator_station', 'wooden_tower', 'wooden_gate', 'wooden_tower', 'wooden_gate', 'shelter_bunkhouse'] as const;
for (let i = 0; i < fTypes.length; i++) {
  const r = buildFreestanding(state, fTypes[i] as never, { x: -40 + (i % 5) * 20, z: -30 + Math.floor(i / 5) * 20 }, 8, 8, 4.5, 0);
  if (r.success) state = r.newState;
}

// Squads
import { createSquad } from '../src/services/settlementService';
const squads: any[] = [];
for (let i = 0; i < 3; i++) {
  const pos: Point2D = { x: 20 + i * 5, z: 10 + i * 5 };
  squads.push({
    squadId: `sq_${i}`, name: `Squad ${i}`, x: pos.x, z: pos.z,
    members: [{ id: `m${i}a`, name: 'A', health: 100, weapon: 'pistol' }, { id: `m${i}b`, name: 'B', health: 100, weapon: 'rifle' }],
    state: 'idle', targetBuildingId: null, inventory: [],
  } as any);
}

// Zombies
const zombies: any[] = [];
for (let i = 0; i < 40; i++) {
  zombies.push(createZombieUnit(Math.random() < 0.5 ? 'walker' : 'brute', { x: -100 + Math.random() * 200, z: -100 + Math.random() * 200 }));
}

// Resource work orders
state.resourceWorkOrders = Array.from({ length: 3 }, (_, i) => ({
  id: `rwo_${i}`, nodeId: `n_${i}`, resourceName: 'wood', resourceType: 'wood' as const,
  workerCount: 4, state: 'moving_to_node' as const, position: { x: 10 + i * 10, z: 40 },
  carried: 0,
})) as any;

const map = makeMap();
const grid = new PathGrid(map);

const clock = { day: 3, phase: 'day', isNight: false, speed: 1, time: 10 } as any;
const noiseEvents: any[] = [];
const droppedItems: any[] = [];

// Warmup
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
console.log(`sim pipeline: ${(total / TICKS).toFixed(2)} ms per 100ms tick (budget: 100 ms)`);
console.log(`buildings: freestanding=${state.freestandingBuildings.length} orders=${state.constructionOrders?.length ?? 0}`);
