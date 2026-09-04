import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { remapFlatRoofUvs } from '../src/render/BuildingRenderer';

/** Mirrors the production helpers so the expected mapping is verifiable. */
function seededFrac(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function dominantAxis(pts: { x: number; z: number }[]) {
  const n = pts.length;
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p.x; cz += p.z; }
  cx /= n; cz /= n;
  let xx = 0, xz = 0, zz = 0;
  for (const p of pts) {
    const dx = p.x - cx, dz = p.z - cz;
    xx += dx * dx; xz += dx * dz; zz += dz * dz;
  }
  const trace = xx + zz;
  const det = xx * zz - xz * xz;
  const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
  const l1 = trace / 2 + disc;
  let ax = l1 - zz, az = xz;
  const alen = Math.hypot(ax, az);
  if (alen < 1e-6) { ax = 1; az = 0; } else { ax /= alen; az /= alen; }
  const nx = -az, nz = ax;
  return { cx, cz, ax, az, nx, nz };
}

function makeRectGeom(): { geom: THREE.BufferGeometry; pts: { x: number; z: number }[] } {
  const pts = [
    { x: -12, z: -8 }, { x: 12, z: -8 }, { x: 12, z: 8 }, { x: -12, z: 8 },
  ];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, -pts[0].z);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, -pts[i].z);
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 6,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.12,
    bevelThickness: 0.12,
  });
  geom.rotateX(-Math.PI / 2);
  return { geom, pts };
}

test('flat roof cap UVs use the continuous signed mapping (no mirror fold)', () => {
  // Exercise all four 90° rotation variants.
  for (const seed of [987654321, 424242, 7, 0xdeadbeef]) {
    const { geom, pts } = makeRectGeom();
    remapFlatRoofUvs(geom, pts, seed);

    const g0 = geom.groups[0];
    assert.ok(g0, 'group 0 (caps) must exist');

    const { cx, cz, ax, az, nx, nz } = dominantAxis(pts);
    const rot = (seed >>> 3) & 3;
    const offU = seededFrac(seed ^ 0x9e3779b9);
    const offV = seededFrac(seed ^ 0x85ebca6b);

    const pos = geom.attributes.position as THREE.BufferAttribute;
    const uv = geom.attributes.uv as THREE.BufferAttribute;
    const index = geom.index;

    let checks = 0;
    let negD = 0; // vertices on the negative cross-axis side (the half a |d| fold would mirror)
    for (let i = g0.start; i < g0.start + g0.count; i++) {
      const vi = index ? index.getX(i) : i;
      const x = pos.getX(vi), z = pos.getZ(vi);
      const dx = x - cx, dz = z - cz;
      let t = dx * ax + dz * az;
      let d = dx * nx + dz * nz;
      if (rot === 1) { const tmp = t; t = d; d = -tmp; }
      else if (rot === 2) { t = -t; d = -d; }
      else if (rot === 3) { const tmp = t; t = -d; d = tmp; }
      const expU = t / 4 + offU;
      const expV = d / 4 + offV;
      const err = Math.max(Math.abs(uv.getX(vi) - expU), Math.abs(uv.getY(vi) - expV));
      if (d < 0) negD++;
      checks++;
      // A regression back to the |d| fold would mirror these coordinates, so
      // the negative half would land on the wrong side by exactly 2·|d|/4.
      assert.ok(err < 1e-3, `seed ${seed} vertex ${vi} uv (${uv.getX(vi).toFixed(4)},${uv.getY(vi).toFixed(4)}) != expected (${expU.toFixed(4)},${expV.toFixed(4)}) err=${err.toFixed(6)}`);
    }
    assert.ok(checks >= 12, `seed ${seed}: expected cap vertices, got ${checks}`);
    assert.ok(negD > 0, `seed ${seed}: roof has no vertices on the negative cross-axis side — fold test is vacuous`);
  }
});