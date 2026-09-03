import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PathGrid } from '../src/services/pathfindingService';
import { getCanonicalDefenseDef } from '../src/data/functionalBuildings';
import { tickCombatSimulation, createZombieUnit } from '../src/services/combatService';
import type { MapData } from '../src/types/map';

function makeMap(bounds?: { minX: number; maxX: number; minZ: number; maxZ: number }): MapData {
  const b = bounds || { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
  return {
    cityName: 'T',
    bounds: b,
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'S', country: 'X' },
    buildings: [], roads: [], landuse: [], resourceNodes: [],
    stats: {
      buildingCount: 0, roadCount: 0,
      resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 },
      elevationRangeMeters: 20, processedTimeMs: 0,
    },
    fetchedAt: 0, source: 'test',
  } as unknown as MapData;
}

/** A palisade long enough to span an entire small map (sealed perimeter). */
const fullWall = {
  typeId: 'wooden_palisade', position: { x: 0, z: 0 }, rotationDeg: 0, length: 400,
} as any;

const wire = { typeId: 'barbed_wire' as const, position: { x: 0, z: 0 }, rotationDeg: 0 };

test('barbed wire is a passable hazard: not an obstacle, but slows and bleeds infected', () => {
  const grid = new PathGrid(makeMap());
  grid.setFreestandingObstacles([wire]);

  // NOT a hard obstacle — squads and pathing pass straight through.
  assert.equal(grid.isInsideBuilding(0, 0), false, 'wire is not a hard obstacle cell');
  assert.equal(grid.isFreestandingBlocked(0, 0), false, 'wire never blocks cached paths');

  // It IS a hazard with the def's explicit values.
  const hazard = grid.getHazardAt(0, 0);
  assert.ok(hazard, 'wire cells expose hazard data');
  assert.equal(hazard!.slowPct, 60, 'wire slows infected by 60%');
  assert.equal(hazard!.damagePerSec, 15, 'wire bleeds 15 HP/sec');

  // Both friendlies AND hostiles (wallsImpassable) can path across the wire.
  const friendlyPath = grid.findPath(-20, 0, 20, 0);
  assert.ok(friendlyPath && friendlyPath.length > 0, 'friendly path crosses the wire freely');
  const hostilePath = grid.findPath(-20, 0, 20, 0, { gatesOpen: false, wallsImpassable: true });
  assert.ok(hostilePath && hostilePath.length > 0, 'infected path THROUGH the wire, not around/blocked');
});

test('a hard wall still blocks infected entirely (three-concept contrast)', () => {
  // Small map sealed top-to-bottom by a full-length palisade wall.
  const grid = new PathGrid(makeMap({ minX: -30, maxX: 30, minZ: -30, maxZ: 30 }));
  grid.setFreestandingObstacles([fullWall]);

  assert.equal(grid.isInsideBuilding(0, 0), true, 'palisade is a hard obstacle');
  assert.equal(grid.getHazardAt(0, 0), null, 'palisade is not a hazard');
  const hostilePath = grid.findPath(-10, 0, 10, 0, { gatesOpen: false, wallsImpassable: true });
  assert.equal(hostilePath, null, 'infected cannot path through a sealed wall line');

  // Same sealed map with a wire run instead: infected path straight through.
  const wireGrid = new PathGrid(makeMap({ minX: -30, maxX: 30, minZ: -30, maxZ: 30 }));
  wireGrid.setFreestandingObstacles([{ typeId: 'barbed_wire', position: { x: 0, z: 0 }, rotationDeg: 0, length: 400 } as any]);
  assert.equal(wireGrid.isInsideBuilding(0, 0), false, 'wire line is not an obstacle');
  const wirePath = wireGrid.findPath(-10, 0, 10, 0, { gatesOpen: false, wallsImpassable: true });
  assert.ok(wirePath && wirePath.length > 0, 'infected path straight through a wire line');
});

test('infected crossing wire are slowed and take contact bleed damage', () => {
  const grid = new PathGrid(makeMap());
  grid.setFreestandingObstacles([wire]);

  const clock = {
    totalElapsedSeconds: 0, speed: 1, isNight: true, day: 1,
    phase: 'night', hours: 22, minutes: 0,
  } as any;

  // Wire zombie starts ON the wire (0,0) chasing a point 20m east.
  const wireZombie = createZombieUnit('shambler', 0, 0, 0, true);
  wireZombie.maxHp = 100;
  wireZombie.currentHp = 100;
  wireZombie.state = 'chasing';
  wireZombie.targetPos = { x: 20, z: 0 };

  // Control zombie on open ground 50m south, same target distance/shape.
  const controlZombie = createZombieUnit('shambler', 0, 50, 0, true);
  controlZombie.maxHp = 100;
  controlZombie.currentHp = 100;
  controlZombie.state = 'chasing';
  controlZombie.targetPos = { x: 20, z: 50 };

  const res = tickCombatSimulation(
    [wireZombie, controlZombie],
    [],
    new Map(),
    [],
    clock,
    null,
    1, // 1 in-game second
    undefined,
    [],
    [],
    grid,
    false
  );

  const byVariant = new Map(res.updatedZombies.map((z: any) => [z.id, z]));
  const movedWire = byVariant.get(wireZombie.id);
  const movedControl = byVariant.get(controlZombie.id);
  assert.ok(movedWire, 'wire zombie ticked');
  assert.ok(movedControl, 'control zombie ticked');

  // Contact bleed: ~15 HP lost while standing on the wire during the tick.
  assert.ok(
    movedWire.currentHp <= 100 - 14 && movedWire.currentHp >= 100 - 16,
    `wire zombie bleeds ~15 HP/sec (got ${movedWire.currentHp})`
  );
  assert.equal(movedControl.currentHp, 100, 'open-ground zombie takes no wire damage');

  // Movement slow: the wire zombie (0.4x speed on the wire) travels far less
  // than the control in the same second.
  assert.ok(movedControl.x > 1.5, `control advanced unimpeded (x=${movedControl.x.toFixed(2)})`);
  assert.ok(
    movedWire.x < movedControl.x * 0.55,
    `wire zombie is slowed by ~60% (wire x=${movedWire.x.toFixed(2)}, control x=${movedControl.x.toFixed(2)})`
  );
  assert.ok(movedWire.x > 0.3, 'the slowed zombie is still making forward progress through the wire');
});

test('wire is traversable while a walled perimeter still blocks (def-level contrast)', () => {
  const wireDef = getCanonicalDefenseDef('barbed_wire')!;
  const wallDef = getCanonicalDefenseDef('brick_wall')!;
  assert.equal(wireDef.blocksMovement, false, 'wire def does not block');
  assert.equal(wallDef.blocksMovement, true, 'wall def blocks');
  assert.equal(wireDef.slowsInfectedPct, 60, 'wire def slows 60%');
  assert.equal(wireDef.damageOnContact, 15, 'wire def damages 15');
  assert.equal(wallDef.slowsInfectedPct, undefined, 'wall has no slow stat');
});
