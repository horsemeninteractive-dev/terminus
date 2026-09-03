import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tickBuildingOccupations,
  breachOccupiedBuilding,
  getOccupationCandidates,
} from '../src/services/buildingOccupationService';
import type { SettlementState } from '../src/types/settlement';
import type { ZombieLair, ZombieUnit } from '../src/types/combat';
import type { BuildingPolygon } from '../src/types/map';
import { createEmptyOccupationState } from '../src/types/occupation';

/** Deterministic dice: always rolls low → pressure pass succeeds. */
function withLuck(fn: () => void, value = 0.1) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    fn();
  } finally {
    Math.random = orig;
  }
}

function poly(cx: number, cz: number, w = 30, d = 30): { x: number; z: number }[] {
  return [
    { x: cx - w / 2, z: cz - d / 2 },
    { x: cx + w / 2, z: cz - d / 2 },
    { x: cx + w / 2, z: cz + d / 2 },
    { x: cx - w / 2, z: cz + d / 2 },
  ];
}

function mkBuilding(id: string | number, cx: number, cz: number, name = `Bldg ${id}`): BuildingPolygon {
  return { id, name, levels: 3, center: { x: cx, z: cz }, polygon: poly(cx, cz) } as BuildingPolygon;
}

function mkLair(buildingId: string | number): ZombieLair {
  return {
    id: `lair_${buildingId}`,
    buildingId,
    isDiscovered: true,
    isCleared: false,
    population: 40,
    maxPopulation: 40,
    homeRadius: 40,
    threatTier: 'high',
    escalation: 1,
    spawnedAt: 0,
  } as unknown as ZombieLair;
}

function mkState(overrides: Partial<SettlementState> = {}): SettlementState {
  return {
    adaptedBuildings: new Map(),
    freestandingBuildings: [],
    headquarters: [],
    primaryHQId: undefined,
    zombieLairs: new Map(),
    occupiedBuildings: createEmptyOccupationState(),
    ...overrides,
  } as unknown as SettlementState;
}

test('only UNADAPTED structures are occupation targets — adapted, freestanding, HQ and lair buildings are protected', () => {
  const hq = mkBuilding('hq', 0, 0, 'HQ');
  const adapted = mkBuilding('ad', 100, 0, 'Adapted');
  const free = mkBuilding('free', 200, 0, 'Freestanding');
  const lairBldg = mkBuilding('lb', 300, 0, 'Lair Block');
  const plain = mkBuilding('p1', 400, 0, 'Plain');
  const buildings = [hq, adapted, free, lairBldg, plain];

  const state = mkState({
    headquarters: [{ buildingId: 'hq' } as any],
    primaryHQId: 'hq',
    adaptedBuildings: new Map([['ad', { buildingId: 'ad' } as any]]),
    freestandingBuildings: [{ buildingId: 'free' } as any],
    zombieLairs: new Map([['lb', mkLair('lb')]]),
  });

  const candidates = getOccupationCandidates(state, buildings);
  const ids = candidates.map((b) => String(b.id));
  assert.deepEqual(ids, ['p1'], `only the plain unadapted structure is occupiable (got ${ids.join(', ')})`);
});

test('a lair-pressure pass occupies a building with REAL infected that are home-bound', () => {
  const target = mkBuilding('t1', 500, 0, 'Target');
  const buildings = [target];
  const state = mkState({ zombieLairs: new Map([['lb', mkLair('lb')]]) });
  // Put the lair's own building in the map so pressure centers resolve.
  buildings.push(mkBuilding('lb', 200, 0, 'Lair Block'));

  let result!: ReturnType<typeof tickBuildingOccupations>;
  withLuck(() => {
    result = tickBuildingOccupations(state, [], [], buildings, new Map([['lb', mkLair('lb')]]), true, 60, 1000);
  });

  const occ = result.newState.occupiedBuildings!.buildings.get('t1');
  assert.ok(occ, 'the pressured building is taken over');
  assert.ok(!occ!.isCleared, 'a fresh occupation is not cleared on its birth tick');
  assert.ok(occ!.infectedRemaining > 0, 'occupation starts with real infected inside');

  const spawns = result.spawnedZombies;
  assert.ok(spawns.length >= 3, `occupation seeds real infected (${spawns.length})`);
  for (const z of spawns) {
    assert.ok(z.occupationId === occ!.id, 'every seeded infected carries the occupation id');
    assert.equal(z.homeX, target.center.x, 'seeded infected anchor to the building');
    assert.equal(z.homeZ, target.center.z, 'seeded infected anchor to the building');
    assert.ok(z.homeRadius !== undefined, 'seeded infected have a home radius (stay local)');
  }
});

function lairState(): SettlementState {
  // The lair's own building must be protected by state.zombieLairs, exactly as
  // it is in the live pipeline (state and the lair map are the same there).
  return mkState({ zombieLairs: new Map([['lb', mkLair('lb')]]) });
}

test('daylight blocks occupation away from lair pressure; night allows it', () => {
  const target = mkBuilding('t2', 500, 0, 'Target');
  const buildings = [target, mkBuilding('lb', 200, 0, 'Lair Block')];
  const lairs = new Map([['lb', mkLair('lb')]]);

  // Day, no pressured building (laire reach: 40 * 1.8 = 72 → 500 is far away).
  withLuck(() => {
    const day = tickBuildingOccupations(lairState(), [], [], buildings, lairs, false, 60, 1000);
    assert.ok(day.newState.occupiedBuildings!.buildings.size === 0, 'no occupation by day without lair pressure');
  });

  // Night, same distance → allowed.
  withLuck(() => {
    const night = tickBuildingOccupations(lairState(), [], [], buildings, lairs, true, 60, 1000);
    assert.ok(night.newState.occupiedBuildings!.buildings.size === 1, 'night allows an occupation away from lairs');
  });
});

test('killing every infected clears the occupation — no regrow, no new spawns', () => {
  const target = mkBuilding('t3', 0, 0, 'Target');
  const buildings = [target, mkBuilding('lb', 200, 0, 'Lair Block')];
  const lairs = new Map([['lb', mkLair('lb')]]);

  let seeded: ReturnType<typeof tickBuildingOccupations>;
  withLuck(() => {
    seeded = tickBuildingOccupations(lairState(), [], [], buildings, lairs, true, 60, 1000);
  });
  const occ = seeded.newState.occupiedBuildings!.buildings.get('t3')!;

  // The player kills every one of the real infected.
  const r = tickBuildingOccupations(
    seeded.newState,
    [], // all infected dead
    [],
    buildings,
    lairs,
    true,
    60,
    2000
  );

  const cleared = r.newState.occupiedBuildings!.buildings.get('t3')!;
  assert.ok(cleared.isCleared, 'occupation clears when the last infected dies');
  assert.equal(cleared.infectedRemaining, 0);
  assert.ok(r.events.some((e) => e.title === 'BUILDING RECLAIMED'), 'a reclaim event fires');
  assert.equal(r.spawnedZombies.length, 0, 'cleared occupations never conjure new infected');
});

test('a partially cleared occupation survives while some infected live', () => {
  const target = mkBuilding('t4', 0, 0, 'Target');
  const buildings = [target, mkBuilding('lb', 200, 0, 'Lair Block')];
  const lairs = new Map([['lb', mkLair('lb')]]);

  let seeded: ReturnType<typeof tickBuildingOccupations>;
  withLuck(() => {
    seeded = tickBuildingOccupations(lairState(), [], [], buildings, lairs, true, 60, 1000);
  });
  const occ = seeded.newState.occupiedBuildings!.buildings.get('t4')!;
  const survivors = seeded.spawnedZombies.slice(0, Math.max(1, seeded.spawnedZombies.length - 2));

  const r = tickBuildingOccupations(seeded.newState, survivors, [], buildings, lairs, true, 60, 2000);
  const still = r.newState.occupiedBuildings!.buildings.get('t4')!;
  assert.ok(!still.isCleared, 'occupation stands while any infected remain');
  assert.equal(still.infectedRemaining, survivors.length, 'population syncs to the living infected');
});

test('breaching an occupied building wakes the REAL infected — none are conjured', () => {
  const target = mkBuilding('t5', 0, 0, 'Target');
  const buildings = [target, mkBuilding('lb', 200, 0, 'Lair Block')];
  const lairs = new Map([['lb', mkLair('lb')]]);

  let seeded: ReturnType<typeof tickBuildingOccupations>;
  withLuck(() => {
    seeded = tickBuildingOccupations(lairState(), [], [], buildings, lairs, true, 60, 1000);
  });
  const occ = seeded.newState.occupiedBuildings!.buildings.get('t5')!;
  const residents = seeded.spawnedZombies;

  const breached = breachOccupiedBuilding(residents, occ, target.center);
  assert.equal(breached.length, residents.length, 'breach does not add zombies — the occupants are real');
  for (const z of breached) {
    assert.ok(z.alertLevel >= 2, 'breach alerts every occupant');
    assert.equal(z.state, 'chasing', 'breach puts occupants into combat');
  }
  // Unrelated zombies stay untouched.
  const outsider: ZombieUnit = { id: 'z_out', currentHp: 100 } as any;
  const mixed = breachOccupiedBuilding([...residents, outsider], occ, target.center);
  assert.equal(mixed[mixed.length - 1].id, 'z_out');
  assert.equal((mixed[mixed.length - 1] as any).alertLevel, undefined);
});