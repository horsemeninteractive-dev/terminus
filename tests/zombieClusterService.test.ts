/**
 * Shared zombie clustering (services/zombieClusterService) — the same member
 * sets feed both the 3D marker layer and the clicked-cluster info panel, so
 * grouping, mean health, and id→cluster resolution must hold.
 * Run: node --import tsx --import ./tests/register-loader.mjs --test tests/zombieClusterService.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterZombies, findClusterContaining } from '../src/services/zombieClusterService';
import type { ZombieUnit } from '../src/types/combat';

let seq = 0;
function makeZombie(opts: Partial<ZombieUnit> = {}): ZombieUnit {
  seq += 1;
  return {
    id: `z${seq}`,
    variant: 'shambler',
    name: `Shambler ${seq}`,
    x: 0,
    z: 0,
    y: 0,
    rotation: 0,
    currentHp: 80,
    maxHp: 80,
    speed: 1.2,
    baseDamage: 10,
    siegeDamage: 20,
    attackCooldown: 1,
    lastAttackTime: 0,
    state: 'wandering',
    targetUnitId: null,
    targetBuildingId: null,
    targetPos: null,
    investigatingSoundId: null,
    spawnedAt: 0,
    isDormant: false,
    alertLevel: 0,
    ...opts,
  };
}

test('nearby zombies merge into one cluster; distant ones stay separate', () => {
  const zombies = [
    makeZombie({ id: 'a', x: 0, z: 0 }),
    makeZombie({ id: 'b', x: 10, z: 5 }),
    makeZombie({ id: 'c', x: 500, z: 500 }),
    makeZombie({ id: 'd', x: 505, z: 502 }),
  ];
  const clusters = clusterZombies(zombies);
  assert.equal(clusters.length, 2);
  const sizes = clusters.map((c) => c.size).sort((a, b) => a - b);
  assert.deepEqual(sizes, [2, 2]);
});

test('dead and zero-hp zombies are excluded from clusters', () => {
  const zombies = [
    makeZombie({ id: 'alive1', x: 0, z: 0 }),
    makeZombie({ id: 'dead', x: 1, z: 1, state: 'dead' }),
    makeZombie({ id: 'hp0', x: 2, z: 2, currentHp: 0 }),
  ];
  const clusters = clusterZombies(zombies);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].size, 1);
  assert.equal(clusters[0].members[0].id, 'alive1');
});

test('damageRatio is the mean health ratio of members', () => {
  const zombies = [
    makeZombie({ id: 'full', x: 0, z: 0, currentHp: 100, maxHp: 100 }),
    makeZombie({ id: 'half', x: 3, z: 3, currentHp: 50, maxHp: 100 }),
  ];
  const clusters = clusterZombies(zombies);
  assert.equal(clusters.length, 1);
  assert.ok(Math.abs(clusters[0].damageRatio - 0.75) < 1e-9);
});

test('cluster position is the member centroid', () => {
  const zombies = [
    makeZombie({ id: 'p1', x: 0, z: 0 }),
    makeZombie({ id: 'p2', x: 20, z: 10 }),
  ];
  const [c] = clusterZombies(zombies);
  assert.ok(Math.abs(c.x - 10) < 1e-9);
  assert.ok(Math.abs(c.z - 5) < 1e-9);
});

test('findClusterContaining resolves a member id to its cluster', () => {
  const zombies = [
    makeZombie({ id: 'x1', x: 0, z: 0 }),
    makeZombie({ id: 'far', x: 900, z: 900 }),
  ];
  const c = findClusterContaining(zombies, 'x1');
  assert.ok(c);
  assert.equal(c!.members.some((m) => m.id === 'x1'), true);
  assert.equal(findClusterContaining(zombies, 'nonexistent'), null);
});

test('empty input yields no clusters', () => {
  assert.deepEqual(clusterZombies([]), []);
});
