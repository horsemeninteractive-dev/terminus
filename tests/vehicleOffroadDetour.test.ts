/**
 * Off-road mounted-vehicle routing: a vehicle parked with a building between
 * it and the road network must detour via the PathGrid instead of driving
 * straight into the building and stalling inside it.
 * Run: node --import tsx --import ./tests/register-loader.mjs --test tests/vehicleOffroadDetour.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderVehicleRoadTravel, updateVehiclesTick, isVehiclePlacementBlocked } from '../src/services/vehicleService';
import { RoadNetworkGraph } from '../src/services/roadPathfinder';
import { PathGrid } from '../src/services/pathfindingService';
import type { MapData, BuildingPolygon, Point2D, RoadSegment } from '../src/types/map';
import type { WorldVehicle } from '../src/types/vehicle';

function rect(x: number, z: number, w: number, h: number): Point2D[] {
  return [
    { x: x - w / 2, z: z - h / 2 },
    { x: x + w / 2, z: z - h / 2 },
    { x: x + w / 2, z: z + h / 2 },
    { x: x - w / 2, z: z + h / 2 },
  ];
}

function makeBuilding(id: string, x: number, z: number, w: number, h: number): BuildingPolygon {
  return {
    id,
    name: `Bldg ${id}`,
    type: 'residential',
    polygon: rect(x, z, w, h),
    center: { x, z },
    levels: 1,
    height: 6,
  } as unknown as BuildingPolygon;
}

function makeMap(): MapData {
  // One E-W road far south; the vehicle starts north of a wall of buildings.
  const road: RoadSegment = {
    id: 'r1',
    points: [
      { x: -300, z: 200 },
      { x: 300, z: 200 },
    ],
    highwayType: 'residential',
  } as unknown as RoadSegment;
  return {
    roads: [road],
    buildings: [
      // Continuous E-W block wall at z=100 with a gap at x=±250.
      makeBuilding('w1', -170, 100, 60, 24),
      makeBuilding('w2', -100, 100, 60, 24),
      makeBuilding('w3', -30, 100, 60, 24),
      makeBuilding('w4', 40, 100, 60, 24),
      makeBuilding('w5', 110, 100, 60, 24),
    ],
    landuse: [],
    bounds: { minX: -300, maxX: 300, minZ: -100, maxZ: 300 },
  } as unknown as MapData;
}

function makeVan(pos: Point2D): WorldVehicle {
  return {
    id: 'v_offroad',
    type: 'cargo_van',
    name: 'Courtyard Van',
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

test('route from off-road start behind a building wall avoids every footprint', () => {
  const map = makeMap();
  const graph = new RoadNetworkGraph(map.roads);
  const grid = new PathGrid(map);
  const van = makeVan({ x: -60, z: 0 }); // off-road, north of the building wall

  const ordered = orderVehicleRoadTravel(van, { x: 0, z: 200 }, graph, [], map, grid);
  assert.ok(ordered.isMoving, 'vehicle must receive a route');
  assert.ok(ordered.roadPathWaypoints.length >= 2, 'route must have waypoints');

  // Every consecutive waypoint pair must be clear for the vehicle body —
  // no route may cut through the building wall.
  let prev: Point2D = van.position;
  for (const wp of ordered.roadPathWaypoints) {
    assert.equal(
      isBlockedBySegment(prev, wp, map),
      false,
      `route segment ${prev.x},${prev.z} → ${wp.x},${wp.z} crosses a building`
    );
    prev = wp;
  }
});

function isBlockedBySegment(a: Point2D, b: Point2D, map: MapData): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(2, Math.ceil(len / 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    for (const bldg of map.buildings) {
      if (pointInPoly(px, pz, bldg.polygon)) return true;
    }
  }
  return false;
}

function pointInPoly(p: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

test('driving the detoured route never strands the vehicle inside a building', () => {
  const map = makeMap();
  const graph = new RoadNetworkGraph(map.roads);
  const grid = new PathGrid(map);
  const van = makeVan({ x: -60, z: 0 });

  let current = orderVehicleRoadTravel(van, { x: 0, z: 200 }, graph, [], map, grid);
  let ticks = 0;
  while (current.isMoving && ticks < 4000) {
    const res = updateVehiclesTick([current], [], [], 0.5, Date.now(), map, graph, [], 0, undefined, grid);
    current = res.updatedVehicles[0];
    ticks++;
    assert.equal(
      isVehiclePlacementBlocked(current.position, map),
      false,
      `vehicle entered a footprint at ${current.position.x},${current.position.z} on tick ${ticks}`
    );
  }
  assert.equal(current.isMoving, false, 'vehicle should arrive (or stop clear), not drive forever');
  const dist = Math.hypot(current.position.x - 0, current.position.z - 200);
  assert.ok(dist < 30, `vehicle ended ${Math.round(dist)}m from destination`);
});
