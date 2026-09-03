import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialSettlementState,
  establishSettlementHQ,
  buildFreestanding,
} from '../src/services/settlementService';
import {
  getPrioritizedConstructionSites,
  reorderConstructionQueue,
  tickSettlementSimulation,
} from '../src/services/populationService';
import type { SettlementState, AdaptedBuilding } from '../src/types/settlement';
import type { BuildingPolygon } from '../src/types/map';

function makeHq(): BuildingPolygon {
  return {
    id: 'b_hq_queue_test',
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

function place(state: SettlementState, typeId: string, x: number, z: number): SettlementState {
  const r = buildFreestanding(state, typeId as never, { x, z }, 8, 8, 4.5, 0);
  if (!r.success) throw new Error(`place ${typeId} failed: ${r.error}`);
  return r.newState;
}

test('queued construction completes one structure at a time under scarce materials', () => {
  let state = createInitialSettlementState('Queue Test');
  state = establishSettlementHQ(state, makeHq());

  // The player's report: 2 gates, a tower and walls placed in one go — far
  // more construction cost than the seed stockpile can cover.
  const sites: [string, number, number][] = [
    ['wooden_gate', 14, 0],
    ['wooden_tower', -14, 0],
    ['wooden_palisade', 14, 12],
    ['wooden_palisade', 14, -12],
    ['wooden_palisade', -14, 12],
    ['wooden_palisade', -14, -12],
    ['wooden_gate', 0, 14],
  ];
  for (const [typeId, x, z] of sites) state = place(state, typeId, x, z);

  // Day-time ticks until the 50W/50M/50B seed is exhausted.
  for (let i = 0; i < 600; i++) {
    state = tickSettlementSimulation(state, 1, null, false).newState;
  }

  const progress = (state.freestandingBuildings as AdaptedBuilding[]).map((b) => b.constructionProgress);
  const orders = state.constructionOrders || [];
  // Scarcity must NOT freeze everything at equal partial progress. The
  // earliest-placed structure owns the stockpile and is nearly done, while
  // later sites hold in the queue untouched.
  assert.ok(progress[0] >= 70, `first-placed structure should be near completion, got ${progress[0]}%`);
  assert.ok(
    progress[0] > progress[1],
    `first-placed structure should lead the queue, got ${progress[0]} vs ${progress[1]}`
  );
  assert.equal(progress[6], 0, 'last-placed site must wait behind the active construction window');
  assert.ok(orders.every((o) => o.state !== 'constructing' || false), 'starvation should pause every order');
  assert.ok(state.stockpile.materials.wood < 1, 'seed wood should be fully consumed');

  // Materials arrive (scavenging income). Everything must complete, and in
  // queue order: the first structure finishes before the last-placed one.
  state.stockpile.materials.wood += 2000;
  state.stockpile.materials.metal += 2000;
  state.stockpile.materials.bricks += 2000;

  const doneTick: number[] = new Array(sites.length).fill(-1);
  let tick = 0;
  const isDone = () =>
    (state.freestandingBuildings as AdaptedBuilding[]).every((b) => b.constructionStatus === 'completed');

  for (; tick < 2400 && !isDone(); tick++) {
    // 600 sim-seconds per day: 300 day / 300 night
    const isNight = Math.floor(tick / 300) % 2 === 1;
    const res = tickSettlementSimulation(state, 1, null, isNight);
    state = res.newState;
    (state.freestandingBuildings as AdaptedBuilding[]).forEach((b, i) => {
      if (doneTick[i] === -1 && b.constructionStatus === 'completed') doneTick[i] = tick;
    });
  }

  const report = (state.freestandingBuildings as AdaptedBuilding[]).map(
    (b) => `${b.typeId}:${b.constructionProgress}%`
  );
  assert.ok(isDone(), `all queued structures must complete after materials arrive — [${report.join(' | ')}]`);
  assert.ok(doneTick[0] >= 0 && doneTick.every((t) => t >= 0), 'every site should complete');
  assert.ok(
    doneTick[0] < doneTick[6],
    `first-placed structure must finish before the last-placed one (tick ${doneTick[0]} vs ${doneTick[6]})`
  );
});

test('promoting a queued structure makes it build first', () => {
  let state = createInitialSettlementState('Promote Test');
  state = establishSettlementHQ(state, makeHq());

  const placed: { typeId: string; x: number; z: number; id: string | number }[] = [];
  const seq: [string, number, number][] = [
    ['wooden_gate', 14, 0],
    ['wooden_tower', -14, 0],
    ['wooden_palisade', 14, 12],
    ['wooden_palisade', -14, -12],
  ];
  for (const [typeId, x, z] of seq) {
    state = place(state, typeId, x, z);
  }
  placed.push(...(state.freestandingBuildings as AdaptedBuilding[]).map((b) => ({
    typeId: b.typeId,
    x: b.position.x,
    z: b.position.z,
    id: b.buildingId,
  })));

  const lastId = placed[3].id;

  // A single promote swaps with the adjacent site; from the back of a
  // 4-site queue, three swaps move the palisade to the front.
  let promoted = reorderConstructionQueue(state, lastId, 'up');
  assert.ok(promoted.success);
  promoted = reorderConstructionQueue(promoted.newState, lastId, 'up');
  assert.ok(promoted.success);
  promoted = reorderConstructionQueue(promoted.newState, lastId, 'up');
  state = promoted.newState;
  let queue = getPrioritizedConstructionSites(state).all;
  assert.equal(String(queue[0].buildingId), String(lastId), 'promoted site should lead the queue');
  assert.equal(queue[0].constructionPriority, 0);
  assert.equal(String(queue[1].buildingId), String(placed[0].id), 'original first site falls back one step');

  // Keep the stockpile scarce (below the promoted palisade's 20W total cost)
  // so nothing completes; once its crew arrives, the promoted site takes every
  // unit while the other window sites hold.
  state.stockpile.materials.wood = 15;
  state.stockpile.materials.metal = 15;
  state.stockpile.materials.bricks = 15;
  for (let i = 0; i < 600; i++) {
    state = tickSettlementSimulation(state, 1, null, false).newState;
  }
  const work = (state.freestandingBuildings as AdaptedBuilding[]).map((b) => ({
    id: b.buildingId,
    done: b.constructionWorkDone,
    pct: b.constructionProgress,
  }));
  const promotedWork = work.find((p) => String(p.id) === String(lastId))?.done ?? 0;
  const othersMaxWork = Math.max(...work.filter((p) => String(p.id) !== String(lastId)).map((p) => p.done));
  assert.ok(
    promotedWork > othersMaxWork && promotedWork > 0,
    `promoted site (${promotedWork} work) must receive the scarce materials while the others hold (max ${othersMaxWork})`
  );

  // Demote three times: the promoted site returns to its original last
  // position and the queue order equals the original placement order again.
  let demoted = reorderConstructionQueue(state, lastId, 'down');
  assert.ok(demoted.success);
  demoted = reorderConstructionQueue(demoted.newState, lastId, 'down');
  assert.ok(demoted.success);
  demoted = reorderConstructionQueue(demoted.newState, lastId, 'down');
  state = demoted.newState;
  queue = getPrioritizedConstructionSites(state).all;
  assert.equal(
    queue.map((b) => String(b.buildingId)).join(','),
    placed.map((p) => String(p.id)).join(','),
    'demoting twice should restore the original placement order'
  );
});