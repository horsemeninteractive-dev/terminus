import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState, buildFreestanding, establishSettlementHQ } from '../src/services/settlementService';
import { equipBuildingWeapon } from '../src/services/combatService';
import type { SettlementState, AdaptedBuilding } from '../src/types/settlement';
import type { BuildingPolygon } from '../src/types/map';

function makeHq(): BuildingPolygon {
  return {
    id: 'b_hq_armament_test',
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
      // Complete construction + assign a guard so the tower is manned.
      freestandingBuildings: r.newState.freestandingBuildings.map((f, i) =>
        i === r.newState.freestandingBuildings.length - 1
          ? { ...f, constructionStatus: 'completed' as const, constructionProgress: 100, constructionWorkDone: f.constructionWorkRequired, assignedWorkers: 2 }
          : f
      ),
    } as unknown as SettlementState,
    tower: { ...tower, constructionStatus: 'completed' as const, constructionProgress: 100, assignedWorkers: 2 } as AdaptedBuilding,
  };
}

function withArmory(state: SettlementState, weapons: string[]): SettlementState {
  return {
    ...state,
    armory: { weapons: weapons as any, armor: [] },
  } as unknown as SettlementState;
}

test('equipping a tower removes the weapon from the armory and mounts it', () => {
  let state = createInitialSettlementState('Armament Test');
  state = establishSettlementHQ(state, makeHq());
  const { state: placed, tower } = placeTower(state);
  state = withArmory(placed, ['pistol', 'shotgun']);

  const res = equipBuildingWeapon(state, tower.buildingId, 'pistol' as any);
  assert.ok(res.success, res.error || 'equip should succeed');
  const armed = res.newState.freestandingBuildings.find(
    (f) => String(f.buildingId) === String(tower.buildingId)
  )!;
  assert.equal(armed.equippedWeaponId, 'pistol', 'tower carries the chosen weapon');
  assert.deepEqual(res.newState.armory!.weapons, ['shotgun'], 'weapon removed from the armory');
});

test('swapping weapons returns the old one to the armory', () => {
  let state = createInitialSettlementState('Armament Test');
  state = establishSettlementHQ(state, makeHq());
  const { state: placed, tower } = placeTower(state);
  state = withArmory(placed, ['pistol', 'shotgun']);

  const first = equipBuildingWeapon(state, tower.buildingId, 'pistol' as any);
  assert.ok(first.success);
  const second = equipBuildingWeapon(first.newState, tower.buildingId, 'shotgun' as any);
  assert.ok(second.success, second.error || 'swap should succeed');
  const armed = second.newState.freestandingBuildings.find(
    (f) => String(f.buildingId) === String(tower.buildingId)
  )!;
  assert.equal(armed.equippedWeaponId, 'shotgun', 'new weapon mounted');
  assert.deepEqual(
    second.newState.armory!.weapons,
    ['pistol'],
    'the previous weapon returns to the armory'
  );
});

test('unequipping returns the weapon to the armory', () => {
  let state = createInitialSettlementState('Armament Test');
  state = establishSettlementHQ(state, makeHq());
  const { state: placed, tower } = placeTower(state);
  state = withArmory(placed, ['pistol']);
  const armed = equipBuildingWeapon(state, tower.buildingId, 'pistol' as any);
  assert.ok(armed.success);

  const unequip = equipBuildingWeapon(armed.newState, tower.buildingId, null);
  assert.ok(unequip.success, unequip.error || 'unequip should succeed');
  const unarmed = unequip.newState.freestandingBuildings.find(
    (f) => String(f.buildingId) === String(tower.buildingId)
  )!;
  assert.equal(unarmed.equippedWeaponId, undefined, 'tower weapon cleared');
  assert.deepEqual(unequip.newState.armory!.weapons, ['pistol'], 'weapon back in the armory');
});

test('equip rejects non-towers, unbuilt towers, melee, missing armory stock and same-weapon repeats', () => {
  let state = createInitialSettlementState('Armament Test');
  state = establishSettlementHQ(state, makeHq());
  const { state: placed, tower } = placeTower(state);
  const armed = withArmory(placed, ['pistol', 'knife', 'shotgun']);

  // Non-weaponMountable structure (HQ warehouse adaptation-like OSM building).
  const warehouse = {
    buildingId: 'b_wh',
    typeId: 'warehouse',
    constructionStatus: 'completed',
    position: { x: 0, z: 0 },
    equippedWeaponId: undefined,
  } as unknown as AdaptedBuilding;
  const withWarehouse = {
    ...armed,
    adaptedBuildings: new Map([['b_wh', warehouse]]),
  } as unknown as SettlementState;
  const nonTower = equipBuildingWeapon(withWarehouse, 'b_wh', 'pistol' as any);
  assert.equal(nonTower.success, false);
  assert.match(nonTower.error || '', /cannot mount/);

  // Under-construction tower refuses weapons.
  const inProgress = placeTower(armed);
  const raw = inProgress.state.freestandingBuildings[inProgress.state.freestandingBuildings.length - 1];
  const unbuiltState = {
    ...inProgress.state,
    freestandingBuildings: inProgress.state.freestandingBuildings.map((f) =>
      String(f.buildingId) === String(raw.buildingId)
        ? { ...f, constructionStatus: 'in_progress' as const }
        : f
    ),
  } as unknown as SettlementState;
  const unbuilt = equipBuildingWeapon(unbuiltState, raw.buildingId, 'pistol' as any);
  assert.equal(unbuilt.success, false);
  assert.match(unbuilt.error || '', /fully built/);

  // Melee cannot be mounted.
  const melee = equipBuildingWeapon(armed, tower.buildingId, 'knife' as any);
  assert.equal(melee.success, false);
  assert.match(melee.error || '', /ranged/);

  // A weapon not in the armory is refused.
  const noStock = equipBuildingWeapon(armed, tower.buildingId, 'assault_rifle' as any);
  assert.equal(noStock.success, false);
  assert.match(noStock.error || '', /not in the colony armory/);

  // Equipping the same weapon twice is a no-op error.
  const ok = equipBuildingWeapon(armed, tower.buildingId, 'pistol' as any);
  assert.ok(ok.success);
  const again = equipBuildingWeapon(ok.newState, tower.buildingId, 'pistol' as any);
  assert.equal(again.success, false);
  assert.match(again.error || '', /already carries/);
});