import { TacticalSquadUnit } from '../../types/combat';
import { SettlementState } from '../../types/settlement';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../../data/functionalBuildings';
import { isBuildingOperational } from '../buildingOperational';
import { getPoweredBuildingIds } from '../powerService';

// ==========================================
// 0. Medical Treatment Constants (§5.3)
// ==========================================
// One in-game hour in simulation seconds (a game day is 600 s, so 25 s/hour).
/** In-game hour length in simulation seconds (600 s day / 24). */
export const MED_CARE_HOUR_SEC = 25;
/** Reference: each assigned nurse heals ONE admitted patient +0.1 HP/hour. */
export const MED_CARE_HP_PER_HOUR_PER_NURSE = 0.1;
/** Distance a wounded squad must stand inside a medical facility to be treated. */
export const MED_CARE_RADIUS_M = 18;

/** Per-facility medical snapshot used by {@link tickMedicalFacilityCare}. */
export interface MedicalFacilitySnapshot {
  buildingId: string | number;
  x: number;
  z: number;
  bedCapacity: number;
  nurses: number;
  powered: boolean;
}

/**
 * §5.3 Patient-care model (Medbay / Hospital / Infirmary):
 *
 * 1. **Beds** — each operational medical facility admits wounded members up
 *    to its bed capacity (`medicalProperties.bedCapacity`, falling back to
 *    the building's own capacity).
 * 2. **Assigned nurses** — every assigned worker attends ONE admitted
 *    patient at +0.1 HP per in-game hour. Fewer nurses than patients means
 *    the surplus patients lie in beds without treatment.
 * 3. **Patient queue** — wounded beyond the bed count wait outside the
 *    facility (FIFO in roster order) and heal only when a bed frees.
 *
 * Bed occupancy is tracked across squads for the tick so several squads
 * parked at one facility genuinely contend for capacity. Unstaffed or
 * bed-less facilities heal nobody. Pure function — the flat +6 HP/s
 * regeneration it replaces no longer exists anywhere.
 */
export function tickMedicalFacilityCare(
  squads: TacticalSquadUnit[],
  settlement: SettlementState,
  effectiveDelta: number
): TacticalSquadUnit[] {
  if (!squads.length || effectiveDelta <= 0) return squads;
  // §Terminus power grid: a powered hospital runs ICU equipment — its nurses
  // heal 50% faster. An unpowered hospital still performs basic emergency
  // care, but advanced treatment slows down.
  const poweredIds = settlement ? getPoweredBuildingIds(settlement) : new Set<string>();
  const facilities: MedicalFacilitySnapshot[] = [
    ...Array.from(settlement.adaptedBuildings.values()),
    ...(settlement.freestandingBuildings || []),
  ]
    .filter(
      (building) =>
        isBuildingOperational(building) &&
        (building.typeId === 'medbay' ||
          building.typeId === 'infirmary_clinic' ||
          building.typeId === 'hospital')
    )
    .map((building) => {
      const def = FUNCTIONAL_BUILDING_DEFINITIONS[building.typeId];
      return {
        buildingId: building.buildingId,
        x: building.position?.x ?? 0,
        z: building.position?.z ?? 0,
        bedCapacity: Math.max(
          0,
          Math.floor(def?.medicalProperties?.bedCapacity ?? building.maxCapacity ?? 0)
        ),
        nurses: Math.max(0, building.assignedWorkers || 0),
        powered: poweredIds.has(String(building.buildingId)),
      };
    });
  if (facilities.length === 0) return squads;

  const bedsUsed = new Map<string, number>();
  return squads.map((squad) => {
    if (!squad.members?.some((m) => m.isAlive)) return squad;
    const wounded = squad.members
      .map((m, idx) => ({ m, idx }))
      .filter((entry) => entry.m.isAlive && entry.m.currentHp < entry.m.maxHp);
    if (wounded.length === 0) return { ...squad, isInSafeZone: false };

    const near = facilities
      .map((fac) => ({ fac, dist: Math.hypot(squad.x - fac.x, squad.z - fac.z) }))
      .filter((entry) => entry.dist < MED_CARE_RADIUS_M)
      .sort((a, b) => a.dist - b.dist);
    if (near.length === 0) return { ...squad, isInSafeZone: false };

    let members = squad.members;
    let healedAny = false;
    let remaining = wounded;
    for (const { fac } of near) {
      if (remaining.length === 0) break;
      const key = String(fac.buildingId);
      const used = bedsUsed.get(key) || 0;
      const freeBeds = Math.max(0, fac.bedCapacity - used);
      if (freeBeds <= 0) continue;
      const taking = remaining.slice(0, freeBeds);
      remaining = remaining.slice(freeBeds);
      bedsUsed.set(key, used + taking.length);
      // One nurse attends one patient at +0.1 HP per in-game hour.
      const treatCount = Math.min(taking.length, fac.nurses);
      if (treatCount <= 0) continue;
      const healAmt =
        (MED_CARE_HP_PER_HOUR_PER_NURSE / MED_CARE_HOUR_SEC) * effectiveDelta * (fac.powered ? 1.5 : 1);
      for (let i = 0; i < treatCount; i++) {
        const entry = taking[i];
        const healed = {
          ...entry.m,
          currentHp: Math.min(entry.m.maxHp, entry.m.currentHp + healAmt),
        };
        members = members.slice();
        members[entry.idx] = healed;
        healedAny = true;
      }
    }
    if (!healedAny) return { ...squad, isInSafeZone: false };
    const currentHp = members.reduce((acc, m) => (m.isAlive ? acc + m.currentHp : acc), 0);
    // Under real treatment: bed occupied + nurse attending this tick.
    return { ...squad, members, currentHp, isInSafeZone: true };
  });
}

