/**
 * Global campaign lore state (spec §18/§48).
 *
 * Design principle: "The player can lose the people, buildings and settlements
 * that discovered the story. They cannot lose the knowledge civilisation has
 * gained."
 *
 * Campaign knowledge therefore lives in `MissionState.narrativeFlags`, which:
 *  - is GLOBAL (one per campaign, not per settlement),
 *  - already persists through save/load,
 *  - already survives settlement destruction,
 *  - already initialises to defaults on old saves (missing keys == unknown).
 *
 * `CampaignLoreState` is the canonical typed VIEW over those flags — the
 * simulation reads lore through it; missions author against the flag names.
 * Mission state (what the player is currently doing) and lore state (what
 * civilisation knows) stay different things: a mission can fail, a squad can
 * die, and the knowledge remains.
 */

export type CampaignResolution = 'cure' | 'purge' | 'coexistence';

/** Canonical lore flag names (stored in MissionState.narrativeFlags). */
export const LORE_FLAGS = {
  outbreakTimelineKnown: 'lore_outbreak_timeline',
  earlyCasesDiscovered: 'lore_early_cases',
  infectedBehaviourAnomalyKnown: 'lore_behaviour_anomaly',
  organisedInfectedKnown: 'lore_organised_infected',
  militaryRecordsRecovered: 'lore_military_records',
  researchRecordsRecovered: 'lore_research_records',
  researchFacilityLocated: 'lore_facility_located',
  researchFacilityInvestigated: 'lore_facility_investigated',
  pathogenNatureKnown: 'lore_pathogen_nature',
  campaignResolved: 'campaign_resolved',
} as const;

export type LoreKey = keyof typeof LORE_FLAGS;

/** Faction ids (see data/factions.ts) in first-contact order. */
export const MAJOR_FACTION_IDS = ['remnant', 'commonwealth', 'purifiers', 'freeholds', 'seekers'] as const;

export interface CampaignLoreState {
  currentAct: number;
  outbreakTimelineKnown: boolean;
  earlyCasesDiscovered: boolean;
  infectedBehaviourAnomalyKnown: boolean;
  organisedInfectedKnown: boolean;
  lairResearchCompleted: boolean;
  remnantDiscovered: boolean;
  commonwealthDiscovered: boolean;
  purifiersDiscovered: boolean;
  freeholdsDiscovered: boolean;
  seekersDiscovered: boolean;
  militaryRecordsRecovered: boolean;
  researchRecordsRecovered: boolean;
  researchFacilityLocated: boolean;
  researchFacilityInvestigated: boolean;
  pathogenNatureKnown: boolean;
  finalProtocolAvailable: boolean;
  campaignResolved: boolean;
  campaignResolution?: CampaignResolution;
}

export type NarrativeFlags = Record<string, string | number | boolean>;

function flag(flags: NarrativeFlags, key: string): boolean {
  return Boolean(flags[key]);
}

/** Derive the global lore view from narrative flags (+ contacted factions). */
export function getLoreState(flags: NarrativeFlags, contactedFactionIds: string[] = []): CampaignLoreState {
  const contacted = new Set(contactedFactionIds);
  const pathogenNatureKnown = flag(flags, LORE_FLAGS.pathogenNatureKnown);
  const facilityInvestigated = flag(flags, LORE_FLAGS.researchFacilityInvestigated);
  const organised = flag(flags, LORE_FLAGS.organisedInfectedKnown);

  const resolutionRaw = flags['campaign_resolution'];
  const campaignResolution: CampaignResolution | undefined =
    resolutionRaw === 'cure' || resolutionRaw === 'purge' || resolutionRaw === 'coexistence'
      ? resolutionRaw
      : undefined;

  // Act progression is derived from what civilisation KNOWS, not from day
  // numbers (spec §24). Acts advance when their central discovery is made.
  let currentAct = 1;
  if (contacted.size > 0 || flag(flags, 'refused_strangers')) currentAct = 2;
  if (organised) currentAct = 3;
  if (flag(flags, LORE_FLAGS.militaryRecordsRecovered) || flag(flags, LORE_FLAGS.outbreakTimelineKnown)) currentAct = 4;
  if (facilityInvestigated) currentAct = 5;
  if (pathogenNatureKnown) currentAct = 6;

  return {
    currentAct,
    outbreakTimelineKnown: flag(flags, LORE_FLAGS.outbreakTimelineKnown),
    earlyCasesDiscovered: flag(flags, LORE_FLAGS.earlyCasesDiscovered),
    infectedBehaviourAnomalyKnown: flag(flags, LORE_FLAGS.infectedBehaviourAnomalyKnown),
    organisedInfectedKnown: organised,
    lairResearchCompleted: organised && flag(flags, LORE_FLAGS.infectedBehaviourAnomalyKnown),
    remnantDiscovered: contacted.has('remnant'),
    commonwealthDiscovered: contacted.has('commonwealth'),
    purifiersDiscovered: contacted.has('purifiers'),
    freeholdsDiscovered: contacted.has('freeholds'),
    seekersDiscovered: contacted.has('seekers'),
    militaryRecordsRecovered: flag(flags, LORE_FLAGS.militaryRecordsRecovered),
    researchRecordsRecovered: flag(flags, LORE_FLAGS.researchRecordsRecovered),
    researchFacilityLocated: flag(flags, LORE_FLAGS.researchFacilityLocated),
    researchFacilityInvestigated: facilityInvestigated,
    pathogenNatureKnown,
    finalProtocolAvailable: pathogenNatureKnown,
    campaignResolved: flag(flags, LORE_FLAGS.campaignResolved),
    campaignResolution,
  };
}

/**
 * The final-protocol choice is offered once the player understands what
 * happened (Act V complete). Used by content triggers via the `flag` condition.
 */
export function finalProtocolFlag(): { key: string; value: boolean } {
  return { key: LORE_FLAGS.pathogenNatureKnown, value: true };
}
