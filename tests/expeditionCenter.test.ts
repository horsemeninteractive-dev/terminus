import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCaravanSpeedAndDuration,
  dispatchTradeCaravan,
  getExpeditionCenterCount,
  LONG_RANGE_EXPEDITION_KM,
  validateExpeditionRequirement,
} from '../src/services/caravanService';
import { tickBuildingScavengeProgress } from '../src/services/scavengingService';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../src/data/functionalBuildings';
import type { AdaptedBuilding, SettlementState } from '../src/types/settlement';
import type { BuildingPolygon, Point2D } from '../src/types/map';
import type { TacticalSquadUnit } from '../src/types/combat';
import type { CaravanDispatchConfig, SettlementRecord } from '../src/types/caravan';
import type { WorldVehicle } from '../src/types/vehicle';

function mkCenter(id: string): AdaptedBuilding {
  return {
    buildingId: id,
    typeId: 'expedition_center',
    name: 'Expedition Center',
    constructionStatus: 'completed',
    currentDurability: 100,
    isUnderRepair: false,
    footprintAreaM2: 200,
    assignedWorkers: 2,
    adaptedAt: Date.now(),
    isHQ: false,
    category: 'utility',
    adaptedAreaM2: 200,
    adaptationPercentage: 100,
    totalFloorAreaM2: 200,
    volumeM3: 800,
    maxCapacity: 10,
    fullCapacity: 10,
    currentUsage: 0,
    capacityUnit: 'Logistics Stations',
    maxDurability: 100,
    defenseRating: 35,
    isFreestanding: false,
    position: { x: 0, z: 0 },
    height: 4,
    levels: 1,
  } as unknown as AdaptedBuilding;
}

function mkState(centers: number): SettlementState {
  const adapted = new Map<string, AdaptedBuilding>();
  for (let i = 0; i < centers; i++) adapted.set(`ec_${i}`, mkCenter(`ec_${i}`));
  return {
    adaptedBuildings: adapted,
    freestandingBuildings: [],
    stockpile: {
      water: { rainwater: 0, purified_water: 0, bottled_water: 0 },
      food: { fresh_harvest: 0, dried_rations: 0, canned_goods: 0, mre_rations: 0, grain: 0 },
      medical: { first_aid_kits: 0, medicine: 0, antibiotics: 0, vaccine: 0, bandages: 0 },
      ammo: { sharedPool: 0 },
      fuel: { gasoline: 500, diesel: 0, biofuel: 0 },
      materials: { wood: 100, metal: 100, bricks: 100, tools: 0, logs: 0, scrap: 0, clay: 0, beer: 0 },
    },
    research: { unlockedNodes: [], activeResearchId: null, activeProgressSec: 0 },
    generalPopulation: { total: 20, unassigned: 20, inSquads: 0, children: [] },
    namedSurvivors: [],
    morale: { modifiers: { productivityMultiplier: 1 } },
    deconstructionJobs: new Map(),
    constructionOrders: [],
    headquarters: [],
    totalStorageCapacity: 10000,
    vehicles: [
      { id: 'v1', type: 'car', fuelType: 'gasoline' } as unknown as WorldVehicle,
    ],
    squads: [
      { id: 'sq1', squadId: 'sq1', name: 'Alpha', members: [], state: 'idle' } as unknown as TacticalSquadUnit,
    ],
  } as unknown as SettlementState;
}

function mkBldg(): BuildingPolygon {
  const poly: Point2D[] = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 },
  ];
  return {
    id: 'bldg_1',
    name: 'Shop',
    polygon: poly,
    center: { x: 5, z: 5 },
    height: 4,
  } as unknown as BuildingPolygon;
}

function mkSquad(): TacticalSquadUnit {
  return {
    id: 'sq1',
    squadId: 'sq1',
    name: 'Alpha',
    state: 'searching',
    members: [],
  } as unknown as TacticalSquadUnit;
}

function makeRecords(state: SettlementState): Record<string, SettlementRecord> {
  const rec: SettlementRecord = {
    id: 's1',
    name: 'Origin',
    status: 'operational',
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'A', bounds: { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 } },
    state,
    dayEstablished: 1,
  } as unknown as SettlementRecord;
  const dest: SettlementRecord = {
    id: 's2',
    name: 'Destination',
    status: 'operational',
    placement: { center: { lat: 2, lon: 0 }, sectorName: 'B', bounds: { minLat: 1, maxLat: 3, minLng: 0, maxLng: 1 } },
    state: structuredClone(state),
    dayEstablished: 2,
  } as unknown as SettlementRecord;
  return { s1: rec, s2: dest };
}

function mkConfig(): CaravanDispatchConfig {
  return {
    originSettlementId: 's1',
    destinationSettlementId: 's2',
    vehicleId: 'v1',
    squadId: 'sq1',
    cargo: {
      food: { canned_goods: 0, mre_rations: 0, dried_rations: 0, fresh_harvest: 0 },
      water: { bottled_water: 0, purified_water: 0, rainwater: 0 },
      medical: { first_aid_kits: 0, sterile_bandages: 0, antibiotics: 0, painkillers: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      ammo: { sharedPool: 0 },
      materials: { wood: 0, metal: 0, bricks: 0, tools: 0 },
    },
    transportNamedSurvivorIds: [],
    transportGeneralCount: 0,
  };
}

test('expedition centers no longer accelerate scavenging searches', () => {
  const bldg = mkBldg();
  const squad = mkSquad();
  const seed = (centers: number) => {
    const s = mkState(centers);
    s.buildingSearches = new Map([
      [
        bldg.id,
        {
          buildingId: bldg.id,
          observed: true,
          searched: false,
          searchProgress: 0,
          totalDurationSec: 100,
          elapsedDurationSec: 0,
          loot: [],
          unlootedItems: [],
          lootedItems: [],
        },
      ],
    ]);
    return s;
  };
  const noCenter = tickBuildingScavengeProgress(seed(0), squad, bldg, 50);
  const twoCenters = tickBuildingScavengeProgress(seed(2), squad, bldg, 50);
  assert.equal(
    noCenter.newState.buildingSearches?.get(bldg.id)?.elapsedDurationSec,
    50,
    'baseline: raw elapsed time'
  );
  assert.equal(
    twoCenters.newState.buildingSearches?.get(bldg.id)?.elapsedDurationSec,
    50,
    'two expedition centers must NOT accelerate the search (re-role)'
  );
});

test('operational expedition centers improve caravan speed and fuel economy', () => {
  const car = { id: 'v1', type: 'car', fuelType: 'gasoline' } as unknown as WorldVehicle;
  const base = calculateCaravanSpeedAndDuration(100, car, mkState(0));
  const one = calculateCaravanSpeedAndDuration(100, car, mkState(1));
  const three = calculateCaravanSpeedAndDuration(100, car, mkState(4)); // capped at 3

  assert.equal(base.speedKmh, 85, 'baseline car speed');
  assert.equal(one.speedKmh, Math.round(85 * 1.12), '+12% convoy speed per HQ');
  assert.equal(three.speedKmh, Math.round(85 * 1.36), 'bonus capped at 3 HQs');
  assert.ok(one.fuelRequired < base.fuelRequired, 'fuel economy improves with an HQ');
  assert.ok(three.fuelRequired <= one.fuelRequired, 'more HQs → no worse fuel use');
});

test('long-range caravans require an operational expedition center at origin', () => {
  const far = LONG_RANGE_EXPEDITION_KM + 10;
  const local = LONG_RANGE_EXPEDITION_KM - 10;
  assert.ok(
    validateExpeditionRequirement(mkState(0), far)?.includes('Expedition Center'),
    'no HQ + long range → blocked with logistics error'
  );
  assert.equal(validateExpeditionRequirement(mkState(1), far), null, 'HQ present → allowed');
  assert.equal(
    validateExpeditionRequirement(mkState(0), local),
    null,
    'local routes never need an HQ'
  );
  assert.equal(getExpeditionCenterCount(mkState(2)), 2, 'center counter sees both buildings');
});

test('dispatchTradeCaravan enforces the expedition gate end-to-end', () => {
  // Origin at (0,0), destination at (2,0) ≈ 222 km — a long-range expedition.
  const noCenter = dispatchTradeCaravan(makeRecords(mkState(0)), mkConfig(), 10);
  assert.equal(noCenter.success, false);
  assert.ok((noCenter.error || '').includes('Expedition Center'), 'gate error surfaces');

  const withCenter = dispatchTradeCaravan(makeRecords(mkState(1)), mkConfig(), 10);
  assert.equal(withCenter.success, true, 'an HQ unlocks the long-range convoy');
  assert.ok(withCenter.newCaravan, 'caravan is created');
});

test('expedition center def copy reflects the logistics role, not scavenging', () => {
  const def = FUNCTIONAL_BUILDING_DEFINITIONS.expedition_center;
  const funcs = (def.functions || []).join(' ');
  assert.ok(!/scaveng/i.test(funcs), 'no scavenge buff in functions');
  assert.ok(/logistics/i.test(funcs), 'logistics role present');
  assert.ok(!/scaveng/i.test(def.description || ''), 'description no longer promises scavenge speed');
  assert.ok(/caravan/i.test(def.description || ''), 'description names caravan coordination');
  assert.ok(/logistics/i.test(def.capacityLabel || ''), 'capacity label is logistics-oriented');
});