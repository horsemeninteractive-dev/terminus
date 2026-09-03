import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tickWaterEconomy,
  consumeSettlementWater,
  calculateWaterDemand,
  getCisternCapacity,
  getBuildingRoofAreaM2,
  CISTERN_WEATHER_MULT,
} from '../src/services/waterService';
import { tickMoraleAndGrowthSimulation } from '../src/services/moraleService';
import { getBuildingLockStatus } from '../src/services/researchService';
import {
  adaptBuilding,
  buildFreestanding,
  createInitialSettlementState,
} from '../src/services/settlementService';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../src/data/functionalBuildings';
import { RESEARCH_TREE_NODES } from '../src/data/researchTreeData';
import type { BuildingPolygon } from '../src/types/map';
import type { SettlementState } from '../src/types/settlement';
import type { WeatherState } from '../src/types/weather';
import { createEmptyWaterState } from '../src/types/water';

const DAY = 600; // game-day in seconds at 1x

function mkCistern(buildingId: string, roofAreaM2: number, buildingName = `Cistern ${buildingId}`): SettlementState {
  return {
    adaptedBuildings: new Map([
      [
        buildingId,
        {
          buildingId,
          typeId: 'water_cistern',
          name: buildingName,
          constructionStatus: 'completed',
          currentDurability: 100,
          isUnderRepair: false,
          adaptedAreaM2: roofAreaM2,
          footprintAreaM2: roofAreaM2,
        },
      ],
    ]),
    freestandingBuildings: [],
    stockpile: {
      water: { rainwater: 0, purified_water: 0, bottled_water: 0 },
      food: { fresh_harvest: 0, dried_rations: 0, canned_goods: 0, mre_rations: 0 },
      medical: { first_aid_kits: 0, medicine: 0, antibiotics: 0, vaccine: 0, bandages: 0 },
      ammo: { sharedPool: 0 },
    },
    waterState: createEmptyWaterState(),
    research: { unlocked: [], researchPoints: 0 },
    generalPopulation: { total: 10, unassigned: 10, inSquads: 0, children: [] },
    namedSurvivors: [],
  } as unknown as SettlementState;
}

function weather(type: keyof typeof CISTERN_WEATHER_MULT): WeatherState {
  return { currentWeather: type } as unknown as WeatherState;
}

test('roof area drives collection — a huge warehouse banks far more than a tiny house', () => {
  // 500 m² warehouse vs 40 m² house, one full day of steady rain.
  const big = mkCistern('big', 500);
  const small = mkCistern('small', 40);

  const bigR = tickWaterEconomy(big, weather('rain'), DAY);
  const smallR = tickWaterEconomy(small, weather('rain'), DAY);

  const bigRec = bigR.newState.waterState!.cisterns.get('big')!;
  const smallRec = smallR.newState.waterState!.cisterns.get('small')!;

  assert.ok(
    bigRec.currentWater > smallRec.currentWater * 8,
    `warehouse (${Math.round(bigRec.currentWater)}L) ≫ house (${Math.round(smallRec.currentWater)}L)`
  );
  // 500 m² × 0.5 L/m²/day × 1.0 = 250 L; 40 m² × 0.5 = 20 L.
  assert.ok(Math.abs(bigRec.currentWater - 250) < 1, `warehouse collects ~250 L/day (${Math.round(bigRec.currentWater)})`);
  assert.ok(Math.abs(smallRec.currentWater - 20) < 1, `house collects ~20 L/day (${Math.round(smallRec.currentWater)})`);
});

test('weather multipliers: thunderstorm bountiful, blizzard snowmelt trickle, clear nothing', () => {
  const s = mkCistern('w', 200);

  const storm = tickWaterEconomy(s, weather('thunderstorm'), DAY);
  const snow = tickWaterEconomy(s, weather('blizzard'), DAY);
  const clear = tickWaterEconomy(s, weather('clear'), DAY);

  const stormL = storm.newState.waterState!.cisterns.get('w')!.currentWater;
  const snowL = snow.newState.waterState!.cisterns.get('w')!.currentWater;
  const clearL = clear.newState.waterState!.cisterns.get('w')!.currentWater;

  assert.ok(Math.abs(stormL - 200 * 0.5 * 2.5) < 1, `thunderstorm 2.5× (${Math.round(stormL)}L)`);
  assert.ok(Math.abs(snowL - 200 * 0.5 * 0.75) < 1, `blizzard 0.75× snowmelt (${Math.round(snowL)}L)`);
  assert.equal(clearL, 0, 'clear skies collect nothing');
});

test('collection clamps at the roof-area-scaled capacity', () => {
  const s = mkCistern('c', 100); // capacity = max(60, 100/10 × 25) = 250 L
  const rec0 = tickWaterEconomy(s, weather('rain'), DAY).newState.waterState!.cisterns.get('c')!;
  assert.equal(getCisternCapacity(100), 250);

  // Four consecutive stormy days would collect 100 × 0.5 × 2.5 = 125 L/day → 500 L, capped at 250.
  let state = s;
  for (let i = 0; i < 4; i++) {
    state = tickWaterEconomy(state, weather('thunderstorm'), DAY).newState;
  }
  const rec = state.waterState!.cisterns.get('c')!;
  assert.equal(rec.currentWater, 250, 'buffer never exceeds capacity');
  assert.ok(rec0.currentWater > 0, 'the first day fills part of the buffer');
});

test('consumption draws the disposable store first, then the cistern buffers, then reports shortage', () => {
  let state = mkCistern('c', 100);
  state = tickWaterEconomy(state, weather('thunderstorm'), DAY).newState;
  // 125 L in the buffer.
  const buffered = state.waterState!.cisterns.get('c')!.currentWater;
  assert.ok(buffered > 100);

  // Demand 40 L with an empty store → drains the buffer.
  const r1 = consumeSettlementWater(state, 40);
  assert.equal(r1.unmetL, 0);
  assert.equal(r1.inShortage, false);
  assert.ok(
    Math.abs(r1.newState.waterState!.cisterns.get('c')!.currentWater - (buffered - 40)) < 0.01,
    'buffer drained by the demand'
  );

  // Demand far exceeding store + buffer → shortage reported and buffers empty.
  const r2 = consumeSettlementWater(r1.newState, buffered + 5000);
  assert.ok(r2.unmetL > 0, 'unmet demand reported');
  assert.equal(r2.inShortage, true);
  assert.equal(r2.newState.waterState!.cisterns.get('c')!.currentWater, 0, 'buffers fully drained');
  assert.equal(r2.newState.waterState!.shortageDays, 1, 'shortage day counted');
});

test('stockpile bottled/purified water is consumed before cistern buffers', () => {
  let state = mkCistern('c', 100);
  state = {
    ...state,
    stockpile: {
      ...state.stockpile,
      water: { ...state.stockpile.water, bottled_water: 30 },
    },
  };
  state = tickWaterEconomy(state, weather('thunderstorm'), DAY).newState;
  const buffered = state.waterState!.cisterns.get('c')!.currentWater;

  // Demand 50: 30 bottled first, then 20 from the buffer.
  const r = consumeSettlementWater(state, 50);
  assert.equal(r.newState.stockpile.water.bottled_water, 0);
  assert.ok(
    Math.abs(r.newState.waterState!.cisterns.get('c')!.currentWater - (buffered - 20)) < 0.01,
    'buffer covers the remainder after bottled water'
  );
  assert.equal(r.unmetL, 0);
});

test('demand includes population plus medical and industrial facilities', () => {
  const base = mkCistern('c', 100);
  assert.ok(Math.abs(calculateWaterDemand(base) - 10 * 1.5) < 0.01, 'baseline is population drinking');

  const withMedical = {
    ...base,
    adaptedBuildings: (() => {
      const m = new Map(base.adaptedBuildings);
      m.set('mb', { buildingId: 'mb', typeId: 'medbay', constructionStatus: 'completed', currentDurability: 100, isUnderRepair: false, maxCapacity: 8 } as any);
      m.set('ws', { buildingId: 'ws', typeId: 'vehicle_workshop', constructionStatus: 'completed', currentDurability: 100, isUnderRepair: false } as any);
      return m;
    })(),
  } as unknown as SettlementState;
  const demand = calculateWaterDemand(withMedical);
  assert.equal(demand, 10 * 1.5 + 8 * 3 + 2, 'medbay beds × 3 and the workshop +2 are added');
});

test('the Water Cistern is gated behind Basic Sanitation research', () => {
  const def = FUNCTIONAL_BUILDING_DEFINITIONS.water_cistern;
  assert.equal(def.researchRequirement, 'basic_sanitation', 'building requires the sanitation research');
  assert.equal(def.adaptationAllowed, false, 'the cistern is a purpose-built freestanding structure');
  assert.ok(RESEARCH_TREE_NODES.basic_sanitation, 'the research node exists');
  assert.equal(RESEARCH_TREE_NODES.basic_sanitation.unlockedBuildingTypeId, 'water_cistern');

  const locked = mkCistern('c', 100);
  assert.equal(getBuildingLockStatus(locked, 'basic_sanitation').unlocked, false, 'locked without research');

  const unlocked = { ...locked, research: { ...locked.research, unlockedNodes: ['basic_sanitation'] } } as unknown as SettlementState;
  assert.equal(getBuildingLockStatus(unlocked, 'basic_sanitation').unlocked, true, 'unlocked after research');
});

test('Rainwater Harvesting research raises cistern collection efficiency to 1.5×', () => {
  const plain = mkCistern('c', 100);
  const boosted = {
    ...plain,
    research: { ...plain.research, unlockedNodes: ['rainwater_harvesting'] },
  } as unknown as SettlementState;

  const r = tickWaterEconomy(boosted, weather('rain'), DAY);
  const rec = r.newState.waterState!.cisterns.get('c')!;
  // 100 m² × 0.5 × 1.0 × 1.5 = 75 L vs 50 L unboosted.
  assert.equal(rec.efficiency, 1.5);
  assert.ok(Math.abs(rec.currentWater - 75) < 1, `harvesting research boosts collection (${Math.round(rec.currentWater)}L)`);
});

test('the cistern is freestanding-only: adaptation is rejected, and no Advanced Masonry is needed to build it', () => {
  // Adapting a real building into a cistern is rejected outright.
  const dummyBldg = {
    id: 'b1',
    type: 'residential',
    rawType: 'osm',
    name: 'Old House',
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
  const adapted = adaptBuilding(mkCistern('b1', 100), dummyBldg, 'water_cistern');
  assert.equal(adapted.success, false, 'a real building cannot be converted into a cistern');
  assert.match(adapted.error || '', /freestanding/i);

  // Basic Sanitation unlocks the freestanding build directly — the generic
  // Advanced Masonry gate only applies to adaptation-eligible types.
  let state = createInitialSettlementState('Test Colony');
  state = {
    ...state,
    research: { ...state.research, unlockedNodes: ['basic_sanitation'] },
    stockpile: {
      ...state.stockpile,
      materials: { ...state.stockpile.materials, wood: 200, metal: 200, bricks: 200 },
    },
  } as unknown as SettlementState;
  assert.equal(state.research.unlockedNodes.includes('advanced_masonry'), false, 'precondition: no masonry research');
  const built = buildFreestanding(state, 'water_cistern', { x: 12, z: 12 });
  assert.ok(built.success, `cistern places with only Basic Sanitation researched: ${built.error || ''}`);
});

test('roof area falls back to footprint for freestanding cisterns', () => {
  const state = {
    ...mkCistern('f', 0),
    adaptedBuildings: new Map(),
    freestandingBuildings: [
      {
        buildingId: 'f',
        typeId: 'water_cistern',
        name: 'Freestanding Cistern',
        constructionStatus: 'completed',
        currentDurability: 100,
        isUnderRepair: false,
        widthM: 20,
        depthM: 30,
      },
    ],
  } as unknown as SettlementState;
  const synced = tickWaterEconomy(state, weather('rain'), DAY).newState;
  const rec = synced.waterState!.cisterns.get('f')!;
  assert.equal(rec.roofAreaM2, 600, 'footprint fallback used');
});

// ============================================================
// Single water authority (§Terminus) — morale delegates to waterService
// ============================================================

function popState(overrides: Partial<SettlementState> = {}): SettlementState {
  const base = createInitialSettlementState('Test Colony');
  return {
    ...base,
    // Deterministic fixtures: 10 citizens, no named survivors, an EMPTY
    // disposable water store, and (by default) no cistern records at all.
    namedSurvivors: [],
    generalPopulation: { total: 10, unassigned: 10, inSquads: 0, children: [] },
    stockpile: {
      ...base.stockpile,
      water: { rainwater: 0, purified_water: 0, bottled_water: 0 },
    },
    waterState: createEmptyWaterState(),
    ...overrides,
  } as unknown as SettlementState;
}

test('the morale tick consumes water through waterService — store first, then cistern buffers, facilities included', () => {
  let state = popState({
    waterState: {
      cisterns: new Map([
        [
          'c1',
          { buildingId: 'c1', buildingName: 'Cistern', roofAreaM2: 100, capacity: 250, currentWater: 100, efficiency: 1 },
        ],
      ]),
      totalCapacity: 250,
      totalStored: 100,
      shortageDays: 0,
    },
  });

  // One in-game day: 10 citizens × 1.5 L = 15 L drawn from the buffer.
  const r = tickMoraleAndGrowthSimulation(state, weather('clear'), DAY, 1, 1);
  let rec = r.newState.waterState!.cisterns.get('c1')!;
  assert.ok(Math.abs(rec.currentWater - 85) < 0.01, `pop drinking drains the buffer to 85 (${Math.round(rec.currentWater)})`);
  assert.equal(r.newState.waterState!.totalStored, rec.currentWater, 'reserve total follows the drain');
  assert.equal(r.newState.waterState!.shortageDays, 0, 'no shortage while the buffer covers demand');

  // Add an operational 8-bed medbay → demand = 15 + 8×3 = 39 L for the day.
  const withMed = popState({
    ...r.newState,
    adaptedBuildings: (() => {
      const m = new Map(r.newState.adaptedBuildings);
      m.set('mb', {
        buildingId: 'mb',
        typeId: 'medbay',
        constructionStatus: 'completed',
        currentDurability: 100,
        isUnderRepair: false,
        maxCapacity: 8,
      } as never);
      return m;
    })(),
  });
  const r2 = tickMoraleAndGrowthSimulation(withMed, weather('clear'), DAY, 1, 1);
  rec = r2.newState.waterState!.cisterns.get('c1')!;
  assert.ok(Math.abs(rec.currentWater - (85 - 39)) < 0.01, `facility draw flows through the same demand model (${Math.round(rec.currentWater)})`);
});

test('the morale tick no longer produces rain water itself — roof catchment is waterService-only', () => {
  // Rain is active and weather reports it, but with no cistern records a
  // morale tick alone must add NOTHING (legacy code added a flat +6 L/day).
  const state = popState({ waterState: createEmptyWaterState() });
  const rain = { currentWeather: 'rain', rainwaterCollectionActive: true } as unknown as WeatherState;
  const r = tickMoraleAndGrowthSimulation(state, rain, DAY, 1, 1);
  assert.equal(r.newState.stockpile.water.rainwater, 0, 'no free rain bonus inside morale');
  assert.equal(r.newState.stockpile.water.purified_water, 0);
  assert.equal(r.newState.stockpile.water.bottled_water, 0);
});

test('Survival Permaculture water production flows through waterService after the daily draw', () => {
  const state = popState({
    waterState: createEmptyWaterState(),
    research: { unlockedNodes: ['survival_permaculture'], activeResearchId: null, activeProgressSec: 0 },
  });
  // Demand 15 L cannot be met (no store, no cisterns) → shortage recorded,
  // then the +20 L/day permaculture passive lands in the purified bucket.
  const r = tickMoraleAndGrowthSimulation(state, weather('clear'), DAY, 1, 1);
  assert.ok(
    Math.abs(r.newState.stockpile.water.purified_water - 20) < 0.01,
    `permaculture adds +20 purified L/day (${Math.round(r.newState.stockpile.water.purified_water)})`
  );
  assert.equal(r.newState.waterState!.shortageDays, 1, 'unmet daily draw recorded as a shortage day');
});

test('an actual unmet water draw fires the Dehydration Crisis morale factor and halts growth', () => {
  // 10 citizens, empty store, no cisterns → the daily 15 L draw cannot be met.
  const state = popState({
    waterState: createEmptyWaterState(),
    stockpile: {
      ...popState().stockpile,
      food: { ...popState().stockpile.food, dried_rations: 60 },
      water: { rainwater: 0, purified_water: 0, bottled_water: 0 },
    },
  });
  const r = tickMoraleAndGrowthSimulation(state, weather('clear'), DAY, 1, 1);
  const morale = r.newState.morale!;

  const crisis = morale.factors.find((f) => f.id === 'water_depleted');
  assert.ok(crisis, 'the real shortage adds a Dehydration Crisis factor');
  assert.equal(crisis!.statusType, 'critical', 'an unmet draw is critical, not a forecast');
  assert.equal(morale.passiveGrowth.isGrowing, false, 'growth halts while the colony goes without water');
  assert.match(
    morale.passiveGrowth.blockReason || '',
    /water/i,
    `halt reason names the water shortage (got: ${morale.passiveGrowth.blockReason})`
  );
  assert.equal(r.newState.waterState!.shortageDays, 1, 'shortage recorded by the authoritative water pass');
});

test('a covered water draw stays clean — no depletion factor while the cistern reserve holds', () => {
  // 100 L cistern buffer covers the 10-pop × 15 L draw with room to spare.
  const state = popState({
    waterState: {
      cisterns: new Map([
        [
          'c1',
          { buildingId: 'c1', buildingName: 'Cistern', roofAreaM2: 100, capacity: 250, currentWater: 100, efficiency: 1 },
        ],
      ]),
      totalCapacity: 250,
      totalStored: 100,
      shortageDays: 0,
    },
    stockpile: {
      ...popState().stockpile,
      food: { ...popState().stockpile.food, dried_rations: 60 },
      water: { rainwater: 0, purified_water: 0, bottled_water: 0 },
    },
  });
  const r = tickMoraleAndGrowthSimulation(state, weather('clear'), DAY, 1, 1);
  const morale = r.newState.morale!;
  assert.equal(
    morale.factors.some((f) => f.id === 'water_depleted'),
    false,
    'no dehydration factor while the buffer covers the draw'
  );
  assert.equal(r.newState.waterState!.shortageDays, 0, 'no shortage recorded');
});