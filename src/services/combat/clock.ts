import { GameClockState, TimeOfDayPhase } from '../../types/combat';

// ==========================================
// 1. Initial State Helpers
// ==========================================

export function createInitialGameClock(): GameClockState {
  return {
    day: 1,
    hour: 8.0, // Starts at 8:00 AM on Day 1
    minute: 0,
    speed: 1, // 1x Normal speed
    phase: 'day',
    isNight: false,
    hordeWaveIntensity: 1,
    totalElapsedSeconds: 0,
  };
}

/**
 * Advance in-game clock by deltaTime seconds with speed multiplier
 * 1 in-game day = 360 real seconds at 1x speed (6 minutes per in-game day)
 * 1 in-game hour = 15 real seconds
 */
export function advanceGameClock(
  clock: GameClockState,
  realDeltaSeconds: number
): { newClock: GameClockState; dayChanged: boolean; nightfallTriggered: boolean; dawnTriggered: boolean } {
  if (clock.speed === 0) {
    return { newClock: clock, dayChanged: false, nightfallTriggered: false, dawnTriggered: false };
  }

  const effectiveDelta = realDeltaSeconds * clock.speed;
  // 1 in-game hour per 25 real seconds -> a full day-night cycle is 10 minutes at 1x.
  const inGameHoursAdvanced = effectiveDelta / 25.0;
  let newHour = clock.hour + inGameHoursAdvanced;
  let newDay = clock.day;
  let dayChanged = false;

  if (newHour >= 24.0) {
    newHour -= 24.0;
    newDay += 1;
    dayChanged = true;
  }

  const minute = Math.floor((newHour % 1) * 60);

  // Calculate phase (§6.1)
  let phase: TimeOfDayPhase = 'day';
  let isNight = false;

  if (newHour >= 5.0 && newHour < 7.0) {
    phase = 'dawn';
    isNight = false;
  } else if (newHour >= 7.0 && newHour < 19.0) {
    phase = 'day';
    isNight = false;
  } else if (newHour >= 19.0 && newHour < 21.0) {
    phase = 'dusk';
    isNight = false;
  } else {
    phase = 'night';
    isNight = true;
  }

  const nightfallTriggered = isNight && !clock.isNight;
  const dawnTriggered = !isNight && clock.isNight;

  const hordeWaveIntensity = Math.min(10, Math.floor(newDay * 1.5));

  const newClock: GameClockState = {
    day: newDay,
    hour: newHour,
    minute,
    speed: clock.speed,
    phase,
    isNight,
    hordeWaveIntensity,
    totalElapsedSeconds: clock.totalElapsedSeconds + effectiveDelta,
  };

  return { newClock, dayChanged, nightfallTriggered, dawnTriggered };
}

