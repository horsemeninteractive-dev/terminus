import {
  WeaponItemId,
  getWeaponDefinition,
} from '../../types/combat';
import { AdaptedBuilding, SettlementState, SettlementStockpile } from '../../types/settlement';
import { getCanonicalDefenseDef } from '../../data/functionalBuildings';
import { getPrimaryAdaptedEntry } from '../buildingOperational';

// ==========================================
// §IFZ Scrapyard economy — spent ammunition brass.
// ==========================================
/** Fraction of fired ammunition whose spent brass/casings become scrap metal
 *  (the physical shell is reusable — a staffed Scrapyard recycles it). */
export const SPENT_AMMO_SCRAP_RATIO = 0.15;

/** Returns the stockpile with the fired round's brass added as scrap. Waste
 *  accumulates regardless of organized storage — it is rubbish in the yard. */
export function recycleSpentAmmoToScrap(
  stockpile: SettlementStockpile,
  ammoConsumed: number
): SettlementStockpile {
  const brass = Math.floor(ammoConsumed * SPENT_AMMO_SCRAP_RATIO);
  if (brass <= 0) return stockpile;
  return {
    ...stockpile,
    materials: {
      ...stockpile.materials,
      scrap: (stockpile.materials.scrap || 0) + brass,
    },
  };
}

// ==========================================
// 7. Building Repair & Material Cost Logic (§5)
// ==========================================

export function calculateBuildingRepairCost(building: AdaptedBuilding): {
  woodCost: number;
  metalCost: number;
  bricksCost: number;
  canRepair: boolean;
  missingHp: number;
} {
  const missingHp = building.maxDurability - building.currentDurability;
  if (missingHp <= 0) {
    return { woodCost: 0, metalCost: 0, bricksCost: 0, canRepair: false, missingHp: 0 };
  }

  const damageRatio = missingHp / building.maxDurability;
  const woodCost = Math.max(2, Math.round(15 * damageRatio));
  const metalCost = Math.max(1, Math.round(10 * damageRatio));
  const bricksCost = Math.max(1, Math.round(8 * damageRatio));

  return {
    woodCost,
    metalCost,
    bricksCost,
    canRepair: true,
    missingHp,
  };
}

export function repairBuilding(
  settlement: SettlementState,
  buildingId: string | number
): { success: boolean; newState: SettlementState; error?: string; repairedHp?: number } {
  const adapted = getPrimaryAdaptedEntry(settlement.adaptedBuildings, buildingId);
  const freestanding = settlement.freestandingBuildings.find((building) => building.buildingId === buildingId);
  const target = adapted || freestanding;
  if (!target) {
    return { success: false, newState: settlement, error: 'Building not found.' };
  }

  const cost = calculateBuildingRepairCost(target);
  if (!cost.canRepair) {
    return { success: false, newState: settlement, error: 'Structure is already at 100% durability.' };
  }

  const stock = settlement.stockpile.materials;
  if (stock.wood < cost.woodCost || stock.metal < cost.metalCost || stock.bricks < cost.bricksCost) {
    return {
      success: false,
      newState: settlement,
      error: `Insufficient materials for repair. Required: ${cost.woodCost} Wood, ${cost.metalCost} Metal, ${cost.bricksCost} Bricks.`,
    };
  }

  // Deduct materials and create a worker-driven repair order. The structure
  // remains non-functional until the repair crew completes the work.
  const newStockpile = {
    ...settlement.stockpile,
    materials: {
      ...stock,
      wood: stock.wood - cost.woodCost,
      metal: stock.metal - cost.metalCost,
      bricks: stock.bricks - cost.bricksCost,
    },
  };

  const missingHp = cost.missingHp;
  const repairWorkRequired = Math.max(20, missingHp);
  const updatedBuilding: AdaptedBuilding = {
    ...target,
    isUnderRepair: true,
    repairProgress: 0,
    repairWorkRequired,
    repairWorkDone: 0,
  };

  const newAdapted = new Map(settlement.adaptedBuildings);
  const newFreestanding = [...settlement.freestandingBuildings];
  if (adapted) newAdapted.set(buildingId, updatedBuilding);
  else {
    const index = newFreestanding.findIndex((building) => building.buildingId === buildingId);
    if (index >= 0) newFreestanding[index] = updatedBuilding;
  }

  return {
    success: true,
    newState: {
      ...settlement,
      stockpile: newStockpile,
      adaptedBuildings: newAdapted,
      freestandingBuildings: newFreestanding,
    },
    repairedHp: cost.missingHp,
  };
}

/**
 * Player-facing tower armament workflow: moves a ranged weapon from the colony
 * armory into a weaponMountable structure (towers) or returns the mounted
 * weapon back to the armory. Mirrors squad-member assignment semantics — one
 * weapon, removed from the shared armory while equipped. Only weapons that can
 * actually fire (ammoPerVolley > 0) can be mounted; melee is rejected.
 */
export function equipBuildingWeapon(
  settlement: SettlementState,
  buildingId: string | number,
  weaponId: WeaponItemId | null
): { success: boolean; newState: SettlementState; error?: string } {
  const freestandingIdx = settlement.freestandingBuildings.findIndex(
    (f) => String(f.buildingId) === String(buildingId)
  );
  const freestanding =
    freestandingIdx >= 0 ? settlement.freestandingBuildings[freestandingIdx] : null;
  const adapted =
    freestanding || getPrimaryAdaptedEntry(settlement.adaptedBuildings, buildingId);
  const building = adapted;
  if (!building) {
    return { success: false, newState: settlement, error: 'Structure not found.' };
  }

  const def = getCanonicalDefenseDef(building.typeId);
  if (!def?.weaponMountable) {
    return {
      success: false,
      newState: settlement,
      error: 'This structure cannot mount a weapon — only towers can be armed.',
    };
  }
  if (building.constructionStatus !== 'completed') {
    return {
      success: false,
      newState: settlement,
      error: 'The tower must be fully built before a weapon can be mounted.',
    };
  }

  const armory = settlement.armory || { weapons: [], armor: [] };
  const equipped = building.equippedWeaponId;

  if (weaponId === null) {
    // Unequip: return the mounted weapon to the armory stockpile.
    if (!equipped) {
      return { success: false, newState: settlement, error: 'No weapon is mounted on this tower.' };
    }
    const updated: AdaptedBuilding = { ...building, equippedWeaponId: undefined };
    return {
      success: true,
      newState: {
        ...settlement,
        armory: { ...armory, weapons: [...armory.weapons, equipped] },
        ...applyBuildingUpdate(settlement, updated),
      },
    };
  }

  const weaponDef = getWeaponDefinition(weaponId);
  if (!weaponDef || weaponDef.ammoPerVolley <= 0) {
    return { success: false, newState: settlement, error: 'Only ranged firearms can be mounted on a tower.' };
  }
  if (equipped === weaponId) {
    return { success: false, newState: settlement, error: 'This tower already carries that weapon.' };
  }
  if (!armory.weapons.includes(weaponId)) {
    return { success: false, newState: settlement, error: 'That weapon is not in the colony armory.' };
  }

  // Remove the chosen weapon from the armory; a previously mounted weapon goes back.
  const newWeapons = armory.weapons.filter((w) => w !== weaponId);
  if (equipped) newWeapons.push(equipped);
  const updated: AdaptedBuilding = { ...building, equippedWeaponId: weaponId };

  return {
    success: true,
    newState: {
      ...settlement,
      armory: { ...armory, weapons: newWeapons },
      ...applyBuildingUpdate(settlement, updated),
    },
  };
}

/** Internal: writes an updated building record back into whichever collection
 *  (freestanding or adapted) it came from. */
function applyBuildingUpdate(
  settlement: SettlementState,
  updated: AdaptedBuilding
): Pick<SettlementState, 'freestandingBuildings' | 'adaptedBuildings'> {
  const idx = settlement.freestandingBuildings.findIndex(
    (f) => String(f.buildingId) === String(updated.buildingId)
  );
  if (idx >= 0) {
    const list = [...settlement.freestandingBuildings];
    list[idx] = updated;
    return { freestandingBuildings: list, adaptedBuildings: settlement.adaptedBuildings };
  }
  const map = new Map(settlement.adaptedBuildings);
  const key =
    settlement.adaptedBuildings.has(updated.buildingId)
      ? updated.buildingId
      : (() => {
          for (const [k, v] of settlement.adaptedBuildings.entries()) {
            if (String(v.sourceBuildingId) === String(updated.buildingId)) return k;
          }
          return updated.buildingId;
        })();
  map.set(key, updated);
  return { freestandingBuildings: settlement.freestandingBuildings, adaptedBuildings: map };
}

