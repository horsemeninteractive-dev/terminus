import { OSMLocationCategory, OSMLocationSubtype } from '../types/osmLocation';

/**
 * Declarative OSM → canonical-location mapping tables.
 *
 * Order of evaluation is deterministic: functional tags (healthcare, amenity,
 * shop, ...) win over specialist building values, which win over landuse and
 * name clues. A tag's weight comes from FUNCTION_TAG_PRIORITY, and two tags of
 * the SAME priority that resolve to different canonical categories produce a
 * hybrid (secondary) location.
 */

export interface LocationSpec {
  category: OSMLocationCategory;
  subtype?: OSMLocationSubtype;
}

export type ValueTable = Record<string, LocationSpec>;

/** Weight of each functional tag class (higher = more specific/authoritative). */
export const FUNCTION_TAG_PRIORITY: Record<string, number> = {
  military: 170,
  healthcare: 160,
  amenity: 155,
  shop: 155,
  emergency: 145,
  craft: 140,
  industrial: 135,
  office: 125,
  education: 120,
  tourism: 115,
  leisure: 100,
  public_transport: 95,
  railway: 95,
  man_made: 90,
};

/**
 * Tag classes where any non-generic value is meaningful (e.g. industrial=*,
 * military=*, craft=*). The '*' row is the fallback spec for unrecognized
 * values of that key; literal 'yes'/'no' values are always ignored.
 */
export const CATCH_ALL_TAG_KEYS: Record<string, LocationSpec> = {
  industrial: { category: 'industrial' },
  military: { category: 'military' },
  craft: { category: 'workshop' },
  railway: { category: 'transport' },
  man_made: { category: 'industrial' },
};

/** Functional tag → value → canonical spec tables. */
export const FUNCTION_VALUE_TABLES: Record<string, ValueTable> = {
  healthcare: {
    hospital: { category: 'medical', subtype: 'hospital' },
    clinic: { category: 'medical', subtype: 'clinic' },
    doctors: { category: 'medical', subtype: 'clinic' },
    doctor: { category: 'medical', subtype: 'clinic' },
    dentist: { category: 'medical', subtype: 'dentist' },
    veterinary: { category: 'medical', subtype: 'veterinary' },
    nursing_home: { category: 'medical', subtype: 'nursing_home' },
    pharmacy: { category: 'medical', subtype: 'pharmacy' },
    chemist: { category: 'medical', subtype: 'pharmacy' },
    centre: { category: 'medical', subtype: 'clinic' },
    center: { category: 'medical', subtype: 'clinic' },
    rehabilitation: { category: 'medical', subtype: 'clinic' },
    blood_bank: { category: 'medical', subtype: 'clinic' },
  },
  amenity: {
    // Medical
    hospital: { category: 'medical', subtype: 'hospital' },
    clinic: { category: 'medical', subtype: 'clinic' },
    doctors: { category: 'medical', subtype: 'clinic' },
    dentist: { category: 'medical', subtype: 'dentist' },
    veterinary: { category: 'medical', subtype: 'veterinary' },
    nursing_home: { category: 'medical', subtype: 'nursing_home' },
    pharmacy: { category: 'medical', subtype: 'pharmacy' },
    ambulance_station: { category: 'medical', subtype: 'ambulance_station' },
    blood_donation: { category: 'medical', subtype: 'clinic' },
    // Education
    school: { category: 'education', subtype: 'school' },
    prep_school: { category: 'education', subtype: 'school' },
    music_school: { category: 'education', subtype: 'school' },
    language_school: { category: 'education', subtype: 'school' },
    college: { category: 'education', subtype: 'college' },
    university: { category: 'education', subtype: 'university' },
    kindergarten: { category: 'education', subtype: 'kindergarten' },
    library: { category: 'education', subtype: 'library' },
    archive: { category: 'education', subtype: 'library' },
    research_institute: { category: 'research', subtype: 'research_institute' },
    // Police / fire / military-adjacent
    police: { category: 'police', subtype: 'police' },
    prison: { category: 'police', subtype: 'prison' },
    fire_station: { category: 'fire', subtype: 'fire_station' },
    // Food & drink
    restaurant: { category: 'food', subtype: 'restaurant' },
    cafe: { category: 'food', subtype: 'cafe' },
    fast_food: { category: 'food', subtype: 'fast_food' },
    food_court: { category: 'food', subtype: 'food_court' },
    pub: { category: 'food', subtype: 'pub' },
    bar: { category: 'food', subtype: 'bar' },
    biergarten: { category: 'food', subtype: 'bar' },
    ice_cream: { category: 'food', subtype: 'cafe' },
    // Fuel / vehicle
    fuel: { category: 'fuel', subtype: 'fuel_station' },
    charging_station: { category: 'fuel', subtype: 'charging_station' },
    car_wash: { category: 'vehicle', subtype: 'car_wash' },
    car_rental: { category: 'vehicle', subtype: 'car_dealership' },
    parking: { category: 'transport', subtype: 'parking' },
    bicycle_parking: { category: 'transport', subtype: 'parking' },
    // Government & public
    townhall: { category: 'government', subtype: 'townhall' },
    courthouse: { category: 'government', subtype: 'courthouse' },
    embassy: { category: 'government', subtype: 'embassy' },
    post_office: { category: 'government', subtype: 'post_office' },
    community_centre: { category: 'generic_public' },
    community_center: { category: 'generic_public' },
    social_facility: { category: 'generic_public' },
    bank: { category: 'generic_commercial' },
    money_transfer: { category: 'generic_commercial' },
    marketplace: { category: 'retail' },
    // Worship
    place_of_worship: { category: 'religious', subtype: 'place_of_worship' },
    // Entertainment & culture
    theatre: { category: 'entertainment', subtype: 'theatre' },
    cinema: { category: 'entertainment', subtype: 'cinema' },
    arts_centre: { category: 'entertainment', subtype: 'arts_centre' },
    arts_center: { category: 'entertainment', subtype: 'arts_centre' },
    nightclub: { category: 'entertainment' },
    casino: { category: 'entertainment' },
    events_venue: { category: 'entertainment' },
    museum: { category: 'museum', subtype: 'museum' },
    // Transport
    bus_station: { category: 'transport', subtype: 'bus_station' },
    ferry_terminal: { category: 'transport', subtype: 'harbour' },
    taxi: { category: 'transport' },
    // Lodging
    shelter: { category: 'hospitality', subtype: 'guest_house' },
  },
  shop: {
    supermarket: { category: 'food', subtype: 'supermarket' },
    convenience: { category: 'food', subtype: 'convenience_store' },
    grocery: { category: 'food', subtype: 'grocery' },
    greengrocer: { category: 'food', subtype: 'greengrocer' },
    bakery: { category: 'food', subtype: 'bakery' },
    confectionery: { category: 'food', subtype: 'bakery' },
    butcher: { category: 'food', subtype: 'butcher' },
    deli: { category: 'food', subtype: 'deli' },
    seafood: { category: 'food', subtype: 'seafood' },
    farm: { category: 'food' },
    health_food: { category: 'food' },
    alcohol: { category: 'food' },
    beverages: { category: 'food' },
    // Retail
    department_store: { category: 'retail', subtype: 'department_store' },
    mall: { category: 'retail', subtype: 'department_store' },
    general: { category: 'retail', subtype: 'general_store' },
    variety_store: { category: 'retail', subtype: 'general_store' },
    kiosk: { category: 'retail' },
    newsagent: { category: 'retail' },
    clothes: { category: 'retail', subtype: 'clothing_store' },
    clothing: { category: 'retail', subtype: 'clothing_store' },
    shoes: { category: 'retail', subtype: 'clothing_store' },
    fashion: { category: 'retail', subtype: 'clothing_store' },
    electronics: { category: 'retail', subtype: 'electronics_store' },
    furniture: { category: 'retail' },
    stationary: { category: 'retail' },
    books: { category: 'retail', subtype: 'bookshop' },
    garden_centre: { category: 'retail' },
    garden_center: { category: 'retail' },
    pet_shop: { category: 'retail' },
    optician: { category: 'retail' },
    cosmetics: { category: 'retail' },
    chemist: { category: 'medical', subtype: 'pharmacy' },
    pharmacy: { category: 'medical', subtype: 'pharmacy' },
    medical_supply: { category: 'medical', subtype: 'pharmacy' },
    // Workshop / vehicle
    hardware: { category: 'workshop', subtype: 'hardware_store' },
    doityourself: { category: 'workshop', subtype: 'hardware_store' },
    diy: { category: 'workshop', subtype: 'hardware_store' },
    tools: { category: 'workshop', subtype: 'hardware_store' },
    trade: { category: 'workshop', subtype: 'hardware_store' },
    car_repair: { category: 'workshop', subtype: 'car_repair' },
    car_parts: { category: 'vehicle', subtype: 'car_parts' },
    tyres: { category: 'vehicle', subtype: 'car_parts' },
    car: { category: 'vehicle', subtype: 'car_dealership' },
    motorcycle: { category: 'vehicle', subtype: 'car_dealership' },
    wholesale: { category: 'warehouse', subtype: 'warehouse' },
  },
  office: {
    research: { category: 'research', subtype: 'research_institute' },
    research_institute: { category: 'research', subtype: 'research_institute' },
    laboratory: { category: 'research', subtype: 'laboratory' },
    government: { category: 'government', subtype: 'government_office' },
    educational_institution: { category: 'education', subtype: 'school' },
    medical: { category: 'medical', subtype: 'clinic' },
  },
  emergency: {
    hospital: { category: 'medical', subtype: 'hospital' },
    ambulance_station: { category: 'medical', subtype: 'ambulance_station' },
    police: { category: 'police', subtype: 'police' },
    fire_station: { category: 'fire', subtype: 'fire_station' },
  },
  industrial: {
    warehouse: { category: 'warehouse', subtype: 'warehouse' },
    depot: { category: 'warehouse', subtype: 'storage_depot' },
    storage: { category: 'warehouse', subtype: 'storage_depot' },
    logistics: { category: 'warehouse' },
    distribution: { category: 'warehouse' },
    factory: { category: 'industrial', subtype: 'factory' },
    manufacturing: { category: 'industrial', subtype: 'factory' },
    plant: { category: 'industrial', subtype: 'factory' },
    works: { category: 'industrial' },
    quarry: { category: 'industrial', subtype: 'quarry' },
    mine: { category: 'industrial', subtype: 'quarry' },
    port: { category: 'industrial' },
  },
  education: {
    school: { category: 'education', subtype: 'school' },
    college: { category: 'education', subtype: 'college' },
    university: { category: 'education', subtype: 'university' },
    kindergarten: { category: 'education', subtype: 'kindergarten' },
    library: { category: 'education', subtype: 'library' },
    research_institute: { category: 'research', subtype: 'research_institute' },
    research: { category: 'research', subtype: 'research_institute' },
  },
  tourism: {
    hotel: { category: 'hospitality', subtype: 'hotel' },
    motel: { category: 'hospitality', subtype: 'motel' },
    hostel: { category: 'hospitality', subtype: 'hostel' },
    guest_house: { category: 'hospitality', subtype: 'guest_house' },
    chalet: { category: 'hospitality', subtype: 'hotel' },
    apartment: { category: 'hospitality', subtype: 'hotel' },
    campsite: { category: 'hospitality', subtype: 'campsite' },
    caravan_site: { category: 'hospitality', subtype: 'campsite' },
    museum: { category: 'museum', subtype: 'museum' },
    gallery: { category: 'museum', subtype: 'museum' },
  },
  leisure: {
    sports_centre: { category: 'entertainment', subtype: 'sports_hall' },
    sports_center: { category: 'entertainment', subtype: 'sports_hall' },
    stadium: { category: 'entertainment', subtype: 'sports_hall' },
    fitness_centre: { category: 'entertainment', subtype: 'sports_hall' },
    fitness_center: { category: 'entertainment', subtype: 'sports_hall' },
    gym: { category: 'entertainment', subtype: 'sports_hall' },
    swimming_pool: { category: 'entertainment', subtype: 'sports_hall' },
    dance: { category: 'entertainment' },
    amusement_arcade: { category: 'entertainment' },
    playground: { category: 'generic_public' },
    park: { category: 'generic_public' },
    garden: { category: 'generic_public' },
  },
  public_transport: {
    station: { category: 'transport', subtype: 'station' },
    platform: { category: 'transport', subtype: 'station' },
    bus_station: { category: 'transport', subtype: 'bus_station' },
    stop_position: { category: 'transport' },
  },
  railway: {
    station: { category: 'transport', subtype: 'train_station' },
    halt: { category: 'transport', subtype: 'train_station' },
    yard: { category: 'transport' },
  },
  man_made: {
    silo: { category: 'warehouse', subtype: 'silo' },
    storage_tank: { category: 'warehouse', subtype: 'silo' },
    water_works: { category: 'industrial', subtype: 'water_works' },
    wastewater_plant: { category: 'industrial', subtype: 'wastewater_plant' },
    works: { category: 'industrial' },
  },
};

/**
 * Specialist building=* values used when no functional tag is present.
 * These are medium-confidence (a specific building value is decent evidence,
 * but the tag alone cannot confirm the current function).
 */
export const BUILDING_VALUE_TABLE: ValueTable = {
  // Residential forms
  house: { category: 'residential' },
  detached: { category: 'residential' },
  semidetached_house: { category: 'residential' },
  terrace: { category: 'residential' },
  bungalow: { category: 'residential' },
  cabin: { category: 'residential' },
  hut: { category: 'residential' },
  static_caravan: { category: 'residential' },
  apartments: { category: 'residential' },
  flats: { category: 'residential' },
  residential: { category: 'residential' },
  dormitory: { category: 'residential' },
  duplex: { category: 'residential' },
  // Education / research
  school: { category: 'education', subtype: 'school' },
  kindergarten: { category: 'education', subtype: 'kindergarten' },
  college: { category: 'education', subtype: 'college' },
  university: { category: 'education', subtype: 'university' },
  education: { category: 'education', subtype: 'school' },
  classroom: { category: 'education', subtype: 'school' },
  faculty: { category: 'education', subtype: 'school' },
  library: { category: 'education', subtype: 'library' },
  research: { category: 'research', subtype: 'research_institute' },
  institute: { category: 'research', subtype: 'research_institute' },
  laboratory: { category: 'research', subtype: 'laboratory' },
  // Medical
  hospital: { category: 'medical', subtype: 'hospital' },
  clinic: { category: 'medical', subtype: 'clinic' },
  pharmacy: { category: 'medical', subtype: 'pharmacy' },
  // Emergency services
  police: { category: 'police', subtype: 'police' },
  prison: { category: 'police', subtype: 'prison' },
  fire_station: { category: 'fire', subtype: 'fire_station' },
  barracks: { category: 'military', subtype: 'barracks' },
  military: { category: 'military' },
  // Food
  supermarket: { category: 'food', subtype: 'supermarket' },
  restaurant: { category: 'food', subtype: 'restaurant' },
  // Retail / office
  retail: { category: 'retail' },
  commercial: { category: 'generic_commercial' },
  office: { category: 'office', subtype: 'office' },
  kiosk: { category: 'retail' },
  // Worship
  church: { category: 'religious', subtype: 'place_of_worship' },
  cathedral: { category: 'religious', subtype: 'place_of_worship' },
  chapel: { category: 'religious', subtype: 'place_of_worship' },
  mosque: { category: 'religious', subtype: 'place_of_worship' },
  synagogue: { category: 'religious', subtype: 'place_of_worship' },
  temple: { category: 'religious', subtype: 'place_of_worship' },
  shrine: { category: 'religious', subtype: 'place_of_worship' },
  // Government / public
  government: { category: 'government', subtype: 'government_office' },
  civic: { category: 'generic_public' },
  public: { category: 'generic_public' },
  // Industry / storage
  warehouse: { category: 'warehouse', subtype: 'warehouse' },
  storage: { category: 'warehouse', subtype: 'storage_depot' },
  shed: { category: 'warehouse' },
  industrial: { category: 'industrial' },
  manufacture: { category: 'industrial', subtype: 'factory' },
  factory: { category: 'industrial', subtype: 'factory' },
  works: { category: 'industrial' },
  mill: { category: 'industrial', subtype: 'mill' },
  hangar: { category: 'industrial' },
  power_substation: { category: 'industrial', subtype: 'substation' },
  substation: { category: 'industrial', subtype: 'substation' },
  // Agriculture
  farm: { category: 'agriculture', subtype: 'farm_building' },
  farm_building: { category: 'agriculture', subtype: 'farm_building' },
  barn: { category: 'agriculture', subtype: 'farm_building' },
  stable: { category: 'agriculture', subtype: 'farm_building' },
  greenhouse: { category: 'agriculture', subtype: 'greenhouse' },
  // Garages / vehicles
  garage: { category: 'workshop', subtype: 'garage' },
  garages: { category: 'workshop', subtype: 'garage' },
  carport: { category: 'workshop', subtype: 'garage' },
  parking: { category: 'transport', subtype: 'parking' },
  // Transport / misc
  train_station: { category: 'transport', subtype: 'train_station' },
  transport: { category: 'transport' },
  construction: { category: 'construction', subtype: 'construction_site' },
};

/** Landuse context used only for otherwise-generic buildings (medium-low confidence). */
export const LANDUSE_VALUE_TABLE: ValueTable = {
  residential: { category: 'residential' },
  commercial: { category: 'generic_commercial' },
  retail: { category: 'retail' },
  industrial: { category: 'industrial' },
  education: { category: 'education', subtype: 'school' },
  quarry: { category: 'industrial', subtype: 'quarry' },
  depot: { category: 'warehouse', subtype: 'storage_depot' },
  farmland: { category: 'agriculture' },
  farmyard: { category: 'agriculture' },
  orchard: { category: 'agriculture' },
  greenhouse_horticulture: { category: 'agriculture', subtype: 'greenhouse' },
  construction: { category: 'construction', subtype: 'construction_site' },
};

/**
 * Explicit name/operator keyword fallbacks (LOW confidence, never preferred
 * over structured tags). Only consulted when tags carry no functional signal.
 */
export interface KeywordFallbackRule {
  category: OSMLocationCategory;
  subtype?: OSMLocationSubtype;
  terms: string[];
}

export const NAME_KEYWORD_FALLBACKS: KeywordFallbackRule[] = [
  { category: 'education', subtype: 'school', terms: ['school', 'academy', 'elementary', 'high school', 'secondary school', 'primary school', 'lyceum', 'lycee', 'gymnasium', 'polytechnic', 'kindergarten'] },
  { category: 'education', subtype: 'college', terms: ['college'] },
  { category: 'education', subtype: 'university', terms: ['university', 'univ'] },
  { category: 'education', subtype: 'library', terms: ['library', 'public library'] },
  { category: 'research', subtype: 'research_institute', terms: ['research institute', 'research center', 'research centre', 'research lab', 'laboratory'] },
  { category: 'medical', subtype: 'hospital', terms: ['hospital', 'medical center', 'medical centre', 'health center', 'health centre', 'infirmary', 'urgent care'] },
  { category: 'medical', subtype: 'clinic', terms: ['clinic', 'surgery', 'doctor', 'healthcare'] },
  { category: 'medical', subtype: 'pharmacy', terms: ['pharmacy', 'chemist', 'apotheke', 'drugstore', 'dispensary'] },
  { category: 'police', subtype: 'police', terms: ['police', 'constabulary', 'gendarmerie', 'sheriff', 'precinct', 'patrol station'] },
  { category: 'fire', subtype: 'fire_station', terms: ['fire station', 'firehouse', 'fire brigade'] },
  { category: 'military', subtype: 'barracks', terms: ['barracks', 'military base', 'armory', 'armoury', 'garrison'] },
  { category: 'food', subtype: 'supermarket', terms: ['supermarket', 'grocery', 'grocer', 'walmart', 'costco', 'aldi', 'lidl', 'carrefour', 'tesco', 'kroger', 'safeway', 'sainsbury', 'trader joes', 'whole foods'] },
  { category: 'food', subtype: 'restaurant', terms: ['restaurant', 'cafe', 'café', 'bistro', 'diner', 'grill', 'pizzeria', 'tavern', 'cantina', 'inn', 'trattoria'] },
  { category: 'food', subtype: 'bakery', terms: ['bakery', 'patisserie'] },
  { category: 'fuel', subtype: 'fuel_station', terms: ['gas station', 'petrol station', 'fuel station', 'service station', 'esso', 'shell', 'bp ', 'texaco', 'total', 'chevron', 'exxon', 'mobil', 'aral'] },
  { category: 'government', subtype: 'townhall', terms: ['town hall', 'city hall', 'municipal building', 'guildhall'] },
  { category: 'government', subtype: 'courthouse', terms: ['courthouse', 'court house', 'law courts'] },
  { category: 'religious', subtype: 'place_of_worship', terms: ['church', 'cathedral', 'chapel', 'mosque', 'synagogue', 'temple', 'shrine', 'abbey', 'basilica'] },
  { category: 'warehouse', subtype: 'warehouse', terms: ['warehouse', 'distribution center', 'distribution centre', 'logistics centre', 'storage depot', 'self storage'] },
  { category: 'industrial', subtype: 'factory', terms: ['factory', 'plant', 'foundry', 'refinery', 'brewery', 'manufacturing'] },
  { category: 'museum', subtype: 'museum', terms: ['museum', 'heritage centre'] },
  { category: 'hospitality', subtype: 'hotel', terms: ['hotel', 'motel', 'inn'] },
  { category: 'transport', subtype: 'train_station', terms: ['station', 'railway station', 'train station'] },
  { category: 'office', subtype: 'office', terms: ['office', 'headquarters', 'plaza', 'business centre'] },
];
