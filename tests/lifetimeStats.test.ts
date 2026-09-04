import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZombieUnit, tickCombatSimulation } from '../src/services/combatService';
import {
  buildFreestanding,
  bumpLifetimeStat,
  createInitialLifetimeStats,
  createInitialSettlementState,
  getLifetimeStats,
} from '../src/services/settlementService';
import { runSimulationPipeline } from '../src/services/simulationPipeline';
import { createSquad, recruitHiddenGroup } from '../src/services/populationService';
import { adaptBuilding, establishSettlementHQ } from '../src/services/settlementService';
import { PathGrid } from '../src/services/pathfindingService';
import { startResearchNode, tickResearchSimulation } from '../src/services/researchService';
import type { BuildingPolygon, MapData } from '../src/types/map';

function makeMap(): MapData {
  return {
    cityName: 'T',
    bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 },
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

function makeHqBuilding(): BuildingPolygon {
  return {
    id: 'b_hq',
    type: 'residential',
    rawType: 'residential',
    name: 'Command House',
    height: 8,
    levels: 2,
    polygon: [
      { x: -8, z: -8 },
      { x: 8, z: -8 },
      { x: 8, z: 8 },
      { x: -8, z: 8 },
    ],
    center: { x: 0, z: 0 },
  } as unknown as BuildingPolygon;
}

function makeHqSettlement(name = 'Stats Test') {
  return establishSettlementHQ(createInitialSettlementState(name), makeHqBuilding());
}

test('getLifetimeStats falls back to zeroed defaults for legacy saves', () => {
  const legacy = createInitialSettlementState('Legacy');
  delete (legacy as any).lifetimeStats;
  assert.deepEqual(getLifetimeStats(legacy), createInitialLifetimeStats());
  const bumped = bumpLifetimeStat(legacy, 'infectedKills', 3);
  assert.equal(bumped.lifetimeStats?.infectedKills, 3);
  // Original untouched (immutability).
  assert.equal(getLifetimeStats(legacy).infectedKills, 0);
});

test('tickCombatSimulation counts each fresh infected death exactly once', () => {
  const grid = new PathGrid(makeMap());
  const wire = { typeId: 'barbed_wire' as const, position: { x: 0, z: 0 }, rotationDeg: 0 };
  grid.setFreestandingObstacles([wire]);

  const clock = {
    totalElapsedSeconds: 0, speed: 1, isNight: true, day: 1,
    phase: 'night', hours: 22, minutes: 0,
  } as any;

  // 1 HP zombie ON the wire: bleeds to 0 inside the map, transition to dead
  // (and the kill) is recorded the FOLLOWING pass — still exactly once.
  const lowHp = createZombieUnit('shambler', 0, 0, 0, true);
  lowHp.maxHp = 100;
  lowHp.currentHp = 1;
  lowHp.state = 'chasing';
  lowHp.targetPos = { x: 20, z: 0 };

  // Pre-dead zombie must never be re-counted.
  const alreadyDead = createZombieUnit('shambler', 0, 50, 0, true);
  alreadyDead.currentHp = 0;
  alreadyDead.state = 'dead';

  const t1 = tickCombatSimulation(
    [lowHp, alreadyDead], [], new Map(), [], clock, null, 1,
    undefined, [], [], grid, false
  );
  // The map's dead-check runs BEFORE the mid-map wire bleed, so the low-HP
  // zombie leaves this pass with currentHp 0 but state still 'chasing'.
  const deadNow = t1.updatedZombies.filter((z: any) => z.state === 'dead').length;
  assert.equal(t1.zombiesKilled, 0, 'bleed happens mid-map; death counted next pass');
  assert.equal(deadNow, 1, 'only the pre-dead zombie is dead on this pass');

  const t2 = tickCombatSimulation(
    t1.updatedZombies, [], new Map(), [], clock, null, 1,
    undefined, [], [], grid, false
  );
  assert.equal(t2.zombiesKilled, 1, 'the one fresh death is counted once');
});

test('pipeline commits the infected-kill tally into settlement lifetimeStats', () => {
  const state = makeHqSettlement();
  const grid = new PathGrid(makeMap());
  grid.setFreestandingObstacles([{
    typeId: 'barbed_wire' as const, position: { x: 0, z: 0 }, rotationDeg: 0,
  }]);

  // 1-HP zombie standing on the wire: bleeds out over the pipeline ticks, and
  // the authoritative death transition lands the tally in lifetimeStats.
  const zombie = createZombieUnit('shambler', 0, 0, 0, true);
  zombie.maxHp = 100;
  zombie.currentHp = 1;
  zombie.state = 'chasing';
  zombie.targetPos = { x: 0, z: 0 };

  const clock = {
    day: 2, hour: 23, minute: 0, speed: 1 as const, phase: 'night' as const,
    isNight: true, hordeWaveIntensity: 0, totalElapsedSeconds: 0,
  };

  const r1 = runSimulationPipeline({
    state, mapData: makeMap(), squads: [], zombies: [zombie],
    hostileHumans: [], noiseEvents: [], droppedItems: [], clock: clock as never,
    deltaSeconds: 1, pathGrid: grid,
  });

  // The kill may land this tick or the next (combat ordering) — the tally is
  // cumulative and only ever grows from the authoritative death transition.
  const afterKill = r1.state.lifetimeStats?.infectedKills ?? 0;
  const r2 = runSimulationPipeline({
    state: r1.state, mapData: r1.mapData, squads: [], zombies: r1.zombies,
    hostileHumans: [], noiseEvents: [], droppedItems: [], clock: clock as never,
    deltaSeconds: 1, pathGrid: grid,
  });
  const afterSecond = r2.state.lifetimeStats?.infectedKills ?? 0;
  assert.ok(
    afterKill + afterSecond >= 1,
    `at least one kill tallied across two ticks (got ${afterKill} then ${afterSecond})`
  );
  assert.ok(afterSecond >= afterKill, 'tally never decreases');
});

test('squad formation bumps squadsFormed', () => {
  const state = makeHqSettlement();
  state.namedSurvivors = [
    { id: 'n1', name: 'Ada', stats: {}, role: { type: 'unassigned' } } as any,
  ];
  state.generalPopulation.total = 4;
  const r = createSquad(state, 'Alpha', 'n1', 2);
  assert.equal(r.success, true);
  assert.equal(r.newState.lifetimeStats?.squadsFormed, 1);
});

test('building adaptation bumps buildingsAdapted', () => {
  const state = makeHqSettlement();
  state.buildingSearches = new Map([
    ['b_target', { buildingId: 'b_target', searched: true, fullyLooted: true, observed: true, loot: [] }],
  ]);
  state.stockpile.materials = { wood: 200, metal: 200, bricks: 200, tools: 20, scientific_materials: 0 };
  const bldg = makeHqBuilding();
  bldg.id = 'b_target';
  const r = adaptBuilding(state, bldg, 'shelter');
  assert.equal(r.success, true, r.error);
  assert.equal(r.newState.lifetimeStats?.buildingsAdapted, 1);
});

test('freestanding construction bumps buildingsConstructed', () => {
  const state = makeHqSettlement();
  state.stockpile.materials = { wood: 500, metal: 500, bricks: 500, tools: 20, scientific_materials: 0 };
  (state as any).research = { unlockedNodes: ['advanced_masonry', 'basic_sanitation'] };
  const r = buildFreestanding(state, 'water_cistern', { x: 30, z: 30 });
  assert.equal(r.success, true, r.error);
  assert.equal(r.newState.lifetimeStats?.buildingsConstructed, 1);
});

test('hidden-group recruitment bumps survivorsRecruited by the group size', () => {
  const state = makeHqSettlement();
  state.hiddenGroups = new Map([
    ['b_group', {
      isDiscovered: true,
      isRecruited: false,
      disposition: 'friendly',
      leader: { name: 'Mara', stats: {} },
      generalCount: 3,
      foodCostToBribe: 0,
    } as any],
  ]);
  const r = recruitHiddenGroup(state, 'b_group');
  assert.equal(r.success, true);
  assert.equal(r.newState.lifetimeStats?.survivorsRecruited, 4, 'leader + 3 civilians');
});

test('research completion bumps researchCompleted', () => {
  const state = makeHqSettlement();
  state.stockpile.materials.scientific_materials = 10;
  (state as any).research = {
    unlockedNodes: [],
    activeResearchId: null,
    activeProgressSec: 0,
  };
  const started = startResearchNode(state, 'basic_sanitation');
  // Force-complete by granting a huge worker-seconds delta in a single tick.
  started.updatedSettlement.research.activeProgressSec =
    // baseTimeSec for basic_sanitation lives on the node definition; just use a
    // value far above any plausible requirement.
    1_000_000;
  const done = tickResearchSimulation(started.updatedSettlement, 1, 1, false);
  assert.ok(
    done.research?.unlockedNodes?.includes('basic_sanitation'),
    'research should complete'
  );
  assert.equal(done.lifetimeStats?.researchCompleted, 1);
});