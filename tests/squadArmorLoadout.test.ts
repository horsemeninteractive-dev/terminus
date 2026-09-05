import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncTacticalSquadUnits } from '../src/services/combatService';
import { createSquad } from '../src/services/populationService';
import { createInitialSettlementState, establishSettlementHQ } from '../src/services/settlementService';
import type { BuildingPolygon } from '../src/types/map';

function makeHqBuilding(): BuildingPolygon {
  return {
    id: 'b_hq',
    type: 'residential',
    rawType: 'residential',
    name: 'Command House',
    height: 8,
    levels: 2,
    polygon: [
      { x: -8, z: -8 },
      { x: 8, z: -8 },
      { x: 8, z: 8 },
      { x: -8, z: 8 },
    ],
    center: { x: 0, z: 0 },
  } as unknown as BuildingPolygon;
}

function makeHqSettlement() {
  const state = establishSettlementHQ(createInitialSettlementState('Armor Test'), makeHqBuilding());
  state.namedSurvivors = [
    { id: 'n1', name: 'Ada', stats: {}, role: { type: 'unassigned' } } as any,
  ];
  state.generalPopulation.total = 4;
  state.armory = { weapons: ['pistol', 'pistol', 'pistol', 'pistol'], armor: [] };
  return state;
}

test('createSquad with an armor loadout pulls one piece per member from the armory', () => {
  const state = makeHqSettlement();
  // 2 people squad (1 leader + 1 general) — needs 2 riot vests.
  state.armory!.armor = ['riot_vest', 'riot_vest', 'riot_vest'];
  const r = createSquad(state, 'Alpha', 'n1', 1, 'pistol', 'riot_vest');
  assert.equal(r.success, true, r.error);
  const squad = r.newState.squads[0];
  assert.equal(squad.armorLoadout, 'riot_vest');
  assert.equal(squad.weaponLoadout, 'pistol');
  assert.deepEqual(r.newState.armory!.armor, ['riot_vest'], 'exactly 2 vests deducted');
  assert.deepEqual(r.newState.armory!.weapons, ['pistol', 'pistol'], '2 pistols deducted');
});

test('createSquad rejects an armor loadout the armory cannot supply', () => {
  const state = makeHqSettlement();
  // 2 people squad but only 1 vest in stock.
  state.armory!.armor = ['tactical_gear'];
  const r = createSquad(state, 'Alpha', 'n1', 1, 'knife', 'tactical_gear');
  assert.equal(r.success, false);
  assert.match(r.error || '', /tactical gear/i);
  // No squad created and nothing deducted.
  assert.equal(r.newState.squads.length, 0);
  assert.deepEqual(r.newState.armory!.armor, ['tactical_gear']);
});

test("'none' armor loadout issues no gear and stores armorLoadout on the squad", () => {
  const state = makeHqSettlement();
  const r = createSquad(state, 'Alpha', 'n1', 1, 'knife', 'none');
  assert.equal(r.success, true, r.error);
  assert.equal(r.newState.squads[0].armorLoadout, 'none');
  assert.equal((r.newState.armory!.armor || []).length, 0);
});

test('syncTacticalSquadUnits stamps the chosen armorId on every member', () => {
  const state = makeHqSettlement();
  state.armory!.armor = ['padded_jacket', 'padded_jacket', 'padded_jacket'];
  const r = createSquad(state, 'Alpha', 'n1', 1, 'knife', 'padded_jacket');
  assert.equal(r.success, true, r.error);

  const units = syncTacticalSquadUnits(r.newState, []);
  assert.equal(units.length, 1);
  const unit = units[0];
  assert.equal(unit.members.length, 2, 'leader + 1 general');
  for (const m of unit.members) {
    assert.equal(m.armorId, 'padded_jacket');
  }
});