import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState, buildFreestanding, establishSettlementHQ } from '../src/services/settlementService';
import { createZombieUnit, tickCombatSimulation } from '../src/services/combatService';
import type { SettlementState } from '../src/types/settlement';
import type { BuildingPolygon } from '../src/types/map';

function makeHq(): BuildingPolygon {
  return {
    id: 'b_hq_uc_test',
    type: 'residential' as unknown as BuildingPolygon['type'],
    rawType: 'headquarters',
    name: 'Test HQ',
    height: 12,
    levels: 3,
    center: { x: 0, z: 0 },
    polygon: [
      { x: -8, z: -8 },
      { x: 8, z: -8 },
      { x: 8, z: 8 },
      { x: -8, z: 8 },
    ],
    tags: {},
  };
}

/** A single tower volley lands within this window: fireInterval 2s, delta 2s. */
const clock = {
  isNight: true,
  night: true,
  speed: 1,
  day: 1,
  phase: 'night',
  hour: 22,
  minute: 0,
  totalElapsedSeconds: 10,
} as any;

/**
 * Regression test: a tower that has NOT finished construction must never open
 * fire — even with workers assigned (those workers are BUILDING it, not
 * manning it). Scaffolding has no firing platform.
 */
test('an under-construction tower with assigned workers does NOT fire', () => {
  let state = createInitialSettlementState('UC Tower Test');
  state = establishSettlementHQ(state, makeHq());
  const r = buildFreestanding(state, 'wooden_tower', { x: 20, z: 0 }, 5.2, 5.2, 8, 0);
  if (!r.success) throw new Error(`place tower failed: ${r.error}`);
  const building = {
    ...r.newState.freestandingBuildings[r.newState.freestandingBuildings.length - 1],
    constructionStatus: 'in_progress' as const,
    constructionProgress: 40,
    assignedWorkers: 3, // construction crew on site — NOT a gun crew
  };
  const ucState = {
    ...r.newState,
    freestandingBuildings: [building],
  } as unknown as SettlementState;

  const zombie = createZombieUnit('shambler', 30, 0, 0, true);
  const before = zombie.currentHp;
  const res = tickCombatSimulation([zombie], [], new Map(), [], clock, null, 2, ucState);

  assert.equal(
    res.updatedZombies[0].currentHp,
    before,
    'an unfinished tower must stay silent — its workers are builders, not gunners'
  );
  assert.equal(res.ammoConsumed, 0, 'no ammunition may be spent by a construction site');
});

/** Control: the same tower flipped to completed DOES engage, proving the guard
 *  keys on construction status rather than silently disarming all towers. */
test('a completed tower with the same worker count still fires (control)', () => {
  let state = createInitialSettlementState('UC Tower Test');
  state = establishSettlementHQ(state, makeHq());
  const r = buildFreestanding(state, 'wooden_tower', { x: 20, z: 0 }, 5.2, 5.2, 8, 0);
  if (!r.success) throw new Error(`place tower failed: ${r.error}`);
  const doneState = {
    ...r.newState,
    freestandingBuildings: r.newState.freestandingBuildings.map((f) => ({
      ...f,
      constructionStatus: 'completed' as const,
      constructionProgress: 100,
      constructionWorkDone: f.constructionWorkRequired,
      assignedWorkers: 3,
    })),
  } as unknown as SettlementState;

  const zombie = createZombieUnit('shambler', 30, 0, 0, true);
  const before = zombie.currentHp;
  const res = tickCombatSimulation([zombie], [], new Map(), [], clock, null, 2, doneState);

  assert.ok(
    res.updatedZombies[0].currentHp < before,
    'the completed tower engaged (bow fallback) — the guard is status-keyed'
  );
});
