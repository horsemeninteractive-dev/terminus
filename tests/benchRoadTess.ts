/**
 * Measures the effect of quality-scaled road tessellation on REAL map data
 * (the Evesham sector) by replicating RoadRenderer.subdivideRoadPoints at the
 * old fixed 1.4m ceiling vs the new low/medium ceilings.
 * Run: node --import tsx --import ./tests/register-loader.mjs tests/benchRoadTess.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

interface Pt { x: number; z: number }
interface Seg { points: Pt[]; width?: number; highwayType?: string }

function loadRoads(): Seg[] {
  const dir = path.resolve('src/data/maps');
  const candidates = fs.readdirSync(dir).filter((f) => f.includes('.part.roads.'));
  const roads: Seg[] = [];
  for (const f of candidates) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const arr = Array.isArray(json) ? json : (json.roads ?? json.segments ?? []);
    for (const r of arr) {
      if (r && Array.isArray(r.points) && r.points.length > 1) roads.push(r as Seg);
    }
  }
  return roads;
}

function subdivide(points: Pt[], maxSegLength: number): Pt[] {
  if (points.length <= 1) return points;
  const result: Pt[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    if (dist <= maxSegLength) { result.push(p2); continue; }
    const prev = points[i - 1] ?? p1;
    const l1 = Math.hypot(p1.x - prev.x, p1.z - prev.z) || 1;
    const d1x = (p1.x - prev.x) / l1, d1z = (p1.z - prev.z) / l1;
    const l2 = dist || 1;
    const d2x = (p2.x - p1.x) / l2, d2z = (p2.z - p1.z) / l2;
    const turn = Math.abs(d1x * d2z - d1z * d2x);
    // Flat-terrain worst case for the slope driver (0), matching the renderer's
    // formula with slope = 0.
    const curveFactor = Math.min(1, turn * 14);
    const step = maxSegLength + (12 - maxSegLength) * (1 - curveFactor);
    const steps = Math.ceil(dist / step);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      result.push({ x: p1.x + (p2.x - p1.x) * t, z: p1.z + (p2.z - p1.z) * t });
    }
    result.push(p2);
  }
  return result;
}

test('quality tessellation: real Evesham road data triangle reduction', () => {
  const roads = loadRoads();
  assert.ok(roads.length > 100, `expected a real road set, got ${roads.length} segments`);

  // Each slice emits a road quad (2 tris) + curb quads + markings; the deck
  // quad alone is 2 tris per slice per road, so slice count tracks triangles.
  const countSlices = (max: number) =>
    roads.reduce((n, r) => n + subdivide(r.points, max).length, 0);

  const oldSlices = countSlices(1.4);
  const medSlices = countSlices(4.5);
  const lowSlices = countSlices(6.0);

  // Report for the release notes.
  console.log(`[tess] segments=${roads.length} slices old(1.4m)=${oldSlices} medium(4.5m)=${medSlices} low(6.0m)=${lowSlices}`);
  console.log(`[tess] reduction medium=${(100 * (1 - medSlices / oldSlices)).toFixed(0)}% low=${(100 * (1 - lowSlices / oldSlices)).toFixed(0)}%`);

  // The low preset must remove a substantial majority of road geometry.
  assert.ok(lowSlices < oldSlices * 0.5, `low tess should at least halve slices (${lowSlices} vs ${oldSlices})`);
  assert.ok(medSlices < oldSlices * 0.75, `medium tess should cut slices meaningfully (${medSlices} vs ${oldSlices})`);
  // And never coarsen below the ceiling on tiny segments.
  assert.equal(subdivide([{ x: 0, z: 0 }, { x: 2, z: 0 }], 6.0).length, 2);
});
