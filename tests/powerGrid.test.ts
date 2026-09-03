import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tickPowerGrid,
  computePowerAllocation,
  getGeneratorFuelTotal,
  POWER_CONSUMERS,
} from '../src/services/powerService';
import { getPoweredBuildingIds } from '../src/services/powerService';
import { tickSettlementSimulation } from '../src/services/populationService';
import { isResearchUnlocked } from '../src/services/researchService';
import {
  adaptBuilding,
  buildFreestanding,
  createInitialSettlementState,
} from '../src/services/settlementService';
import { RESEARCH_TREE_NODES } from '../src/data/researchTreeData';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../src/data/functionalBuildings';
import { createEmptyPowerState, GeneratorRecord } from '../src/types/power';
import type { BuildingPolygon } from '../src/types/map';
import type { SettlementState } from '../src/types/settlement';

const DAY = 600; // game-day in seconds at 1x
const HOUR = DAY / 24;

function mkState(overrides: Partial<SettlementState> = {}): SettlementState {
  return {
    adaptedBuildings: new Map(),
    freestandingBuildings: [],
    stockpile: {
      water: { rainwater: 0, purified_water: 0, bottled_water: 0 },
      food: { fresh_harvest: 0, dried_rations: 0, canned_goods: 0, mre_rations: 0 },
      medical: { first_aid_kits: 0, medicine: 0, antibiotics: 0, vaccine: 0, bandages: 0, sterile_bandages: 0 },
      ammo: { sharedPool: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      materials: { wood: 0, metal: 0, bricks: 0, tools: 0 },
    },
    powerState: createEmptyPowerState(),
    research: { unlockedNodes: [], activeResearchId: null, activeProgressSec: 0 },
    generalPopulation: { total: 0, unassigned: 0, inSquads: 0, children: [] },
    namedSurvivors: [],
    morale: { modifiers: { productivityMultiplier: 1 } },
    deconstructionJobs: new Map(),
    constructionOrders: [],
    headquarters: [],
    totalStorageCapacity: 10000,
    ...overrides,
  } as unknown as SettlementState;
}

function gen(id: string, x: number, z: number): SettlementState {
  return mkState({
    adaptedBuildings: new Map([
      [
        id,
        {
          buildingId: id,
          typeId: 'generator_station',
          name: `Generator ${id}`,
          constructionStatus: 'completed',
          currentDurability: 100,
          isUnderRepair: false,
          position: { x, z },
          footprintAreaM2: 80,
          assignedWorkers: 3,
        } as any,
      ],
    ]),
  });
}

function consumer(state: SettlementState, id: string, typeId: string, x: number, z: number): SettlementState {
  const m = new Map(state.adaptedBuildings);
  m.set(id, {
    buildingId: id,
    typeId,
    name: typeId,
    constructionStatus: 'completed',
    currentDurability: 100,
    isUnderRepair: false,
    position: { x, z },
    footprintAreaM2: 80,
    assignedWorkers: 2,
  } as any);
  return { ...state, adaptedBuildings: m };
}

test('a fuelled generator burns stockpile gasoline and powers consumers inside its radius', () => {
  let state = gen('gen', 0, 0);
  state = {
    ...state,
    stockpile: { ...state.stockpile, fuel: { ...state.stockpile.fuel, gasoline: 200 } },
  };
  // Hospital 30m away (inside 60m radius), workshop 150m away (outside).
  state = consumer(state, 'hosp', 'hospital', 30, 0);
  state = consumer(state, 'ws', 'vehicle_workshop', 150, 0);

  const r = tickPowerGrid(state, DAY);
  const powered = new Set(r.newState.powerState!.poweredBuildingIds);

  assert.ok(powered.has('hosp'), 'hospital inside the radius is powered');
  assert.ok(!powered.has('ws'), 'workshop outside the radius is not powered');
  assert.equal(r.newState.powerState!.supplyKw, 50);
  assert.equal(r.newState.powerState!.demandKw, 12, 'only in-range consumers count toward demand');
  // Fuel: 5/hour × 24 hours = 120 burned. The tank refills from the reserve,
  // so the 200-unit reserve covers the burn and leaves 80 in the buffer.
  assert.ok(Math.abs(getGeneratorFuelTotal(r.newState) - 80) < 0.01, 'buffer holds the day\'s residue after burning');
  assert.equal(r.newState.stockpile.fuel.gasoline, 0, 'the 200-unit reserve was consumed into the tank and burn');
});

test('priority bands shed Optional consumers before Critical ones on an over-subscribed grid', () => {
  let state = gen('gen', 0, 0);
  state = { ...state, stockpile: { ...state.stockpile, fuel: { ...state.stockpile.fuel, gasoline: 500 } } };
  // 50 kW supply. Critical: hospital (12) + research (8) = 20. High: medbay
  // (6) + workshop (10) + arms (12) + tool factory (6) = 34 — the High band
  // alone cannot fit in the 30 kW remaining after Critical, so High and every
  // lower band shed together.
  state = consumer(state, 'hosp', 'hospital', 10, 0);
  state = consumer(state, 'res', 'research_center', 20, 0);
  state = consumer(state, 'med', 'medbay', 30, 0);
  state = consumer(state, 'ws', 'vehicle_workshop', 40, 0);
  state = consumer(state, 'arms', 'arms_factory', 50, 0);
  state = consumer(state, 'tools', 'tool_factory', 60, 0);
  state = consumer(state, 'mill', 'sawmill', 70, 0);
  state = consumer(state, 'cannery', 'cannery', 80, 0);
  state = consumer(state, 'yard', 'scrapyard', 90, 0);
  state = consumer(state, 'flood', 'floodlight_tower', 100, 0);

  const r = tickPowerGrid(state, DAY);
  const powered = new Set(r.newState.powerState!.poweredBuildingIds);

  // Critical band (20 kW) fits; High band (28 kW) doesn't fit in the 30 kW
  // remaining — so High, Normal, and Optional are all shed together.
  assert.ok(powered.has('hosp'), 'critical hospital stays powered');
  assert.ok(powered.has('res'), 'critical research stays powered');
  assert.ok(!powered.has('med'), 'high-priority medbay shed when its band cannot fit');
  assert.ok(!powered.has('ws'), 'workshop shed');
  assert.ok(!powered.has('flood'), 'floodlight shed');
  // Consumers beyond the 60 m radius are not even candidates for the grid.
  assert.ok(!powered.has('mill'), 'normal-band sawmill shed');
  assert.equal(r.newState.powerState!.demandKw, 20 + 34, 'demand counts only in-range consumers');
  assert.equal(r.newState.powerState!.supplyKw, 50);
});

test('an unfuelled generator powers nothing and flags low fuel when the buffer runs low', () => {
  let state = gen('gen', 0, 0);
  // No fuel in stockpile at all.
  state = consumer(state, 'hosp', 'hospital', 10, 0);

  const r = tickPowerGrid(state, DAY);
  assert.equal(r.newState.powerState!.poweredBuildingIds.length, 0, 'no power without fuel');
  assert.equal(r.newState.powerState!.supplyKw, 0);

  // A nearly-dry buffer should report lowFuel. The generator building must
  // exist so syncPowerState keeps the record (with its carried fuel).
  const low = mkState({
    powerState: {
      ...createEmptyPowerState(),
      generators: new Map([
        [
          'gen',
          {
            buildingId: 'gen',
            buildingName: 'G',
            powerOutputKw: 50,
            powerRadiusM: 60,
            fuelPerHour: 5,
            fuelCapacity: 100,
            currentFuel: 10,
            running: true,
          },
        ],
      ]),
    },
  });
  let lowState = consumer(low, 'gen', 'generator_station', 0, 0);
  lowState = consumer(lowState, 'hosp', 'hospital', 10, 0);
  const r2 = tickPowerGrid(lowState, DAY / 24 / 2); // half an hour — buffer burns 2.5
  assert.equal(r2.newState.powerState!.lowFuel, true, 'low buffer flags lowFuel');
});

test('Advanced Power Systems research boosts generator output and radius by 25%', () => {
  let state = gen('gen', 0, 0);
  state = {
    ...state,
    stockpile: { ...state.stockpile, fuel: { ...state.stockpile.fuel, gasoline: 500 } },
    research: { ...state.research, unlockedNodes: ['advanced_power_systems'] },
  };
  // Workshop at 70m: outside base 60m radius, inside boosted 75m radius.
  state = consumer(state, 'ws', 'vehicle_workshop', 70, 0);

  const r = tickPowerGrid(state, DAY);
  assert.equal(r.newState.powerState!.supplyKw, Math.round(50 * 1.25), 'output boosted to ~62 kW');
  assert.ok(
    new Set(r.newState.powerState!.poweredBuildingIds).has('ws'),
    'workshop at 70m reached thanks to the boosted radius'
  );
});

test('powered production facilities run 25% harder', () => {
  let state = mkState();
  state = {
    ...state,
    stockpile: {
      ...state.stockpile,
      materials: { ...state.stockpile.materials, logs: 100 },
      fuel: { ...state.stockpile.fuel, gasoline: 500 },
      wood: undefined,
    } as any,
    adaptedBuildings: new Map([
      [
        'gen',
        {
          buildingId: 'gen',
          typeId: 'generator_station',
          constructionStatus: 'completed',
          currentDurability: 100,
          isUnderRepair: false,
          position: { x: 0, z: 0 },
          footprintAreaM2: 80,
          assignedWorkers: 3,
        } as any,
      ],
      [
        'mill',
        {
          buildingId: 'mill',
          typeId: 'sawmill',
          constructionStatus: 'completed',
          currentDurability: 100,
          isUnderRepair: false,
          position: { x: 20, z: 0 },
          footprintAreaM2: 80,
          assignedWorkers: 5,
        } as any,
      ],
    ]),
  };

  // One day of production at full staff: 10 logs → 16 wood × 1.25 powered bonus.
  const grid = tickPowerGrid(state, DAY);
  const r = tickSettlementSimulation(grid.newState, DAY, null, false);
  const wood = r.newState.stockpile.materials.wood;
  assert.ok(Math.abs(wood - 16 * 1.25) < 0.5, `powered sawmill yields ~20 wood/day (got ${wood})`);
});

test('the generator is gated behind Electrical Engineering research', () => {
  const def = FUNCTIONAL_BUILDING_DEFINITIONS.generator_station;
  assert.equal(def.researchRequirement, 'electrical_engineering', 'generator requires the research');
  assert.equal(def.adaptationAllowed, false, 'the generator is a purpose-built freestanding structure');
  assert.ok(RESEARCH_TREE_NODES.electrical_engineering, 'research node exists');
  assert.equal(RESEARCH_TREE_NODES.electrical_engineering.unlockedBuildingTypeId, 'generator_station');
  assert.ok(RESEARCH_TREE_NODES.advanced_power_systems, 'advanced power node exists');
  assert.equal(
    isResearchUnlocked(mkState({ research: { unlockedNodes: [], activeResearchId: null, activeProgressSec: 0 } }), 'electrical_engineering'),
    false,
    'locked without research'
  );
});

test('the generator is freestanding-only: adaptation is rejected, and Electrical Engineering alone unlocks the build', () => {
  // Adapting a real building into a generator station is rejected outright.
  const dummyBldg = {
    id: 'b1',
    type: 'industrial',
    rawType: 'osm',
    name: 'Old Factory',
    center: { x: 0, z: 0 },
    polygon: [
      { x: -4, z: -4 },
      { x: 4, z: -4 },
      { x: 4, z: 4 },
      { x: -4, z: 4 },
    ],
    height: 4,
    levels: 1,
  } as unknown as BuildingPolygon;
  const adapted = adaptBuilding(mkState(), dummyBldg, 'generator_station');
  assert.equal(adapted.success, false, 'a real building cannot be converted into a generator');
  assert.match(adapted.error || '', /freestanding/i);

  // Electrical Engineering unlocks the freestanding build directly — the
  // generic Advanced Masonry gate only applies to adaptation-eligible types.
  let state = createInitialSettlementState('Test Colony');
  state = {
    ...state,
    research: { ...state.research, unlockedNodes: ['electrical_engineering'] },
    stockpile: {
      ...state.stockpile,
      materials: { ...state.stockpile.materials, wood: 200, metal: 200, bricks: 200, tools: 10 },
    },
  } as unknown as SettlementState;
  assert.equal(state.research.unlockedNodes.includes('advanced_masonry'), false, 'precondition: no masonry research');
  const built = buildFreestanding(state, 'generator_station', { x: 12, z: 12 });
  assert.ok(built.success, `generator places with only Electrical Engineering researched: ${built.error || ''}`);
});

test('the hospital is a critical consumer; floodlights are the first shed', () => {
  assert.equal(POWER_CONSUMERS.hospital.priority, 0);
  assert.equal(POWER_CONSUMERS.research_center.priority, 0);
  assert.equal(POWER_CONSUMERS.floodlight_tower.priority, 3);
});

// ============================================================
// Battery Storage (§Terminus) — surplus charge, fuel-gap discharge
// ============================================================

function bat(state: SettlementState, id: string, x: number, z: number): SettlementState {
  const m = new Map(state.adaptedBuildings);
  m.set(id, {
    buildingId: id,
    typeId: 'battery_bank',
    name: `Battery ${id}`,
    constructionStatus: 'completed',
    currentDurability: 100,
    isUnderRepair: false,
    position: { x, z },
    footprintAreaM2: 60,
    assignedWorkers: 1,
  } as any);
  return { ...state, adaptedBuildings: m };
}

test('a generator surplus charges a connected battery bank', () => {
  // 50 kW generator, single 8 kW research center → 42 kW surplus.
  let state = gen('gen', 0, 0);
  state = bat(state, 'bat', 10, 0);
  state = consumer(state, 'res', 'research_center', 20, 0);
  state = { ...state, stockpile: { ...state.stockpile, fuel: { ...state.stockpile.fuel, gasoline: 500 } } };

  const r1 = tickPowerGrid(state, DAY);
  const b1 = r1.newState.powerState!.batteries.get('bat')!;
  // Charge capped at 30 kW × 24 h = 720 kWh and at capacity 200 kWh.
  assert.equal(b1.storedKwh, 200, 'a full day of surplus fills the 200 kWh bank');
  assert.equal(b1.discharging, false, 'no discharge while the generator covers demand');

  // A second day with the battery already full adds nothing.
  const r2 = tickPowerGrid(r1.newState, DAY);
  const b2 = r2.newState.powerState!.batteries.get('bat')!;
  assert.equal(b2.storedKwh, 200, 'full bank stays capped at capacity');
});

test('a battery outside any generator radius never charges', () => {
  let state = gen('gen', 0, 0);
  state = bat(state, 'far', 500, 0);
  state = consumer(state, 'res', 'research_center', 20, 0);
  state = { ...state, stockpile: { ...state.stockpile, fuel: { ...state.stockpile.fuel, gasoline: 500 } } };

  const r = tickPowerGrid(state, DAY);
  const b = r.newState.powerState!.batteries.get('far')!;
  assert.equal(b.storedKwh, 0, 'disconnected bank receives no surplus');
});

test('when fuel runs out, a charged battery discharges to keep critical facilities alive', () => {
  // Day 1: generator runs with plenty of fuel, fills the battery.
  let state = gen('gen', 0, 0);
  state = bat(state, 'bat', 10, 0);
  state = consumer(state, 'hosp', 'hospital', 20, 0); // 12 kW critical
  state = consumer(state, 'yard', 'scrapyard', 30, 0); // 8 kW normal
  state = { ...state, stockpile: { ...state.stockpile, fuel: { ...state.stockpile.fuel, gasoline: 500 } } };
  const day1 = tickPowerGrid(state, DAY);
  const stored = day1.newState.powerState!.batteries.get('bat')!.storedKwh;
  assert.equal(stored, 200, 'day 1 fills the bank');

  // Fuel gone. The battery must carry the 12 kW hospital through the gap.
  // Ticks are 4 game-hours (100 sim-seconds): hospital draws 48 kWh per
  // tick, the battery holds 200 → four full ticks, then it is spent.
  const noFuel = {
    ...day1.newState,
    stockpile: { ...day1.newState.stockpile, fuel: { gasoline: 0, diesel: 0, biofuel: 0 } },
    powerState: {
      ...day1.newState.powerState!,
      generators: new Map<string | number, GeneratorRecord>([
        ['gen', { ...day1.newState.powerState!.generators.get('gen')!, currentFuel: 0, running: false }],
      ]),
    },
  } as unknown as SettlementState;
  let s = noFuel;
  for (let i = 0; i < 3; i++) {
    s = tickPowerGrid(s, 100).newState;
    const ps = s.powerState!;
    assert.equal(ps.generators.get('gen')!.running, false, 'generator stays dry');
    assert.ok(ps.poweredBuildingIds.includes('hosp'), `hospital alive on tick ${i + 1}`);
    assert.ok(ps.batteries.get('bat')!.discharging, 'battery discharging');
  }
  assert.ok(
    Math.abs(s.powerState!.batteries.get('bat')!.storedKwh - (200 - 3 * 12 * 4)) < 0.01,
    'bank drained only by the served critical draw'
  );

  // Tick 4 empties it down to 8 kWh — too little to sustain 12 kW for a
  // whole 4-hour tick — so the fifth tick leaves the hospital dark. The dregs
  // stay reserved rather than being spent on a load they cannot carry.
  for (let i = 0; i < 2; i++) {
    s = tickPowerGrid(s, 100).newState;
  }
  const psEnd = s.powerState!;
  assert.ok(Math.abs(psEnd.batteries.get('bat')!.storedKwh - 8) < 0.01, 'unsustainable dregs stay reserved');
  assert.ok(!psEnd.poweredBuildingIds.includes('hosp'), 'hospital dark once the reserve is spent');
  assert.ok(!psEnd.batteries.get('bat')!.discharging, 'no discharge when it cannot serve the load');
});

test('discharge never exceeds stored energy or the served demand', () => {
  // A battery with only 40 kWh stored faces a 30 kW research center.
  let state = gen('gen', 0, 0);
  state = bat(state, 'bat', 10, 0);
  state = consumer(state, 'res', 'research_center', 20, 0);
  const seededGen = {
    buildingId: 'gen',
    buildingName: 'G',
    powerOutputKw: 50,
    powerRadiusM: 60,
    fuelPerHour: 5,
    fuelCapacity: 100,
    currentFuel: 0,
    running: false,
  };
  let s = {
    ...state,
    powerState: {
      ...state.powerState!,
      generators: new Map([['gen', seededGen]]),
      batteries: new Map([
        [
          'bat',
          {
            buildingId: 'bat',
            buildingName: 'Bat',
            capacityKwh: 200,
            storedKwh: 40,
            chargeKw: 30,
            dischargeKw: 40,
            powerRadiusM: 60,
            discharging: false,
          },
        ],
      ]),
    },
  };
  // One 4-hour tick: research needs 32 kWh but the bank only holds 40 and
  // discharges at 40 kW × 4 h = 160 kWh max → draws 32 kWh, stays alive.
  let r = tickPowerGrid(s, 100);
  assert.equal(r.newState.powerState!.batteries.get('bat')!.storedKwh, 40 - 32, 'drained by exactly the served draw');
  assert.ok(r.newState.powerState!.poweredBuildingIds.includes('res'), 'served within stored energy');

  // A second identical tick exceeds the remaining 8 kWh → the center dies and
  // the unspendable remainder stays in the bank (never negative).
  r = tickPowerGrid(r.newState, 100);
  const ps = r.newState.powerState!;
  assert.equal(ps.batteries.get('bat')!.storedKwh, 8, 'never goes negative; unsupported remainder is kept');
  assert.ok(!ps.poweredBuildingIds.includes('res'), 'no power beyond stored energy');
});

test('the Battery Bank is gated behind Battery Storage research', () => {
  const def = FUNCTIONAL_BUILDING_DEFINITIONS.battery_bank;
  assert.ok(def, 'battery bank definition exists');
  assert.equal(def.researchRequirement, 'battery_storage', 'battery requires the research');
  assert.ok(RESEARCH_TREE_NODES.battery_storage, 'research node exists');
  assert.equal(RESEARCH_TREE_NODES.battery_storage.unlockedBuildingTypeId, 'battery_bank');
  assert.equal(
    isResearchUnlocked(mkState({ research: { unlockedNodes: [], activeResearchId: null, activeProgressSec: 0 } }), 'battery_storage'),
    false,
    'locked without research'
  );
});

test('Advanced Power Systems research boosts battery capacity 25%', () => {
  let state = gen('gen', 0, 0);
  state = bat(state, 'bat', 10, 0);
  state = consumer(state, 'res', 'research_center', 20, 0);
  state = {
    ...state,
    stockpile: { ...state.stockpile, fuel: { ...state.stockpile.fuel, gasoline: 500 } },
    research: { ...state.research, unlockedNodes: ['advanced_power_systems'] },
  };
  const r = tickPowerGrid(state, DAY);
  const b = r.newState.powerState!.batteries.get('bat')!;
  assert.equal(b.capacityKwh, Math.round(200 * 1.25), 'capacity boosted');
  assert.equal(b.storedKwh, b.capacityKwh, 'boosted bank fills to its new capacity');
});

// ============================================================
// Demand-driven operation (§Power grid) — no load, no burn
// ============================================================

test('a generator with no powered consumers in reach stays off and never touches fuel', () => {
  let state = gen('gen', 0, 0);
  state = { ...state, stockpile: { ...state.stockpile, fuel: { ...state.stockpile.fuel, gasoline: 500 } } };

  const r = tickPowerGrid(state, DAY);
  const ps = r.newState.powerState!;
  assert.equal(ps.generators.get('gen')!.running, false, 'unit idles with nothing to power');
  assert.equal(ps.generators.get('gen')!.currentFuel, 0, 'empty buffer stays empty');
  assert.equal(r.newState.stockpile.fuel.gasoline, 500, 'reserve untouched — no load, no burn');
  assert.equal(ps.supplyKw, 0);
  assert.equal(ps.demandKw, 0, 'no demand registered');
  assert.equal(r.events.length, 0, 'no online event while idling');
});

test('a generator starts on its own the moment a consumer appears inside its radius', () => {
  let state = gen('gen', 0, 0);
  state = { ...state, stockpile: { ...state.stockpile, fuel: { ...state.stockpile.fuel, gasoline: 500 } } };
  // Idle first — nothing to serve.
  const idle = tickPowerGrid(state, DAY);
  assert.equal(idle.newState.powerState!.generators.get('gen')!.running, false, 'still off while unloaded');

  // A hospital appears → the unit engages and serves it.
  state = consumer(state, 'hosp', 'hospital', 20, 0);
  const r = tickPowerGrid(state, DAY);
  const ps = r.newState.powerState!;
  assert.equal(ps.generators.get('gen')!.running, true, 'auto-started to serve the hospital');
  assert.ok(ps.poweredBuildingIds.includes('hosp'), 'hospital powered');
  assert.ok(r.events.some((e) => e.title === 'GENERATOR ONLINE'), 'online event fired on engagement');
  // 120 burned for the day + 100 to fill the buffer to capacity = 220 drawn
  // from the reserve — fuel spent ONLY because a load existed.
  assert.equal(r.newState.stockpile.fuel.gasoline, 500 - 220, 'fuel spent only because a load existed');
});

test('standby conserves the buffer when demand disappears, then resumes when the load returns', () => {
  // Seed a warm generator with a full buffer and a hospital inside reach.
  const seeded = mkState({
    powerState: {
      ...createEmptyPowerState(),
      generators: new Map([
        [
          'gen',
          {
            buildingId: 'gen',
            buildingName: 'G',
            powerOutputKw: 50,
            powerRadiusM: 60,
            fuelPerHour: 5,
            fuelCapacity: 100,
            currentFuel: 100,
            running: true,
          } as GeneratorRecord,
        ],
      ]),
    },
  });
  let state = consumer(seeded, 'gen', 'generator_station', 0, 0);
  state = consumer(state, 'hosp', 'hospital', 20, 0);
  state = { ...state, stockpile: { ...state.stockpile, fuel: { ...state.stockpile.fuel, gasoline: 0 } } };

  // Half a day under load: 60 fuel burned straight from the buffer.
  const underLoad = tickPowerGrid(state, DAY / 2);
  assert.ok(
    Math.abs(underLoad.newState.powerState!.generators.get('gen')!.currentFuel - 40) < 0.01,
    'buffer burned 60 under load'
  );
  assert.equal(underLoad.newState.stockpile.fuel.gasoline, 0, 'no reserve drawn (the tank covered the burn)');

  // Hospital falls under repair → no demand → the unit stands down, buffer held.
  const dark = {
    ...underLoad.newState,
    adaptedBuildings: (() => {
      const m = new Map(underLoad.newState.adaptedBuildings);
      m.set('hosp', { ...m.get('hosp'), isUnderRepair: true } as never);
      return m;
    })(),
  } as unknown as SettlementState;
  const idleTick = tickPowerGrid(dark, DAY);
  const ps = idleTick.newState.powerState!;
  assert.equal(ps.generators.get('gen')!.running, false, 'stood down with no load');
  assert.ok(Math.abs(ps.generators.get('gen')!.currentFuel - 40) < 0.01, 'buffer conserved while idling');
  assert.ok(idleTick.events.some((e) => e.title === 'GENERATOR STANDBY'), 'standby event fired');
  assert.equal(idleTick.newState.stockpile.fuel.gasoline, 0, 'nothing drawn during the idle day');

  // Repaired → load returns → the unit starts back up from its conserved buffer.
  const back = {
    ...idleTick.newState,
    adaptedBuildings: (() => {
      const m = new Map(idleTick.newState.adaptedBuildings);
      m.set('hosp', { ...m.get('hosp'), isUnderRepair: false } as never);
      return m;
    })(),
  } as unknown as SettlementState;
  const resume = tickPowerGrid(back, DAY / 4); // 6 in-game hours — burn 30
  const ps2 = resume.newState.powerState!;
  assert.equal(ps2.generators.get('gen')!.running, true, 'restarted for the returning load');
  assert.ok(resume.events.some((e) => e.title === 'GENERATOR ONLINE'), 'online event fired again');
  assert.ok(
    Math.abs(ps2.generators.get('gen')!.currentFuel - (40 - 30)) < 0.01,
    'buffer burned only the 6 hours served'
  );
});