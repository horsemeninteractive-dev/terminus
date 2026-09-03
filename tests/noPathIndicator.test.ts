import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PathGrid } from '../src/services/pathfindingService';
import { tickCombatSimulation, orderSquadMove } from '../src/services/combatService';
import type { MapData } from '../src/types/map';
import type { TacticalSquadUnit } from '../src/types/combat';

function makeMap(bounds?: { minX: number; maxX: number; minZ: number; maxZ: number }): MapData {
  const b = bounds || { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
  return {
    cityName: 'T',
    bounds: b,
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'S', country: 'X' },
    buildings: [
      {
        id: 'b_target',
        type: 'warehouse',
        rawType: 'warehouse',
        name: 'Sealed Warehouse',
        height: 6,
        levels: 1,
        center: { x: 20, z: 0 },
        polygon: [
          { x: 15, z: -5 },
          { x: 25, z: -5 },
          { x: 25, z: 5 },
          { x: 15, z: 5 },
        ],
        tags: {},
      } as any,
    ],
    roads: [],
    landuse: [],
    resourceNodes: [],
    stats: {
      buildingCount: 0,
      roadCount: 0,
      resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 },
      elevationRangeMeters: 20,
      processedTimeMs: 0,
    },
    fetchedAt: 0,
    source: 'test',
  } as unknown as MapData;
}

/** A palisade long enough to seal a small map top-to-bottom: its run length
 *  spans the full z-range, so A* cannot route around its ends (they lie
 *  outside the map bounds). Mirrors the proven barbed-wire test fixture. */
const fullWall = {
  typeId: 'wooden_palisade',
  position: { x: 10, z: 0 },
  rotationDeg: 0,
  length: 200,
} as any;

function mkSquad(overrides: Partial<TacticalSquadUnit> = {}): TacticalSquadUnit {
  const base: TacticalSquadUnit = {
    squadId: 'sq_1',
    name: 'Scav Team',
    leaderId: 'ns_1',
    leaderName: 'Field Leader',
    leaderCombatTier: 'novice',
    generalCount: 3,
    x: -20,
    z: 0,
    y: 0,
    rotation: 0,
    currentHp: 100,
    maxHp: 100,
    attackRange: 15,
    fireRate: 0.8,
    lastFireTime: 0,
    damagePerVolley: 10,
    critChance: 0.1,
    moveSpeed: 1.5,
    state: 'moving',
    manualOrder: true,
    targetPos: { x: 20, z: 0 },
    targetBuildingId: 'b_target',
    targetBuildingName: 'Sealed Warehouse',
    targetZombieId: null,
    isDeployed: true,
    killCount: 0,
    isInSafeZone: false,
    members: [
      { id: 'm1', survivorId: 'ns_1', name: 'Leader', isLeader: true, isAlive: true, currentHp: 100, maxHp: 100, weaponId: 'pistol', armorId: null, faceUrl: '' },
      { id: 'm2', survivorId: 'ns_2', name: 'Recruit', isLeader: false, isAlive: true, currentHp: 100, maxHp: 100, weaponId: 'knife', armorId: null, faceUrl: '' },
      { id: 'm3', survivorId: 'ns_3', name: 'Recruit', isLeader: false, isAlive: true, currentHp: 100, maxHp: 100, weaponId: 'knife', armorId: null, faceUrl: '' },
      { id: 'm4', survivorId: 'ns_4', name: 'Recruit', isLeader: false, isAlive: true, currentHp: 100, maxHp: 100, weaponId: 'knife', armorId: null, faceUrl: '' },
    ],
    inventory: [],
    currentWeightKg: 0,
    maxWeightKg: 40,
  };
  return { ...base, ...overrides } as unknown as TacticalSquadUnit;
}

const clock = {
  totalElapsedSeconds: 0,
  speed: 1,
  isNight: true,
  day: 1,
  phase: 'night',
  hours: 22,
  minutes: 0,
} as any;

test('a squad ordered to a walled-off building is flagged with noPath', () => {
  // Small sealed map: the wall runs the full height between the squad and the
  // warehouse, so A* can prove the building is unreachable.
  const grid = new PathGrid(makeMap({ minX: -40, maxX: 40, minZ: -40, maxZ: 40 }));
  grid.setFreestandingObstacles([fullWall]);
  // Squads path with wallsImpassable (gates stay open) — the same options the
  // sim passes to stepAlongPath — so a sealed perimeter must yield no route.
  assert.equal(
    grid.findPath(-20, 0, 20, 0, { wallsImpassable: true }),
    null,
    'precondition: no route to the warehouse'
  );

  const squad = mkSquad();
  const res = tickCombatSimulation(
    [],
    [squad],
    new Map(),
    [],
    clock,
    null,
    1,
    undefined,
    [],
    [],
    grid,
    false
  );

  const updated = res.updatedSquads[0];
  assert.ok(updated.noPath, 'the squad must be flagged as having no path');
  assert.equal(updated.noPath!.buildingId, 'b_target', 'the icon anchors to the ordered building');
  assert.deepEqual(
    { x: updated.noPath!.x, z: updated.noPath!.z },
    { x: 20, z: 0 },
    'the flag records the unreachable target position'
  );
  assert.ok(updated.noPath!.since > 0);
});

test('a reachable target never sets noPath, and a fresh order clears it', () => {
  const openGrid = new PathGrid(makeMap());
  const squad = mkSquad();
  const res = tickCombatSimulation(
    [],
    [squad],
    new Map(),
    [],
    clock,
    null,
    1,
    undefined,
    [],
    [],
    openGrid,
    false
  );
  assert.equal(res.updatedSquads[0].noPath, undefined, 'clear line of sight stays clean');

  // Recreate the blocked state, then issue a fresh order → indicator cleared.
  const wallGrid = new PathGrid(makeMap({ minX: -40, maxX: 40, minZ: -40, maxZ: 40 }));
  wallGrid.setFreestandingObstacles([fullWall]);
  const blockedSquad = mkSquad({ noPath: { buildingId: 'b_target', x: 20, z: 0, since: Date.now() } });
  const blocked = tickCombatSimulation([], [blockedSquad], new Map(), [], clock, null, 1, undefined, [], [], wallGrid, false);
  assert.ok(blocked.updatedSquads[0].noPath, 'still blocked on the same order');

  const reordered = orderSquadMove([blocked.updatedSquads[0]], 'sq_1', { x: 0, z: 40 }, null, 'Open Field');
  assert.equal(reordered[0].noPath, undefined, 'a fresh player order clears the no-path indicator');
});