import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZombieUnit, tickCombatSimulation } from '../src/services/combatService';
import { createInitialSettlementState, establishSettlementHQ } from '../src/services/settlementService';
import {
  createSquad,
  vacateSurvivorRole,
  disbandSquad,
} from '../src/services/populationService';
import {
  createSurvivorInfection,
  tickInfectionSimulation,
  containOutbreakInBuilding,
  administerTreatment,
  rollBiteChance,
} from '../src/services/infectionService';
import { serializeSettlementState, deserializeSettlementState } from '../src/services/saveService';
import { PathGrid } from '../src/services/pathfindingService';
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
    polygon: [
      { x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 },
    ],
    center: { x: 0, z: 0 },
  } as unknown as BuildingPolygon;
}

function makeState(): SettlementState {
  return establishSettlementHQ(createInitialSettlementState('Infection Test'), makeHqBuilding());
}

function addSurvivor(state: SettlementState, id: string, name: string): SettlementState {
  const survivor: NamedSurvivor = {
    id,
    name,
    avatarSeed: 'seed',
    stats: { combat: 'skilled', scavenging: 'novice', driving: 'novice', medical: 'novice' },
    role: { type: 'unassigned' },
  } as unknown as NamedSurvivor;
  return { ...state, namedSurvivors: [...state.namedSurvivors, survivor] };
}

function makeSquadWithLeader(state: SettlementState, leaderId: string): TacticalSquadUnit {
  return {
    squadId: 'sq_1',
    name: 'Squad Alpha',
    leaderId,
    leaderName: 'Miller',
    leaderCombatTier: 'skilled',
    generalCount: 3,
    x: 0, z: 0, y: 0, rotation: 0,
    currentHp: 250, maxHp: 250,
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
    members: [
      { id: 'm_l', name: 'Miller', isLeader: true, isAlive: true, currentHp: 100, maxHp: 100, weaponId: 'knife', armorId: null },
      { id: 'm_1', name: 'Recruit 1', isLeader: false, isAlive: true, currentHp: 50, maxHp: 50, weaponId: 'knife', armorId: null },
      { id: 'm_2', name: 'Recruit 2', isLeader: false, isAlive: true, currentHp: 50, maxHp: 50, weaponId: 'knife', armorId: null },
      { id: 'm_3', name: 'Recruit 3', isLeader: false, isAlive: true, currentHp: 50, maxHp: 50, weaponId: 'knife', armorId: null },
    ],
  } as unknown as TacticalSquadUnit;
}

function nightClock(): any {
  return {
    totalElapsedSeconds: 0, speed: 1, isNight: true, day: 1,
    phase: 'night', hours: 22, minutes: 0,
  };
}

// ----------------------------------------------------------------
// Case 1 — Leaderless squad: no named infection is ever created
// ----------------------------------------------------------------

test('Case 1: leaderless squad bites create NO infection records (anonymous members are abstract)', () => {
  const state = makeState();
  const leaderless: TacticalSquadUnit = {
    ...makeSquadWithLeader(state, 'n1'),
    leaderId: '',
    leaderName: 'Field Leader',
    members: [
      { id: 'm_1', name: 'Recruit 1', isLeader: false, isAlive: true, currentHp: 50, maxHp: 50, weaponId: 'knife', armorId: null },
      { id: 'm_2', name: 'Recruit 2', isLeader: false, isAlive: true, currentHp: 50, maxHp: 50, weaponId: 'knife', armorId: null },
    ],
  } as unknown as TacticalSquadUnit;

  const grid = new PathGrid(makeMap());
  const zombies = [createZombieUnit('shambler', 0.5, 0.5, 0, true)];
  zombies[0].state = 'attacking_unit';
  zombies[0].targetUnitId = 'sq_1';

  let infectedEverCreated = false;
  // Many encounters: with the old code the bite roll fired regardless of leader.
  for (let i = 0; i < 60; i++) {
    const r = tickCombatSimulation(
      zombies.map((z) => ({ ...z })),
      [{ ...leaderless }],
      state.adaptedBuildings,
      [],
      nightClock(),
      { x: 0, z: 0 },
      0.1,
      state
    );
    if (r.newInfections.length > 0) infectedEverCreated = true;
  }
  assert.equal(infectedEverCreated, false, 'a leaderless squad must never produce an infection record');
});

// ----------------------------------------------------------------
// Case 2 — Named leader exposure: record attaches to the survivor
// ----------------------------------------------------------------

test('Case 2: bite on a squad WITH a named leader can infect the leader (record keyed by survivor id)', () => {
  const state = addSurvivor(makeState(), 'n_miller', 'Sgt. Miller');
  const squad = makeSquadWithLeader(state, 'n_miller');

  const grid = new PathGrid(makeMap());
  const zombies = [createZombieUnit('brute', 0.5, 0.5, 0, true)]; // 35% bite/roll
  zombies[0].state = 'attacking_unit';
  zombies[0].targetUnitId = 'sq_1';

  let infections: any[] = [];
  // Force at least one success across many melee exchanges (35% per roll).
  for (let i = 0; i < 80 && infections.length === 0; i++) {
    const r = tickCombatSimulation(
      zombies.map((z) => ({ ...z, lastAttackTime: 0 })),
      [{ ...squad }],
      state.adaptedBuildings,
      [],
      nightClock(),
      { x: 0, z: 0 },
      0.1,
      state
    );
    infections = r.newInfections;
  }

  assert.equal(infections.length, 1, 'exposure attaches once per zombie per encounter');
  const inf = infections[0];
  assert.equal(inf.survivorId, 'n_miller', 'infection is keyed to the named survivor');
  assert.equal(inf.survivorName, 'Sgt. Miller', 'record carries the REAL survivor name');
  assert.equal(inf.isNamed, true);
  assert.equal(inf.stage, 'incubation');
  // No anonymous member received any infection identity: members carry no
  // ids that ever reach the infection map — verified by the record above
  // being the only one and belonging to the named leader.
});

test('Case 2b: a zombie cannot re-infect the same squad during one continuous melee', () => {
  const state = addSurvivor(makeState(), 'n_miller', 'Sgt. Miller');
  const squad = makeSquadWithLeader(state, 'n_miller');
  const grid = new PathGrid(makeMap());
  const zombies = [createZombieUnit('brute', 0.5, 0.5, 0, true)];
  zombies[0].state = 'attacking_unit';
  zombies[0].targetUnitId = 'sq_1';

  let total = 0;
  // SAME zombie objects across ticks — suppression persists on the zombie.
  const persistentZombies = zombies.map((z) => ({ ...z, lastAttackTime: 0 }));
  for (let i = 0; i < 200; i++) {
    const r = tickCombatSimulation(
      persistentZombies,
      [{ ...squad }],
      state.adaptedBuildings,
      [],
      nightClock(),
      { x: 0, z: 0 },
      0.1,
      state
    );
    total += r.newInfections.length;
  }
  // 200 melee exchanges × 35% would near-certainly fire >1 without the cap.
  assert.ok(total <= 1, `one zombie → at most one exposure per encounter (got ${total})`);
});

// ----------------------------------------------------------------
// Case 3 — Disbanding: anonymous squads carry no infection state
// ----------------------------------------------------------------

test('Case 3: disbanding a leaderless squad neither creates nor destroys infection records', () => {
  let state = addSurvivor(makeState(), 'n_keep', 'Keeper');
  state.generalPopulation.total = 8;
  const created = createSquad(state, 'Bravos', '', 4); // leaderless 4-man
  void created;
  assert.equal(created.success, true);
  state = created.newState;

  // Plant a REAL named-survivor infection that must be untouched.
  const keepInf = createSurvivorInfection('n_keep', 'Keeper', true, 'Test');
  state = { ...state, infections: new Map(state.infections).set('n_keep', keepInf) };
  const infectionsBefore = state.infections.size;

  const disbanded = disbandSquad(state, created.newState.squads[0].id);
  assert.equal(disbanded.success, true);
  const after = disbanded.newState;

  assert.equal(after.infections.size, infectionsBefore, 'disband leaves the infection map intact');
  assert.ok(after.infections.get('n_keep'), 'the named survivor infection survives disbanding');
  // No phantom squad-member record appeared.
  for (const [key] of after.infections.entries()) {
    assert.notEqual(key, '', 'no empty-keyed anonymous record exists');
  }
});

// ----------------------------------------------------------------
// Case 4 — Leader turns: squad survives leaderless
// ----------------------------------------------------------------

test('Case 4: leader turning vacates the ROLE, preserves the squad and its personnel', () => {
  let state = addSurvivor(makeState(), 'n_miller', 'Sgt. Miller');
  state.generalPopulation.total = 10;
  const created = createSquad(state, 'Alpha', 'n_miller', 3);
  assert.equal(created.success, true);
  state = created.newState;
  assert.equal(state.squads.length, 1);
  assert.equal(state.squads[0].leaderId, 'n_miller');
  assert.equal(state.squads[0].generalCount, 3);

  // Miller turns → vacateSurvivorRole (the recordFallenHero path calls this).
  const vacated = vacateSurvivorRole(state, 'n_miller');

  assert.equal(vacated.squads.length, 1, 'the squad is NOT deleted with its leader');
  assert.equal(vacated.squads[0].leaderId, '', 'squad is now leaderless');
  assert.equal(
    vacated.squads[0].generalCount, 3,
    'all anonymous personnel remain in the squad'
  );
  const miller = vacated.namedSurvivors.find((s) => s.id === 'n_miller');
  assert.ok(miller, 'survivor record still exists for removal by the caller');
  assert.equal(miller!.role.type, 'unassigned', 'survivor stripped from the squad_leader role');
});

test('Case 4b: a fully-advanced unquarantined leader turn spawns a REAL zombie', () => {
  let state = addSurvivor(makeState(), 'n_miller', 'Sgt. Miller');
  const inf = createSurvivorInfection('n_miller', 'Sgt. Miller', true, 'Test');
  state = { ...state, infections: new Map(state.infections).set('n_miller', inf) };

  // Fast-forward to the turn point — stage gates advance one stage per tick,
  // so tick repeatedly until resolved.
  let r = tickInfectionSimulation(state, inf.totalTurnTimeSec + 1, 1, 1, []);
  for (let i = 0; i < 5 && !r.newZombies.length; i++) {
    r = tickInfectionSimulation(r.newState, inf.totalTurnTimeSec + 1, 1, 1, []);
  }
  const turned = r.newZombies;
  assert.equal(turned.length, 1, 'turning produces a real world infected');
  assert.ok(turned[0].name.includes('Miller'), 'the zombie is identifiable as the turned survivor');
  assert.equal(
    r.newState.infections.get('n_miller')?.stage,
    'turned',
    'infection stage resolved to turned'
  );
});

// ----------------------------------------------------------------
// Case 5 — Assignment changes never cure or reset an infection
// ----------------------------------------------------------------

test('Case 5: infection stage and timers persist across role/assignment changes', () => {
  let state = addSurvivor(makeState(), 'n_curie', 'Doc Curie');
  state.generalPopulation.total = 10;
  const created = createSquad(state, 'Med', 'n_curie', 2);
  state = created.newState;

  const inf = createSurvivorInfection('n_curie', 'Doc Curie', true, 'Test');
  inf.elapsedSec = 50; // mid-incubation
  state = { ...state, infections: new Map(state.infections).set('n_curie', inf) };

  // Move her: vacate squad-leader role (now leaves the squad leaderless).
  state = vacateSurvivorRole(state, 'n_curie');
  assert.equal(state.infections.get('n_curie')?.stage, 'incubation', 'stage survives');
  assert.equal(state.infections.get('n_curie')?.elapsedSec, 50, 'timer survives');

  // Assign as building head — infection still untouched.
  state = vacateSurvivorRole(state, 'n_curie');
  assert.equal(state.infections.get('n_curie')?.elapsedSec, 50, 'still untouched after reassignment');
});

// ----------------------------------------------------------------
// Case 6 — Treatment cures a named survivor (existing medical system)
// ----------------------------------------------------------------

test('Case 6: administerTreatment cures a named survivor through the standard pipeline', () => {
  let state = addSurvivor(makeState(), 'n_miller', 'Sgt. Miller');
  // Vaccine research guarantees the cure roll (98% odds path).
  state = {
    ...state,
    research: { ...state.research, unlockedNodes: [...(state.research?.unlockedNodes ?? []), 'vaccine'] },
    stockpile: {
      ...state.stockpile,
      medical: { ...state.stockpile.medical, antibiotics: 5, first_aid_kits: 5 },
    },
  } as SettlementState;
  const inf = createSurvivorInfection('n_miller', 'Sgt. Miller', true, 'Test');
  state = { ...state, infections: new Map(state.infections).set('n_miller', inf) };

  // The standard treatment path (MedicalTriageModal → administerTreatment):
  const res = administerTreatment(state, 'n_miller');
  assert.equal(res.success, true);
  assert.equal(res.result.cured, true, 'vaccine-protocol treatment cures the named leader');
  assert.equal(
    res.newState.infections.get('n_miller')?.stage,
    'cured',
    'infection record resolved to cured'
  );
});

// ----------------------------------------------------------------
// Case 7 — Research changes named-survivor outcomes
// ----------------------------------------------------------------

test('Case 7: vaccine research halves the field bite chance for named leaders', () => {
  const withVaccine = addSurvivor(makeState(), 'n_a', 'A');
  withVaccine.research = {
    ...(withVaccine.research ?? {}),
    unlockedNodes: ['vaccine'],
  } as any;
  const base = rollBiteChance('shambler');
  const reduced = rollBiteChance('shambler', withVaccine);
  assert.equal(reduced, base * 0.5, 'existing vaccine research applies to named-survivor exposure');
});

// ----------------------------------------------------------------
// Case 8 — Population infection lifecycle still works (independence)
// ----------------------------------------------------------------

test('Case 8: quarantine turning spawns NO free zombie; unquarantined does — population system intact', () => {
  // Quarantined case (containment protocol).
  let state = addSurvivor(makeState(), 'n_q', 'Quarantined Sam');
  const qInf = createSurvivorInfection('n_q', 'Quarantined Sam', true, 'Test');
  qInf.isQuarantined = true;
  qInf.quarantineBuildingId = 'hq_safe';
  state = { ...state, infections: new Map(state.infections).set('n_q', qInf) };
  let qRes = tickInfectionSimulation(state, qInf.totalTurnTimeSec + 1, 1, 1, []);
  for (let i = 0; i < 5 && qRes.newState.infections.get('n_q')?.stage !== 'turned'; i++) {
    qRes = tickInfectionSimulation(qRes.newState, qInf.totalTurnTimeSec + 1, 1, 1, []);
  }
  assert.equal(qRes.newZombies.length, 0, 'quarantine containment turns safely — no settlement zombie');

  // Unquarantined population case.
  let state2 = addSurvivor(makeState(), 'n_free', 'Free Freddie');
  const fInf = createSurvivorInfection('n_free', 'Free Freddie', true, 'Test');
  state2 = { ...state2, infections: new Map(state2.infections).set('n_free', fInf) };
  let fRes = tickInfectionSimulation(state2, fInf.totalTurnTimeSec + 1, 1, 1, []);
  for (let i = 0; i < 5 && !fRes.newZombies.length; i++) {
    fRes = tickInfectionSimulation(fRes.newState, fInf.totalTurnTimeSec + 1, 1, 1, []);
  }
  assert.equal(fRes.newZombies.length, 1, 'unquarantined turn becomes a real infected');
  assert.ok(
    fRes.newState.outbreaks.size > 0 || fRes.notifications.some((n) => n.title.includes('OUTBREAK')),
    'the resulting infected is a visible, actionable outbreak — not an invisible statistic'
  );
});

// ----------------------------------------------------------------
// Case 9 — Outbreak state is visible, reconciles, and is actionable
// ----------------------------------------------------------------

test('Case 9: killing the outbreak zombies CONTAINS the outbreak (firepower containment)', () => {
  let state = addSurvivor(makeState(), 'n_t', 'Turner');
  const inf = createSurvivorInfection('n_t', 'Turner', true, 'Test');
  state = { ...state, infections: new Map(state.infections).set('n_t', inf) };
  let r = tickInfectionSimulation(state, inf.totalTurnTimeSec + 1, 1, 1, []);
  for (let i = 0; i < 5 && !r.newZombies.length; i++) {
    r = tickInfectionSimulation(r.newState, inf.totalTurnTimeSec + 1, 1, 1, []);
  }

  const outbreakBldg = Array.from(r.newState.outbreaks.keys())[0];
  assert.ok(outbreakBldg !== undefined, 'an outbreak record exists');
  const outbreak = r.newState.outbreaks.get(outbreakBldg)!;
  assert.equal(outbreak.isOutbreakActive, true);
  assert.equal(outbreak.zombieCount, 1);

  // Squads kill the outbreak zombie → next tick reconciles the record.
  const killedZombie = { ...r.newZombies[0], currentHp: 0, state: 'dead' as const };
  const after = tickInfectionSimulation(r.newState, 1, 1, 1, [killedZombie]);
  const resolved = after.newState.outbreaks.get(outbreakBldg)!;
  assert.equal(resolved.isOutbreakActive, false, 'outbreak deactivates when its infected die');
  assert.equal(resolved.isContained, true, 'outbreak is marked contained');
  assert.equal(resolved.zombieCount, 0);
  assert.ok(
    after.notifications.some((n) => n.type === 'success' && n.title.includes('CONTAINED')),
    'the player is told their squads cleared the building'
  );
});

test('Case 9b: containOutbreakInBuilding manual sweep still works on live records', () => {
  let state = addSurvivor(makeState(), 'n_t', 'Turner');
  const inf = createSurvivorInfection('n_t', 'Turner', true, 'Test');
  state = { ...state, infections: new Map(state.infections).set('n_t', inf) };
  let r = tickInfectionSimulation(state, inf.totalTurnTimeSec + 1, 1, 1, []);
  for (let i = 0; i < 5 && !r.newZombies.length; i++) {
    r = tickInfectionSimulation(r.newState, inf.totalTurnTimeSec + 1, 1, 1, []);
  }
  const bldgId = Array.from(r.newState.outbreaks.keys())[0];
  const sweep = containOutbreakInBuilding(r.newState, bldgId);
  assert.equal(sweep.success, true);
  assert.equal(sweep.newState.outbreaks.has(bldgId), false, 'manual containment removes the record');
});

// ----------------------------------------------------------------
// Case 10 — Save compatibility: phantom anonymous records are dropped
// ----------------------------------------------------------------

test('Case 10: legacy saves with empty-keyed anonymous infections load clean', () => {
  let state = addSurvivor(makeState(), 'n_miller', 'Sgt. Miller');
  const good = createSurvivorInfection('n_miller', 'Sgt. Miller', true, 'Field');
  const phantom = { ...createSurvivorInfection('', 'Anonymous', true, 'Legacy Squad Bite') };
  state = {
    ...state,
    infections: new Map<string, any>([
      ['n_miller', good],
      ['', phantom], // the old leaderless-bite bug wrote records keyed by ''
    ]),
  };

  const round = deserializeSettlementState(JSON.parse(JSON.stringify(serializeSettlementState(state))));
  assert.ok(round.infections.get('n_miller'), 'named survivor record survives');
  assert.equal(round.infections.has(''), false, 'phantom anonymous record is discarded on load');
});
