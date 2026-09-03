import { CisternRecord, WaterState, createEmptyWaterState } from '../types/water';
import { SettlementState, AdaptedBuilding } from '../types/settlement';
import { WeatherState, WeatherType } from '../types/weather';
import { isBuildingOperational } from './buildingOperational';
import { isResearchUnlocked } from './researchService';

// ==========================================
// Tuning constants
// ==========================================
/** 1 in-game day = 600 real seconds at 1x speed (matches moraleService). */
export const GAME_DAY_SEC = 600;

/** Capacity: 25 L per 10 m² of roof (matches the building's capacityLabel). */
const LITERS_PER_10M2 = 25;
/** Minimum capacity so a tiny roof still holds something useful. */
const MIN_CAPACITY_L = 60;

/**
 * Weather → collection multiplier. Rain is the baseline (1.0×), thunderstorms
 * are bountiful, freezing frost / blizzards give a modest snowmelt trickle,
 * and everything else collects nothing.
 */
export const CISTERN_WEATHER_MULT: Record<WeatherType, number> = {
  clear: 0,
  overcast: 0,
  rain: 1.0,
  thunderstorm: 2.5,
  dense_fog: 0,
  heatwave: 0,
  freezing_frost: 0.5,
  blizzard: 0.75,
};

/** Base collection per m² of roof per in-game day at 1.0× weather (liters). */
const COLLECTION_L_PER_M2_PER_DAY = 0.5;

export function getCisternCapacity(roofAreaM2: number): number {
  return Math.max(MIN_CAPACITY_L, Math.round((roofAreaM2 / 10) * LITERS_PER_10M2));
}

/** The roof catchment: the converted area for adapted cisterns, or the full
 *  footprint for freestanding ones. A huge warehouse genuinely banks more. */
export function getBuildingRoofAreaM2(building: AdaptedBuilding): number {
  const footprint = building.adaptedAreaM2 && building.adaptedAreaM2 > 0
    ? building.adaptedAreaM2
    : (building as any).footprintAreaM2 || 0;
  if (footprint > 0) return footprint;
  // Fallback for freestanding / legacy records lacking area fields.
  const w = (building as any).widthM || (building as any).width || 10;
  const d = (building as any).depthM || (building as any).depth || 10;
  return w * d;
}

/** All water_cistern buildings, adapted + freestanding, that are operational. */
export function getOperationalCisterns(state: SettlementState): AdaptedBuilding[] {
  const out: AdaptedBuilding[] = [];
  for (const b of state.adaptedBuildings.values()) {
    if (b.typeId === 'water_cistern' && isBuildingOperational(b)) out.push(b);
  }
  for (const b of state.freestandingBuildings || []) {
    if (b.typeId === 'water_cistern' && isBuildingOperational(b)) out.push(b);
  }
  return out;
}

/** Reconciles cistern records with the live building list — new cisterns get
 *  capacity from their roof, demolished/adapted-away ones are dropped. */
export function syncWaterState(state: SettlementState): SettlementState {
  const existing = state.waterState?.cisterns || new Map<string | number, CisternRecord>();
  const next = new Map<string | number, CisternRecord>();
  const operational = getOperationalCisterns(state);
  const efficiency = isResearchUnlocked(state, 'rainwater_harvesting') ? 1.5 : 1.0;
  for (const b of operational) {
    const roof = getBuildingRoofAreaM2(b);
    const capacity = getCisternCapacity(roof);
    const prev = existing.get(b.buildingId);
    next.set(b.buildingId, {
      buildingId: b.buildingId,
      buildingName: b.name || 'Water Cistern',
      roofAreaM2: roof,
      capacity,
      currentWater: prev ? Math.min(prev.currentWater, capacity) : 0,
      efficiency,
    });
  }
  let totalCapacity = 0;
  let totalStored = 0;
  for (const c of next.values()) {
    totalCapacity += c.capacity;
    totalStored += c.currentWater;
  }
  return {
    ...state,
    waterState: {
      cisterns: next,
      totalCapacity,
      totalStored,
      shortageDays: state.waterState?.shortageDays ?? 0,
    },
  };
}

export interface WaterTickResult {
  newState: SettlementState;
  /** Liters collected this tick across all cisterns. */
  collectedL: number;
}

/**
 * The renewable side of the economy: precipitation falls on every operational
 * cistern's roof, scaled by the weather multiplier and the cistern's
 * efficiency, into its capacity-capped buffer.
 */
export function tickWaterEconomy(
  state: SettlementState,
  weatherState: WeatherState,
  effectiveDeltaSec: number
): WaterTickResult {
  const synced = syncWaterState(state);
  const mult = CISTERN_WEATHER_MULT[weatherState.currentWeather] ?? 0;
  if (mult <= 0) return { newState: synced, collectedL: 0 };

  const fractionOfDay = effectiveDeltaSec / GAME_DAY_SEC;
  const next = new Map(synced.waterState!.cisterns);
  let collectedL = 0;
  for (const [key, c] of next) {
    const gained = c.roofAreaM2 * COLLECTION_L_PER_M2_PER_DAY * mult * c.efficiency * fractionOfDay;
    if (gained <= 0) continue;
    collectedL += gained;
    next.set(key, { ...c, currentWater: Math.min(c.capacity, c.currentWater + gained) });
  }
  let totalStored = 0;
  for (const c of next.values()) totalStored += c.currentWater;
  return {
    newState: {
      ...synced,
      waterState: { ...synced.waterState!, cisterns: next, totalStored },
    },
    collectedL,
  };
}

/**
 * Settlement-wide daily water demand: population drinking + medical facilities
 * + industrial facilities. Population is 1.5 L/person/day (the existing morale
 * baseline); each operational medbay bed adds 3 L and each operational
 * workshop/production building adds 2 L.
 */
export function calculateWaterDemand(state: SettlementState): number {
  const pop =
    (state.namedSurvivors?.length || 0) +
    (typeof state.generalPopulation === 'number'
      ? state.generalPopulation
      : state.generalPopulation?.total || 0);
  let demand = Math.max(1, pop) * 1.5;

  for (const b of state.adaptedBuildings.values()) {
    if (!isBuildingOperational(b)) continue;
    demand += industrialWaterDemand(b.typeId, b.maxCapacity);
  }
  for (const b of state.freestandingBuildings || []) {
    if (!isBuildingOperational(b)) continue;
    demand += industrialWaterDemand(b.typeId, b.maxCapacity);
  }
  return demand;
}

/** Medbays drink 3 L per bed; workshops and production buildings 2 L/day. */
function industrialWaterDemand(typeId: string, maxCapacity?: number): number {
  if (typeId === 'medbay') return Math.max(2, maxCapacity ?? 4) * 3;
  if (typeId === 'vehicle_workshop' || typeId === 'tool_factory' || typeId === 'shooting_range') return 2;
  return 0;
}

export interface WaterConsumptionResult {
  newState: SettlementState;
  /** Liters the settlement could NOT obtain this tick. */
  unmetL: number;
  /** True when even the cistern buffers were drained dry. */
  inShortage: boolean;
}

/**
 * Draws the settlement's daily water need: the disposable store (stockpile:
 * rainwater → purified → bottled) first, then the cistern buffers. Returns the
 * unmet amount — the morale stage turns that into a shortage.
 */
export function consumeSettlementWater(
  state: SettlementState,
  demandLiters: number
): WaterConsumptionResult {
  const stock = state.stockpile;
  const water = { ...stock.water };
  let remaining = demandLiters;

  const take = (bucket: number, amount: number) => {
    const t = Math.min(bucket, amount);
    remaining -= t;
    return bucket - t;
  };
  water.rainwater = take(water.rainwater, remaining);
  if (remaining > 0) water.purified_water = take(water.purified_water, remaining);
  if (remaining > 0) water.bottled_water = take(water.bottled_water, remaining);

  // The cistern reserve: buffers drain only after the disposable store is dry.
  let cisterns = state.waterState?.cisterns || new Map<string | number, CisternRecord>();
  if (remaining > 0 && cisterns.size > 0) {
    const nextCisterns = new Map(cisterns);
    for (const [key, c] of nextCisterns) {
      if (remaining <= 0) break;
      const t = Math.min(c.currentWater, remaining);
      remaining -= t;
      nextCisterns.set(key, { ...c, currentWater: c.currentWater - t });
    }
    cisterns = nextCisterns;
  }

  const totalStored = Array.from(cisterns.values()).reduce((n, c) => n + c.currentWater, 0);
  const inShortage = remaining > 0;
  const waterState: WaterState = state.waterState
    ? { ...state.waterState, cisterns, totalStored, shortageDays: inShortage ? state.waterState.shortageDays + 1 : 0 }
    : createEmptyWaterState();

  return {
    newState: { ...state, stockpile: { ...stock, water }, waterState },
    unmetL: Math.max(0, remaining),
    inShortage,
  };
}

/** Total usable potable water: disposable store + cistern buffers. */
export function getTotalPotableWater(state: SettlementState): number {
  const w = state.stockpile?.water || { rainwater: 0, purified_water: 0, bottled_water: 0 };
  return w.rainwater + w.purified_water + w.bottled_water + (state.waterState?.totalStored || 0);
}

/**
 * Passive water production (e.g. Survival Permaculture's +20 L purified
 * water/day). Every write into the stockpile water buckets funnels through
 * this module so no other service maintains a private water ledger.
 */
export function addWaterToStockpile(
  state: SettlementState,
  perDay: { rainwater?: number; purified_water?: number; bottled_water?: number },
  fractionOfDay: number
): SettlementState {
  if (!perDay.rainwater && !perDay.purified_water && !perDay.bottled_water) return state;
  const water = { rainwater: 0, purified_water: 0, bottled_water: 0, ...state.stockpile.water };
  water.rainwater += (perDay.rainwater || 0) * fractionOfDay;
  water.purified_water += (perDay.purified_water || 0) * fractionOfDay;
  water.bottled_water += (perDay.bottled_water || 0) * fractionOfDay;
  return { ...state, stockpile: { ...state.stockpile, water } };
}