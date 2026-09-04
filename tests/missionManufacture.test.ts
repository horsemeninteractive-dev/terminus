import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateTask,
  getInitialMissionState,
  handleTransmissionResponse,
  registerMissionDefinitions,
  registerTransmissionDefinitions,
} from '../src/services/missionService';
import { emitGameEvent, resetGameEventBus } from '../src/services/eventBus';
import type { GameClockState } from '../src/types/combat';
import type { SettlementState } from '../src/types/settlement';

// ---------------------------------------------------------------------------
// Fixtures (mirror missionSystem.test.ts helpers)
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

function withTools(heldTools: number, producedTools: number): SettlementState {
  const s = {
    id: 'settlement_alpha',
    name: 'Alpha',
    stockpile: stockpile({
      materials: { wood: 0, metal: 0, bricks: 0, tools: heldTools, fertilizer: 0, scientific_materials: 0, logs: 0, scrap: 0 },
    }),
    research: { unlockedNodes: [], activeResearchId: null, activeProgressSec: 0 },
    squads: [],
    adaptedBuildings: new Map(),
    freestandingBuildings: [],
    hiddenGroups: new Map(),
    buildingSearches: new Map(),
    zombieLairs: new Map(),
    generalPopulation: { total: 8 } as any,
    namedSurvivors: [],
    lifetimeStats: {
      infectedKills: 0,
      squadsFormed: 0,
      buildingsAdapted: 0,
      buildingsConstructed: 0,
      survivorsRecruited: 0,
      researchCompleted: 0,
      itemsProduced: { tools: producedTools },
    },
  } as unknown as SettlementState;
  return s;
}

function manufactureTask(over: Partial<any> = {}) {
  return {
    id: 'mfg',
    type: 'manufacture_item',
    title: 'Manufacture 10 Tools',
    status: 'active',
    current: 0,
    target: 10,
    resourceType: 'tools',
    startEventId: 0,
    ...over,
  } as any;
}

// ---------------------------------------------------------------------------
// Regression: possession must never satisfy a manufacture objective
// ---------------------------------------------------------------------------

test('manufacture_item never completes from tools merely held before or after acceptance', () => {
  // Colony ALREADY holds 50 tools when the mission starts, but has produced
  // zero. "Manufacture 10 Tools" must NOT complete.
  const settlement = withTools(50, 0);
  const task = manufactureTask({ startProgressBaseline: 0 });
  assert.equal(evaluateTask(task, settlement, clock(1), {}).complete, false, '50 held tools are not 10 manufactured tools');
  assert.equal(evaluateTask(task, settlement, clock(1), {}).current, 0);

  // Production after acceptance counts…
  (settlement.lifetimeStats as any).itemsProduced.tools = 9.999;
  assert.equal(evaluateTask(task, settlement, clock(1), {}).complete, false, '9.999 < 10');
  assert.equal(evaluateTask(task, settlement, clock(1), {}).current, 9, 'display current is floored to whole units');

  // …even when the colony simultaneously CONSUMES tools (held stock falls):
  // progress is production-only, never possession.
  (settlement.lifetimeStats as any).itemsProduced.tools = 14;
  (settlement as any).stockpile = stockpile({
    materials: { wood: 0, metal: 0, bricks: 0, tools: 46, fertilizer: 0, scientific_materials: 0, logs: 0, scrap: 0 },
  });
  const result = evaluateTask(task, settlement, clock(1), {});
  assert.equal(result.complete, true, '14 produced ≥ 10 regardless of the 46 still held');
  assert.equal(result.current, 10, 'current caps at target');
});

test('manufacture_item counts production since the mission start baseline, not lifetime production', () => {
  // 30 tools were manufactured BEFORE the mission (baseline anchors at 30).
  const settlement = withTools(30, 30);
  const task = manufactureTask({ startProgressBaseline: 30 });
  assert.equal(evaluateTask(task, settlement, clock(1), {}).complete, false, 'pre-baseline production does not count');

  (settlement.lifetimeStats as any).itemsProduced.tools = 35;
  assert.equal(evaluateTask(task, settlement, clock(1), {}).complete, false, '5 since baseline < 10');

  (settlement.lifetimeStats as any).itemsProduced.tools = 41;
  assert.equal(evaluateTask(task, settlement, clock(1), {}).complete, true, '11 since baseline ≥ 10');
});

test('manufacture_item progress survives consumption and scavenging of the same resource', () => {
  const settlement = withTools(50, 0);
  const task = manufactureTask({ startProgressBaseline: 0 });
  (settlement.lifetimeStats as any).itemsProduced.tools = 7;

  // Scavenged tools raise the stockpile but must NOT raise progress.
  (settlement as any).stockpile = stockpile({
    materials: { wood: 0, metal: 0, bricks: 0, tools: 87, fertilizer: 0, scientific_materials: 0, logs: 0, scrap: 0 },
  });
  assert.equal(evaluateTask(task, settlement, clock(1), {}).complete, false, 'scavenged stock is not manufacturing');
  assert.equal(evaluateTask(task, settlement, clock(1), {}).current, 7);

  // Consumption erases held stock but never erases manufactured progress.
  (settlement as any).stockpile = stockpile({
    materials: { wood: 0, metal: 0, bricks: 0, tools: 0, fertilizer: 0, scientific_materials: 0, logs: 0, scrap: 0 },
  });
  assert.equal(evaluateTask(task, settlement, clock(1), {}).current, 7, 'consumption cannot erase production progress');
});

test('fractional crate meter completes at the crate boundary', () => {
  const settlement = withTools(0, 0);
  (settlement.lifetimeStats as any).itemsProduced = { crates: 4.9999 };
  const task = {
    id: 'crates',
    type: 'manufacture_item',
    title: 'Produce 5 Ammunition Crates',
    status: 'active',
    current: 0,
    target: 5,
    resourceType: 'crates',
    startProgressBaseline: 0,
  } as any;
  const near = evaluateTask(task, settlement, clock(1), {});
  assert.equal(near.complete, false, '4.9999 crates < 5');
  assert.equal(near.current, 4, 'floored display');

  (settlement.lifetimeStats as any).itemsProduced.crates = 5.0001;
  assert.equal(evaluateTask(task, settlement, clock(1), {}).complete, true, '5 crates sealed');
});

test('event signals remain a secondary source for manufacture objectives', () => {
  resetGameEventBus();
  const settlement = withTools(0, 0);
  const task = manufactureTask({ startEventId: 0 });
  emitGameEvent('ITEM_MANUFACTURED', { resourceType: 'tools', amount: 6 });
  emitGameEvent('ITEM_MANUFACTURED', { resourceType: 'tools', amount: 4 });
  const result = evaluateTask(task, settlement, clock(1), {});
  assert.equal(result.complete, true, '6 + 4 event units complete the task');
});

// ---------------------------------------------------------------------------
// Regression: mission acceptance anchors the baseline to the PRODUCTION
// tally, not to current stockpile possession
// ---------------------------------------------------------------------------

test('accepting a manufacture mission anchors its baseline to produced items, not tools held', () => {
  registerTransmissionDefinitions([
    {
      id: 'tx_test_mfg_brief',
      classification: 'WARNING',
      callsign: 'TEST',
      title: 'MAKE TOOLS',
      message: 'Stand up the tool line.',
      priority: 'high',
    },
  ]);
  // Trigger day 999: registered content is inert for every other test/settlement.
  registerMissionDefinitions([
    {
      id: 'mission_test_mfg',
      code: 'TEST-MFG',
      title: 'Manufacture Tools',
      description: 'Produce tools after accepting.',
      category: 'settlement',
      priority: 'normal',
      trigger: { type: 'condition', condition: { kind: 'day', min: 999 } },
      briefingTransmissionId: 'tx_test_mfg_brief',
      responseOptions: [{ label: 'GO', action: 'accept' }],
      tasks: [
        {
          id: 'mfg_tools',
          type: 'manufacture_item',
          title: 'Manufacture 10 Tools',
          resourceType: 'tools',
          targetCount: 10,
        },
      ],
    },
  ]);

  // The colony holds 50 tools but has PRODUCED zero when the mission is accepted.
  const settlement = withTools(50, 0);
  const base = getInitialMissionState();
  const pending = [
    {
      id: 'mission_test_mfg_p',
      definitionId: 'mission_test_mfg',
      status: 'pending',
      startedDay: 1,
      startedGameHours: 0,
      tasks: [],
      completionTransmissionSent: false,
      failureTransmissionSent: false,
    },
  ];
  const tx = {
    id: 'tx_test_mfg_brief_x',
    missionId: 'mission_test_mfg',
    title: 'MAKE TOOLS',
    message: 'Go.',
    classification: 'WARNING',
    callsign: 'TEST',
    priority: 'high',
  } as any;

  const accepted = handleTransmissionResponse(
    { ...base, pendingMissions: pending as any },
    tx,
    'accept',
    settlement,
    clock(1)
  );
  assert.equal(accepted.success, true, 'acceptance succeeds');
  const mission = accepted.newState.activeMissions.find((m) => m.definitionId === 'mission_test_mfg');
  const task = mission!.tasks.find((t) => t.type === 'manufacture_item')!;
  assert.equal(task.startProgressBaseline, 0, 'baseline = production tally (0 produced), NOT the 50 tools held');
});
