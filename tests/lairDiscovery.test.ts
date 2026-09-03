import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverThreatsInVision } from '../src/services/fogOfWarService';
import type { ZombieLair } from '../src/types/combat';
import type { RivalHideout } from '../src/types/rivalFaction';

const now = Date.now();

function mkLair(id: string, buildingId: string, overrides: Partial<ZombieLair> = {}): ZombieLair {
  return {
    id,
    buildingId,
    buildingName: `Nest ${id}`,
    isDiscovered: false,
    isCleared: false,
    population: 60,
    baselinePopulation: 60,
    homeRadius: 40,
    spawnAccumSec: 0,
    lastActivity: now,
    escalation: 0,
    escalationAccumSec: 0,
    threatTier: 'high',
    replenishAccumSec: 0,
    ...overrides,
  };
}

function mkHideout(id: string, buildingId: string, overrides: Partial<RivalHideout> = {}): RivalHideout {
  return {
    id,
    buildingId,
    buildingName: `Hideout ${id}`,
    factionName: 'Raiders',
    factionId: 'raiders',
    isDiscovered: false,
    isCleared: false,
    occupantCount: 6,
    initialOccupantCount: 6,
    ...overrides,
  } as RivalHideout;
}

const mapData = {
  buildings: [
    { id: 'b_near', center: { x: 0, z: 0 } },
    { id: 'b_far', center: { x: 500, z: 500 } },
    { id: 'b_cleared', center: { x: 0, z: 0 } },
    { id: 'b_known', center: { x: 0, z: 0 } },
  ],
} as any;

const squadAt = (x: number, z: number) => [
  { squadId: 'sq1', isDeployed: true, currentHp: 100, x, z },
] as any;

test('a squad within vision discovers an unknown, standing lair — and only once', () => {
  const lairs = new Map<string | number, ZombieLair>([
    ['l1', mkLair('l1', 'b_near')],
    ['l2', mkLair('l2', 'b_far')],
    ['l3', mkLair('l3', 'b_cleared', { isCleared: true })],
    ['l4', mkLair('l4', 'b_known', { isDiscovered: true })],
  ]);
  const hideouts = new Map<string | number, RivalHideout>([['h1', mkHideout('h1', 'b_near')]]);

  // Squad 5m from b_near: the unknown standing lair flips, the rest stay hidden.
  const first = discoverThreatsInVision(hideouts, lairs, squadAt(5, 0), mapData);
  assert.deepEqual(first.lairIds, ['l1'], 'only the lair within squad vision is discovered');
  assert.deepEqual(first.hideoutIds, ['h1'], 'hideouts share the same vision trigger');

  // Already-discovered / cleared / far lairs are never re-returned — the
  // discovery moment fires exactly once per lair.
  const second = discoverThreatsInVision(hideouts, lairs, squadAt(5, 0), mapData);
  assert.deepEqual(second.lairIds, ['l1'], 'discoverThreatsInVision only reports lairs not yet discovered');
});

test('no squad in sight of a lair means no discovery — distance is the gate', () => {
  const lairs = new Map<string | number, ZombieLair>([['l1', mkLair('l1', 'b_near')]]);
  const hideouts = new Map<string | number, RivalHideout>();

  const outOfRange = discoverThreatsInVision(hideouts, lairs, squadAt(300, 300), mapData);
  assert.deepEqual(outOfRange.lairIds, [], 'a squad beyond 115m does not discover the nest');

  const undepSquad = discoverThreatsInVision(hideouts, lairs, [{ squadId: 'sq1', isDeployed: false, currentHp: 100, x: 5, z: 0 }] as any, mapData);
  assert.deepEqual(undepSquad.lairIds, [], 'an undeployed squad does not scout');

  const deadSquad = discoverThreatsInVision(hideouts, lairs, [{ squadId: 'sq1', isDeployed: true, currentHp: 0, x: 5, z: 0 }] as any, mapData);
  assert.deepEqual(deadSquad.lairIds, [], 'a wiped squad does not scout');
});