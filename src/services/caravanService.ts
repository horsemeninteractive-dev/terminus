import { GeoPoint } from '../types/map';
import { NamedSurvivor, Squad } from '../types/population';
import { SettlementState, SettlementStockpile } from '../types/settlement';
import { WorldVehicle } from '../types/vehicle';
import {
  CaravanAmbushEvent,
  CaravanDispatchConfig,
  CaravanStatus,
  SettlementRecord,
  TradeCaravan,
} from '../types/caravan';

// ==========================================
// 1. Geographic Calculation Helpers (§7.5)
// ==========================================

const EARTH_RADIUS_KM = 6371.0;

/**
 * Compute real-world great-circle distance between two geographic coordinates in kilometers.
 */
export function calculateGeographicDistanceKm(p1: GeoPoint, p2: GeoPoint): number {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lon - p1.lon) * Math.PI) / 180;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.max(1, Math.round(EARTH_RADIUS_KM * c * 10) / 10);
}

/**
 * Slerp / Great-Circle Geographic Interpolation between two lat/lon points at progress t [0, 1].
 */
export function interpolateGeoPoint(start: GeoPoint, end: GeoPoint, t: number): GeoPoint {
  const clampedT = Math.max(0, Math.min(1, t));
  if (clampedT === 0) return start;
  if (clampedT === 1) return end;

  const lat1 = (start.lat * Math.PI) / 180;
  const lon1 = (start.lon * Math.PI) / 180;
  const lat2 = (end.lat * Math.PI) / 180;
  const lon2 = (end.lon * Math.PI) / 180;

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon1 - lon2) / 2), 2)
      )
    );

  if (d < 0.0001) {
    return {
      lat: start.lat + (end.lat - start.lat) * clampedT,
      lon: start.lon + (end.lon - start.lon) * clampedT,
    };
  }

  const A = Math.sin((1 - clampedT) * d) / Math.sin(d);
  const B = Math.sin(clampedT * d) / Math.sin(d);

  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);

  const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * (180 / Math.PI);
  const lon = Math.atan2(y, x) * (180 / Math.PI);

  return { lat, lon };
}

// ==========================================
// 2. Travel Time & Fuel Consumption (§7.5, §8)
// ==========================================

export function calculateCaravanSpeedAndDuration(
  distanceKm: number,
  vehicle: WorldVehicle,
  originSettlement: SettlementState
): { speedKmh: number; durationSeconds: number; fuelRequired: number } {
  let baseSpeedKmh = 60;
  let fuelPer100Km = 12; // liters

  if (vehicle.type === 'car') {
    baseSpeedKmh = 85;
    fuelPer100Km = 9;
  } else if (vehicle.type === 'armed_truck') {
    baseSpeedKmh = 65;
    fuelPer100Km = 16;
  } else if (vehicle.type === 'cargo_van') {
    baseSpeedKmh = 55;
    fuelPer100Km = 14;
  }

  // Technology modifier: Caravan Trade Logistics (§10)
  const isCaravanLogisticsUnlocked = originSettlement.research?.unlockedNodes?.includes('logistics_caravan_routes');
  if (isCaravanLogisticsUnlocked) {
    baseSpeedKmh *= 1.3; // +30% speed
    fuelPer100Km *= 0.85; // -15% fuel consumption
  }

  // Calculate scaled game duration (balanced for compelling gameplay pace: 50km ≈ 25s at 1x speed)
  // Distance is scaled logarithmically so very far continents take 60-120s while local cities take 15-30s
  const baseSeconds = 12 + Math.pow(distanceKm, 0.55) * 2.2;
  const durationSeconds = Math.max(10, Math.min(180, Math.round(baseSeconds)));

  const fuelRequired = Math.max(5, Math.round((distanceKm / 100) * fuelPer100Km));

  return {
    speedKmh: Math.round(baseSpeedKmh),
    durationSeconds,
    fuelRequired,
  };
}

// ==========================================
// 3. Dispatching Trade Caravans (§7.5)
// ==========================================

export function dispatchTradeCaravan(
  settlements: Record<string, SettlementRecord>,
  config: CaravanDispatchConfig,
  currentDay: number
): {
  success: boolean;
  error?: string;
  updatedSettlements: Record<string, SettlementRecord>;
  newCaravan?: TradeCaravan;
} {
  const origin = settlements[config.originSettlementId];
  const destination = settlements[config.destinationSettlementId];

  if (!origin || !destination) {
    return { success: false, error: 'Invalid origin or destination colony', updatedSettlements: settlements };
  }

  if (origin.status === 'destroyed') {
    return { success: false, error: 'Cannot dispatch caravan from a destroyed settlement', updatedSettlements: settlements };
  }

  // Find vehicle
  const vehicle = origin.state.vehicles.find((v) => v.id === config.vehicleId);
  if (!vehicle) {
    return { success: false, error: 'Selected vehicle not found in settlement fleet', updatedSettlements: settlements };
  }

  // Find escort squad
  const squad = origin.state.squads.find((s) => s.id === config.squadId);
  if (!squad) {
    return { success: false, error: 'Selected escort squad not found in settlement roster', updatedSettlements: settlements };
  }

  // Check distance & fuel
  const distanceKm = calculateGeographicDistanceKm(
    origin.placement.center,
    destination.placement.center
  );

  const { speedKmh, durationSeconds, fuelRequired } = calculateCaravanSpeedAndDuration(
    distanceKm,
    vehicle,
    origin.state
  );

  // Check fuel availability
  const fuelAvailable = (origin.state.stockpile.fuel.gasoline || 0) + (origin.state.stockpile.fuel.diesel || 0);
  if (fuelAvailable < fuelRequired) {
    return {
      success: false,
      error: `Insufficient fuel in stockpile: requires ${fuelRequired}L fuel (available: ${fuelAvailable}L)`,
      updatedSettlements: settlements,
    };
  }

  // Verify cargo availability
  const originStock = origin.state.stockpile;
  const c = config.cargo;

  if (
    (c.food.canned_goods > originStock.food.canned_goods) ||
    (c.food.mre_rations > originStock.food.mre_rations) ||
    (c.food.dried_rations > originStock.food.dried_rations) ||
    (c.food.fresh_harvest > originStock.food.fresh_harvest) ||
    (c.water.bottled_water > originStock.water.bottled_water) ||
    (c.water.purified_water > originStock.water.purified_water) ||
    (c.medical.first_aid_kits > originStock.medical.first_aid_kits) ||
    (c.medical.antibiotics > originStock.medical.antibiotics) ||
    (c.ammo.sharedPool > originStock.ammo.sharedPool) ||
    (c.materials.wood > originStock.materials.wood) ||
    (c.materials.metal > originStock.materials.metal) ||
    (c.materials.bricks > originStock.materials.bricks)
  ) {
    return { success: false, error: 'Cargo exceeds current stockpile capacity', updatedSettlements: settlements };
  }

  // Verify general population transfer
  if (config.transportGeneralCount > origin.state.generalPopulation.unassigned) {
    return { success: false, error: 'Not enough unassigned survivors available to transfer', updatedSettlements: settlements };
  }

  // Deduct fuel from origin
  let remainingFuelToDeduct = fuelRequired;
  let newGasoline = originStock.fuel.gasoline;
  let newDiesel = originStock.fuel.diesel;

  if (vehicle.fuelType === 'gasoline' && newGasoline >= remainingFuelToDeduct) {
    newGasoline -= remainingFuelToDeduct;
  } else if (vehicle.fuelType === 'diesel' && newDiesel >= remainingFuelToDeduct) {
    newDiesel -= remainingFuelToDeduct;
  } else {
    // Shared deduction
    const gasDeduct = Math.min(newGasoline, remainingFuelToDeduct);
    newGasoline -= gasDeduct;
    remainingFuelToDeduct -= gasDeduct;
    newDiesel = Math.max(0, newDiesel - remainingFuelToDeduct);
  }

  // Deduct cargo
  const updatedStockpile: SettlementStockpile = {
    food: {
      canned_goods: originStock.food.canned_goods - c.food.canned_goods,
      mre_rations: originStock.food.mre_rations - c.food.mre_rations,
      dried_rations: originStock.food.dried_rations - c.food.dried_rations,
      fresh_harvest: originStock.food.fresh_harvest - c.food.fresh_harvest,
    },
    water: {
      bottled_water: originStock.water.bottled_water - c.water.bottled_water,
      purified_water: originStock.water.purified_water - c.water.purified_water,
      rainwater: originStock.water.rainwater - c.water.rainwater,
    },
    medical: {
      first_aid_kits: originStock.medical.first_aid_kits - c.medical.first_aid_kits,
      sterile_bandages: originStock.medical.sterile_bandages - c.medical.sterile_bandages,
      antibiotics: originStock.medical.antibiotics - c.medical.antibiotics,
      painkillers: originStock.medical.painkillers - c.medical.painkillers,
    },
    fuel: {
      gasoline: newGasoline,
      diesel: newDiesel,
      biofuel: originStock.fuel.biofuel - (c.fuel?.biofuel || 0),
    },
    ammo: {
      sharedPool: originStock.ammo.sharedPool - c.ammo.sharedPool,
    },
    materials: {
      wood: originStock.materials.wood - c.materials.wood,
      metal: originStock.materials.metal - c.materials.metal,
      bricks: originStock.materials.bricks - c.materials.bricks,
    },
  };

  // Extract transported named survivors
  const transportedNamed: NamedSurvivor[] = [];
  const remainingNamed = origin.state.namedSurvivors.filter((surv) => {
    if (config.transportNamedSurvivorIds.includes(surv.id)) {
      transportedNamed.push(surv);
      return false;
    }
    return true;
  });

  // Remove vehicle and squad from origin
  const remainingVehicles = origin.state.vehicles.filter((v) => v.id !== config.vehicleId);
  const remainingSquads = origin.state.squads.filter((s) => s.id !== config.squadId);

  // Update origin general population
  const updatedGeneral = {
    ...origin.state.generalPopulation,
    total: origin.state.generalPopulation.total - config.transportGeneralCount,
    unassigned: origin.state.generalPopulation.unassigned - config.transportGeneralCount,
  };

  const updatedOriginState: SettlementState = {
    ...origin.state,
    stockpile: updatedStockpile,
    vehicles: remainingVehicles,
    squads: remainingSquads,
    namedSurvivors: remainingNamed,
    generalPopulation: updatedGeneral,
  };

  const updatedSettlements = {
    ...settlements,
    [config.originSettlementId]: {
      ...origin,
      state: updatedOriginState,
    },
  };

  // Determine Ambush Risk Rating
  let ambushRisk: 'Low' | 'Medium' | 'High' | 'Extreme' = 'Low';
  if (distanceKm > 250) ambushRisk = 'Extreme';
  else if (distanceKm > 100) ambushRisk = 'High';
  else if (distanceKm > 40) ambushRisk = 'Medium';

  if (vehicle.type === 'armed_truck') {
    ambushRisk = ambushRisk === 'Extreme' ? 'High' : ambushRisk === 'High' ? 'Medium' : 'Low';
  }

  const caravanId = `caravan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newCaravan: TradeCaravan = {
    id: caravanId,
    name: `Caravan: ${origin.name} ➔ ${destination.name}`,
    originSettlementId: origin.id,
    originSettlementName: origin.name,
    originGeo: origin.placement.center,
    destinationSettlementId: destination.id,
    destinationSettlementName: destination.name,
    destinationGeo: destination.placement.center,
    vehicle: { ...vehicle, isParkedAtHQ: false, isMoving: true },
    escortSquad: squad,
    transportedSurvivors: {
      named: transportedNamed,
      generalCount: config.transportGeneralCount,
    },
    cargo: config.cargo,
    distanceKm,
    speedKmh,
    totalDurationSeconds: durationSeconds,
    elapsedSeconds: 0,
    progress: 0,
    currentGeoPoint: origin.placement.center,
    status: 'traveling',
    ambushRiskRating: ambushRisk,
    fuelConsumed: fuelRequired,
    dispatchDay: currentDay,
    createdAt: Date.now(),
    eventLog: [
      {
        timestamp: Date.now(),
        text: `Caravan dispatched with ${vehicle.name} & Squad '${squad.name}'. Estimated transit: ${distanceKm} km.`,
        type: 'info',
      },
    ],
  };

  return {
    success: true,
    updatedSettlements,
    newCaravan,
  };
}

// ==========================================
// 4. Real-Time Caravan Simulation Tick (§7.5)
// ==========================================

export interface CaravanTickResult {
  updatedCaravans: TradeCaravan[];
  updatedSettlements: Record<string, SettlementRecord>;
  completedArrivals: TradeCaravan[];
  ambushEvents: CaravanAmbushEvent[];
  notifications: Array<{ title: string; desc: string; type: 'success' | 'warn' | 'info' | 'danger' }>;
}

export function tickCaravansSimulation(
  caravans: TradeCaravan[],
  settlements: Record<string, SettlementRecord>,
  deltaSec: number,
  timeMultiplier: number,
  currentDay: number
): CaravanTickResult {
  if (caravans.length === 0) {
    return {
      updatedCaravans: [],
      updatedSettlements: settlements,
      completedArrivals: [],
      ambushEvents: [],
      notifications: [],
    };
  }

  const effectiveDelta = deltaSec * (timeMultiplier === 0 ? 0 : timeMultiplier);
  const updatedCaravans: TradeCaravan[] = [];
  let workingSettlements = { ...settlements };
  const completedArrivals: TradeCaravan[] = [];
  const ambushEvents: CaravanAmbushEvent[] = [];
  const notifications: Array<{ title: string; desc: string; type: 'success' | 'warn' | 'info' | 'danger' }> = [];

  for (const caravan of caravans) {
    if (caravan.status === 'arrived' || caravan.status === 'destroyed') {
      continue;
    }

    // 1. Advance transit elapsed time & calculate progress
    const newElapsed = caravan.elapsedSeconds + effectiveDelta;
    const rawProgress = Math.min(1.0, newElapsed / caravan.totalDurationSeconds);
    const newCurrentGeo = interpolateGeoPoint(caravan.originGeo, caravan.destinationGeo, rawProgress);

    // 2. Check for Ambush Encounter risk in mid-transit (at ~30% and ~70% of journey)
    let activeAmbush = caravan.activeAmbush;
    let caravanStatus: CaravanStatus = caravan.status;
    let updatedVehicle = { ...caravan.vehicle };
    let updatedSquad = { ...caravan.escortSquad };
    let updatedCargo = { ...caravan.cargo };

    const shouldRollAmbush =
      caravan.status === 'traveling' &&
      !activeAmbush &&
      ((caravan.progress < 0.4 && rawProgress >= 0.4) || (caravan.progress < 0.75 && rawProgress >= 0.75));

    if (shouldRollAmbush) {
      const riskChance =
        caravan.ambushRiskRating === 'Extreme' ? 0.45 :
        caravan.ambushRiskRating === 'High' ? 0.30 :
        caravan.ambushRiskRating === 'Medium' ? 0.15 : 0.05;

      if (Math.random() < riskChance) {
        // Ambush triggered!
        const isArmedVehicle = caravan.vehicle.type === 'armed_truck';
        const leader = caravan.transportedSurvivors.named.find(
          (s) => s.id === caravan.escortSquad.leaderId
        );
        const leaderCombat = leader?.stats?.combat === 'expert' ? 3 :
                             leader?.stats?.combat === 'skilled' ? 2 : 1;

        const defensePower = (isArmedVehicle ? 40 : 10) + leaderCombat * 12 + (caravan.escortSquad.generalCount + 1) * 6;
        const ambushPower = 25 + Math.floor(Math.random() * 35);
        const victory = defensePower >= ambushPower;

        const vehicleDmg = victory ? Math.floor(Math.random() * 30) : 60 + Math.floor(Math.random() * 80);
        updatedVehicle.currentHp = Math.max(15, updatedVehicle.currentHp - vehicleDmg);

        const ambushEvent: CaravanAmbushEvent = {
          id: `ambush_${Date.now()}`,
          title: victory ? 'Caravan Repelled Ambush' : 'Caravan Ambushed by Roaming Horde',
          description: victory
            ? `Escort squad repelled a roadside zombie pack on the highway. Vehicle sustained ${vehicleDmg} dmg.`
            : `Severe highway ambush! Caravan took ${vehicleDmg} structural damage and sustained resource loss.`,
          ambushPower,
          combatRounds: 3,
          casualtiesNamed: [],
          casualtiesGeneral: victory ? 0 : Math.min(1, caravan.transportedSurvivors.generalCount),
          cargoLossPercent: victory ? 0 : 0.2,
          vehicleDamageTaken: vehicleDmg,
          resolved: true,
          victory,
        };

        if (!victory) {
          // Deduct 20% cargo loss
          updatedCargo = {
            food: {
              canned_goods: Math.floor(updatedCargo.food.canned_goods * 0.8),
              mre_rations: Math.floor(updatedCargo.food.mre_rations * 0.8),
              dried_rations: Math.floor(updatedCargo.food.dried_rations * 0.8),
              fresh_harvest: Math.floor(updatedCargo.food.fresh_harvest * 0.8),
            },
            water: {
              bottled_water: Math.floor(updatedCargo.water.bottled_water * 0.8),
              purified_water: Math.floor(updatedCargo.water.purified_water * 0.8),
              rainwater: Math.floor(updatedCargo.water.rainwater * 0.8),
            },
            medical: {
              first_aid_kits: Math.floor(updatedCargo.medical.first_aid_kits * 0.8),
              sterile_bandages: Math.floor(updatedCargo.medical.sterile_bandages * 0.8),
              antibiotics: Math.floor(updatedCargo.medical.antibiotics * 0.8),
              painkillers: Math.floor(updatedCargo.medical.painkillers * 0.8),
            },
            fuel: {
              gasoline: Math.floor(updatedCargo.fuel.gasoline * 0.8),
              diesel: Math.floor(updatedCargo.fuel.diesel * 0.8),
              biofuel: Math.floor(updatedCargo.fuel.biofuel * 0.8),
            },
            ammo: {
              sharedPool: Math.floor(updatedCargo.ammo.sharedPool * 0.8),
            },
            materials: {
              wood: Math.floor(updatedCargo.materials.wood * 0.8),
              metal: Math.floor(updatedCargo.materials.metal * 0.8),
              bricks: Math.floor(updatedCargo.materials.bricks * 0.8),
            },
          };
        }

        activeAmbush = ambushEvent;
        ambushEvents.push(ambushEvent);
        notifications.push({
          title: ambushEvent.title,
          desc: ambushEvent.description,
          type: victory ? 'warn' : 'danger',
        });
      }
    }

    // 3. Check for Arrival at Destination ($rawProgress >= 1.0$)
    if (rawProgress >= 1.0) {
      caravanStatus = 'arrived';
      const destSettlement = workingSettlements[caravan.destinationSettlementId];

      if (destSettlement) {
        const destStock = destSettlement.state.stockpile;
        const mergedStockpile: SettlementStockpile = {
          food: {
            canned_goods: destStock.food.canned_goods + updatedCargo.food.canned_goods,
            mre_rations: destStock.food.mre_rations + updatedCargo.food.mre_rations,
            dried_rations: destStock.food.dried_rations + updatedCargo.food.dried_rations,
            fresh_harvest: destStock.food.fresh_harvest + updatedCargo.food.fresh_harvest,
          },
          water: {
            bottled_water: destStock.water.bottled_water + updatedCargo.water.bottled_water,
            purified_water: destStock.water.purified_water + updatedCargo.water.purified_water,
            rainwater: destStock.water.rainwater + updatedCargo.water.rainwater,
          },
          medical: {
            first_aid_kits: destStock.medical.first_aid_kits + updatedCargo.medical.first_aid_kits,
            sterile_bandages: destStock.medical.sterile_bandages + updatedCargo.medical.sterile_bandages,
            antibiotics: destStock.medical.antibiotics + updatedCargo.medical.antibiotics,
            painkillers: destStock.medical.painkillers + updatedCargo.medical.painkillers,
          },
          fuel: {
            gasoline: destStock.fuel.gasoline + updatedCargo.fuel.gasoline,
            diesel: destStock.fuel.diesel + updatedCargo.fuel.diesel,
            biofuel: destStock.fuel.biofuel + updatedCargo.fuel.biofuel,
          },
          ammo: {
            sharedPool: destStock.ammo.sharedPool + updatedCargo.ammo.sharedPool,
          },
          materials: {
            wood: destStock.materials.wood + updatedCargo.materials.wood,
            metal: destStock.materials.metal + updatedCargo.materials.metal,
            bricks: destStock.materials.bricks + updatedCargo.materials.bricks,
          },
        };

        // Merge Squad & Vehicle into destination colony
        const arrivingVehicle: WorldVehicle = {
          ...updatedVehicle,
          isParkedAtHQ: true,
          isMoving: false,
          position: destSettlement.state.hq?.center || { x: 0, z: 0 },
        };

        const arrivingSquad: Squad = {
          ...updatedSquad,
        };

        // Merge Population
        const mergedNamed = [
          ...destSettlement.state.namedSurvivors,
          ...caravan.transportedSurvivors.named,
        ];

        // Unique filter by ID
        const uniqueNamedMap = new Map<string, NamedSurvivor>();
        for (const surv of mergedNamed) {
          uniqueNamedMap.set(surv.id, surv);
        }

        const totalArrivedGeneral =
          caravan.transportedSurvivors.generalCount;

        const mergedGeneral = {
          ...destSettlement.state.generalPopulation,
          total: destSettlement.state.generalPopulation.total + totalArrivedGeneral,
          unassigned: destSettlement.state.generalPopulation.unassigned + totalArrivedGeneral,
        };

        const wasDestroyed = destSettlement.status === 'destroyed';

        // Update Destination Settlement
        const updatedDestState: SettlementState = {
          ...destSettlement.state,
          stockpile: mergedStockpile,
          vehicles: [...destSettlement.state.vehicles, arrivingVehicle],
          squads: [...destSettlement.state.squads, arrivingSquad],
          namedSurvivors: Array.from(uniqueNamedMap.values()),
          generalPopulation: mergedGeneral,
        };

        workingSettlements[destSettlement.id] = {
          ...destSettlement,
          status: 'operational',
          state: updatedDestState,
          overrunAtDay: null,
          overrunReason: null,
        };

        completedArrivals.push({
          ...caravan,
          status: 'arrived',
          progress: 1.0,
          currentGeoPoint: caravan.destinationGeo,
        });

        if (wasDestroyed) {
          notifications.push({
            title: `COLONY RECLAIMED: ${destSettlement.name}`,
            desc: `Caravan arrived from ${caravan.originSettlementName} with relief squad, ${totalArrivedGeneral} survivors, and vital supplies. Colony restored to operational status!`,
            type: 'success',
          });
        } else {
          notifications.push({
            title: `Trade Caravan Arrived at ${destSettlement.name}`,
            desc: `Delivered cargo & escort squad from ${caravan.originSettlementName}. Vehicle stationed at base.`,
            type: 'success',
          });
        }
      }
    }

    const updatedCaravan: TradeCaravan = {
      ...caravan,
      elapsedSeconds: newElapsed,
      progress: rawProgress,
      currentGeoPoint: newCurrentGeo,
      status: caravanStatus,
      activeAmbush,
      vehicle: updatedVehicle,
      escortSquad: updatedSquad,
      cargo: updatedCargo,
    };

    updatedCaravans.push(updatedCaravan);
  }

  return {
    updatedCaravans,
    updatedSettlements: workingSettlements,
    completedArrivals,
    ambushEvents,
    notifications,
  };
}

// ==========================================
// 5. Global Living Population Tally (§7.5)
// ==========================================

export function calculateGlobalNetworkStats(
  settlements: Record<string, SettlementRecord>,
  caravans: TradeCaravan[]
): {
  totalOperationalColonies: number;
  totalDestroyedColonies: number;
  totalGlobalSurvivors: number;
  totalCaravansInTransit: number;
  isExtinct: boolean;
} {
  let totalOperational = 0;
  let totalDestroyed = 0;
  let totalSurvivors = 0;

  for (const s of Object.values(settlements)) {
    if (s.status === 'operational') {
      totalOperational++;
      const namedCount = s.state.namedSurvivors.filter((surv) => surv.stats).length;
      const genCount = s.state.generalPopulation?.total || 0;
      totalSurvivors += namedCount + genCount;
    } else {
      totalDestroyed++;
    }
  }

  let inTransitCount = 0;
  for (const c of caravans) {
    if (c.status === 'traveling' || c.status === 'ambushed') {
      inTransitCount++;
      const squadCount = (c.escortSquad?.leaderId ? 1 : 0) + (c.escortSquad?.generalCount || 0);
      const transportedCount = (c.transportedSurvivors?.named?.length || 0) + (c.transportedSurvivors?.generalCount || 0);
      totalSurvivors += squadCount + transportedCount;
    }
  }

  return {
    totalOperationalColonies: totalOperational,
    totalDestroyedColonies: totalDestroyed,
    totalGlobalSurvivors: totalSurvivors,
    totalCaravansInTransit: inTransitCount,
    isExtinct: totalSurvivors === 0 && Object.keys(settlements).length > 0,
  };
}

export { dispatchTradeCaravan as dispatchCaravan };
