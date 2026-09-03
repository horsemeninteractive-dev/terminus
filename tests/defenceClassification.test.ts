import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../src/data/functionalBuildings';
import { getBuildingJobForType } from '../src/services/populationService';

test('passive barriers are never guardable firing posts', () => {
  for (const id of ['barbed_wire', 'wooden_palisade', 'metal_fence', 'brick_wall', 'fortified_wall', 'floodlight_tower']) {
    const def = FUNCTIONAL_BUILDING_DEFINITIONS[id as keyof typeof FUNCTIONAL_BUILDING_DEFINITIONS];
    assert.equal(def.guardable, false, `${id} must not be a manned firing position`);
  }
});

test('gates and towers stay guardable firing positions', () => {
  for (const id of ['wooden_gate', 'metal_gate', 'fortified_gate', 'wooden_tower', 'metal_tower', 'fortified_tower']) {
    const def = FUNCTIONAL_BUILDING_DEFINITIONS[id as keyof typeof FUNCTIONAL_BUILDING_DEFINITIONS];
    assert.equal(def.guardable, true, `${id} must remain a mannable defence`);
  }
});

test('guard labour only attaches to mannable defences, never walls', () => {
  // Walls/fences/wire share the defense categories but must not create guard
  // posts — the colony's guards man towers and gatehouses instead.
  for (const id of ['barbed_wire', 'wooden_palisade', 'metal_fence', 'brick_wall', 'fortified_wall', 'floodlight_tower']) {
    const def = FUNCTIONAL_BUILDING_DEFINITIONS[id as keyof typeof FUNCTIONAL_BUILDING_DEFINITIONS];
    assert.equal(
      getBuildingJobForType({ typeId: def.id, category: def.category }),
      null,
      `${id} must not demand guard labour`
    );
  }
  for (const id of ['wooden_gate', 'metal_gate', 'fortified_gate', 'wooden_tower', 'metal_tower', 'fortified_tower']) {
    const def = FUNCTIONAL_BUILDING_DEFINITIONS[id as keyof typeof FUNCTIONAL_BUILDING_DEFINITIONS];
    assert.equal(
      getBuildingJobForType({ typeId: def.id, category: def.category }),
      'guard',
      `${id} must remain a guard post`
    );
  }
});

test('each tower declares the engagement range the combat sim must honour', () => {
  const expected: Record<string, number> = { wooden_tower: 120, metal_tower: 160, fortified_tower: 200 };
  for (const [id, range] of Object.entries(expected)) {
    const def = FUNCTIONAL_BUILDING_DEFINITIONS[id as keyof typeof FUNCTIONAL_BUILDING_DEFINITIONS];
    assert.equal(def.defenceProperties?.attackRangeM, range, `${id} must declare its ${range}m range`);
  }
  // Floodlight Tower is illumination infrastructure — it declares no firearm
  // engagement range and carries no weapon mount.
  const flood = FUNCTIONAL_BUILDING_DEFINITIONS.floodlight_tower;
  assert.ok(!flood.weaponMountable, 'floodlight tower is not a weapon platform');
  assert.equal(flood.adaptationAllowed, false, 'floodlight tower is purpose-built freestanding infrastructure');
});

test('the Fortified Gatehouse garrison matches the IFZ six-worker strength', () => {
  assert.equal(FUNCTIONAL_BUILDING_DEFINITIONS.fortified_gate.defenceProperties?.sentryCapacity, 6);
});
