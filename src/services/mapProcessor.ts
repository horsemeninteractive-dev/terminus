import {
  BuildingCategory,
  BuildingPolygon,
  ElevationGrid,
  GeoPoint,
  LanduseArea,
  MapData,
  Point2D,
  ResourceNode,
  RoadSegment,
} from '../types/map';
import { RawOsmResponse } from './osmFetcher';
import {
  calculateCentroid,
  distance2D,
  distancePointToSegment,
  ensureCCW,
  ensureCW,
  isPointInPolygon,
  latLonToMeters,
  polygonSignedArea,
  simplifyPoints,
} from './projection';

/**
 * Classify OSM tags into game BuildingCategory
 */
export function categorizeBuilding(tags: Record<string, string>): BuildingCategory {
  const b = (tags.building || '').toLowerCase();
  const amenity = (tags.amenity || '').toLowerCase();
  const shop = (tags.shop || '').toLowerCase();
  const healthcare = (tags.healthcare || '').toLowerCase();
  const office = (tags.office || '').toLowerCase();
  const industrial = (tags.industrial || '').toLowerCase();

  if (
    amenity === 'hospital' ||
    amenity === 'clinic' ||
    healthcare === 'hospital' ||
    healthcare === 'clinic'
  ) {
    return 'hospital';
  }
  if (
    amenity === 'pharmacy' ||
    shop === 'chemist' ||
    shop === 'medical_supply' ||
    healthcare === 'pharmacy'
  ) {
    return 'pharmacy';
  }
  if (
    shop === 'supermarket' ||
    shop === 'convenience' ||
    shop === 'grocery' ||
    shop === 'greengrocer' ||
    shop === 'bakery'
  ) {
    return 'supermarket';
  }
  if (
    amenity === 'fuel' ||
    tags.highway === 'services' ||
    b === 'gas_station'
  ) {
    return 'gas_station';
  }
  if (
    amenity === 'police' ||
    tags.emergency === 'police'
  ) {
    return 'police';
  }
  if (
    amenity === 'school' ||
    amenity === 'university' ||
    amenity === 'college' ||
    amenity === 'kindergarten'
  ) {
    return 'school';
  }
  if (
    amenity === 'restaurant' ||
    amenity === 'cafe' ||
    amenity === 'fast_food' ||
    amenity === 'bar' ||
    amenity === 'pub'
  ) {
    return 'restaurant';
  }
  if (
    b === 'warehouse' ||
    tags.man_made === 'storage_tank' ||
    tags.landuse === 'depot'
  ) {
    return 'warehouse';
  }
  if (
    b === 'industrial' ||
    b === 'manufacture' ||
    tags.landuse === 'industrial' ||
    industrial !== ''
  ) {
    return 'industrial';
  }
  if (
    amenity === 'townhall' ||
    amenity === 'courthouse' ||
    amenity === 'community_centre' ||
    amenity === 'place_of_worship' ||
    b === 'civic' ||
    b === 'public' ||
    b === 'cathedral' ||
    b === 'church'
  ) {
    return 'civic';
  }
  if (
    shop !== '' ||
    office !== '' ||
    b === 'commercial' ||
    b === 'retail' ||
    b === 'office' ||
    amenity === 'bank' ||
    amenity === 'post_office'
  ) {
    return 'commercial';
  }
  if (
    b === 'apartments' ||
    b === 'residential' ||
    b === 'house' ||
    b === 'detached' ||
    b === 'semidetached_house' ||
    b === 'terrace' ||
    b === 'dormitory' ||
    b === 'bungalow' ||
    tags.landuse === 'residential'
  ) {
    return 'residential';
  }

  return 'residential'; // Sensible default for most urban buildings
}

/**
 * Calculate building height in meters from tags with sensible defaults by category
 */
export function estimateBuildingHeight(tags: Record<string, string>, category: BuildingCategory): { height: number; levels: number } {
  if (tags.height) {
    const parsed = parseFloat(tags.height);
    if (!isNaN(parsed) && parsed > 1) {
      const lvl = tags['building:levels'] ? parseInt(tags['building:levels'], 10) : Math.max(1, Math.round(parsed / 3.5));
      return { height: Math.min(Math.max(parsed, 3), 120), levels: lvl };
    }
  }

  if (tags['building:levels']) {
    const levels = parseInt(tags['building:levels'], 10);
    if (!isNaN(levels) && levels > 0) {
      const h = levels * 3.5;
      return { height: Math.min(Math.max(h, 3), 120), levels };
    }
  }

  const b = (tags.building || '').toLowerCase();
  if (b === 'church' || b === 'cathedral' || tags.amenity === 'place_of_worship') {
    return { height: 20, levels: 3 };
  }

  switch (category) {
    case 'commercial':
      return { height: 16, levels: 4 };
    case 'supermarket':
      return { height: 7, levels: 1 };
    case 'warehouse':
    case 'industrial':
      return { height: 9, levels: 2 };
    case 'hospital':
    case 'civic':
      return { height: 15, levels: 4 };
    case 'school':
      return { height: 11, levels: 3 };
    case 'gas_station':
      return { height: 5, levels: 1 };
    case 'restaurant':
    case 'pharmacy':
      return { height: 9, levels: 2 };
    case 'residential':
    default:
      return { height: 10, levels: 3 };
  }
}

/**
 * Determine road width in meters based on highway classification
 */
export function getRoadWidth(highway: string, tags: Record<string, string>): number {
  if (tags.width) {
    const w = parseFloat(tags.width);
    if (!isNaN(w) && w > 1) return w;
  }
  if (tags.lanes) {
    const lanes = parseInt(tags.lanes, 10);
    if (!isNaN(lanes) && lanes > 0) return lanes * 3.5 + 1.5;
  }

  switch (highway) {
    case 'motorway':
    case 'trunk':
      return 12;
    case 'primary':
      return 10;
    case 'secondary':
      return 8;
    case 'tertiary':
      return 7;
    case 'residential':
    case 'unclassified':
      return 6;
    case 'service':
    case 'living_street':
      return 4.5;
    case 'pedestrian':
    case 'footway':
    case 'cycleway':
    case 'path':
    case 'steps':
      return 2.5;
    default:
      return 5;
  }
}

/**
 * Simple pseudo-random hash generator for deterministic procedural placement
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

/**
 * Main map processing function that transforms raw OSM JSON into game-ready MapData
 */
export function processOsmData(
  raw: RawOsmResponse,
  center: GeoPoint,
  radius: number,
  source: string = 'Overpass API',
  elevationGrid: ElevationGrid
): MapData {
  const startTime = performance.now();

  const elevation = elevationGrid;

  // 1. Index all nodes by ID and index ways by ID for relation multipolygon assembly
  const nodeMap = new Map<number, { lat: number; lon: number; tags?: Record<string, string> }>();
  const explicitTrees: Point2D[] = [];
  const explicitLamps: Point2D[] = [];

  for (const el of raw.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodeMap.set(el.id, { lat: el.lat, lon: el.lon, tags: el.tags });
      if (el.tags) {
        if (el.tags.natural === 'tree') {
          explicitTrees.push(latLonToMeters(el.lat, el.lon, center.lat, center.lon));
        }
        if (el.tags.highway === 'street_lamp') {
          explicitLamps.push(latLonToMeters(el.lat, el.lon, center.lat, center.lon));
        }
      }
    }
  }

  // Index raw ways for relation multipolygon assembly
  const wayMap = new Map<number, { id: number; nodes: number[]; tags: Record<string, string>; points: Point2D[] }>();
  for (const el of raw.elements) {
    if (el.type === 'way' && el.nodes && el.nodes.length >= 2) {
      const points: Point2D[] = [];
      for (const nodeId of el.nodes) {
        const n = nodeMap.get(nodeId);
        if (n) {
          points.push(latLonToMeters(n.lat, n.lon, center.lat, center.lon));
        }
      }
      if (points.length >= 2) {
        wayMap.set(el.id, {
          id: el.id,
          nodes: el.nodes,
          tags: el.tags || {},
          points,
        });
      }
    }
  }

  // 2. Process landuse FIRST (so water areas are fully known when placing buildings)
  const landuse: LanduseArea[] = [];
  const processedWayIdsForLanduse = new Set<number>();

  // Helper to classify landuse type
  const classifyLanduse = (tags: Record<string, string>): LanduseArea['type'] | null => {
    const typeStr = (
      tags.landuse ||
      tags.leisure ||
      tags.natural ||
      tags.waterway ||
      tags.water ||
      tags.amenity ||
      ''
    ).toLowerCase();

    if (
      typeStr === 'water' ||
      typeStr === 'basin' ||
      typeStr === 'reservoir' ||
      typeStr === 'river' ||
      typeStr === 'stream' ||
      typeStr === 'canal' ||
      typeStr === 'lake' ||
      typeStr === 'pond' ||
      typeStr === 'dock' ||
      typeStr === 'riverbank' ||
      typeStr === 'wetland' ||
      tags.natural === 'water' ||
      tags.natural === 'wetland' ||
      tags.waterway ||
      tags.water
    ) {
      return 'water';
    }

    if (
      typeStr === 'park' ||
      typeStr === 'garden' ||
      typeStr === 'recreation_ground' ||
      typeStr === 'pitch' ||
      typeStr === 'playground' ||
      typeStr === 'nature_reserve' ||
      typeStr === 'golf_course' ||
      typeStr === 'track' ||
      typeStr === 'dog_park' ||
      typeStr === 'village_green' ||
      typeStr === 'common'
    ) {
      return 'park';
    }

    if (
      typeStr === 'forest' ||
      typeStr === 'wood' ||
      tags.natural === 'wood' ||
      tags.landuse === 'forest'
    ) {
      return 'forest';
    }

    if (
      typeStr === 'grass' ||
      typeStr === 'meadow' ||
      typeStr === 'orchard' ||
      typeStr === 'allotments' ||
      typeStr === 'cemetery' ||
      typeStr === 'farmland' ||
      typeStr === 'farmyard' ||
      typeStr === 'greenfield' ||
      tags.natural === 'grassland' ||
      tags.natural === 'scrub' ||
      tags.natural === 'heath'
    ) {
      return 'grass';
    }

    if (tags.amenity === 'parking' || typeStr === 'parking') {
      return 'parking';
    }

    return null;
  };

  // 2A. Process Relations (OSM Multipolygons for water bodies, rivers, large parks)
  for (const el of raw.elements) {
    if (el.type === 'relation' && el.members) {
      const tags = el.tags || {};
      const landType = classifyLanduse(tags);
      if (!landType) continue;

      // Extract outer member ways
      const outerWays = el.members
        .filter((m) => m.type === 'way' && (m.role === 'outer' || !m.role))
        .map((m) => wayMap.get(m.ref))
        .filter((w): w is NonNullable<typeof w> => !!w);

      if (outerWays.length === 0) continue;

      // Mark these ways so we don't duplicate them
      outerWays.forEach((w) => processedWayIdsForLanduse.add(w.id));

      // Assemble continuous rings from outer ways
      const unvisited = [...outerWays];
      while (unvisited.length > 0) {
        const currentWay = unvisited.shift()!;
        let currentPoints = [...currentWay.points];
        let currentNodes = [...currentWay.nodes];

        let extended = true;
        while (extended && unvisited.length > 0) {
          extended = false;
          const startNode = currentNodes[0];
          const endNode = currentNodes[currentNodes.length - 1];

          // If ring already closed, stop extending
          if (startNode === endNode && currentPoints.length >= 3) break;

          for (let i = 0; i < unvisited.length; i++) {
            const candidate = unvisited[i];
            const candStart = candidate.nodes[0];
            const candEnd = candidate.nodes[candidate.nodes.length - 1];

            if (endNode === candStart) {
              currentPoints.push(...candidate.points.slice(1));
              currentNodes.push(...candidate.nodes.slice(1));
              unvisited.splice(i, 1);
              extended = true;
              break;
            } else if (endNode === candEnd) {
              currentPoints.push(...[...candidate.points].reverse().slice(1));
              currentNodes.push(...[...candidate.nodes].reverse().slice(1));
              unvisited.splice(i, 1);
              extended = true;
              break;
            } else if (startNode === candEnd) {
              currentPoints.unshift(...candidate.points.slice(0, -1));
              currentNodes.unshift(...candidate.nodes.slice(0, -1));
              unvisited.splice(i, 1);
              extended = true;
              break;
            } else if (startNode === candStart) {
              currentPoints.unshift(...[...candidate.points].reverse().slice(0, -1));
              currentNodes.unshift(...[...candidate.nodes].reverse().slice(0, -1));
              unvisited.splice(i, 1);
              extended = true;
              break;
            }
          }
        }

        const isClosed =
          currentPoints.length >= 3 &&
          (currentNodes[0] === currentNodes[currentNodes.length - 1] ||
            distance2D(currentPoints[0], currentPoints[currentPoints.length - 1]) < 2.0);

        const cleanPoly = isClosed ? currentPoints.slice(0, -1) : currentPoints;
        if (cleanPoly.length >= 3) {
          landuse.push({
            id: `l_rel_${el.id}_${landuse.length}`,
            type: landType,
            polygon: simplifyPoints(cleanPoly, 0.8),
            name: tags.name || (landType === 'water' ? 'River' : undefined),
          });
        }
      }
    }
  }

  // 2B. Process Landuse Ways (closed polygons & linear waterways)
  for (const el of raw.elements) {
    if (el.type === 'way' && el.nodes && el.nodes.length >= 2) {
      if (processedWayIdsForLanduse.has(el.id)) continue;
      const tags = el.tags || {};
      const wayObj = wayMap.get(el.id);
      if (!wayObj) continue;
      const points = wayObj.points;

      // Skip buildings and highways here
      if (tags.building || tags.highway) continue;

      const landType = classifyLanduse(tags);
      if (!landType) continue;

      const typeStr = (
        tags.landuse ||
        tags.leisure ||
        tags.natural ||
        tags.waterway ||
        tags.water ||
        tags.amenity ||
        ''
      ).toLowerCase();

      const isClosed =
        points.length >= 3 &&
        points[0].x === points[points.length - 1].x &&
        points[0].z === points[points.length - 1].z;

      if (isClosed) {
        const poly = points.slice(0, -1);
        if (poly.length >= 3) {
          landuse.push({
            id: `l_${el.id}`,
            type: landType,
            polygon: simplifyPoints(poly, 0.8),
            name: tags.name,
          });
        }
      } else if (landType === 'water' && points.length >= 2) {
        // Expand linear river/stream into a water strip polygon
        const isMajorRiver = typeStr === 'river' || tags.waterway === 'river';
        const isCanal = typeStr === 'canal' || tags.waterway === 'canal';
        const riverWidth = isMajorRiver ? 32 : isCanal ? 20 : 12;
        const halfW = riverWidth / 2;
        const leftPts: Point2D[] = [];
        const rightPts: Point2D[] = [];

        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          const segDist = distance2D(p1, p2);
          if (segDist < 0.1) continue;
          const nx = -(p2.z - p1.z) / segDist;
          const nz = (p2.x - p1.x) / segDist;

          leftPts.push({ x: p1.x + nx * halfW, z: p1.z + nz * halfW });
          rightPts.push({ x: p1.x - nx * halfW, z: p1.z - nz * halfW });
        }

        const lastP = points[points.length - 1];
        const prevP = points[points.length - 2];
        const lastDist = distance2D(prevP, lastP);
        if (lastDist >= 0.1) {
          const nx = -(lastP.z - prevP.z) / lastDist;
          const nz = (lastP.x - prevP.x) / lastDist;
          leftPts.push({ x: lastP.x + nx * halfW, z: lastP.z + nz * halfW });
          rightPts.push({ x: lastP.x - nx * halfW, z: lastP.z - nz * halfW });
        }

        const riverPoly = [...leftPts, ...rightPts.reverse()];
        if (riverPoly.length >= 3) {
          landuse.push({
            id: `l_river_${el.id}`,
            type: 'water',
            polygon: simplifyPoints(riverPoly, 0.8),
            name: tags.name || 'River',
          });
        }
      } else if (points.length >= 3) {
        landuse.push({
          id: `l_${el.id}`,
          type: landType,
          polygon: simplifyPoints(points, 0.8),
          name: tags.name,
        });
      }
    }
  }

  // Pre-filter water polygons for fast point-in-polygon queries with bounding boxes
  const waterPolygons = landuse
    .filter((l) => l.type === 'water')
    .map((lu) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of lu.polygon) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      return {
        ...lu,
        bbox: { minX, maxX, minZ, maxZ },
      };
    });

  const minX = -radius;
  const maxX = radius;
  const minZ = -radius;
  const maxZ = radius;

  const isPtInWater = (pt: Point2D): boolean => {
    for (const lu of waterPolygons) {
      if (
        pt.x < lu.bbox.minX ||
        pt.x > lu.bbox.maxX ||
        pt.z < lu.bbox.minZ ||
        pt.z > lu.bbox.maxZ
      ) {
        continue;
      }
      if (isPointInPolygon(pt, lu.polygon)) return true;
    }
    return false;
  };

  // Helper to check if a building polygon overlaps any water body
  const isBuildingInWater = (centerPt: Point2D, poly: Point2D[]): boolean => {
    if (isPtInWater(centerPt)) return true;
    for (const v of poly) {
      if (isPtInWater(v)) return true;
    }
    return false;
  };

  // 3. Process Buildings & Roads
  const buildings: BuildingPolygon[] = [];
  const roads: RoadSegment[] = [];

  for (const el of raw.elements) {
    if (el.type === 'way' && el.nodes && el.nodes.length >= 2) {
      const wayObj = wayMap.get(el.id);
      if (!wayObj) continue;
      const points = wayObj.points;
      const tags = wayObj.tags;

      // Check if Building
      if (tags.building) {
        if (points.length >= 3) {
          const isClosed =
            points[0].x === points[points.length - 1].x &&
            points[0].z === points[points.length - 1].z;
          const poly = isClosed ? points.slice(0, -1) : points;

          if (poly.length >= 3) {
            const simplified = simplifyPoints(poly, 0.4);
            const ccwPoly = ensureCCW(simplified);
            const category = categorizeBuilding(tags);
            const { height, levels } = estimateBuildingHeight(tags, category);
            const centerPt = calculateCentroid(ccwPoly);

            // Filter out tiny sliver artifacts (< 12 sq meters)
            const area = Math.abs(polygonSignedArea(ccwPoly));
            if (area >= 12) {
              // CRITICAL: Exclude buildings that overlap water bodies (rivers, lakes, canals)
              if (!isBuildingInWater(centerPt, ccwPoly)) {
                buildings.push({
                  id: `b_${el.id}`,
                  type: category,
                  rawType: tags.building,
                  name: tags.name,
                  height,
                  levels,
                  center: centerPt,
                  polygon: ccwPoly,
                  tags,
                });
              }
            }
          }
        }
      }
      // Check if Road / Highway
      else if (tags.highway) {
        const width = getRoadWidth(tags.highway, tags);
        const simplified = simplifyPoints(points, 0.5);
        if (simplified.length >= 2) {
          roads.push({
            id: `r_${el.id}`,
            name: tags.name,
            highwayType: tags.highway,
            width,
            points: simplified,
            isOneway: tags.oneway === 'yes',
            lanes: tags.lanes ? parseInt(tags.lanes, 10) : undefined,
          });
        }
      }
    }
  }

  // Pre-calculate road segment bounding boxes for fast proximity checks
  interface RoadSegBBox {
    p1: Point2D;
    p2: Point2D;
    halfW: number;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }
  const roadSegs: RoadSegBBox[] = [];
  for (const r of roads) {
    const halfW = (r.width || 6) / 2;
    for (let i = 0; i < r.points.length - 1; i++) {
      const p1 = r.points[i];
      const p2 = r.points[i + 1];
      roadSegs.push({
        p1,
        p2,
        halfW,
        minX: Math.min(p1.x, p2.x) - halfW - 2,
        maxX: Math.max(p1.x, p2.x) + halfW + 2,
        minZ: Math.min(p1.z, p2.z) - halfW - 2,
        maxZ: Math.max(p1.z, p2.z) + halfW + 2,
      });
    }
  }

  // Pre-calculate building bounding boxes
  const buildingBoxes = buildings.map((b) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of b.polygon) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    return { b, minX: minX - 2, maxX: maxX + 2, minZ: minZ - 2, maxZ: maxZ + 2 };
  });

  // Spatial query helpers for ensuring zero tree overlap with water, roads, or building footprints
  const isPtOnRoad = (pt: Point2D, margin = 0.5): boolean => {
    for (const seg of roadSegs) {
      if (
        pt.x < seg.minX ||
        pt.x > seg.maxX ||
        pt.z < seg.minZ ||
        pt.z > seg.maxZ
      ) {
        continue;
      }
      const d = distancePointToSegment(pt, seg.p1, seg.p2);
      if (d <= seg.halfW + margin) return true;
    }
    return false;
  };

  const isPtInBuilding = (pt: Point2D, margin = 1.0): boolean => {
    for (const box of buildingBoxes) {
      if (
        pt.x < box.minX ||
        pt.x > box.maxX ||
        pt.z < box.minZ ||
        pt.z > box.maxZ
      ) {
        continue;
      }
      if (isPointInPolygon(pt, box.b.polygon)) return true;
      for (let i = 0; i < box.b.polygon.length; i++) {
        const nextI = (i + 1) % box.b.polygon.length;
        if (distancePointToSegment(pt, box.b.polygon[i], box.b.polygon[nextI]) <= margin) {
          return true;
        }
      }
    }
    return false;
  };

  const isValidTreeSpot = (pt: Point2D): boolean => {
    // Trees must NEVER render in water, on road surfaces/verges, or in building footprints
    if (isPtInWater(pt)) return false;
    if (isPtOnRoad(pt, 1.2)) return false;
    if (isPtInBuilding(pt, 1.5)) return false;
    return true;
  };

  // 3. Generate Physical Resource Nodes (§7.2: Wood, Metal, Bricks)
  const resourceNodes: ResourceNode[] = [];
  let seed = Math.round(Math.abs(center.lat * 1000 + center.lon * 1000));

  // 3A. Wood Nodes (Trees)
  // Direct OSM trees
  explicitTrees.forEach((pos, idx) => {
    if (!isValidTreeSpot(pos)) return;
    const isLarge = seededRandom(seed++) > 0.5;
    const amount = isLarge ? 30 : 20;
    resourceNodes.push({
      id: `wood_osm_${idx}`,
      type: 'wood',
      subType: isLarge ? 'tree_large' : 'tree',
      position: pos,
      rotation: seededRandom(seed++) * Math.PI * 2,
      scale: 0.8 + seededRandom(seed++) * 0.4,
      source: 'osm_point',
      amount,
      maxAmount: amount,
      isDepleted: false,
    });
  });

  // Scatter trees in park/grass/forest landuse
  landuse.forEach((lu) => {
    if (lu.type === 'park' || lu.type === 'forest' || lu.type === 'grass') {
      const centroid = calculateCentroid(lu.polygon);
      const area = Math.abs(polygonSignedArea(lu.polygon));
      const treeCount = Math.min(Math.floor(area / (lu.type === 'forest' ? 70 : 150)), 35);

      for (let i = 0; i < treeCount; i++) {
        // Sample candidate points inside the actual landuse polygon
        let placed = false;
        for (let attempt = 0; attempt < 8; attempt++) {
          const angle = seededRandom(seed++) * Math.PI * 2;
          const dist = Math.sqrt(seededRandom(seed++)) * Math.sqrt(area / Math.PI) * 0.75;
          const pt: Point2D = {
            x: centroid.x + Math.cos(angle) * dist,
            z: centroid.z + Math.sin(angle) * dist,
          };
          if (isPointInPolygon(pt, lu.polygon) && isValidTreeSpot(pt)) {
            const isLarge = seededRandom(seed++) > 0.3;
            const amount = isLarge ? 30 : 20;
            resourceNodes.push({
              id: `wood_park_${lu.id}_${i}`,
              type: 'wood',
              subType: isLarge ? 'tree_large' : 'tree',
              position: pt,
              rotation: seededRandom(seed++) * Math.PI * 2,
              scale: 0.85 + seededRandom(seed++) * 0.5,
              source: 'park_scatter',
              amount,
              maxAmount: amount,
              isDepleted: false,
            });
            placed = true;
            break;
          }
        }
      }
    }
  });

  // Roadside trees and abandoned vehicles/metal objects
  roads.forEach((road) => {
    if (road.points.length < 2) return;
    const isPedestrian = road.highwayType === 'footway' || road.highwayType === 'pedestrian';
    const isDrivable = !isPedestrian && road.width >= 4;

    for (let i = 0; i < road.points.length - 1; i++) {
      const p1 = road.points[i];
      const p2 = road.points[i + 1];
      const segLen = distance2D(p1, p2);
      if (segLen < 8) continue;

      const dx = (p2.x - p1.x) / segLen;
      const dz = (p2.z - p1.z) / segLen;
      // Perpendicular normal vector
      const nx = -dz;
      const nz = dx;
      const angle = Math.atan2(dz, dx);

      // Trees along road verge (every ~35m on non-motorways)
      if (!isPedestrian && road.highwayType !== 'motorway') {
        const treeSteps = Math.floor(segLen / 32);
        for (let s = 1; s <= treeSteps; s++) {
          if (seededRandom(seed++) > 0.4) {
            const t = s / (treeSteps + 1);
            const side = seededRandom(seed++) > 0.5 ? 1 : -1;
            // Tree placed on roadside verge
            const offset = (road.width / 2 + 2.0) * side;
            const treePos: Point2D = {
              x: p1.x + dx * segLen * t + nx * offset,
              z: p1.z + dz * segLen * t + nz * offset,
            };
            if (isValidTreeSpot(treePos)) {
              resourceNodes.push({
                id: `wood_road_${road.id}_${i}_${s}`,
                type: 'wood',
                subType: 'tree',
                position: treePos,
                rotation: seededRandom(seed++) * Math.PI * 2,
                scale: 0.75 + seededRandom(seed++) * 0.35,
                source: 'road_side',
                amount: 20,
                maxAmount: 20,
                isDepleted: false,
              });
            }
          }
        }
      }

      // 3B. Metal Nodes: Abandoned vehicles strictly on drivable road surfaces
      if (isDrivable) {
        const carSteps = Math.floor(segLen / 45);
        for (let s = 1; s <= carSteps; s++) {
          if (seededRandom(seed++) > 0.35) {
            const t = (s + (seededRandom(seed++) - 0.5) * 0.3) / (carSteps + 1);
            const side = seededRandom(seed++) > 0.6 ? 1 : -1;
            // Place vehicle strictly within asphalt lane width
            const maxLaneOffset = Math.max(0.2, road.width / 2 - 1.3);
            const isCurbside = seededRandom(seed++) > 0.3;
            const offset = isCurbside ? maxLaneOffset * side : (seededRandom(seed++) - 0.5) * (maxLaneOffset * 0.8);
            const carAngle = isCurbside ? angle + (seededRandom(seed++) - 0.5) * 0.15 : angle + (seededRandom(seed++) - 0.5) * 0.5;

            const carPos: Point2D = {
              x: p1.x + dx * segLen * t + nx * offset,
              z: p1.z + dz * segLen * t + nz * offset,
            };

            // Vehicles must not spawn in water
            if (!isPtInWater(carPos)) {
              const rType = seededRandom(seed++);
              let subType: ResourceNode['subType'] = 'car_sedan';
              let amount = 25;
              if (rType > 0.75) {
                subType = 'truck';
                amount = 45;
              } else if (rType > 0.45) {
                subType = 'car_suv';
                amount = 35;
              }

              resourceNodes.push({
                id: `metal_car_${road.id}_${i}_${s}`,
                type: 'metal',
                subType,
                position: carPos,
                rotation: carAngle,
                scale: 0.95 + seededRandom(seed++) * 0.15,
                source: 'road_side',
                amount,
                maxAmount: amount,
                isDepleted: false,
              });
            }
          }
        }
      }
    }
  });

  // Explicit Street Lamps (Metal)
  explicitLamps.forEach((pos, idx) => {
    if (isPtInWater(pos) || isPtInBuilding(pos, 0.5)) return;
    resourceNodes.push({
      id: `metal_lamp_${idx}`,
      type: 'metal',
      subType: 'lamppost',
      position: pos,
      rotation: seededRandom(seed++) * Math.PI * 2,
      scale: 1.0,
      source: 'osm_point',
      amount: 15,
      maxAmount: 15,
      isDepleted: false,
    });
  });

  // 3C. Brick & Rubble Piles around building perimeters and alley corners (§7.2)
  buildings.forEach((bldg) => {
    if (seededRandom(seed++) > 0.55 && bldg.polygon.length >= 3) {
      // Pick a corner or edge of the building
      const cornerIdx = Math.floor(seededRandom(seed++) * bldg.polygon.length);
      const pt = bldg.polygon[cornerIdx];
      // Offset outwards from building center
      const dirX = pt.x - bldg.center.x;
      const dirZ = pt.z - bldg.center.z;
      const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
      const rubblePos: Point2D = {
        x: pt.x + (dirX / len) * (1.5 + seededRandom(seed++) * 2),
        z: pt.z + (dirZ / len) * (1.5 + seededRandom(seed++) * 2),
      };

      resourceNodes.push({
        id: `brick_rubble_${bldg.id}`,
        type: 'bricks',
        subType: seededRandom(seed++) > 0.5 ? 'rubble_brick' : 'rubble_concrete',
        position: rubblePos,
        rotation: seededRandom(seed++) * Math.PI * 2,
        scale: 0.8 + seededRandom(seed++) * 0.6,
        source: 'building_perimeter',
        amount: 25,
        maxAmount: 25,
        isDepleted: false,
      });
    }
  });

  const woodCount = resourceNodes.filter((n) => n.type === 'wood').length;
  const metalCount = resourceNodes.filter((n) => n.type === 'metal').length;
  const bricksCount = resourceNodes.filter((n) => n.type === 'bricks').length;

  const totalTime = Math.round(performance.now() - startTime);

  return {
    center,
    radius,
    elevation,
    buildings,
    roads,
    landuse,
    resourceNodes,
    bounds: { minX, maxX, minZ, maxZ },
    stats: {
      buildingCount: buildings.length,
      roadCount: roads.length,
      resourceCount: {
        wood: woodCount,
        metal: metalCount,
        bricks: bricksCount,
        total: resourceNodes.length,
      },
      elevationRangeMeters: Math.round(elevation.maxElevation - elevation.minElevation),
      processedTimeMs: totalTime,
    },
    fetchedAt: Date.now(),
    source,
  };
}

/**
 * Accurately clips and crops MapData (buildings, roads, landuse, resource nodes)
 * strictly into the defined grid boundary rectangle.
 */
export function cropMapDataToGrid(
  mapData: MapData,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
): MapData {
  const margin = 8; // Small safety tolerance in meters
  const minX = bounds.minX - margin;
  const maxX = bounds.maxX + margin;
  const minZ = bounds.minZ - margin;
  const maxZ = bounds.maxZ + margin;

  // Filter buildings to those with center or polygon overlapping grid bounds
  const buildings = mapData.buildings.filter((b) => {
    if (
      b.center.x >= minX &&
      b.center.x <= maxX &&
      b.center.z >= minZ &&
      b.center.z <= maxZ
    ) {
      return true;
    }
    // If any vertex is within grid
    return b.polygon.some(
      (p) => p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ
    );
  });

  // Filter and clip roads: keep road segments with points within the grid
  const roads: RoadSegment[] = [];
  for (const road of mapData.roads) {
    const validPoints = road.points.filter(
      (p) => p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ
    );
    if (validPoints.length >= 2) {
      roads.push({
        ...road,
        points: validPoints,
      });
    }
  }

  // Filter landuse areas
  const landuse = mapData.landuse.filter((l) => {
    if (!l.polygon || l.polygon.length === 0) return false;
    const center = calculateCentroid(l.polygon);
    return (
      center.x >= minX &&
      center.x <= maxX &&
      center.z >= minZ &&
      center.z <= maxZ
    );
  });

  // Filter resource nodes
  const resourceNodes = mapData.resourceNodes.filter((n) => {
    return (
      n.position.x >= bounds.minX &&
      n.position.x <= bounds.maxX &&
      n.position.z >= bounds.minZ &&
      n.position.z <= bounds.maxZ
    );
  });

  const woodCount = resourceNodes.filter((n) => n.type === 'wood').length;
  const metalCount = resourceNodes.filter((n) => n.type === 'metal').length;
  const bricksCount = resourceNodes.filter((n) => n.type === 'bricks').length;

  const width = Math.abs(bounds.maxX - bounds.minX);
  const height = Math.abs(bounds.maxZ - bounds.minZ);
  const radius = Math.max(width, height) / 2;

  // Preserve the original elevation grid and its spatial bounds so that
  // sampleElevation continues to accurately map (X, Z) coordinates to DEM data
  const croppedElevation = mapData.elevation;

  return {
    ...mapData,
    radius,
    buildings,
    roads,
    landuse,
    resourceNodes,
    elevation: croppedElevation,
    bounds: { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ },
    stats: {
      ...mapData.stats,
      buildingCount: buildings.length,
      roadCount: roads.length,
      resourceCount: {
        wood: woodCount,
        metal: metalCount,
        bricks: bricksCount,
        total: resourceNodes.length,
      },
    },
  };
}
