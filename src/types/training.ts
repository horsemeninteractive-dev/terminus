/**
 * Shooting Range training (§Terminus extension of IFZ's combat training).
 *
 * A squad trains at an operational, powered Shooting Range. Training consumes
 * ammunition from the shared pool over real time and grants a permanent
 * combat proficiency tier: Untrained → Basic → Trained → Veteran → Expert.
 * Higher tiers take progressively longer (diminishing returns) and cap at
 * Expert, so a range cannot be an infinite XP fountain.
 */

export const TRAINING_TIER_LABELS = ['Untrained', 'Basic', 'Trained', 'Veteran', 'Expert'] as const;
export type TrainingTier = 0 | 1 | 2 | 3 | 4;

/** In-game sim-seconds required to COMPLETE each tier (1 game day = 600s). */
export const TRAINING_TIER_SEC = [0, 600, 1800, 3600, 7200];

/** Ammunition units consumed per tier, drawn from the shared pool. */
export const TRAINING_TIER_AMMO = [0, 10, 30, 60, 120];

export interface SquadTrainingSession {
  squadId: string;
  squadName: string;
  /** Highest completed tier (the squad's permanent proficiency). */
  tier: TrainingTier;
  /** Progress within the current tier, in sim-seconds. */
  progressSec: number;
  /** Ammo spent on this session so far. */
  ammoConsumed: number;
  /** The shooting range the squad trains at. */
  rangeBuildingId: string | number;
  startedAt: number;
}

export interface TrainingState {
  sessions: Map<string, SquadTrainingSession>;
  totalAmmoSpent: number;
}

export function createEmptyTrainingState(): TrainingState {
  return { sessions: new Map(), totalAmmoSpent: 0 };
}