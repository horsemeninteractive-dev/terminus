import { Point2D } from '../../types/map';
import { StatTier } from '../../types/population';
import {
  ArmorItemId,
  SquadMemberUnit,
  TacticalSquadUnit,
  WeaponItemId,
  getWeaponDefinition,
  pickSurvivorFaceUrl,
} from '../../types/combat';

// ==========================================
// 3. Tactical Squad Unit Initialization (§4.3, §5)
// ==========================================

/**
 * Builds the per-unit roster for a squad: exactly 1 named leader + N general
 * recruits by default. Leaderless squads (includeLeader = false) field N
 * generic recruits only — every member is a nameless citizen. All units default
 * to a combat knife and no armor (§4.3).
 */
export function buildSquadMembers(
  squadId: string,
  leaderName: string,
  generalCount: number,
  includeLeader = true
): SquadMemberUnit[] {
  const members: SquadMemberUnit[] = [];
  if (includeLeader) {
    members.push({
      id: `${squadId}_leader`,
      name: leaderName,
      faceUrl: pickSurvivorFaceUrl(),
      isLeader: true,
      maxHp: 100,
      currentHp: 100,
      weaponId: 'knife',
      armorId: null,
      isAlive: true,
    });
  }
  for (let i = 0; i < Math.max(0, generalCount); i++) {
    members.push({
      id: `${squadId}_member_${i}`,
      name: `Recruit ${i + 1}`,
      faceUrl: pickSurvivorFaceUrl(),
      isLeader: false,
      maxHp: 50,
      currentHp: 50,
      weaponId: 'knife',
      armorId: null,
      isAlive: true,
    });
  }
  return members;
}

/**
 * Recomputes squad aggregate health from the member roster. Marks the squad
 * downed when every member is dead.
 */
export function recomputeSquadHealth(squad: TacticalSquadUnit): TacticalSquadUnit {
  squad.maxHp = squad.members.reduce((acc, m) => acc + m.maxHp, 0);
  squad.currentHp = squad.members.reduce(
    (acc, m) => (m.isAlive ? acc + m.currentHp : acc),
    0
  );
  // generalCount = citizens other than the named leader. Leaderless squads have
  // no leader member, so every member counts as a general.
  squad.generalCount = Math.max(
    0,
    squad.members.length - (squad.members.some((m) => m.isLeader) ? 1 : 0)
  );
  const aliveCount = squad.members.filter((m) => m.isAlive).length;
  if (aliveCount === 0) {
    squad.state = 'downed';
  } else if (squad.state === 'downed') {
    squad.state = 'idle';
  }
  return squad;
}

/**
 * Recomputes squad combat stats from each member's equipped weapon. Leader
 * tier multipliers apply to the leader's weapon only.
 */
export function recomputeSquadStats(squad: TacticalSquadUnit): TacticalSquadUnit {
  const leader = squad.members.find((m) => m.isLeader && m.isAlive) || squad.members[0];
  const tierMult =
    squad.leaderCombatTier === 'expert' ? 1.75 : squad.leaderCombatTier === 'skilled' ? 1.35 : 1.0;

  let damage = 0;
  let range = 8;
  let fireRate = 2.2;
  for (const m of squad.members) {
    if (!m.isAlive) continue;
    const w = getWeaponDefinition(m.weaponId);
    damage += m.isLeader ? w.damage * tierMult : w.damage;
    range = Math.max(range, w.range);
    if (m.isLeader) fireRate = Math.min(fireRate, w.fireRate);
    else fireRate = Math.min(fireRate, w.fireRate + 0.2);
  }

  squad.damagePerVolley = Math.round(damage);
  squad.attackRange = Math.max(8, range);
  squad.fireRate = Math.max(0.9, fireRate);
  squad.critChance =
    squad.leaderCombatTier === 'expert' ? 0.3 : squad.leaderCombatTier === 'skilled' ? 0.15 : 0.05;

  // §Terminus Shooting Range: permanent training proficiency stacks on top of
  // gear and leadership — +6% damage, +1% crit, -5% fire rate per tier.
  const tier = squad.trainingTier ?? 0;
  if (tier > 0) {
    squad.damagePerVolley = Math.round(squad.damagePerVolley * (1 + 0.06 * tier));
    squad.critChance = Math.min(0.5, squad.critChance + 0.01 * tier);
    squad.fireRate = Math.max(0.9, squad.fireRate * Math.max(0.6, 1 - 0.05 * tier));
  }
  return squad;
}

export function assignMemberWeapon(
  squad: TacticalSquadUnit,
  memberId: string,
  weaponId: WeaponItemId | null
): TacticalSquadUnit {
  const member = squad.members.find((m) => m.id === memberId);
  if (!member) return squad;
  member.weaponId = weaponId || 'knife';
  return recomputeSquadStats(squad);
}

export function assignMemberArmor(
  squad: TacticalSquadUnit,
  memberId: string,
  armorId: ArmorItemId | null
): TacticalSquadUnit {
  const member = squad.members.find((m) => m.id === memberId);
  if (!member) return squad;
  member.armorId = armorId;
  return squad;
}

export function createTacticalSquadUnit(
  squadId: string,
  name: string,
  leaderId: string,
  leaderName: string,
  leaderCombatTier: StatTier,
  generalCount: number,
  spawnPos: Point2D,
  hasLeader = true,
  trainingTier = 0
): TacticalSquadUnit {
  const members = buildSquadMembers(squadId, leaderName, generalCount, hasLeader);

  const base: TacticalSquadUnit = {
    squadId,
    name,
    leaderId,
    leaderName,
    leaderCombatTier,
    generalCount,
    x: spawnPos.x,
    z: spawnPos.z,
    y: 0,
    rotation: 0,
    maxHp: (hasLeader ? 100 : 0) + generalCount * 50,
    currentHp: (hasLeader ? 100 : 0) + generalCount * 50,
    attackRange: 28, // 28 meters engagement range
    fireRate: 1.6,
    lastFireTime: 0,
    damagePerVolley: (hasLeader ? 12 : 0) + generalCount * 5,
    critChance: 0.05,
    moveSpeed: 10.0, // 10 m/s tactical run (~36 km/h); brisk enough to cross the 8km map, slower than vehicles on roads
    state: 'idle',
    manualOrder: false,
    targetPos: null,
    targetZombieId: null,
    isDeployed: true,
    killCount: 0,
    isInSafeZone: true,
    members,
    inventory: [],
    currentWeightKg: 0,
    maxWeightKg: (hasLeader ? 1 : 0) + generalCount,
    trainingTier,
  };

  return recomputeSquadHealth(recomputeSquadStats(base));
}

