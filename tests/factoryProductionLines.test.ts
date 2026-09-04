import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickSettlementSimulation } from '../src/services/populationService';
import { deserializeSettlementState } from '../src/services/saveService';
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

test('an unselected multi-recipe factory IDLES — production never auto-picks a line (Choose Production)', () => {
  // No recipe chosen: even with plenty of metal the factory runs NOTHING.
  // Production must never silently swap to an arbitrary line when the
  // preferred inputs change — the player picks the line explicitly.
  const arms = mkState({ a: { typeId: 'arms_factory', workers: 6 } }, { metal: 80 });
  const r = tick(arms);
  assert.equal(r.stockpile.ammo.sharedPool, 0, 'no ammo pressed without a chosen line');
  assert.equal(r.stockpile.materials.metal, 80, 'no metal consumed without a chosen line');
  assert.equal((r.armory?.weapons || []).length, 0, 'no weapons without a chosen line');
});

test('legacy saves without a recipe choice are stamped to their first line ON LOAD — nothing that was running stops', () => {
  // Simulate a pre-recipe-selection save: a multi-recipe Arms Factory whose
  // record has no selectedRecipeId at all.
  const legacy = mkState({ a: { typeId: 'arms_factory', workers: 6 } }, { metal: 80 });
  const rec = (legacy.adaptedBuildings as any).get('a');
  delete rec.selectedRecipeId;

  const migrated = deserializeSettlementState(legacy as any);
  const stamped = (migrated.adaptedBuildings as any).get('a');
  assert.equal(stamped.selectedRecipeId, 'ammo_crates', 'legacy record stamped to its first line on load');

  // The migrated factory keeps pressing ammo — the migration period is seamless.
  const r = tick(migrated);
  assert.ok(Math.abs(r.stockpile.ammo.sharedPool - 20) < 0.5, `migrated factory keeps running (got ${Math.round(r.stockpile.ammo.sharedPool)})`);
});

test('a factory runs the CHOSEN ammo line — explicit selection, not a default', () => {
  const arms = mkState({ a: { typeId: 'arms_factory', workers: 6, recipe: 'ammo_crates' } }, { metal: 80 });
  const r = tick(arms);
  assert.ok(Math.abs(r.stockpile.ammo.sharedPool - 20) < 0.5, `ammo crates yield ~20 ammo/day (got ${Math.round(r.stockpile.ammo.sharedPool)})`);
  assert.ok(Math.abs(r.stockpile.materials.metal - 74) < 0.5, 'metal consumed by the ammo line');
  assert.equal((r.armory?.weapons || []).length, 0, 'the ammo line manufactures no weapons');
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
  // Old behaviour consumed 5 Metal/day and produced NOTHING. With the Protector
  // Vest line EXPLICITLY chosen, that metal turns into real armor — production
  // only ever runs a line the player picked.
  const gear = mkState(
    { p: { typeId: 'protective_gear_factory', workers: 4, recipe: 'manufacture_protector' } },
    { metal: 40 }
  );
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

test('tool factory output accrues into the cumulative production tally (itemsProduced)', () => {
  const state = mkState({ tf: { typeId: 'tool_factory', workers: 6 } }, { wood: 60, metal: 60 });
  const r = tick(state, DAY * 4); // 4 full days
  const produced = (r.lifetimeStats as any)?.itemsProduced?.tools ?? 0;
  assert.ok(produced >= 11.5, `4 days × 3 tools/day should accrue ~12 produced (got ${produced})`);
  // Tally equals what actually entered the stockpile.
  assert.ok(Math.abs(r.stockpile.materials.tools - produced) < 0.5, 'tally tracks real stockpile output');
});

test('arms factory ammo line tallies crates (1/day) alongside pooled ammo without touching the crate stockpile', () => {
  const state = mkState({ a: { typeId: 'arms_factory', workers: 6, recipe: 'ammo_crates' } }, { metal: 80 });
  const r = tick(state, DAY * 3); // 3 full days
  const items = (r.lifetimeStats as any)?.itemsProduced ?? {};
  assert.ok(Math.abs(items.ammo - 60) < 1, `3 days × 20 rounds pooled (got ${items.ammo})`);
  assert.ok(Math.abs(items.crates - 3) < 0.01, `3 days × 1 crate tallied (got ${items.crates})`);
  assert.equal(r.stockpile.ammo.crates, undefined, 'crates meter never writes into the stockpile');
});
