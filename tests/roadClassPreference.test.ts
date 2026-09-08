/**
 * Road-class preference regressions: A* must prefer main roads over pedestrian
 * ways even when the footway shortcut is shorter, and network entry/exit snaps
 * must prefer ramping onto a main road over ducking down a footpath.
 * Run: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoadNetworkGraph } from '../src/services/roadPathfinder';
import type { RoadSegment, Point2D } from '../src/types/map';

function road(id: string, highwayType: string, pts: [number, number][]): RoadSegment {
  return {
    id,
    highwayType,
    width: highwayType === 'footway' ? 2.5 : 8,
    points: pts.map(([x, z]) => ({ x, z })),
  };
}

test('route prefers the main road over a shorter footway shortcut', () => {
  // Two parallel west-east corridors from A(0,0) to B(200,0):
  //  - a PRIMARY road going the long way round (via (100,120))
  //  - a FOOTWAY going dead straight
  const graph = new RoadNetworkGraph([
    road('main-a', 'primary', [[0, 0], [100, 120]]),
    road('main-b', 'primary', [[100, 120], [200, 0]]),
    road('shortcut', 'footway', [[0, 0], [200, 0]]),
  ]);

  const route = graph.findRoute({ x: 2, z: 2 }, { x: 198, z: -2 });

  // Measure how close the route hugs the footway corridor (z≈0 mid-span).
  let onFootwayMidspan = 0;
  for (const p of route) {
    if (p.x > 40 && p.x < 160 && Math.abs(p.z) < 6) onFootwayMidspan++;
  }
  assert.equal(
    onFootwayMidspan,
    0,
    `route must avoid the footway shortcut midspan, got: ${JSON.stringify(route)}`
  );
});

test('route uses the footway when it is the only connection', () => {
  const graph = new RoadNetworkGraph([
    road('west', 'residential', [[0, 0], [50, 0]]),
    road('link', 'footway', [[50, 0], [150, 0]]),
    road('east', 'residential', [[150, 0], [200, 0]]),
  ]);
  const route = graph.findRoute({ x: 5, z: 0 }, { x: 195, z: 0 });
  assert.ok(route.length >= 2, 'route found through the footway link');
  // Route must bridge the gap (end near target) even though the middle is a footway.
  const last = route[route.length - 1];
  assert.ok(Math.abs(last.x - 150) < 30 || Math.abs(last.x - 195) < 40, `reached east side: ${JSON.stringify(last)}`);
});

test('snap prefers a main road within the detour radius over a closer footway', () => {
  const graph = new RoadNetworkGraph([
    road('footy', 'footway', [[10, -40], [10, 40]]),   // 10m west of origin
    road('big', 'primary', [[30, -40], [30, 40]]),     // 30m east of origin
  ]);
  const snap = graph.findBestSnapPoint({ x: 0, z: 0 });
  // Footway 10m away scores 10 × 3.5 = 35; primary 30m away scores 30 × 0.7 = 21.
  assert.ok(snap.road, 'snapped to a road');
  assert.equal(snap.road!.id, 'big', 'should ramp onto the primary road, not the footway');
});

test('snap falls back to plain nearest when nothing is inside the radius', () => {
  const graph = new RoadNetworkGraph([
    road('far', 'footway', [[500, -40], [500, 40]]),
  ]);
  const snap = graph.findBestSnapPoint({ x: 0, z: 0 }, 60);
  assert.ok(snap.road, 'fallback still finds the road');
  assert.equal(snap.road!.id, 'far');
});
