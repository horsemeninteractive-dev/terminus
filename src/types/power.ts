/**
 * Local power grid (§Terminus extension — IFZ deliberately has no power
 * system, so this is Terminus's own infrastructure layer).
 *
 * A Generator Station burns fuel into electricity within a radius. Buildings
 * inside that radius are powered consumers. When demand exceeds supply, the
 * lowest-priority consumers shut down first — so the player genuinely decides
 * "keep the hospital powered, or run the vehicle workshop".
 *
 * Battery Storage (Battery Bank building) is the grid's EMERGENCY RESERVE, not
 * a second generator: while generators produce a surplus the banks charge, and
 * a charged bank acts as a local GRID EXTENSION from its own position — it
 * backs Critical/High facilities inside its reach when generators can't cover
 * them, keeping the colony alive through a fuel gap.
 */

/** 0 = Critical, 1 = High, 2 = Normal, 3 = Optional. */
export type PowerPriority = 0 | 1 | 2 | 3;

export interface GeneratorRecord {
  buildingId: string | number;
  buildingName: string;
  /** kW produced while running. */
  powerOutputKw: number;
  /** Reach of the microgrid in metres. */
  powerRadiusM: number;
  /** Fuel burned per in-game hour while running. */
  fuelPerHour: number;
  /** Internal fuel buffer capacity (the stockpile tops it up). */
  fuelCapacity: number;
  /** Fuel currently sitting in the buffer. */
  currentFuel: number;
  /** False once the buffer is dry and the stockpile has no fuel to draw. */
  running: boolean;
}

export interface BatteryRecord {
  buildingId: string | number;
  buildingName: string;
  /** Total usable storage in kWh. */
  capacityKwh: number;
  /** Charge currently stored. */
  storedKwh: number;
  /** Max kW drawn from the grid while charging. */
  chargeKw: number;
  /** Max kW delivered while discharging. */
  dischargeKw: number;
  /** Reach of the battery's microgrid in metres (same as generators). */
  powerRadiusM: number;
  /** True while the battery is feeding the grid this tick. */
  discharging: boolean;
}

export interface PowerState {
  /** One record per generator_station building. */
  generators: Map<string | number, GeneratorRecord>;
  /** One record per battery_bank building. */
  batteries: Map<string | number, BatteryRecord>;
  /** Total kW from running generators this tick. */
  supplyKw: number;
  /** kW demanded by powered consumers inside the grid. */
  demandKw: number;
  /** Building ids that received power this tick (priority-allocated). */
  poweredBuildingIds: string[];
  /** True when at least one generator is running on a low buffer. */
  lowFuel: boolean;
}

export function createEmptyPowerState(): PowerState {
  return {
    generators: new Map(),
    batteries: new Map(),
    supplyKw: 0,
    demandKw: 0,
    poweredBuildingIds: [],
    lowFuel: false,
  };
}