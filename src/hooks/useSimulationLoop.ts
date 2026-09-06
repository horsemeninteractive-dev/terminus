import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  advanceGameClock,
  emitNoiseEvent,
  generateHordeWave, HORDE_DOMINANT_LABEL,
  orderSquadMove,
} from '../services/combatService';
import { recordFallenHero } from '../services/infectionService';
import { createRansomDemand, freeCaptive } from '../services/rivalFactionService';
import { computeVisibleCells, computeVisionSources, createFogGrid } from '../services/fogOfWarService';
import {
  findNearestStorageDropoff,
  formatLootLabel,
  hasStockpileRoomForHaul,
  isSettlementDropoffBuilding,
  isSquadInsideBuilding,
  tickBuildingScavengeProgress,
} from '../services/scavengingService';
import { gameSettingsService } from '../services/gameSettingsService';
import { saveService } from '../services/saveService';
import { soundService, ToastMessage } from '../services/soundService';
import { findNextScavengeTarget, getHiddenGroupValues, isBuildingExhausted } from '../lib/scavengeQueueHelpers';
import {
  collectStrandedLoot,
  getStrandedLootOrderId,
  isStrandedLootOrderId,
  STRANDED_COLLECT_RADIUS_M,
} from '../services/strandedLootService';
import { getPrimaryHQ } from '../services/buildingOperational';
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
import { runSimulationPipeline } from '../services/simulationPipeline';

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
  selectedSquadIds: string[];
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
  missionState: import('../types/mission').MissionState;
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
  // One warning per squad per storage-full hold episode (cleared when the squad
  // starts returning to deposit again).
  const heldHaulWarnedRef = useRef(new Set<string>());
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
    selectedSquadIds,
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
    missionState,
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
        const hqPos = getPrimaryHQ(settlement)?.center || { x: 0, z: 0 };
        const { zombies: horde, dominant: hordeType } = generateHordeWave(nextClock.day, hqPos, 180, true);

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
            : `${HORDE_DOMINANT_LABEL[hordeType].toUpperCase()} horde (Wave Day ${nextClock.day}) is mobilizing and aggressive! Workers have returned to shelter; production, construction and research pause until dawn.`,
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
                // Persist the sim-owned map so autosaves keep node depletion.
                mapData: mapDataRef.current || mapData,
                caravans,
                radioState: radioDirectiveState,
                // Persist mission progress — without this, loading an autosave
                // restarts the campaign from the first quest.
                missionState: missionState,
                hasCompletedFirstScavenge: true,
                combatSquads,
                // Persist the scavenge queue like quicksaves do.
                scavengeQueue,
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
      let workingSettlement = settlementRef.current;
      const pipelineResult = runSimulationPipeline({
        state: workingSettlement,
        // Feed the map from the ref so each tick continues from the previous
        // tick's committed depletion instead of resetting to the stale prop.
        mapData: mapDataRef.current || mapData,
        squads: combatSquadsRef.current,
        zombies,
        hostileHumans,
        noiseEvents,
        droppedItems,
        clock: nextClock,
        deltaSeconds: TICK_DELTA,
        pathGrid: pathGridRef.current,
        roadGraph: roadGraphRef.current,
        alarmActive: isAlarmActive,
      });
      workingSettlement = pipelineResult.state;
      // The pipeline's resource-gathering stage mutates node amounts/positions;
      // commit its mapData so the next tick and the scene stay in sync.
      mapDataRef.current = pipelineResult.mapData;
      sceneRef.current?.updateResourceAmounts(pipelineResult.mapData.resourceNodes);
      const combatResult = pipelineResult.combat;
      combatResult.updatedSquads = pipelineResult.squads;
      for (const event of pipelineResult.events) setToastMessage(event);
      combatResult.updatedZombies = pipelineResult.zombies;

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

      // Post-deposit queue resume: a squad that was 'returning' to deposit loot
      // and now has an empty inventory (the logistics pipeline just unloaded it)
      // should immediately proceed to the next building in its scavenge queue
      // rather than standing idle at the storage depot.
      if (mapData?.buildings) {
        const curQueue = scavengeQueueRef.current;
        for (let i = 0; i < combatResult.updatedSquads.length; i++) {
          const sq = combatResult.updatedSquads[i];
          if (sq.currentHp <= 0 || sq.mountedVehicleId || sq.manualOrder || sq.holdHaul || sq.onExpedition) continue;
          const queue = curQueue[sq.squadId];
          if (!queue?.length) continue;
          // Check: inventory is empty (just deposited) and near or at the dropoff
          const inv = workingSettlement.squadInventories?.[sq.squadId];
          if (inv?.items?.length) continue; // Still carrying — hasn't deposited yet
          // The combat tick clears targetPos and sets state 'idle' the moment a
          // 'returning' squad ARRIVES at its destination, so a squad mid-walk
          // still carries loot and is skipped above; only a squad that has
          // finished its trip (arrived, unloaded, no destination left) reaches
          // this point. Requiring 'idle' + no targetPos also keeps squads that
          // are actively searching/combat/retreating (or waiting on a queued
          // manual move) out of the resume path.
          if (sq.targetPos) continue; // Still walking somewhere
          if (sq.state !== 'idle') continue;
          const searches = workingSettlement.buildingSearches || (new Map() as Map<string | number, BuildingSearchState>);
          // Never resume onto the HQ or the settlement's own storage depots —
          // those are dropoff destinations, not loot targets.
          const nextBuilding = findNextScavengeTarget(
            queue.filter((id) => !isSettlementDropoffBuilding(workingSettlement, id)),
            mapData.buildings,
            searches
          );
          if (nextBuilding) {
            combatResult.updatedSquads[i] = orderSquadMove(
              combatResult.updatedSquads,
              sq.squadId,
              nextBuilding.center,
              nextBuilding.id,
              nextBuilding.name || nextBuilding.type
            ).find((s) => s.squadId === sq.squadId) || sq;
          } else {
            // Queue exhausted — clear it and leave the squad idle at the depot
            setScavengeQueue((prev) => {
              const next = { ...prev };
              delete next[sq.squadId];
              return next;
            });
            combatResult.updatedSquads[i] = {
              ...sq,
              state: 'idle',
              targetPos: null,
              targetBuildingId: null,
              targetBuildingName: null,
            };
          }
        }
      }

      // Scavenging Over Time: progress search when squad is inside/at building footprint
      if (mapData?.buildings) {
        // IFZ storage gate — deposit re-check: a squad that held its haul out
        // in the field because storage was full returns the moment storage frees,
        // without needing a manual order. Skipped for mounted squads (the vehicle
        // drives) and squads under a fresh player order.
        for (let i = 0; i < combatResult.updatedSquads.length; i++) {
          const sq = combatResult.updatedSquads[i];
          if (!sq.holdHaul || sq.currentHp <= 0 || sq.mountedVehicleId || sq.manualOrder) continue;
          const heldInv = workingSettlement.squadInventories?.[sq.squadId];
          if (!heldInv?.items?.length) {
            combatResult.updatedSquads[i] = { ...sq, holdHaul: false };
            continue;
          }
          if (!hasStockpileRoomForHaul(workingSettlement, heldInv.items)) continue;
          const dropoff = findNearestStorageDropoff(workingSettlement, { x: sq.x, z: sq.z }, mapData.buildings);
          combatResult.updatedSquads[i] = {
            ...sq,
            holdHaul: false,
            state: 'returning',
            manualOrder: false, // auto deposit run, not a player order
            targetPos: { x: dropoff.x, z: dropoff.z },
            targetBuildingId: null,
            targetBuildingName: dropoff.name,
            searchProgress: undefined,
            pathState: undefined,
          };
          heldHaulWarnedRef.current.delete(sq.squadId);
        }

        for (let i = 0; i < combatResult.updatedSquads.length; i++) {
          const sq = combatResult.updatedSquads[i];
          if (sq.currentHp <= 0 || sq.state === 'downed' || sq.state === 'retreating') continue;
          // A squad holding its haul (storage full) stays put — do not re-dispatch
          // it into the building it just searched; the re-check above sends it
          // home once storage frees.
          if (sq.holdHaul) continue;

          // Check if squad is targeting a building or inside a building footprint
          let targetBldg = sq.targetBuildingId
            ? mapData.buildings.find((b) => String(b.id) === String(sq.targetBuildingId))
            : undefined;

          // Stranded field-loot recovery: the squad was dispatched to a
          // gatherer / demolition overflow pile. When it arrives, collect what
          // fits into its backpack so the depot unload flow deposits it later.
          if (isStrandedLootOrderId(sq.targetBuildingId)) {
            const piles = workingSettlement.fieldLootPiles || [];
            const pile = piles.find((p) => getStrandedLootOrderId(p.id) === sq.targetBuildingId);
            if (pile && Math.hypot(sq.x - pile.position.x, sq.z - pile.position.z) <= STRANDED_COLLECT_RADIUS_M) {
              const before = workingSettlement.fieldLootPiles?.reduce((n, p) => n + p.wood + p.metal + p.bricks, 0) || 0;
              const res = collectStrandedLoot(workingSettlement, sq, pile);
              const after = (res.newState.fieldLootPiles || []).reduce((n, p) => n + p.wood + p.metal + p.bricks, 0);
              const collected = Math.max(0, before - after);
              if (collected > 0) {
                workingSettlement = res.newState;
                combatResult.updatedSquads[i] = {
                  ...sq,
                  targetBuildingId: null,
                  targetBuildingName: null,
                  targetPos: null,
                };
                setToastMessage({
                  title: 'FIELD LOOT RECOVERED',
                  desc: `${sq.name} collected ${collected} units of stranded field loot. Deposit it at any Storage Depot or HQ.`,
                  type: 'success',
                });
                soundService.playCombatActionSFX('assault_order');
              } else {
                setToastMessage({
                  title: 'BACKPACK FULL',
                  desc: `${sq.name} cannot carry more — free inventory slots before recovering stranded field loot.`,
                  type: 'warn',
                });
                combatResult.updatedSquads[i] = {
                  ...sq,
                  targetBuildingId: null,
                  targetBuildingName: null,
                  targetPos: null,
                };
              }
              continue;
            }
          }

          // If no explicit target building but squad is searching or idle inside a building footprint
          if (!targetBldg && (sq.state === 'searching' || (sq.state === 'idle' && !sq.targetPos))) {                  targetBldg = mapData.buildings.find((b) => isSquadInsideBuilding({ x: sq.x, z: sq.z }, b));
          }

          // Scavenging begins only after the squad reaches the precise point
          // selected by the player inside the building — and never on the
          // headquarters or the colony's own storage depots, which are dropoff
          // destinations, not loot targets (otherwise a squad depositing its
          // haul inside the warehouse would start "looting" its own depot).
          const targetIsDropoff = !!targetBldg && isSettlementDropoffBuilding(workingSettlement, targetBldg.id);
          if (targetIsDropoff && sq.state === 'searching') {
            // Ordered (or auto-acquired) into the HQ / a storage depot: the
            // combat tick flipped the squad to 'searching' on arrival because
            // it carries a targetBuildingId. It is a dropoff, never a loot
            // target — stand down to idle so the deposit stage acts and the
            // post-deposit queue resume isn't blocked by a phantom search.
            combatResult.updatedSquads[i] = {
              ...sq,
              state: 'idle',
              targetBuildingId: null,
              targetBuildingName: null,
              searchProgress: undefined,
            };
          }
          if (
            targetBldg &&
            !targetIsDropoff &&
            isSquadInsideBuilding({ x: sq.x, z: sq.z }, targetBldg)
          ) {
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

              // If structure search completed (100% progress)
              if (scavResult.isCompleted) {
                const searchesNow =
                  workingSettlement.buildingSearches || (new Map() as Map<string | number, BuildingSearchState>);
                const stillHasLoot = !isBuildingExhausted(targetBldg.id, searchesNow);
                if (!stillHasLoot) {
                  setToastMessage({
                    title: 'STRUCTURE CLEARED',
                    desc: `${targetBldg.name || 'Structure'} has been fully scavenged and secured.`,
                    type: 'success',
                  });
                }
                // A building completed with loot left behind STAYS in the queue
                // (and is re-inserted at the front if a single right-click order
                // never queued it), so the squad revisits it right after
                // depositing. Only fully cleared buildings are dropped.
                const curQueue = scavengeQueue[sq.squadId] || [];
                let remainingQueue: Array<string | number>;
                if (stillHasLoot) {
                  remainingQueue = curQueue.some((id) => String(id) === String(targetBldg.id))
                    ? curQueue
                    : [targetBldg.id, ...curQueue];
                } else {
                  remainingQueue = curQueue.filter((id) => String(id) !== String(targetBldg.id));
                }
                setScavengeQueue((prev) => ({ ...prev, [sq.squadId]: remainingQueue }));
                const finishedSquad = combatResult.updatedSquads[i];
                const finishedInventory = workingSettlement.squadInventories?.[sq.squadId];
                const searches = workingSettlement.buildingSearches || (new Map() as Map<string | number, BuildingSearchState>);
                const carrying = !!finishedInventory?.items?.length;

                if (carrying && finishedSquad.state !== 'returning') {
                  // IFZ storage gate: only force a return to HQ/storage when the
                  // settlement can actually accept the haul. With storage full the
                  // squad does NOT trek home — it holds the loot out in the field
                  // (holdHaul) and auto-returns the moment storage frees, so a
                  // pointless round-trip to a full depot is avoided entirely.
                  const haulItems = finishedInventory?.items || [];
                  if (!hasStockpileRoomForHaul(workingSettlement, haulItems)) {
                    combatResult.updatedSquads[i] = {
                      ...finishedSquad,
                      state: 'idle',
                      manualOrder: false, // auto hold, not a player order
                      holdHaul: true,
                      targetPos: null,
                      targetBuildingId: null,
                      targetBuildingName: null,
                      searchProgress: undefined,
                      pathState: undefined,
                    };
                    if (!heldHaulWarnedRef.current.has(sq.squadId)) {
                      heldHaulWarnedRef.current.add(sq.squadId);
                      const units = haulItems.reduce((sum: number, it: any) => sum + (it.quantity || 1), 0);
                      setToastMessage({
                        title: 'STORAGE FULL — SQUAD HOLDS HAUL',
                        desc: `${sq.name} is holding ${units} units in the field. Build more storage and it will return to deposit automatically.`,
                        type: 'warn',
                      });
                    }
                  } else {
                    // Full or partial haul: force a return to HQ/storage to deposit
                    // BEFORE touching any queued building. The unload handler below
                    // resumes the preserved queue once the loot is dropped off.
                    const dropoff = findNearestStorageDropoff(workingSettlement, { x: finishedSquad.x, z: finishedSquad.z }, mapData.buildings);
                    combatResult.updatedSquads[i] = {
                      ...finishedSquad,
                      state: 'returning',
                      manualOrder: false, // auto deposit run, not a player order
                      targetPos: { x: dropoff.x, z: dropoff.z },
                      targetBuildingId: null,
                      targetBuildingName: dropoff.name,
                      searchProgress: undefined,
                      pathState: undefined,
                    };
                  }
                } else if (!carrying && finishedSquad.state !== 'returning') {
                  // Empty haul: continue straight to the next queued building
                  // that still has loot, skipping any already-cleared structures
                  // and the HQ / storage depots (legacy queues may contain them
                  // pre-guard).
                  const nextBuilding = findNextScavengeTarget(
                    remainingQueue.filter((id) => !isSettlementDropoffBuilding(workingSettlement, id)),
                    mapData.buildings,
                    searches
                  );
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

      // Depot unloading and mounted-vehicle logistics are now handled by the
      // authoritative logistics stage inside the simulation pipeline.
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

      // 4. Apply world-stage results already produced by the authoritative pipeline.
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
        const infSim = pipelineResult.infection;

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
        let updatedVehicles = pipelineResult.vehicles.updatedVehicles || [];
        const effectiveDelta = TICK_DELTA * (nextClock.speed === 0 ? 0 : nextClock.speed);
        if (updatedVehicles.length > 0) {
          const vehTick = pipelineResult.vehicles;

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
        const lairTick = pipelineResult.lairs;
        if (lairTick.spawnedZombies.length > 0) tickZombies = [...tickZombies, ...lairTick.spawnedZombies];
        const hideoutTick = pipelineResult.hideouts;
        fx.defenders = hideoutTick.spawnedDefenders;

        // Commit the FULL working settlement, not the pipeline's pre-scavenge
        // snapshot. `current` chains: pipeline state → scavenge mutations
        // (buildingSearches progress, carried loot, return orders) → ransom
        // captives → A/B/C combat mutations (bite infections, fallen heroes,
        // building durability). Spreading `infSim.newState` here reverted all
        // of those every tick — search progress never advanced, loot never
        // reached the stockpile, and combat bite/death effects were lost.
        let nextState = { ...current };

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
      // NOTE: the pipeline's vehicle stage already ran as part of
      // runSimulationPipeline and its squad output (boarding, position sync,
      // dismount) flows into `combatResult.updatedSquads` via
      // pipelineResult.squads. Because that stage ran BEFORE this tick's
      // scavenge block, there is deliberately NO postVehicleSquads re-commit
      // here — re-committing it would revert searchProgress / 'returning'
      // states the scavenge block just wrote, which is the exact regression
      // where squads searched forever without ever depositing loot.
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
          settlement.constructionOrders || [],
          selectedSquadIds
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
          const visionSources = getPrimaryHQ(settlement)
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
            settlement.occupiedBuildings?.buildings,
            settlement.resourceWorkOrders || [],
            settlement.constructionOrders || [],
            settlement.buildingSearches,
            settlement.fieldLootPiles || []
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
    selectedSquadIds,
    selectedVehicleId,
    settlement.adaptedBuildings,
    settlement.vehicles,
    getPrimaryHQ(settlement),
    settlement.fogOfWar,
    settlement.hiddenGroups,
    settlement.rivalHideouts,
    settlement.zombieLairs,
    settlement.weather,
    settlement.isInitialized,
    timeOfDay,
  ]);
}