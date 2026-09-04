import React, { useEffect, useRef } from 'react';
import { syncTacticalSquadUnits, generateAmbientMapZombies } from '../services/combatService';
import { getPrimaryHQ } from '../services/buildingOperational';
import { createFogGrid, markExploredCells, discoverGroupsInVision, discoverThreatsInVision } from '../services/fogOfWarService';
import { generateRivalHideouts, generateZombieLairs } from '../services/rivalFactionService';
import { updateRadioDirectiveSystem } from '../services/radioDirectiveService';
import {
  applyMissionRewards,
  reconcileMissionSnapshot,
  updateMissionSystem,
} from '../services/missionService';
import { enqueueTransmissions } from '../services/transmissionService';
import { calculateGlobalNetworkStats, tickCaravansSimulation } from '../services/caravanService';
import {
  evaluateSettlementLoss,
  markSettlementDestroyed,
} from '../services/settlementLifecycleService';
import { simulateSettlementOffline } from '../services/offlineSettlementService';
import { RoadNetworkGraph } from '../services/roadPathfinder';
import { PathGrid } from '../services/pathfindingService';
import { soundService, ToastMessage } from '../services/soundService';
import type { AppViewMode } from '../App';
import type { WorldScene } from '../render/WorldScene';
import type { GameClockState, ZombieUnit, TacticalSquadUnit } from '../types/combat';
import type { SettlementState } from '../types/settlement';
import type { ScavengeLootFilter } from '../components/TacticalMinimapWidget';
import type { MapData, ResourceNode, BuildingPolygon } from '../types/map';
import type { HiddenSurvivorGroup } from '../types/population';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import type { MissionState } from '../types/mission';
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
  fogVisibleCellsRef: React.MutableRefObject<Set<number>>;
  combatSquadsRef: React.MutableRefObject<TacticalSquadUnit[]>;
  radioAlertIdsRef: React.MutableRefObject<Set<string>>;
  lairDiscoveryAlertIdsRef: React.MutableRefObject<Set<string>>;
  selectedBuilding: BuildingPolygon | null;
  selectedSquadId: string | null;
  selectedVehicleId: string | null;
  selectedResourceNode: ResourceNode | null;
  isScavengeViewActive: boolean;
  scavengeFilterType: ScavengeLootFilter;
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
  setOverrunSettlement: React.Dispatch<React.SetStateAction<SettlementRecord | null>>;
  setIsExtinct: React.Dispatch<React.SetStateAction<boolean>>;
  setCaravans: React.Dispatch<React.SetStateAction<TradeCaravan[]>>;
  setToastMessage: (msg: ToastMessage | null) => void;
  radioDirectiveState: RadioDirectiveState;
  setRadioDirectiveState: React.Dispatch<React.SetStateAction<RadioDirectiveState>>;
  setActiveRadioTransmission: React.Dispatch<React.SetStateAction<RadioTransmission | null>>;
  setIsRadioModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  missionState: MissionState;
  setMissionState: React.Dispatch<React.SetStateAction<MissionState>>;
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
    lairDiscoveryAlertIdsRef,
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
    setOverrunSettlement,
    setIsExtinct,
    setCaravans,
    setToastMessage,
    radioDirectiveState,
    setRadioDirectiveState,
    setActiveRadioTransmission,
    setIsRadioModalOpen,
    missionState,
    setMissionState,
    setZombies,
    addTacticalAlert,
  } = runtime;

  const isInitialCommsPending =
    !getPrimaryHQ(settlement) &&
    (radioDirectiveState.activeDirectives?.length || 0) === 0 &&
    (radioDirectiveState.completedDirectiveIds?.length || 0) === 0;

  const isHQSelectionUnlocked =
    Boolean(getPrimaryHQ(settlement)) ||
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

  // Reflect the settlement's simulated weather in the 3D world: rain, snow,
  // cloud cover, lightning, moon phase and weather-tinted fog/lighting.
  useEffect(() => {
    if (sceneRef.current && settlement.weather) {
      sceneRef.current.setWeather(
        settlement.weather.currentWeather,
        settlement.weather.moonPhase
      );
    }
  }, [
    settlement.weather?.currentWeather,
    settlement.weather?.moonPhase,
    settlement.weather?.currentSeason,
  ]);

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
  }, [settlement.squads, getPrimaryHQ(settlement)]);

  useEffect(() => {
    if (!selectedResourceNode || !mapData) return;
    const latest = mapData.resourceNodes.find(n => n.id === selectedResourceNode.id);
    if (latest && latest.amount !== selectedResourceNode.amount) setSelectedResourceNode(latest);
  }, [mapData, selectedResourceNode]);

  // (Resource gathering now runs inside the authoritative 100ms simulation
  // pipeline, so there is no dedicated gatherer interval here; the pipeline's
  // mapData result is committed to mapDataRef and the scene by that loop.)

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

  // Spawn initial ambient dormant zombies when map data or HQ is updated.
  // Lair-affiliated zombies (the seeded interior population and local pressure
  // groups) survive the refresh — without that, re-entering world view would
  // wipe a standing lair's infected and instantly "clear" it on the next tick.
  useEffect(() => {
    if (viewMode === 'world' && mapData && mapData.buildings && mapData.buildings.length > 0) {
      const hqPos = getPrimaryHQ(settlement)?.center || null;
      const lairs = settlementRef.current.zombieLairs;
      setZombies((z) => [
        ...z.filter((zz) => zz.lairId),
        ...generateAmbientMapZombies(mapData.buildings, hqPos, gameClock.day, lairs),
      ]);
    }
  }, [viewMode, (mapData as any)?.id, getPrimaryHQ(settlement)?.buildingId]);

  // Seed rival-faction Hideouts & zombie Lairs onto the local map (§5.2)
  useEffect(() => {
    if (viewMode !== 'world' || !mapData || mapData.buildings.length === 0) return;
    const hqId = getPrimaryHQ(settlement)?.buildingId ?? null;
    // Hideouts — plain settlement-record seeding.
    if ((settlementRef.current.rivalHideouts?.size ?? 0) === 0) {
      setSettlement((prev) =>
        (prev.rivalHideouts?.size ?? 0) === 0
          ? { ...prev, rivalHideouts: generateRivalHideouts(mapData.buildings, hqId) }
          : prev
      );
    }
    // Lairs — seed the settlement record AND the lair's real infected
    // population into the live zombie list. Generation runs OUTSIDE the
    // updater so the seeded units are one stable set; the append is idempotent
    // (safe under strict-mode double invocation). Nest count is data-driven:
    // map size × scenario intensity × colony population × outbreak day (see
    // computeLairTargetCount) — not a flat 1–2 coin flip.
    if ((settlementRef.current.zombieLairs?.size ?? 0) === 0) {
      const colonyPopulation =
        (settlement.namedSurvivors?.length || 0) +
        (typeof settlement.generalPopulation === 'number'
          ? settlement.generalPopulation
          : settlement.generalPopulation?.total || 0);
      const result = generateZombieLairs(mapData.buildings, hqId, {
        mapRadiusM: mapData.radius,
        colonyPopulation,
        day: gameClock.day || 1,
        aggression: settlement.scenarioSettings?.zombieAggression,
        hordesLevel: settlement.scenarioSettings?.hordesLevel,
      });
      setSettlement((prev) =>
        (prev.zombieLairs?.size ?? 0) === 0 ? { ...prev, zombieLairs: result.lairs } : prev
      );
      setZombies((z) => {
        const existing = new Set(z.map((zz) => zz.id));
        return [...z, ...result.seededZombies.filter((zz) => !existing.has(zz.id))];
      });
    }
  }, [viewMode, (mapData as any)?.id, getPrimaryHQ(settlement)?.buildingId]);

  // Advance inactive colonies with the same core economy systems using a
  // bounded lightweight offline step. Active settlement remains on the full
  // world simulation below.
  useEffect(() => {
    if (viewMode !== 'world' || isDescentActive) return;
    const interval = setInterval(() => {
      setSettlements((registry) => {
        const now = Date.now();
        let changed = false;
        const next = { ...registry };
        for (const [id, record] of Object.entries(registry) as [string, SettlementRecord][]) {
          if (id === activeSettlementId) continue;
          const elapsed = Math.max(0, (now - (record as any).lastSimulatedAt) / 1000);
          if (elapsed < 60) continue;
          // Run catch-up against the colony's cached map so its gatherers keep
          // depleting (and never resurrect) harvested resource nodes. The live
          // universal clock is passed so the colony resumes at its real phase
          // (day/night) and the catch-up rolls its clock through the elapsed
          // span — inactive colonies genuinely experience night, not a frozen
          // noon.
          const sim = simulateSettlementOffline(
            record.state,
            elapsed,
            gameClock.day,
            record.cachedMapData,
            gameClockRef.current ?? gameClock
          );
          next[id] = {
            ...record,
            state: sim.state,
            cachedMapData: sim.mapData || record.cachedMapData,
            lastSimulatedAt: now,
          } as any;
          changed = true;
        }
        return changed ? next : registry;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [viewMode, isDescentActive, activeSettlementId, gameClock.day]);

  // Settlement Fog-of-War, Discovery & Multi-Settlement Registry Sync (Every 1 second) (§3.5, §4.4, §5.2, §7.5)
  //
  // NOTE: the economy (construction/research/weather/morale) is NOT recomputed
  // here — it runs inside the authoritative 100ms pipeline in useSimulationLoop,
  // which also emits the construction/deconstruction completion toasts via
  // pipeline events. This interval only applies presentation-layer state that
  // derives from the already-committed settlement (fog marking, vision-based
  // survivor/hideout/lair discovery) and keeps the settlements registry in sync.
  useEffect(() => {
    if (viewMode !== 'world' || isDescentActive || !mapData) return;
    const interval = setInterval(() => {
      setSettlement((prev) => {
        // Persist fog-of-war exploration & survivor-group discovery (§3.5, §4.4).
        // The visible-cell set is refreshed by the 100ms combat tick.
        let finalSettlementState = settlementRef.current || prev;
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
                // The discovery moment: the moment a squad's vision first lands
                // on an unknown nest, surface it loudly — a toast, a tactical
                // alert, a zombie growl, and the world marker appears (the
                // renderer only draws lairs once isDiscovered flips). Deduped
                // so React strict mode never double-fires the feedback.
                const lairIdStr = String(id);
                if (!lairDiscoveryAlertIdsRef.current.has(lairIdStr)) {
                  lairDiscoveryAlertIdsRef.current.add(lairIdStr);
                  setToastMessage({
                    title: 'LAIR DISCOVERED',
                    desc: `${lair.buildingName} is an infected nest — ${lair.population}+ infected shelter inside. Assault it to clear the neighbourhood.`,
                    type: 'danger',
                  });
                  addTacticalAlert(
                    'LAIR DISCOVERED',
                    `${lair.buildingName} is an infected nest (${lair.population}+ infected). Kill every one of them to clear it.`,
                    'danger'
                  );
                  soundService.playZombieSound('brute');
                }
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

        // §7.5 Settlement lifecycle: an established colony is LOST when its
        // command center is breached (HQ durability 0) or every survivor has
        // fallen. Loss is a campaign setback — never a game over: the other
        // colonies, a relief caravan, or local reclamation decide the future.
        setSettlements((currentRegistry) => {
          const record = currentRegistry[activeSettlementId];
          const liveState = settlementRef.current;
          if (!record || !liveState) return currentRegistry;
          if (record.status !== 'operational') return currentRegistry;
          const evalResult = evaluateSettlementLoss(liveState);
          if (!evalResult.destroyed) return currentRegistry;

          const destroyedRecord = markSettlementDestroyed(
            record,
            gameClockRef.current?.day ?? 1,
            evalResult.reason || 'Colony lost',
            liveState
          );
          setOverrunSettlement(destroyedRecord);
          setToastMessage({
            title: 'SETTLEMENT LOST',
            desc: `${record.name} has fallen — ${evalResult.reason} The campaign continues.`,
            type: 'danger',
          });
          soundService.playHordeWarning();
          const stats = calculateGlobalNetworkStats(
            { ...currentRegistry, [activeSettlementId]: destroyedRecord },
            caravans
          );
          setIsExtinct(stats.isExtinct);
          return { ...currentRegistry, [activeSettlementId]: destroyedRecord };
        });

        return finalSettlementState;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [viewMode, isDescentActive, mapData, activeSettlementId, caravans]);

  // Safe Zones Operations Radio Directive System Evaluation Loop (§TERMINUS PROTOCOL)
  // + Campaign mission engine tick (TRIGGER → TRANSMISSION → RESPONSE → MISSION).
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

      // Campaign mission engine — derives events from the world snapshot,
      // fires triggers, queues briefing transmissions (never missions
      // directly), evaluates active mission tasks, applies rewards.
      const curSettlement = settlementRef.current || settlement;
      const curClock = gameClockRef.current || gameClock;
      const ctx = {
        mapData,
        caravans,
        settlements: Object.values(settlements || {}).map((s) => ({
          id: s.id,
          name: s.name,
        })),
      };
      setMissionState((prevMission) => {
        const result = updateMissionSystem(prevMission, curSettlement, curClock, ctx);
        if (result.newTransmissions.length > 0) {
          setRadioDirectiveState((prevRadio) =>
            enqueueTransmissions(prevRadio, result.newTransmissions)
          );
          for (const tx of result.newTransmissions) {
            if (radioAlertIdsRef.current.has(tx.id)) continue;
            radioAlertIdsRef.current.add(tx.id);
            soundService.playRadioChirp();
            addTacticalAlert(
              `RADIO: ${tx.classification}`,
              `${tx.callsign}: ${tx.title}`,
              tx.priority === 'critical'
                ? 'danger'
                : tx.priority === 'high'
                ? 'warn'
                : 'info',
              () => {
                setActiveRadioTransmission(tx);
                setIsRadioModalOpen(true);
              }
            );
          }
        }
        if (result.rewards) {
          setSettlement((prev) => applyMissionRewards(prev, result.rewards!));
        }
        return result.newState;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [
    viewMode,
    isDescentActive,
    Boolean(mapData),
    addTacticalAlert,
    caravans,
    settlements,
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
