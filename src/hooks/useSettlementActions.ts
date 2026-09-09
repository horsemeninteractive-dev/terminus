import { type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { calculateGlobalNetworkStats } from '../services/caravanService';
import {
  countSettlementSurvivors,
  markSettlementReclaimed,
} from '../services/settlementLifecycleService';
import type { SettlementRecord } from '../types/caravan';
import {
  adaptBuilding,
  AdaptBuildingOptions,
  adaptBuildingSection,
  buildFreestanding,
  deadaptBuilding,
  cancelDeconstruction,
  establishSettlementHQ,
  orderDeconstruction,
  splitBuilding,
} from '../services/settlementService';
import { getFreestandingCollisionPolygon, getFreestandingDimensions, freestandingFootprintOverlapsWater } from '../services/freestandingFootprint';
import { isPointInArea } from '../services/scavengingService';
import { assignResourceGatherers } from '../services/resourceGatheringService';
import { startSquadTraining, stopSquadTraining } from '../services/trainingService';
import { updateRadioDirectiveSystem } from '../services/radioDirectiveService';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../data/functionalBuildings';
import { getPrimaryHQ } from '../services/buildingOperational';
import { soundService, ToastMessage } from '../services/soundService';
import type { BuildingPolygon, MapData, Point2D, WorldAreaBounds } from '../types/map';
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
  settlements: Record<string, SettlementRecord>;
  activeSettlementId: string;
  setSettlement: Dispatch<SetStateAction<SettlementState>>;
  setSettlements: Dispatch<SetStateAction<Record<string, SettlementRecord>>>;
  setOverrunSettlement: Dispatch<SetStateAction<SettlementRecord | null>>;
  setIsExtinct: Dispatch<SetStateAction<boolean>>;
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
function utilsIsReclaiming(record: SettlementRecord | undefined): boolean {
  if (!record) return false;
  return record.status === 'reclaiming' || record.status === 'destroyed';
}

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
    settlements,
    activeSettlementId,
    setSettlement,
    setSettlements,
    setOverrunSettlement,
    setIsExtinct,
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

      // §7.5 Reclamation: confirming a new HQ inside a fallen colony restores
      // it to operational status — local recovery without needing a caravan.
      const activeRecord = settlements[activeSettlementId];
      const isReclaiming = activeRecord && utilsIsReclaiming(activeRecord);
      if (isReclaiming) {
        setSettlements((registry) => {
          const record = registry[activeSettlementId];
          if (!record) return registry;
          const reclaimed = markSettlementReclaimed(record, gameClock.day, updated);
          setOverrunSettlement(null);
          const stats = calculateGlobalNetworkStats(
            { ...registry, [activeSettlementId]: reclaimed },
            []
          );
          setIsExtinct(stats.isExtinct);
          return { ...registry, [activeSettlementId]: reclaimed };
        });
        setToastMessage({
          title: 'COLONY RECLAIMED',
          desc: `A new command post has been secured at ${bldg.name || 'OSM Structure'} — ${activeRecord.name} is operational again! ${countSettlementSurvivors(updated)} survivors continue the fight.`,
          type: 'success',
        });
      } else {
        setToastMessage({
          title: 'HEADQUARTERS ESTABLISHED',
          desc: `Secured command center at ${bldg.name || 'OSM Structure'}. Base inventory initialized.`,
          type: 'success',
        });
      }

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

  const handleAdaptBuilding = (
    bldg: BuildingPolygon,
    typeId: FunctionalBuildingTypeId,
    adaptation: number | Point2D[] = 100,
    options: AdaptBuildingOptions = {}
  ) => {
    // Compute the result synchronously from the CURRENT state, mirroring the
    // other settlement actions (handleConfirmHQ/handleSplitBuilding). Capturing
    // the result through a React functional updater is a race: the updater runs
    // during the render flush, so the closure's `success` flag would still be
    // false when read — every adaptation would toast a failure while the
    // construction order still committed. `settlement` is the live state at
    // render time, so it is safe to evaluate against directly.
    const res = adaptBuilding(settlement, bldg, typeId, adaptation, options);
    if (!res.success) {
      setToastMessage({
        title: 'ADAPTATION BLOCKED',
        desc: res.error || 'Failed adapting building.',
        type: 'warn',
      });
      return;
    }
    settlementRef.current = res.newState;
    setSettlement(res.newState);
    setSelectedBuilding(bldg);
    soundService.playBuildingPlaced();
    setToastMessage({
      title: 'CONSTRUCTION DISPATCHED',
      desc: `Building crew en route to adapt structure. Resources will be progressively consumed as work advances.`,
      type: 'info',
    });
  };

  /** IFZ §7.1 split: divide a large real building into independently adaptable
   *  sections (brick cost for the partition walls). */
  const handleSplitBuilding = (bldg: BuildingPolygon, parts: 2 | 3 | 4 = 2) => {
    const res = splitBuilding(settlement, bldg, parts);
    if (!res.success) {
      setToastMessage({ title: 'SPLIT BLOCKED', desc: res.error || 'Could not split building.', type: 'warn' });
      return;
    }
    setSettlement(res.newState);
    settlementRef.current = res.newState;
    soundService.playBuildingPlaced();
    setToastMessage({
      title: 'BUILDING SPLIT',
      desc: `Divided ${bldg.name || 'structure'} into ${res.sections?.length || parts} independent sections — each can now be adapted into its own facility.`,
      type: 'success',
    });
  };

  /** Adapt one split section into a facility (independently of the others). */
  const handleAdaptBuildingSection = (
    bldg: BuildingPolygon,
    sectionId: string,
    typeId: FunctionalBuildingTypeId
  ) => {
    const section = (settlement.buildingSections?.get(bldg.id) || []).find((s) => s.id === sectionId);
    if (!section) {
      setToastMessage({ title: 'ADAPTATION BLOCKED', desc: 'Section not found.', type: 'warn' });
      return;
    }
    const res = adaptBuildingSection(settlement, bldg, section, typeId);
    if (!res.success) {
      setToastMessage({ title: 'ADAPTATION BLOCKED', desc: res.error || 'Could not adapt section.', type: 'warn' });
      return;
    }
    setSettlement(res.newState);
    settlementRef.current = res.newState;
    soundService.playBuildingPlaced();
    setToastMessage({
      title: 'SECTION ADAPTED',
      desc: `Section ${section.index + 1} of ${bldg.name || 'structure'} will become a ${FUNCTIONAL_BUILDING_DEFINITIONS[typeId]?.name || typeId}.`,
      type: 'info',
    });
  };

  const handleDeadaptBuilding = (buildingId: string | number) => {
    const result = deadaptBuilding(settlement, buildingId);
    if (!result.success) {
      setToastMessage({ title: 'DEADAPTATION BLOCKED', desc: result.error || 'Unable to remove adaptation.', type: 'warn' });
      return;
    }
    setSettlement(result.newState);
    settlementRef.current = result.newState;
    setToastMessage({ title: 'ADAPTATION REMOVED', desc: 'The source structure is adaptable again.', type: 'info' });
  };

  const handleBuildFreestanding = (typeId: FunctionalBuildingTypeId, pos: Point2D, rotationDeg = 0) => {
    try {
      const dims = getFreestandingDimensions(typeId);
      const res = buildFreestanding(
        settlement,
        typeId,
        pos,
        dims.width,
        dims.length,
        4.5,
        rotationDeg,
        mapData?.buildings || []
      );
      if (!res.success) {
        throw new Error(res.error || 'Failed freestanding construction.');
      }
      // Sync the ref BEFORE React state: the simulation loop reads
      // settlementRef.current each tick and commits its result back over both
      // the ref and React state. Without this sync the next tick runs on the
      // pre-placement state and silently discards the new structure and its
      // construction order (mirrors handleAdaptBuilding above).
      settlementRef.current = res.newState;
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

    // Reject placements that genuinely collide with open water (rivers, lakes).
    // The shared helper is tolerance-aware: a footprint grazing the mapped
    // waterline on visibly dry ground is fine — walls can be built to the
    // water's edge. For a dragged wall RUN, water-overlapping segments are
    // skipped individually instead of cancelling the whole run, so the wall
    // builds right up to the bank and stops there.
    const waterPolys =
      mapData?.landuse?.filter((l) => l.type === 'water' && l.polygon?.length >= 3).map((l) => l.polygon as Point2D[]) || [];

    for (const p of placements) {
      const overWater = freestandingFootprintOverlapsWater(
        { typeId, position: { x: p.x, z: p.z }, rotationDeg: p.rotationDeg, width: p.width, length: p.length },
        waterPolys
      );
      if (overWater) {
        // Part of the run hit water — keep building the dry remainder.
        if (placements.length > 1) continue;
        setToastMessage({
          title: 'Cannot Build on Water',
          desc: 'That structure can not be placed in water. Choose a dry location.',
          type: 'warn',
        });
        break;
      }
      const dims = getFreestandingDimensions(typeId);
      const res = buildFreestanding(
        next,
        typeId,
        { x: p.x, z: p.z },
        p.width ?? dims.width,
        p.length ?? dims.length,
        4.5,
        p.rotationDeg,
        mapData?.buildings || []
      );
      if (!res.success) {
        // A segment colliding with an existing building is skipped (keep
        // building the dry/clear remainder of the run) — matching the
        // water-overlap behaviour. A hard failure (materials, research) or a
        // colliding single placement halts the whole run.
        if (
          placements.length > 1 &&
          (res.error || '').includes('overlaps an existing building')
        ) {
          continue;
        }
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
      // Ref-first sync so the sim loop cannot tick the stale state away.
      settlementRef.current = res.newState;
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
    settlementRef.current = updated;
    setSettlement(updated);
    setToastMessage({
      title: 'DECONSTRUCTION CANCELLED',
      desc: 'Demolition halted. The structure remains intact and workers return to the labour pool.',
      type: 'info',
    });
  };

  const handleDesignateGatherArea = (
    type: GatherResourceType,
    bounds: WorldAreaBounds
  ) => {
    setActiveGatherType(null);
    if (!mapData) return;

    if (type === 'demolish') {
      const bldg = mapData.buildings.find(b =>
        isPointInArea(b.center, bounds) &&
        String(b.id) !== String(getPrimaryHQ(settlement)?.buildingId)
      );
      if (bldg) handleOrderDeconstruction(bldg.id);
      else setToastMessage({ title: 'NO STRUCTURE SELECTED', desc: 'No dismantlable structure was found in the designated area.', type: 'info' });
      return;
    }

    const nodes = mapData.resourceNodes.filter(n =>
      n.type === type && n.amount > 0 && isPointInArea(n.position, bounds)
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

  /** Shooting Range: start a squad's next training course (ammo drawn over time). */
  const handleStartTraining = (squadId: string) => {
    const res = startSquadTraining(settlement, squadId, Date.now());
    if (!res.ok || !res.session) {
      setToastMessage({ title: 'TRAINING BLOCKED', desc: res.error || 'Could not start training.', type: 'warn' });
      return;
    }
    const sessions = new Map(settlement.trainingState?.sessions || []);
    sessions.set(squadId, res.session);
    const updated: SettlementState = {
      ...settlement,
      trainingState: {
        sessions,
        totalAmmoSpent: settlement.trainingState?.totalAmmoSpent ?? 0,
      },
    };
    setSettlement(updated);
    settlementRef.current = updated;
    soundService.playBuildingPlaced();
    setToastMessage({
      title: 'TRAINING BEGUN',
      desc: `Squad ordered to the Shooting Range. Ammunition is drawn as they drill.`,
      type: 'success',
    });
  };

  /** Shooting Range: cancel a squad's training session (tier progress kept). */
  const handleStopTraining = (squadId: string) => {
    const updated = stopSquadTraining(settlement, squadId);
    setSettlement(updated);
    settlementRef.current = updated;
    setToastMessage({ title: 'TRAINING STOPPED', desc: 'The squad left the range. Completed tiers are permanent.', type: 'info' });
  };

  return {
    handleConfirmHQ,
    handleAdaptBuilding,
    handleAdaptBuildingSection,
    handleSplitBuilding,
    handleDeadaptBuilding,
    handleBuildFreestanding,
    handleBuildFreestandingRun,
    handleOrderDeconstruction,
    handleCancelDeconstruction,
    handleDesignateGatherArea,
    handleStartTraining,
    handleStopTraining,
  };
}