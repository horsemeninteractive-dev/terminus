import { StatTier, SurvivorStats } from './population';

// ==========================================
// 1. Field Infection & Incubation Model (§6.2)
// ==========================================

export type InfectionStage =
  | 'uninfected'
  | 'incubation'     // Hidden stage: pathogen incubates, no outward symptoms yet
  | 'symptomatic'    // Visible symptoms: fever, pallor, tremors, sweating
  | 'advanced'       // Severe symptoms: necrotic veins, delirium, failing vitals
  | 'turned'         // Turned into an infected zombie
  | 'cured';         // Successfully cured/immunized

export interface SurvivorInfection {
  id: string; // matches survivor id
  survivorId: string;
  survivorName: string;
  isNamed: boolean;
  stage: InfectionStage;
  bittenAt: number;
  incubationDurationSec: number;    // e.g. 75 - 110s
  symptomDurationSec: number;       // e.g. 90 - 130s
  advancedDurationSec: number;      // e.g. 60 - 90s
  totalTurnTimeSec: number;         // Total seconds from bite to turn
  elapsedSec: number;
  isConfirmedByMedbay: boolean;     // Has had medbay triage check-up to confirm diagnosis
  isQuarantined: boolean;           // Confined to isolation ward / quarantine quarters
  quarantineBuildingId?: string | number;
  treatmentAttempts: number;
  lastTreatedAt?: number;
  symptomsNoticedAt?: number;
  biteSource?: string;              // e.g. "Runner Melee Claw", "Infested Building Ambush", "Field Skirmish"
}

// ==========================================
// 1b. General Population Illness (§IFZ aggregated model)
// ==========================================
// Anonymous citizens are NOT individually tracked — that is the entire point
// of the general population pool. Illness therefore lives at POPULATION level
// as an ESS-style aggregated state: compartments of the settlement headcount
// that progress, spread, and resolve as counts. Only NAMED survivors get a
// per-person `SurvivorInfection` record (the Terminus extension).

/** Aggregated general-population illness compartments. Every field is a
 *  head-count; the sums always reconcile against `generalPopulation.total`. */
export interface PopulationInfectionState {
  /** Latent carriers: infected but not yet visibly ill and not (yet)
   *  detectable without Early Diagnosis. They can spread a little. */
  exposed: number;
  /** Visibly sick: confirmed cases consuming medbay capacity. */
  symptomatic: number;
  /** Sick patients currently isolated in medical quarantine beds. */
  quarantined: number;
  /** Cumulative turned/dead from population illness this settlement's life
   *  (memoir/statistics counter — active losses leave the compartments). */
  totalLost: number;
  /** Cumulative recovered through treatment (or naturally). */
  totalRecovered: number;
  /** Real-seconds accumulator for the aggregated progression tick. */
  accumSec: number;
  /** Real-seconds accumulator for new-exposure rolls. */
  spreadAccumSec: number;
}

export function createEmptyPopulationInfectionState(): PopulationInfectionState {
  return {
    exposed: 0,
    symptomatic: 0,
    quarantined: 0,
    totalLost: 0,
    totalRecovered: 0,
    accumSec: 0,
    spreadAccumSec: 0,
  };
}

// ==========================================
// 2. Settlement Outbreak State (§6.3)
// ==========================================

export interface BuildingOutbreakState {
  buildingId: string | number;
  buildingName: string;
  isOutbreakActive: boolean;
  zombieCount: number;
  spawnedZombieIds: string[];
  spreadCountdownSec: number;      // e.g. 30 seconds before spreading to adjacent buildings if uncontained
  maxSpreadCountdownSec: number;
  isContained: boolean;
  turnedSurvivorName?: string;
  originTime: number;
}

// ==========================================
// 3. Fallen Heroes & Permanent Death Memorial (§6.2, §6.3)
// ==========================================

export type DeathCause =
  | 'combat_slain'
  | 'infection_turned'
  | 'outbreak_casualty'
  | 'euthanized_quarantine';

export interface FallenHeroRecord {
  id: string;
  survivorId: string;
  name: string;
  avatarSeed?: string;
  isNamed: boolean;
  stats?: SurvivorStats;
  roleDescription: string;
  diedAtInGameDay: number;
  diedAtTimestamp: number;
  causeOfDeath: DeathCause;
  locationName: string;
  details: string;
}

// ==========================================
// 4. Medical Triage & Treatment Specs (§6.2)
// ==========================================

export interface TreatmentResult {
  success: boolean;
  cured: boolean;
  turned: boolean;
  cureOddsPercentage: number;
  doctorBonusPercentage: number;
  doctorName?: string;
  message: string;
}

export interface CheckupDiagnosis {
  survivorId: string;
  survivorName: string;
  isInfected: boolean;
  stage: InfectionStage;
  pathogenLoad: number; // 0 to 100%
  remainingTurnSeconds: number;
  currentCureOdds: number; // 0 to 100%
  recommendedAction: 'immediate_treatment' | 'quarantine_isolate' | 'healthy_discharge' | 'terminal_isolation';
  doctorNotes: string;
}
