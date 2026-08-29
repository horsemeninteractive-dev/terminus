import { BuildingCategory } from './map';
import { ArmorItemId, WeaponItemId } from './combat';

export type LootCategory =
  | 'food'
  | 'water'
  | 'medical'
  | 'fuel'
  | 'ammo'
  | 'materials'
  | 'weapon'
  | 'armor';

export interface LootItem {
  id: string;
  name: string;
  category: LootCategory;
  quantity: number;
  weightKg: number; // weight per single unit
  description: string;
  weaponId?: WeaponItemId;
  armorId?: ArmorItemId;
}

export interface SquadInventory {
  items: LootItem[];
  currentWeightKg: number;
  maxWeightKg: number;
}

export interface BuildingLootRecord {
  buildingId: string | number;
  buildingName: string;
  category: BuildingCategory;
  isSearched: boolean;
  searchedAt?: number;
  discoveredLoot: LootItem[];
  remainingLoot: LootItem[];
}

/**
 * Procedurally generates realistic, itemized loot based on real-world OSM building category
 */
export function generateBuildingLoot(
  category: BuildingCategory,
  buildingName: string = 'Building',
  areaM2: number = 100
): LootItem[] {
  const items: LootItem[] = [];
  const scale = Math.max(0.6, Math.min(2.5, areaM2 / 120));

  switch (category) {
    case 'supermarket':
    case 'restaurant':
      items.push({
        id: `food_canned_${Date.now()}_1`,
        name: 'Canned Meat & Stew',
        category: 'food',
        quantity: Math.round((8 + Math.floor(Math.random() * 12)) * scale),
        weightKg: 0.5,
        description: 'Preserved non-perishable canned food rations.',
      });
      items.push({
        id: `water_bottle_${Date.now()}_2`,
        name: 'Bottled Spring Water',
        category: 'water',
        quantity: Math.round((6 + Math.floor(Math.random() * 10)) * scale),
        weightKg: 1.0,
        description: 'Sealed clean mineral water bottles.',
      });
      if (Math.random() > 0.4) {
        items.push({
          id: `food_mre_${Date.now()}_3`,
          name: 'Packaged MRE Rations',
          category: 'food',
          quantity: Math.round((3 + Math.floor(Math.random() * 6)) * scale),
          weightKg: 0.8,
          description: 'High-calorie sealed military ration packs.',
        });
      }
      break;

    case 'pharmacy':
    case 'hospital':
      items.push({
        id: `med_firstaid_${Date.now()}_1`,
        name: 'Trauma First-Aid Kit',
        category: 'medical',
        quantity: Math.round((2 + Math.floor(Math.random() * 4)) * scale),
        weightKg: 1.2,
        description: 'Complete emergency surgical dressings, tourniquets, and antiseptic.',
      });
      items.push({
        id: `med_bandages_${Date.now()}_2`,
        name: 'Sterile Gauze & Bandages',
        category: 'medical',
        quantity: Math.round((5 + Math.floor(Math.random() * 8)) * scale),
        weightKg: 0.2,
        description: 'Essential field dressings for lacerations and bites.',
      });
      items.push({
        id: `med_antibiotics_${Date.now()}_3`,
        name: 'Broad-Spectrum Antibiotics',
        category: 'medical',
        quantity: Math.round((2 + Math.floor(Math.random() * 5)) * scale),
        weightKg: 0.3,
        description: 'Critical pharmaceutical drugs to suppress sepsis and fever.',
      });
      break;

    case 'police':
    case 'civic':
      items.push({
        id: `ammo_box_${Date.now()}_1`,
        name: '9mm & 12-Gauge Ammo Cache',
        category: 'ammo',
        quantity: Math.round((25 + Math.floor(Math.random() * 35)) * scale),
        weightKg: 0.1,
        description: 'Tactical firearm ammunition suitable for pistols and shotguns.',
      });
      if (Math.random() > 0.3) {
        const weaponChoices: WeaponItemId[] = ['pistol', 'shotgun', 'hunting_rifle'];
        const chosen = weaponChoices[Math.floor(Math.random() * weaponChoices.length)];
        items.push({
          id: `wpn_${chosen}_${Date.now()}`,
          name: chosen === 'shotgun' ? 'Pump-Action Shotgun' : chosen === 'hunting_rifle' ? 'Scoped Hunting Rifle' : 'Service Pistol',
          category: 'weapon',
          quantity: 1,
          weightKg: 3.5,
          weaponId: chosen,
          description: 'Working firearm recovered from armory lockers.',
        });
      }
      if (Math.random() > 0.5) {
        items.push({
          id: `arm_riot_${Date.now()}`,
          name: 'Riot Police Ballistic Vest',
          category: 'armor',
          quantity: 1,
          weightKg: 4.0,
          armorId: 'riot_vest',
          description: 'Tactical body armor providing bite and ballistic protection.',
        });
      }
      break;

    case 'gas_station':
    case 'industrial':
    case 'warehouse':
      items.push({
        id: `fuel_gas_${Date.now()}_1`,
        name: 'Jerrycan of Gasoline',
        category: 'fuel',
        quantity: Math.round((12 + Math.floor(Math.random() * 18)) * scale),
        weightKg: 0.8,
        description: 'Refined motor fuel for scouting vehicles and generators.',
      });
      items.push({
        id: `mat_scrap_${Date.now()}_2`,
        name: 'Industrial Scrap Metal',
        category: 'materials',
        quantity: Math.round((15 + Math.floor(Math.random() * 25)) * scale),
        weightKg: 1.0,
        description: 'Heavy structural steel, pipes, and mechanical parts.',
      });
      if (Math.random() > 0.4) {
        items.push({
          id: `mat_wood_${Date.now()}_3`,
          name: 'Milled Timber Planks',
          category: 'materials',
          quantity: Math.round((10 + Math.floor(Math.random() * 20)) * scale),
          weightKg: 1.0,
          description: 'Construction lumber salvaged from storage pallets.',
        });
      }
      break;

    case 'residential':
    default:
      items.push({
        id: `food_pantry_${Date.now()}_1`,
        name: 'Pantry Canned Food',
        category: 'food',
        quantity: Math.round((3 + Math.floor(Math.random() * 6)) * scale),
        weightKg: 0.5,
        description: 'Assorted household canned vegetables and soups.',
      });
      items.push({
        id: `water_tap_${Date.now()}_2`,
        name: 'Bottled Water Pack',
        category: 'water',
        quantity: Math.round((3 + Math.floor(Math.random() * 6)) * scale),
        weightKg: 1.0,
        description: 'Bottled drinking water recovered from residential kitchen.',
      });
      if (Math.random() > 0.4) {
        items.push({
          id: `med_home_${Date.now()}_3`,
          name: 'Home First-Aid Supplies',
          category: 'medical',
          quantity: Math.round((1 + Math.floor(Math.random() * 3)) * scale),
          weightKg: 0.4,
          description: 'Basic disinfectant, bandages, and pain relief pills.',
        });
      }
      if (Math.random() > 0.6) {
        items.push({
          id: `ammo_small_${Date.now()}_4`,
          name: 'Hunting Cartridges',
          category: 'ammo',
          quantity: Math.round((6 + Math.floor(Math.random() * 12)) * scale),
          weightKg: 0.1,
          description: 'Loose ammunition found in residential closet.',
        });
      }
      break;
  }

  return items;
}

/**
 * Calculates total weight of loot items
 */
export function calculateLootWeight(items: LootItem[]): number {
  return Math.round(
    items.reduce((sum, item) => sum + item.quantity * item.weightKg, 0) * 10
  ) / 10;
}
