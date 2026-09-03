import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialSettlementState,
  establishSettlementHQ,
  buildFreestanding,
} from '../src/services/settlementService';
import { repairBuilding } from '../src/services/combatService';
import { tickSettlementSimulation } from '../src/services/populationService';
import type { SettlementState, AdaptedBuilding } from '../src/types/settlement';
import type { BuildingPolygon } from '../src/types/map';

function makeHq(): BuildingPolygon {
  return {
    id: 'b_hq_repair_test',
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

function placeFreestanding(state: SettlementState, typeId: string, x: number, z: number): SettlementState {
  const r = buildFreestanding(state, typeId as never, { x, z }, 8, 8, 4.5, 0);
  if (!r.success) throw new Error(`place ${typeId} failed: ${r.error}`);
  return r.newState;
}

test('manual repair tick restores a damaged freestanding watchtower to full durability', () => {
  let state = createInitialSettlementState('Freestanding Repair Test');
  state = establishSettlementHQ(state, makeHq());
  state = placeFreestanding(state, 'wooden_tower', 20, 0);

  const tower = state.freestandingBuildings[0] as AdaptedBuilding;
  const buildingId = tower.buildingId;

  // The watchtower took hits: down to half durability.
  state = {
    ...state,
    freestandingBuildings: [
      { ...tower, currentDurability: Math.round(tower.maxDurability / 2) },
    ],
  } as unknown as SettlementState;

  // Player hits Repair → repair order state is created for the freestanding site.
  const started = repairBuilding(state, buildingId);
  assert.ok(started.success, started.error || 'repair should start');
  const repairing = started.newState.freestandingBuildings[0] as AdaptedBuilding;
  assert.equal(repairing.isUnderRepair, true, 'freestanding building enters repair state');
  assert.ok((repairing.repairWorkRequired || 0) > 0);
  assert.equal(started.newState.stockpile.materials.wood < state.stockpile.materials.wood, true, 'repair materials deducted');

  // Assign builders, then run the manual repair loop — this is the regression:
  // the loop previously only advanced state.adaptedBuildings, so the tower's
  // repair sat at 0% forever while the button's materials were already spent.
  const withWorkers = {
    ...started.newState,
    freestandingBuildings: [{ ...repairing, assignedWorkers: 2 }],
  } as unknown as SettlementState;

  const day = tickSettlementSimulation(withWorkers, 600, null, false);
  const after = day.newState.freestandingBuildings[0] as AdaptedBuilding;
  assert.equal(after.currentDurability, after.maxDurability, 'durability fully restored');
  assert.equal(after.isUnderRepair, false, 'repair flag cleared on completion');
  assert.equal(after.repairProgress, 100);

  // Night holds the repair — no progress without day shift. Uses a FRESH
  // pre-tick snapshot: the day tick mutates the shared building object in
  // place, so reusing `withWorkers` would already show it completed.
  const nightState = {
    ...started.newState,
    freestandingBuildings: [{ ...repairing, assignedWorkers: 2 }],
  } as unknown as SettlementState;
  const night = tickSettlementSimulation(nightState, 600, null, true);
  const afterNight = night.newState.freestandingBuildings[0] as AdaptedBuilding;
  assert.equal(afterNight.repairProgress, 0, 'no repair progress overnight');
  assert.equal(afterNight.isUnderRepair, true, 'repair stays active through the night');
});

test('manual repair also works for adapted buildings (no regression)', () => {
  const state = createInitialSettlementState('Adapted Repair Test') as unknown as SettlementState;
  const warehouse: AdaptedBuilding = {
    buildingId: 'b_adapted_1',
    typeId: 'warehouse',
    isHQ: false,
    name: 'Adapted Warehouse',
    category: 'basic',
    adaptedAt: 0,
    footprintAreaM2: 300,
    adaptedAreaM2: 300,
    adaptationPercentage: 100,
    totalFloorAreaM2: 600,
    volumeM3: 1800,
    maxCapacity: 100,
    currentUsage: 0,
    capacityUnit: 'units',
    maxDurability: 800,
    currentDurability: 400,
    defenseRating: 40,
    isFreestanding: false,
    position: { x: 0, z: 0 },
    height: 6,
    levels: 2,
    constructionStatus: 'completed',
    constructionProgress: 100,
    constructionWorkRequired: 100,
    constructionWorkDone: 100,
    assignedWorkers: 2,
    polygon: [],
  };
  const state2 = {
    ...state,
    adaptedBuildings: new Map([['b_adapted_1', warehouse]]),
  } as unknown as SettlementState;

  const started = repairBuilding(state2, 'b_adapted_1');
  assert.ok(started.success, started.error || 'repair should start');
  const ticked = tickSettlementSimulation(started.newState, 600, null, false);
  const after = ticked.newState.adaptedBuildings.get('b_adapted_1')!;
  assert.equal(after.currentDurability, after.maxDurability, 'adapted building still repaired by the loop');
  assert.equal(after.isUnderRepair, false);
});