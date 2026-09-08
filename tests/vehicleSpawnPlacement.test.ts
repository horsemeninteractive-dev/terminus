/**
 * Vehicle spawn placement: vehicles must never sit inside building/water
 * footprints (unclickable, unmountable, permanently blocked). Covers both the
 * procedural spawner's road-snap validation and the tick's embedded-vehicle
 * recovery for fixed-point spawns (convoy starter at origin, caravan arrivals).
 * Run: node --import tsx --import ./tests/register-loader.mjs --test tests/vehicleSpawnPlacement.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateWorldVehicles,
  updateVehiclesTick,
  isVehiclePlacementBlocked,
  unembedVehiclePosition,
} from '../src/services/vehicleService';
import type { MapData, BuildingPolygon, Point2D, RoadSegment } from '../src/types/map';
import type { WorldVehicle } from '../src/types/vehicle';

function makeBuilding(id: string, x: number, z: number, w: number, h: number): BuildingPolygon {
  const polygon: Point2D[] = [
    { x: x - w / 2, z: z - h / 2 },
    { x: x + w / 2, z: z - h / 2 },
    { x: x + w / 2, z: z + h / 2 },
    { x: x - w / 2, z: z + h / 2 },
  ];
  return {
    id,
    name: `Bldg ${id}`,
    type: 'residential',
    polygon,
    center: { x, z },
    levels: 1,
    height: 6,
  } as unknown as BuildingPolygon;
}

function makeMap(): MapData {
  const road: RoadSegment = {
    id: 'r1',
    points: [
      { x: -200, z: 0 },
      { x: 200, z: 0 },
    ],
    highwayType: 'residential',
  } as unknown as RoadSegment;
  return {
    roads: [road],
    buildings: [makeBuilding('big_hq', 0, 0, 40, 30)],
    landuse: [],
  } as unknown as MapData;
}

function makeVehicleAt(pos: Point2D): WorldVehicle {
  return {
    id: 'v_test',
    type: 'cargo_van',
    name: 'Test Van',
    condition: 'operational',
    position: { ...pos },
    rotation: 0,
    y: 0,
    currentHp: 300,
    maxHp: 300,
    fuelType: 'petrol',
    currentFuel: 50,
    maxFuel: 60,
    fuelConsumptionPer100m: 1.0,
    assignedSquadId: null,
    isMoving: false,
    roadPathWaypoints: [],
    currentWaypointIndex: 0,
    targetPos: null,
    speed: 9,
    isDiscovered: true,
    isSiphoned: false,
    isParkedAtHQ: false,
    totalDistanceDriven: 0,
    killCount: 0,
    inventory: [],
  };
}

test('every procedurally spawned vehicle lands on clear ground', () => {
  const map = makeMap();
  const vehicles = generateWorldVehicles(map, 12345);
  assert.ok(vehicles.length > 0);
  for (const v of vehicles) {
    assert.equal(
      isVehiclePlacementBlocked(v.position, map),
      false,
      `${v.name} spawned inside a footprint at ${v.position.x},${v.position.z}`
    );
  }
});

test('spawner avoids a seed whose preferred snap is inside a building', () => {
  // Seed sweep: with the 40x30 HQ block centred on the origin road, no seed
  // may produce an embedded vehicle.
  const map = makeMap();
  for (let seed = 1; seed <= 40; seed++) {
    for (const v of generateWorldVehicles(map, seed * 7919)) {
      assert.equal(isVehiclePlacementBlocked(v.position, map), false, `seed ${seed}: ${v.name}`);
    }
  }
});

test('embedded vehicle is relocated by the tick to clear ground', () => {
  const map = makeMap();
  const embedded = makeVehicleAt({ x: 5, z: 5 }); // deep inside the HQ block
  const result = updateVehiclesTick([embedded], [], [], 0.1, Date.now(), map);
  const healed = result.updatedVehicles[0];
  assert.equal(isVehiclePlacementBlocked(healed.position, map), false, 'vehicle still embedded after tick');
  // Relocation is local: it shouldn't teleport across the map.
  assert.ok(Math.hypot(healed.position.x - 5, healed.position.z - 5) < 20);
  assert.ok(result.notifications.some((n) => n.title === 'VEHICLE RELOCATED'));
});

test('clearly parked vehicle is left untouched by the recovery pass', () => {
  const map = makeMap();
  const parked = makeVehicleAt({ x: 100, z: 3 }); // clear of the 40x30 block
  const before = { ...parked.position };
  const result = updateVehiclesTick([parked], [], [], 0.1, Date.now(), map);
  assert.deepEqual(result.updatedVehicles[0].position, before);
  assert.equal(result.notifications.length, 0);
});

test('unembedVehiclePosition returns the input when already clear', () => {
  const map = makeMap();
  const clear = { x: 100, z: 3 };
  assert.deepEqual(unembedVehiclePosition(clear, map), clear);
});
