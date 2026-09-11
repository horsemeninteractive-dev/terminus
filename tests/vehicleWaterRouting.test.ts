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

test('a road bridge over the river is a legal vehicle crossing — routing and tick both allow it', () => {
  // Same unbroken river band, but a north-south road crosses it at x=0: that
  // road-over-water stretch is a bridge and must be drivable end to end.
  const river: Point2D[] = [
    { x: -500, z: 40 },
    { x: 500, z: 40 },
    { x: 500, z: 60 },
    { x: -500, z: 60 },
  ];
  const bridgeRoad: RoadSegment = {
    id: 'rd_bridge',
    highwayType: 'primary',
    width: 8,
    points: [
      { x: 0, z: -200 },
      { x: 0, z: 200 },
    ],
  };
  const map = {
    roads: [bridgeRoad],
    buildings: [],
    landuse: [{ id: 'r1', type: 'water', polygon: river }],
    bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 },
  } as unknown as MapData;
  const grid = new PathGrid(map);
  const roadGraph = new RoadNetworkGraph([bridgeRoad]);

  // 1. The grid marks the crossing cells as bridges: bridge-aware isWater is
  //    false there, plain isWater still true (humans keep their wading model).
  assert.equal(grid.isWater(0, 50), true, 'river cell under the bridge is still water for humans');
  assert.equal(grid.isWater(0, 50, true), false, 'bridge deck is NOT water for vehicles');

  // 2. Routing: the vehicle (already on the road, south of the river) plans a
  //    route across the river on the bridge.
  const van = makeVan({ x: 0, z: -100 });
  const ordered = orderVehicleRoadTravel(van, { x: 0, z: 100 }, roadGraph, [], map, grid);
  assert.ok(ordered.isMoving, 'bridge route is planned (vehicle not refused)');
  assert.ok(ordered.roadPathWaypoints.length >= 2, 'bridge route has waypoints');

  // 3. The tick drives the vehicle across the river band on the bridge deck.
  // (First tick consumes the zero-length on-position waypoint; subsequent
  // ticks move it 12 m each along the bridge.)
  let driven = ordered;
  for (let i = 0; i < 80 && driven.position.z <= 62; i++) {
    driven = updateVehiclesTick([driven], [], [], 1.0, 1000 + i, map, roadGraph, [], 0, undefined, grid).updatedVehicles[0];
  }
  assert.ok(driven.position.z > 60, `vehicle crossed the river (z=${driven.position.z.toFixed(1)})`);
  assert.equal(
    gridIsWater(map, driven.position, true),
    false,
    'vehicle never ends up in open water (bridge deck is fine)'
  );
});

test('open water away from the bridge still blocks routing and driving', () => {
  const map = makeRiverMap();
  const grid = new PathGrid(map);
  const roadGraph = new RoadNetworkGraph([]);

  const van = makeVan({ x: 0, z: 0 });
  const ordered = orderVehicleRoadTravel(van, { x: 0, z: 100 }, roadGraph, [], map, grid);
  // No bridge, no dry detour: the order must be refused or avoid water.
  if (ordered.isMoving && ordered.roadPathWaypoints.length > 0) {
    let prev = van.position;
    for (const wp of ordered.roadPathWaypoints) {
      const crosses = (prev.z < 40 && wp.z > 60) || (prev.z > 60 && wp.z < 40);
      assert.ok(!crosses, `leg (${prev.z.toFixed(1)} -> ${wp.z.toFixed(1)}) crosses open water`);
      prev = wp;
    }
  }

  // And the tick's step validation still rejects a hand-planned crossing.
  const planned = {
    ...van,
    isMoving: true,
    roadPathWaypoints: [{ x: 0, z: 30 }, { x: 0, z: 70 }, { x: 0, z: 100 }],
    currentWaypointIndex: 0,
    targetPos: { x: 0, z: 100 },
  };
  const result = updateVehiclesTick([planned], [], [], 1.0, 1000, map, roadGraph, [], 0, undefined, grid);
  assert.ok(result.updatedVehicles[0].position.z < 40, 'vehicle stayed south of open water');
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

function gridIsWater(map: MapData, p: Point2D, excludeBridges = false): boolean {
  const river = (map.landuse || [])[0].polygon;
  // Point-in-polygon against the river rect.
  const inRect = p.z >= 40 && p.z <= 60 && p.x >= -500 && p.x <= 500;
  if (!inRect) return false;
  if (excludeBridges) {
    // Mirror the vehicle rule: on a road over the river = bridge deck = dry.
    for (const rd of map.roads || []) {
      const halfWidth = Math.max(2.5, (rd.width || 6) / 2 + 1.5);
      for (let i = 0; i < rd.points.length - 1; i++) {
        const a = rd.points[i];
        const b = rd.points[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
        if (Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)) <= halfWidth) return false;
      }
    }
  }
  return true;
}