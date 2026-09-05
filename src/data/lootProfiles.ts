import {
  LootProfile,
  LootProfileEntry,
  OSMLocationCategory,
  OSMLocationSubtype,
} from '../types/osmLocation';
import { ARMOR_CATALOG, ArmorItemId, WEAPON_CATALOG, WeaponItemId } from '../types/combat';

/**
 * Loot profiles keyed on the canonical OSM location classification.
 *
 * Every `label` below is a resource the existing scavenging deposit path
 * understands (see STOCKPILE_LOOT_LABELS and addLootToArmory in
 * scavengingService) — no new item/resource definitions are introduced.
 * Weapons/armor use the real WEAPON_CATALOG / ARMOR_CATALOG ids.
 */

type Spec = Pick<LootProfile, 'guaranteed' | 'pool' | 'minRolls' | 'maxRolls' | 'summary'>;

/** Resource entry: label must be a stockpile label understood by the deposit path. */
const R = (
  label: string,
  weight: number,
  minQuantity: number,
  maxQuantity: number,
  guaranteed = false
): LootProfileEntry => ({ kind: 'resource', label, weight, minQuantity, maxQuantity, guaranteed });

/** Weapon entry (quantity 1, real weapon id). */
const W = (id: WeaponItemId, weight: number): LootProfileEntry => ({
  kind: 'weapon',
  label: WEAPON_CATALOG[id].name,
  itemId: id,
  weight,
  minQuantity: 1,
  maxQuantity: 1,
});

/** Armor entry (quantity 1, real armor id). */
const A = (id: ArmorItemId, weight: number): LootProfileEntry => ({
  kind: 'armor',
  label: ARMOR_CATALOG[id].name,
  itemId: id,
  weight,
  minQuantity: 1,
  maxQuantity: 1,
});

export const CATEGORY_LOOT_PROFILES: Record<OSMLocationCategory, Spec> = {
  residential: {
    guaranteed: [R('canned_goods', 1, 1, 4, true), R('bottled_water', 1, 1, 3, true)],
    pool: [
      R('canned_goods', 10, 1, 4),
      R('bottled_water', 8, 1, 3),
      R('dried_rations', 3, 1, 2),
      R('first_aid_kits', 4, 1, 2),
      R('sterile_bandages', 3, 1, 3),
      R('painkillers', 2, 1, 2),
      R('tools', 4, 1, 3),
      R('wood', 4, 2, 6),
      R('scrap', 4, 2, 6),
      R('metal', 2, 1, 3),
      R('ammunition', 2, 2, 8),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Broad but low-grade household supplies with a small chance of hunting ammunition.',
  },

  food: {
    guaranteed: [R('canned_goods', 1, 2, 6, true), R('bottled_water', 1, 1, 4, true)],
    pool: [
      R('canned_goods', 10, 2, 8),
      R('dried_rations', 6, 2, 6),
      R('bottled_water', 6, 1, 5),
      R('first_aid_kits', 2, 1, 2),
      R('tools', 2, 1, 2),
      R('scrap', 2, 2, 5),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'General food retail: broad food/water pool, light on everything else.',
  },

  retail: {
    guaranteed: [R('canned_goods', 1, 1, 4, true), R('bottled_water', 1, 1, 3, true)],
    pool: [
      R('tools', 6, 1, 3),
      R('canned_goods', 6, 1, 5),
      R('scrap', 4, 2, 6),
      R('wood', 3, 2, 5),
      R('dried_rations', 3, 1, 3),
      R('first_aid_kits', 2, 1, 2),
      R('sterile_bandages', 2, 1, 3),
      R('metal', 2, 1, 3),
      R('ammunition', 1, 2, 6),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Generic retail: assorted consumer goods and shop stock.',
  },

  medical: {
    guaranteed: [
      R('first_aid_kits', 1, 1, 3, true),
      R('sterile_bandages', 1, 2, 6, true),
      R('antibiotics', 1, 1, 3, true),
    ],
    pool: [
      R('sterile_bandages', 10, 2, 8),
      R('first_aid_kits', 9, 1, 4),
      R('antibiotics', 8, 1, 4),
      R('painkillers', 8, 1, 5),
      R('canned_goods', 3, 1, 4),
      R('bottled_water', 3, 1, 3),
      R('tools', 1, 1, 2),
    ],
    minRolls: 2,
    maxRolls: 3,
    summary: 'Medical facility: strong medical supplies, little else.',
  },

  education: {
    guaranteed: [
      R('scientific_materials', 1, 1, 2, true),
      R('canned_goods', 1, 2, 5, true),
      R('bottled_water', 1, 1, 4, true),
    ],
    pool: [
      R('scientific_materials', 7, 1, 3),
      R('first_aid_kits', 4, 1, 3),
      R('sterile_bandages', 3, 1, 4),
      R('canned_goods', 6, 2, 6),
      R('dried_rations', 3, 1, 4),
      R('tools', 3, 1, 3),
      R('ammunition', 1, 2, 6),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'School/college: modest scientific materials with cafeteria supplies and infirmary basics.',
  },

  research: {
    guaranteed: [R('scientific_materials', 1, 2, 5, true)],
    pool: [
      R('scientific_materials', 10, 1, 6),
      R('tools', 6, 1, 4),
      R('metal', 4, 1, 4),
      R('scrap', 4, 2, 6),
      R('canned_goods', 3, 1, 4),
      R('bottled_water', 3, 1, 3),
      R('first_aid_kits', 3, 1, 3),
      R('sterile_bandages', 2, 1, 3),
      R('ammunition', 1, 2, 6),
    ],
    minRolls: 3,
    maxRolls: 5,
    summary: 'Research facility: the premier scientific-materials source.',
  },

  industrial: {
    guaranteed: [R('metal', 1, 4, 12, true), R('wood', 1, 3, 10, true)],
    pool: [
      R('metal', 9, 3, 14),
      R('scrap', 9, 3, 12),
      R('wood', 6, 3, 10),
      R('tools', 7, 1, 5),
      R('bricks', 4, 3, 10),
      R('logs', 4, 2, 8),
      R('gasoline', 3, 3, 10),
      R('canned_goods', 2, 1, 3),
      W('axe', 2),
    ],
    minRolls: 3,
    maxRolls: 5,
    summary: 'Heavy industry: metals, scrap, tools and mechanical parts.',
  },

  workshop: {
    guaranteed: [R('tools', 1, 1, 4, true)],
    pool: [
      R('tools', 10, 1, 5),
      R('metal', 8, 2, 8),
      R('scrap', 8, 2, 10),
      R('wood', 5, 2, 7),
      R('logs', 3, 2, 6),
      R('bricks', 2, 2, 6),
      R('gasoline', 3, 2, 8),
      R('canned_goods', 2, 1, 3),
      R('bottled_water', 2, 1, 3),
      W('axe', 1),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Workshop/hardware: tools and construction materials first, fuel second.',
  },

  vehicle: {
    guaranteed: [R('metal', 1, 2, 8, true)],
    pool: [
      R('metal', 9, 2, 10),
      R('scrap', 8, 2, 10),
      R('tools', 7, 1, 4),
      R('gasoline', 5, 2, 8),
      R('diesel', 4, 2, 6),
      R('wood', 3, 2, 6),
      R('canned_goods', 2, 1, 3),
      R('bottled_water', 2, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Vehicle-focused site: parts, scrap and fuel.',
  },

  fuel: {
    guaranteed: [R('gasoline', 1, 8, 20, true)],
    pool: [
      R('gasoline', 10, 6, 18),
      R('diesel', 8, 4, 14),
      R('canned_goods', 4, 1, 4),
      R('tools', 4, 1, 3),
      R('bottled_water', 3, 1, 3),
      R('scrap', 3, 2, 6),
      R('wood', 2, 2, 5),
      R('first_aid_kits', 2, 1, 2),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Fuel station: strong fuel yields — deliberately not piñata-sized.',
  },

  agriculture: {
    guaranteed: [R('wood', 1, 3, 8, true), R('tools', 1, 1, 3, true)],
    pool: [
      R('canned_goods', 6, 2, 6),
      R('dried_rations', 5, 2, 5),
      R('wood', 6, 3, 10),
      R('logs', 5, 2, 7),
      R('tools', 5, 1, 4),
      R('scrap', 4, 2, 7),
      R('metal', 3, 1, 4),
      R('gasoline', 3, 2, 8),
      R('bottled_water', 3, 1, 3),
      R('sterile_bandages', 2, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Farm/outbuilding: timber, tools and preserved stores.',
  },

  warehouse: {
    guaranteed: [R('metal', 1, 4, 12, true), R('wood', 1, 3, 10, true)],
    pool: [
      R('scrap', 9, 3, 14),
      R('metal', 8, 3, 12),
      R('wood', 7, 3, 10),
      R('tools', 7, 1, 5),
      R('bricks', 4, 3, 10),
      R('logs', 4, 2, 8),
      R('canned_goods', 3, 2, 6),
      R('gasoline', 3, 3, 10),
      R('dried_rations', 2, 1, 4),
    ],
    minRolls: 3,
    maxRolls: 5,
    summary: 'Storage/logistics: bulk materials and whatever the pallets held.',
  },

  office: {
    guaranteed: [R('canned_goods', 1, 1, 3, true), R('bottled_water', 1, 1, 3, true)],
    pool: [
      R('canned_goods', 6, 1, 4),
      R('bottled_water', 6, 1, 4),
      R('tools', 4, 1, 3),
      R('scrap', 3, 2, 6),
      R('first_aid_kits', 3, 1, 2),
      R('sterile_bandages', 2, 1, 2),
      R('scientific_materials', 2, 1, 2),
      R('dried_rations', 2, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Office block: breakroom food, desk tools, the occasional research record.',
  },

  government: {
    guaranteed: [R('canned_goods', 1, 1, 4, true), R('bottled_water', 1, 1, 3, true)],
    pool: [
      R('first_aid_kits', 5, 1, 3),
      R('sterile_bandages', 3, 1, 4),
      R('tools', 5, 1, 3),
      R('canned_goods', 5, 1, 5),
      R('scrap', 3, 2, 6),
      R('scientific_materials', 3, 1, 2),
      R('ammunition', 3, 4, 12),
      R('dried_rations', 2, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Public building: canteen stores, first aid and locked desk drawers.',
  },

  police: {
    guaranteed: [R('ammunition', 1, 10, 24, true)],
    pool: [
      R('ammunition', 10, 8, 20),
      W('pistol', 5),
      W('bat', 4),
      W('shotgun', 3),
      A('riot_vest', 4),
      A('padded_jacket', 3),
      R('first_aid_kits', 4, 1, 3),
      R('sterile_bandages', 3, 1, 4),
      R('canned_goods', 3, 1, 4),
      R('bottled_water', 2, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Police station: guaranteed ammunition; firearms/armor possible, never guaranteed.',
  },

  fire: {
    guaranteed: [
      R('first_aid_kits', 1, 1, 3, true),
      R('sterile_bandages', 1, 2, 6, true),
    ],
    pool: [
      W('axe', 6),
      R('tools', 6, 1, 4),
      R('metal', 4, 2, 8),
      R('wood', 3, 2, 6),
      R('first_aid_kits', 6, 1, 3),
      R('sterile_bandages', 5, 2, 6),
      R('canned_goods', 3, 1, 4),
      A('padded_jacket', 3),
      R('ammunition', 2, 4, 10),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Fire station: rescue gear, axes and medical kits.',
  },

  military: {
    guaranteed: [R('ammunition', 1, 14, 32, true)],
    pool: [
      R('ammunition', 10, 10, 28),
      W('pistol', 5),
      W('shotgun', 4),
      W('assault_rifle', 3),
      W('sniper_rifle', 1),
      W('heavy_machine_gun', 1),
      A('tactical_gear', 4),
      A('riot_vest', 4),
      R('first_aid_kits', 4, 1, 4),
      R('sterile_bandages', 3, 2, 6),
      R('canned_goods', 3, 2, 6),
      R('dried_rations', 3, 1, 4),
      W('axe', 1),
    ],
    minRolls: 3,
    maxRolls: 5,
    summary: 'Military facility: heavy ammunition, better firearms and tactical armor.',
  },

  religious: {
    guaranteed: [R('canned_goods', 1, 2, 5, true), R('bottled_water', 1, 1, 4, true)],
    pool: [
      R('canned_goods', 8, 2, 6),
      R('dried_rations', 5, 1, 4),
      R('bottled_water', 5, 1, 4),
      R('first_aid_kits', 4, 1, 3),
      R('sterile_bandages', 3, 1, 4),
      R('tools', 3, 1, 3),
      R('wood', 3, 2, 6),
      R('scrap', 2, 2, 5),
      R('scientific_materials', 1, 1, 2),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Place of worship: food-bank stores and community supplies.',
  },

  entertainment: {
    guaranteed: [R('bottled_water', 1, 1, 4, true)],
    pool: [
      R('canned_goods', 6, 1, 4),
      R('dried_rations', 4, 1, 4),
      R('bottled_water', 5, 1, 4),
      R('first_aid_kits', 4, 1, 2),
      R('sterile_bandages', 3, 1, 3),
      R('tools', 3, 1, 3),
      R('scrap', 2, 2, 6),
    ],
    minRolls: 2,
    maxRolls: 3,
    summary: 'Venue: concession food, first aid and light hardware.',
  },

  hospitality: {
    guaranteed: [R('canned_goods', 1, 1, 4, true), R('bottled_water', 1, 2, 6, true)],
    pool: [
      R('canned_goods', 6, 1, 5),
      R('dried_rations', 4, 1, 4),
      R('bottled_water', 7, 2, 6),
      R('first_aid_kits', 5, 1, 3),
      R('sterile_bandages', 3, 1, 4),
      R('tools', 3, 1, 3),
      R('scrap', 2, 2, 5),
      R('scientific_materials', 1, 1, 2),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Hotel/lodging: housekeeping stores, bottled water and guest food.',
  },

  museum: {
    guaranteed: [
      R('scientific_materials', 1, 1, 3, true),
      R('canned_goods', 1, 1, 3, true),
    ],
    pool: [
      R('scientific_materials', 8, 1, 4),
      R('tools', 5, 1, 3),
      R('metal', 3, 1, 4),
      R('scrap', 3, 2, 6),
      R('first_aid_kits', 3, 1, 3),
      R('canned_goods', 4, 1, 4),
      R('bottled_water', 3, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Museum/archive: research-worthy records plus café and maintenance stores.',
  },

  transport: {
    guaranteed: [R('canned_goods', 1, 1, 3, true), R('bottled_water', 1, 1, 3, true)],
    pool: [
      R('tools', 6, 1, 4),
      R('scrap', 5, 2, 8),
      R('metal', 4, 2, 7),
      R('canned_goods', 5, 1, 4),
      R('dried_rations', 3, 1, 3),
      R('first_aid_kits', 3, 1, 2),
      R('gasoline', 3, 2, 8),
      R('bottled_water', 4, 1, 4),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Transit hub: lockers, kiosks and maintenance stores.',
  },

  construction: {
    guaranteed: [R('wood', 1, 3, 9, true), R('metal', 1, 2, 8, true)],
    pool: [
      R('wood', 8, 3, 12),
      R('metal', 7, 2, 10),
      R('bricks', 6, 3, 12),
      R('tools', 6, 1, 4),
      R('logs', 5, 2, 8),
      R('scrap', 4, 2, 8),
      R('gasoline', 3, 2, 8),
      R('canned_goods', 1, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Construction site: raw building materials and tools.',
  },

  generic_commercial: {
    guaranteed: [R('canned_goods', 1, 1, 4, true), R('bottled_water', 1, 1, 3, true)],
    pool: [
      R('canned_goods', 6, 1, 5),
      R('tools', 5, 1, 3),
      R('scrap', 4, 2, 6),
      R('bottled_water', 4, 1, 3),
      R('first_aid_kits', 3, 1, 2),
      R('dried_rations', 2, 1, 3),
      R('metal', 2, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 3,
    summary: 'Mixed commercial premises: general stock, no specialist bias.',
  },

  generic_public: {
    guaranteed: [R('canned_goods', 1, 1, 3, true), R('bottled_water', 1, 1, 3, true)],
    pool: [
      R('first_aid_kits', 5, 1, 3),
      R('sterile_bandages', 4, 1, 4),
      R('canned_goods', 5, 1, 4),
      R('tools', 4, 1, 3),
      R('bottled_water', 4, 1, 3),
      R('scrap', 3, 2, 6),
      R('scientific_materials', 1, 1, 2),
    ],
    minRolls: 2,
    maxRolls: 3,
    summary: 'Generic public building: utility supplies and first aid.',
  },

  unknown: {
    guaranteed: [R('canned_goods', 1, 1, 3, true), R('bottled_water', 1, 1, 2, true)],
    pool: [
      R('canned_goods', 6, 1, 4),
      R('bottled_water', 5, 1, 3),
      R('tools', 4, 1, 3),
      R('wood', 4, 2, 6),
      R('scrap', 4, 2, 6),
      R('first_aid_kits', 3, 1, 2),
      R('sterile_bandages', 2, 1, 3),
      R('ammunition', 1, 2, 6),
      R('metal', 1, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 3,
    summary: 'Unclassified building: generic low-value general supplies.',
  },
};

/**
 * Subtype refinements on top of the category default. Each entry REPLACES the
 * category default entirely — subtypes without an entry use their category.
 */
export const SUBTYPE_LOOT_PROFILES: Partial<Record<OSMLocationSubtype, Spec>> = {
  // ---- Education: scientific materials scale with institution tier ----
  school: {
    guaranteed: [
      R('scientific_materials', 1, 1, 2, true),
      R('canned_goods', 1, 2, 6, true),
      R('bottled_water', 1, 1, 4, true),
      R('sterile_bandages', 1, 1, 4, true),
    ],
    pool: [
      R('scientific_materials', 6, 1, 3),
      R('canned_goods', 6, 2, 6),
      R('first_aid_kits', 5, 1, 3),
      R('tools', 4, 1, 3),
      R('dried_rations', 3, 1, 3),
      R('ammunition', 1, 2, 6),
    ],
    minRolls: 2,
    maxRolls: 3,
    summary: 'School: guaranteed modest scientific materials; office & cafeteria basics.',
  },
  kindergarten: {
    guaranteed: [
      R('scientific_materials', 1, 1, 1, true),
      R('canned_goods', 1, 1, 4, true),
      R('bottled_water', 1, 1, 3, true),
    ],
    pool: [
      R('canned_goods', 7, 1, 5),
      R('first_aid_kits', 6, 1, 3),
      R('sterile_bandages', 4, 1, 4),
      R('scientific_materials', 3, 1, 2),
      R('tools', 3, 1, 2),
    ],
    minRolls: 1,
    maxRolls: 3,
    summary: 'Kindergarten: light education stores and plentiful childrens supplies.',
  },
  college: {
    guaranteed: [
      R('scientific_materials', 1, 1, 3, true),
      R('canned_goods', 1, 2, 6, true),
    ],
    pool: [
      R('scientific_materials', 9, 1, 4),
      R('canned_goods', 5, 2, 6),
      R('first_aid_kits', 4, 1, 3),
      R('tools', 4, 1, 3),
      R('bottled_water', 4, 1, 4),
      R('dried_rations', 3, 1, 3),
      R('ammunition', 1, 2, 6),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'College: stronger scientific materials than a school.',
  },
  university: {
    guaranteed: [R('scientific_materials', 1, 1, 4, true)],
    pool: [
      R('scientific_materials', 10, 1, 5),
      R('tools', 6, 1, 4),
      R('canned_goods', 5, 1, 5),
      R('first_aid_kits', 4, 1, 3),
      R('bottled_water', 4, 1, 4),
      R('metal', 3, 1, 4),
      R('scrap', 3, 2, 6),
      R('scientific_materials', 0, 1, 3), // placeholder weight never drawn; kept for readability
    ],
    minRolls: 3,
    maxRolls: 5,
    summary: 'University: high scientific materials plus lab/workshop hardware.',
  },
  library: {
    guaranteed: [R('scientific_materials', 1, 1, 3, true)],
    pool: [
      R('scientific_materials', 8, 1, 4),
      R('canned_goods', 3, 1, 4),
      R('tools', 3, 1, 3),
      R('first_aid_kits', 2, 1, 2),
      R('sterile_bandages', 2, 1, 3),
      R('bottled_water', 3, 1, 3),
      R('scrap', 2, 2, 5),
    ],
    minRolls: 2,
    maxRolls: 3,
    summary: 'Library: moderate/high scientific materials, little food or medical.',
  },

  // ---- Research ----
  research_institute: {
    guaranteed: [R('scientific_materials', 1, 2, 6, true)],
    pool: [
      R('scientific_materials', 12, 2, 6),
      R('tools', 6, 1, 5),
      R('metal', 5, 1, 5),
      R('scrap', 3, 2, 6),
      R('first_aid_kits', 3, 1, 3),
      R('canned_goods', 2, 1, 3),
      R('bottled_water', 2, 1, 3),
    ],
    minRolls: 3,
    maxRolls: 5,
    summary: 'Research institute: the strongest scientific-materials source in the game.',
  },
  laboratory: {
    guaranteed: [R('scientific_materials', 1, 2, 5, true)],
    pool: [
      R('scientific_materials', 11, 1, 6),
      R('tools', 6, 1, 4),
      R('metal', 4, 1, 4),
      R('first_aid_kits', 3, 1, 3),
      R('sterile_bandages', 3, 1, 4),
      R('scrap', 3, 2, 5),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Laboratory: concentrated scientific materials and instruments.',
  },

  // ---- Medical ----
  hospital: {
    guaranteed: [
      R('first_aid_kits', 1, 2, 5, true),
      R('sterile_bandages', 1, 4, 10, true),
      R('antibiotics', 1, 2, 5, true),
      R('painkillers', 1, 2, 5, true),
    ],
    pool: [
      R('first_aid_kits', 8, 2, 6),
      R('sterile_bandages', 8, 4, 12),
      R('antibiotics', 7, 2, 6),
      R('painkillers', 7, 2, 6),
      R('canned_goods', 3, 2, 5),
      R('tools', 2, 1, 3),
      R('scientific_materials', 2, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 3,
    summary: 'Hospital: the strongest medical loot with high quantities.',
  },
  clinic: {
    guaranteed: [
      R('first_aid_kits', 1, 1, 3, true),
      R('sterile_bandages', 1, 2, 6, true),
    ],
    pool: [
      R('sterile_bandages', 9, 2, 8),
      R('first_aid_kits', 8, 1, 4),
      R('antibiotics', 7, 1, 4),
      R('painkillers', 6, 1, 4),
      R('canned_goods', 2, 1, 3),
      R('bottled_water', 2, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 3,
    summary: 'Clinic/doctors office: between a pharmacy and a hospital.',
  },
  pharmacy: {
    guaranteed: [
      R('painkillers', 1, 2, 5, true),
      R('sterile_bandages', 1, 2, 6, true),
    ],
    pool: [
      R('antibiotics', 9, 2, 6),
      R('painkillers', 9, 2, 6),
      R('first_aid_kits', 7, 1, 4),
      R('sterile_bandages', 7, 2, 8),
      R('canned_goods', 2, 1, 3),
      R('bottled_water', 2, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 3,
    summary: 'Pharmacy: overwhelmingly medicines and medical supplies.',
  },
  ambulance_station: {
    guaranteed: [
      R('first_aid_kits', 1, 2, 5, true),
      R('sterile_bandages', 1, 3, 8, true),
    ],
    pool: [
      R('first_aid_kits', 9, 2, 5),
      R('sterile_bandages', 8, 3, 9),
      R('antibiotics', 6, 2, 5),
      R('painkillers', 5, 1, 4),
      R('tools', 3, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 3,
    summary: 'Ambulance station: emergency medical kits in bulk.',
  },

  // ---- Food subtypes ----
  supermarket: {
    guaranteed: [R('canned_goods', 1, 4, 10, true), R('bottled_water', 1, 3, 8, true)],
    pool: [
      R('canned_goods', 9, 4, 12),
      R('dried_rations', 7, 3, 8),
      R('bottled_water', 6, 3, 8),
      R('first_aid_kits', 3, 1, 3),
      R('tools', 2, 1, 3),
      R('scrap', 2, 2, 6),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Supermarket: broad food pool with high quantities.',
  },
  convenience_store: {
    guaranteed: [R('canned_goods', 1, 2, 6, true), R('bottled_water', 1, 2, 6, true)],
    pool: [
      R('canned_goods', 9, 2, 7),
      R('bottled_water', 8, 2, 6),
      R('dried_rations', 5, 1, 5),
      R('first_aid_kits', 2, 1, 2),
      R('tools', 2, 1, 2),
    ],
    minRolls: 1,
    maxRolls: 3,
    summary: 'Corner store: quick food and drink, lower variety.',
  },
  bakery: {
    guaranteed: [R('dried_rations', 1, 2, 6, true)],
    pool: [
      R('dried_rations', 9, 2, 8),
      R('canned_goods', 5, 2, 6),
      R('bottled_water', 4, 1, 4),
      R('first_aid_kits', 1, 1, 2),
    ],
    minRolls: 1,
    maxRolls: 3,
    summary: 'Bakery: strong food, narrow variety.',
  },
  butcher: {
    guaranteed: [R('canned_goods', 1, 2, 7, true)],
    pool: [
      R('canned_goods', 9, 2, 9),
      R('dried_rations', 4, 1, 5),
      R('tools', 3, 1, 3),
      R('metal', 2, 1, 3),
      R('bottled_water', 2, 1, 3),
    ],
    minRolls: 1,
    maxRolls: 3,
    summary: 'Butcher: preserved meat and cleavers/professional knives.',
  },
  restaurant: {
    guaranteed: [R('dried_rations', 1, 2, 5, true), R('bottled_water', 1, 1, 4, true)],
    pool: [
      R('dried_rations', 8, 2, 6),
      R('canned_goods', 6, 2, 6),
      R('bottled_water', 5, 1, 5),
      R('first_aid_kits', 2, 1, 2),
      R('tools', 2, 1, 2),
      R('scrap', 1, 2, 4),
    ],
    minRolls: 2,
    maxRolls: 3,
    summary: 'Restaurant: kitchen stores, water and light tools.',
  },
  cafe: {
    guaranteed: [R('dried_rations', 1, 1, 4, true), R('bottled_water', 1, 1, 3, true)],
    pool: [
      R('canned_goods', 6, 1, 5),
      R('dried_rations', 6, 1, 5),
      R('bottled_water', 5, 1, 4),
      R('first_aid_kits', 2, 1, 2),
    ],
    minRolls: 1,
    maxRolls: 2,
    summary: 'Café: modest food and drink.',
  },
  fast_food: {
    guaranteed: [R('canned_goods', 1, 1, 5, true)],
    pool: [
      R('canned_goods', 8, 1, 6),
      R('dried_rations', 5, 1, 5),
      R('bottled_water', 4, 1, 4),
      R('tools', 2, 1, 2),
      R('first_aid_kits', 1, 1, 2),
    ],
    minRolls: 1,
    maxRolls: 3,
    summary: 'Fast-food outlet: frozen/processed store-room food.',
  },
  pub: {
    guaranteed: [R('canned_goods', 1, 1, 4, true), R('bottled_water', 1, 1, 3, true)],
    pool: [
      R('canned_goods', 7, 1, 5),
      R('dried_rations', 4, 1, 4),
      R('bottled_water', 5, 1, 4),
      R('first_aid_kits', 2, 1, 2),
      R('tools', 2, 1, 2),
    ],
    minRolls: 1,
    maxRolls: 3,
    summary: 'Pub/bar: dry goods behind the bar, some water.',
  },
  bar: {
    guaranteed: [R('canned_goods', 1, 1, 3, true), R('bottled_water', 1, 1, 3, true)],
    pool: [
      R('canned_goods', 6, 1, 4),
      R('bottled_water', 6, 1, 4),
      R('first_aid_kits', 2, 1, 2),
    ],
    minRolls: 1,
    maxRolls: 2,
    summary: 'Bar: limited food stores.',
  },

  // ---- Retail ----
  bookshop: {
    guaranteed: [R('scientific_materials', 1, 1, 3, true)],
    pool: [
      R('scientific_materials', 7, 1, 4),
      R('canned_goods', 3, 1, 4),
      R('tools', 3, 1, 3),
      R('bottled_water', 3, 1, 3),
    ],
    minRolls: 1,
    maxRolls: 3,
    summary: 'Bookshop: reference stock doubles as research material.',
  },

  // ---- Workshop / vehicle ----
  hardware_store: {
    guaranteed: [R('tools', 1, 1, 5, true)],
    pool: [
      R('tools', 10, 1, 6),
      R('metal', 7, 2, 9),
      R('wood', 6, 2, 9),
      R('bricks', 3, 2, 8),
      R('scrap', 3, 2, 8),
      R('logs', 3, 1, 6),
      R('gasoline', 2, 2, 7),
      R('canned_goods', 2, 1, 3),
      W('axe', 1),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Hardware store: tools and construction materials in bulk.',
  },
  car_repair: {
    guaranteed: [R('metal', 1, 2, 8, true), R('tools', 1, 1, 4, true)],
    pool: [
      R('metal', 9, 2, 10),
      R('scrap', 8, 2, 10),
      R('tools', 8, 1, 5),
      R('gasoline', 4, 2, 8),
      R('diesel', 3, 2, 6),
      R('wood', 3, 2, 6),
      R('canned_goods', 2, 1, 3),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Garage/mechanic: parts, metal, tools and fuel.',
  },
  garage: {
    guaranteed: [R('tools', 1, 1, 3, true)],
    pool: [
      R('wood', 7, 2, 7),
      R('tools', 6, 1, 4),
      R('metal', 5, 1, 5),
      R('scrap', 5, 2, 7),
      R('canned_goods', 2, 1, 3),
      R('gasoline', 2, 1, 5),
    ],
    minRolls: 1,
    maxRolls: 3,
    summary: 'Garage/outbuilding: tools, timber and household odds and ends.',
  },

  // ---- Warehouse / industrial ----
  storage_depot: {
    guaranteed: [R('metal', 1, 3, 10, true), R('wood', 1, 2, 8, true)],
    pool: [
      R('scrap', 8, 3, 12),
      R('wood', 6, 3, 10),
      R('metal', 6, 3, 10),
      R('tools', 5, 1, 4),
      R('canned_goods', 3, 2, 6),
      R('dried_rations', 2, 1, 4),
      R('bricks', 3, 2, 8),
    ],
    minRolls: 2,
    maxRolls: 4,
    summary: 'Storage depot: mixed pallet goods and materials.',
  },
  factory: {
    guaranteed: [R('metal', 1, 4, 14, true), R('wood', 1, 2, 8, true)],
    pool: [
      R('scrap', 9, 3, 14),
      R('metal', 8, 3, 14),
      R('tools', 6, 1, 5),
      R('wood', 5, 2, 8),
      R('gasoline', 3, 2, 8),
      R('bricks', 2, 2, 8),
      W('axe', 1),
    ],
    minRolls: 3,
    maxRolls: 5,
    summary: 'Factory: heavy industrial materials and machine tools.',
  },
};

export type LootProfileSpec = Spec;

/** Builds the effective profile for a resolved location (subtype override or category default). */
export function getLootProfileForLocation(location: {
  category: OSMLocationCategory;
  subtype?: OSMLocationSubtype;
}): LootProfile {
  const category = CATEGORY_LOOT_PROFILES[location.category] ?? CATEGORY_LOOT_PROFILES.unknown;
  const spec =
    (location.subtype && SUBTYPE_LOOT_PROFILES[location.subtype]) || category;
  return {
    category: location.category,
    subtype: location.subtype,
    guaranteed: spec.guaranteed,
    pool: spec.pool,
    minRolls: spec.minRolls,
    maxRolls: spec.maxRolls,
    summary: spec.summary,
  };
}
