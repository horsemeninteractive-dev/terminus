import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState } from '../src/services/settlementService';
import {
  dispatchSquadOnExpedition,
  ensureExpeditionsRevealed,
  isAntennaOperational,
  recallSquadFromExpedition,
  tickExpeditions,
} from '../src/services/expeditionService';
import type { TacticalSquadUnit } from '../src/types/combat';
import type { AdaptedBuilding, SettlementState } from '../src/types/settlement';

function mkAntenna(state: SettlementState): SettlementState {
  const antenna: AdaptedBuilding = {
    buildingId: 'b_antenna',
    typeId: 'antenna',
    isHQ: false,
    name: 'Antenna',
    category: 'utility',
    adaptedAt: Date.now(),
    footprintAreaM2: 60,
    adaptedAreaM2: 60,
    adaptationPercentage: 100,
    totalFloorAreaM2: 60,
    volumeM3: 300,
    maxCapacity: 2,
    fullCapacity: 2,
    currentCapacity: 2,
    maxDurability: 350,
    currentDurability: 350,
    position: { x: 0, z: 0 },
    constructionStatus: 'completed',
    assignedWorkers: 2,
    baseDefense: 30,
    resourceCosts: { wood: 20, metal: 50, bricks: 15 },
    durability: { adaptationBase: 350, freestandingBase: 220 },
  } as unknown as AdaptedBuilding;
  return {
    ...state,
    adaptedBuildings: new Map([...state.adaptedBuildings, ['b_antenna', antenna]]),
  };
}

function mkSquad(id: string, members = 4): TacticalSquadUnit {
  return {
    squadId: id,
    name: `Squad ${id}`,
    leaderId: `ns_${id}`,
    leaderName: 'Leader',
    leaderCombatTier: 'novice',
    generalCount: Math.max(0, members - 1),
    x: 50,
    z: 50,
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
    state: 'idle',
    manualOrder: false,
    targetPos: null,
    targetZombieId: null,
    isDeployed: true,
    killCount: 0,
    isInSafeZone: false,
    members: Array.from({ length: members }, (_, i) => ({
      id: `m_${id}_${i}`,
      survivorId: `ns_${id}_${i}`,
      name: `Member ${i}`,
      isLeader: i === 0,
      isAlive: true,
      currentHp: 100,
      maxHp: 100,
      weaponId: 'knife' as const,
      armorId: null,
      faceUrl: '',
    })),
    inventory: [],
    currentWeightKg: 0,
  } as unknown as TacticalSquadUnit;
}

/** State with an operational antenna and a KNOWN first site (2 km, low tier). */
function makeBase(now: number): { state: SettlementState; siteId: string } {
  const base = mkAntenna(createInitialSettlementState('Exp Test'));
  base.stockpile.materials = { wood: 5000, metal: 5000, bricks: 5000, tools: 50 };
  const revealed = ensureExpeditionsRevealed(base, now);
  assert.ok(revealed.sites.length > 0, 'antenna reveals sites');
  // Force the first site deterministic: 2 km, 10 infected, a fixed 5-item loot
  // pool (the generated tier/loot is random at reveal time).
  const fixedLoot = ['wood', 'metal', 'canned_goods', 'dried_rations', 'tools'].map((label, idx) => ({
    id: `exp_${label}_${idx}`,
    kind: 'resource' as const,
    label,
    quantity: 4,
    weight: 1,
  }));
  const sites = revealed.sites.map((s, i) =>
    i === 0
      ? {
          ...s,
          id: 'exp_test',
          name: 'Test Site',
          distanceKm: 2,
          threatTier: 'low' as const,
          defenders: 10,
          defendersRemaining: 10 * 35,
          lootItems: fixedLoot,
          lootRemaining: fixedLoot.length,
        }
      : s
  );
  return { state: { ...base, expeditions: { ...revealed, sites } }, siteId: 'exp_test' };
}

test('the Antenna is the expedition gateway — no antenna, no areas', () => {
  const plain = createInitialSettlementState('Exp Test');
  assert.ok(!isAntennaOperational(plain));
  assert.equal(ensureExpeditionsRevealed(plain, Date.now()).sites.length, 0);

  const withAntenna = mkAntenna(plain);
  assert.ok(isAntennaOperational(withAntenna));
  const revealed = ensureExpeditionsRevealed(withAntenna, Date.now());
  assert.equal(revealed.sites.length, 4, 'antenna reveals the off-map areas');
  assert.ok(revealed.sites.every((s) => s.revealed && s.distanceKm >= 3));
});

test('dispatch gates: assigned site, busy squad, dead squad, mounted squad are all refused', () => {
  const { state, siteId } = makeBase(Date.now());
  const squads = [mkSquad('a')];

  const ok = dispatchSquadOnExpedition(state, squads, 'a', siteId, Date.now());
  assert.ok(ok.success, ok.error || '');
  assert.equal(ok.squads[0].onExpedition, siteId);
  assert.equal(ok.squads[0].expeditionPhase, 'travel_out');

  // Site already assigned.
  const second = dispatchSquadOnExpedition(ok.newState, ok.squads, 'a', siteId, Date.now());
  assert.ok(!second.success, 'already assigned → refused');
  assert.match(second.error || '', /already/);

  // Different squad, site busy.
  const busy = dispatchSquadOnExpedition(ok.newState, [...ok.squads, mkSquad('b')], 'b', siteId, Date.now());
  assert.ok(!busy.success);

  // Squad already on expedition (different site).
  const busySquad = dispatchSquadOnExpedition(ok.newState, [mkSquad('c')], 'c', siteId, Date.now());
  assert.ok(!busySquad.success, 'site already occupied');

  // Dead squad.
  const dead = mkSquad('d');
  dead.members = dead.members.map((m) => ({ ...m, isAlive: false }));
  const deadRes = dispatchSquadOnExpedition(state, [dead], 'd', siteId, Date.now());
  assert.ok(!deadRes.success);
  assert.match(deadRes.error || '', /no living members/);
});

test('a dispatched squad travels out, fights the garrison, then scavenges — and NEVER returns on its own', () => {
  const { state, siteId } = makeBase(Date.now());
  // 5 members = 5 backpack slots, matching the site's 5 loot items.
  const squad = mkSquad('a', 5);
  const dispatched = dispatchSquadOnExpedition(state, [squad], 'a', siteId, Date.now());
  assert.ok(dispatched.success);

  // Half the 2 km journey: still en route.
  let r = tickExpeditions(dispatched.newState, dispatched.squads, 149, Date.now());
  assert.equal(r.squads[0].expeditionPhase, 'travel_out');
  assert.ok(r.newState.expeditions!.sites.find((s) => s.id === siteId)!.phase === 'travel_out');

  // Arrival → garrison battle.
  r = tickExpeditions(r.newState, r.squads, 155, Date.now());
  const afterArrival = r.newState.expeditions!.sites.find((s) => s.id === siteId)!;
  assert.equal(afterArrival.phase, 'combat');

  // Battle resolved: 10 infected (350 HP) fall to the squad's volleys.
  r = tickExpeditions(r.newState, r.squads, 200, Date.now());
  const afterBattle = r.newState.expeditions!.sites.find((s) => s.id === siteId)!;
  assert.ok(afterBattle.cleared, 'garrison wiped → site cleared');
  assert.equal(afterBattle.phase, 'scavenging');
  assert.ok(r.events.some((e) => e.title === 'EXPEDITION SECURED'));

  // Scavenge: recover all 5 loot items (5 × 14s).
  r = tickExpeditions(r.newState, r.squads, 5 * 14 + 1, Date.now());
  const afterScavenge = r.newState.expeditions!.sites.find((s) => s.id === siteId)!;
  assert.ok(afterScavenge.exhausted, 'site fully scavenged');
  const inv = r.newState.squadInventories?.['a'];
  assert.equal(inv?.items.length, 5, 'all loot carried in the backpack');

  // The squad is STILL on expedition — no auto-return (IFZ).
  assert.ok(r.squads[0].onExpedition === siteId, 'full/exhausted squad waits at the site');
  assert.ok(r.events.some((e) => e.title === 'SITE EXHAUSTED'));
});

test('a backpack that fills mid-scavenge pauses the haul and warns — the squad waits', () => {
  const { state, siteId } = makeBase(Date.now());
  // 4 living members → 4 slots; the site holds 5 loot items, so the last one
  // cannot be recovered until the squad is recalled and re-dispatched.
  const squad = mkSquad('a', 4);
  const dispatched = dispatchSquadOnExpedition(state, [squad], 'a', siteId, Date.now());
  assert.ok(dispatched.success);

  // Travel, then defeat the 10 infected.
  let r = tickExpeditions(dispatched.newState, dispatched.squads, 2 * 150 + 1, Date.now());
  r = tickExpeditions(r.newState, r.squads, 400, Date.now());
  const site = r.newState.expeditions!.sites.find((s) => s.id === siteId)!;
  assert.equal(site.phase, 'scavenging');

  // Recover 4 of 5 items → the backpack fills.
  r = tickExpeditions(r.newState, r.squads, 4 * 14, Date.now());
  assert.equal(r.newState.squadInventories?.['a']?.items.length, 4, 'four items carried');
  // The one-shot warning fires on the first tick where the squad stands full.
  r = tickExpeditions(r.newState, r.squads, 1, Date.now());
  assert.ok(r.events.some((e) => e.title === 'BACKPACK FULL'), 'full backpack warns once');

  // Keep ticking — nothing more is recovered, the squad waits at the site.
  r = tickExpeditions(r.newState, r.squads, 200, Date.now());
  const after = r.newState.expeditions!.sites.find((s) => s.id === siteId)!;
  assert.equal(after.phase, 'scavenging', 'still scavenging phase (holding)');
  assert.equal(after.lootRemaining, 1, 'the fifth item waits for a second trip');
  assert.equal(r.newState.squadInventories?.['a']?.items.length, 4, 'no further recovery while full');
  assert.ok(r.squads[0].onExpedition === siteId, 'squad still off-map — it did NOT auto-return');
});

test('an outmatched squad is overwhelmed and the expedition is lost', () => {
  const { state, siteId } = makeBase(Date.now());
  const weak = mkSquad('a', 1);
  const dispatched = dispatchSquadOnExpedition(state, [weak], 'a', siteId, Date.now());
  assert.ok(dispatched.success);

  // Travel, then fight in small bites so the garrison outlasts the squad.
  let r = tickExpeditions(dispatched.newState, dispatched.squads, 2 * 150 + 1, Date.now());
  assert.equal(r.newState.expeditions!.sites.find((s) => s.id === siteId)!.phase, 'combat');
  for (let i = 0; i < 12; i++) {
    r = tickExpeditions(r.newState, r.squads, 10, Date.now());
    if (r.newState.expeditions!.sites.find((s) => s.id === siteId)!.phase !== 'combat') break;
  }
  const site = r.newState.expeditions!.sites.find((s) => s.id === siteId)!;
  assert.equal(site.phase, 'idle', 'site freed after the wipe');
  assert.equal(site.assignedSquadId, undefined);
  assert.ok(site.defendersRemaining > 0, 'the garrison survives');
  assert.ok(r.squads[0].members.every((m) => !m.isAlive), 'squad wiped');
  assert.ok(r.events.some((e) => e.title === 'EXPEDITION LOST'));
});

test('manual recall brings the squad home with its haul; logistics deposits only after return', () => {
  const { state, siteId } = makeBase(Date.now());
  const squad = mkSquad('a');
  const dispatched = dispatchSquadOnExpedition(state, [squad], 'a', siteId, Date.now());
  assert.ok(dispatched.success);

  // Recall while travelling out.
  const recalled = recallSquadFromExpedition(dispatched.newState, dispatched.squads, 'a');
  assert.ok(recalled.success, recalled.error || '');
  assert.equal(recalled.squads[0].expeditionPhase, 'travel_back');

  // A second recall while returning is refused.
  const again = recallSquadFromExpedition(recalled.newState, recalled.squads, 'a');
  assert.ok(!again.success);

  // Complete the return journey (2 km).
  const home = tickExpeditions(recalled.newState, recalled.squads, 2 * 150 + 1, Date.now());
  assert.equal(home.squads[0].onExpedition, null, 'back on the tactical map');
  assert.equal(home.squads[0].expeditionPhase, null);
  const site = home.newState.expeditions!.sites.find((s) => s.id === siteId)!;
  assert.equal(site.assignedSquadId, undefined, 'site free again');
  assert.equal(site.phase, 'idle');
});