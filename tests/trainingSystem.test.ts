import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startSquadTraining,
  stopSquadTraining,
  tickSquadTraining,
  getSquadTrainingBonus,
  TRAINING_BASE_AMMO_PER_DAY,
} from '../src/services/trainingService';
import { getPoweredBuildingIds } from '../src/services/powerService';
import { TRAINING_TIER_LABELS, createEmptyTrainingState } from '../src/types/training';
import type { SettlementState } from '../src/types/settlement';

const DAY = 600;

function mkState(): SettlementState {
  return {
    adaptedBuildings: new Map(),
    freestandingBuildings: [],
    stockpile: {
      water: { rainwater: 0, purified_water: 0, bottled_water: 0 },
      food: { fresh_harvest: 0, dried_rations: 0, canned_goods: 0, mre_rations: 0 },
      medical: { first_aid_kits: 0, medicine: 0, antibiotics: 0, vaccine: 0, bandages: 0 },
      ammo: { sharedPool: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      materials: { wood: 0, metal: 0, bricks: 0, tools: 0 },
    },
    trainingState: createEmptyTrainingState(),
    powerState: { generators: new Map(), batteries: new Map(), supplyKw: 0, demandKw: 0, poweredBuildingIds: [], lowFuel: false },
    research: { unlockedNodes: [], researchPoints: 0 },
    generalPopulation: { total: 0, unassigned: 0, inSquads: 0, children: [] },
    namedSurvivors: [],
    squads: [
      {
        id: 'sq1',
        name: 'Alpha',
        memberIds: [],
        members: [],
        trainingTier: 0,
      } as any,
    ],
    deconstructionJobs: new Map(),
    constructionOrders: [],
    headquarters: [],
  } as unknown as SettlementState;
}

/** Adds a powered shooting range + the squad roster. */
function poweredRange(state: SettlementState): SettlementState {
  return {
    ...state,
    adaptedBuildings: new Map([
      [
        'range',
        {
          buildingId: 'range',
          typeId: 'shooting_range',
          name: 'Shooting Range',
          constructionStatus: 'completed',
          currentDurability: 100,
          isUnderRepair: false,
          assignedWorkers: 3,
        } as any,
      ],
    ]),
    powerState: { generators: new Map(), batteries: new Map(), supplyKw: 50, demandKw: 0, poweredBuildingIds: ['range'], lowFuel: false },
    stockpile: { ...state.stockpile, ammo: { sharedPool: 100 } },
  };
}

test('starting training requires a powered range and enough ammo for the next tier', () => {
  // No range at all.
  const plain = mkState();
  const noRange = startSquadTraining(plain, 'sq1', 0);
  assert.equal(noRange.ok, false);
  assert.match(noRange.error || '', /Shooting Range/i);

  // Range but no power.
  const unpowered = {
    ...poweredRange(mkState()),
    powerState: { generators: new Map(), batteries: new Map(), supplyKw: 0, demandKw: 0, poweredBuildingIds: [], lowFuel: false },
  };
  const dark = startSquadTraining(unpowered, 'sq1', 0);
  assert.equal(dark.ok, false);
  assert.match(dark.error || '', /powered/i);

  // Powered range but no ammo.
  const broke = { ...poweredRange(mkState()), stockpile: { ...mkState().stockpile, ammo: { sharedPool: 3 } } };
  const noAmmo = startSquadTraining(broke, 'sq1', 0);
  assert.equal(noAmmo.ok, false);
  assert.match(noAmmo.error || '', /ammunition/i);

  // Everything in place → session created.
  const ok = startSquadTraining(poweredRange(mkState()), 'sq1', 100);
  assert.equal(ok.ok, true);
  assert.equal(ok.session!.tier, 0);
  assert.equal(ok.session!.rangeBuildingId, 'range');
});

test('training consumes ammo over time and promotes the squad at the tier threshold', () => {
  let state = poweredRange(mkState());
  const started = startSquadTraining(state, 'sq1', 0);
  assert.equal(started.ok, true);
  state = {
    ...state,
    trainingState: { sessions: new Map([[started.session!.squadId, started.session!]]), totalAmmoSpent: 0 },
  };

  // Half a day of training → some ammo consumed, no promotion yet.
  const half = tickSquadTraining(state, DAY / 2, 300);
  const session = half.newState.trainingState!.sessions.get('sq1')!;
  assert.ok(session.progressSec > 0, 'progress advances');
  assert.ok(half.newState.stockpile.ammo.sharedPool < 100, 'ammo consumed during training');
  assert.equal(half.newState.squads![0].trainingTier, 0, 'still untrained');

  // Finish the first tier (600s) → Basic.
  let r = tickSquadTraining(half.newState, DAY, 1200);
  assert.equal(r.newState.squads![0].trainingTier, 1, 'promoted to Basic');
  assert.equal(TRAINING_TIER_LABELS[r.newState.squads![0].trainingTier], 'Basic');
  assert.ok(r.events.some((e) => e.title.includes('TRAINING COMPLETE')), 'promotion announced');
});

test('a dark range holds training progress without consuming ammo', () => {
  let state = poweredRange(mkState());
  const started = startSquadTraining(state, 'sq1', 0);
  state = {
    ...state,
    trainingState: { sessions: new Map([[started.session!.squadId, started.session!]]), totalAmmoSpent: 0 },
  };

  const dark = {
    ...state,
    powerState: { generators: new Map(), batteries: new Map(), supplyKw: 0, demandKw: 0, poweredBuildingIds: [], lowFuel: false },
  };
  const r = tickSquadTraining(dark, DAY, 600);
  const session = r.newState.trainingState!.sessions.get('sq1')!;
  assert.equal(session.progressSec, 0, 'no progress without power');
  assert.equal(r.newState.stockpile.ammo.sharedPool, 100, 'no ammo drawn without power');
});

test('an ammo-dry range holds progress instead of going negative', () => {
  let state = poweredRange(mkState());
  const started = startSquadTraining(state, 'sq1', 0);
  state = {
    ...state,
    trainingState: { sessions: new Map([[started.session!.squadId, started.session!]]), totalAmmoSpent: 0 },
    stockpile: { ...state.stockpile, ammo: { sharedPool: 0 } },
  };
  const r = tickSquadTraining(state, DAY, 600);
  const session = r.newState.trainingState!.sessions.get('sq1')!;
  assert.equal(session.progressSec, 0, 'no progress without ammo');
});

test('tiers compound into combat bonuses and cap at Expert', () => {
  const b0 = getSquadTrainingBonus(0);
  const b4 = getSquadTrainingBonus(4);
  assert.ok(b4.dmgMultiplier > b0.dmgMultiplier, 'damage grows with tier');
  assert.ok(b4.critBonus > b0.critBonus, 'crit grows with tier');
  assert.ok(b4.fireRateMultiplier < b0.fireRateMultiplier, 'fire rate improves with tier');
  assert.equal(b4.dmgMultiplier, 1 + 0.06 * 4);

  // An Expert squad cannot start a new session.
  const expert = {
    ...poweredRange(mkState()),
    squads: [{ id: 'sq1', name: 'Alpha', trainingTier: 4 } as any],
  };
  const r = startSquadTraining(expert, 'sq1', 0);
  assert.equal(r.ok, false);
  assert.match(r.error || '', /Expert/i);
});

test('a range with no range officers cannot start training', () => {
  const unstaffed = {
    ...poweredRange(mkState()),
    adaptedBuildings: new Map([
      [
        'range',
        {
          buildingId: 'range',
          typeId: 'shooting_range',
          name: 'Shooting Range',
          constructionStatus: 'completed',
          currentDurability: 100,
          isUnderRepair: false,
          assignedWorkers: 0,
        } as any,
      ],
    ]),
  };
  const r = startSquadTraining(unstaffed, 'sq1', 0);
  assert.equal(r.ok, false);
  assert.match(r.error || '', /staffed|range officer/i);
});

test('an unstaffed range pauses an active session: no progress, no ammo draw', () => {
  let state = poweredRange(mkState());
  const started = startSquadTraining(state, 'sq1', 0);
  assert.equal(started.ok, true);
  state = {
    ...state,
    trainingState: { sessions: new Map([[started.session!.squadId, started.session!]]), totalAmmoSpent: 0 },
  };

  // Officers walk off the job mid-course.
  const ghosted = {
    ...state,
    adaptedBuildings: new Map([
      [
        'range',
        {
          buildingId: 'range',
          typeId: 'shooting_range',
          name: 'Shooting Range',
          constructionStatus: 'completed',
          currentDurability: 100,
          isUnderRepair: false,
          assignedWorkers: 0,
        } as any,
      ],
    ]),
  };
  const r = tickSquadTraining(ghosted, DAY, 600);
  const session = r.newState.trainingState!.sessions.get('sq1')!;
  assert.equal(session.progressSec, 0, 'no progress while the range is unstaffed');
  assert.equal(r.newState.stockpile.ammo.sharedPool, 100, 'no ammo drawn while the range is unstaffed');
});

test('each range officer opens one firing lane: concurrent sessions cap at staffing', () => {
  const twoSquads = {
    ...poweredRange(mkState()),
    squads: [
      { id: 'sq1', name: 'Alpha', trainingTier: 0 } as any,
      { id: 'sq2', name: 'Bravo', trainingTier: 0 } as any,
    ],
  };

  // One officer → only one lane.
  const single = {
    ...twoSquads,
    adaptedBuildings: new Map([
      [
        'range',
        {
          buildingId: 'range',
          typeId: 'shooting_range',
          name: 'Shooting Range',
          constructionStatus: 'completed',
          currentDurability: 100,
          isUnderRepair: false,
          assignedWorkers: 1,
        } as any,
      ],
    ]),
  };
  const first = startSquadTraining(single, 'sq1', 0);
  assert.equal(first.ok, true);
  const withSession = {
    ...single,
    trainingState: {
      sessions: new Map([[first.session!.squadId, first.session!]]),
      totalAmmoSpent: 0,
    },
  };
  const second = startSquadTraining(withSession, 'sq2', 0);
  assert.equal(second.ok, false);
  assert.match(second.error || '', /lane/i);

  // Three officers → both squads drill concurrently.
  const triple = {
    ...twoSquads,
    adaptedBuildings: new Map([
      [
        'range',
        {
          buildingId: 'range',
          typeId: 'shooting_range',
          name: 'Shooting Range',
          constructionStatus: 'completed',
          currentDurability: 100,
          isUnderRepair: false,
          assignedWorkers: 3,
        } as any,
      ],
    ]),
  };
  const a = startSquadTraining(triple, 'sq1', 0);
  const b = startSquadTraining(triple, 'sq2', 0);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
});

test('stopping training refunds the session and a day of training draws ~TRAINING_BASE_AMMO_PER_DAY', () => {
  let state = poweredRange(mkState());
  const started = startSquadTraining(state, 'sq1', 0);
  state = {
    ...state,
    trainingState: { sessions: new Map([[started.session!.squadId, started.session!]]), totalAmmoSpent: 0 },
  };
  const r = tickSquadTraining(state, DAY, 600);
  const spent = r.newState.trainingState!.totalAmmoSpent;
  assert.ok(Math.abs(spent - TRAINING_BASE_AMMO_PER_DAY) < 0.5, `~${TRAINING_BASE_AMMO_PER_DAY} ammo/day (got ${spent})`);

  const stopped = stopSquadTraining(r.newState, 'sq1');
  assert.equal(stopped.trainingState!.sessions.has('sq1'), false, 'session removed');
  assert.equal(getPoweredBuildingIds(stopped).size, 1, 'state intact');
});