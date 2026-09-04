import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMissionRewards,
  bindMissionTasks,
  evaluateMissionCondition,
  evaluateTask,
  getInitialMissionState,
  getRegisteredMissionDefinitions,
  getRegisteredTransmissionDefinitions,
  handleTransmissionResponse,
  reconcileMissionSnapshot,
  readResource,
  registerMissionDefinitions,
  registerTransmissionDefinitions,
  updateMissionSystem,
  MissionSystemResult,
} from '../src/services/missionService';
import { registerAllContent, validateContentRegistry } from '../src/services/missionRegistry';
import {
  buildTransmission,
  enqueueTransmission,
  getIncomingQueue,
  markTransmissionRead,
} from '../src/services/transmissionService';
import { emitGameEvent, resetGameEventBus, getLatestEventId } from '../src/services/eventBus';
import type { GameClockState } from '../src/types/combat';
import type { RadioDirectiveState } from '../src/types/radioDirective';
import type { SettlementState } from '../src/types/settlement';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function clock(day: number, hour = 8): GameClockState {
  return {
    day,
    hour,
    minute: 0,
    speed: 1,
    phase: 'day',
    isNight: false,
    hordeWaveIntensity: 1,
    totalElapsedSeconds: (day - 1) * 86400 + hour * 3600,
  };
}

function stockpile(over: Record<string, number> = {}) {
  return {
    water: { rainwater: 0, purified_water: 0, bottled_water: 0 },
    food: { fresh_harvest: 0, dried_rations: 0, canned_goods: 0, mre_rations: 0, grain: 0, raw_meat: 0 },
    medical: { first_aid_kits: 0, sterile_bandages: 0, antibiotics: 0, painkillers: 0 },
    ammo: { sharedPool: 0, crates: 0 },
    fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
    materials: { wood: 0, metal: 0, bricks: 0, tools: 0, fertilizer: 0, scientific_materials: 0, logs: 0, scrap: 0 },
    ...over,
  } as any;
}

function mkSettlement(over: Partial<SettlementState> = {}): SettlementState {
  return {
    id: 'settlement_alpha',
    name: 'Alpha',
    stockpile: stockpile(),
    research: { unlockedNodes: [], activeResearchId: null, activeProgressSec: 0 },
    squads: [],
    adaptedBuildings: new Map(),
    freestandingBuildings: [],
    hiddenGroups: new Map(),
    buildingSearches: new Map(),
    zombieLairs: new Map(),
    generalPopulation: { total: 8 } as any,
    namedSurvivors: [],
    ...over,
  } as unknown as SettlementState;
}

/** Operational primary HQ (getPrimaryHQ reads state.headquarters + primaryHQId). */
function mkHQ(over: Partial<SettlementState> = {}): SettlementState {
  const s = mkSettlement();
  (s as any).headquarters = [
    {
      buildingId: '1',
      name: 'HQ',
      typeId: 'headquarters',
      type: 'headquarters',
      isPrimary: true,
      operational: true,
      constructionStatus: 'completed',
      footprintAreaM2: 400,
      currentDurability: 100,
    },
  ];
  (s as any).primaryHQId = '1';
  (s as any).adaptedBuildings = new Map([
    ['1', { buildingId: '1', typeId: 'headquarters', type: 'headquarters', constructionStatus: 'completed' }],
  ]);
  return { ...s, ...over } as unknown as SettlementState;
}

function radioState(): RadioDirectiveState {
  return {
    activeDirectives: [],
    completedDirectiveIds: [],
    transmissionLog: [],
    unreadCount: 0,
    currentIncomingTransmission: null,
    incomingQueue: [],
  };
}

function findTx(result: MissionSystemResult, id: string) {
  return result.newTransmissions.find((t) => t.id === id);
}

// Register all authored + dynamic content once for the whole file.
registerAllContent();

// ---------------------------------------------------------------------------
// 1. Content registry integrity
// ---------------------------------------------------------------------------

test('content registry: all missions + transmissions register without validation errors', () => {
  const errors = validateContentRegistry();
  assert.deepEqual(errors, [], `registry errors: ${errors.join('; ')}`);
  assert.ok(getRegisteredMissionDefinitions().length >= 20, 'expected ~20+ authored missions');
  assert.ok(getRegisteredTransmissionDefinitions().length >= 20);
});

test('content registry: no duplicate mission or transmission ids', () => {
  const all = getRegisteredMissionDefinitions();
  const ids = all.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  const txs = getRegisteredTransmissionDefinitions();
  const txIds = txs.map((t) => t.id);
  assert.equal(new Set(txIds).size, txIds.length);
});

// ---------------------------------------------------------------------------
// 2. TRIGGER → TRANSMISSION (never a silent mission)
// ---------------------------------------------------------------------------

test('trigger queues a briefing transmission and never creates a mission directly', () => {
  // Mission waterline requires hq_established + day >= 3.
  const hq = mkHQ();

  const result1 = updateMissionSystem(getInitialMissionState(), hq, clock(3), {});
  // Day 1: no trigger yet.
  const early = updateMissionSystem(getInitialMissionState(), hq, clock(1), {});
  assert.equal(early.newTransmissions.length, 0);
  assert.equal(early.newState.activeMissions.length, 0);
  assert.equal(early.newState.pendingMissions.length, 0);

  // Day 3 with HQ: briefing transmission queued, NO active mission yet.
  assert.ok(
    result1.newTransmissions.some((t) => t.missionId === 'mission_waterline'),
    'briefing transmission expected'
  );
  assert.equal(result1.newState.activeMissions.length, 0, 'mission must NOT be auto-created');
  assert.equal(result1.newState.pendingMissions.length, 1);
});

test('a mission is created only after the player responds to its briefing', () => {
  const settlement = mkHQ();
  const base = getInitialMissionState();
  const result = updateMissionSystem(base, settlement, clock(3), {});
  const tx = findTx(result, 'tx_c1_waterline');
  assert.ok(tx, 'briefing tx exists');

  const responded = handleTransmissionResponse(
    result.newState,
    tx!,
    'accept',
    settlement,
    clock(3)
  );
  const mission = responded.newState.activeMissions.find((m) => m.definitionId === 'mission_waterline');
  assert.ok(mission, 'accepting the briefing creates the mission');
  assert.equal(responded.newState.pendingMissions.length, 0);
  assert.ok(responded.newState.startedMissionIds.includes('mission_waterline'));
  assert.equal(mission!.tasks.length, 4);
});

// ---------------------------------------------------------------------------
// 3. Dedupe
// ---------------------------------------------------------------------------

test('triggered missions never re-fire on subsequent simulation ticks', () => {
  const settlement = mkHQ();
  let state = getInitialMissionState();
  const r1 = updateMissionSystem(state, settlement, clock(3), {});
  assert.ok(findTx(r1, 'tx_c1_waterline'), 'waterline briefs on day 3');
  state = r1.newState;

  // Later days legitimately unlock OTHER missions (day-gated content), but the
  // already-triggered mission must never be re-briefed while pending.
  for (let i = 1; i <= 5; i++) {
    const again = updateMissionSystem(state, settlement, clock(3 + i), {});
    assert.ok(
      again.newTransmissions.every((t) => t.missionId !== 'mission_waterline'),
      `tick day ${3 + i}: waterline must not re-queue`
    );
    assert.equal(
      again.newState.pendingMissions.filter((m) => m.definitionId === 'mission_waterline').length,
      1,
      'waterline stays pending exactly once'
    );
    state = again.newState;
  }
});

test('event triggers fire once per event (lair discovered)', () => {
  const lair = {
    id: 'lair_1',
    buildingId: 'b1',
    buildingName: 'Warehouse',
    isDiscovered: false,
    isCleared: false,
    population: 30,
    baselinePopulation: 30,
    garrisonCeiling: 30,
    emergenceCapacity: 8,
  };

  let state = getInitialMissionState();

  // Seed the snapshot at day 4 (no lair discovered).
  const seeded = mkHQ();
  (seeded as any).zombieLairs = new Map([['lair_1', { ...lair, isDiscovered: false }]]);
  state = reconcileMissionSnapshot(state, seeded, clock(4), {});

  // Discover the lair on day 5 → nest mission briefs.
  const discovered = mkHQ();
  (discovered as any).zombieLairs = new Map([['lair_1', { ...lair, isDiscovered: true }]]);
  const r1 = updateMissionSystem(state, discovered, clock(5), {});
  assert.ok(r1.newTransmissions.some((t) => t.missionId === 'mission_nest'));
  state = r1.newState;

  // Same discovered lair state on later ticks → the lair EVENT never re-fires
  // (other day-gated content may still legitimately unlock).
  const r2 = updateMissionSystem(state, discovered, clock(6), {});
  assert.ok(
    r2.newTransmissions.every(
      (t) => t.missionId !== 'mission_nest' && t.missionId !== 'mission_dyn_lair'
    ),
    'lair event triggers must not re-fire for an unchanged lair'
  );
});

// ---------------------------------------------------------------------------
// 4. Responses: decline + branch
// ---------------------------------------------------------------------------

test('declining a briefing removes the pending mission and records the decline', () => {
  const settlement = mkHQ();
  const result = updateMissionSystem(getInitialMissionState(), settlement, clock(3), {});
  const tx = findTx(result, 'tx_c1_waterline')!;
  const declined = handleTransmissionResponse(result.newState, tx, 'decline', settlement, clock(3));
  assert.equal(declined.newState.pendingMissions.length, 0);
  assert.equal(declined.newState.activeMissions.length, 0);
  assert.ok(declined.newState.declinedMissionIds.includes('mission_waterline'));
});

test('branching response creates the selected branch mission (Strangers)', () => {
  const settlement = mkHQ({ generalPopulation: { total: 16 } as any });
  // Strangers requires population >= 15 and day >= 14.
  const result = updateMissionSystem(getInitialMissionState(), settlement, clock(14), {});
  const tx = findTx(result, 'tx_c4_strangers');
  assert.ok(tx, 'strangers briefing expected on day 14');

  const branched = handleTransmissionResponse(
    result.newState,
    tx!,
    'branch:mission_strangers_help',
    settlement,
    clock(14)
  );
  assert.ok(
    branched.newState.activeMissions.some((m) => m.definitionId === 'mission_strangers_help'),
    'branch mission created'
  );
  assert.equal(
    branched.newState.pendingMissions.filter((m) => m.definitionId === 'mission_strangers').length,
    0,
    'strangers shell removed from pending'
  );
  assert.ok(branched.newState.startedMissionIds.includes('mission_strangers_help'));
});

test('mission completion applies rewards + sets completion narrative flags', () => {
  const settlement = mkSettlement();
  // 25+ population triggers mission_morethan; its reward sets community_established.
  settlement.generalPopulation = { total: 26 } as any;
  const stateWithPrereqs = {
    ...getInitialMissionState(),
    completedMissionIds: ['mission_makingdo'],
  };
  const result = updateMissionSystem(stateWithPrereqs, settlement, clock(5), {});
  const tx = findTx(result, 'tx_c4_morethan');
  assert.ok(tx, 'morethan briefing expected at pop 26');
  const started = handleTransmissionResponse(result.newState, tx!, 'accept', settlement, clock(5));
  let state = started.newState;

  // Push population to 30 + canned goods to 30 → mission completes.
  const grown = mkSettlement();
  grown.generalPopulation = { total: 30 } as any;
  (grown as any).stockpile = stockpile({ food: { ...stockpile().food, canned_goods: 30 } });
  const tick = updateMissionSystem(state, grown, clock(5), {});
  assert.ok(tick.newState.completedMissionIds.includes('mission_morethan'));
  assert.equal(tick.newState.narrativeFlags.community_established, true);
  assert.ok(tick.newTransmissions.some((t) => t.id === 'tx_c4_morethan_done'));
});

// ---------------------------------------------------------------------------
// 5. Task evaluation derives from REAL game state
// ---------------------------------------------------------------------------

test('task types complete against authoritative state', () => {
  const settlement = mkSettlement();

  // research_technology
  let t = { id: 't1', type: 'research_technology', title: 'r', status: 'pending', current: 0, target: 1, researchId: 'basic_sanitation' } as any;
  assert.equal(evaluateTask(t, settlement, clock(1), {}).complete, false);
  settlement.research = { unlockedNodes: ['basic_sanitation'], activeResearchId: null, activeProgressSec: 0 };
  assert.equal(evaluateTask(t, settlement, clock(1), {}).complete, true);

  // build_facility
  t = { id: 't2', type: 'build_facility', title: 'b', status: 'pending', current: 0, target: 1, buildingType: 'water_cistern' } as any;
  assert.equal(evaluateTask(t, settlement, clock(1), {}).complete, false);
  settlement.freestandingBuildings = [{ typeId: 'water_cistern', type: 'water_cistern', constructionStatus: 'completed' } as any];
  assert.equal(evaluateTask(t, settlement, clock(1), {}).complete, true);

  // maintain_resource
  t = { id: 't3', type: 'maintain_resource', title: 'm', status: 'pending', current: 0, target: 30, resourceType: 'rainwater' } as any;
  (settlement as any).stockpile = stockpile({ water: { ...stockpile().water, rainwater: 30 } });
  const ev = evaluateTask(t, settlement, clock(1), {});
  assert.equal(ev.complete, true);
  assert.equal(ev.current, 30);

  // reach_population
  t = { id: 't4', type: 'reach_population', title: 'p', status: 'pending', current: 0, target: 30 } as any;
  const s2 = mkSettlement({ generalPopulation: { total: 25 } as any });
  assert.equal(evaluateTask(t, s2, clock(1), {}).complete, false);
  const s3 = mkSettlement({ generalPopulation: { total: 31 } as any });
  assert.equal(evaluateTask(t, s3, clock(1), {}).complete, true);

  // form_squad + establish_hq
  t = { id: 't5', type: 'form_squad', title: 's', status: 'pending', current: 0, target: 1 } as any;
  assert.equal(evaluateTask(t, settlement, clock(1), {}).complete, false);
  settlement.squads = [{ id: 'sq1' } as any];
  assert.equal(evaluateTask(t, settlement, clock(1), {}).complete, true);
});

test('bound lair tasks complete when the real lair is cleared', () => {
  const settlement = mkSettlement();
  const lair = {
    id: 'lair_1', buildingId: 'b1', buildingName: 'Warehouse', isDiscovered: true,
    isCleared: false, population: 30, baselinePopulation: 30, garrisonCeiling: 30, emergenceCapacity: 8,
  };
  (settlement as any).zombieLairs = new Map([['lair_1', lair]]);

  // clear_lair bound by id
  let t = { id: 'c1', type: 'clear_lair', title: 'clear', status: 'pending', current: 0, target: 1, boundTargetId: 'lair_1' } as any;
  assert.equal(evaluateTask(t, settlement, clock(1), {}).complete, false);
  (settlement as any).zombieLairs = new Map([['lair_1', { ...lair, isCleared: true, population: 0 }]]);
  assert.equal(evaluateTask(t, settlement, clock(1), {}).complete, true);

  // eliminate_infected counts the REAL colony-wide kill tally since mission
  // start (lifetimeStats.infectedKills delta) — not lair population math.
  (settlement as any).lifetimeStats = { infectedKills: 5, squadsFormed: 0, buildingsAdapted: 0, buildingsConstructed: 0, survivorsRecruited: 0, researchCompleted: 0 };
  t = { id: 'c2', type: 'eliminate_infected', title: 'kill', status: 'pending', current: 0, target: 10, _startInfectedKills: 2 } as any;
  let ev = evaluateTask(t, settlement, clock(1), {});
  assert.equal(ev.current, 3, '3 kills since mission start');
  assert.equal(ev.complete, false);
  (settlement as any).lifetimeStats = { infectedKills: 12, squadsFormed: 0, buildingsAdapted: 0, buildingsConstructed: 0, survivorsRecruited: 0, researchCompleted: 0 };
  assert.equal(evaluateTask(t, settlement, clock(1), {}).complete, true, '12 − 2 = 10 kills completes');
});

test('travel_to_location vs scavenge_building semantics: reaching is not searching', () => {
  const settlement = mkSettlement();
  const travelTask = {
    id: 'travel',
    type: 'travel_to_location',
    title: 'reach',
    status: 'active',
    current: 0,
    target: 1,
    boundTargetId: 'b_hospital_1',
    startEventId: 0,
  } as any;
  const scavengeTask = {
    id: 'scav',
    type: 'scavenge_building',
    title: 'search',
    status: 'active',
    current: 0,
    target: 1,
    boundTargetId: 'b_hospital_1',
    startEventId: 0,
  } as any;

  // Searching a building does NOT complete travel_to_location
  (settlement as any).buildingSearches = new Map([['b_hospital_1', { searched: true }]]);
  assert.equal(evaluateTask(travelTask, settlement, clock(1), {}).complete, false, 'searching is not reaching');
  assert.equal(evaluateTask(scavengeTask, settlement, clock(1), {}).complete, true, 'searching satisfies scavenge_building');

  // LOCATION_REACHED event satisfies travel_to_location
  resetGameEventBus();
  emitGameEvent('LOCATION_REACHED', { squadId: 'sq1', buildingId: 'b_hospital_1' });
  assert.equal(evaluateTask(travelTask, settlement, clock(1), {}).complete, true, 'LOCATION_REACHED completes travel_to_location');
});

test('deliver_resources requires correct destination, cargo, quantity, and dispatch time', () => {
  const settlement = mkSettlement();
  const task = {
    id: 'd',
    type: 'deliver_resources',
    title: 'deliver',
    status: 'active',
    current: 0,
    target: 10,
    resourceType: 'food',
    destinationSettlementId: 'settlement_beta',
    startEventId: 0,
    _startDay: 2,
  } as any;

  // Old caravan dispatched on Day 1 does not satisfy Day 2 mission
  const oldCaravan = {
    id: 'car_old',
    status: 'arrived',
    dispatchDay: 1,
    destinationSettlementId: 'settlement_beta',
    cargo: { food: 50 },
  };
  assert.equal(evaluateTask(task, settlement, clock(2), { caravans: [oldCaravan] as any }).complete, false, 'old caravan before start must not satisfy');

  // Caravan going to wrong destination does not satisfy
  const wrongDest = {
    id: 'car_wrong_dest',
    status: 'arrived',
    dispatchDay: 2,
    destinationSettlementId: 'settlement_gamma',
    cargo: { food: 50 },
  };
  assert.equal(evaluateTask(task, settlement, clock(2), { caravans: [wrongDest] as any }).complete, false, 'wrong destination must not satisfy');

  // Caravan carrying wrong cargo (wood instead of food) does not satisfy
  const wrongCargo = {
    id: 'car_wrong_cargo',
    status: 'arrived',
    dispatchDay: 2,
    destinationSettlementId: 'settlement_beta',
    cargo: { wood: 50 },
  };
  assert.equal(evaluateTask(task, settlement, clock(2), { caravans: [wrongCargo] as any }).complete, false, 'wrong cargo must not satisfy');

  // Caravan carrying insufficient quantity (5 < 10) does not satisfy
  const insufficientCargo = {
    id: 'car_short',
    status: 'arrived',
    dispatchDay: 2,
    destinationSettlementId: 'settlement_beta',
    cargo: { food: 5 },
  };
  assert.equal(evaluateTask(task, settlement, clock(2), { caravans: [insufficientCargo] as any }).complete, false, 'insufficient quantity must not satisfy');

  // Correct caravan arrives via CARAVAN_ARRIVED event
  resetGameEventBus();
  emitGameEvent('CARAVAN_ARRIVED', {
    caravanId: 'car_valid',
    originSettlementId: 'settlement_alpha',
    destinationSettlementId: 'settlement_beta',
    cargo: { food: 20 },
  });
  assert.equal(evaluateTask(task, settlement, clock(2), {}).complete, true, 'valid caravan arrival completes delivery');
});

test('contact_faction requires authoritative contact event or state, never settlement count', () => {
  const settlement = mkSettlement();
  const net = { settlements: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] };
  const task = {
    id: 'f',
    type: 'contact_faction',
    title: 'contact',
    status: 'active',
    current: 0,
    target: 1,
    factionId: 'gravel_bend',
    startEventId: 0,
  } as any;

  // Having multiple settlements does NOT complete faction contact
  assert.equal(evaluateTask(task, settlement, clock(1), net as any).complete, false, 'settlement count does not imply faction contact');

  // Contacting unrelated faction does not satisfy
  resetGameEventBus();
  emitGameEvent('FACTION_CONTACTED', { factionId: 'iron_vultures' });
  assert.equal(evaluateTask(task, settlement, clock(1), {}).complete, false, 'unrelated faction does not satisfy');

  // Authoritative FACTION_CONTACTED event completes the task
  emitGameEvent('FACTION_CONTACTED', { factionId: 'gravel_bend' });
  assert.equal(evaluateTask(task, settlement, clock(1), {}).complete, true, 'matching FACTION_CONTACTED completes contact');
});

test('establish_settlement evaluates real settlement count', () => {
  const settlement = mkSettlement();
  const net1 = { settlements: [{ id: 'a', name: 'A' }] };
  const net2 = { settlements: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] };
  const task = { id: 'e', type: 'establish_settlement', title: 'establish', status: 'pending', current: 0, target: 2 } as any;

  assert.equal(evaluateTask(task, settlement, clock(1), net1 as any).complete, false);
  assert.equal(evaluateTask(task, settlement, clock(1), net2 as any).complete, true);
});

test('survive_duration evaluates elapsed game time (works across offline catch-up)', () => {
  // Mission starts day 3 → survive 48h. Loading on day 5 must complete it.
  const settlement = mkSettlement();
  const state = getInitialMissionState();
  // Manually build a survive_duration-only mission through the engine using a
  // registered content mission won't isolate the mechanic, so test the task:
  const t = { id: 'sd', type: 'survive_duration', title: 'survive', status: 'pending', current: 0, target: 48, _startGameHours: 2 * 24 + 8 } as any;
  assert.equal(evaluateTask(t, settlement, clock(3, 8), {}).complete, false);
  assert.equal(evaluateTask(t, settlement, clock(5, 8), {}).complete, true, '48h elapsed after offline advance');
});

test('time-limited missions expire and queue the failure transmission', () => {
  // Register a synthetic time-limited mission for this test.
  registerTransmissionDefinitions([
    {
      id: 'tx_test_limited_brief',
      classification: 'WARNING',
      callsign: 'TEST',
      title: 'TIMED TASK',
      message: 'Complete this within 24 hours.',
      priority: 'high',
    },
    {
      id: 'tx_test_limited_fail',
      classification: 'WARNING',
      callsign: 'TEST',
      title: 'TIMED TASK FAILED',
      message: 'The window closed.',
      priority: 'high',
    },
  ]);
  registerMissionDefinitions([
    {
      id: 'mission_test_timed',
      code: 'TEST-TIMED',
      title: 'Timed Mission',
      description: 'Finish fast.',
      category: 'emergency',
      priority: 'high',
      trigger: { type: 'condition', condition: { kind: 'day', min: 1 } },
      briefingTransmissionId: 'tx_test_limited_brief',
      responseOptions: [{ label: 'GO', action: 'accept' }],
      tasks: [
        {
          id: 'timed_never',
          type: 'maintain_resource',
          title: 'Hold 1,000 Wood',
          resourceType: 'wood',
          targetCount: 1000,
        },
      ],
      failureTransmissionId: 'tx_test_limited_fail',
      timeLimitHours: 24,
    },
  ]);

  const settlement = mkSettlement();
  const result = updateMissionSystem(getInitialMissionState(), settlement, clock(1), {});
  const tx = findTx(result, 'tx_test_limited_brief')!;
  assert.ok(tx);
  const started = handleTransmissionResponse(result.newState, tx, 'accept', settlement, clock(1));
  assert.ok(started.newState.activeMissions.some((m) => m.definitionId === 'mission_test_timed'));

  // +25h later the task is still unmet → mission expires, failure tx queued.
  const later = updateMissionSystem(started.newState, settlement, clock(2, 9), {});
  assert.ok(later.newState.expiredMissionIds.includes('mission_test_timed'));
  assert.ok(later.newState.failedMissionIds.includes('mission_test_timed'));
  assert.ok(later.newTransmissions.some((t) => t.id === 'tx_test_limited_fail'));
});

// ---------------------------------------------------------------------------
// 6. Offline safety + snapshot reconcile
// ---------------------------------------------------------------------------

test('reconciled snapshot after load prevents false event triggers', () => {
  const settlement = mkHQ();
  const lair = {
    id: 'lair_1', buildingId: 'b1', buildingName: 'Warehouse', isDiscovered: true,
    isCleared: true, population: 0, baselinePopulation: 30, garrisonCeiling: 30, emergenceCapacity: 8,
  };
  (settlement as any).zombieLairs = new Map([['lair_1', lair]]);
  settlement.research = { unlockedNodes: ['triangulation', 'pistol'], activeResearchId: null, activeProgressSec: 0 };
  settlement.generalPopulation = { total: 40 } as any;
  settlement.squads = [{ id: 'sq1' } as any];

  // Simulate a save loaded at day 20 — reconciliation must prevent event
  // triggers (lair discovered/cleared) from re-firing for things that already
  // happened before the save. Condition-gated missions (day 3+, HQ established)
  // legitimately still trigger once — that is the designed catch-up behaviour.
  let state = getInitialMissionState();
  state = reconcileMissionSnapshot(state, settlement, clock(20), {});
  const after = updateMissionSystem(state, settlement, clock(20), {});
  const eventMissionIds = after.newTransmissions
    .map((t) => t.missionId)
    .filter((id) => id === 'mission_nest' || id === 'mission_dyn_lair');
  assert.equal(
    eventMissionIds.length,
    0,
    'event triggers (THE NEST / LAIR THREAT) must not re-fire for an already-handled lair'
  );
  assert.ok(after.newTransmissions.every((t) => t.id !== 'tx_c2_nest'), 'no nest briefing re-sent');
});

// ---------------------------------------------------------------------------
// 7. Rewards apply to the real stockpile
// ---------------------------------------------------------------------------

test('applyMissionRewards grants stockpile resources without a second economy', () => {
  const settlement = mkSettlement();
  const granted = applyMissionRewards(settlement, { tools: 5, first_aid_kits: 4, gasoline: 10, sharedPool: 30 });
  assert.equal(readResource(granted, 'tools'), 5);
  assert.equal(readResource(granted, 'first_aid_kits'), 4);
  assert.equal(readResource(granted, 'gasoline'), 10);
  assert.equal(readResource(granted, 'sharedPool'), 30);
});

// ---------------------------------------------------------------------------
// 8. Transmission queue primitives
// ---------------------------------------------------------------------------

test('transmission queue preserves order and supports several pending transmissions', () => {
  let radio = radioState();
  const mk = (id: string) => buildTransmission(
    { id, classification: 'INTEL', callsign: 'A', title: id, message: 'msg', priority: 'normal' },
    'DAY 01'
  );
  radio = enqueueTransmission(radio, mk('tx_1'));
  radio = enqueueTransmission(radio, mk('tx_2'));
  radio = enqueueTransmission(radio, mk('tx_3'));

  assert.equal(radio.unreadCount, 3);
  assert.deepEqual(getIncomingQueue(radio).map((t) => t.id), ['tx_1', 'tx_2', 'tx_3']);
  assert.equal(radio.currentIncomingTransmission?.id, 'tx_1', 'oldest unread first');

  // Dedupe: identical id never double-appends.
  radio = enqueueTransmission(radio, mk('tx_2'));
  assert.equal(radio.unreadCount, 3);
  assert.equal(radio.transmissionLog.filter((t) => t.id === 'tx_2').length, 1);

  // Acknowledging tx_1 advances the pointer to tx_2.
  radio = markTransmissionRead(radio, 'tx_1');
  assert.equal(radio.unreadCount, 2);
  assert.equal(radio.currentIncomingTransmission?.id, 'tx_2');
});

// ---------------------------------------------------------------------------
// 9. Conditions used by authored content
// ---------------------------------------------------------------------------

test('condition evaluator covers day/population/research/flag/resource scarcity', () => {
  const settlement = mkSettlement({ generalPopulation: { total: 20 } as any });
  const ctx = { settlements: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] } as any;
  const flags = { helped_strangers: true };

  assert.equal(evaluateMissionCondition({ kind: 'day', min: 3, max: 5 }, settlement, clock(4), ctx, flags), true);
  assert.equal(evaluateMissionCondition({ kind: 'population', min: 25 }, settlement, clock(4), ctx, flags), false);
  assert.equal(evaluateMissionCondition({ kind: 'hq_established', value: false }, settlement, clock(4), ctx, flags), true);
  assert.equal(evaluateMissionCondition({ kind: 'settlement_count', min: 2 }, settlement, clock(4), ctx, flags), true);
  assert.equal(evaluateMissionCondition({ kind: 'flag', key: 'helped_strangers' }, settlement, clock(4), ctx, flags), true);
  assert.equal(evaluateMissionCondition({ kind: 'flag', key: 'refused_strangers' }, settlement, clock(4), ctx, flags), false);
  // Scarcity trigger: below max.
  (settlement as any).stockpile = stockpile({ medical: { ...stockpile().medical, first_aid_kits: 3 } });
  assert.equal(
    evaluateMissionCondition({ kind: 'resource', resourceType: 'first_aid_kits', max: 5 }, settlement, clock(4), ctx, flags),
    true
  );
  (settlement as any).stockpile = stockpile({ medical: { ...stockpile().medical, first_aid_kits: 20 } });
  assert.equal(
    evaluateMissionCondition({ kind: 'resource', resourceType: 'first_aid_kits', max: 5 }, settlement, clock(4), ctx, flags),
    false
  );
});

test('bindMissionTasks binds building-category targets to real map buildings', () => {
  const def = getRegisteredMissionDefinitions().find((m) => m.id === 'mission_oldworld')!;
  const settlement = mkSettlement();
  const ctx = {
    mapData: {
      buildings: [
        { id: 'hosp_1', rawType: 'amenity=hospital', type: 'hospital', name: 'Central Hospital', center: { x: 10, z: 10 } },
        { id: 'shop_1', rawType: 'shop=convenience', type: 'commercial', name: 'Shop' },
      ],
    } as any,
  };
  const tasks = bindMissionTasks(def, settlement, ctx);
  const reach = tasks.find((t) => t.id === 'ow1_reach')!;
  assert.equal(reach.boundTargetId, 'hosp_1');
  assert.equal(reach.boundTargetLabel, 'Central Hospital');
  const search = tasks.find((t) => t.id === 'ow2_search')!;
  assert.equal(search.boundTargetId, 'hosp_1');
});

// ---------------------------------------------------------------------------
// 10. Strict Transmission Response Validation
// ---------------------------------------------------------------------------

test('handleTransmissionResponse strictly validates inputs and rejects invalid responses without state mutation', () => {
  const settlement = mkHQ();
  const res = updateMissionSystem(getInitialMissionState(), settlement, clock(3), {});
  const tx = findTx(res, 'tx_c1_waterline');
  assert.ok(tx);

  // 1. Invalid response action string
  const invalidResult = handleTransmissionResponse(
    res.newState,
    tx,
    'some_invalid_hack_action',
    settlement,
    clock(3)
  );
  assert.equal(invalidResult.success, false);
  assert.equal(invalidResult.newState.activeMissions.length, 0, 'no mission created on invalid response');
  assert.equal(invalidResult.newState.pendingMissions.length, res.newState.pendingMissions.length, 'pending mission remains unmutated');

  // 2. Duplicate response to already processed transmission
  const validAccept = handleTransmissionResponse(
    res.newState,
    tx,
    'accept',
    settlement,
    clock(3)
  );
  assert.equal(validAccept.success, true);
  assert.equal(validAccept.newState.activeMissions.length, 1);

  const duplicateResult = handleTransmissionResponse(
    validAccept.newState,
    tx,
    'accept',
    settlement,
    clock(3)
  );
  assert.equal(duplicateResult.success, false, 'duplicate response must be rejected');
  assert.equal(duplicateResult.newState.activeMissions.length, 1, 'no second mission created');
});

// ---------------------------------------------------------------------------
// 11. Mission-Start Baselines Isolation
// ---------------------------------------------------------------------------

test('baselines isolate action objectives: existing inventory/resources do not satisfy tasks', () => {
  // Player already has 50 scrap and 10 tools before mission
  const settlement = mkSettlement();
  (settlement as any).stockpile = stockpile({
    materials: { ...stockpile().materials, scrap: 50, tools: 10 },
  });

  resetGameEventBus();
  const startEventId = getLatestEventId();

  const scavengeTask = {
    id: 'scav_task',
    type: 'scavenge_resource',
    title: 'Scavenge 15 scrap',
    status: 'active',
    current: 0,
    target: 15,
    resourceType: 'scrap',
    startEventId,
    startProgressBaseline: 50,
  } as any;

  const manufactureTask = {
    id: 'mfg_task',
    type: 'manufacture_item',
    title: 'Manufacture 10 tools',
    status: 'active',
    current: 0,
    target: 10,
    resourceType: 'tools',
    startEventId,
    startProgressBaseline: 10,
  } as any;

  // With no new events, pre-existing 50 scrap and 10 tools must NOT complete the tasks
  assert.equal(evaluateTask(scavengeTask, settlement, clock(1), {}).complete, false, 'pre-existing scrap must not count');
  assert.equal(evaluateTask(manufactureTask, settlement, clock(1), {}).complete, false, 'pre-existing tools must not count');

  // New events after start count properly
  emitGameEvent('RESOURCE_ACQUIRED', { resourceType: 'scrap', amount: 8, source: 'scavenge' });
  assert.equal(evaluateTask(scavengeTask, settlement, clock(1), {}).complete, false, '8 < 15 not complete');

  emitGameEvent('RESOURCE_ACQUIRED', { resourceType: 'scrap', amount: 7, source: 'scavenge' });
  assert.equal(evaluateTask(scavengeTask, settlement, clock(1), {}).complete, true, '8 + 7 = 15 complete');

  // Manufacturing in batches
  emitGameEvent('ITEM_MANUFACTURED', { resourceType: 'tools', amount: 4 });
  emitGameEvent('ITEM_MANUFACTURED', { resourceType: 'tools', amount: 6 });
  assert.equal(evaluateTask(manufactureTask, settlement, clock(1), {}).complete, true, '4 + 6 = 10 complete');
});

// ---------------------------------------------------------------------------
// 12. Event Semantics: Distinct Actions
// ---------------------------------------------------------------------------

test('event semantics: discovery != rescue != recruitment', () => {
  const settlement = mkSettlement();
  resetGameEventBus();
  const startId = getLatestEventId();

  const recruitTask = {
    id: 'rec',
    type: 'recruit_survivors',
    title: 'Recruit',
    status: 'active',
    current: 0,
    target: 2,
    startEventId: startId,
  } as any;

  const rescueTask = {
    id: 'res',
    type: 'rescue_survivors',
    title: 'Rescue',
    status: 'active',
    current: 0,
    target: 2,
    startEventId: startId,
  } as any;

  // Emitting SURVIVOR_DISCOVERED does NOT satisfy recruit or rescue
  emitGameEvent('SURVIVOR_DISCOVERED', { survivorGroupId: 'grp1', count: 5 });
  assert.equal(evaluateTask(recruitTask, settlement, clock(1), {}).complete, false, 'discovery is not recruitment');
  assert.equal(evaluateTask(rescueTask, settlement, clock(1), {}).complete, false, 'discovery is not rescue');

  // Emitting SURVIVOR_RESCUED satisfies rescue only
  emitGameEvent('SURVIVOR_RESCUED', { survivorGroupId: 'grp1', count: 2 });
  assert.equal(evaluateTask(rescueTask, settlement, clock(1), {}).complete, true, 'rescue event satisfies rescueTask');
  assert.equal(evaluateTask(recruitTask, settlement, clock(1), {}).complete, false, 'rescue is not recruitment');

  // Emitting SURVIVOR_RECRUITED satisfies recruitment
  emitGameEvent('SURVIVOR_RECRUITED', { survivorGroupId: 'grp2', count: 2 });
  assert.equal(evaluateTask(recruitTask, settlement, clock(1), {}).complete, true, 'recruitment event satisfies recruitTask');
});

// ---------------------------------------------------------------------------
// 13. Target Resolver & Dedupe Retry Bug Fix
// ---------------------------------------------------------------------------

test('target resolver rejects destroyed/demolished buildings and ignores random OSM substrings', () => {
  const def = getRegisteredMissionDefinitions().find((m) => m.id === 'mission_oldworld')!;
  const settlement = mkSettlement();
  (settlement as any).demolishedBuildings = new Map([['hosp_destroyed', true]]);

  const ctx = {
    mapData: {
      buildings: [
        // Building with random tag that shouldn't match hospital
        { id: 'random_tag', rawType: 'building=yes;note=near old hospital site', type: 'commercial', name: 'Bar' },
        // Destroyed hospital
        { id: 'hosp_destroyed', rawType: 'amenity=hospital', type: 'hospital', name: 'Destroyed Hospital' },
        // Valid intact hospital
        { id: 'hosp_valid', rawType: 'amenity=hospital', type: 'hospital', name: 'Mercy Hospital' },
      ],
    } as any,
  };

  const tasks = bindMissionTasks(def, settlement, ctx);
  const reach = tasks.find((t) => t.id === 'ow1_reach')!;
  assert.equal(reach.boundTargetId, 'hosp_valid', 'must resolve intact hospital and reject destroyed and loose matches');
});

test('event trigger dedupe bug fix: event without valid target retries when target appears', () => {
  let state = getInitialMissionState();
  const settlement = mkHQ();

  // Tick 1: Event occurs (LAIR_DISCOVERED), but mapData has NO lairs or lair buildings
  emitGameEvent('LAIR_DISCOVERED', { lairId: 'lair_1' });
  const emptyCtx = { mapData: { buildings: [] } };
  const res1 = updateMissionSystem(state, settlement, clock(4), emptyCtx as any);

  // Target could not bind, so briefing must NOT be created, and event must NOT be permanently burned
  assert.equal(res1.newTransmissions.some((t) => t.missionId === 'mission_nest'), false);
  assert.equal(res1.newState.triggeredEventIds.includes('event:LAIR_DISCOVERED'), false, 'event must NOT be marked consumed if target failed');

  // Tick 2: Target becomes available (lair exists on map)
  (settlement as any).zombieLairs = new Map([['lair_1', { id: 'lair_1', isDiscovered: true, isCleared: false }]]);
  const res2 = updateMissionSystem(res1.newState, settlement, clock(4), emptyCtx as any);

  assert.ok(res2.newTransmissions.some((t) => t.missionId === 'mission_nest'), 'mission_nest must trigger once target becomes available');
});

// ---------------------------------------------------------------------------
// 14. Real Sequential Task Dependencies (dependsOn)
// ---------------------------------------------------------------------------

test('sequential task dependencies: dependent tasks remain locked until prerequisite is completed', () => {
  const settlement = mkHQ();
  const base = getInitialMissionState();
  // Update to get mission_waterline briefing
  const r1 = updateMissionSystem(base, settlement, clock(3), {});
  const tx = findTx(r1, 'tx_c1_waterline')!;
  const r2 = handleTransmissionResponse(r1.newState, tx, 'accept', settlement, clock(3));
  const active = r2.newState.activeMissions.find((m) => m.definitionId === 'mission_waterline')!;
  assert.ok(active);

  const t1 = active.tasks.find((t) => t.id === 'w1_research')!;
  const t2 = active.tasks.find((t) => t.id === 'w2_cistern')!;
  const t3 = active.tasks.find((t) => t.id === 'w3_reserve')!;

  assert.equal(t1.status, 'active', 'first task is active');
  assert.equal(t2.status, 'pending', 'second task is locked pending t1');
  assert.equal(t3.status, 'pending', 'third task is locked pending t2');

  // Attempting to evaluate while t1 is not completed does not complete t2 even if cistern is built
  (settlement as any).freestandingBuildings = [{ buildingId: 'c1', typeId: 'water_cistern', type: 'water_cistern', constructionStatus: 'completed' }];
  const r3 = updateMissionSystem(r2.newState, settlement, clock(3), {});
  const activeAfter = r3.newState.activeMissions.find((m) => m.definitionId === 'mission_waterline')!;
  const t2After = activeAfter.tasks.find((t) => t.id === 'w2_cistern')!;
  assert.equal(t2After.status, 'pending', 't2 must remain locked until t1 completes');

  // Now complete t1 (research Basic Sanitation)
  settlement.research.unlockedNodes = ['basic_sanitation'];
  const r4 = updateMissionSystem(r3.newState, settlement, clock(3), {});
  const activeUnlocked = r4.newState.activeMissions.find((m) => m.definitionId === 'mission_waterline')!;
  const t1Done = activeUnlocked.tasks.find((t) => t.id === 'w1_research')!;
  const t2Unlocked = activeUnlocked.tasks.find((t) => t.id === 'w2_cistern')!;
  assert.equal(t1Done.status, 'completed');
  assert.equal(t2Unlocked.status, 'completed', 't2 was evaluated and completed once t1 unlocked it');
});

// ---------------------------------------------------------------------------
// 15. Campaign Graph Progression (requiresMissionsCompleted)
// ---------------------------------------------------------------------------

test('campaign graph progression: later missions do not trigger before prerequisite missions complete', () => {
  const settlement = mkHQ();
  const state = getInitialMissionState();

  // Day 5: mission_deadchannel has day >= 5 trigger, but requires waterline completed
  const res = updateMissionSystem(state, settlement, clock(5), {});
  assert.equal(
    res.newTransmissions.some((t) => t.missionId === 'mission_deadchannel'),
    false,
    'deadchannel must not trigger before waterline is completed'
  );

  // Complete waterline
  const stateWithWaterline = {
    ...state,
    completedMissionIds: ['mission_waterline'],
  };

  const resAfter = updateMissionSystem(stateWithWaterline, settlement, clock(5), {});
  assert.ok(
    resAfter.newTransmissions.some((t) => t.missionId === 'mission_deadchannel'),
    'deadchannel triggers once waterline is completed'
  );
});

// ---------------------------------------------------------------------------
// 16. Night Survival Evaluation
// ---------------------------------------------------------------------------

test('survive_night requires passing through night and reaching dawn', () => {
  const settlement = mkSettlement();
  const task = {
    id: 'sn',
    type: 'survive_night',
    title: 'Survive Night',
    status: 'active',
    current: 0,
    target: 1,
    nightWitnessed: false,
  } as any;

  // Day at hour 14 (not night yet)
  const daytime = { ...clock(1, 14), isNight: false, phase: 'day' as const };
  const r1 = evaluateTask(task, settlement, daytime, {});
  assert.equal(r1.complete, false);

  // Night at hour 23 (night witnessed)
  const nighttime = { ...clock(1, 23), isNight: true, phase: 'night' as const };
  const r2 = evaluateTask(task, settlement, nighttime, {});
  assert.equal(r2.complete, false, 'night is active, dawn not reached');
  assert.equal(task.nightWitnessed, true, 'task records night was witnessed');

  // Next morning at hour 7 (dawn reached after night)
  const dawntime = { ...clock(2, 7), isNight: false, phase: 'day' as const };
  const r3 = evaluateTask(task, settlement, dawntime, {});
  assert.equal(r3.complete, true, 'survive_night completes at dawn after night was witnessed');
});

// ---------------------------------------------------------------------------
// 17. Save / Load Persistence
// ---------------------------------------------------------------------------

test('save and load persistence preserves pending briefings, active missions, baselines, and flags', () => {
  const settlement = mkHQ();
  // Trigger waterline
  const r1 = updateMissionSystem(getInitialMissionState(), settlement, clock(3), {});
  const tx = findTx(r1, 'tx_c1_waterline')!;
  const r2 = handleTransmissionResponse(r1.newState, tx, 'accept', settlement, clock(3));

  // Serialize to JSON and restore
  const serialized = JSON.stringify(r2.newState);
  const loadedState = JSON.parse(serialized);

  // Snapshot reconciliation after load
  const reconciled = reconcileMissionSnapshot(loadedState, settlement, clock(3), {});
  const tickAfterLoad = updateMissionSystem(reconciled, settlement, clock(3), {});

  // Invariants hold after load
  assert.equal(tickAfterLoad.newTransmissions.length, 0, 'no duplicate briefing transmissions after reload');
  assert.equal(tickAfterLoad.newState.activeMissions.length, 1, 'active mission preserved');
  assert.equal(tickAfterLoad.newState.activeMissions[0].definitionId, 'mission_waterline');
  assert.equal(tickAfterLoad.newState.startedMissionIds.includes('mission_waterline'), true);
});