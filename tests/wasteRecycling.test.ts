import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState } from '../src/services/settlementService';
import { tickMoraleAndGrowthSimulation } from '../src/services/moraleService';
import {
  recycleSpentAmmoToScrap,
  SPENT_AMMO_SCRAP_RATIO,
} from '../src/services/combatService';
import { tickSettlementSimulation } from '../src/services/populationService';
import type { SettlementState } from '../src/types/settlement';

const DAY = 600;

function baseState(): SettlementState {
  const fresh = createInitialSettlementState('Waste Test');
  return {
    ...fresh,
    namedSurvivors: [],
    generalPopulation: { total: 20, unassigned: 20, inSquads: 0, children: [] },
    stockpile: {
      ...fresh.stockpile,
      food: { fresh_harvest: 0, dried_rations: 0, canned_goods: 0, mre_rations: 0, grain: 0 },
      materials: { wood: 0, metal: 0, bricks: 0, tools: 0, scrap: 0 },
    },
  } as unknown as SettlementState;
}

test('eating canned goods returns the used tin as scrap metal', () => {
  const s = baseState();
  // 20 citizens × 0.5 food/day = 10 food/day. Force canned as the only source.
  s.stockpile.food.canned_goods = 100;
  s.stockpile.materials.scrap = 0;

  const fullDay = tickMoraleAndGrowthSimulation(s, s.weather as never, DAY, 1, 1);
  const state = fullDay.newState;
  assert.ok(state.stockpile.food.canned_goods < 100, 'canned food was consumed');
  const consumed = 100 - state.stockpile.food.canned_goods;
  assert.ok(consumed > 0, 'colony actually ate the rations');
  // 25% of the eaten tins come back as scrap (tin metal).
  const expectedScrap = Math.floor(consumed * 0.25);
  assert.equal(state.stockpile.materials.scrap, expectedScrap, 'used tins land in the scrap pool');
});

test('fresh food does not generate tin waste', () => {
  const s = baseState();
  s.stockpile.food.fresh_harvest = 100;
  s.stockpile.materials.scrap = 0;
  const state = tickMoraleAndGrowthSimulation(s, s.weather as never, DAY, 1, 1).newState;
  assert.equal(state.stockpile.materials.scrap, 0, 'no cans eaten → no scrap waste');
});

test('firing ammunition returns spent brass to the scrap pool', () => {
  const before = baseState();
  before.stockpile.materials.scrap = 0;
  const after = recycleSpentAmmoToScrap(before.stockpile, 40);
  const expected = Math.floor(40 * SPENT_AMMO_SCRAP_RATIO);
  assert.equal(after.materials.scrap, expected, 'brass reclaimed from fired rounds');
  assert.equal(SPENT_AMMO_SCRAP_RATIO, 0.15, 'documented brass reclaim ratio');
});

test('no consumption → no waste added (identity for zero ammo)', () => {
  const s = baseState();
  const out = recycleSpentAmmoToScrap(s.stockpile, 0);
  assert.equal(out, s.stockpile, 'zero shots change nothing');
});

test('a staffed scrapyard recycles accumulated scrap into metal (end to end)', () => {
  // The sparse fixture used by the industry-chain suite: no HQ/population to
  // distract the labour model, just the staffed yard and a scrap feed.
  const st = {
    adaptedBuildings: new Map([
      [
        'yard1',
        {
          buildingId: 'yard1',
          typeId: 'scrapyard',
          name: 'Scrapyard',
          constructionStatus: 'completed',
          currentDurability: 100,
          isUnderRepair: false,
          footprintAreaM2: 300,
          assignedWorkers: 6,
        } as any,
      ],
    ]),
    freestandingBuildings: [],
    stockpile: {
      water: { rainwater: 0, purified_water: 0, bottled_water: 0 },
      food: { fresh_harvest: 0, dried_rations: 0, canned_goods: 0, mre_rations: 0 },
      medical: { first_aid_kits: 0, medicine: 0, antibiotics: 0, vaccine: 0, bandages: 0 },
      ammo: { sharedPool: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      materials: { wood: 0, metal: 0, bricks: 0, tools: 0, scrap: 100, clay: 0, logs: 0 },
    },
    research: { unlockedNodes: ['recycling'], activeResearchId: null, activeProgressSec: 0 },
    generalPopulation: { total: 0, unassigned: 0, inSquads: 0, children: [] },
    namedSurvivors: [],
    morale: { modifiers: { productivityMultiplier: 1 } },
    deconstructionJobs: new Map(),
    constructionOrders: [],
    headquarters: [],
    totalStorageCapacity: 10000,
  } as unknown as SettlementState;

  const day1 = tickSettlementSimulation(st, DAY, null, false).newState;
  assert.ok(day1.stockpile.materials.scrap < 100, 'the yard consumed scrap');
  assert.ok(day1.stockpile.materials.metal > 0, 'and produced refined metal');
});