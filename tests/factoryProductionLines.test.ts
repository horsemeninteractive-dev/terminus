import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickSettlementSimulation } from '../src/services/populationService';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../src/data/functionalBuildings';
import { RESEARCH_TREE_NODES } from '../src/data/researchTreeData';
import { isValidWeaponId, isValidArmorId } from '../src/types/combat';
import type { SettlementState } from '../src/types/settlement';

const DAY = 600;

function mkState(
  buildings: Record<string, { typeId: string; workers: number; recipe?: string }>,
  materials: Record<string, number> = {},
  unlocked: string[] = []
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
      food: { fresh_harvest: 0, dried_rations: 0, canned_goods: 0, mre_rations: 0 },
      medical: { first_aid_kits: 0, medicine: 0, antibiotics: 0, vaccine: 0, bandages: 0 },
      ammo: { sharedPool: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      materials: { wood: 0, metal: 0, bricks: 0, tools: 0, logs: 0, scrap: 0, clay: 0, ...materials },
    },
    research: { unlockedNodes: unlocked, activeResearchId: null, activeProgressSec: 0 },
    generalPopulation: { total: 0, unassigned: 0, inSquads: 0, children: [] },
    namedSurvivors: [],
    morale: { modifiers: { productivityMultiplier: 1 } },
    deconstructionJobs: new Map(),
    constructionOrders: [],
    headquarters: [],
    totalStorageCapacity: 10000,
  } as unknown as SettlementState;
}

function tick(state: SettlementState, seconds = DAY): SettlementState {
  return tickSettlementSimulation(state, seconds, null, false).newState;
}

function armoryCount(s: SettlementState, id: string): number {
  return (s.armory?.weapons.filter((w) => w === id).length || 0) +
    (s.armory?.armor.filter((a) => a === id).length || 0);
}

test('Arms Factory default line still presses Ammunition Crates (metal → ammo)', () => {
  const arms = mkState({ a: { typeId: 'arms_factory', workers: 6 } }, { metal: 80 });
  const r = tick(arms);
  assert.ok(Math.abs(r.stockpile.ammo.sharedPool - 20) < 0.5, `ammo crates yield ~20 ammo/day (got ${Math.round(r.stockpile.ammo.sharedPool)})`);
  assert.ok(Math.abs(r.stockpile.materials.metal - 74) < 0.5, 'metal consumed by the ammo line');
  assert.equal((r.armory?.weapons || []).length, 0, 'default ammo line manufactures no weapons');
});

test('an unresearched weapon line never runs — research truly unlocks manufacture', () => {
  // No research unlocked: even with the Assault Rifle line selected the factory
  // idles and consumes nothing.
  const locked = mkState(
    { a: { typeId: 'arms_factory', workers: 6, recipe: 'manufacture_assault_rifle' } },
    { metal: 80, wood: 40 },
    []
  );
  const r1 = tick(locked);
  assert.equal((r1.armory?.weapons || []).length, 0, 'no weapon without its research');
  assert.equal(r1.stockpile.materials.metal, 80, 'no materials consumed by a locked line');

  // Unlock assault_rifle: the same factory manufactures one rifle into the armory.
  const unlocked = mkState(
    { a: { typeId: 'arms_factory', workers: 6, recipe: 'manufacture_assault_rifle' } },
    { metal: 80, wood: 40 },
    ['assault_rifle']
  );
  const r2 = tick(unlocked);
  assert.equal(armoryCount(r2, 'assault_rifle'), 1, 'one assault rifle lands in the armory per full work unit');
  assert.ok(r2.stockpile.materials.metal < 80, 'rifle line consumes metal');
  assert.ok(r2.stockpile.materials.wood < 40, 'rifle line consumes wood');
});

test('each Arms Factory firearm is its own research-gated line with a distinct material cost', () => {
  const def = FUNCTIONAL_BUILDING_DEFINITIONS.arms_factory;
  const lines = def.recipes!;
  const weaponLines = lines.filter((r) => r.gear?.kind === 'weapon');
  assert.equal(weaponLines.length, 5, 'pistol, shotgun, AR, sniper and HMG lines exist');

  const seenCosts = new Set<string>();
  for (const line of weaponLines) {
    assert.ok(line.researchRequirement, `line ${line.id} must be gated by its research`);
    assert.ok(RESEARCH_TREE_NODES[line.researchRequirement as keyof typeof RESEARCH_TREE_NODES], `line ${line.id} gates on unknown research ${line.researchRequirement}`);
    assert.ok(line.gear && isValidWeaponId(line.gear.itemId), `line ${line.id} must produce a real catalog weapon`);
    const costKey = line.inputs.map((i) => `${i.resource}:${i.amountPerDay}`).join('|');
    seenCosts.add(costKey);
    // The line the research describes must be the item it manufactures
    // (research id === produced weapon id).
    assert.equal(line.gear!.itemId, line.researchRequirement!, `weapon id should match its research node for ${line.id}`);
  }
  assert.ok(seenCosts.size >= 4, 'firearm lines have materially distinct recipes');
});

test('Protective Gear Factory produces armor sets instead of being a silent metal sink', () => {
  // Old behaviour consumed 5 Metal/day and produced NOTHING. Now the default
  // affordable line (Protector Vest) turns that metal into real armor.
  const gear = mkState({ p: { typeId: 'protective_gear_factory', workers: 4 } }, { metal: 40 });
  const r = tick(gear);
  assert.equal(armoryCount(r, 'padded_jacket'), 1, 'Protector Vest (padded jacket) lands in the armory');
  assert.ok(Math.abs(r.stockpile.materials.metal - 35) < 0.5, 'only the vest line metal is consumed (5/day)');
});

test('all three armor lines exist and each produces a real catalog armor item', () => {
  const def = FUNCTIONAL_BUILDING_DEFINITIONS.protective_gear_factory;
  const lines = def.recipes!;
  assert.equal(lines.length, 3);
  const byId = new Map(lines.map((l) => [l.id, l]));
  assert.ok(byId.has('manufacture_protector') && byId.has('manufacture_riot_gear') && byId.has('manufacture_plate_armor'));

  for (const line of lines) {
    assert.ok(line.gear?.kind === 'armor', `line ${line.id} must produce armor`);
    assert.ok(line.gear && isValidArmorId(line.gear.itemId), `line ${line.id} must produce a real catalog armor`);
  }

  // Plate Armor is costlier than Riot Gear, which is costlier than the vest.
  const metal = (l: string) => def.recipes!.find((r) => r.id === l)!.inputs[0].amountPerDay;
  assert.ok(metal('manufacture_plate_armor') > metal('manufacture_riot_gear'));
  assert.ok(metal('manufacture_riot_gear') > metal('manufacture_protector'));
});

test('two factories running the same gear line each complete one pistol', () => {
  const two = mkState(
    {
      a1: { typeId: 'arms_factory', workers: 6, recipe: 'manufacture_pistol' },
      a2: { typeId: 'arms_factory', workers: 6, recipe: 'manufacture_pistol' },
    },
    { metal: 120, wood: 40 },
    ['pistol']
  );
  const r = tick(two);
  assert.equal(armoryCount(r, 'pistol'), 2, 'both factories complete their pistol line independently');
});
