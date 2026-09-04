/**
 * Transmission queue service — the engine half of the radio system.
 *
 * Responsibilities:
 *  - materialise content definitions into live transmissions
 *  - enqueue without duplicates (simulation ticks run continuously)
 *  - maintain the ordered unread queue (multiple pending transmissions)
 *  - advance `currentIncomingTransmission` to the next unread entry
 *  - recompute unread counts after read/acknowledge
 */
import {
  RadioDirectiveState,
  RadioTransmission,
  TransmissionDefinition,
} from '../types/radioDirective';

export const DEFAULT_FREQUENCY = '104.20 MHz';

export function buildTransmission(
  def: TransmissionDefinition,
  timestamp: string
): RadioTransmission {
  return {
    id: def.id,
    classification: def.classification,
    callsign: def.callsign,
    frequency: def.frequency || DEFAULT_FREQUENCY,
    timestamp,
    title: def.title,
    message: def.message,
    audioCue: def.audioCue,
    requiresAcknowledgement: def.requiresAcknowledgement,
    priority: def.priority,
    source: def.source,
    missionId: def.missionId,
    responseOptions: def.responseOptions,
    isRead: false,
  };
}

/** Ordered list of unread transmissions (queue order preserved). */
export function getIncomingQueue(state: RadioDirectiveState): RadioTransmission[] {
  const queue = state.incomingQueue || [];
  const byId = new Map(state.transmissionLog.map((t) => [t.id, t]));
  return queue
    .map((id) => byId.get(id))
    .filter((t): t is RadioTransmission => Boolean(t && !t.isRead));
}

export function hasPendingIncoming(state: RadioDirectiveState): boolean {
  return getIncomingQueue(state).length > 0;
}

/**
 * Enqueue a transmission. Dedupes by id (the sim ticks continuously and
 * several hooks re-run the radio update — a transmission must never appear
 * twice). New unread transmissions join the back of the queue; the current
 * incoming pointer only advances to the front entry.
 */
export function enqueueTransmission(
  state: RadioDirectiveState,
  tx: RadioTransmission
): RadioDirectiveState {
  if (state.transmissionLog.some((t) => t.id === tx.id)) {
    return state;
  }
  const queue = [...(state.incomingQueue || [])];
  if (!tx.isRead && !queue.includes(tx.id)) {
    queue.push(tx.id);
  }
  const unreadCount = state.unreadCount + (tx.isRead ? 0 : 1);
  const nextIncoming = queue.length > 0 ? queue[0] : null;
  const currentIncoming = nextIncoming
    ? state.transmissionLog.find((t) => t.id === nextIncoming) || tx
    : state.currentIncomingTransmission;
  return {
    ...state,
    transmissionLog: [tx, ...state.transmissionLog],
    incomingQueue: queue,
    unreadCount,
    currentIncomingTransmission: tx.isRead ? currentIncoming : currentIncoming,
  };
}

/** Enqueue several transmissions in order (dedupe applies per item). */
export function enqueueTransmissions(
  state: RadioDirectiveState,
  txs: RadioTransmission[]
): RadioDirectiveState {
  let next = state;
  for (const tx of txs) {
    next = enqueueTransmission(next, tx);
  }
  return next;
}

/**
 * Mark a transmission read and advance the incoming pointer to the next
 * unread queued entry (or null when the queue is empty). The pointer must
 * never be left on an already-read transmission.
 */
export function markTransmissionRead(
  state: RadioDirectiveState,
  transmissionId: string
): RadioDirectiveState {
  const tx = state.transmissionLog.find((t) => t.id === transmissionId);
  if (!tx) return state;
  const newLog = state.transmissionLog.map((t) =>
    t.id === transmissionId ? { ...t, isRead: true } : t
  );
  const queue = (state.incomingQueue || []).filter((id) => id !== transmissionId);
  const unreadCount = newLog.filter((t) => !t.isRead).length;
  const nextIncoming = queue.length > 0
    ? newLog.find((t) => t.id === queue[0]) || null
    : newLog.find((t) => !t.isRead) || null;
  return {
    ...state,
    transmissionLog: newLog,
    incomingQueue: queue,
    unreadCount,
    currentIncomingTransmission: nextIncoming,
  };
}

export function acknowledgeTransmission(
  state: RadioDirectiveState,
  transmissionId: string
): RadioDirectiveState {
  return markTransmissionRead(state, transmissionId);
}