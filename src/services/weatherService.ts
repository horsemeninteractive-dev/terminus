import { MoonPhase, SeasonInfo, SeasonType, WeatherConditionInfo, WeatherState, WeatherType } from '../types/weather';
import { SettlementState } from '../types/settlement';
import { isBuildingOperational } from './buildingOperational';
import { isResearchUnlocked } from './researchService';

// ==========================================
// 1. Season Constants & Definitions (§9)
// ==========================================

export const SEASON_DURATION_DAYS = 7;

export const SEASONS_CONFIG: Record<SeasonType, SeasonInfo> = {
  spring: {
    id: 'spring',
    name: 'Spring Thaw',
    cycleDayStart: 1,
    durationDays: SEASON_DURATION_DAYS,
    description: 'Temperate rains and warming soil. Outdoor crops sprout rapidly (+25% yield).',
    themeColor: '#10b981',
    ambientTempC: 16,
    baseOutdoorCropModifier: 1.25,
    zombieBehaviorTag: 'Standard Lurker Activity',
    iconName: 'Sprout',
  },
  summer: {
    id: 'summer',
    name: 'Summer Swelter',
    cycleDayStart: 8,
    durationDays: SEASON_DURATION_DAYS,
    description: 'High heat and intense sun. Baseline harvest; beware daytime heatwaves agitating runners.',
    themeColor: '#f59e0b',
    ambientTempC: 28,
    baseOutdoorCropModifier: 1.0,
    zombieBehaviorTag: 'Heat-Agitated Runners',
    iconName: 'Sun',
  },
  autumn: {
    id: 'autumn',
    name: 'Autumn Descent',
    cycleDayStart: 15,
    durationDays: SEASON_DURATION_DAYS,
    description: 'Chilly winds, fallen leaves, and thick fog. Dense fog muffles vision but echoes gunshots.',
    themeColor: '#d97706',
    ambientTempC: 12,
    baseOutdoorCropModifier: 1.1,
    zombieBehaviorTag: 'Fog-Concealed Lurkers',
    iconName: 'CloudFog',
  },
  winter: {
    id: 'winter',
    name: 'Winter Frost',
    cycleDayStart: 22,
    durationDays: SEASON_DURATION_DAYS,
    description: 'Deep freeze and howling blizzards. Outdoor crops wither (-75% yield) unless protected by Greenhouses.',
    themeColor: '#38bdf8',
    ambientTempC: -4,
    baseOutdoorCropModifier: 0.25, // -75% severe frost penalty
    zombieBehaviorTag: 'Cold Rigor Mortis (Slowed)',
    iconName: 'Snowflake',
  },
};

// ==========================================
// 2. Weather Condition Modifiers
// ==========================================

export const WEATHER_CONDITIONS: Record<WeatherType, WeatherConditionInfo> = {
  clear: {
    id: 'clear',
    name: 'Clear Skies',
    description: 'Optimal visibility, standard ambient conditions.',
    iconName: 'Sun',
    themeColor: '#facc15',
    outdoorCropYieldMult: 1.0,
    zombieSpeedMult: 1.0,
    zombieVisualRangeMult: 1.0,
    acousticSoundRadiusMult: 1.0,
    rainwaterCollectionBonus: 0,
    isSevere: false,
  },
  overcast: {
    id: 'overcast',
    name: 'Overcast & Dreary',
    description: 'Heavy overcast cloud layer dimming sunlight.',
    iconName: 'Cloud',
    themeColor: '#94a3b8',
    outdoorCropYieldMult: 0.95,
    zombieSpeedMult: 1.0,
    zombieVisualRangeMult: 0.95,
    acousticSoundRadiusMult: 1.0,
    rainwaterCollectionBonus: 0,
    isSevere: false,
  },
  rain: {
    id: 'rain',
    name: 'Steady Rain',
    description: 'Rainfall dampens gunshots (-30% noise) and fills water cisterns.',
    iconName: 'CloudRain',
    themeColor: '#64748B',
    outdoorCropYieldMult: 1.15,
    zombieSpeedMult: 0.95,
    zombieVisualRangeMult: 0.85,
    acousticSoundRadiusMult: 0.7,
    rainwaterCollectionBonus: 15,
    isSevere: false,
  },
  thunderstorm: {
    id: 'thunderstorm',
    name: 'Severe Thunderstorm',
    description: 'Heavy torrential downpour and roaring thunder masking acoustic events.',
    iconName: 'CloudLightning',
    themeColor: '#818cf8',
    outdoorCropYieldMult: 0.9,
    zombieSpeedMult: 0.9,
    zombieVisualRangeMult: 0.7,
    acousticSoundRadiusMult: 0.5,
    rainwaterCollectionBonus: 35,
    isSevere: true,
  },
  dense_fog: {
    id: 'dense_fog',
    name: 'Dense Ground Fog',
    description: 'Heavy mist slashing visual range (-40%) while echoing gunfire sound (+30%).',
    iconName: 'CloudFog',
    themeColor: '#a8a29e',
    outdoorCropYieldMult: 0.85,
    zombieSpeedMult: 0.95,
    zombieVisualRangeMult: 0.6,
    acousticSoundRadiusMult: 1.3,
    rainwaterCollectionBonus: 0,
    isSevere: false,
  },
  heatwave: {
    id: 'heatwave',
    name: 'Oppressive Heatwave',
    description: 'Scorching temperatures drying soil and driving infected into frenzies (+15% speed).',
    iconName: 'Flame',
    themeColor: '#ef4444',
    outdoorCropYieldMult: 0.75,
    zombieSpeedMult: 1.15,
    zombieVisualRangeMult: 1.0,
    acousticSoundRadiusMult: 1.0,
    rainwaterCollectionBonus: 0,
    isSevere: true,
  },
  freezing_frost: {
    id: 'freezing_frost',
    name: 'Freezing Frost',
    description: 'Sub-zero temperatures freezing outdoor soil. Shamblers slowed by cold stiffening.',
    iconName: 'ThermometerSnowflake',
    themeColor: '#38bdf8',
    outdoorCropYieldMult: 0.3,
    zombieSpeedMult: 0.8,
    zombieVisualRangeMult: 0.9,
    acousticSoundRadiusMult: 0.9,
    rainwaterCollectionBonus: 0,
    isSevere: true,
  },
  blizzard: {
    id: 'blizzard',
    name: 'Howling Blizzard',
    description: 'Whiteout snowstorm halting all outdoor agriculture. Greenhouses vital for survival.',
    iconName: 'Snowflake',
    themeColor: '#e0f2fe',
    outdoorCropYieldMult: 0.1,
    zombieSpeedMult: 0.75,
    zombieVisualRangeMult: 0.5,
    acousticSoundRadiusMult: 0.8,
    rainwaterCollectionBonus: 10,
    isSevere: true,
  },
};

// ==========================================
// 3. Helper Functions & Initializer
// ==========================================

export function getSeasonForDay(day: number): { season: SeasonType; seasonDay: number; year: number } {
  const normalizedDay = Math.max(1, Math.floor(day));
  const year = Math.floor((normalizedDay - 1) / (SEASON_DURATION_DAYS * 4)) + 1;
  const dayInYear = ((normalizedDay - 1) % (SEASON_DURATION_DAYS * 4)) + 1;

  if (dayInYear <= 7) {
    return { season: 'spring', seasonDay: dayInYear, year };
  } else if (dayInYear <= 14) {
    return { season: 'summer', seasonDay: dayInYear - 7, year };
  } else if (dayInYear <= 21) {
    return { season: 'autumn', seasonDay: dayInYear - 14, year };
  } else {
    return { season: 'winter', seasonDay: dayInYear - 21, year };
  }
}

// ==========================================
// 3b. Lunar Cycle & Zombie Activity Modifiers (§6.1 addition)
// ==========================================

/**
 * Deterministic 8-day lunar cycle. Full moon lands on cycle day 4 of each
 * week-long cycle, giving the player a predictable safer night window.
 */
export function getMoonPhase(day: number): MoonPhase {
  const cycleDay = ((Math.max(1, Math.floor(day)) - 1) % 8) + 1;
  if (cycleDay === 1) return 'new';
  if (cycleDay === 4) return 'full';
  if (cycleDay < 4) return 'waxing';
  return 'waning';
}

export interface ZombieActivityModifiers {
  // 0..1 — how strongly the infected ignore the sunlight-dormancy penalty
  // during the day (0 = fully dormant in clear sun, 1 = fully active).
  daytimeActivity: number;
  // Nighttime multiplier: < 1 means a calmer night (full moon).
  nightActivityMult: number;
  nightSightMult: number;
  label: string;
}

/**
 * Weather & moon modulation of the day/night dormancy gate (§6.1). Overcast,
 * rain and storm weather shield the infected from direct sunlight enough to
 * permit daytime activity; a full moon measurably reduces nighttime activity.
 */
export function getZombieActivityModifiers(
  weather: WeatherType | undefined,
  moonPhase: MoonPhase | undefined
): ZombieActivityModifiers {
  let daytimeActivity = 0;
  switch (weather) {
    case 'overcast':
      daytimeActivity = 0.45;
      break;
    case 'rain':
      daytimeActivity = 0.65;
      break;
    case 'thunderstorm':
      daytimeActivity = 0.85;
      break;
    case 'blizzard':
      daytimeActivity = 0.55;
      break;
    case 'dense_fog':
      daytimeActivity = 0.25;
      break;
    default:
      daytimeActivity = 0;
  }

  const isFullMoon = moonPhase === 'full';
  const nightActivityMult = isFullMoon ? 0.55 : 1.0;
  const nightSightMult = isFullMoon ? 0.7 : 1.0;

  const label =
    daytimeActivity > 0 && isFullMoon
      ? 'Overcast/storm daylight activity + calm full moon'
      : daytimeActivity > 0
      ? 'Weather-shielded daylight activity'
      : isFullMoon
      ? 'Full moon — reduced night aggression'
      : 'Standard sunlight dormancy';

  return { daytimeActivity, nightActivityMult, nightSightMult, label };
}

/**
 * Lightweight upcoming-weather forecast for the Weather Station / Early Warning
 * communications tech (§6.1, §10). Deterministic: simulates the next N weather
 * rolls for the current season so the player can plan around danger windows.
 */
export interface WeatherForecastEntry {
  hoursFromNow: number;
  weather: WeatherType;
  label: string;
  isSevere: boolean;
}

export function forecastUpcomingWeather(
  season: SeasonType,
  currentWeather: WeatherType,
  entries = 4
): WeatherForecastEntry[] {
  const forecast: WeatherForecastEntry[] = [];
  let previous = currentWeather;

  for (let i = 1; i <= entries; i++) {
    const next = pickWeatherForSeason(season, previous);
    forecast.push({
      hoursFromNow: i * 6,
      weather: next,
      label: WEATHER_CONDITIONS[next].name,
      isSevere: WEATHER_CONDITIONS[next].isSevere,
    });
    previous = next;
  }

  return forecast;
}

export function pickWeatherForSeason(season: SeasonType, current?: WeatherType): WeatherType {
  const roll = Math.random();
  switch (season) {
    case 'spring':
      if (roll < 0.4) return 'clear';
      if (roll < 0.7) return 'rain';
      if (roll < 0.9) return 'overcast';
      return 'thunderstorm';
    case 'summer':
      if (roll < 0.55) return 'clear';
      if (roll < 0.75) return 'heatwave';
      if (roll < 0.9) return 'overcast';
      return 'thunderstorm';
    case 'autumn':
      if (roll < 0.35) return 'dense_fog';
      if (roll < 0.6) return 'rain';
      if (roll < 0.85) return 'overcast';
      return 'clear';
    case 'winter':
      if (roll < 0.4) return 'freezing_frost';
      if (roll < 0.7) return 'blizzard';
      if (roll < 0.9) return 'overcast';
      return 'clear';
    default:
      return 'clear';
  }
}

export function createInitialWeatherState(day = 1): WeatherState {
  const { season, seasonDay, year } = getSeasonForDay(day);
  const weather = season === 'winter' ? 'freezing_frost' : 'clear';
  const seasonInfo = SEASONS_CONFIG[season];

  return {
    currentSeason: season,
    currentWeather: weather,
    moonPhase: getMoonPhase(day),
    year,
    seasonDay,
    temperatureC: seasonInfo.ambientTempC,
    windSpeedKmh: 12,
    rainwaterCollectionActive: false,
    weatherDurationHours: 12,
    weatherElapsedHours: 0,
    greenhouseInsulatedYield: 1.0,
    outdoorCropYield: seasonInfo.baseOutdoorCropModifier,
    effectiveCropYieldMultiplier: seasonInfo.baseOutdoorCropModifier,
  };
}

// ==========================================
// 4. Weather Simulation Tick (§9)
// ==========================================

export function tickWeatherSimulation(
  currentState: WeatherState,
  currentDay: number,
  deltaInGameHours: number,
  settlement: SettlementState
): {
  newState: WeatherState;
  weatherChanged: boolean;
  seasonChanged: boolean;
  notification?: { title: string; desc: string; type: 'info' | 'warn' | 'success' };
} {
  const { season, seasonDay, year } = getSeasonForDay(currentDay);
  let seasonChanged = season !== currentState.currentSeason;
  let weatherChanged = false;
  let newWeather = currentState.currentWeather;
  let elapsed = currentState.weatherElapsedHours + deltaInGameHours;
  let duration = currentState.weatherDurationHours;
  let notif: { title: string; desc: string; type: 'info' | 'warn' | 'success' } | undefined;

  if (seasonChanged) {
    newWeather = pickWeatherForSeason(season);
    weatherChanged = true;
    elapsed = 0;
    duration = 8 + Math.floor(Math.random() * 8);

    const sInfo = SEASONS_CONFIG[season];
    notif = {
      title: `SEASON ARRIVED: ${sInfo.name.toUpperCase()}`,
      desc: sInfo.description,
      type: season === 'winter' ? 'warn' : 'info',
    };
  } else if (elapsed >= duration) {
    newWeather = pickWeatherForSeason(season, currentState.currentWeather);
    weatherChanged = newWeather !== currentState.currentWeather;
    elapsed = 0;
    duration = 6 + Math.floor(Math.random() * 10);

    if (weatherChanged) {
      const wInfo = WEATHER_CONDITIONS[newWeather];
      notif = {
        title: `WEATHER SHIFT: ${wInfo.name}`,
        desc: wInfo.description,
        type: wInfo.isSevere ? 'warn' : 'info',
      };
    }
  }

  // Calculate Crop Yield Metrics
  const cropStats = calculateCropYieldFactors(season, newWeather, settlement);

  const seasonInfo = SEASONS_CONFIG[season];
  const weatherInfo = WEATHER_CONDITIONS[newWeather];
  const tempOffset = newWeather === 'heatwave' ? 8 : newWeather === 'blizzard' ? -10 : newWeather === 'freezing_frost' ? -6 : 0;
  const temperatureC = seasonInfo.ambientTempC + tempOffset;

  const isRain = newWeather === 'rain' || newWeather === 'thunderstorm';

  const newState: WeatherState = {
    currentSeason: season,
    currentWeather: newWeather,
    moonPhase: getMoonPhase(currentDay),
    year,
    seasonDay,
    temperatureC,
    windSpeedKmh: newWeather === 'blizzard' || newWeather === 'thunderstorm' ? 45 : 12,
    rainwaterCollectionActive: isRain,
    weatherDurationHours: duration,
    weatherElapsedHours: elapsed,
    greenhouseInsulatedYield: cropStats.greenhouseMultiplier,
    outdoorCropYield: cropStats.outdoorMultiplier,
    effectiveCropYieldMultiplier: cropStats.effectiveMultiplier,
  };

  return {
    newState,
    weatherChanged,
    seasonChanged,
    notification: notif,
  };
}

// ==========================================
// 5. Crop Yield & Greenhouse Mitigation (§9, §10)
// ==========================================

export interface CropYieldBreakdown {
  outdoorMultiplier: number;
  greenhouseMultiplier: number;
  effectiveMultiplier: number;
  greenhouseCount: number;
  isGreenhouseMitigatingWinter: boolean;
  hasHydroponicsTech: boolean;
  hasPermacultureTech: boolean;
  summaryText: string;
}

export function calculateCropYieldFactors(
  season: SeasonType,
  weather: WeatherType,
  settlement: SettlementState
): CropYieldBreakdown {
  const seasonInfo = SEASONS_CONFIG[season];
  const weatherInfo = WEATHER_CONDITIONS[weather];

  // Base outdoor multiplier
  const outdoorMultiplier = seasonInfo.baseOutdoorCropModifier * weatherInfo.outdoorCropYieldMult;

  // Count functional greenhouses (completed)
  const allBuildings = [
    ...Array.from(settlement.adaptedBuildings.values()),
    ...settlement.freestandingBuildings,
  ];

  const greenhouseCount = allBuildings.filter(
    (b) => b.typeId === 'greenhouse_hydro' && isBuildingOperational(b)
  ).length;

  const hasHydroponicsTech = isResearchUnlocked(settlement, 'greenhouses');
  const hasPermacultureTech = isResearchUnlocked(settlement, 'fertilization_techniques');

  // Greenhouse is fully insulated from winter frost (-75% does not apply to greenhouses!)
  let greenhouseMultiplier = 1.0;
  if (hasHydroponicsTech) greenhouseMultiplier += 0.4;
  if (hasPermacultureTech) greenhouseMultiplier += 0.5;

  const isWinter = season === 'winter';
  const isGreenhouseMitigatingWinter = isWinter && greenhouseCount > 0;

  // Effective blend: if there are greenhouses, they buffer the colony's food production
  let effectiveMultiplier = outdoorMultiplier;
  if (greenhouseCount > 0) {
    // Each greenhouse provides high-yield insulated capacity
    const greenhouseWeight = Math.min(0.85, greenhouseCount * 0.35);
    effectiveMultiplier = outdoorMultiplier * (1 - greenhouseWeight) + greenhouseMultiplier * greenhouseWeight;
  }

  let summaryText = '';
  if (isWinter) {
    if (greenhouseCount > 0) {
      summaryText = `Winter Frost (-75% Outdoor) mitigated by ${greenhouseCount} Hydroponic Greenhouse(s) [${Math.round(greenhouseMultiplier * 100)}% Insulated Yield]`;
    } else {
      summaryText = `CRITICAL: Winter Frost destroying outdoor crops (-75% yield)! Adapt Greenhouses or research Hydroponics to survive.`;
    }
  } else {
    summaryText = `${seasonInfo.name}: ${Math.round(effectiveMultiplier * 100)}% Crop Yield (${weatherInfo.name})`;
  }

  return {
    outdoorMultiplier,
    greenhouseMultiplier,
    effectiveMultiplier,
    greenhouseCount,
    isGreenhouseMitigatingWinter,
    hasHydroponicsTech,
    hasPermacultureTech,
    summaryText,
  };
}
