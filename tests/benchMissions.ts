/**
 * Micro-benchmark for the 1s mission/radio interval that runs in
 * useWorldEffects: updateMissionSystem + updateRadioDirectiveSystem under a
 * realistic settlement + 1600-building map. Run:
 * node --import tsx --import ./tests/register-loader.mjs tests/benchMissions.ts
 */
import { getInitialMissionState, updateMissionSystem } from '../src/services/missionService';
import { updateRadioDirectiveSystem, getInitialRadioDirectiveState } from '../src/services/radioDirectiveService';
import {
  createInitialSettlementState,
  establishSettlementHQ,
  buildFreestanding,
} from '../src/services/settlementService';
import type { SettlementState } from '../src/types/settlement';
import type { BuildingPolygon, MapData } from '../src/types/map';
import { registerAllContent } from '../src/services/missionRegistry';

registerAllContent();

function makeMap(n: number): MapData {
  const b = { minX: -600, maxX: 600, minZ: -600, maxZ: 600 };
  const buildings: any[] = [];
  for (let i = 0; i < n; i++) {
    const x = -580 + (i % 40) * 29;
    const z = -580 + Math.floor(i / 40) * 29;
    buildings.push({
      id: `b_${i}`, type: 'residential', rawType: 'yes', name: `B${i}`,
      height: 8, levels: 2, center: { x, z },
      polygon: [{ x: x - 6, z: z - 6 }, { x: x + 6, z: z - 6 }, { x: x + 6, z: z + 6 }, { x: x - 6, z: z + 6 }],
      tags: {},
    });
  }
  return {
    cityName: 'B', bounds: b,
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'S', country: 'X' },
    buildings, roads: [], landuse: [], resourceNodes: [],
    stats: { buildingCount: n, roadCount: 0, resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 }, elevationRangeMeters: 20, processedTimeMs: 0 },
    fetchedAt: 0, source: 'test',
  } as unknown as MapData;
}

function makeHq(): BuildingPolygon {
  return {
    id: 'b_hq', type: 'residential' as any, rawType: 'headquarters', name: 'HQ',
    height: 12, levels: 3, center: { x: 0, z: 0 },
    polygon: [{ x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 }],
    tags: {},
  };
}

let state: SettlementState = createInitialSettlementState('Bench');
state = establishSettlementHQ(state, makeHq());
// Make it feel mid-game: searches, squads, hidden groups, lairs
state.buildingSearches = new Map();
for (let i = 0; i < 200; i++) state.buildingSearches.set(`b_${i}`, { buildingId: `b_${i}`, searched: true, searchProgress: 100, observed: true, unlootedItems: [], lootedItems: [], loot: [] } as any);
state.squads = [{ id: 'sq1', name: 'S1', generalCount: 4, status: 'operational' } as any];
state.zombieLairs = new Map();
for (let i = 0; i < 20; i++) {
  state.zombieLairs.set(`b_${1000 + i}`, { buildingId: `b_${1000 + i}`, buildingName: `B${1000 + i}`, population: 20, isDiscovered: i % 2 === 0, isCleared: false } as any);
}

const map = makeMap(1600);
const clock = { day: 5, phase: 'day', isNight: false, speed: 1, time: 600 } as any;
const ctx = { mapData: map, caravans: [], settlements: [{ id: 's1', name: 'Home' }] };

let missionState = getInitialMissionState();
let radioState = getInitialRadioDirectiveState();

// Warmup
missionState = updateMissionSystem(missionState, state, clock, ctx).newState;
radioState = updateRadioDirectiveSystem(radioState, state, clock, []).newState;

const RUNS = 100;
const t0 = performance.now();
for (let i = 0; i < RUNS; i++) {
  clock.day = 5 + Math.floor(i / 50);
  const mres = updateMissionSystem(missionState, state, clock, ctx);
  missionState = mres.newState;
  const rres = updateRadioDirectiveSystem(radioState, state, clock, []);
  radioState = rres.newState;
}
const total = performance.now() - t0;
console.log(`mission+radio interval: ${(total / RUNS).toFixed(2)} ms per 1s invocation (budget: generous, it's 1Hz)`);
console.log(`activeMissions=${missionState.activeMissions.length} triggered=${missionState.triggeredEventIds.length}`);
