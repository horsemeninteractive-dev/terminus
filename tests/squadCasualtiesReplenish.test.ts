import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState, establishSettlementHQ } from '../src/services/settlementService';
import {
  createSquad,
  disbandSquad,
  modifySquadGeneralMembers,
  replenishSquad,
} from '../src/services/populationService';
import { tickCombatSimulation, createZombieUnit } from '../src/services/combatService';
import type { BuildingPolygon, MapData } from '../src/types/map';
import type { SettlementState, NamedSurvivor } from '../src/types/settlement';
import type { TacticalSquadUnit } from '../src/types/combat';

// ----------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------

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

function makeHqBuilding(): BuildingPolygon {
  return {
    id: 'b_hq', type: 'residential', rawType: 'residential', name: 'Command House',
    height: 8, levels: 2,
    polygon: [{ x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 }],
    center: { x: 0, z: 0 },
  } as unknown as BuildingPolygon;
}

function makeState(): SettlementState {
  const base = establishSettlementHQ(createInitialSettlementState('Casualty Test'), makeHqBuilding());
  const miller: NamedSurvivor = {
    id: 'n_miller', name: 'Sgt. Miller', avatarSeed: 'miller',
    stats: { combat: 'skilled', scavenging: 'novice', driving: 'novice', medical: 'novice' },
    role: { type: 'unassigned' },
  } as unknown as NamedSurvivor;
  return {
    ...base,
    namedSurvivors: [miller],
    generalPopulation: { ...base.generalPopulation, total: 10, unassigned: 10, inSquads: 0 },
  };
}

function nightClock(): any {
  return { totalElapsedSeconds: 0, speed: 1, isNight: true, day: 1, phase: 'night', hours: 22, minutes: 0 };
}

function makeCombatSquad(squadId: string, members: any[]): TacticalSquadUnit {
  return {
    squadId,
    name: 'Combat Unit',
    leaderId: members.some((m) => m.isLeader) ? 'n_miller' : '',
    leaderName: 'Sgt. Miller',
    leaderCombatTier: 'skilled',
    generalCount: members.filter((m) => !m.isLeader).length,
    x: 0, z: 0, y: 0, rotation: 0,
    currentHp: members.reduce((a, m) => a + m.currentHp, 0),
    maxHp: members.reduce((a, m) => a + m.maxHp, 0),
    attackRange: 26, fireRate: 1, lastFireTime: 0,
    damagePerVolley: 20, critChance: 0.1,
    moveSpeed: 4,
    state: 'combat',
    manualOrder: false,
    targetPos: null,
    targetZombieId: null,
    isDeployed: true,
    killCount: 0,
    isInSafeZone: false,
    members,
  } as unknown as TacticalSquadUnit;
}

// ----------------------------------------------------------------
// 1. Disbanding after casualties only returns ALIVE members
// ----------------------------------------------------------------

test('disbanding a squad with casualties never resurrects dead members into the pool', () => {
  let state = makeState();
  const created = createSquad(state, 'Alpha', 'n_miller', 3);
  assert.equal(created.success, true);
  state = created.newState;
  assert.equal(state.squads[0].generalCount, 3);

  // The combat tick kills 2 anonymous recruits. The sim loop reconciles this
  // into the settlement the same way: deadCount += 2, population total -= 2.
  state = {
    ...state,
    squads: state.squads.map((sq) =>
      sq.id === state.squads[0].id ? { ...sq, deadCount: 2 } : sq
    ),
    generalPopulation: { ...state.generalPopulation, total: 8 },
  };

  const disbanded = disbandSquad(state, state.squads[0].id);
  assert.equal(disbanded.success, true);
  const after = disbanded.newState;

  // Only the 1 surviving recruit may re-enter the workforce: inSquads 0 (squad
  // gone) and the population total already excludes the 2 casualties.
  assert.equal(after.squads.length, 0);
  assert.equal(after.generalPopulation.total, 8, 'casualties stay dead — total never bounces back');
  assert.equal(after.generalPopulation.inSquads, 0, 'no phantom in-squad slots remain');

  // The named leader returns to the unassigned pool and stays reassignable.
  const miller = after.namedSurvivors.find((s) => s.id === 'n_miller');
  assert.ok(miller, 'leader still exists in the colony');
  assert.equal(miller!.role.type, 'unassigned', 'leader is reassignable after disband');

  // And they can immediately lead a new squad.
  const recreated = createSquad(after, 'Bravo', 'n_miller', 1);
  assert.equal(recreated.success, true);
  assert.equal(recreated.newState.squads[0].leaderId, 'n_miller');
});

test('disbanding a fully-wiped squad returns nobody', () => {
  let state = makeState();
  const created = createSquad(state, 'Alpha', 'n_miller', 3);
  state = created.newState;
  // All 3 recruits fell (leaderless-squad wipe path: generalCount 3, deadCount 3).
  state = {
    ...state,
    squads: state.squads.map((sq) =>
      sq.id === state.squads[0].id ? { ...sq, deadCount: 3 } : sq
    ),
    generalPopulation: { ...state.generalPopulation, total: 7 },
  };

  const after = disbandSquad(state, state.squads[0].id).newState;
  assert.equal(after.generalPopulation.total, 7, 'no dead recruit is resurrected');
  assert.equal(after.generalPopulation.inSquads, 0);
});

// ----------------------------------------------------------------
// 2. Combat tick reports casualties (leader + general) per member kill
// ----------------------------------------------------------------

test('combat tick reports the death of a NAMED leader at member-kill time', () => {
  const state = makeState();
  // Leader-only squad: the zombie's melee victim is deterministic.
  const squad = makeCombatSquad('sq_1', [
    { id: 'sq_1_leader', name: 'Sgt. Miller', isLeader: true, isAlive: true, currentHp: 100, maxHp: 100, weaponId: 'knife', armorId: null },
  ]);

  const zombies = [createZombieUnit('brute', 0.5, 0.5, 0, true)];
  zombies[0].state = 'attacking_unit';
  zombies[0].targetUnitId = 'sq_1';

  let result: any = null;
  for (let i = 0; i < 60; i++) {
    result = tickCombatSimulation(
      zombies.map((z) => ({ ...z, lastAttackTime: 0 })),
      [{ ...squad }],
      state.adaptedBuildings,
      [],
      nightClock(),
      { x: 0, z: 0 },
      0.1,
      state
    );
    if (result.fallenHeroEvents.length > 0) break;
  }

  assert.ok(result, 'combat ran');
  assert.equal(result!.fallenHeroEvents.length, 1, 'leader death is memorialized');
  assert.equal(result!.fallenHeroEvents[0].survivorId, 'n_miller');
  assert.equal(result!.fallenHeroEvents[0].cause, 'combat_slain');
  assert.equal(result!.squadCasualties[0].leaderKilled, true);
});

test('combat tick reports anonymous recruit deaths as general casualties (never hero events)', () => {
  const state = makeState();
  // Leaderless single-recruit squad: the only member is a general.
  const squad = makeCombatSquad('sq_1', [
    { id: 'sq_1_member_0', name: 'Recruit 1', isLeader: false, isAlive: true, currentHp: 50, maxHp: 50, weaponId: 'knife', armorId: null },
  ]);

  const zombies = [createZombieUnit('brute', 0.5, 0.5, 0, true)];
  zombies[0].state = 'attacking_unit';
  zombies[0].targetUnitId = 'sq_1';

  let result: any = null;
  for (let i = 0; i < 60; i++) {
    result = tickCombatSimulation(
      zombies.map((z) => ({ ...z, lastAttackTime: 0 })),
      [{ ...squad }],
      state.adaptedBuildings,
      [],
      nightClock(),
      { x: 0, z: 0 },
      0.1,
      state
    );
    if ((result.squadCasualties || []).some((c: any) => c.generalKilled > 0)) break;
  }

  assert.ok(result, 'combat ran');
  assert.equal(result!.fallenHeroEvents.length, 0, 'anonymous deaths never produce hero records');
  assert.ok(
    result!.squadCasualties.some((c: any) => c.squadId === 'sq_1' && c.generalKilled === 1 && !c.leaderKilled),
    'recruit death reported as a general casualty'
  );
});

// ----------------------------------------------------------------
// 3. Replenishing at HQ refills dead members from the population
// ----------------------------------------------------------------

test('replenishSquad refills dead slots from the free general pool', () => {
  let state = makeState();
  const created = createSquad(state, 'Alpha', 'n_miller', 3);
  state = created.newState;
  // 2 recruits fell in the field.
  state = {
    ...state,
    squads: state.squads.map((sq) =>
      sq.id === state.squads[0].id ? { ...sq, deadCount: 2 } : sq
    ),
    generalPopulation: { ...state.generalPopulation, total: 8 },
  };

  const res = replenishSquad(state, state.squads[0].id);
  assert.equal(res.success, true, res.error || '');
  const after = res.newState;
  const squad = after.squads[0];

  assert.equal(squad.deadCount, 0, 'all dead slots restored');
  assert.equal(squad.generalCount, 3, 'roster size unchanged');
  assert.equal(after.generalPopulation.total, 8, 'no population created — replacements come from the pool');
  assert.equal(after.generalPopulation.inSquads, 3, 'three citizens now occupy the squad');
});

test('replenishSquad refuses when the colony lacks free general workers', () => {
  let state = makeState();
  const created = createSquad(state, 'Alpha', 'n_miller', 3);
  state = created.newState;
  // 2 dead recruits, but only 1 free citizen remains (1 alive member already
  // occupies the squad, so total 2 → 1 free < 2 needed).
  state = {
    ...state,
    squads: state.squads.map((sq) =>
      sq.id === state.squads[0].id ? { ...sq, deadCount: 2 } : sq
    ),
    generalPopulation: { ...state.generalPopulation, total: 2 },
  };

  const res = replenishSquad(state, state.squads[0].id);
  assert.equal(res.success, false);
  assert.match(res.error || '', /free general population/);
});

test('replenishSquad is a no-op for a squad with no fallen members', () => {
  let state = makeState();
  const created = createSquad(state, 'Alpha', 'n_miller', 3);
  state = created.newState;
  const res = replenishSquad(state, state.squads[0].id);
  assert.equal(res.success, false);
  assert.match(res.error || '', /no fallen members/i);
});

test('replenishSquad refills a leaderless squad', () => {
  let state = makeState();
  state.generalPopulation.total = 12;
  const created = createSquad(state, 'Scouts', '', 4);
  assert.equal(created.success, true);
  state = {
    ...created.newState,
    squads: created.newState.squads.map((sq) => ({ ...sq, deadCount: 2 })),
    generalPopulation: { ...created.newState.generalPopulation, total: 10 },
  };

  const res = replenishSquad(state, state.squads[0].id);
  assert.equal(res.success, true, res.error || '');
  assert.equal(res.newState.squads[0].deadCount, 0);
  assert.equal(res.newState.squads[0].generalCount, 4);
});

// ----------------------------------------------------------------
// 4. The member +/- controls operate on ALIVE members, preserving dead slots
// ----------------------------------------------------------------

test('modifySquadGeneralMembers adjusts the alive count and preserves dead slots', () => {
  let state = makeState();
  const created = createSquad(state, 'Alpha', 'n_miller', 3);
  state = created.newState;
  state = {
    ...state,
    squads: state.squads.map((sq) =>
      sq.id === state.squads[0].id ? { ...sq, deadCount: 2 } : sq
    ),
  };

  // 1 alive + 2 dead. Removing the last alive member keeps the dead slots.
  const res = modifySquadGeneralMembers(state, state.squads[0].id, 0);
  assert.equal(res.success, true);
  assert.equal(res.newState.squads[0].generalCount, 2, 'total = 0 alive + 2 dead');
  assert.equal(res.newState.squads[0].deadCount, 2, 'dead slots preserved');

  // Replenish then fills the two dead slots.
  const refilled = replenishSquad(res.newState, res.newState.squads[0].id);
  assert.equal(refilled.success, true, refilled.error || '');
  assert.equal(refilled.newState.squads[0].generalCount, 2);
  assert.equal(refilled.newState.squads[0].deadCount, 0);
});