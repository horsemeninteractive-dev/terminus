export type BuildingCategory =
  | 'residential'
  | 'commercial'
  | 'supermarket'
  | 'pharmacy'
  | 'hospital'
  | 'industrial'
  | 'civic'
  | 'gas_station'
  | 'police'
  | 'school'
  | 'restaurant'
  | 'warehouse'
  | 'other';

export interface Point2D {
  x: number; // local X in meters (East)
  z: number; // local Z in meters (South)
}

/**
 * World-space bounds of an on-screen drag-selection box. The AABB fields
 * (minX/maxX/minZ/maxZ) bound the region for fast rejection; `polygon` — when
 * present — holds the perspective-correct ground-plane corners of the screen
 * rectangle (its projected quad), which is the EXACT region the player sees
 * under the box. Point-in-area tests should prefer the polygon, because with an
 * oblique camera the axis-aligned box around the projected corners over-covers
 * the visible region and pulls in buildings/nodes outside the drawn box.
 */
export interface WorldAreaBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Ground-plane corners of the screen rect, in screen order (top-left,
   * top-right, bottom-right, bottom-left projected onto y=0). Optional — absent
   * for legacy callers or degenerate projections; fall back to the AABB. */
  polygon?: Point2D[];
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface BuildingPolygon {
  id: string | number;
  type: BuildingCategory;
  rawType: string;
  name?: string;
  height: number;
  levels: number;
  center: Point2D;
  polygon: Point2D[]; // outer boundary
  holes?: Point2D[][]; // inner courtyards
  tags: Record<string, string>;
  isOccupied?: boolean;
}

export interface RoadSegment {
  id: string | number;
  name?: string;
  highwayType: string;
  width: number;
  points: Point2D[];
  isOneway?: boolean;
  lanes?: number;
}

export interface LanduseArea {
  id: string | number;
  type: 'park' | 'water' | 'forest' | 'grass' | 'parking' | 'industrial' | 'commercial' | 'residential' | 'other';
  polygon: Point2D[];
  name?: string;
}

export type ResourceNodeType = 'wood' | 'metal' | 'bricks';

export interface ResourceNode {
  id: string;
  type: ResourceNodeType;
  subType: 'tree' | 'tree_large' | 'car_sedan' | 'car_suv' | 'truck' | 'lamppost' | 'rubble_brick' | 'rubble_concrete';
  position: Point2D;
  heightOffset?: number;
  rotation: number;
  scale: number;
  source: 'osm_point' | 'road_side' | 'park_scatter' | 'alley_scatter' | 'building_perimeter' | 'forester';
  amount: number;
  maxAmount: number;
  isDepleted: boolean;
  assignedWorkers?: number;
}

export interface ElevationGrid {
  minElevation: number; // in meters ASL (Above Sea Level)
  maxElevation: number;
  baseElevation: number; // elevation at map center
  resolution: number; // grid dimensions (e.g. 32 for 32x32 samples)
  grid: number[][]; // 2D array of elevation values (meters ASL) [row][col]
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

export interface MapData {
  center: GeoPoint;
  radius: number;
  elevation: ElevationGrid;
  buildings: BuildingPolygon[];
  roads: RoadSegment[];
  landuse: LanduseArea[];
  resourceNodes: ResourceNode[];
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  stats: {
    buildingCount: number;
    roadCount: number;
    resourceCount: {
      wood: number;
      metal: number;
      bricks: number;
      total: number;
    };
    elevationRangeMeters: number;
    processedTimeMs: number;
  };
  fetchedAt: number;
  source: string;
}

export interface LocationPreset {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  radius: number;
  description: string;
  isNew?: boolean;
  badge?: string;
  image?: string;
}

export type ZoneGridSize = '3x3' | '4x4' | '5x5' | '7x7' | '9x9';

export interface ZoneConfig {
  size: ZoneGridSize;
  tilesCount: number;
  dimensionTiles: number; // 3, 4, or 5
  radiusMeters: number; // approximate boundary radius in meters
  tileWidthMeters: number; // e.g. 75m
  difficultyLabel: string;
  difficultyRating: number; // 1 to 5
  resourceCostMultiplier: number;
  defensePerimeterMeters: number;
  description: string;
}

export interface SettlementPlacement {
  center: GeoPoint;
  zoneSize: ZoneGridSize;
  radius: number;
  offsetMeters: Point2D; // micro fine-tuning offset from original click
  rotationDeg: number;
  sectorName: string;
  country?: string;
  locationDetails?: string;
}
