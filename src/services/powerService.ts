import { BatteryRecord, GeneratorRecord, PowerState, PowerPriority, createEmptyPowerState } from '../types/power';
import { SettlementState, AdaptedBuilding } from '../types/settlement';
import type { ToastMessage } from './soundService';
import { isBuildingOperational } from './buildingOperational';
import { isResearchUnlocked } from './researchService';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../data/functionalBuildings';

// ==========================================
// Tuning constants
// ==========================================
/** 1 in-game day = 600 real seconds at 1x speed (matches moraleService/waterService). */
export const GAME_DAY_SEC = 600;
/** 1 in-game hour in real seconds. */
export const GAME_HOUR_SEC = GAME_DAY_SEC / 24;

/** Fuel burned per hour / output kW / radius — base generator station. */
export const GENERATOR_BASE = {
  powerOutputKw: 50,
  powerRadiusM: 60,
  fuelPerHour: 5,
  fuelCapacity: 100,
};

/** Fraction of the buffer below which a running generator reports LOW FUEL. */
const LOW_FUEL_FRACTION = 0.25;

/** Base battery bank specs (kWh storage, kW charge/discharge, reach). */
export const BATTERY_BASE = {
  capacityKwh: 200,
  chargeKw: 30,
  dischargeKw: 40,
  powerRadiusM: 60,
};

/** Fraction of stored energy at which a discharging battery reports LOW. */
const BATTERY_LOW_FRACTION = 0.2;

/**
 * Power consumers: every powered facility's draw (kW) and shutdown priority.
 * Priority 0 = Critical (hospital, research) down to 3 = Optional (floodlights).
 * When demand exceeds supply the lowest-priority consumers shut down first —
 * that is the "keep the hospital powered or run the workshop" decision.
 */
export const POWER_CONSUMERS: Record<string, { drawKw: number; priority: PowerPriority }> = {
  hospital: { drawKw: 12, priority: 0 },
  research_center: { drawKw: 8, priority: 0 },
  medbay: { drawKw: 6, priority: 1 },
  vehicle_workshop: { drawKw: 10, priority: 1 },
  arms_factory: { drawKw: 12, priority: 1 },
  tool_factory: { drawKw: 6, priority: 1 },
  protective_gear_factory: { drawKw: 8, priority: 1 },
  chemical_plant: { drawKw: 10, priority: 1 },
  sawmill: { drawKw: 8, priority: 2 },
  cannery: { drawKw: 6, priority: 2 },
  scrapyard: { drawKw: 8, priority: 2 },
  shooting_range: { drawKw: 6, priority: 2 },
  expedition_center: { drawKw: 4, priority: 2 },
  floodlight_tower: { drawKw: 5, priority: 3 },
};

export const PRIORITY_LABELS: Record<PowerPriority, string> = {
  0: 'Critical',
  1: 'High',
  2: 'Normal',
  3: 'Optional',
};

export function getPowerDrawKw(typeId: string): number {
  return POWER_CONSUMERS[typeId]?.drawKw ?? 0;
}

export function getPowerPriority(typeId: string): PowerPriority {
  return POWER_CONSUMERS[typeId]?.priority ?? 3;
}

/** All generator_station buildings (adapted + freestanding) that are operational. */
export function getOperationalGenerators(state: SettlementState): AdaptedBuilding[] {
  const out: AdaptedBuilding[] = [];
  for (const b of state.adaptedBuildings.values()) {
    if (b.typeId === 'generator_station' && isBuildingOperational(b)) out.push(b);
  }
  for (const b of state.freestandingBuildings || []) {
    if (b.typeId === 'generator_station' && isBuildingOperational(b)) out.push(b);
  }
  return out;
}

/** Generator specs — Advanced Power Systems research boosts output and reach. */
export function getGeneratorSpecs(state: SettlementState, building: AdaptedBuilding) {
  const advanced = isResearchUnlocked(state, 'advanced_power_systems');
  const custom = (building as any).powerProperties as
    | { powerOutputKw?: number; powerRadiusM?: number; fuelPerHour?: number; fuelCapacity?: number }
    | undefined;
  const def = FUNCTIONAL_BUILDING_DEFINITIONS[building.typeId] as any;
  const defPower = def?.powerProperties || {};
  return {
    powerOutputKw: Math.round((custom?.powerOutputKw ?? defPower.powerOutputKw ?? GENERATOR_BASE.powerOutputKw) * (advanced ? 1.25 : 1)),
    powerRadiusM: Math.round((custom?.powerRadiusM ?? defPower.powerRadiusM ?? GENERATOR_BASE.powerRadiusM) * (advanced ? 1.25 : 1)),
    fuelPerHour: custom?.fuelPerHour ?? defPower.fuelPerHour ?? GENERATOR_BASE.fuelPerHour,
    fuelCapacity: custom?.fuelCapacity ?? defPower.fuelCapacity ?? GENERATOR_BASE.fuelCapacity,
  };
}

/** All battery_bank buildings (adapted + freestanding) that are operational. */
export function getOperationalBatteries(state: SettlementState): AdaptedBuilding[] {
  const out: AdaptedBuilding[] = [];
  for (const b of state.adaptedBuildings.values()) {
    if (b.typeId === 'battery_bank' && isBuildingOperational(b)) out.push(b);
  }
  for (const b of state.freestandingBuildings || []) {
    if (b.typeId === 'battery_bank' && isBuildingOperational(b)) out.push(b);
  }
  return out;
}

/** Battery specs — Advanced Power Systems research boosts storage and flow. */
export function getBatterySpecs(state: SettlementState, building: AdaptedBuilding) {
  const advanced = isResearchUnlocked(state, 'advanced_power_systems');
  const custom = (building as any).batteryProperties as
    | { capacityKwh?: number; chargeKw?: number; dischargeKw?: number; powerRadiusM?: number }
    | undefined;
  const def = FUNCTIONAL_BUILDING_DEFINITIONS[building.typeId] as any;
  const defBat = def?.batteryProperties || {};
  return {
    capacityKwh: Math.round((custom?.capacityKwh ?? defBat.capacityKwh ?? BATTERY_BASE.capacityKwh) * (advanced ? 1.25 : 1)),
    chargeKw: Math.round((custom?.chargeKw ?? defBat.chargeKw ?? BATTERY_BASE.chargeKw) * (advanced ? 1.25 : 1)),
    dischargeKw: Math.round((custom?.dischargeKw ?? defBat.dischargeKw ?? BATTERY_BASE.dischargeKw) * (advanced ? 1.25 : 1)),
    powerRadiusM: Math.round((custom?.powerRadiusM ?? defBat.powerRadiusM ?? BATTERY_BASE.powerRadiusM) * (advanced ? 1.25 : 1)),
  };
}

/** Reconciles generator + battery records with the live building list. */
export function syncPowerState(state: SettlementState): SettlementState {
  const existingGens = state.powerState?.generators || new Map<string | number, GeneratorRecord>();
  const nextGens = new Map<string | number, GeneratorRecord>();
  for (const b of getOperationalGenerators(state)) {
    const specs = getGeneratorSpecs(state, b);
    const prev = existingGens.get(b.buildingId);
    nextGens.set(b.buildingId, {
      buildingId: b.buildingId,
      buildingName: b.name || 'Generator Station',
      powerOutputKw: specs.powerOutputKw,
      powerRadiusM: specs.powerRadiusM,
      fuelPerHour: specs.fuelPerHour,
      fuelCapacity: specs.fuelCapacity,
      currentFuel: prev ? Math.min(prev.currentFuel, specs.fuelCapacity) : 0,
      running: prev ? prev.running : false,
    });
  }

  const existingBats = state.powerState?.batteries || new Map<string | number, BatteryRecord>();
  const nextBats = new Map<string | number, BatteryRecord>();
  for (const b of getOperationalBatteries(state)) {
    const specs = getBatterySpecs(state, b);
    const prev = existingBats.get(b.buildingId);
    nextBats.set(b.buildingId, {
      buildingId: b.buildingId,
      buildingName: b.name || 'Battery Bank',
      capacityKwh: specs.capacityKwh,
      storedKwh: prev ? Math.min(prev.storedKwh, specs.capacityKwh) : 0,
      chargeKw: specs.chargeKw,
      dischargeKw: specs.dischargeKw,
      powerRadiusM: specs.powerRadiusM,
      discharging: prev ? prev.discharging : false,
    });
  }
  return {
    ...state,
    powerState: {
      generators: nextGens,
      batteries: nextBats,
      supplyKw: 0,
      demandKw: 0,
      poweredBuildingIds: [],
      lowFuel: false,
    },
  };
}

/** All powered consumers (adapted + freestanding) regardless of reach. */
function getAllConsumers(state: SettlementState): AdaptedBuilding[] {
  const out: AdaptedBuilding[] = [];
  for (const b of state.adaptedBuildings.values()) {
    if (isBuildingOperational(b) && POWER_CONSUMERS[b.typeId]) out.push(b);
  }
  for (const b of state.freestandingBuildings || []) {
    if (isBuildingOperational(b) && POWER_CONSUMERS[b.typeId]) out.push(b);
  }
  return out;
}

/** True when a building record sits within `radius` of the reference. */
function withinReach(
  state: SettlementState,
  b: AdaptedBuilding,
  ref: { buildingId: string | number; powerRadiusM: number }
): boolean {
  const rb = findBuildingById(state, ref.buildingId);
  if (!rb) return false;
  const d = Math.hypot(
    (b.position?.x ?? 0) - (rb.position?.x ?? 0),
    (b.position?.z ?? 0) - (rb.position?.z ?? 0)
  );
  return d <= ref.powerRadiusM;
}

/**
 * The grid resolution for one tick. Every consumer inside a running
 * generator's radius (or a discharging battery's radius) is a candidate;
 * supply is allocated to candidates by priority band (Critical first), so an
 * over-subscribed grid drops the lowest priorities — floodlights go dark
 * before the hospital does.
 *
 * Battery Storage rides on top: while a running generator produces more than
 * the grid demands, the surplus charges the banks (within their charge rate);
 * when demand outstrips supply, the banks discharge (within their discharge
 * rate and stored energy) and their output counts toward supply, keeping
 * priority facilities alive through a fuel gap.
 */
export function computePowerAllocation(state: SettlementState, hours: number): {
  supplyKw: number;
  demandKw: number;
  poweredIds: Set<string>;
  lowFuel: boolean;
  batteries: Map<string | number, BatteryRecord>;
} {
  const generators = state.powerState?.generators || new Map<string | number, GeneratorRecord>();
  const batteries = new Map(state.powerState?.batteries || new Map<string | number, BatteryRecord>());
  const running: GeneratorRecord[] = [];
  let lowFuel = false;
  for (const g of generators.values()) {
    if (g.running && g.currentFuel > 0) {
      running.push(g);
      if (g.currentFuel <= g.fuelCapacity * LOW_FUEL_FRACTION) lowFuel = true;
    }
  }
  const genSupplyKw = running.reduce((n, g) => n + g.powerOutputKw, 0);
  const poweredIds = new Set<string>();

  // Consumers within reach of a running generator OR a battery holding charge
  // are candidates (a stored battery extends the grid even while idle).
  const candidateFor = (b: AdaptedBuilding, gs: { buildingId: string | number; powerRadiusM: number }[]) =>
    gs.some((g) => withinReach(state, b, g));

  // Phase 1 — charge: a running generator's surplus tops up the banks in reach.
  if (running.length > 0 && genSupplyKw > 0) {
    const baseCandidates = getAllConsumers(state).filter((b) =>
      candidateFor(b, running.map((g) => ({ buildingId: g.buildingId, powerRadiusM: g.powerRadiusM })))
    );
    const baseDemandKw = baseCandidates.reduce((n, c) => n + getPowerDrawKw(c.typeId), 0);
    let surplusKw = Math.max(0, genSupplyKw - baseDemandKw);
    for (const [key, bat] of batteries) {
      if (surplusKw <= 0) break;
      const b = findBuildingById(state, bat.buildingId);
      if (!b) continue;
      const connected = running.some((g) => withinReach(state, b, g));
      if (!connected) continue;
      const roomKwh = bat.capacityKwh - bat.storedKwh;
      if (roomKwh <= 0) continue;
      const gain = Math.min(bat.chargeKw * hours, roomKwh, surplusKw * hours);
      if (gain <= 0) continue;
      bat.storedKwh += gain;
      surplusKw -= gain / hours;
      batteries.set(key, bat);
    }
  }

  // Phase 2 — allocation with batteries as a MARGINAL supply. A bank only ever
  // stored charge while a running generator was in reach, so its stored energy
  // is the connection proof. Every bank holding charge extends the grid as a
  // candidate reach node and contributes up to its headroom
  // (discharge rate × time, capped by what it holds) toward supply. Stored
  // power is an emergency reserve: it backs Critical and High consumers only,
  // never the Normal/Optional bands — a scrapyard cannot drain the reserve
  // that is keeping the hospital alive. The priority allocation decides what
  // gets served; afterwards each bank is drained only by the served demand it
  // actually carried beyond the generators.
  const genNodes = running.map((g) => ({ buildingId: g.buildingId, powerRadiusM: g.powerRadiusM }));
  const safeHours = Math.max(hours, 1e-6);
  const charged = Array.from(batteries.values()).filter((b) => b.storedKwh > 0);
  const chargedNodes = charged.map((b) => ({ buildingId: b.buildingId, powerRadiusM: b.powerRadiusM }));
  // Headroom each bank can sustain over this whole tick (kW average).
  const headroomKw = charged.map((b) => Math.min(b.dischargeKw, b.storedKwh / safeHours));
  const maxBatteryKw = headroomKw.reduce((n, h) => n + h, 0);
  const reserveBacked = (c: { typeId: string }) => getPowerPriority(c.typeId) <= 1; // Critical + High

  const reachNodes = [...genNodes, ...chargedNodes];
  const candidates = getAllConsumers(state)
    .filter((b) => candidateFor(b, reachNodes))
    .map((b) => ({ id: String(b.buildingId), typeId: b.typeId }));
  const demandKw = candidates.reduce((n, c) => n + getPowerDrawKw(c.typeId), 0);

  // Allocate by priority BAND: every Critical consumer is served before any
  // High one, etc. Within a band the smaller draws are served first so a
  // surplus never strands a light consumer. When a band doesn't fully fit,
  // the unserved members of that band and every lower band are shed.
  let servedKw = 0;
  let batteryUsedKw = 0;
  for (let band = 0 as PowerPriority; band <= 3; band++) {
    const inBand = candidates
      .filter((c) => getPowerPriority(c.typeId) === band)
      .sort((a, b) => getPowerDrawKw(a.typeId) - getPowerDrawKw(b.typeId));
    if (inBand.length === 0) continue;
    const bandDemand = inBand.reduce((n, c) => n + getPowerDrawKw(c.typeId), 0);
    // Batteries only back the emergency bands; Normal/Optional run purely on
    // what the generators supply (whatever remains after the bands above).
    const genRemaining = Math.max(0, genSupplyKw - servedKw);
    const available =
      band <= 1
        ? genRemaining + (maxBatteryKw - batteryUsedKw)
        : genRemaining;
    if (bandDemand > available) break; // shed this band and everything below
    for (const c of inBand) {
      const draw = getPowerDrawKw(c.typeId);
      poweredIds.add(c.id);
      servedKw += draw;
      if (band <= 1) {
        // Consume generator budget first, then the reserve.
        batteryUsedKw += Math.max(0, Math.min(draw, maxBatteryKw - batteryUsedKw, Math.max(0, servedKw - genSupplyKw)));
      }
    }
  }
  // Clamp the reserve draw to what is genuinely beyond the generators and to
  // the headroom actually available.
  const batteryUsageKw = Math.max(0, Math.min(batteryUsedKw, maxBatteryKw));
  const supplyKw = genSupplyKw + batteryUsageKw;
  if (batteryUsageKw > 0) {
    let remaining = batteryUsageKw;
    for (let i = 0; i < charged.length && remaining > 0; i++) {
      const bat = charged[i];
      const key = bat.buildingId;
      const drawKw = Math.min(headroomKw[i], remaining);
      if (drawKw <= 0) continue;
      bat.storedKwh = Math.max(0, bat.storedKwh - drawKw * safeHours);
      bat.discharging = true;
      remaining -= drawKw;
      batteries.set(key, bat);
    }
  }
  // Banks that were discharging but aren't needed this tick stand down.
  for (const [key, bat] of batteries) {
    if (bat.discharging && batteryUsageKw <= 0) {
      batteries.set(key, { ...bat, discharging: false });
    }
  }
  return { supplyKw, demandKw, poweredIds, lowFuel, batteries };
}

function findBuildingById(
  state: SettlementState,
  id: string | number
): AdaptedBuilding | undefined {
  for (const b of state.adaptedBuildings.values()) {
    if (String(b.buildingId) === String(id)) return b;
  }
  return (state.freestandingBuildings || []).find((f) => String(f.buildingId) === String(id));
}

/** The ids currently receiving power (cheap wrapper for consumers). */
export function getPoweredBuildingIds(state: SettlementState): Set<string> {
  return state.powerState?.poweredBuildingIds
    ? new Set(state.powerState.poweredBuildingIds)
    : new Set<string>();
}

// ==========================================
// Tactical-map overlay data (§Power grid)
// ==========================================

export interface PowerGridVisualSource {
  id: string | number;
  name: string;
  typeId: string;
  x: number;
  z: number;
  radiusM: number;
}

export interface PowerGridVisualGenerator extends PowerGridVisualSource {
  running: boolean;
  fuelFraction: number;
}

export interface PowerGridVisualBattery extends PowerGridVisualSource {
  storedKwh: number;
  capacityKwh: number;
  discharging: boolean;
}

export interface PowerGridVisualConsumer extends PowerGridVisualSource {
  /** Key of the 3D mesh carrying this building (section adaptations share the
   *  source building's mesh, so the status marker can hover its roof). */
  meshId: string;
  drawKw: number;
  priority: PowerPriority;
  powered: boolean;
  /** Inside a running generator's / charged battery's reach (i.e. it *could*
   *  be served but was shed, or it simply lacks supply). */
  inReach: boolean;
}

export interface PowerGridVisual {
  generators: PowerGridVisualGenerator[];
  batteries: PowerGridVisualBattery[];
  consumers: PowerGridVisualConsumer[];
  /** Grid infrastructure exists (generators or a battery holding charge). */
  hasInfrastructure: boolean;
}

/**
 * Everything the tactical map's power-grid overlay draws in one pass: every
 * operational generator + battery (with its real reach, research included) and
 * each powered consumer with its live powered/shed status from the last
 * allocation tick. Deduped by building so split sections share one marker per
 * real structure.
 */
export function getPowerGridVisual(state: SettlementState): PowerGridVisual {
  const generators: PowerGridVisualGenerator[] = getOperationalGenerators(state).map((b) => {
    const rec = state.powerState?.generators?.get(b.buildingId);
    const specs = getGeneratorSpecs(state, b);
    return {
      id: b.buildingId,
      name: b.name || 'Generator Station',
      typeId: b.typeId,
      x: b.position?.x ?? 0,
      z: b.position?.z ?? 0,
      radiusM: rec?.powerRadiusM ?? specs.powerRadiusM,
      running: !!rec?.running,
      fuelFraction: rec ? rec.currentFuel / Math.max(1, rec.fuelCapacity) : 0,
    };
  });

  const batteries: PowerGridVisualBattery[] = getOperationalBatteries(state).map((b) => {
    const rec = state.powerState?.batteries?.get(b.buildingId);
    const specs = getBatterySpecs(state, b);
    return {
      id: b.buildingId,
      name: b.name || 'Battery Bank',
      typeId: b.typeId,
      x: b.position?.x ?? 0,
      z: b.position?.z ?? 0,
      radiusM: rec?.powerRadiusM ?? specs.powerRadiusM,
      storedKwh: rec?.storedKwh ?? 0,
      capacityKwh: specs.capacityKwh,
      discharging: !!rec?.discharging,
    };
  });

  // Consumers count as "in reach" exactly like the allocation does: inside a
  // running generator's radius or a charged battery's radius.
  const reachNodes = [
    ...generators
      .filter((g) => g.running)
      .map((g) => ({ x: g.x, z: g.z, r: g.radiusM })),
    ...batteries
      .filter((b) => b.storedKwh > 0)
      .map((b) => ({ x: b.x, z: b.z, r: b.radiusM })),
  ];
  const poweredIds = getPoweredBuildingIds(state);

  const consumers: PowerGridVisualConsumer[] = [];
  const seen = new Set<string>();
  for (const b of getAllConsumers(state)) {
    const key = String(b.sourceBuildingId ?? b.buildingId);
    if (seen.has(key)) continue;
    seen.add(key);
    const x = b.position?.x ?? 0;
    const z = b.position?.z ?? 0;
    const inReach = reachNodes.some((n) => Math.hypot(x - n.x, z - n.z) <= n.r);
    consumers.push({
      id: b.buildingId,
      name: b.name || b.typeId,
      typeId: b.typeId,
      x,
      z,
      radiusM: 0,
      meshId: key,
      drawKw: getPowerDrawKw(b.typeId),
      priority: getPowerPriority(b.typeId),
      powered: poweredIds.has(String(b.buildingId)) || poweredIds.has(key),
      inReach,
    });
  }

  return {
    generators,
    batteries,
    consumers,
    hasInfrastructure: generators.length > 0 || batteries.some((b) => b.storedKwh > 0),
  };
}

export interface PowerTickResult {
  newState: SettlementState;
  events: ToastMessage[];
}

/**
 * The dependency side of the network: generators run **only while demand
 * exists** — a unit with no operational powered consumer inside its radius
 * stands down and conserves its buffer (no burn, no reserve draw), so fuel is
 * spent purely on load. A generator that does see demand tops its buffer up
 * from the stockpile fuel reserve (gasoline → diesel → biofuel), burns fuel
 * per hour, and either keeps the grid alive or runs dry. Then the priority
 * allocation decides exactly which facilities get power this tick.
 */
export function tickPowerGrid(state: SettlementState, effectiveDeltaSec: number): PowerTickResult {
  const events: ToastMessage[] = [];
  const synced = syncPowerState(state);
  const generators = new Map(synced.powerState!.generators);
  const hours = effectiveDeltaSec / GAME_HOUR_SEC;
  const fuel = { ...synced.stockpile.fuel };
  const consumers = getAllConsumers(synced);

  const fuelSources: { key: 'gasoline' | 'diesel' | 'biofuel'; label: string }[] = [
    { key: 'gasoline', label: 'gasoline' },
    { key: 'diesel', label: 'diesel' },
    { key: 'biofuel', label: 'biofuel' },
  ];

  for (const [key, g] of generators) {
    let rec = { ...g };
    const wasRunning = rec.running;
    // Demand-driven operation: at least one operational powered consumer must
    // sit inside this generator's radius or the unit stays off. Standby costs
    // nothing — the buffer is conserved untouched for when the load returns.
    const demandNearby = consumers.some((c) => withinReach(synced, c, g));
    if (!demandNearby) {
      if (wasRunning) {
        events.push({
          title: 'GENERATOR STANDBY',
          desc: `No facilities need power inside ${rec.buildingName}'s radius — the unit idled to conserve fuel.`,
          type: 'info',
        });
      }
      rec.running = false;
      generators.set(key, rec);
      continue;
    }
    // Burn first: the buffer may go negative, meaning the crew draws the
    // deficit from the stockpile reserve as it burns — a long offline tick (a
    // whole game day in one call) correctly burns through the buffer and into
    // the reserve without the buffer capping the burn. Then refill the tank
    // back to capacity from the reserve, so a generator with reserve fuel
    // always ends the tick topped up.
    const burn = rec.fuelPerHour * hours;
    rec.currentFuel = rec.currentFuel - burn;
    if (rec.currentFuel < rec.fuelCapacity) {
      let need = rec.fuelCapacity - rec.currentFuel;
      for (const src of fuelSources) {
        if (need <= 0) break;
        const avail = fuel[src.key] || 0;
        const t = Math.min(avail, need);
        if (t > 0) {
          fuel[src.key] = avail - t;
          rec.currentFuel += t;
          need -= t;
        }
      }
    }
    // With no reserve at all the buffer lands exactly on zero, not negative.
    rec.currentFuel = Math.max(0, rec.currentFuel);
    rec.running = rec.currentFuel > 0;
    if (!wasRunning && rec.running) {
      events.push({
        title: 'GENERATOR ONLINE',
        desc: `${rec.buildingName} is producing power for the local grid.`,
        type: 'success',
      });
    } else if (wasRunning && !rec.running) {
      events.push({
        title: 'GENERATOR OUT OF FUEL',
        desc: `${rec.buildingName} has stopped. Powered facilities inside its radius are dark until refuelled.`,
        type: 'danger',
      });
    }
    generators.set(key, rec);
  }

  const withGenerators = { ...synced, stockpile: { ...synced.stockpile, fuel }, powerState: { ...synced.powerState!, generators } } as SettlementState;
  const allocation = computePowerAllocation(withGenerators, hours);

  return {
    newState: {
      ...withGenerators,
      powerState: {
        ...withGenerators.powerState!,
        supplyKw: allocation.supplyKw,
        demandKw: allocation.demandKw,
        poweredBuildingIds: Array.from(allocation.poweredIds),
        lowFuel: allocation.lowFuel,
        batteries: allocation.batteries,
      },
    },
    events,
  };
}

/** Convenience for UI: total fuel held in generator buffers. */
export function getGeneratorFuelTotal(state: SettlementState): number {
  return Array.from(state.powerState?.generators?.values() || []).reduce(
    (n, g) => n + g.currentFuel,
    0
  );
}

export { createEmptyPowerState };