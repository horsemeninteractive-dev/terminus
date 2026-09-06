/**
 * Authored campaign missions — Chapters I–VI.
 *
 * Content only. Every task type here is evaluated by the engine against real
 * game state (research tree, buildings, stockpile, lairs, squads, population,
 * caravans, settlements). No engine changes are needed to add a mission.
 *
 * Chapter 0 (the tutorial) deliberately remains on the legacy directive
 * engine — its five objectives and radio flow are behaviour-locked. Chapters I+
 * run on the mission framework and share the same transmission queue.
 */
import { MissionDefinition } from '../../types/mission';

export const CAMPAIGN_MISSIONS: MissionDefinition[] = [
  // =========================================================================
  // CHAPTER I — A PLACE TO LIVE
  // =========================================================================
  {
    id: 'mission_waterline',
    code: 'OP-WATERLINE',
    title: 'WATERLINE',
    description: 'Formalise water infrastructure before the reserve runs dry.',
    briefing:
      'Voss reports the settlement is one dry tap away from rationing. Research Basic Sanitation, construct a Water Cistern, build a real reserve, and prove the supply holds for two days.',
    category: 'settlement',
    priority: 'high',
    chapter: 1,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'day', min: 3 } },
    prerequisites: [{ kind: 'hq_established', value: true }],
    briefingTransmissionId: 'tx_c1_waterline',
    responseOptions: [
      {
        label: 'VOSS, PRIORITISE WATER INFRASTRUCTURE.',
        action: 'accept',
        responseNote: 'Water infrastructure flagged as a priority workstream.',
      },
    ],
    tasks: [
      {
        id: 'w1_research',
        type: 'research_technology',
        title: 'Research Basic Sanitation',
        researchId: 'basic_sanitation',
      },
      {
        id: 'w2_cistern',
        type: 'build_facility',
        title: 'Construct a Water Cistern',
        buildingType: 'water_cistern',
        focusAction: 'open_build_drawer',
        dependsOn: ['w1_research'],
      },
      {
        id: 'w3_reserve',
        type: 'maintain_resource',
        title: 'Hold a Rainwater Reserve',
        description: 'Accumulate 30 units of stored rainwater.',
        resourceType: 'rainwater',
        targetCount: 30,
        dependsOn: ['w2_cistern'],
      },
      {
        id: 'w4_survive',
        type: 'survive_duration',
        title: 'Survive Two Days on the New Supply',
        targetCount: 48,
        dependsOn: ['w3_reserve'],
      },
    ],
    rewards: {
      resources: { first_aid_kits: 4 },
      summary: '+4 First Aid Kits — stable water supply',
    },
    completionTransmissionId: 'tx_c1_waterline_done',
    targetHint: 'Water Cistern requires Basic Sanitation research.',
  },
  {
    id: 'mission_deadchannel',
    code: 'OP-DEADCHANNEL',
    title: 'DEAD CHANNEL',
    description: 'Lock onto the unregistered signal bleeding through the relay.',
    briefing:
      'An unknown carrier loops numbers on a dead band. Build the antenna rig and run the triangulation to pin down the transmission origin — someone is out there, and they are not one of ours.',
    category: 'discovery',
    priority: 'normal',
    chapter: 1,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'day', min: 5 } },
    prerequisites: [{ kind: 'hq_established', value: true }],
    requiresMissionsCompleted: ['mission_waterline'],
    briefingTransmissionId: 'tx_c1_deadchannel',
    responseOptions: [
      {
        label: 'RUN THE SIGNAL — DEDICATE ENGINEERING TIME.',
        action: 'accept',
        responseNote: 'Engineering crew assigned to the dead channel.',
      },
    ],
    tasks: [
      {
        id: 'd1_antenna',
        type: 'build_facility',
        title: 'Raise a Radio Antenna',
        buildingType: 'antenna',
        focusAction: 'open_build_drawer',
      },
      {
        id: 'd2_triangulate',
        type: 'research_technology',
        title: 'Research Signal Triangulation',
        researchId: 'triangulation',
        dependsOn: ['d1_antenna'],
      },
    ],    rewards: {
      resources: { scientific_materials: 3 },
      summary: '+3 Scientific Materials — signal source identified',
    },
    completionTransmissionId: 'tx_c1_deadchannel_done',
  },

  // =========================================================================
  // ACT II — VOICES IN THE DARK: first contact (spec §10/§33)
  // =========================================================================
  // The faction is NEVER named before the player answers. The briefing is an
  // anonymous signal; only the chosen response establishes contact, adds the
  // faction to contactedFactionIds and reveals its standing in the tracker.
  {
    id: 'mission_unknownsignal',
    code: 'OP-UNKNOWNSIGNAL',
    title: 'UNKNOWN TRANSMISSION',
    description: "A voice has appeared on a frequency you've never heard before.",
    briefing:
      'No callsign. No registry. No location. A repeating fragment has surfaced on an unregistered scientific band: "—anyone receiving this, answer." The triangulation rig can hold the frequency open long enough to respond. Whatever is on the other end, it is organised — and it knows things about the dead.',
    category: 'faction',
    priority: 'high',
    chapter: 2,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'flag', key: 'lore_behaviour_anomaly' } },
    prerequisites: [{ kind: 'hq_established', value: true }],
    requiresMissionsCompleted: ['mission_deadchannel', 'mission_nightmove'],
    briefingTransmissionId: 'tx_c2_unknownsignal',
    responseOptions: [
      {
        label: 'RESPOND — HOLD THE FREQUENCY OPEN.',
        action: 'accept',
        contactFactionId: 'seekers',
        followUpTransmissionId: 'tx_c2_unknownsignal_done',
        responseNote: 'Unregistered scientific band answered.',
      },
      {
        label: 'MONITOR ONLY — DO NOT ANSWER.',
        action: 'decline',
        flag: { key: 'ignored_unknown_signal', value: true },
        responseNote: 'The signal is logged and monitored. Contact is not established.',
      },
    ],
    tasks: [
      {
        id: 'us1_contact',
        type: 'contact_faction',
        title: 'Hold Contact with the Unknown Operator',
        factionId: 'seekers',
        targetCount: 1,
      },
      {
        id: 'us2_records',
        type: 'scavenge_resource',
        title: 'Trade Scientific Materials for What They Know',
        description: 'The operator will not talk for free — pull scientific materials from the old world to open the conversation.',
        resourceType: 'scientific_materials',
        targetCount: 3,
        dependsOn: ['us1_contact'],
      },
    ],
    rewards: {
      narrativeFlags: { seekers_contacted: true },
      summary: 'Contact established with the scientific collective',
    },
    completionTransmissionId: 'tx_c2_unknownsignal_done',
  },

  // =========================================================================
  // ACT IV — THE REMNANT: the factions reveal themselves (spec §14)
  // =========================================================================
  // Different survivor groups tell different stories about the collapse. The
  // player chooses which frequencies to answer; each response establishes real
  // contact and shifts standings. No faction is named before this choice.
  {
    id: 'mission_crossroads',
    code: 'OP-CROSSROADS',
    title: 'CROSSROADS',
    description: 'Four frequencies. Four stories about the end of the world. Answer any of them.',
    briefing:
      "Since the depot records went out over our own channel, the band has been loud. A military frequency using old designators. A civilian coordination net with a shipping manifest for a constitution. A channel that only ever says the same two words: burn them. And a settlement cluster that wants nothing from anyone. They are all real. They do not all agree about what happened. Choose who we talk to.",
    category: 'faction',
    priority: 'high',
    chapter: 5,
    isMainStory: true,
    trigger: {
      type: 'and',
      children: [
        { type: 'condition', condition: { kind: 'flag', key: 'lore_military_records' } },
        { type: 'condition', condition: { kind: 'population', min: 15 } },
      ],
    },
    prerequisites: [{ kind: 'population', min: 15 }],
    requiresMissionsCompleted: ['mission_military'],
    briefingTransmissionId: 'tx_c5_crossroads',
    responseOptions: [
      {
        label: 'ANSWER THE MILITARY FREQUENCY.',
        action: 'branch',
        missionId: 'mission_crossroads_remnant',
        contactFactionId: 'remnant',
        responseNote: 'Standing Order 9 answered.',
      },
      {
        label: 'ANSWER THE CIVILIAN COORDINATION NET.',
        action: 'branch',
        missionId: 'mission_crossroads_commonwealth',
        contactFactionId: 'commonwealth',
        responseNote: 'Coordination net answered.',
      },
      {
        label: 'ANSWER THE BURN-THEM CHANNEL.',
        action: 'branch',
        missionId: 'mission_crossroads_purifiers',
        contactFactionId: 'purifiers',
        responseNote: 'Extremist channel answered.',
      },
      {
        label: 'ANSWER THE INDEPENDENT CLUSTER.',
        action: 'branch',
        missionId: 'mission_crossroads_freeholds',
        contactFactionId: 'freeholds',
        responseNote: 'Independent cluster answered.',
      },
      {
        label: 'WE ANSWER NO ONE YET.',
        action: 'decline',
        flag: { key: 'declined_crossroads', value: true },
        responseNote: 'The frequencies stay logged. No contact is established.',
      },
    ],
    tasks: [],
  },
  {
    id: 'mission_crossroads_remnant',
    code: 'OP-CROSSROADS-REMNANT',
    title: 'CROSSROADS — STANDING ORDER 9',
    description: 'The Remnant wants to know if we can hold an orderly line.',
    briefing:
      'The military frequency resolves to a colonel still reading civil-containment designations into the dark. They are holding fragments of the old order together — structure, command, quarantine law. They ask what we are building. The answer decides whether this becomes a partnership or an inspection.',
    category: 'faction',
    priority: 'normal',
    chapter: 5,
    isMainStory: false,
    trigger: { type: 'condition', condition: { kind: 'flag', key: 'never_auto' } },
    briefingTransmissionId: 'tx_c5_crossroads_remnant',
    responseOptions: [
      {
        label: 'REPORT OPERATIONS — REQUEST INTELLIGENCE SHARING.',
        action: 'accept',
        factionEffects: [{ factionId: 'remnant', delta: 10 }],
        responseNote: 'Open reporting — the colonel approves.',
      },
      {
        label: 'REPORT NOTHING — WE ANSWER TO OUR OWN TOWN.',
        action: 'decline',
        factionEffects: [{ factionId: 'remnant', delta: -10 }],
        responseNote: 'The colonel logs us as unaligned. The channel stays open.',
      },
    ],
    tasks: [
      {
        id: 'cr1_records',
        type: 'scavenge_building',
        title: "Recover Records from a Government Site",
        description: 'The Remnant trades in information. Search a police or civic building for anything with an official stamp.',
        target: { type: 'building', buildingCategory: 'police' },
        focusAction: 'focus_location',
      },
    ],
    rewards: {
      narrativeFlags: { remnant_contacted: true },
      factionEffects: [{ factionId: 'remnant', delta: 5 }],
      summary: 'Intelligence relationship opened with the Remnant',
    },
    completionTransmissionId: 'tx_c5_crossroads_remnant_done',
  },
  {
    id: 'mission_crossroads_commonwealth',
    code: 'OP-CROSSROADS-COMMONWEALTH',
    title: 'CROSSROADS — COORDINATION NET',
    description: 'The Commonwealth offers membership in something bigger.',
    briefing:
      'The coordination net is everything the old world was not: civilian-run, trade-first, no uniforms. They are connecting survivor settlements into a mutual-aid network. They want us in — and their price is participation, not obedience.',
    category: 'faction',
    priority: 'normal',
    chapter: 5,
    isMainStory: false,
    trigger: { type: 'condition', condition: { kind: 'flag', key: 'never_auto' } },
    briefingTransmissionId: 'tx_c5_crossroads_commonwealth',
    responseOptions: [
      {
        label: 'OPEN TRADE — JOIN THE MUTUAL-AID NETWORK.',
        action: 'accept',
        factionEffects: [{ factionId: 'commonwealth', delta: 10 }],
        responseNote: 'Commonwealth membership initiated.',
      },
      {
        label: 'STAY INDEPENDENT FOR NOW.',
        action: 'decline',
        factionEffects: [{ factionId: 'commonwealth', delta: -5 }],
        responseNote: 'The net logs us as friendly but unaligned.',
      },
    ],
    tasks: [
      {
        id: 'cw1_caravan',
        type: 'deliver_resources',
        title: 'Complete a Run on the Coordination Route',
        description: 'The Commonwealth measures partners by whether the wagons actually run.',
        targetCount: 1,
      },
    ],
    rewards: {
      narrativeFlags: { commonwealth_contacted: true },
      factionEffects: [{ factionId: 'commonwealth', delta: 5 }],
      resources: { canned_goods: 10 },
      summary: 'Mutual-aid relationship opened — +10 Rations',
    },
    completionTransmissionId: 'tx_c5_crossroads_commonwealth_done',
  },
  {
    id: 'mission_crossroads_purifiers',
    code: 'OP-CROSSROADS-PURIFIERS',
    title: 'CROSSROADS — BURN THEM',
    description: 'The Purifiers make their case in two words.',
    briefing:
      "The channel's operator has watched towns die. Their arithmetic is simple: every infected left standing is a town that falls later. They are not mad — that is what makes them hard to dismiss. They want to know if we will help burn the nests out of the region.",
    category: 'faction',
    priority: 'normal',
    chapter: 5,
    isMainStory: false,
    trigger: { type: 'condition', condition: { kind: 'flag', key: 'never_auto' } },
    briefingTransmissionId: 'tx_c5_crossroads_purifiers',
    responseOptions: [
      {
        label: 'COORDINATE — THE NESTS HAVE TO GO.',
        action: 'accept',
        factionEffects: [{ factionId: 'purifiers', delta: 10 }, { factionId: 'seekers', delta: -5 }],
        responseNote: 'Suppression cooperation opened.',
      },
      {
        label: 'REFUSE — WE DO NOT BURN WHAT WE DO NOT UNDERSTAND.',
        action: 'decline',
        factionEffects: [{ factionId: 'purifiers', delta: -10 }],
        responseNote: 'The channel goes quiet. It will be back.',
      },
    ],
    tasks: [
      {
        id: 'cp1_lair',
        type: 'clear_lair',
        title: 'Clear a Lair in the Region',
        description: 'The Purifiers count commitment in nests burned.',
        targetCount: 1,
        focusAction: 'focus_lair',
      },
    ],
    rewards: {
      narrativeFlags: { purifiers_contacted: true },
      factionEffects: [{ factionId: 'purifiers', delta: 5 }],
      resources: { sharedPool: 25 },
      summary: 'Suppression relationship opened — +25 Shared Ammo',
    },
    completionTransmissionId: 'tx_c5_crossroads_purifiers_done',
  },
  {
    id: 'mission_crossroads_freeholds',
    code: 'OP-CROSSROADS-FREEHOLDS',
    title: 'CROSSROADS — THE CLUSTER',
    description: 'The Freeholds want neighbours, not a government.',
    briefing:
      "The independent cluster is a dozen small settlements that survived by owing nothing to anyone. They watch, they trade, they keep their own roads. Their offer is simple: be a good neighbour, and the roads between us stay open.",
    category: 'faction',
    priority: 'normal',
    chapter: 5,
    isMainStory: false,
    trigger: { type: 'condition', condition: { kind: 'flag', key: 'never_auto' } },
    briefingTransmissionId: 'tx_c5_crossroads_freeholds',
    responseOptions: [
      {
        label: 'EXCHANGE SURVEY DATA — BE A NEIGHBOUR.',
        action: 'accept',
        factionEffects: [{ factionId: 'freeholds', delta: 10 }],
        responseNote: 'Neighbourly relations opened with the cluster.',
      },
      {
        label: 'KEEP OUR MAPS TO OURSELVES.',
        action: 'decline',
        factionEffects: [{ factionId: 'freeholds', delta: -5 }],
        responseNote: 'The cluster respects it — warily.',
      },
    ],
    tasks: [
      {
        id: 'cf1_survey',
        type: 'scavenge_building',
        title: 'Survey an Industrial Site for the Cluster',
        description: 'They want to know what the old supply chains left behind. Search an industrial site and log it.',
        target: { type: 'building', buildingCategory: 'industrial' },
        focusAction: 'focus_location',
      },
    ],
    rewards: {
      narrativeFlags: { freeholds_contacted: true },
      factionEffects: [{ factionId: 'freeholds', delta: 5 }],
      resources: { metal: 10, gasoline: 6 },
      summary: 'Neighbourly relations opened — +10 Metal +6 Fuel',
    },
    completionTransmissionId: 'tx_c5_crossroads_freeholds_done',
  },

  // =========================================================================
  // ACT II — THE DEAD AREN'T RANDOM
  // =========================================================================
  {
    id: 'mission_nest',
    code: 'OP-NEST',
    title: 'THE NEST',
    description: 'Clear the organised infected lair before it feeds the horde.',
    briefing:
      'Recon has confirmed a genuine lair: infected mustering inside a structure, leaving in groups, returning the same way. Breach it, kill every one of them, and the surrounding streets stop feeding the night.',
    category: 'campaign',
    priority: 'high',
    chapter: 2,
    isMainStory: true,
    trigger: { type: 'event', event: 'LAIR_DISCOVERED' },
    prerequisites: [{ kind: 'day', min: 4 }],
    briefingTransmissionId: 'tx_c2_nest',
    responseOptions: [
      {
        label: 'AUTHORISE BREACH. CLEAR THE NEST.',
        action: 'accept',
        responseNote: 'Breach authorised — the nest is a priority target.',
      },
    ],
    tasks: [
      {
        id: 'n1_clear',
        type: 'clear_lair',
        title: 'Clear the Infected Lair',
        description: 'Eliminate the lair garrison and secure the structure.',
        targetCount: 1,
        focusAction: 'focus_lair',
      },
      {
        id: 'n2_eliminate',
        type: 'eliminate_infected',
        title: 'Hunt the Escaped Infected',
        description: 'Keep the sector kill tally climbing — every infected put down counts toward securing the neighbourhood.',
        targetCount: 25,
        focusAction: 'focus_lair',
        dependsOn: ['n1_clear'],
      },
    ],
    rewards: {
      resources: { sharedPool: 30 },
      // Act III entry: a cleared nest proves lairs are persistent structures,
      // not one-off hordes — the first hard evidence for what follows.
      narrativeFlags: { lore_lair_research: true },
      summary: '+30 Shared Ammo — neighbourhood secured',
    },
    completionTransmissionId: 'tx_c2_nest_done',
    mutuallyExclusiveWith: ['mission_dyn_lair'],
  },
  {
    id: 'mission_nightmove',
    code: 'OP-NIGHTMOVE',
    title: 'NIGHT MOVEMENT',
    description: 'Hold the perimeter through an intensified night assault.',
    briefing:
      'The infected are massing earlier and hitting harder. Dig in, keep defenders on the line, and survive until dawn — the sensors say the worst is just after dusk.',
    category: 'survival',
    priority: 'critical',
    chapter: 2,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'day', min: 6 } },
    prerequisites: [{ kind: 'squad_formed', min: 1 }],
    requiresMissionsCompleted: ['mission_nest'],
    briefingTransmissionId: 'tx_c2_nightmove',
    responseOptions: [
      {
        label: 'ALL UNITS TO THE PERIMETER. HOLD THROUGH THE NIGHT.',
        action: 'accept',
        responseNote: 'Perimeter watch doubled — night defence posture.',
      },
    ],
    tasks: [
      {
        id: 'nm1_survive',
        type: 'survive_night',
        title: 'Survive Through the Night',
        targetCount: 1,
      },
      {
        id: 'nm2_record',
        type: 'eliminate_infected',
        title: 'Break the Night Push and Record the Pattern',
        description: 'Fight the night wave and log the timing, direction and density — this is not the same enemy we met in week one.',
        targetCount: 15,
        dependsOn: ['nm1_survive'],
      },
    ],
    rewards: {
      resources: { sharedPool: 20, canned_goods: 8 },
      narrativeFlags: { lore_behaviour_anomaly: true },
      summary: '+20 Ammo +8 Rations — behavioural anomaly recorded',
    },
    completionTransmissionId: 'tx_c2_nightmove_done',
  },
  {
    id: 'mission_oldworld',
    code: 'OP-OLDWORLD',
    title: 'THE OLD WORLD',
    description: 'Reach the flagged medical facility and recover its cache.',
    briefing:
      'Survey flagged a medical facility on the grid that may still hold sealed old-world stock. The target is bound to the map — send a squad, reach it, and search it before someone else does.',
    category: 'exploration',
    priority: 'high',
    chapter: 2,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'day', min: 7 } },
    prerequisites: [{ kind: 'squad_formed', min: 1 }],
    requiresMissionsCompleted: ['mission_nightmove'],
    briefingTransmissionId: 'tx_c2_oldworld',
    responseOptions: [
      {
        label: 'LOCK THE TARGET. DEPLOY A SQUAD.',
        action: 'accept',
        responseNote: 'Medical facility locked as a sortie target.',
      },
    ],
    tasks: [
      {
        id: 'ow1_reach',
        type: 'travel_to_location',
        title: 'Reach the Medical Facility',
        description: 'The facility is bound to a hospital on the satellite grid.',
        target: { type: 'building', buildingCategory: 'hospital' },
        focusAction: 'focus_location',
      },
      {
        id: 'ow2_search',
        type: 'scavenge_building',
        title: 'Search the Medical Facility',
        description: 'Search the bound facility to recover the sealed cache.',
        target: { type: 'building', buildingCategory: 'hospital' },
        focusAction: 'focus_location',
        dependsOn: ['ow1_reach'],
      },
    ],
    rewards: {
      resources: { antibiotics: 6, first_aid_kits: 8 },
      // DISCOVERY 1–3 (spec §17): the sealed cabinets hold more than stock —
      // intake ledgers show unusual cases weeks before the collapse.
      narrativeFlags: { lore_early_cases: true },
      summary: '+6 Antibiotics +8 First Aid Kits — intake ledgers recovered',
    },
    completionTransmissionId: 'tx_c2_oldworld_done',
  },
  // =========================================================================
  // CHAPTER III — BUILDING SOMETHING THAT LASTS
  // =========================================================================
  {
    id: 'mission_makingdo',
    code: 'OP-MAKINGDO',
    title: 'MAKING DO',
    description: 'Stand up a tool production line and stockpile real tools.',
    briefing:
      'Reyes is blunt: the settlement breaks more than it can mend. Build a Tool Factory, run the line, and put a working stockpile of tools in the bins.',
    category: 'settlement',
    priority: 'high',
    chapter: 3,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'day', min: 8 } },
    prerequisites: [{ kind: 'population', min: 12 }],
    requiresMissionsCompleted: ['mission_oldworld'],
    briefingTransmissionId: 'tx_c3_makingdo',
    responseOptions: [
      {
        label: 'REYES, WE STAND UP THE TOOL LINE.',
        action: 'accept',
        responseNote: 'Tool production flagged as a construction priority.',
      },
    ],
    tasks: [
      {
        id: 'md1_build',
        type: 'build_facility',
        title: 'Construct a Tool Factory',
        buildingType: 'tool_factory',
        focusAction: 'open_build_drawer',
      },
      {
        id: 'md2_tools',
        type: 'manufacture_item',
        title: 'Manufacture 10 Tools',
        resourceType: 'tools',
        targetCount: 10,
        dependsOn: ['md1_build'],
      },
    ],
    rewards: {
      resources: { tools: 5 },
      summary: '+5 Tools — repair capacity unlocked',
    },
    completionTransmissionId: 'tx_c3_makingdo_done',
  },
  {
    id: 'mission_scrap',
    code: 'OP-SCRAP',
    title: 'SCRAP',
    description: 'Build a recycling operation and start recovering scrap.',
    briefing:
      'Every wreck and every used cartridge is raw material walking away. Establish a Scrapyard and pull 15 scrap units back into the economy.',
    category: 'settlement',
    priority: 'normal',
    chapter: 3,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'day', min: 10 } },
    prerequisites: [{ kind: 'population', min: 12 }],
    requiresMissionsCompleted: ['mission_makingdo'],
    briefingTransmissionId: 'tx_c3_scrap',
    responseOptions: [
      {
        label: 'RECOVERY YARD APPROVED. BUILD IT.',
        action: 'accept',
        responseNote: 'Scrap recovery operation greenlit.',
      },
    ],
    tasks: [
      {
        id: 'sc1_build',
        type: 'build_facility',
        title: 'Construct a Scrapyard',
        buildingType: 'scrapyard',
        focusAction: 'open_build_drawer',
      },
      {
        id: 'sc2_scrap',
        type: 'scavenge_resource',
        title: 'Recover 15 Scrap',
        resourceType: 'scrap',
        targetCount: 15,
        dependsOn: ['sc1_build'],
      },
    ],
    rewards: {
      resources: { metal: 10 },
      summary: '+10 Metal — recycling loop online',
    },
    completionTransmissionId: 'tx_c3_scrap_done',
  },
  {
    id: 'mission_firepower',
    code: 'OP-FIREPOWER',
    title: 'FIREPOWER',
    description: 'Research arms, stand up the factory, and produce ammunition.',
    briefing:
      'Every sortie burns ammunition we cannot replace. Research the pistol line, build an Arms Factory, and produce 5 crates of ammunition so the colony stops fighting on borrowed rounds.',
    category: 'campaign',
    priority: 'high',
    chapter: 3,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'day', min: 12 } },
    prerequisites: [{ kind: 'population', min: 12 }],
    requiresMissionsCompleted: ['mission_makingdo'],
    briefingTransmissionId: 'tx_c3_firepower',
    responseOptions: [
      {
        label: 'ARM THE COLONY. COMMENCE WEAPONS PRODUCTION.',
        action: 'accept',
        responseNote: 'Arms production chain authorised.',
      },
    ],
    tasks: [
      {
        id: 'fp1_research',
        type: 'research_technology',
        title: 'Research the Pistol Line',
        researchId: 'pistol',
      },
      {
        id: 'fp2_build',
        type: 'build_facility',
        title: 'Construct an Arms Factory',
        buildingType: 'arms_factory',
        focusAction: 'open_build_drawer',
        dependsOn: ['fp1_research'],
      },
      {
        id: 'fp3_ammo',
        type: 'manufacture_item',
        title: 'Produce 5 Ammunition Crates',
        resourceType: 'crates',
        targetCount: 5,
        dependsOn: ['fp2_build'],
      },
    ],
    rewards: {
      resources: { sharedPool: 40 },
      summary: '+40 Shared Ammo — independent firepower',
    },
    completionTransmissionId: 'tx_c3_firepower_done',
  },
  {
    id: 'mission_power',
    code: 'OP-POWER',
    title: 'POWER',
    description: 'Research electrical engineering and keep the generator fed.',
    briefing:
      'The medical wing is running on daylight. Research Electrical Engineering, construct a Generator Station, and hold a 20-unit fuel reserve so the ward never goes dark again.',
    category: 'settlement',
    priority: 'high',
    chapter: 3,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'day', min: 12 } },
    prerequisites: [{ kind: 'population', min: 15 }],
    requiresMissionsCompleted: ['mission_makingdo'],
    briefingTransmissionId: 'tx_c3_power',
    responseOptions: [
      {
        label: 'OKAFOR, WE BRING THE WARD ONLINE.',
        action: 'accept',
        responseNote: 'Electrification of critical infrastructure approved.',
      },
    ],
    tasks: [
      {
        id: 'pw1_research',
        type: 'research_technology',
        title: 'Research Electrical Engineering',
        researchId: 'electrical_engineering',
      },
      {
        id: 'pw2_build',
        type: 'build_facility',
        title: 'Construct a Generator Station',
        buildingType: 'generator_station',
        focusAction: 'open_build_drawer',
        dependsOn: ['pw1_research'],
      },
      {
        id: 'pw3_fuel',
        type: 'maintain_resource',
        title: 'Hold a 20-Unit Fuel Reserve',
        resourceType: 'gasoline',
        targetCount: 20,
        dependsOn: ['pw2_build'],
      },
    ],
    rewards: {
      resources: { gasoline: 10 },
      summary: '+10 Fuel — medical wing powered',
    },
    completionTransmissionId: 'tx_c3_power_done',
  },
  // =========================================================================
  // CHAPTER IV — PEOPLE
  // =========================================================================
  {
    id: 'mission_morethan',
    code: 'OP-MORETHAN',
    title: 'MORE THAN SURVIVAL',
    description: 'Grow the roster and provision a real community.',
    briefing:
      'The settlement is outgrowing "camp" status. Reach 30 residents and hold a working food reserve — a community that feeds everyone is a community that stays.',
    category: 'settlement',
    priority: 'normal',
    chapter: 4,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'population', min: 25 } },
    requiresMissionsCompleted: ['mission_makingdo'],
    briefingTransmissionId: 'tx_c4_morethan',
    responseOptions: [
      {
        label: 'WE BUILD FOR THE PEOPLE WE HAVE.',
        action: 'accept',
        responseNote: 'Community development workstream opened.',
      },
    ],
    tasks: [
      {
        id: 'mt1_pop',
        type: 'reach_population',
        title: 'Reach 30 Residents',
        targetCount: 30,
      },
      {
        id: 'mt2_food',
        type: 'maintain_resource',
        title: 'Hold 30 Canned Goods in Reserve',
        resourceType: 'canned_goods',
        targetCount: 30,
      },
    ],
    rewards: {
      narrativeFlags: { community_established: true },
      summary: 'Community status unlocked',
    },
    completionTransmissionId: 'tx_c4_morethan_done',
  },
  {
    id: 'mission_order',
    code: 'OP-ORDER',
    title: 'ORDER',
    description: 'Build the Gathering Place and let the town write its laws.',
    briefing:
      'Carver is right — a town cannot run on good intentions. Construct a Gathering Place and grow the roster to 32 so the civic hall has a community to govern.',
    category: 'settlement',
    priority: 'high',
    chapter: 4,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'flag', key: 'community_established', value: true } },
    prerequisites: [{ kind: 'population', min: 28 }],
    requiresMissionsCompleted: ['mission_morethan'],
    briefingTransmissionId: 'tx_c4_order',
    responseOptions: [
      {
        label: 'CARVER, WE RAISE THE HALL.',
        action: 'accept',
        responseNote: 'Gathering Place construction approved.',
      },
    ],
    tasks: [
      {
        id: 'od1_build',
        type: 'build_facility',
        title: 'Construct a Gathering Place',
        buildingType: 'gathering_place',
        focusAction: 'open_build_drawer',
      },
      {
        id: 'od2_pop',
        type: 'reach_population',
        title: 'Reach 32 Residents',
        targetCount: 32,
        dependsOn: ['od1_build'],
      },
    ],
    rewards: {
      narrativeFlags: { order_established: true },
      summary: 'Civic governance unlocked',
    },
    completionTransmissionId: 'tx_c4_order_done',
  },
  {
    id: 'mission_strangers',
    code: 'OP-STRANGERS',
    title: 'STRANGERS',
    description: 'A survivor group in the eastern blocks is asking who we are.',
    briefing:
      'Miller\'s fireteam has made contact with a fortified group — maybe a dozen people, low on food and medicine. How we answer will be remembered. Choose.',
    category: 'faction',
    priority: 'normal',
    chapter: 4,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'day', min: 14 } },
    prerequisites: [{ kind: 'population', min: 15 }],
    briefingTransmissionId: 'tx_c4_strangers',
    responseOptions: [
      {
        label: 'RESCUE THEM — MOVE THEM INTO THE SETTLEMENT.',
        action: 'branch',
        missionId: 'mission_strangers_help',
        factionEffects: [{ factionId: 'eastern_group', delta: 15 }],
        responseNote: 'Rescue operation authorised for the eastern group.',
      },
      {
        label: 'TRADE WITH THEM — OPEN A SUPPLY LINE.',
        action: 'branch',
        missionId: 'mission_strangers_trade',
        factionEffects: [{ factionId: 'eastern_group', delta: 8 }],
        responseNote: 'Trade contact opened with the eastern group.',
      },
      {
        label: 'WE CANNOT HELP. BREAK CONTACT.',
        action: 'decline',
        flag: { key: 'refused_strangers', value: true },
        factionEffects: [{ factionId: 'eastern_group', delta: -25 }],
        responseNote: 'Contact with the eastern group closed.',
      },
    ],
    tasks: [],
  },
  {
    id: 'mission_strangers_help',
    code: 'OP-STRANGERS-RESCUE',
    title: 'STRANGERS — RESCUE',
    description: 'Bring the eastern group into the settlement.',
    briefing:
      'The rescue is on. Locate the group\'s position and bring them home — every survivor added to the roster is a pair of hands and a voice in the town.',
    category: 'faction',
    priority: 'high',
    chapter: 4,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'flag', key: 'never_auto' } },
    briefingTransmissionId: 'tx_c4_strangers',
    responseOptions: [
      {
        label: 'ACKNOWLEDGED.',
        action: 'accept',
      },
    ],
    tasks: [
      {
        id: 'st1_rescue',
        type: 'rescue_survivors',
        title: 'Recruit the Stranded Survivors',
        description: 'Locate and recruit a stranded survivor group.',
        targetCount: 1,
        focusAction: 'trigger_recruitment',
      },
    ],
    rewards: {
      narrativeFlags: { helped_strangers: true },
      factionEffects: [{ factionId: 'eastern_group', delta: 5 }],
      summary: 'The eastern group joins the settlement',
    },
    completionTransmissionId: 'tx_c4_strangers_help_done',
  },
  {
    id: 'mission_strangers_trade',
    code: 'OP-STRANGERS-TRADE',
    title: 'STRANGERS — TRADE LINE',
    description: 'Deliver supplies to the eastern group and open a route.',
    briefing:
      'The eastern group will trade — but first we have to prove the route. Send a caravan of supplies to their position and complete the run.',
    category: 'faction',
    priority: 'normal',
    chapter: 4,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'flag', key: 'never_auto' } },
    briefingTransmissionId: 'tx_c4_strangers',
    responseOptions: [
      {
        label: 'ACKNOWLEDGED.',
        action: 'accept',
      },
    ],
    tasks: [
      {
        id: 'st2_deliver',
        type: 'deliver_resources',
        title: 'Complete a Caravan Run',
        description: 'Dispatch and land a supply caravan at a settlement.',
        targetCount: 1,
      },
    ],
    rewards: {
      narrativeFlags: { traded_strangers: true },
      factionEffects: [{ factionId: 'eastern_group', delta: 5 }],
      summary: 'Trade route open with the eastern group',
    },
    completionTransmissionId: 'tx_c4_strangers_trade_done',
  },
  {
    id: 'mission_strangers_bitter',
    code: 'OP-BITTER',
    title: 'BITTER HARVEST',
    description: 'The eastern group you turned away has found new patrons — and they remember you.',
    briefing:
      'Miller\'s fireteam confirmed it this morning: the shopfront is a burned shell. The eastern group is gone — and their vehicles were clocked moving with a raider column. Then the band went cold and a voice we both recognised came up on the open channel: "You left us to die once. We remember." The raiders will use the night horde as a battering ram. Hold the perimeter through the dark and break what they send — they have to learn that refusing them once cost us nothing they can collect.',
    category: 'faction',
    priority: 'high',
    chapter: 4,
    isMainStory: false,
    trigger: {
      type: 'and',
      children: [
        { type: 'condition', condition: { kind: 'flag', key: 'refused_strangers', value: true } },
        { type: 'condition', condition: { kind: 'day', min: 20 } },
        { type: 'condition', condition: { kind: 'faction_standing', factionId: 'eastern_group', max: -15 } },
      ],
    },
    briefingTransmissionId: 'tx_c4_bitter',
    responseOptions: [
      {
        label: 'WE HOLD THE PERIMETER. THEY LEARN THE COST.',
        action: 'accept',
        responseNote: 'Perimeter hardening authorised against the raider column.',
      },
    ],
    tasks: [
      {
        id: 'bh1_survive',
        type: 'survive_night',
        title: 'Hold the Perimeter Through the Night',
        description: 'Survive the night raid with the raider horde testing the perimeter.',
        targetCount: 1,
      },
      {
        id: 'bh2_kills',
        type: 'eliminate_infected',
        title: 'Break the Horde They Drove Ahead of Them',
        targetCount: 20,
        dependsOn: ['bh1_survive'],
      },
    ],
    rewards: {
      narrativeFlags: { eastern_group_hostile: true },
      summary: 'The raider column is broken',
    },
    completionTransmissionId: 'tx_c4_bitter_done',
  },
  // =========================================================================
  // CHAPTER V — THE NETWORK
  // =========================================================================
  {
    id: 'mission_eastern_line',
    code: 'OP-EASTERNLINE',
    title: 'THE EASTERN LINE',
    description: 'The eastern group keeps the channel open — they want a regular supply run.',
    briefing:
      'The eastern operator is back on the band, and this time it is not a plea — it is a proposal. "You opened the road when it mattered. We remember that too." They are offering a standing trade line: a caravan run on a set route, supplies both ways, every time we land it they trust us a little more. Dispatch the run and prove the route holds.',
    category: 'faction',
    priority: 'normal',
    chapter: 5,
    isMainStory: false,
    repeatable: true,
    repeatCooldownDays: 12,
    trigger: {
      type: 'and',
      children: [
        {
          type: 'or',
          children: [
            { type: 'condition', condition: { kind: 'flag', key: 'traded_strangers', value: true } },
            { type: 'condition', condition: { kind: 'flag', key: 'helped_strangers', value: true } },
          ],
        },
        { type: 'condition', condition: { kind: 'day', min: 18 } },
        { type: 'condition', condition: { kind: 'faction_standing', factionId: 'eastern_group', min: 10 } },
      ],
    },
    briefingTransmissionId: 'tx_c5_easternline',
    responseOptions: [
      {
        label: 'THE ROAD STAYS OPEN. DISPATCH THE RUN.',
        action: 'accept',
        factionEffects: [{ factionId: 'eastern_group', delta: 2 }],
        responseNote: 'Supply run to the eastern group authorised.',
      },
      {
        label: 'NOT THIS SEASON. STAND DOWN THE RUN.',
        action: 'decline',
        factionEffects: [{ factionId: 'eastern_group', delta: -6 }],
        responseNote: 'The eastern group is disappointed — the road closes for now.',
      },
    ],
    tasks: [
      {
        id: 'el1_caravan',
        type: 'deliver_resources',
        title: 'Complete a Caravan Run to the Eastern Group',
        targetCount: 1,
      },
    ],
    rewards: {
      resources: { canned_goods: 8, metal: 5 },
      factionEffects: [{ factionId: 'eastern_group', delta: 3 }],
      summary: '+8 Rations +5 Metal — trust deepens with the eastern group',
    },
    completionTransmissionId: 'tx_c5_easternline_done',
  },
  {
    id: 'mission_secondchance',
    code: 'OP-SECONDCHANCE',
    title: 'SECOND CHANCE',
    description: 'Establish a second settlement and become a network.',
    briefing:
      'Voss has a viable site: defensible, with its own water. Prepare the logistics and establish a second settlement — one fragile town is a gamble, two towns are a network.',
    category: 'settlement',
    priority: 'high',
    chapter: 5,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'day', min: 16 } },
    prerequisites: [{ kind: 'population', min: 25 }],
    requiresMissionsCompleted: ['mission_order'],
    briefingTransmissionId: 'tx_c5_secondchance',
    responseOptions: [
      {
        label: 'WE FOUND THE SECOND SETTLEMENT.',
        action: 'accept',
        responseNote: 'Second settlement programme approved.',
      },
    ],
    tasks: [
      {
        id: 'sc1_establish',
        type: 'establish_settlement',
        title: 'Establish a Second Settlement',
        targetCount: 2,
      },
    ],
    rewards: {
      narrativeFlags: { second_settlement: true },
      summary: 'Two settlements — the network begins',
    },
    completionTransmissionId: 'tx_c5_secondchance_done',
  },
  {
    id: 'mission_road',
    code: 'OP-ROAD',
    title: 'THE ROAD',
    description: 'Run a supply caravan and prove the logistics route.',
    briefing:
      'Two towns mean one supply problem: everything must move over open ground. Load a caravan, dispatch it, and land it — logistics is what separates a network from two camps.',
    category: 'settlement',
    priority: 'high',
    chapter: 5,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'settlement_count', min: 2 } },
    prerequisites: [{ kind: 'day', min: 17 }],
    requiresMissionsCompleted: ['mission_secondchance'],
    briefingTransmissionId: 'tx_c5_road',
    responseOptions: [
      {
        label: 'THE ROAD RUNS. DISPATCH THE CARAVAN.',
        action: 'accept',
        responseNote: 'Supply route dispatch authorised.',
      },
    ],
    tasks: [
      {
        id: 'rd1_caravan',
        type: 'deliver_resources',
        title: 'Complete a Supply Caravan Run',
        targetCount: 1,
      },
    ],
    rewards: {
      resources: { canned_goods: 10, metal: 8 },
      summary: '+10 Rations +8 Metal — supply line proven',
    },
    completionTransmissionId: 'tx_c5_road_done',
  },
  {
    id: 'mission_voices',
    code: 'OP-VOICES',
    title: 'DISTANT VOICES',
    description: 'Answer the unknown operator and hold the frequency.',
    briefing:
      'An operator on the gravel band is asking if anyone is real. Establish contact — and keep the channel open long enough to prove we are worth talking to.',
    category: 'faction',
    priority: 'normal',
    chapter: 5,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'settlement_count', min: 2 } },
    prerequisites: [{ kind: 'day', min: 18 }],
    requiresMissionsCompleted: ['mission_road'],
    briefingTransmissionId: 'tx_c5_voices',
    responseOptions: [
      {
        label: 'ANSWER THE CALL. HOLD THE FREQUENCY.',
        action: 'accept',
        contactFactionId: 'greywater',
        responseNote: 'Contact attempt logged with the unknown operator.',
      },
    ],
    tasks: [
      {
        id: 'vo1_contact',
        type: 'contact_faction',
        title: 'Establish Contact with the Unknown Operator',
        factionId: 'greywater',
        targetCount: 1,
      },
      {
        id: 'vo2_hold',
        type: 'survive_duration',
        title: 'Hold the Frequency for a Day',
        targetCount: 24,
        dependsOn: ['vo1_contact'],
      },
    ],
    rewards: {
      narrativeFlags: { greywater_contacted: true },
      summary: 'Long-range contact established',
    },
    completionTransmissionId: 'tx_c5_voices_done',
  },
  // =========================================================================
  // CHAPTER VI — THE WIDER WORLD
  // =========================================================================
  {
    id: 'mission_military',
    code: 'OP-WIDERWORLD',
    title: 'THE RELAY',
    description: 'Recover the sealed military depot the dead channel revealed.',
    briefing:
      'The dead channel finally paid out: a military logistics relay keyed to old grid references. The nearest sealed position is bound to a police station on the map. Reach it and search it — the inventory could change everything.',
    category: 'exploration',
    priority: 'high',
    chapter: 6,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'day', min: 20 } },
    prerequisites: [
      { kind: 'research', id: 'triangulation' },
      { kind: 'squad_formed', min: 1 },
    ],
    requiresMissionsCompleted: ['mission_voices'],
    briefingTransmissionId: 'tx_c6_military',
    responseOptions: [
      {
        label: 'CRACK THE DEPOT. SEND A SQUAD.',
        action: 'accept',
        responseNote: 'Military depot flagged as a recovery target.',
      },
    ],
    tasks: [
      {
        id: 'mw1_reach',
        type: 'travel_to_location',
        title: 'Reach the Sealed Depot',
        description: 'The depot is bound to a police station on the grid.',
        target: { type: 'building', buildingCategory: 'police' },
        focusAction: 'focus_location',
      },
      {
        id: 'mw2_search',
        type: 'scavenge_building',
        title: 'Search the Depot',
        description: 'Search the bound police station for the sealed cache.',
        target: { type: 'building', buildingCategory: 'police' },
        focusAction: 'focus_location',
        dependsOn: ['mw1_reach'],
      },
    ],
    rewards: {
      resources: { crates: 5, tools: 6, canned_goods: 15 },
      // DISCOVERY 5 (spec §17): quarantine orders + evacuation records show a
      // major containment operation was ALREADY RUNNING before the collapse.
      narrativeFlags: { lore_military_records: true, lore_outbreak_timeline: true },
      summary: '+5 Ammo Crates +6 Tools +15 Rations — quarantine orders recovered',
    },
    completionTransmissionId: 'tx_c6_military_done',
  },

  // =========================================================================
  // ACT V — THE SOURCE: the discovery chain (spec §16/§17)
  // =========================================================================

  {
    id: 'mission_coldstorage',
    code: 'OP-COLDSTORAGE',
    title: 'COLD STORAGE',
    description: 'Search a research-linked site for the old project archive.',
    briefing:
      "Okafor cross-referenced the hospital ledgers and the quarantine stamps: both point at the same research programme. University labs and libraries held the published side of it. Search a campus or library and pull whatever the archive still holds.",
    category: 'discovery',
    priority: 'high',
    chapter: 6,
    isMainStory: true,
    trigger: {
      type: 'and',
      children: [
        { type: 'condition', condition: { kind: 'flag', key: 'lore_military_records' } },
        { type: 'condition', condition: { kind: 'squad_formed', min: 1 } },
      ],
    },
    prerequisites: [{ kind: 'squad_formed', min: 1 }],
    requiresMissionsCompleted: ['mission_military'],
    briefingTransmissionId: 'tx_c6_coldstorage',
    responseOptions: [
      {
        label: 'SEND A SQUAD. PULL THE ARCHIVE.',
        action: 'accept',
        responseNote: 'Research archive recovery authorised.',
      },
    ],
    tasks: [
      {
        id: 'cs1_reach',
        type: 'travel_to_location',
        title: 'Reach the Academic Site',
        description: 'Bound to a school, university or library on the satellite grid.',
        target: { type: 'building', buildingCategory: 'school' },
        focusAction: 'focus_location',
      },
      {
        id: 'cs2_search',
        type: 'scavenge_building',
        title: 'Search the Academic Site',
        target: { type: 'building', buildingCategory: 'school' },
        dependsOn: ['cs1_reach'],
      },
    ],
    rewards: {
      resources: { scientific_materials: 6 },
      narrativeFlags: { lore_research_records: true },
      summary: '+6 Scientific Materials — the published record recovered',
    },
    completionTransmissionId: 'tx_c6_coldstorage_done',
  },

  {
    id: 'mission_thefacility',
    code: 'OP-THEFACILITY',
    title: 'THE FACILITY',
    description: 'Cross-reference military and academic records to locate the source facility.',
    briefing:
      "The military containment grid and the published research reference the same blank spot on the map — a facility that officially does not exist. Okafor and the comms team have triangulated its likely position. Find it.",
    category: 'discovery',
    priority: 'critical',
    chapter: 6,
    isMainStory: true,
    trigger: {
      type: 'and',
      children: [
        { type: 'condition', condition: { kind: 'flag', key: 'lore_research_records' } },
        { type: 'condition', condition: { kind: 'lair_discovered', min: 1 } },
      ],
    },
    prerequisites: [{ kind: 'squad_formed', min: 1 }],
    requiresMissionsCompleted: ['mission_coldstorage'],
    briefingTransmissionId: 'tx_c6_facility',
    responseOptions: [
      {
        label: 'MARK THE POSITION. FIND THE FACILITY.',
        action: 'accept',
        responseNote: 'Facility search authorised.',
      },
    ],
    tasks: [
      {
        id: 'tf1_reach',
        type: 'travel_to_location',
        title: 'Locate the Facility Site',
        description: 'Bound to an industrial or research building on the grid.',
        target: { type: 'building', buildingCategory: 'industrial' },
        focusAction: 'focus_location',
      },
      {
        id: 'tf2_search',
        type: 'scavenge_building',
        title: 'Search the Facility Site',
        target: { type: 'building', buildingCategory: 'industrial' },
        dependsOn: ['tf1_reach'],
      },
    ],
    rewards: {
      resources: { scientific_materials: 8 },
      narrativeFlags: { lore_facility_located: true },
      summary: 'Facility position confirmed',
    },
    completionTransmissionId: 'tx_c6_facility_done',
  },

  {
    id: 'mission_containment',
    code: 'OP-CONTAINMENT',
    title: 'CONTAINMENT',
    description: 'Breach the facility and recover what went wrong.',
    briefing:
      "This is the source. Whatever ended the old world started in that building — quarantine seals, dead generators, and the project's own records are all still inside. Clear a path and pull the truth out.",
    category: 'discovery',
    priority: 'critical',
    chapter: 6,
    isMainStory: true,
    trigger: {
      type: 'and',
      children: [
        { type: 'condition', condition: { kind: 'flag', key: 'lore_facility_located' } },
        { type: 'condition', condition: { kind: 'squad_formed', min: 1 } },
      ],
    },
    prerequisites: [{ kind: 'squad_formed', min: 1 }],
    requiresMissionsCompleted: ['mission_thefacility'],
    briefingTransmissionId: 'tx_c6_containment',
    responseOptions: [
      {
        label: 'BREACH THE FACILITY. RECOVER EVERYTHING.',
        action: 'accept',
        responseNote: 'Facility breach authorised.',
      },
    ],
    tasks: [
      {
        id: 'ct1_clear',
        type: 'clear_lair',
        title: 'Clear the Facility Perimeter',
        description: 'The dead hold the ground around the source — take it from them.',
        targetCount: 1,
        focusAction: 'focus_lair',
      },
      {
        id: 'ct2_search',
        type: 'scavenge_building',
        title: 'Search the Facility',
        description: 'Recover the project\'s own records — the truth is inside.',
        target: { type: 'building', buildingCategory: 'industrial' },
        dependsOn: ['ct1_clear'],
      },
    ],
    rewards: {
      resources: { scientific_materials: 10 },
      narrativeFlags: { lore_facility_investigated: true, lore_pathogen_nature: true },
      summary: 'The nature of the outbreak is understood',
    },
    completionTransmissionId: 'tx_c6_containment_done',
  },

  // =========================================================================
  // ACT VI — WHAT COMES NEXT: resolution (spec §20/§21)
  // =========================================================================

  {
    id: 'mission_theprotocol',
    code: 'OP-THEPROTOCOL',
    title: 'THE PROTOCOL',
    description: 'The settlement must choose what humanity does about the outbreak.',
    briefing:
      "We know what happened. The choice is what happens next. Cure, purge, or coexistence — each path is real work, and none of them are clean. Decide.",
    category: 'campaign',
    priority: 'critical',
    chapter: 7,
    isMainStory: true,
    trigger: {
      type: 'and',
      children: [
        { type: 'condition', condition: { kind: 'flag', key: 'lore_pathogen_nature' } },
      ],
      },
    prerequisites: [{ kind: 'population', min: 15 }],
    requiresMissionsCompleted: ['mission_containment'],
    briefingTransmissionId: 'tx_c7_protocol',
    responseOptions: [
      {
        label: 'PURSUE A TREATMENT — CURE.',
        action: 'branch',
        missionId: 'mission_protocol_cure',
        factionEffects: [{ factionId: 'seekers', delta: 15 }, { factionId: 'purifiers', delta: -10 }],
        responseNote: 'Treatment programme authorised.',
      },
      {
        label: 'DESTROY EVERY INFECTED — PURGE.',
        action: 'branch',
        missionId: 'mission_protocol_purge',
        factionEffects: [{ factionId: 'purifiers', delta: 15 }, { factionId: 'seekers', delta: -10 }],
        responseNote: 'Suppression doctrine adopted.',
      },
      {
        label: 'CONTAIN AND MANAGE — COEXISTENCE.',
        action: 'branch',
        missionId: 'mission_protocol_coexistence',
        factionEffects: [{ factionId: 'commonwealth', delta: 12 }, { factionId: 'purifiers', delta: -5 }],
        responseNote: 'Containment doctrine adopted.',
      },
    ],
    tasks: [],
  },

  {
    id: 'mission_protocol_cure',
    code: 'OP-PROTOCOL-CURE',
    title: 'THE PROTOCOL — CURE',
    description: 'Prove a treatment is possible.',
    briefing:
      "The Seekers have the fragments; the facility records supply the rest. Research the countermeasure, prove it works, and give the world something more than survival.",
    category: 'campaign',
    priority: 'critical',
    chapter: 7,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'flag', key: 'never_auto' } },
    briefingTransmissionId: 'tx_c7_protocol_cure',
    responseOptions: [{ label: 'ACKNOWLEDGED. THE WORK STARTS NOW.', action: 'accept' }],
    tasks: [
      {
        id: 'pc1_research',
        type: 'research_technology',
        title: 'Research a Medicine Node',
        description: 'Any medicine-line research advances the treatment programme.',
        researchId: 'basic_sanitation',
      },
      {
        id: 'pc2_endure',
        type: 'survive_duration',
        title: 'Hold the Programme Together for Three Days',
        targetCount: 72,
        dependsOn: ['pc1_research'],
      },
    ],
    rewards: {
      narrativeFlags: { campaign_resolved: true, campaign_resolution: 'cure' },
      summary: 'THE OUTBREAK — RESOLVED. Treatment pathway established.',
    },
    completionTransmissionId: 'tx_c7_resolved',
  },

  {
    id: 'mission_protocol_purge',
    code: 'OP-PROTOCOL-PURGE',
    title: 'THE PROTOCOL — PURGE',
    description: 'Commit to long-term suppression of the infected.',
    briefing:
      "The Purifiers have been right about one thing all along: the infected will not stop. Commit the colony to suppression — clear lairs, break the night waves, and make the land survivable again, mile by mile.",
    category: 'campaign',
    priority: 'critical',
    chapter: 7,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'flag', key: 'never_auto' } },
    briefingTransmissionId: 'tx_c7_protocol_purge',
    responseOptions: [{ label: 'ACKNOWLEDGED. WE TAKE IT TO THEM.', action: 'accept' }],
    tasks: [
      {
        id: 'pp1_lairs',
        type: 'clear_lair',
        title: 'Clear 2 Lairs',
        targetCount: 2,
        focusAction: 'focus_lair',
      },
      {
        id: 'pp2_kills',
        type: 'eliminate_infected',
        title: 'Put Down 60 Infected',
        targetCount: 60,
        dependsOn: ['pp1_lairs'],
      },
    ],
    rewards: {
      narrativeFlags: { campaign_resolved: true, campaign_resolution: 'purge' },
      summary: 'THE OUTBREAK — RESOLVED. Suppression doctrine operational.',
    },
    completionTransmissionId: 'tx_c7_resolved',
  },
  {
    id: 'mission_protocol_coexistence',
    code: 'OP-PROTOCOL-COEXIST',
    title: 'THE PROTOCOL — COEXISTENCE',
    description: 'Build a containment network and learn to live with the dead.',
    briefing:
      "Eradication is a dream and a cure is a long road. Build containment: a second settlement, a working caravan line, and enough stability that humanity outlasts the dead instead of hiding from them.",
    category: 'campaign',
    priority: 'critical',
    chapter: 7,
    isMainStory: true,
    trigger: { type: 'condition', condition: { kind: 'flag', key: 'never_auto' } },
    briefingTransmissionId: 'tx_c7_protocol_coexist',
    responseOptions: [{ label: 'ACKNOWLEDGED. WE BUILD.', action: 'accept' }],
    tasks: [
      {
        id: 'pn1_settlement',
        type: 'establish_settlement',
        title: 'Hold Two Settlements',
        targetCount: 2,
      },
      {
        id: 'pn2_caravan',
        type: 'deliver_resources',
        title: 'Run a Supply Caravan Between Them',
        targetCount: 1,
        dependsOn: ['pn1_settlement'],
      },
    ],
    rewards: {
      narrativeFlags: { campaign_resolved: true, campaign_resolution: 'coexistence' },
      summary: 'THE OUTBREAK — RESOLVED. Containment network operational.',
    },
    completionTransmissionId: 'tx_c7_resolved',
  },
];