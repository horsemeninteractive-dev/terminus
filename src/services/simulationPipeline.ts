import { SettlementState } from '../types/settlement';
import { MapData } from '../types/map';
import { TacticalSquadUnit, ZombieUnit, HostileHumanUnit, NoiseEvent, DroppedItem, GameClockState } from '../types/combat';
import { PathGrid } from './pathfindingService';
import { RoadNetworkGraph } from './roadPathfinder';
import { tickSettlementSimulation } from './populationService';
import { tickResearchSimulation } from './researchService';
import { createInitialWeatherState, tickWeatherSimulation } from './weatherService';
import { tickMoraleAndGrowthSimulation } from './moraleService';
import { tickWaterEconomy } from './waterService';
import { tickPowerGrid } from './powerService';
import { tickSquadTraining } from './trainingService';
import { tickResourceGathering } from './resourceGatheringService';
import { tickCombatSimulation } from './combatService';
import { tickVehicleWorkshops } from './vehicleWorkshopService';
import { getPrimaryHQ } from './buildingOperational';
import { updateVehiclesTick } from './vehicleService';
import { tickInfectionSimulation } from './infectionService';
import { tickRivalHideouts, tickZombieLairs } from './rivalFactionService';
import { tickExpeditions } from './expeditionService';
import { tickBuildingOccupations } from './buildingOccupationService';
import type { ToastMessage } from './soundService';
import { runLogisticsStage } from './logisticsPipeline';
import { strandDeadSquadInventories } from './strandedLootService';

export interface SimulationPipelineResult {
  events: ToastMessage[];
  state: SettlementState;
  mapData: MapData;
  squads: TacticalSquadUnit[];
  zombies: ZombieUnit[];
  hostileHumans: HostileHumanUnit[];
  combat: ReturnType<typeof tickCombatSimulation>;
  vehicles: ReturnType<typeof updateVehiclesTick>;
  infection: ReturnType<typeof tickInfectionSimulation>;
  lairs: ReturnType<typeof tickZombieLairs>;
  hideouts: ReturnType<typeof tickRivalHideouts>;
  completedConstructions: string[];
  completedDeconstructions: ReturnType<typeof tickSettlementSimulation>['completedDeconstructions'];
}

/**
 * Map-independent economy stages shared by the full pipeline and the offline
 * catch-up path: settlement (construction/deconstruction/repair/production) →
 * research → weather → morale/population growth.
 */
export function runEconomyStages(
  state: SettlementState,
  deltaSeconds: number,
  clockSpeed: number,
  currentDay: number,
  isNight: boolean,
  pathGrid?: PathGrid | null
): {
  newState: SettlementState;
  weather: ReturnType<typeof tickWeatherSimulation>['newState'];
  events: ToastMessage[];
  completedConstructions: string[];
  completedDeconstructions: ReturnType<typeof tickSettlementSimulation>['completedDeconstructions'];
} {
  const events: ToastMessage[] = [];
  const economy = tickSettlementSimulation(state, deltaSeconds * clockSpeed, pathGrid, isNight);
  const researched = tickResearchSimulation(economy.newState, deltaSeconds, clockSpeed, isNight);
  const weather = tickWeatherSimulation(
    researched.weather || createInitialWeatherState(currentDay),
    currentDay,
    (deltaSeconds * clockSpeed) / 25,
    researched
  );
  // §Terminus Water Cistern economy: precipitation falls on operational
  // cistern roofs (weather × roof area × efficiency) into capacity-capped
  // buffers. Runs BEFORE morale so the morale water view sees the buffers.
  const water = tickWaterEconomy({ ...researched, weather: weather.newState }, weather.newState, deltaSeconds * clockSpeed);
  // §Terminus power grid: generators burn fuel (buffered from the stockpile
  // reserve) and priority-allocate power to consumers inside their radius.
  const power = tickPowerGrid(water.newState, deltaSeconds * clockSpeed);
  for (const e of power.events) events.push(e);
  // §Terminus Shooting Range: ammo-into-proficiency training sessions.
  const trained = tickSquadTraining(power.newState, deltaSeconds * clockSpeed, Date.now());
  for (const e of trained.events) events.push(e);
  const moraleResult = tickMoraleAndGrowthSimulation(trained.newState, weather.newState, deltaSeconds, clockSpeed, currentDay);
  if (moraleResult.notification) events.push(moraleResult.notification);
  if (economy.completedConstructions.length > 0) {
    events.push({
      title: 'CONSTRUCTION COMPLETED',
      desc: `${economy.completedConstructions.join(', ')} ${economy.completedConstructions.length === 1 ? 'is' : 'are'} now fully built and operational!`,
      type: 'success',
    });
  }
  if (economy.completedDeconstructions.length > 0) {
    events.push({
      title: 'DECONSTRUCTION COMPLETE',
      desc: `${economy.completedDeconstructions.length} deconstruction job(s) completed.`,
      type: 'success',
    });
  }
  return {
    newState: moraleResult.newState,
    weather: weather.newState,
    events,
    completedConstructions: economy.completedConstructions,
    completedDeconstructions: economy.completedDeconstructions,
  };
}

/**
 * Economy-only pipeline used by the offline settlement catch-up when no map is
 * available. Uses the exact same stage chain as the full pipeline.
 */
export function runEconomySimulationTick(
  state: SettlementState,
  deltaSeconds: number,
  clockSpeed: number,
  currentDay: number,
  isNight: boolean,
  pathGrid?: PathGrid | null
) {
  return runEconomyStages(state, deltaSeconds, clockSpeed, currentDay, isNight, pathGrid);
}

/**
 * Authoritative simulation pipeline. Every stage consumes the prior stage's
 * output; callers commit only this final result to application state.
 */
export function runSimulationPipeline(args: {
  state: SettlementState;
  mapData: MapData;
  squads: TacticalSquadUnit[];
  zombies: ZombieUnit[];
  hostileHumans: HostileHumanUnit[];
  noiseEvents: NoiseEvent[];
  droppedItems: DroppedItem[];
  clock: GameClockState;
  deltaSeconds: number;
  pathGrid?: PathGrid | null;
  roadGraph?: RoadNetworkGraph | null;
  alarmActive?: boolean;
}): SimulationPipelineResult {
  const { state, mapData, squads, zombies, hostileHumans, noiseEvents, droppedItems, clock, deltaSeconds, pathGrid, roadGraph, alarmActive = false } = args;
  const events: ToastMessage[] = [];
  const economyResult = runEconomyStages(state, deltaSeconds, clock.speed, clock.day, clock.isNight, pathGrid);
  events.push(...economyResult.events);
  const gatheringResult = tickResourceGathering(economyResult.newState, mapData, deltaSeconds * clock.speed, clock.isNight, alarmActive, pathGrid);
  const gathering = gatheringResult.newState;
  const combat = tickCombatSimulation(zombies, squads, gathering.adaptedBuildings, noiseEvents, clock, getPrimaryHQ(gathering)?.center || null, deltaSeconds, gathering, droppedItems, hostileHumans, pathGrid, alarmActive);
  const infection = tickInfectionSimulation(gathering, deltaSeconds, clock.speed, clock.day);
  const vehicles = updateVehiclesTick(gathering.vehicles || [], combat.updatedSquads, combat.updatedZombies, deltaSeconds * clock.speed, Date.now(), mapData, roadGraph, gathering.freestandingBuildings || [], 0);
  let nextSquads = vehicles.updatedSquads;
  const nextZombies = vehicles.updatedZombies;
  // §8 Vehicle Workshops — fabrication / time-repair / dismantling orders on
  // the freshly updated motor pool (day shift only).
  const workshop = tickVehicleWorkshops(
    { ...infection.newState, vehicles: vehicles.updatedVehicles },
    deltaSeconds * clock.speed,
    clock.isNight
  );
  if (workshop.events.length > 0) events.push(...workshop.events);
  vehicles.updatedVehicles = workshop.newState.vehicles;
  const lairs = tickZombieLairs(
    gathering.zombieLairs,
    nextZombies,
    nextSquads,
    mapData.buildings,
    Date.now(),
    deltaSeconds * clock.speed,
    clock.isNight,
    getPrimaryHQ(gathering)?.center || null
  );
  const hideouts = tickRivalHideouts(gathering.rivalHideouts, combat.updatedHostileHumans, nextSquads);
  // §IFZ Building Occupation — unadapted structures near an active Lair can
  // be taken over by REAL infected (home-bound, fought for real). Runs after
  // the lair tick so lair pressure is current; sync clears the nest when the
  // last living infected dies.
  const occupation = tickBuildingOccupations(
    { ...infection.newState, zombieLairs: lairs.updatedLairs },
    [...nextZombies, ...lairs.spawnedZombies],
    nextSquads,
    mapData.buildings,
    lairs.updatedLairs,
    clock.isNight,
    deltaSeconds * clock.speed,
    Date.now()
  );
  let nextState: SettlementState = {
    // Base the commit on the infection stage's output, not the pre-infection
    // `gathering`: the infection stage is the authoritative producer of the
    // infections/outbreaks maps AND removes turned survivors from the
    // population (fallenHeroes + namedSurvivors/generalPopulation). Spreading
    // `gathering` here silently dropped epidemic turn-deaths every tick.
    ...infection.newState,
    vehicles: vehicles.updatedVehicles,
    zombieLairs: lairs.updatedLairs,
    rivalHideouts: hideouts.updatedHideouts,
    occupiedBuildings: occupation.newState.occupiedBuildings,
    stockpile: combat.ammoConsumed > 0
      ? { ...infection.newState.stockpile, ammo: { ...infection.newState.stockpile.ammo, sharedPool: Math.max(0, infection.newState.stockpile.ammo.sharedPool - combat.ammoConsumed) } }
      : infection.newState.stockpile,
  };
  // §IFZ Expeditions — off-map areas revealed through the Antenna. Travel,
  // garrison battle, and slow scavenge all resolve here, BEFORE logistics, so
  // a recalled squad re-enters the map at the HQ and deposits on the same pass.
  const expeditionTick = tickExpeditions(nextState, nextSquads, deltaSeconds * clock.speed, Date.now());
  nextState = expeditionTick.newState;
  nextSquads = expeditionTick.squads;
  if (expeditionTick.events.length > 0) events.push(...expeditionTick.events);
  if (occupation.events.length > 0) events.push(...occupation.events);
  const logistics = runLogisticsStage(nextState, mapData, nextSquads);
  nextState = logistics.state;
  // A squad that fell this tick (all members dead) leaves its still-carried
  // backpack on the ground at the death site as a recoverable field pile —
  // anything it deposited at a dropoff before dying is already safe. Runs
  // after logistics so only genuinely-un-deposited loot is stranded.
  const fallen = strandDeadSquadInventories(nextState, logistics.squads);
  nextState = fallen.newState;
  events.push(...fallen.events);
  return {
    state: nextState,
    mapData: gatheringResult.mapData,
    squads: logistics.squads,
    zombies: [...nextZombies, ...lairs.spawnedZombies, ...occupation.spawnedZombies],
    hostileHumans: combat.updatedHostileHumans,
    combat,
    vehicles,
    infection,
    lairs,
    hideouts,
    events: [...events, ...logistics.events],
    completedConstructions: economyResult.completedConstructions,
    completedDeconstructions: economyResult.completedDeconstructions,
  };
}

