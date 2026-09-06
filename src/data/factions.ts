/**
 * Faction standings — persistent relations that missions and transmissions
 * shift and are gated by.
 *
 * A "faction" here is any named group the radio deals with repeatedly: the
 * SZO Network (the settlement's own patron network), long-range settlements
 * like Gravel Bend, and encountered survivor groups such as the eastern
 * strangers. Hostile bands (iron vultures, blackout marauders) live in
 * rivalFaction.ts — they are combat targets, not relations.
 *
 * Mechanics (engine in missionService):
 *  - Every faction starts at `defaultStanding` (-100..100).
 *  - Mission response options / completion rewards carry signed `FactionEffect`
 *    deltas. Declining a faction's request drops its standing; helping raises it.
 *  - When standing crosses at/below `cutoffThreshold`, the faction stops
 *    offering new work: `contactLostTransmissionId` is queued ONCE and the
 *    narrative flag `faction_relations_lost_<id>` is set (content can gate on
 *    it). If standing later recovers above the threshold, the flag clears and
 *    `contactRestoredTransmissionId` fires.
 *  - Missions/transmissions can gate on standings via the `faction_standing`
 *    condition kind, so a burnt bridge visibly changes later content.
 */
export interface FactionDef {
  id: string;
  name: string;
  /** Radio operator/callsign identity usually associated with this faction. */
  operator?: string;
  /** One-line description shown in the relations readout. */
  blurb: string;
  /** Starting standing in a fresh campaign (-100..100). */
  defaultStanding: number;
  /**
   * Standing at/below which the faction breaks off contact. Undefined means
   * the faction never breaks contact (main-story patrons).
   */
  cutoffThreshold?: number;
  /** Transmission queued the first time standing crosses below cutoff. */
  contactLostTransmissionId?: string;
  /** Transmission queued when standing later recovers above cutoff. */
  contactRestoredTransmissionId?: string;
}

export const FACTION_STANDING_MIN = -100;
export const FACTION_STANDING_MAX = 100;

export const FACTION_DEFINITIONS: FactionDef[] = [
  {
    // Not exposed in relations UI until the player earns network status; it is
    // the settlement's own umbrella, so it starts "known" via story flow.
    id: 'szo_network',
    name: 'SZO NETWORK',
    operator: 'Sgt. Vance / Command',
    blurb: 'The settlement\'s own umbrella network — scouts, operators and the command channel.',
    defaultStanding: 40,
  },
  {
    id: 'greywater',
    name: 'GRAVEL BEND',
    operator: 'Dell Harrow // River Loop',
    blurb: 'Independent long-range settlement on the river loop — self-sufficient, wary of chains of command, kept close by radio.',
    defaultStanding: 0,
    cutoffThreshold: -20,
  },
  {
    id: 'eastern_group',
    name: 'EASTERN GROUP',
    operator: 'Eastern blocks / fortified shopfront',
    blurb: 'A fortified survivor group encountered in the eastern blocks. They remember how they were answered.',
    defaultStanding: 0,
    cutoffThreshold: -15,
    contactLostTransmissionId: 'tx_c4_strangers_refused',
    contactRestoredTransmissionId: 'tx_c4_strangers_recovered',
  },
  {
    id: 'remnant',
    name: 'THE REMNANT',
    operator: 'Col. Elias Marsh // Standing Order 9',
    blurb: 'Former military and civil authority holding fragments of the old order together through structure, command and quarantine law. They know more about the collapse than they say — and their methods are not gentle.',
    defaultStanding: 0,
    cutoffThreshold: -30,
  },
  {
    id: 'commonwealth',
    name: 'THE COMMONWEALTH',
    blurb: 'A network of survivor communities rebuilding civilisation through cooperation, trade and civilian governance — convinced the old world failed, not humanity.',
    defaultStanding: 10,
    cutoffThreshold: -25,
  },
  {
    id: 'purifiers',
    name: 'THE PURIFIERS',
    blurb: 'An extremist survival movement: the infected cannot be cured, only destroyed. Their argument makes sense to anyone who has watched a town disappear — and their answer terrifies everyone who has watched one survive.',
    defaultStanding: -10,
    cutoffThreshold: -35,
  },
  {
    id: 'freeholds',
    name: 'THE FREEHOLDS',
    blurb: 'Independent settlements that reject large-scale authority: centralised organisations caused the collapse, so only self-sufficient local communities endure.',
    defaultStanding: 0,
    cutoffThreshold: -25,
  },
  {
    id: 'seekers',
    name: 'THE SEEKERS',
    blurb: 'Scientists, doctors and technicians chasing what the infection actually is. They hold fragments of pre-collapse research — essential to the truth, and certain of far less than they sound.',
    defaultStanding: 5,
    cutoffThreshold: -25,
  },
];

export function getFactionDefinition(id: string): FactionDef | undefined {
  return FACTION_DEFINITIONS.find((f) => f.id === id);
}

export function getFactionName(id: string): string {
  return getFactionDefinition(id)?.name ?? id.toUpperCase().replace(/_/g, ' ');
}

export function getFactionDefaultStanding(id: string): number {
  return getFactionDefinition(id)?.defaultStanding ?? 0;
}

export function clampFactionStanding(value: number): number {
  return Math.max(FACTION_STANDING_MIN, Math.min(FACTION_STANDING_MAX, value));
}

/** Narrative marker flag name recording a faction's current cut-off state. */
export function factionCutoffFlag(factionId: string): string {
  return `faction_relations_lost_${factionId}`;
}

/** Standing thresholds used for the relations readout posture labels. */
export const WARM_STANDING = 15;
export const COLD_STANDING = -10;
