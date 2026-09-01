import React, { useEffect, useRef } from 'react';
import { syncTacticalSquadUnits, generateAmbientMapZombies } from '../services/combatService';
import { tickSettlementSimulation } from '../services/populationService';
import { tickResearchSimulation } from '../services/researchService';
import { createInitialWeatherState, tickWeatherSimulation } from '../services/weatherService';
import { tickMoraleAndGrowthSimulation } from '../services/moraleService';
import { createFogGrid, markExploredCells, discoverGroupsInVision, discoverThreatsInVision } from '../services/fogOfWarService';
import { generateRivalHideouts, generateZombieLairs } from '../services/rivalFactionService';
import { updateRadioDirectiveSystem } from '../services/radioDirectiveService';
import { tickCaravansSimulation } from '../services/caravanService';
import { tickResourceGathering } from '../services/resourceGatheringService';
import { RoadNetworkGraph } from '../services/roadPathfinder';
import { PathGrid } from '../services/pathfindingService';
import { soundService, ToastMessage } from '../services/soundService';
import type { AppViewMode } from '../App';
import type { WorldScene } from '../render/WorldScene';
import type { GameClockState, ZombieUnit, TacticalSquadUnit } from '../types/combat';
import type { SettlementState } from '../types/settlement';
import type { MapData, ResourceNode, BuildingPolygon } from '../types/map';
import type { HiddenSurvivorGroup } from '../types/population';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import type { SettlementRecord, TradeCaravan } from '../types/caravan';

export interface WorldEffectsRuntime {
  viewMode: AppViewMode;
  isDescentActive: boolean;
  mapData: MapData | null;
  gameClock: GameClockState;
  gameClockRef: React.MutableRefObject<GameClockState>;
  mapDataRef: React.MutableRefObject<MapData | null>;
  settlement: SettlementState;
  settlementRef: React.MutableRefObject<SettlementState>;
  zombies: ZombieUnit[];
  zombiesRef: React.MutableRefObject<ZombieUnit[]>;
  isAlarmActive: boolean;
  pathGridRef: React.MutableRefObject<PathGrid | null>;
  roadGraphRef: React.MutableRefObject<RoadNetworkGraph | null>;
  sceneRef: React.MutableRefObject<WorldScene | null>;
  fogVisibleCellsRef: React.MutableRefObject<Set<string>>;
  combatSquadsRef: React.MutableRefObject<TacticalSquadUnit[]>;
  radioAlertIdsRef: React.MutableRefObject<Set<string>>;
  selectedBuilding: BuildingPolygon | null;
  selectedSquadId: string | null;
  selectedVehicleId: string | null;
  selectedResourceNode: ResourceNode | null;
  isScavengeViewActive: boolean;
  scavengeFilterType: string | null;
  showStreetLabels: boolean;
  showSatelliteOverlay: boolean;
  labelDetailMode: 'detailed' | 'minimal';
  showBuildingEdges: boolean;
  isRadioModalOpen: boolean;
  isResearchModalOpen: boolean;
  isNewGameModalOpen: boolean;
  isSaveLoadModalOpen: boolean;
  isPauseMenuOpen: boolean;
  isCodexModalOpen: boolean;
  isSettingsModalOpen: boolean;
  isCreditsModalOpen: boolean;
  isCaravansModalOpen: boolean;
  isFreestandingModalOpen: boolean;
  isPopulationModalOpen: boolean;
  isSquadModalOpen: boolean;
  isMedbayModalOpen: boolean;
  isVehicleModalOpen: boolean;
  isMoraleModalOpen: boolean;
  isWeatherModalOpen: boolean;
  isAudioModalOpen: boolean;
  isCelebrationModalOpen: boolean;
  activeRecruitmentGroup: HiddenSurvivorGroup | null;
  activeRansomHideoutId: string | number | null;
  overrunSettlement: SettlementRecord | null;
  caravans: TradeCaravan[];
  settlements: Record<string, SettlementRecord>;
  activeSettlementId: string;
  setGameClock: React.Dispatch<React.SetStateAction<GameClockState>>;
  setCombatSquads: React.Dispatch<React.SetStateAction<TacticalSquadUnit[]>>;
  setSelectedResourceNode: React.Dispatch<React.SetStateAction<ResourceNode | null>>;
  setSettlement: React.Dispatch<React.SetStateAction<SettlementState>>;
  setSettlements: React.Dispatch<React.SetStateAction<Record<string, SettlementRecord>>>;
  setCaravans: React.Dispatch<React.SetStateAction<TradeCaravan[]>>;
  setToastMessage: (msg: ToastMessage | null) => void;
  radioDirectiveState: RadioDirectiveState;
  setRadioDirectiveState: React.Dispatch<React.SetStateAction<RadioDirectiveState>>;
  setActiveRadioTransmission: React.Dispatch<React.SetStateAction<RadioTransmission | null>>;
  setIsRadioModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setZombies: React.Dispatch<React.SetStateAction<ZombieUnit[]>>;
  addTacticalAlert: (title: string, desc: string, type: 'danger' | 'warn' | 'info' | 'success', onClick?: () => void) => void;
}

export interface WorldEffectsOutput {
  isInitialCommsPending: boolean;
  isHQSelectionUnlocked: boolean;
}

/**
 * Standalone world-state effects that previously lived at the top of App:
 * scene view-layer sync, pause-modal handling, Web Audio lifecycle, per-entity
 * selection sounds, tactical squad roster sync, resource gathering, road/path
 * grid sync, ambient spawns, settlement/weather/morale simulation, radio
 * directive loop and inter-colony caravan loop. Pure side-effect band — no UI.
 */
export function useWorldEffects(runtime: WorldEffectsRuntime): WorldEffectsOutput {
  const {
    viewMode,
    isDescentActive,
    mapData,
    gameClock,
    gameClockRef,
    mapDataRef,
    settlement,
    settlementRef,
    zombies,
    zombiesRef,
    isAlarmActive,
    pathGridRef,
    roadGraphRef,
    sceneRef,
    fogVisibleCellsRef,
    combatSquadsRef,
    radioAlertIdsRef,
    selectedBuilding,
    selectedSquadId,
    selectedVehicleId,
    selectedResourceNode,
    isScavengeViewActive,
    scavengeFilterType,
    showStreetLabels,
    showSatelliteOverlay,
    labelDetailMode,
    showBuildingEdges,
    isRadioModalOpen,
    isResearchModalOpen,
    isNewGameModalOpen,
    isSaveLoadModalOpen,
    isPauseMenuOpen,
    isCodexModalOpen,
    isSettingsModalOpen,
    isCreditsModalOpen,
    isCaravansModalOpen,
    isFreestandingModalOpen,
    isPopulationModalOpen,
    isSquadModalOpen,
    isMedbayModalOpen,
    isVehicleModalOpen,
    isMoraleModalOpen,
    isWeatherModalOpen,
    isAudioModalOpen,
    isCelebrationModalOpen,
    activeRecruitmentGroup,
    activeRansomHideoutId,
    overrunSettlement,
    caravans,
    settlements,
    activeSettlementId,
    setGameClock,
    setCombatSquads,
    setSelectedResourceNode,
    setSettlement,
    setSettlements,
    setCaravans,
    setToastMessage,
    radioDirectiveState,
    setRadioDirectiveState,
    setActiveRadioTransmission,
    setIsRadioModalOpen,
    setZombies,
    addTacticalAlert,
  } = runtime;

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
      // Worker stride/harvest animation cadence scales with clock speed so limbs
      // keep pace with the speed-scaled ground movement (no slow-motion at 2x/4x).
      sceneRef.current.setClockSpeed(gameClock.speed);
    }
  }, [gameClock.speed]);

  // While a strategic time-out modal is open (Radio communications or the
  // Research tree) the game pauses automatically, and returns to whichever speed
  // was set beforehand once the modal is closed / confirmed. If both open at
  // once, the speed is only restored after they have all closed.
  const modalPauseRef = useRef<0 | 1 | 2 | 4 | null>(null);
  useEffect(() => {
    const anyOpen = isRadioModalOpen || isResearchModalOpen;
    if (anyOpen) {
      if (modalPauseRef.current === null) {
        modalPauseRef.current = gameClockRef.current.speed;
        setGameClock((c) => (c.speed === 0 ? c : { ...c, speed: 0 }));
      }
    } else if (modalPauseRef.current !== null) {
      const restore = modalPauseRef.current;
      modalPauseRef.current = null;
      setGameClock((c) => ({ ...c, speed: restore }));
    }
  }, [isRadioModalOpen, isResearchModalOpen]);

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

  // (Toast sound + auto-dismiss are handled per-toast inside pushToast, so the
  // queue keeps each item on its own timer and they stack instead of replacing.)

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
        const idle = tickResourceGathering(st, md, 0, isNight, isAlarmActive, pathGridRef.current);
        settlementRef.current = idle.newState;
        mapDataRef.current = idle.mapData;
        setSettlement(idle.newState);
        sceneRef.current?.updateResourceAmounts(idle.mapData.resourceNodes);
        return;
      }
      const result = tickResourceGathering(st, md, dt, isNight, isAlarmActive, pathGridRef.current);
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

  // Apply player-built freestanding structures (walls, fences, towers) to the
  // squad path grid so squads route around new construction instead of walking
  // through it. Re-runs when the map (grid rebuilt) or the freestanding list
  // changes; gates stay open as the intended way through a fence line.
  useEffect(() => {
    pathGridRef.current?.setFreestandingObstacles(settlement.freestandingBuildings);
  }, [mapData, settlement.freestandingBuildings]);

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
          tickSettlementSimulation(prev, simDelta, pathGridRef.current, gameClock.isNight);
        const withResearch = tickResearchSimulation(newState, 1.0, gameClock.speed, gameClock.isNight);
        
        const currentWeatherState = prev.weather || createInitialWeatherState(gameClock.day);
        // 1 in-game hour per 25 real seconds -> a day is 10 minutes at 1x.
        const deltaInGameHours = (1.0 * gameClock.speed) / 25;
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
  }, [viewMode, isDescentActive, mapData, gameClock.speed, gameClock.day, gameClock.isNight, activeSettlementId]);

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



  return { isInitialCommsPending, isHQSelectionUnlocked };
}
