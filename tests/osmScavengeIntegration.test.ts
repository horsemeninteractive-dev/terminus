// §28 End-to-end integration: OSM building -> classification -> loot profile
// -> scavenging -> squad inventory -> HQ stockpile deposit.
//
// Drives the REAL authoritative flow: a hospital BuildingPolygon is resolved
// and rolled by the profile layer, loot is attached when its search state is
// created, tickBuildingScavengeProgress hands stacks to the squad inventory
// as the search completes, and unloadSquadAtDropoff lands them in the
// settlement stockpile under their existing section keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState } from '../src/services/settlementService';
import {
  createBuildingSearchState,
  tickBuildingScavengeProgress,
  unloadSquadAtDropoff,
} from '../src/services/scavengingService';
import { resolveBuildingLocation } from '../src/services/osmLocationResolver';
import { getLootProfileForLocation } from '../src/data/lootProfiles';
import type { BuildingPolygon, MapData } from '../src/types/map';
import type { SettlementState } from '../src/types/settlement';
import type { TacticalSquadUnit } from '../src/types/combat';

const HOSPITAL: BuildingPolygon = {
  id: 'b_hospital_1', type: 'hospital', rawType: 'hospital', name: 'St. Mary General',
  height: 18, levels: 4, center: { x: 120, z: 120 },
  polygon: [
    { x: 90, z: 90 }, { x: 150, z: 90 }, { x: 150, z: 150 }, { x: 90, z: 150 },
  ],
  tags: { amenity: 'hospital', building: 'hospital', name: 'St. Mary General' },
};

const HQ_BUILDING: BuildingPolygon = {
  id: 'b_hq_1', type: 'residential', rawType: 'terrace', name: 'HQ House',
  height: 8, levels: 2, center: { x: 0, z: 0 },
  polygon: [{ x: -12, z: -12 }, { x: 12, z: -12 }, { x: 12, z: 12 }, { x: -12, z: 12 }],
  tags: {},
};

/** Reads the stockpile amount under a loot label regardless of its section. */
function stockpileAmount(state: SettlementState, label: string): number {
  const s = state.stockpile as any;
  const section = (
    ['canned_goods', 'dried_rations'].includes(label) ? s.food :
    label === 'bottled_water' ? s.water :
    ['first_aid_kits', 'sterile_bandages', 'antibiotics', 'painkillers'].includes(label) ? s.medical :
    ['gasoline', 'diesel'].includes(label) ? s.fuel :
    label === 'ammunition' ? s.ammo :
    s.materials
  );
  return section?.[label] ?? 0;
}

function makeSquad(squadId: string, b: BuildingPolygon): TacticalSquadUnit {
  return {
    squadId, name: squadId, leaderId: 'L', leaderName: 'L',
    leaderCombatTier: 'veteran', generalCount: 3,
    x: b.center.x, z: b.center.z, y: 0, rotation: 0,
    currentHp: 100, maxHp: 100, attackRange: 8, fireRate: 2, lastFireTime: 0,
    damagePerVolley: 8, critChance: 0.05, moveSpeed: 10,
    state: 'searching', manualOrder: false, targetPos: null, targetZombieId: null,
    isDeployed: true, killCount: 0, isInSafeZone: false, mountedVehicleId: null,
    targetBuildingId: b.id, targetBuildingName: b.name,
    members: [0, 1, 2, 3].map((i) => ({
      id: `m${i}`, name: `m${i}`, isLeader: i === 0, weaponId: 'knife', armorId: null,
      isAlive: true, maxHp: 100, currentHp: 100,
    })),
  } as unknown as TacticalSquadUnit;
}

function seedHQ(state: SettlementState) {
  state.headquarters = [{
    buildingId: HQ_BUILDING.id, buildingName: 'Command HQ', establishedAt: 0,
    footprintAreaM2: 576, levels: 2, center: HQ_BUILDING.center,
    defenseRating: 50, maxCapacity: 40, maxDurability: 800, currentDurability: 800,
  }];
  state.primaryHQId = HQ_BUILDING.id as string;
}

function makeMap(): MapData {
  return {
    center: { lat: 51.5, lon: -0.12 }, radius: 400,
    elevation: {
      minElevation: 10, maxElevation: 30, baseElevation: 20, resolution: 2,
      grid: [[20, 20], [20, 20]], bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
    },
    buildings: [HQ_BUILDING, HOSPITAL], roads: [], landuse: [], resourceNodes: [],
    bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
    stats: {
      buildingCount: 2, roadCount: 0,
      resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 },
      elevationRangeMeters: 20, processedTimeMs: 0,
    },
    fetchedAt: 0, source: 'test',
  };
}

test('integration: hospital OSM building loot reaches the settlement stockpile', () => {
  // 1. Classification layer resolves the raw OSM tags to medical/hospital.
  const location = resolveBuildingLocation(HOSPITAL);
  assert.equal(location.category, 'medical');
  assert.equal(location.subtype, 'hospital');
  assert.ok(location.matchedTags.includes('amenity=hospital'));

  // 2. The hospital profile guarantees medical staples (existing resources).
  const profile = getLootProfileForLocation(location);
  const medicalLabels = ['first_aid_kits', 'sterile_bandages', 'antibiotics', 'painkillers'];
  for (const label of medicalLabels) {
    assert.ok(
      profile.guaranteed.some((e) => e.label === label),
      `hospital must guarantee ${label}`
    );
  }

  // 3. Search-state creation rolls the loot once for the building.
  const search = createBuildingSearchState(HOSPITAL.id, HOSPITAL, 1);
  assert.ok(search.loot.length >= medicalLabels.length, 'rolled loot is attached to the search state');
  const rolledLabels = new Set(search.loot.map((l) => l.label));
  for (const label of medicalLabels) {
    assert.ok(rolledLabels.has(label), `rolled pool contains guaranteed ${label}`);
  }

  // 4. Search completes over time -> loot stacks move into the squad inventory.
  let state = createInitialSettlementState('Integration Colony');
  seedHQ(state);
  state.squadInventories = {};
  state.buildingSearches = new Map([[HOSPITAL.id, createBuildingSearchState(HOSPITAL.id, HOSPITAL, 1)]]);
  let squad = makeSquad('sq_medic', HOSPITAL);

  const duration = state.buildingSearches!.get(HOSPITAL.id)!.totalDurationSec;
  let completed = false;
  for (let t = 1; t <= duration + 2 && !completed; t++) {
    const r = tickBuildingScavengeProgress(state, squad, HOSPITAL, 1, [HQ_BUILDING, HOSPITAL]);
    state = r.newState;
    squad = r.updatedSquad;
    completed = !!r.isCompleted;
  }
  assert.ok(completed, 'search must complete within its duration');
  const inv = state.squadInventories![squad.squadId];
  assert.ok(inv && inv.items.length > 0, 'squad carries the looted stacks');

  // 5. Deposit at the HQ lands every carried resource under its stockpile key.
  const before: Record<string, number> = {};
  for (const item of inv.items) before[item.label] = stockpileAmount(state, item.label);
  const { newState, unloaded } = unloadSquadAtDropoff(
    state, squad.squadId, HQ_BUILDING.center, { x: 0, z: 0, name: 'Command HQ' }
  );
  assert.ok(unloaded.length > 0, 'deposit reports unloaded stacks');
  assert.ok(
    unloaded.every((item) => item.kind === 'resource'),
    'integration loot is stockpile resources (no armory items rolled for a hospital)'
  );
  for (const item of unloaded) {
    assert.ok(
      stockpileAmount(newState, item.label) > (before[item.label] ?? 0),
      `deposit increased ${item.label} (${before[item.label] ?? 0} -> ${stockpileAmount(newState, item.label)})`
    );
  }
  assert.equal(newState.squadInventories![squad.squadId]?.items.length, 0, 'backpack emptied after deposit');
});
