import { LocationPreset } from '../types/map';

export const LOCATION_PRESETS: LocationPreset[] = [
  {
    id: 'evesham',
    name: 'Evesham, UK',
    country: 'United Kingdom',
    lat: 52.0917,
    lon: -1.9472,
    radius: 4000,
    description: '8km × 8km tactical map. Historic market town nestled in the River Avon loop, Bell Tower abbey grounds, and expansive orchards.',
  },
  {
    id: 'oxford',
    name: 'Oxford, UK',
    country: 'United Kingdom',
    lat: 51.7520,
    lon: -1.2577,
    radius: 4000,
    description: '8km × 8km tactical map. Historic stone colleges, Radcliffe Camera library, waterways, and Thames river valley slopes.',
  },
  {
    id: 'london_soho',
    name: 'London, UK',
    country: 'United Kingdom',
    lat: 51.5074,
    lon: -0.1278,
    radius: 4000,
    description: '8km × 8km tactical map. High-density commercial districts, West End, tight urban grids, and massive road networks.',
  },
  {
    id: 'paris_cite',
    name: 'Paris, France',
    country: 'France',
    lat: 48.8566,
    lon: 2.3522,
    radius: 4000,
    description: '8km × 8km tactical map. Fortified River Seine islands, cathedral plazas, boulevards, and dense Haussmannian city blocks.',
  },
  {
    id: 'berlin_mitte',
    name: 'Berlin, Germany',
    country: 'Germany',
    lat: 52.52,
    lon: 13.405,
    radius: 4000,
    description: '8km × 8km tactical map. Spree river canals, monumental civic architecture, wide boulevards, and expansive public squares.',
  },
  {
    id: 'rome_centro',
    name: 'Rome, Italy',
    country: 'Italy',
    lat: 41.9028,
    lon: 12.4964,
    radius: 4000,
    description: '8km × 8km tactical map. Ancient Roman ruins, cobblestone arteries, Tiber river banks, and dense Renaissance courtyards.',
  },
  {
    id: 'tokyo_shibuya',
    name: 'Tokyo, Japan',
    country: 'Japan',
    lat: 35.6762,
    lon: 139.6503,
    radius: 4000,
    description: '8km × 8km tactical map. Ultra-dense transit nexus, towering commercial complexes, and intricate multi-level street networks.',
  },
  {
    id: 'san_francisco',
    name: 'San Francisco, USA',
    country: 'United States',
    lat: 37.7749,
    lon: -122.4194,
    radius: 4000,
    description: '8km × 8km tactical map. Iconic steep hills (85m elevation rise), Pacific coast and bay views, and distinct grid topography.',
    isNew: true,
  },
];

export const DOWNLOADED_PRESETS: LocationPreset[] = LOCATION_PRESETS.map((p) => ({
  ...p,
  id: `${p.id}_dl`,
  name: p.name.split(',')[0].toUpperCase(),
  description: `Downloaded offline tactical terrain package for ${p.name.split(',')[0]} Sector with accurate vector geometry and DEM elevation.`,
}));

export const DEFAULT_PRESET = LOCATION_PRESETS[0]; // Default to Evesham!
