import { useCallback, useMemo, useReducer, useRef, useEffect } from 'react';
import { createInitialGameClock } from '../services/combatService';
import type {
  DroppedItem,
  GameClockState,
  HostileHumanUnit,
  NoiseEvent,
  TacticalSquadUnit,
  ZombieUnit,
} from '../types/combat';

/**
 * Core combat-simulation domain state (§5, §5.1, §6.1).
 *
 * This is the state the 100ms combat tick and the sim loop hammer every frame,
 * and it mutates from six different action hooks. It lives in ONE reducer so:
 *
 * 1. Cross-slice invariants (e.g. zombiesKilled tally + zombie death) commit
 *    atomically instead of via choreographed multi-setState calls.
 * 2. A tick that touches several slices produces ONE render, not five.
 * 3. Future transition logic (spawn/kill/capture) gets a single audit point.
 *
 * The rest of useGameState's UI state (modals, layer toggles, selection) is
 * deliberately left alone — it changes at human speed, not sim speed.
 *
 * Public API: each slice keeps its raw state plus a
 * `Dispatch<SetStateAction<T>>`-shaped setter, so every existing call site
 * (`useSimulationLoop`, `useSquadActions`, `useThreatActions`, `useSaveLoad`,
 * `useMapLoading`, `useWorldEffects`) works unchanged.
 */

export interface CombatDomainState {
  gameClock: GameClockState;
  zombies: ZombieUnit[];
  combatSquads: TacticalSquadUnit[];
  hostileHumans: HostileHumanUnit[];
  droppedItems: DroppedItem[];
  noiseEvents: NoiseEvent[];
  activeRansomHideoutId: string | number | null;
}

export type CombatDomainAction =
  | { type: 'gameClock'; set: SetState<GameClockState> }
  | { type: 'zombies'; set: SetState<ZombieUnit[]> }
  | { type: 'combatSquads'; set: SetState<TacticalSquadUnit[]> }
  | { type: 'hostileHumans'; set: SetState<HostileHumanUnit[]> }
  | { type: 'droppedItems'; set: SetState<DroppedItem[]> }
  | { type: 'noiseEvents'; set: SetState<NoiseEvent[]> }
  | { type: 'activeRansomHideoutId'; set: SetState<string | number | null> }
  /** Atomic multi-slice commit — the combat tick's main entry point. */
  | { type: 'tickCommit'; patch: Partial<CombatDomainState> };

/** Mirrors React's `SetStateAction<T>`: value or updater function. */
type SetState<T> = T | ((prev: T) => T);

function applySet<T>(prev: T, set: SetState<T>): T {
  return typeof set === 'function' ? (set as (p: T) => T)(prev) : set;
}

export function combatDomainReducer(
  state: CombatDomainState,
  action: CombatDomainAction
): CombatDomainState {
  switch (action.type) {
    case 'gameClock':
      return { ...state, gameClock: applySet(state.gameClock, action.set) };
    case 'zombies':
      return { ...state, zombies: applySet(state.zombies, action.set) };
    case 'combatSquads':
      return { ...state, combatSquads: applySet(state.combatSquads, action.set) };
    case 'hostileHumans':
      return { ...state, hostileHumans: applySet(state.hostileHumans, action.set) };
    case 'droppedItems':
      return { ...state, droppedItems: applySet(state.droppedItems, action.set) };
    case 'noiseEvents':
      return { ...state, noiseEvents: applySet(state.noiseEvents, action.set) };
    case 'activeRansomHideoutId':
      return {
        ...state,
        activeRansomHideoutId: applySet(state.activeRansomHideoutId, action.set),
      };
    case 'tickCommit': {
      // Only touch slices present in the patch so unchanged slices keep their
      // identity (avoids needless re-renders in consumers subscribed to them).
      let changed = false;
      const next: CombatDomainState = { ...state };
      for (const key of Object.keys(action.patch) as (keyof CombatDomainState)[]) {
        const value = action.patch[key];
        if (value !== undefined && value !== state[key]) {
          (next as unknown as Record<string, unknown>)[key] = value;
          changed = true;
        }
      }
      return changed ? next : state;
    }
    default:
      return state;
  }
}

export function createInitialCombatDomainState(): CombatDomainState {
  return {
    gameClock: createInitialGameClock(),
    zombies: [],
    combatSquads: [],
    hostileHumans: [],
    droppedItems: [],
    noiseEvents: [],
    activeRansomHideoutId: null,
  };
}

/**
 * Domain reducer + setter shims shaped exactly like the old useState pairs.
 * `combatSquadsRef` is preserved: the 100ms combat interval reads it to avoid
 * the stale-closure race, and it is kept in lock-step via effect (not render
 * assignment) so concurrent updates never leave it behind.
 */
export function useCombatState() {
  const [state, dispatch] = useReducer(
    combatDomainReducer,
    undefined,
    createInitialCombatDomainState
  );

  const combatSquadsRef = useRef<TacticalSquadUnit[]>([]);
  useEffect(() => {
    combatSquadsRef.current = state.combatSquads;
  }, [state.combatSquads]);

  const makeSetter = useCallback(
    <K extends keyof CombatDomainState>(kind: K) =>
      (set: SetState<CombatDomainState[K]>) => {
        dispatch({ type: kind, set } as CombatDomainAction);
      },
    []
  );

  // Setter identities are STABLE for the hook's lifetime (same contract as
  // useState setters). Built in a memo keyed only on the stable makeSetter —
  // if they were rebuilt per state change, every consumer useCallback keyed on
  // a setter would re-create at sim-tick frequency.
  const setters = useMemo(
    () => ({
      setGameClock: makeSetter('gameClock'),
      setZombies: makeSetter('zombies'),
      setCombatSquads: makeSetter('combatSquads'),
      setHostileHumans: makeSetter('hostileHumans'),
      setDroppedItems: makeSetter('droppedItems'),
      setNoiseEvents: makeSetter('noiseEvents'),
      setActiveRansomHideoutId: makeSetter('activeRansomHideoutId'),
      /** One dispatch for the whole combat-tick result → one render. */
      commitTickResult: (patch: Partial<CombatDomainState>) =>
        dispatch({ type: 'tickCommit', patch }),
    }),
    [makeSetter]
  );

  return useMemo(
    () => ({
      ...state,
      combatSquadsRef,
      ...setters,
    }),
    // State slices are the render-driving values; setters are stable.
    [state, setters]
  );
}

export type UseCombatStateResult = ReturnType<typeof useCombatState>;
