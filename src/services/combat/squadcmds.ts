import { Point2D } from '../../types/map';
import { StatTier } from '../../types/population';
import {
  ArmorItemId,
  TacticalSquadUnit,
  WeaponItemId,
} from '../../types/combat';
import { SettlementState } from '../../types/settlement';
import { getPrimaryHQ } from '../buildingOperational';
import {
  buildSquadMembers,
  createTacticalSquadUnit,
  recomputeSquadHealth,
  recomputeSquadStats,
} from './armory';

// ==========================================
// 9. RTS Command Dispatchers & State Synchronization
// ==========================================

export function orderSquadMove(
  squads: TacticalSquadUnit[],
  squadId: string,
  pos: Point2D,
  targetBuildingId?: string | number | null,
  targetBuildingName?: string | null
): TacticalSquadUnit[] {
  return squads.map((s) => {
    if (s.squadId !== squadId) return s;
    return {
      ...s,
      manualOrder: true,
      holdHaul: false, // a fresh player order overrides a storage-full hold
      pendingFuelDeliveryVehicleId: null, // a fresh move order cancels a fuel delivery
      noPath: undefined, // a fresh order may open a new route
      targetPos: pos,
      targetBuildingId: targetBuildingId !== undefined ? targetBuildingId : null,
      targetBuildingName: targetBuildingName !== undefined ? targetBuildingName : null,
      searchProgress: 0,
      targetZombieId: null,
      state: 'moving',
    };
  });
}

export function orderSquadAttack(
  squads: TacticalSquadUnit[],
  squadId: string,
  zombieId: string,
  targetPos?: Point2D
): TacticalSquadUnit[] {
  return squads.map((s) => {
    if (s.squadId !== squadId) return s;
    return {
      ...s,
      manualOrder: true,
      holdHaul: false, // a fresh player order overrides a storage-full hold
      noPath: undefined, // a fresh order may open a new route
      targetZombieId: zombieId,
      targetPos: targetPos || s.targetPos,
      state: 'combat',
    };
  });
}

export function orderAllSquadsRecall(
  squads: TacticalSquadUnit[],
  hqPos: Point2D
): TacticalSquadUnit[] {
  return squads.map((s) => ({
    ...s,
    manualOrder: true,
    holdHaul: false, // a fresh player order overrides a storage-full hold
    pendingFuelDeliveryVehicleId: null, // a recall cancels a fuel delivery
    noPath: undefined, // a fresh order may open a new route
    targetPos: { x: hqPos.x, z: hqPos.z },
    targetZombieId: null,
    state: 'moving',
  }));
}

export function orderSquadRecall(
  squads: TacticalSquadUnit[],
  squadId: string,
  hqPos: Point2D
): TacticalSquadUnit[] {
  return squads.map((s) => {
    if (s.squadId !== squadId) return s;
    return {
      ...s,
      manualOrder: true,
      holdHaul: false, // a fresh player order overrides a storage-full hold
      pendingFuelDeliveryVehicleId: null, // a recall cancels a fuel delivery
      noPath: undefined, // a fresh order may open a new route
      targetPos: { x: hqPos.x, z: hqPos.z },
      targetZombieId: null,
      state: 'moving',
    };
  });
}

/**
 * Synchronize TacticalSquadUnits with settlement.squads
 */
export function syncTacticalSquadUnits(
  settlement: SettlementState,
  existingCombatSquads: TacticalSquadUnit[]
): TacticalSquadUnit[] {
  const hqPos = getPrimaryHQ(settlement)?.center || { x: 0, z: 0 };
  const existingMap = new Map<string, TacticalSquadUnit>(
    existingCombatSquads.map((s) => [s.squadId, s])
  );

  // Captured squads (§5.2) are held by a rival Hideout — no live tactical unit.
  return settlement.squads
    .filter((sq) => sq.status !== 'captured')
    .map((sq, index) => {
    // An empty leaderId marks a leaderless squad: all members are generic
    // recruits with no named survivor at the head. The tactical unit still gets
    // a nominal leader name/tier so stats code keeps working, but no leader
    // member is generated.
    const hasLeader = !!sq.leaderId;
    const leaderSurvivor = sq.leaderId
      ? settlement.namedSurvivors.find((ns) => ns.id === sq.leaderId)
      : undefined;
    const leaderName = leaderSurvivor ? leaderSurvivor.name : 'Field Leader';
    const leaderCombatTier: StatTier = leaderSurvivor ? leaderSurvivor.stats.combat : 'novice';

    const existing = existingMap.get(sq.id);
    if (existing) {
      // Keep real-time position/health and update composition. Refresh the member
      // roster to match settlement composition while preserving each unit's HP & gear.
      const desired = buildSquadMembers(sq.id, leaderName, sq.generalCount, hasLeader);
      const preserved = desired.map((d) => {
        const prev = existing.members.find(
          (m) => m.id === d.id || (m.isLeader && d.isLeader)
        );
        return prev
          ? {
              ...d,
              currentHp: Math.min(d.maxHp, prev.currentHp),
              weaponId: prev.weaponId,
              armorId: prev.armorId,
              isAlive: prev.isAlive,
              // Newly-generated members carry a fresh random face; existing members
              // keep the portrait assigned when the squad was first created.
              faceUrl: prev.faceUrl || d.faceUrl,
            }
          : d;
      });
      const updated = {
        ...existing,
        name: sq.name,
        leaderName,
        leaderCombatTier,
        generalCount: sq.generalCount,
        maxHp: 100 + sq.generalCount * 50,
        members: preserved,
      };
      return recomputeSquadHealth(recomputeSquadStats(updated));
    }

    // New squad spawned near HQ
    const spawnAngle = (index / Math.max(1, settlement.squads.length)) * Math.PI * 2;
    const spawnPos: Point2D = {
      x: hqPos.x + Math.cos(spawnAngle) * 12,
      z: hqPos.z + Math.sin(spawnAngle) * 12,
    };

    const newUnit = createTacticalSquadUnit(
      sq.id,
      sq.name,
      sq.leaderId,
      leaderName,
      leaderCombatTier,
      sq.generalCount,
      spawnPos,
      hasLeader,
      sq.trainingTier ?? 0
    );

    // §4.3 Apply weapon & armor loadouts chosen at muster time. The armory
    // deduction already happened in createSquad — here we just stamp the
    // gear on every member so the tactical unit reflects the correct loadout.
    const loadout = sq.weaponLoadout ?? 'knife';
    const armorLoadout = (sq as { armorLoadout?: string }).armorLoadout ?? 'none';
    if (loadout !== 'knife' || armorLoadout !== 'none') {
      newUnit.members = newUnit.members.map((m) => ({
        ...m,
        weaponId: loadout !== 'knife' ? (loadout as WeaponItemId) : m.weaponId,
        armorId:
          armorLoadout !== 'none' ? (armorLoadout as ArmorItemId) : m.armorId,
      }));
      return recomputeSquadStats(newUnit);
    }
    return newUnit;
  });
}

