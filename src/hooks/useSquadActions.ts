import { type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { getPrimaryHQ, isBuildingOperational } from '../services/buildingOperational';
import {
  appointBuildingHead,
  createSquad,
  disbandSquad,
  modifySquadGeneralMembers,
  recruitHiddenGroup,
  updateJobPriorities,
  vacateSurvivorRole,
} from '../services/populationService';
import {
  emitNoiseEvent,
  orderSquadMove,
  syncTacticalSquadUnits,
} from '../services/combatService';
import { orderVehicleRoadTravel } from '../services/vehicleService';
import { updateRadioDirectiveSystem } from '../services/radioDirectiveService';
import { isSquadInsideBuilding } from '../services/scavengingService';
import { soundService, ToastMessage } from '../services/soundService';
import type { BuildingPolygon, MapData, Point2D } from '../types/map';
import type { JobSector, HiddenSurvivorGroup, SquadWeaponLoadout, SquadArmorLoadout } from '../types/population';
import type { AdaptedBuilding } from '../types/settlement';
import type { GameClockState, TacticalSquadUnit, ZombieUnit } from '../types/combat';
import type { SettlementState } from '../types/settlement';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import type { RoadNetworkGraph } from '../services/roadPathfinder';

/** Runtime for the population & tactical-squad action handlers. */
export interface SquadActionsRuntime {
  settlement: SettlementState;
  mapData: MapData | null;
  gameClock: GameClockState;
  zombies: ZombieUnit[];
  combatSquads: TacticalSquadUnit[];
  selectedSquadId: string | null;
  gameClockRef: MutableRefObject<GameClockState>;
  zombiesRef: MutableRefObject<ZombieUnit[]>;
  settlementRef: MutableRefObject<SettlementState>;
  combatSquadsRef: MutableRefObject<TacticalSquadUnit[]>;
  roadGraphRef: MutableRefObject<RoadNetworkGraph | null>;
  pathGridRef?: MutableRefObject<import('../services/pathfindingService').PathGrid | null>;
  setSettlement: Dispatch<SetStateAction<SettlementState>>;
  setCombatSquads: Dispatch<SetStateAction<TacticalSquadUnit[]>>;
  setSelectedSquadId: Dispatch<SetStateAction<string | null>>;
  setSelectedSquadIds: Dispatch<SetStateAction<string[]>>;
  setSelectedVehicleId: Dispatch<SetStateAction<string | null>>;
  setNoiseEvents: Dispatch<SetStateAction<import('../types/combat').NoiseEvent[]>>;
  setToastMessage: (msg: ToastMessage | null) => void;
  setRadioDirectiveState: Dispatch<SetStateAction<RadioDirectiveState>>;
  setActiveRadioTransmission: Dispatch<SetStateAction<RadioTransmission | null>>;
  setIsRadioModalOpen: Dispatch<SetStateAction<boolean>>;
  setActiveRecruitmentGroup: Dispatch<SetStateAction<HiddenSurvivorGroup | null>>;
  addTacticalAlert: (
    title: string,
    desc: string,
    type: 'danger' | 'warn' | 'info' | 'success',
    onClick?: () => void
  ) => void;
  /** Defined in useThreatActions; passed deferred to break the hook circularity. */
  handleSearchBuilding: (building: BuildingPolygon, squadIdOverride?: string) => void;
}

/**
 * Workforce & tactical rosters: appointing facility heads, adjusting labour
 * priorities, forming/modifying/disbanding squads, recruiting survivor groups,
 * selection redirects (vehicle→squad) and the right-click move/deposit orders.
 */
export function useSquadActions(runtime: SquadActionsRuntime) {
  const {
    settlement,
    mapData,
    gameClock,
    zombies,
    combatSquads,
    selectedSquadId,
    gameClockRef,
    zombiesRef,
    settlementRef,
    combatSquadsRef,
    roadGraphRef,
    pathGridRef,
    setSettlement,
    setCombatSquads,
    setSelectedSquadId,
    setSelectedSquadIds,
    setSelectedVehicleId,
    setNoiseEvents,
    setToastMessage,
    setRadioDirectiveState,
    setActiveRadioTransmission,
    setIsRadioModalOpen,
    setActiveRecruitmentGroup,
    addTacticalAlert,
    handleSearchBuilding,
  } = runtime;

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

  const handleCreateSquad = (squadName: string, leaderId: string, generalCount: number, weaponLoadout: SquadWeaponLoadout = 'knife', armorLoadout: SquadArmorLoadout = 'none') => {
    const currentSettlement = settlementRef.current || settlement;
    const res = createSquad(currentSettlement, squadName, leaderId, generalCount, weaponLoadout, armorLoadout);

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
        // Keep the simulation ref in sync with the rename — otherwise the 100ms
        // combat loop keeps reading the pre-rename squad until the next sync.
        const renamed = updatedCombatSquads.map((s) =>
          s.squadId === created.id ? { ...s, name: created.name } : s
        );
        combatSquadsRef.current = renamed;
        setCombatSquads(renamed);
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
    // A plain click is a single selection — it replaces any CTRL+drag box set.
    setSelectedSquadIds(squadId ? [squadId] : []);
  };

  /** §IFZ CTRL+drag box selection: replaces the selection with the boxed squads. */
  const handleSelectSquads = (squadIds: string[]) => {
    setSelectedSquadIds(squadIds);
    setSelectedSquadId(squadIds[0] ?? null);
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
      // A squad that left the car to deposit is still riding this vehicle — it
      // just disembarked temporarily. Selecting the parked vehicle still picks
      // the squad, so the mount is never treated as broken by a deposit run.
      const depositingSquad = combatSquadsRef.current.find(
        (s) => s.depositVehicleId === vehicleId
      );
      if (depositingSquad) {
        setSelectedSquadId(depositingSquad.squadId);
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
    targetBuildingName?: string,
    queue = false
  ) => {
    if (queue) {
      setCombatSquads((prev) => {
        const updated = prev.map((s) => s.squadId === squadId ? {
          ...s,
          queuedOrders: [...((s as any).queuedOrders || []), { pos, targetBuildingId, targetBuildingName }],
        } : s);
        combatSquadsRef.current = updated;
        return updated;
      });
      return;
    }

    // Right-clicking the HQ or a completed warehouse/storage depot with a
    // vehicle selected is a DEPOSIT run, not a scavenge run: the vehicle drives
    // there, the squad gets out and empties BOTH its own inventory and the
    // vehicle cargo bay into the stockpile, then re-boards.
    const isStorageDropoffTarget = (() => {
      if (!targetBuildingId) return false;
      const commandCenter = getPrimaryHQ(settlement);
      if (commandCenter && String(commandCenter.buildingId) === String(targetBuildingId)) {
        return true;
      }
      return Array.from(settlement.adaptedBuildings.values()).some(
        (b: AdaptedBuilding) =>
          (b.typeId === 'warehouse' || b.typeId === 'storage_depot') &&
          String(b.buildingId) === String(targetBuildingId) &&
          isBuildingOperational(b)
      );
    })();

    // 1. Check if the order target is a vehicle directly
    const directVeh = settlement.vehicles?.find((v) => v.id === squadId);
    if (directVeh && roadGraphRef.current) {
      // An unmounted vehicle has NO driver — it cannot move itself. Reject the
      // order with feedback instead of silently driving an empty vehicle; only
      // a squad aboard (or one temporarily disembarked for a deposit run) may
      // issue movement. The player must first order a squad to MOUNT it.
      const depositingDriver = combatSquadsRef.current.some(
        (s) => s.depositVehicleId === directVeh.id
      );
      if (!directVeh.assignedSquadId && !depositingDriver) {
        setToastMessage({
          title: 'NO DRIVER',
          desc: `${directVeh.name} is empty — select a squad and order it to MOUNT the vehicle before issuing move orders.`,
          type: 'info',
        });
        return;
      }
      let updatedVeh = orderVehicleRoadTravel(directVeh, pos, roadGraphRef.current, undefined, mapData ?? undefined, pathGridRef?.current ?? null);
      if (targetBuildingId && !isStorageDropoffTarget) {
        updatedVeh = {
          ...updatedVeh,
          autoScavengeBuildingId: targetBuildingId,
          autoScavengeBuildingName: targetBuildingName || null,
        };
      } else if (isStorageDropoffTarget) {
        // Explicit DEPOSIT run: flag the vehicle so the arrival handler (not a
        // distance heuristic) dismounts the squad to empty BOTH inventories.
        updatedVeh = { ...updatedVeh, autoDepotReturn: true };
      }
      setSettlement((prev) => ({
        ...prev,
        vehicles: prev.vehicles.map((v) => (v.id === updatedVeh.id ? updatedVeh : v)),
      }));
      const noise = emitNoiseEvent('engine', directVeh.position.x, directVeh.position.z, `${directVeh.name.toUpperCase()} ENGINE ROAR`);
      setNoiseEvents((prev) => [...prev, noise.event]);
      setToastMessage({
        title: isStorageDropoffTarget
          ? 'VEHICLE RETURNING TO DEPOSIT'
          : targetBuildingId
            ? 'EXPEDITION DISPATCHED'
            : 'VEHICLE EN ROUTE',
        desc: isStorageDropoffTarget
          ? `${directVeh.name} driving to ${targetBuildingName || 'depot'}. Squad will disembark and deposit both its inventory and the vehicle cargo bay.`
          : targetBuildingId
            ? `${directVeh.name} driving to ${targetBuildingName || 'target'}. Mounted squad will dismount and scavenge upon arrival.`
            : `${directVeh.name} driving along road network (${Math.round(updatedVeh.currentFuel)}L fuel remaining).`,
        type: 'info',
      });
      return;
    }

    // 2. Check if squad is currently mounted in a motor vehicle. Route the order
    //    to the vehicle only while the SQUAD still considers itself mounted — a
    //    just-dismounted squad must move on foot even if the vehicle's link is
    //    momentarily stale (e.g. its assignedSquadId not yet cleared), otherwise
    //    a low-fuel vehicle silently swallows the on-foot move order.
    const mountedVeh = settlement.vehicles?.find((v) => v.assignedSquadId === squadId);
    const orderSquad = combatSquadsRef.current.find((s) => s.squadId === squadId);
    if (mountedVeh && roadGraphRef.current && orderSquad?.mountedVehicleId === mountedVeh.id) {
      let updatedVeh = orderVehicleRoadTravel(mountedVeh, pos, roadGraphRef.current, undefined, mapData ?? undefined, pathGridRef?.current ?? null);
      if (targetBuildingId && !isStorageDropoffTarget) {
        updatedVeh = {
          ...updatedVeh,
          autoScavengeBuildingId: targetBuildingId,
          autoScavengeBuildingName: targetBuildingName || null,
        };
      } else if (isStorageDropoffTarget) {
        // Explicit DEPOSIT run: flag the vehicle so the arrival handler (not a
        // distance heuristic) dismounts the squad to empty BOTH inventories.
        updatedVeh = { ...updatedVeh, autoDepotReturn: true };
      }
      setSettlement((prev) => ({
        ...prev,
        vehicles: prev.vehicles.map((v) => (v.id === updatedVeh.id ? updatedVeh : v)),
      }));
      const noise = emitNoiseEvent('engine', mountedVeh.position.x, mountedVeh.position.z, `${mountedVeh.name.toUpperCase()} ENGINE ROAR`);
      setNoiseEvents((prev) => [...prev, noise.event]);
      setToastMessage({
        title: isStorageDropoffTarget
          ? 'VEHICLE RETURNING TO DEPOSIT'
          : targetBuildingId
            ? 'EXPEDITION DISPATCHED'
            : 'VEHICLE EN ROUTE',
        desc: isStorageDropoffTarget
          ? `${mountedVeh.name} driving to ${targetBuildingName || 'depot'}. Squad will disembark and deposit both its inventory and the vehicle cargo bay.`
          : targetBuildingId
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

  return {
    handleAppointHead,
    handleVacateSurvivorRole,
    handleUpdateJobPriorities,
    handleCreateSquad,
    handleModifySquadGeneralMembers,
    handleDisbandSquad,
    handleRecruitGroup,
    handleSelectSquad,
    handleSelectSquads,
    handleSelectVehicle,
    handleOrderSquadMove,
  };
}