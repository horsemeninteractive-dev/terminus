import { ArmorItemId, WeaponItemId } from './combat';

/**
 * Canonical Terminus location classification — the gameplay-facing layer that
 * OSM tags resolve into (richer than the coarse BuildingCategory used for map
 * rendering/adaptation). Loot profiles are keyed on these categories.
 */
export type OSMLocationCategory =
  | 'residential'
  | 'food'
  | 'retail'
  | 'medical'
  | 'education'
  | 'research'
  | 'industrial'
  | 'workshop'
  | 'vehicle'
  | 'fuel'
  | 'agriculture'
  | 'warehouse'
  | 'office'
  | 'government'
  | 'police'
  | 'fire'
  | 'military'
  | 'religious'
  | 'entertainment'
  | 'hospitality'
  | 'museum'
  | 'transport'
  | 'construction'
  | 'generic_commercial'
  | 'generic_public'
  | 'unknown';

/**
 * Secondary classification retaining the specific real-world function when OSM
 * is detailed enough (school vs university vs library differ in loot odds).
 */
export type OSMLocationSubtype =
  // education
  | 'school'
  | 'college'
  | 'university'
  | 'kindergarten'
  | 'library'
  // research
  | 'research_institute'
  | 'laboratory'
  // medical
  | 'hospital'
  | 'clinic'
  | 'pharmacy'
  | 'dentist'
  | 'veterinary'
  | 'nursing_home'
  | 'ambulance_station'
  // food
  | 'supermarket'
  | 'convenience_store'
  | 'grocery'
  | 'bakery'
  | 'butcher'
  | 'greengrocer'
  | 'deli'
  | 'seafood'
  | 'restaurant'
  | 'cafe'
  | 'fast_food'
  | 'food_court'
  | 'pub'
  | 'bar'
  // retail
  | 'department_store'
  | 'clothing_store'
  | 'electronics_store'
  | 'general_store'
  | 'bookshop'
  // workshop / vehicle
  | 'hardware_store'
  | 'car_repair'
  | 'mechanics'
  | 'garage'
  | 'car_dealership'
  | 'car_parts'
  | 'car_wash'
  // fuel
  | 'fuel_station'
  | 'charging_station'
  // agriculture
  | 'farm'
  | 'farm_building'
  | 'greenhouse'
  // warehouse / industrial
  | 'warehouse'
  | 'storage_depot'
  | 'silo'
  | 'factory'
  | 'mill'
  | 'foundry'
  | 'power_plant'
  | 'water_works'
  | 'wastewater_plant'
  | 'substation'
  | 'quarry'
  // office / government
  | 'office'
  | 'townhall'
  | 'courthouse'
  | 'post_office'
  | 'government_office'
  | 'embassy'
  // police / fire / military
  | 'police'
  | 'prison'
  | 'fire_station'
  | 'barracks'
  // religious / entertainment / hospitality / museum
  | 'place_of_worship'
  | 'theatre'
  | 'cinema'
  | 'arts_centre'
  | 'sports_hall'
  | 'hotel'
  | 'motel'
  | 'hostel'
  | 'guest_house'
  | 'campsite'
  | 'museum'
  // transport / construction
  | 'bus_station'
  | 'train_station'
  | 'airport'
  | 'harbour'
  | 'station'
  | 'parking'
  | 'construction_site';

export type LocationConfidence = 'high' | 'medium' | 'low';

/** A canonical category plus its (optional) specific subtype. */
export interface LocationSpec {
  category: OSMLocationCategory;
  subtype?: OSMLocationSubtype;
}

/** Where a resolution came from — used for debugging and save migration. */
export type LocationResolutionSource =
  | 'tags'
  | 'building_value'
  | 'landuse'
  | 'name'
  | 'category_fallback'
  | 'default';

export interface ResolvedLocation {
  category: OSMLocationCategory;
  subtype?: OSMLocationSubtype;
  confidence: LocationConfidence;
  /** Exact normalized OSM pairs that decided the classification (e.g. ["amenity=school"]). */
  matchedTags: string[];
  source: LocationResolutionSource;
  /**
   * Additional strong functions when a building mixes purposes (e.g. a
   * supermarket with an in-store pharmacy). Each entry keeps its subtype so
   * hybrid loot rolls can pull the exact secondary profile (pharmacy, not
   * generic medical).
   */
  secondary: LocationSpec[];
}

export interface LootProfileEntry {
  kind: 'resource' | 'weapon' | 'armor';
  /** Stockpile label for resources (e.g. 'scientific_materials') or display name for weapons/armor. */
  label: string;
  itemId?: WeaponItemId | ArmorItemId;
  /** Relative sampling weight inside the profile pool. */
  weight: number;
  minQuantity: number;
  maxQuantity: number;
  /** Always rolled (a thematic staple of the location). Weapons/armor roll quantity 1. */
  guaranteed?: boolean;
}

/**
 * Declarative loot profile for a canonical category/subtype. Every label must
 * be one the existing scavenging deposit path understands (see
 * STOCKPILE_LOOT_LABELS / the armory ids in scavengingService).
 */
export interface LootProfile {
  category: OSMLocationCategory;
  subtype?: OSMLocationSubtype;
  /** Guaranteed stacks (each occupies one squad inventory slot). */
  guaranteed: LootProfileEntry[];
  /** Weighted pool sampled without replacement for extra thematic stacks. */
  pool: LootProfileEntry[];
  /** How many distinct extra stacks to draw from the pool (before size bonuses). */
  minRolls: number;
  maxRolls: number;
  /** Display blurb used by the debug inspector. */
  summary: string;
}
