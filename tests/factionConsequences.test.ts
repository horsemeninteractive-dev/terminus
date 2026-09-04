import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFactionEffects,
  evaluateMissionCondition,
  factionStandingOf,
  getInitialMissionState,
  handleTransmissionResponse,
  registerMissionDefinitions,
  updateMissionSystem,
} from '../src/services/missionService';
import { registerAllContent } from '../src/services/missionRegistry';
import {
  FACTION_DEFINITIONS,
  factionCutoffFlag,
  getFactionDefaultStanding,
} from '../src/data/factions';
import type { GameClockState } from '../src/types/combat';
import type { MissionRuntimeState, MissionTaskState } from '../src/types/mission';
import type { SettlementState } from '../src/types/settlement';

// ---------------------------------------------------------------------------
// Fixtures (mirror missionSystem.test.ts)
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
    generalPopulation: { total: 15 } as any,
    namedSurvivors: [],
    ...over,
  } as unknown as SettlementState;
}

const TS = 'DAY 01 — 08:00:00';
const EASTERN = 'eastern_group';

registerAllContent();

// ---------------------------------------------------------------------------
// Initial state + registry
// ---------------------------------------------------------------------------

test('faction standings are seeded from the registry on a fresh campaign', () => {
  const init = getInitialMissionState();
  for (const f of FACTION_DEFINITIONS) {
    assert.equal(init.factionRelations[f.id], f.defaultStanding, `default standing for ${f.id}`);
    assert.equal(factionStandingOf(init.factionRelations, f.id), f.defaultStanding);
  }
  // Unknown factions fall back to a neutral default rather than undefined.
  assert.equal(factionStandingOf({}, 'does_not_exist'), 0);
  assert.equal(factionStandingOf(undefined, EASTERN), getFactionDefaultStanding(EASTERN));
});

test('legacy saves without factionRelations load with defaults intact', () => {
  const payload = { narrativeFlags: { old: true } } as any; // pre-relations save
  const merged = { ...getInitialMissionState(), ...payload };
  for (const f of FACTION_DEFINITIONS) {
    assert.equal(merged.factionRelations[f.id], f.defaultStanding);
  }
});

// ---------------------------------------------------------------------------
// Standing arithmetic + cutoff crossing
// ---------------------------------------------------------------------------

test('deltas clamp to the -100..100 standing bounds', () => {
  const r = applyFactionEffects({ [EASTERN]: 99 }, [{ factionId: EASTERN, delta: 500 }], {}, TS);
  assert.equal(r.relations[EASTERN], 100);
  const low = applyFactionEffects({ [EASTERN]: -99 }, [{ factionId: EASTERN, delta: -500 }], {}, TS);
  assert.equal(low.relations[EASTERN], -100);
});

test('crossing at/below the cutoff queues the contact-lost transmission exactly once', () => {
  // eastern_group default 0, cutoff -15.
  const base = getInitialMissionState();
  const r1 = applyFactionEffects(base.factionRelations, [{ factionId: EASTERN, delta: -25 }], base.narrativeFlags, TS);
  assert.equal(r1.relations[EASTERN], -25);
  assert.equal(r1.flags[factionCutoffFlag(EASTERN)], true, 'cutoff marker flag set');
  assert.equal(
    r1.transmissions.filter((t) => t.id === 'tx_c4_strangers_refused').length,
    1,
    'contact-lost transmission queued'
  );
  assert.equal(r1.transmissions.filter((t) => t.id === 'tx_c4_strangers_recovered').length, 0);

  // A second effect while already cut does NOT re-queue the transmission.
  const r2 = applyFactionEffects(r1.relations, [{ factionId: EASTERN, delta: -10 }], r1.flags, TS);
  assert.equal(r2.relations[EASTERN], -35);
  assert.equal(r2.transmissions.length, 0, 'no duplicate contact-lost transmission');
});

test('recovering above the cutoff clears the marker and queues the restored transmission', () => {
  const base = getInitialMissionState();
  const cut = applyFactionEffects(base.factionRelations, [{ factionId: EASTERN, delta: -25 }], base.narrativeFlags, TS);
  const recovered = applyFactionEffects(cut.relations, [{ factionId: EASTERN, delta: 30 }], cut.flags, TS);
  assert.equal(recovered.relations[EASTERN], 5, 'recovered above cutoff');
  assert.equal(recovered.flags[factionCutoffFlag(EASTERN)], false, 'cutoff marker cleared');
  assert.equal(recovered.transmissions.filter((t) => t.id === 'tx_c4_strangers_recovered').length, 1);
});

test('faction_standing conditions evaluate min/max against the relations record', () => {
  const settlement = mkSettlement();
  const relations = { [EASTERN]: 15 };
  assert.equal(
    evaluateMissionCondition(
      { kind: 'faction_standing', factionId: EASTERN, min: 10 },
      settlement,
      clock(5),
      {},
      {},
      relations
    ),
    true
  );
  assert.equal(
    evaluateMissionCondition(
      { kind: 'faction_standing', factionId: EASTERN, min: 20 },
      settlement,
      clock(5),
      {},
      {},
      relations
    ),
    false
  );
  assert.equal(
    evaluateMissionCondition(
      { kind: 'faction_standing', factionId: EASTERN, max: -15 },
      settlement,
      clock(5),
      {},
      {},
      { [EASTERN]: -25 }
    ),
    true
  );
  // Defaults apply when a faction is absent from the record (legacy states).
  assert.equal(
    evaluateMissionCondition(
      { kind: 'faction_standing', factionId: EASTERN, min: -5 },
      settlement,
      clock(5),
      {},
      {},
      {}
    ),
    true
  );
});

// ---------------------------------------------------------------------------
// Decline / branch consequences through the real STRANGERS arc
// ---------------------------------------------------------------------------

test('declining STRANGERS cuts the eastern group: standing drop, flag, one contact-lost tx', () => {
  const settlement = mkSettlement();
  const scan = updateMissionSystem(getInitialMissionState(), settlement, clock(14), {});
  const briefing = scan.newTransmissions.find((t) => t.missionId === 'mission_strangers');
  assert.ok(briefing, 'strangers briefing queued on day 14');

  const responded = handleTransmissionResponse(scan.newState, briefing!, 'decline', settlement, clock(14));
  assert.equal(responded.newState.factionRelations[EASTERN], -25, 'eastern standing -25 after refusal');
  assert.ok(responded.newState.declinedMissionIds.includes('mission_strangers'));
  assert.equal(responded.newState.narrativeFlags.refused_strangers, true);
  assert.equal(responded.newState.narrativeFlags[factionCutoffFlag(EASTERN)], true);
  assert.equal(
    responded.newTransmissions.filter((t) => t.id === 'tx_c4_strangers_refused').length,
    1,
    'engine queues the contact-lost transmission for the cut faction'
  );
  assert.equal(responded.newState.activeMissions.length, 0, 'no mission created by a decline');
});

test('rescuing STRANGERS raises eastern standing without any cutoff', () => {
  const settlement = mkSettlement();
  const scan = updateMissionSystem(getInitialMissionState(), settlement, clock(14), {});
  const briefing = scan.newTransmissions.find((t) => t.missionId === 'mission_strangers');
  assert.ok(briefing);

  const responded = handleTransmissionResponse(
    scan.newState,
    briefing!,
    'branch:mission_strangers_help',
    settlement,
    clock(14)
  );
  assert.equal(responded.newState.factionRelations[EASTERN], 15);
  assert.ok(responded.newState.activeMissions.some((m) => m.definitionId === 'mission_strangers_help'));
  assert.ok(!responded.newState.narrativeFlags.refused_strangers, 'no refusal flag on the help path');
  assert.ok(!responded.newState.narrativeFlags[factionCutoffFlag(EASTERN)], 'no cutoff on the help path');
  assert.ok(
    responded.newTransmissions.every((t) => t.id !== 'tx_c4_strangers_refused'),
    'no contact-lost transmission on the help path'
  );
});

// ---------------------------------------------------------------------------
// Consequences change later content
// ---------------------------------------------------------------------------

test('warm eastern relations unlock the repeatable EASTERN LINE supply mission', () => {
  const settlement = mkSettlement();
  const state = getInitialMissionState();
  state.narrativeFlags = { ...state.narrativeFlags, helped_strangers: true };
  state.factionRelations = { ...state.factionRelations, [EASTERN]: 15 };

  const result = updateMissionSystem(state, settlement, clock(20), {});
  assert.ok(
    result.newTransmissions.some((t) => t.missionId === 'mission_eastern_line'),
    'OP-EASTERNLINE briefed at day 20 with warm eastern standing'
  );
  assert.ok(
    !result.newTransmissions.some((t) => t.missionId === 'mission_strangers_bitter'),
    'no bitter aftermath on the warm path'
  );
});

test('refusing STRANGERS later surfaces the BITTER HARVEST retaliation mission', () => {
  const settlement = mkSettlement();
  const state = getInitialMissionState();
  state.narrativeFlags = { ...state.narrativeFlags, refused_strangers: true };
  state.factionRelations = { ...state.factionRelations, [EASTERN]: -25 };

  // Early: too soon after the refusal for the outcome to surface.
  const early = updateMissionSystem(state, settlement, clock(17), {});
  assert.ok(!early.newTransmissions.some((t) => t.missionId === 'mission_strangers_bitter'));

  // Day 20: the burned shopfront / raider column report arrives.
  const result = updateMissionSystem(state, settlement, clock(20), {});
  assert.ok(
    result.newTransmissions.some((t) => t.missionId === 'mission_strangers_bitter'),
    'OP-BITTER briefed once the refused group turns hostile'
  );
  assert.ok(
    !result.newTransmissions.some((t) => t.missionId === 'mission_eastern_line'),
    'no trade line when the eastern group is cut off'
  );
});

test('a cut-off faction never re-offers the work it withdrew', () => {
  // Once the marker is set, standing-gated offers stay quiet even on later days.
  const settlement = mkSettlement();
  const state = getInitialMissionState();
  state.narrativeFlags = { ...state.narrativeFlags, refused_strangers: true };
  state.factionRelations = { ...state.factionRelations, [EASTERN]: -25 };
  state.declinedMissionIds = ['mission_strangers']; // real refusal state
  const result = updateMissionSystem(state, settlement, clock(25), {});
  assert.ok(!result.newTransmissions.some((t) => t.missionId === 'mission_eastern_line'));
  assert.ok(!result.newTransmissions.some((t) => t.missionId === 'mission_strangers'));
});

// ---------------------------------------------------------------------------
// Completion rewards apply standings (integration through the tick)
// ---------------------------------------------------------------------------

test('mission completion rewards apply faction-relations shifts', () => {
  const fxMission = {
    id: 'mission_fx_test_complete',
    code: 'OP-FXTEST',
    title: 'FX TEST',
    description: 'Synthetic mission exercising completion faction rewards.',
    category: 'settlement' as const,
    priority: 'normal' as const,
    trigger: { type: 'condition' as const, condition: { kind: 'flag' as const, key: 'never_auto', value: true } },
    briefingTransmissionId: 'tx_c1_waterline',
    responseOptions: [{ label: 'ACKNOWLEDGED.', action: 'accept' as const }],
    tasks: [
      {
        id: 'fx1',
        type: 'reach_population' as const,
        title: 'Reach 1 Resident',
        targetCount: 1,
      },
    ],
    rewards: {
      resources: { canned_goods: 2 },
      narrativeFlags: { fx_test_done: true },
      factionEffects: [{ factionId: EASTERN, delta: 3 }],
      summary: '+2 Rations — eastern standing +3',
    },
    completionTransmissionId: 'tx_c1_waterline_done',
  };
  registerMissionDefinitions([fxMission as any]);

  const settlement = mkSettlement();
  const task: MissionTaskState = {
    id: 'fx1',
    type: 'reach_population',
    title: 'Reach 1 Resident',
    status: 'active',
    current: 0,
    target: 1,
  };
  const active: MissionRuntimeState = {
    id: 'mission_fx_test_complete_a',
    definitionId: 'mission_fx_test_complete',
    status: 'active',
    startedDay: 1,
    startedGameHours: 0,
    tasks: [task],
    completionTransmissionSent: false,
    failureTransmissionSent: false,
  };
  const state = getInitialMissionState();
  const result = updateMissionSystem(
    { ...state, activeMissions: [active] },
    settlement,
    clock(2),
    {}
  );

  assert.ok(result.newState.completedMissionIds.includes('mission_fx_test_complete'));
  assert.equal(result.rewards?.canned_goods, 2);
  assert.equal(result.newState.narrativeFlags.fx_test_done, true);
  assert.equal(result.newState.factionRelations[EASTERN], 3, 'completion reward shifted eastern standing');
});
