import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Radio, Layers } from 'lucide-react';
import { BuildingAdaptationDrawer } from './components/BuildingAdaptationDrawer';
import { FreestandingBuildModal } from './components/FreestandingBuildModal';
import { GameCanvas } from './components/GameCanvas';
import { GameClockBar } from './components/GameClockBar';
import { GlobeView } from './components/GlobeView';
import { AtmosphericDescent } from './components/AtmosphericDescent';
import { HQSelectionCard } from './components/HQSelectionCard';
import { MedicalTriageModal } from './components/MedicalTriageModal';
import { PopulationRosterModal } from './components/PopulationRosterModal';
import { RecruitmentEncounterModal } from './components/RecruitmentEncounterModal';
import { RansomEventModal } from './components/RansomEventModal';
import { ResearchTreeModal } from './components/ResearchTreeModal';
import { ResourceStockpileBar } from './components/ResourceStockpileBar';
import { TacticalSquadPanel } from './components/TacticalSquadPanel';
import { VehicleManagementModal } from './components/VehicleManagementModal';
import { VehicleTacticalDrawer } from './components/VehicleTacticalDrawer';
import { CaravanTradeModal } from './components/CaravanTradeModal';
import { ColonyOverrunModal } from './components/ColonyOverrunModal';
import { GameOverExtinctModal } from './components/GameOverExtinctModal';
import { MoraleModal } from './components/MoraleModal';
import { SeasonWeatherModal } from './components/SeasonWeatherModal';
import { AudioSettingsModal } from './components/AudioSettingsModal';
import { StartScreen } from './components/StartScreen';
import { IntroSequence } from './components/IntroSequence';
import { MainMenu } from './components/MainMenu';
import { NewGameSetupModal } from './components/NewGameSetupModal';
import { SaveLoadModal } from './components/SaveLoadModal';
import { TacticalPauseMenu } from './components/TacticalPauseMenu';
import { SurvivalCodexModal } from './components/SurvivalCodexModal';
import { GameSettingsModal } from './components/GameSettingsModal';
import { CreditsModal } from './components/CreditsModal';
import { TacticalHeaderStrip, ActiveSidebarTab } from './components/TacticalHeaderStrip';
import { TacticalAlertStream, TacticalAlert } from './components/TacticalAlertStream';
import { TacticalSquadHUD } from './components/TacticalSquadHUD';
import { TacticalSquadSelectorStrip } from './components/TacticalSquadSelectorStrip';
import { SquadManagementModal } from './components/SquadManagementModal';
import { TacticalQuestTracker } from './components/TacticalQuestTracker';
import { RadioTransmissionModal } from './components/RadioTransmissionModal';
import { RadioDirectiveState, RadioTransmission } from './types/radioDirective';
import {
  getInitialRadioDirectiveState,
  updateRadioDirectiveSystem,
  acknowledgeTransmission,
} from './services/radioDirectiveService';
import { TacticalActionBar } from './components/TacticalActionBar';
import { AreaGatherOverlay, GatherResourceType } from './components/AreaGatherOverlay';
import { TacticalMinimapWidget } from './components/TacticalMinimapWidget';
import { OnboardingCelebrationModal } from './components/OnboardingCelebrationModal';
import { DEFAULT_PRESET, LOCATION_PRESETS } from './data/sampleMapData';
import { TimeOfDay, WorldScene } from './render/WorldScene';
import { soundService } from './services/soundService';
import { saveService } from './services/saveService';
import { gameSettingsService } from './services/gameSettingsService';
import { GameScenarioSettings, GameSettings, SaveGameMeta } from './types/saveGame';
import {
  advanceGameClock,
  breachInfestedBuilding,
  createInitialGameClock,
  emitNoiseEvent,
  generateAmbientMapZombies,
  generateBuildingInfestation,
  generateHordeWave,
  assignMemberArmor,
  assignMemberWeapon,
  orderSquadAttack,
  orderSquadMove,
  orderSquadRecall,
  repairBuilding,
  syncTacticalSquadUnits,
  tickCombatSimulation,
} from './services/combatService';
import {
  recordFallenHero,
  tickInfectionSimulation,
} from './services/infectionService';
import {
  tickResearchSimulation,
  unlockResearchNode,
} from './services/researchService';
import {
  calculateSettlementMorale,
  tickMoraleAndGrowthSimulation,
} from './services/moraleService';
import {
  createInitialWeatherState,
  tickWeatherSimulation,
} from './services/weatherService';
import {
  calculateGlobalNetworkStats,
  dispatchCaravan,
  tickCaravansSimulation,
} from './services/caravanService';
import {
  dismountSquadFromVehicle,
  generateWorldVehicles,
  mountSquadToVehicle,
  orderVehicleRoadTravel,
  updateVehiclesTick,
} from './services/vehicleService';
import { RoadNetworkGraph } from './services/roadPathfinder';
import { PathGrid } from './services/pathfindingService';
import {
  computeVisibleCells,
  computeVisionSources,
  createFogGrid,
  discoverGroupsInVision,
  discoverThreatsInVision,
  markExploredCells,
} from './services/fogOfWarService';
import {
  createRansomDemand,
  freeCaptive,
  generateRivalHideouts,
  generateZombieLairs,
  payRansomForCaptive,
  tickRivalHideouts,
  tickZombieLairs,
} from './services/rivalFactionService';
import { fetchElevationGrid } from './services/elevationService';
import { clearMapCache, getMapFromCache, saveMapToCache } from './services/mapCache';
import { processOsmData } from './services/mapProcessor';
import { fetchFromOverpass } from './services/osmFetcher';
import { getBundledMapData } from './services/bundledMapData';
import {
  appointBuildingHead,
  createSquad,
  disbandSquad,
  generateHiddenGroupsForMap,
  modifySquadGeneralMembers,
  recruitHiddenGroup,
  setWorkerJobToMax,
  setWorkerJobToZero,
  tickSettlementSimulation,
  updateJobPriorities,
  updateWorkerJobLimit,
  updateWorkerJobPriority,
  vacateSurvivorRole,
} from './services/populationService';
import {
  adaptBuilding,
  buildFreestanding,
  cancelDeconstruction,
  createInitialSettlementState,
  establishSettlementHQ,
  orderDeconstruction,
} from './services/settlementService';
import {
  ARMOR_CATALOG,
  ArmorItemId,
  CombatVisualFx,
  DroppedItem,
  GameClockState,
  HostileHumanUnit,
  NoiseEvent,
  TacticalSquadUnit,
  WEAPON_CATALOG,
  WeaponItemId,
  ZombieLair,
  ZombieUnit,
} from './types/combat';
import { BuildingPolygon, LocationPreset, MapData, Point2D, SettlementPlacement } from './types/map';
import {
  HiddenSurvivorGroup,
  JobSector,
} from './types/population';
import {
  AdaptedBuilding,
  FunctionalBuildingTypeId,
  SettlementState,
  SettlementStockpile,
} from './types/settlement';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from './data/functionalBuildings';
import { RivalHideout } from './types/rivalFaction';
import { WorldVehicle } from './types/vehicle';
import { CaravanDispatchConfig, SettlementRecord, TradeCaravan } from './types/caravan';
import { SeasonType, WeatherType } from './types/weather';
import {
  formatLootLabel,
  ensureBuildingSearchStates,
  isSquadInsideBuilding,
  startBuildingSearch,
  tickBuildingScavengeProgress,
  findNearestStorageDropoff,
  unloadSquadAtDropoff,
  unloadSquadAtHQ,
  getBuildingSearchDurationSec,
  searchBuilding,
} from './services/scavengingService';
import { assignResourceGatherers, tickResourceGathering } from './services/resourceGatheringService';
import { ResourceNode } from './types/map';

export type AppViewMode = 'start_screen' | 'intro' | 'main_menu' | 'globe' | 'world';

export default function App() {
  const [viewMode, setViewMode] = useState<AppViewMode>('start_screen');
  const [currentPreset, setCurrentPreset] = useState<LocationPreset>(DEFAULT_PRESET);
  const [activePlacement, setActivePlacement] = useState<SettlementPlacement | null>(null);

  // Game Flow, Save/Load & Settings Modals
  const [isNewGameModalOpen, setIsNewGameModalOpen] = useState(false);
  const [isSaveLoadModalOpen, setIsSaveLoadModalOpen] = useState(false);
  const [saveLoadMode, setSaveLoadMode] = useState<'save' | 'load'>('load');
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState(false);
  const [isCodexModalOpen, setIsCodexModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);
  const [isPwaUpdateAvailable, setIsPwaUpdateAvailable] = useState(false);

  useEffect(() => {
    const handleUpdate = () => setIsPwaUpdateAvailable(true);
    window.addEventListener('terminus:pwa-update', handleUpdate);
    return () => window.removeEventListener('terminus:pwa-update', handleUpdate);
  }, []);

  const [mapData, setMapData] = useState<MapData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cacheSource, setCacheSource] = useState<string>('Pre-cached Dataset');

  // True only after the 3D scene has built AND drawn the current map, so the
  // world view stays behind a loading overlay instead of showing a blank canvas
  // while thousands of building meshes are still being generated.
  const [isSceneRendered, setIsSceneRendered] = useState(false);
  // Building type chosen from the bottom-left Build/Convert dropdown that is
  // waiting for the player to click a structure to convert (§7.2).
  const [pendingAdaptType, setPendingAdaptType] = useState<FunctionalBuildingTypeId | null>(null);

  // Any new map payload invalidates the previous render — keep the overlay up
  // until GameCanvas reports the new scene has actually rendered.
  useEffect(() => {
    setIsSceneRendered(false);
  }, [mapData]);

  // Single atmospheric-descent loading screen. Owned here (not in GlobeView) so it
  // survives the Globe -> World transition and stays up until the world scene has
  // actually rendered the map — all loading happens on this one screen.
  const [isDescentActive, setIsDescentActive] = useState(false);
  const [descentProgress, setDescentProgress] = useState(0);
  const [descentAltitudeKm, setDescentAltitudeKm] = useState(1200);
  const descentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopDescentTimer = useCallback(() => {
    if (descentTimerRef.current) {
      clearInterval(descentTimerRef.current);
      descentTimerRef.current = null;
    }
  }, []);
  // Stop the timer if the component unmounts.
  useEffect(() => stopDescentTimer, [stopDescentTimer]);

  // When the world scene has fully rendered, fade the descent screen so the player
  // lands directly into a filled-in world — never a blank map behind a load UI.
  useEffect(() => {
    if (!isDescentActive || !isSceneRendered) return;
    setDescentProgress(1);
    const t = setTimeout(() => setIsDescentActive(false), 700);
    return () => clearTimeout(t);
  }, [isDescentActive, isSceneRendered]);

  // Real load progress: the map pipeline (fetch + scene build) reports actual
  // stage progress + status lines, which drive the atmospheric-descent loading
  // screen instead of the fixed timer (which only creeps to 30%).
  const handleLoadProgress = useCallback(
    (progress: number, label?: string) => {
      if (!isDescentActive) return;
      if (label) setLoadingMessage(label);
      setDescentProgress((p) => Math.max(p, progress));
    },
    [isDescentActive]
  );

  // Multi-Settlement Network Management State (§7.5)
  const initialSettlementId = 'settlement_oxford';
  const [settlements, setSettlements] = useState<Record<string, SettlementRecord>>(() => {
    const initial = createInitialSettlementState('Oxford Sector Command');
    return {
      [initialSettlementId]: {
        id: initialSettlementId,
        name: 'Oxford Sector Colony',
        placement: {
          center: { lat: DEFAULT_PRESET.lat, lon: DEFAULT_PRESET.lon },
          zoneSize: '3x3', radius: DEFAULT_PRESET.radius,
          offsetMeters: { x: 0, z: 0 },
          rotationDeg: 0,
          sectorName: DEFAULT_PRESET.name,
          country: DEFAULT_PRESET.country,
          locationDetails: DEFAULT_PRESET.description,
        },
        state: initial,
        status: 'operational',
        dayEstablished: 1,
      },
    };
  });
  const [activeSettlementId, setActiveSettlementId] = useState<string>(initialSettlementId);

  // Trade Caravans, Loss, and Overall Extinction State (§7.5)
  const [caravans, setCaravans] = useState<TradeCaravan[]>([]);
  const [isCaravansModalOpen, setIsCaravansModalOpen] = useState(false);
  const [overrunSettlement, setOverrunSettlement] = useState<SettlementRecord | null>(null);
  const [isExtinct, setIsExtinct] = useState(false);

  // Settlement Working State for the currently focused local map
  const [settlement, setSettlement] = useState<SettlementState>(() =>
    createInitialSettlementState('Oxford Sector Command')
  );
  const [pendingFreestandingType, setPendingFreestandingType] = useState<FunctionalBuildingTypeId | null>(null);
  const [scavengeQueue, setScavengeQueue] = useState<Record<string, Array<string | number>>>({});
  const [isFreestandingModalOpen, setIsFreestandingModalOpen] = useState(false);
  const [isPopulationModalOpen, setIsPopulationModalOpen] = useState(false);
  const [isSquadModalOpen, setIsSquadModalOpen] = useState(false);
  const [isMedbayModalOpen, setIsMedbayModalOpen] = useState(false);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isResearchModalOpen, setIsResearchModalOpen] = useState(false);
  const [isMoraleModalOpen, setIsMoraleModalOpen] = useState(false);
  const [isWeatherModalOpen, setIsWeatherModalOpen] = useState(false);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [dangerLevel, setDangerLevel] = useState<number>(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [activeRecruitmentGroup, setActiveRecruitmentGroup] = useState<HiddenSurvivorGroup | null>(null);
  const contactedSurvivorGroupIdsRef = useRef<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string; type: 'success' | 'info' | 'warn' | 'danger' } | null>(null);
  const radioAlertIdsRef = useRef<Set<string>>(new Set());

  // Safe Zones Operations Radio Directive System State (§TERMINUS PROTOCOL)
  const [radioDirectiveState, setRadioDirectiveState] = useState<RadioDirectiveState>(() =>
    getInitialRadioDirectiveState()
  );
  const [isRadioModalOpen, setIsRadioModalOpen] = useState<boolean>(false);
  const [activeRadioTransmission, setActiveRadioTransmission] = useState<RadioTransmission | null>(
    () => getInitialRadioDirectiveState().currentIncomingTransmission
  );
  const [isCelebrationModalOpen, setIsCelebrationModalOpen] = useState<boolean>(false);

  const handleClaimDawnReward = useCallback(() => {
    setIsCelebrationModalOpen(false);
    setSettlement((prev) => ({
      ...prev,
      morale: { ...prev.morale, overallScore: Math.min(100, (prev.morale?.overallScore || 70) + 15) },
      stockpile: {
        ...prev.stockpile,
        food: {
          ...prev.stockpile.food,
          canned_goods: prev.stockpile.food.canned_goods + 50,
        },
        materials: {
          ...prev.stockpile.materials,
          metal: prev.stockpile.materials.metal + 25,
          wood: prev.stockpile.materials.wood + 25,
        },
        ammo: {
          ...prev.stockpile.ammo,
          sharedPool: prev.stockpile.ammo.sharedPool + 40,
        },
      },
    }));
    setToastMessage({
      title: 'DAWN COMMENDATION CLAIMED',
      desc: '+15 Morale, +50 Food, +50 Scrap, +40 Ammo awarded to colony stockpiles.',
      type: 'success',
    });
  }, []);

  // Slidable Tactical Sidebar & Alert System (§16.3)
  const [activeSidebarTab, setActiveSidebarTab] = useState<ActiveSidebarTab>(null);

  // Top-left Task List / quest tracker visibility (header Task List button)
  const [isQuestListOpen, setIsQuestListOpen] = useState(true);
  const [alerts, setAlerts] = useState<TacticalAlert[]>([
    {
      id: 'init_alert',
      title: 'SECTOR RECON COMMENCED',
      desc: 'Tactical command active. Secure buildings, establish perimeter.',
      type: 'info',
      timestamp: Date.now(),
    },
  ]);

  const addTacticalAlert = useCallback(
    (
      title: string,
      desc: string,
      type: 'danger' | 'warn' | 'info' | 'success',
      onClick?: () => void
    ) => {
      const newAlert: TacticalAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title,
        desc,
        type,
        timestamp: Date.now(),
        onClick,
      };
      setAlerts((prev) => [newAlert, ...prev.slice(0, 6)]);
    },
    []
  );

  const handleDismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleMinimapPanTo = useCallback((pos: Point2D) => {
    if (sceneRef.current) {
      sceneRef.current.cameraController.focusOnPosition(pos);
    }
  }, []);

  // Phase 6 Combat, Day/Night Clock & Horde State (§5, §5.1, §6.1)
  const [gameClock, setGameClock] = useState<GameClockState>(() => createInitialGameClock());
  const [zombies, setZombies] = useState<ZombieUnit[]>([]);
  const [combatSquads, setCombatSquads] = useState<TacticalSquadUnit[]>([]);
  const [hostileHumans, setHostileHumans] = useState<HostileHumanUnit[]>([]);
  const [activeRansomHideoutId, setActiveRansomHideoutId] = useState<string | number | null>(null);
  // Ref mirrors combatSquads so the 100ms combat interval always reads the latest
  // synced roster (avoids the stale-closure race where an old tick overwrites
  // freshly synced squads back to []).
  const combatSquadsRef = useRef<TacticalSquadUnit[]>([]);
  const [droppedItems, setDroppedItems] = useState<DroppedItem[]>([]);
  const [noiseEvents, setNoiseEvents] = useState<NoiseEvent[]>([]);
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const roadGraphRef = useRef<RoadNetworkGraph | null>(null);
  const pathGridRef = useRef<PathGrid | null>(null);
  // Latest fog-of-war visible cells, written by the 100ms combat tick and consumed
  // by the 1s settlement tick to persist exploration & survivor-group discovery.
  const fogVisibleCellsRef = useRef<Set<number>>(new Set());

  // Interactive state
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingPolygon | null>(null);
  const [selectedResourceNode, setSelectedResourceNode] = useState<ResourceNode | null>(null);
  const [hoveredBuilding, setHoveredBuilding] = useState<BuildingPolygon | null>(null);
  const [clickedPosition, setClickedPosition] = useState<Point2D | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');

  // Elevation & Topography state
  const [elevationExaggeration, setElevationExaggeration] = useState<number>(1.5);
  const [disableElevation, setDisableElevation] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('survivor_game_settings');
      if (saved) return !!JSON.parse(saved).disableElevation;
    } catch {}
    return false;
  });
  const [showTerrainWireframe, setShowTerrainWireframe] = useState<boolean>(false);

  // Layer Toggles
  const [showBuildingEdges, setShowBuildingEdges] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [showWood, setShowWood] = useState(true);
  const [showMetal, setShowMetal] = useState(true);
  const [showBricks, setShowBricks] = useState(true);
  const [showLanduse, setShowLanduse] = useState(true);
  const [activeGatherType, setActiveGatherType] = useState<GatherResourceType | null>(null);

  // Scavenge View & Minimap View Layer State
  const [isScavengeViewActive, setIsScavengeViewActive] = useState<boolean>(false);
  const [scavengeFilterType, setScavengeFilterType] = useState<import('./components/TacticalMinimapWidget').ScavengeLootFilter>('all');
  const [showStreetLabels, setShowStreetLabels] = useState<boolean>(false);
  const [showSatelliteOverlay, setShowSatelliteOverlay] = useState<boolean>(false);
  const [labelDetailMode, setLabelDetailMode] = useState<'detailed' | 'minimal'>('minimal');
  const [isHideUi, setIsHideUi] = useState<boolean>(false);
  const [isExpeditionViewActive, setIsExpeditionViewActive] = useState<boolean>(false);

  // Colony Emergency Siren & 13-Hour Defense Alarm State
  const [isAlarmActive, setIsAlarmActive] = useState<boolean>(false);
  const [alarmHoursRemaining, setAlarmHoursRemaining] = useState<number>(0);

  // Count manned defensive watchtowers and gates
  const mannedTowersCount = useMemo(() => {
    let count = 0;
    if (settlement.adaptedBuildings) {
      for (const [_, bldg] of settlement.adaptedBuildings) {
        const type = (bldg.typeId || '').toLowerCase();
        if (type.includes('tower') || type.includes('watchtower') || type.includes('spotlight')) count++;
      }
    }
    if (settlement.freestandingBuildings) {
      for (const fs of settlement.freestandingBuildings) {
        const type = (fs.typeId || '').toLowerCase();
        if (type.includes('tower') || type.includes('watchtower') || type.includes('spotlight')) count++;
      }
    }
    return count;
  }, [settlement.adaptedBuildings, settlement.freestandingBuildings]);

  const mannedGatesCount = useMemo(() => {
    let count = 0;
    if (settlement.adaptedBuildings) {
      for (const [_, bldg] of settlement.adaptedBuildings) {
        const type = (bldg.typeId || '').toLowerCase();
        if (type.includes('gate') || type.includes('palisade') || type.includes('bastion')) count++;
      }
    }
    if (settlement.freestandingBuildings) {
      for (const fs of settlement.freestandingBuildings) {
        const type = (fs.typeId || '').toLowerCase();
        if (type.includes('gate') || type.includes('palisade') || type.includes('bastion')) count++;
      }
    }
    return count;
  }, [settlement.adaptedBuildings, settlement.freestandingBuildings]);

  const handleToggleAlarm = useCallback((active: boolean) => {
    if (active) {
      setIsAlarmActive(true);
      setAlarmHoursRemaining(13.0);
      setToastMessage({
        title: 'COLONY DEFENSE ALARM SOUNDED',
        desc: '13-Hour Emergency Siren active! Workers retreating to shelter and manning defensive gates & towers.',
        type: 'warn',
      });
      soundService.playHordeWarning();
    } else {
      setIsAlarmActive(false);
      setAlarmHoursRemaining(0);
      setToastMessage({
        title: 'COLONY ALARM CANCELLED',
        desc: 'Defenders standing down from emergency alert. Normal operations resumed.',
        type: 'info',
      });
      soundService.playBuildingPlaced();
    }
  }, []);

  // Scene instance reference
  const sceneRef = useRef<WorldScene | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const settlementRef = useRef(settlement);
  const mapDataRef = useRef<MapData | null>(mapData);
  const gameClockRef = useRef(gameClock);
  const zombiesRef = useRef(zombies);
  settlementRef.current = settlement;
  mapDataRef.current = mapData;
  gameClockRef.current = gameClock;
  zombiesRef.current = zombies;

  // Sync Tactical View Layers into Three.js WorldScene
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setScavengeView(isScavengeViewActive, scavengeFilterType);
      sceneRef.current.setShowStreetLabels(showStreetLabels);
      sceneRef.current.setSatelliteOverlay(showSatelliteOverlay);
      sceneRef.current.setLabelDetailMode(labelDetailMode);
      sceneRef.current.setShowBuildingEdges(showBuildingEdges);
    }
  }, [isScavengeViewActive, scavengeFilterType, showStreetLabels, showSatelliteOverlay, labelDetailMode, showBuildingEdges]);

  // Freeze entity rendering when the simulation is paused so nothing keeps moving
  // (or sliding its interpolation tail) after the player presses pause.
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setSimulationPaused(gameClock.speed === 0);
    }
  }, [gameClock.speed]);

  // Initialize Web Audio Context on first player gesture (§15)
  useEffect(() => {
    const handleGesture = () => {
      soundService.init();
    };
    window.addEventListener('click', handleGesture, { once: true });
    window.addEventListener('keydown', handleGesture, { once: true });
    window.addEventListener('touchstart', handleGesture, { once: true });
    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('keydown', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
    };
  }, []);

  // Synchronize audio engine with active gameplay state (§15)
  useEffect(() => {
    const isGameActive = viewMode === 'world' && !isDescentActive && Boolean(mapData);
    soundService.setInGame(isGameActive);
  }, [viewMode, isDescentActive, mapData]);

  // Auto-dismiss toast and synthesize tactical alert chime
  useEffect(() => {
    if (!toastMessage) return;
    soundService.playToastSound(toastMessage.type);
    const timer = setTimeout(() => setToastMessage(null), 4500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Track active modal count to trigger panel open/close audio feedback
  const activeModalCount = (
    (isNewGameModalOpen ? 1 : 0) +
    (isSaveLoadModalOpen ? 1 : 0) +
    (isPauseMenuOpen ? 1 : 0) +
    (isCodexModalOpen ? 1 : 0) +
    (isSettingsModalOpen ? 1 : 0) +
    (isCreditsModalOpen ? 1 : 0) +
    (isCaravansModalOpen ? 1 : 0) +
    (isFreestandingModalOpen ? 1 : 0) +
    (isPopulationModalOpen ? 1 : 0) +
    (isSquadModalOpen ? 1 : 0) +
    (isMedbayModalOpen ? 1 : 0) +
    (isVehicleModalOpen ? 1 : 0) +
    (isResearchModalOpen ? 1 : 0) +
    (isMoraleModalOpen ? 1 : 0) +
    (isWeatherModalOpen ? 1 : 0) +
    (isAudioModalOpen ? 1 : 0) +
    (isCelebrationModalOpen ? 1 : 0) +
    (activeRecruitmentGroup ? 1 : 0) +
    (activeRansomHideoutId ? 1 : 0) +
    (overrunSettlement ? 1 : 0) +
    (isRadioModalOpen ? 1 : 0)
  );

  // Safe Zone Operations initial communication state
  const isInitialCommsPending =
    !settlement.hq &&
    (radioDirectiveState.activeDirectives?.length || 0) === 0 &&
    (radioDirectiveState.completedDirectiveIds?.length || 0) === 0;

  const isHQSelectionUnlocked =
    Boolean(settlement.hq) ||
    Boolean(
      radioDirectiveState.activeDirectives &&
        radioDirectiveState.activeDirectives.some((d) => d.id === 'dir_hq')
    ) ||
    radioDirectiveState.completedDirectiveIds.includes('dir_hq');

  const prevModalCountRef = useRef(0);
  useEffect(() => {
    if (prevModalCountRef.current === 0 && activeModalCount > 0) {
      soundService.playPanelOpen();
    } else if (prevModalCountRef.current > 0 && activeModalCount === 0) {
      soundService.playPanelClose();
    } else if (prevModalCountRef.current > 0 && activeModalCount > 0 && prevModalCountRef.current !== activeModalCount) {
      soundService.playTabSwitch();
    }
    prevModalCountRef.current = activeModalCount;
  }, [activeModalCount]);

  // Audio feedback for entity selections
  const prevSelectedBuildingRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = selectedBuilding ? String(selectedBuilding.id) : null;
    if (currentId && currentId !== prevSelectedBuildingRef.current) {
      soundService.playBuildingSelect();
    }
    prevSelectedBuildingRef.current = currentId;
  }, [selectedBuilding]);

  const prevSelectedSquadRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedSquadId && selectedSquadId !== prevSelectedSquadRef.current) {
      soundService.playSquadSelect();
    }
    prevSelectedSquadRef.current = selectedSquadId;
  }, [selectedSquadId]);

  const prevSelectedVehicleRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedVehicleId && selectedVehicleId !== prevSelectedVehicleRef.current) {
      soundService.playVehicleSelect();
    }
    prevSelectedVehicleRef.current = selectedVehicleId;
  }, [selectedVehicleId]);

  const prevSelectedResourceNodeRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = selectedResourceNode ? String(selectedResourceNode.id) : null;
    if (currentId && currentId !== prevSelectedResourceNodeRef.current) {
      soundService.playResourceNodeSelect();
    }
    prevSelectedResourceNodeRef.current = currentId;
  }, [selectedResourceNode]);

  // Keep combat squads synchronized with settlement.squads roster (§4.3)
  useEffect(() => {
    const synced = syncTacticalSquadUnits(settlement, combatSquadsRef.current);
    combatSquadsRef.current = synced;
    setCombatSquads(synced);
  }, [settlement.squads, settlement.hq]);

  useEffect(() => {
    if (!selectedResourceNode || !mapData) return;
    const latest = mapData.resourceNodes.find(n => n.id === selectedResourceNode.id);
    if (latest && latest.amount !== selectedResourceNode.amount) setSelectedResourceNode(latest);
  }, [mapData, selectedResourceNode]);

  useEffect(() => {
    if (viewMode !== 'world' || isDescentActive || !mapData) return;
    const interval = setInterval(() => {
      const st = settlementRef.current, md = mapDataRef.current;
      if (!md || !st.hq || !st.resourceWorkOrders.length) return;
      const isNight = Boolean(gameClockRef.current?.isNight);
      // Scale worker movement by the clock speed — when paused (speed 0) their
      // movement must freeze just like squads/vehicles/enemies.
      const dt = 0.5 * (gameClockRef.current?.speed ?? 1);
      if (dt <= 0) {
        // Still update resource amounts from a no-op tick (position unchanged).
        const idle = tickResourceGathering(st, md, 0, isNight, isAlarmActive);
        settlementRef.current = idle.newState;
        mapDataRef.current = idle.mapData;
        setSettlement(idle.newState);
        sceneRef.current?.updateResourceAmounts(idle.mapData.resourceNodes);
        return;
      }
      const result = tickResourceGathering(st, md, dt, isNight, isAlarmActive);
      settlementRef.current = result.newState;
      mapDataRef.current = result.mapData;
      setSettlement(result.newState);
      sceneRef.current?.updateResourceAmounts(result.mapData.resourceNodes);
    }, 500);
    return () => clearInterval(interval);
  }, [viewMode, isDescentActive, (mapData as any)?.id, isAlarmActive]);

  // Synchronize road network graph and obstacle pathfinding grid whenever map geometry updates
  useEffect(() => {
    if (mapData) {
      roadGraphRef.current = new RoadNetworkGraph(mapData.roads || []);
      pathGridRef.current = new PathGrid(mapData);
    } else {
      roadGraphRef.current = null;
      pathGridRef.current = null;
    }
  }, [mapData]);

  // Spawn initial ambient dormant zombies when map data or HQ is updated
  useEffect(() => {
    if (viewMode === 'world' && mapData && mapData.buildings && mapData.buildings.length > 0) {
      const hqPos = settlement.hq?.center || null;
      setZombies(generateAmbientMapZombies(mapData.buildings, hqPos, gameClock.day));
    }
  }, [viewMode, (mapData as any)?.id, settlement.hq?.buildingId]);

  // Seed rival-faction Hideouts & zombie Lairs onto the local map (§5.2)
  useEffect(() => {
    if (viewMode !== 'world' || !mapData || mapData.buildings.length === 0) return;
    const hqId = settlement.hq?.buildingId ?? null;
    setSettlement((prev) => {
      let next = prev;
      if ((prev.rivalHideouts?.size ?? 0) === 0) {
        next = { ...next, rivalHideouts: generateRivalHideouts(mapData.buildings, hqId) };
      }
      if ((prev.zombieLairs?.size ?? 0) === 0) {
        next = { ...next, zombieLairs: generateZombieLairs(mapData.buildings, hqId) };
      }
      return next;
    });
  }, [viewMode, (mapData as any)?.id, settlement.hq?.buildingId]);

  // Settlement Resource, Construction, Research, Weather, Morale & Multi-Settlement State Sync (Every 1 second) (§4.5, §9, §10, §7.5)
  useEffect(() => {
    if (viewMode !== 'world' || isDescentActive || !mapData) return;
    const interval = setInterval(() => {
      setSettlement((prev) => {
        // Scale the sim delta by clock speed so construction workers freeze while
        // paused (speed 0) just like squads/vehicles/gatherers — pausing means
        // nothing moves, including site workers.
        const simDelta = 1.0 * gameClock.speed;
        const { newState, completedConstructions, completedDeconstructions } =
          tickSettlementSimulation(prev, simDelta);
        const withResearch = tickResearchSimulation(newState, 1.0, gameClock.speed);
        
        const currentWeatherState = prev.weather || createInitialWeatherState(gameClock.day);
        const deltaInGameHours = (1.0 * gameClock.speed) / 60;
        const weatherResult = tickWeatherSimulation(currentWeatherState, gameClock.day, deltaInGameHours, withResearch);

        const settlementWithWeather: SettlementState = {
          ...withResearch,
          weather: weatherResult.newState,
        };

        const growthResult = tickMoraleAndGrowthSimulation(
          settlementWithWeather,
          weatherResult.newState,
          1.0,
          gameClock.speed,
          gameClock.day
        );

        if (completedConstructions.length > 0) {
          setToastMessage({
            title: 'CONSTRUCTION COMPLETED',
            desc: `${completedConstructions.join(', ')} is now fully built and operational!`,
            type: 'success',
          });
        }

        if (completedDeconstructions.length > 0) {
          setToastMessage({
            title: 'DECONSTRUCTION COMPLETE',
            desc: `${completedDeconstructions
              .map((d) => `${d.name} (${d.wood}W / ${d.metal}M / ${d.bricks}B recovered)`)
              .join(', ')}`,
            type: 'success',
          });
        }


        if (weatherResult.notification) {
          setToastMessage(weatherResult.notification);
        }

        if (growthResult.notification) {
          setToastMessage(growthResult.notification);
        }

        // Persist fog-of-war exploration & survivor-group discovery (§3.5, §4.4).
        // The visible-cell set is refreshed by the 100ms combat tick.
        let finalSettlementState = growthResult.newState;
        if (mapData) {
          const fog = finalSettlementState.fogOfWar
            ? finalSettlementState.fogOfWar
            : createFogGrid(mapData);
          const markedFog = markExploredCells(fog, fogVisibleCellsRef.current);

          const discoveredIds = discoverGroupsInVision(
            finalSettlementState.hiddenGroups,
            combatSquadsRef.current,
            mapData
          );

          let hiddenGroups = finalSettlementState.hiddenGroups;
          if (discoveredIds.length > 0) {
            hiddenGroups = new Map(hiddenGroups);
            for (const id of discoveredIds) {
              const group = hiddenGroups.get(id);
              if (group && !group.isDiscovered) {
                hiddenGroups.set(id, { ...group, isDiscovered: true });
              }
            }
          }

          // Discover rival Hideouts & zombie Lairs via squad vision (§5.2)
          const threats = discoverThreatsInVision(
            finalSettlementState.rivalHideouts,
            finalSettlementState.zombieLairs,
            combatSquadsRef.current,
            mapData
          );

          let rivalHideouts = finalSettlementState.rivalHideouts;
          if (threats.hideoutIds.length > 0) {
            rivalHideouts = new Map(rivalHideouts);
            for (const id of threats.hideoutIds) {
              const hideout = rivalHideouts.get(id);
              if (hideout && !hideout.isDiscovered) {
                rivalHideouts.set(id, { ...hideout, isDiscovered: true });
              }
            }
          }

          let zombieLairs = finalSettlementState.zombieLairs;
          if (threats.lairIds.length > 0) {
            zombieLairs = new Map(zombieLairs);
            for (const id of threats.lairIds) {
              const lair = zombieLairs.get(id);
              if (lair && !lair.isDiscovered) {
                zombieLairs.set(id, { ...lair, isDiscovered: true });
              }
            }
          }

          finalSettlementState = {
            ...finalSettlementState,
            fogOfWar: markedFog,
            hiddenGroups,
            rivalHideouts,
            zombieLairs,
          };
        }

        // Keep multi-settlements registry in sync with active colony's working state
        setSettlements((currentRegistry) => {
          if (!currentRegistry[activeSettlementId]) return currentRegistry;
          return {
            ...currentRegistry,
            [activeSettlementId]: {
              ...currentRegistry[activeSettlementId],
              state: finalSettlementState,
            },
          };
        });

        return finalSettlementState;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [viewMode, isDescentActive, mapData, gameClock.speed, gameClock.day, activeSettlementId]);

  // Safe Zones Operations Radio Directive System Evaluation Loop (§TERMINUS PROTOCOL)
  useEffect(() => {
    if (viewMode !== 'world' || isDescentActive || !mapData) return;
    const interval = setInterval(() => {
      setRadioDirectiveState((prevRadio) => {
        const curSettlement = settlementRef.current || settlement;
        const curClock = gameClockRef.current || gameClock;
        const curZombies = zombiesRef.current || zombies;
        const { newState, newTransmissionsCount } = updateRadioDirectiveSystem(
          prevRadio,
          curSettlement,
          curClock,
          curZombies
        );

        if (
          newTransmissionsCount > 0 &&
          newState.currentIncomingTransmission &&
          newState.currentIncomingTransmission.id !== prevRadio.currentIncomingTransmission?.id
        ) {
          const incoming = newState.currentIncomingTransmission;
          soundService.playRadioChirp();
          if (radioAlertIdsRef.current.has(incoming.id)) return newState;
          radioAlertIdsRef.current.add(incoming.id);
          addTacticalAlert(
            `RADIO: ${incoming.classification}`,
            `${incoming.callsign}: ${incoming.title}`,
            incoming.classification === 'EMERGENCY'
              ? 'danger'
              : incoming.classification === 'WARNING'
              ? 'warn'
              : 'info',
            () => {
              setActiveRadioTransmission(incoming);
              setIsRadioModalOpen(true);
            }
          );
        }

        return newState;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [
    viewMode,
    isDescentActive,
    Boolean(mapData),
    addTacticalAlert,
  ]);

  // Inter-Colony Trade Caravans Simulation Loop (Every 1 second) (§7.5)
  useEffect(() => {
    if (viewMode !== 'world' || isDescentActive || !mapData) return;
    const interval = setInterval(() => {
      if (caravans.length === 0) return;

      const { updatedCaravans, updatedSettlements, notifications } = tickCaravansSimulation(
        caravans,
        settlements,
        1.0,
        gameClock.speed,
        gameClock.day
      );

      setCaravans(updatedCaravans);
      setSettlements(updatedSettlements);

      // If active settlement received resources/survivors from an arriving caravan, update active working state
      if (updatedSettlements[activeSettlementId]) {
        setSettlement(updatedSettlements[activeSettlementId].state);
      }

      if (notifications.length > 0) {
        for (const notif of notifications) {
          setToastMessage({
            title: notif.title,
            desc: notif.desc,
            type: notif.type,
          });
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [viewMode, isDescentActive, mapData, caravans, settlements, activeSettlementId, gameClock.speed, gameClock.day]);

  // Real-Time Combat, Day/Night Clock & Horde Simulation Tick (Every 100ms) (§5, §5.1, §6.1)
  useEffect(() => {
    if (viewMode !== 'world' || isDescentActive || !mapData) return;
    const TICK_DELTA = 0.1; // 100ms per simulation step
    // Use a monotonic fixed-step accumulator rather than setInterval's elapsed
    // wall time. React/render work can delay a callback; catch up in bounded
    // steps so units do not receive uneven movement bursts.
    let lastTickAt = performance.now();
    let accumulatedMs = 0;
    const interval = setInterval(() => {
      const now = performance.now();
      accumulatedMs = Math.min(accumulatedMs + now - lastTickAt, 300);
      lastTickAt = now;
      if (accumulatedMs < TICK_DELTA * 1000) return;
      accumulatedMs -= TICK_DELTA * 1000;
      // 1. Advance Game Clock
      let nextClock = gameClock;
      let dayChanged = false;
      let nightfallTriggered = false;
      let dawnTriggered = false;

      setGameClock((prev) => {
        const adv = advanceGameClock(prev, TICK_DELTA);
        nextClock = adv.newClock;
        dayChanged = adv.dayChanged;
        nightfallTriggered = adv.nightfallTriggered;
        dawnTriggered = adv.dawnTriggered;
        return adv.newClock;
      });

      // Synchronize 3D atmospheric lighting with phase
      if (nextClock.phase !== timeOfDay) {
        setTimeOfDay(nextClock.phase);
      }

      // 2. Handle Nightfall Incursion (§5.1, §6.1, §15)
      if (nightfallTriggered) {
        soundService.playHordeWarning();
        const hqPos = settlement.hq?.center || { x: 0, z: 0 };
        const horde = generateHordeWave(nextClock.day, hqPos, 180, true);

        // §6.1 addition: a full moon measurably reduces the night incursion.
        const isFullMoon = settlement.weather?.moonPhase === 'full';
        const calmHorde = isFullMoon ? horde.filter(() => Math.random() < 0.55) : horde;
        setZombies((prev) => [...prev, ...calmHorde]);

        const noise = emitNoiseEvent('combat', hqPos.x + 10, hqPos.z + 10, 'HORDE HOWL');
        setNoiseEvents((prev) => [...prev, noise.event]);

        if (gameSettingsService.getSettings().pauseOnNightfall) {
          setGameClock((c) => ({ ...c, speed: 0 }));
        }

        setToastMessage({
          title: isFullMoon ? 'NIGHTFALL — FULL MOON' : 'NIGHTFALL IN EFFECT',
          desc: isFullMoon
            ? `A full moon hangs overhead — the infected are unusually subdued tonight (${calmHorde.length} of ${horde.length} emerged).`
            : `Infected horde (Wave Day ${nextClock.day}) is mobilizing and aggressive!`,
          type: 'warn',
        });
      }

      if (dawnTriggered) {
        setToastMessage({
          title: 'DAWN BREAKS',
          desc: 'Sunlight forces remaining infected into dormancy.',
          type: 'info',
        });

        // Trigger Autosave at dawn if enabled (§ Autosave feature)
        const currentSettings = gameSettingsService.getSettings();
        if (currentSettings.autosaveIntervalDays > 0 && nextClock.day % currentSettings.autosaveIntervalDays === 0) {
          try {
            const activePlacementRecord = settlements[activeSettlementId]?.placement || activePlacement || {
              center: { lat: currentPreset.lat, lon: currentPreset.lon },
              radius: currentPreset.radius,
              sectorName: currentPreset.name,
              country: currentPreset.country,
              gridSize: 3,
              offsetLat: 0,
              offsetLon: 0,
            };
            saveService.saveGame(
              `${settlement.name || 'Colony'} (Autosave Day ${nextClock.day})`,
              'autosave',
              {
                settlements,
                activeSettlementId,
                settlement,
                gameClock: nextClock,
                activePlacement: activePlacementRecord,
                currentPreset,
                mapData,
                caravans,
                radioState: radioDirectiveState,
                hasCompletedFirstScavenge: true,
                combatSquads,
                zombies,
                worldVehicles: settlement.vehicles || [],
                dangerLevel,
                timeOfDay,
              }
            );
            addTacticalAlert('AUTOSAVE RECORDED', `Dawn of Day ${nextClock.day} saved to checkpoint`, 'info');
          } catch (e) {
            console.warn('Autosave failed:', e);
          }
        }
      }

      // 3. Tick Real-Time Combat Simulation (Pathing, Weapons Firing, Zombie Attacks, Durability Damage, §10 Research)
      const hqPos = settlement.hq?.center || null;
      const combatResult = tickCombatSimulation(
        zombies,
        combatSquadsRef.current,
        settlement.adaptedBuildings,
        noiseEvents,
        nextClock,
        hqPos,
        TICK_DELTA,
        settlement,
        droppedItems,
        hostileHumans,
        pathGridRef.current,
        isAlarmActive
      );

      // Tick 13-Hour Emergency Alarm Countdown
      if (isAlarmActive) {
        const inGameHoursAdvanced = (TICK_DELTA * (nextClock.speed === 0 ? 0 : nextClock.speed)) / 15.0;
        setAlarmHoursRemaining((prev) => {
          const nextVal = Math.max(0, prev - inGameHoursAdvanced);
          if (nextVal <= 0 && prev > 0) {
            setIsAlarmActive(false);
            setToastMessage({
              title: 'DEFENSE ALARM EXPIRED',
              desc: '13-hour defense alarm duration has completed. Colony stood down to standby.',
              type: 'info',
            });
          }
          return nextVal;
        });
      }

      let workingZombies = combatResult.updatedZombies;
      let workingSettlement = settlement;
      setDroppedItems(combatResult.droppedItems);
      setNoiseEvents(combatResult.activeNoiseEvents);
      setHostileHumans(combatResult.updatedHostileHumans);
      if (combatResult.ammoConsumed > 0) {
        workingSettlement = {
          ...workingSettlement,
          stockpile: {
            ...workingSettlement.stockpile,
            ammo: {
              ...workingSettlement.stockpile.ammo,
              sharedPool: Math.max(0, workingSettlement.stockpile.ammo.sharedPool - combatResult.ammoConsumed),
            },
          },
        };
      }

      // Scavenging Over Time: progress search when squad is inside/at building footprint
      if (mapData?.buildings) {
        for (let i = 0; i < combatResult.updatedSquads.length; i++) {
          const sq = combatResult.updatedSquads[i];
          if (sq.currentHp <= 0 || sq.state === 'downed' || sq.state === 'retreating') continue;

          // Check if squad is targeting a building or inside a building footprint
          let targetBldg = sq.targetBuildingId
            ? mapData.buildings.find((b) => String(b.id) === String(sq.targetBuildingId))
            : undefined;

          // If no explicit target building but squad is searching or idle inside a building footprint
          if (!targetBldg && (sq.state === 'searching' || (sq.state === 'idle' && !sq.targetPos))) {                  targetBldg = mapData.buildings.find((b) => isSquadInsideBuilding({ x: sq.x, z: sq.z }, b));
          }

          // Scavenging begins only after the squad reaches the precise point
          // selected by the player inside the building.
          if (targetBldg && isSquadInsideBuilding({ x: sq.x, z: sq.z }, targetBldg)) {
            const bSearch = workingSettlement.buildingSearches?.get(targetBldg.id);
            if (!bSearch?.searched) {
              const scavResult = tickBuildingScavengeProgress(
                workingSettlement,
                sq,
                targetBldg,
                TICK_DELTA * (gameClock.speed === 0 ? 0 : gameClock.speed),
                mapData.buildings
              );

              workingSettlement = scavResult.newState;
              combatResult.updatedSquads[i] = scavResult.updatedSquad;

              // If items were found this tick
              if (scavResult.itemsFoundThisTick.length > 0) {
                const foundDesc = scavResult.itemsFoundThisTick
                  .map((it) => `${formatLootLabel(it.label)} ×${it.quantity}`)
                  .join(', ');
                setToastMessage({
                  title: 'LOOT DISCOVERED',
                  desc: `${sq.name} uncovered in ${targetBldg.name || 'Structure'}: ${foundDesc}`,
                  type: 'info',
                });
                soundService.playBuildingPlaced();

                for (const it of scavResult.itemsFoundThisTick) {
                  if (it.kind === 'weapon' || it.kind === 'armor') {
                    autoEquipScavengedGear(it.itemId as WeaponItemId, it.itemId as ArmorItemId);
                  }
                }
              }

              // If inventory reached capacity
              if (scavResult.inventoryFull) {
                setToastMessage({
                  title: 'INVENTORY CAPACITY FULL',
                  desc: `${sq.name}'s backpack is full (${scavResult.updatedSquad.currentWeightKg}kg)! Returning to ${scavResult.dropoff?.name || 'Storage Depot'} to deposit supplies.`,
                  type: 'warn',
                });
                soundService.playCombatActionSFX('assault_order');
              }

              // If structure fully cleared
              if (scavResult.isCompleted) {
                setToastMessage({
                  title: 'STRUCTURE CLEARED',
                  desc: `${targetBldg.name || 'Structure'} has been fully scavenged and secured.`,
                  type: 'success',
                });
                const remainingQueue = (scavengeQueue[sq.squadId] || []).filter(
                  (id) => String(id) !== String(targetBldg.id)
                );
                setScavengeQueue((prev) => ({ ...prev, [sq.squadId]: remainingQueue }));
                const nextId = remainingQueue[0];
                const nextBuilding = nextId === undefined
                  ? undefined
                  : mapData.buildings.find((b) => String(b.id) === String(nextId));
                if (nextBuilding) {
                  combatResult.updatedSquads[i] = orderSquadMove(
                    combatResult.updatedSquads,
                    sq.squadId,
                    nextBuilding.center,
                    nextBuilding.id,
                    nextBuilding.name || nextBuilding.type
                  ).find((s) => s.squadId === sq.squadId) || combatResult.updatedSquads[i];
                }
              }
            }
          }
        }
      }

      // Auto-unload squad inventories when returning inside HQ fortress OR any completed Storage Depot
      for (let i = 0; i < combatResult.updatedSquads.length; i++) {
        const sq = combatResult.updatedSquads[i];
        const inv = workingSettlement.squadInventories?.[sq.squadId];
        if (!inv?.items?.length) continue;

        const dropoff = findNearestStorageDropoff(workingSettlement, { x: sq.x, z: sq.z }, mapData?.buildings);
        if (dropoff) {
          const dropoffBldg = mapData?.buildings.find((b) => String(b.id) === String(dropoff.buildingId));
          const isInsideDropoff = dropoffBldg
            ? isSquadInsideBuilding({ x: sq.x, z: sq.z }, dropoffBldg)
            : Math.hypot(sq.x - dropoff.x, sq.z - dropoff.z) <= 4.0;

          if (isInsideDropoff) {
            const res = unloadSquadAtDropoff(workingSettlement, sq.squadId, { x: sq.x, z: sq.z }, dropoff, 10);
            if (res.unloaded.length > 0) {
              workingSettlement = res.newState;
              const summary = res.unloaded.map((u) => `${formatLootLabel(u.label)} ×${u.quantity}`).join(', ');
              setToastMessage({
                title: `SUPPLIES SECURED AT ${dropoff.name.toUpperCase()}`,
                desc: `${sq.name} deposited haul into stockpile: ${summary}`,
                type: 'success',
              });
              soundService.playBuildingPlaced();

              if (sq.state === 'returning') {
                const nextId = scavengeQueue[sq.squadId]?.[0];
                const nextBuilding = nextId === undefined
                  ? undefined
                  : mapData?.buildings.find((b) => String(b.id) === String(nextId));
                combatResult.updatedSquads[i] = nextBuilding
                  ? orderSquadMove(combatResult.updatedSquads, sq.squadId, nextBuilding.center, nextBuilding.id, nextBuilding.name || nextBuilding.type)
                      .find((s) => s.squadId === sq.squadId) || { ...sq, state: 'idle', targetPos: null, targetBuildingName: null }
                  : { ...sq, state: 'idle', targetPos: null, targetBuildingName: null };
              }
            }
          }
        }
      }

      // Commit fully resolved squad updates (combat, scavenging, and depot dropoffs)
      combatSquadsRef.current = combatResult.updatedSquads;
      setCombatSquads(combatResult.updatedSquads);

      if (workingSettlement !== settlement) {
        setSettlement(workingSettlement);
      }

      // §5.2 ransom: hostile-human Hideout occupants capture a defeated squad
      // instead of killing it. Assign each captured squad to the nearest Hideout.
      if (combatResult.capturedSquadIds.length > 0) {
        const activeHideouts: RivalHideout[] = (
          Array.from(settlement.rivalHideouts.values()) as RivalHideout[]
        ).filter((h) => !h.isCleared && h.isDiscovered);

        if (activeHideouts.length > 0) {
          setSettlement((prev) => {
            const newHideouts = new Map(prev.rivalHideouts);
            const newSquads = [...prev.squads];
            let changed = false;

            for (const squadId of combatResult.capturedSquadIds) {
              const squadInfo = prev.squads.find((s) => s.id === squadId);
              if (!squadInfo || squadInfo.status === 'captured') continue;

              const squadUnit = combatResult.updatedSquads.find((s) => s.squadId === squadId);
              let best: RivalHideout | null = null;
              let bestDist = Infinity;
              for (const h of activeHideouts) {
                if (h.captiveSquadId) continue;
                const d = squadUnit
                  ? Math.hypot(squadUnit.x - h.position.x, squadUnit.z - h.position.z)
                  : Math.random();
                if (d < bestDist) {
                  bestDist = d;
                  best = h;
                }
              }
              if (!best) {
                best = activeHideouts.find((h) => !h.captiveSquadId) || activeHideouts[0];
              }

              const ransom = createRansomDemand(
                squadId,
                squadInfo.name,
                squadInfo.generalCount + 1,
                best.factionId
              );
              newHideouts.set(best.buildingId, {
                ...best,
                captiveSquadId: squadId,
                captiveSquadName: squadInfo.name,
                ransom,
              });
              const idx = newSquads.findIndex((s) => s.id === squadId);
              if (idx !== -1) newSquads[idx] = { ...squadInfo, status: 'captured' as const };
              setActiveRansomHideoutId(best.buildingId);
              changed = true;
            }

            return changed ? { ...prev, rivalHideouts: newHideouts, squads: newSquads } : prev;
          });
        } else {
          // No rival Hideout to hold them — fall back to the normal permanent-loss path.
          for (const squadId of combatResult.capturedSquadIds) {
            const squadUnit = combatResult.updatedSquads.find((s) => s.squadId === squadId);
            if (!squadUnit) continue;
            setSettlement((prev) => {
              const res = recordFallenHero(
                prev,
                squadUnit.leaderId,
                'combat_slain',
                `Tactical Grid (${Math.round(squadUnit.x)}, ${Math.round(squadUnit.z)})`,
                nextClock.day
              );
              return res.newState;
            });
          }
        }
      }

      // 4. Tick Infection & Outbreak Simulation (§6.2, §6.3)
      const defendersToSpawn: HostileHumanUnit[] = [];
      const spawnedHideoutIdsThisTick = new Set<string>();
      setSettlement((prev) => {
        let current = prev;

        // A. Register new bite infections from combat
        if (combatResult.newInfections.length > 0) {
          const updatedInfections = new Map(current.infections || new Map());
          for (const inf of combatResult.newInfections) {
            if (!updatedInfections.has(inf.survivorId)) {
              updatedInfections.set(inf.survivorId, inf);
            }
          }
          current = { ...current, infections: updatedInfections };
        }

        // B. Register combat fallen heroes (Permanent death §6.2)
        if (combatResult.fallenHeroEvents.length > 0) {
          for (const hero of combatResult.fallenHeroEvents) {
            const res = recordFallenHero(
              current,
              hero.survivorId,
              hero.cause,
              hero.location,
              nextClock.day
            );
            current = res.newState;
          }
        }

        // C. Apply building durability damage to settlement state if any building took damage
        let adaptedChanged = false;
        const newAdapted = new Map(current.adaptedBuildings);
        for (const [id, bldg] of combatResult.updatedAdaptedBuildings.entries()) {
          const old = current.adaptedBuildings.get(id);
          if (old && old.currentDurability !== bldg.currentDurability) {
            newAdapted.set(id, bldg);
            adaptedChanged = true;
          }
        }
        if (adaptedChanged) {
          current = { ...current, adaptedBuildings: newAdapted };
        }

        // D. Tick biological infection progression & outbreak containment
        const infSim = tickInfectionSimulation(
          current,
          TICK_DELTA,
          nextClock.speed,
          nextClock.day
        );

        if (infSim.newZombies.length > 0) {
          workingZombies = [...workingZombies, ...infSim.newZombies];
        }

        if (infSim.notifications.length > 0) {
          const ev = infSim.notifications[0];
          if (ev.title.includes('OUTBREAK') || ev.title.includes('🚨')) {
            soundService.playOutbreakAlert();
          }
          setToastMessage({
            title: ev.title,
            desc: ev.desc,
            type: ev.type,
          });
        }

        // E. Tick Vehicle Simulation & Road Navigation (§8)
        let updatedVehicles = infSim.newState.vehicles || [];
        const effectiveDelta = TICK_DELTA * (nextClock.speed === 0 ? 0 : nextClock.speed);
        if (updatedVehicles.length > 0) {
          const vehTick = updateVehiclesTick(
            updatedVehicles,
            combatResult.updatedSquads,
            workingZombies,
            effectiveDelta,
            Date.now(),
            mapDataRef.current || undefined
          );

          if (vehTick.notifications.length > 0) {
            const ev = vehTick.notifications[0];
            setToastMessage({
              title: ev.title,
              desc: ev.desc,
              type: ev.type,
            });
          }

          if (vehTick.visualFx.length > 0) {
            combatResult.newVisualFx.push(...vehTick.visualFx);
          }

          // Surface the vehicle engine noise into the noise-event stream so the
          // next combat tick's sound-detection passes it to zombies (moving
          // vehicles attract hordes to their position).
          if (vehTick.noiseEvents.length > 0) {
            setNoiseEvents((prev) => [...prev, ...vehTick.noiseEvents]);
          }

          workingZombies = vehTick.updatedZombies;
          combatResult.updatedSquads = vehTick.updatedSquads;
          updatedVehicles = vehTick.updatedVehicles;
          // Commit vehicle-tick squad changes (boarding, position sync) so the next
          // combat tick and all UI reads see the mounted squad instead of a stale copy.
          combatSquadsRef.current = vehTick.updatedSquads;
          setCombatSquads(vehTick.updatedSquads);
        }

        // F. Tick Zombie Lairs & Rival Hideouts (§5.2)
        const lairTick = tickZombieLairs(
          current.zombieLairs,
          combatResult.updatedSquads,
          mapData?.buildings || [],
          Date.now(),
          effectiveDelta
        );
        if (lairTick.spawnedZombies.length > 0) {
          workingZombies = [...workingZombies, ...lairTick.spawnedZombies];
        }

        const hideoutTick = tickRivalHideouts(
          current.rivalHideouts,
          combatResult.updatedHostileHumans,
          combatResult.updatedSquads
        );
        for (const defender of hideoutTick.spawnedDefenders) {
          if (!spawnedHideoutIdsThisTick.has(defender.hideoutId)) {
            spawnedHideoutIdsThisTick.add(defender.hideoutId);
            defendersToSpawn.push(defender);
          }
        }

        let nextState = {
          ...infSim.newState,
          vehicles: updatedVehicles,
          zombieLairs: lairTick.updatedLairs,
          rivalHideouts: hideoutTick.updatedHideouts,
        };

        // Free captives when their Hideout is cleared (§5.2 rescue path)
        for (const cleared of hideoutTick.clearedHideouts) {
          if (cleared.captiveSquadId) {
            const rescue = freeCaptive(
              nextState,
              cleared.buildingId,
              cleared.captiveSquadId,
              cleared.captiveSquadName || 'Captured Squad'
            );
            nextState = rescue.newState;
            setActiveRansomHideoutId((cur) => (cur === cleared.buildingId ? null : cur));
            setToastMessage({
              title: 'CAPTIVE RESCUED',
              desc: `${cleared.captiveSquadName} was freed when ${cleared.buildingName} fell!`,
              type: 'success',
            });
          }
        }

        for (const n of lairTick.notifications) {
          setToastMessage({ title: n.title, desc: n.desc, type: n.type });
        }
        for (const n of hideoutTick.notifications) {
          setToastMessage({ title: n.title, desc: n.desc, type: n.type });
        }

        return nextState;
      });

      if (defendersToSpawn.length > 0) {
        setHostileHumans((prev) => [...prev, ...defendersToSpawn]);
      }

      setZombies(workingZombies);

      // Automatically make contact with survivors when a squad enters a smoke-marked
      // survivor building. The smoke clue is the mission's contact signal; no extra
      // button should be required once the squad reaches the building interior.
      for (const squad of combatResult.updatedSquads) {
        if (!squad.isDeployed || squad.currentHp <= 0) continue;
        for (const group of Array.from((settlement.hiddenGroups?.values?.() || []) as Iterable<HiddenSurvivorGroup>)) {
          if (!group.hasSmokeClue || group.isRecruited) continue;
          if (!isSquadInsideBuilding({ x: squad.x, z: squad.z }, mapData.buildings.find((b) => String(b.id) === String(group.buildingId)) || ({} as BuildingPolygon))) continue;
          const groupKey = String(group.id);
          if (contactedSurvivorGroupIdsRef.current.has(groupKey)) continue;
          contactedSurvivorGroupIdsRef.current.add(groupKey);
          setSettlement((prev) => {
            const groups = new Map(prev.hiddenGroups);
            const current = groups.get(group.buildingId) as HiddenSurvivorGroup | undefined;
            if (current && !current.isDiscovered) groups.set(group.buildingId, { ...current, isDiscovered: true });
            return { ...prev, hiddenGroups: groups };
          });
          setActiveRecruitmentGroup({ ...group, isDiscovered: true });
          setToastMessage({ title: 'SURVIVORS CONTACTED', desc: `${group.leader.name} responded from ${group.buildingName}. Establish communication to determine whether they will join the colony.`, type: 'success' });
          break;
        }
      }

      // 5. Dynamic Ambient Soundscape & Danger Level calculation (§15)
      let activeAggroZombies = 0;
      let attackingZombies = 0;
      for (const z of workingZombies) {
        if (z.state === 'dead') continue;
        if (z.state === 'chasing' || z.state === 'investigating_sound') activeAggroZombies++;
        else if (z.state === 'attacking_unit' || z.state === 'attacking_building') attackingZombies++;
      }

      const activeOutbreaksCount = Array.from(settlement.outbreaks?.values() || []).filter(
        (o: any) => Boolean(o?.isOutbreakActive)
      ).length;

      const baseThreat = nextClock.isNight ? 0.35 : nextClock.phase === 'dusk' ? 0.15 : 0.0;
      const aggroThreat = Math.min(0.4, activeAggroZombies * 0.04 + attackingZombies * 0.12);
      const outbreakThreat = activeOutbreaksCount > 0 ? 0.3 : 0.0;
      const totalDanger = Math.min(1.0, baseThreat + aggroThreat + outbreakThreat);

      setDangerLevel(totalDanger);
      soundService.updateAmbient(nextClock.phase, nextClock.isNight, totalDanger);

      // Forward combat entities & visual FX to Three.js WorldScene
      if (sceneRef.current) {
        sceneRef.current.updateCombat(
          combatResult.updatedZombies,
          combatResult.updatedSquads,
          combatResult.newVisualFx,
          selectedSquadId,
          combatResult.droppedItems,
          combatResult.updatedHostileHumans,
          settlement.resourceWorkOrders || [],
          settlement.constructionOrders || []
        );

        sceneRef.current.updateVehicles(
          settlement.vehicles || [],
          selectedVehicleId
        );

        // Fog of war + faction entity markers (§3.5, §5.0). The shroud is live
        // from the moment the world loads (squads/HQ/vehicles cut it open as they
        // scout); with no vision sources yet, a starter landing-zone bubble keeps
        // spawn from being pitch black.
        const fog = settlement.fogOfWar || (mapData ? createFogGrid(mapData) : null);
        const fogEnabled = true;
        if (fog) {
          const visionSources = settlement.hq
            ? computeVisionSources(
                settlement,
                combatResult.updatedSquads,
                settlement.vehicles || []
              )
            : [];
          const visibleCells = computeVisibleCells(fog, visionSources);
          fogVisibleCellsRef.current = visibleCells;

          sceneRef.current.updateFogOfWar(fog, visibleCells, fogEnabled, visionSources);
          sceneRef.current.updateEntityMarkers(
            combatResult.updatedSquads,
            settlement.vehicles || [],
            settlement.hiddenGroups,
            combatResult.updatedZombies,
            mapData,
            fogEnabled,
            settlement.rivalHideouts,
            settlement.zombieLairs,
            settlement.resourceWorkOrders || [],
            settlement.constructionOrders || [],
            settlement.buildingSearches
          );
        }
      }

      // Handle combat notifications
      if (combatResult.settlementNotifications.length > 0) {
        const notif = combatResult.settlementNotifications[0];
        setToastMessage({ title: notif.title, desc: notif.desc, type: notif.type });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [
    viewMode,
    isDescentActive,
    mapData,
    gameClock,
    zombies,
    combatSquads,
    hostileHumans,
    droppedItems,
    noiseEvents,
    selectedSquadId,
    selectedVehicleId,
    settlement.adaptedBuildings,
    settlement.vehicles,
    settlement.hq,
    settlement.fogOfWar,
    settlement.hiddenGroups,
    settlement.rivalHideouts,
    settlement.zombieLairs,
    settlement.weather,
    settlement.isInitialized,
    timeOfDay,
  ]);

  /**
   * Load map pipeline for given coordinates and radius
   */
  const loadLocation = useCallback(
    async (lat: number, lon: number, radius: number, forceLive = false) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setLoadError(null);
      setMapData(null);
      setPendingAdaptType(null);
      setLoadingMessage('Checking local cache database...');

      // 1. Check Cache first (unless forceLive)
      if (!forceLive) {
        try {
          const cached = await getMapFromCache(lat, lon, radius);
          if (cached && cached.elevation?.grid?.length > 1 && !cached.source.includes('Topographic Sector Generator')) {
            setMapData(cached);
            setCacheSource('IndexedDB Local Cache');
            setLoadingMessage('Preparing settlement & tactical grid...');
            setDescentProgress((p) => Math.max(p, 0.3));
            setIsLoading(false);
            // Yield so the loading overlay paints the new status line before the
            // (heavy) settlement prep below blocks the main thread again.
            await new Promise((r) => setTimeout(r, 0));

            setSettlement((prev) => {
              const prepared = ensureBuildingSearchStates(prev, cached.buildings);
              if (prepared.hiddenGroups.size === 0) {
                const groups = generateHiddenGroupsForMap(cached.buildings, prev.hq?.buildingId);
                return { ...prepared, hiddenGroups: groups };
              }
              return prepared;
            });
            return;
          }
        } catch (e) {
          console.warn('Cache check error:', e);
        }
      }

      // 1.5 Prefer the bundled offline map for this location (radius-independent).
      try {
        setLoadingMessage('Loading offline map bundle...');
        setDescentProgress((p) => Math.max(p, 0.08));
        const bundled = await getBundledMapData(lat, lon);
        if (abortControllerRef.current?.signal.aborted) return;
        if (bundled) {
          setMapData(bundled);
          setLoadingMessage('Preparing road network & tactical grid...');
          setDescentProgress((p) => Math.max(p, 0.3));
          // Yield so the loading overlay paints the new status line before the
          // (heavy) road graph + settlement prep below blocks the main thread again.
          await new Promise((r) => setTimeout(r, 0));
          roadGraphRef.current = new RoadNetworkGraph(bundled.roads);
          pathGridRef.current = new PathGrid(bundled);
          setCacheSource('Bundled Offline Map');
          setSettlement((prev) => {
            const prepared = ensureBuildingSearchStates(prev, bundled.buildings);
            const groups = generateHiddenGroupsForMap(bundled.buildings, prepared.hq?.buildingId);
            const initialVehicles = prev.vehicles.length === 0 ? generateWorldVehicles(bundled, 42) : prev.vehicles;
            return { ...prepared, hiddenGroups: groups, vehicles: initialVehicles };
          });
          setIsLoading(false);
          return;
        }
      } catch (e) {
        console.warn('Bundled map load failed:', e);
      }

      // 2. Fetch live data from Overpass API + Open-Meteo DEM Elevation in parallel
      setLoadingMessage(`Querying Overpass API & DEM elevation grid (${radius}m radius)...`);
      setDescentProgress((p) => Math.max(p, 0.15));

      try {
      // Bound the live pipeline: every mirror/chunk request has its own timeout,
      // plus a global deadline so the UI can never hang on "fetching" forever.
      let deadlineId: ReturnType<typeof setTimeout> | undefined;
      const liveFetch = Promise.allSettled([
        fetchFromOverpass({ lat, lon }, radius, abortControllerRef.current.signal),
        fetchElevationGrid({ lat, lon }, radius, 16, abortControllerRef.current.signal),
      ]);
      const deadline = new Promise<never>((_, reject) => {
        deadlineId = setTimeout(
          () => reject(new Error('Live map survey timed out.')),
          40000
        );
      });

      const [rawResult, elevationResult] = await Promise.race([liveFetch, deadline]);
      if (deadlineId) clearTimeout(deadlineId);

      if (rawResult.status === 'rejected') {
        throw rawResult.reason;
      }      const raw = rawResult.value;
      if (elevationResult.status !== 'fulfilled') throw elevationResult.reason || new Error('Elevation survey failed.');
      const elevationGrid = elevationResult.value;

      setLoadingMessage('Pre-processing 3D geometry with terrain elevation heights...');
      setDescentProgress((p) => Math.max(p, 0.55));
      const processed = processOsmData(
        raw,
        { lat, lon },
        radius,
        'Live Overpass + Open-Meteo DEM',
        elevationGrid
      );

      // Save to cache
      await saveMapToCache(processed);

      setMapData(processed);
      setLoadingMessage('Preparing settlement & tactical grid...');
      setDescentProgress((p) => Math.max(p, 0.6));
      await new Promise((r) => setTimeout(r, 0));
      roadGraphRef.current = new RoadNetworkGraph(processed.roads);
      pathGridRef.current = new PathGrid(processed);
      setCacheSource(
        elevationResult.status === 'fulfilled'
          ? 'Live Overpass + Open-Meteo DEM (Cached)'
          : 'Live Overpass API (Cached)'
      );

      setSettlement((prev) => {
        const prepared = ensureBuildingSearchStates(prev, processed.buildings);
        const groups = generateHiddenGroupsForMap(processed.buildings, prepared.hq?.buildingId);
        const initialVehicles = prev.vehicles.length === 0 ? generateWorldVehicles(processed, 42) : prev.vehicles;
        return { ...prepared, hiddenGroups: groups, vehicles: initialVehicles };
      });
      setIsLoading(false);
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
          return;
        }
        console.warn('Overpass API query failed or timed out:', err);

        // Fall back to the bundled offline map if one exists for these coordinates.
        try {
          setLoadingMessage('Loading offline map bundle...');
          setDescentProgress((p) => Math.max(p, 0.08));
          const bundled = await getBundledMapData(lat, lon);
          if (bundled) {
            setMapData(bundled);
            setLoadingMessage('Preparing road network & tactical grid...');
            setDescentProgress((p) => Math.max(p, 0.3));
            await new Promise((r) => setTimeout(r, 0));
            roadGraphRef.current = new RoadNetworkGraph(bundled.roads);
            pathGridRef.current = new PathGrid(bundled);
            setCacheSource('Bundled Offline Map');
            setSettlement((prev) => {
              const prepared = ensureBuildingSearchStates(prev, bundled.buildings);
              const groups = generateHiddenGroupsForMap(bundled.buildings, prepared.hq?.buildingId);
              const initialVehicles = prev.vehicles.length === 0 ? generateWorldVehicles(bundled, 42) : prev.vehicles;
              return { ...prepared, hiddenGroups: groups, vehicles: initialVehicles };
            });
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.warn('Bundled fallback map load failed:', e);
        }

        setLoadError(
          `Overpass API mirror was busy or rate-limited (${err.message || 'Network error'}). Using pre-processed dataset with elevation.`
        );
        setIsLoading(false);

        setMapData(null);
        setCacheSource('Survey failed');
        setIsLoading(false);
      }
    },
    [mapData]
  );

  // Handle settlement confirmed from Globe View (Founding New Colony §7.5)
  const handleConfirmSettlementPlacement = (
    placement: SettlementPlacement,
    preloadedMapData?: MapData | null,
    scenarioSettings?: GameScenarioSettings
  ) => {
    setActivePlacement(placement);
    setViewMode('world');
    setSelectedBuilding(null);
    setHoveredBuilding(null);
    setClickedPosition(null);
    setSelectedSquadId(null);
    setSelectedVehicleId(null);

    const newId = `settlement_${Date.now()}`;
    const newName = scenarioSettings?.colonyName ? `${scenarioSettings.colonyName}` : `${placement.sectorName} Colony`;
    const newSettlementState = createInitialSettlementState(newName, scenarioSettings);

    const newRecord: SettlementRecord = {
      id: newId,
      name: newName,
      placement,
      state: newSettlementState,
      status: 'operational',
      dayEstablished: gameClock.day,
    };

    // Save previous active colony state and append new one
    setSettlements((prev) => ({
      ...prev,
      [activeSettlementId]: {
        ...prev[activeSettlementId],
        state: settlement,
        cachedMapData: mapData || undefined,
        cachedZombies: zombies,
      },
      [newId]: newRecord,
    }));

    setActiveSettlementId(newId);
    setSettlement(newSettlementState);
    settlementRef.current = newSettlementState;
    const initialRadio = getInitialRadioDirectiveState();
    setRadioDirectiveState(initialRadio);
    setActiveRadioTransmission(initialRadio.currentIncomingTransmission);

    // Find if it matches a preset
    const matchedPreset = LOCATION_PRESETS.find(
      (p) =>
        Math.abs(p.lat - placement.center.lat) < 0.005 &&
        Math.abs(p.lon - placement.center.lon) < 0.005
    );

    if (matchedPreset) {
      setCurrentPreset(matchedPreset);
    } else {
      setCurrentPreset({
        id: 'custom_sector',
        name: placement.sectorName,
        country: placement.country || 'Custom Location',
        lat: placement.center.lat,
        lon: placement.center.lon,
        radius: placement.radius,
        description: placement.locationDetails || 'Surveyed sector from orbital satellite.',
      });
    }

    if (preloadedMapData) {
      // The Street View recon screen already fetched and processed this exact
      // sector (geometry + elevation). Use it directly — the map loads exactly
      // once; no second fetch after the HUD appears.
      setMapData(preloadedMapData);
      roadGraphRef.current = new RoadNetworkGraph(preloadedMapData.roads);
      pathGridRef.current = new PathGrid(preloadedMapData);
      setCacheSource(
        preloadedMapData.source?.includes('Bundled')
          ? 'Bundled Offline Map'
          : 'Street Recon Survey (Live OSM + DEM)'
      );
      setSettlement((prev) => {
        const prepared = ensureBuildingSearchStates(prev, preloadedMapData.buildings);
        const groups = generateHiddenGroupsForMap(preloadedMapData.buildings, prepared.hq?.buildingId);
        const initialVehicles = prev.vehicles.length === 0 ? generateWorldVehicles(preloadedMapData, 42) : prev.vehicles;
        return { ...prepared, hiddenGroups: groups, vehicles: initialVehicles };
      });
      if (!preloadedMapData.source?.includes('Bundled')) {
        saveMapToCache(preloadedMapData).catch(() => {});
      }
      setIsLoading(false);
      setLoadingMessage('');
    } else {
      loadLocation(placement.center.lat, placement.center.lon, placement.radius);
    }

    if (sceneRef.current) {
      sceneRef.current.cameraController.resetCamera();
    }

    setToastMessage({
      title: 'NEW COLONY FOUNDED',
      desc: `Established ${newName} in ${placement.country || 'Sector'}. Surveying perimeter.`,
      type: 'success',
    });
  };

  // Kick off the single atmospheric-descent loading screen and drop into the
  // world beneath it. The descent stays up until the scene has rendered, so the
  // player lands directly into a filled-in world (no second loading screen).
  const handleBeginDescent = useCallback(
    (placement: SettlementPlacement, preloadedMapData?: MapData | null, scenarioSettings?: GameScenarioSettings) => {
      stopDescentTimer();
      setIsDescentActive(true);
      setDescentProgress(0);
      setDescentAltitudeKm(1200);

      handleConfirmSettlementPlacement(placement, preloadedMapData, scenarioSettings);

      const startTime = performance.now();
      const durationMs = 2400;
      descentTimerRef.current = setInterval(() => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        // The timer only animates the descent altitude and creeps the progress
        // bar to 30%; the real load pipeline drives it the rest of the way.
        setDescentProgress((p) => (p < 0.3 ? Math.min(0.3, Math.max(p, progress * 0.3)) : p));
        const alt = Math.round(1200 * Math.pow(1 - progress, 2.5));
        setDescentAltitudeKm(Math.max(1, alt));
      }, 40);
    },
    [handleConfirmSettlementPlacement, stopDescentTimer]
  );

  // Switch between existing colonies (§7.5)
  const handleSelectExistingSettlement = (targetId: string) => {
    if (targetId === activeSettlementId && viewMode === 'world') return;

    // 1. Save current active colony state
    const updatedSettlements: Record<string, SettlementRecord> = {
      ...settlements,
      [activeSettlementId]: {
        ...settlements[activeSettlementId],
        state: settlement,
        cachedMapData: mapData || undefined,
        cachedZombies: zombies,
      },
    };
    setSettlements(updatedSettlements);

    const target = updatedSettlements[targetId];
    if (!target) return;

    setActiveSettlementId(targetId);
    setSettlement(target.state);
    setActivePlacement(target.placement);
    setSelectedBuilding(null);
    setHoveredBuilding(null);
    setClickedPosition(null);
    setSelectedSquadId(null);
    setSelectedVehicleId(null);

    const matchedPreset = LOCATION_PRESETS.find(
      (p) =>
        Math.abs(p.lat - target.placement.center.lat) < 0.005 &&
        Math.abs(p.lon - target.placement.center.lon) < 0.005
    );
    if (matchedPreset) {
      setCurrentPreset(matchedPreset);
    }

    if (target.cachedMapData) {
      setMapData(target.cachedMapData);
      roadGraphRef.current = new RoadNetworkGraph(target.cachedMapData.roads);
      pathGridRef.current = new PathGrid(target.cachedMapData);
      if (target.cachedZombies) {
        setZombies(target.cachedZombies);
      }
      setIsLoading(false);
    } else {
      loadLocation(target.placement.center.lat, target.placement.center.lon, target.placement.radius);
    }

    setViewMode('world');
    if (sceneRef.current) {
      sceneRef.current.cameraController.resetCamera();
    }
  };

  // Dispatch Trade Caravan (§7.5)
  const handleDispatchCaravan = (config: CaravanDispatchConfig) => {
    try {
      const currentSettlements = {
        ...settlements,
        [activeSettlementId]: {
          ...settlements[activeSettlementId],
          state: settlement,
        },
      };

      const res = dispatchCaravan(currentSettlements, config, gameClock.day);
      if (!res.success || !res.newCaravan) {
        throw new Error(res.error || 'Could not dispatch caravan.');
      }
      const newCaravan = res.newCaravan;
      setCaravans((prev) => [...prev, newCaravan]);
      setSettlements(res.updatedSettlements);
      if (res.updatedSettlements[activeSettlementId]) {
        setSettlement(res.updatedSettlements[activeSettlementId].state);
      }

      const travelHours = (newCaravan.totalDurationSeconds / 60).toFixed(1);
      setToastMessage({
        title: 'TRADE CARAVAN DISPATCHED',
        desc: `${newCaravan.name} en route to ${newCaravan.destinationSettlementName} (${newCaravan.distanceKm.toFixed(0)} km, ~${travelHours}h travel).`,
        type: 'success',
      });
      setIsCaravansModalOpen(false);
    } catch (e: any) {
      setToastMessage({
        title: 'Caravan Dispatch Failed',
        desc: e.message || 'Could not launch trade caravan.',
        type: 'warn',
      });
    }
  };

  // --- Game Flow, Persistence & Save/Load Handlers ---

  const handleSaveGame = useCallback(
    (customName?: string, overwriteId?: string) => {
      try {
        const name = customName || `${settlement.name || 'Expedition'} (Day ${gameClock.day})`;
        const activePlacementRecord = settlements[activeSettlementId]?.placement || activePlacement || {
          center: { lat: currentPreset.lat, lon: currentPreset.lon },
          zoneSize: '3x3' as const,
          radius: currentPreset.radius,
          offsetMeters: { x: 0, z: 0 },
          rotationDeg: 0,
          sectorName: currentPreset.name,
          country: currentPreset.country,
          locationDetails: currentPreset.description,
        };

        const meta = saveService.saveGame(
          name,
          'manual',
          {
            settlements,
            activeSettlementId,
            settlement,
            gameClock,
            activePlacement: activePlacementRecord,
            currentPreset,
            mapData,
            caravans,
            radioState: radioDirectiveState,
            hasCompletedFirstScavenge: true,
            combatSquads,
            zombies,
            worldVehicles: settlement.vehicles || [],
            dangerLevel,
            timeOfDay,
          },
          overwriteId
        );

        setToastMessage({
          title: 'MISSION RECORD SAVED',
          desc: `Saved "${meta.name}" // Day ${meta.day} [${meta.season.toUpperCase()}]`,
          type: 'success',
        });
        soundService.playBuildingPlaced();
        setIsSaveLoadModalOpen(false);
      } catch (err: any) {
        setToastMessage({
          title: 'Save Failed',
          desc: err.message || 'Could not write save file to storage.',
          type: 'warn',
        });
      }
    },
    [
      settlement,
      gameClock,
      settlements,
      activeSettlementId,
      activePlacement,
      currentPreset,
      mapData,
      caravans,
      radioDirectiveState,
      combatSquads,
      zombies,
      dangerLevel,
      timeOfDay,
    ]
  );

  const handleQuickSave = useCallback(() => {
    try {
      const activePlacementRecord = settlements[activeSettlementId]?.placement || activePlacement || {
        center: { lat: currentPreset.lat, lon: currentPreset.lon },
        zoneSize: '3x3' as const,
        radius: currentPreset.radius,
        offsetMeters: { x: 0, z: 0 },
        rotationDeg: 0,
        sectorName: currentPreset.name,
        country: currentPreset.country,
        locationDetails: currentPreset.description,
      };

      const meta = saveService.saveGame(
        `${settlement.name || 'Sector'} [Quick Save]`,
        'quicksave',
        {
          settlements,
          activeSettlementId,
          settlement,
          gameClock,
          activePlacement: activePlacementRecord,
          currentPreset,
          mapData,
          caravans,
          radioState: radioDirectiveState,
          hasCompletedFirstScavenge: true,
          combatSquads,
          zombies,
          worldVehicles: settlement.vehicles || [],
          dangerLevel,
          timeOfDay,
        }
      );

      setToastMessage({
        title: 'EXPEDITION QUICK-SAVED',
        desc: `Checkpoint recorded (Day ${meta.day}, ${meta.hour.toString().padStart(2, '0')}:00)`,
        type: 'info',
      });
      soundService.playBuildingPlaced();
    } catch (err: any) {
      setToastMessage({
        title: 'Quick Save Failed',
        desc: err.message || 'Storage full or inaccessible.',
        type: 'warn',
      });
    }
  }, [
    settlement,
    gameClock,
    settlements,
    activeSettlementId,
    activePlacement,
    currentPreset,
    mapData,
    caravans,
    radioDirectiveState,
    combatSquads,
    zombies,
    dangerLevel,
    timeOfDay,
  ]);

  const handleLoadGame = useCallback(
    (saveId: string) => {
      try {
        const fullSave = saveService.loadGame(saveId);
        if (!fullSave || !fullSave.statePayload) {
          throw new Error('Save file corrupted or missing.');
        }

        const payload = fullSave.statePayload;

        // Restore multi-settlements registry
        if (payload.settlements) setSettlements(payload.settlements);
        if (payload.activeSettlementId) setActiveSettlementId(payload.activeSettlementId);
        if (payload.settlement) setSettlement(payload.settlement);
        if (payload.gameClock) setGameClock(payload.gameClock);
        if (payload.activePlacement) setActivePlacement(payload.activePlacement);
        if (payload.currentPreset) setCurrentPreset(payload.currentPreset);
        setCaravans(payload.caravans || []);
        if (payload.radioState) {
          setRadioDirectiveState(payload.radioState);
          setActiveRadioTransmission(payload.radioState.currentIncomingTransmission || null);
        }
        setDangerLevel(payload.dangerLevel || 0);
        setTimeOfDay((payload.timeOfDay as TimeOfDay) || 'day');

        if (payload.combatSquads && payload.combatSquads.length > 0) {
          setCombatSquads(payload.combatSquads);
          combatSquadsRef.current = payload.combatSquads;
        }

        if (payload.zombies && payload.zombies.length > 0) {
          setZombies(payload.zombies);
        }

        if (payload.mapData) {
          setMapData(payload.mapData);
          roadGraphRef.current = new RoadNetworkGraph(payload.mapData.roads);
          pathGridRef.current = new PathGrid(payload.mapData);
          setCacheSource('Loaded from Save File');
        } else if (payload.activePlacement) {
          loadLocation(
            payload.activePlacement.center.lat,
            payload.activePlacement.center.lon,
            payload.activePlacement.radius
          );
        }

        setIsPauseMenuOpen(false);
        setIsSaveLoadModalOpen(false);
        setViewMode('world');

        if (sceneRef.current) {
          sceneRef.current.cameraController.resetCamera();
        }

        setToastMessage({
          title: 'EXPEDITION RESUMED',
          desc: `Loaded "${fullSave.meta.name}" // Day ${fullSave.meta.day}`,
          type: 'success',
        });
        soundService.playGunfire();
      } catch (err: any) {
        setToastMessage({
          title: 'Load Failed',
          desc: err.message || 'Could not load save file.',
          type: 'warn',
        });
      }
    },
    [loadLocation]
  );

  const handleQuickLoad = useCallback(() => {
    const latest = saveService.getLatestSave();
    if (!latest) {
      setToastMessage({
        title: 'NO SAVES FOUND',
        desc: 'No prior expedition save exists to quick load.',
        type: 'warn',
      });
      return;
    }
    handleLoadGame(latest.id);
  }, [handleLoadGame]);

  const handleContinueGame = useCallback(() => {
    const latest = saveService.getLatestSave();
    if (!latest) {
      setIsNewGameModalOpen(true);
      return;
    }
    handleLoadGame(latest.id);
  }, [handleLoadGame]);

  const handleStartNewGame = useCallback(
    (scenario: GameScenarioSettings, preset: LocationPreset, openGlobeDirectly: boolean) => {
      const newSettlement = createInitialSettlementState(scenario.colonyName, scenario);

      if (scenario.startingSupplies === 'plentiful') {
        newSettlement.stockpile.food.canned_goods = 80;
        newSettlement.stockpile.food.fresh_harvest = 40;
        newSettlement.stockpile.materials.wood = 120;
        newSettlement.stockpile.materials.metal = 80;
        newSettlement.stockpile.ammo.sharedPool = 120;
        newSettlement.stockpile.medical.first_aid_kits = 10;
        newSettlement.stockpile.medical.antibiotics = 6;
      } else if (scenario.startingSupplies === 'scarce') {
        newSettlement.stockpile.food.canned_goods = 20;
        newSettlement.stockpile.materials.wood = 30;
        newSettlement.stockpile.materials.metal = 15;
        newSettlement.stockpile.ammo.sharedPool = 30;
        newSettlement.stockpile.medical.first_aid_kits = 2;
        newSettlement.stockpile.medical.antibiotics = 0;
      }

      // Align the actual starting population to the player's chosen option
      // (LOW 5 / MED 10 / HIGH 18 — or the difficulty-preset count).
      // `createInitialSettlementState` seeds a medium baseline; this normalizes
      // total + unassigned so the colony starts with exactly the chosen number.
      newSettlement.generalPopulation.total = Math.max(0, scenario.startingPopulation - newSettlement.namedSurvivors.length);
      newSettlement.generalPopulation.unassigned = newSettlement.generalPopulation.total;

      newSettlement.weather = {
        currentSeason: scenario.startingSeason,
        seasonDay: 1,
        year: 1,
        currentWeather: scenario.startingSeason === 'winter' ? 'freezing_frost' : 'clear',
        moonPhase: 'waxing',
        temperatureC: scenario.startingSeason === 'winter' ? -4 : scenario.startingSeason === 'summer' ? 27 : 16,
        windSpeedKmh: 14,
        rainwaterCollectionActive: false,
        weatherDurationHours: 24,
        weatherElapsedHours: 0,
        greenhouseInsulatedYield: 1.0,
        outdoorCropYield: scenario.startingSeason === 'winter' ? 0.25 : 1.0,
        effectiveCropYieldMultiplier: scenario.startingSeason === 'winter' ? 0.25 : 1.0,
      };

      const newId = `settlement_${Date.now()}`;
      const newPlacement: SettlementPlacement = {
        center: { lat: preset.lat, lon: preset.lon },
        zoneSize: '3x3',
        radius: preset.radius,
        offsetMeters: { x: 0, z: 0 },
        rotationDeg: 0,
        sectorName: preset.name,
        country: preset.country,
        locationDetails: preset.description,
      };

      const newRecord: SettlementRecord = {
        id: newId,
        name: scenario.colonyName,
        placement: newPlacement,
        state: newSettlement,
        status: 'operational',
        dayEstablished: 1,
      };

      setSettlements({ [newId]: newRecord });
      setActiveSettlementId(newId);
      setSettlement(newSettlement);
      setCurrentPreset(preset);
      setActivePlacement(newPlacement);
      // New expeditions begin in a deliberate planning pause. Establishing an HQ
      // is the explicit hand-off from setup into live simulation.
      setGameClock({ ...createInitialGameClock(), speed: 0 });
      setCaravans([]);
      setOverrunSettlement(null);
      setIsExtinct(false);
      setRadioDirectiveState(getInitialRadioDirectiveState());
      setActiveRadioTransmission(getInitialRadioDirectiveState().currentIncomingTransmission);

      setIsNewGameModalOpen(false);

      if (openGlobeDirectly) {
        setViewMode('globe');
      } else {
        stopDescentTimer();
        setIsDescentActive(true);
        setDescentProgress(0);
        setDescentAltitudeKm(1200);
        setViewMode('world');
        loadLocation(preset.lat, preset.lon, preset.radius);
        if (sceneRef.current) {
          sceneRef.current.cameraController.resetCamera();
        }

        const startTime = performance.now();
        const durationMs = 2400;
        descentTimerRef.current = setInterval(() => {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(1, elapsed / durationMs);
          // The timer only animates the descent altitude and creeps the progress
          // bar to 30%; the real load pipeline drives it the rest of the way.
          setDescentProgress((p) => (p < 0.3 ? Math.min(0.3, Math.max(p, progress * 0.3)) : p));
          const alt = Math.round(1200 * Math.pow(1 - progress, 2.5));
          setDescentAltitudeKm(Math.max(1, alt));
        }, 40);
      }

      setToastMessage({
        title: 'EXPEDITION LAUNCHED',
        desc: `Deployed into ${preset.name} (${preset.country}). Establish your initial HQ fortress.`,
        type: 'success',
      });
      soundService.playBuildingPlaced();
    },
    [loadLocation, stopDescentTimer]
  );

  const handleExitToMainMenu = useCallback(() => {
    setGameClock((prev) => ({ ...prev, speed: 0 }));
    setIsPauseMenuOpen(false);
    setIsSaveLoadModalOpen(false);
    setIsCodexModalOpen(false);
    setIsSettingsModalOpen(false);
    setIsCreditsModalOpen(false);
    setViewMode('main_menu');
    setToastMessage({
      title: 'COMMAND HQ',
      desc: 'Returned to Main Operations Terminal.',
      type: 'info',
    });
  }, []);

  const handleApplyGameSettings = useCallback((settings: GameSettings) => {
    setElevationExaggeration(settings.elevationExaggeration);
    setDisableElevation(settings.disableElevation);
    setShowTerrainWireframe(settings.showTerrainWireframe);
    setShowBuildingEdges(settings.showBuildingEdges);
  }, []);

  // Global Keyboard Shortcuts (ESC, F5, F9, Space, 1, 2, 3, 4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) {
        return;
      }

      if (e.key === 'Escape') {
        if (viewMode === 'world') {
          if (selectedBuilding) {
            setSelectedBuilding(null);
          } else if (selectedSquadId) {
            setSelectedSquadId(null);
          } else if (selectedVehicleId) {
            setSelectedVehicleId(null);
          } else {
            setIsPauseMenuOpen((prev) => !prev);
          }
        }
      } else if (e.key === 'F5') {
        e.preventDefault();
        if (viewMode === 'world') {
          handleQuickSave();
        }
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleQuickLoad();
      } else if (e.key === ' ' || e.code === 'Space') {
        if (viewMode === 'world') {
          e.preventDefault();
          setGameClock((prev) => {
            const nextSpeed = prev.speed === 0 ? 1 : 0;
            if (nextSpeed === 0) {
              soundService.playTimePause();
            } else {
              soundService.playTimeResume();
            }
            return {
              ...prev,
              speed: nextSpeed,
            };
          });
        }
      } else if (e.key === '1') {
        if (viewMode === 'world') {
          soundService.playTimeSpeed(1);
          setGameClock((p) => ({ ...p, speed: 1 }));
        }
      } else if (e.key === '2') {
        if (viewMode === 'world') {
          soundService.playTimeSpeed(2);
          setGameClock((p) => ({ ...p, speed: 2 }));
        }
      } else if (e.key === '3' || e.key === '4') {
        if (viewMode === 'world') {
          soundService.playTimeSpeed(4);
          setGameClock((p) => ({ ...p, speed: 4 }));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, selectedBuilding, selectedSquadId, selectedVehicleId, handleQuickSave, handleQuickLoad]);

  // Restart after total extinction (§7.5)
  const handleRestartGame = () => {
    setIsExtinct(false);
    setOverrunSettlement(null);
    setCaravans([]);
    const resetId = 'settlement_oxford';
    const initial = createInitialSettlementState('Oxford Sector Command');
    setSettlements({
      [resetId]: {
        id: resetId,
        name: 'Oxford Sector Colony',
        placement: {
          center: { lat: DEFAULT_PRESET.lat, lon: DEFAULT_PRESET.lon },
          zoneSize: '3x3', radius: DEFAULT_PRESET.radius,
          offsetMeters: { x: 0, z: 0 },
          rotationDeg: 0,
          sectorName: DEFAULT_PRESET.name,
          country: DEFAULT_PRESET.country,
          locationDetails: DEFAULT_PRESET.description,
        },
        state: initial,
        status: 'operational',
        dayEstablished: 1,
      },
    });
    setActiveSettlementId(resetId);
    setSettlement(initial);      // New games begin in planning pause; HQ confirmation starts live time.
      setGameClock({ ...createInitialGameClock(), speed: 0 });
    setViewMode('globe');
  };

  const handleSelectPreset = (preset: LocationPreset) => {
    setCurrentPreset(preset);
    setSelectedBuilding(null);
    loadLocation(preset.lat, preset.lon, preset.radius);
    if (sceneRef.current) {
      sceneRef.current.cameraController.resetCamera();
    }
  };

  const handleFetchCustom = (lat: number, lon: number, radius: number) => {
    setSelectedBuilding(null);
    loadLocation(lat, lon, radius, true);
    if (sceneRef.current) {
      sceneRef.current.cameraController.resetCamera();
    }
  };

  const handleClearCache = async () => {
    await clearMapCache();
    setCacheSource('Cache Cleared');
  };

  const handleRefetch = () => {
    if (mapData) {
      loadLocation(mapData.center.lat, mapData.center.lon, mapData.radius, true);
    } else {
      loadLocation(currentPreset.lat, currentPreset.lon, currentPreset.radius, true);
    }
  };

  const handleFocusBuilding = (bldg: BuildingPolygon) => {
    if (sceneRef.current) {
      sceneRef.current.cameraController.focusOn(bldg.center, 80);
    }
  };

  const handleResetCamera = () => {
    if (sceneRef.current) {
      sceneRef.current.cameraController.resetCamera();
    }
  };

  const handleReturnToGlobe = () => {
    setViewMode('globe');
  };

  // --- Settlement Actions ---

  const handleConfirmHQ = (bldg: BuildingPolygon) => {
    try {
      const updated = establishSettlementHQ(settlement, bldg);
      settlementRef.current = updated;
      setSettlement(updated);
      setSelectedBuilding(bldg);
      // Establishing the HQ is the explicit transition from setup to live play.
      setGameClock((prev) => ({ ...prev, speed: 1 }));
      soundService.playBuildingPlaced();
      setToastMessage({
        title: 'HEADQUARTERS ESTABLISHED',
        desc: `Secured command center at ${bldg.name || 'OSM Structure'}. Base inventory initialized.`,
        type: 'success',
      });

      // Instantly evaluate Radio Directive System on HQ confirmation for immediate feedback
      setRadioDirectiveState((prevRadio) => {
        const { newState, newTransmissionsCount } = updateRadioDirectiveSystem(
          prevRadio,
          updated,
          gameClockRef.current || gameClock,
          zombiesRef.current || zombies
        );
        if (
          newTransmissionsCount > 0 &&
          newState.currentIncomingTransmission &&
          newState.currentIncomingTransmission.id !== prevRadio.currentIncomingTransmission?.id
        ) {
          const incoming = newState.currentIncomingTransmission;
          soundService.playRadioChirp();
          if (radioAlertIdsRef.current.has(incoming.id)) return newState;
          radioAlertIdsRef.current.add(incoming.id);
          addTacticalAlert(
            `RADIO: ${incoming.classification}`,
            `${incoming.callsign}: ${incoming.title}`,
            incoming.classification === 'EMERGENCY'
              ? 'danger'
              : incoming.classification === 'WARNING'
              ? 'warn'
              : 'info',
            () => {
              setActiveRadioTransmission(incoming);
              setIsRadioModalOpen(true);
            }
          );
        }
        return newState;
      });
    } catch (e: any) {
      setToastMessage({
        title: 'HQ Establishment Failed',
        desc: e.message || 'Could not designate building as HQ.',
        type: 'warn',
      });
    }
  };

  const handleAdaptBuilding = (bldg: BuildingPolygon, typeId: FunctionalBuildingTypeId) => {
    try {
      let success = false;
      let errorMsg = '';
      setSettlement((prev) => {
        const res = adaptBuilding(prev, bldg, typeId);
        if (!res.success) {
          errorMsg = res.error || 'Failed adapting building.';
          return prev;
        }
        success = true;
        settlementRef.current = res.newState;
        return res.newState;
      });

      if (!success) {
        throw new Error(errorMsg || 'Failed adapting building.');
      }

      setSelectedBuilding(bldg);
      soundService.playBuildingPlaced();
      setToastMessage({
        title: 'CONSTRUCTION DISPATCHED',
        desc: `Building crew en route to adapt structure. Resources will be progressively consumed as work advances.`,
        type: 'info',
      });
    } catch (e: any) {
      setToastMessage({
        title: 'Adaptation Error',
        desc: e.message || 'Failed adapting structure.',
        type: 'warn',
      });
    }
  };

  const handleBuildFreestanding = (typeId: FunctionalBuildingTypeId, pos: Point2D) => {
    try {
      const res = buildFreestanding(settlement, typeId, pos);
      if (!res.success) {
        throw new Error(res.error || 'Failed freestanding construction.');
      }
      setSettlement(res.newState);
      soundService.playBuildingPlaced();
      setToastMessage({
        title: 'FREESTANDING STRUCTURE ASSEMBLED',
        desc: `New building constructed on open ground at (${pos.x.toFixed(0)}m, ${pos.z.toFixed(0)}m).`,
        type: 'success',
      });
    } catch (e: any) {
      setToastMessage({
        title: 'Construction Error',
        desc: e.message || 'Failed freestanding construction.',
        type: 'warn',
      });
    }
  };

  const handleOrderDeconstruction = (bldgId: string | number) => {
    try {
      // Plain, unadapted OSM buildings need their footprint to estimate recovered
      // materials (§7.2). Adapted/freestanding structures carry that data already.
      const isAdapted = settlement.adaptedBuildings?.get(bldgId) != null;
      const isFreestanding = settlement.freestandingBuildings?.some(
        (f) => String(f.buildingId) === String(bldgId)
      );
      const plainBldg = !isAdapted && !isFreestanding
        ? selectedBuilding && String(selectedBuilding.id) === String(bldgId)
          ? selectedBuilding
          : mapData?.buildings.find((b) => String(b.id) === String(bldgId))
        : undefined;

      const res = orderDeconstruction(settlement, bldgId, plainBldg);
      if (!res.success) {
        throw new Error(res.error || 'Failed ordering deconstruction.');
      }
      setSettlement(res.newState);
      setToastMessage({
        title: 'DECONSTRUCTION ORDERED',
        desc: 'Construction workers assigned. The structure stays on the map until demolition completes.',
        type: 'info',
      });
    } catch (e: any) {
      setToastMessage({
        title: 'Deconstruction Error',
        desc: e.message || 'Failed ordering deconstruction.',
        type: 'warn',
      });
    }
  };

  const handleCancelDeconstruction = (bldgId: string | number) => {
    const updated = cancelDeconstruction(settlement, bldgId);
    setSettlement(updated);
    setToastMessage({
      title: 'DECONSTRUCTION CANCELLED',
      desc: 'Demolition halted. The structure remains intact and workers return to the labour pool.',
      type: 'info',
    });
  };

  const handleDesignateGatherArea = (
    type: GatherResourceType,
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  ) => {
    setActiveGatherType(null);
    if (!mapData) return;

    if (type === 'demolish') {
      const bldg = mapData.buildings.find(b =>
        b.center.x >= bounds.minX && b.center.x <= bounds.maxX &&
        b.center.z >= bounds.minZ && b.center.z <= bounds.maxZ &&
        String(b.id) !== String(settlement.hq?.buildingId)
      );
      if (bldg) handleOrderDeconstruction(bldg.id);
      else setToastMessage({ title: 'NO STRUCTURE SELECTED', desc: 'No dismantlable structure was found in the designated area.', type: 'info' });
      return;
    }

    const nodes = mapData.resourceNodes.filter(n =>
      n.type === type && n.amount > 0 &&
      n.position.x >= bounds.minX && n.position.x <= bounds.maxX &&
      n.position.z >= bounds.minZ && n.position.z <= bounds.maxZ
    );
    if (!nodes.length) {
      setToastMessage({ title: 'NO RESOURCE NODES', desc: `No available ${type} nodes were found in the designated area.`, type: 'info' });
      return;
    }

    let remaining = Math.max(0, settlement.generalPopulation.total - settlement.squads.reduce((n, sq) => n + sq.generalCount, 0) - settlement.resourceWorkOrders.reduce((n, w) => n + w.workerCount, 0));
    let updated = settlement;
    let assigned = 0;
    for (const node of nodes) {
      if (remaining <= 0) break;
      const count = Math.min(2, remaining);
      const result = assignResourceGatherers(updated, mapData, node.id, count);
      if (result.success) { updated = result.newState; remaining -= count; assigned += count; }
    }
    setSettlement(updated);
    setToastMessage({ title: 'GATHERING AREA DESIGNATED', desc: `${assigned} general workers assigned to physical ${type} nodes.`, type: 'success' });
  };

  // --- Population & Squad Handlers (§4.1 - §4.6) ---

  const handleAppointHead = (survivorId: string, buildingId: string | number, title?: string) => {
    try {
      const updated = appointBuildingHead(settlement, survivorId, buildingId, title);
      setSettlement(updated);
      const survivor = updated.namedSurvivors.find((s) => s.id === survivorId);
      setToastMessage({
        title: 'FACILITY HEAD APPOINTED',
        desc: `${survivor?.name || 'Survivor'} is now serving as ${title || 'Facility Head'} with efficiency bonuses.`,
        type: 'success',
      });
    } catch (e: any) {
      setToastMessage({
        title: 'Appointment Failed',
        desc: e.message || 'Could not assign facility head.',
        type: 'warn',
      });
    }
  };

  const handleVacateSurvivorRole = (survivorId: string) => {
    const updated = vacateSurvivorRole(settlement, survivorId);
    setSettlement(updated);
    setToastMessage({
      title: 'ROLE VACATED',
      desc: 'Survivor reassigned to general unassigned pool.',
      type: 'info',
    });
  };

  const handleUpdateJobPriorities = (priorities: Record<JobSector, number>) => {
    const updated = updateJobPriorities(settlement, priorities);
    setSettlement(updated);
    setToastMessage({
      title: 'LABOR REBALANCED',
      desc: 'Workforce distribution updated according to new sector priorities.',
      type: 'info',
    });
  };

  const handleCreateSquad = (squadName: string, leaderId: string, generalCount: number) => {
    const currentSettlement = settlementRef.current || settlement;
    const res = createSquad(currentSettlement, squadName, leaderId, generalCount);

    if (!res.success) {
      setToastMessage({
        title: 'Squad Creation Failed',
        desc: res.error || 'Could not form squad.',
        type: 'warn',
      });
      return;
    }

    const created = res.newState.squads[res.newState.squads.length - 1];
    settlementRef.current = res.newState;
    setSettlement(res.newState);

    const updatedCombatSquads = syncTacticalSquadUnits(res.newState, combatSquadsRef.current);
    combatSquadsRef.current = updatedCombatSquads;
    setCombatSquads(updatedCombatSquads);

    if (created) {
      // Tactical units use the same settlement squad id; selecting through the
      // HUD must therefore resolve the newly entered name immediately.
      setSelectedSquadId(created.id);
      const createdCombatSquad = updatedCombatSquads.find((s) => s.squadId === created.id);
      if (createdCombatSquad && createdCombatSquad.name !== created.name) {
        setCombatSquads(updatedCombatSquads.map((s) =>
          s.squadId === created.id ? { ...s, name: created.name } : s
        ));
      }
    }

    setToastMessage({
      title: 'SQUAD FORMED',
      desc: `Tactical squad "${created?.name || squadName}" formed with leader and ${created?.generalCount ?? generalCount} members.`,
      type: 'success',
    });

    // Instantly evaluate Radio Directive System on squad formation for immediate scavenge order progression
    setRadioDirectiveState((prevRadio) => {
      const { newState, newTransmissionsCount } = updateRadioDirectiveSystem(
        prevRadio,
        res.newState,
        gameClockRef.current || gameClock,
        zombiesRef.current || zombies
      );
      if (newTransmissionsCount > 0 && newState.currentIncomingTransmission) {
        const incoming = newState.currentIncomingTransmission;
        soundService.playRadioChirp();
        addTacticalAlert(
          `RADIO: ${incoming.classification}`,
          `${incoming.callsign}: ${incoming.title}`,
          incoming.classification === 'EMERGENCY'
            ? 'danger'
            : incoming.classification === 'WARNING'
            ? 'warn'
            : 'info',
          () => {
            setActiveRadioTransmission(incoming);
            setIsRadioModalOpen(true);
          }
        );
      }
      return newState;
    });
  };

  const handleModifySquadGeneralMembers = (squadId: string, newCount: number) => {
    let success = false;
    let errorMsg = '';
    setSettlement((prev) => {
      const res = modifySquadGeneralMembers(prev, squadId, newCount);
      if (!res.success) {
        errorMsg = res.error || 'Could not update general count.';
        return prev;
      }
      success = true;
      settlementRef.current = res.newState;
      const updatedCombatSquads = syncTacticalSquadUnits(res.newState, combatSquadsRef.current);
      combatSquadsRef.current = updatedCombatSquads;
      setCombatSquads(updatedCombatSquads);
      return res.newState;
    });

    if (!success) {
      setToastMessage({
        title: 'Member Change Failed',
        desc: errorMsg || 'Could not update general count.',
        type: 'warn',
      });
    }
  };

  const handleDisbandSquad = (squadId: string) => {
    let success = false;
    setSettlement((prev) => {
      const res = disbandSquad(prev, squadId);
      if (!res.success) return prev;
      success = true;
      settlementRef.current = res.newState;
      const updatedCombatSquads = syncTacticalSquadUnits(res.newState, combatSquadsRef.current);
      combatSquadsRef.current = updatedCombatSquads;
      setCombatSquads(updatedCombatSquads);
      return res.newState;
    });

    if (success) {
      if (selectedSquadId === squadId) {
        setSelectedSquadId(null);
      }
      setToastMessage({
        title: 'SQUAD DISBANDED',
        desc: 'Leader and members returned to settlement pool.',
        type: 'info',
      });
    }
  };


  const handleRecruitGroup = (buildingId: string | number, persuasionLeaderId?: string) => {
    const res = recruitHiddenGroup(settlement, buildingId, persuasionLeaderId);
    if (!res.success) {
      setToastMessage({
        title: 'Recruitment Failed',
        desc: res.error || 'Could not recruit survivor group.',
        type: 'warn',
      });
      return;
    }
    setSettlement(res.newState);
    setActiveRecruitmentGroup(null);
    soundService.playRecruitmentResolved();
    setToastMessage({
      title: 'NEW SURVIVORS JOINED',
      desc: `${res.recruitedName} and group (+${res.count} total survivors) have joined the settlement!`,
      type: 'success',
    });
  };

  // Phase 6 RTS Tactical Squad & Combat Handlers (§5, §5.1, §6.1)
  const handleSelectSquad = (squadId: string | null) => {
    setSelectedSquadId(squadId);
  };

  const handleSelectVehicle = (vehicleId: string | null) => {
    // Clicking a vehicle that has a squad mounted inside selects the squad instead,
    // which shows the squad panel with the vehicle's condition/fuel info.
    if (vehicleId) {
      const veh = settlement.vehicles?.find((v) => v.id === vehicleId);
      if (veh?.assignedSquadId) {
        setSelectedSquadId(veh.assignedSquadId);
        setSelectedVehicleId(null);
        return;
      }
    }
    setSelectedVehicleId(vehicleId);
  };

  const handleOrderSquadMove = (
    squadId: string,
    pos: Point2D,
    targetBuildingId?: string | number,
    targetBuildingName?: string
  ) => {
    // 1. Check if the order target is a vehicle directly
    const directVeh = settlement.vehicles?.find((v) => v.id === squadId);
    if (directVeh && roadGraphRef.current) {
      let updatedVeh = orderVehicleRoadTravel(directVeh, pos, roadGraphRef.current);
      if (targetBuildingId) {
        updatedVeh = {
          ...updatedVeh,
          autoScavengeBuildingId: targetBuildingId,
          autoScavengeBuildingName: targetBuildingName || null,
        };
      }
      setSettlement((prev) => ({
        ...prev,
        vehicles: prev.vehicles.map((v) => (v.id === updatedVeh.id ? updatedVeh : v)),
      }));
      const noise = emitNoiseEvent('engine', directVeh.position.x, directVeh.position.z, `${directVeh.name.toUpperCase()} ENGINE ROAR`);
      setNoiseEvents((prev) => [...prev, noise.event]);
      setToastMessage({
        title: targetBuildingId ? 'EXPEDITION DISPATCHED' : 'VEHICLE EN ROUTE',
        desc: targetBuildingId
          ? `${directVeh.name} driving to ${targetBuildingName || 'target'}. Mounted squad will dismount and scavenge upon arrival.`
          : `${directVeh.name} driving along road network (${Math.round(updatedVeh.currentFuel)}L fuel remaining).`,
        type: 'info',
      });
      return;
    }

    // 2. Check if squad is currently mounted in a motor vehicle
    const mountedVeh = settlement.vehicles?.find((v) => v.assignedSquadId === squadId);
    if (mountedVeh && roadGraphRef.current) {
      let updatedVeh = orderVehicleRoadTravel(mountedVeh, pos, roadGraphRef.current);
      if (targetBuildingId) {
        updatedVeh = {
          ...updatedVeh,
          autoScavengeBuildingId: targetBuildingId,
          autoScavengeBuildingName: targetBuildingName || null,
        };
      }
      setSettlement((prev) => ({
        ...prev,
        vehicles: prev.vehicles.map((v) => (v.id === updatedVeh.id ? updatedVeh : v)),
      }));
      const noise = emitNoiseEvent('engine', mountedVeh.position.x, mountedVeh.position.z, `${mountedVeh.name.toUpperCase()} ENGINE ROAR`);
      setNoiseEvents((prev) => [...prev, noise.event]);
      setToastMessage({
        title: targetBuildingId ? 'EXPEDITION DISPATCHED' : 'VEHICLE EN ROUTE',
        desc: targetBuildingId
          ? `${mountedVeh.name} transporting squad to recon and scavenge ${targetBuildingName || 'structure'}.`
          : `${mountedVeh.name} driving along OSM road route (${Math.round(updatedVeh.currentFuel)}L fuel remaining).`,
        type: 'info',
      });
      return;
    }

    const currentSquad = combatSquadsRef.current.find((s) => s.squadId === squadId);
    const targetBldg = targetBuildingId && mapData
      ? mapData.buildings.find((b) => String(b.id) === String(targetBuildingId))
      : undefined;

    // If the precise clicked point is already inside the target building,
    // immediately begin the search.
    if (currentSquad && targetBldg && isSquadInsideBuilding({ x: currentSquad.x, z: currentSquad.z }, targetBldg)) {
      handleSearchBuilding(targetBldg, squadId);
      soundService.playCombatActionSFX('assault_order');
      return;
    }

    setCombatSquads((prev) => {
      const updated = orderSquadMove(prev, squadId, pos, targetBuildingId, targetBuildingName);
      combatSquadsRef.current = updated;
      return updated;
    });

    soundService.playCombatActionSFX('assault_order');
    // Emit footstep/patrol noise
    const noise = emitNoiseEvent('combat', pos.x, pos.z, 'PATROL NOISE');
    setNoiseEvents((prev) => [...prev, noise.event]);

    if (targetBuildingId && targetBuildingName) {
      setToastMessage({
        title: 'SCAVENGE ORDER CONFIRMED',
        desc: `Squad dispatched to recon and scavenge ${targetBuildingName}.`,
        type: 'info',
      });
    }
  };

  // §5.2 threat handlers: assault a Hideout/Lair, pay a ransom, or refuse & rescue
  const handleAssaultThreat = (buildingId: string | number) => {
    const bldg = mapData?.buildings.find((b) => String(b.id) === String(buildingId));
    if (!bldg) return;
    const pos = bldg.center;

    setCombatSquads((prev) => {
      const updated = prev.reduce((acc, sq) => {
        if (sq.isDeployed && sq.currentHp > 0) return orderSquadMove(acc, sq.squadId, pos);
        return acc;
      }, prev);
      combatSquadsRef.current = updated;
      return updated;
    });

    const hideout = settlement.rivalHideouts?.get(buildingId);
    const lair = settlement.zombieLairs?.get(buildingId);
    setToastMessage({
      title: lair ? 'LAIR ASSAULT ORDERED' : 'HIDEOUT ASSAULT ORDERED',
      desc: lair
        ? `Squads converging on ${bldg.name || 'the Lair'} to deplete its garrison.`
        : `Squads converging on ${hideout?.factionName || 'the Hideout'} — expect armed resistance.`,
      type: 'warn',
    });
  };

  const handlePayRansom = (hideoutId: string | number) => {
    const res = payRansomForCaptive(settlement, hideoutId);
    if (!res.success) {
      setToastMessage({ title: 'RANSOM FAILED', desc: res.error || 'Could not pay the ransom.', type: 'warn' });
      return;
    }
    setSettlement(res.newState);
    setActiveRansomHideoutId(null);
    setToastMessage({
      title: 'RANSOM PAID',
      desc: `${res.freedSquadName} has been released and is returning to the settlement.`,
      type: 'success',
    });
  };

  const handleRefuseRescue = (hideoutId: string | number) => {
    setActiveRansomHideoutId(null);
    const hideout = settlement.rivalHideouts?.get(hideoutId);
    setToastMessage({
      title: 'RANSOM REFUSED',
      desc: `Rescue by force: eliminate ${hideout?.factionName || 'the rival faction'}'s defenders to free your squad.`,
      type: 'warn',
    });
    handleAssaultThreat(hideoutId);
  };

  // External components (vehicle drawer/modal) commit squads via this wrapper so the
  // simulation ref stays in sync — otherwise the next combat tick reverts their changes.
  const handleUpdateCombatSquads = (updated: TacticalSquadUnit[]) => {
    combatSquadsRef.current = updated;
    setCombatSquads(updated);
  };

  const handleMountVehicle = (squadId: string, vehicleId: string) => {
    const targetVehicle = settlement.vehicles?.find((v) => v.id === vehicleId);
    const targetSquad = combatSquads.find((s) => s.squadId === squadId);
    if (!targetVehicle || !targetSquad) {
      setToastMessage({
        title: 'Boarding Failed',
        desc: 'Vehicle or squad unit not found.',
        type: 'warn',
      });
      return;
    }
    if (targetVehicle.condition === 'wrecked') {
      setToastMessage({
        title: 'Vehicle Wrecked',
        desc: 'This vehicle is heavily damaged and needs repairs with metal before it can be operated.',
        type: 'warn',
      });
      return;
    }
    if (targetVehicle.assignedSquadId && targetVehicle.assignedSquadId !== squadId) {
      setToastMessage({
        title: 'VEHICLE OCCUPIED',
        desc: `${targetVehicle.name} already has ${targetVehicle.assignedSquadName || 'another squad'} mounted. Dismount them first.`,
        type: 'warn',
      });
      return;
    }
    if (targetSquad.mountedVehicleId === vehicleId) {
      setToastMessage({
        title: 'ALREADY MOUNTED',
        desc: `${targetSquad.name} is already riding in ${targetVehicle.name}. Right-click the ground to drive there.`,
        type: 'info',
      });
      return;
    }

    const dist = Math.hypot(targetSquad.x - targetVehicle.position.x, targetSquad.z - targetVehicle.position.z);
    if (dist <= 3.8) {
      const res = mountSquadToVehicle(targetVehicle, targetSquad);
      setSettlement((prev) => ({
        ...prev,
        vehicles: prev.vehicles.map((v) => (v.id === res.updatedVehicle.id ? res.updatedVehicle : v)),
      }));
      setCombatSquads((prev) => {
        const updated = prev.map((s) =>
          s.squadId === res.updatedSquad.squadId ? { ...res.updatedSquad, pendingMountVehicleId: null } : s
        );
        combatSquadsRef.current = updated;
        return updated;
      });
      // Keep the squad selected (the squad panel now shows the vehicle info);
      // deselect the vehicle panel so it doesn't cover the squad.
      setSelectedVehicleId(null);
      soundService.playBuildingPlaced();
      setToastMessage({
        title: 'SQUAD MOUNTED VEHICLE',
        desc: `Tactical squad boarded ${targetVehicle.name}. Right-click the ground to drive; click the vehicle to see squad status.`,
        type: 'success',
      });
    } else {
      // Squad moves towards the vehicle, and mounts once within range
      setCombatSquads((prev) => {
        const updated = prev.map((s) => {
          if (s.squadId === squadId) {
            return {
              ...s,
              targetPos: { x: targetVehicle.position.x, z: targetVehicle.position.z },
              state: 'moving' as const,
              manualOrder: true,
              targetZombieId: null,
              targetBuildingId: null,
              pendingMountVehicleId: targetVehicle.id,
            };
          }
          return s;
        });
        combatSquadsRef.current = updated;
        return updated;
      });
      setToastMessage({
        title: 'MOVING TO BOARD VEHICLE',
        desc: `${targetSquad.name} en route to ${targetVehicle.name} (${Math.round(dist)}m). Will mount upon arrival.`,
        type: 'info',
      });
    }
  };

  const handleDismountVehicle = (vehicleId: string) => {
    const targetVehicle = settlement.vehicles?.find((v) => v.id === vehicleId);
    if (!targetVehicle || !targetVehicle.assignedSquadId) {
      setToastMessage({
        title: 'Dismount Failed',
        desc: 'No squad currently mounted in this vehicle.',
        type: 'warn',
      });
      return;
    }
    const targetSquad = combatSquads.find((s) => s.squadId === targetVehicle.assignedSquadId);
    if (!targetSquad) return;
    const res = dismountSquadFromVehicle(targetVehicle, targetSquad);
    setSettlement((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) => (v.id === res.updatedVehicle.id ? res.updatedVehicle : v)),
    }));
    setCombatSquads((prev) => {
      const updated = prev.map((s) => (s.squadId === res.updatedSquad.squadId ? res.updatedSquad : s));
      combatSquadsRef.current = updated;
      return updated;
    });
    setToastMessage({
      title: 'SQUAD DISMOUNTED',
      desc: 'Tactical unit disembarked from vehicle and is now roaming freely on foot.',
      type: 'info',
    });
  };

  const handleOrderVehicleExtraction = (vehicle: WorldVehicle) => {
    if (!roadGraphRef.current) return;
    const hqPos = settlement.hq?.center || { x: 0, z: 0 };
    const updatedVeh = orderVehicleRoadTravel(vehicle, hqPos, roadGraphRef.current);
    setSettlement((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) => (v.id === updatedVeh.id ? updatedVeh : v)),
    }));
    const noise = emitNoiseEvent('engine', vehicle.position.x, vehicle.position.z, 'EXTRACTION ENGINE SOUND');
    setNoiseEvents((prev) => [...prev, noise.event]);
    setToastMessage({
      title: 'EXTRACTION INITIATED',
      desc: `${vehicle.name} executing rapid emergency extraction to HQ along OSM roads.`,
      type: 'warn',
    });
  };

  const handleOrderVehicleMove = (vehicle: WorldVehicle, targetPos: Point2D) => {
    if (!roadGraphRef.current) return;
    const updatedVeh = orderVehicleRoadTravel(vehicle, targetPos, roadGraphRef.current);
    setSettlement((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) => (v.id === updatedVeh.id ? updatedVeh : v)),
    }));
    const noise = emitNoiseEvent('engine', vehicle.position.x, vehicle.position.z, `${vehicle.name.toUpperCase()} ACCELERATING`);
    setNoiseEvents((prev) => [...prev, noise.event]);
    setToastMessage({
      title: 'VEHICLE DISPATCHED',
      desc: `${vehicle.name} plotting course via OSM road geometry.`,
      type: 'info',
    });
  };

  const handleOrderSquadAttack = (squadId: string, zombieId: string) => {
    const targetZombie = zombies.find((z) => z.id === zombieId);
    const targetHuman = hostileHumans.find((h) => h.id === zombieId);
    const target = targetZombie || targetHuman;
    const targetPos = target ? { x: target.x, z: target.z } : undefined;

    setCombatSquads((prev) => {
      const updated = orderSquadAttack(prev, squadId, zombieId, targetPos);
      combatSquadsRef.current = updated;
      return updated;
    });
    if (target) {
      const targetName = targetHuman ? targetHuman.name : `Hostile Infected (${(target as ZombieUnit).variant})`;
      setToastMessage({
        title: 'ENGAGING TARGET',
        desc: `Squad ordered to attack ${targetName}.`,
        type: 'warn',
      });
    }
  };

  const handleStartSquadScavengeArea = (squadId: string) => {
    setActiveGatherType('scavenge');
    setSelectedSquadId(squadId);
    setToastMessage({ title: 'SCAVENGE AREA DESIGNATION', desc: 'Drag a box over buildings to queue them for this squad.', type: 'info' });
  };

  const handleDesignateSquadScavenge = (bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) => {
    if (!mapData || !selectedSquadId) return;
    const ids = mapData.buildings
      .filter((b) => b.center.x >= bounds.minX && b.center.x <= bounds.maxX && b.center.z >= bounds.minZ && b.center.z <= bounds.maxZ)
      .map((b) => b.id);
    setScavengeQueue((prev) => ({ ...prev, [selectedSquadId]: ids }));
    if (ids.length > 0) {
      const first = mapData.buildings.find((b) => String(b.id) === String(ids[0]));
      if (first) handleOrderSquadMove(selectedSquadId, first.center, first.id, first.name || first.type);
    }
    setActiveGatherType(null);
    setToastMessage({ title: 'SCAVENGE QUEUE CREATED', desc: `${ids.length} building${ids.length === 1 ? '' : 's'} queued for ${combatSquads.find((s) => s.squadId === selectedSquadId)?.name || 'squad'}.`, type: 'success' });
  };

  const handleOrderSquadRecall = (squadId: string) => {
    const hqPos = settlement.hq?.center || { x: 0, z: 0 };
    setCombatSquads((prev) => {
      const updated = orderSquadRecall(prev, squadId, hqPos);
      combatSquadsRef.current = updated;
      return updated;
    });
    setScavengeQueue((prev) => ({ ...prev, [squadId]: [] }));
    setToastMessage({
      title: 'SQUAD RECALLED',
      desc: 'Tactical unit returning to safe zone at HQ for regrouping.',
      type: 'info',
    });
  };

  const handleSetClockSpeed = (speed: 0 | 1 | 2 | 4) => {
    if (speed === 0) {
      soundService.playTimePause();
    } else {
      soundService.playTimeSpeed(speed);
    }
    setGameClock((prev) => ({ ...prev, speed }));
  };

  const handleGrantFreshFood = useCallback(() => {
    setSettlement((prev) => {
      const updatedStockpile = {
        ...prev.stockpile,
        food: {
          ...prev.stockpile.food,
          canned_goods: prev.stockpile.food.canned_goods + 40,
          fresh_harvest: prev.stockpile.food.fresh_harvest + 60,
        },
        water: {
          ...prev.stockpile.water,
          purified_water: prev.stockpile.water.purified_water + 80,
        },
      };
      const updated = {
        ...prev,
        stockpile: updatedStockpile,
      };
      const newMorale = calculateSettlementMorale(updated, prev.weather, gameClock.day);
      return {
        ...updated,
        morale: newMorale,
      };
    });
    setToastMessage({
      title: 'SUPPLIES RESTOCKED',
      desc: '+100 Food rations and +80L water granted. Colony morale rising!',
      type: 'success',
    });
  }, [gameClock.day]);

  const handleDrainFoodStockpile = useCallback(() => {
    setSettlement((prev) => {
      const updatedStockpile = {
        ...prev.stockpile,
        food: {
          canned_goods: 0,
          mre_rations: 0,
          dried_rations: 0,
          fresh_harvest: 0,
        },
      };
      const updated = {
        ...prev,
        stockpile: updatedStockpile,
      };
      const newMorale = calculateSettlementMorale(updated, prev.weather, gameClock.day);
      return {
        ...updated,
        morale: newMorale,
      };
    });
    setToastMessage({
      title: 'FOOD RESERVES DEPLETED',
      desc: 'All food stocks drained! Watch morale plummet and production/combat stall.',
      type: 'warn',
    });
  }, [gameClock.day]);

  const handleSetSeason = useCallback((season: SeasonType) => {
    setSettlement((prev) => {
      if (!prev.weather) return prev;
      return {
        ...prev,
        weather: {
          ...prev.weather,
          currentSeason: season,
          seasonDay: 1,
        },
      };
    });
    setToastMessage({
      title: `SEASON TRANSITION: ${season.toUpperCase()}`,
      desc: `Simulation shifted to ${season}. Check agricultural crop yields and weather impacts!`,
      type: 'info',
    });
  }, []);

  const handleSetWeather = useCallback((weather: WeatherType) => {
    setSettlement((prev) => {
      if (!prev.weather) return prev;
      return {
        ...prev,
        weather: {
          ...prev.weather,
          currentWeather: weather,
        },
      };
    });
    setToastMessage({
      title: `WEATHER CHANGED: ${weather.toUpperCase().replace('_', ' ')}`,
      desc: `Active weather condition set to ${weather}.`,
      type: 'info',
    });
  }, []);

  const handleBuildGreenhouse = useCallback(() => {
    setSettlement((prev) => {
      const newBuildingId = `bldg_greenhouse_${Date.now()}`;
      const newBuilding: AdaptedBuilding = {
        buildingId: newBuildingId,
        typeId: 'greenhouse_hydro' as FunctionalBuildingTypeId,
        isHQ: false,
        name: 'Hydroponics Greenhouse',
        category: 'food',
        adaptedAt: Date.now(),
        footprintAreaM2: 80,
        totalFloorAreaM2: 80,
        volumeM3: 240,
        maxCapacity: 60,
        currentUsage: 0,
        capacityUnit: 'kg harvest/day',
        maxDurability: 350,
        currentDurability: 350,
        defenseRating: 5,
        isFreestanding: true,
        position: { x: 0, z: 0 },
        height: 4,
        levels: 1,
        constructionStatus: 'completed',
        constructionProgress: 100,
        constructionWorkRequired: 100,
        constructionWorkDone: 100,
        assignedWorkers: 2,
      };

      const updatedAdapted = new Map(prev.adaptedBuildings || new Map());
      updatedAdapted.set(newBuildingId, newBuilding);

      return {
        ...prev,
        adaptedBuildings: updatedAdapted,
        freestandingBuildings: [...(prev.freestandingBuildings || []), newBuilding],
      };
    });
    soundService.playBuildingPlaced();
    setToastMessage({
      title: 'GREENHOUSE HYDROPONICS CONSTRUCTED',
      desc: 'Hydroponic Greenhouse unit operational! Winter crop freeze mitigated.',
      type: 'success',
    });
  }, []);

  const handleRepairBuilding = (buildingId: string | number) => {
    const res = repairBuilding(settlement, buildingId);
    if (!res.success) {
      setToastMessage({
        title: 'Repair Failed',
        desc: res.error || 'Could not repair structure.',
        type: 'warn',
      });
      return;
    }
    setSettlement(res.newState);
    soundService.playRepairSound();
    const adapted = res.newState.adaptedBuildings.get(buildingId);
    if (adapted) {
      const noise = emitNoiseEvent('repair', adapted.position.x, adapted.position.z, 'REPAIRS UNDERWAY');
      setNoiseEvents((prev) => [...prev, noise.event]);
    }
    setToastMessage({
      title: 'STRUCTURE REPAIRED',
      desc: `Restored ${res.repairedHp} HP to structure using building materials.`,
      type: 'success',
    });
  };

  const handleAssignGatherers = (nodeId: string, count: number) => {
    if (!mapData) return;
    const r = assignResourceGatherers(settlement, mapData, nodeId, count);
    if (!r.success) {
      setToastMessage({ title: 'GATHERING ORDER FAILED', desc: r.error || 'No workers available.', type: 'warn' });
      return;
    }
    setSettlement(r.newState);
    setToastMessage({ title: 'GATHERING CREW DEPLOYED', desc: `${count} general workers are travelling to the physical resource node.`, type: 'info' });
  };

  const handleSearchBuilding = (building: BuildingPolygon, squadIdOverride?: string) => {
    const squadId = squadIdOverride || selectedSquadId;
    if (!squadId) {
      setToastMessage({ title: 'NO SQUAD SELECTED', desc: 'Select and dispatch a squad to this structure first.', type: 'warn' });
      return;
    }
    const sq = combatSquadsRef.current.find((x) => x.squadId === squadId);
    if (!sq) return;

    if (isSquadInsideBuilding({ x: sq.x, z: sq.z }, building)) {
      const bSearch = settlement.buildingSearches?.get(building.id);
      if (bSearch?.searched) {
        // Squad enters and garrisons in defensive cover/barricade
        setCombatSquads((prev) =>
          prev.map((s) =>
            s.squadId === squadId
              ? {
                  ...s,
                  targetBuildingId: building.id,
                  targetBuildingName: building.name || 'Cleared Structure',
                  state: 'in_cover',
                  targetPos: null,
                }
              : s
          )
        );
        soundService.playCombatActionSFX('assault_order');
        setToastMessage({
          title: 'STRUCTURE GARRISONED',
          desc: `${sq.name} took defensive cover inside ${building.name || 'cleared structure'} (+50% barricade defense buff).`,
          type: 'info',
        });
        return;
      }

      const r = startBuildingSearch(settlement, squadId, { x: sq.x, z: sq.z }, building);
      if (!r.success) {
        setToastMessage({ title: 'SEARCH UNAVAILABLE', desc: r.error || 'Structure cannot be searched.', type: 'warn' });
        return;
      }
      setSettlement(r.newState);
      setCombatSquads((prev) =>
        prev.map((s) =>
          s.squadId === squadId
            ? {
                ...s,
                targetBuildingId: building.id,
                targetBuildingName: building.name || 'Structure',
                state: 'searching',
                targetPos: null,
                searchProgress: r.searchState?.searchProgress || 0,
              }
            : s
        )
      );

      const infestation = generateBuildingInfestation(building);
      const breach = breachInfestedBuilding(infestation, building.center);
      setZombies((z) => [...z, ...breach]);
      const n = emitNoiseEvent('breach', building.center.x, building.center.z, 'BUILDING SEARCH');
      setNoiseEvents((v) => [...v, n.event]);
      soundService.playCombatActionSFX('assault_order');

      const dur = getBuildingSearchDurationSec(building);
      setToastMessage({
        title: 'SCAVENGING INITIATED',
        desc: `${sq.name} began searching ${building.name || 'Structure'} (${dur}s duration). Supplies will be recovered over time.`,
        type: 'info',
      });
    } else {
      handleOrderSquadMove(squadId, building.center, building.id, building.name || 'Structure');
    }
  };

  /** Auto-equip freshly scavenged gear onto the first squad member still using default kit */
  const autoEquipScavengedGear = (weaponId?: WeaponItemId, armorId?: ArmorItemId) => {
    if (!weaponId && !armorId) return;
    setCombatSquads((prev) => {
      let changed = false;
      const next = prev.map((sq) => {
        if (sq.currentHp <= 0) return sq;
        let out = sq;
        if (weaponId && weaponId !== 'knife') {
          const target = out.members.find((m) => m.isAlive && m.weaponId === 'knife');
          if (target) {
            out = assignMemberWeapon(out, target.id, weaponId);
            changed = true;
          }
        }
        if (armorId) {
          const target = out.members.find((m) => m.isAlive && !m.armorId);
          if (target) {
            out = assignMemberArmor(out, target.id, armorId);
            changed = true;
          }
        }
        return out;
      });
      return changed ? next : prev;
    });
  };

  const handleAssignWeapon = (squadId: string, memberId: string, weaponId: WeaponItemId | null) => {
    const member = combatSquads.find((s) => s.squadId === squadId)?.members.find((m) => m.id === memberId);
    if (!member) return;
    const armory = settlement.armory || { weapons: [], armor: [] };

    if (weaponId === null) {
      // Unequip: return the member's current weapon to the armory stockpile
      if (member.weaponId !== 'knife') {
        setSettlement((prev) => ({
          ...prev,
          armory: {
            ...(prev.armory || { weapons: [], armor: [] }),
            weapons: [...(prev.armory?.weapons || []), member.weaponId],
          },
        }));
      }
      setCombatSquads((prev) =>
        prev.map((s) => (s.squadId === squadId ? assignMemberWeapon(s, memberId, null) : s))
      );
      return;
    }

    if (!armory.weapons.includes(weaponId)) return;
    const newWeapons = armory.weapons.filter((w) => w !== weaponId);
    if (member.weaponId !== 'knife') newWeapons.push(member.weaponId);
    setSettlement((prev) => ({
      ...prev,
      armory: { ...(prev.armory || { weapons: [], armor: [] }), weapons: newWeapons },
    }));
    setCombatSquads((prev) =>
      prev.map((s) => (s.squadId === squadId ? assignMemberWeapon(s, memberId, weaponId) : s))
    );
  };

  const handleAssignArmor = (squadId: string, memberId: string, armorId: ArmorItemId | null) => {
    const member = combatSquads.find((s) => s.squadId === squadId)?.members.find((m) => m.id === memberId);
    if (!member) return;
    const armory = settlement.armory || { weapons: [], armor: [] };

    if (armorId === null) {
      // Unequip: return the member's current armor to the armory stockpile
      if (member.armorId) {
        setSettlement((prev) => ({
          ...prev,
          armory: {
            ...(prev.armory || { weapons: [], armor: [] }),
            armor: [...(prev.armory?.armor || []), member.armorId as ArmorItemId],
          },
        }));
      }
      setCombatSquads((prev) =>
        prev.map((s) => (s.squadId === squadId ? assignMemberArmor(s, memberId, null) : s))
      );
      return;
    }

    if (!armory.armor.includes(armorId)) return;
    const newArmor = armory.armor.filter((a) => a !== armorId);
    if (member.armorId) newArmor.push(member.armorId);
    setSettlement((prev) => ({
      ...prev,
      armory: { ...(prev.armory || { weapons: [], armor: [] }), armor: newArmor },
    }));
    setCombatSquads((prev) =>
      prev.map((s) => (s.squadId === squadId ? assignMemberArmor(s, memberId, armorId) : s))
    );
  };

  const handleChangeSquadStance = useCallback((squadId: string, stance: 'aggressive' | 'defensive' | 'hold_fire') => {
    setCombatSquads((prev) =>
      prev.map((s) => (s.squadId === squadId ? { ...s, stance } : s))
    );
    addTacticalAlert('STANCE MODIFIED', `Squad stance set to ${stance.toUpperCase()}`, 'info');
  }, [addTacticalAlert]);

  const handleStartResearchNode = useCallback((techId: string) => {
    try {
      const res = unlockResearchNode(settlement, techId);
      setSettlement(res.updatedSettlement);
      addTacticalAlert('TECHNOLOGY RESEARCHED', `Unlocked ${res.node.name}!`, 'success');
    } catch (err: any) {
      addTacticalAlert('RESEARCH FAILED', err.message || 'Prerequisites not met', 'warn');
    }
  }, [settlement, addTacticalAlert]);

  const handleRepairVehicle = useCallback((vehicleId: string) => {
    setSettlement((prev) => {
      const metal = prev.stockpile.materials.metal;
      if (metal < 15) {
        addTacticalAlert('REPAIR FAILED', 'Requires 15 units of metal', 'warn');
        return prev;
      }
      return {
        ...prev,
        stockpile: {
          ...prev.stockpile,
          materials: {
            ...prev.stockpile.materials,
            metal: metal - 15,
          },
        },
        vehicles: prev.vehicles.map((v) =>
          v.id === vehicleId ? { ...v, condition: 'operational', currentHp: v.maxHp } : v
        ),
      };
    });
    addTacticalAlert('VEHICLE REPAIRED', 'Vehicle restored to operational readiness', 'success');
  }, [addTacticalAlert]);

  const handleRefuelVehicle = useCallback((vehicleId: string) => {
    setSettlement((prev) => {
      const veh = prev.vehicles.find((v) => v.id === vehicleId);
      if (!veh) return prev;
      const fuelType = veh.fuelType;
      const available = prev.stockpile.fuel[fuelType] || 0;
      const needed = Math.round(veh.maxFuel - veh.currentFuel);
      if (available <= 0 || needed <= 0) {
        addTacticalAlert('REFUEL IMPOSSIBLE', 'No compatible fuel in reserve or tank full', 'warn');
        return prev;
      }
      const added = Math.min(available, needed);
      return {
        ...prev,
        stockpile: {
          ...prev.stockpile,
          fuel: {
            ...prev.stockpile.fuel,
            [fuelType]: available - added,
          },
        },
        vehicles: prev.vehicles.map((v) =>
          v.id === vehicleId ? { ...v, currentFuel: v.currentFuel + added } : v
        ),
      };
    });
    addTacticalAlert('VEHICLE REFUELED', 'Fuel reservoir replenished', 'success');
  }, [addTacticalAlert]);

  const handleUpdateLaborAllocation = useCallback((allocation: Partial<SettlementState['jobPriorities']>) => {
    setSettlement((prev) => ({
      ...prev,
      jobPriorities: {
        ...prev.jobPriorities,
        ...allocation,
      },
    }));
  }, []);

  const handleTriageSurvivor = useCallback((survivorId: string, action: 'quarantine' | 'discharge') => {
    setSettlement((prev) => ({
      ...prev,
      namedSurvivors: prev.namedSurvivors.map((s) =>
        s.id === survivorId ? { ...s, assignedBuildingId: action === 'quarantine' ? 'medbay_quarantine' : null } : s
      ),
    }));
    addTacticalAlert(
      'CLINICAL TRIAGE',
      action === 'quarantine' ? 'Subject placed in strict quarantine isolation' : 'Subject cleared and discharged to active duty',
      'info'
    );
  }, [addTacticalAlert]);

  const handleDirectiveAction = useCallback((actionType: string) => {
    switch (actionType) {
      case 'focus_candidate_hq':
        if (mapData && mapData.buildings.length > 0) {
          const candidate =
            mapData.buildings.find((b) => b.polygon.length >= 4 && !settlement.adaptedBuildings?.has(String(b.id))) ||
            mapData.buildings[0];
          if (candidate) {
            setSelectedBuilding(candidate);
            if (sceneRef.current) {
              sceneRef.current.cameraController.focusOn(candidate.center, 80);
            }
            setToastMessage({
              title: 'CANDIDATE HQ IDENTIFIED',
              desc: `Inspecting ${candidate.name || 'Structure'}. Click "CONFIRM AS SETTLEMENT HEADQUARTERS".`,
              type: 'info',
            });
          }
        }
        break;
      case 'open_squad_panel':
      case 'muster_squad':
        setActiveSidebarTab('squads');
        break;
      case 'trigger_recruitment':
        if (mapData) {
          const group = (Array.from(settlement.hiddenGroups.values()) as HiddenSurvivorGroup[]).find(g => g.isDiscovered && !g.isRecruited);
          if (group) {
            const b = mapData.buildings.find(x => String(x.id) === String(group.buildingId));
            if (b) { setSelectedBuilding(b); setActiveSidebarTab('inspector'); sceneRef.current?.cameraController.focusOn(b.center, 90); }
          } else setToastMessage({ title: 'NO CONTACT YET', desc: 'Survey the visible sector. Smoke and settlement vision reveal human activity.', type: 'info' });
        }
        break;
      case 'trigger_scavenge':
        if (settlement.squads.length > 0) {
          const firstSquad = settlement.squads[0];
          setSelectedSquadId(firstSquad.id);
          setToastMessage({
            title: 'SQUAD SELECTED',
            desc: 'Click a nearby building or open ground to issue a real movement order. Do not use an abstract timed expedition.',
            type: 'info',
          });
        } else {
          setActiveSidebarTab('squads');
        }
        break;
      case 'speed_clock':
        handleSetClockSpeed(4);
        setToastMessage({
          title: 'SIMULATION ACCELERATED (4X)',
          desc: 'Time velocity increased. Defenses standing by for nightfall.',
          type: 'info',
        });
        break;
      case 'open_research_modal':
        setIsResearchModalOpen(true);
        break;
      case 'open_medical_triage':
        setIsMedbayModalOpen(true);
        break;
      case 'open_build_drawer':
        setActiveSidebarTab('build');
        break;
      case 'open_radio':
        const unread =
          radioDirectiveState?.transmissionLog?.find((t) => !t.isRead) ||
          radioDirectiveState?.transmissionLog?.[0] ||
          null;
        setActiveRadioTransmission(unread);
        setIsRadioModalOpen(true);
        break;
    }
  }, [mapData, settlement.squads, settlement.adaptedBuildings, handleSetClockSpeed, radioDirectiveState?.transmissionLog]);

  return (
    <div className="relative w-screen h-screen bg-[#07080a] overflow-hidden select-none">
      {/* Single atmospheric-descent loading screen — covers every view and stays
          up until the world scene has rendered, so all loading happens here. */}
      {isDescentActive && (
        <AtmosphericDescent
          progress={descentProgress}
          altitudeKm={descentAltitudeKm}
          zoneName={activePlacement?.sectorName || currentPreset.name || 'SECTOR'}
          lat={activePlacement?.center.lat ?? currentPreset.lat}
          lon={activePlacement?.center.lon ?? currentPreset.lon}
          status={loadingMessage || undefined}
        />
      )}

      {isPwaUpdateAvailable && (
        <div className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 bg-[#0E1013] border border-[#B31217] px-4 py-3 shadow-2xl flex items-center gap-4">
          <span className="text-xs font-heading uppercase tracking-wider text-white">A newer Terminus build is ready.</span>
          <button className="px-3 py-1.5 bg-[#B31217] text-white text-xs font-heading uppercase" onClick={() => window.location.reload()}>UPDATE</button>
          <button className="text-xs text-[#8C9BAE]" onClick={() => setIsPwaUpdateAvailable(false)}>×</button>
        </div>
      )}

      {/* 0a. Initial Start Screen (Fullscreen & Input Detection: Touch vs Click) */}
      {viewMode === 'start_screen' && (
        <StartScreen onStart={() => setViewMode('intro')} />
      )}

      {/* 0b. Cinematic Engine & Studio Intro Sequence */}
      {viewMode === 'intro' && (
        <IntroSequence onComplete={() => setViewMode('main_menu')} />
      )}

      {/* 0c. IFZ Game Flow: Main Menu (§ IFZ Game Flow) */}
      {viewMode === 'main_menu' && (
        <MainMenu
          onContinue={handleContinueGame}
          onNewGame={() => {
            setRadioDirectiveState(getInitialRadioDirectiveState());
            setActiveRadioTransmission(getInitialRadioDirectiveState().currentIncomingTransmission);
            setSettlements({});
            setActiveSettlementId('');
            setActivePlacement(null);
            setMapData(null);
            setViewMode('globe');
          }}
          onOpenLoadGame={() => {
            setSaveLoadMode('load');
            setIsSaveLoadModalOpen(true);
          }}
          onLoadGame={() => {
            setSaveLoadMode('load');
            setIsSaveLoadModalOpen(true);
          }}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onOpenCodex={() => setIsCodexModalOpen(true)}
          onOpenCredits={() => setIsCreditsModalOpen(true)}
          hasExistingSave={saveService.hasSaves()}
          latestSave={saveService.getLatestSave()}
        />
      )}

      {/* 1. Rotatable 3D Satellite Globe Entry View (§3.4, §7.5) */}
      {viewMode === 'globe' && (
        <GlobeView
          onConfirmSettlement={handleConfirmSettlementPlacement}
          onBeginDescent={handleBeginDescent}
          initialLocation={
            activePlacement
              ? activePlacement.center
              : { lat: currentPreset.lat, lon: currentPreset.lon }
          }
          settlements={settlements}
          activeSettlementId={activeSettlementId}
          caravans={caravans}
          onSelectExistingSettlement={handleSelectExistingSettlement}
          onCancelReturnToGame={
            settlements[activeSettlementId]?.status === 'operational'
              ? () => setViewMode('world')
              : () => setViewMode('main_menu')
          }
        />
      )}

      {/* Guided Safe Zones Operations Directives & Quest Tracker */}
      {viewMode === 'world' && isQuestListOpen && !isInitialCommsPending && (
        <TacticalQuestTracker
          settlement={settlement}
          radioState={radioDirectiveState}
          onActionClick={handleDirectiveAction}
        />
      )}

      {/* 3D Tactical Scene Darkening when Initial Radio Communication is Pending */}
      {viewMode === 'world' && isInitialCommsPending && !isRadioModalOpen && (
        <div
          id="initial-comms-darkening-overlay"
          className="fixed inset-0 z-10 bg-black/60 backdrop-blur-[1.5px] pointer-events-none transition-opacity duration-700 animate-in fade-in"
          aria-hidden="true"
        />
      )}

      {/* Onboarding Celebration / First Dawn Modal (§14) */}
      <OnboardingCelebrationModal
        isOpen={isCelebrationModalOpen}
        onClaimReward={handleClaimDawnReward}
        dayNumber={gameClock.day}
        colonyName={settlement.name}
        populationCount={settlement.namedSurvivors.length + settlement.generalPopulation.total}
      />

      {/* 2. Local 3D Tactical World Scene View (Prompt 1 Engine) */}
      {viewMode === 'world' && (
        <>
          <GameCanvas
            mapData={mapData}
            settlement={settlement}
            clockHour={gameClock.hour}
            elevationExaggeration={elevationExaggeration}
            disableElevation={disableElevation}
            showTerrainWireframe={showTerrainWireframe}
            showBuildingEdges={showBuildingEdges}
            showBuildings={showBuildings}
            showRoads={showRoads}
            showWood={showWood}
            showMetal={showMetal}
            showBricks={showBricks}
            showLanduse={showLanduse}
            showSatelliteOverlay={showSatelliteOverlay}
            selectedSquadId={selectedSquadId}
            selectedVehicleId={selectedVehicleId}
            pendingFreestandingType={pendingFreestandingType}
            onSelectBuilding={(bldg) => {
              if (!settlement.hq && !isHQSelectionUnlocked) {
                setToastMessage({
                  title: 'INCOMING TRANSMISSION PENDING',
                  desc: 'Press PUSH TO TALK to receive your operational mandate before designating an HQ.',
                  type: 'info',
                });
                const unread =
                  radioDirectiveState?.currentIncomingTransmission ||
                  radioDirectiveState?.transmissionLog?.find((t) => !t.isRead) ||
                  radioDirectiveState?.transmissionLog?.[0] ||
                  null;
                setActiveRadioTransmission(unread);
                setIsRadioModalOpen(true);
                return;
              }

              setSelectedBuilding(bldg);
              setSelectedResourceNode(null);
              // §7.2 pick-type-then-click flow: a facility type chosen from the
              // bottom-left Build/Convert dropdown is applied to the next clicked
              // structure (the adapted facility panel then opens on it).
              if (pendingAdaptType) {
                const typeId = pendingAdaptType;
                setPendingAdaptType(null);
                handleAdaptBuilding(bldg, typeId);
              }
            }}
            onHoverBuilding={(bldg) => {
              if (isHQSelectionUnlocked || settlement.hq) {
                setHoveredBuilding(bldg);
              }
            }}
            onSelectResourceNode={(node) => { setSelectedResourceNode(node); setSelectedBuilding(null); setActiveSidebarTab(node ? 'inspector' : null); }}
            onSelectPosition={(pos) => {
              setClickedPosition(pos);
              if (pendingFreestandingType) {
                handleBuildFreestanding(pendingFreestandingType, pos);
                setPendingFreestandingType(null);
              }
            }}
            onSelectSquad={handleSelectSquad}
            onOrderSquadMove={handleOrderSquadMove}
            onOrderSquadAttack={handleOrderSquadAttack}
            onSelectVehicle={handleSelectVehicle}
            onMountVehicle={handleMountVehicle}
            onSceneReady={(s) => {
              sceneRef.current = s;
            }}
            onMapRendered={() => {
              // The 3D map has been built and drawn — safe to reveal the world.
              setIsSceneRendered(true);
            }}
            onLoadProgress={handleLoadProgress}
          />

          {/* Restore Tactical UI Button when HUD is toggled off */}
          {isHideUi && (
            <div className="fixed bottom-4 right-4 z-50 pointer-events-auto">
              <button
                id="btn-restore-tactical-ui"
                onClick={() => {
                  soundService.playClick();
                  setIsHideUi(false);
                }}
                title="Restore Tactical HUD"
                className="px-3.5 py-2.5 bg-[#07090C]/95 border-2 border-[#1E293B] hover:border-[#10B981] text-[#10B981] hover:text-white shadow-2xl flex items-center gap-2 backdrop-blur-md transition-all active:scale-95 touch-manipulation clip-tactical-bracket"
              >
                <Layers className="w-5 h-5" />
                <span className="font-mono text-xs font-bold uppercase tracking-wider">Restore HUD</span>
              </button>
            </div>
          )}

          {!isHideUi && (
            <>
              {/* Tactical Diegetic Header Strip (Torn Bottom Edge, Compact Readouts, Speed, Tabs) */}
              <TacticalHeaderStrip
                settlement={settlement}
                clock={gameClock}
                activeNoiseEvents={noiseEvents}
                zombieCount={zombies.filter((z) => z.state !== 'dead').length}
                onSetSpeed={handleSetClockSpeed}
                activeSidebar={activeSidebarTab}
                onToggleSidebar={(tab) => setActiveSidebarTab(tab)}
                onOpenGlobe={() => setViewMode('globe')}
                questTrackerVisible={isQuestListOpen}
                onToggleQuestTracker={() => setIsQuestListOpen((v) => !v)}
                hasHQ={!!settlement.hq}
                onOpenAudioSettings={() => setIsAudioModalOpen(true)}
                onOpenPauseMenu={() => setIsPauseMenuOpen(true)}
                onOpenTechTree={() => setIsResearchModalOpen(true)}
                onOpenMoraleModal={() => setIsMoraleModalOpen(true)}
                onOpenWeatherModal={() => setIsWeatherModalOpen(true)}
                onOpenPopulationModal={() => setIsPopulationModalOpen(true)}
                onOpenRadio={() => {
                  const unread =
                    radioDirectiveState?.transmissionLog?.find((t) => !t.isRead) ||
                    radioDirectiveState?.transmissionLog?.[0] ||
                    null;
                  setActiveRadioTransmission(unread);
                  setIsRadioModalOpen(true);
                }}
                radioUnreadCount={radioDirectiveState?.unreadCount ?? 0}
              />

              {/* Active Blueprint Hologram Placement Banner */}
              {pendingFreestandingType && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 bg-amber-950/90 border-2 border-amber-500 rounded-lg shadow-2xl backdrop-blur-md animate-pulse">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                  <div className="text-xs font-mono font-bold text-amber-200">
                    PLACING <span className="text-amber-400 uppercase">{FUNCTIONAL_BUILDING_DEFINITIONS[pendingFreestandingType]?.name || pendingFreestandingType}</span> — Tap open ground on the map to construct
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingFreestandingType(null);
                      soundService.playClick();
                    }}
                    className="px-2 py-0.5 ml-2 text-[10px] uppercase font-bold text-amber-950 bg-amber-400 hover:bg-amber-300 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Audio Subsystem & Soundscape Modal (§15) */}
              <AudioSettingsModal
                isOpen={isAudioModalOpen}
                onClose={() => setIsAudioModalOpen(false)}
                currentPhase={gameClock.phase}
                isNight={gameClock.isNight}
                dangerLevel={dangerLevel}
              />

              {/* Non-blocking Anchored Tactical Alert Stream (Top Right) */}
              <TacticalAlertStream
                alerts={alerts}
                onDismiss={handleDismissAlert}
              />

              {/* Top-Right Squad Tactical Command Card & Selector Strip */}
              <TacticalSquadSelectorStrip
                squads={combatSquads}
                selectedSquadId={selectedSquadId}
                onSelectSquad={handleSelectSquad}
                onCreateSquad={() => setIsSquadModalOpen(true)}
                onPanToSquad={(sq) => {
                  handleMinimapPanTo({ x: sq.position ? sq.position.x : sq.x, z: sq.position ? sq.position.z : sq.z });
                }}
              />

              {/* Squad Command & Muster Panel — opened by the '+' Form Squad button (§4.3) */}
              <SquadManagementModal
                isOpen={isSquadModalOpen}
                onClose={() => setIsSquadModalOpen(false)}
                settlement={settlement}
                onCreateSquad={handleCreateSquad}
                onModifyGeneralMembers={handleModifySquadGeneralMembers}
                onDisbandSquad={handleDisbandSquad}
              />

              {/* Selection Info Dock — squad / building / vehicle info panels share one
                  slot with the same size & position as the squad panel, and stack
                  vertically (each scrollable) when several selections are open. */}
              {(selectedSquadId || selectedBuilding || selectedVehicleId) && (() => {
                const selectedSquadObj = combatSquads.find((s) => s.squadId === selectedSquadId) || null;
                const selectedMountedVehicle = (() => {
                  if (!selectedSquadId) return null;
                  const byAssigned = settlement.vehicles?.find((v) => v.assignedSquadId === selectedSquadId);
                  if (byAssigned) return byAssigned;
                  const mid = selectedSquadObj?.mountedVehicleId;
                  return mid ? settlement.vehicles?.find((v) => v.id === mid) || null : null;
                })();
                return (
                <div
                  id="selection-info-dock"
                  className="fixed bottom-14 left-2 right-2 md:top-12 md:left-auto md:right-16 md:bottom-auto z-40 flex flex-col gap-2 pointer-events-none max-h-[calc(100vh-72px)] overflow-y-auto no-scrollbar"
                >
                  <TacticalSquadHUD
                    squad={selectedSquadObj}
                    mountedVehicle={selectedMountedVehicle}
                    onDismountVehicle={
                      selectedMountedVehicle ? () => handleDismountVehicle(selectedMountedVehicle.id) : undefined
                    }
                    onDeselect={() => setSelectedSquadId(null)}
                    onChangeStance={handleChangeSquadStance}
                    onOrderFallbackHQ={handleOrderSquadRecall}
                    onStartScavengeArea={() => handleStartSquadScavengeArea(selectedSquadId || selectedSquadObj?.squadId || '')}
                    isScavengeAreaActive={activeGatherType === 'scavenge'}
                    inventory={selectedSquadId ? settlement.squadInventories?.[selectedSquadId] : undefined}
                    armory={settlement.armory || { weapons: [], armor: [] }}
                    onAssignWeapon={handleAssignWeapon}
                    onAssignArmor={handleAssignArmor}
                    allSquads={combatSquads}
                    onSelectSquad={handleSelectSquad}
                    onDisbandSquad={handleDisbandSquad}
                  />

                  {selectedBuilding && (
                    <BuildingAdaptationDrawer
                      building={selectedBuilding}
                      adaptedInfo={
                        settlement.adaptedBuildings?.get(selectedBuilding.id) ||
                        settlement.freestandingBuildings?.find(
                          (f) => String(f.buildingId) === String(selectedBuilding.id)
                        )
                      }
                      isHQ={
                        !!settlement.hq &&
                        String(settlement.hq.buildingId) === String(selectedBuilding.id)
                      }
                      settlement={settlement}
                      hiddenGroup={settlement.hiddenGroups?.get(selectedBuilding.id) || null}
                      onClose={() => {
                        setSelectedBuilding(null);
                        setActiveSidebarTab(null);
                      }}
                      onDismantle={handleOrderDeconstruction}
                      onFocusBuilding={handleFocusBuilding}
                      onAppointHead={handleAppointHead}
                      onVacateSurvivorRole={handleVacateSurvivorRole}
                      onInvestigateHiddenGroup={(group) => {
                        if (group) setActiveRecruitmentGroup(group);
                      }}
                      onRepairBuilding={handleRepairBuilding}
                      onSearchInfestedBuilding={handleSearchBuilding}
                    />
                  )}

                  {selectedVehicleId && (
                    <VehicleTacticalDrawer
                      vehicle={settlement.vehicles?.find((v) => v.id === selectedVehicleId) || null}
                      onClose={() => setSelectedVehicleId(null)}
                      settlement={settlement}
                      onUpdateSettlement={setSettlement}
                      combatSquads={combatSquads}
                      onUpdateCombatSquads={handleUpdateCombatSquads}
                      onOpenFullFleetModal={() => setIsVehicleModalOpen(true)}
                      onOrderVehicleExtraction={handleOrderVehicleExtraction}
                    />
                  )}
                </div>
                );
              })()}

              {/* Area Drag-Box Gathering Overlay */}
              <AreaGatherOverlay
                isActive={activeGatherType !== null}
                gatherType={activeGatherType || 'wood'}
                onCancel={() => {
                  setActiveGatherType(null);
                  sceneRef.current?.setGatherHighlight(null, null);
                }}
                onDragBoundsChange={(bounds) => {
                  sceneRef.current?.setGatherHighlight(activeGatherType, bounds);
                }}
                onDesignateArea={(type, bounds) => {
                  sceneRef.current?.setGatherHighlight(null, null);
                  if (type === 'scavenge') handleDesignateSquadScavenge(bounds);
                  else handleDesignateGatherArea(type, bounds);
                }}
                screenRectToWorldBounds={(x1, y1, x2, y2) => {
                  if (sceneRef.current) {
                    return sceneRef.current.screenRectToWorldBounds(x1, y1, x2, y2);
                  }
                  return { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
                }}
              />

              {/* Toast Notification — bottom-left above build menu, same width */}
              {toastMessage && (
                <div
                  className={`fixed bottom-20 left-4 z-50 w-72 p-2.5 border pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200 clip-card-chip ${
                    toastMessage.type === 'warn'
                      ? 'bg-[#1A140B] border-[#78350F] text-[#FDE68A]'
                      : toastMessage.type === 'success'
                      ? 'bg-[#0B1710] border-[#065F46] text-[#A7F3D0]'
                      : 'bg-[#0E1116] border-[#252C36] text-[#CBD5E1]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-heading font-bold text-[11px] uppercase tracking-wider">
                        {toastMessage.title}
                      </span>
                      <p className="text-[10px] font-mono leading-tight text-[#94A3B8] mt-0.5">
                        {toastMessage.desc}
                      </p>
                    </div>
                    <button
                      onClick={() => setToastMessage(null)}
                      className="text-[#64748B] hover:text-[#E8E8E8] transition-colors shrink-0"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Bottom-Left 4-Button Action Bar (Buildings, Fortifications, Area Works, Citizens/Workers) */}
              <TacticalActionBar
                settlement={settlement}
                onSelectAdaptationType={(typeId) => {
                  if (selectedBuilding) {
                    handleAdaptBuilding(selectedBuilding, typeId);
                  } else {
                    // Arm the conversion: the next structure clicked becomes this facility.
                    setPendingAdaptType(typeId);
                    setToastMessage({
                      title: 'SELECT BUILDING',
                      desc: 'Click a structure on the map to convert it into this facility.',
                      type: 'info',
                    });
                  }
                  soundService.playClick();
                }}
                onSelectFreestandingBlueprint={(typeId) => {
                  if (typeId) {
                    setPendingFreestandingType(typeId);
                    setPendingAdaptType(null);
                    setSelectedBuilding(null);
                    const def = FUNCTIONAL_BUILDING_DEFINITIONS[typeId];
                    setToastMessage({
                      title: 'BLUEPRINT ARMED: ' + (def?.name || typeId).toUpperCase(),
                      desc: 'Tap anywhere on open ground to place structure and deploy builders.',
                      type: 'info',
                    });
                    soundService.playCombatActionSFX('assault_order');
                  } else {
                    setIsFreestandingModalOpen(true);
                    soundService.playClick();
                  }
                }}
                onStartGatherArea={(type) => {
                  setActiveGatherType(type);
                  soundService.playClick();
                }}
                activeGatherType={activeGatherType}
                onUpdateWorkerJobPriority={(jobId, priority) => {
                  setSettlement((prev) => updateWorkerJobPriority(prev, jobId, priority));
                }}
                onUpdateWorkerJobLimit={(jobId, limit) => {
                  setSettlement((prev) => updateWorkerJobLimit(prev, jobId, limit));
                }}
                onSetWorkerJobToZero={(jobId) => {
                  setSettlement((prev) => setWorkerJobToZero(prev, jobId));
                }}
                onSetWorkerJobToMax={(jobId) => {
                  setSettlement((prev) => setWorkerJobToMax(prev, jobId));
                }}
                onOpenPopulationRoster={() => setIsPopulationModalOpen(true)}
                idleLaborCount={settlement.generalPopulation?.unassigned || 0}
                totalLaborCount={settlement.namedSurvivors.length + (settlement.generalPopulation?.total || 0)}
              />

              {/* Bottom-Right Unified Building Info Mini-Panel & Radar Minimap */}
              <TacticalMinimapWidget
                selectedBuilding={selectedBuilding}
                adaptedBuildingInfo={selectedBuilding ? settlement.adaptedBuildings?.get(selectedBuilding.id) || null : null}
                buildings={mapData?.buildings || []}
                landuse={mapData?.landuse || []}
                squads={combatSquads}
                zombies={zombies.filter((z) => z.state !== 'dead')}
                vehicles={settlement.vehicles || []}
                hqBuildingId={settlement.hq?.buildingId || null}
                mapRadius={mapData?.radius || 4000}
                cameraPosition={sceneRef.current?.cameraController?.target || { x: 0, z: 0 }}
                onPanTo={handleMinimapPanTo}
                onCenterHQ={() => {
                  if (settlement.hq) {
                    const bldg = mapData?.buildings.find((b) => b.id === settlement.hq?.buildingId);
                    if (bldg) handleMinimapPanTo(bldg.center);
                  }
                }}
                onResetNorth={() => {
                  soundService.playClick();
                  sceneRef.current?.cameraController.faceNorth();
                }}
                isScavengeViewActive={isScavengeViewActive}
                scavengeFilterType={scavengeFilterType}
                onToggleScavengeView={() => {
                  setIsScavengeViewActive((prev) => {
                    const next = !prev;
                    if (sceneRef.current) {
                      sceneRef.current.setScavengeView(next, scavengeFilterType);
                    }
                    return next;
                  });
                }}
                onSetScavengeFilter={(filter) => {
                  setScavengeFilterType(filter);
                  setIsScavengeViewActive(true);
                  if (sceneRef.current) {
                    sceneRef.current.setScavengeView(true, filter);
                  }
                }}
                showStreetLabels={showStreetLabels}
                onToggleStreetLabels={() => {
                  setShowStreetLabels((prev) => {
                    const next = !prev;
                    if (sceneRef.current) {
                      sceneRef.current.setShowStreetLabels(next);
                    }
                    return next;
                  });
                }}
                showSatelliteOverlay={showSatelliteOverlay}
                onToggleSatelliteOverlay={() => {
                  setShowSatelliteOverlay((prev) => {
                    const next = !prev;
                    if (sceneRef.current) {
                      sceneRef.current.setSatelliteOverlay(next);
                    }
                    return next;
                  });
                }}
                showLanduse={showLanduse}
                onToggleLanduse={() => {
                  setShowLanduse((prev) => !prev);
                }}
                showStructureOutlines={showBuildingEdges}
                onToggleStructureOutlines={() => {
                  setShowBuildingEdges((prev) => {
                    const next = !prev;
                    if (sceneRef.current) {
                      sceneRef.current.setShowBuildingEdges(next);
                    }
                    return next;
                  });
                }}
                labelDetailMode={labelDetailMode}
                onToggleLabelDetailMode={() => {
                  setLabelDetailMode((prev) => {
                    const next = prev === 'detailed' ? 'minimal' : 'detailed';
                    if (sceneRef.current) {
                      sceneRef.current.setLabelDetailMode(next);
                    }
                    return next;
                  });
                }}
                onToggleHideUi={() => setIsHideUi(true)}
                isExpeditionViewActive={isExpeditionViewActive}
                onToggleExpeditionView={() => {
                  if (sceneRef.current) {
                    const isExp = sceneRef.current.cameraController.toggleExpeditionView();
                    setIsExpeditionViewActive(isExp);
                  }
                }}
                onScavengeSelected={(bldg) => {
                  const sq = combatSquads.find((s) => s.squadId === selectedSquadId) || combatSquads[0];
                  if (sq) {
                    handleOrderSquadMove(sq.squadId, bldg.center, bldg.id, bldg.name);
                  }
                }}
                onAdaptSelected={(bldg) => {
                  setSelectedBuilding(bldg);
                  setActiveSidebarTab('build');
                }}
                onDemolishSelected={(bldg) => handleOrderDeconstruction(bldg.id)}
                onOpenRadio={() => {
                  const unread =
                    radioDirectiveState?.currentIncomingTransmission ||
                    radioDirectiveState?.transmissionLog?.find((t) => !t.isRead) ||
                    radioDirectiveState?.transmissionLog?.[0] ||
                    null;
                  setActiveRadioTransmission(unread);
                  setIsRadioModalOpen(true);
                }}
                unreadRadioCount={radioDirectiveState?.unreadCount || 0}
                hasIncomingRadio={Boolean(radioDirectiveState?.unreadCount && radioDirectiveState.unreadCount > 0)}
                isInitialPendingRadio={isInitialCommsPending}
              />


              {/* Phase 1 HQ Selection Card (shown ONLY after initial radio communication has been confirmed AND no HQ is selected yet) */}
              {!settlement.hq && isHQSelectionUnlocked && (
                <HQSelectionCard
                  selectedBuilding={selectedBuilding}
                  onConfirmHQ={handleConfirmHQ}
                />
              )}
            </>
          )}

          {/* World Discovery Recruitment Encounter Modal (§4.4) */}
          <RecruitmentEncounterModal
            isOpen={!!activeRecruitmentGroup}
            onClose={() => setActiveRecruitmentGroup(null)}
            group={activeRecruitmentGroup}
            settlement={settlement}
            onRecruit={handleRecruitGroup}
          />

          {/* Rival-Faction Ransom Event Modal (§5.2) */}
          <RansomEventModal
            isOpen={!!activeRansomHideoutId}
            onClose={() => setActiveRansomHideoutId(null)}
            hideout={
              (activeRansomHideoutId && settlement.rivalHideouts?.get(activeRansomHideoutId)) || null
            }
            settlement={settlement}
            onPayRansom={handlePayRansom}
            onRefuseRescue={handleRefuseRescue}
          />

          {/* Colony Overrun & Destruction Alert Modal (§7.5) */}
          {overrunSettlement && (
            <ColonyOverrunModal
              isOpen={!!overrunSettlement && !isExtinct}
              destroyedSettlement={overrunSettlement}
              operationalSettlements={(Object.values(settlements) as SettlementRecord[]).filter(
                (s) => s.status === 'operational'
              )}
              onOpenGlobe={() => {
                setOverrunSettlement(null);
                setViewMode('globe');
              }}
              onSwitchToSettlement={(targetId) => {
                setOverrunSettlement(null);
                handleSelectExistingSettlement(targetId);
              }}
              onDispatchRelief={(originId) => {
                setOverrunSettlement(null);
                handleSelectExistingSettlement(originId);
                setActiveSidebarTab('caravans');
              }}
            />
          )}

          {/* Total Extinction Game Over Modal (§7.5) */}
          <GameOverExtinctModal
            isOpen={isExtinct}
            stats={calculateGlobalNetworkStats(settlements, caravans)}
            onRestartGame={handleRestartGame}
          />

        </>
      )}

      {/* Global In-Game & Menu Modals */}

      {/* New Game Setup Modal */}
      <NewGameSetupModal
        isOpen={isNewGameModalOpen}
        onClose={() => setIsNewGameModalOpen(false)}
        onStartGame={handleStartNewGame}
      />

      {/* Save / Load Game Modal */}
      <SaveLoadModal
        isOpen={isSaveLoadModalOpen}
        mode={saveLoadMode}
        onClose={() => setIsSaveLoadModalOpen(false)}
        onSaveGame={(name, overwriteId) => handleSaveGame(name, overwriteId)}
        onLoadGame={handleLoadGame}
        activeColonyName={settlement.name}
        activeDayNumber={gameClock.day}
      />

      {/* In-Game Tactical Pause Menu (ESC / Header Menu) */}
      <TacticalPauseMenu
        isOpen={isPauseMenuOpen}
        onResume={() => setIsPauseMenuOpen(false)}
        onQuickSave={handleQuickSave}
        onOpenSave={() => {
          setSaveLoadMode('save');
          setIsSaveLoadModalOpen(true);
        }}
        onSaveGame={() => {
          setSaveLoadMode('save');
          setIsSaveLoadModalOpen(true);
        }}
        onOpenLoad={() => {
          setSaveLoadMode('load');
          setIsSaveLoadModalOpen(true);
        }}
        onLoadGame={() => {
          setSaveLoadMode('load');
          setIsSaveLoadModalOpen(true);
        }}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenCodex={() => setIsCodexModalOpen(true)}
        onOpenGlobe={() => {
          setIsPauseMenuOpen(false);
          setViewMode('globe');
        }}
        onRestartScenario={handleRestartGame}
        onExitToMainMenu={handleExitToMainMenu}
        settlement={settlement}
        clock={gameClock}
        colonyName={settlement.name}
        dayNumber={gameClock.day}
        season={settlement.weather?.currentSeason || 'summer'}
      />

      {/* Population & Workforce Command Modal (§4.1 - §4.6) */}
      <PopulationRosterModal
        isOpen={isPopulationModalOpen}
        onClose={() => setIsPopulationModalOpen(false)}
        settlement={settlement}
        onVacateSurvivorRole={handleVacateSurvivorRole}
        onAppointHead={handleAppointHead}
        onUpdateJobPriority={handleUpdateJobPriorities}
        onOpenSquads={() => setIsSquadModalOpen(true)}
        onOpenMedbay={() => setIsMedbayModalOpen(true)}
      />

      {/* Colony Technology Tree Modal (§10) — rendered once but only mounts when open */}
      {isResearchModalOpen && (
        <ResearchTreeModal
          settlement={settlement}
          onUpdateSettlement={setSettlement}
          onClose={() => setIsResearchModalOpen(false)}
        />
      )}

      {/* Survival Codex / Guide Modal */}
      <SurvivalCodexModal
        isOpen={isCodexModalOpen}
        onClose={() => setIsCodexModalOpen(false)}
      />

      {/* Freestanding Building Construction Catalog Modal (§7.2) */}
      <FreestandingBuildModal
        isOpen={isFreestandingModalOpen}
        onClose={() => setIsFreestandingModalOpen(false)}
        settlement={settlement}
        targetPosition={clickedPosition}
        onBuildFreestanding={handleBuildFreestanding}
        onArmBlueprint={(typeId) => {
          setPendingFreestandingType(typeId);
          setPendingAdaptType(null);
          setSelectedBuilding(null);
          const def = FUNCTIONAL_BUILDING_DEFINITIONS[typeId];
          setToastMessage({
            title: 'BLUEPRINT ARMED: ' + (def?.name || typeId).toUpperCase(),
            desc: 'Tap anywhere on open ground to place structure and deploy builders.',
            type: 'info',
          });
          soundService.playCombatActionSFX('assault_order');
        }}
      />

      {/* Game Settings Modal */}
      <GameSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onApplySettings={handleApplyGameSettings}
      />

      {/* Credits Modal */}
      <CreditsModal
        isOpen={isCreditsModalOpen}
        onClose={() => setIsCreditsModalOpen(false)}
      />

      {/* Safe Zones Operations Radio Console Modal (§TERMINUS PROTOCOL) */}
      <RadioTransmissionModal
        isOpen={isRadioModalOpen}
        onClose={() => setIsRadioModalOpen(false)}
        radioState={radioDirectiveState}
        activeTransmission={activeRadioTransmission}
        transmissionHistory={radioDirectiveState.transmissionLog}
        activeDirectives={radioDirectiveState.activeDirectives}
        isAlarmActive={isAlarmActive}
        alarmHoursRemaining={alarmHoursRemaining}
        onToggleAlarm={handleToggleAlarm}
        mannedTowersCount={mannedTowersCount}
        mannedGatesCount={mannedGatesCount}
        onAcknowledgeTransmission={(txId) => {
          setRadioDirectiveState((prev) => acknowledgeTransmission(prev, txId));
        }}
        onSelectTransmission={(tx) => {
          setActiveRadioTransmission(tx);
          setRadioDirectiveState((prev) => acknowledgeTransmission(prev, tx.id));
        }}
        onActionTrigger={(actionType) => {
          setIsRadioModalOpen(false);
          handleDirectiveAction(actionType);
        }}
      />
    </div>
  );
}
