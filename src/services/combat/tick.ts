import { Point2D } from '../../types/map';
import { DeathCause, SurvivorInfection } from '../../types/infection';
import {
  CombatVisualFx,
  DroppedItem,
  GameClockState,
  HostileHumanUnit,
  NoiseEvent,
  TacticalSquadUnit,
  WeaponItemId,
  ZombieUnit,
  WEAPON_CATALOG,
  getArmorDefinition,
  getWeaponDefinition,
} from '../../types/combat';
import { AdaptedBuilding, SettlementState } from '../../types/settlement';
import { ElevationGrid } from '../../types/map';
import { terrainSlopeSpeedFactor } from '../elevationService';
import { createSurvivorInfection, rollBiteChance } from '../infectionService';
import { isResearchUnlocked } from '../researchService';
import { getCanonicalDefenseDef } from '../../data/functionalBuildings';
import { getPrimaryHQ, isBuildingOperational } from '../buildingOperational';
import { getPoweredBuildingIds } from '../powerService';
import { WEATHER_CONDITIONS, getZombieActivityModifiers } from '../weatherService';
import { soundService } from '../soundService';
import { PathGrid, stepAlongPath } from '../pathfindingService';
import { tickMedicalFacilityCare } from './medical';
import { recomputeSquadHealth, recomputeSquadStats } from './armory';
import { emitNoiseEvent } from './noise';

// ==========================================
// 6. Complete Real-Time Combat Tick Loop (§5, §5.1, §6.1)
// ==========================================

export interface CombatTickResult {
  updatedZombies: ZombieUnit[];
  updatedSquads: TacticalSquadUnit[];
  updatedAdaptedBuildings: Map<string | number, AdaptedBuilding>;
  activeNoiseEvents: NoiseEvent[];
  newVisualFx: CombatVisualFx[];
  settlementNotifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' | 'danger' }[];
  newInfections: SurvivorInfection[];
  fallenHeroEvents: { survivorId: string; cause: DeathCause; location: string }[];
  droppedItems: DroppedItem[];
  // §5.2 rival factions: armed hostile-human occupants of Hideouts, plus any
  // player squads they overpowered this tick (captured for ransom, not killed).
  updatedHostileHumans: HostileHumanUnit[];
  capturedSquadIds: string[];
  ammoConsumed: number;
  /** Fresh infected deaths this tick — the authoritative colony kill counter.
   *  Every kill source (squad fire/melee, wire bleed, tower fire, vehicle ram)
   *  funnels through the zombie update map exactly once: same-tick sources
   *  arrive with currentHp <= 0 already, next-tick sources are caught the
   *  following pass while still state !== 'dead'. */
  zombiesKilled: number;
}

/** True when stepAlongPath produced the dead one-point path: the goal is
 *  obstructed and A* could not find any route to it. This is the pathfinder's
 *  definitive "no path" signal — the unit stands still instead of phasing
 *  through construction. */
function isNoPathStep(step: { arrived: boolean; state: { path: unknown[] } }): boolean {
  return !step.arrived && step.state?.path?.length === 1;
}

export function tickCombatSimulation(
  zombies: ZombieUnit[],
  squads: TacticalSquadUnit[],
  adaptedBuildings: Map<string | number, AdaptedBuilding>,
  noiseEvents: NoiseEvent[],
  clock: GameClockState,
  hqPos: Point2D | null,
  deltaSec: number,
  settlement?: SettlementState,
  droppedItems: DroppedItem[] = [],
  hostileHumans: HostileHumanUnit[] = [],
  pathGrid?: PathGrid | null,
  alarmActive: boolean = false,
  elevationGrid?: ElevationGrid | null
): CombatTickResult {
  const now = Date.now();
  const effectiveDelta = deltaSec * (clock.speed === 0 ? 0 : clock.speed);

  // §Terrain: steep ground slows movement (squads, infected, rival humans).
  // Evaluated per unit per tick from the DEM; null grid (elevation off) is a
  // no-op factor of 1.
  const slopeFactor = (x: number, z: number) =>
    elevationGrid ? terrainSlopeSpeedFactor(elevationGrid, x, z) : 1;

  const newVisualFx: CombatVisualFx[] = [];
  const settlementNotifications: { title: string; desc: string; type: 'warn' | 'info' | 'success' | 'danger' }[] = [];
  const newInfections: SurvivorInfection[] = [];
  const fallenHeroEvents: { survivorId: string; cause: DeathCause; location: string }[] = [];
  const capturedSquadIds: string[] = [];
  let ammoAvailable = settlement?.stockpile?.ammo?.sharedPool ?? 0;
  let ammoConsumed = 0;

  // §6.1 weather & lunar modulation of the sunlight-dormancy gate.
  const activityMods = getZombieActivityModifiers(
    settlement?.weather?.currentWeather,
    settlement?.weather?.moonPhase
  );

  // Active Research Checks (§10)
  const hasFloodlightTech = settlement ? isResearchUnlocked(settlement, 'long_range_antenna') : false;
  const hasTurretsTech = settlement ? isResearchUnlocked(settlement, 'precision_machinery') : false;
  const hasSandbagTech = settlement ? isResearchUnlocked(settlement, 'advanced_masonry') : false;
  const hasBastionTech = settlement ? isResearchUnlocked(settlement, 'structural_bracing') : false;

  // Collect active floodlight emitters at night (§6.1, §10 Light Deterrent
  // Mechanic). §Terminus power grid: a floodlight burns its full 80m cone
  // while its generator feeds it; unpowered it falls back to a dim 30m
  // battery/emergency glow — so the power infrastructure genuinely matters.
  const poweredBuildingIds = settlement ? getPoweredBuildingIds(settlement) : new Set<string>();
  const floodlightRadius = (bldgId: string | number) =>
    poweredBuildingIds.has(String(bldgId)) ? 80 : 30;
  const lightEmitters: { x: number; z: number; radius: number; label: string }[] = [];
  if (clock.isNight) {
    // 1. Any functional floodlight tower
    for (const bldg of adaptedBuildings.values()) {
      if (isBuildingOperational(bldg)) {
        if (bldg.typeId === 'floodlight_tower') {
          lightEmitters.push({ x: bldg.position.x, z: bldg.position.z, radius: floodlightRadius(bldg.buildingId), label: bldg.name });
        } else if (
          hasFloodlightTech &&
          (bldg.typeId === 'guard_watchtower' ||
            bldg.typeId === 'wooden_tower' ||
            bldg.typeId === 'shelter_bunkhouse' ||
            bldg.typeId === 'shelter')
        ) {
          lightEmitters.push({ x: bldg.position.x, z: bldg.position.z, radius: 55, label: bldg.name });
        }
      }
    }

    // 2. Freestanding floodlights
    if (settlement?.freestandingBuildings) {
      for (const free of settlement.freestandingBuildings) {
        if (isBuildingOperational(free)) {
          if (free.typeId === 'floodlight_tower') {
            lightEmitters.push({ x: free.position.x, z: free.position.z, radius: floodlightRadius(free.buildingId), label: free.name });
          } else if (
            hasFloodlightTech &&
            (free.typeId === 'guard_watchtower' || free.typeId === 'wooden_tower')
          ) {
            lightEmitters.push({ x: free.position.x, z: free.position.z, radius: 55, label: free.name });
          }
        }
      }
    }

    // 3. HQ floodlight if tech unlocked
    if (hqPos && hasFloodlightTech) {
      lightEmitters.push({ x: hqPos.x, z: hqPos.z, radius: 60, label: 'HQ Perimeter Spotlight' });
    }
  }

  // 1. Filter out expired noise events
  const activeNoiseEvents = noiseEvents.filter((n) => now - n.createdAt < n.durationMs);

  // 2. Update Squad Units (RTS Movement, Target Acquisition, Firing).
  // Healing was historically an instant +6 HP/s regeneration near HQ or any
  // Medbay footprint regardless of staffing. That magic is gone: §5.3
  // treatment (beds + nurses + patient queue) runs once per tick AFTER this
  // pass via tickMedicalFacilityCare().
  const medSquads = squads.map((squad) => {
    // Off-map expedition squads (§IFZ) are away from the tactical map: the
    // combat tick leaves them untouched (they resolve in tickExpeditions).
    if (squad.onExpedition) {
      return { ...squad };
    }
    if (squad.currentHp <= 0) {
      return { ...squad, state: 'downed' as const };
    }

    let { x, z, y, rotation, currentHp, state, manualOrder, targetPos, targetZombieId } = squad;

    // `isInSafeZone` now means "genuinely under medical treatment this tick":
    // tickMedicalFacilityCare() (below) flips it for squads that actually got
    // bed space + a nurse. Merely being near the HQ no longer regenerates HP,
    // so it must not light up the HEALING indicator either.
    const inSafeZone = false;

    // Determine squad weapon capabilities:
    // Check if squad has ranged weapons (pistol, shotgun, hunting_rifle, assault_rifle)
    const aliveMembers = squad.members.filter((m) => m.isAlive);
    const rangedMembers = aliveMembers.filter((m) => getWeaponDefinition(m.weaponId).ammoPerVolley > 0);
    const squadAmmoPerVolley = rangedMembers.reduce((sum, m) => sum + getWeaponDefinition(m.weaponId).ammoPerVolley, 0);
    const hasSufficientAmmo = squadAmmoPerVolley === 0 || ammoAvailable >= squadAmmoPerVolley;

    // Base effective attack range:
    // If squad has guns and ammo -> weapon range (e.g. 28m pistol, 36m AR, 42m rifle)
    // If squad has only melee or is out of ammo -> melee engagement range (8.5m)
    const baseRange = rangedMembers.length > 0 && hasSufficientAmmo ? squad.attackRange : 8.5;
    const effectiveAttackRange = hasTurretsTech ? baseRange * 1.3 : baseRange;

    // 1. Resolve Active Target (if player commanded attack on a specific enemy or previously locked on)
    let activeTarget: ZombieUnit | HostileHumanUnit | null = null;
    if (targetZombieId) {
      const zTarget = zombies.find((z) => z.id === targetZombieId && z.currentHp > 0);
      const hTarget = hostileHumans.find((h) => h.id === targetZombieId && h.currentHp > 0);
      activeTarget = zTarget || hTarget || null;
      if (!activeTarget) {
        // Target is dead or missing!
        targetZombieId = null;
        if (state === 'combat' && !targetPos) {
          state = 'idle';
          targetPos = null;
          manualOrder = false;
        }
      }
    }

    // 2. If no active target assigned, Auto-Acquire closest enemy within weapon range
    if (!activeTarget) {
      let closestDist = Infinity;
      for (const zmb of zombies) {
        if (zmb.currentHp <= 0) continue;
        const d = Math.hypot(zmb.x - x, zmb.z - z);
        if (d <= effectiveAttackRange && d < closestDist) {
          closestDist = d;
          activeTarget = zmb;
        }
      }
      for (const human of hostileHumans) {
        if (human.currentHp <= 0) continue;
        const d = Math.hypot(human.x - x, human.z - z);
        if (d <= effectiveAttackRange && d < closestDist) {
          closestDist = d;
          activeTarget = human;
        }
      }
      if (activeTarget && !manualOrder) {
        targetZombieId = activeTarget.id;
      }
    }

    // 3. Movement Execution:
    // If the player gave a manual order (or retreating/returning/moving to targetPos),
    // the squad MUST execute movement along the path towards targetPos!
    const isPlayerOrderedMove = manualOrder && targetPos;
    const isReturningOrRetreating = (state === 'returning' || state === 'retreating') && targetPos;

    if (isPlayerOrderedMove || isReturningOrRetreating) {
      // Execute path movement towards destination. Player-built walls are hard
      // barriers for squads too (they route around them; gates stay open), so a
      // sealed perimeter produces a genuine "no path" failure instead of a
      // silent walk-into-the-wall.
      const step = stepAlongPath(
        pathGrid,
        squad.pathState,
        x,
        z,
        targetPos.x,
        targetPos.z,
        squad.moveSpeed * slopeFactor(x, z),
        effectiveDelta,
        1.2,
        { wallsImpassable: true }
      );
      x = step.x;
      z = step.z;
      rotation = step.rotation;
      squad.pathState = step.state;

      if (!step.arrived) {
        state = isReturningOrRetreating ? state : 'moving';
        if (isNoPathStep(step)) {
          squad.noPath = squad.noPath ?? {
            buildingId: squad.targetBuildingId ?? undefined,
            x: targetPos.x,
            z: targetPos.z,
            since: now,
          };
        } else {
          squad.noPath = undefined;
        }
      } else {
        squad.noPath = undefined;
        targetPos = null;
        manualOrder = false;
        state = squad.targetBuildingId ? 'searching' : 'idle';
      }
    } else if (activeTarget && !targetPos) {
      // Stand and engage / close distance to enemy if no manual move order
      const distToTarget = Math.hypot(activeTarget.x - x, activeTarget.z - z);
      rotation = Math.atan2(activeTarget.x - x, activeTarget.z - z);

      if (distToTarget > effectiveAttackRange) {
        // Step closer to attack range
        const step = Math.min(
          distToTarget - effectiveAttackRange * 0.75,
          squad.moveSpeed * slopeFactor(x, z) * effectiveDelta
        );
        x += ((activeTarget.x - x) / distToTarget) * step;
        z += ((activeTarget.z - z) / distToTarget) * step;
        state = 'combat';
      } else {
        state = 'combat';
      }
    } else if (targetPos) {
      // General pathing (walls impassable for squads — see above)
      const step = stepAlongPath(
        pathGrid,
        squad.pathState,
        x,
        z,
        targetPos.x,
        targetPos.z,
        squad.moveSpeed * slopeFactor(x, z),
        effectiveDelta,
        1.2,
        { wallsImpassable: true }
      );
      x = step.x;
      z = step.z;
      rotation = step.rotation;
      squad.pathState = step.state;

      if (!step.arrived) {
        state = 'moving';
        if (isNoPathStep(step)) {
          squad.noPath = squad.noPath ?? {
            buildingId: squad.targetBuildingId ?? undefined,
            x: targetPos.x,
            z: targetPos.z,
            since: now,
          };
        } else {
          squad.noPath = undefined;
        }
      } else {
        squad.noPath = undefined;
        targetPos = null;
        manualOrder = false;
        state = squad.targetBuildingId ? 'searching' : 'idle';
      }
    } else if (squad.targetBuildingId && squad.state === 'searching') {
      state = 'searching';
    } else {
      state = 'idle';
      targetZombieId = null;
    }

    // 4. Weapons & Combat Firing (Can fire while moving/kiting or holding ground if enemy in range!)
    if (activeTarget) {
      const distToTarget = Math.hypot(activeTarget.x - x, activeTarget.z - z);
      if (distToTarget <= effectiveAttackRange) {
        if (state !== 'returning' && state !== 'retreating' && !isPlayerOrderedMove) {
          state = 'combat';
        }
        rotation = Math.atan2(activeTarget.x - x, activeTarget.z - z);

        // Morale Combat Modifiers (§4.5)
        const moraleCombatMult = settlement?.morale?.modifiers.combatDamageMultiplier || 1.0;
        const moraleFireRateMult = settlement?.morale?.modifiers.combatFireRateMultiplier || 1.0;
        const moraleCritBonus = settlement?.morale?.modifiers.combatCritBonus || 0.0;

        const effectiveFireCooldown = (squad.fireRate / moraleFireRateMult) * 1000;

        if (now - squad.lastFireTime >= effectiveFireCooldown) {
          squad.lastFireTime = now;

          const isCrit = Math.random() < (squad.critChance + moraleCritBonus);
          const isGunfire = rangedMembers.length > 0 && ammoAvailable >= squadAmmoPerVolley;

          let damageDealt = 0;

          if (isGunfire) {
            // Firing guns
            ammoAvailable = Math.max(0, ammoAvailable - squadAmmoPerVolley);
            ammoConsumed += squadAmmoPerVolley;

            const baseVolley = squad.damagePerVolley * moraleCombatMult;
            damageDealt = Math.max(1, Math.round(
              baseVolley * (0.85 + Math.random() * 0.3) * (isCrit ? 2.2 : 1.0)
            ));

            soundService.playGunfire(isCrit);

            // Muzzle flash + Tracer
            newVisualFx.push({
              id: `muzzle-${squad.squadId}-${now}`,
              type: 'muzzle_flash',
              startX: x,
              startY: 1.2,
              startZ: z,
              createdAt: now,
              durationMs: 120,
            });

            newVisualFx.push({
              id: `tracer-${squad.squadId}-${now}`,
              type: 'bullet_tracer',
              startX: x,
              startY: 1.2,
              startZ: z,
              endX: activeTarget.x,
              endY: 1.0,
              endZ: activeTarget.z,
              createdAt: now,
              durationMs: 150,
            });

            const { event: noiseEvt, visualFx: ringFx } = emitNoiseEvent('gunfire', x, z, `${squad.name} Firefight`);
            activeNoiseEvents.push(noiseEvt);
            newVisualFx.push(ringFx);
          } else {
            // Melee strike
            const meleeBase = aliveMembers.reduce((sum, m) => sum + Math.max(10, getWeaponDefinition(m.weaponId).damage), 0) * moraleCombatMult;
            damageDealt = Math.max(1, Math.round(
              meleeBase * (0.85 + Math.random() * 0.3) * (isCrit ? 2.0 : 1.0)
            ));

            soundService.playMelee(false);

            newVisualFx.push({
              id: `slash-${squad.squadId}-${now}`,
              type: 'melee_slash',
              startX: activeTarget.x,
              startY: 1.0,
              startZ: activeTarget.z,
              createdAt: now,
              durationMs: 250,
            });

            const { event: noiseEvt, visualFx: ringFx } = emitNoiseEvent('combat', x, z, `${squad.name} Melee Clash`);
            activeNoiseEvents.push(noiseEvt);
            newVisualFx.push(ringFx);
          }

          // Apply damage to enemy
          activeTarget.currentHp = Math.max(0, activeTarget.currentHp - damageDealt);

          // Damage floating number
          newVisualFx.push({
            id: `dmg-${activeTarget.id}-${now}`,
            type: 'damage_number',
            startX: activeTarget.x,
            startY: 2.2,
            startZ: activeTarget.z,
            text: `-${damageDealt}${isCrit ? ' CRIT!' : ''}`,
            color: isCrit ? '#fbbf24' : '#ef4444',
            isCrit,
            createdAt: now,
            durationMs: 900,
          });

          // Check if enemy was killed
          if (activeTarget.currentHp <= 0) {
            squad.killCount += 1;
            targetZombieId = null;
            if (!manualOrder) {
              targetPos = null;
              state = 'idle';
            }

            newVisualFx.push({
              id: `death-${activeTarget.id}-${now}`,
              type: 'zombie_death',
              startX: activeTarget.x,
              startY: 0.5,
              startZ: activeTarget.z,
              createdAt: now,
              durationMs: 1500,
            });
          }
        }
      }
    }

    return {
      ...squad,
      x,
      z,
      y,
      rotation,
      currentHp,
      state,
      targetPos,
      targetZombieId,
      isInSafeZone: inSafeZone,
      pathState: squad.pathState,
    };
  });

  // §5.3 Medical treatment — one pure pass over the freshly moved squads.
  // Wounded survivors heal ONLY inside operational, staffed medical
  // facilities: beds cap admissions, each assigned nurse attends one patient
  // at +0.1 HP per in-game hour, and surplus wounded queue with no healing.
  const caredSquads =
    settlement && effectiveDelta > 0
      ? tickMedicalFacilityCare(medSquads, settlement, effectiveDelta)
      : medSquads;

  // 3. Update Zombies (Dormancy Lore, Noise Detection, Pathing, Combat vs Squads & Buildings)
  // Zombies killed by squad fire / melee are mutated to currentHp <= 0 earlier
  // in this same tick (step 2) and reach the map below still state !== 'dead';
  // wire bleed kills the zombie inside the map itself. Tower / vehicle kills
  // land next tick with currentHp <= 0 and state !== 'dead'. Either way this
  // transition is the single point where a zombie becomes 'dead' — counting it
  // once here is the authoritative colony kill tally (no double counts).
  let zombiesKilled = 0;
  const updatedZombies = zombies
    .map((zombie) => {
      if (zombie.currentHp <= 0) {
        if (zombie.state !== 'dead') zombiesKilled += 1;
        return { ...zombie, state: 'dead' as const };
      }

      let {
        x,
        z,
        y,
        rotation,
        speed,
        state,
        targetPos,
        targetUnitId,
        targetBuildingId,
        alertLevel,
        lastAttackTime,
      } = zombie;

      const isNight = clock.isNight;

      // §6.1 addition: overcast/rain/storm weather shields the infected from the
      // sunlight penalty, permitting daytime activity. Clear sun keeps them dormant.
      const daylightShielded = isNight ? 0 : activityMods.daytimeActivity;
      const isDormant = !isNight && alertLevel === 0 && daylightShielded <= 0;
      const nightCalmMult = isNight ? activityMods.nightActivityMult : 1.0;

      // Weather Modifiers (§9)
      const weatherDef = settlement?.weather ? WEATHER_CONDITIONS[settlement.weather.currentWeather] : null;
      const weatherSpeedMult = weatherDef ? weatherDef.zombieSpeedMult : 1.0;
      const weatherVisualMult = weatherDef ? weatherDef.zombieVisualRangeMult : 1.0;
      const weatherAcousticMult = weatherDef ? weatherDef.acousticSoundRadiusMult : 1.0;

      // Adjust speed for day vs night (§6.1) and weather (§9)
      let currentSpeed = (zombie.variant === 'runner' ? (isNight ? 5.4 : 3.0) : zombie.variant === 'brute' ? (isNight ? 1.6 : 0.9) : (isNight ? 2.3 : 1.2)) * weatherSpeedMult;

      // Sluggish during day (full dormancy), and weather-shielded daytime roams
      if (isDormant) {
        currentSpeed *= 0.35;
      } else if (!isNight && daylightShielded > 0) {
        // Active but hindered under overcast/storm cover.
        currentSpeed *= 0.6 + 0.4 * daylightShielded;
      }

      // Full moon calms the infected at night (§6.1).
      currentSpeed *= nightCalmMult;

      // Check Floodlight Suppression at Night (§6.1, §10 Light Deterrent Mechanic)
      let isLightSuppressed = false;
      let repellingLight: { x: number; z: number } | null = null;
      if (isNight && lightEmitters.length > 0) {
        for (const emitter of lightEmitters) {
          const distToEmitter = Math.hypot(emitter.x - x, emitter.z - z);
          if (distToEmitter <= emitter.radius) {
            isLightSuppressed = true;
            repellingLight = emitter;
            break;
          }
        }
      }

      if (isLightSuppressed && repellingLight) {
        // High-intensity light suppresses infected speed and causes disorientation/recoil (§6.1, §10)
        currentSpeed *= 0.45;
        if (state !== 'attacking_unit' && Math.random() < 0.08) {
          // Push zombie away from the light
          const pushAngle = Math.atan2(x - repellingLight.x, z - repellingLight.z);
          targetPos = {
            x: x + Math.sin(pushAngle) * 15,
            z: z + Math.cos(pushAngle) * 15,
          };
          state = 'wandering';
          alertLevel = 0;
        }
      }

      // A. Sound Detection Check (§5, §6.1, §9). Clear daylight dormancy is
      // authoritative: noise cannot wake an infected unless night or weather
      // explicitly grants daytime activity.
      if (!isDormant) for (const noise of activeNoiseEvents) {
        const distToNoise = Math.hypot(noise.x - x, noise.z - z);
        const hearingMult = (zombie.variant === 'runner' ? 1.4 : zombie.variant === 'brute' ? 1.0 : 1.1) * weatherAcousticMult;
        if (distToNoise <= noise.radius * hearingMult) {
          alertLevel = 2;
          targetPos = { x: noise.x + (Math.random() - 0.5) * 6, z: noise.z + (Math.random() - 0.5) * 6 };
          state = 'investigating_sound';
          break;
        }
      }

      // B. Proximity to Alive Squad Units (Sight & Aggro)
      let targetSquad: TacticalSquadUnit | null = null;
      let squadDist = Infinity;
      const baseSightRange = isNight
        ? isLightSuppressed
          ? 18
          : zombie.variant === 'runner'
          ? 45
          : 32
        : zombie.variant === 'runner'
        ? 24
        : 18;
      const sightRange = baseSightRange * weatherVisualMult * (isNight ? activityMods.nightSightMult : 1.0);

      for (const sq of caredSquads) {
        if (sq.currentHp <= 0) continue;
        const d = Math.hypot(sq.x - x, sq.z - z);
        if (d <= sightRange && d < squadDist) {
          squadDist = d;
          targetSquad = sq;
        }
      }

      // If already aggroed on a squad, continue giving chase as squad moves/retreats
      if (!targetSquad && targetUnitId) {
        const existingTarget = caredSquads.find((sq) => sq.squadId === targetUnitId && sq.currentHp > 0);
        if (existingTarget) {
          const d = Math.hypot(existingTarget.x - x, existingTarget.z - z);
          if (d < 95) {
            targetSquad = existingTarget;
            squadDist = d;
          } else {
            targetUnitId = null;
          }
        } else {
          targetUnitId = null;
        }
      }

      if (targetSquad) {
        targetUnitId = targetSquad.squadId;
        targetPos = { x: targetSquad.x, z: targetSquad.z };
        state = 'chasing';
        alertLevel = 2;

        // Melee attack if in range (2.0m)
        if (squadDist <= 2.2) {
          state = 'attacking_unit';
          if (now - lastAttackTime >= zombie.attackCooldown * 1000) {
            lastAttackTime = now;
            // Damage a random alive squad member; armor absorbs a fraction.
            const aliveMembers = targetSquad.members.filter((m) => m.isAlive);
            const victim = aliveMembers[Math.floor(Math.random() * aliveMembers.length)];
            let appliedDamage = zombie.baseDamage;
            if (victim && victim.armorId) {
              const armor = getArmorDefinition(victim.armorId);
              appliedDamage = Math.max(1, Math.round(zombie.baseDamage * (1 - armor.damageReduction)));
            }

            // Building cover / barricade defense buff (§5.1 & §5.3):
            // Squads inside a building footprint receive 50% damage reduction from structure barricades
            const isSquadInBuilding = Boolean(
              pathGrid?.isInsideBuilding(targetSquad.x, targetSquad.z) || targetSquad.targetBuildingId
            );
            if (isSquadInBuilding) {
              appliedDamage = Math.max(1, Math.round(appliedDamage * 0.5));
            }

            if (victim) {
              victim.currentHp = Math.max(0, victim.currentHp - appliedDamage);
              if (victim.currentHp <= 0) {
                victim.isAlive = false;
                // Drop equipped weapon & armor to the ground (§4.3)
                const dropWeapon = victim.weaponId !== 'knife' ? victim.weaponId : null;
                if (dropWeapon || victim.armorId) {
                  droppedItems.push({
                    id: `drop_${targetSquad.squadId}_${now}_${victim.id}`,
                    x: targetSquad.x,
                    z: targetSquad.z,
                    weaponId: dropWeapon,
                    armorId: victim.armorId,
                    droppedAt: now,
                  });
                }
                settlementNotifications.push({
                  title: 'SQUAD MEMBER FALLEN',
                  desc: `${victim.name} of ${targetSquad.name} was killed in combat${dropWeapon || victim.armorId ? ' — equipment dropped to the ground' : ''}.`,
                  type: 'warn',
                });
              }
            }
            recomputeSquadHealth(targetSquad);

            // SFX for melee hit and zombie variant sound
            soundService.playMelee(true);
            soundService.playZombieSound(zombie.variant);

            // Visual slash effect
            newVisualFx.push({
              id: `slash-${zombie.id}-${now}`,
              type: 'melee_slash',
              startX: targetSquad.x,
              startY: 1.0,
              startZ: targetSquad.z,
              createdAt: now,
              durationMs: 300,
            });

            newVisualFx.push({
              id: `squad-dmg-${targetSquad.squadId}-${now}`,
              type: 'damage_number',
              startX: targetSquad.x,
              startY: 2.2,
              startZ: targetSquad.z,
              text: isSquadInBuilding ? `-${appliedDamage} (COVER)` : `-${appliedDamage}`,
              color: isSquadInBuilding ? '#fbbf24' : '#f87171',
              createdAt: now,
              durationMs: 800,
            });

            // Melee bite roll check (§6.2 Field infection on bite, reduced by vaccine and building barricades)
            let biteChance = rollBiteChance(zombie.variant, settlement);
            if (isSquadInBuilding) {
              biteChance *= 0.5; // Barricade reduces bite angle
            }
            if (Math.random() < biteChance) {
              const inf = createSurvivorInfection(
                targetSquad.leaderId,
                targetSquad.leaderName,
                true,
                `${zombie.variant.toUpperCase()} Melee Claw/Bite`
              );
              newInfections.push(inf);
            }

            if (targetSquad.currentHp <= 0) {
              fallenHeroEvents.push({
                survivorId: targetSquad.leaderId,
                cause: 'combat_slain',
                location: `Tactical Grid (${Math.round(targetSquad.x)}, ${Math.round(targetSquad.z)})`,
              });

              settlementNotifications.push({
                title: 'SQUAD OVERWHELMED & LEADER FALLEN',
                desc: `${targetSquad.name} (${targetSquad.leaderName}) was killed in the line of duty!`,
                type: 'warn',
              });
            }
          }
        }
      } else {
        // C. Target nearby building / barricade / HQ if active at night. The
        // command center is a real siege target (§7.5): breaching it costs the
        // settlement its operational status, so it joins the candidate list.
        const hq = settlement ? getPrimaryHQ(settlement) : null;
        if (isNight && !targetPos && (adaptedBuildings.size > 0 || hq)) {
          // Nearest siege candidate among adapted buildings + the HQ.
          let nearestBldg: AdaptedBuilding | null = null;
          let targetIsHq = false;
          let minBldgDist = Infinity;
          for (const bldg of adaptedBuildings.values()) {
            const d = Math.hypot(bldg.position.x - x, bldg.position.z - z);
            if (d < minBldgDist) {
              minBldgDist = d;
              nearestBldg = bldg;
              targetIsHq = false;
            }
          }
          if (hq) {
            const d = Math.hypot(hq.center.x - x, hq.center.z - z);
            if (d < minBldgDist) {
              minBldgDist = d;
              targetIsHq = true;
            }
          }

          if (minBldgDist < 120) {
            const targetPosPoint = targetIsHq ? hq!.center : (nearestBldg!.position as { x: number; z: number });
            targetBuildingId = targetIsHq ? hq!.buildingId : nearestBldg!.buildingId;
            targetPos = { x: targetPosPoint.x, z: targetPosPoint.z };
            state = 'chasing';

            // If close to building, attack building / wall (§5.1 siege damage)
            if (minBldgDist < 15) {
              state = 'attacking_building';
              if (now - lastAttackTime >= zombie.attackCooldown * 1000) {
                lastAttackTime = now;
                let siegeDmg = zombie.siegeDamage;

                // Defense Research: Sandbags & Reinforced Bastions reduce siege damage (§10)
                if (hasSandbagTech) siegeDmg = Math.round(siegeDmg * 0.75);
                if (hasBastionTech) siegeDmg = Math.round(siegeDmg * 0.6);

                const wasAlive = targetIsHq ? (hq!.currentDurability ?? 1) > 0 : nearestBldg!.currentDurability > 0;
                if (targetIsHq) {
                  hq!.currentDurability = Math.max(0, (hq!.currentDurability ?? 0) - siegeDmg);
                } else {
                  nearestBldg!.currentDurability = Math.max(0, nearestBldg!.currentDurability - siegeDmg);
                }

                // Sound effect for siege hit
                soundService.playZombieSound(zombie.variant);
                soundService.playMelee(false);

                newVisualFx.push({
                  id: `bldg-hit-${targetBuildingId}-${now}`,
                  type: 'building_impact',
                  startX: targetPosPoint.x,
                  startY: 3.0,
                  startZ: targetPosPoint.z,
                  text: `-${siegeDmg} SIEGE`,
                  color: targetIsHq ? '#ef4444' : '#f97316',
                  isSiege: true,
                  createdAt: now,
                  durationMs: 900,
                });

                if (wasAlive && (targetIsHq ? hq!.currentDurability : nearestBldg!.currentDurability) <= 0) {
                  settlementNotifications.push(
                    targetIsHq
                      ? {
                          title: 'COMMAND CENTER BREACHED',
                          desc: `${hq!.buildingName} has been overrun — the colony is lost unless it can be reclaimed!`,
                          type: 'danger',
                        }
                      : {
                          title: 'STRUCTURE BREACHED',
                          desc: `${nearestBldg!.name} durability breached by infected assault!`,
                          type: 'warn',
                        }
                  );
                }
              }
            }
          }
        }
      }

      // §7.1 Barbed-wire hazard (NOT an obstacle): wire cells stay fully
      // passable, but an infected standing on one is slowed by the def's
      // percentage and bleeds damageOnContact HP per second. Movement below
      // then uses the slowed currentSpeed; the damage applies even when the
      // infected is pinned in place attacking.
      const wireHazard = pathGrid?.getHazardAt(x, z);
      if (wireHazard) {
        if (wireHazard.slowPct > 0) currentSpeed *= 1 - wireHazard.slowPct / 100;
        if (wireHazard.damagePerSec > 0 && zombie.currentHp > 0) {
          const bleed = wireHazard.damagePerSec * effectiveDelta;
          zombie.currentHp = Math.max(0, zombie.currentHp - bleed);
          if (zombie.currentHp <= 0) {
            newVisualFx.push({
              id: `wire-kill-${zombie.id}-${now}`,
              type: 'zombie_death',
              startX: x,
              startY: 0.5,
              startZ: z,
              createdAt: now,
              durationMs: 1500,
            });
          } else if (Math.random() < 0.2) {
            // Throttle the floating damage text so a crossing doesn't spam FX.
            newVisualFx.push({
              id: `wire-dmg-${zombie.id}-${now}`,
              type: 'damage_number',
              startX: x,
              startY: 2.0,
              startZ: z,
              text: `-${Math.max(1, Math.round(bleed))} WIRE`,
              color: '#e5e7eb',
              createdAt: now,
              durationMs: 700,
            });
          }
        }
      }

      // D. Move toward target position with A* pathfinding
      let zombiePathState = zombie.pathState;
      if (targetPos && state !== 'attacking_unit' && state !== 'attacking_building') {
        const step = stepAlongPath(
          pathGrid,
          zombiePathState,
          x,
          z,
          targetPos.x,
          targetPos.z,
          currentSpeed * slopeFactor(x, z),
          effectiveDelta,
          1.2,
          // The infected cannot pass through gates, and walls are never
          // traversable for them — a fenced perimeter genuinely keeps them out.
          { gatesOpen: false, wallsImpassable: true }
        );
        x = step.x;
        z = step.z;
        rotation = step.rotation;
        zombiePathState = step.state;

        if (step.arrived) {
          targetPos = null;
          zombiePathState = undefined;
          state = isDormant ? 'dormant' : 'wandering';
        }
      } else if (!isDormant) {
        // FULL LOCALITY MODEL (§5.2, IFZ post-Lair behaviour):
        //   Lair → local population → most stay near the nest → some roam →
        //   hordes/swarms/ambient infected remain independent.
        // Lair-affiliated infected that are NOT roamers patrol their home
        // radius and walk home DETERMINISTICALLY the moment they stray beyond
        // it (no probabilistic luck involved). Building-occupation infected
        // carry the same home anchor and behave identically — they hold the
        // structure they took over until a squad breaches it. Roamers — and
        // every unaffiliated infected (hordes, swarms, ambient) — wander
        // freely with no home pull.
        const hasHomeAnchor =
          (!!zombie.lairId || !!zombie.occupationId) &&
          zombie.homeX !== undefined &&
          zombie.homeZ !== undefined;
        const wanderAngle = Math.random() * Math.PI * 2;
        if (hasHomeAnchor && !zombie.isRoamer) {
          const radius = zombie.homeRadius ?? 40;
          const distHome = Math.hypot(zombie.homeX - x, zombie.homeZ - z);
          if (distHome > radius * 1.15) {
            // Strayed beyond the nest's territory — walk home, now.
            targetPos = { x: zombie.homeX, z: zombie.homeZ };
          } else if (Math.random() < 0.15) {
            // Local patrol around the nest (most infected remain nearby).
            const r = Math.min(12, Math.max(3, radius * 0.5));
            targetPos = { x: x + Math.cos(wanderAngle) * r, z: z + Math.sin(wanderAngle) * r };
          }
        } else if (Math.random() < 0.02) {
          // Free wander — roamers and independent infected (swarms/hordes).
          targetPos = { x: x + Math.cos(wanderAngle) * 12, z: z + Math.sin(wanderAngle) * 12 };
        }
      }

      return {
        ...zombie,
        x,
        z,
        y,
        rotation,
        state,
        targetPos,
        targetUnitId,
        targetBuildingId,
        alertLevel,
        lastAttackTime,
        isDormant,
        pathState: zombiePathState,
      };
    })
    .filter((z) => z.state !== 'dead' || now - z.spawnedAt < 10000); // Clean dead after 10s

  // 3b. Update Hostile Human Faction Units (§5.2) — always active, armed, and
  // hostile on sight. They guard their Hideout and open fire on any squad that
  // enters aggro range, using the same damage/HP resolution as squads vs. zombies.
  const updatedHostileHumans = hostileHumans
    .map((human) => {
      if (human.currentHp <= 0) {
        return { ...human, state: 'dead' as const };
      }

      let { x, z, rotation, state, targetSquadId, targetBuildingId, lastAttackTime, pathState } = human;

      // Defend against nearby squads first; otherwise siege the nearest owned
      // structure so hostile factions can damage buildings, not just people.
      let targetSquad: TacticalSquadUnit | null = null;
      let targetDist = Infinity;
      for (const sq of caredSquads) {
        if (sq.currentHp <= 0) continue;
        const d = Math.hypot(sq.x - x, sq.z - z);
        if (d < targetDist) {
          targetDist = d;
          targetSquad = sq;
        }
      }

      let targetBuilding: AdaptedBuilding | null = null;
      if (!targetSquad || targetDist > human.aggroRange) {
        let nearestDistance = Infinity;
        for (const bldg of adaptedBuildings.values()) {
          if (!isBuildingOperational(bldg)) continue;
          const distance = Math.hypot(bldg.position.x - x, bldg.position.z - z);
          if (distance < nearestDistance) { nearestDistance = distance; targetBuilding = bldg; }
        }
      }

      if (targetSquad && targetDist <= human.aggroRange) {
        targetSquadId = targetSquad.squadId;
        rotation = Math.atan2(targetSquad.x - x, targetSquad.z - z);

        if (targetDist <= human.attackRange) {
          state = 'combat';
          if (now - lastAttackTime >= human.attackCooldown * 1000) {
            lastAttackTime = now;

            const aliveMembers = targetSquad.members.filter((m) => m.isAlive);
            const victim = aliveMembers[Math.floor(Math.random() * aliveMembers.length)];
            let appliedDamage = human.damage;
            if (victim && victim.armorId) {
              appliedDamage = Math.max(
                1,
                Math.round(human.damage * (1 - getArmorDefinition(victim.armorId).damageReduction))
              );
            }

            if (victim) {
              victim.currentHp = Math.max(0, victim.currentHp - appliedDamage);
              if (victim.currentHp <= 0) victim.isAlive = false;
              recomputeSquadHealth(targetSquad);

              settlementNotifications.push({
                title: 'UNDER RIVAL FIRE',
                desc: `${human.factionName} defenders shot ${victim.name} of ${targetSquad.name}!`,
                type: 'warn',
              });

              // Hostile muzzle flash + tracer + damage number
              newVisualFx.push({
                id: `rival-tracer-${human.id}-${now}`,
                type: 'bullet_tracer',
                startX: x,
                startY: 1.1,
                startZ: z,
                endX: targetSquad.x,
                endY: 1.0,
                endZ: targetSquad.z,
                createdAt: now,
                durationMs: 120,
              });
              newVisualFx.push({
                id: `rival-dmg-${targetSquad.squadId}-${now}`,
                type: 'damage_number',
                startX: targetSquad.x,
                startY: 2.2,
                startZ: targetSquad.z,
                text: `-${appliedDamage}`,
                color: '#fb923c',
                createdAt: now,
                durationMs: 800,
              });

              soundService.playGunfire(false);
            }

            // §5.2 ransom: a squad overpowered by a Hideout is captured, not killed.
            if (targetSquad.currentHp <= 0 && !capturedSquadIds.includes(targetSquad.squadId)) {
              capturedSquadIds.push(targetSquad.squadId);
              settlementNotifications.push({
                title: 'SQUAD CAPTURED',
                desc: `${targetSquad.name} was overpowered by ${human.factionName}. They are demanding a ransom for its return!`,
                type: 'warn',
              });
            }
          }
        } else {
          // Close to weapon range — route around walls/fences and buildings.
          // Rival defenders, like the infected, cannot pass through gates.
          const stepRes = stepAlongPath(
            pathGrid,
            pathState,
            x,
            z,
            targetSquad.x,
            targetSquad.z,
            human.speed * slopeFactor(x, z),
            effectiveDelta,
            2.0,
            { gatesOpen: false, wallsImpassable: true }
          );
          x = stepRes.x;
          z = stepRes.z;
          rotation = stepRes.rotation;
          pathState = stepRes.state;
          state = stepRes.arrived ? 'combat' : 'moving';
        }
      } else if (targetBuilding) {
        targetBuildingId = targetBuilding.buildingId;
        targetSquadId = null;
        const buildingDistance = Math.hypot(targetBuilding.position.x - x, targetBuilding.position.z - z);
        if (buildingDistance <= 15) {
          state = 'combat';
          if (now - lastAttackTime >= human.attackCooldown * 1000) {
            lastAttackTime = now;
            targetBuilding.currentDurability = Math.max(0, targetBuilding.currentDurability - human.damage);
            settlementNotifications.push({ title: 'HOSTILE SIEGE', desc: `${human.factionName} damaged ${targetBuilding.name}.`, type: 'warn' });
            newVisualFx.push({ id: `rival-siege-${human.id}-${now}`, type: 'building_impact', startX: targetBuilding.position.x, startY: 2, startZ: targetBuilding.position.z, text: `-${human.damage} SIEGE`, color: '#fb923c', isSiege: true, createdAt: now, durationMs: 800 });
          }
        } else {
          const stepRes = stepAlongPath(pathGrid, pathState, x, z, targetBuilding.position.x, targetBuilding.position.z, human.speed * slopeFactor(x, z), effectiveDelta, 2.0, { gatesOpen: false, wallsImpassable: true });
          x = stepRes.x; z = stepRes.z; rotation = stepRes.rotation; pathState = stepRes.state; state = stepRes.arrived ? 'combat' : 'moving';
        }
      } else {
        targetSquadId = null;
        targetBuildingId = null;
        // Return to guard anchor when no squad is near — also routed.
        const homeDist = Math.hypot(human.homeX - x, human.homeZ - z);
        if (homeDist > 24) {
          const stepRes = stepAlongPath(
            pathGrid,
            pathState,
            x,
            z,
            human.homeX,
            human.homeZ,
            human.speed * slopeFactor(x, z),
            effectiveDelta,
            2.0,
            { gatesOpen: false, wallsImpassable: true }
          );
          x = stepRes.x;
          z = stepRes.z;
          rotation = stepRes.rotation;
          pathState = stepRes.state;
          state = stepRes.arrived ? 'guarding' : 'moving';
        } else {
          state = 'guarding';
        }
      }

      return { ...human, x, z, rotation, state, targetSquadId, targetBuildingId, lastAttackTime, pathState };
    })
    .filter((h) => h.state !== 'dead');

  // 4. Dropped equipment pickup (§4.3) — squads within 3m auto-equip dropped gear
  const remainingDrops: DroppedItem[] = [];
  for (const item of droppedItems) {
    let remainingItem = { ...item };
    for (const sq of caredSquads) {
      if (sq.currentHp <= 0) continue;
      if (Math.hypot(sq.x - remainingItem.x, sq.z - remainingItem.z) > 3.0) continue;
      const alive = sq.members.filter((m) => m.isAlive);

      if (remainingItem.weaponId && remainingItem.weaponId !== 'knife') {
        const target =
          alive.find((m) => m.weaponId === 'knife') ||
          alive.find(
            (m) => getWeaponDefinition(m.weaponId).tier < getWeaponDefinition(remainingItem.weaponId).tier
          );
        if (target) {
          target.weaponId = remainingItem.weaponId;
          recomputeSquadStats(sq);
          settlementNotifications.push({
            title: 'EQUIPMENT RECOVERED',
            desc: `${target.name} of ${sq.name} recovered ${getWeaponDefinition(remainingItem.weaponId).name} from the field.`,
            type: 'info',
          });
          remainingItem.weaponId = null;
        }
      }

      if (remainingItem.armorId) {
        const target = alive.find((m) => !m.armorId);
        if (target) {
          target.armorId = remainingItem.armorId;
          settlementNotifications.push({
            title: 'ARMOR RECOVERED',
            desc: `${target.name} of ${sq.name} recovered ${getArmorDefinition(remainingItem.armorId).name} from the field.`,
            type: 'info',
          });
          remainingItem.armorId = null;
        }
      }

      if (!remainingItem.weaponId && !remainingItem.armorId) break;
    }
    if (remainingItem.weaponId || remainingItem.armorId) {
      remainingDrops.push(remainingItem);
    }
  }

  // 5. Manned Defensive Towers & Gates Perimeter Engagement
  // "Towers do nothing without being manned but will always be manned by one worker even at night by default."
  // "When alarm is active, workers move to any owned gates/towers and man them."
  // Structures are classified by their explicit §7.1 flags (guardable /
  // weaponMountable / allowsFriendlyPassage), never by the type-id string.
  const defensiveStructures: {
    id: string | number;
    x: number;
    z: number;
    name: string;
    isTower: boolean;
    isGate: boolean;
    /** Declared §7.1 engagement range (m) from the facility's own def — the
     *  combat sim honours it instead of a hardcoded tower range. Absent on
     *  gates/legacy data, which fall back to the gate default below. */
    rangeM?: number;
    weaponId?: WeaponItemId;
    ammoPerShot: number;
    assignedWorkers: number;
  }[] = [];
  
  if (adaptedBuildings) {
    for (const [id, bldg] of adaptedBuildings.entries()) {
      const def = getCanonicalDefenseDef(bldg.typeId);
      // §IFZ: only mannable defences engage — a tower (weaponMountable) or a
      // guarded gate (guardable + allowsFriendlyPassage). Passive barriers —
      // walls, fences, barbed wire, floodlights — are never firing positions.
      if (!def || !(def.weaponMountable || (def.guardable && def.allowsFriendlyPassage))) continue;
      const isTower = !!def.weaponMountable;
      const isGate = !!def.allowsFriendlyPassage && !isTower;
      defensiveStructures.push({
        id,
        x: bldg.position.x,
        z: bldg.position.z,
        name: bldg.name || (isTower ? 'Watchtower' : 'Fortified Gate'),
        isTower,
        isGate,
        rangeM: def?.defenceProperties?.attackRangeM,
        weaponId: bldg.equippedWeaponId,
        ammoPerShot: bldg.ammoPerShot || 1,
        assignedWorkers: bldg.assignedWorkers || 0,
      });
    }
  }

  if (settlement?.freestandingBuildings) {
    for (const fs of settlement.freestandingBuildings) {
      const def = getCanonicalDefenseDef(fs.typeId);
      if (!def || !(def.weaponMountable || (def.guardable && def.allowsFriendlyPassage))) continue;
      const isTower = !!def.weaponMountable;
      const isGate = !!def.allowsFriendlyPassage && !isTower;
      defensiveStructures.push({
        id: String(fs.buildingId),
        x: fs.position.x,
        z: fs.position.z,
        name: isTower ? 'Watchtower' : 'Defense Gate',
        isTower,
        isGate,
        rangeM: def?.defenceProperties?.attackRangeM,
        weaponId: fs.equippedWeaponId,
        ammoPerShot: fs.ammoPerShot || 1,
        assignedWorkers: fs.assignedWorkers || 0,
      });
    }
  }

  // Defensive structures only operate when they have an actual assigned guard.
  // Colony population elsewhere is not sufficient to man every tower.
  if (defensiveStructures.length > 0) {
    const fireIntervalSec = alarmActive ? 1.2 : 2.0;
    // Legacy fallback when a mannable structure declares no §7.1 range.
    const defaultTowerRange = (hasFloodlightTech ? 65 : 50) * (alarmActive ? 1.2 : 1.0);
    const gateRange = 35 * (alarmActive ? 1.2 : 1.0);

    for (const struct of defensiveStructures) {
      if (struct.assignedWorkers <= 0) continue;
      // Gates only actively shoot when manned via alarm or automated turret tech
      if (struct.isGate && !alarmActive && !hasTurretsTech) continue;

      // §7.1: honour each tower's declared attack range (120m wooden, 160m
      // metal, 200m fortified) instead of a hardcoded 50/65m for every tower.
      const range = struct.isTower
        ? (struct.rangeM ?? defaultTowerRange) * (alarmActive ? 1.2 : 1.0)
        : gateRange;
      
      // Find nearest living hostile zombie within range
      let closestZombie: ZombieUnit | null = null;
      let minZombieDist = range;

      for (const z of updatedZombies) {
        if (z.currentHp <= 0 || z.state === 'dead') continue;
        const d = Math.hypot(z.x - struct.x, z.z - struct.z);
        if (d < minZombieDist) {
          minZombieDist = d;
          closestZombie = z;
        }
      }

      if (closestZombie) {
        // Deterministic firing interval based on time and structure ID hash
        const hashSeed = typeof struct.id === 'string' ? struct.id.charCodeAt(0) : Number(struct.id);
        const tickBucket = Math.floor((clock.totalElapsedSeconds + (hashSeed % 10) * 0.2) / fireIntervalSec);
        const prevTickBucket = Math.floor((clock.totalElapsedSeconds - effectiveDelta + (hashSeed % 10) * 0.2) / fireIntervalSec);

        if (tickBucket > prevTickBucket) {
          // Fire shot from manned tower / gate
          // §IFZ bow fallback: a tower with NO mounted FIREARM (unarmed, or
          // carrying only a melee weapon) fires a bow instead — INFINITE
          // ammunition. No ammo check, no ammo deduction; only real firearms
          // draw from the shared pool. Gates keep their built-in 20 dmg shot.
          const weapon = struct.weaponId ? getWeaponDefinition(struct.weaponId) : null;
          const isFirearm = !!weapon && weapon.ammoPerVolley > 0;
          const ammoCost = weapon?.ammoPerVolley || struct.ammoPerShot;
          if (struct.isTower && isFirearm && ammoAvailable < ammoCost) continue;
          const towerDamage = Math.round(
            (isFirearm ? weapon!.damage : struct.isTower ? WEAPON_CATALOG.bow.damage : 20) *
              (alarmActive ? 1.3 : 1.0) *
              (0.9 + Math.random() * 0.2)
          );
          if (struct.isTower && isFirearm) {
            ammoAvailable -= ammoCost;
            ammoConsumed += ammoCost;
          }
          closestZombie.currentHp = Math.max(0, closestZombie.currentHp - towerDamage);

          // SFX & Visual Tracers
          soundService.playGunfire(false);
          newVisualFx.push({
            id: `tower-flash-${struct.id}-${now}`,
            type: 'muzzle_flash',
            startX: struct.x,
            startY: struct.isTower ? 4.5 : 2.0,
            startZ: struct.z,
            createdAt: now,
            durationMs: 120,
          });

          newVisualFx.push({
            id: `tower-tracer-${struct.id}-${now}`,
            type: 'bullet_tracer',
            startX: struct.x,
            startY: struct.isTower ? 4.5 : 2.0,
            startZ: struct.z,
            endX: closestZombie.x,
            endY: 1.0,
            endZ: closestZombie.z,
            createdAt: now,
            durationMs: 140,
          });

          newVisualFx.push({
            id: `tower-dmg-${closestZombie.id}-${now}`,
            type: 'damage_number',
            startX: closestZombie.x,
            startY: 2.2,
            startZ: closestZombie.z,
            text: `-${towerDamage} (TOWER)`,
            color: '#38bdf8',
            createdAt: now,
            durationMs: 800,
          });

          const { event: noiseEvt, visualFx: ringFx } = emitNoiseEvent('gunfire', struct.x, struct.z, `${struct.name} Defense Fire`);
          activeNoiseEvents.push(noiseEvt);
          newVisualFx.push(ringFx);

          if (closestZombie.currentHp <= 0) {
            newVisualFx.push({
              id: `death-${closestZombie.id}-${now}`,
              type: 'zombie_death',
              startX: closestZombie.x,
              startY: 0.5,
              startZ: closestZombie.z,
              createdAt: now,
              durationMs: 1500,
            });
          }
        }
      }
    }
  }

  return {
    updatedZombies,
    updatedSquads: caredSquads,
    updatedAdaptedBuildings: adaptedBuildings,
    activeNoiseEvents,
    newVisualFx,
    zombiesKilled,
    settlementNotifications,
    newInfections,
    fallenHeroEvents,
    droppedItems: remainingDrops,
    updatedHostileHumans,
    capturedSquadIds,
    ammoConsumed,
  };
}

