import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppViewMode } from '../App';
import { DEFAULT_PRESET } from '../data/sampleMapData';
import type { GatherResourceType } from '../components/AreaGatherOverlay';
import type { ActiveSidebarTab } from '../components/TacticalHeaderStrip';
import type { TacticalAlert } from '../components/TacticalAlertStream';
import type { ToastItem } from '../components/NotificationTray';
import { getInitialRadioDirectiveState } from '../services/radioDirectiveService';
import { detectSatelliteQuality } from '../services/satelliteService';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import { soundService, ToastMessage } from '../services/soundService';
import { TimeOfDay, WorldScene } from '../render/WorldScene';
import { createInitialGameClock } from '../services/combatService';
import type { DroppedItem, GameClockState, HostileHumanUnit, NoiseEvent, TacticalSquadUnit, ZombieUnit } from '../types/combat';
import { createInitialSettlementState } from '../services/settlementService';
import { BuildingPolygon, LocationPreset, MapData, Point2D, ResourceNode, SettlementPlacement } from '../types/map';
import type { SettlementRecord, TradeCaravan } from '../types/caravan';
import { HiddenSurvivorGroup } from '../types/population';
import { FunctionalBuildingTypeId, SettlementState } from '../types/settlement';
import { RoadNetworkGraph } from '../services/roadPathfinder';
import { PathGrid } from '../services/pathfindingService';

/**
 * All working state, refs and small utility callbacks for the game screen.
 * Extracted from App.tsx (which was a 5,000+ line god component) so the
 * simulation loop, save/load and action handlers can be split into their own
 * hooks with this providing the single source of truth for the UI state.
 */
export function useGameState() {
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
  // Live mirror of the queue so the fast simulation loop can read freshly-created
  // queues (the loop's closure can otherwise lag behind handleDesignateSquadScavenge).
  const scavengeQueueRef = useRef(scavengeQueue);
  useEffect(() => {
    scavengeQueueRef.current = scavengeQueue;
  }, [scavengeQueue]);
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  // The tray is driven entirely by soundService notification events: every toast
  // comes from a `soundService.notify(...)` call, which both plays the chime and
  // broadcasts here, so on-screen toasts and audio always stay in sync. Each one
  // gets its own id + auto-dismiss timer so rapid-fire notifications queue.
  const handleToastNotify = useCallback((msg: ToastMessage) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { ...msg, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);
  useEffect(() => soundService.onNotification(handleToastNotify), [handleToastNotify]);
  // Keep the many existing `setToastMessage({...})` call sites working: an object
  // is routed through the sound event bus (`null` clears the whole queue).
  const setToastMessage = useCallback((msg: ToastMessage | null) => {
    if (msg === null) {
      setToasts([]);
      return;
    }
    soundService.notify(msg);
  }, []);
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
  const [scavengeFilterType, setScavengeFilterType] = useState<import('../components/TacticalMinimapWidget').ScavengeLootFilter>('all');
  const [showStreetLabels, setShowStreetLabels] = useState<boolean>(false);
  const [showSatelliteOverlay, setShowSatelliteOverlay] = useState<boolean>(false);
  // Default tier is auto-detected from GPU/memory/CPU on first launch; the
  // save/load path overrides it with any player-chosen preference.
  const [satelliteQuality, setSatelliteQuality] = useState<import('../types/saveGame').SatelliteQuality>(detectSatelliteQuality);
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

  return {
    // Screen flow & globe
    viewMode, setViewMode, currentPreset, setCurrentPreset, activePlacement, setActivePlacement,
    // Modals & flow
    isNewGameModalOpen, setIsNewGameModalOpen, isSaveLoadModalOpen, setIsSaveLoadModalOpen,
    saveLoadMode, setSaveLoadMode, isPauseMenuOpen, setIsPauseMenuOpen, isCodexModalOpen, setIsCodexModalOpen,
    isSettingsModalOpen, setIsSettingsModalOpen, isCreditsModalOpen, setIsCreditsModalOpen,
    isPwaUpdateAvailable, setIsPwaUpdateAvailable,
    // Map loading
    mapData, setMapData, isLoading, setIsLoading, loadingMessage, setLoadingMessage,
    loadError, setLoadError, cacheSource, setCacheSource,
    isSceneRendered, setIsSceneRendered, pendingAdaptType, setPendingAdaptType,
    isDescentActive, setIsDescentActive, descentProgress, setDescentProgress, descentAltitudeKm,
    setDescentAltitudeKm, descentTimerRef, stopDescentTimer, handleLoadProgress,
    // Multi-settlement
    initialSettlementId, settlements, setSettlements, activeSettlementId, setActiveSettlementId,
    caravans, setCaravans, isCaravansModalOpen, setIsCaravansModalOpen,
    overrunSettlement, setOverrunSettlement, isExtinct, setIsExtinct,
    // Working settlement
    settlement, setSettlement, pendingFreestandingType, setPendingFreestandingType,
    scavengeQueue, setScavengeQueue, scavengeQueueRef,
    isFreestandingModalOpen, setIsFreestandingModalOpen, isPopulationModalOpen, setIsPopulationModalOpen,
    isSquadModalOpen, setIsSquadModalOpen, isMedbayModalOpen, setIsMedbayModalOpen,
    isVehicleModalOpen, setIsVehicleModalOpen, isResearchModalOpen, setIsResearchModalOpen,
    isMoraleModalOpen, setIsMoraleModalOpen, isWeatherModalOpen, setIsWeatherModalOpen,
    isAudioModalOpen, setIsAudioModalOpen,
    dangerLevel, setDangerLevel, selectedVehicleId, setSelectedVehicleId,
    activeRecruitmentGroup, setActiveRecruitmentGroup, contactedSurvivorGroupIdsRef,
    // Toasts
    toasts, setToasts, toastIdRef, handleToastNotify, setToastMessage, radioAlertIdsRef,
    // Radio directives
    radioDirectiveState, setRadioDirectiveState, isRadioModalOpen, setIsRadioModalOpen,
    activeRadioTransmission, setActiveRadioTransmission,
    isCelebrationModalOpen, setIsCelebrationModalOpen, handleClaimDawnReward,
    // Sidebar & alerts
    activeSidebarTab, setActiveSidebarTab, isQuestListOpen, setIsQuestListOpen,
    alerts, setAlerts, addTacticalAlert, handleDismissAlert, handleMinimapPanTo,
    // Combat & clock
    gameClock, setGameClock, zombies, setZombies, combatSquads, setCombatSquads,
    hostileHumans, setHostileHumans, activeRansomHideoutId, setActiveRansomHideoutId,
    combatSquadsRef, droppedItems, setDroppedItems, noiseEvents, setNoiseEvents,
    selectedSquadId, setSelectedSquadId, roadGraphRef, pathGridRef, fogVisibleCellsRef,
    // Selection & interaction
    selectedBuilding, setSelectedBuilding, selectedResourceNode, setSelectedResourceNode,
    hoveredBuilding, setHoveredBuilding, clickedPosition, setClickedPosition,
    timeOfDay, setTimeOfDay,
    // Elevation & layers
    elevationExaggeration, setElevationExaggeration, disableElevation, setDisableElevation,
    showTerrainWireframe, setShowTerrainWireframe,
    showBuildingEdges, setShowBuildingEdges, showBuildings, setShowBuildings,
    showRoads, setShowRoads, showWood, setShowWood, showMetal, setShowMetal,
    showBricks, setShowBricks, showLanduse, setShowLanduse, activeGatherType, setActiveGatherType,
    // Scavenge view & minimap layers
    isScavengeViewActive, setIsScavengeViewActive, scavengeFilterType, setScavengeFilterType,
    showStreetLabels, setShowStreetLabels, showSatelliteOverlay, setShowSatelliteOverlay,
    satelliteQuality, setSatelliteQuality,
    labelDetailMode, setLabelDetailMode, isHideUi, setIsHideUi,
    isExpeditionViewActive, setIsExpeditionViewActive,
    // Alarm
    isAlarmActive, setIsAlarmActive, alarmHoursRemaining, setAlarmHoursRemaining,
    mannedTowersCount, mannedGatesCount, handleToggleAlarm,
    // Scene & refs
    sceneRef, abortControllerRef, settlementRef, mapDataRef, gameClockRef, zombiesRef,
  };
}