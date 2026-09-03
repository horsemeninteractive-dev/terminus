import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState } from '../src/services/settlementService';
import { tickResourceGathering } from '../src/services/resourceGatheringService';
import {
  depositWithinCapacity,
  countStockpileUnits,
  getStockpileUnits,
} from '../src/services/stockpileCapacity';
import type { SettlementState, SettlementStockpile } from '../src/types/settlement';
import type { MapData } from '../src/types/map';
import type { ResourceWorkOrder } from '../src/types/resourceGathering';

function makeMap(nodes: MapData['resourceNodes']): MapData {
  return {
    cityName: 'T', bounds: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 },
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'S', country: 'X' },
    buildings: [], roads: [], landuse: [], resourceNodes: nodes,
    stats: {
      buildingCount: 0, roadCount: 0,
      resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 },
      elevationRangeMeters: 20, processedTimeMs: 0,
    },
    fetchedAt: 0, source: 'test',
  } as unknown as MapData;
}

test('depositWithinCapacity never exceeds the ceiling and returns overflow', () => {
  const base: SettlementStockpile = {
    food: { canned_goods: 0, mre_rations: 0, dried_rations: 0, fresh_harvest: 0 },
    water: { bottled_water: 0, purified_water: 0, rainwater: 0 },
    medical: { first_aid_kits: 0, sterile_bandages: 0, antibiotics: 0, painkillers: 0 },
    fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
    ammo: { sharedPool: 95 },
    materials: { wood: 0, metal: 0, bricks: 0, tools: 0 },
  };

  const { stockpile, deposited, overflow } = depositWithinCapacity(
    structuredClone(base),
    100, // only 5 units free
    { food: { canned_goods: 3 }, materials: { wood: 12, metal: 2 } }
  );

  assert.equal(stockpile.ammo.sharedPool, 95, 'existing stock untouched by overflow math');
  // Field order: food first, then materials. 5 free units → canned 3 + wood 2.
  assert.equal(stockpile.food.canned_goods, 3, 'all canned goods fit');
  assert.equal(stockpile.materials.wood, 2, 'only 2 of 12 wood fit');
  assert.equal(stockpile.materials.metal, 0, 'metal entirely refused');
  assert.equal(getStockpileUnits(stockpile), 100, 'stockpile never exceeds the ceiling');

  assert.equal(countStockpileUnits(deposited), 5);
  assert.equal(countStockpileUnits(overflow), 12, 'overflow carries the 10 wood + 2 metal');
  assert.equal(overflow.materials?.wood, 10);
  assert.equal(overflow.materials?.metal, 2);

  // A second deposit into the (now full) stockpile deposits nothing at all.
  const second = depositWithinCapacity(stockpile, 100, { materials: { wood: 7 } });
  assert.equal(second.deposited.materials?.wood, undefined, 'no room — nothing deposited');
  assert.equal(second.overflow.materials?.wood, 7);
});

test('resource gatherers strand the surplus as field loot when storage is full', () => {
  const stateBase = createInitialSettlementState('Gather Cap');
  const hq = {
    buildingId: 'hq_1', buildingName: 'HQ', establishedAt: 0,
    footprintAreaM2: 100, levels: 1, center: { x: 0, z: 0 },
    defenseRating: 5, maxCapacity: 10, maxDurability: 800, currentDurability: 800,
  };
  const node = {
    id: 'node_wood_1', type: 'wood' as const, subType: 'tree' as const,
    position: { x: 60, z: 60 }, rotation: 0, scale: 1,
    source: 'park_scatter' as const, amount: 40, maxAmount: 40, isDepleted: false,
  };
  const order: ResourceWorkOrder = {
    id: 'work_1', nodeId: node.id, resourceType: 'wood',
    workerCount: 2, state: 'returning', position: { x: 0, z: 0 },
    carried: 20, createdAt: 0,
  };
  const state: SettlementState = {
    ...stateBase,
    headquarters: [hq],
    primaryHQId: 'hq_1',
    // Storage is 100 units; ammo fills 95 (everything else is zeroed), so
    // exactly 5 wood of the 20 carried can fit.
    totalStorageCapacity: 100,
    stockpile: {
      food: { canned_goods: 0, mre_rations: 0, dried_rations: 0, fresh_harvest: 0 },
      water: { bottled_water: 0, purified_water: 0, rainwater: 0 },
      medical: { first_aid_kits: 0, sterile_bandages: 0, antibiotics: 0, painkillers: 0 },
      fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
      ammo: { sharedPool: 95 },
      materials: { wood: 0, metal: 0, bricks: 0, tools: 0 },
    },
    resourceWorkOrders: [order],
  } as unknown as SettlementState;
  const map = makeMap([{ ...node }]);

  // Tick 1: only 5 of the 20 carried wood can be deposited; the remaining 15
  // is stranded at the worksite (node position) as recoverable field loot.
  const r1 = tickResourceGathering(state, map, 1, false, false);
  assert.equal(r1.newState.stockpile.materials.wood, 5, 'deposit respects the ceiling');
  assert.equal(getStockpileUnits(r1.newState.stockpile), 100, 'storage never exceeds 100');
  const o1 = r1.newState.resourceWorkOrders[0];
  assert.equal(o1.carried, 0, 'the crew does not keep carrying the surplus');
  assert.equal(o1.depositBlocked, true, 'flagged as blocked so the warning counts once');
  assert.equal(o1.state, 'moving_to_node', 'crew is free to keep gathering');
  assert.equal(r1.newState.overflowLootUnits, 15, 'overflow warning reports the un-stored units');
  assert.equal((r1.newState.fieldLootPiles || []).length, 1, 'one stranded pile exists');
  const pile = r1.newState.fieldLootPiles![0];
  assert.deepEqual(
    { x: Math.round(pile.position.x), z: Math.round(pile.position.z) },
    { x: 60, z: 60 },
    'pile sits at the gather worksite, not the depot'
  );
  assert.equal(pile.wood, 15, 'pile holds exactly the refused wood');

  // Tick 2 with storage still full: nothing more deposits and the warning
  // counter does NOT grow each tick (the crew hasn't harvested a new load yet).
  const r2 = tickResourceGathering(r1.newState, r1.mapData, 1, false, false);
  assert.equal(r2.newState.stockpile.materials.wood, 5, 'still full — no further deposit');
  assert.equal(r2.newState.overflowLootUnits, 15, 'blocked episode counted exactly once');
  assert.equal((r2.newState.fieldLootPiles || [])[0]?.wood, 15, 'pile unchanged while no new surplus is carried');

  // Tick 3 after space opens: the crew deposits fresh harvest normally once it
  // reaches the node; the already-stranded pile stays as recoverable loot.
  const freed = {
    ...r2.newState,
    stockpile: {
      ...r2.newState.stockpile,
      ammo: { ...r2.newState.stockpile.ammo, sharedPool: 55 }, // frees 40 units
    },
  };
  const r3 = tickResourceGathering(freed, r2.mapData, 1, false, false);
  assert.equal(r3.newState.fieldLootPiles![0].wood, 15, 'stranded pile is not auto-absorbed');
  assert.equal(r3.newState.overflowLootUnits, 15, 'counter is cumulative, not decremented');
});
