import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickSettlementSimulation, getAutomatedRepairConfig } from '../src/services/populationService';
import { recalculateSettlementStats } from '../src/services/settlementService';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../src/data/functionalBuildings';
import { DEFAULT_AUTOMATED_REPAIR_CONFIG } from '../src/services/populationService';
import type { AdaptedBuilding, AutomatedRepairConfig, SettlementState } from '../src/types/settlement';

const DAY = 600;

function mkBuilding(id: string, typeId: string, workers: number, overrides: Partial<AdaptedBuilding> = {}): AdaptedBuilding {
  return {
    buildingId: id,
    typeId,
    name: typeId,
    constructionStatus: 'completed',
    currentDurability: 100,
    isUnderRepair: false,
    footprintAreaM2: 200,
    assignedWorkers: workers,
    adaptedAt: Date.now(),
    isHQ: false,
    category: 'basic',
    adaptedAreaM2: 200,
    adaptationPercentage: 100,
    totalFloorAreaM2: 200,
    volumeM3: 800,
    maxCapacity: 40,
    fullCapacity: 40,
    currentUsage: 0,
    capacityUnit: 'Units',
    maxDurability: 100,
    defenseRating: 10,
    isFreestanding: false,
    position: { x: 0, z: 0 },
    height: 4,
    levels: 1,
    ...overrides,
  } as unknown as AdaptedBuilding;
}

function mkState(settlementConfig?: { automatedRepairConfig?: AutomatedRepairConfig }): SettlementState {
  const buildings = [
    mkBuilding('shop', 'repairmen_shop', 2),
    // Heavily damaged HIGH-band warehouse. The damage gap is far larger than a
    // single tick of crew work so the repair stays IN PROGRESS (isUnderRepair)
    // and the band assignment is observable deterministically.
    mkBuilding('warehouse', 'warehouse', 0, { currentDurability: 2000, maxDurability: 5000 }),
    // Heavily damaged LOW-band bar (civilian → housing band).
    mkBuilding('bar', 'bar', 0, { currentDurability: 2000, maxDurability: 5000 }),
  ];
  return {
    adaptedBuildings: new Map(buildings.map((b) => [b.buildingId, b])),
    freestandingBuildings: [],
    stockpile: {
      water: { rainwater: 0, purified_water: 0, bottled_water: 0 },
      food: { fresh_harvest: 0, dried_rations: 0, canned_goods: 0, mre_rations: 0, grain: 0 },
      medical: { first_aid_kits: 0, medicine: 0, antibiotics: 0, vaccine: 0, bandages: 0 },
      ammo: { sharedPool: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      materials: { wood: 500, metal: 500, bricks: 500, tools: 0, logs: 0, scrap: 0, clay: 0, beer: 0 },
    },
    research: { unlockedNodes: [], activeResearchId: null, activeProgressSec: 0 },
    generalPopulation: { total: 0, unassigned: 0, inSquads: 0, children: [] },
    namedSurvivors: [],
    morale: { modifiers: { productivityMultiplier: 1 } },
    deconstructionJobs: new Map(),
    constructionOrders: [],
    headquarters: [],
    totalStorageCapacity: 10000,
    automatedRepairConfig: settlementConfig?.automatedRepairConfig,
  } as unknown as SettlementState;
}

function tick(state: SettlementState): SettlementState {
  return tickSettlementSimulation(state, DAY, null, false).newState;
}

test('legacy saves and default configs repair every damaged band (warehouse + housing)', () => {
  const r = tick(mkState()); // no automatedRepairConfig → all bands enabled
  assert.equal(r.adaptedBuildings.get('warehouse')!.isUnderRepair, true, 'warehouse (HIGH) repaired by default');
  assert.equal(r.adaptedBuildings.get('bar')!.isUnderRepair, true, 'bar (LOW) repaired by default');
});

test('disabling a band stops crews servicing those buildings entirely', () => {
  const r = tick(
    mkState({
      automatedRepairConfig: { emergency: true, high: true, normal: true, low: false },
    })
  );
  assert.equal(r.adaptedBuildings.get('warehouse')!.isUnderRepair, true, 'HIGH band still serviced');
  assert.equal(r.adaptedBuildings.get('bar')!.isUnderRepair, false, 'disabled LOW band ignored even when damaged');
});

test('the repair config accessor defaults legacy saves to every band enabled', () => {
  assert.deepEqual(getAutomatedRepairConfig({} as SettlementState), DEFAULT_AUTOMATED_REPAIR_CONFIG);
  assert.equal(
    getAutomatedRepairConfig({ automatedRepairConfig: { emergency: true, high: false, normal: false, low: false } } as SettlementState).high,
    false
  );
});

function quarters(id: string, footprintAreaM2: number): AdaptedBuilding {
  return mkBuilding(id, 'squad_quarters', 0, { footprintAreaM2 });
}

test('Squad Quarters squad slots scale with the barracks footprint', () => {
  const small = recalculateSettlementStats(
    [],
    null,
    new Map([['q1', quarters('q1', 64)]]),
    []
  );
  // Classic +1 for an ordinary annex (√64/8 = 1).
  assert.equal(small.squadCapacity, 1, '64 m² quarters grants +1 squad slot');

  const huge = recalculateSettlementStats(
    [],
    null,
    new Map([['q1', quarters('q1', 900)]]),
    []
  );
  // √900/8 = 3.75 → 3 squads from one large barracks hall.
  assert.equal(huge.squadCapacity, 3, '900 m² barracks grants 3 squad slots');

  const def = FUNCTIONAL_BUILDING_DEFINITIONS.squad_quarters;
  assert.match(def.capacityLabel || '', /64 m²/, 'def copy describes the size-scaling');
});

test('a partially adapted Squad Quarters still grants no squad slot (all-or-nothing)', () => {
  const half = recalculateSettlementStats(
    [],
    null,
    new Map([['q1', { ...quarters('q1', 900), adaptationPercentage: 50 }]]),
    []
  );
  assert.equal(half.squadCapacity, 0, 'half-converted barracks fields no squad');
});
