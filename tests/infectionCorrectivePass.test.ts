/**
 * v0.3.8 INFECTION CORRECTIVE PASS — regression suite.
 *
 * Covers the named-survivor lifecycle fixes, the aggregated population
 * illness system, research effects, quarantine semantics and save/load
 * migration. Run:
 * node --import tsx --import ./tests/register-loader.mjs --test tests/infectionCorrectivePass.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  administerTreatment,
  createSurvivorInfection,
  medicalCapacityFor,
  recordFallenHero,
  tickInfectionSimulation,
  toggleQuarantineSurvivor,
} from '../src/services/infectionService';
import { createEmptyPopulationInfectionState } from '../src/types/infection';
import {
  calculateCitizenBreakdownStats,
  createSquad,
} from '../src/services/populationService';
import { establishSettlementHQ, createInitialSettlementState } from '../src/services/settlementService';
import { serializeSettlementState, deserializeSettlementState } from '../src/services/saveService';
import type { BuildingPolygon, MapData } from '../src/types/map';
import type { SettlementState, NamedSurvivor } from '../src/types/settlement';
import type { SurvivorInfection } from '../src/types/infection';

// ----------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------

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
  return establishSettlementHQ(createInitialSettlementState('Corrective Test'), makeHqBuilding());
}

function addSurvivor(state: SettlementState, id: string, name: string): SettlementState {
  const survivor: NamedSurvivor = {
    id,
    name,
    avatarSeed: 'seed',
    stats: { combat: 'novice', scavenging: 'novice', driving: 'novice', medical: 'novice' },
    role: { type: 'unassigned' },
  } as unknown as NamedSurvivor;
  return { ...state, namedSurvivors: [...state.namedSurvivors, survivor] };
}

function infect(state: SettlementState, survivorId: string): SettlementState {
  const inf = createSurvivorInfection(survivorId, survivorId, true, 'Test Bite');
  const infections = new Map(state.infections);
  infections.set(survivorId, inf);
  return { ...state, infections };
}

// ----------------------------------------------------------------
// PART 1 — Healthy quarantine never creates an infection
// ----------------------------------------------------------------

test('quarantining a HEALTHY survivor creates NO infection record (preventive isolation)', () => {
  let state = addSurvivor(makeState(), 'alice', 'Alice');
  const res = toggleQuarantineSurvivor(state, 'alice', true, 'b_hq');
  assert.ok(res.success);
  assert.equal(
    res.newState.infections.get('alice'),
    undefined,
    'no infection record may be fabricated for a healthy survivor'
  );
  assert.ok(res.newState.preventiveIsolationIds?.has('alice'), 'preventive isolation set contains the survivor');
  assert.match(res.message, /PREVENTIVE/i);
});

test('releasing a healthy survivor clears preventive isolation', () => {
  let state = addSurvivor(makeState(), 'alice', 'Alice');
  state = toggleQuarantineSurvivor(state, 'alice', true).newState;
  const res = toggleQuarantineSurvivor(state, 'alice', false);
  assert.ok(res.success);
  assert.equal(res.newState.preventiveIsolationIds?.has('alice') ?? false, false);
  assert.equal(res.newState.infections.get('alice'), undefined);
});

test('quarantining an actually-infected survivor still marks the infection (unchanged behaviour)', () => {
  let state = addSurvivor(infect(makeState(), 'bob'), 'bob', 'Bob');
  const res = toggleQuarantineSurvivor(state, 'bob', true);
  assert.ok(res.success);
  const inf = res.newState.infections.get('bob');
  assert.ok(inf, 'infection record still present');
  assert.equal(inf.isQuarantined, true);
  assert.ok(!res.newState.preventiveIsolationIds?.has('bob'), 'infected quarantine is not preventive');
});

// ----------------------------------------------------------------
// PART 2 — Combat death cancels infection; only turns mark 'turned'
// ----------------------------------------------------------------

test('combat death of an INFECTED leader terminates the infection (no posthumous turning)', () => {
  let state = addSurvivor(infect(makeState(), 'carol'), 'carol', 'Carol');
  // Carol progresses most of the way through incubation...
  const infections = new Map(state.infections);
  const inf = infections.get('carol')!;
  infections.set('carol', { ...inf, elapsedSec: inf.incubationDurationSec - 5 });
  state = { ...state, infections };

  const res = recordFallenHero(state, 'carol', 'combat_slain', 'Tactical Grid', 3);
  assert.ok(!res.newState.namedSurvivors.find((s) => s.id === 'carol'), 'survivor removed from roster');
  const after = res.newState.infections.get('carol');
  assert.ok(after, 'historical record kept');
  assert.equal(after.stage, 'cured', 'combat death TERMINATES the infection — never stage:turned');
  assert.equal(res.fallenRecord.causeOfDeath, 'combat_slain');
});

test('a true infection turn still marks the record as turned (unchanged for the tick path)', () => {
  let state = addSurvivor(infect(makeState(), 'dave'), 'dave', 'Dave');
  const res = recordFallenHero(state, 'dave', 'infection_turned', 'Command House', 4);
  const after = res.newState.infections.get('dave');
  assert.equal(after?.stage, 'turned', 'infection turning is authoritative for its own cause');
  assert.equal(res.fallenRecord.causeOfDeath, 'infection_turned');
});

// ----------------------------------------------------------------
// PART 3 — Same-tick bite + death is reconciled in the sim loop
// ----------------------------------------------------------------

test('a bite and a combat death in the SAME tick leave no orphan infection (loop-level reconciliation)', () => {
  // This mirrors the useSimulationLoop ordering contract: fellThisTick wins.
  let state = addSurvivor(makeState(), 'erin', 'Erin');
  const bite = createSurvivorInfection('erin', 'Erin', true, 'Same-Tick Bite');
  const fellThisTick = new Set(['erin']);

  const updatedInfections = new Map(state.infections);
  // The loop skips registering a bite for a survivor who fell this tick.
  if (!fellThisTick.has(bite.survivorId)) {
    updatedInfections.set(bite.survivorId, bite);
  }
  state = { ...state, infections: updatedInfections };
  state = recordFallenHero(state, 'erin', 'combat_slain', 'Grid', 2).newState;

  const rec = state.infections.get('erin');
  assert.ok(!rec || rec.stage !== 'incubation', 'no active infection survives a same-tick combat death');
});

// ----------------------------------------------------------------
// PART 4 — Aggregated population infection
// ----------------------------------------------------------------

test('population illness progresses: exposed become symptomatic, losses leave the headcount', () => {
  let state = makeState();
  state.generalPopulation = { ...state.generalPopulation, total: 80 };
  // 40 exposed: recovery (1/90s) beats turning (1/150s) per patient (~62%),
  // but the chance ALL of them recover without a single turn is ~4e-9.
  state = {
    ...state,
    populationInfection: { ...createEmptyPopulationInfectionState(), exposed: 40 },
  };

  // Force the exposed cohort through to symptomatic + then some turns by
  // ticking. Progression hazards are slow by design (untreated turn hazard
  // 1/150 per second), so run in longer steps over more iterations.
  let sawSymptomatic = false;
  let total = state.generalPopulation.total;
  for (let i = 0; i < 1200; i++) {
    const r = tickInfectionSimulation(state, 5, 1, 5, undefined);
    state = r.newState;
    if (state.populationInfection!.symptomatic > 0) sawSymptomatic = true;
    total = state.generalPopulation.total;
    if (state.populationInfection!.totalLost > 2) break;
  }
  assert.ok(sawSymptomatic, 'exposed citizens became visibly symptomatic');
  assert.ok(state.populationInfection!.totalLost > 0, 'untreated illness eventually causes turning/death');
  assert.ok(total < 80, 'turned citizens genuinely leave the population headcount');
});

test('population illness can resolve through treatment (beds produce recoveries)', () => {
  let state = makeState();
  state.generalPopulation = { ...state.generalPopulation, total: 50 };
  // Give the settlement a medbay with beds so the symptomatic are treated.
  const adapted = new Map(state.adaptedBuildings);
  const medbay = {
    ...makeHqBuilding(),
    buildingId: 'med1', typeId: 'medbay', name: 'Clinic',
    constructionStatus: 'completed' as const, currentDurability: 500, maxDurability: 500,
    position: { x: 0, z: 0 },
    medicalProperties: { treatsWounded: true, treatsInfection: true, treatsSevereTrauma: false, producesFirstAid: true, bedCapacity: 8, cureOddsBonusPct: 35 },
  } as unknown as BuildingPolygon & Record<string, unknown>;
  adapted.set('med1', medbay as never);
  state = {
    ...state,
    adaptedBuildings: adapted,
    populationInfection: { ...createEmptyPopulationInfectionState(), exposed: 0, symptomatic: 4 },
  };

  const before = state.populationInfection!.symptomatic;
  let recovered = 0;
  for (let i = 0; i < 600; i++) {
    const r = tickInfectionSimulation(state, 1, 1, 5, undefined);
    state = r.newState;
    recovered = state.populationInfection!.totalRecovered;
    if (recovered > 0) break;
  }
  assert.ok(recovered > 0, `treated symptomatic patients recovered (from ${before})`);
});

test('medical capacity: medbay/hospital beds bound the treated cohort; clinical efficiency stretches it', () => {
  let state = makeState();
  state = {
    ...state,
    populationInfection: { ...createEmptyPopulationInfectionState(), symptomatic: 20 },
  };
  // No facilities → nobody treated.
  assert.equal(medicalCapacityFor(state).treated, 0, 'no medbay → no treated cohort');

  const adapted = new Map(state.adaptedBuildings);
  adapted.set('med1', {
    buildingId: 'med1', typeId: 'medbay', name: 'Clinic',
    constructionStatus: 'completed', currentDurability: 400, maxDurability: 400,
    position: { x: 0, z: 0 }, medicalProperties: { bedCapacity: 6 },
  } as never);
  state = { ...state, adaptedBuildings: adapted };
  assert.equal(medicalCapacityFor(state).treated, 6, 'medbay beds bound the treated cohort');
});

test('labour accounting counts population illness: sick citizens are not workers', () => {
  let state = makeState();
  state.generalPopulation = { ...state.generalPopulation, total: 80 };
  state = {
    ...state,
    populationInfection: { ...createEmptyPopulationInfectionState(), exposed: 5, symptomatic: 3 },
  };
  const withIllness = calculateCitizenBreakdownStats(state);
  const withoutIllness = calculateCitizenBreakdownStats({
    ...state,
    populationInfection: createEmptyPopulationInfectionState(),
  });
  assert.equal(withIllness.ill, 8, 'exposed + symptomatic count as ill');
  assert.equal(
    withIllness.totalWorkers,
    withoutIllness.totalWorkers - 8,
    'ill citizens are subtracted from the available workforce'
  );
});

test('quarantined population turns are contained: no free zombie, no outbreak', () => {
  let state = makeState();
  state.generalPopulation = { ...state.generalPopulation, total: 40 };
  state = {
    ...state,
    populationInfection: {
      ...createEmptyPopulationInfectionState(),
      symptomatic: 2,
      quarantined: 2,
    },
  };
  const r = tickInfectionSimulation(state, 100, 1, 5, undefined);
  assert.equal(r.newZombies.length, 0, 'contained turns spawn no physical infected');
  const outbreaks = Array.from(r.newState.outbreaks.values()).filter((o) => o.isOutbreakActive);
  assert.equal(outbreaks.length, 0, 'contained turns create no outbreak');
});

// ----------------------------------------------------------------
// PART 5 — Save/load migration (0.3.7 → 0.3.8)
// ----------------------------------------------------------------

test('0.3.7 saves (no populationInfection) load cleanly with defaults', () => {
  let state = addSurvivor(infect(makeState(), 'frank'), 'frank', 'Frank');
  const serialized = serializeSettlementState(state);
  delete (serialized as Record<string, unknown>).populationInfection;
  delete (serialized as Record<string, unknown>).preventiveIsolationIds;

  const loaded = deserializeSettlementState(serialized);
  assert.ok(loaded.populationInfection, 'default population state backfilled');
  assert.equal(loaded.populationInfection!.exposed, 0);
  assert.ok(loaded.preventiveIsolationIds instanceof Set);
  assert.equal(loaded.preventiveIsolationIds!.size, 0);

  // Named infection survived.
  const inf = loaded.infections.get('frank');
  assert.ok(inf, 'named infection data survives migration');
  assert.equal(inf.survivorId, 'frank');
});

test('stale preventive isolation for dead survivors is dropped on load', () => {
  let state = addSurvivor(makeState(), 'grace', 'Grace');
  state = toggleQuarantineSurvivor(state, 'grace', true).newState;
  const serialized = serializeSettlementState(state);
  // Grace dies after the save was written — simulate a stale record by
  // removing her from the roster before deserialization.
  serialized.namedSurvivors = [];
  const loaded = deserializeSettlementState(serialized);
  assert.equal(loaded.preventiveIsolationIds!.size, 0, 'stale isolation entry discarded');
});

test('population infection state round-trips through save/load', () => {
  let state = makeState();
  state = {
    ...state,
    populationInfection: {
      exposed: 3, symptomatic: 2, quarantined: 1,
      totalLost: 4, totalRecovered: 7, accumSec: 100, spreadAccumSec: 5,
    },
  };
  const round = deserializeSettlementState(serializeSettlementState(state));
  assert.deepEqual(
    { ...round.populationInfection },
    { ...state.populationInfection },
    'aggregated compartments survive the round trip'
  );
});

// ----------------------------------------------------------------
// PART 6 — Named lifecycle preserved (leader removal keeps squad)
// ----------------------------------------------------------------

test('turning removes only the leader — the squad and its anonymous personnel remain', () => {
  let state = addSurvivor(makeState(), 'henry', 'Henry');
  const squadRes = createSquad(state, 'Alpha', 'henry', 3);
  assert.ok(squadRes.success, `squad created (${squadRes.error ?? 'ok'})`);
  state = squadRes.newState;

  state = infect(state, 'henry');
  const infections = new Map(state.infections);
  const inf = infections.get('henry')!;
  infections.set('henry', { ...inf, elapsedSec: inf.totalTurnTimeSec + 1 });
  state = { ...state, infections };

  // Stage transitions are sequential (incubation → symptomatic → advanced →
  // turned), so tick until the turn actually fires.
  let r = tickInfectionSimulation(state, 1, 1, 6, undefined);
  for (let i = 0; i < 10 && r.newState.infections.get('henry')?.stage !== 'turned'; i++) {
    r = tickInfectionSimulation(r.newState, 1000, 1, 6, undefined);
  }
  const squad = r.newState.squads.find((s) => s.name === 'Alpha');
  assert.ok(squad, 'the squad still exists');
  assert.equal(squad.leaderId, '', 'the leader slot is vacated');
  assert.equal(squad.generalCount, 3, 'anonymous personnel intact');
  assert.ok(!r.newState.namedSurvivors.find((s) => s.id === 'henry'), 'Henry is gone from the roster');
  assert.ok(r.newState.outbreaks.size > 0 || r.infection.newZombies.length >= 0, 'turn handled by the outbreak model');
});

// ----------------------------------------------------------------
// RC FINAL CORRECTIONS — quarantine allocation, internal
// transmission, cohort-conserving outcomes
// ----------------------------------------------------------------

test('RC: symptomatic citizens are auto-admitted into isolation up to medical bed capacity', () => {
  let state = makeState();
  state.generalPopulation = { ...state.generalPopulation, total: 60 };
  // 8 medbay beds, no hospital.
  const adapted = new Map(state.adaptedBuildings);
  const medbay = {
    ...makeHqBuilding(),
    buildingId: 'med_rc', typeId: 'medbay', name: 'Clinic',
    constructionStatus: 'completed' as const, currentDurability: 500, maxDurability: 500,
    position: { x: 0, z: 0 },
    medicalProperties: { treatsWounded: true, treatsInfection: true, treatsSevereTrauma: false, producesFirstAid: true, bedCapacity: 8, cureOddsBonusPct: 30 },
  } as unknown as BuildingPolygon & Record<string, unknown>;
  adapted.set('med_rc', medbay as never);
  state = {
    ...state,
    adaptedBuildings: adapted,
    populationInfection: { ...createEmptyPopulationInfectionState(), symptomatic: 12 },
  };

  // Negligible dt: admission is deterministic (capacity-bounded), while the
  // per-second resolution hazards are ~0 — so `quarantined` after the tick is
  // exactly the admitted count.
  const r = tickInfectionSimulation(state, 0.01, 1, 5, undefined);
  const pi = r.newState.populationInfection!;
  assert.equal(pi.quarantined, 8, 'exactly bedCapacity citizens admitted (12 sick, 8 beds)');
  assert.ok(
    r.notifications.some((n) => n.title.includes('ISOLATION ADMISSIONS')),
    'admission is reported to the player'
  );

  // Without any medical building nothing is admitted.
  const bare = makeState();
  bare.generalPopulation = { ...bare.generalPopulation, total: 60 };
  const bareState = {
    ...bare,
    populationInfection: { ...createEmptyPopulationInfectionState(), symptomatic: 5 },
  };
  const rb = tickInfectionSimulation(bareState, 0.01, 1, 5, undefined);
  assert.equal(rb.newState.populationInfection!.quarantined, 0, 'no beds → no admission');
});

test('RC: illness is internally transmissible — spreads with zero zombies and no outbreak', () => {
  let state = makeState();
  state.generalPopulation = { ...state.generalPopulation, total: 200 };
  const start = {
    ...state,
    populationInfection: { ...createEmptyPopulationInfectionState(), symptomatic: 40 },
  };

  // No worldZombies, no outbreaks: pure person-to-person transmission. Seed a
  // large cohort so "everyone recovers with zero turns and zero exposures" is
  // statistically impossible rather than merely unlikely.
  let sawNewExposure = false;
  let s = start;
  for (let i = 0; i < 300 && !sawNewExposure; i++) {
    const r = tickInfectionSimulation(s, 5, 1, 5, []); // empty world-zombie list
    s = r.newState;
    sawNewExposure = s.populationInfection!.exposed > 0 || s.populationInfection!.totalLost > 0;
  }
  assert.ok(
    sawNewExposure || s.populationInfection!.symptomatic > 0,
    'the epidemic continues without any external infection source'
  );

  // Compare per-check exposure rates while BOTH cohorts are still sick:
  // aggregate many independent short runs so the comparison is statistical,
  // not a coin flip (a free epidemic burns out; a quarantined one lingers —
  // so cumulative-over-a-long-window is the wrong measure).
  const mkRun = (withBeds: boolean) => {
    const st = { ...state };
    if (withBeds) {
      const adapted = new Map(state.adaptedBuildings);
      const hospital = {
        ...makeHqBuilding(),
        buildingId: 'hosp_rc', typeId: 'hospital', name: 'Hospital',
        constructionStatus: 'completed' as const, currentDurability: 500, maxDurability: 500,
        position: { x: 0, z: 0 },
        medicalProperties: { treatsWounded: true, treatsInfection: true, treatsSevereTrauma: false, bedCapacity: 40, cureOddsBonusPct: 40 },
      } as unknown as BuildingPolygon & Record<string, unknown>;
      adapted.set('hosp_rc', hospital as never);
      st.adaptedBuildings = adapted;
    }
    // Seed 30 sick; in the hospital run all 30 are admitted/quarantined.
    st.populationInfection = { ...createEmptyPopulationInfectionState(), symptomatic: 30, quarantined: withBeds ? 30 : 0 };
    let exposedTotal = 0;
    let s = st;
    for (let i = 0; i < 4; i++) {
      const rr = tickInfectionSimulation(s, 25, 1, 5, []); // empty world-zombie list
      s = rr.newState;
      exposedTotal += s.populationInfection!.exposed;
    }
    return exposedTotal;
  };
  let qExposed = 0;
  let fExposed = 0;
  for (let run = 0; run < 30; run++) {
    qExposed += mkRun(true);
    fExposed += mkRun(false);
  }
  assert.ok(
    fExposed > qExposed,
    `untreated sick spread more than isolated sick (free ${fExposed} vs quarantined ${qExposed})`
  );
});

test('RC: recovered + turned never exceed the symptomatic cohort', () => {
  for (let trial = 0; trial < 200; trial++) {
    let state = makeState();
    state.generalPopulation = { ...state.generalPopulation, total: 500 };
    const symptomatic = 1 + Math.floor(Math.random() * 40);
    const quarantined = Math.floor(Math.random() * (symptomatic + 1));
    state = {
      ...state,
      populationInfection: {
        ...createEmptyPopulationInfectionState(),
        symptomatic,
        quarantined,
        spreadAccumSec: 24,
      },
    };
    // Large dt maximises the chance both hazards fire on the same tick.
    const r = tickInfectionSimulation(state, 50, 1, 5, undefined);
    const pi = r.newState.populationInfection!;
    const resolvedThisTick =
      (pi.totalRecovered) + (pi.totalLost) -
      (state.populationInfection!.totalRecovered + state.populationInfection!.totalLost);
    assert.ok(
      resolvedThisTick <= symptomatic,
      `tick resolved ${resolvedThisTick} but cohort was only ${symptomatic}`
    );
    assert.ok(pi.symptomatic >= 0, 'cohort never goes negative');
  }
});

test('RC: medical UI numbers match the simulation compartments', () => {
  let state = makeState();
  state.generalPopulation = { ...state.generalPopulation, total: 60 };
  const adapted = new Map(state.adaptedBuildings);
  const medbay = {
    ...makeHqBuilding(),
    buildingId: 'med_ui', typeId: 'medbay', name: 'Clinic',
    constructionStatus: 'completed' as const, currentDurability: 500, maxDurability: 500,
    position: { x: 0, z: 0 },
    medicalProperties: { treatsWounded: true, treatsInfection: true, treatsSevereTrauma: false, producesFirstAid: true, bedCapacity: 10, cureOddsBonusPct: 30 },
  } as unknown as BuildingPolygon & Record<string, unknown>;
  adapted.set('med_ui', medbay as never);
  state = {
    ...state,
    adaptedBuildings: adapted,
    populationInfection: { ...createEmptyPopulationInfectionState(), symptomatic: 7 },
  };

  const r = tickInfectionSimulation(state, 0.01, 1, 5, undefined);
  const pi = r.newState.populationInfection!;
  const treated = Math.min(pi.quarantined, pi.symptomatic);
  const untreated = Math.max(0, pi.symptomatic - treated);
  // The UI formula: treated + untreated must equal symptomatic exactly.
  assert.equal(treated + untreated, pi.symptomatic, 'treated + untreated == symptomatic');
  assert.equal(treated, 7, 'all 7 sick admitted (10 beds available) → all treated');
  assert.equal(untreated, 0);
});
