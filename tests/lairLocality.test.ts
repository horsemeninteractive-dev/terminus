import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createZombieUnit,
  generateAmbientMapZombies,
  generateHordeWave,
  tickCombatSimulation,
} from '../src/services/combatService';
import { generateZombieLairs } from '../src/services/rivalFactionService';
import type { ZombieUnit } from '../src/types/combat';
import type { BuildingPolygon } from '../src/types/map';

const nightClock = {
  isNight: true,
  night: true,
  speed: 1,
  day: 1,
  phase: 'night',
  hour: 22,
  minute: 0,
} as any;

function mkLairZombie(x: number, z: number, homeX: number, homeZ: number, radius: number, isRoamer = false): ZombieUnit {
  const zmb = createZombieUnit('shambler', x, z, 0, true);
  zmb.lairId = 'lair_t';
  zmb.homeX = homeX;
  zmb.homeZ = homeZ;
  zmb.homeRadius = radius;
  zmb.isRoamer = isRoamer;
  return zmb;
}

const dist = (x1: number, z1: number, x2: number, z2: number) => Math.hypot(x1 - x2, z1 - z2);

test('a lair-infected that strays beyond the home radius walks home DETERMINISTICALLY', () => {
  const home = { x: 0, z: 0 };
  // 90m out, home radius 40 → well beyond the 1.15× threshold.
  const stray = mkLairZombie(90, 0, home.x, home.z, 40);

  // Tick 1: the very first idle tick sets a target toward home — no luck involved.
  const first = tickCombatSimulation([stray], [], new Map(), [], nightClock, null, 1, undefined, [], [], null, false);
  const after1 = first.updatedZombies[0];
  assert.ok(after1.targetPos, 'stray lair zombie immediately heads home');
  assert.ok(
    dist(after1.targetPos!.x, after1.targetPos!.z, home.x, home.z) < 2,
    `target is the nest (${JSON.stringify(after1.targetPos)})`
  );

  // Over time it actually arrives back inside the territory. After arrival it
  // patrols LOCALLY around the nest (the locality model), so a single final
  // sample can catch it just past the 40m ring — the guarantee is that it
  // REACHES the nest, tracked as the closest approach across the run.
  let state = after1;
  let minDist = Infinity;
  for (let i = 0; i < 240; i++) {
    const r = tickCombatSimulation([state], [], new Map(), [], nightClock, null, 1, undefined, [], [], null, false);
    state = r.updatedZombies[0];
    minDist = Math.min(minDist, dist(state.x, state.z, home.x, home.z));
  }
  assert.ok(
    minDist <= 40,
    `stray infected returned to the nest territory (closest approach ${minDist.toFixed(1)}m, final ${dist(state.x, state.z, home.x, home.z).toFixed(1)}m from home)`
  );
});

test('roamers are exempt from the home pull — they do not march back', () => {
  const home = { x: 0, z: 0 };
  const roamer = mkLairZombie(90, 0, home.x, home.z, 40, true);

  const r = tickCombatSimulation([roamer], [], new Map(), [], nightClock, null, 1, undefined, [], [], null, false);
  const after = r.updatedZombies[0];
  const targetIsHome = !!after.targetPos && dist(after.targetPos!.x, after.targetPos!.z, home.x, home.z) < 2;
  assert.ok(!targetIsHome, 'a roamer never locks onto the nest as its target');
});

test('most lair-infected are stay-at-home; a minority are roamers', () => {
  const buildings: BuildingPolygon[] = [];
  for (let i = 0; i < 12; i++) {
    buildings.push({
      id: `b_${i}`,
      name: `Block ${i}`,
      levels: 3,
      center: { x: i * 60, z: 0 },
      polygon: [
        { x: i * 60 - 15, z: -15 },
        { x: i * 60 + 15, z: -15 },
        { x: i * 60 + 15, z: 15 },
        { x: i * 60 - 15, z: 15 },
      ],
    } as BuildingPolygon);
  }
  const result = generateZombieLairs(buildings, 'none');
  const affiliated = result.seededZombies.filter((z) => z.lairId);
  assert.ok(affiliated.length > 60, `enough seeded infected to sample (${affiliated.length})`);
  const roamers = affiliated.filter((z) => z.isRoamer).length;
  const ratio = roamers / affiliated.length;
  assert.ok(roamers > 0, 'some infected become roamers');
  assert.ok(ratio < 0.5, `roamers are a minority (${(ratio * 100).toFixed(0)}%)`);
});

test('hordes and ambient infected remain INDEPENDENT — no lair, no home pull', () => {
  const horde = generateHordeWave(6, { x: 0, z: 0 }, 180, true);
  assert.ok(horde.zombies.length > 0);
  for (const z of horde.zombies) {
    assert.ok(!z.lairId && z.homeX === undefined, 'horde infected belong to no lair');
    assert.ok(!z.isRoamer, 'horde infected are not labelled roamers (they are simply free)');
  }

  const ambient = generateAmbientMapZombies(
    [{ id: 'b1', center: { x: 0, z: 0 }, polygon: [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }] }] as any,
    null,
    1
  );
  for (const z of ambient) {
    assert.ok(!z.lairId, 'ambient infected wander freely, independent of any nest');
  }
});