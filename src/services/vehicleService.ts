import { BuildingPolygon, MapData, Point2D, RoadSegment } from '../types/map';
import { SquadLootItem, StatTier } from '../types/population';
import { AdaptedBuilding, SettlementState } from '../types/settlement';
import {
  ScavengeFuelLoot,
  VEHICLE_DEFINITIONS,
  VehicleCondition,
  VehicleType,
  WorldVehicle,
} from '../types/vehicle';
import { CombatVisualFx, NoiseEvent, TacticalSquadUnit, ZombieUnit, getWeaponDefinition } from '../types/combat';
import { emitNoiseEvent } from './combatService';
import { RoadNetworkGraph } from './roadPathfinder';
import type { PathGrid } from './pathfindingService';
import {
  getFreestandingCollisionPolygon,
  isFreestandingGate,
} from './freestandingFootprint';

// ==========================================
// 1. Procedural World Vehicle Spawner (§8)
// ==========================================

export function generateWorldVehicles(
  mapData: MapData,
  seedNumber: number = 42
): WorldVehicle[] {
  const vehicles: WorldVehicle[] = [];
  const drivableRoads = mapData.roads.filter(
    (r) =>
      r.points &&
      r.points.length >= 2 &&
      r.highwayType !== 'footway' &&
      r.highwayType !== 'pedestrian'
  );

  let seed = Math.abs(seedNumber) + 101;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // Find high-interest anchor buildings (police, gas stations, warehouses, supermarkets, industrial)
  const gasStations = mapData.buildings.filter((b) => b.type === 'gas_station');
  const warehouses = mapData.buildings.filter((b) => b.type === 'warehouse' || b.type === 'industrial');
  const policeStations = mapData.buildings.filter((b) => b.type === 'police' || b.type === 'civic');
  const commercial = mapData.buildings.filter((b) => b.type === 'supermarket' || b.type === 'commercial');

  const graph = new RoadNetworkGraph(mapData.roads);

  const getValidRoadSpawn = (preferredNearPoint?: Point2D): { pos: Point2D; heading: number } => {
    if (preferredNearPoint) {
      const snap = graph.findClosestPointOnRoad(preferredNearPoint);
      if (snap.road && snap.point) {
        // Calculate tangent heading along this road segment
        let heading = 0;
        if (snap.road.points.length >= 2) {
          const p1 = snap.road.points[0];
          const p2 = snap.road.points[1];
          heading = Math.atan2(p2.z - p1.z, p2.x - p1.x);
        }
        return { pos: snap.point, heading };
      }
    }

    // Pick from drivable roads
    const roadPool = drivableRoads.length > 0 ? drivableRoads : mapData.roads;
    if (roadPool.length > 0) {
      const r = roadPool[Math.floor(rand() * roadPool.length)];
      if (r.points.length >= 2) {
        const segIdx = Math.floor(rand() * (r.points.length - 1));
        const p1 = r.points[segIdx];
        const p2 = r.points[segIdx + 1];
        const t = 0.2 + rand() * 0.6;
        const pos = {
          x: p1.x + (p2.x - p1.x) * t,
          z: p1.z + (p2.z - p1.z) * t,
        };
        const heading = Math.atan2(p2.z - p1.z, p2.x - p1.x);
        return { pos, heading };
      } else if (r.points.length === 1) {
        return { pos: { ...r.points[0] }, heading: 0 };
      }
    }

    return { pos: { x: 0, z: 0 }, heading: 0 };
  };

  // A road-snap can project into a building island or the road sample itself
  // can sit inside an overhanging footprint (bridging segments over courtyards
  // etc.). Reject blocked candidates and re-roll along the same road pool.
  const getClearRoadSpawn = (preferredNearPoint?: Point2D): { pos: Point2D; heading: number } => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const { pos, heading } = getValidRoadSpawn(attempt === 0 ? preferredNearPoint : undefined);
      if (!isVehiclePlacementBlocked(pos, mapData)) return { pos, heading };
    }
    // Spiral out from the last candidate to guarantee a clear placement.
    const last = getValidRoadSpawn();
    return { pos: unembedVehiclePosition(last.pos, mapData), heading: last.heading };
  };

  // 1. Guaranteed 1 Armed Truck near Police / Industrial / Military Checkpoint strictly on road
  const policeTarget = policeStations.length > 0 ? policeStations[Math.floor(rand() * policeStations.length)].center : undefined;
  const armedTruckSpawn = getClearRoadSpawn(policeTarget);

  const armedTruck = createWorldVehicleInstance(
    `veh_armed_truck_${Date.now()}_1`,
    'armed_truck',
    armedTruckSpawn.pos,
    rand() > 0.4 ? 'operational' : 'salvageable',
    rand()
  );
  armedTruck.rotation = armedTruckSpawn.heading;
  vehicles.push(armedTruck);

  // 2. Guaranteed 1-2 Cargo Vans near Warehouses / Supermarkets strictly on road
  const commPool = [...warehouses, ...commercial];
  const commTarget = commPool.length > 0 ? commPool[Math.floor(rand() * commPool.length)].center : undefined;
  const cargoVanSpawn = getClearRoadSpawn(commTarget);

  const cargoVan = createWorldVehicleInstance(
    `veh_cargo_van_${Date.now()}_1`,
    'cargo_van',
    cargoVanSpawn.pos,
    'operational',
    rand()
  );
  cargoVan.rotation = cargoVanSpawn.heading;
  vehicles.push(cargoVan);

  // 3. 2-3 Civilian Cars along drivable roads / near Gas stations
  const carCount = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < carCount; i++) {
    const gasTarget = gasStations.length > 0 && i === 0 ? gasStations[0].center : undefined;
    const carSpawn = getClearRoadSpawn(gasTarget);

    const car = createWorldVehicleInstance(
      `veh_car_${Date.now()}_${i + 1}`,
      'car',
      carSpawn.pos,
      rand() > 0.3 ? 'operational' : 'salvageable',
      rand()
    );
    car.rotation = carSpawn.heading;
    vehicles.push(car);
  }

  return vehicles;
}

export function createWorldVehicleInstance(
  id: string,
  type: VehicleType,
  pos: Point2D,
  condition: VehicleCondition = 'operational',
  randomFactor: number = 0.5
): WorldVehicle {
  const def = VEHICLE_DEFINITIONS[type];
  const initialFuel = condition === 'operational' ? Math.round(15 + randomFactor * 25) : Math.round(5 + randomFactor * 10);
  const hp = condition === 'operational' ? def.maxHp : Math.round(def.maxHp * 0.45);

  let turret = undefined;
  if (def.hasMountedTurret) {
    turret = {
      mountType: 'hmg_50cal' as const,
      rotation: 0,
      fireRate: def.turretFireRate || 0.35,
      lastFireTime: 0,
      damage: def.turretDamage || 38,
      range: def.turretRange || 36,
      targetZombieId: null,
    };
  }

  return {
    id,
    type,
    name: def.name,
    condition,
    position: { ...pos },
    rotation: randomFactor * Math.PI * 2,
    y: 0,
    currentHp: hp,
    maxHp: def.maxHp,
    fuelType: def.fuelType,
    currentFuel: initialFuel,
    maxFuel: def.maxFuel,
    fuelConsumptionPer100m: def.fuelConsumptionPer100m,
    assignedSquadId: null,
    assignedSquadName: undefined,
    turret,
    isMoving: false,
    roadPathWaypoints: [],
    currentWaypointIndex: 0,
    targetPos: null,
    speed: def.speedMps,
    // Found vehicles begin as unidentified/inert world objects. They become
    // discovered when a squad successfully boards them.
    isDiscovered: false,
    isSiphoned: false,
    isParkedAtHQ: false,
    totalDistanceDriven: 0,
    killCount: 0,
    inventory: [],
  };
}

// ==========================================
// 2b. Vehicle Cargo Bay (shared mounted-squad storage)
// ==========================================

/** Number of physical loot slots in a vehicle's cargo bay. */
export function getVehicleInventoryCapacity(vehicle: WorldVehicle): number {
  return VEHICLE_DEFINITIONS[vehicle.type]?.inventoryCapacity || 0;
}

/**
 * Moves carried loot from a squad into the vehicle's cargo bay, up to capacity.
 * Returns the updated vehicle and any items that did not fit (the squad keeps
 * those in its backpack).
 */
export function depositItemsIntoVehicle(
  vehicle: WorldVehicle,
  items: SquadLootItem[]
): { vehicle: WorldVehicle; overflow: SquadLootItem[] } {
  const bay = vehicle.inventory || [];
  const capacity = getVehicleInventoryCapacity(vehicle);
  const room = Math.max(0, capacity - bay.length);
  const transferred = items.slice(0, room);
  const overflow = items.slice(room);
  return {
    vehicle: { ...vehicle, inventory: [...bay, ...transferred] },
    overflow,
  };
}

// ==========================================
// 2. Vehicle Actions & Fuel Mechanics (§8)
// ==========================================

export function refuelVehicle(
  settlement: SettlementState,
  vehicle: WorldVehicle,
  amountLiters: number = 20,
  manualFuelItem = false
): { success: boolean; updatedStockpile: SettlementState['stockpile']; updatedVehicle: WorldVehicle; error?: string } {
  const neededFuel = vehicle.maxFuel - vehicle.currentFuel;
  if (neededFuel <= 0) {
    return {
      success: false,
      updatedStockpile: settlement.stockpile,
      updatedVehicle: vehicle,
      error: `${vehicle.name} fuel tank is already at 100% capacity.`,
    };
  }

  const transferAmount = Math.min(neededFuel, amountLiters);
  const fuelType = vehicle.fuelType; // 'gasoline' or 'diesel'
  const availableStock = settlement.stockpile.fuel[fuelType];
  // Manual refuelling represents carrying a fuel item to the vehicle; callers
  // must explicitly opt into that interaction rather than silently treating a
  // remote stockpile button as physical delivery.
  if (manualFuelItem && availableStock < amountLiters) {
    return { success: false, updatedStockpile: settlement.stockpile, updatedVehicle: vehicle, error: `No ${fuelType} fuel item available to carry to the vehicle.` };
  }

  if (availableStock < transferAmount) {
    return {
      success: false,
      updatedStockpile: settlement.stockpile,
      updatedVehicle: vehicle,
      error: `Insufficient ${fuelType} in colony stockpile. Have: ${availableStock.toFixed(1)}L, Required: ${transferAmount.toFixed(1)}L.`,
    };
  }

  const updatedStockpile = {
    ...settlement.stockpile,
    fuel: {
      ...settlement.stockpile.fuel,
      [fuelType]: availableStock - transferAmount,
    },
  };

  const updatedVehicle: WorldVehicle = {
    ...vehicle,
    currentFuel: Math.min(vehicle.maxFuel, vehicle.currentFuel + transferAmount),
  };

  return {
    success: true,
    updatedStockpile,
    updatedVehicle,
  };
}

// ==========================================
// 2c. Manual Fuel-Item Delivery (§8, IFZ refueling)
// ==========================================

/**
 * IFZ-style manual refuelling: fuel is NOT teleported from the stockpile into
 * the tank. Instead the colony withdraws a physical fuel item from the
 * stockpile into a squad's backpack, that squad carries it to the vehicle, and
 * the fuel transfers when the squad arrives (deliverCarriedFuel). The
 * warehouse-proximity auto-refuel is the only instant path.
 *
 * Refuses when the tank is full, the stockpile lacks the fuel, the squad has no
 * free backpack slot, or the squad is already carrying a delivery.
 */
export function startManualFuelDelivery(
  settlement: SettlementState,
  vehicle: WorldVehicle,
  squad: TacticalSquadUnit,
  amountLiters: number = 25
): { success: boolean; newState?: SettlementState; updatedSquad?: TacticalSquadUnit; error?: string } {
  const neededFuel = vehicle.maxFuel - vehicle.currentFuel;
  if (neededFuel <= 0) {
    return { success: false, error: `${vehicle.name}'s fuel tank is already full.` };
  }
  const fuelType = vehicle.fuelType;
  const transferAmount = Math.min(neededFuel, amountLiters);
  if (transferAmount < 1) {
    return { success: false, error: `The tank needs less than 1L — not worth carrying a can over.` };
  }
  const availableStock = settlement.stockpile.fuel[fuelType] || 0;
  if (availableStock < transferAmount) {
    return {
      success: false,
      error: `Only ${availableStock.toFixed(1)}L ${fuelType} in reserve — a ${transferAmount.toFixed(0)}L carry is not possible.`,
    };
  }

  const alive = squad.members.filter((m) => m.isAlive).length;
  if (alive <= 0) return { success: false, error: `${squad.name} is incapacitated and cannot carry fuel.` };
  if (squad.pendingFuelDeliveryVehicleId) {
    return { success: false, error: `${squad.name} is already carrying a fuel delivery to another vehicle.` };
  }
  // One backpack slot per living member — the same rule scavenging uses.
  const inv = settlement.squadInventories?.[squad.squadId];
  const used = inv ? inv.items.length : 0;
  if (used >= alive) {
    return { success: false, error: `${squad.name} has no free backpack slot to carry the fuel item.` };
  }

  const item: SquadLootItem = {
    id: `fuel_${fuelType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'resource',
    // Uses the same label scavenged fuel uses, so an undelivered can is
    // deposited back into the stockpile at any storage dropoff.
    label: fuelType,
    quantity: Math.round(transferAmount),
    weight: 1,
  };

  const updatedInv = inv
    ? { ...inv, used: used + 1, items: [...inv.items, item] }
    : { capacity: alive, used: 1, items: [item] };
  const updatedStockpile = {
    ...settlement.stockpile,
    fuel: {
      ...settlement.stockpile.fuel,
      [fuelType]: availableStock - transferAmount,
    },
  };
  const updatedSquad: TacticalSquadUnit = {
    ...squad,
    pendingFuelDeliveryVehicleId: vehicle.id,
    // Walk to the vehicle (general targetPos pathing). Not a manualOrder: that
    // flag is reserved for genuine player orders and is cleared on arrival.
    targetPos: { x: vehicle.position.x, z: vehicle.position.z },
    state: 'moving',
    targetZombieId: null,
    targetBuildingId: null,
    targetBuildingName: null,
  };

  return {
    success: true,
    newState: {
      ...settlement,
      stockpile: updatedStockpile,
      squadInventories: {
        ...(settlement.squadInventories || {}),
        [squad.squadId]: updatedInv,
      },
    },
    updatedSquad,
  };
}

/**
 * Chooses the squad that will carry a fuel item to `vehicle`:
 * 1. The vehicle's own mounted squad (already standing at the tank), else
 * 2. The nearest unmounted squad with a free backpack slot and no delivery in
 *    flight. Returns null when nobody can carry the fuel.
 */
export function pickFuelCarrierSquad(
  settlement: SettlementState,
  vehicle: WorldVehicle,
  squads: TacticalSquadUnit[]
): TacticalSquadUnit | null {
  const canCarry = (s: TacticalSquadUnit): boolean => {
    const alive = s.members.filter((m) => m.isAlive).length;
    if (alive <= 0 || s.pendingFuelDeliveryVehicleId) return false;
    const inv = settlement.squadInventories?.[s.squadId];
    const used = inv ? inv.items.length : 0;
    return used < alive;
  };

  if (vehicle.assignedSquadId) {
    const mounted = squads.find((s) => s.squadId === vehicle.assignedSquadId);
    if (mounted && canCarry(mounted)) return mounted;
  }

  let best: TacticalSquadUnit | null = null;
  let bestDist = Infinity;
  for (const s of squads) {
    if (s.mountedVehicleId || s.pendingMountVehicleId) continue;
    if (!canCarry(s)) continue;
    const d = Math.hypot(s.x - vehicle.position.x, s.z - vehicle.position.z);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

/**
 * A squad carrying a fuel item has arrived at the vehicle: pour the carried
 * fuel into the tank (capped at maxFuel), consume the item from the backpack,
 * and clear the delivery flag. Non-fuel items in the backpack are untouched.
 */
export function deliverCarriedFuel(
  state: SettlementState,
  squad: TacticalSquadUnit,
  vehicle: WorldVehicle
): { newState: SettlementState; updatedSquad: TacticalSquadUnit; deliveredLiters: number } {
  const inv = state.squadInventories?.[squad.squadId];
  const carried = (inv?.items || []).filter((i) => i.label === vehicle.fuelType);
  const carriedLiters = carried.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const room = vehicle.maxFuel - vehicle.currentFuel;
  const deliveredLiters = Math.min(room, carriedLiters);

  // Tank already full or nothing carried → just clear the flag.
  if (deliveredLiters <= 0 || !inv) {
    return { newState: state, updatedSquad: { ...squad, pendingFuelDeliveryVehicleId: null }, deliveredLiters: 0 };
  }

  // Consume exactly `deliveredLiters` from the carried fuel stacks (in order,
  // reducing quantity; drop stacks that hit zero). Other items stay.
  let remaining = deliveredLiters;
  const nextItems: SquadLootItem[] = [];
  for (const item of inv.items) {
    if (item.label === vehicle.fuelType && remaining > 0) {
      const take = Math.min(item.quantity, remaining);
      remaining -= take;
      const leftover = item.quantity - take;
      if (leftover > 0) nextItems.push({ ...item, quantity: leftover });
    } else {
      nextItems.push(item);
    }
  }

  const updatedVehicle: WorldVehicle = {
    ...vehicle,
    currentFuel: Math.min(vehicle.maxFuel, vehicle.currentFuel + deliveredLiters),
  };

  return {
    newState: {
      ...state,
      vehicles: (state.vehicles || []).map((v) => (v.id === vehicle.id ? updatedVehicle : v)),
      squadInventories: {
        ...(state.squadInventories || {}),
        [squad.squadId]: { ...inv, used: nextItems.length, items: nextItems },
      },
    },
    updatedSquad: { ...squad, pendingFuelDeliveryVehicleId: null },
    deliveredLiters,
  };
}

export function siphonVehicleFuel(
  settlement: SettlementState,
  vehicle: WorldVehicle
): { success: boolean; updatedStockpile: SettlementState['stockpile']; updatedVehicle: WorldVehicle; siphonedAmount: number } {
  if (vehicle.isSiphoned || vehicle.currentFuel <= 0) {
    return {
      success: false,
      updatedStockpile: settlement.stockpile,
      updatedVehicle: vehicle,
      siphonedAmount: 0,
    };
  }

  const amount = Math.floor(vehicle.currentFuel);
  const fuelType = vehicle.fuelType;

  const updatedStockpile = {
    ...settlement.stockpile,
    fuel: {
      ...settlement.stockpile.fuel,
      [fuelType]: settlement.stockpile.fuel[fuelType] + amount,
    },
  };

  const updatedVehicle: WorldVehicle = {
    ...vehicle,
    currentFuel: 0,
    isSiphoned: true,
  };

  return {
    success: true,
    updatedStockpile,
    updatedVehicle,
    siphonedAmount: amount,
  };
}

// ==========================================
// 3. Squad Mounting & Driving Dispatcher
// ==========================================

export function mountSquadToVehicle(
  vehicle: WorldVehicle,
  squad: TacticalSquadUnit
): { updatedVehicle: WorldVehicle; updatedSquad: TacticalSquadUnit } {
  const updatedVehicle: WorldVehicle = {
    ...vehicle,
    assignedSquadId: squad.squadId,
    assignedSquadName: squad.name,
  };

  const updatedSquad: TacticalSquadUnit = {
    ...squad,
    mountedVehicleId: vehicle.id,
    x: vehicle.position.x,
    z: vehicle.position.z,
    state: 'idle',
  };

  return { updatedVehicle, updatedSquad };
}

export function dismountSquadFromVehicle(
  vehicle: WorldVehicle,
  squad: TacticalSquadUnit
): { updatedVehicle: WorldVehicle; updatedSquad: TacticalSquadUnit } {
  const updatedVehicle: WorldVehicle = {
    ...vehicle,
    assignedSquadId: null,
    assignedSquadName: undefined,
    isMoving: false,
    roadPathWaypoints: [],
    currentWaypointIndex: 0,
    targetPos: null,
    autoDepotReturn: false,
    autoScavengeBuildingId: null,
    autoScavengeBuildingName: null,
    offRoadLegDistance: 0,
    reachBlocked: false,
  };

  // Place squad just to the side of the vehicle
  const sideAngle = vehicle.rotation + Math.PI / 2;
  const updatedSquad: TacticalSquadUnit = {
    ...squad,
    mountedVehicleId: undefined,
    // Fully sever the vehicle link so the squad is a clean on-foot unit: a stale
    // assignedVehicleId / pendingMount / manualOrder would otherwise make the next
    // move order (or a low-fuel vehicle) swallow the squad's on-foot movement.
    assignedVehicleId: null,
    pendingMountVehicleId: null,
    manualOrder: false,
    x: vehicle.position.x + Math.cos(sideAngle) * 2.5,
    z: vehicle.position.z + Math.sin(sideAngle) * 2.5,
    state: 'idle',
    targetPos: null,
    targetBuildingId: null,
    targetBuildingName: null,
  };

  return { updatedVehicle, updatedSquad };
}

export function orderVehicleRoadTravel(
  vehicle: WorldVehicle,
  targetPos: Point2D,
  roadGraph: RoadNetworkGraph,
  blockedPolys?: Point2D[][],
  mapData?: MapData,
  pathGrid?: PathGrid | null
): WorldVehicle {
  if (vehicle.currentFuel <= 0) {
    return vehicle;
  }

  // Calculate route along real OSM road network, avoiding road edges that cross
  // player-built wall/tower footprints when provided.
  const route = roadGraph.findRoute(vehicle.position, targetPos, blockedPolys);
  //
  // The graph's first waypoint is the projection of the vehicle's position onto
  // the nearest road. When the vehicle starts OFF road that projection is often
  // NOT reachable — a building, water or player wall can sit between the vehicle
  // and the road (or the snap can even land inside an obstacle), and since the
  // tick validates every step against the map, the vehicle blocked before its
  // first waypoint and froze permanently. Road-first is a preference, not an
  // absolute rule: if the straight line to that snap point is obstructed, skip
  // it and drive from wherever the vehicle actually is — the road leg then
  // starts at the first *network* node, or the vehicle goes direct if even that
  // is unreachable.
  const firstSnap = route[0];
  const snapReachable =
    !firstSnap ||
    !isBlockedSegmentClearance(vehicle.position, firstSnap, mapData, blockedPolys);
  const baseWaypoints =
    route.length > 1 && snapReachable
      ? route
      : snapReachable
      ? [roadGraph.findClosestPointOnRoad(vehicle.position).point]
      : route.length > 1
      ? route.slice(1)
      : [];

  // Off-road final leg: cars stay on the road as far as they can and only leave
  // it to reach an off-road destination (e.g. a structure with no road access).
  // The vehicle drives that leg at a reduced speed (see updateVehiclesTick).
  const roadEnd = baseWaypoints[baseWaypoints.length - 1];
  const offRoadLegDistance = Math.hypot(roadEnd.x - targetPos.x, roadEnd.z - targetPos.z);
  const waypoints =
    offRoadLegDistance > 2.0
      ? [...baseWaypoints, { x: targetPos.x, z: targetPos.z }]
      : baseWaypoints;

  // The road graph only routes along road segments — its "route" from an
  // off-road vehicle is a straight hop onto the network, and when even that
  // is obstructed the fallback above is a straight line to the destination.
  // A building sitting between the two (mounted squad parked in a courtyard,
  // vehicle ordered out of a walled compound) would be driven straight into:
  // the first blocked step stops the van mid-building forever. When the road
  // route is unusable AND the straight shot is obstructed, ask the shared
  // PathGrid for a building-avoiding footpath-style detour. Vehicles can't
  // cross buildings (their tick forbids it), so we keep only the clear
  // stretches and verify every hop.
  const straightBlocked = isBlockedSegmentClearance(vehicle.position, targetPos, mapData, blockedPolys);
  const roadRouteUsable = waypoints.length > 0 && (
    waypoints.length > 1 || !isBlockedSegmentClearance(vehicle.position, waypoints[0], mapData, blockedPolys)
  );
  if (!roadRouteUsable && straightBlocked && pathGrid && mapData) {
    const gridPath = pathGrid.findPath(vehicle.position.x, vehicle.position.z, targetPos.x, targetPos.z, { gatesOpen: true, wallsImpassable: false });
    if (gridPath && gridPath.length >= 2) {
      // Verify the grid route with the vehicle's clearance model and keep the
      // segments that are actually drivable; a purely-walled detour is worse
      // than stopping short.
      const drivable: Point2D[] = [];
      let prev = vehicle.position;
      for (const node of [...gridPath, targetPos]) {
        if (node.x === prev.x && node.z === prev.z) continue;
        if (!isBlockedSegmentClearance(prev, node, mapData, blockedPolys)) {
          drivable.push({ x: node.x, z: node.z });
          prev = node;
        }
      }
      if (drivable.length >= 2) {
        return {
          ...vehicle,
          isMoving: true,
          roadPathWaypoints: drivable,
          currentWaypointIndex: 0,
          targetPos,
          offRoadLegDistance: 0,
          reachBlocked: false,
        };
      }
    }
  }

  return {
    ...vehicle,
    isMoving: waypoints.length > 0,
    roadPathWaypoints: waypoints,
    currentWaypointIndex: 0,
    targetPos,
    offRoadLegDistance: offRoadLegDistance > 2.0 ? offRoadLegDistance : 0,
    // A fresh order: the vehicle is no longer stopped short of a blocked target.
    reachBlocked: false,
  };
}

// Off-road speed multiplier: leaving the road network costs the vehicle 40%
// of its top speed, so road-first routing is almost always worth it.
const OFF_ROAD_SPEED_FACTOR = 0.6;

// ==========================================
// 4. Vehicle Real-Time Simulation Tick (§8)
// ==========================================

function isPointInsidePolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function isBlockedByMap(
  point: Point2D,
  mapData?: MapData,
  freestandingPolys?: Point2D[][]
): boolean {
  if (!mapData) return false;
  if ((mapData.landuse || []).some((l) => l.type === 'water' && isPointInsidePolygon(point, l.polygon))) return true;
  if (mapData.buildings.some((b) => b.polygon?.length >= 3 && isPointInsidePolygon(point, b.polygon))) return true;
  if (freestandingPolys) {
    for (const poly of freestandingPolys) {
      if (poly.length >= 3 && isPointInsidePolygon(point, poly)) return true;
    }
  }
  return false;
}

// Vehicle body half-width — segment reachability checks keep this much clearance
// so a route that "fits" geometrically doesn't clip a building corner mid-drive.
const VEHICLE_HALF_WIDTH = 1.6;

/**
 * True when a vehicle body centred at `point` overlaps nothing it can't occupy:
 * buildings, water, or player-built walls/towers. Used both to validate spawn
 * placements and to recover vehicles that ended up embedded in a footprint.
 */
export function isVehiclePlacementBlocked(
  point: Point2D,
  mapData?: MapData,
  freestandingPolys?: Point2D[][]
): boolean {
  const nx = 0, nz = 1; // orientation-agnostic: check a small square around centre
  const off = VEHICLE_HALF_WIDTH * 0.8;
  const probes: Point2D[] = [
    point,
    { x: point.x + off, z: point.z },
    { x: point.x - off, z: point.z },
    { x: point.x, z: point.z + off },
    { x: point.x, z: point.z - off },
    { x: point.x + nx * off, z: point.z + nz * off },
  ];
  return probes.some((p) => isBlockedByMap(p, mapData, freestandingPolys));
}

/**
 * Nudges an embedded vehicle out of any footprint it overlaps: walks outward
 * along a spiral until it finds a clear spot (or gives up after 12m and just
 * returns the last candidate, which is always better than deep-embedded).
 * Mounted-squad sync copies position from the vehicle on the next tick, so the
 * squad comes along automatically.
 */
export function unembedVehiclePosition(
  pos: Point2D,
  mapData?: MapData,
  freestandingPolys?: Point2D[][]
): Point2D {
  if (!isVehiclePlacementBlocked(pos, mapData, freestandingPolys)) return pos;
  const step = 1.5;
  for (let ring = 1; ring <= 8; ring++) {
    const radius = step * ring;
    const probes = Math.max(8, ring * 6);
    for (let i = 0; i < probes; i++) {
      const ang = (i / probes) * Math.PI * 2 + ring * 0.35;
      const candidate = { x: pos.x + Math.cos(ang) * radius, z: pos.z + Math.sin(ang) * radius };
      if (!isVehiclePlacementBlocked(candidate, mapData, freestandingPolys)) return candidate;
    }
  }
  // Even the fallback beats staying embedded: the tick's blocked-step check
  // wipes movement orders and leaves such a vehicle permanently unreachable.
  return pos;
}

/**
 * True when the straight line from `a` to `b` is obstructed for a vehicle: any
 * sampled point along it (plus lateral clearance offsets) hits a building,
 * water or player-built footprint. Used to decide whether a road-graph snap
 * point is actually drivable from the vehicle's position — roads are preferred,
 * never mandatory.
 */
function isBlockedSegmentClearance(
  a: Point2D,
  b: Point2D,
  mapData?: MapData,
  freestandingPolys?: Point2D[][]
): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return isBlockedByMap(b, mapData, freestandingPolys);

  // Lateral unit vector for the clearance offsets.
  const nx = -dz / len;
  const nz = dx / len;

  const samples = Math.max(2, Math.ceil(len / 2.5));
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    // Centre + both flanks: a corner graze blocks the whole segment.
    if (
      isBlockedByMap({ x: px, z: pz }, mapData, freestandingPolys) ||
      isBlockedByMap({ x: px + nx * VEHICLE_HALF_WIDTH, z: pz + nz * VEHICLE_HALF_WIDTH }, mapData, freestandingPolys) ||
      isBlockedByMap({ x: px - nx * VEHICLE_HALF_WIDTH, z: pz - nz * VEHICLE_HALF_WIDTH }, mapData, freestandingPolys)
    ) {
      return true;
    }
  }
  return false;
}

export interface VehicleTickResult {
  updatedVehicles: WorldVehicle[];
  updatedSquads: TacticalSquadUnit[];
  updatedZombies: ZombieUnit[];
  visualFx: CombatVisualFx[];
  noiseEvents: NoiseEvent[];
  notifications: Array<{ title: string; desc: string; type: 'info' | 'warn' }>;
}

export function updateVehiclesTick(
  vehicles: WorldVehicle[],
  squads: TacticalSquadUnit[],
  zombies: ZombieUnit[],
  effectiveDeltaSec: number,
  now: number,
  mapData?: MapData,
  roadGraph?: RoadNetworkGraph | null,
  freestandingBuildings?: AdaptedBuilding[],
  freestandingRevision = 0,
  ammoPool?: { value: number },
  pathGrid?: PathGrid | null
): VehicleTickResult {
  const visualFx: CombatVisualFx[] = [];
  const noiseEvents: NoiseEvent[] = [];
  const notifications: Array<{ title: string; desc: string; type: 'info' | 'warn' }> = [];

  // Precompute player-built wall/tower footprints once per tick so vehicles can
  // never drive through new construction. Gates stay open.
  const freestandingPolys: Point2D[][] = (freestandingBuildings || [])
    .filter((f) => !isFreestandingGate(f.typeId))
    .map((f) => getFreestandingCollisionPolygon(f));

  const squadsMap = new Map<string, TacticalSquadUnit>(squads.map((s) => [s.squadId, { ...s }]));
  const zombiesList = zombies.map((z) => ({ ...z }));

  const updatedVehicles = vehicles.map((veh) => {
    let current = { ...veh };

    // Recovery: a vehicle parked inside a building/water footprint (legacy spawn,
    // HQ-center arrival, workshop bay inside a footprint) can never move — every
    // step fails the blocked check, so it strands forever and is unclickable for
    // boarding. Nudge it to the nearest clear spot; a mounted squad syncs to the
    // vehicle's position later in this same tick.
    if (mapData && !current.isMoving && isVehiclePlacementBlocked(current.position, mapData, freestandingPolys)) {
      const before = { ...current.position };
      current.position = unembedVehiclePosition(current.position, mapData, freestandingPolys);
      if (current.position.x !== before.x || current.position.z !== before.z) {
        notifications.push({
          title: 'VEHICLE RELOCATED',
          desc: `${current.name} was parked inside a structure and has been moved to clear ground.`,
          type: 'info',
        });
      }
    }

    // Self-heal the mount link: the squad's mountedVehicleId is the authoritative
    // source (it flows through a ref-protected commit), while the vehicle's
    // assignedSquadId can be lost by a stale settlement commit racing the tick.
    // If a squad reports riding this vehicle, restore the vehicle-side link so the
    // drawer, click-to-select-squad, and dismount all see a consistent state.
    if (!current.assignedSquadId) {
      for (const [sqId, sq] of squadsMap.entries()) {
        if (sq.mountedVehicleId === current.id && sq.currentHp > 0) {
          current.assignedSquadId = sq.squadId;
          current.assignedSquadName = sq.name;
          current.isDiscovered = true;
          break;
        }
      }
    }

    // Check if any squad has a pending mount order towards this vehicle and has arrived
    for (const [sqId, sq] of squadsMap.entries()) {
      if (sq.pendingMountVehicleId === current.id && !current.assignedSquadId && current.condition !== 'wrecked') {
        const dist = Math.hypot(sq.x - current.position.x, sq.z - current.position.z);
        if (dist <= 3.8) {
          current.assignedSquadId = sq.squadId;
          current.assignedSquadName = sq.name;
          current.isDiscovered = true;
          sq.mountedVehicleId = current.id;
          sq.pendingMountVehicleId = null;
          sq.state = 'idle';
          sq.targetPos = null;
          sq.x = current.position.x;
          sq.z = current.position.z;
          squadsMap.set(sqId, sq);
          notifications.push({
            title: 'SQUAD BOARDED VEHICLE',
            desc: `${sq.name} successfully boarded ${current.name}.`,
            type: 'info',
          });
        }
      }
    }

    // 1. Check if mounted squad exists
    const mountedSquad = current.assignedSquadId ? squadsMap.get(current.assignedSquadId) : null;

    // Invalidate a stale route: if freestanding walls/towers/gates were placed
    // or removed since this route was computed, drop the cached waypoints and
    // re-route so the vehicle immediately goes around new construction instead
    // of driving into it and stalling at the contact check. Only routes that
    // were STAMPED with an older revision are invalidated — a freshly ordered
    // route (no stamp yet) drives immediately, otherwise every new order would
    // dead-stop its first tick whenever no freestanding obstacles exist to
    // trigger a re-route.
    if (
      current.isMoving &&
      current.roadPathWaypoints.length > 0 &&
      current.currentFuel > 0 &&
      current.routeRevision !== undefined &&
      current.routeRevision !== freestandingRevision
    ) {
      const stalled = {
        ...current,
        isMoving: false,
        roadPathWaypoints: [],
        currentWaypointIndex: 0,
      };
      // Stamp the revision regardless of whether a re-route is possible, so we
      // don't re-evaluate the same stale route every tick; a future obstacle
      // change bumps the revision again and triggers a fresh check.
      current = { ...stalled, routeRevision: freestandingRevision };
      if (roadGraph && stalled.targetPos && freestandingPolys.length > 0) {
        const rerouted = orderVehicleRoadTravel(stalled, stalled.targetPos, roadGraph, freestandingPolys, mapData, pathGrid);
        if (rerouted.isMoving && rerouted.roadPathWaypoints.length > 0) {
          current = { ...rerouted, routeRevision: freestandingRevision };
        }
      }
    }

    // 2. Road Navigation & Fuel Consumption
    if (current.isMoving && current.roadPathWaypoints.length > 0 && current.currentFuel > 0) {
      const targetWp = current.roadPathWaypoints[current.currentWaypointIndex];

      if (targetWp) {
        const dx = targetWp.x - current.position.x;
        const dz = targetWp.z - current.position.z;
        const distToWp = Math.hypot(dx, dz);

        if (distToWp > 0.8) {
          // Cars stay on the road network as long as possible and only leave it
          // for the final leg (the appended off-road waypoint). Off-road driving
          // is slower — a speed penalty for leaving the asphalt.
          const isOffRoadStep =
            (current.offRoadLegDistance || 0) > 0 &&
            current.currentWaypointIndex === current.roadPathWaypoints.length - 1;
          const stepSpeed = isOffRoadStep ? current.speed * OFF_ROAD_SPEED_FACTOR : current.speed;
          const moveStep = Math.min(distToWp, stepSpeed * effectiveDeltaSec);
          const moveFraction = moveStep / distToWp;

          const newX = current.position.x + dx * moveFraction;
          const newZ = current.position.z + dz * moveFraction;
          // Never allow a vehicle footprint to enter buildings or water. Instead
          // of dead-stopping on a malformed/legacy route, re-route from the
          // current position toward the original destination so the vehicle finds
          // a drivable path around the obstruction.
          if (isBlockedByMap({ x: newX, z: newZ }, mapData, freestandingPolys)) {
            if (isOffRoadStep) {
              // The off-road leg runs into a building/water footprint — the
              // destination itself is not drivable (e.g. an order targeted at a
              // point inside the HQ/buildings, which vehicles must never enter).
              // Stop short at the nearest drivable point and treat the vehicle
              // as ARRIVED: clear targetPos and mark reachBlocked so App-side
              // parked logic (deposit dismount, queue dispatch) takes over
              // instead of considering the vehicle perpetually en route.
              current.isMoving = false;
              current.roadPathWaypoints = [];
              current.currentWaypointIndex = 0;
              current.offRoadLegDistance = 0;
              current.targetPos = null;
              current.reachBlocked = true;
              return current;
            }
            if (roadGraph && current.targetPos && current.currentFuel > 0) {
              const stalled = {
                ...current,
                isMoving: false,
                roadPathWaypoints: [],
                currentWaypointIndex: 0,
              };
              const reroute = orderVehicleRoadTravel(stalled, current.targetPos, roadGraph, freestandingPolys, mapData, pathGrid);
              if (reroute.isMoving && reroute.roadPathWaypoints.length > 0) {
                current = reroute;
                return current;
              }
            }
            current.isMoving = false;
            current.targetPos = null;
            current.roadPathWaypoints = [];
            current.currentWaypointIndex = 0;
            current.offRoadLegDistance = 0;
            return current;
          }
          const newRot = Math.atan2(dx, dz);

          // Fuel consumption calculation (§8)
          const fuelBurn = (moveStep / 100) * current.fuelConsumptionPer100m;
          const newFuel = Math.max(0, current.currentFuel - fuelBurn);

          current.position = { x: newX, z: newZ };
          current.rotation = newRot;
          current.currentFuel = newFuel;
          current.totalDistanceDriven += moveStep;

          // Engine noise while driving: a moving vehicle is a steady auditory
          // beacon — emit reliably (not a random chance) so zombies in hearing
          // range (engine radius * variant hearing multiplier) investigate the
          // vehicle's current position. The event + ripple are both surfaced so
          // the visual ring matches the acoustic attractor.
          {
            const { event, visualFx: ringFx } = emitNoiseEvent('engine', newX, newZ, `${current.name} Engine`);
            noiseEvents.push(event);
            visualFx.push(ringFx);
          }

          // Kinetic Zombie Ramming on Road (§8)
          for (const z of zombiesList) {
            if (z.currentHp <= 0) continue;
            const distToZombie = Math.hypot(z.x - newX, z.z - newZ);
            if (distToZombie < 2.4) {
              const ramDamage = Math.round(55 + Math.random() * 30);
              z.currentHp = Math.max(0, z.currentHp - ramDamage);
              current.currentHp = Math.max(0, current.currentHp - 2); // slight vehicle armor wear

              visualFx.push({
                id: `ram-${z.id}-${now}`,
                type: 'blood_splatter',
                startX: z.x,
                startY: 1.0,
                startZ: z.z,
                text: `-${ramDamage} RAM`,
                color: '#ef4444',
                createdAt: now,
                durationMs: 700,
              });

              if (z.currentHp <= 0) {
                current.killCount += 1;
                visualFx.push({
                  id: `zdead-${z.id}-${now}`,
                  type: 'zombie_death',
                  startX: z.x,
                  startY: 0.5,
                  startZ: z.z,
                  createdAt: now,
                  durationMs: 1200,
                });
              }
            }
          }

          // Out of fuel check
          if (newFuel <= 0) {
            current.isMoving = false;
            notifications.push({
              title: 'VEHICLE OUT OF FUEL',
              desc: `${current.name} has run out of fuel and stalled on the road.`,
              type: 'warn',
            });
          }
        } else {
          // Advance to next waypoint on road network
          current.currentWaypointIndex += 1;
          if (current.currentWaypointIndex >= current.roadPathWaypoints.length) {
            current.isMoving = false;
            current.roadPathWaypoints = [];
            current.currentWaypointIndex = 0;
            current.offRoadLegDistance = 0;
            const finalPos = current.targetPos;
            current.targetPos = null;

            // If this vehicle was dispatched on an Auto-Scavenge run to a building:
            if (current.autoScavengeBuildingId && current.assignedSquadId) {
              const sq = squadsMap.get(current.assignedSquadId);
              if (sq) {
                const bldgId = current.autoScavengeBuildingId;
                const bldgName = current.autoScavengeBuildingName;
                const dismounted = dismountSquadFromVehicle(current, sq);
                current = dismounted.updatedVehicle;
                current.autoScavengeBuildingId = null;
                current.autoScavengeBuildingName = null;

                const squadScavenge: TacticalSquadUnit = {
                  ...dismounted.updatedSquad,
                  targetBuildingId: bldgId,
                  targetBuildingName: bldgName,
                  assignedVehicleId: current.id,
                  targetPos: finalPos ? { ...finalPos } : { x: current.position.x, z: current.position.z },
                  state: 'moving',
                };
                squadsMap.set(squadScavenge.squadId, squadScavenge);
                notifications.push({
                  title: 'SQUAD DISMOUNTED TO RECON',
                  desc: `${sq.name} dismounted from ${current.name} to search ${bldgName || 'building'}.`,
                  type: 'info',
                });
              }
            }
          }
        }
      }
    }

    // Sync mounted squad position to vehicle
    const activeSquad = current.assignedSquadId ? squadsMap.get(current.assignedSquadId) : null;
    if (activeSquad) {
      activeSquad.x = current.position.x;
      activeSquad.z = current.position.z;
      activeSquad.y = current.y || 0;
      activeSquad.rotation = current.rotation;
      activeSquad.state = current.isMoving ? 'moving' : 'idle';
      squadsMap.set(activeSquad.squadId, activeSquad);
    }

    // Mounted squads retain their own weapons and can fire from the vehicle.
    // The vehicle is their firing position; the squad's weapon/ammo stats remain
    // authoritative, while the vehicle turret (when present) fires separately.
    if (mountedSquad && current.condition === 'operational') {
      const aliveMembers = mountedSquad.members.filter((member) => member.isAlive);
      const rangedMembers = aliveMembers.filter((member) => {
        const weapon = getWeaponDefinition(member.weaponId);
        return weapon.ammoPerVolley > 0;
      });
      const volleyAmmo = rangedMembers.reduce((sum, member) => sum + getWeaponDefinition(member.weaponId).ammoPerVolley, 0);
      const target = zombiesList
        .filter((z) => z.currentHp > 0)
        .map((z) => ({ zombie: z, distance: Math.hypot(z.x - current.position.x, z.z - current.position.z) }))
        .filter(({ distance }) => distance <= Math.max(8.5, mountedSquad.attackRange))
        .sort((a, b) => a.distance - b.distance)[0];
      if (target && rangedMembers.length > 0 && (ammoPool?.value ?? 0) >= volleyAmmo && now - mountedSquad.lastFireTime >= mountedSquad.fireRate * 1000) {
        mountedSquad.lastFireTime = now;
        if (ammoPool) ammoPool.value -= volleyAmmo;
        const damage = Math.max(1, Math.round(mountedSquad.damagePerVolley * (0.85 + Math.random() * 0.3)));
        target.zombie.currentHp = Math.max(0, target.zombie.currentHp - damage);
        mountedSquad.killCount += target.zombie.currentHp <= 0 ? 1 : 0;
        visualFx.push({ id: `vehicle-squad-muzzle-${current.id}-${now}`, type: 'muzzle_flash', startX: current.position.x, startY: 1.5, startZ: current.position.z, createdAt: now, durationMs: 100 });
        visualFx.push({ id: `vehicle-squad-tracer-${current.id}-${now}`, type: 'bullet_tracer', startX: current.position.x, startY: 1.5, startZ: current.position.z, endX: target.zombie.x, endY: 1.2, endZ: target.zombie.z, createdAt: now, durationMs: 140 });
        visualFx.push({ id: `vehicle-squad-dmg-${target.zombie.id}-${now}`, type: 'damage_number', startX: target.zombie.x, startY: 2.2, startZ: target.zombie.z, text: `-${damage}`, color: '#f87171', createdAt: now, durationMs: 800 });
        emitNoiseEvent('gunfire', current.position.x, current.position.z, `${mountedSquad.name} Vehicle Fire`);
      }
    }

    // 3. Armed Truck Mounted Turret Combat (§8)
    if (current.type === 'armed_truck' && current.turret && current.condition === 'operational') {
      const turret = { ...current.turret };
      let closestZombie: ZombieUnit | null = null;
      let closestDist = Infinity;

      for (const z of zombiesList) {
        if (z.currentHp <= 0) continue;
        const d = Math.hypot(z.x - current.position.x, z.z - current.position.z);
        if (d <= turret.range && d < closestDist) {
          closestDist = d;
          closestZombie = z;
        }
      }

      if (closestZombie) {
        turret.targetZombieId = closestZombie.id;
        const dx = closestZombie.x - current.position.x;
        const dz = closestZombie.z - current.position.z;
        turret.rotation = Math.atan2(dx, dz);

        // Firing trigger
        if (now - turret.lastFireTime >= turret.fireRate * 1000) {
          turret.lastFireTime = now;
          const isCrit = Math.random() < 0.2;
          const damage = Math.round(turret.damage * (isCrit ? 1.8 : 1.0));

          closestZombie.currentHp = Math.max(0, closestZombie.currentHp - damage);

          // Turret visual fx: Muzzle flash + Golden tracer
          visualFx.push({
            id: `turret-muzzle-${current.id}-${now}`,
            type: 'muzzle_flash',
            startX: current.position.x,
            startY: 2.2,
            startZ: current.position.z,
            createdAt: now,
            durationMs: 100,
          });

          visualFx.push({
            id: `turret-tracer-${current.id}-${now}`,
            type: 'bullet_tracer',
            startX: current.position.x,
            startY: 2.2,
            startZ: current.position.z,
            endX: closestZombie.x,
            endY: 1.2,
            endZ: closestZombie.z,
            color: '#f59e0b',
            createdAt: now,
            durationMs: 140,
          });

          visualFx.push({
            id: `turret-dmg-${closestZombie.id}-${now}`,
            type: 'damage_number',
            startX: closestZombie.x,
            startY: 2.4,
            startZ: closestZombie.z,
            text: `-${damage}${isCrit ? ' HEAVY!' : ''}`,
            color: isCrit ? '#f59e0b' : '#fbbf24',
            isCrit,
            createdAt: now,
            durationMs: 800,
          });

          emitNoiseEvent('gunfire', current.position.x, current.position.z, 'Armed Truck .50 Cal HMG');

          if (closestZombie.currentHp <= 0) {
            current.killCount += 1;
            visualFx.push({
              id: `zdead-turret-${closestZombie.id}-${now}`,
              type: 'zombie_death',
              startX: closestZombie.x,
              startY: 0.5,
              startZ: closestZombie.z,
              createdAt: now,
              durationMs: 1200,
            });
          }
        }
      } else {
        turret.targetZombieId = null;
      }

      current.turret = turret;
    }

    return current;
  });

  // 4. Check pending squad vehicle boardings (move then mount)
  for (const squad of squadsMap.values()) {
    if (squad.pendingMountVehicleId && squad.currentHp > 0) {
      const targetVeh = updatedVehicles.find((v) => v.id === squad.pendingMountVehicleId);
      if (targetVeh && targetVeh.condition !== 'wrecked') {
        const dist = Math.hypot(squad.x - targetVeh.position.x, squad.z - targetVeh.position.z);
        // If the vehicle moved before the squad arrived, re-issue a path toward its
        // current position so the boarding order never silently stalls.
        if (dist > 6.0 && !squad.targetPos) {
          squad.targetPos = { x: targetVeh.position.x, z: targetVeh.position.z };
          squad.state = 'moving';
        }
        if (dist <= 3.8 || (!squad.targetPos && dist <= 6.0)) {
          // Squad has arrived at vehicle! Execute boarding
          const res = mountSquadToVehicle(targetVeh, squad);
          const vehIdx = updatedVehicles.findIndex((v) => v.id === targetVeh.id);
          if (vehIdx !== -1) {
            updatedVehicles[vehIdx] = res.updatedVehicle;
          }
          const boardedSquad = { ...res.updatedSquad, pendingMountVehicleId: null };
          squadsMap.set(boardedSquad.squadId, boardedSquad);
          notifications.push({
            title: 'SQUAD MOUNTED VEHICLE',
            desc: `${squad.name} boarded ${targetVeh.name}.`,
            type: 'info',
          });
        }
      }
    }
  }

  return {
    updatedVehicles,
    updatedSquads: Array.from(squadsMap.values()),
    updatedZombies: zombiesList,
    visualFx,
    noiseEvents,
    notifications,
  };
}
