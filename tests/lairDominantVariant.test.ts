import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZombieUnit } from '../src/services/combatService';
import {
  generateZombieLairs,
  pickLairDominantVariant,
  tickZombieLairs,
} from '../src/services/rivalFactionService';
import { deserializeSettlementState, serializeSettlementState } from '../src/services/saveService';
import type { BuildingPolygon } from '../src/types/map';
import type { SettlementState } from '../src/types/settlement';
import type { ZombieLair, ZombieUnit, ZombieVariant } from '../src/types/combat';

/** A 20m × 20m block at (cx, cz). */
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

function mkLair(id: string, population: number, dominant: ZombieVariant = 'shambler'): ZombieLair {
  const baselinePopulation = Math.max(population, 20);
  const escalation = 1;
  const garrisonCeiling = Math.max(
    baselinePopulation,
    Math.round(baselinePopulation * (1 + 0.4 * escalation))
  );
  return {
    id,
    buildingId: id,
    buildingName: id,
    isDiscovered: true,
    isCleared: false,
    population,
    baselinePopulation,
    garrisonCeiling,
    emergenceCapacity: Math.max(8, Math.round(garrisonCeiling * 0.35)),
    homeRadius: 40,
    spawnAccumSec: 0,
    lastActivity: Date.now(),
    escalation,
    escalationAccumSec: 0,
    threatTier: 'high',
    replenishAccumSec: 0,
    dominantVariant: dominant,
  };
}

function mkAffiliated(
  id: string,
  lairId: string,
  x: number,
  z: number,
  variant: ZombieVariant = 'shambler',
  alive = true
): ZombieUnit {
  const unit = createZombieUnit(variant, x, z, 0, false);
  unit.id = id;
  unit.lairId = lairId;
  unit.currentHp = alive ? unit.maxHp : 0;
  return unit;
}

// ----------------------------------------------------------------
// 1. Dominant type: generated, stable, deterministic
// ----------------------------------------------------------------

test('every generated lair carries a valid dominant variant', () => {
  const buildings = [
    mkBuilding('1', 0, 0),
    mkBuilding('2', 300, 0),
    mkBuilding('3', 600, 0),
    mkBuilding('4', 900, 0),
  ];
  const { lairs } = generateZombieLairs(buildings, 'none');
  assert.ok(lairs.size >= 1);
  const valid: ZombieVariant[] = ['shambler', 'runner', 'brute'];
  for (const lair of lairs.values()) {
    assert.ok(
      valid.includes(lair.dominantVariant as ZombieVariant),
      `lair ${lair.id} has dominantVariant ${lair.dominantVariant}`
    );
  }
});

test('dominant variant is deterministic per building — same id and tier always agree', () => {
  for (const id of ['w_12', 'w_77', 'w_4021', 'w_9']) {
    for (const tier of ['low', 'medium', 'high'] as const) {
      assert.equal(
        pickLairDominantVariant(id, tier),
        pickLairDominantVariant(id, tier),
        'same building + tier → same dominant type'
      );
    }
  }
});

test('higher threat tiers skew toward dangerous dominants (never the reverse)', () => {
  // Statistical: across many building ids, high tiers produce more brutes+runners
  // than low tiers. Deterministic hash makes this exact, not flaky.
  let highDangerous = 0;
  let lowDangerous = 0;
  for (let i = 0; i < 500; i++) {
    const id = `b_${i}`;
    if (pickLairDominantVariant(id, 'high') !== 'shambler') highDangerous++;
    if (pickLairDominantVariant(id, 'low') !== 'shambler') lowDangerous++;
  }
  assert.ok(
    highDangerous > lowDangerous,
    `high tier should favour dangerous dominants (high=${highDangerous}, low=${lowDangerous})`
  );
});

// ----------------------------------------------------------------
// 2. Garrison + emergence + replenishment follow the dominant type
// ----------------------------------------------------------------

test('most of the founding garrison is the dominant variant', () => {
  // Force many lairs and count composition across all of them.
  const buildings: BuildingPolygon[] = [];
  for (let i = 0; i < 12; i++) buildings.push(mkBuilding(String(i), i * 400, 0));
  const { lairs, seededZombies } = generateZombieLairs(buildings, 'none');
  let dominantCount = 0;
  let total = 0;
  for (const lair of lairs.values()) {
    const dom = lair.dominantVariant as ZombieVariant;
    for (const z of seededZombies.filter((zz) => zz.lairId === lair.id)) {
      total++;
      if (z.variant === dom) dominantCount++;
    }
  }
  assert.ok(total > 30, `meaningful sample (got ${total})`);
  assert.ok(
    dominantCount / total >= 0.6,
    `dominant type should dominate the garrison (got ${((dominantCount / total) * 100).toFixed(1)}%)`
  );
});

test('emerging groups respect the lair dominant type (not a fixed shambler/runner mix)', () => {
  const buildings = [mkBuilding('lair_b1', 0, 0)];
  const lairs = new Map<string, ZombieLair>();
  const lair = mkLair('lair_b1', 30, 'brute');
  lairs.set(lair.buildingId, lair);
  // Garrison of 30 brutes inside the building → population is under the
  // ceiling, so emergence may fire; bank the accumulator to force it.
  const garrison: ZombieUnit[] = [];
  for (let i = 0; i < 30; i++) {
    garrison.push(mkAffiliated(`z_${i}`, 'lair_b1', 0, 0, 'brute'));
  }
  lair.spawnAccumSec = 9999;
  const r = tickZombieLairs(
    lairs,
    [...garrison],
    [],
    buildings,
    Date.now(),
    1,
    true // night → no daylight throttle
  );
  const spawned = r.spawnedZombies;
  assert.ok(spawned.length > 0, 'an emergence group spawned');
  assert.ok(spawned.length >= 2, 'emergence is a GROUP, not a single zombie');
  const brutes = spawned.filter((z) => z.variant === 'brute').length;
  assert.ok(
    brutes / spawned.length >= 0.75,
    `the group is composed of the dominant type (brutes=${brutes}/${spawned.length})`
  );
  for (const z of spawned) {
    assert.equal(z.lairId, 'lair_b1', 'emerged infected stay affiliated with their lair');
  }
});

test('replenished infected use the lair dominant type', () => {
  const buildings = [mkBuilding('lair_b2', 0, 0)];
  const lairs = new Map<string, ZombieLair>();
  // Population 5 vs baseline 40 → partial clear; replenish interval for the
  // 'high' tier is 280s; bank 2 intervals worth of accumulator.
  const lair = { ...mkLair('lair_b2', 40, 'runner'), population: 5 };
  lairs.set(lair.buildingId, lair);
  const survivors: ZombieUnit[] = [];
  for (let i = 0; i < 5; i++) survivors.push(mkAffiliated(`s_${i}`, 'lair_b2', 0, 0, 'runner'));
  const r = tickZombieLairs(lairs, [...survivors], [], buildings, Date.now(), 700, true);
  const replenished = r.spawnedZombies;
  assert.ok(replenished.length > 0, 'a partially cleared lair regrows');
  for (const z of replenished) {
    assert.equal(z.variant, 'runner', 'regrown infected match the dominant type');
    assert.equal(z.lairId, 'lair_b2');
  }
});

// ----------------------------------------------------------------
// 3. Save/load compatibility: legacy lairs migrate deterministically
// ----------------------------------------------------------------

function baseState(): Partial<SettlementState> {
  return {
    day: 1,
    hour: 8,
    stockpile: {
      food: { canned_goods: 10, mre_rations: 10 },
      water: { stored: 100, collected: 0 },
      materials: { scrap: 0, lumber: 0 },
      ammo: { light: 0, heavy: 0 },
      medicine: { basic: 0, advanced: 0 },
    },
  } as unknown as Partial<SettlementState>;
}

test('legacy lair records without dominantVariant migrate deterministically', () => {
  const legacyPayload = {
    ...baseState(),
    zombieLairs: [
      [
        'lair_w9',
        {
          id: 'lair_w9',
          buildingId: 'w9',
          buildingName: 'Warehouse 9',
          isDiscovered: true,
          isCleared: false,
          population: 12,
          baselinePopulation: 30,
          homeRadius: 45,
          threatTier: 'medium',
          escalation: 2,
          escalationAccumSec: 0,
          replenishAccumSec: 0,
          // NOTE: no dominantVariant, no garrisonCeiling / emergenceCapacity —
          // a record from before the dominant-variant + capacity era.
        },
      ],
    ],
  };
  const state = deserializeSettlementState(legacyPayload as any) as SettlementState;
  const lair = state.zombieLairs.get('lair_w9') as ZombieLair;
  assert.ok(lair, 'legacy lair loaded');
  assert.ok(lair.dominantVariant, 'dominant variant was migrated in');
  // Deterministic: the migrated value must equal what generation would pick
  // for the same building — and a second load must not re-roll it.
  const expected = pickLairDominantVariant('w9', 'medium');
  assert.equal(lair.dominantVariant, expected);
  const again = deserializeSettlementState(legacyPayload as any) as SettlementState;
  assert.equal(
    (again.zombieLairs.get('lair_w9') as ZombieLair).dominantVariant,
    expected,
    'migration is stable across loads, not random each time'
  );
});

test('round trip: dominant variant survives serialize → deserialize unchanged', () => {
  const lairs = new Map<string, ZombieLair>();
  lairs.set('lair_x1', mkLair('lair_x1', 22, 'brute'));
  const state = {
    ...baseState(),
    zombieLairs: lairs,
  } as unknown as SettlementState;
  const restored = deserializeSettlementState(serializeSettlementState(state)) as SettlementState;
  const lair = restored.zombieLairs.get('lair_x1') as ZombieLair;
  assert.equal(lair.dominantVariant, 'brute', 'dominant type round-trips through the save');
});
