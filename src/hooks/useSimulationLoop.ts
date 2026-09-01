import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  advanceGameClock,
  emitNoiseEvent,
  generateHordeWave,
  orderSquadMove,
  tickCombatSimulation,
} from '../services/combatService';
import { recordFallenHero, tickInfectionSimulation } from '../services/infectionService';
import {
  createRansomDemand,
  freeCaptive,
  tickRivalHideouts,
  tickZombieLairs,
} from '../services/rivalFactionService';
import {
  dismountSquadFromVehicle,
  orderVehicleRoadTravel,
  updateVehiclesTick,
} from '../services/vehicleService';
import { computeVisibleCells, computeVisionSources, createFogGrid } from '../services/fogOfWarService';
import {
  findNearestStorageDropoff,
  formatLootLabel,
  isSquadInsideBuilding,
  tickBuildingScavengeProgress,
  unloadSquadAtDropoff,
  unloadVehicleAtDropoff,
} from '../services/scavengingService';
import { gameSettingsService } from '../services/gameSettingsService';
import { saveService } from '../services/saveService';
import { soundService, ToastMessage } from '../services/soundService';
import { findNextScavengeTarget, getHiddenGroupValues } from '../lib/scavengeQueueHelpers';
import type { BuildingPolygon, LocationPreset, MapData, SettlementPlacement } from '../types/map';
import type {
  ArmorItemId,
  CombatVisualFx,
  DroppedItem,
  GameClockState,
  HostileHumanUnit,
  NoiseEvent,
  TacticalSquadUnit,
  WeaponItemId,
  ZombieUnit,
} from '../types/combat';
import type { SettlementRecord, TradeCaravan } from '../types/caravan';
import type { SettlementState } from '../types/settlement';
import type { RadioDirectiveState } from '../types/radioDirective';
import type { BuildingSearchState } from '../types/scavenging';
import type { HiddenSurvivorGroup } from '../types/population';
import type { RivalHideout } from '../types/rivalFaction';
import type { TimeOfDay, WorldScene } from '../render/WorldScene';
import type { RoadNetworkGraph } from '../services/roadPathfinder';
import type { PathGrid } from '../services/pathfindingService';

/**
 * Everything the 100ms game loop reads or writes that is owned by <App/>.
 * Passed explicitly so the hook has no hidden coupling to the component tree.
 */
export interface SimLoopRuntime {
  // Gate & read-only state
  viewMode: 'start_screen' | 'intro' | 'main_menu' | 'globe' | 'world';
  isDescentActive: boolean;
  mapData: MapData | null;
  gameClock: GameClockState;
  zombies: ZombieUnit[];
  combatSquads: TacticalSquadUnit[];
  hostileHumans: HostileHumanUnit[];
  droppedItems: DroppedItem[];
  noiseEvents: NoiseEvent[];
  selectedSquadId: string | null;
  selectedVehicleId: string | null;
  settlement: SettlementState;
  timeOfDay: TimeOfDay;
  scavengeQueue: Record<string, Array<string | number>>;
  isAlarmActive: boolean;
  settlements: Record<string, SettlementRecord>;
  activeSettlementId: string;
  activePlacement: SettlementPlacement | null;
  currentPreset: LocationPreset;
  caravans: TradeCaravan[];
  radioDirectiveState: RadioDirectiveState;
  dangerLevel: number;
  showSatelliteOverlay: boolean;
  satelliteQuality: import('../types/saveGame').SatelliteQuality;
  // Refs
  settlementRef: MutableRefObject<SettlementState>;
  mapDataRef: MutableRefObject<MapData | null>;
  roadGraphRef: MutableRefObject<RoadNetworkGraph | null>;
  pathGridRef: MutableRefObject<PathGrid | null>;
  combatSquadsRef: MutableRefObject<TacticalSquadUnit[]>;
  fogVisibleCellsRef: MutableRefObject<Set<number>>;
  contactedSurvivorGroupIdsRef: MutableRefObject<Set<string>>;
  scavengeQueueRef: MutableRefObject<Record<string, Array<string | number>>>;
  sceneRef: MutableRefObject<WorldScene | null>;
  // Setters
  setGameClock: Dispatch<SetStateAction<GameClockState>>;
  setTimeOfDay: Dispatch<SetStateAction<TimeOfDay>>;
  setZombies: Dispatch<SetStateAction<ZombieUnit[]>>;
  setNoiseEvents: Dispatch<SetStateAction<NoiseEvent[]>>;
  setToastMessage: (msg: ToastMessage | null) => void;
  setAlarmHoursRemaining: Dispatch<SetStateAction<number>>;
  setIsAlarmActive: Dispatch<SetStateAction<boolean>>;
  setDroppedItems: Dispatch<SetStateAction<DroppedItem[]>>;
  setHostileHumans: Dispatch<SetStateAction<HostileHumanUnit[]>>;
  setSettlement: Dispatch<SetStateAction<SettlementState>>;
  setScavengeQueue: Dispatch<SetStateAction<Record<string, Array<string | number>>>>;
  setCombatSquads: Dispatch<SetStateAction<TacticalSquadUnit[]>>;
  setActiveRansomHideoutId: Dispatch<SetStateAction<string | number | null>>;
  setActiveRecruitmentGroup: Dispatch<SetStateAction<HiddenSurvivorGroup | null>>;
  setDangerLevel: Dispatch<SetStateAction<number>>;
  addTacticalAlert: (
    title: string,
    desc: string,
    type: 'danger' | 'warn' | 'info' | 'success',
    onClick?: () => void
  ) => void;
  autoEquipScavengedGear: (weaponId?: WeaponItemId, armorId?: ArmorItemId) => void;
}

/**
 * The 100ms simulation loop: clock, nightfall/horde, combat, scavenging,
 * mounted-vehicle logistics, deposit runs, infection/outbreaks, zombie lairs,
 * rival hideouts, survivor contact, ambient audio and scene syncing.
 *
 * Extracted wholesale from App.tsx so the god component no longer contains the
 * simulation; every external dependency is passed in via {@link SimLoopRuntime}.
 */
export function useSimulationLoop(runtime: SimLoopRuntime) {
  const {
    viewMode,
    isDescentActive,
    mapData,
    gameClock,
    zombies,
    combatSquads,
    hostileHumans,
    droppedItems,
    noiseEvents,
    selectedSquadId,
    selectedVehicleId,
    settlement,
    timeOfDay,
    scavengeQueue,
    isAlarmActive,
    settlements,
    activeSettlementId,
    activePlacement,
    currentPreset,
    caravans,
    radioDirectiveState,
    dangerLevel,
    showSatelliteOverlay,
    satelliteQuality,
    settlementRef,
    mapDataRef,
    roadGraphRef,
    pathGridRef,
    combatSquadsRef,
    fogVisibleCellsRef,
    contactedSurvivorGroupIdsRef,
    scavengeQueueRef,
    sceneRef,
    setGameClock,
    setTimeOfDay,
    setZombies,
    setNoiseEvents,
    setToastMessage,
    setAlarmHoursRemaining,
    setIsAlarmActive,
    setDroppedItems,
    setHostileHumans,
    setSettlement,
    setScavengeQueue,
    setCombatSquads,
    setActiveRansomHideoutId,
    setActiveRecruitmentGroup,
    setDangerLevel,
    addTacticalAlert,
    autoEquipScavengedGear,
  } = runtime;

  useEffect(() => {
    if (viewMode !== 'world' || isDescentActive || !mapData) return;
    const TICK_DELTA = 0.1; // 100ms per simulation step
    // Use a monotonic fixed-step accumulator rather than setInterval's elapsed
    // wall time. React/render work can delay a callback; catch up in bounded
    // steps so units do not receive uneven movement bursts.
    let lastTickAt = performance.now();
    let accumulatedMs = 0;
    const interval = setInterval(() => {
      const now = performance.now();
      accumulatedMs = Math.min(accumulatedMs + now - lastTickAt, 300);
      lastTickAt = now;
      if (accumulatedMs < TICK_DELTA * 1000) return;
      accumulatedMs -= TICK_DELTA * 1000;
      // 1. Advance Game Clock
      let nextClock = gameClock;
      let dayChanged = false;
      let nightfallTriggered = false;
      let dawnTriggered = false;

      setGameClock((prev) => {
        const adv = advanceGameClock(prev, TICK_DELTA);
        nextClock = adv.newClock;
        dayChanged = adv.dayChanged;
        nightfallTriggered = adv.nightfallTriggered;
        dawnTriggered = adv.dawnTriggered;
        return adv.newClock;
      });

      // Synchronize 3D atmospheric lighting with phase
      if (nextClock.phase !== timeOfDay) {
        setTimeOfDay(nextClock.phase);
      }

      // 2. Handle Nightfall Incursion (§5.1, §6.1, §15)
      if (nightfallTriggered) {
        soundService.playHordeWarning();
        const hqPos = settlement.hq?.center || { x: 0, z: 0 };
        const horde = generateHordeWave(nextClock.day, hqPos, 180, true);

        // §6.1 addition: a full moon measurably reduces the night incursion.
        const isFullMoon = settlement.weather?.moonPhase === 'full';
        const calmHorde = isFullMoon ? horde.filter(() => Math.random() < 0.55) : horde;
        setZombies((prev) => [...prev, ...calmHorde]);

        const noise = emitNoiseEvent('combat', hqPos.x + 10, hqPos.z + 10, 'HORDE HOWL');
        setNoiseEvents((prev) => [...prev, noise.event]);

        if (gameSettingsService.getSettings().pauseOnNightfall) {
          setGameClock((c) => ({ ...c, speed: 0 }));
        }

        setToastMessage({
          title: isFullMoon ? 'NIGHTFALL — FULL MOON' : 'NIGHTFALL IN EFFECT',
          desc: isFullMoon
            ? `A full moon hangs overhead — the infected are unusually subdued tonight (${calmHorde.length} of ${horde.length} emerged). Workers have returned to shelter; production, construction and research pause until dawn.`
            : `Infected horde (Wave Day ${nextClock.day}) is mobilizing and aggressive! Workers have returned to shelter; production, construction and research pause until dawn.`,
          type: 'warn',
        });
      }

      if (dawnTriggered) {
        setToastMessage({
          title: 'DAWN BREAKS',
          desc: 'Sunlight forces remaining infected into dormancy. Workers are back on the job — production, construction and research resume.',
          type: 'info',
        });

        // Trigger Autosave at dawn if enabled (§ Autosave feature)
        const currentSettings = gameSettingsService.getSettings();
        if (currentSettings.autosaveIntervalDays > 0 && nextClock.day % currentSettings.autosaveIntervalDays === 0) {
          try {
            const activePlacementRecord = settlements[activeSettlementId]?.placement || activePlacement || {
              center: { lat: currentPreset.lat, lon: currentPreset.lon },
              radius: currentPreset.radius,
              sectorName: currentPreset.name,
              country: currentPreset.country,
              gridSize: 3,
              offsetLat: 0,
              offsetLon: 0,
            };
            saveService.saveGame(
              `${settlement.name || 'Colony'} (Autosave Day ${nextClock.day})`,
              'autosave',
              {
                settlements,
                activeSettlementId,
                settlement,
                gameClock: nextClock,
                activePlacement: activePlacementRecord,
                currentPreset,
                mapData,
                caravans,
                radioState: radioDirectiveState,
                hasCompletedFirstScavenge: true,
                combatSquads,
                zombies,
                worldVehicles: settlement.vehicles || [],
                dangerLevel,
                timeOfDay,
                satelliteOverlay: showSatelliteOverlay,
                satelliteQuality,
              }
            );
            addTacticalAlert('AUTOSAVE RECORDED', `Dawn of Day ${nextClock.day} saved to checkpoint`, 'info');
          } catch (e) {
            console.warn('Autosave failed:', e);
          }
        }
      }

      // 3. Tick Real-Time Combat Simulation (Pathing, Weapons Firing, Zombie Attacks, Durability Damage, §10 Research)
      const hqPos = settlement.hq?.center || null;
      const combatResult = tickCombatSimulation(
        zombies,
        combatSquadsRef.current,
        settlement.adaptedBuildings,
        noiseEvents,
        nextClock,
        hqPos,
        TICK_DELTA,
        settlement,
        droppedItems,
        hostileHumans,
        pathGridRef.current,
        isAlarmActive
      );

      // Tick 13-Hour Emergency Alarm Countdown
      if (isAlarmActive) {
        const inGameHoursAdvanced = (TICK_DELTA * (nextClock.speed === 0 ? 0 : nextClock.speed)) / 25.0;
        setAlarmHoursRemaining((prev) => {
          const nextVal = Math.max(0, prev - inGameHoursAdvanced);
          if (nextVal <= 0 && prev > 0) {
            setIsAlarmActive(false);
            setToastMessage({
              title: 'DEFENSE ALARM EXPIRED',
              desc: '13-hour defense alarm duration has completed. Colony stood down to standby.',
              type: 'info',
            });
          }
          return nextVal;
        });
      }

      let workingZombies = combatResult.updatedZombies;
      let workingSettlement = settlementRef.current;
      setDroppedItems(combatResult.droppedItems);
      setNoiseEvents(combatResult.activeNoiseEvents);
      setHostileHumans(combatResult.updatedHostileHumans);
      if (combatResult.ammoConsumed > 0) {
        workingSettlement = {
          ...workingSettlement,
          stockpile: {
            ...workingSettlement.stockpile,
            ammo: {
              ...workingSettlement.stockpile.ammo,
              sharedPool: Math.max(0, workingSettlement.stockpile.ammo.sharedPool - combatResult.ammoConsumed),
            },
          },
        };
      }

      // Scavenging Over Time: progress search when squad is inside/at building footprint
      if (mapData?.buildings) {
        for (let i = 0; i < combatResult.updatedSquads.length; i++) {
          const sq = combatResult.updatedSquads[i];
          if (sq.currentHp <= 0 || sq.state === 'downed' || sq.state === 'retreating') continue;

          // Check if squad is targeting a building or inside a building footprint
          let targetBldg = sq.targetBuildingId
            ? mapData.buildings.find((b) => String(b.id) === String(sq.targetBuildingId))
            : undefined;

          // If no explicit target building but squad is searching or idle inside a building footprint
          if (!targetBldg && (sq.state === 'searching' || (sq.state === 'idle' && !sq.targetPos))) {                  targetBldg = mapData.buildings.find((b) => isSquadInsideBuilding({ x: sq.x, z: sq.z }, b));
          }

          // Scavenging begins only after the squad reaches the precise point
          // selected by the player inside the building.
          if (targetBldg && isSquadInsideBuilding({ x: sq.x, z: sq.z }, targetBldg)) {
            const bSearch = workingSettlement.buildingSearches?.get(targetBldg.id);
            if (!bSearch?.searched) {
              const scavResult = tickBuildingScavengeProgress(
                workingSettlement,
                sq,
                targetBldg,
                TICK_DELTA * (gameClock.speed === 0 ? 0 : gameClock.speed),
                mapData.buildings
              );

              workingSettlement = scavResult.newState;
              combatResult.updatedSquads[i] = scavResult.updatedSquad;
              combatSquadsRef.current = combatResult.updatedSquads;

              // If items were found this tick
              if (scavResult.itemsFoundThisTick.length > 0) {
                const foundDesc = scavResult.itemsFoundThisTick
                  .map((it) => `${formatLootLabel(it.label)} ×${it.quantity}`)
                  .join(', ');
                setToastMessage({
                  title: 'LOOT DISCOVERED',
                  desc: `${sq.name} uncovered in ${targetBldg.name || 'Structure'}: ${foundDesc}`,
                  type: 'info',
                });
                soundService.playBuildingPlaced();

                for (const it of scavResult.itemsFoundThisTick) {
                  if (it.kind === 'weapon' || it.kind === 'armor') {
                    autoEquipScavengedGear(it.itemId as WeaponItemId, it.itemId as ArmorItemId);
                  }
                }
              }

              // Full carry slots no longer interrupt the active building search.
              // The warning is shown once the building has finished so the player
              // can see that any undiscovered loot remains behind.
              if (scavResult.inventoryFull && scavResult.isCompleted) {
                setToastMessage({
                  title: 'INVENTORY CAPACITY FULL',
                  desc: `${sq.name} finished searching with ${scavResult.updatedSquad.currentWeightKg}/${scavResult.updatedSquad.members.filter((member) => member.isAlive).length} slots occupied. Remaining supplies stay at ${targetBldg.name || 'the structure'} before returning to ${scavResult.dropoff?.name || 'Storage Depot'}.`,
                  type: 'warn',
                });
                soundService.playCombatActionSFX('assault_order');
              }

              // If structure fully cleared
              if (scavResult.isCompleted) {
                setToastMessage({
                  title: 'STRUCTURE CLEARED',
                  desc: `${targetBldg.name || 'Structure'} has been fully scavenged and secured.`,
                  type: 'success',
                });
                const remainingQueue = (scavengeQueue[sq.squadId] || []).filter(
                  (id) => String(id) !== String(targetBldg.id)
                );
                setScavengeQueue((prev) => ({ ...prev, [sq.squadId]: remainingQueue }));
                const finishedSquad = combatResult.updatedSquads[i];
                const finishedInventory = workingSettlement.squadInventories?.[sq.squadId];
                const searches = workingSettlement.buildingSearches || (new Map() as Map<string | number, BuildingSearchState>);
                const carrying = !!finishedInventory?.items?.length;

                if (carrying && finishedSquad.state !== 'returning') {
                  // Full or partial haul: force a return to HQ/storage to deposit
                  // BEFORE touching any queued building. The unload handler below
                  // resumes the preserved queue once the loot is dropped off.
                  const dropoff = findNearestStorageDropoff(workingSettlement, { x: finishedSquad.x, z: finishedSquad.z }, mapData.buildings);
                  combatResult.updatedSquads[i] = {
                    ...finishedSquad,
                    state: 'returning',
                    targetPos: { x: dropoff.x, z: dropoff.z },
                    targetBuildingId: null,
                    targetBuildingName: dropoff.name,
                    searchProgress: undefined,
                    pathState: undefined,
                  };
                } else if (!carrying && finishedSquad.state !== 'returning') {
                  // Empty haul: continue straight to the next queued building
                  // that still has loot, skipping any already-cleared structures.
                  const nextBuilding = findNextScavengeTarget(remainingQueue, mapData.buildings, searches);
                  if (nextBuilding) {
                    combatResult.updatedSquads[i] = orderSquadMove(
                      combatResult.updatedSquads,
                      sq.squadId,
                      nextBuilding.center,
                      nextBuilding.id,
                      nextBuilding.name || nextBuilding.type
                    ).find((s) => s.squadId === sq.squadId) || finishedSquad;
                  }
                }
                // Else (carrying and already 'returning', as set by the scavenging
                // service): leave the squad heading to deposit. The unload handler
                // resumes the preserved queue after unloading.
              }
            }
          }
        }
      }

      // Auto-unload squad inventories (and the cargo bay of the vehicle they are
      // mounted in) when returning inside HQ fortress OR any completed Storage Depot.
      for (let i = 0; i < combatResult.updatedSquads.length; i++) {
        const sq = combatResult.updatedSquads[i];
        const inv = workingSettlement.squadInventories?.[sq.squadId];
        const mountedVeh =
          workingSettlement.vehicles?.find((v) => v.assignedSquadId === sq.squadId) ||
          workingSettlement.vehicles?.find((v) => v.id === sq.depositVehicleId) ||
          // A squad that dismounted to search/deposit keeps a link to its parked
          // vehicle via assignedVehicleId — the cargo bay must be emptied too.
          workingSettlement.vehicles?.find((v) => v.id === sq.assignedVehicleId);
        const vehCargo = mountedVeh ? (mountedVeh.inventory || []).length : 0;
        if (!inv?.items?.length && vehCargo === 0) continue;

        const dropoff = findNearestStorageDropoff(workingSettlement, { x: sq.x, z: sq.z }, mapData?.buildings);
        if (dropoff) {
          const dropoffBldg = mapData?.buildings.find((b) => String(b.id) === String(dropoff.buildingId));
          const isInsideDropoff = dropoffBldg
            ? isSquadInsideBuilding({ x: sq.x, z: sq.z }, dropoffBldg)
            : Math.hypot(sq.x - dropoff.x, sq.z - dropoff.z) <= 4.0;

          if (isInsideDropoff) {
            let depositedAny = false;
            if (inv?.items?.length) {
              const res = unloadSquadAtDropoff(workingSettlement, sq.squadId, { x: sq.x, z: sq.z }, dropoff, 10);
              if (res.unloaded.length > 0) {
                workingSettlement = res.newState;
                depositedAny = true;
                const summary = res.unloaded.map((u) => `${formatLootLabel(u.label)} ×${u.quantity}`).join(', ');
                setToastMessage({
                  title: `SUPPLIES SECURED AT ${dropoff.name.toUpperCase()}`,
                  desc: `${sq.name} deposited haul into stockpile: ${summary}`,
                  type: 'success',
                });
                soundService.playBuildingPlaced();
              }
            }

            // A mounted squad also empties its vehicle's cargo bay at the dropoff.
            if (mountedVeh && vehCargo > 0) {
              const vehRes = unloadVehicleAtDropoff(workingSettlement, mountedVeh, dropoff, 10);
              if (vehRes.unloaded.length > 0) {
                workingSettlement = vehRes.newState;
                depositedAny = true;
                const summary = vehRes.unloaded.map((u) => `${formatLootLabel(u.label)} ×${u.quantity}`).join(', ');
                setToastMessage({
                  title: `VEHICLE CARGO DEPOSITED AT ${dropoff.name.toUpperCase()}`,
                  desc: `${mountedVeh.name} unloaded ${vehRes.unloaded.length} cargo slots into stockpile: ${summary}`,
                  type: 'success',
                });
                soundService.playBuildingPlaced();
              }
            }

            // Resume the preserved scavenge queue after depositing — but only for
            // squads ON FOOT. Mounted squads are picked up by the vehicle dispatch
            // logic below (the vehicle drives to the next queued building).
            if (depositedAny && sq.state === 'returning' && !mountedVeh) {
              // Skip any buildings that have since been fully cleared. If nothing
              // remains, the squad returns to idle.
              const searches = workingSettlement.buildingSearches || (new Map() as Map<string | number, BuildingSearchState>);
              const nextBuilding = findNextScavengeTarget(scavengeQueue[sq.squadId] || [], mapData?.buildings || [], searches);
              combatResult.updatedSquads[i] = nextBuilding
                ? orderSquadMove(combatResult.updatedSquads, sq.squadId, nextBuilding.center, nextBuilding.id, nextBuilding.name || nextBuilding.type)
                    .find((s) => s.squadId === sq.squadId) || { ...sq, state: 'idle', targetPos: null, targetBuildingName: null }
                : { ...sq, state: 'idle', targetPos: null, targetBuildingName: null };
            } else if (depositedAny && mountedVeh && sq.state === 'returning') {
              // Mounted squad just deposited: settle it to idle at the vehicle so
              // the dispatch loop below can drive to the next queued building.
              combatResult.updatedSquads[i] = { ...sq, state: 'idle', targetPos: null, targetBuildingName: null };
            } else if (depositedAny && sq.depositVehicleId) {
              // This squad dismounted to deposit BOTH its inventory and its
              // vehicle's cargo bay. After unloading, send it back to the parked
              // vehicle to re-board and resume the scavenge queue.
              const depotVeh = workingSettlement.vehicles?.find((v) => v.id === sq.depositVehicleId);
              combatResult.updatedSquads[i] = depotVeh
                ? {
                    ...sq,
                    depositVehicleId: null,
                    pendingMountVehicleId: depotVeh.id,
                    state: 'moving',
                    manualOrder: false,
                    targetPos: { x: depotVeh.position.x, z: depotVeh.position.z },
                    targetBuildingId: null,
                    targetBuildingName: `Return to ${depotVeh.name}`,
                    pathState: undefined,
                  }
                : { ...sq, depositVehicleId: null, state: 'idle', targetPos: null, targetBuildingName: null };
            }
          }
        }
      }

      // Mounted-squad logistics: vehicles carry the scavenge queue. Once a squad
      // finishes a building and boards again, dispatch its vehicle to the next
      // queued building; when the cargo bay is full (autoDepotReturn) drive the
      // vehicle home to deposit instead.
      if (mapData && roadGraphRef.current) {
        const searches =
          workingSettlement.buildingSearches || (new Map() as Map<string | number, BuildingSearchState>);
        let vehiclesChanged = false;
        const dispatchedVehicles = (workingSettlement.vehicles || []).map((veh) => {
          let v = veh;
          const mountedSquadId = v.assignedSquadId;
          const isParked = !v.isMoving && !v.targetPos && !v.autoScavengeBuildingId;

          // 1. Full cargo bay -> the squad boarded again; drive home to deposit.
          if (v.autoDepotReturn && mountedSquadId && isParked) {
            const dropTarget = findNearestStorageDropoff(
              workingSettlement,
              { x: v.position.x, z: v.position.z },
              mapData.buildings
            );
            const distToDrop =
              mapData && dropTarget.buildingId !== undefined
                ? Math.hypot(v.position.x - dropTarget.x, v.position.z - dropTarget.z)
                : 9999;
            if (distToDrop > 18 && !v.reachBlocked) {
              // Not at the depot yet (and the vehicle hasn't been stopped short
              // of an undrivable dock point): keep the flag set and drive there.
              v = orderVehicleRoadTravel(v, { x: dropTarget.x, z: dropTarget.z }, roadGraphRef.current);
              v = { ...v, autoDepotReturn: true };
              vehiclesChanged = true;
              setToastMessage({
                title: 'VEHICLE RETURNING TO DEPOSIT',
                desc: `${v.name} cargo bay is full — driving back to ${dropTarget.name.toUpperCase()} to unload before continuing.`,
                type: 'info',
              });
              return v;
            }
            // Parked (or stopped short of the building itself) with nothing to
            // deposit: the run is already complete — don't drag the squad out.
            const depotInv = workingSettlement.squadInventories?.[mountedSquadId];
            const depotCargo = (depotInv?.items?.length ?? 0) > 0 || (v.inventory || []).length > 0;
            if (!depotCargo) {
              v = { ...v, autoDepotReturn: false };
              vehiclesChanged = true;
              return v;
            }
            // Arrived at the depot: dismount the squad and send it ON FOOT into
            // the dropoff building so both the squad inventory AND the vehicle
            // cargo bay actually get deposited (a mounted squad would otherwise
            // just park and never trigger the in-building unload).
            const depotSq = combatResult.updatedSquads.find((s) => s.squadId === mountedSquadId);
            if (depotSq) {
              const dis = dismountSquadFromVehicle(v, depotSq);
              v = dis.updatedVehicle;
              v = { ...v, autoDepotReturn: false, reachBlocked: false };
              combatResult.updatedSquads[combatResult.updatedSquads.findIndex((s) => s.squadId === mountedSquadId)] = {
                ...dis.updatedSquad,
                depositVehicleId: v.id,
                state: 'moving',
                manualOrder: false,
                targetPos: { x: dropTarget.x, z: dropTarget.z },
                targetBuildingId: dropTarget.buildingId ?? null,
                targetBuildingName: `Deposit at ${dropTarget.name}`,
                pathState: undefined,
              };
              vehiclesChanged = true;
              setToastMessage({
                title: 'SQUAD DEPOSITING CARGO',
                desc: `${depotSq.name} unloading ${v.name}'s cargo bay and its haul into ${dropTarget.name.toUpperCase()}.`,
                type: 'info',
              });
            }
            return v;
          }

          // 1b. A mounted squad parked at/near a storage dropoff (HQ or
          // warehouse) with cargo on its back or in the bay — e.g. after a plain
          // right-click move order to the HQ — gets out and deposits BOTH
          // inventories, exactly like the auto-depot-return flow above. The squad
          // walks into the depot, the unload handler empties squad + vehicle, and
          // the squad then re-boards while the vehicle waits parked for it.
          if (mountedSquadId && isParked && !v.autoDepotReturn) {
            const nearbyDrop = findNearestStorageDropoff(
              workingSettlement,
              { x: v.position.x, z: v.position.z },
              mapData.buildings
            );
            const distToDrop = Math.hypot(v.position.x - nearbyDrop.x, v.position.z - nearbyDrop.z);
            const squadInv = workingSettlement.squadInventories?.[mountedSquadId];
            const hasCargo =
              (squadInv?.items?.length ?? 0) > 0 || (v.inventory || []).length > 0;
            const mountedUnit = combatResult.updatedSquads.find((s) => s.squadId === mountedSquadId);
            if ((distToDrop <= 30 || v.reachBlocked) && hasCargo && mountedUnit && !mountedUnit.depositVehicleId) {
              const dis = dismountSquadFromVehicle(v, mountedUnit);
              v = { ...dis.updatedVehicle, autoDepotReturn: false };
              combatResult.updatedSquads[combatResult.updatedSquads.findIndex((s) => s.squadId === mountedSquadId)] = {
                ...dis.updatedSquad,
                depositVehicleId: v.id,
                state: 'moving',
                manualOrder: false,
                targetPos: { x: nearbyDrop.x, z: nearbyDrop.z },
                targetBuildingId: nearbyDrop.buildingId ?? null,
                targetBuildingName: `Deposit at ${nearbyDrop.name}`,
                pathState: undefined,
              };
              vehiclesChanged = true;
              setToastMessage({
                title: 'SQUAD DEPOSITING CARGO',
                desc: `${mountedUnit.name} unloading its haul and ${v.name}'s cargo bay into ${nearbyDrop.name.toUpperCase()}.`,
                type: 'info',
              });
              return v;
            }
          }

          // 2. Mounted squad with a remaining queue -> drive to the next building.
          if (mountedSquadId && isParked && !v.autoDepotReturn) {
            const queue = scavengeQueueRef.current[mountedSquadId] || [];
            const nextBuilding = findNextScavengeTarget(queue, mapData.buildings, searches);
            if (nextBuilding) {
              v = orderVehicleRoadTravel(v, nextBuilding.center, roadGraphRef.current);
              v = {
                ...v,
                autoScavengeBuildingId: nextBuilding.id,
                autoScavengeBuildingName: nextBuilding.name || nextBuilding.type,
              };
              vehiclesChanged = true;
            }
          }
          return v;
        });
        if (vehiclesChanged) {
          workingSettlement = { ...workingSettlement, vehicles: dispatchedVehicles };
        }
      }

      // Commit fully resolved squad updates (combat, scavenging, and depot dropoffs)
      combatSquadsRef.current = combatResult.updatedSquads;
      setCombatSquads(combatResult.updatedSquads);

      // Settlement commit is deferred to the END of this tick: the sim step
      // below consumes `workingSettlement` synchronously (the same state the
      // old functional updater used as `prev`), and the final state is committed
      // once with setSettlement(nextState) after this section, which also
      // updates the ref for downstream readers (hidden-groups contact, scene).
      settlementRef.current = workingSettlement;

      // §5.2 ransom: hostile-human Hideout occupants capture a defeated squad
      // instead of killing it. Assign each captured squad to the nearest Hideout.
      if (combatResult.capturedSquadIds.length > 0) {
        const activeHideouts: RivalHideout[] = (
          Array.from(settlement.rivalHideouts.values()) as RivalHideout[]
        ).filter((h) => !h.isCleared && h.isDiscovered);

        if (activeHideouts.length > 0) {
          // Propagate captures into the working state directly — no functional
          // setState updater, so StrictMode can never run this twice.
          workingSettlement = (() => {
            const newHideouts = new Map(workingSettlement.rivalHideouts);
            const newSquads = [...workingSettlement.squads];
            let changed = false;

            for (const squadId of combatResult.capturedSquadIds) {
              const squadInfo = workingSettlement.squads.find((s) => s.id === squadId);
              if (!squadInfo || squadInfo.status === 'captured') continue;

              const squadUnit = combatResult.updatedSquads.find((s) => s.squadId === squadId);
              let best: RivalHideout | null = null;
              let bestDist = Infinity;
              for (const h of activeHideouts) {
                if (h.captiveSquadId) continue;
                const d = squadUnit
                  ? Math.hypot(squadUnit.x - h.position.x, squadUnit.z - h.position.z)
                  : Math.random();
                if (d < bestDist) {
                  bestDist = d;
                  best = h;
                }
              }
              if (!best) {
                best = activeHideouts.find((h) => !h.captiveSquadId) || activeHideouts[0];
              }

              const ransom = createRansomDemand(
                squadId,
                squadInfo.name,
                squadInfo.generalCount + 1,
                best.factionId
              );
              newHideouts.set(best.buildingId, {
                ...best,
                captiveSquadId: squadId,
                captiveSquadName: squadInfo.name,
                ransom,
              });
              const idx = newSquads.findIndex((s) => s.id === squadId);
              if (idx !== -1) newSquads[idx] = { ...squadInfo, status: 'captured' as const };
              setActiveRansomHideoutId(best.buildingId);
              changed = true;
            }

            return changed
              ? { ...workingSettlement, rivalHideouts: newHideouts, squads: newSquads }
              : workingSettlement;
          })();
        } else {
          // No rival Hideout to hold them — fall back to the normal permanent-loss path.
          for (const squadId of combatResult.capturedSquadIds) {
            const squadUnit = combatResult.updatedSquads.find((s) => s.squadId === squadId);
            if (!squadUnit) continue;
            const res = recordFallenHero(
              workingSettlement,
              squadUnit.leaderId,
              'combat_slain',
              `Tactical Grid (${Math.round(squadUnit.x)}, ${Math.round(squadUnit.z)})`,
              nextClock.day
            );
            workingSettlement = res.newState;
          }
        }
      }

      // 4. Tick Infection & Outbreak Simulation (§6.2, §6.3)
      // PURE simulation step — the new state is computed synchronously from the
      // working settlement (post-combat, post-dispatch, post-ransom — i.e. the
      // exact state the old functional updater received as `prev`) and every
      // side effect (toasts, zombie/defender spawns, sounds, squad/vehicle
      // commits) is COLLECTED into simFx, then applied exactly once afterwards.
      // The step runs in the interval body — there is NO functional setState
      // updater, so React StrictMode (dev) has nothing to double-invoke: the old
      // updater fired side effects twice (duplicated LAIR ESCALATION toasts,
      // double-spawned zombies) every time it was double-run.
      const simFx: {
        toasts: ToastMessage[];
        outbreakAlert: boolean;
        postVehicleSquads: TacticalSquadUnit[] | null;
        visualFx: CombatVisualFx[];
        noiseEvents: NoiseEvent[];
        defenders: HostileHumanUnit[];
        ransomClearIds: (string | number)[];
        finalZombies: ZombieUnit[];
      } = {
        toasts: [],
        outbreakAlert: false,
        postVehicleSquads: null,
        visualFx: [],
        noiseEvents: [],
        defenders: [],
        ransomClearIds: [],
        finalZombies: [],
      };

      const prevTick = workingSettlement;
      let current = prevTick;
      const fx = {
          toasts: [] as ToastMessage[],
          outbreakAlert: false,
          postVehicleSquads: null as TacticalSquadUnit[] | null,
          visualFx: [] as CombatVisualFx[],
          noiseEvents: [] as NoiseEvent[],
          defenders: [] as HostileHumanUnit[],
          ransomClearIds: [] as (string | number)[],
          finalZombies: [] as ZombieUnit[],
        };

        // A. Register new bite infections from combat
        if (combatResult.newInfections.length > 0) {
          const updatedInfections = new Map(current.infections || new Map());
          for (const inf of combatResult.newInfections) {
            if (!updatedInfections.has(inf.survivorId)) {
              updatedInfections.set(inf.survivorId, inf);
            }
          }
          current = { ...current, infections: updatedInfections };
        }

        // B. Register combat fallen heroes (Permanent death §6.2)
        if (combatResult.fallenHeroEvents.length > 0) {
          for (const hero of combatResult.fallenHeroEvents) {
            const res = recordFallenHero(
              current,
              hero.survivorId,
              hero.cause,
              hero.location,
              nextClock.day
            );
            current = res.newState;
          }
        }

        // C. Apply building durability damage to settlement state if any building took damage
        let adaptedChanged = false;
        const newAdapted = new Map(current.adaptedBuildings);
        for (const [id, bldg] of combatResult.updatedAdaptedBuildings.entries()) {
          const old = current.adaptedBuildings.get(id);
          if (old && old.currentDurability !== bldg.currentDurability) {
            newAdapted.set(id, bldg);
            adaptedChanged = true;
          }
        }
        if (adaptedChanged) {
          current = { ...current, adaptedBuildings: newAdapted };
        }

        // D. Tick biological infection progression & outbreak containment
        const infSim = tickInfectionSimulation(
          current,
          TICK_DELTA,
          nextClock.speed,
          nextClock.day
        );

        // Fresh zombie list per invocation — the closure `workingZombies` is
        // never mutated in here, so StrictMode double-invocation cannot
        // double-spawn.
        let tickZombies = [...workingZombies];
        if (infSim.newZombies.length > 0) {
          tickZombies = [...tickZombies, ...infSim.newZombies];
        }

        if (infSim.notifications.length > 0) {
          const ev = infSim.notifications[0];
          if (ev.title.includes('OUTBREAK') || ev.title.includes('🚨')) {
            fx.outbreakAlert = true;
          }
          fx.toasts.push({ title: ev.title, desc: ev.desc, type: ev.type });
        }

        // E. Tick Vehicle Simulation & Road Navigation (§8)
        let updatedVehicles = infSim.newState.vehicles || [];
        const effectiveDelta = TICK_DELTA * (nextClock.speed === 0 ? 0 : nextClock.speed);
        if (updatedVehicles.length > 0) {
          const vehTick = updateVehiclesTick(
            updatedVehicles,
            combatResult.updatedSquads,
            tickZombies,
            effectiveDelta,
            Date.now(),
            mapDataRef.current || undefined,
            roadGraphRef.current,
            infSim.newState.freestandingBuildings || [],
            // Combined obstacle stamp: a fresh grid per map (gridId) and any
            // wall/gate/tower placement or removal (revision) both change the
            // stamp, invalidating cached vehicle road routes.
            pathGridRef.current
              ? pathGridRef.current.gridId * 1000 + pathGridRef.current.revision
              : 0
          );

          if (vehTick.notifications.length > 0) {
            const ev = vehTick.notifications[0];
            fx.toasts.push({ title: ev.title, desc: ev.desc, type: ev.type });
          }

          if (vehTick.visualFx.length > 0) {
            fx.visualFx.push(...vehTick.visualFx);
          }

          // Surface the vehicle engine noise into the noise-event stream so the
          // next combat tick's sound-detection passes it to zombies (moving
          // vehicles attract hordes to their position).
          if (vehTick.noiseEvents.length > 0) {
            fx.noiseEvents.push(...vehTick.noiseEvents);
          }

          tickZombies = vehTick.updatedZombies;
          fx.postVehicleSquads = vehTick.updatedSquads;
          updatedVehicles = vehTick.updatedVehicles;
        }

        // F. Tick Zombie Lairs & Rival Hideouts (§5.2)
        // Post-vehicle squad list feeds both threat systems exactly as before.
        const threatSquads = fx.postVehicleSquads || combatResult.updatedSquads;
        const lairTick = tickZombieLairs(
          current.zombieLairs,
          threatSquads,
          mapData?.buildings || [],
          Date.now(),
          effectiveDelta
        );
        if (lairTick.spawnedZombies.length > 0) {
          tickZombies = [...tickZombies, ...lairTick.spawnedZombies];
        }

        const hideoutTick = tickRivalHideouts(
          current.rivalHideouts,
          combatResult.updatedHostileHumans,
          threatSquads
        );
        fx.defenders = hideoutTick.spawnedDefenders;

        let nextState = {
          ...infSim.newState,
          vehicles: updatedVehicles,
          zombieLairs: lairTick.updatedLairs,
          rivalHideouts: hideoutTick.updatedHideouts,
        };

        // Free captives when their Hideout is cleared (§5.2 rescue path)
        for (const cleared of hideoutTick.clearedHideouts) {
          if (cleared.captiveSquadId) {
            const rescue = freeCaptive(
              nextState,
              cleared.buildingId,
              cleared.captiveSquadId,
              cleared.captiveSquadName || 'Captured Squad'
            );
            nextState = rescue.newState;
            fx.ransomClearIds.push(cleared.buildingId);
            fx.toasts.push({
              title: 'CAPTIVE RESCUED',
              desc: `${cleared.captiveSquadName} was freed when ${cleared.buildingName} fell!`,
              type: 'success',
            });
          }
        }

        for (const n of lairTick.notifications) {
          fx.toasts.push({ title: n.title, desc: n.desc, type: n.type });
        }
        for (const n of hideoutTick.notifications) {
          fx.toasts.push({ title: n.title, desc: n.desc, type: n.type });
        }
        fx.finalZombies = tickZombies;

      // Commit the computed state with a non-functional set (no updater to
      // double-invoke), sync the ref for downstream readers this tick, and hand
      // the collected side effects to the apply phase below (exactly once).
      Object.assign(simFx, fx);
      settlementRef.current = nextState;
      setSettlement(nextState);

      // ---- Apply the collected side effects exactly once (StrictMode-safe) ----
      for (const t of simFx.toasts) setToastMessage(t);
      if (simFx.outbreakAlert) soundService.playOutbreakAlert();
      if (simFx.ransomClearIds.length > 0) {
        // Dismiss the active ransom dialog when its hideout was cleared.
        setActiveRansomHideoutId((cur) =>
          cur !== null && simFx.ransomClearIds.some((id) => cur === id) ? null : cur
        );
      }
      if (simFx.postVehicleSquads) {
        // Commit vehicle-tick squad changes (boarding, position sync) so the next
        // combat tick and all UI reads see the mounted squad instead of a stale copy.
        combatResult.updatedSquads = simFx.postVehicleSquads;
        combatSquadsRef.current = simFx.postVehicleSquads;
        setCombatSquads(simFx.postVehicleSquads);
      }
      if (simFx.visualFx.length > 0) combatResult.newVisualFx.push(...simFx.visualFx);
      if (simFx.noiseEvents.length > 0) setNoiseEvents((prev) => [...prev, ...simFx.noiseEvents]);
      if (simFx.defenders.length > 0) {
        // One defender wave per hideout per tick (dedupe by hideoutId).
        const seenHideouts = new Set<string>();
        const freshDefenders = simFx.defenders.filter((d) => {
          const k = String(d.hideoutId);
          if (seenHideouts.has(k)) return false;
          seenHideouts.add(k);
          return true;
        });
        setHostileHumans((prev) => [...prev, ...freshDefenders]);
      }
      workingZombies = simFx.finalZombies.length > 0 ? simFx.finalZombies : workingZombies;
      setZombies(workingZombies);

      // Automatically make contact with survivors when a squad enters a smoke-marked
      // survivor building. Read the ref, not the interval's render closure: this
      // loop can otherwise inspect an older hiddenGroups map after a movement tick.
      const currentHiddenGroups = getHiddenGroupValues(settlementRef.current.hiddenGroups);
      for (const squad of combatResult.updatedSquads) {
        if (!squad.isDeployed || squad.currentHp <= 0) continue;
        for (const group of currentHiddenGroups) {
          if (!group.hasSmokeClue || group.isRecruited) continue;
          const groupBuilding = mapData.buildings.find((b) => String(b.id) === String(group.buildingId));
          if (!groupBuilding || !isSquadInsideBuilding({ x: squad.x, z: squad.z }, groupBuilding)) continue;
          const groupKey = String(group.buildingId);
          if (contactedSurvivorGroupIdsRef.current.has(groupKey)) continue;
          contactedSurvivorGroupIdsRef.current.add(groupKey);
          setSettlement((prev) => {
            const groups = new Map(prev.hiddenGroups);
            const currentEntry = (Array.from(groups.entries()) as [string | number, HiddenSurvivorGroup][]).find(
              ([key, value]) => String(key) === String(group.buildingId) || String(value.buildingId) === String(group.buildingId)
            );
            if (currentEntry && !currentEntry[1].isDiscovered) {
              groups.set(currentEntry[0], { ...currentEntry[1], isDiscovered: true });
            }
            return { ...prev, hiddenGroups: groups };
          });
          setActiveRecruitmentGroup({ ...group, isDiscovered: true });
          setToastMessage({ title: 'SURVIVORS CONTACTED', desc: `${group.leader.name} responded from ${group.buildingName}. Establish communication to determine whether they will join the colony.`, type: 'success' });
          break;
        }
      }

      // 5. Dynamic Ambient Soundscape & Danger Level calculation (§15)
      let activeAggroZombies = 0;
      let attackingZombies = 0;
      for (const z of workingZombies) {
        if (z.state === 'dead') continue;
        if (z.state === 'chasing' || z.state === 'investigating_sound') activeAggroZombies++;
        else if (z.state === 'attacking_unit' || z.state === 'attacking_building') attackingZombies++;
      }

      const activeOutbreaksCount = Array.from(settlement.outbreaks?.values() || []).filter(
        (o: any) => Boolean(o?.isOutbreakActive)
      ).length;

      const baseThreat = nextClock.isNight ? 0.35 : nextClock.phase === 'dusk' ? 0.15 : 0.0;
      const aggroThreat = Math.min(0.4, activeAggroZombies * 0.04 + attackingZombies * 0.12);
      const outbreakThreat = activeOutbreaksCount > 0 ? 0.3 : 0.0;
      const totalDanger = Math.min(1.0, baseThreat + aggroThreat + outbreakThreat);

      setDangerLevel(totalDanger);
      soundService.updateAmbient(nextClock.phase, nextClock.isNight, totalDanger);

      // Forward combat entities & visual FX to Three.js WorldScene
      if (sceneRef.current) {
        sceneRef.current.updateCombat(
          combatResult.updatedZombies,
          combatResult.updatedSquads,
          combatResult.newVisualFx,
          selectedSquadId,
          combatResult.droppedItems,
          combatResult.updatedHostileHumans,
          settlement.resourceWorkOrders || [],
          settlement.constructionOrders || []
        );

        sceneRef.current.updateVehicles(
          settlement.vehicles || [],
          selectedVehicleId
        );

        // Fog of war + faction entity markers (§3.5, §5.0). The shroud is live
        // from the moment the world loads (squads/HQ/vehicles cut it open as they
        // scout); with no vision sources yet, a starter landing-zone bubble keeps
        // spawn from being pitch black.
        const fog = settlement.fogOfWar || (mapData ? createFogGrid(mapData) : null);
        const fogEnabled = true;
        if (fog) {
          const visionSources = settlement.hq
            ? computeVisionSources(
                settlement,
                combatResult.updatedSquads,
                settlement.vehicles || []
              )
            : [];
          const visibleCells = computeVisibleCells(fog, visionSources);
          fogVisibleCellsRef.current = visibleCells;

          sceneRef.current.updateFogOfWar(fog, visibleCells, fogEnabled, visionSources);
          sceneRef.current.updateEntityMarkers(
            combatResult.updatedSquads,
            settlement.vehicles || [],
            settlement.hiddenGroups,
            combatResult.updatedZombies,
            mapData,
            fogEnabled,
            settlement.rivalHideouts,
            settlement.zombieLairs,
            settlement.resourceWorkOrders || [],
            settlement.constructionOrders || [],
            settlement.buildingSearches
          );
        }
      }

      // Handle combat notifications
      if (combatResult.settlementNotifications.length > 0) {
        const notif = combatResult.settlementNotifications[0];
        setToastMessage({ title: notif.title, desc: notif.desc, type: notif.type });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [
    viewMode,
    isDescentActive,
    mapData,
    gameClock,
    zombies,
    combatSquads,
    hostileHumans,
    droppedItems,
    noiseEvents,
    selectedSquadId,
    selectedVehicleId,
    settlement.adaptedBuildings,
    settlement.vehicles,
    settlement.hq,
    settlement.fogOfWar,
    settlement.hiddenGroups,
    settlement.rivalHideouts,
    settlement.zombieLairs,
    settlement.weather,
    settlement.isInitialized,
    timeOfDay,
  ]);
}