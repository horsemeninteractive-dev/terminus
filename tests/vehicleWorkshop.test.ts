import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState } from '../src/services/settlementService';
import {
  cancelVehicleWorkshopOrder,
  createVehicleWorkshopOrder,
  tickVehicleWorkshops,
} from '../src/services/vehicleWorkshopService';
import type { SettlementState } from '../src/types/settlement';
import type { WorldVehicle } from '../src/types/vehicle';

function mkVehicle(overrides: Partial<WorldVehicle>): WorldVehicle {
  const base: WorldVehicle = {
    id: 'veh_1',
    type: 'car',
    name: 'Civilian Sedan / SUV',
    condition: 'salvageable',
    position: { x: 0, z: 0 },
    rotation: 0,
    y: 0,
    currentHp: 220,
    maxHp: 220,
    fuelType: 'gasoline',
    currentFuel: 0,
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

function mkWorkshop(overrides: Record<string, unknown> = {}): any {
  return {
    buildingId: 'ws_1',
    typeId: 'vehicle_workshop',
    isHQ: false,
    name: 'Vehicle Workshop',
    category: 'production',
    adaptedAt: 0,
    footprintAreaM2: 300,
    adaptedAreaM2: 300,
    adaptationPercentage: 100,
    totalFloorAreaM2: 600,
    volumeM3: 1800,
    maxCapacity: 2,
    currentUsage: 0,
    capacityUnit: 'Vehicle Bays',
    maxDurability: 520,
    currentDurability: 520,
    defenseRating: 50,
    isFreestanding: false,
    position: { x: 0, z: 0 },
    height: 4,
    levels: 1,
    polygon: [],
    constructionStatus: 'completed',
    constructionProgress: 100,
    constructionWorkRequired: 100,
    constructionWorkDone: 100,
    assignedWorkers: 2,
    ...overrides,
  };
}

function makeState(vehicle: WorldVehicle, workshopOverrides: Record<string, unknown> = {}): SettlementState {
  const base = createInitialSettlementState('Workshop Test');
  return {
    ...base,
    vehicles: [vehicle],
    vehicleWorkshopOrders: [],
    adaptedBuildings: new Map([['ws_1', mkWorkshop(workshopOverrides)]]),
    // Everything else zeroed so the only stockpile movements are the
    // workshop's own (metal 200 / capacity 850 → 650 free).
    totalStorageCapacity: 850,
    stockpile: {
      food: { canned_goods: 0, mre_rations: 0, dried_rations: 0, fresh_harvest: 0 },
      water: { bottled_water: 0, purified_water: 0, rainwater: 0 },
      medical: { first_aid_kits: 0, sterile_bandages: 0, antibiotics: 0, painkillers: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      ammo: { sharedPool: 0 },
      materials: { wood: 0, metal: 200, bricks: 0, tools: 0 },
    },
  } as unknown as SettlementState;
}

test('workshop repairs a parked vehicle over time, consuming metal per HP', () => {
  const car = mkVehicle({ currentHp: 0 });
  const state = makeState(car);
  const queued = createVehicleWorkshopOrder(state, { type: 'repair', vehicleId: 'veh_1' });
  assert.ok(queued.success, queued.error || 'repair should queue');
  assert.equal(queued.newState!.vehicleWorkshopOrders!.length, 1);

  // A full in-game day (600 s) with 2 mechanics = 48 mechanic-hours, far more
  // than the ~2 h this job needs — it completes within the tick.
  const day = tickVehicleWorkshops(queued.newState!, 600, false);
  const repaired = day.newState.vehicles.find((v) => v.id === 'veh_1')!;
  assert.equal(repaired.currentHp, 220, 'chassis restored to full integrity');
  assert.equal(repaired.workshopJobId, null, 'bay released on completion');
  assert.equal(day.newState.vehicleWorkshopOrders!.length, 0);
  assert.equal(day.newState.stockpile.materials.metal, 200 - 20, 'repairMetalCost consumed');
});

test('unstaffed or distant workshop refuses to queue; night holds the job', () => {
  // No workers → clear error at queue time.
  const car = mkVehicle({ currentHp: 100 });
  const idleState = makeState(car, { assignedWorkers: 0 });
  const refused = createVehicleWorkshopOrder(idleState, { type: 'repair', vehicleId: 'veh_1' });
  assert.equal(refused.success, false);
  assert.match(refused.error || '', /staffed/);

  // Vehicle 40 m from the workshop → must be parked in the bay first.
  const far = mkVehicle({ currentHp: 100, position: { x: 40, z: 0 } });
  const farState = makeState(far);
  const farRes = createVehicleWorkshopOrder(farState, { type: 'repair', vehicleId: 'veh_1' });
  assert.equal(farRes.success, false);
  assert.match(farRes.error || '', /inside the workshop bay/);

  // Night: the queued job holds with zero progress.
  const nightState = makeState(mkVehicle({ currentHp: 100 }));
  const queued = createVehicleWorkshopOrder(nightState, { type: 'repair', vehicleId: 'veh_1' });
  assert.ok(queued.success);
  const held = tickVehicleWorkshops(queued.newState!, 600, true);
  assert.equal(held.newState.vehicles[0].currentHp, 100, 'night shift does not work');
  assert.equal(held.newState.vehicleWorkshopOrders!.length, 1, 'order stays queued overnight');
});

test('dismantling a chassis recovers scrap metal and removes the vehicle', () => {
  const car = mkVehicle({});
  const state = makeState(car);
  const queued = createVehicleWorkshopOrder(state, { type: 'dismantle', vehicleId: 'veh_1' });
  assert.ok(queued.success, queued.error || 'dismantle should queue');
  assert.equal(queued.newState!.vehicles[0].assignedSquadId, null);
  assert.equal(queued.newState!.vehicles[0].workshopJobId, queued.newState!.vehicleWorkshopOrders![0].id);

  const day = tickVehicleWorkshops(queued.newState!, 600, false);
  assert.equal(day.newState.vehicles.length, 0, 'chassis removed after dismantle');
  assert.equal(day.newState.stockpile.materials.metal, 200 + 35, 'scrap metal recovered');
  assert.equal(day.newState.vehicleWorkshopOrders!.length, 0);
});

test('dismantling with full storage strands the scrap as recoverable field loot', () => {
  const car = mkVehicle({});
  // Storage: 850 ceiling, metal 842 → only 8 free. Car scrap is 35 metal:
  // 8 deposits, 27 strands at the workshop as a field-loot pile.
  const state = makeState(car);
  state.stockpile.materials.metal = 842;
  const queued = createVehicleWorkshopOrder(state, { type: 'dismantle', vehicleId: 'veh_1' });
  assert.ok(queued.success, queued.error || 'dismantle should queue');

  const day = tickVehicleWorkshops(queued.newState!, 600, false);
  const s = day.newState;
  assert.equal(s.vehicles.length, 0, 'chassis removed');
  assert.equal(s.stockpile.materials.metal, 850, 'storage filled to exactly the ceiling');
  assert.equal(s.overflowLootUnits, 27, 'overflow reported');
  assert.equal((s.fieldLootPiles || []).length, 1, 'scrap stranded as a pile');
  assert.equal(s.fieldLootPiles![0].metal, 27, 'pile holds the refused scrap');
  assert.deepEqual(
    { x: Math.round(s.fieldLootPiles![0].position.x), z: Math.round(s.fieldLootPiles![0].position.z) },
    { x: 0, z: 0 },
    'pile sits at the workshop'
  );
});

test('fabrication consumes metal over time and rolls out a fresh vehicle', () => {
  const state = makeState(mkVehicle({}));
  const queued = createVehicleWorkshopOrder(state, { type: 'fabricate', vehicleType: 'cargo_van' });
  assert.ok(queued.success, queued.error || 'fabrication should queue');

  // Day 1: partial progress — metal consumed for the worked fraction.
  const partial = tickVehicleWorkshops(queued.newState!, 60, false); // 2.4 h with 2 mechanics
  const pOrder = partial.newState.vehicleWorkshopOrders![0];
  assert.ok(pOrder.mechanicHoursDone > 0 && pOrder.mechanicHoursDone < 16, 'job partially advanced');
  assert.ok(partial.newState.stockpile.materials.metal < 200, 'metal consumed as work advanced');
  assert.equal(partial.newState.vehicles.length, 1, 'no vehicle yet');

  // Finish the remaining hours.
  let s = partial.newState;
  while ((s.vehicleWorkshopOrders || []).length > 0) {
    const r = tickVehicleWorkshops(s, 600, false);
    if (r.newState === s) break;
    s = r.newState;
  }
  const done = s;
  assert.equal(done.vehicleWorkshopOrders!.length, 0, 'fabrication finished');
  assert.equal(done.vehicles.length, 2, 'new vehicle rolled out');
  const fresh = done.vehicles.find((v) => v.id !== 'veh_1')!;
  assert.equal(fresh.type, 'cargo_van');
  assert.equal(fresh.condition, 'operational');
  assert.equal(fresh.position.x, 0);
  assert.equal(fresh.position.z, 0);
  assert.equal(done.stockpile.materials.metal, 200 - 100, 'full fabrication metal consumed');
});

test('cancelling an order releases the vehicle from the bay', () => {
  const car = mkVehicle({ currentHp: 120 });
  const state = makeState(car);
  const queued = createVehicleWorkshopOrder(state, { type: 'repair', vehicleId: 'veh_1' });
  assert.ok(queued.success);
  const cancelled = cancelVehicleWorkshopOrder(queued.newState!, queued.newState!.vehicleWorkshopOrders![0].id);
  assert.equal(cancelled.newState.vehicleWorkshopOrders!.length, 0);
  assert.equal(cancelled.newState.vehicles[0].workshopJobId, null);
});
