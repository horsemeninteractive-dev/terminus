import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState } from '../src/services/settlementService';
import {
  deliverCarriedFuel,
  pickFuelCarrierSquad,
  startManualFuelDelivery,
} from '../src/services/vehicleService';
import { runLogisticsStage } from '../src/services/logisticsPipeline';
import { orderSquadMove } from '../src/services/combatService';
import type { SettlementState } from '../src/types/settlement';
import type { WorldVehicle } from '../src/types/vehicle';
import type { TacticalSquadUnit } from '../src/types/combat';
import type { MapData } from '../src/types/map';

function mkVehicle(overrides: Partial<WorldVehicle> = {}): WorldVehicle {
  const base: WorldVehicle = {
    id: 'veh_1',
    type: 'car',
    name: 'Civilian Sedan / SUV',
    condition: 'operational',
    position: { x: 0, z: 0 },
    rotation: 0,
    y: 0,
    currentHp: 220,
    maxHp: 220,
    fuelType: 'gasoline',
    currentFuel: 10,
    maxFuel: 50,
    fuelConsumptionPer100m: 0.8,
    assignedSquadId: null,
    isMoving: false,
    roadPathWaypoints: [],
    currentWaypointIndex: 0,
    targetPos: null,
    speed: 0,
    isDiscovered: true,
    isSiphoned: false,
    isParkedAtHQ: true,
    totalDistanceDriven: 0,
    killCount: 0,
  };
  return { ...base, ...overrides };
}

function mkSquad(overrides: Partial<TacticalSquadUnit> = {}): TacticalSquadUnit {
  const base: TacticalSquadUnit = {
    squadId: 'sq_1',
    name: 'Scav Team',
    leaderId: 'ns_1',
    leaderName: 'Field Leader',
    leaderCombatTier: 'novice',
    generalCount: 3,
    x: 100,
    z: 100,
    y: 0,
    rotation: 0,
    currentHp: 100,
    maxHp: 100,
    attackRange: 15,
    fireRate: 0.8,
    lastFireTime: 0,
    damagePerVolley: 10,
    critChance: 0.1,
    moveSpeed: 1.5,
    state: 'idle',
    manualOrder: false,
    targetPos: null,
    targetZombieId: null,
    isDeployed: true,
    killCount: 0,
    isInSafeZone: false,
    members: [
      { id: 'm1', survivorId: 'ns_1', name: 'Leader', isLeader: true, isAlive: true, currentHp: 100, maxHp: 100, weaponId: 'pistol', armorId: null, faceUrl: '' },
      { id: 'm2', survivorId: 'ns_2', name: 'Recruit', isLeader: false, isAlive: true, currentHp: 100, maxHp: 100, weaponId: 'knife', armorId: null, faceUrl: '' },
      { id: 'm3', survivorId: 'ns_3', name: 'Recruit', isLeader: false, isAlive: true, currentHp: 100, maxHp: 100, weaponId: 'knife', armorId: null, faceUrl: '' },
      { id: 'm4', survivorId: 'ns_4', name: 'Recruit', isLeader: false, isAlive: true, currentHp: 100, maxHp: 100, weaponId: 'knife', armorId: null, faceUrl: '' },
    ],
    inventory: [],
    currentWeightKg: 0,
    maxWeightKg: 40,
  };
  return { ...base, ...overrides } as unknown as TacticalSquadUnit;
}

function makeState(
  vehicle: WorldVehicle,
  overrides: Partial<SettlementState> = {}
): SettlementState {
  const base = createInitialSettlementState('Fuel Test');
  return {
    ...base,
    vehicles: [vehicle],
    stockpile: {
      ...base.stockpile,
      fuel: { ...base.stockpile.fuel, gasoline: 200, diesel: 50 },
    },
    squadInventories: {},
    ...overrides,
  } as unknown as SettlementState;
}

function makeMap(): MapData {
  return {
    center: { lat: 51.5, lon: -0.12 },
    radius: 600,
    elevation: {
      minElevation: 10,
      maxElevation: 30,
      baseElevation: 20,
      resolution: 2,
      grid: [[20, 20], [20, 20]],
      bounds: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 },
    },
    buildings: [],
    roads: [],
    landuse: [],
    resourceNodes: [],
    bounds: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 },
    stats: {
      buildingCount: 0,
      roadCount: 0,
      resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 },
      elevationRangeMeters: 20,
      processedTimeMs: 0,
    },
    fetchedAt: 0,
    source: 'test',
  } as unknown as MapData;
}

test('manual refuel withdraws fuel into a squad backpack and dispatches them to the vehicle', () => {
  const vehicle = mkVehicle({ currentFuel: 10 }); // needs 40L
  const state = makeState(vehicle);
  const squad = mkSquad();

  const res = startManualFuelDelivery(state, vehicle, squad, 25);
  assert.ok(res.success, res.error || 'dispatch should succeed');
  assert.equal(res.newState!.stockpile.fuel.gasoline, 175, 'stockpile deducted 25L');
  const inv = res.newState!.squadInventories!['sq_1'];
  assert.equal(inv.items.length, 1, 'a fuel item occupies one backpack slot');
  assert.equal(inv.used, 1);
  assert.equal(inv.items[0].label, 'gasoline');
  assert.equal(inv.items[0].quantity, 25);
  assert.equal(res.updatedSquad!.pendingFuelDeliveryVehicleId, 'veh_1');
  assert.deepEqual(res.updatedSquad!.targetPos, { x: 0, z: 0 });
  assert.equal(res.updatedSquad!.state, 'moving');
  // The vehicle itself is untouched until the squad arrives.
  assert.equal(res.newState!.vehicles[0].currentFuel, 10);
});

test('manual refuel is capped by tank need and refused without stock / with a full tank', () => {
  const vehicle = mkVehicle({ currentFuel: 45, maxFuel: 50 }); // needs 5L
  const state = makeState(vehicle);
  const res = startManualFuelDelivery(state, vehicle, mkSquad(), 25);
  assert.ok(res.success, res.error || 'dispatch should succeed');
  assert.equal(res.newState!.squadInventories!['sq_1'].items[0].quantity, 5, 'only what the tank needs is withdrawn');

  const empty = makeState(mkVehicle());
  empty.stockpile.fuel.gasoline = 0;
  const noStock = startManualFuelDelivery(empty, mkVehicle(), mkSquad(), 25);
  assert.equal(noStock.success, false);
  assert.match(noStock.error || '', /reserve/);

  const full = makeState(mkVehicle({ currentFuel: 50 }));
  const fullTank = startManualFuelDelivery(full, mkVehicle({ currentFuel: 50 }), mkSquad(), 25);
  assert.equal(fullTank.success, false);
  assert.match(fullTank.error || '', /full/);
});

test('manual refuel is refused when the squad backpack has no free slot or a delivery is in flight', () => {
  const state = makeState(mkVehicle());
  state.squadInventories!['sq_1'] = {
    capacity: 4,
    used: 4,
    items: [
      { id: 'i1', kind: 'resource', label: 'canned_goods', quantity: 5, weight: 1 },
      { id: 'i2', kind: 'resource', label: 'canned_goods', quantity: 5, weight: 1 },
      { id: 'i3', kind: 'resource', label: 'canned_goods', quantity: 5, weight: 1 },
      { id: 'i4', kind: 'resource', label: 'canned_goods', quantity: 5, weight: 1 },
    ],
  };
  const full = startManualFuelDelivery(state, mkVehicle(), mkSquad(), 25);
  assert.equal(full.success, false);
  assert.match(full.error || '', /backpack slot/);

  // A squad whose inventory entry is stale (used ≠ items.length) is judged by
  // the actual carried stack count, so a genuinely empty backpack still works.
  const stale = makeState(mkVehicle());
  stale.squadInventories!['sq_1'] = {
    capacity: 4,
    used: 4,
    items: [],
  };
  const usable = startManualFuelDelivery(stale, mkVehicle(), mkSquad(), 25);
  assert.ok(usable.success, 'an empty backpack must be usable even with a stale used counter');

  const state2 = makeState(mkVehicle());
  const busy = startManualFuelDelivery(state2, mkVehicle(), mkSquad({ pendingFuelDeliveryVehicleId: 'veh_other' }), 25);
  assert.equal(busy.success, false);
  assert.match(busy.error || '', /already carrying/);
});

test('pickFuelCarrierSquad prefers the mounted squad, then the nearest free squad', () => {
  const vehicle = mkVehicle({ assignedSquadId: 'sq_mounted', position: { x: 0, z: 0 } });
  const mounted = mkSquad({ squadId: 'sq_mounted', x: 0, z: 0, mountedVehicleId: 'veh_1' });
  const near = mkSquad({ squadId: 'sq_near', x: 5, z: 5 });
  const far = mkSquad({ squadId: 'sq_far', x: 900, z: 900 });
  const state = makeState(vehicle);

  assert.equal(pickFuelCarrierSquad(state, vehicle, [far, near, mounted])!.squadId, 'sq_mounted');

  // No mounted squad → nearest unmounted with a free slot.
  const unassigned = mkVehicle();
  assert.equal(pickFuelCarrierSquad(state, unassigned, [far, near])!.squadId, 'sq_near');

  // Nobody can carry → null. (far squad has a full backpack, near is mounting.)
  state.squadInventories!['sq_far'] = {
    capacity: 4,
    used: 4,
    items: [
      { id: 'i1', kind: 'resource', label: 'metal', quantity: 1, weight: 1 },
      { id: 'i2', kind: 'resource', label: 'metal', quantity: 1, weight: 1 },
      { id: 'i3', kind: 'resource', label: 'metal', quantity: 1, weight: 1 },
      { id: 'i4', kind: 'resource', label: 'metal', quantity: 1, weight: 1 },
    ],
  };
  const busyNear = mkSquad({ squadId: 'sq_near', x: 5, z: 5, pendingMountVehicleId: 'veh_other' });
  assert.equal(pickFuelCarrierSquad(state, unassigned, [far, busyNear]), null);
});

test('deliverCarriedFuel pours the carried fuel into the tank and consumes the item', () => {
  const vehicle = mkVehicle({ currentFuel: 10 }); // room for 40L
  const state = makeState(vehicle);
  state.squadInventories!['sq_1'] = {
    capacity: 4,
    used: 1,
    items: [{ id: 'fuel_x', kind: 'resource', label: 'gasoline', quantity: 25, weight: 1 }],
  };
  const squad = mkSquad({ x: 0, z: 0, pendingFuelDeliveryVehicleId: 'veh_1' });

  const res = deliverCarriedFuel(state, squad, vehicle);
  assert.equal(res.deliveredLiters, 25);
  assert.equal(res.newState.vehicles[0].currentFuel, 35);
  assert.equal(res.newState.squadInventories!['sq_1'].items.length, 0, 'empty can consumed');
  assert.equal(res.newState.squadInventories!['sq_1'].used, 0);
  assert.equal(res.updatedSquad.pendingFuelDeliveryVehicleId, null);
});

test('deliverCarriedFuel caps at maxFuel and splits a partial can back into the backpack', () => {
  const vehicle = mkVehicle({ currentFuel: 45 }); // room for 5L only
  const state = makeState(vehicle);
  state.squadInventories!['sq_1'] = {
    capacity: 4,
    used: 1,
    items: [{ id: 'fuel_x', kind: 'resource', label: 'gasoline', quantity: 25, weight: 1 }],
  };
  const squad = mkSquad({ x: 0, z: 0, pendingFuelDeliveryVehicleId: 'veh_1' });

  const res = deliverCarriedFuel(state, squad, vehicle);
  assert.equal(res.deliveredLiters, 5);
  assert.equal(res.newState.vehicles[0].currentFuel, 50, 'tank filled to the cap');
  const leftover = res.newState.squadInventories!['sq_1'].items[0];
  assert.equal(leftover.quantity, 20, 'unused fuel stays in the can');
  assert.equal(res.updatedSquad.pendingFuelDeliveryVehicleId, null);

  // Tank already full → no-op that still clears the flag.
  const full = makeState(mkVehicle({ currentFuel: 50 }));
  full.squadInventories!['sq_1'] = {
    capacity: 4,
    used: 1,
    items: [{ id: 'fuel_x', kind: 'resource', label: 'gasoline', quantity: 25, weight: 1 }],
  };
  const noRoom = deliverCarriedFuel(full, squad, mkVehicle({ currentFuel: 50 }));
  assert.equal(noRoom.deliveredLiters, 0);
  assert.equal(noRoom.newState.squadInventories!['sq_1'].items.length, 1, 'can not consumed');
  assert.equal(noRoom.updatedSquad.pendingFuelDeliveryVehicleId, null);
});

test('logistics stage completes the delivery when the squad reaches the vehicle', () => {
  const vehicle = mkVehicle({ currentFuel: 10 });
  const state = makeState(vehicle);
  state.squadInventories!['sq_1'] = {
    capacity: 4,
    used: 1,
    items: [{ id: 'fuel_x', kind: 'resource', label: 'gasoline', quantity: 25, weight: 1 }],
  };
  const squad = mkSquad({ x: 0.5, z: 0.5, pendingFuelDeliveryVehicleId: 'veh_1', state: 'idle' });
  const map = makeMap();

  const res = runLogisticsStage(state, map, [squad]);
  assert.equal(res.state.vehicles[0].currentFuel, 35, 'fuel poured on arrival');
  assert.equal(res.state.squadInventories!['sq_1'].items.length, 0);
  assert.equal(res.squads[0].pendingFuelDeliveryVehicleId, null);
  assert.ok(
    res.events.some((e) => e.title === 'FUEL DELIVERED'),
    'a delivery toast is emitted'
  );
  assert.equal(res.state.stockpile.fuel.gasoline, 200, 'stockpile not double-charged');
});

test('logistics stage leaves an en-route carrier alone and re-paths it when the vehicle moves', () => {
  const vehicle = mkVehicle({ currentFuel: 10, position: { x: 0, z: 0 } });
  const state = makeState(vehicle);
  state.squadInventories!['sq_1'] = {
    capacity: 4,
    used: 1,
    items: [{ id: 'fuel_x', kind: 'resource', label: 'gasoline', quantity: 25, weight: 1 }],
  };
  const squad = mkSquad({ x: 80, z: 0, pendingFuelDeliveryVehicleId: 'veh_1', state: 'idle', targetPos: null });
  const map = makeMap();

  const res = runLogisticsStage(state, map, [squad]);
  // Still far away: delivery stays pending and the squad is told to keep walking.
  assert.equal(res.squads[0].pendingFuelDeliveryVehicleId, 'veh_1');
  assert.deepEqual(res.squads[0].targetPos, { x: 0, z: 0 });
  assert.equal(res.squads[0].state, 'moving');
  assert.equal(res.state.vehicles[0].currentFuel, 10, 'no fuel delivered yet');
  assert.equal(res.state.squadInventories!['sq_1'].items.length, 1, 'can still in the backpack');
});

test('a fresh player move order cancels a fuel delivery in flight', () => {
  const squad = mkSquad({ x: 80, z: 0, pendingFuelDeliveryVehicleId: 'veh_1' });
  const updated = orderSquadMove([squad], 'sq_1', { x: 200, z: 200 });
  assert.equal(updated[0].pendingFuelDeliveryVehicleId, null);
  assert.equal(updated[0].manualOrder, true);
  assert.deepEqual(updated[0].targetPos, { x: 200, z: 200 });
});