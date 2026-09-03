import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HORDE_COMPOSITION,
  generateHordeWave,
  rollHordeDominantType,
} from '../src/services/combatService';
import type { ZombieUnit } from '../src/types/combat';

const CENTER = { x: 0, z: 0 };

function countByVariant(zombies: ZombieUnit[]): Record<string, number> {
  const counts: Record<string, number> = { runner: 0, shambler: 0, brute: 0 };
  for (const z of zombies) counts[z.variant] += 1;
  return counts;
}

test('a horde has a DOMINANT type and the composition follows from it', () => {
  for (let i = 0; i < 12; i++) {
    const shamblerHorde = generateHordeWave(6, CENTER, 180, true, 'shambler');
    const counts = countByVariant(shamblerHorde.zombies);
    const total = shamblerHorde.zombies.length;
    assert.ok(total > 0);
    assert.ok(
      counts.shambler / total >= 0.7,
      `shambler horde stays shambler-heavy (${counts.shambler}/${total})`
    );
    assert.equal(shamblerHorde.dominant, 'shambler');
  }

  const runnerHorde = generateHordeWave(6, CENTER, 180, true, 'runner');
  const runnerCounts = countByVariant(runnerHorde.zombies);
  assert.ok(
    runnerCounts.runner > runnerCounts.shambler && runnerCounts.runner > runnerCounts.brute,
    `runner horde is runner-dominated (${JSON.stringify(runnerCounts)})`
  );
  assert.equal(runnerHorde.dominant, 'runner');

  const bruteHorde = generateHordeWave(6, CENTER, 180, true, 'brute');
  const bruteCounts = countByVariant(bruteHorde.zombies);
  assert.ok(
    bruteCounts.brute / bruteHorde.zombies.length >= 0.15,
    `brute horde carries a real brute core (${bruteCounts.brute}/${bruteHorde.zombies.length})`
  );
  assert.equal(bruteHorde.dominant, 'brute');
});

test('dominant types unlock over time — Day 1 is always a shambler crawl', () => {
  for (let i = 0; i < 200; i++) {
    const day1 = rollHordeDominantType(1);
    assert.equal(day1, 'shambler', 'Day 1 never spawns a specialized horde');
  }

  // Late-game rolls can produce every type (statistical check across many rolls).
  const lateRolls = new Set(Array.from({ length: 400 }, () => rollHordeDominantType(10)));
  assert.ok(lateRolls.has('runner'), 'runner hordes appear late game');
  assert.ok(lateRolls.has('shambler'), 'shambler hordes remain common');
  // Brute is rare (15%) — 400 rolls makes its absence essentially impossible.
  assert.ok(lateRolls.has('brute'), 'brute hordes appear late game');
});

test('composition shares are a coherent breakdown that sums to the wave', () => {
  for (const [type, shares] of Object.entries(HORDE_COMPOSITION) as [string, { runner: number; shambler: number; brute: number }][]) {
    const total = shares.runner + shares.shambler + shares.brute;
    assert.ok(Math.abs(total - 1) < 0.001, `${type} composition sums to 1 (got ${total})`);
    // Each horde is BUILT around its signature type: shambler hordes are a
    // shambler sea, runner hordes are runner-majority, and brute hordes carry
    // a real brute core (22%) that no other horde type fields.
    const signature =
      type === 'shambler' ? shares.shambler : type === 'runner' ? shares.runner : shares.brute;
    assert.ok(signature >= 0.2, `${type} horde has its signature share (${signature})`);
  }
});

test('hordes scale with the day and keep every zombie on the approach arc', () => {
  const early = generateHordeWave(1, CENTER, 180, true, 'shambler');
  const late = generateHordeWave(10, CENTER, 180, true, 'runner');
  assert.ok(late.zombies.length >= early.zombies.length, 'later waves are at least as large');

  for (const horde of [early, late]) {
    for (const z of horde.zombies) {
      const dist = Math.hypot(z.x - CENTER.x, z.z - CENTER.z);
      assert.ok(dist >= 100 && dist <= 220, `zombie spawned on the perimeter arc (${dist.toFixed(0)}m)`);
    }
  }
});