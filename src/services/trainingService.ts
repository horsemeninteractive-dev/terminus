import { TrainingState, TrainingTier, TRAINING_TIER_AMMO, TRAINING_TIER_LABELS, TRAINING_TIER_SEC, createEmptyTrainingState, SquadTrainingSession } from '../types/training';
import { SettlementState } from '../types/settlement';
import type { ToastMessage } from './soundService';
import { isBuildingOperational } from './buildingOperational';
import { getPoweredBuildingIds } from './powerService';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../data/functionalBuildings';

/**
 * Shooting Range training — turns spare ammunition into permanent military
 * capability. Training consumes ammo from the shared pool over time and
 * grants a permanent proficiency tier (Untrained → Basic → Trained → Veteran
 * → Expert). Higher tiers take progressively longer, capping at Expert, so a
 * range can never be an infinite XP fountain.
 */

export const TRAINING_BASE_AMMO_PER_DAY = 4;

export function getSquadTrainingBonus(tier: number): {
  dmgMultiplier: number;
  critBonus: number;
  fireRateMultiplier: number;
} {
  return {
    dmgMultiplier: 1 + 0.06 * tier,
    critBonus: 0.01 * tier,
    fireRateMultiplier: Math.max(0.6, 1 - 0.05 * tier),
  };
}

/** True when an operational Shooting Range is receiving power. */
export function findPoweredRange(state: SettlementState): { buildingId: string | number; name: string } | null {
  const powered = getPoweredBuildingIds(state);
  const all = [
    ...Array.from(state.adaptedBuildings.values()),
    ...(state.freestandingBuildings || []),
  ];
  for (const b of all) {
    if (b.typeId === 'shooting_range' && isBuildingOperational(b) && powered.has(String(b.buildingId))) {
      return { buildingId: b.buildingId, name: b.name || 'Shooting Range' };
    }
  }
  return null;
}

export interface StartTrainingResult {
  ok: boolean;
  error?: string;
  /** The created session when ok — the caller stamps it into state. */
  session?: SquadTrainingSession;
}

/**
 * Starts a training session for a squad at a powered range. The squad must
 * not already be training; the ammo for the next tier must be affordable.
 */
export function startSquadTraining(
  state: SettlementState,
  squadId: string,
  now: number
): StartTrainingResult {
  const squad = (state.squads || []).find((s) => s.id === squadId);
  if (!squad) return { ok: false, error: 'Squad not found.' };
  const sessions = state.trainingState?.sessions || new Map<string, SquadTrainingSession>();
  if (sessions.has(squadId)) return { ok: false, error: 'This squad is already in training.' };
  const range = findPoweredRange(state);
  if (!range) {
    return { ok: false, error: 'No powered Shooting Range is available — build one and keep its generator running.' };
  }
  const currentTier = squad.trainingTier ?? 0;
  const nextTier = Math.min(4, currentTier + 1) as TrainingTier;
  if (currentTier >= 4) return { ok: false, error: 'This squad is already Expert.' };
  const ammoNeeded = TRAINING_TIER_AMMO[nextTier];
  if ((state.stockpile?.ammo?.sharedPool || 0) < ammoNeeded) {
    return { ok: false, error: `Not enough ammunition for the ${TRAINING_TIER_LABELS[nextTier]} course (${ammoNeeded} needed).` };
  }

  return {
    ok: true,
    session: {
      squadId,
      squadName: squad.name,
      tier: currentTier as TrainingTier,
      progressSec: 0,
      ammoConsumed: 0,
      rangeBuildingId: range.buildingId,
      startedAt: now,
    },
  };
}

export function stopSquadTraining(state: SettlementState, squadId: string): SettlementState {
  const sessions = state.trainingState?.sessions
    ? new Map(state.trainingState.sessions)
    : new Map<string, SquadTrainingSession>();
  sessions.delete(squadId);
  return {
    ...state,
    trainingState: {
      sessions,
      totalAmmoSpent: state.trainingState?.totalAmmoSpent ?? 0,
    },
  };
}

export interface TrainingTickResult {
  newState: SettlementState;
  events: ToastMessage[];
}

/**
 * Advances every active session: draws ammo from the shared pool (pausing
 * when dry), advances progress while the range stays powered, and promotes
 * the squad at each tier threshold. Tier ups are permanent on the roster.
 */
export function tickSquadTraining(state: SettlementState, effectiveDeltaSec: number, now: number): TrainingTickResult {
  const events: ToastMessage[] = [];
  const sessions = state.trainingState?.sessions
    ? new Map(state.trainingState.sessions)
    : new Map<string, SquadTrainingSession>();
  if (sessions.size === 0) return { newState: state, events };
  const poweredIds = getPoweredBuildingIds(state);
  const dayFraction = effectiveDeltaSec / 600;
  const ammoPool = state.stockpile?.ammo;
  let totalAmmoSpent = state.trainingState?.totalAmmoSpent ?? 0;

  const squads = (state.squads || []).map((sq) => ({ ...sq }));

  for (const [squadId, session] of sessions) {
    const squad = squads.find((s) => s.id === squadId);
    if (!squad) {
      sessions.delete(squadId);
      continue;
    }
    let s = { ...session };

    // The range must exist, stay operational, and stay powered.
    const rangePowered = poweredIds.has(String(s.rangeBuildingId));
    if (!rangePowered) continue;

    // Draw the tier's ammo up-front is done at start; ongoing sessions draw a
    // steady trickle so a session actually costs ammunition over time.
    const ammoCost = TRAINING_BASE_AMMO_PER_DAY * dayFraction;
    if ((ammoPool?.sharedPool || 0) < ammoCost) {
      // Dry range: progress holds (no progress without ammo), no draw.
      continue;
    }
    if (ammoPool) ammoPool.sharedPool = Math.max(0, (ammoPool.sharedPool || 0) - ammoCost);
    totalAmmoSpent += ammoCost;
    s.ammoConsumed += ammoCost;

    const nextTier = Math.min(4, s.tier + 1) as TrainingTier;
    const targetSec = TRAINING_TIER_SEC[nextTier];
    s.progressSec += effectiveDeltaSec;
    if (s.progressSec >= targetSec) {
      s.tier = nextTier;
      s.progressSec = 0;
      // Permanent: stamp the roster record.
      const roster = squads.find((x) => x.id === squadId);
      if (roster) roster.trainingTier = nextTier;
      events.push({
        title: 'TRAINING COMPLETE',
        desc: `${s.squadName} reached ${TRAINING_TIER_LABELS[nextTier]} proficiency at the Shooting Range.`,
        type: 'success',
      });
      if (nextTier >= 4) {
        sessions.delete(squadId);
        continue;
      }
    }
    sessions.set(squadId, s);
  }

  return {
    newState: {
      ...state,
      squads,
      stockpile: state.stockpile ? { ...state.stockpile, ammo: ammoPool } : state.stockpile,
      trainingState: { sessions, totalAmmoSpent },
    },
    events,
  };
}

export { createEmptyTrainingState };