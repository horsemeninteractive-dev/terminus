import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickSettlementSimulation } from '../src/services/populationService';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../src/data/functionalBuildings';
import type { SettlementState } from '../src/types/settlement';

const DAY = 600;

function mkState(buildings: Record<string, { typeId: string; workers: number }>, materials: Record<string, number> = {}): SettlementState {
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
        } as any,
      ])
    ),
    freestandingBuildings: [],
    stockpile: {
      water: { rainwater: 0, purified_water: 0, bottled_water: 0 },
      food: { fresh_harvest: 0, dried_rations: 0, canned_goods: 0, mre_rations: 0 },
      medical: { first_aid_kits: 0, medicine: 0, antibiotics: 0, vaccine: 0, bandages: 0 },
      ammo: { sharedPool: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      materials: { wood: 0, metal: 0, bricks: 0, tools: 0, logs: 0, scrap: 0, clay: 0, ...materials },
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

test("the Forester's Hut yields raw logs that the Sawmill mills into wood", () => {
  // Forester alone: 15 logs/day, no wood.
  const foresterOnly = mkState({ f: { typeId: 'foresters_hut', workers: 4 } });
  const r1 = tick(foresterOnly);
  assert.ok(r1.stockpile.materials.logs > 0, 'forester produces logs');
  assert.equal(r1.stockpile.materials.wood, 0, 'logs are not yet lumber');

  // Forester + sawmill: 10 logs → 16 wood/day (with 4 forester workers producing 15).
  const chain = mkState(
    { f: { typeId: 'foresters_hut', workers: 4 }, s: { typeId: 'sawmill', workers: 5 } },
    { logs: 50 }
  );
  const r2 = tick(chain);
  const wood = r2.stockpile.materials.wood;
  assert.ok(Math.abs(wood - 16) < 0.5, `sawmill converts logs to ~16 wood/day (got ${Math.round(wood)})`);
  // 50 seeded + 15 harvested − 10 milled = 55.
  assert.ok(Math.abs(r2.stockpile.materials.logs - 55) < 0.5, 'logs net of milling and harvest');
});

test('the Scrapyard converts scrap into refined metal', () => {
  const yard = mkState({ y: { typeId: 'scrapyard', workers: 6 } }, { scrap: 60 });
  const r = tick(yard);
  const metal = r.stockpile.materials.metal;
  assert.ok(Math.abs(metal - 14) < 0.5, `scrapyard yields ~14 metal/day (got ${Math.round(metal)})`);
  assert.ok(r.stockpile.materials.scrap < 60, 'scrap consumed');
});

test('the Clay Pit fires clay-bearing brick output from wood input', () => {
  const pit = mkState({ p: { typeId: 'clay_pit', workers: 4 } }, { wood: 60 });
  const r = tick(pit);
  const bricks = r.stockpile.materials.bricks;
  assert.ok(Math.abs(bricks - 12) < 0.5, `clay pit yields ~12 bricks/day (got ${Math.round(bricks)})`);
  assert.ok(r.stockpile.materials.wood < 60, 'wood consumed as kiln fuel');
});

test('chain buildings are gated behind their research', () => {
  assert.equal(FUNCTIONAL_BUILDING_DEFINITIONS.foresters_hut.researchRequirement, 'basic_forestry');
  assert.equal(FUNCTIONAL_BUILDING_DEFINITIONS.sawmill.researchRequirement, 'advanced_woodworks');
  assert.equal(FUNCTIONAL_BUILDING_DEFINITIONS.scrapyard.researchRequirement, 'recycling');
  assert.equal(FUNCTIONAL_BUILDING_DEFINITIONS.clay_pit.researchRequirement, 'clay_processing');
});

test('unstaffed chain buildings produce nothing', () => {
  const empty = mkState({ s: { typeId: 'sawmill', workers: 0 } }, { logs: 100 });
  const r = tick(empty);
  assert.equal(r.stockpile.materials.wood, 0, 'no workers → no output');
  assert.equal(r.stockpile.materials.logs, 100, 'inputs untouched');
});