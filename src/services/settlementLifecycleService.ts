import type { SettlementRecord } from '../types/caravan';
import type { SettlementState } from '../types/settlement';
import { getPrimaryHQ } from './buildingOperational';

/**
 * Settlement lifecycle (§7.5): the simulation-side counterpart to the colony
 * registry model. A settlement is LOST when its HQ is destroyed OR every last
 * survivor has fallen. Loss is NOT campaign failure — the global network
 * (other colonies, relief caravans, or local reclamation) decides that.
 */

/** Total living people in a settlement state: specialists + general citizens. */
export function countSettlementSurvivors(state: SettlementState): number {
  const named = Array.isArray(state.namedSurvivors) ? state.namedSurvivors.length : 0;
  const general =
    typeof state.generalPopulation === 'number'
      ? state.generalPopulation
      : state.generalPopulation?.total || 0;
  return named + general;
}

export interface SettlementLossEvaluation {
  destroyed: boolean;
  reason: string | null;
  survivors: number;
}

/**
 * Evaluates whether the settlement should transition to `destroyed`. Only
 * meaningful for an established colony (needs an HQ); the pre-HQ founding
 * phase can never be lost.
 */
export function evaluateSettlementLoss(state: SettlementState): SettlementLossEvaluation {
  const survivors = countSettlementSurvivors(state);
  const commandCenter = getPrimaryHQ(state);
  if (!commandCenter) {
    return { destroyed: false, reason: null, survivors };
  }
  const hqDestroyed = (commandCenter.currentDurability ?? 1) <= 0;
  if (hqDestroyed) {
    return {
      destroyed: true,
      reason: 'Command center breached and overrun by the infected horde.',
      survivors,
    };
  }
  if (survivors <= 0) {
    return {
      destroyed: true,
      reason: 'Every last survivor has fallen. The sector is silent.',
      survivors,
    };
  }
  return { destroyed: false, reason: null, survivors };
}

/** Marks an existing record as destroyed, preserving the colony's final state. */
export function markSettlementDestroyed(
  record: SettlementRecord,
  day: number,
  reason: string,
  finalState: SettlementState
): SettlementRecord {
  return {
    ...record,
    status: 'destroyed',
    state: finalState,
    overrunAtDay: day,
    overrunReason: reason,
  };
}

/** Restores a destroyed colony after a successful reclaim (caravan or local). */
export function markSettlementReclaimed(record: SettlementRecord, day: number, restoredState: SettlementState): SettlementRecord {
  return {
    ...record,
    status: 'operational',
    state: restoredState,
    overrunAtDay: null,
    overrunReason: null,
  };
}