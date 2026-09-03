import { SettlementState } from '../types/settlement';
import { MapData } from '../types/map';
import { GameClockState } from '../types/combat';
import { advanceGameClock } from './combatService';
import { runSimulationPipeline, runEconomySimulationTick } from './simulationPipeline';

/**
 * Lightweight offline catch-up for inactive settlements.
 *
 * When the full map context is available the exact authoritative pipeline runs
 * step-by-step. When no map is present (the common case for background
 * colonies), the same map-independent economy stage chain runs instead — the
 * tactical stages (combat/vehicles/lairs) are skipped because there are no
 * squads, zombies, or world entities loaded for inactive settlements.
 *
 * The colony's clock genuinely advances through the elapsed time: the seed is
 * back-dated from the live universal clock (the moment the colony was last
 * simulated) and every step rolls day / hour / minute / phase / isNight forward
 * with `advanceGameClock`, exactly like the active colony's 100ms loop. The
 * economy therefore sees real night (production/construction/research pause,
 * workers shelter, gathering halts) instead of a frozen permanent noon.
 *
 * Simulation is bounded to a maximum of seven offline days per catch-up so a
 * long absence never produces a large spike.
 */
export interface OfflineSimulationResult {
  state: SettlementState;
  /** Depleted map (same identity as the input when nothing gathered). */
  mapData?: MapData;
  /** The colony clock after catch-up (day/hour/isNight at simulation end). */
  clock?: GameClockState;
}

/** Max offline catch-up: 7 real days. One in-game day = 600 real seconds. */
const MAX_OFFLINE_SECONDS = 86400 * 7;
/** In-game hours per 25 real seconds (same pace as the live simulation). */
const SECONDS_PER_IN_GAME_HOUR = 25;

function clockAtTotalHours(totalHours: number): GameClockState {
  const day = Math.max(0, Math.floor(totalHours / 24));
  const hour = Math.max(0, totalHours - day * 24);
  const minute = Math.floor((hour % 1) * 60);

  // Same phase windows as advanceGameClock (§6.1): 5-7 dawn, 7-19 day,
  // 19-21 dusk, 21-5 night.
  let phase: GameClockState['phase'] = 'night';
  let isNight = true;
  if (hour >= 5.0 && hour < 7.0) {
    phase = 'dawn';
    isNight = false;
  } else if (hour >= 7.0 && hour < 19.0) {
    phase = 'day';
    isNight = false;
  } else if (hour >= 19.0 && hour < 21.0) {
    phase = 'dusk';
    isNight = false;
  }

  return {
    day,
    hour,
    minute,
    speed: 1,
    phase,
    isNight,
    hordeWaveIntensity: Math.min(10, Math.floor(day * 1.5)),
    totalElapsedSeconds: 0,
  };
}

/**
 * Seed the offline colony's clock at the universal time it was last simulated:
 * the live clock back-dated by how long the colony was inactive. Falls back to
 * noon of `fallbackDay` when no live clock is available (legacy callers).
 */
function buildSeedClock(
  activeClock: GameClockState | undefined,
  fallbackDay: number,
  backRealSeconds: number
): GameClockState {
  if (!activeClock) {
    return clockAtTotalHours(12 + fallbackDay * 24);
  }
  const backInGameHours = backRealSeconds / SECONDS_PER_IN_GAME_HOUR;
  const lastTotalHours = activeClock.day * 24 + activeClock.hour - backInGameHours;
  return clockAtTotalHours(Math.max(0, lastTotalHours));
}

export function simulateSettlementOffline(
  state: SettlementState,
  elapsedSeconds: number,
  currentDay: number,
  mapData?: MapData,
  /** Live universal clock at catch-up time (used to resume the colony's phase). */
  activeClock?: GameClockState | null
): OfflineSimulationResult {
  const capped = Math.max(0, Math.min(elapsedSeconds, MAX_OFFLINE_SECONDS));
  if (capped <= 0) return { state, mapData };
  const step = 60;
  let result = state;
  let resultMap = mapData;
  // Resume where the colony left off on the universal timeline, then roll the
  // clock forward each step so night genuinely arrives for inactive colonies.
  let clock = buildSeedClock(activeClock || undefined, currentDay, capped);
  for (let remaining = capped; remaining > 0; remaining -= step) {
    const delta = Math.min(step, remaining);
    clock = advanceGameClock(clock, delta).newClock;
    if (mapData) {
      const stepResult = runSimulationPipeline({
        state: result,
        mapData: resultMap!,
        squads: [],
        zombies: [],
        hostileHumans: [],
        noiseEvents: [],
        droppedItems: [],
        clock,
        deltaSeconds: delta,
      });
      result = stepResult.state;
      // Carry the depleted node amounts into the next step and back to the
      // caller so far-away colonies keep their harvesting exhaustion.
      resultMap = stepResult.mapData;
    } else {
      result = runEconomySimulationTick(result, delta, 1, clock.day, clock.isNight).newState;
    }
  }
  return { state: result, mapData: resultMap, clock };
}
