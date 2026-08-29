import { ColonyBannerConfig, BannerIconId, BannerPatternId, BannerStyleId } from '../types/saveGame';

export interface BannerStyleDef {
  id: BannerStyleId;
  name: string;
  description: string;
  clipClass: string;
}

export interface BannerIconDef {
  id: BannerIconId;
  name: string;
  iconName: string;
  category: 'combat' | 'survival' | 'leadership' | 'industry';
}

export interface BannerPatternDef {
  id: BannerPatternId;
  name: string;
  description: string;
}

export const BANNER_STYLES: BannerStyleDef[] = [
  {
    id: 'torn_standard',
    name: 'Torn Standard',
    description: 'Ragged survival standard weathered through apocalyptic winters.',
    clipClass: 'clip-torn-banner',
  },
  {
    id: 'swallowtail',
    name: 'Swallowtail Chevron',
    description: 'V-cut ceremonial battalion banner.',
    clipClass: 'clip-swallowtail',
  },
  {
    id: 'shield',
    name: 'Fortress Escutcheon',
    description: 'Angular armored shield plate with chamfered corners.',
    clipClass: 'clip-tactical-bracket',
  },
  {
    id: 'heater_shield',
    name: 'Heater Shield',
    description: 'Pointed triangular heraldic chivalry standard.',
    clipClass: 'clip-heater-shield',
  },
  {
    id: 'rounded_shield',
    name: 'Norman Kite Shield',
    description: 'Curved bottom tactical fortification crest.',
    clipClass: 'clip-rounded-shield',
  },
  {
    id: 'hexagon_crest',
    name: 'Hexagon Sigil',
    description: 'Geometric nanotech combat insignia.',
    clipClass: 'clip-hexagon-crest',
  },
  {
    id: 'pennant',
    name: 'Vanguard Pennant',
    description: 'Sharply tapered expedition spearhead.',
    clipClass: 'clip-pennant',
  },
  {
    id: 'triangular_flag',
    name: 'Spear Pennon',
    description: 'Sharp downward isosceles command marker.',
    clipClass: 'clip-triangular-flag',
  },
  {
    id: 'bident_fork',
    name: 'Bident Guidon',
    description: 'Twin-pronged strike detachment guidon.',
    clipClass: 'clip-bident-fork',
  },
  {
    id: 'double_swallowtail',
    name: 'Triple Swallowtail',
    description: 'Tri-pointed heraldic vanguard banner.',
    clipClass: 'clip-double-swallowtail',
  },
  {
    id: 'military_ribbon',
    name: 'Honors Ribbon',
    description: 'Precision die-cut metallic commendation ribbon.',
    clipClass: 'clip-card-chip',
  },
  {
    id: 'notched_gonfalon',
    name: 'War Gonfalon',
    description: 'Double-notched heraldic war expedition banner.',
    clipClass: 'clip-notched-gonfalon',
  },
  {
    id: 'guilloche_taper',
    name: 'Aegis Lance',
    description: 'Deep triangular command vanguard spike.',
    clipClass: 'clip-guilloche-taper',
  },
  {
    id: 'fortified_tower',
    name: 'Bastion Crest',
    description: 'Stepped battlements of a reinforced sanctuary.',
    clipClass: 'clip-fortified-tower',
  },
  {
    id: 'battlement_gate',
    name: 'Barbican Gate',
    description: 'Fortified castle gate crenellations.',
    clipClass: 'clip-battlement-gate',
  },
  {
    id: 'sigil_rhombus',
    name: 'Apex Rhombus',
    description: 'Diamond-faceted tactical recon pennon.',
    clipClass: 'clip-sigil-rhombus',
  },
  {
    id: 'chevron_bottom',
    name: 'Inverted Chevron',
    description: 'Downward angled vanguard assault ribbon.',
    clipClass: 'clip-chevron-bottom',
  },
  {
    id: 'shield_gothic',
    name: 'Gothic Escutcheon',
    description: 'High-crested fortress plate with acute base point.',
    clipClass: 'clip-shield-gothic',
  },
  {
    id: 'oriflamme',
    name: 'Imperial Oriflamme',
    description: 'Multi-tongued battle flame heraldic standard.',
    clipClass: 'clip-oriflamme',
  },
  {
    id: 'vanguard_blade',
    name: 'Vanguard Blade',
    description: 'Angular tapered expedition spear standard.',
    clipClass: 'clip-vanguard-blade',
  },
  {
    id: 'spartan_crest',
    name: 'Spartan Crest',
    description: 'Chamfered bronze battle shield with top notches.',
    clipClass: 'clip-spartan-crest',
  },
  {
    id: 'broad_standard',
    name: 'Broad Standard',
    description: 'Wide garrison battalion war banner.',
    clipClass: 'clip-broad-standard',
  },
  {
    id: 'hex_bastion',
    name: 'Bastion Polygon',
    description: 'Six-sided reinforced titanium tactical sigil.',
    clipClass: 'clip-hex-bastion',
  },
];

export const BANNER_ICONS: BannerIconDef[] = [
  // Combat & Defense
  { id: 'sword', name: 'Combat Blade', iconName: 'Sword', category: 'combat' },
  { id: 'swords', name: 'Crossed Blades', iconName: 'Swords', category: 'combat' },
  { id: 'crosshair', name: 'Precision Reticle', iconName: 'Crosshair', category: 'combat' },
  { id: 'target', name: 'Bullseye Reticle', iconName: 'Target', category: 'combat' },
  { id: 'skull', name: 'Hazard Skull', iconName: 'Skull', category: 'combat' },
  { id: 'axe', name: 'Breaching Axe', iconName: 'Axe', category: 'combat' },
  { id: 'bomb', name: 'Munition Charge', iconName: 'Bomb', category: 'combat' },
  { id: 'zap', name: 'Shock Bolt', iconName: 'Zap', category: 'combat' },
  { id: 'shield_alert', name: 'Breach Alarm', iconName: 'ShieldAlert', category: 'combat' },
  { id: 'shield_check', name: 'Armored Aegis', iconName: 'ShieldCheck', category: 'combat' },
  { id: 'shield_off', name: 'Vanguard Breach', iconName: 'ShieldOff', category: 'combat' },
  { id: 'siren', name: 'Red Alert', iconName: 'Siren', category: 'combat' },
  { id: 'trophy', name: 'War Trophy', iconName: 'Trophy', category: 'combat' },
  { id: 'medal', name: 'Iron Cross', iconName: 'Medal', category: 'combat' },
  { id: 'shield_question', name: 'Recon Aegis', iconName: 'ShieldQuestion', category: 'combat' },
  { id: 'radar', name: 'Early Warning', iconName: 'Radar', category: 'combat' },
  { id: 'radiation', name: 'Nuclear Hazard', iconName: 'Radiation', category: 'combat' },

  // Survival & Medical & Nature
  { id: 'flame', name: 'Survivor Flame', iconName: 'Flame', category: 'survival' },
  { id: 'biohazard', name: 'Quarantine Ring', iconName: 'AlertTriangle', category: 'survival' },
  { id: 'heart_pulse', name: 'Life Pulse', iconName: 'Activity', category: 'survival' },
  { id: 'stethoscope', name: 'Field Medic', iconName: 'Stethoscope', category: 'survival' },
  { id: 'syringe', name: 'Antidote Serum', iconName: 'Syringe', category: 'survival' },
  { id: 'pill', name: 'Pharmaceuticals', iconName: 'Pill', category: 'survival' },
  { id: 'thermometer', name: 'Cryo Hazard', iconName: 'Thermometer', category: 'survival' },
  { id: 'radio', name: 'Emergency Broadcast', iconName: 'Radio', category: 'survival' },
  { id: 'compass', name: 'Scout Compass', iconName: 'Compass', category: 'survival' },
  { id: 'flashlight', name: 'Night Searchlight', iconName: 'Flashlight', category: 'survival' },
  { id: 'tent', name: 'Refuge Camp', iconName: 'Tent', category: 'survival' },
  { id: 'sun', name: 'Dawn Sun', iconName: 'Sun', category: 'survival' },
  { id: 'moon', name: 'Nocturnal Eye', iconName: 'Moon', category: 'survival' },
  { id: 'cloud_rain', name: 'Acid Storm', iconName: 'CloudRain', category: 'survival' },
  { id: 'snowflake', name: 'Nuclear Frost', iconName: 'Snowflake', category: 'survival' },
  { id: 'tree_pine', name: 'Old Forest', iconName: 'TreePine', category: 'survival' },
  { id: 'mountain', name: 'Alpine Citadel', iconName: 'Mountain', category: 'survival' },
  { id: 'fish', name: 'River Catch', iconName: 'Fish', category: 'survival' },
  { id: 'apple', name: 'Ration Apple', iconName: 'Apple', category: 'survival' },
  { id: 'wheat', name: 'Golden Grain', iconName: 'Wheat', category: 'survival' },
  { id: 'sprout', name: 'Bio Growth', iconName: 'Sprout', category: 'survival' },
  { id: 'leaf', name: 'Harvest Olive', iconName: 'Wheat', category: 'survival' },
  { id: 'droplet', name: 'Pure Water', iconName: 'Droplet', category: 'survival' },
  { id: 'bone', name: 'Wasteland Relic', iconName: 'Bone', category: 'survival' },
  { id: 'paw_print', name: 'Beast Tracker', iconName: 'PawPrint', category: 'survival' },
  { id: 'bird', name: 'Vanguard Falcon', iconName: 'Bird', category: 'survival' },
  { id: 'bug', name: 'Parasite Swarm', iconName: 'Bug', category: 'survival' },

  // Leadership & Heraldry
  { id: 'shield', name: 'Aegis Shield', iconName: 'Shield', category: 'leadership' },
  { id: 'star', name: 'Command Star', iconName: 'Star', category: 'leadership' },
  { id: 'crown', name: 'Colony Sovereign', iconName: 'Crown', category: 'leadership' },
  { id: 'flag', name: 'Sovereign Standard', iconName: 'Flag', category: 'leadership' },
  { id: 'award', name: 'Valor Ribbon', iconName: 'Award', category: 'leadership' },
  { id: 'eye', name: 'Overwatch Eye', iconName: 'Eye', category: 'leadership' },
  { id: 'anchor', name: 'Safe Harbor', iconName: 'Anchor', category: 'leadership' },
  { id: 'key', name: 'Bunker Master Key', iconName: 'Key', category: 'leadership' },
  { id: 'lock', name: 'Iron Fortress', iconName: 'Lock', category: 'leadership' },
  { id: 'feather', name: 'Colony Charter', iconName: 'Feather', category: 'leadership' },
  { id: 'landmark', name: 'Capitol Gate', iconName: 'Landmark', category: 'leadership' },
  { id: 'scale', name: 'Tribunal Scales', iconName: 'Scale', category: 'leadership' },
  { id: 'sparkles', name: 'Hope Beacon', iconName: 'Sparkles', category: 'leadership' },
  { id: 'infinity', name: 'Eternal Bastion', iconName: 'Infinity', category: 'leadership' },
  { id: 'gem', name: 'Priceless Core', iconName: 'Gem', category: 'leadership' },
  { id: 'fingerprint', name: 'DNA Signature', iconName: 'Fingerprint', category: 'leadership' },
  { id: 'globe', name: 'Global Recon', iconName: 'Globe', category: 'leadership' },
  { id: 'bell', name: 'Garrison Chime', iconName: 'Bell', category: 'leadership' },
  { id: 'shield_ban', name: 'Iron Sanctuary', iconName: 'ShieldBan', category: 'leadership' },
  { id: 'cross_icon', name: 'Red Cross Order', iconName: 'Cross', category: 'leadership' },
  { id: 'tower_control', name: 'Citadel Spire', iconName: 'TowerControl', category: 'leadership' },

  // Industry & Technology
  { id: 'wrench', name: 'Engineering Wrench', iconName: 'Hammer', category: 'industry' },
  { id: 'hammer', name: 'Heavy Anvil Hammer', iconName: 'Hammer', category: 'industry' },
  { id: 'pickaxe', name: 'Mining Pick', iconName: 'Pickaxe', category: 'industry' },
  { id: 'cog', name: 'Industry Gear', iconName: 'Cog', category: 'industry' },
  { id: 'factory', name: 'Fabrication Plant', iconName: 'Factory', category: 'industry' },
  { id: 'truck', name: 'Supply Convoy', iconName: 'Truck', category: 'industry' },
  { id: 'cpu', name: 'Logic Core', iconName: 'Cpu', category: 'industry' },
  { id: 'battery_charging', name: 'Power Cell', iconName: 'BatteryCharging', category: 'industry' },
  { id: 'fuel', name: 'Fuel Jerrycan', iconName: 'Fuel', category: 'industry' },
  { id: 'lightbulb', name: 'Tech Discovery', iconName: 'Lightbulb', category: 'industry' },
  { id: 'boxes', name: 'Depot Stockpile', iconName: 'Boxes', category: 'industry' },
  { id: 'package', name: 'Supply Drop', iconName: 'Package', category: 'industry' },
  { id: 'antenna', name: 'Radar Tower', iconName: 'Antenna', category: 'industry' },
  { id: 'gauge', name: 'Pressure Gauge', iconName: 'Gauge', category: 'industry' },
  { id: 'hard_hat', name: 'Construction Helm', iconName: 'HardHat', category: 'industry' },
  { id: 'anvil', name: 'Heavy Foundry', iconName: 'Anvil', category: 'industry' },
  { id: 'satellite', name: 'Orbital Uplink', iconName: 'Satellite', category: 'industry' },
  { id: 'circuit_board', name: 'Micro Matrix', iconName: 'CircuitBoard', category: 'industry' },
];

export const BANNER_PATTERNS: BannerPatternDef[] = [
  { id: 'solid', name: 'Solid Field', description: 'Monochrome battle standard' },
  { id: 'stripes', name: 'Hazard Diagonal', description: 'Tactical diagonal weave' },
  { id: 'horizontal_stripes', name: 'Horizontal Bars', description: 'Dual-band naval colors' },
  { id: 'vertical_stripes', name: 'Vertical Pales', description: 'Regimental division lines' },
  { id: 'split', name: 'Bicolor Half', description: 'Two-tone split diagonal' },
  { id: 'quarters', name: 'Heraldic Quarters', description: 'Four-quadrant tactical divide' },
  { id: 'saltire', name: 'Saltire Cross', description: 'St. Andrew diagonal X-cross' },
  { id: 'chevron', name: 'Radial Focus', description: 'Garrison roundel halo' },
  { id: 'cross', name: 'Tactical Quadrant', description: 'Crosshair quadrant divide' },
  { id: 'checker', name: 'War Checkerboard', description: 'Tactical command grid' },
  { id: 'camo', name: 'Urban Camo Mesh', description: 'Fractal stealth dispersion' },
  { id: 'sunburst', name: 'Zenith Rays', description: 'Radiant beacon beams' },
  { id: 'diamonds', name: 'Argyle Matrix', description: 'Reinforced ballistic weave' },
  { id: 'honeycomb', name: 'Honeycomb Hex', description: 'Polymer armor mesh' },
  { id: 'dots_matrix', name: 'Radar Dot Matrix', description: 'Digital sensor grid' },
  { id: 'hazard_stripes', name: 'Warning Chevrons', description: 'High-contrast hazard banding' },
  { id: 'vignette_glow', name: 'Center Spotlight', description: 'High-focus darkened edges' },
  { id: 'circuit_grid', name: 'Circuit Cyber Grid', description: 'Micro-electronic conductive lines' },
  { id: 'sunburst_radial', name: 'Radiant Dawn', description: 'High-contrast 8-point sunburst' },
  { id: 'chevron_triple', name: 'Triple Chevron', description: 'Triple inverted military chevron stripes' },
  { id: 'cross_nordic', name: 'Nordic Cross', description: 'Off-center heraldic expedition cross' },
  { id: 'scallop_scale', name: 'Dragon Scales', description: 'Overlapping ballistic dragon scales' },
  { id: 'diamond_lattice', name: 'Diamond Lattice', description: 'Diamond chainmail reinforcing mesh' },
  { id: 'camo_digital', name: 'Digital Pixel Camo', description: 'Modern block-dispersal woodland camo' },
];

export const BANNER_PRIMARY_COLORS = [
  { id: '#8B0000', name: 'Blood Crimson', hex: '#8B0000', borderHex: '#DC2626' },
  { id: '#064E3B', name: 'Hazard Olive', hex: '#064E3B', borderHex: '#059669' },
  { id: '#1E3A8A', name: 'Cobalt Blue', hex: '#1E3A8A', borderHex: '#2563EB' },
  { id: '#18181B', name: 'Tactical Black', hex: '#18181B', borderHex: '#52525B' },
  { id: '#78350F', name: 'Amber Bronze', hex: '#78350F', borderHex: '#D97706' },
  { id: '#334155', name: 'Slate Iron', hex: '#334155', borderHex: '#64748B' },
  { id: '#581C87', name: 'Nightshade Purple', hex: '#581C87', borderHex: '#9333EA' },
  { id: '#831843', name: 'Maroon Rose', hex: '#831843', borderHex: '#E11D48' },
  { id: '#0F766E', name: 'Bio Cyan', hex: '#0F766E', borderHex: '#14B8A6' },
  { id: '#3F3F46', name: 'Carbon Steel', hex: '#3F3F46', borderHex: '#A1A1AA' },
  { id: '#713F12', name: 'Earth Ochre', hex: '#713F12', borderHex: '#CA8A04' },
  { id: '#312E81', name: 'Deep Indigo', hex: '#312E81', borderHex: '#6366F1' },
];

export const BANNER_ACCENT_COLORS = [
  { id: '#FFFFFF', name: 'Pure White', hex: '#FFFFFF' },
  { id: '#F59E0B', name: 'Tactical Gold', hex: '#F59E0B' },
  { id: '#EF4444', name: 'Warning Red', hex: '#EF4444' },
  { id: '#10B981', name: 'Bio Lime', hex: '#10B981' },
  { id: '#06B6D4', name: 'Cryo Cyan', hex: '#06B6D4' },
  { id: '#A855F7', name: 'Arcane Violet', hex: '#A855F7' },
  { id: '#E2E8F0', name: 'Steel Chrome', hex: '#E2E8F0' },
  { id: '#18181B', name: 'Shadow Black', hex: '#18181B' },
  { id: '#F97316', name: 'Signal Orange', hex: '#F97316' },
  { id: '#84CC16', name: 'Toxic Yellow', hex: '#84CC16' },
  { id: '#EC4899', name: 'Neon Magenta', hex: '#EC4899' },
  { id: '#38BDF8', name: 'Plasma Blue', hex: '#38BDF8' },
];

export const DEFAULT_BANNER_CONFIG: ColonyBannerConfig = {
  style: 'torn_standard',
  icon: 'sword',
  primaryColor: '#8B0000',
  secondaryColor: '#DC2626',
  iconColor: '#FFFFFF',
  pattern: 'solid',
};
