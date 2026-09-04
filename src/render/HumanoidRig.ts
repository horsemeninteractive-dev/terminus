import * as THREE from 'three';

/**
 * Articulated low-poly humanoid rigs for survivors, workers, hostiles and the
 * infected. Replaces the old single-cylinder characters with a shared skeleton
 * — two legs, a torso that can lean at the waist, a nodding head and two arms
 * — so every unit type can be posed and animated per frame (walk/idle/aim/
 * work/zombie shamble) for a few extra draw calls per character.
 *
 * All geometries are built once with their local origin at the TOP of the limb
 * (the shoulder/hip joint), so rotating a limb group swings the segment around
 * its joint. Materials are module-level singletons shared by every instance of
 * a type; nothing here needs per-instance allocation or disposal.
 */

// ---------------------------------------------------------------------------
// Shared geometry (origin conventions: limbs pivot at their top)
// ---------------------------------------------------------------------------

interface SharedGeos {
  leg: THREE.CylinderGeometry;
  foot: THREE.BoxGeometry;
  arm: THREE.CylinderGeometry;
  torso: THREE.BoxGeometry;
  vest: THREE.BoxGeometry;
  pack: THREE.BoxGeometry;
  head: THREE.SphereGeometry;
  helmet: THREE.SphereGeometry;
  eye: THREE.SphereGeometry;
  gunBody: THREE.BoxGeometry;
  gunMag: THREE.BoxGeometry;
  bruteShoulder: THREE.SphereGeometry;
}

let cachedGeos: SharedGeos | null = null;

function geos(): SharedGeos {
  if (cachedGeos) return cachedGeos;
  // Limb geometries are translated so their local origin sits at the joint.
  const leg = new THREE.CylinderGeometry(0.09, 0.06, 0.93, 7);
  leg.translate(0, -0.465, 0); // hangs from hip at y 0.93 down to the ground
  const foot = new THREE.BoxGeometry(0.11, 0.07, 0.24);
  const arm = new THREE.CylinderGeometry(0.062, 0.052, 0.47, 6);
  arm.translate(0, -0.235, 0); // hangs from shoulder; wrist ~0.43 below it
  cachedGeos = {
    leg,
    foot,
    arm,
    torso: new THREE.BoxGeometry(0.46, 0.52, 0.26),
    vest: new THREE.BoxGeometry(0.5, 0.34, 0.3),
    pack: new THREE.BoxGeometry(0.32, 0.42, 0.18),
    head: new THREE.SphereGeometry(0.14, 8, 7),
    helmet: new THREE.SphereGeometry(0.152, 8, 6),
    eye: new THREE.SphereGeometry(0.045, 6, 5),
    gunBody: new THREE.BoxGeometry(0.075, 0.09, 0.66),
    gunMag: new THREE.BoxGeometry(0.05, 0.15, 0.08),
    bruteShoulder: new THREE.SphereGeometry(0.42, 7, 6),
  };
  return cachedGeos;
}

// ---------------------------------------------------------------------------
// Shared materials (one instance per type; never disposed — app-lifetime)
// ---------------------------------------------------------------------------

interface MatSpec {
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
}

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

function getMat(key: string, spec: MatSpec): THREE.MeshStandardMaterial {
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: spec.color ?? 0x808080,
      emissive: spec.emissive ?? 0x000000,
      emissiveIntensity: spec.emissiveIntensity ?? 0,
      roughness: spec.roughness ?? 0.65,
      metalness: spec.metalness ?? 0.08,
    });
    materialCache.set(key, m);
  }
  return m;
}

interface StyleMats {
  torso: THREE.MeshStandardMaterial;
  arms: THREE.MeshStandardMaterial;
  legs: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
  vest?: THREE.MeshStandardMaterial;
  helmet?: THREE.MeshStandardMaterial;
  pack?: THREE.MeshStandardMaterial;
  gun?: THREE.MeshStandardMaterial;
}

const styleCache = new Map<string, StyleMats>();

function style(key: string, opts: {
  torso: MatSpec; arms: MatSpec; legs: MatSpec; head: MatSpec;
  vest?: MatSpec; helmet?: MatSpec; pack?: MatSpec; gun?: MatSpec;
}): StyleMats {
  let s = styleCache.get(key);
  if (!s) {
    s = {
      torso: getMat(`${key}_torso`, opts.torso),
      arms: getMat(`${key}_arms`, opts.arms),
      legs: getMat(`${key}_legs`, opts.legs),
      head: getMat(`${key}_head`, opts.head),
      vest: opts.vest ? getMat(`${key}_vest`, opts.vest) : undefined,
      helmet: opts.helmet ? getMat(`${key}_helmet`, opts.helmet) : undefined,
      pack: opts.pack ? getMat(`${key}_pack`, opts.pack) : undefined,
      gun: opts.gun ? getMat(`${key}_gun`, opts.gun) : undefined,
    };
    styleCache.set(key, s);
  }
  return s;
}

const NIGHT_UNIFORM_EMISSIVE = 0.25;
const NIGHT_ZOMBIE_EMISSIVE = 0.3;

const SOLDIER_LEADER = style('soldier_leader', {
  torso: { color: 0x3b82f6, emissive: 0x1e40af, emissiveIntensity: NIGHT_UNIFORM_EMISSIVE, roughness: 0.5, metalness: 0.2 },
  arms: { color: 0x3b82f6, emissive: 0x1e40af, emissiveIntensity: NIGHT_UNIFORM_EMISSIVE, roughness: 0.5, metalness: 0.2 },
  legs: { color: 0x1e3a8a, emissive: 0x172554, emissiveIntensity: NIGHT_UNIFORM_EMISSIVE, roughness: 0.7 },
  head: { color: 0xcdb79b, roughness: 0.75 },
  vest: { color: 0x1f3a5f, roughness: 0.7, metalness: 0.25 },
  pack: { color: 0x0f172a, roughness: 0.85 },
  gun: { color: 0x111827, roughness: 0.35, metalness: 0.85 },
});

const SOLDIER_MEMBER = style('soldier_member', {
  torso: { color: 0x64748b, emissive: 0x334155, emissiveIntensity: NIGHT_UNIFORM_EMISSIVE, roughness: 0.6, metalness: 0.12 },
  arms: { color: 0x64748b, emissive: 0x334155, emissiveIntensity: NIGHT_UNIFORM_EMISSIVE, roughness: 0.6, metalness: 0.12 },
  legs: { color: 0x475569, emissive: 0x1e293b, emissiveIntensity: NIGHT_UNIFORM_EMISSIVE, roughness: 0.7 },
  head: { color: 0xcdb79b, roughness: 0.75 },
  vest: { color: 0x334155, roughness: 0.7, metalness: 0.2 },
  pack: { color: 0x0f172a, roughness: 0.85 },
  gun: { color: 0x111827, roughness: 0.35, metalness: 0.85 },
});

const HOSTILE = style('hostile', {
  torso: { color: 0xb45309, emissive: 0x7c2d12, emissiveIntensity: NIGHT_UNIFORM_EMISSIVE, roughness: 0.55, metalness: 0.25 },
  arms: { color: 0x92400e, emissive: 0x7c2d12, emissiveIntensity: NIGHT_UNIFORM_EMISSIVE, roughness: 0.6 },
  legs: { color: 0x78350f, emissive: 0x451a03, emissiveIntensity: NIGHT_UNIFORM_EMISSIVE, roughness: 0.8 },
  head: { color: 0xc9a284, roughness: 0.8 },
  vest: { color: 0x7c2d12, roughness: 0.7, metalness: 0.15 },
  gun: { color: 0x1c1917, roughness: 0.4, metalness: 0.8 },
});

const WORKER = style('worker', {
  torso: { color: 0x475569, roughness: 0.7, metalness: 0.05 },
  arms: { color: 0x526c86, roughness: 0.75 },
  legs: { color: 0x374151, roughness: 0.8 },
  head: { color: 0xd4b495, roughness: 0.7 },
  vest: { color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.1 },
  helmet: { color: 0xfacc15, emissive: 0xca8a04, emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.15 },
  pack: { color: 0x1e293b, roughness: 0.85 },
});

const SHAMBLER = style('shambler', {
  torso: { color: 0x5a7050, emissive: 0x0d1a0a, emissiveIntensity: NIGHT_ZOMBIE_EMISSIVE, roughness: 0.85 },
  arms: { color: 0x6b7a58, emissive: 0x0d1a0a, emissiveIntensity: NIGHT_ZOMBIE_EMISSIVE, roughness: 0.9 },
  legs: { color: 0x4a5d48, roughness: 0.9 },
  head: { color: 0x8f9d78, roughness: 0.85 },
});

const RUNNER = style('runner', {
  torso: { color: 0x8f3a3a, emissive: 0x3d0c0c, emissiveIntensity: 0.4, roughness: 0.6 },
  arms: { color: 0x9f4a4a, emissive: 0x3d0c0c, emissiveIntensity: 0.4, roughness: 0.65 },
  legs: { color: 0x782828, roughness: 0.7 },
  head: { color: 0xa98f8f, roughness: 0.7 },
});

const BRUTE = style('brute', {
  torso: { color: 0x2c2c34, emissive: 0x4c1d95, emissiveIntensity: 0.45, roughness: 0.7, metalness: 0.3 },
  arms: { color: 0x37373f, emissive: 0x4c1d95, emissiveIntensity: 0.35, roughness: 0.75, metalness: 0.25 },
  legs: { color: 0x222228, roughness: 0.85, metalness: 0.2 },
  head: { color: 0x4b4b55, emissive: 0x4c1d95, emissiveIntensity: 0.3, roughness: 0.8 },
});

// ---------------------------------------------------------------------------
// Rig structure
// ---------------------------------------------------------------------------

export type RigKind = 'worker' | 'soldier' | 'hostile' | 'shambler' | 'runner' | 'brute';

/**
 * The poseable skeleton of one character. All groups live in a space whose
 * origin is at the character's feet; the container that owns the rig adds its
 * own world position/rotation (facing), so rigs are always built facing +Z.
 */
export interface HumanoidRig {
  /** Container added to the scene; position.y must stay at ground level. */
  root: THREE.Group;
  kind: RigKind;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Ankle pivots — counter-rotated so boot soles stay flat on the ground. */
  footL: THREE.Group;
  footR: THREE.Group;
  /** Waist pivot at ~0.93 — rotating it leans the whole upper body. */
  hips: THREE.Group;
  /** Neck pivot — used for zombie head lolling / nods. */
  headPivot: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** Right-hand weapon (child of armR) so it aims with the arm. */
  gun?: THREE.Group;
  /** Extra meshes that must scale with the character (brute shoulders). */
  extras: THREE.Object3D[];
  /** Per-rig animation state (phase, previous sample) — kept off the scene. */
  anim: {
    phase: number;
    prevX: number;
    prevZ: number;
    hasPrev: boolean;
    workPhase: number;
  };
}

interface RigBuildOptions {
  kind: RigKind;
  mats: StyleMats;
  /** Armed human (rifle in the right hand). */
  armed?: boolean;
  /** Hi-vis vest over the torso. */
  vest?: boolean;
  /** Yellow hardhat on the head. */
  helmet?: boolean;
  /** Rucksack on the back. */
  pack?: boolean;
  /** Bright emissive eyes (runner/brute). */
  eyes?: boolean;
  /** Blob shoulders (brute). */
  bruteShoulders?: boolean;
  /** Overall scale applied to the whole rig (brute bulk). */
  scale?: number;
}

function buildRig(opts: RigBuildOptions): HumanoidRig {
  const g = geos();
  const root = new THREE.Group();
  root.name = 'humanoid';
  root.userData.kind = opts.kind;

  // -- Legs (pivot at the hip) + flat-planted boots ---------------------------
  const legL = new THREE.Group();
  legL.position.set(-0.13, 0.93, 0);
  const legLMesh = new THREE.Mesh(g.leg, opts.mats.legs);
  legLMesh.castShadow = true;
  legL.add(legLMesh);
  // The boot hangs from an ankle pivot just above the sole; the pose engine
  // counter-rotates that pivot against the thigh so the sole stays parallel to
  // the ground instead of digging its toe in on every stride.
  const footL = new THREE.Group();
  footL.position.set(0, -0.895, 0.075);
  const bootLMesh = new THREE.Mesh(g.foot, opts.mats.legs);
  bootLMesh.castShadow = true;
  footL.add(bootLMesh);
  legL.add(footL);
  const legR = new THREE.Group();
  legR.position.set(0.13, 0.93, 0);
  const legRMesh = new THREE.Mesh(g.leg, opts.mats.legs);
  legRMesh.castShadow = true;
  legR.add(legRMesh);
  const footR = new THREE.Group();
  footR.position.set(0, -0.895, 0.075);
  const bootRMesh = new THREE.Mesh(g.foot, opts.mats.legs);
  bootRMesh.castShadow = true;
  footR.add(bootRMesh);
  legR.add(footR);

  // -- Waist / upper body -----------------------------------------------------
  const hips = new THREE.Group();
  hips.position.set(0, 0.93, 0);

  const torso = new THREE.Mesh(g.torso, opts.mats.torso);
  torso.position.y = 0.26;
  torso.castShadow = true;
  hips.add(torso);

  if (opts.vest) {
    const vest = new THREE.Mesh(g.vest, opts.mats.vest!);
    vest.position.y = 0.2;
    vest.scale.y = 0.78;
    vest.castShadow = false;
    hips.add(vest);
  }
  if (opts.pack) {
    const pack = new THREE.Mesh(g.pack, opts.mats.pack!);
    pack.position.set(0, 0.18, -0.17);
    hips.add(pack);
  }

  // Head (pivot at the neck so the head can loll / look around)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.5, 0);
  const head = new THREE.Mesh(g.head, opts.mats.head);
  head.position.y = 0.14;
  head.castShadow = true;
  headPivot.add(head);
  hips.add(headPivot);

  if (opts.helmet) {
    const helmet = new THREE.Mesh(g.helmet, opts.mats.helmet!);
    helmet.position.set(0, 0.16, 0);
    helmet.scale.set(1, 0.72, 1);
    headPivot.add(helmet);
  }

  // -- Arms (pivot at the shoulder, single segment to the wrist) ---------------
  const armL = new THREE.Group();
  armL.position.set(-0.27, 0.44, 0);
  const armLMesh = new THREE.Mesh(g.arm, opts.mats.arms);
  armL.add(armLMesh);
  const armR = new THREE.Group();
  armR.position.set(0.27, 0.44, 0);
  const armRMesh = new THREE.Mesh(g.arm, opts.mats.arms);
  armR.add(armRMesh);
  hips.add(armL, armR);

  // Rifle held in the right hand, laid along the arm with the grip at the fist.
  // The gun's +Z (muzzle) is mapped onto the arm's "reach" direction (-Y) by a
  // +90° X rotation, so the stock tucks near the shoulder while the muzzle ends
  // just past the fist — raising the arm forward aims the muzzle forward.
  let gun: THREE.Group | undefined;
  if (opts.armed && opts.mats.gun) {
    gun = new THREE.Group();
    gun.position.set(0, -0.32, -0.02);
    gun.rotation.x = Math.PI / 2;
    const barrel = new THREE.Mesh(g.gunBody, opts.mats.gun);
    barrel.position.z = 0.02;
    const mag = new THREE.Mesh(g.gunMag, opts.mats.gun);
    mag.position.set(0, -0.075, 0.02);
    gun.add(barrel, mag);
    armR.add(gun);
  }

  // Eyes (for the runners/brutes — glowing red/purple pinpoints)
  const extras: THREE.Object3D[] = [];
  if (opts.eyes) {
    const eyeMat = new THREE.MeshBasicMaterial({
      color: opts.kind === 'brute' ? 0xef4444 : 0xff2200,
    });
    const eye1 = new THREE.Mesh(g.eye, eyeMat);
    eye1.position.set(0.095, 0.11, 0.115);
    const eye2 = new THREE.Mesh(g.eye, eyeMat);
    eye2.position.set(-0.095, 0.11, 0.115);
    headPivot.add(eye1, eye2);
  }
  if (opts.bruteShoulders) {
    const sh1 = new THREE.Mesh(g.bruteShoulder, opts.mats.arms);
    sh1.position.set(-0.62, 0.34, -0.04);
    const sh2 = new THREE.Mesh(g.bruteShoulder, opts.mats.arms);
    sh2.position.set(0.62, 0.34, -0.04);
    hips.add(sh1, sh2);
    extras.push(sh1, sh2);
  }

  root.add(legL, legR, hips);

  if (opts.scale && opts.scale !== 1) root.scale.setScalar(opts.scale);

  return {
    root,
    kind: opts.kind,
    legL,
    legR,
    footL,
    footR,
    hips,
    headPivot,
    armL,
    armR,
    gun,
    extras,
    anim: { phase: 0, prevX: 0, prevZ: 0, hasPrev: false, workPhase: Math.random() * Math.PI * 2 },
  };
}

// ---------------------------------------------------------------------------
// Public rig builders
// ---------------------------------------------------------------------------

/** Civilian labourer — hi-vis vest, hardhat, tool rucksack. */
export function createWorkerRig(): HumanoidRig {
  return buildRig({ kind: 'worker', mats: WORKER, vest: true, helmet: true, pack: true });
}

/** Colony soldier (leader uses the blue uniform, escorts the slate one). */
export function createSoldierRig(leader: boolean): HumanoidRig {
  return buildRig({
    kind: 'soldier',
    mats: leader ? SOLDIER_LEADER : SOLDIER_MEMBER,
    armed: true,
    vest: true,
    pack: !leader,
  });
}

/** Hostile human faction raider. */
export function createHostileRig(): HumanoidRig {
  return buildRig({ kind: 'hostile', mats: HOSTILE, armed: true, vest: true });
}

/** Infected — shambler / runner / brute silhouettes share one skeleton. */
export function createZombieRig(variant: 'shambler' | 'runner' | 'brute'): HumanoidRig {
  if (variant === 'runner') {
    return buildRig({ kind: 'runner', mats: RUNNER, eyes: true, scale: 0.96 });
  }
  if (variant === 'brute') {
    return buildRig({ kind: 'brute', mats: BRUTE, eyes: true, bruteShoulders: true, scale: 1.55 });
  }
  return buildRig({ kind: 'shambler', mats: SHAMBLER });
}

// ---------------------------------------------------------------------------
// Pose engine
// ---------------------------------------------------------------------------

export type RigPoseMode =
  | 'idle'
  | 'walk'
  | 'run'          // rifle-port jog: squads cover ground at ~10 m/s tactical run
  | 'aim'          // weapon raised, braced stance
  | 'workHarvest'  // bend + scoop at a resource node
  | 'workBuild'    // hammer swing at a construction site
  | 'zombieIdle'   // standing infected, arms out, subtle sway
  | 'zombieShamble'
  | 'zombieRun'
  | 'zombieAttack' // lunging clawing at a target
  | 'zombieBrute';

const PI = Math.PI;
const TWO_PI = PI * 2;

/**
 * Set the whole-body pose for one rig. `timeSec` is the rig's accumulated
 * animation clock in seconds (advance it each frame by the frame delta, scaled
 * by sim clock speed) — every mode derives its own stride/breathing frequency
 * from it, so idle sway and sprint pumps stay natural without caller tuning.
 * All limb rotations are local to the rig, which always faces +Z.
 *
 * Limb convention: a limb hangs straight down from its joint at rotation 0;
 * rotating the joint about X by −π/2 swings it forward to horizontal (+Z).
 */
export function applyRigPose(rig: HumanoidRig, mode: RigPoseMode, timeSec: number) {
  const r = rig;
  const t = timeSec;

  const legSwing = (amp: number, freq = 1) => {
    r.legL.rotation.x = Math.sin(t * TWO_PI * freq) * amp;
    r.legR.rotation.x = Math.sin(t * TWO_PI * freq + PI) * amp;
  };
  const armSwing = (amp: number, freq = 1) => {
    // Contralateral by default: the left arm swings against the right leg, so a
    // gait reads naturally instead of same-side marching.
    r.armL.rotation.x = Math.sin(t * TWO_PI * freq + PI) * amp;
    r.armR.rotation.x = Math.sin(t * TWO_PI * freq) * amp;
  };

  // Whole-body vertical bounce rides on the rig root (whose y starts at 0 —
  // the container above it holds the ground elevation); reset rotations each
  // frame and reassign the bounce directly so it is never accumulated. Every
  // limb is zeroed here too — poses that only drive X (gait helpers) must not
  // inherit Y/Z leftovers from an earlier pose (e.g. braced legs to a walk).
  r.hips.position.y = 0.93;
  r.hips.rotation.set(0, 0, 0);
  r.headPivot.rotation.set(0, 0, 0);
  r.legL.rotation.set(0, 0, 0);
  r.legR.rotation.set(0, 0, 0);
  r.armL.rotation.set(0, 0, 0);
  r.armR.rotation.set(0, 0, 0);

  switch (mode) {
    case 'idle': {
      const breath = Math.sin(t * TWO_PI * 0.18);
      r.hips.rotation.x = 0;
      r.hips.rotation.z = breath * 0.02;
      r.root.position.y = 0.006 + Math.abs(Math.sin(t * TWO_PI * 0.36)) * 0.012;
      if (rig.gun) {
        // Armed at ease: weight on the right leg, rifle held low in the right
        // hand with the muzzle down-forward, left arm loose at the side.
        r.legL.rotation.set(0.02, 0, 0.09 + breath * 0.012);
        r.legR.rotation.set(-0.035, 0, -0.06);
        r.armR.rotation.set(-0.45 - breath * 0.04, -0.06, 0.05);
        r.armL.rotation.set(-0.05, 0.03, -0.09 + breath * 0.035);
        r.headPivot.rotation.set(-0.02, Math.sin(t * TWO_PI * 0.14) * 0.08, 0);
      } else {
        // Standing at ease: slow breathing, arms relaxed just off the hips.
        r.armL.rotation.set(-0.04, 0, -0.1 + breath * 0.03);
        r.armR.rotation.set(-0.04, 0, 0.1 - breath * 0.03);
        legSwing(0.015);
      }
      break;
    }
    case 'walk': {
      // Brisk stride; torso leans into the step with a per-stride bounce.
      const swing = Math.sin(t * TWO_PI * 1.55);
      legSwing(0.48, 1.55);
      if (rig.gun) {
        // Rifle kept in the low-ready carry — the right arm stays on the weapon
        // while only the free left arm swings with the gait.
        r.armL.rotation.set(-0.08 - swing * 0.32, 0.06, -0.14);
        r.armR.rotation.set(-0.55 - Math.abs(swing) * 0.07, -0.05, 0.05);
      } else {
        armSwing(0.34, 1.55);
      }
      r.hips.rotation.x = 0.09;
      r.root.position.y = Math.abs(swing) * 0.03;
      r.headPivot.rotation.set(-0.03, Math.sin(t * TWO_PI * 0.3) * 0.12, 0);
      break;
    }
    case 'run': {
      // Rifle-port jog for units covering ground at the sim's ~10 m/s tactical
      // run: deep pumping stride, forward lean and body bounce; both hands stay
      // on the weapon so the rifle rides level while the legs do the work.
      const pump = Math.sin(t * TWO_PI * 2.5);
      legSwing(0.72, 2.5);
      r.hips.rotation.x = 0.2;
      r.hips.rotation.z = pump * 0.035;
      r.root.position.y = Math.abs(pump) * 0.055;
      r.armR.rotation.set(-1.18 + pump * 0.05, -0.08, 0.04);
      r.armL.rotation.set(-1.02 - pump * 0.08, 0.1, 0.1);
      r.headPivot.rotation.set(0.06, Math.sin(t * TWO_PI * 0.5) * 0.14, 0);
      break;
    }
    case 'aim': {
      // Weapon raised level, legs in a braced shooter stance; slow muzzle sway
      // from the breathing, and the head scans for targets between shots.
      const sway = Math.sin(t * TWO_PI * 0.55);
      r.legL.rotation.set(-0.16, 0, 0.12);
      r.legR.rotation.set(-0.05, 0, -0.1);
      r.hips.rotation.x = 0.08;
      r.root.position.y = 0.01;
      // Arms brought up: right shoulder holds the stock, left guides the forend.
      r.armR.rotation.set(-1.55 + sway * 0.025, -0.05, -0.04);
      r.armL.rotation.set(-1.36 + sway * 0.02, 0.06, 0.1);
      r.headPivot.rotation.set(-0.04, Math.sin(t * TWO_PI * 0.35) * 0.22, 0);
      break;
    }
    case 'workHarvest': {
      // Crouched scoop at a node: waist bent, both arms working down-front.
      const reach = 0.45 + Math.max(0, Math.sin(t * TWO_PI * 1.1)) * 0.4;
      r.hips.rotation.x = 0.62;
      r.armL.rotation.set(-(reach + 0.2), 0.35, -0.2);
      r.armR.rotation.set(-(reach + 0.2), -0.35, 0.2);
      r.headPivot.rotation.set(0.35, 0, 0);
      legSwing(0.03, 0.4);
      break;
    }
    case 'workBuild': {
      // One arm swings a hammer from over the shoulder onto the work, the
      // other braces; the strike snaps then dwells before the next windup.
      const swing = Math.sin(t * TWO_PI * 1.1);
      const strike = Math.max(0, Math.sin(t * TWO_PI * 1.1 - PI * 0.5)) ;
      r.hips.rotation.x = 0.16;
      r.armR.rotation.set(-3.0 + strike * 2.1, -0.1, 0.08);
      r.armL.rotation.set(-1.15 + swing * 0.08, 0.25, -0.2);
      r.headPivot.rotation.set(0.1, 0, 0);
      legSwing(0.02, 0.6);
      break;
    }
    case 'zombieIdle': {
      // Still but restless: arms held out, torso swaying, head drooping.
      const sway = Math.sin(t * TWO_PI * 0.35);
      r.legL.rotation.x = 0.08;
      r.legR.rotation.x = -0.08;
      r.armL.rotation.set(-0.95 + sway * 0.12, 0.35, -0.18);
      r.armR.rotation.set(-0.95 - sway * 0.12, -0.35, 0.18);
      r.hips.rotation.x = 0.15;
      r.hips.rotation.z = sway * 0.025;
      r.root.position.y = Math.abs(Math.sin(t * TWO_PI * 0.35)) * 0.012;
      r.headPivot.rotation.set(0.22, 0, Math.sin(t * TWO_PI * 0.2) * 0.16);
      break;
    }
    case 'zombieShamble': {
      // Dragging uneven gait, arms swaying forward.
      const step = 0.3;
      legSwing(step, 0.9);
      const reach = 0.2 + Math.sin(t * TWO_PI * 0.9) * 0.2;
      r.armL.rotation.set(-0.95 - reach, 0.3, -0.12);
      r.armR.rotation.set(-0.95 + reach, -0.3, 0.12);
      r.hips.rotation.x = 0.12;
      r.hips.rotation.z = Math.sin(t * TWO_PI * 0.45) * 0.04;
      r.root.position.y = Math.abs(Math.sin(t * TWO_PI * 0.9)) * 0.02;
      r.headPivot.rotation.set(0.2, 0, Math.sin(t * TWO_PI * 0.3) * 0.18);
      break;
    }
    case 'zombieRun': {
      // Sprinting lunge: strong forward lean, big pumping arms and legs.
      const pump = 0.78;
      legSwing(pump, 2.1);
      armSwing(pump, 2.1);
      r.hips.rotation.x = 0.45;
      r.root.position.y = Math.abs(Math.sin(t * TWO_PI * 2.1)) * 0.05;
      r.headPivot.rotation.set(0.25, 0, 0);
      break;
    }
    case 'zombieAttack': {
      // Lunging claws: both arms flail at the target, whole body lurches in.
      const claw = Math.sin(t * TWO_PI * 1.8);
      r.legL.rotation.x = -0.5 + claw * 0.18;
      r.legR.rotation.x = 0.12;
      r.armL.rotation.set(-0.7 - Math.max(0, claw) * 1.0, 0.4, -0.3);
      r.armR.rotation.set(-0.7 + Math.max(0, -claw) * 1.0, -0.4, 0.3);
      r.hips.rotation.x = 0.38;
      r.hips.rotation.z = claw * 0.05;
      r.root.position.y = 0.02;
      r.headPivot.rotation.set(0.3, 0, 0);
      break;
    }
    case 'zombieBrute': {
      // Slow, heavy, wide stance with broad swiping arms and a rolling lurch.
      const sway = Math.sin(t * TWO_PI * 0.5);
      legSwing(0.2, 0.5);
      r.armL.rotation.set(-0.62 - sway * 0.32, 0.55, -0.45);
      r.armR.rotation.set(-0.62 + sway * 0.32, -0.55, 0.45);
      r.hips.rotation.x = 0.08;
      r.hips.rotation.z = sway * 0.03;
      r.root.position.y = Math.abs(sway) * 0.035;
      r.headPivot.rotation.set(0.1, 0, sway * 0.14);
      break;
    }
  }

  // Keep boot soles parallel to the ground regardless of thigh angle — ankle
  // counter-rotation. (Z leans of the leg still tip the boot a touch, which is
  // fine for wide stances.)
  r.footL.rotation.x = -r.legL.rotation.x;
  r.footR.rotation.x = -r.legR.rotation.x;
}
