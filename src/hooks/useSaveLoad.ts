import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { saveService } from '../services/saveService';
import { clearMapCache } from '../services/mapCache';
import { RoadNetworkGraph } from '../services/roadPathfinder';
import { PathGrid } from '../services/pathfindingService';
import { createInitialSettlementState } from '../services/settlementService';
import { createInitialGameClock } from '../services/combatService';
import { getInitialRadioDirectiveState } from '../services/radioDirectiveService';
import { DEFAULT_PRESET } from '../data/sampleMapData';
import { soundService, ToastMessage } from '../services/soundService';
import type { BuildingPolygon, LocationPreset, MapData, SettlementPlacement } from '../types/map';
import type { CaravanDispatchConfig, SettlementRecord, TradeCaravan } from '../types/caravan';
import type { GameScenarioSettings, GameSettings, SatelliteQuality } from '../types/saveGame';
import type { GameClockState, TacticalSquadUnit, ZombieUnit } from '../types/combat';
import type { SettlementState } from '../types/settlement';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import type { TimeOfDay, WorldScene } from '../render/WorldScene';

/**
 * Runtime for the save/load + game-flow handlers (persistence, new game,
 * keyboard shortcuts, camera helpers, cache controls).
 */
export interface SaveLoadRuntime {
  settlement: SettlementState;
  gameClock: GameClockState;
  settlements: Record<string, SettlementRecord>;
  activeSettlementId: string;
  activePlacement: SettlementPlacement | null;
  currentPreset: LocationPreset;
  mapData: MapData | null;
  /** Live sim-owned map (carries accumulated resource-node depletion). */
  mapDataRef: MutableRefObject<MapData | null>;
  caravans: TradeCaravan[];
  radioDirectiveState: RadioDirectiveState;
  combatSquads: TacticalSquadUnit[];
  scavengeQueue: Record<string, Array<string | number>>;
  zombies: ZombieUnit[];
  dangerLevel: number;
  timeOfDay: TimeOfDay;
  viewMode: 'start_screen' | 'intro' | 'main_menu' | 'globe' | 'world';
  showSatelliteOverlay: boolean;
  satelliteQuality: SatelliteQuality;
  setScavengeQueue: Dispatch<SetStateAction<Record<string, Array<string | number>>>>;
  selectedBuilding: BuildingPolygon | null;
  selectedSquadId: string | null;
  selectedVehicleId: string | null;
  combatSquadsRef: MutableRefObject<TacticalSquadUnit[]>;
  roadGraphRef: MutableRefObject<RoadNetworkGraph | null>;
  pathGridRef: MutableRefObject<PathGrid | null>;
  sceneRef: MutableRefObject<WorldScene | null>;
  descentTimerRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  loadLocation: (lat: number, lon: number, radius: number, forceLive?: boolean) => Promise<void>;
  stopDescentTimer: () => void;
  setToastMessage: (msg: ToastMessage | null) => void;
  setIsSaveLoadModalOpen: Dispatch<SetStateAction<boolean>>;
  setSettlements: Dispatch<SetStateAction<Record<string, SettlementRecord>>>;
  setActiveSettlementId: Dispatch<SetStateAction<string>>;
  setSettlement: Dispatch<SetStateAction<SettlementState>>;
  setGameClock: Dispatch<SetStateAction<GameClockState>>;
  setActivePlacement: Dispatch<SetStateAction<SettlementPlacement | null>>;
  setCurrentPreset: Dispatch<SetStateAction<LocationPreset>>;
  setCaravans: Dispatch<SetStateAction<TradeCaravan[]>>;
  setRadioDirectiveState: Dispatch<SetStateAction<RadioDirectiveState>>;
  setActiveRadioTransmission: Dispatch<SetStateAction<RadioTransmission | null>>;
  setDangerLevel: Dispatch<SetStateAction<number>>;
  setTimeOfDay: Dispatch<SetStateAction<TimeOfDay>>;
  setCombatSquads: Dispatch<SetStateAction<TacticalSquadUnit[]>>;
  setZombies: Dispatch<SetStateAction<ZombieUnit[]>>;
  setMapData: Dispatch<SetStateAction<MapData | null>>;
  setCacheSource: Dispatch<SetStateAction<string>>;
  setIsPauseMenuOpen: Dispatch<SetStateAction<boolean>>;
  setViewMode: Dispatch<SetStateAction<'start_screen' | 'intro' | 'main_menu' | 'globe' | 'world'>>;
  setIsNewGameModalOpen: Dispatch<SetStateAction<boolean>>;
  setOverrunSettlement: Dispatch<SetStateAction<SettlementRecord | null>>;
  setIsExtinct: Dispatch<SetStateAction<boolean>>;
  setIsCodexModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsSettingsModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsCreditsModalOpen: Dispatch<SetStateAction<boolean>>;
  setElevationExaggeration: Dispatch<SetStateAction<number>>;
  setDisableElevation: Dispatch<SetStateAction<boolean>>;
  setShowTerrainWireframe: Dispatch<SetStateAction<boolean>>;
  setShowBuildingEdges: Dispatch<SetStateAction<boolean>>;
  setShowSatelliteOverlay: Dispatch<SetStateAction<boolean>>;
  setSatelliteQuality: Dispatch<SetStateAction<SatelliteQuality>>;
  setSelectedBuilding: Dispatch<SetStateAction<BuildingPolygon | null>>;
  setSelectedSquadId: Dispatch<SetStateAction<string | null>>;
  /** §IFZ CTRL+drag multi-select: deselect clears the whole group, not just the primary. */
  setSelectedSquadIds: Dispatch<SetStateAction<string[]>>;
  setSelectedVehicleId: Dispatch<SetStateAction<string | null>>;
  setDescentProgress: Dispatch<SetStateAction<number>>;
  setDescentAltitudeKm: Dispatch<SetStateAction<number>>;
  setIsDescentActive: Dispatch<SetStateAction<boolean>>;
}

/** Persistence & save/load, new-game flow, global keyboard shortcuts and misc flow helpers. */
export function useSaveLoad(runtime: SaveLoadRuntime) {
  const {
    settlement,
    gameClock,
    settlements,
    activeSettlementId,
    activePlacement,
    currentPreset,
    mapData,
    mapDataRef,
    caravans,
    radioDirectiveState,
    combatSquads,
    scavengeQueue,
    zombies,
    dangerLevel,
    timeOfDay,
    viewMode,
    showSatelliteOverlay,
    satelliteQuality,
    selectedBuilding,
    selectedSquadId,
    selectedVehicleId,
    combatSquadsRef,
    roadGraphRef,
    pathGridRef,
    sceneRef,
    descentTimerRef,
    loadLocation,
    stopDescentTimer,
    setToastMessage,
    setIsSaveLoadModalOpen,
    setSettlements,
    setActiveSettlementId,
    setSettlement,
    setGameClock,
    setActivePlacement,
    setCurrentPreset,
    setCaravans,
    setRadioDirectiveState,
    setActiveRadioTransmission,
    setDangerLevel,
    setTimeOfDay,
    setCombatSquads,
    setZombies,
    setMapData,
    setCacheSource,
    setIsPauseMenuOpen,
    setViewMode,
    setIsNewGameModalOpen,
    setOverrunSettlement,
    setIsExtinct,
    setIsCodexModalOpen,
    setIsSettingsModalOpen,
    setIsCreditsModalOpen,
    setElevationExaggeration,
    setDisableElevation,
    setShowTerrainWireframe,
    setShowBuildingEdges,
    setShowSatelliteOverlay,
    setSatelliteQuality,
    setSelectedBuilding,
    setSelectedSquadId,
    setSelectedSquadIds,
    setSelectedVehicleId,
    setScavengeQueue,
    setDescentProgress,
    setDescentAltitudeKm,
    setIsDescentActive,
  } = runtime;

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
            // Save the sim-owned map so reloaded games keep node depletion.
            mapData: mapDataRef.current || mapData,
            caravans,
            radioState: radioDirectiveState,
            hasCompletedFirstScavenge: true,
            combatSquads,
            zombies,
            worldVehicles: settlement.vehicles || [],
            dangerLevel,
            timeOfDay,
            satelliteOverlay: showSatelliteOverlay,
            satelliteQuality,
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
      mapDataRef,
      caravans,
      radioDirectiveState,
      combatSquads,
      zombies,
      dangerLevel,
      timeOfDay,
      showSatelliteOverlay,
      satelliteQuality,
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
          mapData: mapDataRef.current || mapData,
          caravans,
          radioState: radioDirectiveState,
          hasCompletedFirstScavenge: true,
          combatSquads,
          scavengeQueue,
          zombies,
          worldVehicles: settlement.vehicles || [],
          dangerLevel,
          timeOfDay,
          satelliteOverlay: showSatelliteOverlay,
          satelliteQuality,
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
    mapDataRef,
    caravans,
    radioDirectiveState,
    combatSquads,
    scavengeQueue,
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

        // Restore satellite layer overlays along with the other layer toggles.
        if (typeof payload.satelliteOverlay === 'boolean') {
          setShowSatelliteOverlay(payload.satelliteOverlay);
        }
        if (payload.satelliteQuality === 'performance' || payload.satelliteQuality === 'balanced' || payload.satelliteQuality === 'detail') {
          setSatelliteQuality(payload.satelliteQuality);
        }

        setScavengeQueue(payload.scavengeQueue || {});

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
    [loadLocation, setShowSatelliteOverlay, setSatelliteQuality]
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

      // Starting supplies are intentionally difficulty-independent: every new
      // colony gets five food-days, seven water-days, four pistols, 150 rounds,
      // 50 fuel, and 50 units of each building material. Population is normalized
      // below, so recalculate the two population-scaled reserves after that.

      // Align the actual starting population to the player's chosen option
      // (LOW 5 / MED 10 / HIGH 18 — or the difficulty-preset count).
      // `createInitialSettlementState` seeds a medium baseline; this normalizes
      // total + unassigned so the colony starts with exactly the chosen number.
      newSettlement.generalPopulation.total = Math.max(0, scenario.startingPopulation - newSettlement.namedSurvivors.length);
      newSettlement.generalPopulation.unassigned = newSettlement.generalPopulation.total;
      const totalStartingPopulation = newSettlement.namedSurvivors.length + newSettlement.generalPopulation.total;
      newSettlement.stockpile.food = { canned_goods: Math.round(totalStartingPopulation * 0.5 * 5), mre_rations: 0, dried_rations: 0, fresh_harvest: 0 };
      newSettlement.stockpile.water = { bottled_water: Math.round(totalStartingPopulation * 1.5 * 7), purified_water: 0, rainwater: 0 };
      newSettlement.stockpile.fuel = { gasoline: 50, diesel: 0, biofuel: 0 };
      newSettlement.stockpile.ammo = { sharedPool: 150 };
      newSettlement.stockpile.materials = { wood: 50, metal: 50, bricks: 50, tools: 20 };
      newSettlement.armory = { weapons: ['pistol', 'pistol', 'pistol', 'pistol'], armor: [] };

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
            // §IFZ multi-select: ESC closes the whole selection, not just the
            // primary — otherwise the box set survives in the scene and orders
            // keep fanning out to squads with no visible command card.
            setSelectedSquadId(null);
            setSelectedSquadIds([]);
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
  }, [viewMode, selectedBuilding, selectedSquadId, selectedVehicleId, handleQuickSave, handleQuickLoad, setSelectedSquadIds]);

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

  return {
    handleSaveGame,
    handleQuickSave,
    handleLoadGame,
    handleQuickLoad,
    handleContinueGame,
    handleStartNewGame,
    handleExitToMainMenu,
    handleApplyGameSettings,
    handleRestartGame,
    handleSelectPreset,
    handleFetchCustom,
    handleClearCache,
    handleRefetch,
    handleFocusBuilding,
    handleResetCamera,
    handleReturnToGlobe,
  };
}