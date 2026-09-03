import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState, buildFreestanding, establishSettlementHQ } from '../src/services/settlementService';
import { createZombieUnit, tickCombatSimulation } from '../src/services/combatService';
import { WEAPON_CATALOG } from '../src/types/combat';
import type { SettlementState, AdaptedBuilding } from '../src/types/settlement';
import type { BuildingPolygon } from '../src/types/map';

function makeHq(): BuildingPolygon {
  return {
    id: 'b_hq_bow_test',
    type: 'residential' as unknown as BuildingPolygon['type'],
    rawType: 'headquarters',
    name: 'Test HQ',
    height: 12,
    levels: 3,
    center: { x: 0, z: 0 },
    polygon: [
      { x: -8, z: -8 },
      { x: 8, z: -8 },
      { x: 8, z: 8 },
      { x: -8, z: 8 },
    ],
    tags: {},
  };
}

function placeTower(state: SettlementState, x = 20, z = 0): { state: SettlementState; tower: AdaptedBuilding } {
  const r = buildFreestanding(state, 'wooden_tower', { x, z }, 8, 8, 6, 0);
  if (!r.success) throw new Error(`place tower failed: ${r.error}`);
  const tower = r.newState.freestandingBuildings[r.newState.freestandingBuildings.length - 1];
  return {
    state: {
      ...r.newState,
      freestandingBuildings: r.newState.freestandingBuildings.map((f, i) =>
        i === r.newState.freestandingBuildings.length - 1
          ? { ...f, constructionStatus: 'completed' as const, constructionProgress: 100, constructionWorkDone: f.constructionWorkRequired, assignedWorkers: 2 }
          : f
      ),
    } as unknown as SettlementState,
    tower: { ...tower, constructionStatus: 'completed' as const, constructionProgress: 100, assignedWorkers: 2 } as AdaptedBuilding,
  };
}

function withAmmo(state: SettlementState, amount: number): SettlementState {
  return {
    ...state,
    stockpile: {
      ...state.stockpile,
      ammo: { ...(state.stockpile?.ammo || {}), sharedPool: amount },
    },
  } as unknown as SettlementState;
}

function withMountedWeapon(state: SettlementState, buildingId: string | number, weaponId: string | null): SettlementState {
  return {
    ...state,
    freestandingBuildings: state.freestandingBuildings.map((f) =>
      String(f.buildingId) === String(buildingId)
        ? { ...f, equippedWeaponId: weaponId === null ? undefined : (weaponId as any) }
        : f
    ),
  } as unknown as SettlementState;
}

/** A single tower volley lands: fireInterval 2s, delta 2s → always crosses a bucket. */
const clock = {
  isNight: true,
  night: true,
  speed: 1,
  day: 1,
  phase: 'night',
  hour: 22,
  minute: 0,
  totalElapsedSeconds: 10,
} as any;

test('the bow fallback weapon is ammo-free (ammoPerVolley 0) with real reach', () => {
  assert.equal(WEAPON_CATALOG.bow.ammoPerVolley, 0, 'bows use infinite ammunition');
  assert.ok(WEAPON_CATALOG.bow.damage > 0);
  assert.ok(WEAPON_CATALOG.bow.range >= 30, 'a bow reaches across a tower perimeter');
  assert.equal(WEAPON_CATALOG.bow.id, 'bow');
});

test('an unarmed manned tower fires a bow with INFINITE ammo — nothing is consumed', () => {
  let state = createInitialSettlementState('Bow Test');
  state = establishSettlementHQ(state, makeHq());
  const { state: placed } = placeTower(state);
  state = withAmmo(placed, 5);

  const zombie = createZombieUnit('shambler', 30, 0, 0, true);
  const before = zombie.currentHp;
  const r = tickCombatSimulation([zombie], [], new Map(), [], clock, null, 2, state);

  assert.ok(
    r.updatedZombies[0].currentHp < before,
    `the unarmed tower still engaged (hp ${before} → ${r.updatedZombies[0].currentHp})`
  );
  assert.equal(r.ammoConsumed, 0, 'the bow fallback never draws ammunition');
});

test('an unarmed tower with ZERO ammunition still fires — the bow is infinite', () => {
  let state = createInitialSettlementState('Bow Test');
  state = establishSettlementHQ(state, makeHq());
  const { state: placed } = placeTower(state);
  state = withAmmo(placed, 0);

  const zombie = createZombieUnit('shambler', 30, 0, 0, true);
  const before = zombie.currentHp;
  const r = tickCombatSimulation([zombie], [], new Map(), [], clock, null, 2, state);

  assert.ok(r.updatedZombies[0].currentHp < before, 'zero ammo does not silence the bow fallback');
  assert.equal(r.ammoConsumed, 0);
});

test('a tower carrying only a melee weapon still fires the bow fallback', () => {
  let state = createInitialSettlementState('Bow Test');
  state = establishSettlementHQ(state, makeHq());
  const { state: placed, tower } = placeTower(state);
  state = withMountedWeapon(withAmmo(placed, 5), tower.buildingId, 'axe');

  const zombie = createZombieUnit('shambler', 30, 0, 0, true);
  const before = zombie.currentHp;
  const r = tickCombatSimulation([zombie], [], new Map(), [], clock, null, 2, state);

  assert.ok(r.updatedZombies[0].currentHp < before, 'a melee mount cannot stop the tower from shooting');
  assert.equal(r.ammoConsumed, 0, 'the bow fallback covers melee mounts with no ammo cost');
});

test('a firearm-mounted tower fires the FIREARM and consumes ammo', () => {
  let state = createInitialSettlementState('Bow Test');
  state = establishSettlementHQ(state, makeHq());
  const { state: placed, tower } = placeTower(state);
  state = withMountedWeapon(withAmmo(placed, 5), tower.buildingId, 'pistol');

  const zombie = createZombieUnit('shambler', 30, 0, 0, true);
  const before = zombie.currentHp;
  const r = tickCombatSimulation([zombie], [], new Map(), [], clock, null, 2, state);

  assert.ok(r.updatedZombies[0].currentHp < before, 'the mounted pistol fired');
  assert.equal(r.ammoConsumed, 1, 'a real firearm draws 1 ammo per volley');
});

test('a firearm-mounted tower with no ammo stays silent — the bow is a no-FIREARM fallback only', () => {
  let state = createInitialSettlementState('Bow Test');
  state = establishSettlementHQ(state, makeHq());
  const { state: placed, tower } = placeTower(state);
  state = withMountedWeapon(withAmmo(placed, 0), tower.buildingId, 'pistol');

  const zombie = createZombieUnit('shambler', 30, 0, 0, true);
  const before = zombie.currentHp;
  const r = tickCombatSimulation([zombie], [], new Map(), [], clock, null, 2, state);

  assert.equal(r.updatedZombies[0].currentHp, before, 'a dry firearm means no shot — resupply the tower');
  assert.equal(r.ammoConsumed, 0);
});