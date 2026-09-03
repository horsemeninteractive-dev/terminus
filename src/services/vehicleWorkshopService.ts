import { AdaptedBuilding, SettlementState } from '../types/settlement';
import {
  VEHICLE_DEFINITIONS,
  VehicleType,
  VehicleWorkshopOrder,
  WorldVehicle,
} from '../types/vehicle';
import { isBuildingOperational } from './buildingOperational';
import { depositWithinCapacity } from './stockpileCapacity';
import { strandMaterialsAt } from './strandedLootService';

// ==========================================
// Vehicle Workshop Mechanics (§8)
// ==========================================
// A Vehicle Workshop (adapt `vehicle_workshop`) is a real mechanic, not a
// definition: staffed workshops run queued orders that fabricate new vehicles,
// repair parked chassis over time (consuming metal per HP healed), and
// dismantle parked chassis for scrap. Orders persist in the save and each
// workshop's assigned workers are split across its active orders every tick —
// an unstaffed workshop idles its whole queue, and its `Vehicle Bays` capacity
// caps how many orders run at once.

/** Distance a vehicle must be parked from the workshop to occupy a bay. */
export const VEHICLE_WORKSHOP_RADIUS_M = 20;
/** HP one mechanic restores per mechanic-hour (1 in-game hour = 25 sim s). */
export const VEHICLE_REPAIR_HP_PER_MECH_HOUR = 60;
/** Mechanic-hours to break a chassis down for scrap metal. */
export const VEHICLE_DISMANTLE_MECH_HOURS = 8;
/** Mechanic-hours to fabricate a vehicle from metal. */
export const VEHICLE_FABRICATE_MECH_HOURS = 16;
/** One in-game hour in sim seconds (600 s day). */
export const VEHICLE_HOUR_SEC = 25;

export interface WorkshopEvent {
  title: string;
  desc: string;
  type: 'info' | 'success' | 'warn';
}

function getOrders(state: SettlementState): VehicleWorkshopOrder[] {
  return state.vehicleWorkshopOrders || [];
}

function getBays(workshop: AdaptedBuilding): number {
  // maxCapacity is the building's "Vehicle Bays" figure.
  return Math.max(1, Math.floor(workshop.maxCapacity || 1));
}

function workshopCandidates(state: SettlementState): AdaptedBuilding[] {
  return [
    ...Array.from(state.adaptedBuildings.values()),
    ...(state.freestandingBuildings || []),
  ];
}

function workshopFor(state: SettlementState, workshopId: string | number): AdaptedBuilding | null {
  const found = workshopCandidates(state).find(
    (b) => String(b.buildingId) === String(workshopId)
  );
  return found && isBuildingOperational(found) && found.typeId === 'vehicle_workshop' ? found : null;
}

function isVehicleNear(v: WorldVehicle, workshop: AdaptedBuilding): boolean {
  const wx = workshop.position?.x ?? 0;
  const wz = workshop.position?.z ?? 0;
  return Math.hypot(v.position.x - wx, v.position.z - wz) < VEHICLE_WORKSHOP_RADIUS_M;
}

/**
 * Finds the best workshop for an order: nearest staffed, operational workshop
 * (with a free bay) to the given anchor position. Returns a clear error when
 * none qualifies so the UI can explain what is missing.
 */
export function findWorkshopForOrder(
  state: SettlementState,
  anchor: { x: number; z: number }
): { workshop: AdaptedBuilding; distance: number } | { error: string } {
  const staffed = workshopCandidates(state).filter(
    (b) =>
      isBuildingOperational(b) &&
      b.typeId === 'vehicle_workshop' &&
      (b.assignedWorkers || 0) > 0
  );
  if (staffed.length === 0) {
    return { error: 'No staffed Vehicle Workshop — assign workers to a completed workshop first.' };
  }
  const open = staffed.filter((b) => {
    const active = getOrders(state).filter((o) => String(o.workshopId) === String(b.buildingId));
    return active.length < getBays(b);
  });
  const pool = open.length > 0 ? open : [];
  if (pool.length === 0) {
    return { error: 'Every Vehicle Workshop bay is occupied — wait for an order to finish.' };
  }
  let best = pool[0];
  let bestDist = Infinity;
  for (const b of pool) {
    const d = Math.hypot(b.position.x - anchor.x, b.position.z - anchor.z);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return { workshop: best, distance: bestDist };
}

/**
 * Starts a workshop order.
 * - repair: vehicle must be parked inside a staffed workshop; metal is
 *   consumed progressively per HP healed (repairMetalCost over maxHp).
 * - dismantle: same placement rules; the chassis is un-assigned at start and
 *   yields scrapMetalYield metal when the crew finishes.
 * - fabricate: nearest staffed workshop to the HQ; consumes
 *   fabricationMetalCost metal as work advances, spawns the vehicle complete.
 */
export function createVehicleWorkshopOrder(
  state: SettlementState,
  input: {
    type: VehicleWorkshopOrder['type'];
    vehicleId?: string | number | null;
    vehicleType?: VehicleType;
  }
): { success: boolean; newState?: SettlementState; error?: string } {
  const orders = getOrders(state);
  const workshopRes =
    input.type === 'fabricate'
      ? findWorkshopForOrder(state, { x: 0, z: 0 })
      : (() => {
          const vehicle = (state.vehicles || []).find((v) => String(v.id) === String(input.vehicleId));
          if (!vehicle) return { error: 'Vehicle not found in the motor pool.' };
          const ws = findWorkshopForOrder(state, vehicle.position);
          if ('error' in ws) return ws;
          if (ws.distance >= VEHICLE_WORKSHOP_RADIUS_M) {
            return {
              error: `Drive ${vehicle.name} inside the workshop bay first (${Math.ceil(ws.distance)} m away).`,
            };
          }
          return ws;
        })();
  if ('error' in workshopRes) return { success: false, error: workshopRes.error };
  const workshop = workshopRes.workshop;

  if (input.type === 'repair' || input.type === 'dismantle') {
    const vehicle = (state.vehicles || []).find((v) => String(v.id) === String(input.vehicleId));
    if (!vehicle) return { success: false, error: 'Vehicle not found in the motor pool.' };
    if (vehicle.workshopJobId) {
      return { success: false, error: `${vehicle.name} is already assigned to the workshop.` };
    }
    if (vehicle.assignedSquadId && vehicle.isMoving) {
      return { success: false, error: 'Park the vehicle and dismount its squad before workshop work.' };
    }
    if (input.type === 'repair' && vehicle.currentHp >= vehicle.maxHp) {
      return { success: false, error: `${vehicle.name} is already at full integrity.` };
    }
    const orderId = `ws_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const missingHp = input.type === 'repair' ? vehicle.maxHp - vehicle.currentHp : 0;
    const mechanicHoursRequired =
      input.type === 'repair'
        ? Math.max(1, Math.ceil(missingHp / VEHICLE_REPAIR_HP_PER_MECH_HOUR))
        : VEHICLE_DISMANTLE_MECH_HOURS;
    const order: VehicleWorkshopOrder = {
      id: orderId,
      workshopId: workshop.buildingId,
      workshopName: workshop.name,
      type: input.type,
      vehicleId: vehicle.id,
      vehicleType: vehicle.type,
      label: input.type === 'repair' ? `Repair ${vehicle.name}` : `Dismantle ${vehicle.name}`,
      mechanicHoursDone: 0,
      mechanicHoursRequired,
      createdAt: Date.now(),
    };
    const updatedVehicle: WorldVehicle =
      input.type === 'dismantle'
        ? { ...vehicle, workshopJobId: orderId, assignedSquadId: null, assignedSquadName: undefined }
        : { ...vehicle, workshopJobId: orderId };
    const newState: SettlementState = {
      ...state,
      vehicles: (state.vehicles || []).map((v) =>
        String(v.id) === String(vehicle.id) ? updatedVehicle : v
      ),
      vehicleWorkshopOrders: [...orders, order],
    };
    return { success: true, newState };
  }

  // Fabricate
  if (!input.vehicleType || !VEHICLE_DEFINITIONS[input.vehicleType]) {
    return { success: false, error: 'Unknown vehicle model to fabricate.' };
  }
  const def = VEHICLE_DEFINITIONS[input.vehicleType];
  const order: VehicleWorkshopOrder = {
    id: `ws_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    workshopId: workshop.buildingId,
    workshopName: workshop.name,
    type: 'fabricate',
    vehicleType: input.vehicleType,
    label: `Fabricate ${def.name}`,
    mechanicHoursDone: 0,
    mechanicHoursRequired: VEHICLE_FABRICATE_MECH_HOURS,
    pendingMetal: def.fabricationMetalCost,
    createdAt: Date.now(),
  };
  const newState: SettlementState = {
    ...state,
    vehicleWorkshopOrders: [...orders, order],
  };
  return { success: true, newState };
}

/** Cancels an order and releases its bay + workshopJobId. */
export function cancelVehicleWorkshopOrder(
  state: SettlementState,
  orderId: string
): { success: boolean; newState: SettlementState } {
  const order = getOrders(state).find((o) => o.id === orderId);
  if (!order) return { success: false, newState: state };
  const remaining = getOrders(state).filter((o) => o.id !== orderId);
  const vehicles = (state.vehicles || []).map((v) =>
    v.workshopJobId === orderId ? { ...v, workshopJobId: null } : v
  );
  return {
    success: true,
    newState: { ...state, vehicles, vehicleWorkshopOrders: remaining },
  };
}

function consumeMetal(stockpile: SettlementState['stockpile'], amount: number): { stockpile: SettlementState['stockpile']; ok: boolean } {
  const metal = stockpile.materials.metal;
  if (amount > 0 && metal < amount) return { stockpile, ok: false };
  return {
    stockpile: {
      ...stockpile,
      materials: { ...stockpile.materials, metal: metal - amount },
    },
    ok: true,
  };
}

/**
 * Advances every workshop order by one tick (daytime only — the night crew is
 * sheltered). Workers from the owning workshop are split across its active
 * orders; bays cap concurrency per workshop. Vehicles that leave the bay are
 * evicted from their order with an event.
 */
export function tickVehicleWorkshops(
  state: SettlementState,
  deltaSimSeconds: number,
  isNight = false
): { newState: SettlementState; events: WorkshopEvent[] } {
  const events: WorkshopEvent[] = [];
  const orders = getOrders(state);
  if (orders.length === 0) return { newState: state, events };
  const hoursTick = deltaSimSeconds / VEHICLE_HOUR_SEC;
  if (isNight || hoursTick <= 0) return { newState: state, events };

  // Workshop bookkeeping: crew + active order lists.
  const activeOrders = new Map<string, VehicleWorkshopOrder[]>();
  const crewByWorkshop = new Map<string, number>();
  for (const order of orders) {
    const key = String(order.workshopId);
    activeOrders.set(key, [...(activeOrders.get(key) || []), order]);
  }
  for (const workshop of workshopCandidates(state)) {
    crewByWorkshop.set(String(workshop.buildingId), Math.max(0, workshop.assignedWorkers || 0));
  }

  // Distribute each workshop's crew across its orders (round-robin remainder).
  const crewForOrder = new Map<string, number>();
  for (const [key, list] of activeOrders) {
    const staff = crewByWorkshop.get(key) || 0;
    const base = list.length > 0 ? Math.floor(staff / list.length) : 0;
    const rem = staff - base * list.length;
    list.forEach((order, i) => {
      crewForOrder.set(order.id, base + (i < rem ? 1 : 0));
    });
  }

  let stockpile = state.stockpile;
  let vehicles = state.vehicles || [];
  let finished: VehicleWorkshopOrder[] = [];
  let cancelled: VehicleWorkshopOrder[] = [];

  for (const order of orders) {
    const crew = crewForOrder.get(order.id) || 0;
    const workshop = workshopFor(state, order.workshopId);
    // Unstaffed or decommissioned workshop → queue holds.
    if (!workshop || crew <= 0) continue;

    if (order.type === 'fabricate') {
      const def = order.vehicleType ? VEHICLE_DEFINITIONS[order.vehicleType] : null;
      if (!def) {
        cancelled.push(order);
        continue;
      }
      const advanceHrs = Math.min(
        order.mechanicHoursRequired - order.mechanicHoursDone,
        crew * hoursTick
      );
      if (advanceHrs <= 0) continue;
      const totalMetal = def.fabricationMetalCost;
      const metalNeed = totalMetal * (advanceHrs / order.mechanicHoursRequired);
      const res = consumeMetal(stockpile, metalNeed);
      if (!res.ok) continue; // blocked on materials — nothing consumed
      stockpile = res.stockpile;
      order.mechanicHoursDone += advanceHrs;
      if (order.mechanicHoursDone >= order.mechanicHoursRequired) {
        finished.push(order);
      }
      continue;
    }

    // Repair / dismantle — verify the vehicle is still parked in the bay.
    const vehicle = vehicles.find((v) => String(v.id) === String(order.vehicleId));
    if (!vehicle) {
      cancelled.push(order);
      continue;
    }
    if (!workshop || !isVehicleNear(vehicle, workshop) || (vehicle.isMoving && vehicle.assignedSquadId)) {
      cancelled.push(order);
      events.push({
        title: 'WORKSHOP ORDER CANCELLED',
        desc: `${order.label} — the vehicle left the bay.`,
        type: 'warn',
      });
      continue;
    }

    if (order.type === 'repair') {
      if (vehicle.currentHp >= vehicle.maxHp) {
        // Fully healed by another path (or tick rounding) — finish now.
        finished.push(order);
        continue;
      }
      const def = VEHICLE_DEFINITIONS[vehicle.type];
      const advanceHrs = Math.min(
        order.mechanicHoursRequired - order.mechanicHoursDone,
        crew * hoursTick
      );
      if (advanceHrs <= 0) continue;
      const healed = Math.min(
        vehicle.maxHp - vehicle.currentHp,
        advanceHrs * VEHICLE_REPAIR_HP_PER_MECH_HOUR
      );
      const metalNeed = (def.repairMetalCost / vehicle.maxHp) * healed;
      const res = consumeMetal(stockpile, metalNeed);
      if (!res.ok) continue;
      stockpile = res.stockpile;
      order.mechanicHoursDone += advanceHrs;
      vehicles = vehicles.map((v) =>
        String(v.id) === String(vehicle.id)
          ? { ...v, currentHp: Math.min(v.maxHp, v.currentHp + healed) }
          : v
      );
      if (order.mechanicHoursDone >= order.mechanicHoursRequired) {
        finished.push(order);
      }
    } else {
      // dismantle
      const advanceHrs = Math.min(
        order.mechanicHoursRequired - order.mechanicHoursDone,
        crew * hoursTick
      );
      if (advanceHrs <= 0) continue;
      order.mechanicHoursDone += advanceHrs;
      if (order.mechanicHoursDone >= order.mechanicHoursRequired) {
        finished.push(order);
      }
    }
  }

  let overflowUnits = state.overflowLootUnits || 0;
  let fieldLootPiles = state.fieldLootPiles || [];
  const finishedIds = new Set(finished.map((o) => o.id));
  const cancelledIds = new Set(cancelled.map((o) => o.id));
  const remainingOrders = orders.filter((o) => !finishedIds.has(o.id) && !cancelledIds.has(o.id));

  for (const order of finished) {
    const workshop = workshopFor(state, order.workshopId);
    const def = order.vehicleType ? VEHICLE_DEFINITIONS[order.vehicleType] : null;
    if (order.type === 'fabricate' && def && workshop) {
      const wx = workshop.position.x;
      const wz = workshop.position.z;
      const now = Date.now();
      const fresh: WorldVehicle = {
        id: `fab_${now}_${Math.floor(Math.random() * 1000)}`,
        type: def.type,
        name: def.name,
        condition: 'operational',
        position: { x: wx, z: wz },
        rotation: 0,
        y: 0,
        currentHp: def.maxHp,
        maxHp: def.maxHp,
        fuelType: def.fuelType,
        currentFuel: 0,
        maxFuel: def.maxFuel,
        fuelConsumptionPer100m: def.fuelConsumptionPer100m,
        assignedSquadId: null,
        isMoving: false,
        roadPathWaypoints: [],
        currentWaypointIndex: 0,
        targetPos: null,
        speed: 0,
        isDiscovered: true,
        isSiphoned: false,
        isParkedAtHQ: false,
        totalDistanceDriven: 0,
        killCount: 0,
        workshopJobId: null,
      };
      vehicles = [...vehicles, fresh];
      events.push({
        title: 'VEHICLE FABRICATED',
        desc: `${def.name} rolled out of ${workshop.name}.`,
        type: 'success',
      });
    } else if (order.type === 'dismantle' && def) {
      // Scrap the chassis into the stockpile, respecting storage capacity.
      const cap = state.totalStorageCapacity ?? Infinity;
      const deposit = depositWithinCapacity(stockpile, cap, {
        materials: { metal: def.scrapMetalYield },
      });
      stockpile = deposit.stockpile;
      const lost = Math.max(
        0,
        def.scrapMetalYield - (deposit.deposited.materials?.metal || 0)
      );
      if (lost > 0) {
        // Scrap that couldn't fit is stranded at the workshop as recoverable
        // field loot (a squad can collect it and deposit later).
        fieldLootPiles = strandMaterialsAt(
          fieldLootPiles,
          { x: workshop?.position?.x ?? 0, z: workshop?.position?.z ?? 0 },
          { metal: lost },
          'workshop'
        );
        overflowUnits += lost;
      }
      vehicles = vehicles.filter((v) => String(v.id) !== String(order.vehicleId));
      events.push({
        title: 'VEHICLE DISMANTLED',
        desc: `${def.name} broken down — ${deposit.deposited.materials?.metal || 0} metal recovered${lost > 0 ? `, ${lost} stranded at the workshop (full storage)` : ''}.`,
        type: 'success',
      });
    } else {
      // Repair complete
      const vehicle = vehicles.find((v) => String(v.id) === String(order.vehicleId));
      if (vehicle) {
        vehicles = vehicles.map((v) =>
          String(v.id) === String(order.vehicleId)
            ? { ...v, workshopJobId: null, currentHp: v.maxHp, condition: 'operational' }
            : v
        );
        events.push({
          title: 'REPAIR COMPLETE',
          desc: `${order.label} finished — ${vehicle.name} restored to full integrity.`,
          type: 'success',
        });
      }
    }
  }
  for (const order of cancelled) {
    vehicles = vehicles.map((v) =>
      String(v.id) === String(order.vehicleId) ? { ...v, workshopJobId: null } : v
    );
  }

  if (
    remainingOrders.length === orders.length &&
    vehicles.length === (state.vehicles || []).length &&
    stockpile === state.stockpile &&
    events.length === 0 &&
    overflowUnits === (state.overflowLootUnits || 0)
  ) {
    return { newState: state, events };
  }

  return {
    newState: {
      ...state,
      vehicles,
      stockpile,
      overflowLootUnits: overflowUnits,
      fieldLootPiles,
      vehicleWorkshopOrders: remainingOrders,
    },
    events,
  };
}

/** Whether a vehicle currently sits on any workshop order. */
export function getVehicleWorkshopOrder(state: SettlementState, vehicleId: string | number): VehicleWorkshopOrder | null {
  return getOrders(state).find((o) => String(o.vehicleId) === String(vehicleId)) || null;
}

/** Total metal a fabrication of this model will consume (UI display). */
export function getFabricationCost(type: VehicleType): number {
  return VEHICLE_DEFINITIONS[type].fabricationMetalCost;
}


