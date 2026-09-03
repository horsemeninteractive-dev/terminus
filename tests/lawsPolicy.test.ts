import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState } from '../src/services/settlementService';
import {
  LAWS,
  enactLaw,
  getActiveLaw,
  getDefaultLawsState,
  getLawsUnlockInfo,
} from '../src/services/lawService';
import { calculateSettlementMorale } from '../src/services/moraleService';
import { calculateCitizenBreakdownStats } from '../src/services/populationService';
import type { AdaptedBuilding, SettlementState } from '../src/types/settlement';
import type { ChildCitizen } from '../src/types/population';

/** Attach an OPERATIONAL Gathering Place to the settlement. */
function withGatheringPlace(state: SettlementState): SettlementState {
  const gp: AdaptedBuilding = {
    buildingId: 'b_gp',
    typeId: 'gathering_place',
    isHQ: false,
    name: 'Gathering Place',
    category: 'civilian',
    adaptedAt: Date.now(),
    footprintAreaM2: 120,
    adaptedAreaM2: 120,
    adaptationPercentage: 100,
    totalFloorAreaM2: 120,
    volumeM3: 600,
    maxCapacity: 40,
    fullCapacity: 40,
    currentCapacity: 40,
    maxDurability: 360,
    currentDurability: 360,
    position: { x: 0, z: 0 },
    constructionStatus: 'completed',
    assignedWorkers: 2,
    baseDefense: 35,
    resourceCosts: { wood: 35, metal: 15, bricks: 25 },
    durability: { adaptationBase: 360, freestandingBase: 220 },
  } as unknown as AdaptedBuilding;
  return {
    ...state,
    adaptedBuildings: new Map([...state.adaptedBuildings, ['b_gp', gp]]),
  };
}

/** Sets the TOTAL population (general + named survivors) to `desiredTotal`. */
function withPopulation(state: SettlementState, desiredTotal: number): SettlementState {
  const named = state.namedSurvivors?.length || 0;
  return {
    ...state,
    generalPopulation: {
      ...(state.generalPopulation as any),
      total: Math.max(0, desiredTotal - named),
      children: (state.generalPopulation?.children || []) as ChildCitizen[],
    },
  };
}

test('the law forum unlocks with an operational Gathering Place AND 100 citizens (current IFZ)', () => {
  const base = createInitialSettlementState('Law Test');

  const noHall = getLawsUnlockInfo(base);
  assert.ok(!noHall.unlocked, 'no Gathering Place → locked');
  assert.match(noHall.reason, /Gathering Place/);

  const hallSmallPop = getLawsUnlockInfo(withPopulation(withGatheringPlace(base), 80));
  assert.ok(!hallSmallPop.unlocked, 'Gathering Place but only 80 citizens → locked');
  assert.match(hallSmallPop.reason, /100 citizens/);
  assert.equal(hallSmallPop.population, 80);

  const unlocked = getLawsUnlockInfo(withPopulation(withGatheringPlace(base), 100));
  assert.ok(unlocked.unlocked, 'Gathering Place + 100 citizens → forum open');
  assert.equal(unlocked.requiredPopulation, 100, 'required population surfaced as 100');
});

test('enacting a law applies real effects and the first change is free', () => {
  const state = withPopulation(withGatheringPlace(createInitialSettlementState('Law Test')), 210);
  const r = enactLaw(state, 'extended_rations', 7);
  assert.ok(r.success, r.error || '');
  assert.equal(getActiveLaw(r.newState).id, 'extended_rations');
  assert.equal(getActiveLaw(r.newState).foodConsumptionMult, 0.7, 'food consumption multiplier applied');
  assert.equal(getActiveLaw(r.newState).moraleDelta, -5, 'satisfaction effect applied');
  assert.equal(r.newState.laws?.lastLawChangeDay, 7, 'change recorded on the current day');

  // Default state starts on Standard Rations with no change history.
  const fresh = createInitialSettlementState('Law Test');
  assert.equal(getActiveLaw(fresh).id, 'standard_rations');
  assert.deepEqual(fresh.laws || getDefaultLawsState(), getDefaultLawsState());
});

test('the Gathering Place allows exactly ONE law change per day', () => {
  const base = withPopulation(withGatheringPlace(createInitialSettlementState('Law Test')), 210);

  const first = enactLaw(base, 'extended_rations', 3);
  assert.ok(first.success);

  const secondSameDay = enactLaw(first.newState, 'generous_rations', 3);
  assert.ok(!secondSameDay.success, 'second change on the same day is refused');
  assert.match(secondSameDay.error || '', /once per day/);

  const nextDay = enactLaw(first.newState, 'generous_rations', 4);
  assert.ok(nextDay.success, 'a new day permits another change');
  assert.equal(getActiveLaw(nextDay.newState).id, 'generous_rations');

  // Enacting the already-active law is a no-op refusal.
  const sameLaw = enactLaw(nextDay.newState, 'generous_rations', 5);
  assert.ok(!sameLaw.success);
  assert.match(sameLaw.error || '', /already the colony law/);
});

test('the active law feeds morale as a standing satisfaction factor and scales food reserves', () => {
  const base = withPopulation(withGatheringPlace(createInitialSettlementState('Law Test')), 210);
  base.stockpile.food = {
    ...base.stockpile.food,
    canned_goods: 400,
    mre_rations: 400,
    dried_rations: 0,
    fresh_harvest: 0,
  };

  const standard = calculateSettlementMorale(base, undefined, 1);
  const extended = calculateSettlementMorale(enactLaw(base, 'extended_rations', 1).newState, undefined, 1);
  const generous = calculateSettlementMorale(enactLaw(base, 'generous_rations', 1).newState, undefined, 1);

  assert.ok(
    standard.dailyFoodConsumption > extended.dailyFoodConsumption,
    `extended rations draw less food per day (${extended.dailyFoodConsumption} < ${standard.dailyFoodConsumption})`
  );
  assert.ok(
    generous.dailyFoodConsumption > standard.dailyFoodConsumption,
    'generous rations draw more food per day'
  );
  assert.ok(
    extended.daysOfFoodRemaining > standard.daysOfFoodRemaining,
    'lower consumption stretches reserve days'
  );

  const lawFactor = extended.factors.find((f) => f.id === 'law_extended_rations');
  assert.ok(lawFactor, 'law appears as a morale factor');
  assert.equal(lawFactor!.scoreDelta, -5);
  assert.ok(extended.overallScore < standard.overallScore, 'extended rations cost satisfaction');
  assert.ok(generous.overallScore > standard.overallScore, 'generous rations lift satisfaction');
});

test('Child Labour Permitted adds children to the worker pool; the Childcare Program keeps them out', () => {
  // 210 citizens so the law forum is unlocked (Gathering Place + ≥200).
  const base = withPopulation(withGatheringPlace(createInitialSettlementState('Law Test')), 210);
  // 10 children of working age.
  base.generalPopulation = {
    ...(base.generalPopulation as any),
    total: 208, // 208 general + 2 named = 210 ≥ 200 (forum unlocked)
    children: Array.from({ length: 10 }, (_, i) => ({
      id: `child_${i}`,
      name: `Kid ${i}`,
      age: 13 + (i % 3),
      assigned: false,
    })) as unknown as ChildCitizen[],
  };

  const breakdownDefault = calculateCitizenBreakdownStats(base);
  assert.equal(breakdownDefault.children, 10);
  assert.equal(
    breakdownDefault.totalWorkers,
    breakdownDefault.totalCitizens - 10 - breakdownDefault.squadMembers - breakdownDefault.ill,
    'children are excluded from work by default'
  );

  const childLabor = enactLaw(base, 'child_labor_permitted', 1).newState;
  const breakdownLabor = calculateCitizenBreakdownStats(childLabor);
  assert.equal(
    breakdownLabor.totalWorkers,
    breakdownLabor.totalCitizens - breakdownLabor.squadMembers - breakdownLabor.ill,
    'Child Labour Permitted adds every child to the pool'
  );
  assert.equal(
    breakdownLabor.totalWorkers - breakdownDefault.totalWorkers,
    10,
    'exactly the 10 children join the workforce'
  );

  const childcare = enactLaw(base, 'childcare_program', 1).newState;
  const breakdownCare = calculateCitizenBreakdownStats(childcare);
  assert.equal(
    breakdownCare.totalWorkers,
    breakdownCare.totalCitizens - 10 - breakdownCare.squadMembers - breakdownCare.ill,
    'Childcare Program keeps children exempt'
  );
});

test('every law in the lawbook carries valid effects and unique ids', () => {
  const ids = new Set(LAWS.map((l) => l.id));
  assert.equal(ids.size, LAWS.length, 'law ids are unique');
  for (const law of LAWS) {
    assert.ok(law.foodConsumptionMult > 0, `${law.id}: positive food multiplier`);
    assert.ok(Math.abs(law.moraleDelta) <= 15, `${law.id}: bounded morale effect`);
    assert.ok(law.description.length > 10, `${law.id}: has a description`);
  }
});