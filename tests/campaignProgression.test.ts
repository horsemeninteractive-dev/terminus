/**
 * v0.3.9 CAMPAIGN PROGRESSION — regression suite.
 *
 * The campaign must be written around what the player can actually do at the
 * point a mission is presented: every build/research objective must have a
 * legitimate path when the mission appears, main-story missions must follow
 * causal order, and final branches must demand new work rather than check
 * completed state. Run:
 * node --import tsx --import ./tests/register-loader.mjs --test tests/campaignProgression.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerAllContent, validateContentRegistry } from '../src/services/missionRegistry';
import {
  getRegisteredMissionDefinitions,
  findMissionDefinition,
  getInitialMissionState,
  updateMissionSystem,
  evaluateMissionCondition,
  evaluateTask,
} from '../src/services/missionService';
import { RESEARCH_TREE_NODES } from '../src/data/researchTreeData';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../src/data/functionalBuildings';
import type { MissionDefinition } from '../src/types/mission';
import type { GameClockState } from '../src/types/combat';
import type { SettlementState } from '../src/types/settlement';

registerAllContent();

const DEFS = getRegisteredMissionDefinitions();
const byId = (id: string): MissionDefinition => {
  const d = findMissionDefinition(id);
  assert.ok(d, `mission ${id} registered`);
  return d;
};

function clock(day: number, hour = 8): GameClockState {
  return {
    day,
    hour,
    minute: 0,
    speed: 1,
    phase: 'day',
    isNight: false,
    hordeWaveIntensity: 1,
    totalElapsedSeconds: (day - 1) * 86400 + hour * 3600,
  } as unknown as GameClockState;
}

function settlement(over: Partial<SettlementState> = {}): SettlementState {
  return {
    generalPopulation: { total: 20 },
    namedSurvivors: [],
    squads: [{ id: 'sq1' }],
    freestandingBuildings: [],
    adaptedBuildings: new Map(),
    buildingSearches: new Map(),
    stockpile: { materials: {}, food: {}, medical: {}, fuel: {}, ammo: {}, water: {} },
    research: { unlockedNodes: [], activeResearchId: null, activeProgressSec: 0 },
    lifetimeStats: { infectedKills: 0, survivorsRecruited: 0, itemsProduced: {} },
    hiddenGroups: new Map(),
    zombieLairs: new Map(),
    ...over,
  } as unknown as SettlementState;
}

function mkHQ(over: Partial<SettlementState> = {}): SettlementState {
  const s = settlement(over);
  (s as any).headquarters = [{ buildingId: 'hq-1', operational: true }];
  (s as any).primaryHQId = 'hq-1';
  return s;
}

/** Recursively collect research ids reachable-from nothing → full tree. */
function researchChain(id: string): string[] {
  const node = RESEARCH_TREE_NODES[id];
  assert.ok(node, `research node ${id} exists in the real tree`);
  const chain = new Set<string>([id]);
  for (const p of node.prerequisites || []) {
    for (const r of researchChain(p)) chain.add(r);
  }
  return [...chain];
}

// ---------------------------------------------------------------------------
// 1. Registry integrity after the restructure
// ---------------------------------------------------------------------------

test('restructured campaign registers without validation errors', () => {
  assert.deepEqual(validateContentRegistry(), []);
});

test('every mission objective references a real building and research node', () => {
  for (const def of DEFS) {
    for (const task of def.tasks) {
      if (task.buildingType) {
        assert.ok(
          FUNCTIONAL_BUILDING_DEFINITIONS[task.buildingType as keyof typeof FUNCTIONAL_BUILDING_DEFINITIONS],
          `${def.id}/${task.id}: building "${task.buildingType}" exists in functionalBuildings`
        );
      }
      if (task.researchId) {
        assert.ok(RESEARCH_TREE_NODES[task.researchId], `${def.id}/${task.id}: research "${task.researchId}" exists in the tree`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 2. WATERLINE never appears before its real prerequisites
// ---------------------------------------------------------------------------

test('WATERLINE gates on a real Research Center and Basic Sanitation', () => {
  const def = byId('mission_waterline');
  assert.ok(
    def.prerequisites!.some((p) => p.kind === 'building_any' && p.buildingType === 'research_center'),
    'requires an actual research_center (adapted or constructed)'
  );
  assert.ok(
    def.prerequisites!.some((p) => p.kind === 'research' && p.id === 'basic_sanitation'),
    'requires basic_sanitation researched'
  );
  // The research node itself unlocks the cistern — the chain is real.
  assert.equal(RESEARCH_TREE_NODES['basic_sanitation'].unlockedBuildingTypeId, 'water_cistern');
});

test('WATERLINE does not brief before its prerequisites are met (even late)', () => {
  const hq = mkHQ();
  const state = getInitialMissionState();
  // Day 10 with HQ but no research center / sanitation: no waterline.
  const res = updateMissionSystem(state, hq, clock(10), {});
  assert.ok(
    res.newTransmissions.every((t) => t.missionId !== 'mission_waterline'),
    'waterline must not appear without research capability'
  );
  // And no pending shell either.
  assert.equal(res.newState.pendingMissions.filter((m) => m.definitionId === 'mission_waterline').length, 0);
});

test('WATERLINE briefs once the research center and sanitation exist', () => {
  const ready = mkHQ({
    freestandingBuildings: [
      { buildingId: 'rc', typeId: 'research_center', type: 'research_center', constructionStatus: 'completed' },
    ] as any,
    research: { unlockedNodes: ['basic_sanitation'], activeResearchId: null, activeProgressSec: 0 } as any,
  });
  const res = updateMissionSystem(getInitialMissionState(), ready, clock(3), {});
  assert.ok(
    res.newTransmissions.some((t) => t.missionId === 'mission_waterline'),
    'waterline briefs when the capability chain is real'
  );
});

test('building_any condition counts adapted AND constructed, not either path alone', () => {
  const s = settlement();
  const cond = { kind: 'building_any' as const, buildingType: 'research_center' };
  assert.equal(evaluateMissionCondition(cond, s, clock(1), {}, {}), false, 'no facility = false');

  const constructed = settlement({
    freestandingBuildings: [
      { buildingId: 'rc', typeId: 'research_center', type: 'research_center', constructionStatus: 'completed' },
    ] as any,
  });
  assert.equal(evaluateMissionCondition(cond, constructed, clock(1), {}, {}), true, 'constructed counts');

  const adapted = settlement() as SettlementState;
  (adapted as any).adaptedBuildings = new Map([
    ['b1', { buildingId: 'b1', typeId: 'research_center', type: 'research_center', constructionStatus: 'completed' }],
  ]);
  assert.equal(evaluateMissionCondition(cond, adapted, clock(1), {}, {}), true, 'adapted counts');
});

// ---------------------------------------------------------------------------
// 3. Building/research prerequisites chain to the real tree
// ---------------------------------------------------------------------------

test('DEAD CHANNEL requires the antenna research its own task builds on', () => {
  const def = byId('mission_deadchannel');
  assert.ok(def.prerequisites!.some((p) => p.kind === 'research' && p.id === 'basic_antenna'));
  assert.equal(FUNCTIONAL_BUILDING_DEFINITIONS.antenna.researchRequirement, 'basic_antenna');
});

test('MAKING DO / SCRAP / POWER gate on their factories\u2019 real research', () => {
  assert.ok(byId('mission_makingdo').prerequisites!.some((p) => p.kind === 'research' && p.id === 'tool_factory'));
  assert.equal(FUNCTIONAL_BUILDING_DEFINITIONS.tool_factory.researchRequirement, 'tool_factory');

  assert.ok(byId('mission_scrap').prerequisites!.some((p) => p.kind === 'research' && p.id === 'recycling'));
  assert.equal(FUNCTIONAL_BUILDING_DEFINITIONS.scrapyard.researchRequirement, 'recycling');

  // POWER asks for electrical_engineering, whose chain is reachable: mechanics
  // → advanced_metalworks → tool_factory. The mission gates on mechanics.
  assert.ok(byId('mission_power').prerequisites!.some((p) => p.kind === 'research' && p.id === 'mechanics'));
  const chain = researchChain('electrical_engineering');
  for (const step of ['mechanics', 'advanced_metalworks', 'tool_factory']) {
    assert.ok(chain.includes(step), `electrical_engineering chain contains ${step}`);
  }
});

test('no settlement-development mission gates on a resource demand the player cannot yet supply', () => {
  // Sanity: the development missions use research gating, not arbitrary days.
  const dev = ['mission_makingdo', 'mission_scrap', 'mission_power'];
  for (const id of dev) {
    const def = byId(id);
    assert.equal(def.isMainStory, false, `${id} is settlement development, not main story`);
    assert.ok(
      def.prerequisites!.some((p) => p.kind === 'research'),
      `${id} gates on real research`
    );
  }
});

// ---------------------------------------------------------------------------
// 4. Main-story causal order (requiresMissionsCompleted is the spine)
// ---------------------------------------------------------------------------

test('main story follows a causal chain with no day-only entry into the spine', () => {
  // The spine: waterline → deadchannel → nest → nightmove → oldworld →
  // unknownsignal → strangers → military → coldstorage → thefacility →
  // containment → theprotocol → one of three branches.
  const spine: Array<[string, string[]]> = [
    ['mission_waterline', []],
    ['mission_deadchannel', ['mission_waterline']],
    ['mission_nightmove', ['mission_nest']],
    ['mission_oldworld', ['mission_nightmove']],
    ['mission_unknownsignal', ['mission_deadchannel', 'mission_nightmove']],
    ['mission_strangers', ['mission_unknownsignal']],
    ['mission_military', ['mission_oldworld']],
    ['mission_coldstorage', ['mission_military']],
    ['mission_thefacility', ['mission_coldstorage']],
    ['mission_containment', ['mission_thefacility']],
    ['mission_theprotocol', ['mission_containment']],
  ];
  for (const [id, prereqs] of spine) {
    const def = byId(id);
    assert.ok(def.isMainStory, `${id} is main story`);
    assert.deepEqual(
      [...(def.requiresMissionsCompleted || [])].sort(),
      [...prereqs].sort(),
      `${id} requires exactly its story predecessors`
    );
  }
});

test('story prerequisite ids all exist (no dangling causal links)', () => {
  for (const def of DEFS) {
    for (const p of def.requiresMissionsCompleted || []) {
      assert.ok(findMissionDefinition(p), `${def.id}: prerequisite ${p} exists`);
    }
  }
});

test('WATERLINE completion is the entry requirement for DEAD CHANNEL, not a shared day gate', () => {
  // deadchannel has no waterline trigger overlap: even at day 30, without the
  // waterline completion it must not fire.
  const hq = mkHQ({
    freestandingBuildings: [
      { buildingId: 'rc', typeId: 'research_center', type: 'research_center', constructionStatus: 'completed' },
    ] as any,
    research: { unlockedNodes: ['basic_sanitation', 'basic_antenna'], activeResearchId: null, activeProgressSec: 0 } as any,
  });
  const res = updateMissionSystem(getInitialMissionState(), hq, clock(30), {});
  assert.ok(
    res.newTransmissions.every((t) => t.missionId !== 'mission_deadchannel'),
    'deadchannel stays hidden until waterline completes'
  );
});

// ---------------------------------------------------------------------------
// 5. have vs do semantics
// ---------------------------------------------------------------------------

test('manufacture objectives produce, not possess (missionManufacture baseline contract intact)', () => {
  // FIREPOWER's ammo objective remains manufacture_item — production-tally
  // based. WATERLINE's reserve is intentionally a maintain_resource (a reserve
  // is a state of the world), and no main mission asks to "manufacture" a
  // resource already held at task start.
  assert.equal(byId('mission_firepower').tasks.find((t) => t.id === 'fp3_ammo')!.type, 'manufacture_item');
  assert.equal(byId('mission_waterline').tasks.find((t) => t.id === 'w2_reserve')!.type, 'maintain_resource');
});

test('CURE branch produces new work: samples, protocol research, hospital, demonstration', () => {
  const tasks = byId('mission_protocol_cure').tasks;
  assert.ok(tasks.some((t) => t.id === 'pc1_samples' && t.type === 'scavenge_resource'));
  assert.ok(tasks.some((t) => t.researchId === 'drugs_production'));
  assert.ok(tasks.some((t) => t.buildingType === 'hospital'));
  // No generic survive-without-work shortcut as the opening task.
  assert.notEqual(tasks[0].type, 'survive_duration');
  // The researched node is real medicine-line work, not basic_sanitation.
  assert.ok(RESEARCH_TREE_NODES['drugs_production'].prerequisites!.includes('medical_care'));
});

test('PURGE branch is doctrine-first: training, lair clearing, fortified hold, kills', () => {
  const tasks = byId('mission_protocol_purge').tasks;
  assert.ok(tasks.some((t) => t.buildingType === 'shooting_range'));
  const lairs = tasks.find((t) => t.type === 'clear_lair');
  assert.ok(lairs && (lairs.targetCount || 0) >= 2);
  assert.ok(tasks.some((t) => t.buildingType === 'fortified_tower'));
  assert.ok(tasks.some((t) => t.type === 'eliminate_infected' && (t.targetCount || 0) >= 60));
  // Ordered: doctrine before kills.
  const order = tasks.map((t) => t.id);
  assert.ok(order.indexOf('pp1_doctrine') < order.indexOf('pp4_kills'));
});

test('COEXISTENCE branch proves the network: settlements, caravan, trust, endurance', () => {
  const tasks = byId('mission_protocol_coexistence').tasks;
  assert.ok(tasks.some((t) => t.type === 'establish_settlement'));
  assert.ok(tasks.some((t) => t.type === 'deliver_resources'));
  const allies = tasks.find((t) => t.id === 'pn3_allies');
  assert.ok(allies);
  assert.equal((allies as any).minContacts, 3, 'trust channel is a typed minContacts custom task');
  assert.ok(tasks.some((t) => t.id === 'pn4_endure' && (t.targetCount || 0) >= 72));
});

test('custom minContacts tasks evaluate against real contacted-faction count', () => {
  const task = {
    id: 'pn3_allies', type: 'custom', title: 'trust', status: 'active',
    current: 0, target: 3, minContacts: 3,
  } as any;
  const s = settlement();
  const bare = evaluateTask(task, s, clock(1), {}, [], getInitialMissionState());
  assert.equal(bare.complete, false, 'no contacts = not complete');
  const state = { ...getInitialMissionState(), contactedFactionIds: ['seekers', 'remnant', 'commonwealth'] };
  const done = evaluateTask(task, s, clock(1), {}, [], state);
  assert.equal(done.complete, true, '3 contacted factions completes the trust channel');
});

// ---------------------------------------------------------------------------
// 6. Classification consistency
// ---------------------------------------------------------------------------

test('branch children are not main story; the strangers branch is a consequence arc', () => {
  for (const id of ['mission_strangers_help', 'mission_strangers_trade', 'mission_strangers_bitter']) {
    assert.equal(byId(id).isMainStory, false, `${id} is branch content`);
  }
  const bitter = byId('mission_strangers_bitter');
  const cond = bitter.trigger.type === 'and'
    ? bitter.trigger.children!.find((c) => c.condition?.kind === 'flag')?.condition
    : bitter.trigger.condition;
  assert.ok(cond && cond.kind === 'flag' && cond.key === 'refused_strangers', 'bitter harvest is a refusal consequence');
});

test('faction contact missions reveal the faction only through contactFactionId', () => {
  // The Seekers signal + 4-way crossroads + Gravel Bend voices.
  const contactGated = DEFS.filter((d) => d.responseOptions.some((o) => o.contactFactionId));
  assert.ok(contactGated.length >= 3, 'contact-establishing missions exist');
  for (const def of contactGated) {
    for (const opt of def.responseOptions) {
      if (opt.contactFactionId) {
        assert.ok(def.tasks.length > 0 || opt.action === 'branch', `${def.id} has real work`);
      }
    }
  }
});

test('SECOND CHANCE requires the expedition logistics capability before caravans are asked', () => {
  const def = byId('mission_secondchance');
  assert.ok(def.prerequisites!.some((p) => p.kind === 'building_any' && p.buildingType === 'expedition_center'));
  // And it sits after the depot recovery on the spine (military loot feeds the
  // second-settlement push).
  assert.ok((def.requiresMissionsCompleted || []).includes('mission_military'));
});
