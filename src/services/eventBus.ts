/**
 * Lightweight in-memory game-event journal.
 *
 * Services emit domain events (HQ_ESTABLISHED, LAIR_CLEARED, …) that the
 * mission engine consumes. The journal is capped and monotonic (ids increase),
 * so consumers can track `lastSeenId` for incremental reads. The mission
 * system ALSO derives events from a persisted world snapshot, which makes
 * event triggers work even for systems that never call emitGameEvent, and
 * keeps triggers idempotent across save/load + offline catch-up.
 */
import { GameEventPayloadMap, GameEventRecord, GameEventType } from '../types/narrativeEvent';

const MAX_JOURNAL = 500;
let journal: GameEventRecord[] = [];
let nextId = 1;

export function emitGameEvent<T extends GameEventType>(
  type: T,
  payload?: T extends keyof GameEventPayloadMap ? GameEventPayloadMap[T] : Record<string, unknown>
): GameEventRecord<T> {
  const record: GameEventRecord<T> = {
    id: nextId++,
    type,
    timestamp: Date.now(),
    payload: payload as any,
  };
  journal.push(record as GameEventRecord);
  if (journal.length > MAX_JOURNAL) {
    journal.splice(0, journal.length - MAX_JOURNAL);
  }
  return record;
}

export function getLatestEventId(): number {
  return nextId - 1;
}

export function getGameEventJournal(): GameEventRecord[] {
  return [...journal];
}

export function readGameEventsSince(lastId: number): GameEventRecord[] {
  return journal.filter((e) => e.id > lastId);
}

/** Test-only reset. */
export function resetGameEventBus(): void {
  journal = [];
  nextId = 1;
}