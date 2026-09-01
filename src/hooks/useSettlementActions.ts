import { type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  adaptBuilding,
  buildFreestanding,
  cancelDeconstruction,
  establishSettlementHQ,
  orderDeconstruction,
} from '../services/settlementService';
import { getFreestandingCollisionPolygon, getFreestandingDimensions } from '../services/freestandingFootprint';
import { isPointInsidePolygon } from '../services/scavengingService';
import { assignResourceGatherers } from '../services/resourceGatheringService';
import { updateRadioDirectiveSystem } from '../services/radioDirectiveService';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../data/functionalBuildings';
import { soundService, ToastMessage } from '../services/soundService';
import type { BuildingPolygon, MapData, Point2D } from '../types/map';
import type { FunctionalBuildingTypeId, SettlementState } from '../types/settlement';
import type { GatherResourceType } from '../components/AreaGatherOverlay';
import type { GameClockState, ZombieUnit } from '../types/combat';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';

/** Runtime for settlement construction/adaptation/gathering action handlers. */
export interface SettlementActionsRuntime {
  settlement: SettlementState;
  mapData: MapData | null;
  gameClock: GameClockState;
  zombies: ZombieUnit[];
  selectedBuilding: BuildingPolygon | null;
  gameClockRef: MutableRefObject<GameClockState>;
  zombiesRef: MutableRefObject<ZombieUnit[]>;
  settlementRef: MutableRefObject<SettlementState>;
  radioAlertIdsRef: MutableRefObject<Set<string>>;
  setSettlement: Dispatch<SetStateAction<SettlementState>>;
  setSelectedBuilding: Dispatch<SetStateAction<BuildingPolygon | null>>;
  setGameClock: Dispatch<SetStateAction<GameClockState>>;
  setRadioDirectiveState: Dispatch<SetStateAction<RadioDirectiveState>>;
  setActiveRadioTransmission: Dispatch<SetStateAction<RadioTransmission | null>>;
  setIsRadioModalOpen: Dispatch<SetStateAction<boolean>>;
  setToastMessage: (msg: ToastMessage | null) => void;
  setPendingFreestandingType: Dispatch<SetStateAction<FunctionalBuildingTypeId | null>>;
  setActiveGatherType: Dispatch<SetStateAction<GatherResourceType | null>>;
  addTacticalAlert: (
    title: string,
    desc: string,
    type: 'danger' | 'warn' | 'info' | 'success',
    onClick?: () => void
  ) => void;
}

/**
 * Construction & colony actions: confirming the HQ, adapting real buildings,
 * building freestanding structures (incl. multi-segment runs), ordering/cancelling
 * deconstruction, and designating resource-gathering areas.
 */
export function useSettlementActions(runtime: SettlementActionsRuntime) {
  const {
    settlement,
    mapData,
    gameClock,
    zombies,
    selectedBuilding,
    gameClockRef,
    zombiesRef,
    settlementRef,
    radioAlertIdsRef,
    setSettlement,
    setSelectedBuilding,
    setGameClock,
    setRadioDirectiveState,
    setActiveRadioTransmission,
    setIsRadioModalOpen,
    setToastMessage,
    setPendingFreestandingType,
    setActiveGatherType,
    addTacticalAlert,
  } = runtime;

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

  const handleBuildFreestanding = (typeId: FunctionalBuildingTypeId, pos: Point2D, rotationDeg = 0) => {
    try {
      const dims = getFreestandingDimensions(typeId);
      const res = buildFreestanding(settlement, typeId, pos, dims.width, dims.length, 4.5, rotationDeg);
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

  // Builds either a single point structure (tower/gate) or a whole run of
  // independent fence segments from a click-drag-release gesture. All segments
  // are placed in ONE settlement update so several adjacent walls are created
  // atomically from a single source-of-truth state.
  const handleBuildFreestandingRun = (
    typeId: FunctionalBuildingTypeId,
    placements: Array<{ x: number; z: number; rotationDeg: number; width?: number; length?: number }>
  ) => {
    if (!placements.length) return;
    let next = settlement;
    let built = 0;

    // Reject placements that overlap open water (rivers, lakes). A wall/tower/
    // gate dropped on water is cancelled entirely and the ghost would turn red.
    const waterPolys =
      mapData?.landuse?.filter((l) => l.type === 'water' && l.polygon?.length >= 3) || [];
    const footprintOverlapsWater = (px: number, pz: number, rotDeg: number, w?: number, l?: number) => {
      if (waterPolys.length === 0) return false;
      const fp = getFreestandingCollisionPolygon({
        typeId,
        position: { x: px, z: pz },
        rotationDeg: rotDeg,
      } as const);
      for (const poly of waterPolys) {
        // Water blocks the structure if the footprint's centre OR any corner
        // lands inside the water polygon.
        for (const corner of [{ x: px, z: pz }, ...fp]) {
          if (isPointInsidePolygon(corner, poly.polygon)) return true;
        }
      }
      return false;
    };

    for (const p of placements) {
      if (footprintOverlapsWater(p.x, p.z, p.rotationDeg, p.width, p.length)) {
        setToastMessage({
          title: 'Cannot Build on Water',
          desc: 'That structure can not be placed in water. Choose a dry location.',
          type: 'warn',
        });
        break;
      }
      const dims = getFreestandingDimensions(typeId);
      const res = buildFreestanding(next, typeId, { x: p.x, z: p.z }, p.width ?? dims.width, p.length ?? dims.length, 4.5, p.rotationDeg);
      if (!res.success) {
        setToastMessage({
          title: 'Construction Halted',
          desc: res.error || 'Insufficient materials to complete placement.',
          type: 'warn',
        });
        break;
      }
      next = res.newState;
      built++;
    }
    if (built > 0) {
      setSettlement(next);
      settlementRef.current = next;
      soundService.playBuildingPlaced();
      const label = FUNCTIONAL_BUILDING_DEFINITIONS[typeId]?.name || 'Structure';
      setToastMessage({
        title: 'FREESTANDING STRUCTURE ASSEMBLED',
        desc:
          built === 1
            ? `${label} constructed on open ground.`
            : `${built} ${label} segments constructed along the designated line.`,
        type: 'success',
      });
      setPendingFreestandingType(null);
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

  return {
    handleConfirmHQ,
    handleAdaptBuilding,
    handleBuildFreestanding,
    handleBuildFreestandingRun,
    handleOrderDeconstruction,
    handleCancelDeconstruction,
    handleDesignateGatherArea,
  };
}