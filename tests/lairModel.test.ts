import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZombieUnit, generateAmbientMapZombies } from '../src/services/combatService';
import {
  computeLairTargetCount,
  generateZombieLairs,
  tickZombieLairs,
} from '../src/services/rivalFactionService';
import type { BuildingPolygon } from '../src/types/map';
import type { ZombieLair, ZombieUnit } from '../src/types/combat';

/** A 20m × 20m, 3-storey block — big enough to be a high-threat lair. */
function mkBuilding(id: string, cx: number, cz: number, levels = 3): BuildingPolygon {
  const half = 10;
  return {
    id,
    name: `Block ${id}`,
    levels,
    center: { x: cx, z: cz },
    polygon: [
      { x: cx - half, z: cz - half },
      { x: cx + half, z: cz - half },
      { x: cx + half, z: cz + half },
      { x: cx - half, z: cz + half },
    ],
  } as BuildingPolygon;
}

function mkLair(id: string, population: number, baselinePopulation: number): ZombieLair {
  return {
    id,
    buildingId: id, // id IS the building id here ("b_1")
    buildingName: id,
    isDiscovered: true,
    isCleared: false,
    population,
    baselinePopulation,
    homeRadius: 40,
    spawnAccumSec: 0,
    lastActivity: Date.now(),
    escalation: 1,
    escalationAccumSec: 0,
    threatTier: 'high',
    replenishAccumSec: 0,
  };
}

function mkAffiliated(id: string, lairId: string, alive = true): ZombieUnit {
  const z = createZombieUnit('shambler', 0, 0, 0, false);
  z.id = id;
  z.lairId = lairId;
  z.currentHp = alive ? z.maxHp : 0;
  return z;
}

test('generateZombieLairs seeds the lair population as REAL infected units in the building', () => {
  const buildings = [mkBuilding('1', 0, 0), mkBuilding('2', 50, 50), mkBuilding('3', -50, -50)];
  const result = generateZombieLairs(buildings, 'none');
  assert.ok(result.lairs.size >= 1, 'lairs generated from candidate buildings');

  for (const lair of result.lairs.values()) {
    const bldg = buildings.find((b) => String(b.id) === String(lair.buildingId))!;
    const affiliated = result.seededZombies.filter((z) => z.lairId === lair.id);
    assert.equal(affiliated.length, lair.population, 'every head of lair population exists as a zombie unit');
    assert.ok(lair.population >= 18, `lair population is sizeable (got ${lair.population})`);
    assert.ok(lair.baselinePopulation >= lair.population, 'baseline starts at the founding garrison');
    for (const z of affiliated) {
      assert.equal(z.lairId, lair.id, 'seeded zombie belongs to its lair');
      assert.equal(z.homeX, bldg.center.x, 'home anchor on the lair building');
      assert.equal(z.homeRadius, lair.homeRadius);
      // Seeded infected shelter INSIDE the footprint.
      const { x, z: zz } = z;
      assert.ok(Math.abs(x - bldg.center.x) <= 10.1 && Math.abs(zz - bldg.center.z) <= 10.1, `seeded at ${x},${zz} inside building`);
    }
  }
});

test('a freshly generated lair is NOT cleared on its first tick — its population is real', () => {
  const buildings = [mkBuilding('1', 0, 0)];
  const { lairs, seededZombies } = generateZombieLairs(buildings, 'none');
  const lair = lairs.values().next().value as ZombieLair;
  const r = tickZombieLairs(lairs, seededZombies, [], buildings, Date.now(), 60, true);
  const after = r.updatedLairs.get(lair.buildingId)!;
  assert.ok(
    after.population >= lair.population,
    `first tick keeps the seeded population (seeded ${lair.population}, after ${after.population} — may add an emerged group)`
  );
  assert.ok(!after.isCleared, 'a standing lair is not cleared by existing');
  assert.equal(r.clearedLairs.length, 0);
});

test('killing every affiliated infected clears the lair; survivors keep it alive', () => {
  const buildings = [mkBuilding('1', 0, 0)];
  const lairs = new Map<string | number, ZombieLair>([['b_1', mkLair('b_1', 5, 5)]]);
  const now = Date.now();

  // All five die in combat → lair clears.
  const wiped = tickZombieLairs(lairs, [1, 2, 3, 4, 5].map((i) => mkAffiliated(`z${i}`, 'b_1', false)), [], buildings, now, 60, true);
  assert.ok(wiped.updatedLairs.get('b_1')!.isCleared, 'last infected killed → lair cleared');
  assert.equal(wiped.clearedLairs.length, 1, 'clear reported');
  assert.equal(wiped.spawnedZombies.length, 0, 'a destroyed lair emerges nothing');

  // Only one dies → lair survives with population 4.
  const partial = tickZombieLairs(lairs, [
    mkAffiliated('a', 'b_1', false),
    mkAffiliated('b', 'b_1', true),
    mkAffiliated('c', 'b_1', true),
    mkAffiliated('d', 'b_1', true),
    mkAffiliated('e', 'b_1', true),
  ], [], buildings, now, 60, true);
  assert.ok(!partial.updatedLairs.get('b_1')!.isCleared, 'survivors keep the lair standing');
  assert.equal(partial.updatedLairs.get('b_1')!.population, 4, 'population tracks the living count');
});

test('lair pressure: standing lairs anchor an affiliated local group; cleared lairs add none', () => {
  const buildings = [mkBuilding('b_1', 0, 0)];
  const lairs = new Map<string | number, ZombieLair>([
    ['b_1', mkLair('b_1', 20, 20)],
  ]);
  const group = generateAmbientMapZombies(buildings, null, 1, lairs);
  const cluster = group.filter((z) => z.lairId === 'b_1');
  assert.ok(cluster.length >= 2, 'standing lair anchors a local group (escalation 1 → ≥2)');
  for (const z of cluster) {
    assert.equal(z.homeRadius, 40);
    assert.ok(Math.hypot(z.x, z.z) <= 40 + 1, 'pressure group stays within the home radius');
  }

  // Cleared lair: the neighbourhood goes quiet — no cluster, no affiliated extras.
  const clearedLairs = new Map<string | number, ZombieLair>([
    ['b_1', { ...mkLair('b_1', 0, 20), isCleared: true }],
  ]);
  const quiet = generateAmbientMapZombies(buildings, null, 1, clearedLairs);
  assert.equal(quiet.filter((z) => z.lairId).length, 0, 'cleared lair contributes zero pressure');
});

test('emergence spawns affiliated infected that follow normal sunlight dormancy (no forced alarm)', () => {
  const buildings = [mkBuilding('1', 0, 0)];
  const lair = { ...mkLair('b_1', 10, 10), spawnAccumSec: 1e9 };
  const lairs = new Map<string | number, ZombieLair>([['b_1', lair]]);
  const interior = Array.from({ length: 10 }, (_, i) => mkAffiliated(`in${i}`, 'b_1'));

  const day = tickZombieLairs(lairs, interior, [], buildings, Date.now(), 60, false);
  assert.ok(day.spawnedZombies.length > 0, 'a populated lair emerges even by day (throttled cadence)');
  for (const z of day.spawnedZombies) {
    assert.equal(z.lairId, 'b_1', 'emerged infected are lair-affiliated');
    assert.equal(z.alertLevel, 0, 'no forced 24/7 alert — sunlight dormancy applies');
    assert.ok(z.isDormant, 'day-emerged infected start dormant');
    assert.equal(z.homeX, 0, 'they carry their home anchor');
  }

  const night = tickZombieLairs(lairs, interior, [], buildings, Date.now(), 60, true);
  for (const z of night.spawnedZombies) {
    assert.equal(z.isDormant, false, 'night-emerged infected are active');
  }
});

test('a neglected lair SWELLS past its founding garrison as escalation climbs — baseline is a soft target, not a ceiling', () => {
  const buildings = [mkBuilding('1', 0, 0)];
  // Founding garrison 40 at escalation 3 → ceiling = 40 × (1 + 0.4×3) = 88.
  const lair = { ...mkLair('b_1', 40, 40), escalation: 3, spawnAccumSec: 1e9 };
  const lairs = new Map<string | number, ZombieLair>([['b_1', lair]]);
  const interior = Array.from({ length: 40 }, (_, i) => mkAffiliated(`in${i}`, 'b_1'));

  const r = tickZombieLairs(lairs, interior, [], buildings, Date.now(), 60, true);
  const after = r.updatedLairs.get('b_1')!;
  assert.ok(
    after.population > after.baselinePopulation,
    `neglected nest grew past its founding garrison (${after.population} > ${after.baselinePopulation})`
  );
  assert.ok(after.population <= 88, `growth respects the escalation ceiling (got ${after.population})`);
  assert.ok(!after.isCleared, 'swelling never clears the lair');
});

test('emergence pauses at the garrison ceiling and resumes once the garrison thins', () => {
  const buildings = [mkBuilding('1', 0, 0)];
  // Baseline 40, escalation 2 → ceiling = 40 × (1 + 0.4×2) = 72.
  const ceiling = Math.round(40 * (1 + 0.4 * 2));
  const lair = { ...mkLair('b_1', ceiling, 40), escalation: 2, spawnAccumSec: 1e9 };
  const lairs = new Map<string | number, ZombieLair>([['b_1', lair]]);
  const full = Array.from({ length: ceiling }, (_, i) => mkAffiliated(`in${i}`, 'b_1'));

  const r = tickZombieLairs(lairs, full, [], buildings, Date.now(), 300, true);
  assert.equal(r.spawnedZombies.length, 0, 'at its escalated capacity the lair pauses emergence');
  const after = r.updatedLairs.get('b_1')!;
  assert.equal(after.population, ceiling, 'garrison holds at the ceiling');
  assert.ok(!after.isCleared, 'a full nest is not cleared');

  // The garrison thins below the ceiling (e.g. interception kills) → the nest
  // reopens and emergence resumes toward its escalated capacity.
  const thinned = Array.from({ length: ceiling - 5 }, (_, i) => mkAffiliated(`in${i}`, 'b_1'));
  const r2 = tickZombieLairs(
    new Map([['b_1', { ...after, spawnAccumSec: 1e9 }]]),
    thinned,
    [],
    buildings,
    Date.now(),
    60,
    true
  );
  assert.ok(r2.spawnedZombies.length > 0, 'emergence resumes once the garrison thins');
});

test('lair count is data-driven — map size × intensity × population × day, not a flat 1–2 coin flip', () => {
  // A compact map with no pressure context stays modest (1–2 nests).
  const compact = computeLairTargetCount();
  assert.ok(compact >= 1 && compact <= 2, `default context yields 1–2 nests (got ${compact})`);

  // A big, high-intensity, late-game, populous map expects a real ecosystem.
  const bigPressure = computeLairTargetCount({
    mapRadiusM: 3000,
    colonyPopulation: 80,
    day: 10,
    aggression: 'high',
    hordesLevel: 3,
  });
  assert.ok(
    bigPressure >= 5 && bigPressure <= 12,
    `pressure context multiplies the nest count (got ${bigPressure})`
  );

  // A quiet baseline (low aggression, tiny colony, day 1) stays far below the
  // pressured count — with ±10% jitter the ordering holds at this scale.
  const quiet = computeLairTargetCount({ mapRadiusM: 3000, aggression: 'low', colonyPopulation: 4, day: 1 });
  assert.ok(quiet < bigPressure, 'pressure scales count above a quiet baseline');
});

test('a large map generates MANY lairs, each with its real seeded garrison, spaced across the map', () => {
  // Synthetic 4 km × 4 km district of block buildings (60 m grid).
  const buildings: BuildingPolygon[] = [];
  for (let gx = -32; gx <= 32; gx++) {
    for (let gz = -32; gz <= 32; gz++) {
      const cx = gx * 60;
      const cz = gz * 60;
      buildings.push(mkBuilding(`b_${gx}_${gz}`, cx, cz, 2));
    }
  }

  const result = generateZombieLairs(buildings, 'none', {
    mapRadiusM: 3000,
    colonyPopulation: 80,
    day: 10,
    aggression: 'high',
    hordesLevel: 3,
  });

  assert.ok(result.lairs.size >= 8, `big map under pressure seeds many nests (got ${result.lairs.size})`);
  const centers = Array.from(result.lairs.values()).map((l) => {
    const b = buildings.find((bb) => String(bb.id) === String(l.buildingId))!;
    return b.center;
  });
  // Nests are spaced out — not all clumped on one neighbourhood.
  let maxSpan = 0;
  for (const a of centers) {
    for (const b of centers) {
      maxSpan = Math.max(maxSpan, Math.hypot(a.x - b.x, a.z - b.z));
    }
  }
  assert.ok(maxSpan > 1200, `nests are spread across the district (max span ${Math.round(maxSpan)}m)`);

  // Every head of every lair's population is a REAL seeded affiliated unit.
  for (const lair of result.lairs.values()) {
    const affiliated = result.seededZombies.filter((z) => z.lairId === lair.id);
    assert.equal(affiliated.length, lair.population, 'every head of the garrison is a real seeded zombie');
  }
});