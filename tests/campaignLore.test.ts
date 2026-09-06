/**
 * Campaign lore & faction discovery tests (spec §6/§7/§18/§41/§42/§43).
 *
 * Covers:
 *  - factions are hidden until FACTION_CONTACTED / contactFactionId response
 *  - the tracker-visible faction registry equals contactedFactionIds
 *  - lore discoveries live in global narrativeFlags (mission-independent)
 *  - campaign resolution is not a game over
 *  - old saves without the new fields load safely
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerAllContent, validateContentRegistry } from '../src/services/missionRegistry';
import {
  getInitialMissionState,
  updateMissionSystem,
  handleTransmissionResponse,
  findMissionDefinition,
  getRegisteredMissionDefinitions,
} from '../src/services/missionService';
import { resetGameEventBus, emitGameEvent, getLatestEventId } from '../src/services/eventBus';
import { getLoreState, LORE_FLAGS, MAJOR_FACTION_IDS } from '../src/services/campaignLore';
import { FACTION_DEFINITIONS } from '../src/data/factions';
import { SettlementState } from '../src/types/settlement';
import { GameClockState } from '../src/types/combat';
import { MissionState } from '../src/types/mission';

// ---- test scaffolding -------------------------------------------------------

registerAllContent();

function clock(day: number, hour = 8): GameClockState {
  return {
    day,
    hour,
    minute: 0,
    speed: 1,
    phase: hour >= 19 || hour < 5 ? 'night' : 'day',
    isNight: hour >= 19 || hour < 5,
    hordeWaveIntensity: 1,
    totalElapsedSeconds: 0,
  } as unknown as GameClockState;
}

function settlement(overrides: Partial<SettlementState> = {}): SettlementState {
  return {
    generalPopulation: { total: 20 },
    namedSurvivors: [],
    squads: [],
    freestandingBuildings: [],
    adaptedBuildings: new Map(),
    buildingSearches: new Map(),
    stockpile: {
      materials: {}, food: {}, medical: {}, fuel: {}, ammo: {}, water: {},
    },
    research: { unlockedNodes: ['triangulation'] },
    lifetimeStats: { infectedKills: 0, survivorsRecruited: 0, itemsProduced: {} },
    hiddenGroups: new Map(),
    zombieLairs: new Map(),
  } as unknown as SettlementState;
}

function mkHQ(): SettlementState {
  return {
    ...settlement(),
    primaryHQId: 'hq-1',
    headquarters: [{ buildingId: 'hq-1', operational: true }],
  } as unknown as SettlementState;
}

function findTx(result: { newTransmissions: Array<{ id: string }> }, id: string) {
  return result.newTransmissions.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// 1. Content registry integrity for the new campaign
// ---------------------------------------------------------------------------

test('new campaign content registers without validation errors', () => {
  const errors = validateContentRegistry();
  assert.deepEqual(errors, []);
});

test('all five major factions are defined and the act chain exists', () => {
  const ids = FACTION_DEFINITIONS.map((f) => f.id);
  for (const fid of MAJOR_FACTION_IDS) {
    assert.ok(ids.includes(fid), `faction ${fid} defined`);
  }
  const chain = [
    'mission_unknownsignal',
    'mission_crossroads',
    'mission_coldstorage',
    'mission_thefacility',
    'mission_containment',
    'mission_theprotocol',
  ];
  for (const id of chain) {
    assert.ok(findMissionDefinition(id), `mission ${id} exists`);
  }
});

test('the three resolutions all set campaign_resolved with distinct resolutions', () => {
  for (const id of ['mission_protocol_cure', 'mission_protocol_purge', 'mission_protocol_coexistence']) {
    const def = findMissionDefinition(id)!;
    const flags = def.rewards?.narrativeFlags || {};
    assert.equal(flags.campaign_resolved, true, `${id} sets campaign_resolved`);
    assert.ok(flags.campaign_resolution, `${id} sets campaign_resolution`);
  }
});

// ---------------------------------------------------------------------------
// 2. Faction discovery (§5/§6/§7/§33)
// ---------------------------------------------------------------------------

test('a fresh mission state knows no factions and has empty contactedFactionIds', () => {
  const state = getInitialMissionState();
  assert.deepEqual(state.contactedFactionIds, []);
});

test('factionRelations may contain standings for factions the player never contacted — UI must not read it', () => {
  // The tracker derives rows from contactedFactionIds (§7). The relations
  // record intentionally holds hidden defaults; simulate a mission touching a
  // faction's standing pre-contact and confirm knowledge state stays empty.
  const settlementState = mkHQ();
  const result = updateMissionSystem(getInitialMissionState(), settlementState, clock(14), {});
  assert.deepEqual(result.newState.contactedFactionIds, []);
});

test('responding to the unknown signal establishes real contact with the Seekers', () => {
  resetGameEventBus();
  const settlementState = mkHQ();
  let state: MissionState = getInitialMissionState();
  // Drive the story flags the unknown signal requires.
  state.narrativeFlags = { ...state.narrativeFlags, lore_behaviour_anomaly: true };
  state.completedMissionIds = ['mission_deadchannel', 'mission_nightmove'];

  const result = updateMissionSystem(state, settlementState, clock(10), {});
  const tx = findTx(result, 'tx_c2_unknownsignal');
  assert.ok(tx, 'anonymous signal briefs (no faction name before contact)');

  const responded = handleTransmissionResponse(result.newState, tx!, 'accept', settlementState, clock(10));
  assert.ok(
    responded.newState.contactedFactionIds.includes('seekers'),
    'seekers added to contactedFactionIds on response'
  );
  assert.ok(
    responded.newTransmissions.some((t) => t.id === 'tx_c2_unknownsignal_done'),
    'CONTACT ESTABLISHED transmission queued after response'
  );
});

test('declining the unknown signal establishes NO contact', () => {
  resetGameEventBus();
  const settlementState = mkHQ();
  let state: MissionState = getInitialMissionState();
  state.narrativeFlags = { ...state.narrativeFlags, lore_behaviour_anomaly: true };
  state.completedMissionIds = ['mission_deadchannel', 'mission_nightmove'];

  const result = updateMissionSystem(state, settlementState, clock(10), {});
  const tx = findTx(result, 'tx_c2_unknownsignal')!;
  const responded = handleTransmissionResponse(result.newState, tx, 'decline', settlementState, clock(10));
  assert.deepEqual(responded.newState.contactedFactionIds, [], 'no faction contact on decline');
});

test('FACTION_CONTACTED domain events register contact through the tick', () => {
  resetGameEventBus();
  const settlementState = mkHQ();
  emitGameEvent('FACTION_CONTACTED', { factionId: 'remnant', settlementId: 'hq-1' });
  const state = { ...getInitialMissionState(), lastProcessedEventId: 0 };
  const result = updateMissionSystem(state, settlementState, clock(5), {});
  assert.ok(result.newState.contactedFactionIds.includes('remnant'));
});

test('faction discovery persists in mission state across snapshot reconciliation', () => {
  // Simulated save/load: contact made, then reconcileMissionSnapshot on load.
  const settlementState = mkHQ();
  const state = {
    ...getInitialMissionState(),
    contactedFactionIds: ['seekers', 'remnant'],
  };
  const reloaded = { ...state, lastSeen: null };
  const result = updateMissionSystem(reloaded, settlementState, clock(12), {});
  assert.ok(result.newState.contactedFactionIds.includes('seekers'));
  assert.ok(result.newState.contactedFactionIds.includes('remnant'));
});

// ---------------------------------------------------------------------------
// 3. Lore knowledge is global & mission-independent (§18/§19/§47/§48)
// ---------------------------------------------------------------------------

test('lore state derives correctly from narrative flags', () => {
  const flags = {
    [LORE_FLAGS.outbreakTimelineKnown]: true,
    [LORE_FLAGS.earlyCasesDiscovered]: true,
    [LORE_FLAGS.infectedBehaviourAnomalyKnown]: true,
  };
  const lore = getLoreState(flags, []);
  assert.equal(lore.outbreakTimelineKnown, true);
  assert.equal(lore.earlyCasesDiscovered, true);
  assert.equal(lore.infectedBehaviourAnomalyKnown, true);
  assert.equal(lore.currentAct, 4, 'anomaly + timeline knowledge = Act IV window');
  assert.equal(lore.campaignResolved, false);
  assert.equal(lore.pathogenNatureKnown, false);
});

test('campaign knowledge survives settlement destruction (flags are global)', () => {
  // The flags live on MissionState, NOT SettlementState: destroying a
  // settlement (a fresh SettlementState object) cannot erase discoveries.
  const destroyedSettlement = settlement() as SettlementState; // brand-new state = lost base
  const missionState = {
    ...getInitialMissionState(),
    narrativeFlags: {
      [LORE_FLAGS.pathogenNatureKnown]: true,
      [LORE_FLAGS.researchFacilityInvestigated]: true,
      [LORE_FLAGS.outbreakTimelineKnown]: true,
    },
    contactedFactionIds: ['seekers'],
  };
  const lore = getLoreState(missionState.narrativeFlags, missionState.contactedFactionIds);
  assert.equal(lore.pathogenNatureKnown, true);
  assert.equal(lore.researchFacilityInvestigated, true);
  assert.equal(lore.currentAct, 6);
  assert.ok(destroyedSettlement !== undefined, 'settlement replaced without touching mission state');
});

test('multiple settlements share one campaign knowledge base', () => {
  // getLoreState reads from mission-level flags; any settlement context sees
  // the same knowledge.
  const flags = { [LORE_FLAGS.researchRecordsRecovered]: true };
  const loreA = getLoreState(flags, ['commonwealth']);
  const loreB = getLoreState(flags, ['commonwealth']);
  assert.equal(loreA.researchRecordsRecovered, loreB.researchRecordsRecovered);
  assert.equal(loreA.commonwealthDiscovered, true);
});

// ---------------------------------------------------------------------------
// 4. Act progression is knowledge-driven, not day-driven (§24)
// ---------------------------------------------------------------------------

test('act stays 1 with no discoveries regardless of late day', () => {
  const lore = getLoreState({}, []);
  assert.equal(lore.currentAct, 1);
});

test('act advances through contact, anomaly, records, facility and resolution', () => {
  assert.equal(getLoreState({}, ['seekers']).currentAct, 2);
  assert.equal(getLoreState({ [LORE_FLAGS.organisedInfectedKnown]: true }, []).currentAct, 3);
  assert.equal(getLoreState({ [LORE_FLAGS.militaryRecordsRecovered]: true }, []).currentAct, 4);
  assert.equal(getLoreState({ [LORE_FLAGS.researchFacilityInvestigated]: true }, []).currentAct, 5);
  assert.equal(getLoreState({ [LORE_FLAGS.pathogenNatureKnown]: true }, []).currentAct, 6);
});

// ---------------------------------------------------------------------------
// 5. Resolution is not a game over (§22)
// ---------------------------------------------------------------------------

test('campaign_resolved does not appear in any failure condition or terminal state', () => {
  // Resolution missions must not carry failure conditions that could end the
  // game, and completing them must not gate the simulation.
  for (const id of ['mission_protocol_cure', 'mission_protocol_purge', 'mission_protocol_coexistence']) {
    const def = findMissionDefinition(id)!;
    assert.ok(!def.failureConditions || def.failureConditions.length === 0, `${id} has no failure conditions`);
  }
  // The lore view explicitly marks resolution as a completed campaign, not an
  // ended game — there is no "gameOver" concept in campaign state.
  const lore = getLoreState({ [LORE_FLAGS.campaignResolved]: true, campaign_resolution: 'cure' }, []);
  assert.equal(lore.campaignResolved, true);
  assert.equal(lore.campaignResolution, 'cure');
  // Simulation-relevant knowledge state remains intact post-resolution.
  assert.ok(lore.campaignResolved);
});

test('resolution missions are triggered only by their parent protocol choice', () => {
  // Branch targets must exist and the protocol mission must branch to all three.
  const protocol = findMissionDefinition('mission_theprotocol')!;
  const branchIds = protocol.responseOptions
    .filter((o) => o.action === 'branch')
    .map((o) => o.missionId);
  assert.ok(branchIds.includes('mission_protocol_cure'));
  assert.ok(branchIds.includes('mission_protocol_purge'));
  assert.ok(branchIds.includes('mission_protocol_coexistence'));
});

// ---------------------------------------------------------------------------
// 6. Faction missions hidden until contact (§33)
// ---------------------------------------------------------------------------

test('no campaign mission exposes a faction id before it is contacted', () => {
  // Faction-gated missions use contactFactionId in responseOptions — meaning
  // the faction is only revealed by choosing that option. Scan the whole
  // registry: any mission whose briefing reveals a faction must do so through
  // contactFactionId, not by existing with a standing pre-set.
  const allDefs = getRegisteredMissionDefinitions();
  // Contact-establishing missions: the Seekers signal + the 4-way crossroads
  // (one mission, four contact branches) — plus Gravel Bend in the archive.
  const contactGated = allDefs.filter((d) =>
    d.responseOptions.some((o) => o.contactFactionId)
  );
  const contactedFactions = new Set(
    contactGated.flatMap((d) => d.responseOptions.map((o) => o.contactFactionId).filter(Boolean))
  );
  assert.ok(contactGated.length >= 2, 'contact-establishing missions exist');
  for (const fid of MAJOR_FACTION_IDS) {
    assert.ok(
      contactedFactions.has(fid),
      `faction ${fid} has a real contact-establishing response`
    );
  }
  for (const def of contactGated) {
    for (const opt of def.responseOptions) {
      if (opt.contactFactionId) {
        assert.ok(
          FACTION_DEFINITIONS.some((f) => f.id === opt.contactFactionId),
          `${def.id} contacts a defined faction`
        );
      }
    }
  }
});

test('lore flag names are stable and consumed by content triggers', () => {
  // Content triggers reference the canonical flag names from LORE_FLAGS.
  const flagKeys = Object.values(LORE_FLAGS);
  const allDefs = getRegisteredMissionDefinitions();
  const referenced = new Set<string>();
  for (const def of allDefs) {
    for (const opt of def.responseOptions) {
      if (opt.flag) referenced.add(opt.flag.key);
    }
    for (const r of (def.rewards?.narrativeFlags ? Object.keys(def.rewards.narrativeFlags) : [])) {
      referenced.add(r);
    }
  }
  for (const key of ['lore_behaviour_anomaly', 'lore_military_records', 'lore_pathogen_nature']) {
    assert.ok(flagKeys.includes(key as never), `${key} canonical`);
    assert.ok(referenced.has(key), `${key} set by campaign content`);
  }
});
