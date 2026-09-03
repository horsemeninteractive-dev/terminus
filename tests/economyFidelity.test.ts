import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickSettlementSimulation } from '../src/services/populationService';
import { calculateSettlementMorale } from '../src/services/moraleService';
import { createInitialSettlementState } from '../src/services/settlementService';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../src/data/functionalBuildings';
import type { AdaptedBuilding, SettlementState } from '../src/types/settlement';

// ---------------------------------------------------------------- production
const DAY = 600;

function mkState(
  buildings: Record<string, { typeId: string; workers: number; recipe?: string }>,
  materials: Record<string, number> = {},
  food: Record<string, number> = {}
): SettlementState {
  return {
    adaptedBuildings: new Map(
      Object.entries(buildings).map(([id, b]) => [
        id,
        {
          buildingId: id,
          typeId: b.typeId,
          name: b.typeId,
          constructionStatus: 'completed',
          currentDurability: 100,
          isUnderRepair: false,
          footprintAreaM2: 200,
          assignedWorkers: b.workers,
          selectedRecipeId: b.recipe ?? null,
        } as any,
      ])
    ),
    freestandingBuildings: [],
    stockpile: {
      water: { rainwater: 0, purified_water: 0, bottled_water: 0 },
      medical: { first_aid_kits: 0, medicine: 0, antibiotics: 0, vaccine: 0, bandages: 0 },
      ammo: { sharedPool: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      materials: { wood: 0, metal: 0, bricks: 0, tools: 0, logs: 0, scrap: 0, clay: 0, ...materials },
      food: { fresh_harvest: 0, dried_rations: 0, canned_goods: 0, mre_rations: 0, ...food },
    },
    research: { unlockedNodes: [], activeResearchId: null, activeProgressSec: 0 },
    generalPopulation: { total: 0, unassigned: 0, inSquads: 0, children: [] },
    namedSurvivors: [],
    morale: { modifiers: { productivityMultiplier: 1 } },
    deconstructionJobs: new Map(),
    constructionOrders: [],
    headquarters: [],
    totalStorageCapacity: 10000,
  } as unknown as SettlementState;
}

function tick(state: SettlementState, days = 1): SettlementState {
  return tickSettlementSimulation(state, DAY * days, null, false).newState;
}

// ---------------------------------------------------------------- law fixtures
function withOperationalBuilding(state: SettlementState, typeId: string, capacity: number, id = `b_${typeId}`): SettlementState {
  const b: AdaptedBuilding = {
    buildingId: id,
    typeId,
    isHQ: false,
    name: typeId,
    category: 'basic',
    adaptedAt: Date.now(),
    footprintAreaM2: 200,
    adaptedAreaM2: 200,
    adaptationPercentage: 100,
    totalFloorAreaM2: 200,
    volumeM3: 800,
    maxCapacity: capacity,
    fullCapacity: capacity,
    maxDurability: 300,
    currentDurability: 300,
    position: { x: 0, z: 0 },
    constructionStatus: 'completed',
    assignedWorkers: 2,
  } as unknown as AdaptedBuilding;
  return { ...state, adaptedBuildings: new Map([...state.adaptedBuildings, [id, b]]) };
}

function withPopulation(state: SettlementState, desiredTotal: number): SettlementState {
  const named = state.namedSurvivors?.length || 0;
  return {
    ...state,
    generalPopulation: {
      ...(state.generalPopulation as any),
      total: Math.max(0, desiredTotal - named),
    },
  };
}

// ------------------------------------------------------------------ §42 Bar
test('the Bar needs no research and brews at the IFZ ratio of 1 Grain → 8 Beer', () => {
  const bar = FUNCTIONAL_BUILDING_DEFINITIONS.bar;
  assert.equal(bar.researchRequirement, undefined, 'IFZ Bar requires no research');
  assert.equal(bar.inputs?.[0].resource, 'grain');
  assert.equal(bar.inputs?.[0].amountPerDay, 1);
  assert.equal(bar.outputs?.[0].resource, 'beer');
  assert.equal(bar.outputs?.[0].amountPerDay, 8);

  const state = mkState({ b: { typeId: 'bar', workers: 4 } }, {}, { grain: 40 });
  const r = tick(state);
  assert.ok(Math.abs(r.stockpile.materials.beer - 8) < 0.5, `bar brews ~8 beer/day (got ${Math.round(r.stockpile.materials.beer || 0)})`);
  assert.ok(Math.abs(r.stockpile.food.grain - 39) < 0.5, 'one grain consumed per 8 beer');
});

// ------------------------------------------------------------------ §17 Chemical Plant
test('the Chemical Plant exposes the four IFZ lines with the reference ratios', () => {
  const def = FUNCTIONAL_BUILDING_DEFINITIONS.chemical_plant;
  const lines = def.recipes!;
  const expected: Record<string, [string, number, string, number]> = {
    wood_to_fertilizer: ['wood', 2, 'fertilizer', 1],
    fuel_to_fertilizer: ['fuel', 1, 'fertilizer', 3],
    wood_to_fuel: ['wood', 6, 'fuel', 1],
    fertilizer_to_fuel: ['fertilizer', 3, 'fuel', 1],
  };
  assert.equal(lines.length, Object.keys(expected).length);
  for (const line of lines) {
    const [inRes, inAmt, outRes, outAmt] = expected[line.id];
    assert.equal(line.inputs[0].resource, inRes, `${line.id} input resource`);
    assert.equal(line.inputs[0].amountPerDay, inAmt, `${line.id} input amount`);
    assert.equal(line.outputs![0].resource, outRes, `${line.id} output resource`);
    assert.equal(line.outputs![0].amountPerDay, outAmt, `${line.id} output amount`);
  }
});

test('the Chemical Plant runs the IFZ conversion lines (wood → fuel, fertilizer → fuel)', () => {
  const wf = mkState(
    { c: { typeId: 'chemical_plant', workers: 5, recipe: 'wood_to_fuel' } },
    { wood: 60 }
  );
  const r1 = tick(wf);
  assert.ok(Math.abs(r1.stockpile.fuel.gasoline - 1) < 0.5, `6 wood → 1 fuel/day (got ${r1.stockpile.fuel.gasoline})`);
  assert.ok(Math.abs(r1.stockpile.materials.wood - 54) < 0.5, 'six wood consumed per fuel');

  const ff = mkState(
    { c: { typeId: 'chemical_plant', workers: 5, recipe: 'fertilizer_to_fuel' } },
    { fertilizer: 9 }
  );
  const r2 = tick(ff);
  assert.ok(Math.abs(r2.stockpile.fuel.gasoline - 1) < 0.5, `3 fertilizer → 1 fuel/day (got ${r2.stockpile.fuel.gasoline})`);
  assert.ok(Math.abs((r2.stockpile.materials.fertilizer || 0) - 6) < 0.5, 'three fertilizer consumed per fuel');
});

// ------------------------------------------------------------------- §5 House
test('an operational House delivers the advertised +15% quality-housing morale boost', () => {
  const bare = withPopulation(createInitialSettlementState('House Test'), 40);
  const plain = calculateSettlementMorale(bare, undefined, 1);
  assert.ok(!plain.factors.some((f) => f.id === 'housing_quality_homes'), 'no House → no quality-housing factor');

  const withHouse = withOperationalBuilding(bare, 'house', 80);
  const boosted = calculateSettlementMorale(withHouse, undefined, 1);
  const factor = boosted.factors.find((f) => f.id === 'housing_quality_homes');
  assert.ok(factor, 'operational House adds the quality-housing morale factor');
  assert.equal(factor!.scoreDelta, 15, 'full +15 when everyone can sleep in a House');
  assert.ok(boosted.overallScore > plain.overallScore, 'morale rises with quality housing');
});

test('the House boost scales with the share of colonists actually housed in Houses', () => {
  // 80-capacity House but 320 colonists → only a quarter are in real Houses:
  // the boost is scaled, never the flat +15 for a token single house.
  const big = withPopulation(createInitialSettlementState('House Scale'), 320);
  const withHouse = withOperationalBuilding(big, 'house', 80);
  const morale = calculateSettlementMorale(withHouse, undefined, 1);
  const factor = morale.factors.find((f) => f.id === 'housing_quality_homes');
  assert.ok(factor, 'scaled quality factor present');
  assert.ok((factor!.scoreDelta as number) >= 3 && (factor!.scoreDelta as number) < 15, `boost scaled (got ${factor!.scoreDelta})`);
});
