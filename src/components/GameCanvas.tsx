import React, { useEffect, useRef } from 'react';
import { BuildingPolygon, MapData, Point2D } from '../types/map';
import { AdaptedBuilding, SettlementState } from '../types/settlement';
import { WorldScene } from '../render/WorldScene';

interface GameCanvasProps {
  mapData: MapData | null;
  settlement?: SettlementState | null;
  pendingFreestandingType?: import('../types/settlement').FunctionalBuildingTypeId | null;
  clockHour?: number;
  elevationExaggeration: number;
  disableElevation?: boolean;
  showTerrainWireframe: boolean;
  showBuildingEdges: boolean;
  showBuildings: boolean;
  showRoads: boolean;
  showWood: boolean;
  showMetal: boolean;
  showBricks: boolean;
  showLanduse: boolean;
  showSatelliteOverlay?: boolean;
  satelliteQuality?: import('../types/saveGame').SatelliteQuality;
  selectedSquadId?: string | null;
  selectedVehicleId?: string | null;
  onSelectBuilding: (building: BuildingPolygon | null) => void;
  onHoverBuilding: (building: BuildingPolygon | null) => void;
  onSelectPosition: (pos: Point2D, rotationDeg?: number) => void;
  onSelectSquad?: (squadId: string | null) => void;
  onOrderSquadMove?: (squadId: string, pos: Point2D, targetBuildingId?: string | number, targetBuildingName?: string) => void;
  onOrderSquadAttack?: (squadId: string, zombieId: string) => void;
  onSelectVehicle?: (vehicleId: string | null) => void;
  onMountVehicle?: (squadId: string, vehicleId: string) => void;
  onSceneReady?: (scene: WorldScene) => void;
  onMapRendered?: () => void;
  onLoadProgress?: (progress: number, label?: string) => void;
  onSelectResourceNode?: (node: any) => void;
  onPlaceFreestandingRun?: (typeId: import('../types/settlement').FunctionalBuildingTypeId, placements: import('../render/WorldScene').FreestandingPlacementPoint[]) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  mapData,
  settlement,
  pendingFreestandingType,
  clockHour = 8,
  elevationExaggeration,
  disableElevation = false,
  showTerrainWireframe,
  showBuildingEdges,
  showBuildings,
  showRoads,
  showWood,
  showMetal,
  showBricks,
  showLanduse,
  showSatelliteOverlay = false,
  satelliteQuality = 'balanced',
  selectedSquadId,
  selectedVehicleId,
  onSelectBuilding,
  onHoverBuilding,
  onSelectPosition,
  onSelectSquad,
  onOrderSquadMove,
  onOrderSquadAttack,
  onSelectVehicle,
  onMountVehicle,
  onSceneReady,
  onMapRendered,
  onLoadProgress,
  onSelectResourceNode,
  onPlaceFreestandingRun,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<WorldScene | null>(null);
  const mapKey = mapData ? `${(mapData as any).id || ''}_${mapData.center?.lat}_${mapData.center?.lon}` : null;
  // Stable refs so the build effect below never restarts when the callbacks change identity.
  const loadProgressRef = useRef(onLoadProgress);
  loadProgressRef.current = onLoadProgress;
  const mapRenderedRef = useRef(onMapRendered);
  mapRenderedRef.current = onMapRendered;
  const handlersRef = useRef<any>({
    onSelectBuilding,
    onHoverBuilding,
    onSelectPosition,
    onSelectSquad,
    onOrderSquadMove,
    onOrderSquadAttack,
    onSelectVehicle,
    onMountVehicle,
  });
  handlersRef.current = {
    onSelectBuilding,
    onHoverBuilding,
    onSelectPosition,
    onSelectSquad,
    onOrderSquadMove,
    onOrderSquadAttack,
    onSelectVehicle,
    onMountVehicle,
    onPlaceFreestandingRun,
  };

  useEffect(() => {
    if (!containerRef.current || !mapKey) return;

    const scene = new WorldScene({
      container: containerRef.current,
      onSelectBuilding: (value) => handlersRef.current.onSelectBuilding?.(value),
      onHoverBuilding: (value) => handlersRef.current.onHoverBuilding?.(value),
      onSelectPosition: ((value: Point2D, rotationDeg?: number) => handlersRef.current.onSelectPosition?.(value, rotationDeg)) as any,
      onSelectSquad: (value) => handlersRef.current.onSelectSquad?.(value),
      onOrderSquadMove: (id, pos, bldgId, bldgName) =>
        handlersRef.current.onOrderSquadMove?.(id, pos, bldgId, bldgName),
      onOrderSquadAttack: (id, value) => handlersRef.current.onOrderSquadAttack?.(id, value),
      onSelectVehicle: (value) => handlersRef.current.onSelectVehicle?.(value),
      onMountVehicle: (id, value) => handlersRef.current.onMountVehicle?.(id, value),
      onPlaceFreestandingRun: (typeId, placements) =>
        handlersRef.current.onPlaceFreestandingRun?.(typeId, placements),
    });

    sceneRef.current = scene;
    onSceneReady?.(scene);

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [mapKey]);

  // Build the world scene when map data is ready. The build runs progressively
  // (yielding between chunks) and reports real progress so the loading screen
  // stays animated; only once the scene has fully rendered do we reveal it.
  useEffect(() => {
    if (!sceneRef.current || !mapData || !mapKey) return;
    let cancelled = false;
    (async () => {
      try {
        await sceneRef.current!.loadMapData(
          mapData,
          showBuildingEdges,
          elevationExaggeration,
          settlement?.hq?.buildingId || null,
          settlement?.adaptedBuildings || new Map(),
          settlement?.freestandingBuildings || [],
          settlement?.demolishedBuildings || new Map(),
          disableElevation,
          (progress, label) => loadProgressRef.current?.(progress, label)
        );
        sceneRef.current!.setWireframe(showTerrainWireframe);
      } finally {
        if (!cancelled) {
          requestAnimationFrame(() => requestAnimationFrame(() => mapRenderedRef.current?.()));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    mapKey,
    showBuildingEdges,
    elevationExaggeration,
    disableElevation,
  ]);

  // Disable elevation toggle
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setDisableElevation(disableElevation);
    }
  }, [disableElevation]);

  // Update settlement buildings overlay when settlement state changes
  useEffect(() => {
    if (sceneRef.current && settlement) {
      sceneRef.current.updateSettlementBuildings(
        settlement.hq?.buildingId || null,
        settlement.adaptedBuildings,
        settlement.freestandingBuildings,
        settlement.hiddenGroups,
        settlement.deconstructionJobs,
        settlement.demolishedBuildings
      );
    }
  }, [
    settlement?.hq?.buildingId,
    settlement?.adaptedBuildings,
    settlement?.freestandingBuildings,
    settlement?.hiddenGroups,
    settlement?.deconstructionJobs,
    settlement?.demolishedBuildings,
  ]);

  // Wireframe toggle
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setWireframe(showTerrainWireframe);
    }
  }, [showTerrainWireframe]);

  // Synchronize armed freestanding blueprint ghost preview to 3D world scene
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setPendingFreestandingType(pendingFreestandingType || null);
    }
  }, [pendingFreestandingType]);

  // Synchronize currently selected squad to 3D world scene
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setSelectedSquadId(selectedSquadId || null);
    }
  }, [selectedSquadId]);

  // Synchronize currently selected vehicle to 3D world scene
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setSelectedVehicleId(selectedVehicleId || null);
    }
  }, [selectedVehicleId]);

  // Continuously drive the day/night lighting from the clock hour
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setClockTime(clockHour);
    }
  }, [clockHour]);

  // Visibility toggles
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.buildingRenderer.setVisible(showBuildings);
      sceneRef.current.buildingRenderer.setEdgesVisible(showBuildingEdges);
    }
  }, [showBuildings, showBuildingEdges]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.roadRenderer.setVisible(showRoads);
    }
  }, [showRoads]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.groundRenderer.setVisible(showLanduse);
    }
  }, [showLanduse]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setSatelliteOverlay(showSatelliteOverlay, satelliteQuality);
    }
  }, [showSatelliteOverlay, satelliteQuality]);

  useEffect(() => {
    if (sceneRef.current && mapData) {
      // Filter resource nodes based on toggles
      const filteredNodes = mapData.resourceNodes.filter((n) => {
        if (n.type === 'wood' && !showWood) return false;
        if (n.type === 'metal' && !showMetal) return false;
        if (n.type === 'bricks' && !showBricks) return false;
        return true;
      });
      sceneRef.current.resourceRenderer.rebuildResources(
        filteredNodes,
        mapData.elevation,
        elevationExaggeration
      );
    }
  }, [showWood, showMetal, showBricks, mapKey, elevationExaggeration]);

  return (
    <div
      id="game-canvas-container"
      ref={containerRef}
      className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing overflow-hidden select-none bg-[#131517] touch-none"
    >
      {!mapData && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="w-[min(520px,calc(100vw-2rem))] border border-[#27313b] bg-[#0b0f13]/95 px-5 py-4">
            <div className="text-[11px] font-mono tracking-[0.22em] text-[#94a3b8]">SECTOR INITIALISATION</div>
            <div className="mt-2 text-sm font-semibold text-white">Waiting for the real-world map survey to complete…</div>
            <div className="mt-3 h-1 overflow-hidden bg-[#161c22]"><div className="h-full w-1/2 animate-pulse bg-[#94a3b8]" /></div>
            <div className="mt-2 text-[10px] font-mono text-[#64748b]">OSM buildings, roads and terrain elevation are loaded before tactical rendering begins.</div>
          </div>
        </div>
      )}
    </div>
  );
};
