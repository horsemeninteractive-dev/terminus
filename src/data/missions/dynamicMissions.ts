/**
 * Dynamic / emergent mission templates (spec §18, §31).
 *
 * These are repeatable templates that react to real simulation conditions:
 * survivor groups, medical shortfalls, food crises, new lairs and power
 * failures. Cooldowns (in days) gate how often each can recur so the colony
 * is not drowned in busywork, and every task still evaluates authoritative
 * game state.
 */
import { MissionDefinition } from '../../types/mission';

export const DYNAMIC_MISSIONS: MissionDefinition[] = [
  {
    id: 'mission_dyn_distress',
    code: 'OP-DISTRESS',
    title: 'DISTRESS CALL',
    description: 'A civilian group is pinned and asking for help.',
    briefing:
      'A civilian channel just broke squelch: survivors are pinned in a building with infected working the entrances. Reach them, get them out, and bring them home.',
    category: 'emergency',
    priority: 'high',
    trigger: { type: 'event', event: 'SURVIVOR_DISCOVERED' },
    prerequisites: [{ kind: 'day', min: 5 }],
    repeatable: true,
    repeatCooldownDays: 2,
    briefingTransmissionId: 'tx_dyn_distress',
    responseOptions: [
      {
        label: 'RESCUE THEM — DEPLOY A SQUAD NOW.',
        action: 'accept',
        responseNote: 'Distress response dispatched.',
      },
    ],
    tasks: [
      {
        id: 'dd1_rescue',
        type: 'rescue_survivors',
        title: 'Recruit the Pinned Survivors',
        targetCount: 1,
        focusAction: 'trigger_recruitment',
      },
    ],
    rewards: {
      resources: { dried_rations: 6 },
      summary: 'Survivors added to the roster',
    },
    completionTransmissionId: 'tx_dyn_distress_complete',
  },
  {
    id: 'mission_dyn_medical',
    code: 'OP-MEDEMERG',
    title: 'MEDICAL EMERGENCY',
    description: 'The cabinet is nearly empty — restock the med wing.',
    briefing:
      'Okafor reports critical lows on the medical shelves. Scavenge a pharmacy, run the production line, or both — the colony needs bandages and painkillers back above the danger line.',
    category: 'emergency',
    priority: 'high',
    trigger: { type: 'condition', condition: { kind: 'resource', resourceType: 'first_aid_kits', max: 5 } },
    prerequisites: [{ kind: 'day', min: 6 }],
    repeatable: true,
    repeatCooldownDays: 4,
    briefingTransmissionId: 'tx_dyn_medical',
    responseOptions: [
      {
        label: 'RESTOCK THE MED WING — PRIORITY ONE.',
        action: 'accept',
        responseNote: 'Medical restock operation greenlit.',
      },
    ],
    tasks: [
      {
        id: 'dm1_stock',
        type: 'maintain_resource',
        title: 'Hold 8 First Aid Kits in Reserve',
        resourceType: 'first_aid_kits',
        targetCount: 8,
      },
      {
        id: 'dm2_pharmacy',
        type: 'scavenge_building',
        title: 'Scavenge a Pharmacy',
        description: 'A pharmacy on the grid may still hold sealed stock.',
        target: { type: 'building', buildingCategory: 'pharmacy' },
        focusAction: 'focus_location',
      },
    ],
    rewards: {
      resources: { antibiotics: 3, painkillers: 4 },
      summary: '+3 Antibiotics +4 Painkillers',
    },
    completionTransmissionId: 'tx_dyn_medical_complete',
  },
  {
    id: 'mission_dyn_food',
    code: 'OP-FOODSHORT',
    title: 'FOOD SHORTAGE',
    description: 'Reserves are below the safe line — the roster is going hungry.',
    briefing:
      'The pantry count is falling. Fields, cookhouse, hunting, scavenging — every option must pull together until the reserve is back above the safe line.',
    category: 'emergency',
    priority: 'critical',
    trigger: {
      type: 'condition',
      condition: { kind: 'resource', resourceType: 'canned_goods', max: 20 },
    },
    prerequisites: [{ kind: 'day', min: 6 }],
    repeatable: true,
    repeatCooldownDays: 4,
    briefingTransmissionId: 'tx_dyn_food',
    responseOptions: [
      {
        label: 'ALL HANDS ON THE FOOD LINE.',
        action: 'accept',
        responseNote: 'Food production surged to emergency priority.',
      },
    ],
    tasks: [
      {
        id: 'df1_food',
        type: 'maintain_resource',
        title: 'Hold 25 Canned Goods in Reserve',
        resourceType: 'canned_goods',
        targetCount: 25,
      },
      {
        id: 'df2_cook',
        type: 'build_facility',
        title: 'Ensure a Cookhouse is Running',
        description: 'A cookhouse converts raw provisions into ration packs.',
        buildingType: 'cookhouse',
        focusAction: 'open_build_drawer',
      },
    ],
    rewards: {
      resources: { canned_goods: 12 },
      summary: '+12 Rations — pantry above the line',
    },
    completionTransmissionId: 'tx_dyn_food_complete',
  },
  {
    id: 'mission_dyn_lair',
    code: 'OP-LAIRTHREAT',
    title: 'LAIR THREAT',
    description: 'A new nest is forming inside the operating radius.',
    briefing:
      'Recon reports a fresh nest settling in close. Hit it before it roots — a young lair is a fraction of the problem an established one becomes.',
    category: 'emergency',
    priority: 'high',
    trigger: { type: 'event', event: 'LAIR_DISCOVERED' },
    prerequisites: [{ kind: 'day', min: 6 }],
    repeatable: true,
    repeatCooldownDays: 2,
    mutuallyExclusiveWith: ['mission_nest'],
    briefingTransmissionId: 'tx_dyn_lair',
    responseOptions: [
      {
        label: 'STRIKE THE NEST WHILE IT IS WEAK.',
        action: 'accept',
        responseNote: 'Pre-emptive lair strike authorised.',
      },
    ],
    tasks: [
      {
        id: 'dl1_clear',
        type: 'clear_lair',
        title: 'Clear the Young Nest',
        targetCount: 1,
        focusAction: 'focus_lair',
      },
    ],
    rewards: {
      resources: { sharedPool: 15, metal: 6 },
      summary: '+15 Ammo +6 Metal — threat removed',
    },
    completionTransmissionId: 'tx_dyn_lair_complete',
  },
  {
    id: 'mission_dyn_power',
    code: 'OP-POWERFAIL',
    title: 'POWER FAILURE',
    description: 'The generator is running dry and the ward is flickering.',
    briefing:
      'Priority loads are starting to flicker. Get fuel into the reserve and keep the generator fed — the medicine cannot wait for a better time.',
    category: 'emergency',
    priority: 'high',
    trigger: { type: 'condition', condition: { kind: 'resource', resourceType: 'gasoline', max: 15 } },
    prerequisites: [{ kind: 'day', min: 8 }],
    repeatable: true,
    repeatCooldownDays: 4,
    briefingTransmissionId: 'tx_dyn_power',
    responseOptions: [
      {
        label: 'FUEL THE GENERATOR — KEEP THE WARD ALIVE.',
        action: 'accept',
        responseNote: 'Fuel resupply dispatched to the generator.',
      },
    ],
    tasks: [
      {
        id: 'dp1_fuel',
        type: 'maintain_resource',
        title: 'Hold 25 Units of Gasoline',
        resourceType: 'gasoline',
        targetCount: 25,
      },
    ],
    rewards: {
      resources: { gasoline: 10 },
      summary: '+10 Fuel — critical infrastructure restored',
    },
    completionTransmissionId: 'tx_dyn_power_complete',
  },
];

/**
 * Completion transmissions for dynamic missions. Kept here so the content
 * stays self-contained (completion/failure transmissions for authored
 * campaign missions live in campaignTransmissions.ts).
 */
export const DYNAMIC_COMPLETION_TRANSMISSIONS = [
  {
    id: 'tx_dyn_distress_complete',
    classification: 'MILESTONE',
    callsign: 'SCOUT MILLER // FIRETEAM ALPHA',
    title: 'DISTRESS — RESCUE COMPLETE',
    message:
      'The group is out and moving with us. Scared, tired, alive — and one more name on the roster because of what we did today.',
    priority: 'normal',
  },
  {
    id: 'tx_dyn_medical_complete',
    classification: 'MILESTONE',
    callsign: 'DR. OKAFOR // MEDICAL WING',
    title: 'MEDICAL EMERGENCY — SHELVES RESTOCKED',
    message:
      'The cabinet has what it needs again. I can stop rationing bandages — thank you, Chief. This is what a colony looks like.',
    priority: 'normal',
  },
  {
    id: 'tx_dyn_food_complete',
    classification: 'MILESTONE',
    callsign: 'MAYOR-ELECT CARVER // CIVIL ADMIN',
    title: 'FOOD SHORTAGE — RESERVE RESTORED',
    message:
      'The pantry is above the line again. Nobody goes to bed hungry tonight, and that is not nothing in this world.',
    priority: 'normal',
  },
  {
    id: 'tx_dyn_lair_complete',
    classification: 'MILESTONE',
    callsign: 'SGT. VANCE // ADVANCE RECON LEAD',
    title: 'LAIR THREAT — NEST ELIMINATED',
    message:
      'The fresh nest is gone before it could grow. That is the way to fight this war — take them young and cheap, Chief.',
    priority: 'normal',
  },
  {
    id: 'tx_dyn_power_complete',
    classification: 'MILESTONE',
    callsign: 'DR. OKAFOR // MEDICAL WING',
    title: 'POWER FAILURE — WARD STABLE',
    message:
      'Loads are steady and the cold storage is humming again. Whatever else breaks today, the medicine is safe.',
    priority: 'normal',
  },
];