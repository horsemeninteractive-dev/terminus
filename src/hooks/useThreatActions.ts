import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  assignMemberArmor,
  assignMemberWeapon,
  breachInfestedBuilding,
  emitNoiseEvent,
  equipBuildingWeapon,
  generateBuildingInfestation,
  orderSquadAttack,
  orderSquadMove,
  orderSquadRecall,
  orderAllSquadsRecall,
  repairBuilding,
} from '../services/combatService';
import { getOccupation, breachOccupiedBuilding } from '../services/buildingOccupationService';
import { dismountSquadFromVehicle, mountSquadToVehicle, orderVehicleRoadTravel } from '../services/vehicleService';
import { createVehicleWorkshopOrder } from '../services/vehicleWorkshopService';
import { payRansomForCaptive } from '../services/rivalFactionService';
import { assignResourceGatherers } from '../services/resourceGatheringService';
import {
  getBuildingSearchDurationSec,
  isPointInArea,
  isPointInsidePolygon,
  isSquadInsideBuilding,
  startBuildingSearch,
} from '../services/scavengingService';
import { startResearchNode } from '../services/researchService';
import { getPrimaryHQ, isHQBuilding } from '../services/buildingOperational';
import { calculateSettlementMorale } from '../services/moraleService';
import { addWaterToStockpile } from '../services/waterService';
import { soundService, ToastMessage } from '../services/soundService';
import type { BuildingPolygon, MapData, Point2D, WorldAreaBounds } from '../types/map';
import type { BuildingSearchState } from '../types/scavenging';
import type { AdaptedBuilding, FunctionalBuildingTypeId, SettlementState } from '../types/settlement';
import type {
  ArmorItemId,
  GameClockState,
  HostileHumanUnit,
  NoiseEvent,
  TacticalSquadUnit,
  WeaponItemId,
  ZombieUnit,
} from '../types/combat';
import type { WorldVehicle } from '../types/vehicle';
import type { HiddenSurvivorGroup } from '../types/population';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import { isValidArmorId, isValidWeaponId } from '../types/combat';
import type { SeasonType, WeatherType } from '../types/weather';
import type { ActiveSidebarTab } from '../components/TacticalHeaderStrip';
import type { GatherResourceType } from '../components/AreaGatherOverlay';
import type { WorldScene } from '../render/WorldScene';
import type { RoadNetworkGraph } from '../services/roadPathfinder';

/** Runtime for threat/vehicle/RTS/utility action handlers. */
export interface ThreatActionsRuntime {
  settlement: SettlementState;
  mapData: MapData | null;
  gameClock: GameClockState;
  zombies: ZombieUnit[];
  hostileHumans: HostileHumanUnit[];
  combatSquads: TacticalSquadUnit[];
  selectedSquadId: string | null;
  combatSquadsRef: MutableRefObject<TacticalSquadUnit[]>;
  sceneRef: MutableRefObject<WorldScene | null>;
  roadGraphRef: MutableRefObject<RoadNetworkGraph | null>;
  radioDirectiveState: RadioDirectiveState;
  setSettlement: Dispatch<SetStateAction<SettlementState>>;
  setCombatSquads: Dispatch<SetStateAction<TacticalSquadUnit[]>>;
  setSelectedSquadId: Dispatch<SetStateAction<string | null>>;
  setSelectedVehicleId: Dispatch<SetStateAction<string | null>>;
  setSelectedBuilding: Dispatch<SetStateAction<BuildingPolygon | null>>;
  setNoiseEvents: Dispatch<SetStateAction<NoiseEvent[]>>;
  setToastMessage: (msg: ToastMessage | null) => void;
  setActiveRansomHideoutId: Dispatch<SetStateAction<string | number | null>>;
  setActiveGatherType: Dispatch<SetStateAction<GatherResourceType | null>>;
  setScavengeQueue: Dispatch<SetStateAction<Record<string, Array<string | number>>>>;
  setGameClock: Dispatch<SetStateAction<GameClockState>>;
  setZombies: Dispatch<SetStateAction<ZombieUnit[]>>;
  setActiveSidebarTab: Dispatch<SetStateAction<ActiveSidebarTab>>;
  setActiveRadioTransmission: Dispatch<SetStateAction<RadioTransmission | null>>;
  setIsRadioModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsResearchModalOpen: Dispatch<SetStateAction<boolean>>;
  setIsMedbayModalOpen: Dispatch<SetStateAction<boolean>>;
  addTacticalAlert: (
    title: string,
    desc: string,
    type: 'danger' | 'warn' | 'info' | 'success',
    onClick?: () => void
  ) => void;
  /** Defined in useSquadActions; passed directly to break the hook circularity. */
  handleOrderSquadMove: (
    squadId: string,
    pos: Point2D,
    targetBuildingId?: string | number,
    targetBuildingName?: string
  ) => void;
}

/**
 * Threat response (lair/hideout assault, ransoms), vehicle operation (mount/
 * dismount/extraction/orders), squad attack & recall orders, building search,
 * scavenge-area designation, repair/refuel and the directive-quick-action passthrough.
 */
export function useThreatActions(runtime: ThreatActionsRuntime) {
  const {
    settlement,
    mapData,
    gameClock,
    zombies,
    hostileHumans,
    combatSquads,
    selectedSquadId,
    combatSquadsRef,
    sceneRef,
    roadGraphRef,
    radioDirectiveState,
    setSettlement,
    setCombatSquads,
    setSelectedSquadId,
    setSelectedVehicleId,
    setSelectedBuilding,
    setNoiseEvents,
    setToastMessage,
    setActiveRansomHideoutId,
    setActiveGatherType,
    setScavengeQueue,
    setGameClock,
    setZombies,
    setActiveSidebarTab,
    setActiveRadioTransmission,
    setIsRadioModalOpen,
    setIsResearchModalOpen,
    setIsMedbayModalOpen,
    addTacticalAlert,
    handleOrderSquadMove,
  } = runtime;

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
              // Boarding another vehicle supersedes a fuel delivery in flight.
              pendingFuelDeliveryVehicleId: null,
              noPath: undefined, // a fresh mount order may open a new route
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
    // No driver, no movement: an empty vehicle cannot drive itself to HQ.
    if (!vehicle.assignedSquadId) {
      setToastMessage({
        title: 'NO DRIVER',
        desc: `${vehicle.name} is empty — order a squad to MOUNT it before requesting extraction.`,
        type: 'info',
      });
      return;
    }
    const hqPos = getPrimaryHQ(settlement)?.center || { x: 0, z: 0 };
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
    // No driver, no movement: an empty vehicle cannot plot its own course.
    if (!vehicle.assignedSquadId) {
      setToastMessage({
        title: 'NO DRIVER',
        desc: `${vehicle.name} is empty — order a squad to MOUNT it before dispatching it.`,
        type: 'info',
      });
      return;
    }
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

  const handleDesignateSquadScavenge = (bounds: WorldAreaBounds) => {
    if (!mapData || !selectedSquadId) return;

    // A building is only queued if its footprint actually intersects the dragged
    // area (any vertex inside, the box nested inside the footprint, or an area
    // corner landing inside a large building). Point tests use the exact
    // perspective-correct ground quad (`bounds.polygon`) when available so the
    // selection matches the drawn rectangle instead of over-covering it with an
    // axis-aligned box. Already-searched, fully-empty buildings are never
    // queued so the squad isn't sent to cleared structures.
    const searches: Map<string | number, BuildingSearchState> =
      settlement.buildingSearches || new Map<string | number, BuildingSearchState>();
    const exhausted = new Set<string>();
    for (const [id, search] of searches.entries()) {
      const empty =
        !!search &&
        (search.searched === true ||
          (Array.isArray(search.unlootedItems) && search.unlootedItems.length === 0));
      if (empty) exhausted.add(String(id));
    }

    const areaCorners: Point2D[] =
      bounds.polygon && bounds.polygon.length >= 4
        ? bounds.polygon
        : [
            { x: bounds.minX, z: bounds.minZ },
            { x: bounds.maxX, z: bounds.minZ },
            { x: bounds.maxX, z: bounds.maxZ },
            { x: bounds.minX, z: bounds.maxZ },
          ];

    const buildingIntersectsBox = (b: BuildingPolygon): boolean => {
      const pts = b.polygon && b.polygon.length >= 3 ? b.polygon : null;
      if (pts) {
        for (const p of pts) {
          if (isPointInArea(p, bounds)) return true;
        }
      }
      if (b.center && isPointInArea(b.center, bounds)) return true;
      if (pts) {
        for (const c of areaCorners) {
          if (isPointInsidePolygon(c, pts)) return true;
        }
      }
      return false;
    };

    const ids = mapData.buildings
      .filter((b) => buildingIntersectsBox(b))
      .filter((b) => !exhausted.has(String(b.id)))
      .filter((b) => !isHQBuilding(settlement, b.id))
      .map((b) => b.id);
    setScavengeQueue((prev) => ({ ...prev, [selectedSquadId]: ids }));
    if (ids.length > 0) {
      const first = mapData.buildings.find((b) => String(b.id) === String(ids[0]));
      if (first) handleOrderSquadMove(selectedSquadId, first.center, first.id, first.name || first.type);
    }
    setActiveGatherType(null);
    setToastMessage({ title: 'SCAVENGE QUEUE CREATED', desc: `${ids.length} building${ids.length === 1 ? '' : 's'} queued for ${combatSquads.find((s) => s.squadId === selectedSquadId)?.name || 'squad'}.`, type: 'success' });
  };

  const handleOrderAllSquadsRecall = () => {
    const antennaOperational = [
      ...Array.from(settlement.adaptedBuildings.values()),
      ...(settlement.freestandingBuildings || []),
    ].some((building) =>
      (building.typeId === 'antenna' || building.typeId === 'comms_relay') &&
      building.constructionStatus === 'completed' &&
      building.currentDurability > 0 &&
      !building.isUnderRepair
    );
    if (!antennaOperational) {
      setToastMessage({ title: 'RECALL UNAVAILABLE', desc: 'An operational Antenna or Comms Relay is required.', type: 'warn' });
      return;
    }
    const hqPos = getPrimaryHQ(settlement)?.center || { x: 0, z: 0 };
    setCombatSquads((prev) => {
      const updated = orderAllSquadsRecall(prev, hqPos);
      combatSquadsRef.current = updated;
      return updated;
    });
    setScavengeQueue({});
    setToastMessage({ title: 'ALL SQUADS RECALLED', desc: 'Emergency recall issued through the operational antenna network.', type: 'info' });
  };

  const handleOrderSquadRecall = (squadId: string) => {
    const hqPos = getPrimaryHQ(settlement)?.center || { x: 0, z: 0 };
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
      const updated = addWaterToStockpile(
        {
          ...prev,
          stockpile: {
            ...prev.stockpile,
            food: {
              ...prev.stockpile.food,
              canned_goods: prev.stockpile.food.canned_goods + 40,
              fresh_harvest: prev.stockpile.food.fresh_harvest + 60,
            },
          },
        },
        { purified_water: 80 },
        1
      );
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
        adaptedAreaM2: 80,
        adaptationPercentage: 100,
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
    const repairedBuilding = adapted || res.newState.freestandingBuildings.find((building) => building.buildingId === buildingId);
    if (repairedBuilding) {
      const noise = emitNoiseEvent('repair', repairedBuilding.position.x, repairedBuilding.position.z, 'REPAIRS UNDERWAY');
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
    if (isHQBuilding(settlement, building.id)) {
      setToastMessage({ title: 'HQ CANNOT BE SCAVENGED', desc: 'This is your headquarters — command infrastructure is never searched for loot.', type: 'warn' });
      return;
    }
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

      const r = startBuildingSearch(
        settlement,
        squadId,
        { x: sq.x, z: sq.z },
        building,
        18,
        settlement.scavengingResourceMultiplier
      );
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

      // §IFZ Building Occupation — an OCCUPIED structure holds real infected
      // that took the building over. Breaching wakes THEM (no conjured
      // infestation): every living occupation zombie inside attacks the squad,
      // and killing all of them clears the building. Unoccupied structures
      // still trigger the classic random encounter.
      const occupation = getOccupation(settlement, building.id);
      if (occupation && !occupation.isCleared) {
        setZombies((z) => breachOccupiedBuilding(z, occupation, building.center));
        setToastMessage({
          title: 'OCCUPIED STRUCTURE BREACHED',
          desc: `${occupation.buildingName} is infested — ${occupation.infectedRemaining} infected inside have been alerted and are fighting back. Kill every one to clear the building.`,
          type: 'danger',
        });
      } else {
        const infestation = generateBuildingInfestation(building);
        const breach = breachInfestedBuilding(infestation, building.center);
        setZombies((z) => [...z, ...breach]);
      }
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
    // Untrusted loot/save state: never assign an ID that isn't in the catalog.
    const validWeapon = isValidWeaponId(weaponId) ? weaponId : undefined;
    const validArmor = isValidArmorId(armorId) ? armorId : undefined;
    if (!validWeapon && !validArmor) return;
    setCombatSquads((prev) => {
      let changed = false;
      const next = prev.map((sq) => {
        if (sq.currentHp <= 0) return sq;
        let out = sq;
        if (validWeapon && validWeapon !== 'knife') {
          const target = out.members.find((m) => m.isAlive && m.weaponId === 'knife');
          if (target) {
            out = assignMemberWeapon(out, target.id, validWeapon);
            changed = true;
          }
        }
        if (validArmor) {
          const target = out.members.find((m) => m.isAlive && !m.armorId);
          if (target) {
            out = assignMemberArmor(out, target.id, validArmor);
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

  // Tower armament: equip/unequip a ranged weapon on a weaponMountable tower.
  // The weapon leaves the shared armory while mounted and returns on unequip.
  const handleAssignTowerWeapon = useCallback(
    (buildingId: string | number, weaponId: WeaponItemId | null) => {
      setSettlement((prev) => {
        const res = equipBuildingWeapon(prev, buildingId, weaponId);
        if (!res.success) {
          addTacticalAlert('TOWER ARMAMENT', res.error || 'Cannot change tower weapon.', 'warn');
          return prev;
        }
        return res.newState;
      });
    },
    [addTacticalAlert]
  );

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
      const res = startResearchNode(settlement, techId);
      setSettlement(res.updatedSettlement);
      addTacticalAlert('RESEARCH PROJECT STARTED', `Now researching ${res.node.name}.`, 'info');
    } catch (err: any) {
      addTacticalAlert('RESEARCH BLOCKED', err.message || 'Cannot start research', 'warn');
    }
  }, [settlement, addTacticalAlert]);

  const handleRepairVehicle = useCallback(
    (vehicleId: string) => {
      // §8 — repairs happen at a staffed Vehicle Workshop over time. The
      // vehicle must be parked in the bay; mechanics restore HP over
      // mechanic-hours while metal is consumed per HP healed. The instant
      // pay-metal → full-HP path no longer exists anywhere.
      const res = createVehicleWorkshopOrder(settlement, {
        type: 'repair',
        vehicleId,
      });
      if (!res.success || !res.newState) {
        addTacticalAlert('REPAIR FAILED', res.error || 'No staffed Vehicle Workshop nearby.', 'warn');
        return;
      }
      setSettlement(res.newState);
      addTacticalAlert(
        'REPAIR QUEUED',
        'Vehicle rolled into the workshop bay — mechanics restore it over time.',
        'success'
      );
    },
    [settlement, addTacticalAlert]
  );

  const handleRefuelVehicle = useCallback((vehicleId: string) => {
    setSettlement((prev) => {
      const veh = prev.vehicles.find((v) => v.id === vehicleId);
      if (!veh) return prev;
      const nearWarehouse = [
        ...Array.from(prev.adaptedBuildings.values()),
        ...(prev.freestandingBuildings || []),
      ].some((building) =>
        (building.typeId === 'warehouse' || building.typeId === 'storage_depot') &&
        building.constructionStatus === 'completed' && building.currentDurability > 0 &&
        !building.isUnderRepair && Math.hypot(building.position.x - veh.position.x, building.position.z - veh.position.z) <= 30
      );
      if (!nearWarehouse) {
        addTacticalAlert('REFUEL REQUIRES DELIVERY', 'Move a fuel item to the vehicle, or park it beside an operational Warehouse.', 'warn');
        return prev;
      }
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
      case 'focus_lair': {
        const lair = (settlement.zombieLairs instanceof Map
          ? Array.from(settlement.zombieLairs.values())
          : Object.values(settlement.zombieLairs || {})) as any[];
        const target = lair.find((l) => l && l.isDiscovered) || lair[0];
        if (target && mapData) {
          const b = mapData.buildings.find((x) => String(x.id) === String(target.buildingId));
          if (b) {
            setSelectedBuilding(b);
            setActiveSidebarTab('inspector');
            sceneRef.current?.cameraController.focusOn(b.center, 90);
          }
        }
        break;
      }
      case 'open_build_menu':
        setActiveSidebarTab('build');
        break;
      default:
        // focus_building:<id> — used by mission LOCATE actions to jump the
        // camera to a mission-bound target on the map.
        if (actionType.startsWith('focus_building:')) {
          const id = actionType.slice('focus_building:'.length);
          if (mapData) {
            const b = mapData.buildings.find((x) => String(x.id) === id);
            if (b) {
              setSelectedBuilding(b);
              setActiveSidebarTab('inspector');
              sceneRef.current?.cameraController.focusOn(b.center, 90);
            }
          }
        }
        break;
    }
  }, [mapData, settlement.squads, settlement.adaptedBuildings, settlement.zombieLairs, handleSetClockSpeed, radioDirectiveState?.transmissionLog]);

  return {
    handleAssaultThreat,
    handlePayRansom,
    handleRefuseRescue,
    handleUpdateCombatSquads,
    handleMountVehicle,
    handleDismountVehicle,
    handleOrderVehicleExtraction,
    handleOrderVehicleMove,
    handleOrderSquadAttack,
    handleStartSquadScavengeArea,
    handleDesignateSquadScavenge,
    handleOrderSquadRecall,
    handleOrderAllSquadsRecall: handleOrderAllSquadsRecall,
    handleSetClockSpeed,
    handleGrantFreshFood,
    handleDrainFoodStockpile,
    handleSetSeason,
    handleSetWeather,
    handleBuildGreenhouse,
    handleRepairBuilding,
    handleAssignGatherers,
    handleSearchBuilding,
    autoEquipScavengedGear,
    handleAssignWeapon,
    handleAssignTowerWeapon,
    handleAssignArmor,
    handleChangeSquadStance,
    handleStartResearchNode,
    handleRepairVehicle,
    handleRefuelVehicle,
    handleUpdateLaborAllocation,
    handleTriageSurvivor,
    handleDirectiveAction,
  };
}