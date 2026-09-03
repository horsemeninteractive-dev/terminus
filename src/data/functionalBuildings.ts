import {
  FunctionalBuildingDefinition,
  FunctionalBuildingTypeId,
  FunctionalCategory,
  ResourceCost,
} from '../types/settlement';
import { BuildingPolygon, Point2D } from '../types/map';

export const FUNCTIONAL_CATEGORIES: {
  id: FunctionalCategory;
  label: string;
  icon: string;
  color: string;
  description: string;
}[] = [
  {
    id: 'basic',
    label: 'Basic Infrastructure',
    icon: 'Home',
    color: '#3b82f6',
    description: 'Command centres, squad quarters, shared storage, and citizen housing.',
  },
  {
    id: 'food',
    label: 'Food Production',
    icon: 'Utensils',
    color: '#10b981',
    description: 'Fields, greenhouses, livestock barns, cookhouses, and canning lines.',
  },
  {
    id: 'production',
    label: 'Industrial & Crafting',
    icon: 'Hammer',
    color: '#f59e0b',
    description: 'Material processing, arms manufacturing, chemistry, vehicle workshops, and kilns.',
  },
  {
    id: 'defense_walls',
    label: 'Walls & Gates',
    icon: 'Shield',
    color: '#ef4444',
    description: 'Barbed wire, wooden palisades, metal fences, gates, and fortified walls.',
  },
  {
    id: 'defense_towers',
    label: 'Towers & Spotlights',
    icon: 'Eye',
    color: '#f97316',
    description: 'Defensive watchtowers, metal towers, fortified towers, and floodlights.',
  },
  {
    id: 'utility',
    label: 'Utility & Comms',
    icon: 'Radio',
    color: '#8b5cf6',
    description: 'Radio antennae, research centres, weather radars, hospitals, and repair shops.',
  },
  {
    id: 'civilian',
    label: 'Civilian & Morale',
    icon: 'HeartPulse',
    color: '#ec4899',
    description: 'Kindergartens, bars, taverns, and social gathering squares.',
  },
  {
    id: 'decorative',
    label: 'Decorative & Mast',
    icon: 'Flame',
    color: '#64748b',
    description: 'Colony flags, beacons, and landmark masts.',
  },
];

export const FUNCTIONAL_BUILDING_DEFINITIONS: Record<
  FunctionalBuildingTypeId,
  FunctionalBuildingDefinition
> = {
  // ==========================================
  // 1. BASIC BUILDINGS
  // ==========================================
  headquarters: {
    id: 'headquarters',
    type: 'headquarters',
    name: 'Headquarters',
    category: 'basic',
    description:
      'Command centre and main settlement structure. Acts as primary drop-off, squad resupply point, and determines base squad capacity. If destroyed, the settlement falls.',
    iconName: 'Shield',
    badgeColor: '#3b82f6',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 8,
    adaptationCost: { wood: 50, metal: 30, bricks: 40, tools: 2 },
    freestandingCost: { wood: 150, metal: 90, bricks: 120, tools: 5 },
    durability: { adaptationBase: 800, freestandingBase: 500 },
    functions: ['Command & Administration', 'Drop-off & Resupply', 'Living Quarters', 'Squad Capacity'],
    storageCapacity: 850,
    housingCapacity: 16,
    squadCapacity: 2,
    baseDefense: 75,
    freestandingDefense: 50,
    capacityLabel: 'HQ Capacity: Command & Squad Hub',
    preferredOsmTypes: ['civic', 'police', 'commercial', 'residential'],
  },
  squad_quarters: {
    id: 'squad_quarters',
    type: 'squad_quarters',
    name: 'Squad Quarters',
    category: 'basic',
    description:
      'Dedicated tactical barracks and locker facilities. Extends settlement logistics with deployable squad slots that scale with the barracks footprint — a small annex fields +1 squad, a large converted hall quarters several.',
    iconName: 'Users',
    badgeColor: '#60a5fa',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 40, metal: 25, bricks: 20 },
    freestandingCost: { wood: 120, metal: 70, bricks: 60 },
    durability: { adaptationBase: 400, freestandingBase: 250 },
    functions: ['Tactical Barracks', 'Squad Capacity Increase', 'Equipment Staging'],
    housingCapacity: 8,
    squadCapacity: 1,
    baseDefense: 45,
    freestandingDefense: 25,
    // §IFZ: +1 squad per ~64 m² of fully-adapted barracks footprint.
    capacityLabel: 'Squad Slots: 1 per ~64 m² barracks area',
    preferredOsmTypes: ['residential', 'police', 'civic'],
  },
  warehouse: {
    id: 'warehouse',
    type: 'warehouse',
    name: 'Warehouse',
    category: 'basic',
    description:
      'High-capacity central depot. Significantly expands shared stockpile inventory and provides regional resource drop-off & squad resupply.',
    iconName: 'Archive',
    badgeColor: '#94a3b8',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 6,
    adaptationCost: { wood: 35, metal: 45, bricks: 25 },
    freestandingCost: { wood: 110, metal: 140, bricks: 70 },
    durability: { adaptationBase: 550, freestandingBase: 350 },
    functions: ['Bulk Storage', 'Shared Inventory Drop-off', 'Resupply Nexus'],
    storageCapacity: 500,
    baseDefense: 40,
    freestandingDefense: 20,
    capacityLabel: 'Storage: 1.5 slots per m³ volume',
    preferredOsmTypes: ['warehouse', 'industrial', 'commercial', 'supermarket'],
  },
  shelter: {
    id: 'shelter',
    type: 'shelter',
    name: 'Shelter',
    category: 'basic',
    description:
      'Basic communal residence. Provides warm bunks and basic shelter for unhoused survivors, preventing morale penalties from homelessness.',
    iconName: 'Home',
    badgeColor: '#38bdf8',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 30, metal: 15, bricks: 20 },
    freestandingCost: { wood: 90, metal: 45, bricks: 60 },
    durability: { adaptationBase: 350, freestandingBase: 200 },
    functions: ['Citizen Residence', 'Rest & Recuperation', 'Basic Morale Support'],
    housingCapacity: 12,
    baseDefense: 35,
    freestandingDefense: 15,
    capacityLabel: 'Beds: 1 per 12 m² floor area',
    preferredOsmTypes: ['residential', 'commercial', 'school'],
  },
  house: {
    id: 'house',
    type: 'house',
    name: 'House',
    category: 'basic',
    description:
      'Advanced insulated single/multi-family home with private rooms, solid timber joinery, and superior heating. Substantially boosts survivor mood and recovery.',
    researchRequirement: 'advanced_woodworks',
    iconName: 'Bed',
    badgeColor: '#0ea5e9',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 50, metal: 20, bricks: 35, tools: 1 },
    freestandingCost: { wood: 140, metal: 60, bricks: 90, tools: 2 },
    durability: { adaptationBase: 450, freestandingBase: 300 },
    functions: ['Quality Housing', 'Mood Boost (+15%)', 'Accelerated Rest'],
    housingCapacity: 16,
    baseDefense: 45,
    freestandingDefense: 25,
    capacityLabel: 'Beds: 1 per 10 m² floor area',
    preferredOsmTypes: ['residential'],
  },

  // ==========================================
  // 2. FOOD PRODUCTION
  // ==========================================
  field: {
    id: 'field',
    type: 'field',
    name: 'Field',
    category: 'food',
    description:
      'Tilled outdoor soil plot producing Grain each crop cycle. Production is weather-affected and receives a fertilizer bonus; workers improve field operations but are not required for the base yield.',
    iconName: 'Sprout',
    badgeColor: '#10b981',
    // IFZ: Fields are freestanding open-ground plots (a flat rectangular plane),
    // not adapted real buildings.
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 20, metal: 5, bricks: 5, tools: 1 },
    freestandingCost: { wood: 40, metal: 10, bricks: 10, tools: 2 },
    durability: { adaptationBase: 200, freestandingBase: 120 },
    functions: ['Grain Agriculture', 'Outdoor Crop Cultivation'],
    outputs: [{ resource: 'grain', amountPerDay: 4 }],
    baseDefense: 10,
    freestandingDefense: 5,
    capacityLabel: 'Grain Yield: 4/cycle — 7 fertilized (Weather-dependent)',
    preferredOsmTypes: ['commercial', 'residential'],
  },
  vast_field: {
    id: 'vast_field',
    type: 'vast_field',
    name: 'Vast Field',
    category: 'food',
    description:
      'Large-scale cultivated agricultural acreage with mechanized furrows. Multiplies grain output for large populations.',
    researchRequirement: 'farming',
    iconName: 'Sun',
    badgeColor: '#059669',
    // IFZ: Vast Fields are larger freestanding plots (bigger plane than Field).
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 8,
    adaptationCost: { wood: 45, metal: 15, bricks: 10, tools: 2 },
    freestandingCost: { wood: 80, metal: 30, bricks: 20, tools: 4 },
    durability: { adaptationBase: 250, freestandingBase: 150 },
    functions: ['Large-Scale Grain Farming', 'Crop Rotation'],
    outputs: [{ resource: 'grain', amountPerDay: 22 }],
    baseDefense: 10,
    freestandingDefense: 5,
    capacityLabel: 'Grain Yield: 22/cycle — ×1.75 fertilized (Weather-dependent)',
    preferredOsmTypes: ['commercial', 'residential'],
  },
  greenhouse: {
    id: 'greenhouse',
    type: 'greenhouse',
    name: 'Greenhouse',
    category: 'food',
    description:
      'Glazed thermal envelope functioning as a weather-proof Field. Produces Grain each crop cycle without outdoor weather penalties.',
    researchRequirement: 'greenhouses',
    iconName: 'Sprout',
    badgeColor: '#34d399',
    // IFZ: Greenhouses are freestanding weather-proof plots.
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 40, metal: 50, bricks: 20, tools: 1 },
    freestandingCost: { wood: 120, metal: 140, bricks: 50, tools: 2 },
    durability: { adaptationBase: 300, freestandingBase: 180 },
    functions: ['Weather-Proof Grain Agriculture', 'Cold Immunity', 'Crop Cycle Production'],
    outputs: [{ resource: 'grain', amountPerDay: 4 }],
    baseDefense: 25,
    freestandingDefense: 15,
    capacityLabel: 'Grain Yield: 4/cycle — 7 fertilized (Weather-Proof)',
    preferredOsmTypes: ['commercial', 'school', 'supermarket'],
  },
  barn: {
    id: 'barn',
    type: 'barn',
    name: 'Barn / Livestock Pen',
    category: 'food',
    description:
      'Husbandry barn that converts surplus Grain feed into nutritious Raw Meat and organic Fertilizer to accelerate crop yields.',
    iconName: 'Trees',
    badgeColor: '#84cc16',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 45, metal: 20, bricks: 30, tools: 1 },
    freestandingCost: { wood: 130, metal: 55, bricks: 80, tools: 2 },
    durability: { adaptationBase: 380, freestandingBase: 240 },
    functions: ['Animal Husbandry', 'Meat Production', 'Fertilizer Generation'],
    recipes: [{
      id: 'grain_to_meat_fertilizer',
      name: 'Grain to Meat & Fertilizer',
      inputs: [{ resource: 'grain', amountPerDay: 2 }],
      outputs: [{ resource: 'raw_meat', amountPerDay: 2 }, { resource: 'fertilizer', amountPerDay: 1 }],
    }],
    baseDefense: 30,
    freestandingDefense: 15,
    capacityLabel: 'Production: Grain -> Meat & Fertilizer',
    preferredOsmTypes: ['warehouse', 'industrial', 'residential'],
  },
  cookhouse: {
    id: 'cookhouse',
    type: 'cookhouse',
    name: 'Cookhouse',
    category: 'food',
    description:
      'Communal masonry ovens and sanitized prep stations. Converts raw Grain and Raw Meat (using Wood fuel) into high-energy Food Rations.',
    iconName: 'Flame',
    badgeColor: '#f97316',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 35, metal: 30, bricks: 45, tools: 1 },
    freestandingCost: { wood: 110, metal: 90, bricks: 120, tools: 2 },
    durability: { adaptationBase: 420, freestandingBase: 260 },
    functions: ['Ration Cooking', 'Meal Preparation', 'Nutrition Sanitization'],
    recipes: [
      { id: 'grain_rations', name: 'Grain Rations', inputs: [{ resource: 'grain', amountPerDay: 2 }, { resource: 'wood', amountPerDay: 1 }], outputs: [{ resource: 'mre_rations', amountPerDay: 4 }] },
      { id: 'meat_rations', name: 'Meat Rations', inputs: [{ resource: 'raw_meat', amountPerDay: 2 }, { resource: 'wood', amountPerDay: 1 }], outputs: [{ resource: 'mre_rations', amountPerDay: 5 }] },
    ],
    baseDefense: 40,
    freestandingDefense: 20,
    capacityLabel: 'Prep Output: 12 Rations/day',
    preferredOsmTypes: ['restaurant', 'supermarket', 'commercial'],
  },
  cannery: {
    id: 'cannery',
    type: 'cannery',
    name: 'Cannery',
    category: 'food',
    description:
      'Industrial pressure autoclaves and can-sealing assembly lines. Preserves perishable harvest and cooked food with metal into non-perishable Canned Goods.',
    researchRequirement: 'food_preservation',
    iconName: 'Utensils',
    badgeColor: '#eab308',
    // IFZ: Canneries are freestanding industrial plants.
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 5,
    adaptationCost: { wood: 40, metal: 65, bricks: 40, tools: 2 },
    freestandingCost: { wood: 120, metal: 180, bricks: 110, tools: 4 },
    durability: { adaptationBase: 480, freestandingBase: 300 },
    functions: ['Food Preservation', 'Canned Goods Crafting', 'Long-term Storage'],
    recipes: [{ id: 'metal_food_to_cans', name: 'Food Rations to Canned Food', inputs: [{ resource: 'metal', amountPerDay: 1 }, { resource: 'mre_rations', amountPerDay: 1 }], outputs: [{ resource: 'canned_goods', amountPerDay: 1 }] }],
    baseDefense: 45,
    freestandingDefense: 22,
    capacityLabel: 'Output: 10 Canned Goods/day',
    preferredOsmTypes: ['industrial', 'warehouse', 'supermarket'],
  },

  // ==========================================
  // 3. PRODUCTION & INDUSTRIAL
  // ==========================================
  foresters_hut: {
    id: 'foresters_hut',
    type: 'foresters_hut',
    name: "Forester's Hut",
    category: 'production',
    description:
      'Forestry and timber management post. Staffed crews replant and tend actual trees within a 40 m working radius — depleted stumps regrow and thin forest gains new saplings, keeping wood renewable — while the hut ships a steady supply of raw logs to a Sawmill.',
    researchRequirement: 'basic_forestry',
    iconName: 'Trees',
    badgeColor: '#15803d',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 25, metal: 10, bricks: 15, tools: 1 },
    freestandingCost: { wood: 75, metal: 30, bricks: 45, tools: 2 },
    durability: { adaptationBase: 320, freestandingBase: 200 },
    functions: ['Forest Replenishment', 'Sapling Planting', 'Wood Logistics'],
    outputs: [{ resource: 'logs', amountPerDay: 15 }],
    baseDefense: 30,
    freestandingDefense: 15,
    capacityLabel: 'Replants & regrows trees within 40 m · +15 Logs/day',
    preferredOsmTypes: ['residential', 'industrial'],
  },
  sawmill: {
    id: 'sawmill',
    type: 'sawmill',
    name: 'Sawmill',
    category: 'production',
    description:
      'High-torque motorized band saws. Staffed crews auto-cut the nearest mature tree within a 30 m working area straight into structural wood (deposited to the stockpile), and the mill also converts felled logs into lumber at +60% yield.',
    researchRequirement: 'advanced_woodworks',
    iconName: 'Hammer',
    badgeColor: '#d97706',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 5,
    adaptationCost: { wood: 50, metal: 45, bricks: 30, tools: 2 },
    freestandingCost: { wood: 150, metal: 130, bricks: 80, tools: 4 },
    durability: { adaptationBase: 440, freestandingBase: 280 },
    functions: ['Auto Tree Cutting (30 m)', 'Lumber Milling', 'Wood Processing'],
    recipes: [{ id: 'logs_to_lumber', name: 'Logs to Lumber', inputs: [{ resource: 'logs', amountPerDay: 10 }], outputs: [{ resource: 'wood', amountPerDay: 16 }] }],
    baseDefense: 40,
    freestandingDefense: 20,
    capacityLabel: 'Auto-cuts trees within 30 m · 10 Logs → 16 Wood/day',
    preferredOsmTypes: ['industrial', 'warehouse'],
  },
  tool_factory: {
    id: 'tool_factory',
    type: 'tool_factory',
    name: 'Tool Factory',
    category: 'production',
    description:
      'Heavy forge and grinding line. Combines raw Wood and Metal to forge Basic Tools, which are consumed by construction crews and industrial buildings.',
    researchRequirement: 'tool_factory',
    iconName: 'Wrench',
    badgeColor: '#f59e0b',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 40, metal: 60, bricks: 35, tools: 1 },
    freestandingCost: { wood: 120, metal: 170, bricks: 90, tools: 3 },
    durability: { adaptationBase: 460, freestandingBase: 300 },
    functions: ['Basic Tool Manufacturing', 'Maintenance Equipment Forging'],
    inputs: [
      { resource: 'wood', amountPerDay: 4 },
      { resource: 'metal', amountPerDay: 4 },
    ],
    outputs: [{ resource: 'tools', amountPerDay: 3 }],
    baseDefense: 45,
    freestandingDefense: 22,
    capacityLabel: 'Output: 3 Basic Tools/day',
    preferredOsmTypes: ['industrial', 'commercial'],
  },
  scrapyard: {
    id: 'scrapyard',
    type: 'scrapyard',
    name: 'Scrapyard',
    category: 'production',
    description:
      'Hydraulic cutters and magnetic sorting cranes — the colony recycling yard. Every used food can, spent ammunition case, scrap pile, and dismantled vehicle hulk in the stockpile accumulates here and is re-smelted into refined Metal, so the colony\'s own consumption becomes an industrial resource.',
    researchRequirement: 'recycling',
    iconName: 'Layers',
    badgeColor: '#64748b',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 6,
    adaptationCost: { wood: 30, metal: 50, bricks: 25, tools: 2 },
    freestandingCost: { wood: 90, metal: 140, bricks: 70, tools: 3 },
    durability: { adaptationBase: 500, freestandingBase: 320 },
    functions: ['Used Can & Ammo Recycling', 'Metal Debris Sorting', 'Ingot Refinement'],
    recipes: [{ id: 'scrap_to_metal', name: 'Recycle Scrap to Metal', inputs: [{ resource: 'scrap', amountPerDay: 10 }], outputs: [{ resource: 'metal', amountPerDay: 14 }] }],
    baseDefense: 40,
    freestandingDefense: 20,
    capacityLabel: 'Recycles: 10 Scrap → 14 Metal/day',
    preferredOsmTypes: ['industrial', 'warehouse', 'commercial'],
  },
  arms_factory: {
    id: 'arms_factory',
    type: 'arms_factory',
    name: 'Arms Factory',
    category: 'production',
    description:
      'Precision gunsmithing lathes, barrel drills, and ammo presses. Manufactures Pistols, Assault Rifles, Shotguns, Sniper Rifles, Heavy Machine Guns, and Ammunition Crates.',
    researchRequirement: 'pistol', // IFZ: unlocked via Pistol Production (Arms branch)
    iconName: 'Crosshair',
    badgeColor: '#dc2626',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 6,
    adaptationCost: { wood: 45, metal: 80, bricks: 50, tools: 3 },
    freestandingCost: { wood: 130, metal: 220, bricks: 140, tools: 5 },
    durability: { adaptationBase: 550, freestandingBase: 360 },
    functions: ['Ammunition Crates', 'Pistol Production', 'Assault Rifle Line', 'Shotgun Line', 'Sniper Rifle Line', 'Heavy MG Line'],
    // §IFZ Arms Factory: each firearm is its own selectable production line,
    // unlocked by its research node and manufactured into the colony armory
    // with a distinct material cost. Ammunition Crates remain the stockpile
    // line (metal → ammo). Lines with `gear` consume inputs continuously and
    // push one real weapon into the armory per full unit of work.
    recipes: [
      {
        id: 'ammo_crates',
        name: 'Ammunition Crates',
        inputs: [{ resource: 'metal', amountPerDay: 6 }],
        outputs: [{ resource: 'ammo', amountPerDay: 20 }],
      },
      {
        id: 'manufacture_pistol',
        name: 'Manufacture Pistol',
        researchRequirement: 'pistol',
        inputs: [{ resource: 'metal', amountPerDay: 9 }, { resource: 'wood', amountPerDay: 2 }],
        gear: { kind: 'weapon', itemId: 'pistol' },
      },
      {
        id: 'manufacture_shotgun',
        name: 'Manufacture Shotgun',
        researchRequirement: 'shotgun',
        inputs: [{ resource: 'metal', amountPerDay: 13 }, { resource: 'wood', amountPerDay: 3 }],
        gear: { kind: 'weapon', itemId: 'shotgun' },
      },
      {
        id: 'manufacture_assault_rifle',
        name: 'Manufacture Assault Rifle',
        researchRequirement: 'assault_rifle',
        inputs: [{ resource: 'metal', amountPerDay: 16 }, { resource: 'wood', amountPerDay: 4 }],
        gear: { kind: 'weapon', itemId: 'assault_rifle' },
      },
      {
        id: 'manufacture_sniper_rifle',
        name: 'Manufacture Sniper Rifle',
        researchRequirement: 'sniper_rifle',
        inputs: [{ resource: 'metal', amountPerDay: 18 }, { resource: 'wood', amountPerDay: 4 }],
        gear: { kind: 'weapon', itemId: 'sniper_rifle' },
      },
      {
        id: 'manufacture_hmg',
        name: 'Manufacture Heavy Machine Gun',
        researchRequirement: 'heavy_machine_gun',
        inputs: [{ resource: 'metal', amountPerDay: 24 }, { resource: 'wood', amountPerDay: 3 }],
        gear: { kind: 'weapon', itemId: 'heavy_machine_gun' },
      },
    ],
    baseDefense: 60,
    freestandingDefense: 35,
    capacityLabel: 'Arsenal: Weapons & Ammo Crafting',
    preferredOsmTypes: ['industrial', 'police', 'civic'],
  },
  chemical_plant: {
    id: 'chemical_plant',
    type: 'chemical_plant',
    name: 'Chemical Plant',
    category: 'production',
    description:
      'Distillation towers and catalytic reactors. Processes wood into Fertilizer and Fuel and converts surplus stores back and forth — every recipe mirrors the IFZ Chemical Plant lines.',
    iconName: 'Zap',
    badgeColor: '#8b5cf6',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 5,
    adaptationCost: { wood: 35, metal: 70, bricks: 45, tools: 2 },
    freestandingCost: { wood: 100, metal: 190, bricks: 130, tools: 4 },
    durability: { adaptationBase: 460, freestandingBase: 300 },
    functions: ['Biofuel Synthesis', 'Fertilizer Catalysis', 'Chemical Refining'],
    // §IFZ Chemical Plant recipes (current wiki):
    //   2 Wood → 1 Fertilizer | 1 Fuel → 3 Fertilizer
    //   6 Wood → 1 Fuel    | 3 Fertilizer → 1 Fuel
    recipes: [
      { id: 'wood_to_fertilizer', name: 'Wood to Fertilizer', inputs: [{ resource: 'wood', amountPerDay: 2 }], outputs: [{ resource: 'fertilizer', amountPerDay: 1 }] },
      { id: 'fuel_to_fertilizer', name: 'Fuel to Fertilizer', inputs: [{ resource: 'fuel', amountPerDay: 1 }], outputs: [{ resource: 'fertilizer', amountPerDay: 3 }] },
      { id: 'wood_to_fuel', name: 'Wood to Fuel', inputs: [{ resource: 'wood', amountPerDay: 6 }], outputs: [{ resource: 'fuel', amountPerDay: 1 }] },
      { id: 'fertilizer_to_fuel', name: 'Fertilizer to Fuel', inputs: [{ resource: 'fertilizer', amountPerDay: 3 }], outputs: [{ resource: 'fuel', amountPerDay: 1 }] },
    ],
    baseDefense: 40,
    freestandingDefense: 20,
    capacityLabel: 'IFZ Lines: 2W→1Fert · 1Fuel→3Fert · 6W→1Fuel · 3Fert→1Fuel',
    preferredOsmTypes: ['industrial', 'gas_station'],
  },
  protective_gear_factory: {
    id: 'protective_gear_factory',
    type: 'protective_gear_factory',
    name: 'Protective Gear Factory',
    category: 'production',
    description:
      'Heavy sewing frames and ballistic pressing molds. Crafts Protector Vests, Riot Gear, and Plate Armor to equip squad operatives.',
    researchRequirement: 'polymers',
    iconName: 'Shield',
    badgeColor: '#6366f1',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 35, metal: 65, bricks: 30, tools: 2 },
    freestandingCost: { wood: 100, metal: 175, bricks: 90, tools: 4 },
    durability: { adaptationBase: 440, freestandingBase: 280 },
    functions: ['Protector Vest Line', 'Riot Gear Line', 'Plate Armor Line'],
    // §IFZ Protective Gear Factory: separate armor production lines that feed
    // the colony armory (previously the building consumed 5 Metal/day with no
    // production at all — a silent sink). Each line consumes metal while the
    // crew works and finishes one armor set per full unit of progress.
    recipes: [
      {
        id: 'manufacture_protector',
        name: 'Protector Vest',
        inputs: [{ resource: 'metal', amountPerDay: 5 }],
        gear: { kind: 'armor', itemId: 'padded_jacket' },
      },
      {
        id: 'manufacture_riot_gear',
        name: 'Riot Gear',
        inputs: [{ resource: 'metal', amountPerDay: 8 }],
        gear: { kind: 'armor', itemId: 'riot_vest' },
      },
      {
        id: 'manufacture_plate_armor',
        name: 'Plate Armor',
        inputs: [{ resource: 'metal', amountPerDay: 12 }],
        gear: { kind: 'armor', itemId: 'tactical_gear' },
      },
    ],
    baseDefense: 45,
    freestandingDefense: 22,
    capacityLabel: 'Output: Tactical Armor Sets',
    preferredOsmTypes: ['industrial', 'commercial'],
  },
  vehicle_workshop: {
    id: 'vehicle_workshop',
    type: 'vehicle_workshop',
    name: 'Vehicle Workshop',
    category: 'production',
    description:
      'Hydraulic lifts, engine hoists, and motor pool diagnostic racks. Constructs new vehicles, restores wrecked vehicles, and deconstructs chassis for metal.',
    researchRequirement: 'mechanics',
    iconName: 'Wrench',
    badgeColor: '#0284c7',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 5,
    adaptationCost: { wood: 40, metal: 75, bricks: 40, tools: 3 },
    freestandingCost: { wood: 120, metal: 210, bricks: 120, tools: 5 },
    durability: { adaptationBase: 520, freestandingBase: 340 },
    functions: ['Vehicle Fabrication', 'Chassis Repair', 'Vehicle Dismantling'],
    inputs: [{ resource: 'metal', amountPerDay: 4 }],
    baseDefense: 50,
    freestandingDefense: 25,
    capacityLabel: 'Motor Pool: Build & Repair Station',
    preferredOsmTypes: ['industrial', 'gas_station', 'warehouse'],
  },
  clay_pit: {
    id: 'clay_pit',
    type: 'clay_pit',
    name: 'Clay Pit & Kiln',
    category: 'production',
    description:
      'Excavation pit and high-temperature curing kilns that extract raw clay from the earth and fire it into structural building bricks.',
    researchRequirement: 'clay_processing',
    iconName: 'Hammer',
    badgeColor: '#b45309',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 30, metal: 20, bricks: 15, tools: 1 },
    freestandingCost: { wood: 70, metal: 45, bricks: 30, tools: 2 },
    durability: { adaptationBase: 380, freestandingBase: 240 },
    functions: ['Clay Excavation', 'Brick Kiln Firing', 'Masonry Supply'],
    inputs: [{ resource: 'wood', amountPerDay: 3 }],
    outputs: [{ resource: 'bricks', amountPerDay: 12 }],
    baseDefense: 35,
    freestandingDefense: 18,
    capacityLabel: 'Output: 12 Bricks/day',
    preferredOsmTypes: ['industrial', 'residential'],
  },

  // ==========================================
  // 4. DEFENSIVE WALLS & GATES
  // ==========================================
  barbed_wire: {
    id: 'barbed_wire',
    type: 'barbed_wire',
    name: 'Barbed Wire',
    category: 'defense_walls',
    description:
      'Razor-wire coiled barrier. Slows down approaching infected by 60% and inflicts contact bleed damage to incoming hostile swarms.',
    iconName: 'ShieldAlert',
    badgeColor: '#f43f5e',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 1,
    // §7.1 Hazard, not a barrier: wire does not block pathing — it slows
    // infected crossing it by 60% and bleeds them for 15 HP/second.
    blocksMovement: false,
    slowsInfectedPct: 60,
    damageOnContact: 15,
    // §IFZ: wire damages/slows rather than blocks — and it is a hazard, not a
    // firing position. Guards are never stationed on it.
    guardable: false,
    adaptationCost: { wood: 0, metal: 12, bricks: 0 },
    freestandingCost: { wood: 0, metal: 12, bricks: 0 },
    durability: { adaptationBase: 80, freestandingBase: 80 },
    functions: ['Horde Slowing (60%)', 'Contact Bleed Damage'],
    defenceProperties: {
      baseDefense: 10,
    },
    baseDefense: 10,
    freestandingDefense: 10,
    capacityLabel: 'Barrier: Slows & Damages Hostiles',
  },
  wooden_palisade: {
    id: 'wooden_palisade',
    type: 'wooden_palisade',
    name: 'Wooden Palisade',
    category: 'defense_walls',
    description:
      'Sharpened timber log stockade that physically blocks infected pathing and creates a protected perimeter boundary.',
    iconName: 'Shield',
    badgeColor: '#b45309',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 2,
    blocksMovement: true,
    // §IFZ: a wall is a passive barrier — not a manned firing post.
    guardable: false,
    adaptationCost: { wood: 20, metal: 2, bricks: 0 },
    freestandingCost: { wood: 20, metal: 2, bricks: 0 },
    durability: { adaptationBase: 220, freestandingBase: 220 },
    functions: ['Infected Pathing Block', 'Perimeter Enclosure'],
    defenceProperties: { baseDefense: 25, coverBonus: 30 },
    baseDefense: 25,
    freestandingDefense: 25,
    capacityLabel: 'Perimeter: Basic Wooden Wall',
  },
  wooden_gate: {
    id: 'wooden_gate',
    type: 'wooden_gate',
    name: 'Wooden Gate',
    category: 'defense_walls',
    description:
      'Reinforced timber gate with heavy locking beam. Blocks infected while allowing friendly survivors, squads, and vehicles to pass safely.',
    iconName: 'Shield',
    badgeColor: '#d97706',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 2,
    blocksMovement: true,
    allowsFriendlyPassage: true,
    guardable: true,
    adaptationCost: { wood: 35, metal: 10, bricks: 0 },
    freestandingCost: { wood: 35, metal: 10, bricks: 0 },
    durability: { adaptationBase: 260, freestandingBase: 260 },
    functions: ['Friendly Passage Access', 'Infected Lockdown', 'Guard Sentry Slot'],
    defenceProperties: { baseDefense: 30, sentryCapacity: 2, allowsFriendlyPassage: true },
    baseDefense: 30,
    freestandingDefense: 30,
    capacityLabel: 'Accessway: Friendly Passable Gate',
  },
  metal_fence: {
    id: 'metal_fence',
    type: 'metal_fence',
    name: 'Metal Fence',
    category: 'defense_walls',
    description:
      'Welded steel mesh and galvanized pipe fence. Stronger than wood, offering high durability against horde pressure.',
    iconName: 'Shield',
    badgeColor: '#64748b',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 2,
    blocksMovement: true,
    // §IFZ: fences are passive barriers — never staffed firing posts.
    guardable: false,
    adaptationCost: { wood: 5, metal: 30, bricks: 5 },
    freestandingCost: { wood: 5, metal: 30, bricks: 5 },
    durability: { adaptationBase: 380, freestandingBase: 380 },
    functions: ['Reinforced Perimeter', 'High Durability Barrier'],
    defenceProperties: { baseDefense: 45, coverBonus: 40 },
    baseDefense: 45,
    freestandingDefense: 45,
    capacityLabel: 'Perimeter: Steel Mesh Fence',
  },
  metal_gate: {
    id: 'metal_gate',
    type: 'metal_gate',
    name: 'Metal Gate',
    category: 'defense_walls',
    description:
      'Heavy steel swing gate with motorized latch. Accommodates squad guards and withstands heavy vehicular and horde impacts.',
    iconName: 'Shield',
    badgeColor: '#475569',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 2,
    blocksMovement: true,
    allowsFriendlyPassage: true,
    guardable: true,
    adaptationCost: { wood: 5, metal: 45, bricks: 10 },
    freestandingCost: { wood: 5, metal: 45, bricks: 10 },
    durability: { adaptationBase: 440, freestandingBase: 440 },
    functions: ['Friendly Vehicle Access', 'Heavy Steel Lockdown', 'Guard Sentry Slot'],
    defenceProperties: { baseDefense: 50, sentryCapacity: 2, allowsFriendlyPassage: true },
    baseDefense: 50,
    freestandingDefense: 50,
    capacityLabel: 'Accessway: Heavy Steel Gate',
  },
  brick_wall: {
    id: 'brick_wall',
    type: 'brick_wall',
    name: 'Brick Wall',
    category: 'defense_walls',
    description:
      'Double-thick mortar and fired brick wall. Resilient to infected attacks and provides excellent bullet cover.',
    iconName: 'Shield',
    badgeColor: '#ea580c',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 2,
    blocksMovement: true,
    // §IFZ: solid walls are passive barriers — not a manned firing post.
    guardable: false,
    adaptationCost: { wood: 5, metal: 5, bricks: 35 },
    freestandingCost: { wood: 5, metal: 5, bricks: 35 },
    durability: { adaptationBase: 420, freestandingBase: 420 },
    functions: ['Masonry Barrier', 'Ballistic Cover'],
    defenceProperties: { baseDefense: 50, coverBonus: 60 },
    baseDefense: 50,
    freestandingDefense: 50,
    capacityLabel: 'Perimeter: Solid Brick Wall',
  },
  fortified_wall: {
    id: 'fortified_wall',
    type: 'fortified_wall',
    name: 'Fortified Wall',
    category: 'defense_walls',
    description:
      'Rebar-reinforced concrete rampart with battlements and firing slits. Withstands massive horde sieges and explosive shocks.',
    researchRequirement: 'advanced_masonry',
    iconName: 'Shield',
    badgeColor: '#334155',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 3,
    blocksMovement: true,
    // §IFZ: bastion walls are passive barriers — garrison fire comes from
    // towers and gatehouses, never from the wall run itself.
    guardable: false,
    adaptationCost: { wood: 10, metal: 30, bricks: 50, tools: 1 },
    freestandingCost: { wood: 10, metal: 30, bricks: 50, tools: 1 },
    durability: { adaptationBase: 750, freestandingBase: 750 },
    functions: ['Apex Bastion Wall', 'Rampart Firing Slits', 'Horde Siege Absorption'],
    defenceProperties: { baseDefense: 80, coverBonus: 85 },
    baseDefense: 80,
    freestandingDefense: 80,
    capacityLabel: 'Bastion: Reinforced Concrete Wall',
  },
  fortified_gate: {
    id: 'fortified_gate',
    type: 'fortified_gate',
    name: 'Fortified Gate',
    category: 'defense_walls',
    description:
      'Reinforced concrete portal with hydraulic portcullis, overhead guard walkway, and automated interlocks.',
    researchRequirement: 'advanced_masonry',
    iconName: 'Shield',
    badgeColor: '#1e293b',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 3,
    blocksMovement: true,
    allowsFriendlyPassage: true,
    guardable: true,
    adaptationCost: { wood: 15, metal: 55, bricks: 60, tools: 2 },
    freestandingCost: { wood: 15, metal: 55, bricks: 60, tools: 2 },
    durability: { adaptationBase: 800, freestandingBase: 800 },
    functions: ['Bastion Gatehouse', 'Automated Portcullis', 'Overhead Firing Sentry Platform'],
    // §IFZ: the fortified gatehouse garrison is six armed workers.
    defenceProperties: { baseDefense: 85, sentryCapacity: 6, allowsFriendlyPassage: true },
    baseDefense: 85,
    freestandingDefense: 85,
    capacityLabel: 'Bastion: Hydraulic Reinforced Gate',
  },

  // ==========================================
  // 5. DEFENSIVE TOWERS
  // ==========================================
  wooden_tower: {
    id: 'wooden_tower',
    type: 'wooden_tower',
    name: 'Wooden Tower',
    category: 'defense_towers',
    description:
      'Elevated wooden watchtower platform. Accommodates 2 armed guards, expands line-of-sight vision over fog of war, and provides height-advantage firing accuracy.',
    iconName: 'Eye',
    badgeColor: '#d97706',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 45, metal: 10, bricks: 10 },
    freestandingCost: { wood: 45, metal: 10, bricks: 10 },
    durability: { adaptationBase: 280, freestandingBase: 280 },
    functions: ['Elevated Perimeter Vision', '2 Guard Sentry Posts', 'Height Range Bonus'],
    defenceProperties: { baseDefense: 35, sentryCapacity: 2, attackRangeM: 120 },
    blocksMovement: true,
    guardable: true,
    weaponMountable: true,
    weaponSlots: 2,
    baseDefense: 35,
    freestandingDefense: 35,
    capacityLabel: 'Sentry: 2 Guards (120m Range)',
  },
  metal_tower: {
    id: 'metal_tower',
    type: 'metal_tower',
    name: 'Metal Tower',
    category: 'defense_towers',
    description:
      'Steel truss watchtower with armor-plated observation booth. Accommodates up to 3 guards with expanded vision and rifle range.',
    iconName: 'Eye',
    badgeColor: '#475569',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 3,
    adaptationCost: { wood: 15, metal: 55, bricks: 15 },
    freestandingCost: { wood: 15, metal: 55, bricks: 15 },
    durability: { adaptationBase: 480, freestandingBase: 480 },
    functions: ['Steel Armored Sentry Post', '3 Guard Capacity', '160m Engagement Range'],
    defenceProperties: { baseDefense: 55, sentryCapacity: 3, attackRangeM: 160 },
    blocksMovement: true,
    guardable: true,
    weaponMountable: true,
    weaponSlots: 3,
    baseDefense: 55,
    freestandingDefense: 55,
    capacityLabel: 'Sentry: 3 Guards (160m Range)',
  },
  fortified_tower: {
    id: 'fortified_tower',
    type: 'fortified_tower',
    name: 'Fortified Tower',
    category: 'defense_towers',
    description:
      'Concrete reinforced redoubt tower. Houses 4 heavily armed snipers/gunners, supreme structural HP, and maximum engagement radius.',
    researchRequirement: 'advanced_masonry',
    iconName: 'ShieldAlert',
    badgeColor: '#0f172a',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 20, metal: 60, bricks: 70, tools: 2 },
    freestandingCost: { wood: 20, metal: 60, bricks: 70, tools: 2 },
    durability: { adaptationBase: 700, freestandingBase: 700 },
    functions: ['Heavy Redoubt Platform', '4 Guard Capacity', '200m Sniper Reach'],
    defenceProperties: { baseDefense: 80, sentryCapacity: 4, attackRangeM: 200 },
    blocksMovement: true,
    guardable: true,
    weaponMountable: true,
    weaponSlots: 4,
    baseDefense: 80,
    freestandingDefense: 80,
    capacityLabel: 'Redoubt: 4 Guards (200m Range)',
  },
  floodlight_tower: {
    id: 'floodlight_tower',
    type: 'floodlight_tower',
    name: 'Floodlight Tower',
    category: 'defense_towers',
    description:
      'High-intensity halogen searchlight mast. Pierces darkness and suppresses nighttime infected aggression in a wide illuminated cone.',
    iconName: 'Sun',
    badgeColor: '#facc15',
    adaptationAllowed: false, // §Terminus infra: purpose-built and freestanding only (like Cistern/Generator)
    constructionAllowed: true,
    workerCapacity: 1,
    blocksMovement: true,
    // A floodlight is powered illumination, not a garrison — no guard post.
    guardable: false,
    adaptationCost: { wood: 15, metal: 45, bricks: 10 },
    freestandingCost: { wood: 30, metal: 80, bricks: 25 },
    durability: { adaptationBase: 350, freestandingBase: 220 },
    functions: ['Night Illumination', 'Zombie UV Suppression', 'Fog of War Penetration'],
    defenceProperties: { baseDefense: 30, hasSpotlight: true, attackRangeM: 150 },
    baseDefense: 30,
    freestandingDefense: 20,
    capacityLabel: 'Illumination: 150m Night Cone',
    preferredOsmTypes: ['industrial', 'civic', 'gas_station'],
  },

  // ==========================================
  // 6. COMMUNICATION & UTILITY
  // ==========================================
  antenna: {
    id: 'antenna',
    type: 'antenna',
    name: 'Antenna',
    category: 'utility',
    description:
      'Radio broadcast tower and receiver. Transmits recruitment beacons to invite hidden survivor groups to join the zone, and allows instant emergency squad recall orders.',
    researchRequirement: 'basic_antenna', // IFZ: Basic Antenna Technology
    iconName: 'Radio',
    badgeColor: '#8b5cf6',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 20, metal: 50, bricks: 15 },
    freestandingCost: { wood: 50, metal: 120, bricks: 30 },
    durability: { adaptationBase: 350, freestandingBase: 220 },
    functions: ['Survivor Recruitment Broadcast', 'Instant Squad Recall', 'Radio Communications'],
    baseDefense: 30,
    freestandingDefense: 15,
    capacityLabel: 'Broadcast: Long-range Radio Array',
    preferredOsmTypes: ['civic', 'school', 'commercial'],
  },
  research_center: {
    id: 'research_center',
    type: 'research_center',
    name: 'Research Center',
    category: 'utility',
    description:
      'Scientific laboratories, drafting tables, and reference archives. Staffed research centers produce Scientific Materials, which fund every settlement research project.',
    iconName: 'FlaskConical',
    badgeColor: '#6366f1',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 6,
    outputs: [{ resource: 'scientific_materials', amountPerDay: 8 }],
    adaptationCost: { wood: 40, metal: 45, bricks: 35, tools: 2 },
    freestandingCost: { wood: 120, metal: 130, bricks: 100, tools: 4 },
    // §IFZ: 1 Scientific Material required to establish a Research Center — a
    // one-time flat surcharge (never volume-scaled), separate from the
    // size-derived construction bill below.
    constructionSurcharge: {
      wood: 0,
      metal: 0,
      bricks: 0,
      tools: 0,
      scientific_materials: 1,
    },
    durability: { adaptationBase: 480, freestandingBase: 300 },
    functions: ['Technology Research', 'Scientific Material Production', 'Scientific Analysis'],
    baseDefense: 40,
    freestandingDefense: 20,
    capacityLabel: 'Sci Materials: 8 / Day at Full Staff',
    preferredOsmTypes: ['school', 'civic', 'hospital', 'commercial'],
  },
  weather_center: {
    id: 'weather_center',
    type: 'weather_center',
    name: 'Weather Center',
    category: 'utility',
    description:
      'Barometric telemetry station, Doppler anemometers, and storm radar. Accurately predicts multi-day weather changes, seasonal freezes, and incoming blizzards.',
    researchRequirement: 'weather_forecast',
    iconName: 'Sun',
    badgeColor: '#0284c7',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 3,
    adaptationCost: { wood: 30, metal: 40, bricks: 25 },
    freestandingCost: { wood: 90, metal: 110, bricks: 70 },
    durability: { adaptationBase: 400, freestandingBase: 250 },
    functions: ['Multi-Day Weather Forecast', 'Blizzard Warning', 'Storm Radar'],
    baseDefense: 35,
    freestandingDefense: 18,
    capacityLabel: 'Radar: 9-Day Weather Forecast',
    preferredOsmTypes: ['civic', 'school', 'commercial'],
  },
  medbay: {
    id: 'medbay',
    type: 'medbay',
    name: 'Medbay',
    category: 'utility',
    description:
      'Clinical triage facility. Staffed doctors and medics treat wounded and infected citizens/squad operatives, and manufacture First Aid Kits from sterile bandages.',
    researchRequirement: 'medical_care',
    iconName: 'HeartPulse',
    badgeColor: '#ec4899',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 35, metal: 40, bricks: 30, tools: 2 },
    freestandingCost: { wood: 100, metal: 120, bricks: 85, tools: 3 },
    durability: { adaptationBase: 420, freestandingBase: 260 },
    functions: ['Wound Triage', 'Infection Treatment', 'First Aid Kit Production'],
    medicalProperties: {
      treatsWounded: true,
      treatsInfection: true,
      treatsSevereTrauma: false,
      producesFirstAid: true,
      bedCapacity: 6,
      cureOddsBonusPct: 35,
    },
    baseDefense: 40,
    freestandingDefense: 20,
    capacityLabel: 'Clinic: 6 Patient Triage Beds',
    preferredOsmTypes: ['hospital', 'pharmacy', 'commercial', 'civic'],
  },
  hospital: {
    id: 'hospital',
    type: 'hospital',
    name: 'Hospital',
    category: 'utility',
    description:
      'Full-scale surgical trauma center. Performs complex surgeries, treats severe life-threatening injuries, and synthesizes high-grade antibiotics and cures.',
    researchRequirement: 'surgery',
    iconName: 'HeartPulse',
    badgeColor: '#f43f5e',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 8,
    adaptationCost: { wood: 50, metal: 75, bricks: 60, tools: 4 },
    freestandingCost: { wood: 150, metal: 210, bricks: 180, tools: 6 },
    durability: { adaptationBase: 650, freestandingBase: 420 },
    functions: ['Trauma Surgery', 'Critical Care', 'Advanced Cure Synthesis', 'Intensive Care Unit'],
    medicalProperties: {
      treatsWounded: true,
      treatsInfection: true,
      treatsSevereTrauma: true,
      producesFirstAid: true,
      bedCapacity: 16,
      cureOddsBonusPct: 75,
    },
    baseDefense: 60,
    freestandingDefense: 35,
    capacityLabel: 'Trauma ICU: 16 Beds + Surgery Suite',
    preferredOsmTypes: ['hospital', 'pharmacy', 'civic'],
  },
  repairmen_shop: {
    id: 'repairmen_shop',
    type: 'repairmen_shop',
    name: 'Repairmen Shop',
    category: 'utility',
    description:
      'Dedicated engineering maintenance depot. Automatically dispatches repair crews to rebuild damaged gates, walls, and structures within settlement borders.',
    iconName: 'Wrench',
    badgeColor: '#eab308',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 30, metal: 35, bricks: 25, tools: 2 },
    freestandingCost: { wood: 90, metal: 100, bricks: 70, tools: 4 },
    durability: { adaptationBase: 420, freestandingBase: 260 },
    functions: ['Auto-Repair Damaged Buildings', 'Structural Reinforcement', 'Maintenance Crew Dispatch'],
    baseDefense: 40,
    freestandingDefense: 20,
    capacityLabel: 'Maintenance: Auto-Repair Crew',
    preferredOsmTypes: ['industrial', 'commercial', 'warehouse'],
  },
  shooting_range: {
    id: 'shooting_range',
    type: 'shooting_range',
    name: 'Shooting Range',
    category: 'utility',
    description:
      'Target berms and urban breaching killhouses. Trains citizens and squad members in combat marksmanship, boosting offensive stats and reload times.',
    researchRequirement: 'combat_training',
    iconName: 'Crosshair',
    badgeColor: '#ea580c',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 40, metal: 30, bricks: 30, tools: 1 },
    freestandingCost: { wood: 100, metal: 80, bricks: 75, tools: 2 },
    durability: { adaptationBase: 400, freestandingBase: 250 },
    functions: ['Combat Skill Training', 'Marksmanship Drills', 'Squad Combat Buff'],
    baseDefense: 45,
    freestandingDefense: 25,
    capacityLabel: 'Training: +Combat Proficiency',
    preferredOsmTypes: ['police', 'civic', 'industrial'],
  },
  expedition_center: {
    id: 'expedition_center',
    type: 'expedition_center',
    name: 'Expedition Center',
    category: 'utility',
    description:
      'Strategic logistics headquarters for inter-colony operations. Coordinates long-distance caravans, settlement-to-settlement expeditions, and overland route planning.',
    iconName: 'Maximize2',
    badgeColor: '#14b8a6',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 3,
    adaptationCost: { wood: 35, metal: 25, bricks: 20 },
    freestandingCost: { wood: 95, metal: 70, bricks: 60 },
    durability: { adaptationBase: 380, freestandingBase: 240 },
    functions: ['Expedition Logistics', 'Caravan Coordination', 'Long-Range Route Planning'],
    baseDefense: 35,
    freestandingDefense: 18,
    capacityLabel: 'Logistics: Caravan & Expedition HQ',
    preferredOsmTypes: ['civic', 'commercial', 'school'],
  },

  // ==========================================
  // 7. CIVILIAN & MORALE
  // ==========================================
  kindergarten: {
    id: 'kindergarten',
    type: 'kindergarten',
    name: 'Kindergarten',
    category: 'civilian',
    description:
      'Communal daycare and children sanctuary. Cares for survivor children, satisfying parental happiness and granting a steady settlement-wide morale boost.',
    researchRequirement: 'nursery',
    iconName: 'Users',
    badgeColor: '#f472b6',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 3,
    adaptationCost: { wood: 30, metal: 15, bricks: 20 },
    freestandingCost: { wood: 85, metal: 45, bricks: 55 },
    durability: { adaptationBase: 340, freestandingBase: 210 },
    functions: ['Childcare Capacity', 'Parental Peace of Mind', 'Morale Boost (+20)'],
    civilianProperties: { childcareCapacity: 20, entertainmentMoraleBonus: 20 },
    baseDefense: 30,
    freestandingDefense: 15,
    capacityLabel: 'Daycare: 20 Children Capacity',
    preferredOsmTypes: ['school', 'residential', 'civic'],
  },
  bar: {
    id: 'bar',
    type: 'bar',
    name: 'Bar / Tavern',
    category: 'civilian',
    description:
      'Community watering hole and microbrewery. Converts harvested Grain into Beer at an efficient ratio (1 Grain → 8 Beer) with NO research required, fulfilling recreation needs and boosting colony morale.',
    iconName: 'UtensilsCrossed',
    badgeColor: '#d97706',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 3,
    adaptationCost: { wood: 40, metal: 20, bricks: 30 },
    freestandingCost: { wood: 110, metal: 55, bricks: 80 },
    durability: { adaptationBase: 380, freestandingBase: 240 },
    functions: ['Grain Fermentation', 'Beer Brewing', 'Recreation & Morale (+25)'],
    // §IFZ: the Bar has no research requirement and brews 1 Grain → 8 Beer
    // (Terminus keeps its own citizen-beer demand/morale model on top).
    inputs: [{ resource: 'grain', amountPerDay: 1 }],
    outputs: [{ resource: 'beer', amountPerDay: 8 }],
    civilianProperties: { entertainmentMoraleBonus: 25, beerOutputPerCycle: 8 },
    baseDefense: 35,
    freestandingDefense: 18,
    capacityLabel: 'Tavern: 1 Grain -> 8 Beer & Morale',
    preferredOsmTypes: ['restaurant', 'commercial'],
  },
  gathering_place: {
    id: 'gathering_place',
    type: 'gathering_place',
    name: 'Gathering Place',
    category: 'civilian',
    description:
      'Town hall and town square forum. Fosters social cohesion, community assemblies, and prevents unrest among citizens.',
    iconName: 'Users',
    badgeColor: '#ec4899',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 35, metal: 15, bricks: 25 },
    freestandingCost: { wood: 95, metal: 45, bricks: 70 },
    durability: { adaptationBase: 360, freestandingBase: 220 },
    functions: ['Community Assembly', 'Social Cohesion', 'Unrest Reduction'],
    civilianProperties: { socialCapacity: 40, entertainmentMoraleBonus: 15 },
    baseDefense: 35,
    freestandingDefense: 18,
    capacityLabel: 'Assembly: 40 Citizens Capacity',
    preferredOsmTypes: ['civic', 'school', 'commercial', 'restaurant'],
  },

  // ==========================================
  // 8. DECORATIVE & MISC
  // ==========================================
  mast: {
    id: 'mast',
    type: 'mast',
    name: 'Colony Mast',
    category: 'decorative',
    description:
      'Prominent landmark mast displaying the colony banner and beacon light, instilling pride and territorial presence.',
    iconName: 'Flame',
    badgeColor: '#64748b',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 1,
    adaptationCost: { wood: 20, metal: 15, bricks: 5 },
    freestandingCost: { wood: 20, metal: 15, bricks: 5 },
    durability: { adaptationBase: 150, freestandingBase: 150 },
    functions: ['Colony Pride', 'Visual Landmark', 'Territory Beacon'],
    baseDefense: 10,
    freestandingDefense: 10,
    capacityLabel: 'Landmark: Colony Pride',
  },

  // ==========================================
  // LEGACY ALIASES FOR BACKWARDS COMPATIBILITY
  // ==========================================
  shelter_bunkhouse: {
    id: 'shelter_bunkhouse',
    type: 'shelter',
    name: 'Shelter / Bunkhouse',
    category: 'basic',
    description: 'Converts rooms into insulated living quarters with bunks and heat.',
    iconName: 'Bed',
    badgeColor: '#3b82f6',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 45, metal: 15, bricks: 20 },
    freestandingCost: { wood: 140, metal: 50, bricks: 60 },
    durability: { adaptationBase: 350, freestandingBase: 200 },
    functions: ['Citizen Residence', 'Rest & Recuperation'],
    housingCapacity: 12,
    baseDefense: 40,
    freestandingDefense: 15,
    capacityLabel: 'Living Capacity: 1 occupant per 12 m² floor area',
    preferredOsmTypes: ['residential', 'commercial', 'school'],
  },
  storage_depot: {
    id: 'storage_depot',
    type: 'warehouse',
    name: 'Storage Depot',
    category: 'basic',
    description: 'Reinforced pallet racks, moisture barriers, and inventory shelving.',
    iconName: 'Archive',
    badgeColor: '#94A3B8',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 30, metal: 40, bricks: 15 },
    freestandingCost: { wood: 100, metal: 120, bricks: 50 },
    durability: { adaptationBase: 500, freestandingBase: 300 },
    functions: ['Bulk Storage', 'Inventory Shelving'],
    storageCapacity: 400,
    baseDefense: 50,
    freestandingDefense: 20,
    capacityLabel: 'Storage Capacity: 1.2 resource slots per m³ volume',
    preferredOsmTypes: ['warehouse', 'industrial', 'supermarket', 'commercial'],
  },
  water_cistern: {
    id: 'water_cistern',
    type: 'water_cistern',
    name: 'Water Cistern / Rain Collector',
    category: 'basic',
    description: 'Guttering networks and filtered holding tanks for potable water.',
    iconName: 'Droplets',
    badgeColor: '#0ea5e9',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 25, metal: 35, bricks: 25 },
    freestandingCost: { wood: 70, metal: 90, bricks: 60 },
    researchRequirement: 'basic_sanitation',
    durability: { adaptationBase: 350, freestandingBase: 200 },
    functions: ['Water Storage', 'Rain Catchment'],
    baseDefense: 35,
    freestandingDefense: 15,
    capacityLabel: 'Water Capacity: 25 units per 10 m² roof area',
    preferredOsmTypes: ['residential', 'civic', 'warehouse'],
  },
  greenhouse_hydro: {
    id: 'greenhouse_hydro',
    type: 'greenhouse',
    name: 'Greenhouse / Hydroponics',
    category: 'food',
    description: 'Rooftop glazed beds and solar water trays for fresh crops.',
    iconName: 'Sprout',
    badgeColor: '#34d399',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 40, metal: 50, bricks: 20 },
    freestandingCost: { wood: 120, metal: 140, bricks: 40 },
    durability: { adaptationBase: 300, freestandingBase: 180 },
    functions: ['All-Weather Harvest', 'Hydroponics'],
    baseDefense: 25,
    freestandingDefense: 10,
    capacityLabel: 'Harvest Yield: 1 fresh yield per 18 m² footprint',
    preferredOsmTypes: ['commercial', 'school', 'supermarket'],
  },
  food_pantry: {
    id: 'food_pantry',
    type: 'warehouse',
    name: 'Food Pantry / Dry Storage',
    category: 'food',
    description: 'Elevated vermin-proof storage bins and temperature-controlled pantries.',
    iconName: 'Utensils',
    badgeColor: '#eab308',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 30, metal: 20, bricks: 30 },
    freestandingCost: { wood: 80, metal: 60, bricks: 80 },
    durability: { adaptationBase: 400, freestandingBase: 250 },
    functions: ['Food Storage', 'Pest Proofing'],
    baseDefense: 40,
    freestandingDefense: 20,
    capacityLabel: 'Food Shelf-life: 40 units per 20 m² floor',
    preferredOsmTypes: ['restaurant', 'supermarket', 'commercial'],
  },
  workshop_forge: {
    id: 'workshop_forge',
    type: 'tool_factory',
    name: 'Workshop / Forge',
    category: 'production',
    description: 'Forges, anvils, and workbenches for tools and gear.',
    iconName: 'Hammer',
    badgeColor: '#f59e0b',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 35, metal: 50, bricks: 35 },
    freestandingCost: { wood: 100, metal: 150, bricks: 90 },
    durability: { adaptationBase: 450, freestandingBase: 280 },
    functions: ['Tool Crafting', 'Component Repair'],
    baseDefense: 45,
    freestandingDefense: 20,
    capacityLabel: 'Crafting Output: 1 workbench per 25 m² floor',
    preferredOsmTypes: ['industrial', 'commercial'],
  },
  timber_mill: {
    id: 'timber_mill',
    type: 'sawmill',
    name: 'Timber Mill',
    category: 'production',
    description: 'Saw pits and planers for processing logs into wood planks.',
    iconName: 'Trees',
    badgeColor: '#d97706',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 50, metal: 30, bricks: 20 },
    freestandingCost: { wood: 140, metal: 90, bricks: 60 },
    durability: { adaptationBase: 420, freestandingBase: 260 },
    functions: ['Lumber Milling', 'Timber Conversion'],
    baseDefense: 40,
    freestandingDefense: 15,
    capacityLabel: 'Milling Yield: 1 saw line per 30 m² floor',
    preferredOsmTypes: ['industrial', 'warehouse'],
  },
  scrap_smelter: {
    id: 'scrap_smelter',
    type: 'scrapyard',
    name: 'Scrap Smelter',
    category: 'production',
    description: 'Furnaces to melt down scrap metal and vehicle parts into usable metal.',
    iconName: 'Layers',
    badgeColor: '#78716c',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 30, metal: 45, bricks: 50 },
    freestandingCost: { wood: 80, metal: 130, bricks: 150 },
    durability: { adaptationBase: 480, freestandingBase: 300 },
    functions: ['Scrap Smelting', 'Metal Ingot Casting'],
    baseDefense: 45,
    freestandingDefense: 20,
    capacityLabel: 'Smelting Output: 1 furnace per 35 m² floor',
    preferredOsmTypes: ['industrial', 'warehouse'],
  },
  guard_watchtower: {
    id: 'guard_watchtower',
    type: 'wooden_tower',
    name: 'Guard Watchtower',
    category: 'defense_towers',
    description: 'Elevated parapet and sandbag nests for sentries.',
    iconName: 'Shield',
    badgeColor: '#ef4444',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 40, metal: 30, bricks: 20 },
    freestandingCost: { wood: 110, metal: 80, bricks: 60 },
    durability: { adaptationBase: 400, freestandingBase: 250 },
    functions: ['Sentry Post', 'Elevated Line of Sight'],
    baseDefense: 65,
    freestandingDefense: 30,
    capacityLabel: 'Defense Score: +40 to +90 & 2 sentry posts',
    preferredOsmTypes: ['civic', 'police', 'commercial'],
  },
  barricade_gatehouse: {
    id: 'barricade_gatehouse',
    type: 'wooden_gate',
    name: 'Barricade Gatehouse',
    category: 'defense_walls',
    description: 'Drop-down steel portcullis and sandbag checkpoint.',
    iconName: 'ShieldAlert',
    badgeColor: '#dc2626',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 40, metal: 50, bricks: 30 },
    freestandingCost: { wood: 100, metal: 140, bricks: 90 },
    durability: { adaptationBase: 500, freestandingBase: 350 },
    functions: ['Perimeter Security', 'Entry Checkpoint'],
    baseDefense: 70,
    freestandingDefense: 35,
    capacityLabel: 'Checkpoint: Fortified entry corridor',
    preferredOsmTypes: ['civic', 'police', 'commercial'],
  },
  armory_cache: {
    id: 'armory_cache',
    type: 'arms_factory',
    name: 'Armory Cache',
    category: 'production',
    description: 'Reinforced gun safes and reloading benches.',
    iconName: 'Crosshair',
    badgeColor: '#b91c1c',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 20, metal: 60, bricks: 30 },
    freestandingCost: { wood: 60, metal: 170, bricks: 90 },
    durability: { adaptationBase: 550, freestandingBase: 350 },
    functions: ['Weapon Storage', 'Ammo Distribution'],
    baseDefense: 60,
    freestandingDefense: 30,
    capacityLabel: 'Ammo Storage: 100 rounds per 15 m²',
    preferredOsmTypes: ['police', 'civic', 'commercial'],
  },
  infirmary_clinic: {
    id: 'infirmary_clinic',
    type: 'medbay',
    name: 'Infirmary Clinic',
    category: 'utility',
    description: 'Sterile triage cots, medical storage, and burn treatment stations.',
    iconName: 'HeartPulse',
    badgeColor: '#ec4899',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 30, metal: 35, bricks: 25 },
    freestandingCost: { wood: 90, metal: 110, bricks: 70 },
    durability: { adaptationBase: 400, freestandingBase: 250 },
    functions: ['Wound Triage', 'Infection Recovery'],
    baseDefense: 40,
    freestandingDefense: 20,
    capacityLabel: 'Medical Beds: 1 patient per 20 m² floor',
    preferredOsmTypes: ['hospital', 'pharmacy', 'commercial', 'civic'],
  },
  community_hall: {
    id: 'community_hall',
    type: 'gathering_place',
    name: 'Community Hall',
    category: 'civilian',
    description: 'Common meeting hall, bulletin boards, and recreation tables.',
    iconName: 'Users',
    badgeColor: '#a855f7',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 40, metal: 20, bricks: 30 },
    freestandingCost: { wood: 120, metal: 60, bricks: 90 },
    durability: { adaptationBase: 380, freestandingBase: 240 },
    functions: ['Community Morale', 'Assembly Area'],
    baseDefense: 35,
    freestandingDefense: 15,
    capacityLabel: 'Social Capacity: 1 survivor per 10 m² floor',
    preferredOsmTypes: ['civic', 'school', 'commercial', 'restaurant'],
  },
  generator_station: {
    id: 'generator_station',
    type: 'generator_station',
    name: 'Generator Station',
    category: 'utility',
    description:
      'Fuel-burning microgenerator that distributes electricity within a local radius. Powers hospitals, research, workshops, and floodlights — and burns gasoline, diesel, or biofuel to do it. When demand exceeds supply, the lowest-priority facilities shut down first.',
    researchRequirement: 'electrical_engineering',
    iconName: 'Zap',
    badgeColor: '#facc15',
    adaptationAllowed: false,
    constructionAllowed: true,
    workerCapacity: 3,
    adaptationCost: { wood: 20, metal: 60, bricks: 30, tools: 3 },
    freestandingCost: { wood: 60, metal: 170, bricks: 90, tools: 6 },
    durability: { adaptationBase: 450, freestandingBase: 300 },
    functions: ['Electricity Generation (50 kW)', '60m Local Microgrid', 'Fuel Combustion'],
    powerProperties: {
      powerOutputKw: 50,
      powerRadiusM: 60,
      fuelPerHour: 5,
      fuelCapacity: 100,
    },
    baseDefense: 45,
    freestandingDefense: 20,
    capacityLabel: 'Grid: 50 kW over 60m — 5 Fuel/hour',
    preferredOsmTypes: ['industrial', 'gas_station'],
  },
  battery_bank: {
    id: 'battery_bank',
    type: 'battery_bank',
    name: 'Battery Bank',
    category: 'utility',
    description:
      'High-capacity storage cells — the emergency reserve. While a generator produces a surplus the banks charge; a charged bank acts as a local GRID EXTENSION from its own position, carrying critical facilities through a fuel gap until the generator is back.',
    researchRequirement: 'battery_storage',
    iconName: 'BatteryCharging',
    badgeColor: '#22d3ee',
    adaptationAllowed: false, // §Terminus infra: purpose-built and freestanding only (like Cistern/Generator)
    constructionAllowed: true,
    workerCapacity: 1,
    adaptationCost: { wood: 15, metal: 80, bricks: 25, tools: 2 },
    freestandingCost: { wood: 45, metal: 220, bricks: 70, tools: 4 },
    durability: { adaptationBase: 320, freestandingBase: 200 },
    functions: ['200 kWh Storage', '30 kW Charge Rate', '40 kW Discharge', 'GRID EXTENSION: 60m Reserve Reach'],
    batteryProperties: {
      capacityKwh: 200,
      chargeKw: 30,
      dischargeKw: 40,
      powerRadiusM: 60,
    },
    baseDefense: 30,
    freestandingDefense: 15,
    capacityLabel: 'Storage: 200 kWh — emergency reserve: charges from surplus, extends the grid during fuel gaps',
    preferredOsmTypes: ['industrial', 'warehouse'],
  },
  comms_relay: {
    id: 'comms_relay',
    type: 'antenna',
    name: 'Comms Relay Station',
    category: 'utility',
    description: 'Radio mast, shortwave receivers, and antenna dish arrays.',
    iconName: 'Radio',
    badgeColor: '#8b5cf6',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 2,
    adaptationCost: { wood: 25, metal: 45, bricks: 15 },
    freestandingCost: { wood: 70, metal: 130, bricks: 45 },
    durability: { adaptationBase: 350, freestandingBase: 220 },
    functions: ['Radio Surveillance', 'Survivor Beacon'],
    baseDefense: 30,
    freestandingDefense: 15,
    capacityLabel: 'Relay Range: 5km + 0.3km per metre height',
    preferredOsmTypes: ['civic', 'school', 'commercial'],
  },
  research_lab: {
    id: 'research_lab',
    type: 'research_center',
    name: 'Research Lab',
    category: 'utility',
    description:
      'Microscopes, chemical benches, and technical drafting stations that produce Scientific Materials for the colony research program.',
    iconName: 'FlaskConical',
    badgeColor: '#06b6d4',
    adaptationAllowed: true,
    constructionAllowed: true,
    workerCapacity: 4,
    adaptationCost: { wood: 35, metal: 45, bricks: 30 },
    freestandingCost: { wood: 100, metal: 130, bricks: 90 },
    durability: { adaptationBase: 450, freestandingBase: 280 },
    outputs: [{ resource: 'scientific_materials', amountPerDay: 5 }],
    functions: ['Technology Research', 'Scientific Material Production', 'Infection Analysis'],
    baseDefense: 40,
    freestandingDefense: 20,
    capacityLabel: 'Sci Materials: 5 / Day at Full Staff',
    preferredOsmTypes: ['school', 'civic', 'hospital', 'commercial'],
  },
};

/**
 * Canonical definition for a functional building type id. Some defs are
 * aliases that reuse another type's body via the `type` field (e.g.
 * `guard_watchtower` renders/behaves as `wooden_tower`, `barricade_gatehouse`
 * as `wooden_gate`); this resolves the alias so every subsystem reads the same
 * explicit §7.1 flags instead of string-inferring behaviour from the id.
 */
export function getCanonicalDefenseDef(
  typeId: string
): FunctionalBuildingDefinition | undefined {
  const def = FUNCTIONAL_BUILDING_DEFINITIONS[typeId as FunctionalBuildingTypeId];
  if (!def) return undefined;
  if (def.type && def.type !== typeId) {
    return FUNCTIONAL_BUILDING_DEFINITIONS[def.type];
  }
  return def;
}

/**
 * Legacy alias building ids that duplicate a canonical IFZ building under an
 * old name (e.g. 'Infirmary Clinic' is just Medbay, 'Guard Watchtower' is just
 * Wooden Tower — each def carries `type: <canonical id>` and reuses that body).
 * They stay fully functional for save compatibility but are hidden from every
 * canonical picker so the roster reads cleanly against the IFZ reference: each
 * facility appears once under its real name.
 */
export const LEGACY_ALIAS_BUILDING_TYPE_IDS: ReadonlySet<FunctionalBuildingTypeId> =
  new Set<FunctionalBuildingTypeId>([
    'shelter_bunkhouse',
    'storage_depot',
    'greenhouse_hydro',
    'food_pantry',
    'workshop_forge',
    'timber_mill',
    'scrap_smelter',
    'guard_watchtower',
    'barricade_gatehouse',
    'armory_cache',
    'infirmary_clinic',
    'community_hall',
    'comms_relay',
    'research_lab',
  ]);

/** True when a type id is a legacy save-compat alias of a canonical building. */
export function isLegacyAliasBuildingType(typeId: string): boolean {
  return LEGACY_ALIAS_BUILDING_TYPE_IDS.has(typeId as FunctionalBuildingTypeId);
}

/**
 * Calculates polygon area in square meters using Shoelace formula
 */
export function calculatePolygonArea(polygon: Point2D[]): number {
  if (!polygon || polygon.length < 3) return 50; // Minimum default
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * (polygon[j].z ?? (polygon[j] as any).y ?? 0);
    area -= polygon[j].x * (polygon[i].z ?? (polygon[i] as any).y ?? 0);
  }
  return Math.abs(area) / 2;
}

/**
 * Worker slots a building can actually staff, scaling with physical size like
 * IFZ (roughly 1 slot per 45 m² of footprint). Never below the type's nominal
 * `workerCapacity` for small structures, and capped at 4× nominal so an absurdly
 * large footprint can't swallow the whole labour pool.
 */
export function getBuildingWorkerSlots(b: {
  typeId: FunctionalBuildingTypeId;
  footprintAreaM2?: number;
  /** 0..100 — partial adaptations staff only their converted share. */
  adaptationPercentage?: number;
}): number {
  const def = FUNCTIONAL_BUILDING_DEFINITIONS[b.typeId];
  const area = b.footprintAreaM2 || 50;
  const nominal = def?.workerCapacity || 2;
  const sizeSlots = Math.max(1, Math.round(area / 45));
  const base = Math.max(nominal, Math.min(sizeSlots, nominal * 4));
  const pct = Math.min(100, Math.max(0, b.adaptationPercentage ?? 100)) / 100;
  // A partially converted building staffs only the area it actually uses; any
  // converted share keeps at least one work station.
  const scaled = Math.max(0, Math.round(base * pct));
  return pct > 0 ? Math.max(1, scaled) : 0;
}

/**
 * Calculates adaptive stats based on physical building geometry (§7.1)
 */
export function calculateBuildingStats(
  param1: BuildingPolygon | FunctionalBuildingTypeId,
  param2: BuildingPolygon | FunctionalBuildingTypeId,
  isAdapted: boolean = true
) {
  let bldg: BuildingPolygon;
  let typeId: FunctionalBuildingTypeId;

  if (typeof param1 === 'string') {
    typeId = param1 as FunctionalBuildingTypeId;
    bldg = param2 as BuildingPolygon;
  } else {
    bldg = param1 as BuildingPolygon;
    typeId = param2 as FunctionalBuildingTypeId;
  }

  const footprintArea = bldg?.polygon ? Math.round(calculatePolygonArea(bldg.polygon)) : 50;
  const levels = Math.max(1, bldg?.levels || Math.round((bldg?.height || 4) / 3.5));
  const totalFloorArea = footprintArea * levels;
  const volume = footprintArea * (bldg?.height || 4);

  const def =
    FUNCTIONAL_BUILDING_DEFINITIONS[typeId] ||
    FUNCTIONAL_BUILDING_DEFINITIONS.headquarters;

  let maxCapacity = 10;
  let capacityUnit = 'Units';

  switch (typeId) {
    case 'headquarters':
      maxCapacity = Math.max(16, Math.floor(totalFloorArea / 10));
      capacityUnit = 'HQ Personnel / Beds';
      break;
    case 'squad_quarters':
      maxCapacity = 1;
      capacityUnit = 'Field Squad Slot';
      break;
    case 'warehouse':
    case 'storage_depot':
      maxCapacity = Math.max(100, Math.floor(volume * 0.9));
      capacityUnit = 'Storage Slots';
      break;
    case 'shelter':
    case 'shelter_bunkhouse':
      maxCapacity = Math.max(8, Math.floor(totalFloorArea / 12));
      capacityUnit = 'Beds';
      break;
    case 'house':
      maxCapacity = Math.max(10, Math.floor(totalFloorArea / 10));
      capacityUnit = 'Beds';
      break;
    case 'field':
      maxCapacity = Math.max(6, Math.floor(footprintArea / 15));
      capacityUnit = 'Grain Plots';
      break;
    case 'vast_field':
      maxCapacity = Math.max(16, Math.floor(footprintArea / 12));
      capacityUnit = 'Acreage Plots';
      break;
    case 'greenhouse':
    case 'greenhouse_hydro':
      maxCapacity = Math.max(6, Math.floor(footprintArea / 16));
      capacityUnit = 'Hydro Trays';
      break;
    case 'barn':
      maxCapacity = Math.max(4, Math.floor(footprintArea / 20));
      capacityUnit = 'Livestock Pens';
      break;
    case 'cookhouse':
      maxCapacity = Math.max(8, Math.floor(totalFloorArea / 14));
      capacityUnit = 'Meals / Day';
      break;
    case 'cannery':
      maxCapacity = Math.max(10, Math.floor(totalFloorArea / 15));
      capacityUnit = 'Cans / Day';
      break;
    case 'foresters_hut':
      maxCapacity = Math.max(4, Math.floor(footprintArea / 15));
      capacityUnit = 'Timber Stands';
      break;
    case 'sawmill':
    case 'timber_mill':
      maxCapacity = Math.max(2, Math.floor(totalFloorArea / 25));
      capacityUnit = 'Saw Lines';
      break;
    case 'tool_factory':
    case 'workshop_forge':
      maxCapacity = Math.max(2, Math.floor(totalFloorArea / 25));
      capacityUnit = 'Workbenches';
      break;
    case 'scrapyard':
    case 'scrap_smelter':
      maxCapacity = Math.max(2, Math.floor(totalFloorArea / 30));
      capacityUnit = 'Reclaim Chutes';
      break;
    case 'arms_factory':
    case 'armory_cache':
      maxCapacity = Math.max(2, Math.floor(totalFloorArea / 20));
      capacityUnit = 'Gunsmith Benches';
      break;
    case 'chemical_plant':
      maxCapacity = Math.max(2, Math.floor(totalFloorArea / 25));
      capacityUnit = 'Catalytic Units';
      break;
    case 'protective_gear_factory':
      maxCapacity = Math.max(2, Math.floor(totalFloorArea / 22));
      capacityUnit = 'Armor Presses';
      break;
    case 'vehicle_workshop':
      maxCapacity = Math.max(2, Math.floor(totalFloorArea / 35));
      capacityUnit = 'Vehicle Bays';
      break;
    case 'clay_pit':
      maxCapacity = Math.max(2, Math.floor(footprintArea / 20));
      capacityUnit = 'Kilns';
      break;
    case 'barbed_wire':
    case 'wooden_palisade':
    case 'wooden_gate':
    case 'metal_fence':
    case 'metal_gate':
    case 'brick_wall':
    case 'fortified_wall':
    case 'fortified_gate':
      maxCapacity = 1;
      capacityUnit = 'Fortification Line';
      break;
    case 'wooden_tower':
    case 'metal_tower':
    case 'fortified_tower':
    case 'guard_watchtower':
      maxCapacity = Math.max(2, Math.floor(footprintArea / 8));
      capacityUnit = 'Sentry Posts';
      break;
    case 'floodlight_tower':
      maxCapacity = 1;
      capacityUnit = 'Spotlight Mast';
      break;
    case 'antenna':
    case 'comms_relay':
      maxCapacity = 5 + Math.round(bldg.height * 0.4);
      capacityUnit = 'km Broadcast Range';
      break;
    case 'research_center':
    case 'research_lab':
      maxCapacity = Math.max(2, Math.floor(totalFloorArea / 16));
      capacityUnit = 'Research Benches';
      break;
    case 'weather_center':
      maxCapacity = 5;
      capacityUnit = 'Day Forecast Horizon';
      break;
    case 'medbay':
    case 'infirmary_clinic':
      maxCapacity = Math.max(4, Math.floor(totalFloorArea / 18));
      capacityUnit = 'Clinic Beds';
      break;
    case 'hospital':
      maxCapacity = Math.max(12, Math.floor(totalFloorArea / 14));
      capacityUnit = 'ICU Beds';
      break;
    case 'repairmen_shop':
      maxCapacity = Math.max(2, Math.floor(totalFloorArea / 20));
      capacityUnit = 'Repair Crews';
      break;
    case 'shooting_range':
      maxCapacity = Math.max(4, Math.floor(totalFloorArea / 15));
      capacityUnit = 'Firing Lanes';
      break;
    case 'expedition_center':
      maxCapacity = Math.max(2, Math.floor(totalFloorArea / 20));
      capacityUnit = 'Logistics Stations';
      break;
    case 'kindergarten':
      maxCapacity = Math.max(10, Math.floor(totalFloorArea / 10));
      capacityUnit = 'Childcare Capacity';
      break;
    case 'bar':
      maxCapacity = Math.max(12, Math.floor(totalFloorArea / 12));
      capacityUnit = 'Patron Seats';
      break;
    case 'gathering_place':
    case 'community_hall':
      maxCapacity = Math.max(15, Math.floor(totalFloorArea / 10));
      capacityUnit = 'Community Seats';
      break;
    case 'mast':
      maxCapacity = 1;
      capacityUnit = 'Flag Mast';
      break;
    case 'water_cistern':
      maxCapacity = Math.max(20, Math.floor((footprintArea / 10) * 25));
      capacityUnit = 'Litres';
      break;
    case 'food_pantry':
      maxCapacity = Math.max(40, Math.floor((totalFloorArea / 20) * 40));
      capacityUnit = 'Ration Crates';
      break;
    case 'generator_station':
      maxCapacity = 50 + levels * 15;
      capacityUnit = 'kW Output';
      break;
    default:
      maxCapacity = Math.max(5, Math.floor(totalFloorArea / 15));
      capacityUnit = 'Units';
  }

  // Base defense calculation based on building masonry and levels
  let baseDefense = isAdapted ? def.baseDefense : def.freestandingDefense;
  if (isAdapted) {
    if (
      bldg.type === 'hospital' ||
      bldg.type === 'civic' ||
      bldg.type === 'police'
    ) {
      baseDefense = Math.round(baseDefense * 1.3);
    }
    baseDefense += Math.min(50, levels * 8);
  }

  // Max durability is scaled by footprint and height
  const maxDurability = isAdapted
    ? Math.round(
        (def.durability?.adaptationBase || 300) +
          footprintArea * 1.5 +
          bldg.height * 8
      )
    : def.durability?.freestandingBase || 150;

  return {
    footprintArea,
    totalFloorArea,
    volume,
    maxCapacity,
    capacityUnit,
    baseDefense,
    maxDurability,
  };
}

/**
 * §Terminus adaptation economics: the per-type `adaptationCost` figures on the
 * definitions are REFERENCE prices for a ~800 m³ shell (e.g. a 100 m²
 * one-to-two storey building). Real conversions are charged by the actual
 * physical volume being converted: full cost = reference cost ×
 * (footprintAreaM² × heightM ÷ 800), before the incremental share of a partial
 * conversion is taken — so a tiny house is genuinely cheap and a five-storey
 * warehouse costs proportionally much more, matching the IFZ size-based model.
 * A purpose-fit OSM building still gets its 25% material discount, but the
 * discount is applied to the size-derived price, never to a flat one.
 */
export const ADAPT_REFERENCE_VOLUME_M3 = 800;

/**
 * Full (100%) adaptation material cost for a structure of the given physical
 * size. Omitting the physical metrics falls back to the reference shell
 * (~800 m³), i.e. the raw `adaptationCost` of the definition.
 */
/**
 * One-time flat establishment surcharge for a facility type (e.g. the 1
 * Scientific Material IFZ requires to build a Research Center). Charged once
 * per facility — never volume-, fit-, or percentage-scaled.
 */
export function getConstructionSurcharge(
  typeId: FunctionalBuildingTypeId
): ResourceCost {
  const surcharge = FUNCTIONAL_BUILDING_DEFINITIONS[typeId]?.constructionSurcharge;
  return {
    wood: 0,
    metal: 0,
    bricks: 0,
    tools: 0,
    scientific_materials: surcharge?.scientific_materials || 0,
  };
}

export function getAdaptedCost(
  typeId: FunctionalBuildingTypeId,
  bldgType?: string,
  footprintAreaM2 = 100,
  heightM = 8
): ResourceCost {
  const def =
    FUNCTIONAL_BUILDING_DEFINITIONS[typeId] ||
    FUNCTIONAL_BUILDING_DEFINITIONS.headquarters;
  const volume = Math.max(1, footprintAreaM2) * Math.max(1, heightM);
  const scale = volume / ADAPT_REFERENCE_VOLUME_M3;
  const isPreferred =
    !!bldgType && !!def.preferredOsmTypes && def.preferredOsmTypes.includes(bldgType.toLowerCase());
  const fit = isPreferred ? 0.75 : 1;
  // Zero-cost materials stay zero (e.g. brick-free conversions); everything
  // else keeps a 1-unit floor so no size-scaled conversion is ever "free".
  const scaled = (v: number) =>
    v > 0 ? Math.max(1, Math.round(v * scale * fit)) : 0;
  const surcharge = getConstructionSurcharge(typeId);

  return {
    wood: scaled(def.adaptationCost.wood),
    metal: scaled(def.adaptationCost.metal),
    bricks: scaled(def.adaptationCost.bricks),
    tools: def.adaptationCost.tools ? scaled(def.adaptationCost.tools) : 0,
    scientific_materials: surcharge.scientific_materials,
  };
}
