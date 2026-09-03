import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZombieUnit } from '../src/services/combatService';
import { tickZombieLairs, mobilizeLairHorde } from '../src/services/rivalFactionService';
import type { BuildingPolygon } from '../src/types/map';
import type { ZombieLair, ZombieUnit } from '../src/types/combat';

function mkBuilding(id: string, cx: number, cz: number): BuildingPolygon {
  return {
    id,
    name: `Block ${id}`,
    levels: 3,
    center: { x: cx, z: cz },
    polygon: [
      { x: cx - 10, z: cz - 10 },
      { x: cx + 10, z: cz - 10 },
      { x: cx + 10, z: cz + 10 },
      { x: cx - 10, z: cz + 10 },
    ],
  } as BuildingPolygon;
}

function mkLair(id: string, population: number, baselinePopulation: number, escalation = 0, isCleared = false): ZombieLair {
  return {
    id,
    buildingId: id,
    buildingName: id,
    isDiscovered: true,
    isCleared,
    population,
    baselinePopulation,
    homeRadius: 40,
    spawnAccumSec: 0,
    lastActivity: Date.now(),
    escalation,
    escalationAccumSec: 0,
    threatTier: 'high',
    replenishAccumSec: 0,
    hordeAccumSec: 0,
  } as ZombieLair;
}

/** Night-active shamblers gathered at the nest (the lair's resident garrison). */
function mkResidents(lairId: string, count: number, cx = 300, cz = 0): ZombieUnit[] {
  const out: ZombieUnit[] = [];
  for (let i = 0; i < count; i++) {
    const z = createZombieUnit('shambler', cx, cz, 0, true); // state 'wandering', active at night
    z.lairId = lairId;
    z.homeX = cx;
    z.homeZ = cz;
    z.homeRadius = 40;
    out.push(z);
  }
  return out;
}

const HQ = { x: 0, z: 0 };

test('mobilization RETARGETS resident infected into a night horde — no zombie is ever created', () => {
  const buildings = [mkBuilding('lair_1', 300, 0), mkBuilding('b2', -200, 0)];
  const lair = mkLair('lair_1', 30, 30);
  const interior = mkResidents(lair.id, 30);
  const lairs = new Map<string | number, ZombieLair>([['lair_1', lair]]);

  // 300s base interval at escalation 0 — a full interval of night fires it.
  const r = tickZombieLairs(lairs, interior, [], buildings, Date.now(), 310, true, HQ);

  // The horde is a SUBSET OF THE ORIGINAL RESIDENTS — same objects, now
  // marching. desired = max(2, floor(30 * 0.3) + 0) = 9, pool is all 30.
  const mobilized = interior.filter((z) => z.targetPos);
  assert.equal(mobilized.length, 9, 'a strike group of 9 residents is committed');
  for (const z of mobilized) {
    assert.equal(z.lairId, lair.id, 'mobilized infected stay REAL lair population');
    assert.ok(
      Math.hypot(z.targetPos!.x - HQ.x, z.targetPos!.z - HQ.z) < 40,
      `march target is the settlement (${JSON.stringify(z.targetPos)})`
    );
    assert.equal(z.homeX, 300, 'survivors keep their home anchor — they can walk back to the nest');
  }

  // The key P0 guarantee: mobilization fabricates NOTHING. The only new
  // zombies this tick are the cadence-driven local emergence spawns, and none
  // of them march — the horde never travels through spawnedZombies.
  assert.equal(r.spawnedZombies.filter((z) => z.targetPos).length, 0, 'no new marching zombies were spawned');
  assert.ok(mobilized.every((z) => interior.includes(z)), 'every marcher was already a resident');
  const after = r.updatedLairs.get('lair_1')!;
  assert.ok(after.population < 30 + mobilized.length, 'mobilization added nothing to the population');
  assert.ok(
    r.notifications.some((n) => n.title === 'LAIR MOBILIZING'),
    'a discovered lair announces the mobilization'
  );
});

test('residents already fighting a lair assault stay behind — mobilization never pulls combatants away', () => {
  const buildings = [mkBuilding('lair_1b', 300, 0)];
  const lair = mkLair('lair_1b', 30, 30);
  const interior = mkResidents(lair.id, 30);
  // One resident is mid-fight with an assaulting squad.
  interior[0].state = 'attacking_unit';

  const r = tickZombieLairs(new Map([['lair_1b', lair]]), interior, [], buildings, Date.now(), 310, true, HQ);
  const mobilized = interior.filter((z) => z.targetPos);
  assert.equal(mobilized.length, 9, 'the 9-strong strike group still forms');
  assert.equal(interior[0].targetPos, null, 'a resident actively fighting is not yanked out of the fight');
});

test('daylight blocks mobilization — and does not bank time toward an instant dusk horde', () => {
  const buildings = [mkBuilding('lair_2', 300, 0)];
  const lair = mkLair('lair_2', 20, 20);
  const interior = mkResidents(lair.id, 20);

  // A full day at max delta — nothing mobilizes.
  const day = tickZombieLairs(new Map([['lair_2', lair]]), interior, [], buildings, Date.now(), 600, false, HQ);
  assert.equal(interior.filter((z) => z.targetPos).length, 0, 'no resident marches by day (local emergence is fine)');
  const afterDay = day.updatedLairs.get('lair_2')!;
  assert.equal(afterDay.hordeAccumSec, 0, 'daytime does not bank toward an instant dusk horde');

  // The next night still needs a full interval.
  const shortNight = tickZombieLairs(
    new Map([['lair_2', afterDay]]),
    interior,
    [],
    buildings,
    Date.now(),
    100,
    true,
    HQ
  );
  assert.equal(interior.filter((z) => z.targetPos).length, 0, 'a short first night does not instantly mobilize');
});

test('cleared lairs never mobilize', () => {
  const buildings = [mkBuilding('lair_3', 300, 0)];
  const lair = mkLair('lair_3', 0, 20, 0, true);
  const r = tickZombieLairs(
    new Map([['lair_3', lair]]),
    [],
    [],
    buildings,
    Date.now(),
    600,
    true,
    HQ
  );
  assert.equal(r.spawnedZombies.length, 0, 'a cleared nest emerges nothing');
  assert.ok(!r.notifications.some((n) => n.title === 'LAIR MOBILIZING'));
});

test('escalation quickens the mobilization cadence — a neglected lair becomes a nightly engine', () => {
  const buildings = [mkBuilding('lair_4', 300, 0)];
  const hot = mkLair('lair_4', 40, 40, 5);
  const hotInterior = mkResidents('lair_4', 40);
  // Escalation 5 → interval = 300 - 5*35 = 125s. 130s of night fires it.
  const hotR = tickZombieLairs(new Map([['lair_4', hot]]), hotInterior, [], buildings, Date.now(), 130, true, HQ);
  const hotMobilized = hotInterior.filter((z) => z.targetPos);
  assert.ok(hotMobilized.length > 0, 'an escalated lair mobilizes fast');
  assert.equal(hotMobilized.length, 17, 'escalation 5 → 12 + 5 = 17 residents committed (cap 18)');

  // Escalation 0 → interval 300s. 130s of night is not enough.
  const calm = mkLair('lair_4', 40, 40, 0);
  const calmInterior = mkResidents('lair_4', 40);
  const calmR = tickZombieLairs(new Map([['lair_4', calm]]), calmInterior, [], buildings, Date.now(), 130, true, HQ);
  assert.equal(calmInterior.filter((z) => z.targetPos).length, 0, 'a fresh lair needs a full night interval');
});

test('repeated nights of mobilization never inflate the lair population (P0 regression)', () => {
  const buildings = [mkBuilding('lair_7', 300, 0)];
  const lair = mkLair('lair_7', 30, 30);
  const interior = mkResidents('lair_7', 30);

  // Night 1: full interval fires a 9-strong mobilization.
  const n1 = tickZombieLairs(new Map([['lair_7', lair]]), interior, [], buildings, Date.now(), 310, true, HQ);
  const afterN1 = n1.updatedLairs.get('lair_7')!;
  const worldN1 = [...interior, ...n1.spawnedZombies];
  assert.equal(
    afterN1.population,
    worldN1.filter((z) => z.lairId === 'lair_7' && z.currentHp > 0).length,
    'night 1: synced population == real living infected — mobilization added none'
  );

  // Night 2: the raiders are still on the map (and counted), and the nest
  // mobilizes again from whoever is home. Still ZERO fabrication.
  const n2 = tickZombieLairs(new Map([['lair_7', afterN1]]), worldN1, [], buildings, Date.now(), 310, true, HQ);
  const afterN2 = n2.updatedLairs.get('lair_7')!;
  const worldN2 = [...worldN1, ...n2.spawnedZombies];
  assert.equal(
    afterN2.population,
    worldN2.filter((z) => z.lairId === 'lair_7' && z.currentHp > 0).length,
    'night 2: population still equals living infected — two raid cycles created nothing'
  );
  assert.equal(n2.spawnedZombies.filter((z) => z.targetPos).length, 0, 'night 2: no spawned zombie marches either');
});

test('killing every mobilized raider en route thins the nest — intercept is a real alternative to assault', () => {
  const buildings = [mkBuilding('lair_5', 300, 0), mkBuilding('b2', -200, 0)];
  const lair = mkLair('lair_5', 40, 40, 3);
  const interior = mkResidents('lair_5', 40);

  const r = tickZombieLairs(new Map([['lair_5', lair]]), interior, [], buildings, Date.now(), 200, true, HQ);
  const mobilized = interior.filter((z) => z.targetPos);
  assert.ok(mobilized.length > 0);

  // The squad intercepts: every mobilized raider dies before reaching the nest.
  const raiderCount = mobilized.length;
  for (const z of mobilized) z.currentHp = 0;

  const afterIntercept = tickZombieLairs(
    r.updatedLairs,
    interior, // only the residents that never marched remain
    [],
    buildings,
    Date.now(),
    10,
    true,
    HQ
  );
  const lairAfter = afterIntercept.updatedLairs.get('lair_5')!;
  assert.equal(
    lairAfter.population,
    40 - raiderCount,
    `intercepting the horde reduced the lair (40 → ${lairAfter.population})`
  );
  assert.ok(!lairAfter.isCleared, 'surviving residents keep the nest standing');
});

test('a lair can only raid as strong as the residents actually at home (size scaling + cap)', () => {
  // A massive 200-strong lair: 0.3 * 200 = 60 + 5 → capped at 18.
  const big = mkLair('lair_6', 200, 200, 5);
  const bigResidents = mkResidents('lair_6', 200);
  const bigHorde = mobilizeLairHorde(big, bigResidents, HQ);
  assert.ok(bigHorde.length <= 18, `capped at 18 (got ${bigHorde.length})`);
  assert.ok(bigHorde.every((z) => bigResidents.includes(z)), 'every raider is a real, pre-existing resident');

  // A tiny nest can only commit what it has — no conjured minimum strike force.
  const small = mkLair('lair_7', 5, 5, 0);
  const smallResidents = mkResidents('lair_7', 5);
  const smallHorde = mobilizeLairHorde(small, smallResidents, HQ);
  assert.ok(smallHorde.length >= 1 && smallHorde.length <= 5, `bounded by the residents at home (got ${smallHorde.length})`);
  assert.ok(smallHorde.every((z) => smallResidents.includes(z)));

  // A nest with NO residents near home cannot raid at all.
  const emptyHorde = mobilizeLairHorde(small, [], HQ);
  assert.equal(emptyHorde.length, 0, 'an empty nest commits nothing');
});

test('mobilized survivors keep their lairId and home anchor — they remain part of the lair population', () => {
  const buildings = [mkBuilding('lair_8', 300, 0)];
  const lair = mkLair('lair_8', 12, 12);
  const interior = mkResidents('lair_8', 12);
  const r = tickZombieLairs(new Map([['lair_8', lair]]), interior, [], buildings, Date.now(), 310, true, HQ);
  const mobilized = interior.filter((z) => z.targetPos);
  assert.equal(mobilized.length, 3, 'floor(12 * 0.3) = 3 residents committed');
  for (const z of mobilized) {
    // Not killed, not cleared: still counted as lair population next tick.
    assert.equal(z.lairId, 'lair_8');
    assert.equal(z.currentHp > 0, true);
    assert.ok(z.homeX !== undefined && z.homeZ !== undefined, 'anchor intact — the AI can pull survivors home');
    assert.ok(z.homeRadius !== undefined);
  }
  // The next tick still counts them as the lair's living population.
  const next = tickZombieLairs(r.updatedLairs, interior, [], buildings, Date.now(), 30, true, HQ);
  const after = next.updatedLairs.get('lair_8')!;
  assert.equal(after.population, 12, 'surviving marchers still count — nothing was deducted for mobilizing');
});
