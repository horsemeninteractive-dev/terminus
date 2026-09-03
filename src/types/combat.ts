import { StatTier } from './population';
import { LootItem } from './loot';
import { Point2D } from './map';

// ==========================================
// 1. In-Game Real-Time Clock & Day/Night Lore (§6.1)
// ==========================================

export type TimeOfDayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export interface GameClockState {
  day: number; // 1, 2, 3...
  hour: number; // 0..23 (float or integer, e.g. 14.5 = 2:30 PM)
  minute: number; // 0..59
  speed: 0 | 1 | 2 | 4; // 0 = Paused, 1 = 1x, 2 = 2x, 4 = 4x
  phase: TimeOfDayPhase;
  isNight: boolean; // True between 21:00 and 05:00
  hordeWaveIntensity: number; // Escalates with in-game day (1..10)
  totalElapsedSeconds: number;
}

// ==========================================
// 2. Zombie Variants & Stats (§5.1)
// ==========================================

export type ZombieVariant = 'shambler' | 'runner' | 'brute';

export type ZombieAiState =
  | 'dormant'
  | 'wandering'
  | 'investigating_sound'
  | 'chasing'
  | 'attacking_unit'
  | 'attacking_building'
  | 'dead';

export interface ZombieUnit {
  id: string;
  variant: ZombieVariant;
  name: string;
  x: number;
  z: number;
  y: number;
  rotation: number;
  currentHp: number;
  maxHp: number;
  speed: number;
  baseDamage: number;
  siegeDamage: number;
  attackCooldown: number;
  lastAttackTime: number;
  state: ZombieAiState;
  targetUnitId: string | null;
  targetBuildingId: string | number | null;
  targetPos: { x: number; z: number } | null;
  investigatingSoundId: string | null;
  spawnedAt: number;
  isDormant: boolean;
  alertLevel: number; // 0 = calm, 1 = alerted by sound, 2 = active pursuit
  pathState?: any; // A* PathState cache
  /** Owning ZombieLair, when this infected belongs to a nest (§5.2). Killing a
   *  lair-affiliated infected reduces the lair's population; clearing a lair
   *  requires eliminating every one of these. */
  lairId?: string | null;
  /** Owning BuildingOccupation (§IFZ): infected that took over an UNADAPTED
   *  structure. Killing every one clears the occupation. */
  occupationId?: string | null;
  /** The lair building's anchor point — affiliated infected call this home. */
  homeX?: number;
  homeZ?: number;
  /** Max distance (m) an affiliated infected roams before returning home. */
  homeRadius?: number;
  /** Locality model (§5.2, IFZ post-Lair behaviour): MOST lair infected stay
   *  near the nest, but a minority become roamers that wander freely, and
   *  unaffiliated infected (hordes, swarms, ambient) are always independent. */
  isRoamer?: boolean;
  queuedOrders?: Array<{ pos: { x: number; z: number }; targetBuildingId?: string | number; targetBuildingName?: string }>;
}

// ==========================================
// 3. Tactical Squad Combat Unit in 3D World (§5, §4.3)
// ==========================================

export type SquadUnitCombatState =
  | 'idle'
  | 'moving'
  | 'searching'
  | 'combat'
  | 'in_cover'
  | 'returning'
  | 'retreating'
  | 'gathering'
  | 'downed';

/** Off-map expedition lifecycle (§IFZ) — a squad away from the tactical map. */
export type ExpeditionPhase =
  | 'travel_out'
  | 'combat'
  | 'scavenging'
  | 'travel_back'
  | 'idle';

export interface TacticalSquadUnit {
  id?: string;
  squadId: string;
  name: string;
  leaderId: string;
  leaderName: string;
  leaderCombatTier: StatTier;
  generalCount: number;
  x: number;
  z: number;
  y: number;
  position?: { x: number; z: number };
  rotation: number;
  currentHp: number;
  maxHp: number;
  attackRange: number; // e.g. 26 meters
  fireRate: number; // seconds between weapon discharges
  lastFireTime: number;
  damagePerVolley: number;
  critChance: number;
  /** Permanent Shooting Range proficiency (0-4) — stat bonuses applied on top. */
  trainingTier?: number;
  moveSpeed: number;
  state: SquadUnitCombatState;
  /** Set while the squad is OFF-MAP on an expedition — the combat tick skips it. */
  onExpedition?: string | null;
  expeditionPhase?: ExpeditionPhase | null;
  manualOrder: boolean;
  targetPos: { x: number; z: number } | null;
  targetBuildingId?: string | number | null;
  targetBuildingName?: string | null;
  searchProgress?: number; // 0 to 100
  targetZombieId: string | null;
  isDeployed: boolean;
  killCount: number;
  isInSafeZone: boolean; // true while actually under medical treatment (§5.3)
  /** Storage was full when this squad finished a haul, so it deliberately did
   *  NOT return home (IFZ: check storage before returning). It holds its loot
   *  out in the field until storage frees, then auto-returns to deposit.
   *  Cleared by any fresh player order. */
  holdHaul?: boolean;
  mountedVehicleId?: string | null; // which vehicle unit they are currently inside
  assignedVehicleId?: string | null; // linked expedition vehicle for auto-scavenge returns
  vehicleId?: string | null;
  pendingMountVehicleId?: string | null; // vehicle unit they are moving to board
  /** Fuel item delivery (§8): the squad's backpack holds a fuel item it must
   *  carry to this vehicle; when the squad arrives the fuel is poured into the
   *  tank (see deliverCarriedFuel). Cleared on arrival or by a fresh player
   *  order that supersedes the delivery. */
  pendingFuelDeliveryVehicleId?: string | null;
  /**
   * Set while this squad's current order target is unreachable — the pathfinder
   * proved no route exists (dead one-point path) instead of silently standing
   * still. Drives the world-space "no path" indicator over the target building;
   * cleared when a route exists again or the squad receives a fresh order.
   */
  noPath?: { buildingId?: string | number; x: number; z: number; since: number };
  depositVehicleId?: string | null; // dismounted to deposit BOTH squad + this vehicle's cargo bay
  pathState?: any; // A* PathState cache
  queuedOrders?: Array<{ pos: { x: number; z: number }; targetBuildingId?: string | number; targetBuildingName?: string }>;
  members: SquadMemberUnit[]; // per-unit roster: leader first, then general recruits
  inventory: LootItem[];
  currentWeightKg: number;
  maxWeightKg: number;
}

// ==========================================
// 4. Sound & Acoustic Proximity Detection (§5, §6.1)
// ==========================================

export type NoiseSourceType =
  | 'gunfire'
  | 'construction'
  | 'repair'
  | 'breach'
  | 'combat'
  | 'engine'
  | 'brute_slam';

export interface NoiseEvent {
  id: string;
  type: NoiseSourceType;
  x: number;
  z: number;
  radius: number; // acoustic hearing radius in meters (30m - 120m)
  label: string;
  createdAt: number;
  durationMs: number;
}

// ==========================================
// 5. Combat Visual Effects & Damage Numbers
// ==========================================

export interface CombatVisualFx {
  id: string;
  type: 'bullet_tracer' | 'muzzle_flash' | 'blood_splatter' | 'melee_slash' | 'damage_number' | 'noise_ring' | 'zombie_death' | 'building_impact';
  startX: number;
  startY: number;
  startZ: number;
  endX?: number;
  endY?: number;
  endZ?: number;
  text?: string;
  color?: string;
  isCrit?: boolean;
  isSiege?: boolean;
  radius?: number;
  createdAt: number;
  durationMs: number;
}

// ==========================================
// 6. Building Infestation & Searches (Prompt 5 + Phase 6)
// ==========================================

export interface BuildingInfestation {
  buildingId: string | number;
  buildingName: string;
  isInfested: boolean;
  isCleared: boolean;
  threatTier: 'low' | 'medium' | 'high' | 'deadly';
  zombieCount: number;
  shamblers: number;
  runners: number;
  brutes: number;
}

export type CombatStance = 'aggressive' | 'defensive' | 'hold_fire';
export type WeaponLoadoutId = 'standard_rifle' | 'shotgun_breach' | 'scoped_marksman' | 'heavy_support';

// ==========================================
// 6b. Individual Squad Member Equipment (§4.3, §7.2)
// Weapons & armor are individual scavenged items. All units default to a
// combat knife and no armor; better gear is assigned from the shelter armory
// or auto-equipped when scavenged from buildings. On death a member drops
// their equipped weapon & armor to the ground as a pickup.
// ==========================================

export type WeaponItemId =
  | 'knife'
  | 'bat'
  | 'axe'
  | 'bow'
  | 'pistol'
  | 'shotgun'
  | 'hunting_rifle'
  | 'assault_rifle'
  | 'sniper_rifle'
  | 'heavy_machine_gun';

export interface WeaponItemDef {
  id: WeaponItemId;
  name: string;
  damage: number; // per-volley damage contribution
  range: number; // engagement range in meters
  fireRate: number; // seconds between volleys
  ammoPerVolley: number;
  tier: number; // 0 = melee default ... higher = better
}

export const WEAPON_CATALOG: Record<WeaponItemId, WeaponItemDef> = {
  knife: { id: 'knife', name: 'Combat Knife', damage: 10, range: 8, fireRate: 1.8, ammoPerVolley: 0, tier: 0 },
  bat: { id: 'bat', name: 'Baseball Bat', damage: 12, range: 9, fireRate: 1.7, ammoPerVolley: 0, tier: 1 },
  axe: { id: 'axe', name: 'Fire Axe', damage: 14, range: 9, fireRate: 1.9, ammoPerVolley: 0, tier: 2 },
  // §IFZ: bows are the ammo-free fallback — towers with no mounted firearm
  // fire one automatically, with INFINITE ammunition (ammoPerVolley 0).
  bow: { id: 'bow', name: 'Bow', damage: 15, range: 40, fireRate: 2.5, ammoPerVolley: 0, tier: 2 },
  pistol: { id: 'pistol', name: 'Pistol', damage: 16, range: 28, fireRate: 1.3, ammoPerVolley: 1, tier: 3 },
  shotgun: { id: 'shotgun', name: 'Pump Shotgun', damage: 22, range: 22, fireRate: 1.6, ammoPerVolley: 2, tier: 4 },
  hunting_rifle: { id: 'hunting_rifle', name: 'Hunting Rifle', damage: 26, range: 42, fireRate: 1.9, ammoPerVolley: 2, tier: 5 },
  assault_rifle: { id: 'assault_rifle', name: 'Assault Rifle', damage: 28, range: 36, fireRate: 1.1, ammoPerVolley: 3, tier: 6 },
  // Research-tree endgame firearms, manufactured by the Arms Factory as
  // separate production lines (unlocked by their own research nodes).
  sniper_rifle: { id: 'sniper_rifle', name: 'Sniper Rifle', damage: 32, range: 52, fireRate: 2.2, ammoPerVolley: 1, tier: 7 },
  heavy_machine_gun: { id: 'heavy_machine_gun', name: 'Heavy Machine Gun', damage: 34, range: 42, fireRate: 1.0, ammoPerVolley: 3, tier: 8 },
};

export const WEAPON_IDS: WeaponItemId[] = Object.keys(WEAPON_CATALOG) as WeaponItemId[];

export type ArmorItemId = 'padded_jacket' | 'riot_vest' | 'tactical_gear';

export interface ArmorItemDef {
  id: ArmorItemId;
  name: string;
  damageReduction: number; // 0..1 fraction of damage blocked
  tier: number;
}

export const ARMOR_CATALOG: Record<ArmorItemId, ArmorItemDef> = {
  padded_jacket: { id: 'padded_jacket', name: 'Padded Jacket', damageReduction: 0.1, tier: 1 },
  riot_vest: { id: 'riot_vest', name: 'Riot Vest', damageReduction: 0.2, tier: 2 },
  tactical_gear: { id: 'tactical_gear', name: 'Tactical Gear', damageReduction: 0.3, tier: 3 },
};

export const ARMOR_IDS: ArmorItemId[] = Object.keys(ARMOR_CATALOG) as ArmorItemId[];

/**
 * Resolves a weapon definition from untrusted state (save files, loot drops,
 * legacy data). Always returns a valid entry — unknown/bad IDs fall back to the
 * default Combat Knife instead of crashing combat with a `undefined` deref.
 */
export function getWeaponDefinition(id?: string | null): WeaponItemDef {
  return WEAPON_CATALOG[id as WeaponItemId] ?? WEAPON_CATALOG.knife;
}

/**
 * Resolves an armor definition from untrusted state. Unknown/bad IDs fall back
 * to the lowest-tier Padded Jacket rather than crashing.
 */
export function getArmorDefinition(id?: string | null): ArmorItemDef {
  return ARMOR_CATALOG[id as ArmorItemId] ?? ARMOR_CATALOG.padded_jacket;
}

/** True only when the id names a real weapon in the catalog. */
export function isValidWeaponId(id?: string | null): id is WeaponItemId {
  return !!id && id in WEAPON_CATALOG;
}

/** True only when the id names a real armor in the catalog. */
export function isValidArmorId(id?: string | null): id is ArmorItemId {
  return !!id && id in ARMOR_CATALOG;
}

// ==========================================
// Squad member face portraits (§4.3)
// A shared catalog of survivor face shots. Each member is assigned one at
// creation so that every squad displays a varied, stable roster of faces.
// ==========================================
export const SURVIVOR_FACE_URLS: string[] = [
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1521119989659-a83eee488004?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=150&auto=format&fit=crop&q=80',
];

/** Returns a random face from the survivor face catalog. */
export function pickSurvivorFaceUrl(): string {
  return SURVIVOR_FACE_URLS[Math.floor(Math.random() * SURVIVOR_FACE_URLS.length)];
}

/**
 * Resolves the face for a member: their assigned face if present, otherwise a
 * stable hash-derived face so members created before faces existed still get a
 * consistent portrait rather than a random one each render.
 */
export function faceUrlForMember(member: SquadMemberUnit): string {
  if (member.faceUrl) return member.faceUrl;
  // Stable string hash -> deterministic face index.
  let hash = 0;
  const key = member.survivorId || member.id || member.name || 'unknown';
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return SURVIVOR_FACE_URLS[hash % SURVIVOR_FACE_URLS.length];
}

export interface SquadMemberUnit {
  id: string;
  survivorId?: string;
  name: string;
  /** Portrait URL assigned randomly at squad creation (§4.3). */
  faceUrl?: string;
  isLeader: boolean;
  maxHp: number;
  currentHp: number;
  weaponId: WeaponItemId;
  armorId: ArmorItemId | null;
  isAlive: boolean;
}

export interface DroppedItem {
  id: string;
  x: number;
  z: number;
  weaponId: WeaponItemId | null;
  armorId: ArmorItemId | null;
  droppedAt: number;
}

// ==========================================
// 7. Hostile Human Faction Combat Units (§5.2)
// ==========================================
// Rival-faction Hideout occupants plug into the same squad-vs-hostile combat
// resolution as zombies (§5), but they are a distinct faction: always active
// (no sunlight dormancy), armed, and hostile on sight.

export type HostileHumanAiState = 'guarding' | 'moving' | 'combat' | 'dead';

export interface HostileHumanUnit {
  id: string;
  name: string;
  hideoutId: string;
  factionName: string;
  x: number;
  z: number;
  y: number;
  rotation: number;
  currentHp: number;
  maxHp: number;
  speed: number;
  damage: number; // damage per volley (ranged)
  attackRange: number; // engagement range in meters
  aggroRange: number; // distance at which they open fire
  attackCooldown: number; // seconds between volleys
  lastAttackTime: number;
  state: HostileHumanAiState;
  targetSquadId: string | null;
  weaponId: WeaponItemId;
  homeX: number; // guard anchor (their hideout)
  homeZ: number;
  targetBuildingId?: string | number | null;
  // Cached A* route (see PathState in pathfindingService) so defenders route
  // around player-built walls/fences and buildings instead of walking through
  // them in a straight line.
  pathState?: { path: Point2D[]; index: number; goalKey: string } | null;
}

// ==========================================
// 8. Zombie Lair — persistent infestation source (§5.2)
// ==========================================

export type LairThreatTier = 'low' | 'medium' | 'high';

export interface ZombieLair {
  id: string;
  buildingId: string | number;
  buildingName: string;
  isDiscovered: boolean;
  isCleared: boolean;
  /**
   * Living infected affiliated with this lair (inside the building or emerged
   * into its home radius). Synced every tick from actual ZombieUnits carrying
   * lairId — there is no separate abstract counter. Clearing requires killing
   * every one of them in real combat; a partially cleared lair regrows.
   */
  population: number;
  /**
   * Founding garrison at generation — the nest's SOFT baseline, NOT a ceiling.
   * A partially cleared lair regrows toward this figure, and a neglected lair
   * deliberately SWELLS well beyond it as its escalation climbs (see
   * LAIR_GARRISON_CEILING in rivalFactionService) — an old, unmolested nest
   * becomes a genuine hive of 100+ infected.
   */
  baselinePopulation: number;
  /** Radius (m) around the building the lair's infected call home. Also the
   *  pressure radius: while the lair stands, infected cluster and emerge here. */
  homeRadius: number;
  /** Game-time accumulator (real seconds × speed) driving emergence —
   *  pause-aware and independently jittered per lair so lairs never stir
   *  in lockstep. */
  spawnAccumSec: number;
  /** Wall-clock time of the last emergence (info). */
  lastActivity: number;
  /** 0..N while uncleared — grows over time, quickens nighttime emergence. */
  escalation: number;
  escalationAccumSec: number;
  threatTier: LairThreatTier;
  /** Accumulator for population regrowth after a partial clear. */
  replenishAccumSec: number;
  /**
   * Game-time accumulator for NIGHT MOBILIZATION: while the lair stands, at
   * night it periodically commits a strike group of its OWN resident infected
   * toward the settlement — a lair-fed horde. Mobilization RETARGETS existing
   * lair-affiliated zombies (lairId), never creates them, so killing mobilized
   * infected en route or at the perimeter thins the nest's real population.
   * Cleared lairs never mobilize and the regional pressure collapses.
   */
  hordeAccumSec?: number;
}

