import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState } from '../src/services/settlementService';
import { simulateSettlementOffline } from '../src/services/offlineSettlementService';
import { advanceGameClock } from '../src/services/combatService';
import type { SettlementState } from '../src/types/settlement';
import type { GameClockState } from '../src/types/combat';
import type { MapData } from '../src/types/map';

// Same phase windows as advanceGameClock (§6.1): 5-7 dawn, 7-19 day,
// 19-21 dusk, 21-5 night. (advanceGameClock itself only rolls one day per
// call, so multi-day seeds are built directly.)
function makeClock(day: number, hour: number): GameClockState {
  let phase: GameClockState['phase'] = 'night';
  let isNight = true;
  if (hour >= 5 && hour < 7) {
    phase = 'dawn';
    isNight = false;
  } else if (hour >= 7 && hour < 19) {
    phase = 'day';
    isNight = false;
  } else if (hour >= 19 && hour < 21) {
    phase = 'dusk';
    isNight = false;
  }
  return {
    day, hour, minute: 0, speed: 1, phase, isNight,
    hordeWaveIntensity: Math.min(10, Math.floor(day * 1.5)),
    totalElapsedSeconds: 0,
  } as GameClockState;
}

function makeMedbayState(): SettlementState {
  const base = createInitialSettlementState('Offline Colony');
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
  state.stockpile.medical.sterile_bandages = 100;
  return state;
}

test('offline colonies advance the clock through night — no permanent noon', () => {
  // Live universal clock is now 02:00 on day 41 (night). The colony was last
  // simulated 400 real seconds ago = 16 in-game hours, i.e. 10:00 on day 40.
  // The catch-up must simulate that whole span — crossing the day boundary and
  // ending synchronised with the live clock, deep in the night.
  const sim = simulateSettlementOffline(
    makeMedbayState(),
    400,
    41,
    undefined,
    makeClock(41, 2)
  );
  assert.equal(sim.clock!.day, 41, 'the in-game day advances through the span');
  assert.ok(Math.abs(sim.clock!.hour - 2) < 0.001, `ends at ~02:00, got ${sim.clock!.hour}`);
  assert.equal(sim.clock!.isNight, true, 'colony genuinely reaches night');
  assert.equal(sim.clock!.phase, 'night', 'phase reflects night');

  // A colony caught up at dawn lands in the dawn phase, not permanent noon.
  const dawn = simulateSettlementOffline(makeMedbayState(), 300, 41, undefined, makeClock(41, 7));
  assert.equal(dawn.clock!.day, 41, 'clock stays on the live day');
  assert.ok(Math.abs(dawn.clock!.hour - 7) < 0.001, `ends at ~07:00 dawn, got ${dawn.clock!.hour}`);
  assert.equal(dawn.clock!.isNight, false, 'dawn is not night');
  assert.equal(dawn.clock!.phase, 'dawn', 'phase reflects dawn');
});

test('night truly reaches the offline economy: medbay production halts after dusk', () => {
  const baseKits = makeMedbayState().stockpile.medical.first_aid_kits;

  // 4 in-game hours entirely during the day (10:00 → 14:00): the staffed
  // medbay manufactures first-aid kits the whole span.
  const daySpan = simulateSettlementOffline(makeMedbayState(), 100, 50, undefined, makeClock(50, 10));
  assert.equal(daySpan.clock!.isNight, false, 'day span stays in day');
  const dayKits = daySpan.state.stockpile.medical.first_aid_kits;
  assert.ok(dayKits > baseKits, `day medbay produces kits (${baseKits} -> ${dayKits})`);

  // 4 in-game hours entirely during the night (23:00 → 03:00): production is
  // paused — the night steps must genuinely reach the economy as isNight.
  const nightSpan = simulateSettlementOffline(makeMedbayState(), 100, 50, undefined, makeClock(50, 23));
  assert.equal(nightSpan.clock!.isNight, true, 'night span stays in night');
  assert.equal(
    nightSpan.state.stockpile.medical.first_aid_kits,
    baseKits,
    'night medbay produces nothing — economy sees isNight'
  );
});

test('the offline clock is continuous across the 60s catch-up cadence', () => {
  // Colony last simulated at 05:00 on day 60. One 240s catch-up against the
  // universal clock 240s later…
  const lastSeen = makeClock(60, 5);
  const at120 = advanceGameClock(lastSeen, 120).newClock;
  const at240 = advanceGameClock(at120, 120).newClock;
  const single = simulateSettlementOffline(makeMedbayState(), 240, 60, undefined, at240);

  // …equals two back-to-back 120s catch-ups (the real cadence of the 60s
  // registry interval): each resumes from the colony's previous end time.
  const first = simulateSettlementOffline(makeMedbayState(), 120, 60, undefined, at120);
  const second = simulateSettlementOffline(first.state, 120, 60, undefined, at240);

  assert.equal(second.clock!.day, single.clock!.day, 'same end day');
  assert.ok(Math.abs(second.clock!.hour - single.clock!.hour) < 0.01, 'same end hour');
  assert.equal(second.clock!.isNight, single.clock!.isNight, 'same night state');
  assert.equal(
    second.state.stockpile.medical.first_aid_kits,
    single.state.stockpile.medical.first_aid_kits,
    'identical production across segmented catch-ups'
  );
});

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

test('the full pipeline path (cached map) also respects offline night', () => {
  const baseKits = makeMedbayState().stockpile.medical.first_aid_kits;
  const map = makeMap();

  const daySpan = simulateSettlementOffline(makeMedbayState(), 100, 50, map, makeClock(50, 10));
  assert.ok(
    daySpan.state.stockpile.medical.first_aid_kits > baseKits,
    `day pipeline run produces kits (${baseKits} -> ${daySpan.state.stockpile.medical.first_aid_kits})`
  );
  const nightSpan = simulateSettlementOffline(makeMedbayState(), 100, 50, map, makeClock(50, 23));
  assert.equal(
    nightSpan.state.stockpile.medical.first_aid_kits,
    baseKits,
    'night pipeline run produces nothing'
  );
  assert.equal(nightSpan.clock!.isNight, true, 'pipeline path clock reaches night');
});

// ============================================================
// Offline water parity — the catch-up must consume the SAME
// facility-inclusive demand model as live play (calculateWaterDemand),
// or a long-away player would come back to a falsely damp colony.
// ============================================================

/** 10 citizens + an 8-bed medbay ⇒ 15 (pop) + 24 (medbay) = 39 L/day demand. */
function makeThirstyColony(waterL: number): SettlementState {
  const base = createInitialSettlementState('Offline Colony');
  const medbay = {
    buildingId: 'med_1',
    typeId: 'medbay' as const,
    isHQ: false,
    name: 'Medbay',
    category: 'utility' as const,
    adaptedAt: 0,
    footprintAreaM2: 120,
    adaptedAreaM2: 120,
    adaptationPercentage: 100,
    totalFloorAreaM2: 120,
    volumeM3: 360,
    maxCapacity: 8,
    currentUsage: 0,
    capacityUnit: 'beds' as const,
    maxDurability: 420,
    currentDurability: 420,
    defenseRating: 40,
    isFreestanding: false,
    position: { x: 0, z: 0 },
    height: 3,
    levels: 1,
    constructionStatus: 'completed' as const,
    constructionProgress: 100,
    constructionWorkRequired: 100,
    constructionWorkDone: 100,
    assignedWorkers: 2,
  };
  return {
    ...base,
    namedSurvivors: [],
    generalPopulation: { total: 10, unassigned: 10, inSquads: 0, children: [] },
    adaptedBuildings: new Map([[medbay.buildingId, medbay as any]]),
    stockpile: {
      ...base.stockpile,
      water: { rainwater: 0, purified_water: 0, bottled_water: waterL },
      food: { ...base.stockpile.food, dried_rations: 200 },
    },
    waterState: { cisterns: new Map(), totalCapacity: 0, totalStored: 0, shortageDays: 0 } as any,
  } as unknown as SettlementState;
}

test('offline half-day consumption matches the FACILITY-INCLUSIVE demand exactly (not pop-only)', () => {
  // Half an in-game day (300 real seconds). Facility-inclusive draw = 39 × 0.5
  // = 19.5 L. A pop-only path would only take 7.5 L — the mismatch detector.
  const sim = simulateSettlementOffline(makeThirstyColony(30), 300, 1, undefined, makeClock(1, 12));
  const remaining = sim.state.stockpile.water.bottled_water;
  assert.ok(
    Math.abs(remaining - (30 - 19.5)) < 0.6,
    `offline consumed the medbay-inclusive draw (30 L → ${Math.round(remaining * 10) / 10} L; pop-only would leave ~22.5)`
  );
  assert.equal(sim.state.waterState!.shortageDays, 0, 'no false shortage while the store still covers');
});

test('a long-away colony runs dry with the medbay on the books — real shortage, not a damp pop-only residue', () => {
  // One in-game day (600 real seconds) needs 39 L inclusive vs 15 L pop-only.
  // Seeding 25 L means a pop-only offline model would return with 10 L left;
  // the authoritative model drains it and registers a genuine shortage.
  const sim = simulateSettlementOffline(makeThirstyColony(25), 600, 1, undefined, makeClock(1, 12));
  const state = sim.state;
  assert.equal(state.stockpile.water.bottled_water, 0, 'store fully drained by the facility-inclusive draw');
  assert.ok((state.waterState?.shortageDays || 0) > 0, 'an actual unmet draw was recorded offline');
  const morale = state.morale as any;
  assert.ok(
    (morale?.factors || []).some((f: any) => f.id === 'water_depleted'),
    'the returning player sees the Dehydration Crisis factor'
  );
});

test('offline colonies with no facilities drain only the population share (same model, fewer consumers)', () => {
  // No medbay → 10 pop × 1.5 = 15 L/day. A full day from 20 L leaves exactly 5.
  const base = createInitialSettlementState('Offline Colony');
  const plain = {
    ...base,
    namedSurvivors: [],
    generalPopulation: { total: 10, unassigned: 10, inSquads: 0, children: [] },
    adaptedBuildings: new Map(),
    stockpile: {
      ...base.stockpile,
      water: { rainwater: 0, purified_water: 0, bottled_water: 20 },
      food: { ...base.stockpile.food, dried_rations: 200 },
    },
    waterState: { cisterns: new Map(), totalCapacity: 0, totalStored: 0, shortageDays: 0 } as any,
  } as unknown as SettlementState;
  const sim = simulateSettlementOffline(plain, 600, 1, undefined, makeClock(1, 12));
  assert.ok(
    Math.abs(sim.state.stockpile.water.bottled_water - 5) < 0.5,
    `facility-free colony consumes exactly the population share (20 L → ${Math.round(sim.state.stockpile.water.bottled_water * 10) / 10} L)`
  );
  assert.equal(sim.state.waterState!.shortageDays, 0, 'no shortage for a covered colony');
});
