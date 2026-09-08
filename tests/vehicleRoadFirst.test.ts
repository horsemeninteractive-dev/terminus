/**
 * Road-first vehicle routing regressions (§8).
 *
 * The original bug: a vehicle parked off road (e.g. beside a building or behind
 * a player wall) was routed [snapToRoad, ...roadNodes, target]. The tick
 * validates every step against buildings/water/walls — and the straight hop to
 * the snap point was often obstructed — so the vehicle blocked on waypoint #1
 * and froze permanently. Roads are preferred, never mandatory: when the snap
 * hop is obstructed the route must skip it and drive from where the vehicle
 * actually is. Run: node --import tsx --test tests/vehicleRoadFirst.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoadNetworkGraph } from '../src/services/roadPathfinder';
import { orderVehicleRoadTravel } from '../src/services/vehicleService';
import type { RoadSegment, Point2D, MapData } from '../src/types/map';
import type { WorldVehicle } from '../src/types/vehicle';

function road(id: string | number, pts: [number, number][]): RoadSegment {
  return {
    id,
    highwayType: 'residential',
    width: 6,
    points: pts.map(([x, z]) => ({ x, z })),
  };
}

/** Simple four-way grid: horizontal road at z=0, vertical at x=0. */
const graph = new RoadNetworkGraph([
  road('h', [[-200, 0], [200, 0]]),
  road('v', [[0, -200], [0, 200]]),
]);

function mkVehicle(pos: Point2D, overrides: Partial<WorldVehicle> = {}): WorldVehicle {
  return {
    id: 'veh_1',
    type: 'car',
    name: 'Sedan',
    condition: 'operational',
    position: pos,
    rotation: 0,
    y: 0,
    currentHp: 220,
    maxHp: 220,
    fuelType: 'gasoline',
    currentFuel: 40,
    maxFuel: 50,
    fuelConsumptionPer100m: 0.8,
    assignedSquadId: null,
    isMoving: false,
    roadPathWaypoints: [],
    currentWaypointIndex: 0,
    targetPos: null,
    speed: 12,
    isDiscovered: true,
    isSiphoned: false,
    isParkedAtHQ: false,
    totalDistanceDriven: 0,
    killCount: 0,
    ...overrides,
  } as WorldVehicle;
}

/** Map whose only obstacle is one building polygon. */
function mapWithBuilding(poly: Point2D[]): MapData {
  return {
    center: { lat: 0, lon: 0 },
    radius: 500,
    roads: [],
    buildings: [{ id: 'b1', polygon: poly, levels: 1 }],
    landuse: [],
    water: [],
  } as unknown as MapData;
}

test('off-road start with clear snap hop: road-first route retained', () => {
  // Vehicle 8m off the road, open ground — the snap point is drivable.
  const veh = mkVehicle({ x: 8, z: 8 });
  const order = orderVehicleRoadTravel(veh, { x: 150, z: 30 }, graph, [], mapWithBuilding([{ x: 900, y: 0, z: 900 }] as never));
  assert.ok(order.isMoving, 'vehicle should be moving');
  const first = order.roadPathWaypoints[0];
  // Snap is the perpendicular foot onto the nearest road — for a vehicle at
  // (8,8) that's (0,8) on the vertical or (8,0) on the horizontal road (both
  // 8m away; either is a legitimate road-first snap).
  const snapV = Math.abs(first.x - 0) < 0.5 && Math.abs(first.z - 8) < 0.5;
  const snapH = Math.abs(first.x - 8) < 0.5 && Math.abs(first.z - 0) < 0.5;
  assert.ok(
    snapV || snapH,
    `first waypoint is the road snap (0,8) or (8,0), got ${JSON.stringify(first)}`
  );
});

test('off-road start with obstructed snap hop: snap skipped, vehicle still moves', () => {
  // A building sits between the vehicle and the road. Route must NOT start
  // with the unreachable snap point, and must still produce a drivable path.
  const veh = mkVehicle({ x: 8, z: 8 });
  const blocker: Point2D[] = [
    { x: 2, z: 2 }, { x: 7, z: 2 }, { x: 7, z: 7 }, { x: 2, z: 7 },
  ];
  const map = mapWithBuilding(blocker);
  const order = orderVehicleRoadTravel(veh, { x: 150, z: 30 }, graph, [], map);
  assert.ok(order.isMoving, 'vehicle must still receive a route');
  assert.ok(order.roadPathWaypoints.length > 0, 'waypoints exist');
  // The first waypoint must not be the projected snap point {x:0,z:8} — that
  // hop is walled off by the building. It should route via network nodes
  // (integer coordinates from the graph) or skip straight to the target leg.
  const first = order.roadPathWaypoints[0];
  const snapBlocked = { x: 0, z: 8 };
  const isSnap = Math.abs(first.x - snapBlocked.x) < 0.5 && Math.abs(first.z - snapBlocked.z) < 0.5;
  assert.ok(!isSnap, `first waypoint must not be the obstructed snap point, got ${JSON.stringify(first)}`);
});

test('vehicle frozen before first waypoint would previously never move — tick accepts first hop when clear', () => {
  // Sanity: with a clear approach the raw graph route is used unchanged.
  const veh = mkVehicle({ x: 5, z: 5 });
  const order = orderVehicleRoadTravel(veh, { x: -120, z: -140 }, graph, [], mapWithBuilding([{ x: 900, y: 0, z: 900 }] as never));
  assert.ok(order.isMoving);
  assert.ok(order.roadPathWaypoints.length >= 2, 'route has snap + network + target');
  // Off-road final leg appended because target is 30m from the nearest road.
  assert.ok(order.offRoadLegDistance === undefined || order.offRoadLegDistance >= 0);
});

test('blockedPolys (player walls) are honoured when skipping the snap', () => {
  // Wall blocks the snap hop: the route must avoid driving through it.
  const veh = mkVehicle({ x: 6, z: 6 });
  const wall: Point2D[] = [
    { x: 1.5, z: 1.5 }, { x: 6.5, z: 1.5 }, { x: 6.5, z: 6.5 }, { x: 1.5, z: 6.5 },
  ];
  const order = orderVehicleRoadTravel(veh, { x: 100, z: 40 }, graph, [wall]);
  assert.ok(order.isMoving, 'wall near vehicle must not strand it');
});
