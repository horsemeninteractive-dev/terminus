import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { getMapFromCache, saveMapToCache } from '../services/mapCache';
import { getBundledMapData } from '../services/bundledMapData';
import { fetchFromOverpass } from '../services/osmFetcher';
import { fetchElevationGrid } from '../services/elevationService';
import { processOsmData, recategorizeBuilding } from '../services/mapProcessor';
import { generateHiddenGroupsForMap } from '../services/populationService';
import { getPrimaryHQ } from '../services/buildingOperational';
import { generateWorldVehicles } from '../services/vehicleService';
import { ensureBuildingSearchStates, } from '../services/scavengingService';
import { createInitialSettlementState } from '../services/settlementService';
import { getInitialRadioDirectiveState } from '../services/radioDirectiveService';
import { dispatchCaravan } from '../services/caravanService';
import { LOCATION_PRESETS } from '../data/sampleMapData';
import { ToastMessage } from '../services/soundService';
import type { BuildingPolygon, LocationPreset, MapData, SettlementPlacement } from '../types/map';
import type { CaravanDispatchConfig, SettlementRecord, TradeCaravan } from '../types/caravan';
import type { GameScenarioSettings } from '../types/saveGame';
import type { GameClockState, ZombieUnit } from '../types/combat';
import type { SettlementState } from '../types/settlement';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import type { WorldScene } from '../render/WorldScene';
import { RoadNetworkGraph } from '../services/roadPathfinder';
import { PathGrid } from '../services/pathfindingService';

/**
 * Per-colony random seed so world vehicle placements differ between
 * playthroughs instead of every game spawning the fleet at the same spots
 * (the previous hard-coded seed 42).
 */
const freshWorldSeed = () => Math.floor(Math.random() * 1e9);

/**
 * Runtime dependencies for the map-pipeline & colony-flow handlers, extracted
 * from App.tsx so the component no longer owns the loading logic.
 */
export interface MapLoadingRuntime {
  // Read state
  settlements: Record<string, SettlementRecord>;
  activeSettlementId: string;
  settlement: SettlementState;
  mapData: MapData | null;
  zombies: ZombieUnit[];
  gameClock: GameClockState;
  viewMode: 'start_screen' | 'intro' | 'main_menu' | 'globe' | 'world';
  setViewMode: Dispatch<SetStateAction<'start_screen' | 'intro' | 'main_menu' | 'globe' | 'world'>>;
  // Refs
  abortControllerRef: MutableRefObject<AbortController | null>;
  roadGraphRef: MutableRefObject<RoadNetworkGraph | null>;
  pathGridRef: MutableRefObject<PathGrid | null>;
  settlementRef: MutableRefObject<SettlementState>;
  /** Sim-owned map — carries the live resource-node depletion of this colony. */
  mapDataRef: MutableRefObject<MapData | null>;
  sceneRef: MutableRefObject<WorldScene | null>;
  descentTimerRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
  stopDescentTimer: () => void;
  // Setters
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setMapData: Dispatch<SetStateAction<MapData | null>>;
  setPendingAdaptType: Dispatch<SetStateAction<string | null>>;
  setLoadingMessage: Dispatch<SetStateAction<string>>;
  setCacheSource: Dispatch<SetStateAction<string>>;
  setDescentProgress: Dispatch<SetStateAction<number>>;
  setDescentAltitudeKm: Dispatch<SetStateAction<number>>;
  setIsDescentActive: Dispatch<SetStateAction<boolean>>;
  setSettlement: Dispatch<SetStateAction<SettlementState>>;
  setActiveSettlementId: Dispatch<SetStateAction<string>>;
  setActivePlacement: Dispatch<SetStateAction<SettlementPlacement | null>>;
  setSelectedBuilding: Dispatch<SetStateAction<BuildingPolygon | null>>;
  setHoveredBuilding: Dispatch<SetStateAction<BuildingPolygon | null>>;
  setClickedPosition: Dispatch<SetStateAction<{ x: number; z: number } | null>>;
  setSelectedSquadId: Dispatch<SetStateAction<string | null>>;
  setSelectedVehicleId: Dispatch<SetStateAction<string | null>>;
  setCurrentPreset: Dispatch<SetStateAction<LocationPreset>>;
  setZombies: Dispatch<SetStateAction<ZombieUnit[]>>;
  setCaravans: Dispatch<SetStateAction<TradeCaravan[]>>;
  setSettlements: Dispatch<SetStateAction<Record<string, SettlementRecord>>>;
  setRadioDirectiveState: Dispatch<SetStateAction<RadioDirectiveState>>;
  setActiveRadioTransmission: Dispatch<SetStateAction<RadioTransmission | null>>;
  setToastMessage: (msg: ToastMessage | null) => void;
  setIsCaravansModalOpen: Dispatch<SetStateAction<boolean>>;
}

/**
 * The map-loading pipeline (cache → bundled → live Overpass+DEM, with
 * bundled fallback) plus the colony-flow handlers that trigger it: founding a
 * settlement from the globe, the atmospheric-descent loader, switching between
 * existing colonies, and dispatching trade caravans.
 */
export function useMapLoading(runtime: MapLoadingRuntime) {
  const {
    settlements,
    activeSettlementId,
    settlement,
    mapData,
    zombies,
    gameClock,
    viewMode,
    setViewMode,
    abortControllerRef,
    roadGraphRef,
    pathGridRef,
    settlementRef,
    mapDataRef,
    sceneRef,
    descentTimerRef,
    stopDescentTimer,
    setIsLoading,
    setLoadError,
    setMapData,
    setPendingAdaptType,
    setLoadingMessage,
    setCacheSource,
    setDescentProgress,
    setDescentAltitudeKm,
    setIsDescentActive,
    setSettlement,
    setActiveSettlementId,
    setActivePlacement,
    setSelectedBuilding,
    setHoveredBuilding,
    setClickedPosition,
    setSelectedSquadId,
    setSelectedVehicleId,
    setCurrentPreset,
    setZombies,
    setCaravans,
    setSettlements,
    setRadioDirectiveState,
    setActiveRadioTransmission,
    setToastMessage,
    setIsCaravansModalOpen,
  } = runtime;

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
            if (cached.buildings) {
              for (const b of cached.buildings) {
                b.type = recategorizeBuilding(b);
              }
            }
            setMapData(cached);
            setCacheSource('IndexedDB Local Cache');
            setLoadingMessage('Preparing settlement & tactical grid...');
            setDescentProgress((p) => Math.max(p, 0.3));
            setIsLoading(false);
            // Yield so the loading overlay paints the new status line before the
            // (heavy) settlement prep below blocks the main thread again.
            await new Promise((r) => setTimeout(r, 0));

            setSettlement((prev) => {
              const prepared = ensureBuildingSearchStates(prev, cached.buildings, prev.scavengingResourceMultiplier);
              if (prepared.hiddenGroups.size === 0) {
                const groups = generateHiddenGroupsForMap(cached.buildings, getPrimaryHQ(prev)?.buildingId);
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
            const prepared = ensureBuildingSearchStates(prev, bundled.buildings, prev.scavengingResourceMultiplier);
            // Re-roll groups only for a fresh colony; preserve existing ones.
            const groups = prepared.hiddenGroups.size === 0
              ? generateHiddenGroupsForMap(bundled.buildings, getPrimaryHQ(prepared)?.buildingId)
              : prepared.hiddenGroups;
            const initialVehicles = prev.vehicles.length === 0
              ? generateWorldVehicles(bundled, freshWorldSeed())
              : prev.vehicles;
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
          60000
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
        const prepared = ensureBuildingSearchStates(prev, processed.buildings, prev.scavengingResourceMultiplier);
        // Re-roll groups only for a fresh colony; preserve existing ones.
        const groups = prepared.hiddenGroups.size === 0
          ? generateHiddenGroupsForMap(processed.buildings, getPrimaryHQ(prepared)?.buildingId)
          : prepared.hiddenGroups;
        const initialVehicles = prev.vehicles.length === 0
          ? generateWorldVehicles(processed, freshWorldSeed())
          : prev.vehicles;
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
              const prepared = ensureBuildingSearchStates(prev, bundled.buildings, prev.scavengingResourceMultiplier);
              // Re-roll groups only for a fresh colony; preserve existing ones.
              const groups = prepared.hiddenGroups.size === 0
                ? generateHiddenGroupsForMap(bundled.buildings, getPrimaryHQ(prepared)?.buildingId)
                : prepared.hiddenGroups;
              const initialVehicles = prev.vehicles.length === 0
                ? generateWorldVehicles(bundled, freshWorldSeed())
                : prev.vehicles;
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

    // Save previous active colony state and append new one. Only preserve the
    // previous colony when it actually exists in the registry — on a NEW GAME the
    // registry was cleared, so the stale active id has no record and writing one
    // here would produce a placement-less entry that crashes the globe beacons.
    setSettlements((prev) => {
      const next: Record<string, SettlementRecord> = {
        ...prev,
        [newId]: newRecord,
      };
      if (prev[activeSettlementId]) {
        next[activeSettlementId] = {
          ...prev[activeSettlementId],
          state: settlement,
          // Cache the sim-owned map so node depletion survives the switch away.
          cachedMapData: mapDataRef.current || mapData || undefined,
          cachedZombies: zombies,
        };
      }
      return next;
    });

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
        // Fresh colony: roll groups + vehicle placements randomly this game.
        const groups = prepared.hiddenGroups.size === 0
          ? generateHiddenGroupsForMap(preloadedMapData.buildings, getPrimaryHQ(prepared)?.buildingId)
          : prepared.hiddenGroups;
        const initialVehicles = prev.vehicles.length === 0
          ? generateWorldVehicles(preloadedMapData, freshWorldSeed())
          : prev.vehicles;
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
    const updatedSettlements: Record<string, SettlementRecord> = { ...settlements };
    if (updatedSettlements[activeSettlementId]) {
      updatedSettlements[activeSettlementId] = {
        ...updatedSettlements[activeSettlementId],
        state: settlement,
        // Cache the sim-owned map so node depletion survives the switch away.
        cachedMapData: mapDataRef.current || mapData || undefined,
        cachedZombies: zombies,
      };
    }
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
      const currentSettlements: Record<string, SettlementRecord> = { ...settlements };
      if (currentSettlements[activeSettlementId]) {
        currentSettlements[activeSettlementId] = {
          ...currentSettlements[activeSettlementId],
          state: settlement,
        };
      }

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

  return {
    loadLocation,
    handleConfirmSettlementPlacement,
    handleBeginDescent,
    handleSelectExistingSettlement,
    handleDispatchCaravan,
  };
}