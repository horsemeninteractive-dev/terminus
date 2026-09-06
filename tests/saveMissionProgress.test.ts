import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveGameService } from '../src/services/saveService';
import { CURRENT_SAVE_VERSION } from '../src/types/saveGame';
import { getInitialMissionState } from '../src/services/missionService';
import type { SettlementState } from '../src/types/settlement';
import type { MissionState } from '../src/types/mission';

/**
 * Regression coverage for the "missions reset on load" bug.
 *
 * The original bug: manual/quick saves persisted `missionState`, but the dawn
 * AUTOSAVE payload (built in useSimulationLoop) omitted it. Loading such a
 * save fell back to the initial (empty) mission state, so every autosave-load
 * restarted the campaign from the first quest. These tests pin the persistence
 * layer: whatever missionState a save carries must come back intact.
 */

const PREFIX = 'terminus_ifz_save_';
const INDEX_KEY = 'terminus_ifz_save_index';

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem(k: string) { return map.get(k) ?? null; },
    setItem(k: string, v: string) { map.set(k, v); },
    removeItem(k: string) { map.delete(k); },
    key(i: number) { return Array.from(map.keys())[i] ?? null; },
  } as Storage;
}

function makeSettlement(): SettlementState {
  return {
    name: 'Test Colony',
    stockpile: { food: { canned_goods: 10, mre_rations: 0, dried_rations: 0, fresh_harvest: 0 } },
    namedSurvivors: [],
    generalPopulation: { total: 8 },
    squads: [],
    morale: { overallScore: 70 },
    weather: { currentSeason: 'spring', currentWeather: 'clear' },
    headquarters: [],
    adaptedBuildings: [],
    buildingSearches: [],
  } as unknown as SettlementState;
}

function missionStateWithProgress(): MissionState {
  return {
    ...getInitialMissionState(),
    completedMissionIds: ['m_establish_hq', 'm_scavenge_food', 'm_defend_raid'],
    startedMissionIds: ['m_establish_hq', 'm_scavenge_food', 'm_defend_raid', 'm_build_palisade'],
    activeMissions: [
      {
        id: 'am_1',
        definitionId: 'm_build_palisade',
        status: 'active',
        startedDay: 3,
        startedGameHours: 60,
        tasks: [
          { id: 't1', type: 'construct_building', title: 'Build palisade', status: 'in_progress', current: 2, target: 5 },
        ],
        completionTransmissionSent: false,
        failureTransmissionSent: false,
      },
    ],
    narrativeFlags: { intro_done: true },
  };
}

test('a save carrying mission progress round-trips completedMissionIds intact', () => {
  const storage = makeStorage();
  globalThis.localStorage = storage;
  const service = new SaveGameService();

  const meta = service.saveGame('Progress Save', 'manual', {
    settlements: {},
    activeSettlementId: 's1',
    settlement: makeSettlement(),
    gameClock: { day: 4, hour: 9, minute: 0 },
    missionState: missionStateWithProgress(),
  });

  const loaded = service.loadGame(meta.id);
  assert.ok(loaded, 'save should load');
  const ms = loaded!.statePayload.missionState as MissionState;
  assert.ok(ms, 'save payload must carry missionState');
  assert.deepEqual(
    [...ms.completedMissionIds].sort(),
    ['m_defend_raid', 'm_establish_hq', 'm_scavenge_food'],
    'completed mission ids must survive the round-trip'
  );
  assert.equal(ms.activeMissions.length, 1);
  assert.equal(ms.activeMissions[0].definitionId, 'm_build_palisade');
  assert.equal(ms.activeMissions[0].tasks[0].current, 2);
  assert.equal(ms.narrativeFlags.intro_done, true);
});

test('loading a legacy save without missionState still yields a usable initial state', () => {
  const storage = makeStorage();
  globalThis.localStorage = storage;
  const service = new SaveGameService();

  const meta = service.saveGame('Legacy Save', 'autosave', {
    settlements: {},
    activeSettlementId: 's1',
    settlement: makeSettlement(),
    gameClock: { day: 2, hour: 8, minute: 0 },
    // no missionState — pre-mission-persistence save
  });

  const loaded = service.loadGame(meta.id);
  assert.ok(loaded, 'legacy save should load');
  assert.equal(loaded!.statePayload.missionState, undefined);
  assert.equal(loaded!.saveVersion, CURRENT_SAVE_VERSION);
});

/** Every save type must persist the SAME field set — a field only present in
 *  one save path is the "missions reset on autosave" bug waiting to happen
 *  again. Manual/autosave previously omitted scavengeQueue while quicksaves
 *  kept it, silently forgetting in-progress search plans on load. */
const REQUIRED_PAYLOAD_KEYS = [
  'settlements',
  'activeSettlementId',
  'settlement',
  'gameClock',
  'currentPreset',
  'mapData',
  'caravans',
  'radioState',
  'missionState',
  'combatSquads',
  'scavengeQueue',
  'zombies',
  'dangerLevel',
  'timeOfDay',
] as const;

for (const saveType of ['manual', 'autosave', 'quicksave'] as const) {
  test(`${saveType} saves persist the full shared payload (incl. scavengeQueue + missionState)`, () => {
    const storage = makeStorage();
    globalThis.localStorage = storage;
    const service = new SaveGameService();

    const meta = service.saveGame(`Parity ${saveType}`, saveType, {
      settlements: {},
      activeSettlementId: 's1',
      settlement: makeSettlement(),
      gameClock: { day: 5, hour: 6, minute: 0 },
      currentPreset: { id: 'p1', name: 'Test Sector', lat: 0, lon: 0, radius: 3000, description: '', country: 'X' } as any,
      mapData: { cityName: 'T', buildings: [], roads: [], landuse: [], resourceNodes: [] } as any,
      radioState: {} as any,
      missionState: missionStateWithProgress(),
      scavengeQueue: { sq_1: ['b1', 'b2'] },
      combatSquads: [],
      zombies: [],
      caravans: [],
      dangerLevel: 2,
      timeOfDay: 'dawn',
    });

    const loaded = service.loadGame(meta.id);
    assert.ok(loaded, `${saveType} save should load`);
    const payload = loaded!.statePayload as Record<string, unknown>;
    for (const key of REQUIRED_PAYLOAD_KEYS) {
      assert.ok(key in payload, `${saveType} payload is missing '${key}'`);
    }
    const queue = payload.scavengeQueue as Record<string, unknown>;
    assert.deepEqual(queue['sq_1'], ['b1', 'b2'], 'scavenge queue must round-trip');
    const ms = payload.missionState as MissionState;
    assert.ok(ms.completedMissionIds.length > 0, 'mission progress must round-trip');
  });
}
