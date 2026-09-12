/**
 * recenterMapDataToGrid — played-grid recentring (mapProcessor).
 *
 * StreetViewSelector crops the downloaded city map around the dragged grid and
 * hands it to the world. The satellite layer projects imagery around
 * mapData.center, so after dragging the grid away from the download center the
 * center must move to the grid's real geographic position and every map
 * coordinate must shift by the same -offset, keeping the world coherent.
 *
 * Run: node --import tsx --import ./tests/register-loader.mjs --test tests/recenterMapData.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recenterMapDataToGrid } from '../src/services/mapProcessor';
import type { MapData, Point2D } from '../src/types/map';

const EARTH_RADIUS = 6371000;

function makeMapData(): MapData {
  return {
    center: { lat: 47.546, lon: 9.68 }, // Lindau-ish download center
    radius: 4000,
    elevation: {
      minElevation: 395,
      maxElevation: 440,
      baseElevation: 400,
      resolution: 4,
      grid: [
        [400, 410, 420, 430],
        [402, 412, 422, 432],
        [404, 414, 424, 434],
        [406, 416, 426, 436],
      ],
      bounds: { minX: -4000, maxX: 4000, minZ: -4000, maxZ: 4000 },
    },
    buildings: [
      {
        id: 'b1',
        type: 'residential',
        rawType: 'yes',
        height: 9,
        levels: 3,
        center: { x: 1500, z: -800 },
        polygon: [
          { x: 1490, z: -810 },
          { x: 1510, z: -790 },
        ],
        tags: { building: 'yes' },
      },
    ],
    roads: [
      {
        id: 'r1',
        highwayType: 'residential',
        width: 6,
        points: [
          { x: 1000, z: 0 },
          { x: 2000, z: 100 },
        ],
      },
    ],
    landuse: [
      {
        id: 'l1',
        type: 'forest',
        polygon: [
          { x: -100, z: -100 },
          { x: 100, z: -100 },
          { x: 0, z: 100 },
        ],
      },
    ],
    resourceNodes: [
      {
        id: 'n1',
        type: 'wood',
        subType: 'tree',
        position: { x: 300, z: 450 },
        rotation: 0,
        scale: 1,
        source: 'park_scatter',
        amount: 50,
        maxAmount: 50,
      },
    ],
    bounds: { minX: 500, maxX: 2500, minZ: -1500, maxZ: 500 },
    stats: {
      buildingCount: 1,
      roadCount: 1,
      resourceCount: { wood: 1, metal: 0, bricks: 0, total: 1 },
      elevationRangeMeters: 45,
      processedTimeMs: 1,
    },
    source: 'Live Overpass + Open-Meteo DEM',
  };
}

test('coordinates shift by -offset so the grid center becomes world origin', () => {
  const offset: Point2D = { x: 1500, z: -800 };
  const out = recenterMapDataToGrid(makeMapData(), offset, 47.5, 9.7);

  // The building that sat at the grid center is now at the origin.
  assert.equal(out.buildings[0].center.x, 0);
  assert.equal(out.buildings[0].center.z, 0);
  assert.deepEqual(out.buildings[0].polygon[0], { x: -10, z: -10 });
  assert.deepEqual(out.buildings[0].polygon[1], { x: 10, z: 10 });

  assert.deepEqual(out.roads[0].points[0], { x: -500, z: 800 });
  assert.deepEqual(out.landuse[0].polygon[0], { x: -1600, z: 700 });
  assert.deepEqual(out.resourceNodes[0].position, { x: -1200, z: 1250 });
});

test('center becomes the play-area lat/lon and bounds follow the shift', () => {
  const offset: Point2D = { x: 1500, z: -800 };
  const out = recenterMapDataToGrid(makeMapData(), offset, 47.5, 9.7);

  assert.equal(out.center.lat, 47.5);
  assert.equal(out.center.lon, 9.7);

  assert.deepEqual(out.bounds, {
    minX: -1000,
    maxX: 1000,
    minZ: -700,
    maxZ: 1300,
  });
});

test('elevation bounds shift in lockstep so terrain sampling stays aligned', () => {
  const offset: Point2D = { x: 1500, z: -800 };
  const out = recenterMapDataToGrid(makeMapData(), offset, 47.5, 9.7);

  assert.deepEqual(out.elevation.bounds, {
    minX: -5500,
    maxX: 2500,
    minZ: -3200,
    maxZ: 4800,
  });
  // Sample values themselves are untouched.
  assert.equal(out.elevation.grid[0][0], 400);
  assert.equal(out.elevation.resolution, 4);
});

test('zero offset is a pure identity on geometry', () => {
  const src = makeMapData();
  const out = recenterMapDataToGrid(src, { x: 0, z: 0 }, src.center.lat, src.center.lon);

  assert.deepEqual(out.buildings[0].center, src.buildings[0].center);
  assert.deepEqual(out.roads[0].points, src.roads[0].points);
  assert.deepEqual(out.bounds, src.bounds);
  assert.deepEqual(out.elevation.bounds, src.elevation.bounds);
  // Center passes through unchanged.
  assert.equal(out.center.lat, src.center.lat);
  assert.equal(out.center.lon, src.center.lon);
});

test('round trip: play-area center converts from offset meters like metersToLatLon', () => {
  // The caller derives (centerLat, centerLon) via metersToLatLon(offset, cityCenter).
  // Verify the resulting lat/lon actually sits ~offset meters from the city center.
  const cityLat = 47.546;
  const cityLon = 9.68;
  const offset: Point2D = { x: 2222, z: -1111 };
  const rad = Math.PI / 180;
  const avgLatRad = cityLat * rad;
  const expectedLat = cityLat - offset.z / (rad * EARTH_RADIUS);
  const expectedLon = cityLon + offset.x / (rad * EARTH_RADIUS * Math.cos(avgLatRad));

  const out = recenterMapDataToGrid(makeMapData(), offset, expectedLat, expectedLon);

  // metersToLatLon of the shifted frame (origin == play center) must land back at the city center
  const backX = (cityLon - out.center.lon) * rad * EARTH_RADIUS * Math.cos(avgLatRad);
  const backZ = (out.center.lat - cityLat) * rad * EARTH_RADIUS;
  assert.ok(Math.abs(backX - -offset.x) < 1e-6, `backX ${backX} should equal -offset.x`);
  assert.ok(Math.abs(backZ - -offset.z) < 1e-6, `backZ ${backZ} should equal -offset.z`);
});
