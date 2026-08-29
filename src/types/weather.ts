// ==========================================
// Weather & Seasons System (§9)
// ==========================================

export type SeasonType = 'spring' | 'summer' | 'autumn' | 'winter';

export type MoonPhase = 'new' | 'waxing' | 'full' | 'waning';

export type WeatherType =
  | 'clear'
  | 'overcast'
  | 'rain'
  | 'thunderstorm'
  | 'dense_fog'
  | 'heatwave'
  | 'freezing_frost'
  | 'blizzard';

export interface SeasonInfo {
  id: SeasonType;
  name: string;
  cycleDayStart: number; // 1-indexed within year cycle (e.g. 1, 8, 15, 22)
  durationDays: number; // typically 7 days per season
  description: string;
  themeColor: string;
  ambientTempC: number;
  baseOutdoorCropModifier: number; // e.g. +0.25 in Spring, -0.75 in Winter
  zombieBehaviorTag: string;
  iconName: string;
}

export interface WeatherConditionInfo {
  id: WeatherType;
  name: string;
  description: string;
  iconName: string;
  themeColor: string;
  // Modifiers
  outdoorCropYieldMult: number; // 1.0 = normal, 0.25 = frost/blizzard
  zombieSpeedMult: number; // 1.0 = normal, 0.8 = freezing, 1.15 = heatwave
  zombieVisualRangeMult: number; // 1.0 = normal, 0.6 = dense fog/blizzard
  acousticSoundRadiusMult: number; // 1.0 = normal, 0.7 = rain dampening, 1.3 = fog echoing
  rainwaterCollectionBonus: number; // liters per cistern per day in rain
  isSevere: boolean;
}

export interface WeatherState {
  currentSeason: SeasonType;
  currentWeather: WeatherType;
  moonPhase: MoonPhase; // lunar cycle (§6.1): full moon calms the infected at night
  year: number; // Year 1, 2, etc.
  seasonDay: number; // Day 1 to 7 within the season
  temperatureC: number;
  windSpeedKmh: number;
  rainwaterCollectionActive: boolean;
  weatherDurationHours: number;
  weatherElapsedHours: number;
  // Greenhouse insulation status summary
  greenhouseInsulatedYield: number; // Yield from functional greenhouses (100% + tech bonuses)
  outdoorCropYield: number; // Affected by winter & severe weather
  effectiveCropYieldMultiplier: number;
}
