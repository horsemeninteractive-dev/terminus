import { GameSettings, GraphicsQuality } from '../types/saveGame';

const SETTINGS_STORAGE_KEY = 'terminus_ifz_game_settings';

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 80,
  musicVolume: 65,
  sfxVolume: 85,
  ambientSoundscapeEnabled: true,
  elevationExaggeration: 1.0,
  showTerrainWireframe: false,
  showBuildingEdges: true,
  showRoads: true,
  showBuildings: true,
  disableElevation: false,
  graphicsQuality: 'high',
  autosaveIntervalDays: 1,
  pauseOnNightfall: true,
  pauseOnRaid: true,
  edgePanSpeed: 1.0,
};

export class GameSettingsService {
  private settings: GameSettings;

  constructor() {
    this.settings = this.loadSettings();
  }

  public getSettings(): GameSettings {
    return { ...this.settings };
  }

  public getGraphicsQuality(): GraphicsQuality {
    return this.settings.graphicsQuality ?? 'high';
  }

  public updateSettings(newSettings: Partial<GameSettings>): GameSettings {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
    return { ...this.settings };
  }

  private loadSettings(): GameSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Failed to save settings to localStorage:', e);
    }
  }
}

export const gameSettingsService = new GameSettingsService();
