import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptBuilding,
  canAffordCost,
  createInitialSettlementState,
  recalculateSettlementStats,
  buildFreestanding,
} from '../src/services/settlementService';
import { tickSettlementSimulation } from '../src/services/populationService';
import {
  generateLootForBuilding,
  hasStockpileRoomForHaul,
  startBuildingSearch,
  tickBuildingScavengeProgress,
  unloadSquadAtDropoff,
} from '../src/services/scavengingService';
import {
  countSettlementSurvivors,
  evaluateSettlementLoss,
  markSettlementDestroyed,
  markSettlementReclaimed,
} from '../src/services/settlementLifecycleService';
import { calculateGlobalNetworkStats } from '../src/services/caravanService';
import { establishSettlementHQ } from '../src/services/settlementService';
import type { SettlementRecord } from '../src/types/caravan';
import type { ZombieUnit, ZombieAiState, ZombieVariant } from '../src/types/combat';
import { runEconomyStages, runEconomySimulationTick, runSimulationPipeline } from '../src/services/simulationPipeline';
import { simulateSettlementOffline } from '../src/services/offlineSettlementService';
import { runLogisticsStage } from '../src/services/logisticsPipeline';
import { tickZombieLairs } from '../src/services/rivalFactionService';
import type { BuildingPolygon, MapData } from '../src/types/map';
import type { SettlementHQ, SettlementState } from '../src/types/settlement';
import { getPrimaryHQ } from '../src/services/buildingOperational';
import { tickMedicalFacilityCare } from '../src/services/combatService';
import {
  grantScientificMaterials,
  getScientificMaterials,
  startResearchNode,
  tickResearchSimulation,
  unlockResearchNode,
} from '../src/services/researchService';
import type { ZombieLair } from '../src/types/combat';
import {
  FUNCTIONAL_BUILDING_DEFINITIONS,
  getCanonicalDefenseDef,
} from '../src/data/functionalBuildings';
import {
  collectStrandedLoot,
  countFieldLootUnits,
  strandDeadSquadInventories,
  strandMaterialsAt,
  strandSquadInventoryAt,
} from '../src/services/strandedLootService';

// §7.1 explicit defensive classification — no string-name gate inference.
test('defensive structures are classified by explicit flags, not type-id strings', () => {
  // Walls & barriers block movement; palisades/bastions are NOT gates.
  const palisade = getCanonicalDefenseDef('wooden_palisade')!;
  assert.equal(palisade.blocksMovement, true, 'palisade is a hard perimeter barrier');
  assert.equal(palisade.allowsFriendlyPassage, undefined, 'palisade is not a gate');

  const barbedWire = getCanonicalDefenseDef('barbed_wire')!;
  // §7.1 hazard, not a barrier: wire is passable but slows + bleeds infected.
  assert.equal(barbedWire.blocksMovement, false, 'barbed wire does NOT block pathing');
  assert.equal(barbedWire.allowsFriendlyPassage, undefined, 'barbed wire is not a gate');
  assert.equal(barbedWire.slowsInfectedPct, 60, 'wire slows infected by 60%');
  assert.equal(barbedWire.damageOnContact, 15, 'wire bleeds infected on contact');

  const bastion = getCanonicalDefenseDef('fortified_wall')!;
  assert.equal(bastion.allowsFriendlyPassage, undefined, 'bastion wall is not a gate');
  // §IFZ: walls are passive barriers — garrison fire comes from towers and
  // gatehouses, never from standing on the wall run.
  assert.equal(bastion.guardable, false, 'walls are not manned firing posts');

  // Gates are the only structures that allow friendly passage (and still block).
  for (const gateId of ['wooden_gate', 'metal_gate', 'fortified_gate']) {
    const gate = getCanonicalDefenseDef(gateId)!;
    assert.equal(gate.blocksMovement, true, `${gateId} blocks enemies`);
    assert.equal(gate.allowsFriendlyPassage, true, `${gateId} is a passage portal`);
    assert.equal(gate.weaponMountable, undefined, `${gateId} carries no mounted weapon`);
  }

  // Weapon-mountable towers are guardable and mount weapons; floodlight is a
  // guardable illuminator, not a weapon platform.
  for (const towerId of ['wooden_tower', 'metal_tower', 'fortified_tower']) {
    const tower = getCanonicalDefenseDef(towerId)!;
    assert.equal(tower.weaponMountable, true, `${towerId} is a weapon platform`);
    assert.equal(tower.guardable, true, `${towerId} can be staffed`);
    assert.equal(tower.allowsFriendlyPassage, undefined, `${towerId} is not a passage`);
  }
  const floodlight = getCanonicalDefenseDef('floodlight_tower')!;
  assert.equal(floodlight.weaponMountable, undefined, 'floodlight tower mounts no weapon');
  // §Terminus infra: a floodlight is powered illumination, not a garrison.
  assert.equal(floodlight.guardable, false, 'floodlight tower is not a firing post');
  assert.equal(floodlight.adaptationAllowed, false, 'floodlight is purpose-built freestanding infra');

  // Alias defs (guard_watchtower -> wooden_tower, barricade_gatehouse ->
  // wooden_gate) resolve to the canonical flags the sim reads.
  assert.equal(getCanonicalDefenseDef('guard_watchtower')?.weaponMountable, true);
  assert.equal(getCanonicalDefenseDef('barricade_gatehouse')?.allowsFriendlyPassage, true);

  // Every defensive def is explicitly flagged (no accidental string fallback).
  // §IFZ: only gates and towers are mannable firing posts; wire, walls and
  // fences are passive barriers and never demand guard labour.
  const defensiveIds = [
    'barbed_wire', 'wooden_palisade', 'wooden_gate', 'metal_fence', 'metal_gate',
    'brick_wall', 'fortified_wall', 'fortified_gate', 'wooden_tower', 'metal_tower',
    'fortified_tower', 'floodlight_tower',
  ];
  const mannable = new Set(['wooden_gate', 'metal_gate', 'fortified_gate', 'wooden_tower', 'metal_tower', 'fortified_tower']);
  for (const id of defensiveIds) {
    const def = FUNCTIONAL_BUILDING_DEFINITIONS[id];
    if (id === 'barbed_wire') {
      // §7.1 hazard: wire is passable, not a barrier — damages/slows only.
      assert.equal(def.blocksMovement, false, `${id} is a hazard, not a barrier`);
      assert.equal(def.slowsInfectedPct, 60, `${id} slows infected`);
      assert.equal(def.damageOnContact, 15, `${id} bleeds on contact`);
    } else {
      assert.ok(def.blocksMovement, `${id} blocks movement`);
    }
    assert.equal(def.guardable, mannable.has(id), `${id} guardable must match its firing-post role`);
  }
});

function makeMap(): MapData {
  return {
    center: { lat: 51.5, lon: -0.12 },
    radius: 600,
    elevation: {
      minElevation: 10,
      maxElevation: 30,
      baseElevation: 20,
      resolution: 2,
      grid: [[20, 20], [20, 20]],
      bounds: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 },
    },
    buildings: [],
    roads: [],
    landuse: [],
    resourceNodes: [],
    bounds: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 },
    stats: {
      buildingCount: 0,
      roadCount: 0,
      resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 },
      elevationRangeMeters: 20,
      processedTimeMs: 0,
    },
    fetchedAt: 0,
    source: 'test',
  };
}

function seedConstruction(state: SettlementState): SettlementState {
  const stockpile = JSON.parse(JSON.stringify(state.stockpile));
  stockpile.materials.wood = 500;
  stockpile.materials.metal = 500;
  stockpile.materials.bricks = 500;
  const building = {
    buildingId: 'test_bldg_1',
    typeId: 'house' as const,
    isHQ: false,
    name: 'Test House',
    category: 'residential' as const,
    adaptedAt: 0,
    footprintAreaM2: 80,
    adaptedAreaM2: 80,
    adaptationPercentage: 100,
    totalFloorAreaM2: 160,
    volumeM3: 480,
    maxCapacity: 6,
    currentUsage: 0,
    capacityUnit: 'citizens' as const,
    maxDurability: 200,
    currentDurability: 200,
    defenseRating: 2,
    isFreestanding: false,
    position: { x: 50, z: 50 },
    height: 3,
    levels: 1,
    polygon: [],
    constructionStatus: 'in_progress' as const,
    constructionProgress: 0,
    constructionWorkRequired: 100,
    constructionWorkDone: 0,
    assignedWorkers: 2,
  };
  return {
    ...state,
    stockpile,
    adaptedBuildings: new Map([[building.buildingId, building as any]]),
    constructionOrders: [{
      id: 'const_test_bldg_1',
      buildingId: 'test_bldg_1',
      buildingName: 'Test House',
      workerCount: 2,
      state: 'constructing' as const,
      position: { x: 0, z: 0 },
      targetPosition: { x: 50, z: 50 },
      totalCost: { wood: 50, metal: 20, bricks: 20, tools: 0 },
      deductedCost: { wood: 0, metal: 0, bricks: 0, tools: 0 },
      progress: 0,
      createdAt: 0,
    }],
  } as unknown as SettlementState;
}

test('starting stockpile can afford the Wooden Tower (tools key present)', () => {
  const fresh = createInitialSettlementState('Test Colony');
  const towerCost = { wood: 45, metal: 10, bricks: 10, tools: 0 };
  assert.equal(fresh.stockpile.materials.tools, 20, 'new games seed 20 starting tools');
  assert.ok(canAffordCost(fresh.stockpile, towerCost), '50/50/50 + tools must afford a Wooden Tower');
  const placed = buildFreestanding(fresh, 'wooden_tower', { x: 10, z: 10 });
  assert.ok(placed.success, `Wooden Tower placement should succeed on a fresh game: ${placed.error || ''}`);
});

test('primary HQ cannot be scavenged and leftover-loot buildings cannot be adapted', () => {
  const state = {
    ...createInitialSettlementState('Test Colony'),
    headquarters: [{
      buildingId: 'hq_bldg_1', buildingName: 'Command HQ', establishedAt: 0,
      footprintAreaM2: 100, levels: 1, center: { x: 0, z: 0 },
      defenseRating: 50, maxCapacity: 20, maxDurability: 800, currentDurability: 800,
    }],
    primaryHQId: 'hq_bldg_1',
  } as unknown as SettlementState;

  const hqBuilding = {
    id: 'hq_bldg_1', type: 'residential', rawType: 'yes', name: 'Command HQ House',
    height: 8, levels: 2, center: { x: 0, z: 0 },
    polygon: [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }],
  } as any;

  // 1. HQ is never scavengeable
  const search = startBuildingSearch(state, 'squad_1', { x: 0, z: 0 }, hqBuilding);
  assert.equal(search.success, false, 'HQ must reject scavenging');
  assert.match(search.error || '', /headquarters/i);

  // 2. HQ can never be adapted
  const adaptHQ = adaptBuilding(state, hqBuilding, 'shelter_bunkhouse');
  assert.equal(adaptHQ.success, false, 'HQ must reject adaptation');
  assert.match(adaptHQ.error || '', /headquarters/i);

  // 3. A searched-but-not-fully-looted building (leftovers remain) is NOT adaptable
  const lootBldg = {
    id: 'loot_bldg_1', type: 'residential', rawType: 'yes', name: 'Looted House',
    height: 8, levels: 2, center: { x: 0, z: 0 },
    polygon: [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }],
  } as any;
  const leftoverState = {
    ...state,
    buildingSearches: new Map([[
      'loot_bldg_1',
      { searched: true, searchProgress: 100, unlootedItems: [{ id: 'x1', kind: 'resource', label: 'wood', quantity: 3, weight: 1 }], lootedItems: [{ id: 'x2', kind: 'resource', label: 'metal', quantity: 2, weight: 1 }] },
    ]]),
  } as unknown as SettlementState;
  const adaptLeftover = adaptBuilding(leftoverState, lootBldg, 'shelter_bunkhouse');
  assert.equal(adaptLeftover.success, false, 'building with leftover loot must not be adaptable');

  // 4. Fully looted (searched + empty leftover stack) IS adaptable
  const clearedState = {
    ...state,
    buildingSearches: new Map([[
      'loot_bldg_1',
      { searched: true, searchProgress: 100, unlootedItems: [], lootedItems: [{ id: 'x2', kind: 'resource', label: 'metal', quantity: 2, weight: 1 }] },
    ]]),
  } as unknown as SettlementState;
  // shelter_bunkhouse has no research gate, so a fully looted building must
  // pass cleanly through the loot gate (it may then be rejected for position or
  // footprint reasons, but never for missing loot — that error specifically).
  const adaptCleared = adaptBuilding(clearedState, lootBldg, 'shelter_bunkhouse');
  assert.ok(
    adaptCleared.success || !/scaveng/i.test(adaptCleared.error || ''),
    `fully looted building must not be blocked by the loot gate: ${adaptCleared.error}`
  );
});

test('tools are in the scavenge loot pool and the stockpile deposit path', () => {
  const bldg = {
    id: 'loot_tools_1', type: 'industrial', rawType: 'warehouse', name: 'Tool Shed',
    height: 6, levels: 1, center: { x: 0, z: 0 },
    polygon: [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }],
  } as any;

  // Force Math.random to always return 0.0 so every probabilistic branch
  // passes: the 50% tools roll, the 35% axe roll, and the 25% bricks roll.
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const loot = generateLootForBuilding(bldg, 1);
    const toolsStack = loot.find((l) => l.label === 'tools');
    assert.ok(toolsStack, `industrial loot pool must include tools, got labels ${loot.map((l) => l.label).join(',')}`);
    assert.ok((toolsStack?.quantity || 0) > 0, 'tools stack must carry a quantity');

    // Deposit path: simulate a squad returning with the tools stack by
    // routing it through the full unload -> stockpile flow.
    const state = {
      ...createInitialSettlementState('Test Colony'),
      headquarters: [{
        buildingId: 'hq_1', buildingName: 'HQ', establishedAt: 0,
        footprintAreaM2: 100, levels: 1, center: { x: 0, z: 0 },
        defenseRating: 50, maxCapacity: 20, maxDurability: 800, currentDurability: 800,
      }],
      primaryHQId: 'hq_1',
      squadInventories: {
        s1: { capacity: 4, used: 1, items: [toolsStack] },
      },
    } as unknown as SettlementState;
    const before = state.stockpile.materials.tools;
    const unloaded = unloadSquadAtDropoff(state, 's1', { x: 0, z: 0 }, { x: 0, z: 0, name: 'HQ' });
    assert.ok(
      unloaded.unloaded.some((l) => l.label === 'tools'),
      'tools loot must unload at the dropoff'
    );
    assert.ok(
      unloaded.newState.stockpile.materials.tools > before,
      `tools must land in the stockpile (${before} -> ${unloaded.newState.stockpile.materials.tools})`
    );
  } finally {
    Math.random = originalRandom;
  }
});

test('legacy saves without a tools stockpile key can still build', () => {
  // Older saves seeded materials without `tools`; `undefined >= 0` is false in
  // JS, which silently blocked every freestanding build at game start.
  const fresh = createInitialSettlementState('Test Colony');
  fresh.stockpile.materials = { wood: 50, metal: 50, bricks: 50 } as any;
  const towerCost = { wood: 45, metal: 10, bricks: 10, tools: 0 };
  assert.ok(canAffordCost(fresh.stockpile, towerCost), 'missing tools key must not block a zero-tools build');
});

test('partial adaptation scales capacity/defense by converted area and can be expanded to 100%', () => {
  // §7.1: adapting 25% of a real warehouse must produce a 25% facility —
  // capacity, defense and adapted area proportional to the conversion, with
  // fullCapacity retained as the expansion ceiling.
  const fresh = createInitialSettlementState('Partial Test');
  fresh.stockpile.materials = { wood: 500, metal: 500, bricks: 500, tools: 20 };
  const bldg = {
    id: 'adapt_partial_1', type: 'warehouse', rawType: 'warehouse', name: 'Partial Warehouse',
    height: 8, levels: 2, center: { x: 0, z: 0 },
    polygon: [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }],
  } as any;
  // Fully looted so the loot gate passes.
  const state = {
    ...fresh,
    buildingSearches: new Map([[
      'adapt_partial_1',
      { searched: true, searchProgress: 100, unlootedItems: [], lootedItems: [{ id: 'x1', kind: 'resource', label: 'metal', quantity: 1, weight: 1 }] },
    ]]),
  } as unknown as SettlementState;

  const partial = adaptBuilding(state, bldg, 'warehouse', 25);
  assert.ok(partial.success, `25% warehouse adaptation must succeed: ${partial.error || ''}`);
  const p = partial.newState.adaptedBuildings.get('adapt_partial_1') as any;
  assert.equal(p.adaptationPercentage, 25, 'record must store 25% coverage');
  assert.equal(p.adaptedAreaM2, 25, `adapted area = 25% of the 100m² footprint, got ${p.adaptedAreaM2}`);
  assert.ok(
    p.fullCapacity && p.fullCapacity === 720,
    `full (100%) capacity retained for expansion preview, got ${p.fullCapacity}`
  );
  assert.equal(p.maxCapacity, 180, `25% facility must hold 25% of full capacity (720 -> 180), got ${p.maxCapacity}`);
  // Warehouse baseDefense 40 + 2 levels × 8 = 56 full; 25% → 14.
  assert.equal(p.defenseRating, 14, `defense scales with converted share (56 -> 14), got ${p.defenseRating}`);
  // Stockpile isn't touched at adapt time — materials are deducted
  // progressively as the construction order advances. The queued order must
  // only charge the incremental 25% share, not the whole building.
  assert.equal(partial.newState.stockpile.materials.wood, 500, 'materials are consumed by the construction order, not at adapt time');
  const partialOrder = partial.newState.constructionOrders?.find((o) => o.buildingId === 'adapt_partial_1');
  assert.ok(partialOrder, 'partial adaptation must queue a construction order');
  // Warehouse is a preferred OSM type so adaptation gets a 25% discount:
  // full wood cost 35 → 26; 25% conversion → ceil(26 × 0.25) = 7.
  assert.equal(partialOrder!.totalCost.wood, 7, '25% conversion order charges only the discounted 25% share (26 -> 7)');

  // Complete the partial build, then expand to 100% (the drawer's EXPAND action).
  const completed = {
    ...partial.newState,
    adaptedBuildings: new Map([[
      'adapt_partial_1',
      { ...p, constructionStatus: 'completed', constructionProgress: 100, constructionWorkDone: p.constructionWorkRequired },
    ]]),
  } as unknown as SettlementState;
  const expanded = adaptBuilding(completed, bldg, 'warehouse', 100);
  assert.ok(expanded.success, `expansion to 100% must succeed: ${expanded.error || ''}`);
  const e = expanded.newState.adaptedBuildings.get('adapt_partial_1') as any;
  assert.equal(e.adaptationPercentage, 100);
  assert.equal(e.maxCapacity, e.fullCapacity, 'expanded facility reaches full capacity');
  assert.equal(e.defenseRating, 56, 'defense restored to full at 100% coverage');
  const expandedOrder = expanded.newState.constructionOrders?.find((o) => o.buildingId === 'adapt_partial_1');
  assert.ok(expandedOrder, 'expansion must queue a fresh construction order');
  // Remaining 75% of the discounted cost: ceil(26 × 0.75) = 20.
  assert.equal(expandedOrder!.totalCost.wood, 20, 'expansion charges only the remaining discounted share (26 -> 20)');
});

test('economy stages advance construction work with active workers', () => {
  const base = seedConstruction(createInitialSettlementState('Test Colony'));
  const result = runEconomyStages(base, 10, 1, 1, false);
  const out = result.newState.adaptedBuildings.get('test_bldg_1') as any;
  assert.ok(out.constructionWorkDone > 0, `expected construction work to advance, got ${out.constructionWorkDone}`);
  assert.ok(result.completedConstructions.length === 0, 'should not complete in a single 10s tick');
});

test('paused clock (speed 0) freezes the economy', () => {
  const base = seedConstruction(createInitialSettlementState('Test Colony'));
  const before = (base.adaptedBuildings.get('test_bldg_1') as any).constructionWorkDone;
  const foodBefore = base.stockpile.food.canned_goods;
  const result = runEconomyStages(base, 600, 0, 1, false);
  const after = (result.newState.adaptedBuildings.get('test_bldg_1') as any).constructionWorkDone;
  assert.equal(after, before, 'construction must not advance while paused');
  assert.equal(result.newState.stockpile.food.canned_goods, foodBefore, 'food must not be consumed while paused');
});

test('economy stage is deterministic for identical inputs', () => {
  const base = seedConstruction(createInitialSettlementState('Test Colony'));
  const a = runEconomyStages(base, 60, 1, 1, false).newState;
  const b = runEconomyStages(base, 60, 1, 1, false).newState;
  assert.equal((a.adaptedBuildings.get('test_bldg_1') as any).constructionWorkDone,
    (b.adaptedBuildings.get('test_bldg_1') as any).constructionWorkDone);
  assert.equal(a.stockpile.food.canned_goods, b.stockpile.food.canned_goods);
  assert.equal(a.stockpile.materials.wood, b.stockpile.materials.wood);
});

test('offline catch-up advances the economy without a map', () => {
  const base = seedConstruction(createInitialSettlementState('Test Colony'));
  const before = (base.adaptedBuildings.get('test_bldg_1') as any).constructionWorkDone;
  const out = simulateSettlementOffline(base, 180, 1, undefined);
  const after = (out.state.adaptedBuildings.get('test_bldg_1') as any).constructionWorkDone;
  assert.ok(after > before, `offline sim must advance construction, got ${before} -> ${after}`);
});

test('offline catch-up with a map depletes nodes and returns the depleted map', () => {
  const map = makeMap();
  map.resourceNodes = [{
    id: 'node_wood_1', type: 'wood', subType: 'tree',
    position: { x: 40, z: 40 }, rotation: 0, scale: 1,
    source: 'park_scatter', amount: 100, maxAmount: 100, isDepleted: false,
  }];
  const state = {
    ...createInitialSettlementState('Test Colony'),
    headquarters: [{
      buildingId: 'hq_1', buildingName: 'HQ', establishedAt: 0,
      footprintAreaM2: 100, levels: 1, center: { x: 0, z: 0 },
      defenseRating: 5, maxCapacity: 10, maxDurability: 800, currentDurability: 800,
    }],
    primaryHQId: 'hq_1',
    resourceWorkOrders: [{
      id: 'work_node_wood_1', nodeId: 'node_wood_1',
      resourceType: 'wood' as const, workerCount: 2,
      state: 'harvesting' as const, position: { x: 40, z: 40 },
      carried: 0, createdAt: 0,
    }],
  } as unknown as SettlementState;
  const out = simulateSettlementOffline(state, 180, 1, map);
  assert.ok(
    out.mapData && out.mapData.resourceNodes[0].amount < 100,
    `offline sim with a map must deplete nodes, got ${out.mapData?.resourceNodes[0].amount}`
  );
});

test('simulateSettlementOffline caps elapsed time at seven offline days', () => {
  const base = seedConstruction(createInitialSettlementState('Test Colony'));
  // 30 real days elapsed is clamped to 7 in-game days worth of sim steps.
  // 7 days of food consumption for the default 26-citizen colony:
  const expectedFoodPerDay = 26 * 0.5;
  const foodBefore = base.stockpile.food.canned_goods;
  const out = simulateSettlementOffline(base, 86400 * 30, 1, undefined);
  const foodAfter = out.state.stockpile.food.canned_goods;
  const consumed = foodBefore - foodAfter;
  assert.ok(consumed <= expectedFoodPerDay * 7 + 0.001, `offline sim consumed ${consumed}, expected at most ${expectedFoodPerDay * 7}`);
  assert.ok(consumed > 0, 'offline sim should consume food while catching up');
});

test('logistics stage is a no-op for squads with empty inventories', () => {
  const state = createInitialSettlementState('Test Colony');
  const map = makeMap();
  const res = runLogisticsStage(state, map, []);
  assert.equal(res.state, state);
  assert.equal(res.events.length, 0);
});

test('resource nodes deplete cumulatively across consecutive pipeline ticks', () => {
  // Mirrors the real loop: each tick feeds the previous tick's committed
  // mapData (via mapDataRef) back into the pipeline, so node amounts must
  // accumulate depletion instead of resetting to the original map.
  const map = makeMap();
  map.resourceNodes = [{
    id: 'node_wood_1', type: 'wood', subType: 'tree',
    position: { x: 40, z: 40 }, rotation: 0, scale: 1,
    source: 'park_scatter', amount: 100, maxAmount: 100, isDepleted: false,
  }];
  const state = {
    ...createInitialSettlementState('Test Colony'),
    headquarters: [{
      buildingId: 'hq_1', buildingName: 'HQ', establishedAt: 0,
      footprintAreaM2: 100, levels: 1, center: { x: 0, z: 0 },
      defenseRating: 5, maxCapacity: 10, maxDurability: 800, currentDurability: 800,
    }],
    primaryHQId: 'hq_1',
    resourceWorkOrders: [{
      id: 'work_node_wood_1', nodeId: 'node_wood_1',
      resourceType: 'wood' as const, workerCount: 2,
      state: 'harvesting' as const, position: { x: 40, z: 40 },
      carried: 0, createdAt: 0,
    }],
  } as unknown as SettlementState;
  const clock = {
    day: 1, hour: 8, minute: 0, speed: 1 as const, phase: 'day' as const,
    isNight: false, hordeWaveIntensity: 0, totalElapsedSeconds: 0,
  };
  const run = (s: SettlementState, m: MapData) =>
    runSimulationPipeline({
      state: s, mapData: m, squads: [], zombies: [], hostileHumans: [],
      noiseEvents: [], droppedItems: [], clock, deltaSeconds: 1,
    });
  const r1 = run(state, map);
  const afterFirst = r1.mapData.resourceNodes[0].amount;
  assert.ok(afterFirst < 100, `first tick should harvest wood, got ${afterFirst}`);
  const r2 = run(r1.state, r1.mapData);
  const afterSecond = r2.mapData.resourceNodes[0].amount;
  assert.ok(
    afterSecond < afterFirst,
    `second tick should continue depleting, got ${afterFirst} -> ${afterSecond}`
  );
});

test('primary HQ always provides 850 storage regardless of footprint', () => {
  const tinyHq = {
    buildingId: 'hq_tiny', buildingName: 'Tiny HQ', establishedAt: 0,
    footprintAreaM2: 10, levels: 1, center: { x: 0, z: 0 },
    defenseRating: 75, maxCapacity: 2,
    maxDurability: 800, currentDurability: 800,
  };
  const bigHq = { ...tinyHq, buildingId: 'hq_big', footprintAreaM2: 4000, maxCapacity: 800 };
  const tiny = recalculateSettlementStats([tinyHq], tinyHq.buildingId, new Map(), []);
  const big = recalculateSettlementStats([bigHq], bigHq.buildingId, new Map(), []);
  assert.equal(tiny.storageCap, 850, 'tiny HQ must still grant 850 storage');
  assert.equal(big.storageCap, 850, 'large HQ must still grant exactly 850 storage');
  // Warehouses still add capacity on top of the HQ vault.
  const warehouse = {
    buildingId: 'wh_1', typeId: 'warehouse' as const, isHQ: false, name: 'WH',
    category: 'basic' as const, adaptedAt: 0, footprintAreaM2: 200, adaptedAreaM2: 200,
    adaptationPercentage: 100, totalFloorAreaM2: 200, volumeM3: 600, maxCapacity: 500,
    currentUsage: 0, capacityUnit: 'units' as const, maxDurability: 550, currentDurability: 550,
    defenseRating: 40, isFreestanding: false, position: { x: 1, z: 1 }, height: 3,
    levels: 1, constructionStatus: 'completed' as const, constructionProgress: 100,
    constructionWorkRequired: 100, constructionWorkDone: 100, assignedWorkers: 0,
  };
  const withWarehouse = recalculateSettlementStats(
    [tinyHq],
    tinyHq.buildingId,
    new Map([[warehouse.buildingId, warehouse as any]]),
    []
  );
  assert.equal(withWarehouse.storageCap, 850 + 500);
});

test('a breached HQ contributes no storage, housing, defense or squad slots', () => {
  const hq = {
    buildingId: 'hq_1', buildingName: 'HQ', establishedAt: 0,
    footprintAreaM2: 100, levels: 1, center: { x: 0, z: 0 },
    defenseRating: 55, maxCapacity: 40,
    maxDurability: 800, currentDurability: 800,
  };
  const healthy = recalculateSettlementStats([hq], hq.buildingId, new Map(), []);
  assert.equal(healthy.storageCap, 850, 'standing HQ grants the 850 vault');
  assert.equal(healthy.livingCap, 40);
  // The primary HQ's squad complement is FIXED (2 slots) — the footprint of
  // the building it was established in grants no extra slots. Only
  // additional HQs and Squad Quarters scale with physical size.
  assert.equal(healthy.squadCapacity, 2, 'HQ supplies its fixed squad slots only');
  assert.equal(healthy.defenseRating, 55);

  const destroyedHq = { ...hq, currentDurability: 0 };
  const destroyed = recalculateSettlementStats(
    [destroyedHq],
    destroyedHq.buildingId,
    new Map(),
    []
  );
  assert.equal(destroyed.storageCap, 250, 'destroyed HQ must not grant the 850 vault');
  assert.equal(destroyed.livingCap, 0, 'destroyed HQ shelters nobody');
  assert.equal(destroyed.squadCapacity, 0, 'destroyed HQ commands no squads');
  assert.equal(destroyed.defenseRating, 0, 'destroyed HQ provides no defense');

  // Additional HQs are gated individually.
  const extraDestroyed = { ...hq, buildingId: 'hq_2', currentDurability: 0 };
  const extraHealthy = { ...hq, buildingId: 'hq_2' };
  const mixed = recalculateSettlementStats([hq, extraDestroyed, extraHealthy], hq.buildingId, new Map(), []);
  assert.equal(mixed.storageCap, 850 + 850, 'only the standing secondary HQ adds its 850 vault; the breached one adds nothing');
  assert.equal(mixed.squadCapacity, healthy.squadCapacity + 3, 'only the standing secondary HQ adds its squad slots');
  assert.equal(mixed.defenseRating, healthy.defenseRating + 55);
  assert.equal(mixed.livingCap, healthy.livingCap + 40);
});

test('primary HQ squad capacity is fixed regardless of building size', () => {
  const mkHq = (id: string, footprintAreaM2: number) => ({
    buildingId: id, buildingName: 'HQ', establishedAt: 0,
    footprintAreaM2, levels: 1, center: { x: 0, z: 0 },
    defenseRating: 55, maxCapacity: 40,
    maxDurability: 800, currentDurability: 800,
  });

  // A tiny shack and a sprawling command block both command exactly 2 squads.
  const tiny = recalculateSettlementStats([mkHq('hq_tiny', 25)], 'hq_tiny', new Map(), []);
  const huge = recalculateSettlementStats([mkHq('hq_huge', 5000)], 'hq_huge', new Map(), []);
  assert.equal(tiny.squadCapacity, 2, 'small primary HQ still grants the fixed 2 slots');
  assert.equal(huge.squadCapacity, 2, 'large primary HQ gains NO footprint-scaled slots');
  assert.equal(tiny.storageCap, 850, 'storage stays fixed too');
  assert.equal(huge.storageCap, 850, 'storage stays fixed too');

  // The same large building re-established as an ADDITIONAL HQ does scale.
  const extra = recalculateSettlementStats(
    [mkHq('hq_primary', 25), mkHq('hq_extra', 5000)],
    'hq_primary',
    new Map(),
    []
  );
  // √5000/8 = 8.8 → 8 + 2 fixed = 10 from the additional HQ, on top of the primary's 2.
  assert.equal(extra.squadCapacity, 2 + 10, 'additional HQ still scales with its footprint');
});

test('production never consumes inputs when its output cannot fit in storage', () => {
  // A completed cookhouse (grain_rations: 2 grain + 1 wood → 4 rations/day)
  // with full-time staff on an empty-population colony, so the only stockpile
  // movements are the factory's own.
  const base = createInitialSettlementState('Sink Test');
  const hq = {
    buildingId: 'hq_1', buildingName: 'HQ', establishedAt: 0,
    footprintAreaM2: 100, levels: 1, center: { x: 0, z: 0 },
    defenseRating: 5, maxCapacity: 10, maxDurability: 800, currentDurability: 800,
  };
  const cookhouse = {
    buildingId: 'kitchen_1', typeId: 'cookhouse' as const, isHQ: false, name: 'Cookhouse',
    category: 'food' as const, adaptedAt: 0, footprintAreaM2: 120, adaptedAreaM2: 120,
    adaptationPercentage: 100, totalFloorAreaM2: 120, volumeM3: 360, maxCapacity: 12,
    currentUsage: 0, capacityUnit: 'citizens' as const, maxDurability: 420, currentDurability: 420,
    defenseRating: 40, isFreestanding: false, position: { x: 20, z: 20 }, height: 3,
    levels: 1,    constructionStatus: 'completed' as const, constructionProgress: 100,
    constructionWorkRequired: 100, constructionWorkDone: 100, assignedWorkers: 4,
    selectedRecipeId: 'grain_rations',
  };
  const seed = {
    ...base,
    headquarters: [hq],
    primaryHQId: 'hq_1',
    namedSurvivors: [],
    generalPopulation: { total: 0, children: [], inSquads: 0, unassigned: 0 },
    totalStorageCapacity: 850,
    // Everything else zeroed so the cookhouse inputs are the only stock:
    // 10 grain + 5 wood + 835 ammo = exactly 850 / 850 units.
    stockpile: {
      food: { canned_goods: 0, mre_rations: 0, dried_rations: 0, fresh_harvest: 0, grain: 10 },
      water: { bottled_water: 0, purified_water: 0, rainwater: 0 },
      medical: { first_aid_kits: 0, sterile_bandages: 0, antibiotics: 0, painkillers: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      ammo: { sharedPool: 835 },
      materials: { wood: 5, metal: 0, bricks: 0, tools: 0 },
    },
    adaptedBuildings: new Map([[cookhouse.buildingId, cookhouse as any]]),
  } as unknown as SettlementState;
  const runEconomyTick = (s: SettlementState) => runEconomyStages(s, 600, 1, 1, false).newState;
  // Stockpile is exactly full: 10 grain + 5 wood + 835 ammo = 850 / 850.
  assert.equal(runEconomyTick(seed).stockpile.materials.wood, 5, 'seed sanity: 5 wood');

  // Full-day tick with zero free space: the recipe must NOT run, so neither
  // the wood nor the grain inputs are consumed (no output-truncation sink).
  const full = runEconomyTick(seed);
  assert.equal(full.stockpile.materials.wood, 5, 'full storage: inputs untouched');
  assert.equal(full.stockpile.food.grain, 10, 'full storage: grain untouched');
  assert.equal(full.stockpile.food.mre_rations, 0, 'full storage: nothing produced');

  // Free 335 units and run again: now the full cycle runs — inputs consumed,
  // output produced in full.
  const roomy = {
    ...full,
    stockpile: { ...full.stockpile, ammo: { ...full.stockpile.ammo, sharedPool: 500 } },
  };
  const produced = runEconomyTick(roomy);
  assert.equal(produced.stockpile.materials.wood, 4, 'one wood consumed when output fits');
  assert.equal(produced.stockpile.food.grain, 8, 'two grain consumed when output fits');
  assert.ok(
    produced.stockpile.food.mre_rations > 0,
    `rations produced once there is room, got ${produced.stockpile.food.mre_rations}`
  );
});

test('lairs are the home of a REAL infected population — kill them to clear, partial clears regrow, zero never respawns', () => {
  const now = Date.now();
  const mkLair = (id: string, population: number, baselinePopulation = population, replenishAccumSec = 0): ZombieLair => ({
    id, buildingId: `b_${id}`, buildingName: id, isDiscovered: false, isCleared: false,
    population, baselinePopulation,
    garrisonCeiling: baselinePopulation,
    emergenceCapacity: Math.max(8, Math.round(baselinePopulation * 0.35)),
    homeRadius: 40, spawnAccumSec: 0, lastActivity: now,
    escalation: 0, escalationAccumSec: 0, threatTier: 'low', replenishAccumSec,
  });
  const buildings = [
    { id: 'b_a', center: { x: 0, z: 0 }, polygon: [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }] },
    { id: 'b_b', center: { x: 10, z: 10 }, polygon: [{ x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 15 }, { x: 5, z: 15 }] },
  ] as any;
  const mkZombie = (id: string, lairId: string, alive = true): ZombieUnit => ({
    id, lairId, variant: 'shambler', name: 'Infected', x: 0, z: 0, y: 0, rotation: 0,
    maxHp: 35, currentHp: alive ? 35 : 0, speed: 1.2, baseDamage: 6, siegeDamage: 3,
    attackCooldown: 1, lastAttackTime: 0, state: 'dormant', targetUnitId: null,
    targetBuildingId: null, targetPos: null, investigatingSoundId: null,
    spawnedAt: now, isDormant: true, alertLevel: 0,
    homeX: 0, homeZ: 0, homeRadius: 40,
  });

  // 1. Population IS the lair's living affiliated infected — a dead zombie no
  //    longer counts, and proximity never drains the garrison.
  const lairs = new Map<string | number, ZombieLair>([['a', mkLair('a', 3)]]);
  const zombies = [mkZombie('z1', 'a', true), mkZombie('z2', 'a', true), mkZombie('z3', 'a', false)];
  const r1 = tickZombieLairs(lairs, zombies, [], buildings, now, 60, true);
  assert.equal(r1.updatedLairs.get('a')!.population, 2, 'population counts only living lair-affiliated infected');
  assert.ok(!r1.updatedLairs.get('a')!.isCleared, 'lair with survivors stays active');
  const squadNear = [{ squadId: 'sq1', isDeployed: true, currentHp: 100, x: 0, z: 0 }] as any;
  const assaulted = tickZombieLairs(lairs, zombies, squadNear, buildings, now, 60, true);
  assert.equal(assaulted.updatedLairs.get('a')!.population, 2, 'standing on the site does NOT deplete the lair — only killing its infected does');

  // 2. A partially cleared lair regrows toward its original population while
  //    unmolested; the regrown infected belong to the lair. (The lair's
  //    population is synced from its living units, so the survivors are real
  //    zombies with lairId — exactly what a retreating squad leaves behind.)
  const regrowLair = new Map<string | number, ZombieLair>([['a', mkLair('a', 2, 20, 499)]]);
  const regrown = tickZombieLairs(regrowLair, [mkZombie('r1', 'a'), mkZombie('r2', 'a')], [], buildings, now, 60, true);
  assert.equal(regrown.updatedLairs.get('a')!.population, 3, 'partially cleared lair regrows one infected');
  assert.ok(regrown.spawnedZombies.some((z) => z.lairId === 'a'), 'regrown infected belong to the lair');

  // 3. A lair whose last infected dies is DESTROYED — it never respawns.
  const empty = tickZombieLairs(
    new Map([['a', mkLair('a', 0, 20, 9999)]]),
    [], [], buildings, now, 600, true
  );
  assert.ok(empty.updatedLairs.get('a')!.isCleared, 'zero living infected clears the lair');
  assert.equal(empty.clearedLairs.length, 1, 'cleared lair reported');
  assert.equal(empty.spawnedZombies.length, 0, 'a destroyed lair emerges nothing');

  // 4. Emerged infected are affiliated and carry their home anchor (lairId +
  //    home radius) so they stay local and can be tracked to the nest.
  const emergeLair = new Map<string | number, ZombieLair>([['a', { ...mkLair('a', 10, 20), spawnAccumSec: 1e9 }]]);
  const interior = Array.from({ length: 10 }, (_, i) => mkZombie(`in${i}`, 'a'));
  const emerged = tickZombieLairs(emergeLair, interior, [], buildings, now, 60, true);
  assert.ok(emerged.spawnedZombies.length > 0, 'lair emerges infected on its cadence');
  for (const z of emerged.spawnedZombies) {
    assert.equal(z.lairId, 'a');
    assert.equal(z.homeX, 0);
    assert.equal(z.homeRadius, 40);
  }

  // 5. Paused game (deltaSec 0) advances nothing.
  const paused = tickZombieLairs(lairs, zombies, [], buildings, now, 0, true);
  assert.equal(paused.updatedLairs.get('a')!.spawnAccumSec, 0, 'paused: no accumulation');
  assert.equal(paused.spawnedZombies.length, 0, 'paused: no emergence');
});

test('pipeline state carries infection-stage changes (turn-deaths, outbreaks) instead of reverting', () => {
  const base = seedConstruction(createInitialSettlementState('Test Colony'));
  const namedSurvivor = {
    id: 'surv_turning', name: 'Alice', avatarSeed: 'a',
    role: { type: 'squad_leader' as const, squadName: 'Alpha', squadId: 'sq_1' },
    stats: { tier: 4 as const, strength: 3, agility: 2, perception: 2, intelligence: 4, charisma: 3, medical: 1 },
    infection: {
      id: 'surv_turning', survivorId: 'surv_turning', survivorName: 'Alice', isNamed: true,
      stage: 'advanced' as const,
      bittenAt: 0, incubationDurationSec: 75, symptomDurationSec: 90, advancedDurationSec: 60,
      totalTurnTimeSec: 225, elapsedSec: 224.9, // one tick from turning
      isConfirmedByMedbay: true, isQuarantined: false,
      treatmentAttempts: 0,
    },
  };
  const infected = {
    ...base,
    namedSurvivors: [...base.namedSurvivors, namedSurvivor as any],
    infections: new Map([['surv_turning', namedSurvivor.infection]]),
  } as unknown as SettlementState;
  const clock = {
    day: 1, hour: 8, minute: 0, speed: 1 as const, phase: 'day' as const, isNight: false,
    hordeWaveIntensity: 0, totalElapsedSeconds: 0,
  };
  const result = runSimulationPipeline({
    state: infected, mapData: makeMap(), squads: [], zombies: [],
    hostileHumans: [], noiseEvents: [], droppedItems: [],
    clock, deltaSeconds: 1,
  });
  // A survivor that finished its total turn time must be recorded as fallen and
  // removed from the population — the committed state must reflect the
  // infection stage's output, not a pre-infection snapshot. (Regression: the
  // pipeline previously based its commit on `gathering`, silently resurrecting
  // the turned survivor every tick.)
  const turned = result.state.namedSurvivors.find((s: any) => s.id === 'surv_turning');
  assert.equal(turned, undefined, 'turned survivor must be removed from the population');
  const fallen = result.state.fallenHeroes.find((f: any) => f.survivorId === 'surv_turning');
  assert.ok(fallen, 'turned survivor must be recorded as fallen');
  assert.equal(result.state.infections.get('surv_turning')?.stage, 'turned');
});

test('pipeline state preserves scavenge search progress written between ticks', () => {
  // Mirrors the loop contract: post-pipeline mutations (scavenge progress,
  // carried loot) are committed against the pipeline's returned state. The
  // commit must carry them forward instead of reverting a pre-scavenge
  // intermediate snapshot.
  const base = seedConstruction(createInitialSettlementState('Test Colony'));
  const withSearch = {
    ...base,
    buildingSearches: new Map([[
      'b_search_1',
      { buildingId: 'b_search_1', buildingName: 'Bunker', observed: true, searched: false,
        searchProgress: 42, elapsedDurationSec: 120, totalDurationSec: 300,
        loot: [], unlootedItems: [], lootedItems: [], searchStartedAt: 0 },
    ]]),
    squadInventories: {
      sq_haul: { squadId: 'sq_haul', capacity: 8, used: 3,
        items: [{ id: 'loot_1', label: 'canned_goods', quantity: 2, weightKg: 0.5, kind: 'consumable' as const }] },
    },
  } as unknown as SettlementState;
  const clock = {
    day: 1, hour: 8, minute: 0, speed: 1 as const, phase: 'day' as const, isNight: false,
    hordeWaveIntensity: 0, totalElapsedSeconds: 0,
  };
  const result = runSimulationPipeline({
    state: withSearch, mapData: makeMap(), squads: [], zombies: [],
    hostileHumans: [], noiseEvents: [], droppedItems: [],
    clock, deltaSeconds: 1,
  });
  const search = result.state.buildingSearches?.get('b_search_1') as any;
  assert.ok(search, 'building search state must survive the pipeline commit');
  assert.equal(search?.searchProgress, 42, 'search progress must not be reset by the pipeline');
  const inv = result.state.squadInventories?.['sq_haul'];
  assert.ok(inv && inv.items.length === 1, 'carried loot must survive the pipeline commit');
});

test('full pipeline runs the economy stage chain end to end', () => {
  const base = seedConstruction(createInitialSettlementState('Test Colony'));
  const clock = {
    day: 1, hour: 8, minute: 0, speed: 1 as const, phase: 'day' as const, isNight: false,
    hordeWaveIntensity: 0, totalElapsedSeconds: 0,
  };
  const result = runSimulationPipeline({
    state: base,
    mapData: makeMap(),
    squads: [],
    zombies: [],
    hostileHumans: [],
    noiseEvents: [],
    droppedItems: [],
    clock,
    deltaSeconds: 1,
  });
  const bldg = result.state.adaptedBuildings.get('test_bldg_1') as any;
  assert.ok(bldg.constructionWorkDone > 0);
  assert.ok(Array.isArray(result.events));
});
function makeHqBuilding(): BuildingPolygon {
  return {
    id: 'b_hq_siege', type: 'residential' as BuildingPolygon['type'], rawType: 'headquarters',
    name: 'Siege HQ', height: 12, levels: 3, center: { x: 0, z: 0 },
    polygon: [
      { x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 },
    ],
    tags: {},
  };
}

function makeSiegeZombie(x: number, z: number): ZombieUnit {
  return {
    id: 'z_hq_siege', variant: 'walker' as ZombieVariant, name: 'Siege Walker',
    x, z, y: 0, rotation: 0, currentHp: 50, maxHp: 50, speed: 3,
    baseDamage: 10, siegeDamage: 30, attackCooldown: 1500,
    lastAttackTime: -5000, state: 'chasing' as ZombieAiState,
    targetUnitId: null, targetBuildingId: null, targetPos: null,
    investigatingSoundId: null, spawnedAt: 0, isDormant: false, alertLevel: 2,
  };
}

test('settlement lifecycle: HQ breach or zero survivors loses the colony, not the campaign', () => {
  const base = createInitialSettlementState('Lifecycle Test');
  const withHq = {
    ...base,
    headquarters: [{
      buildingId: 'hq_1', buildingName: 'HQ', establishedAt: 0,
      footprintAreaM2: 100, levels: 1, center: { x: 0, z: 0 },
      defenseRating: 5, maxCapacity: 10, maxDurability: 800, currentDurability: 800,
    }],
    primaryHQId: 'hq_1',
  } as unknown as SettlementState;

  assert.equal(countSettlementSurvivors(withHq), 26, 'default colony has 26 people');
  assert.equal(evaluateSettlementLoss(withHq).destroyed, false, 'healthy colony is not lost');

  const breached = {
    ...withHq,
    headquarters: withHq.headquarters.map((h) => ({ ...h, currentDurability: 0 })),
  } as unknown as SettlementState;
  const e1 = evaluateSettlementLoss(breached);
  assert.equal(e1.destroyed, true, 'HQ at 0 durability must lose the colony');
  assert.match(e1.reason || '', /Command center/i);

  const empty = {
    ...withHq,
    namedSurvivors: [],
    generalPopulation: { total: 0, children: [], inSquads: 0, unassigned: 0 },
  } as unknown as SettlementState;
  const e2 = evaluateSettlementLoss(empty);
  assert.equal(e2.destroyed, true, 'zero survivors must lose the colony');
  assert.match(e2.reason || '', /survivor/i);

  const preHq = createInitialSettlementState('Pre-HQ');
  assert.equal(evaluateSettlementLoss(preHq as unknown as SettlementState).destroyed, false, 'founding phase cannot be lost');

  // Record transitions: destroy then reclaim.
  const record = {
    id: 's_1', name: 'Colony One',
    status: 'operational' as const,
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'S', country: 'X' } as never,
    state: breached, dayEstablished: 1,
  } as unknown as SettlementRecord;
  const destroyed = markSettlementDestroyed(record, 9, e1.reason || 'overrun', breached);
  assert.equal(destroyed.status, 'destroyed');
  assert.equal(destroyed.overrunAtDay, 9);
  const reclaimed = markSettlementReclaimed(destroyed, 20, withHq);
  assert.equal(reclaimed.status, 'operational');
  assert.equal(reclaimed.overrunAtDay, null);
});

test('re-establishing HQ after a breach promotes the new command center to primary', () => {
  const b1 = makeHqBuilding();
  const b2 = {
    ...makeHqBuilding(),
    id: 'b_hq_second',
    name: 'Second Command',
    center: { x: 60, z: 0 },
    polygon: [
      { x: 52, z: -8 }, { x: 68, z: -8 }, { x: 68, z: 8 }, { x: 52, z: 8 },
    ],
  };
  let state = establishSettlementHQ(createInitialSettlementState('Reclaim'), b1);
  assert.equal(String(getPrimaryHQ(state)?.buildingId), String(b1.id), 'first HQ is primary');

  // Breach the primary command center: the colony loses everything.
  state = {
    ...state,
    headquarters: state.headquarters.map((h) =>
      String(h.buildingId) === String(b1.id) ? { ...h, currentDurability: 0 } : h
    ),
  };
  assert.equal(state.totalStorageCapacity, 850, 'aggregate is stale until recomputed');
  const breached = recalculateSettlementStats(
    state.headquarters, state.primaryHQId, state.adaptedBuildings, state.freestandingBuildings
  );
  assert.equal(breached.storageCap, 250, 'breached primary provides no vault');

  // Reclaim: establishing a new HQ promotes it to primary — the destroyed
  // record stays in headquarters[] but is no longer the command authority.
  const reclaimed = establishSettlementHQ(state, b2);
  assert.equal(String(getPrimaryHQ(reclaimed)?.buildingId), String(b2.id), 'new HQ becomes primary after reclaim');
  assert.ok(reclaimed.headquarters.length >= 2, 'the breached HQ stays recorded in headquarters');
  assert.equal(reclaimed.totalStorageCapacity, 850, 'restored vault from the standing new HQ');
});

test('infected can besiege and damage the command center at night', () => {
  const hqBldg = makeHqBuilding();
  const state = establishSettlementHQ(createInitialSettlementState('Siege'), hqBldg);
  const maxHp = (getPrimaryHQ(state) as unknown as { currentDurability: number }).currentDurability;
  assert.ok(maxHp >= 650, `HQ should have structural integrity, got ${maxHp}`);

  const nightClock = {
    day: 2, hour: 23, minute: 0, speed: 1 as const, phase: 'night' as const,
    isNight: true, hordeWaveIntensity: 0, totalElapsedSeconds: 0,
  };
  const zombie = makeSiegeZombie(hqBldg.center.x + 4, hqBldg.center.z);
  const result = runSimulationPipeline({
    state,
    mapData: makeMap(),
    squads: [],
    zombies: [zombie],
    hostileHumans: [],
    noiseEvents: [],
    droppedItems: [],
    clock: nightClock as never,
    deltaSeconds: 1,
  });
  const after = (getPrimaryHQ(result.state) as unknown as { currentDurability: number }).currentDurability;
  assert.ok(after < maxHp, `night horde should siege the HQ, got ${after} of ${maxHp}`);
});

test('destroyed colonies with survivors are recovery opportunities, not extinction', () => {
  const mkRecord = (id: string, status: 'operational' | 'destroyed', survivors: number, name: string): SettlementRecord => {
    return {
      id,
      name,
      status,
      placement: { center: { lat: 0, lon: 0 }, sectorName: name, country: 'X' } as never,
      dayEstablished: 1,
      state: {
        ...createInitialSettlementState(name),
        namedSurvivors: survivors > 0 ? [{ id: 'n1', stats: {} as any }] : [],
        generalPopulation: { total: Math.max(0, survivors - (survivors > 0 ? 1 : 0)) },
      } as never,
    } as unknown as SettlementRecord;
  };

  const alive = mkRecord('a', 'operational', 8, 'Colony A');
  const fallen = mkRecord('b', 'destroyed', 4, 'Colony B');
  const stats = calculateGlobalNetworkStats({ a: alive, b: fallen }, []);
  assert.equal(stats.totalOperationalColonies, 1);
  assert.equal(stats.totalDestroyedColonies, 1);
  assert.equal(stats.totalGlobalSurvivors, 12, 'survivors in the fallen colony still count');
  assert.equal(stats.isExtinct, false, 'people holding the ruins are not extinction');

  const deadFallen = {
    ...fallen,
    state: { ...fallen.state, namedSurvivors: [], generalPopulation: { total: 0 } } as never,
  };
  const noOneLeft = calculateGlobalNetworkStats({ a: alive, b: deadFallen }, []);
  assert.equal(noOneLeft.isExtinct, false, 'survivors in operational colony prevent extinction');

  const bothDead = calculateGlobalNetworkStats(
    { a: { ...alive, state: { ...alive.state, namedSurvivors: [], generalPopulation: { total: 0 } } as never }, b: deadFallen },
    []
  );
  assert.equal(bothDead.isExtinct, true, 'zero survivors anywhere is extinction');
});

test('freestanding adaptation-type facilities require Advanced Masonry research', () => {
  const fresh = createInitialSettlementState('Test Colony');

  // shelter_bunkhouse is adaptation-eligible with no researchRequirement of
  // its own — the service-level gate must still block a freestanding build
  // until the colony researches Advanced Masonry.
  const r = buildFreestanding(fresh, 'shelter_bunkhouse', { x: 10, z: 10 });
  assert.equal(r.success, false, 'shelter must not be buildable freestanding without masonry');
  assert.match(r.error || '', /Advanced Masonry/);

  // Genuinely freestanding IFZ structures (adaptationAllowed: false) are exempt.
  const wall = buildFreestanding(fresh, 'wooden_tower', { x: -10, z: -10 });
  assert.ok(wall.success, `wooden tower should still place: ${wall.error || ''}`);

  // After researching Advanced Masonry (with funding), placement succeeds.
  const funded = {
    ...fresh,
    stockpile: {
      ...fresh.stockpile,
      materials: { ...fresh.stockpile.materials, wood: 500, metal: 500, bricks: 500 },
    },
  };
  const unlocked = unlockResearchNode(funded, 'advanced_masonry');
  assert.ok(
    unlockResearchNode(funded, 'advanced_masonry').updatedSettlement.research?.unlockedNodes.includes('advanced_masonry')
  );
  const placed = buildFreestanding(unlocked.updatedSettlement, 'shelter_bunkhouse', { x: 20, z: 20 });
  assert.ok(placed.success, `after masonry research the shelter should place: ${placed.error || ''}`);
});

test('research needs Scientific Materials and staffed Research Centers (no magic trickle)', () => {
  const base = createInitialSettlementState('Test Colony');

  // Zero SciMat: the cheapest project cannot even start.
  assert.throws(
    () => startResearchNode(base, 'medical_care'),
    /Insufficient Scientific Materials/
  );

  // Fund it, but with no researchers anywhere the project never advances —
  // there is no passive household-knowledge trickle anymore.
  const funded = grantScientificMaterials(base, 10);
  assert.equal(getScientificMaterials(funded), 10);
  const started = startResearchNode(funded, 'medical_care').updatedSettlement; // cost 2, 600 worker-sec
  const idle = tickResearchSimulation(started, 600, 1, false);
  assert.equal(idle.research?.activeProgressSec ?? 0, 0, 'zero researchers: zero progress');
  assert.equal(idle.research?.activeResearchId, 'medical_care', 'project still queued');
  assert.equal(getScientificMaterials(idle), 10, 'nothing consumed while stalled');

  // Night also shelters researchers: no progress even when staffed.
  const rc = {
    buildingId: 'rc_1', typeId: 'research_center', isHQ: false, name: 'Research Center',
    category: 'utility', adaptedAt: 0, footprintAreaM2: 200, adaptedAreaM2: 200,
    adaptationPercentage: 100, totalFloorAreaM2: 400, volumeM3: 1600, maxCapacity: 6,
    currentUsage: 0, capacityUnit: 'Research Benches', maxDurability: 480,
    currentDurability: 480, defenseRating: 4, isFreestanding: false,
    position: { x: 0, z: 0 }, height: 3, levels: 1, polygon: [],
    constructionStatus: 'completed', constructionProgress: 100,
    constructionWorkRequired: 100, constructionWorkDone: 100, assignedWorkers: 2,
  } as any;
  const staffed = { ...idle, adaptedBuildings: new Map([['rc_1', rc]]) } as unknown as SettlementState;
  const night = tickResearchSimulation(staffed, 600, 1, true);
  assert.equal(night.research?.activeProgressSec ?? 0, 0, 'night holds research progress');

  // Daytime with 2 researchers: 2 × 300 worker-seconds completes the 600-sec
  // project, unlocking it and consuming its 2 SciMat from the stockpile.
  const done = tickResearchSimulation(staffed, 300, 1, false);
  assert.ok(done.research?.unlockedNodes.includes('medical_care'), 'project unlocked on completion');
  assert.equal(done.research?.activeResearchId, null, 'no active project after completion');
  assert.equal(getScientificMaterials(done), 8, 'completion consumes the material cost');
});

test('multi-recipe buildings run only the player-selected recipe', () => {
  // A completed cookhouse (grain_rations OR meat_rations) staffed at full
  // capacity on an empty-population colony, so the only stockpile movements
  // are the cookhouse's own.
  const base = createInitialSettlementState('Recipe Test');
  const hq = {
    buildingId: 'hq_1', buildingName: 'HQ', establishedAt: 0,
    footprintAreaM2: 100, levels: 1, center: { x: 0, z: 0 },
    defenseRating: 5, maxCapacity: 10, maxDurability: 800, currentDurability: 800,
  };
  const cookhouse = {
    buildingId: 'kitchen_1', typeId: 'cookhouse' as const, isHQ: false, name: 'Cookhouse',
    category: 'food' as const, adaptedAt: 0, footprintAreaM2: 120, adaptedAreaM2: 120,
    adaptationPercentage: 100, totalFloorAreaM2: 120, volumeM3: 360, maxCapacity: 12,
    currentUsage: 0, capacityUnit: 'citizens' as const, maxDurability: 420, currentDurability: 420,
    defenseRating: 40, isFreestanding: false, position: { x: 20, z: 20 }, height: 3,
    levels: 1, constructionStatus: 'completed' as const, constructionProgress: 100,
    constructionWorkRequired: 100, constructionWorkDone: 100, assignedWorkers: 4,
    selectedRecipeId: 'grain_rations',
  };
  const seed = {
    ...base,
    headquarters: [hq],
    primaryHQId: 'hq_1',
    namedSurvivors: [],
    generalPopulation: { total: 0, children: [], inSquads: 0, unassigned: 0 },
    totalStorageCapacity: 850,
    // Raw meat + wood available, but NO grain: the grain recipe cannot run.
    stockpile: {
      food: { canned_goods: 0, mre_rations: 0, dried_rations: 0, fresh_harvest: 0, raw_meat: 10, grain: 0 },
      water: { bottled_water: 0, purified_water: 0, rainwater: 0 },
      medical: { first_aid_kits: 0, sterile_bandages: 0, antibiotics: 0, painkillers: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      ammo: { sharedPool: 0 },
      materials: { wood: 5, metal: 0, bricks: 0, tools: 0 },
    },
    adaptedBuildings: new Map([[cookhouse.buildingId, cookhouse as any]]),
  } as unknown as SettlementState;
  const dayTick = (s: SettlementState) => runEconomyStages(s, 600, 1, 1, false).newState;

  // Selected grain recipe but no grain: the kitchen must IDLE rather than
  // silently switch to meat rations (meat + wood are available).
  const idle = dayTick(seed);
  assert.equal(idle.stockpile.materials.wood, 5, 'wood untouched while the chosen recipe starves');
  assert.equal(idle.stockpile.food.raw_meat, 10, 'meat untouched — no silent recipe swap');
  assert.equal(idle.stockpile.food.mre_rations, 0, 'nothing produced');

  // The player switches to Meat Rations: now the cycle runs.
  const switched = {
    ...idle,
    adaptedBuildings: new Map([[
      cookhouse.buildingId,
      { ...(idle.adaptedBuildings as any).get(cookhouse.buildingId), selectedRecipeId: 'meat_rations' },
    ]]),
  } as unknown as SettlementState;
  const produced = dayTick(switched);
  assert.equal(produced.stockpile.materials.wood, 4, 'one wood consumed for the chosen meat recipe');
  assert.equal(produced.stockpile.food.raw_meat, 8, 'two meat consumed');
  assert.ok(
    (produced.stockpile.food.mre_rations || 0) > 0,
    `rations produced under the selected recipe, got ${produced.stockpile.food.mre_rations}`
  );
});

test('fertilizer is consumed per crop cycle, not a permanent aura', () => {
  // A completed greenhouse (4 grain/day, weather-proof, full-time staff) on an
  // empty-population colony so the only stockpile movements are its own.
  const base = createInitialSettlementState('Fert Test');
  const hq = {
    buildingId: 'hq_1', buildingName: 'HQ', establishedAt: 0,
    footprintAreaM2: 100, levels: 1, center: { x: 0, z: 0 },
    defenseRating: 5, maxCapacity: 10, maxDurability: 800, currentDurability: 800,
  };
  const greenhouse = {
    buildingId: 'gh_1', typeId: 'greenhouse' as const, isHQ: false, name: 'Greenhouse',
    category: 'food' as const, adaptedAt: 0, footprintAreaM2: 120, adaptedAreaM2: 120,
    adaptationPercentage: 100, totalFloorAreaM2: 120, volumeM3: 360, maxCapacity: 4,
    currentUsage: 0, capacityUnit: 'plots' as const, maxDurability: 300, currentDurability: 300,
    defenseRating: 25, isFreestanding: false, position: { x: 20, z: 20 }, height: 3,
    levels: 1, constructionStatus: 'completed' as const, constructionProgress: 100,
    constructionWorkRequired: 100, constructionWorkDone: 100, assignedWorkers: 4,
  };
  const seed = {
    ...base,
    headquarters: [hq],
    primaryHQId: 'hq_1',
    namedSurvivors: [],
    generalPopulation: { total: 0, children: [], inSquads: 0, unassigned: 0 },
    totalStorageCapacity: 850,
    stockpile: {
      food: { canned_goods: 0, mre_rations: 0, dried_rations: 0, fresh_harvest: 0, grain: 0 },
      water: { bottled_water: 0, purified_water: 0, rainwater: 0 },
      medical: { first_aid_kits: 0, sterile_bandages: 0, antibiotics: 0, painkillers: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      ammo: { sharedPool: 0 },
      materials: { wood: 0, metal: 0, bricks: 0, tools: 0, fertilizer: 0 },
    },
    adaptedBuildings: new Map([[greenhouse.buildingId, greenhouse as any]]),
  } as unknown as SettlementState;
  const dayTick = (s: SettlementState) => runEconomyStages(s, 600, 1, 1, false).newState;
  const cloneWith = (fert: number, isFertilized: boolean): SettlementState => {
    const c = structuredClone(seed) as SettlementState;
    (c.adaptedBuildings as any).get('gh_1').isFertilized = isFertilized;
    (c.stockpile as any).materials.fertilizer = fert;
    return c;
  };

  // Unfertilized plot: 4 grain/day, fertilizer untouched forever.
  const plain = dayTick(cloneWith(1, false));
  const grainPlain = plain.stockpile.food.grain || 0;
  assert.ok(grainPlain > 0, `unfertilized greenhouse yields grain, got ${grainPlain}`);
  assert.equal(plain.stockpile.materials.fertilizer, 1, 'no consumption without the fertilize choice');

  // Fertilized plot with a full day's allotment: +75% yield, 0.5 fertilizer
  // consumed — the aura is gone.
  const fed = dayTick(cloneWith(1, true));
  assert.ok(
    Math.abs((fed.stockpile.food.grain || 0) - grainPlain * 1.75) < 0.01,
    `fertilized yield should be ×1.75, plain ${grainPlain} vs fed ${fed.stockpile.food.grain}`
  );
  assert.ok(
    Math.abs((fed.stockpile.materials.fertilizer || 0) - 0.5) < 0.001,
    `0.5 fertilizer consumed per cycle, got ${fed.stockpile.materials.fertilizer}`
  );

  // Starved plot: plot wants fertilizer but stock holds less than the daily
  // need — the cycle runs unfertilized and nothing is consumed.
  const starved = dayTick(cloneWith(0.3, true));
  assert.equal(starved.stockpile.food.grain, grainPlain, 'short fertilizer stock = plain yield');
  assert.equal(starved.stockpile.materials.fertilizer, 0.3, 'nothing consumed when the cycle cannot be fertilized');
});

test('medbay treatment needs beds AND nurses — queue, no flat regeneration', () => {
  const mkMember = (id: string, hp: number) => ({
    id, name: id, isLeader: false, weaponId: 'knife', armorId: null,
    isAlive: true, maxHp: 50, currentHp: hp,
  });
  const mkSquad = (wounded: { id: string; hp: number }[], x = 5, z = 5) => ({
    squadId: 'sq_1', name: 'Alpha', leaderId: 'L', leaderName: 'L',
    leaderCombatTier: 'veteran', generalCount: 3, x, z, y: 0,
    rotation: 0, currentHp: 0, maxHp: 0, attackRange: 8, fireRate: 2,
    lastFireTime: 0, damagePerVolley: 8, critChance: 0.05, moveSpeed: 4,
    state: 'idle', manualOrder: false, targetPos: null, targetZombieId: null,
    isDeployed: true, killCount: 0, isInSafeZone: false,
    members: wounded.map((w) => mkMember(w.id, w.hp)),
  }) as unknown as import('../src/types/combat').TacticalSquadUnit;

  const base = createInitialSettlementState('Med Care');
  const medbay = {
    buildingId: 'med_1', typeId: 'medbay' as const, isHQ: false, name: 'Medbay',
    category: 'utility' as const, adaptedAt: 0, footprintAreaM2: 120, adaptedAreaM2: 120,
    adaptationPercentage: 100, totalFloorAreaM2: 120, volumeM3: 360, maxCapacity: 6,
    currentUsage: 0, capacityUnit: 'beds' as const, maxDurability: 420, currentDurability: 420,
    defenseRating: 40, isFreestanding: false, position: { x: 0, z: 0 }, height: 3,
    levels: 1, constructionStatus: 'completed' as const, constructionProgress: 100,
    constructionWorkRequired: 100, constructionWorkDone: 100, assignedWorkers: 2,
  };
  const state = {
    ...base,
    adaptedBuildings: new Map([[medbay.buildingId, medbay as any]]),
  } as unknown as SettlementState;
  // One in-game day at the medbay: each attended patient heals 0.1 HP × 24h = 2.4.
  const oneDay = 600;

  // Two nurses, two wounded: both admitted (beds 6) and both treated.
  const both = tickMedicalFacilityCare(
    [mkSquad([{ id: 'm1', hp: 40 }, { id: 'm2', hp: 20 }])],
    state,
    oneDay
  );
  const healedMembers = both[0].members;
  assert.ok(
    Math.abs(healedMembers[0].currentHp - 42.4) < 0.001,
    `first patient +2.4 HP/day, got ${healedMembers[0].currentHp}`
  );
  assert.ok(
    Math.abs(healedMembers[1].currentHp - 22.4) < 0.001,
    `second patient +2.4 HP/day, got ${healedMembers[1].currentHp}`
  );

  // One nurse, three wounded: only ONE patient is attended; the other two lie
  // in beds (or queue) with no healing.
  const understaffed = tickMedicalFacilityCare(
    [mkSquad([{ id: 'a', hp: 40 }, { id: 'b', hp: 40 }, { id: 'c', hp: 40 }])],
    {
      ...state,
      adaptedBuildings: new Map([[medbay.buildingId, { ...medbay, assignedWorkers: 1 } as any]]),
    } as unknown as SettlementState,
    oneDay
  );
  const treated = understaffed[0].members.filter((m: any) => m.currentHp > 40).length;
  assert.equal(treated, 1, 'one nurse attends exactly one patient');

  // Unstaffed medbay: nobody heals (no flat regeneration).
  const unstaffed = tickMedicalFacilityCare(
    [mkSquad([{ id: 'a', hp: 30 }])],
    {
      ...state,
      adaptedBuildings: new Map([[medbay.buildingId, { ...medbay, assignedWorkers: 0 } as any]]),
    } as unknown as SettlementState,
    oneDay
  );
  assert.equal(unstaffed[0].members[0].currentHp, 30, 'zero nurses = zero healing');

  // Squad parked 30m away (outside the 18m treatment radius): no healing.
  const far = tickMedicalFacilityCare([mkSquad([{ id: 'a', hp: 30 }], 40, 40)], state, oneDay);
  assert.equal(far[0].members[0].currentHp, 30, 'wounded must be inside the facility to be treated');
});

test('stranded field loot is recoverable by a squad and respects backpack space', () => {
  const base = createInitialSettlementState('Strand Loot');
  const mkSquad = (n: number, x = 10, z = 10) => ({
    squadId: `sq_${n}`, name: `Squad ${n}`, leaderId: 'L', leaderName: 'L',
    leaderCombatTier: 'veteran', generalCount: 0, x, z, y: 0,
    rotation: 0, currentHp: 50, maxHp: 50, attackRange: 8, fireRate: 2,
    lastFireTime: 0, damagePerVolley: 8, critChance: 0.05, moveSpeed: 4,
    state: 'idle', manualOrder: false, targetPos: null, targetZombieId: null,
    isDeployed: true, killCount: 0, isInSafeZone: false,
    members: Array.from({ length: n }, (_, i) => ({
      id: `m${i}`, name: `m${i}`, isLeader: i === 0, weaponId: 'knife', armorId: null,
      isAlive: true, maxHp: 50, currentHp: 50,
    })),
  }) as unknown as import('../src/types/combat').TacticalSquadUnit;

  // A 2-man squad (2 inventory slots) dispatched to a 6-unit pile collects
  // exactly 2 unit-stacks (one slot each).
  const pile = {
    id: 'pile_t1', position: { x: 50, z: 50 },
    wood: 2, metal: 2, bricks: 2, source: 'gatherer', createdAt: 0,
  };
  let state = {
    ...base,
    fieldLootPiles: [pile],
    squadInventories: {},
  } as unknown as SettlementState;
  const squad = mkSquad(2);
  let res = collectStrandedLoot(state, squad, pile);
  assert.equal(res.collectedUnits, 3, 'wood 2 + metal 1 = 3 units fit the 2 free slots');
  const inv = res.newState.squadInventories!['sq_2'];
  assert.equal(inv.items.length, 2, 'two slots filled');
  assert.equal(
    inv.items.reduce((s: number, i: any) => s + i.quantity, 0),
    3,
    'wood 2 + metal 1 collected'
  );
  const remaining = res.newState.fieldLootPiles || [];
  assert.equal(remaining.length, 1, 'pile with leftover bricks remains on the ground');
  assert.equal(remaining[0].bricks, 2, 'the uncollected third resource stays stranded');

  // A squad with a full backpack cannot collect anything and the pile stays.
  state = {
    ...state,
    fieldLootPiles: [pile],
    squadInventories: {
      sq_2: { capacity: 2, used: 2, items: [
        { id: 'x1', kind: 'resource', label: 'wood', quantity: 1, weight: 1 },
        { id: 'x2', kind: 'resource', label: 'metal', quantity: 1, weight: 1 },
      ] },
    },
  } as unknown as SettlementState;
  const full = collectStrandedLoot(state, mkSquad(2), pile);
  assert.equal(full.collectedUnits, 0, 'no room — nothing collected');
  assert.equal((full.newState.fieldLootPiles || []).length, 1, 'pile untouched');

  // A squad that collects the last unit removes the pile entirely.
  state = {
    ...state,
    fieldLootPiles: [{ ...pile, wood: 1, metal: 0, bricks: 0 }],
    squadInventories: {},
  } as unknown as SettlementState;
  const last = collectStrandedLoot(state, mkSquad(2), { ...pile, wood: 1, metal: 0, bricks: 0 });
  assert.equal(last.collectedUnits, 1, 'single wood grabbed');
  assert.equal((last.newState.fieldLootPiles || []).length, 0, 'emptied pile vanishes');
});

test('a dead squad strands its whole backpack as a field pile at the death site', () => {
  const base = createInitialSettlementState('Fallen Squad');
  const mkSquad = (n: number, x = 10, z = 10, alive = true) => ({
    squadId: `sq_${n}`, name: `Squad ${n}`, leaderId: 'L', leaderName: 'L',
    leaderCombatTier: 'veteran', generalCount: 0, x, z, y: 0,
    rotation: 0, currentHp: alive ? 50 : 0, maxHp: 50, attackRange: 8, fireRate: 2,
    lastFireTime: 0, damagePerVolley: 8, critChance: 0.05, moveSpeed: 4,
    state: alive ? 'idle' : 'downed', manualOrder: false, targetPos: null, targetZombieId: null,
    isDeployed: true, killCount: 0, isInSafeZone: false,
    members: Array.from({ length: n }, (_, i) => ({
      id: `m${i}`, name: `m${i}`, isLeader: i === 0, weaponId: 'knife', armorId: null,
      isAlive: alive, maxHp: 50, currentHp: alive ? 50 : 0,
    })),
  }) as unknown as import('../src/types/combat').TacticalSquadUnit;

  // A 3-man squad falls carrying 2 wood, 4 canned goods and 10 ammo.
  const state = {
    ...base,
    fieldLootPiles: [],
    squadInventories: {
      sq_3: { capacity: 3, used: 3, items: [
        { id: 'w1', kind: 'resource', label: 'wood', quantity: 2, weight: 1 },
        { id: 'c1', kind: 'resource', label: 'canned_goods', quantity: 4, weight: 1.2 },
        { id: 'a1', kind: 'resource', label: 'ammunition', quantity: 10, weight: 0.15 },
      ] },
    },
  } as unknown as SettlementState;

  const dead = mkSquad(3, 120, 85, false);
  const res = strandDeadSquadInventories(state, [dead]);
  assert.equal(res.events.length, 1, 'one stranded-supplies warning');
  assert.equal(res.events[0].title, 'SQUAD SUPPLIES LEFT IN FIELD');
  const piles = res.newState.fieldLootPiles || [];
  assert.equal(piles.length, 1, 'one pile at the death site');
  assert.equal(piles[0].position.x, 120, 'pile sits where the squad fell');
  assert.equal(piles[0].position.z, 85, 'pile sits where the squad fell');
  assert.equal(piles[0].wood, 2, 'materials map onto the pile');
  assert.equal(piles[0].items?.length, 2, 'food and ammo preserved as item stacks');
  assert.equal(countFieldLootUnits(piles), 16, '2 wood + 4 food + 10 ammo all counted');
  assert.equal(
    (res.newState.squadInventories!['sq_3']?.items || []).length,
    0,
    'dead squad backpack cleared — no double-stranding next tick'
  );

  // Idempotent: a second pass over the same dead squad strands nothing.
  const again = strandDeadSquadInventories(res.newState, [dead]);
  assert.equal(again.events.length, 0, 'nothing left to strand');
  assert.equal((again.newState.fieldLootPiles || []).length, 1, 'pile unchanged');

  // A living squad recovers it: materials first, then item stacks, one slot each.
  const collector = mkSquad(2, 121, 86, true);
  const pile = piles[0];
  const pick = collectStrandedLoot(res.newState, collector, pile);
  assert.equal(pick.collectedUnits, 6, 'wood 2 + canned goods 4 fill both slots');
  const inv = pick.newState.squadInventories!['sq_2'];
  assert.equal(inv.items.length, 2, 'two slots filled');
  assert.ok(inv.items.some((i: any) => i.label === 'wood' && i.quantity === 2), 'wood recovered');
  assert.ok(
    inv.items.some((i: any) => i.label === 'canned_goods' && i.quantity === 4),
    'canned goods recovered'
  );
  const left = pick.newState.fieldLootPiles || [];
  assert.equal(left.length, 1, 'ammo remains on the ground');
  assert.equal(left[0].items?.length, 1, 'ammunition still stranded');
  assert.equal(left[0].items![0].label, 'ammunition');
  assert.equal(left[0].items![0].quantity, 10, 'full ammo stack untouched');
});

test('strandSquadInventoryAt merges into a nearby pile and keeps gear kinds', () => {
  const base = createInitialSettlementState('Fallen Gear');
  const state = {
    ...base,
    fieldLootPiles: [],
  } as unknown as SettlementState;
  const inventory = {
    capacity: 4,
    used: 4,
    items: [
      { id: 'm1', kind: 'resource', label: 'metal', quantity: 5, weight: 1 },
      { id: 'p1', kind: 'weapon', label: 'pistol', quantity: 1, weight: 2, itemId: 'pistol' },
      { id: 'f1', kind: 'resource', label: 'fuel', quantity: 8, weight: 0.8 },
    ],
  } as any;
  let piles = strandSquadInventoryAt(state.fieldLootPiles || [], { x: 5, z: 5 }, inventory);
  assert.equal(piles.length, 1, 'pile created');
  assert.equal(piles[0].metal, 5, 'material mapped');
  assert.equal(piles[0].items?.length, 2, 'weapon + fuel kept as stacks');
  assert.equal(piles[0].items![0].kind, 'weapon', 'gear kind preserved for later equipping');

  // A second fallen squad within 2m merges into the same pile.
  piles = strandSquadInventoryAt(piles, { x: 5.5, z: 5.5 }, {
    capacity: 1, used: 1,
    items: [{ id: 'w2', kind: 'resource', label: 'wood', quantity: 3, weight: 1 }],
  } as any);
  assert.equal(piles.length, 1, 'merged into the existing pile');
  assert.equal(piles[0].wood, 3, 'wood added to the same pile');
});

test('IFZ storage gate: a squad checks storage before returning and holds its haul when full', () => {
  const base = createInitialSettlementState('Storage Gate');
  const bldg = {
    id: 'b_gate', type: 'warehouse', rawType: 'warehouse', name: 'Bldg',
    height: 6, levels: 1, center: { x: 0, z: 0 },
    polygon: [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }],
  } as any;
  const mkSquad = (n: number, x = 0, z = 0) => ({
    squadId: `sq_${n}`, name: `Squad ${n}`, leaderId: 'L', leaderName: 'L',
    leaderCombatTier: 'veteran', generalCount: 0, x, z, y: 0,
    rotation: 0, currentHp: 50, maxHp: 50, attackRange: 8, fireRate: 2,
    lastFireTime: 0, damagePerVolley: 8, critChance: 0.05, moveSpeed: 4,
    state: 'searching', manualOrder: false, targetPos: null, targetZombieId: null,
    isDeployed: true, killCount: 0, isInSafeZone: false,
    members: Array.from({ length: n }, (_, i) => ({
      id: `m${i}`, name: `m${i}`, isLeader: i === 0, weaponId: 'knife', armorId: null,
      isAlive: true, maxHp: 50, currentHp: 50,
    })),
  }) as unknown as import('../src/types/combat').TacticalSquadUnit;

  const woodStack = { id: 'w1', kind: 'resource' as const, label: 'wood', quantity: 2, weight: 1 };
  const makeState = (freeUnits: number) => {
    // The default state always leaves exactly 100 units of headroom
    // (capacity = getStockpileUnits + 100). Nudge wood to hit the target.
    const state = { ...base } as unknown as SettlementState;
    state.stockpile = structuredClone(base.stockpile);
    state.stockpile.materials = {
      ...state.stockpile.materials,
      wood: state.stockpile.materials.wood + (100 - freeUnits),
    };
    state.buildingSearches = new Map([[bldg.id, {
      buildingId: bldg.id, observed: true, searched: false, searchProgress: 0,
      totalDurationSec: 10, elapsedDurationSec: 0,
      loot: [woodStack], unlootedItems: [woodStack], lootedItems: [],
    }]]);
    state.squadInventories = {};
    return state;
  };

  // Storage full (1 unit free): the squad finishes carrying 2 wood and does
  // NOT return — it holds the haul out in the field instead of trekking home
  // to a depot that can't accept it.
  const full = tickBuildingScavengeProgress(makeState(1), mkSquad(2), bldg, 1000);
  assert.equal(full.isCompleted, true, 'search finished');
  assert.equal(full.updatedSquad.holdHaul, true, 'storage full → squad holds its haul');
  assert.notEqual(full.updatedSquad.state, 'returning', 'no pointless trek home');
  assert.equal(full.updatedSquad.targetPos, null, 'no depot destination assigned');
  assert.equal(
    (full.newState.squadInventories?.['sq_2']?.items || []).reduce((s: number, i: any) => s + i.quantity, 0),
    2,
    'loot stays in the backpack — nothing dropped or lost'
  );

  // Storage has room: the identical search auto-returns to deposit as before.
  const room = tickBuildingScavengeProgress(makeState(100), mkSquad(2), bldg, 1000);
  assert.equal(room.updatedSquad.holdHaul, undefined, 'room → no hold flag');
  assert.equal(room.updatedSquad.state, 'returning', 'room → auto-return to the depot');
  assert.ok(room.updatedSquad.targetPos, 'depot destination assigned');

  // hasStockpileRoomForHaul: exact-fit accepted, overflow refused, armory free.
  const roomy = makeState(100);
  assert.equal(hasStockpileRoomForHaul(roomy, [woodStack]), true, '2 units fit in 100 free');
  assert.equal(
    hasStockpileRoomForHaul(roomy, [{ id: 'w2', kind: 'resource', label: 'wood', quantity: 101, weight: 1 }]),
    false,
    'overflow refused before the trip'
  );
  const fullish = makeState(0);
  assert.equal(
    hasStockpileRoomForHaul(fullish, [
      { id: 'p1', kind: 'weapon', label: 'pistol', quantity: 1, weight: 2, itemId: 'pistol' },
      { id: 'a1', kind: 'armor', label: 'riot_vest', quantity: 1, weight: 4, itemId: 'riot_vest' },
    ]),
    true,
    'weapons/armor never consume stockpile capacity'
  );
});

test('deconstruction refresh uses the ONE authoritative stat calculation — no inline copy', () => {
  const base = createInitialSettlementState('Decon Stats');
  const hq = {
    buildingId: 'hq_1', buildingName: 'HQ', establishedAt: 0,
    footprintAreaM2: 100, levels: 1, center: { x: 0, z: 0 },
    defenseRating: 55, maxCapacity: 40, maxDurability: 800, currentDurability: 800,
  };
  const mkBldg = (id: string, typeId: string, over: any = {}) => ({
    buildingId: id, typeId, isHQ: false, name: typeId.toUpperCase(),
    category: 'basic', adaptedAt: 0, footprintAreaM2: 200, adaptedAreaM2: 200,
    adaptationPercentage: 100, totalFloorAreaM2: 200, volumeM3: 600,
    maxCapacity: 100, currentUsage: 0, capacityUnit: 'units',
    maxDurability: 500, currentDurability: 500, defenseRating: 10,
    isFreestanding: false, position: { x: 1, z: 1 }, height: 3, levels: 1,
    constructionStatus: 'completed', constructionProgress: 100,
    constructionWorkRequired: 100, constructionWorkDone: 100, assignedWorkers: 0,
    ...over,
  });

  const warehouse = mkBldg('wh_1', 'warehouse', { maxCapacity: 500, defenseRating: 40 });
  const shelter = mkBldg('sh_1', 'shelter', { maxCapacity: 30, defenseRating: 10 });
  const squadQ = mkBldg('sq_1', 'squad_quarters', { maxCapacity: 8, defenseRating: 5 });
  const cookhouse = mkBldg('ck_1', 'cookhouse', { position: { x: 60, z: 40 }, defenseRating: 20 });
  const tower = { ...mkBldg('tw_1', 'wooden_tower', { defenseRating: 60, position: { x: -30, z: 10 } }), isFreestanding: true };

  const state = {
    ...base,
    isInitialized: true,
    headquarters: [hq],
    primaryHQId: 'hq_1',
    adaptedBuildings: new Map([
      ['wh_1', warehouse], ['sh_1', shelter], ['sq_1', squadQ], ['ck_1', cookhouse],
    ] as any),
    freestandingBuildings: [tower],
    constructionOrders: [],
    deconstructionJobs: new Map([['ck_1', {
      buildingId: 'ck_1', buildingName: 'COOKHOUSE', source: 'adapted',
      position: { x: 60, z: 40 }, recoverWood: 30, recoverMetal: 10, recoverBricks: 10,
      workRequired: 100, workDone: 100, assignedWorkers: 1, maxWorkers: 3,
      startedAt: 0, progressPct: 100, state: 'dismantling',
    }]] as any),
    demolishedBuildings: new Map(),
    squadInventories: {},
    vehicleWorkshopOrders: [],
  } as unknown as SettlementState;

  // The authoritative calc on the pre-demolition state counts EVERY facility —
  // the old inline copy only knew storage_depot / shelter_bunkhouse.
  const before = recalculateSettlementStats(state.headquarters, state.primaryHQId, state.adaptedBuildings, state.freestandingBuildings);
  assert.equal(before.storageCap, 850 + 500, 'Warehouse storage counted on top of the HQ vault');
  assert.equal(before.livingCap, 40 + 30 + 8, 'Shelter AND Squad Quarters living counted on top of the HQ');
  assert.equal(before.defenseRating, 55 + 40 + 10 + 5 + 20 + 60, 'all operational buildings contribute defense');

  // Complete the demolition of the cookhouse.
  const res = tickSettlementSimulation(state, 1, null, false);
  assert.ok(res.completedDeconstructions.some((d) => String(d.buildingId) === 'ck_1'), 'demolition completes');
  const after = res.newState;
  assert.equal(after.adaptedBuildings.has('ck_1'), false, 'demolished building removed');
  assert.equal(after.demolishedBuildings.has('ck_1'), true, 'recorded as demolished');

  // The refresh MUST equal the authoritative calculation — no competing copy.
  const expected = recalculateSettlementStats(after.headquarters, after.primaryHQId, after.adaptedBuildings, after.freestandingBuildings);
  assert.equal(after.totalStorageCapacity, expected.storageCap, 'storage equals the authoritative calc');
  assert.equal(after.totalStorageCapacity, 850 + 500, 'HQ vault 850 + Warehouse 500 — NOT just the HQ');
  assert.equal(after.totalLivingCapacity, expected.livingCap, 'living equals the authoritative calc');
  assert.equal(after.totalLivingCapacity, 40 + 30 + 8, 'HQ 40 + Shelter 30 + Squad Quarters 8 — none dropped');
  assert.equal(after.totalDefenseRating, expected.defenseRating, 'defense equals the authoritative calc');
  assert.equal(after.totalDefenseRating, 55 + 40 + 10 + 5 + 60, 'demolished cookhouse contributes nothing');
  assert.equal(after.squadCapacity, expected.squadCapacity, 'squad capacity equals the authoritative calc');
  assert.ok(after.squadCapacity >= 3, 'HQ squad slots + Squad Quarters slot survive the refresh');

  // Authoritative guard: a breached structure provides no defensive value —
  // the healthy tower's 60 rating disappears when the same tower is breached.
  const breachedTower = { ...tower, currentDurability: 0 };
  const withBreach = recalculateSettlementStats(after.headquarters, after.primaryHQId, after.adaptedBuildings, [breachedTower as any]);
  assert.equal(withBreach.defenseRating, after.totalDefenseRating - 60, 'a breached structure contributes no defense rating');
});

test('storage/living/defense only count operational buildings — destroyed, repairing and incomplete contribute nothing', () => {
  const hq = {
    buildingId: 'hq_1', buildingName: 'HQ', establishedAt: 0,
    footprintAreaM2: 100, levels: 1, center: { x: 0, z: 0 },
    defenseRating: 55, maxCapacity: 40,
    maxDurability: 800, currentDurability: 800,
  };
  const mkBldg = (id: string, typeId: string, over: any = {}) => ({
    buildingId: id, typeId, isHQ: false, name: typeId.toUpperCase(),
    category: 'basic', adaptedAt: 0, footprintAreaM2: 200, adaptedAreaM2: 200,
    adaptationPercentage: 100, totalFloorAreaM2: 200, volumeM3: 600,
    maxCapacity: 100, currentUsage: 0, capacityUnit: 'units',
    maxDurability: 500, currentDurability: 500, defenseRating: 10,
    isFreestanding: false, position: { x: 1, z: 1 }, height: 3, levels: 1,
    constructionStatus: 'completed', constructionProgress: 100,
    constructionWorkRequired: 100, constructionWorkDone: 100, assignedWorkers: 0,
    ...over,
  });

  const warehouse = mkBldg('wh_1', 'warehouse', { maxCapacity: 500, defenseRating: 40 });
  const shelter = mkBldg('sh_1', 'shelter', { maxCapacity: 30 });
  const tower = mkBldg('tw_1', 'wooden_tower', { defenseRating: 60, isFreestanding: true });
  const run = (buildings: any[]) =>
    recalculateSettlementStats(
      [hq],
      hq.buildingId,
      new Map(buildings.filter((b) => !b.isFreestanding).map((b) => [b.buildingId, b])),
      buildings.filter((b) => b.isFreestanding)
    );

  const healthy = run([warehouse, shelter, tower]);
  assert.equal(healthy.storageCap, 850 + 500, 'operational Warehouse adds its vault');
  assert.equal(healthy.livingCap, 40 + 30, 'operational Shelter adds its beds');
  assert.equal(healthy.defenseRating, 55 + 40 + 10 + 60, 'operational tower and shelter stand guard');

  // Destroyed tower: no defense. Destroyed warehouse: no vault.
  const breached = run([
    { ...warehouse, currentDurability: 0 },
    shelter,
    { ...tower, currentDurability: 0 },
  ]);
  assert.equal(breached.defenseRating, 55 + 10, 'destroyed tower contributes no defense');
  assert.equal(breached.storageCap, 850, 'destroyed Warehouse contributes no storage');

  // Under repair: same as destroyed — the facility is closed.
  const repairing = run([
    { ...warehouse, isUnderRepair: true },
    { ...shelter, isUnderRepair: true },
    { ...tower, isUnderRepair: true },
  ]);
  assert.equal(repairing.storageCap, 850, 'repair-stalled Warehouse contributes no storage');
  assert.equal(repairing.livingCap, 40, 'repair-stalled Shelter contributes no beds');
  assert.equal(repairing.defenseRating, 55, 'repair-stalled tower and shelter contribute no defense');

  // Incomplete: a planned/in-progress build counts for nothing yet.
  const incomplete = run([
    { ...warehouse, constructionStatus: 'in_progress', constructionProgress: 40 },
    { ...tower, constructionStatus: 'planned', isFreestanding: true },
  ]);
  assert.equal(incomplete.storageCap, 850, 'in-progress Warehouse contributes no storage');
  assert.equal(incomplete.defenseRating, 55, 'planned tower contributes no defense');
});
