import { test } from 'node:test';
import assert from 'node:assert/strict';
import { terrainSlopeSpeedFactor } from '../src/services/elevationService';
import type { ElevationGrid } from '../src/types/map';

function makeGrid(rows: number[][]): ElevationGrid {
  return {
    minElevation: Math.min(...rows.flat()),
    maxElevation: Math.max(...rows.flat()),
    baseElevation: rows[Math.floor(rows.length / 2)][Math.floor(rows[0].length / 2)],
    resolution: rows.length,
    grid: rows,
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  };
}

test('flat terrain yields a speed factor of exactly 1', () => {
  const grid = makeGrid([
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 100, 100, 100],
    [100, 100, 100, 100],
  ]);
  assert.equal(terrainSlopeSpeedFactor(grid, 0, 0), 1);
});

test('a 45-degree slope applies the maximum penalty (minFactor)', () => {
  // Each grid cell spans 200m / (res-1). With res 3, cell = 100m.
  // A 100m rise per cell is slope 1.0 → tan(45°).
  const grid = makeGrid([
    [100, 200, 300],
    [100, 200, 300],
    [100, 200, 300],
  ]);
  const f = terrainSlopeSpeedFactor(grid, -50, -50);
  assert.ok(f <= 0.45 + 1e-6, `expected max penalty at 45°, got ${f}`);
  assert.ok(f >= 0.44, `penalty should not invert, got ${f}`);
});

test('a gentle slope keeps most of the unit speed', () => {
  // ~10m rise over 100m cells = slope 0.1 (tan ~5.7°) → factor ≈ 0.945.
  const grid = makeGrid([
    [100, 110, 120],
    [100, 110, 120],
    [100, 110, 120],
  ]);
  const f = terrainSlopeSpeedFactor(grid, -50, -50);
  assert.ok(f > 0.9, `gentle slope should barely slow units, got ${f}`);
});

test('no grid (elevation disabled) is a no-op factor of 1', () => {
  assert.equal(terrainSlopeSpeedFactor(null, 0, 0), 1);
  assert.equal(terrainSlopeSpeedFactor(undefined, 50, 50), 1);
});
