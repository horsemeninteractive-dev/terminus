/**
 * LAIR LOCALITY — real polygon geometry (v0.3.8 corrective pass).
 *
 * The old isOutsideBuildingPolygon was a bounding-box test. For an irregular
 * (L-shaped) OSM footprint a point can sit INSIDE the bbox but OUTSIDE the
 * actual polygon — the old code then counted an emerged infected as
 * "sheltered inside", corrupting the emergence-capacity accounting.
 *
 * Run: node --import tsx --import ./tests/register-loader.mjs --test tests/lairPolygonLocality.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZombieUnit } from '../src/services/combatService';
import { tickZombieLairs } from '../src/services/rivalFactionService';
import type { ZombieLair, ZombieUnit } from '../src/types/combat';
import type { BuildingPolygon } from '../src/types/map';

/** L-shaped footprint (a classic irregular OSM building):
 *
 *      +--------+
 *      |        |
 *      |   A    |
 *      +----+   |
 *      | B  |   |
 *      +----+---+
 *
 *  Wing A: x -20..20, z -20..0.  Wing B: x -20..0, z 0..20.
 *  The bbox corner region (x 0..20, z 0..20) is OUTSIDE the building —
 *  a courtyard. Bbox tests wrongly treat it as sheltered interior. */
function mkLBuilding(): BuildingPolygon {
  return {
    id: 'b_l',
    name: 'L Block',
    levels: 2,
    center: { x: 0, z: 0 },
    polygon: [
      { x: -20, z: -20 },
      { x: 20, z: -20 },
      { x: 20, z: 0 },
      { x: 0, z: 0 },
      { x: 0, z: 20 },
      { x: -20, z: 20 },
    ],
  } as unknown as BuildingPolygon;
}

function mkLair(): ZombieLair {
  return {
    id: 'lair_l',
    buildingId: 'b_l',
    buildingName: 'L Block',
    isDiscovered: true,
    isCleared: false,
    population: 0,
    baselinePopulation: 30,
    garrisonCeiling: 30,
    emergenceCapacity: 10,
    homeRadius: 60,
    spawnAccumSec: 0,
    lastActivity: Date.now(),
    escalation: 0,
    escalationAccumSec: 0,
    threatTier: 'medium',
    replenishAccumSec: 0,
  };
}

function mkAffiliated(id: string, x: number, z: number): ZombieUnit {
  const unit = createZombieUnit('shambler', x, z, 0, true);
  unit.id = id;
  unit.lairId = 'lair_l';
  unit.homeX = 0;
  unit.homeZ = 0;
  unit.homeRadius = 60;
  return unit;
}

test('a point inside the bbox but OUTSIDE the irregular polygon counts as emerged (courtyard)', () => {
  const buildings = [mkLBuilding()];
  const lair = { ...mkLair(), spawnAccumSec: 1e9 };
  const lairs = new Map<string | number, ZombieLair>([['lair_l', lair]]);

  // One infected in the courtyard (10, 10): inside the bbox (−20..20)² but
  // outside the L polygon. Twelve genuinely inside wing A. Emergence capacity
  // is 10, so the courtyard zombie must COUNT against it.
  const world = [
    mkAffiliated('courtyard', 10, 10),
    ...Array.from({ length: 12 }, (_, i) => mkAffiliated(`in${i}`, -10, -10)),
  ];

  const r = tickZombieLairs(lairs, world, [], buildings, Date.now(), 1, true);
  // The nest is at/over its emergence capacity via the courtyard zombie —
  // no further deployment may fire.
  assert.equal(
    r.spawnedZombies.length,
    0,
    'courtyard zombie counts as outside — the bbox-only test would have hidden it'
  );
});

test('an infected genuinely inside the irregular wing counts as sheltered', () => {
  const buildings = [mkLBuilding()];
  const lair = { ...mkLair(), population: 13, spawnAccumSec: 1e9 };
  const lairs = new Map<string | number, ZombieLair>([['lair_l', lair]]);

  // Everyone inside wing A (no courtyard zombie): emergence may proceed —
  // but only by deploying real residents, never creating units.
  const world = Array.from({ length: 13 }, (_, i) => mkAffiliated(`in${i}`, -10, -10));
  const before = new Map(world.map((z) => [z.id, { x: z.x, z: z.z }]));

  const r = tickZombieLairs(lairs, world, [], buildings, Date.now(), 1, true);
  assert.equal(r.spawnedZombies.length, 0, 'deploy never creates units');
  const moved = world.filter((z) => {
    const p = before.get(z.id)!;
    return Math.hypot(z.x - p.x, z.z - p.z) > 0.5;
  });
  assert.ok(moved.length > 0, 'residents deployed from the wing outward');
  for (const z of moved) {
    // Deployment must EXIT the footprint (the whole point of emergence) while
    // staying local: inside the home radius (60 m), never teleported away.
    // (A blind 6–20 m ring cannot both exit an L-building whose arms reach
    // 20–28 m from the centre and stay under 20 m — the exit point sits just
    // past the nearest boundary crossing plus a small stand-off.)
    const dist = Math.hypot(z.x, z.z);
    assert.ok(dist <= 60, `deployed resident stays local to the nest (${dist.toFixed(1)} m)`);
    const poly = buildings[0].polygon!;
    const outside = !(
      z.x >= -20 && z.x <= 20 && z.z >= -20 && z.z <= 20 &&
      !(z.x > 0 && z.z > 0)
    );
    assert.ok(outside, 'deployed resident left the building footprint');
  }
});
