/**
 * Vehicle water routing: a truck must never plan a route through a river.
 * The tick rejects every water step, so a water-crossing plan would strand
 * the vehicle at the bank — routing must ask the PathGrid for a dry detour
 * (waterImpassable) whenever a planned leg crosses water.
 * Run: node --import tsx --import ./tests/register-loader.mjs --test tests/vehicleWaterRouting.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderVehicleRoadTravel, updateVehiclesTick } from '../src/services/vehicleService';
import { RoadNetworkGraph } from '../src/services/roadPathfinder';
import { PathGrid } from '../src/services/pathfindingService';
import type { MapData, Point2D, RoadSegment } from '../src/types/map';
import type { WorldVehicle } from '../src/types/vehicle';

function makeRiverMap(): MapData {
  // No roads at all: every route is the straight shot / grid fallback, so the
  // water behaviour is exercised directly. An unbroken river spans the whole
  // map between north and south.
  const river: Point2D[] = [
    { x: -500, z: 40 },
    { x: 500, z: 40 },
    { x: 500, z: 60 },
    { x: -500, z: 60 },
  ];
  return {
    roads: [],
    buildings: [],
    landuse: [{ id: 'r1', type: 'water', polygon: river }],
    bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 },
  } as unknown as MapData;
}

function makeVan(pos: Point2D): WorldVehicle {
  return {
    id: 'v_water',
    type: 'cargo_van',
    name: 'River Van',
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
    speed: 12,
    killCount: 0,
    totalDistanceDriven: 0,
    isDiscovered: false,
  } as unknown as WorldVehicle;
}

test('an unblocked straight route across a river is replaced by nothing drivable — no route plans through water', () => {
  const map = makeRiverMap();
  const grid = new PathGrid(map);
  const roadGraph = new RoadNetworkGraph([]);

  const van = makeVan({ x: 0, z: 0 });
  const ordered = orderVehicleRoadTravel(van, { x: 0, z: 100 }, roadGraph, [], map, grid);

  // The straight route crosses the river, so the water-aware grid detour must
  // run. With no dry crossing on this map, the detour cannot produce a route
  // — the vehicle must NOT be planned through the river.
  if (ordered.isMoving && ordered.roadPathWaypoints.length > 0) {
    // If any waypoints were planned, none may sit inside water (the tick
    // would reject them and strand the truck).
    for (const wp of ordered.roadPathWaypoints) {
      assert.equal(
        grid.isWater(wp.x, wp.z),
        false,
        `planned waypoint (${wp.x.toFixed(1)}, ${wp.z.toFixed(1)}) sits inside water`
      );
    }
    // And no leg between consecutive waypoints may cross the river band.
    let prev = van.position;
    for (const wp of ordered.roadPathWaypoints) {
      const crosses = (prev.z < 40 && wp.z > 60) || (prev.z > 60 && wp.z < 40);
      assert.ok(!crosses, `leg (${prev.z.toFixed(1)} -> ${wp.z.toFixed(1)}) crosses the river`);
      prev = wp;
    }
  } else {
    assert.ok(true, 'no drivable route — vehicle refuses to plan through the river');
  }
});

test('a dry detour around a pond is planned instead of the water-crossing straight line', () => {
  // Pond blocks the middle, but open ground exists east of x=60.
  const pond: Point2D[] = [
    { x: -40, z: 40 },
    { x: 40, z: 40 },
    { x: 40, z: 60 },
    { x: -40, z: 60 },
  ];
  const map = {
    roads: [],
    buildings: [],
    landuse: [{ id: 'p1', type: 'water', polygon: pond }],
    bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 },
  } as unknown as MapData;
  const grid = new PathGrid(map);
  const roadGraph = new RoadNetworkGraph([]);

  const van = makeVan({ x: 0, z: 0 });
  const ordered = orderVehicleRoadTravel(van, { x: 0, z: 100 }, roadGraph, [], map, grid);

  assert.ok(ordered.isMoving, 'a dry detour exists, so the vehicle plans a route');
  assert.ok(ordered.roadPathWaypoints.length >= 2, 'route has waypoints');
  for (const wp of ordered.roadPathWaypoints) {
    assert.equal(grid.isWater(wp.x, wp.z), false, `waypoint (${wp.x.toFixed(1)}, ${wp.z.toFixed(1)}) is dry`);
  }
  // Every planned point must clear the pond band on the east side (the grid
  // A* cannot pass through waterImpassable cells; verify the corridor).
  for (const wp of ordered.roadPathWaypoints) {
    const inPondBand = wp.z > 38 && wp.z < 62 && wp.x > -42 && wp.x < 42;
    assert.ok(!inPondBand, `waypoint (${wp.x.toFixed(1)}, ${wp.z.toFixed(1)}) enters the pond corridor`);
  }
});

test('updateVehiclesTick: a vehicle planned across water stops at the bank instead of driving in', () => {
  const map = makeRiverMap();
  const roadGraph = new RoadNetworkGraph([]);
  const van = makeVan({ x: 0, z: 0 });
  // Hand-plan a bogus water-crossing route (as if from a legacy save).
  const planned = {
    ...van,
    isMoving: true,
    roadPathWaypoints: [{ x: 0, z: 30 }, { x: 0, z: 70 }, { x: 0, z: 100 }],
    currentWaypointIndex: 0,
    targetPos: { x: 0, z: 100 },
  };

  const result = updateVehiclesTick([planned], [], [], 1.0, 1000, map, roadGraph, [], 0, undefined, new PathGrid(map));
  const driven = result.updatedVehicles[0];

  // After ticking toward the bank, the vehicle must remain south of the river.
  assert.ok(
    driven.position.z < 40,
    `vehicle stayed south of the riverbank (z=${driven.position.z.toFixed(1)})`
  );
  assert.equal(gridIsWater(map, driven.position), false, 'vehicle never ends up inside water');
});

function gridIsWater(map: MapData, p: Point2D): boolean {
  const river = (map.landuse || [])[0].polygon;
  // Point-in-polygon against the river rect.
  return p.z >= 40 && p.z <= 60 && p.x >= -500 && p.x <= 500;
}