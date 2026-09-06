import { BuildingPolygon, Point2D } from '../../types/map';
import {
  BuildingInfestation,
  ZombieLair,
  ZombieUnit,
  ZombieVariant,
} from '../../types/combat';

// ==========================================
// 2. Zombie Creation & Stats (§5.1)
// ==========================================

export function createZombieUnit(
  variant: ZombieVariant,
  x: number,
  z: number,
  y: number = 0,
  isNight: boolean = false
): ZombieUnit {
  const id = `zombie-${variant}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  switch (variant) {
    case 'runner':
      return {
        id,
        variant: 'runner',
        name: 'Infected Runner',
        x,
        z,
        y,
        rotation: Math.random() * Math.PI * 2,
        maxHp: 35,
        currentHp: 35,
        speed: isNight ? 5.4 : 3.0,
        baseDamage: 9,
        siegeDamage: 4,
        attackCooldown: 0.8,
        lastAttackTime: 0,
        state: isNight ? 'wandering' : 'dormant',
        targetUnitId: null,
        targetBuildingId: null,
        targetPos: null,
        investigatingSoundId: null,
        spawnedAt: Date.now(),
        isDormant: !isNight,
        alertLevel: 0,
      };

    case 'brute':
      return {
        id,
        variant: 'brute',
        name: 'Mutated Brute',
        x,
        z,
        y,
        rotation: Math.random() * Math.PI * 2,
        maxHp: 260,
        currentHp: 260,
        speed: isNight ? 1.6 : 0.9,
        baseDamage: 24,
        siegeDamage: 55, // Devastating against barricades/buildings!
        attackCooldown: 1.8,
        lastAttackTime: 0,
        state: isNight ? 'wandering' : 'dormant',
        targetUnitId: null,
        targetBuildingId: null,
        targetPos: null,
        investigatingSoundId: null,
        spawnedAt: Date.now(),
        isDormant: !isNight,
        alertLevel: 0,
      };

    case 'shambler':
    default:
      return {
        id,
        variant: 'shambler',
        name: 'Infected Shambler',
        x,
        z,
        y,
        rotation: Math.random() * Math.PI * 2,
        maxHp: 50,
        currentHp: 50,
        speed: isNight ? 2.3 : 1.2,
        baseDamage: 6,
        siegeDamage: 6,
        attackCooldown: 1.2,
        lastAttackTime: 0,
        state: isNight ? 'wandering' : 'dormant',
        targetUnitId: null,
        targetBuildingId: null,
        targetPos: null,
        investigatingSoundId: null,
        spawnedAt: Date.now(),
        isDormant: !isNight,
        alertLevel: 0,
      };
  }
}


// ==========================================
// 4. Escalating Horde Generator (§5.1, §6.1)
// ==========================================

/** IFZ: a horde has a DOMINANT type and its composition follows from that. */
export type HordeDominantType = 'shambler' | 'runner' | 'brute';

export const HORDE_DOMINANT_LABEL: Record<HordeDominantType, string> = {
  shambler: 'Shambler',
  runner: 'Runner',
  brute: 'Brute',
};

/**
 * Rolls the horde's dominant type. Day 1 is always a shambler crawl; runner
 * hordes appear from Day 2, and rare brute hordes only from Day 4.
 */
export function rollHordeDominantType(day: number): HordeDominantType {
  const roll = Math.random();
  if (day >= 4 && roll < 0.15) return 'brute';
  if (day >= 2 && roll < 0.45) return 'runner';
  return 'shambler';
}

/** Composition shares per dominant type — the horde is built AROUND its core. */
export const HORDE_COMPOSITION: Record<
  HordeDominantType,
  { runner: number; shambler: number; brute: number }
> = {
  // Slow siege pressure: overwhelmingly shamblers, a few runners, rare brute.
  shambler: { runner: 0.12, shambler: 0.85, brute: 0.03 },
  // Speed threat: most of the wave is runners, backed by a shambler core.
  runner: { runner: 0.62, shambler: 0.33, brute: 0.05 },
  // Wrecking ball: a wall of brutes with a shambler escort.
  brute: { runner: 0.12, shambler: 0.66, brute: 0.22 },
};

export interface HordeWave {
  zombies: ZombieUnit[];
  dominant: HordeDominantType;
}

export function generateHordeWave(
  day: number,
  centerPos: Point2D,
  radius: number = 180,
  isNight: boolean = true,
  dominantOverride?: HordeDominantType
): HordeWave {
  const zombies: ZombieUnit[] = [];

  // Horde scale formula based on in-game day
  const totalCount = Math.min(40, Math.floor(4 + day * 3.5 + Math.random() * 4));

  // IFZ composition: the dominant type decides the mix, so each night's horde
  // reads as one coherent threat instead of a uniform random slurry.
  const dominant = dominantOverride || rollHordeDominantType(day);
  const shares = HORDE_COMPOSITION[dominant];
  const counts = {
    brute: Math.round(totalCount * shares.brute),
    runner: Math.round(totalCount * shares.runner),
    shambler: Math.max(0, totalCount - Math.round(totalCount * shares.brute) - Math.round(totalCount * shares.runner)),
  };

  // Spawn around perimeter angle
  const baseAngle = Math.random() * Math.PI * 2;
  const spread = Math.PI * 0.7; // Come from an approach vector

  const spawn = (variant: ZombieVariant) => {
    const angle = baseAngle + (Math.random() - 0.5) * spread;
    const dist = radius * (0.8 + Math.random() * 0.3);
    const x = centerPos.x + Math.cos(angle) * dist;
    const z = centerPos.z + Math.sin(angle) * dist;
    zombies.push(createZombieUnit(variant, x, z, 0, isNight));
  };

  // Interleave the variants so a horde reads as a formation, not blocks of
  // identical types arriving in three separate waves.
  const queue: ZombieVariant[] = [];
  queue.push(...Array.from({ length: counts.brute }, () => 'brute' as const));
  queue.push(...Array.from({ length: counts.runner }, () => 'runner' as const));
  queue.push(...Array.from({ length: counts.shambler }, () => 'shambler' as const));
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  for (const variant of queue) spawn(variant);

  return { zombies, dominant };
}

/**
 * Generate initial ambient dormant zombie clusters across the map
 */
export function generateAmbientMapZombies(
  buildings: BuildingPolygon[],
  hqPos: Point2D | null,
  day: number = 1,
  lairs?: Map<string | number, ZombieLair> | null
): ZombieUnit[] {
  const zombies: ZombieUnit[] = [];
  const count = Math.min(25, 8 + day * 3);

  for (let i = 0; i < count; i++) {
    const bldg = buildings[Math.floor(Math.random() * buildings.length)];
    if (!bldg) continue;

    // Don't spawn right on HQ
    if (hqPos) {
      const distToHq = Math.hypot(bldg.center.x - hqPos.x, bldg.center.z - hqPos.z);
      if (distToHq < 45) continue;
    }

    const offsetDist = 5 + Math.random() * 18;
    const offsetAng = Math.random() * Math.PI * 2;
    const x = bldg.center.x + Math.cos(offsetAng) * offsetDist;
    const z = bldg.center.z + Math.sin(offsetAng) * offsetDist;

    const rand = Math.random();
    let variant: ZombieVariant = 'shambler';
    if (rand < 0.2) variant = 'runner';
    else if (rand < 0.28 && day >= 2) variant = 'brute';

    zombies.push(createZombieUnit(variant, x, z, 0, false));
  }

  // Lair pressure (§5.2): every standing lair anchors a small AFFILIATED local
  // group roaming its home radius — the density bubble around the nest. These
  // are real lair zombies (lairId + home anchor), so killing them reduces the
  // lair's population and a cleared nest leaves a genuinely quiet neighbourhood.
  if (lairs && lairs.size > 0) {
    for (const lair of lairs.values()) {
      if (lair.isCleared) continue;
      const bldg = buildings.find((b) => String(b.id) === String(lair.buildingId));
      if (!bldg) continue;
      const radius = lair.homeRadius ?? 40;
      const groupSize = 2 + (lair.escalation ?? 0);
      for (let g = 0; g < groupSize; g++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = radius * (0.4 + Math.random() * 0.5);
        const zmb = createZombieUnit('shambler', bldg.center.x + Math.cos(angle) * dist, bldg.center.z + Math.sin(angle) * dist, 0, false);
        zmb.lairId = lair.id;
        zmb.homeX = bldg.center.x;
        zmb.homeZ = bldg.center.z;
        zmb.homeRadius = radius;
        zmb.isRoamer = Math.random() < 0.15;
        zombies.push(zmb);
      }
    }
  }

  return zombies;
}


// ==========================================
// 8. Building Search & Infestation Trigger (Prompt 5 + Phase 6)
// ==========================================

export function generateBuildingInfestation(bldg: BuildingPolygon): BuildingInfestation {
  const rand = Math.random();
  let threatTier: BuildingInfestation['threatTier'] = 'low';
  let shamblers = 2 + Math.floor(Math.random() * 3), runners = 0, brutes = 0;
  if (rand > 0.7) { threatTier='high'; shamblers=4+Math.floor(Math.random()*4); runners=2+Math.floor(Math.random()*2); brutes=Math.random()>0.5?1:0; }
  else if (rand > 0.35) { threatTier='medium'; shamblers=3+Math.floor(Math.random()*3); runners=1; }
  return { buildingId:bldg.id, buildingName:bldg.name||`Structure #${bldg.id}`, isInfested:true, isCleared:false, threatTier, zombieCount:shamblers+runners+brutes, shamblers, runners, brutes };
}

export function breachInfestedBuilding(
  infestation: BuildingInfestation,
  bldgPos: Point2D
): ZombieUnit[] {
  const spawned: ZombieUnit[] = [];

  for (let i = 0; i < infestation.shamblers; i++) {
    const ox = bldgPos.x + (Math.random() - 0.5) * 8;
    const oz = bldgPos.z + (Math.random() - 0.5) * 8;
    const zmb = createZombieUnit('shambler', ox, oz, 0, true);
    zmb.alertLevel = 2;
    zmb.state = 'chasing';
    spawned.push(zmb);
  }

  for (let i = 0; i < infestation.runners; i++) {
    const ox = bldgPos.x + (Math.random() - 0.5) * 8;
    const oz = bldgPos.z + (Math.random() - 0.5) * 8;
    const zmb = createZombieUnit('runner', ox, oz, 0, true);
    zmb.alertLevel = 2;
    zmb.state = 'chasing';
    spawned.push(zmb);
  }

  for (let i = 0; i < infestation.brutes; i++) {
    const ox = bldgPos.x + (Math.random() - 0.5) * 8;
    const oz = bldgPos.z + (Math.random() - 0.5) * 8;
    const zmb = createZombieUnit('brute', ox, oz, 0, true);
    zmb.alertLevel = 2;
    zmb.state = 'chasing';
    spawned.push(zmb);
  }

  return spawned;
}

