import { SeasonType, WeatherType } from './weather';

export type GameDifficulty = 'easy' | 'normal' | 'hard' | 'nightmare' | 'custom';

export type BannerStyleId =
  | 'torn_standard'
  | 'shield'
  | 'swallowtail'
  | 'pennant'
  | 'military_ribbon'
  | 'notched_gonfalon'
  | 'guilloche_taper'
  | 'fortified_tower'
  | 'sigil_rhombus'
  | 'heater_shield'
  | 'bident_fork'
  | 'battlement_gate'
  | 'triangular_flag'
  | 'hexagon_crest'
  | 'rounded_shield'
  | 'chevron_bottom'
  | 'double_swallowtail'
  | 'shield_gothic'
  | 'oriflamme'
  | 'vanguard_blade'
  | 'spartan_crest'
  | 'broad_standard'
  | 'hex_bastion';

export type BannerIconId =
  // Combat & Defense
  | 'sword'
  | 'shield'
  | 'skull'
  | 'crosshair'
  | 'target'
  | 'axe'
  | 'bomb'
  | 'zap'
  | 'shield_alert'
  | 'swords'
  | 'shield_off'
  | 'shield_check'
  | 'siren'
  | 'trophy'
  | 'medal'
  | 'shield_question'
  | 'radar'
  | 'radiation'
  // Survival & Medical & Nature
  | 'flame'
  | 'biohazard'
  | 'heart_pulse'
  | 'radio'
  | 'compass'
  | 'tent'
  | 'sun'
  | 'moon'
  | 'cloud_rain'
  | 'snowflake'
  | 'tree_pine'
  | 'mountain'
  | 'fish'
  | 'apple'
  | 'wheat'
  | 'sprout'
  | 'stethoscope'
  | 'syringe'
  | 'pill'
  | 'thermometer'
  | 'flashlight'
  | 'leaf'
  | 'droplet'
  | 'bone'
  | 'paw_print'
  | 'bird'
  | 'bug'
  // Leadership & Heraldry
  | 'crown'
  | 'flag'
  | 'award'
  | 'eye'
  | 'anchor'
  | 'key'
  | 'lock'
  | 'feather'
  | 'landmark'
  | 'scale'
  | 'sparkles'
  | 'infinity'
  | 'gem'
  | 'fingerprint'
  | 'globe'
  | 'star'
  | 'bell'
  | 'shield_ban'
  | 'cross_icon'
  | 'tower_control'
  // Industry & Technology
  | 'wrench'
  | 'hammer'
  | 'pickaxe'
  | 'cog'
  | 'factory'
  | 'truck'
  | 'cpu'
  | 'battery_charging'
  | 'fuel'
  | 'lightbulb'
  | 'boxes'
  | 'package'
  | 'antenna'
  | 'gauge'
  | 'hard_hat'
  | 'anvil'
  | 'satellite'
  | 'circuit_board';

export type BannerPatternId =
  | 'solid'
  | 'stripes'
  | 'split'
  | 'chevron'
  | 'cross'
  | 'checker'
  | 'camo'
  | 'sunburst'
  | 'diamonds'
  | 'horizontal_stripes'
  | 'vertical_stripes'
  | 'quarters'
  | 'saltire'
  | 'honeycomb'
  | 'dots_matrix'
  | 'vignette_glow'
  | 'hazard_stripes'
  | 'circuit_grid'
  | 'sunburst_radial'
  | 'chevron_triple'
  | 'cross_nordic'
  | 'scallop_scale'
  | 'diamond_lattice'
  | 'camo_digital';

export interface ColonyBannerConfig {
  style: BannerStyleId;
  icon: BannerIconId;
  primaryColor: string; // Hex color for main fabric
  secondaryColor: string; // Hex color for border/accent
  iconColor: string; // Hex color for symbol
  pattern?: BannerPatternId;
}

// Satellite imagery render tier. Affects canvas density, tile budget and the
// source zoom tiers fetched by satelliteService; persisted per save game.
export type SatelliteQuality = 'performance' | 'balanced' | 'detail';

export interface GameScenarioSettings {
  difficulty: GameDifficulty;
  colonyName: string;
  startingSeason: SeasonType;
  startingSupplies: 'plentiful' | 'standard' | 'scarce';
  zombieAggression: 'low' | 'normal' | 'high';
  startingPopulation: number;
  tutorialEnabled: boolean;
  storyEventsEnabled?: boolean;
  convoyStart?: boolean;
  infectionEnabled?: boolean;
  autosaveIntervalMinutes?: number;
  peopleLevel?: number;
  resourcesLevel?: number;
  hordesLevel?: number;
  workersManagement?: 'Priorities' | 'Manual' | 'Balanced';
  difficultyScore?: number;
  difficultyPercentage?: string;
  difficultyPreset?: string;
  banner?: ColonyBannerConfig;
}

export interface SaveGameMeta {
  id: string;
  name: string;
  type: 'manual' | 'autosave' | 'quicksave';
  timestamp: number;
  formattedDate: string;
  colonyName: string;
  sectorName: string;
  country: string;
  day: number;
  hour: number;
  minute: number;
  survivorCount: number;
  squadCount: number;
  foodCount: number;
  morale: number;
  season: SeasonType;
  weather: WeatherType;
  difficulty: GameDifficulty;
  hasHQ: boolean;
}

export interface SaveGameData {
  meta: SaveGameMeta;
  scenario: GameScenarioSettings;
  // Serialized game state
  statePayload: {
    settlements: Record<string, any>;
    activeSettlementId: string;
    settlement: any;
    gameClock: any;
    activePlacement: any;
    currentPreset: any;
    mapData: any;
    caravans: any[];
    radioState?: any;
    tutorialStep?: string;
    hasCompletedFirstScavenge: boolean;
    combatSquads?: any[];
    zombies?: any[];
    worldVehicles?: any[];
    dangerLevel?: number;
    timeOfDay?: string;
    satelliteOverlay?: boolean;
    satelliteQuality?: SatelliteQuality;
  };
}

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambientSoundscapeEnabled: boolean;
  elevationExaggeration: number;
  showTerrainWireframe: boolean;
  showBuildingEdges: boolean;
  showRoads: boolean;
  showBuildings: boolean;
  disableElevation?: boolean; // When true, flatten terrain to prevent roads clipping on curated maps
  autosaveIntervalDays: number; // 0 = off, 1 = every day, 3 = every 3 days
  pauseOnNightfall: boolean;
  pauseOnRaid: boolean;
  edgePanSpeed: number;
}
