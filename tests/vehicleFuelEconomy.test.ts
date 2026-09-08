/**
 * Vehicle fuel economy: consumption was 0.8–1.4 L per 100m (10–17x reality),
 * draining a full tank in one or two cross-map drives. These tests pin the
 * definitions to the real-world-scale values so the rate can't silently regress.
 * Run: node --import tsx --import ./tests/register-loader.mjs --test tests/vehicleFuelEconomy.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLE_DEFINITIONS } from '../src/types/vehicle';
import { updateVehiclesTick } from '../src/services/vehicleService';
import type { MapData, RoadSegment } from '../src/types/map';
import type { WorldVehicle } from '../src/types/vehicle';

test('every vehicle has real-world-scale fuel economy (under 0.2 L per 100m)', () => {
  for (const def of Object.values(VEHICLE_DEFINITIONS)) {
    assert.ok(
      def.fuelConsumptionPer100m < 0.2,
      `${def.name}: ${def.fuelConsumptionPer100m} L/100m is unrealistically thirsty (expected < 0.2)`
    );
    assert.ok(def.fuelConsumptionPer100m > 0, `${def.name} must consume some fuel`);
  }
});

test('a full tank crosses the map several times (range over 25 km per vehicle)', () => {
  for (const def of Object.values(VEHICLE_DEFINITIONS)) {
    const rangeKm = (def.maxFuel / def.fuelConsumptionPer100m) / 1000 * 100;
    assert.ok(
      rangeKm >= 25,
      `${def.name} range ${rangeKm.toFixed(1)} km is too short — expeditions drain the tank in one trip`
    );
  }
});

test('driving the sim ticks consumes fuel at roughly the declared rate', () => {
  // Straight 5000m road; van at 13 m/s for 100s of sim time drives 1300m.
  const road: RoadSegment = {
    id: 'r1',
    points: [
      { x: 0, z: 0 },
      { x: 5000, z: 0 },
    ],
    highwayType: 'residential',
  } as unknown as RoadSegment;
  const map = { roads: [road], buildings: [], landuse: [] } as unknown as MapData;
  const def = VEHICLE_DEFINITIONS.cargo_van;
  const van: WorldVehicle = {
    id: 'v_economy',
    type: 'cargo_van',
    name: 'Economy Van',
    condition: 'operational',
    position: { x: 0, z: 0 },
    rotation: 0,
    y: 0,
    currentHp: def.maxHp,
    maxHp: def.maxHp,
    fuelType: def.fuelType,
    currentFuel: def.maxFuel,
    maxFuel: def.maxFuel,
    fuelConsumptionPer100m: def.fuelConsumptionPer100m,
    assignedSquadId: null,
    isMoving: true,
    roadPathWaypoints: [{ x: 5000, z: 0 }],
    currentWaypointIndex: 0,
    targetPos: { x: 5000, z: 0 },
    speed: def.speedMps,
    isDiscovered: true,
    isSiphoned: false,
    isParkedAtHQ: false,
    totalDistanceDriven: 0,
    killCount: 0,
    inventory: [],
  };

  assert.ok(van.isMoving, 'van should start underway');
  let current = van;
  for (let i = 0; i < 1000 && current.isMoving; i++) {
    current = updateVehiclesTick([current], [], [], 0.1, Date.now(), map).updatedVehicles[0];
  }
  const driven = Math.hypot(current.position.x - van.position.x, current.position.z - van.position.z);
  const burned = van.currentFuel - current.currentFuel;
  assert.ok(driven > 1000, `van should be underway (drove ${driven.toFixed(0)}m in 100s)`);
  const expectedBurn = (driven / 100) * VEHICLE_DEFINITIONS.cargo_van.fuelConsumptionPer100m;
  // The tick is distance-based; allow small float slack.
  assert.ok(
    Math.abs(burned - expectedBurn) < 0.5,
    `burned ${burned.toFixed(2)}L for ${driven.toFixed(0)}m; expected ~${expectedBurn.toFixed(2)}L`
  );
});
