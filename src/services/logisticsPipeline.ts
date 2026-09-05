import { SettlementState } from '../types/settlement';
import { MapData, Point2D } from '../types/map';
import { TacticalSquadUnit } from '../types/combat';
import { findNearestStorageDropoff, unloadSquadAtDropoff, unloadVehicleAtDropoff, isSquadInsideBuilding, isSquadAtBuilding } from './scavengingService';
import { deliverCarriedFuel } from './vehicleService';
import type { ToastMessage } from './soundService';

/** A squad delivering fuel counts as arrived when within this many meters. */
const FUEL_DELIVERY_RADIUS = 4;
/** If the target vehicle moved, re-path the carrier past this distance. */
const FUEL_CHASE_RADIUS = 6;

export function runLogisticsStage(state: SettlementState, map: MapData, squads: TacticalSquadUnit[]): { state: SettlementState; squads: TacticalSquadUnit[]; events: ToastMessage[] } {
  let nextState = state;
  const nextSquads = squads.map((squad) => ({ ...squad }));
  const events: ToastMessage[] = [];

  // Manual fuel delivery (§8): a squad carrying a fuel item to a vehicle pours
  // it into the tank on arrival. Runs BEFORE the depot-deposit loop so the
  // carried fuel can never be dropped off as loot at a storage depot en route.
  for (const squad of nextSquads) {
    if (!squad.pendingFuelDeliveryVehicleId) continue;
    const targetVeh = nextState.vehicles?.find((v) => v.id === squad.pendingFuelDeliveryVehicleId);
    // Vehicle dismantled / destroyed while the fuel was being carried: the can
    // stays in the backpack (it can be deposited or a new delivery ordered).
    if (!targetVeh) {
      squad.pendingFuelDeliveryVehicleId = null;
      continue;
    }
    const dist = Math.hypot(squad.x - targetVeh.position.x, squad.z - targetVeh.position.z);
    if (dist > FUEL_DELIVERY_RADIUS) {
      // Still walking. If the vehicle drove off, re-path toward its new spot so
      // the delivery never stalls on a stale position.
      if (dist > FUEL_CHASE_RADIUS) {
        squad.targetPos = { x: targetVeh.position.x, z: targetVeh.position.z };
        squad.state = 'moving';
      }
      continue;
    }
    const delivery = deliverCarriedFuel(nextState, squad, targetVeh);
    nextState = delivery.newState;
    Object.assign(squad, delivery.updatedSquad);
    if (delivery.deliveredLiters > 0) {
      events.push({
        title: 'FUEL DELIVERED',
        desc: `${squad.name} poured ${delivery.deliveredLiters.toFixed(0)}L of ${targetVeh.fuelType} into ${targetVeh.name}.`,
        type: 'success',
      });
    }
  }

  for (const squad of nextSquads) {
    // Off-map expedition squads never deposit — their haul comes home only
    // when the squad itself returns (manual recall).
    if (squad.onExpedition) continue;
    const inventory = nextState.squadInventories?.[squad.squadId];
    const vehicle = nextState.vehicles?.find((v) => v.assignedSquadId === squad.squadId);
    if (!inventory?.items?.length && !vehicle?.inventory?.length) continue;
    const dropoff = findNearestStorageDropoff(nextState, { x: squad.x, z: squad.z }, map.buildings);
    const building = map.buildings.find((b) => String(b.id) === String(dropoff.buildingId));
    // "Arrived" means inside the dropoff footprint OR immediately at it (within
    // the building's own radius plus a few metres). Strictly-inside-only left
    // squads parked beside large warehouses / the HQ forever when the auto
    // return or a manual move stopped just short of the centre point.
    const squadPos = { x: squad.x, z: squad.z };
    const atDropoff = building
      ? isSquadInsideBuilding(squadPos, building) || isSquadAtBuilding(squadPos, building, 5)
      : Math.hypot(squad.x - dropoff.x, squad.z - dropoff.z) <= 8;
    if (!atDropoff) continue;
    if (inventory?.items?.length) {
      const result = unloadSquadAtDropoff(nextState, squad.squadId, { x: squad.x, z: squad.z }, dropoff, 10);
      nextState = result.newState;
      if (result.unloaded.length) events.push({ title: 'SUPPLIES SECURED', desc: `${squad.name} deposited recovered supplies at ${dropoff.name}.`, type: 'success' });
    }
    if (vehicle?.inventory?.length) {
      nextState = unloadVehicleAtDropoff(nextState, vehicle, dropoff, 10).newState;
    }
  }
  return { state: nextState, squads: nextSquads, events };
}
