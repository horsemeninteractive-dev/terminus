import { GeoPoint, Point2D } from '../types/map';

const EARTH_RADIUS = 6378137; // meters (WGS84)

/**
 * Projects a WGS84 Lat/Lon coordinate to local Cartesian (X: East, Z: South/Depth).
 * Center of map is at (0, 0).
 */
export function latLonToMeters(lat: number, lon: number, centerLat: number, centerLon: number): Point2D {
  const rad = Math.PI / 180;
  const avgLatRad = (centerLat * Math.PI) / 180;
  
  const x = (lon - centerLon) * rad * EARTH_RADIUS * Math.cos(avgLatRad);
  const z = -(lat - centerLat) * rad * EARTH_RADIUS; // -Z is North, +Z is South in Three.js convention

  return {
    x: Math.round(x * 100) / 100,
    z: Math.round(z * 100) / 100,
  };
}

/**
 * Converts local meter coordinates back to Lat/Lon.
 */
export function metersToLatLon(x: number, z: number, centerLat: number, centerLon: number): GeoPoint {
  const rad = Math.PI / 180;
  const avgLatRad = (centerLat * Math.PI) / 180;

  const lon = centerLon + x / (rad * EARTH_RADIUS * Math.cos(avgLatRad));
  const lat = centerLat - z / (rad * EARTH_RADIUS);

  return { lat, lon };
}

/**
 * Calculate distance between two 2D points in meters.
 */
export function distance2D(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Calculate centroid of a polygon.
 */
export function calculateCentroid(points: Point2D[]): Point2D {
  if (!points || points.length === 0) return { x: 0, z: 0 };
  let sumX = 0;
  let sumZ = 0;
  for (const p of points) {
    sumX += p.x;
    sumZ += p.z;
  }
  return {
    x: Math.round((sumX / points.length) * 100) / 100,
    z: Math.round((sumZ / points.length) * 100) / 100,
  };
}

/**
 * Signed area of a polygon (positive = counter-clockwise, negative = clockwise).
 */
export function polygonSignedArea(points: Point2D[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].z - points[j].x * points[i].z;
  }
  return area / 2;
}

/**
 * Ramer-Douglas-Peucker simplification for polygon/path vertices to optimize rendering.
 */
export function simplifyPoints(points: Point2D[], tolerance: number = 0.5): Point2D[] {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let index = 0;

  const p1 = points[0];
  const p2 = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], p1, p2);
    if (d > maxDistance) {
      maxDistance = d;
      index = i;
    }
  }

  if (maxDistance > tolerance) {
    const left = simplifyPoints(points.slice(0, index + 1), tolerance);
    const right = simplifyPoints(points.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  } else {
    return [p1, p2];
  }
}

function perpendicularDistance(p: Point2D, p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  if (dx === 0 && dz === 0) {
    return distance2D(p, p1);
  }
  const numerator = Math.abs(dz * p.x - dx * p.z + p2.x * p1.z - p2.z * p1.x);
  const denominator = Math.sqrt(dx * dx + dz * dz);
  return numerator / denominator;
}

/**
 * Converts meters to delta latitude (degrees).
 */
export function metersToDeltaLat(meters: number): number {
  const rad = Math.PI / 180;
  return meters / (rad * EARTH_RADIUS);
}

/**
 * Converts meters to delta longitude (degrees) at a given latitude.
 */
export function metersToDeltaLon(meters: number, lat: number): number {
  const rad = Math.PI / 180;
  const avgLatRad = (lat * Math.PI) / 180;
  return meters / (rad * EARTH_RADIUS * Math.cos(avgLatRad));
}

/**
 * Ensures outer ring is Counter-Clockwise (CCW) for standard Three.js Shape.
 */
export function ensureCCW(points: Point2D[]): Point2D[] {
  if (polygonSignedArea(points) < 0) {
    return [...points].reverse();
  }
  return points;
}

/**
 * Ensures inner holes are Clockwise (CW) for standard Three.js Path holes.
 */
export function ensureCW(points: Point2D[]): Point2D[] {
  if (polygonSignedArea(points) > 0) {
    return [...points].reverse();
  }
  return points;
}

/**
 * Point in polygon test using ray-casting algorithm
 */
export function isPointInPolygon(pt: Point2D, polygon: Point2D[]): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;

    const intersect =
      zi > pt.z !== zj > pt.z &&
      pt.x < ((xj - xi) * (pt.z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Shortest distance from a 2D point to a finite line segment (p1 to p2)
 */
export function distancePointToSegment(pt: Point2D, p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return distance2D(pt, p1);
  let t = ((pt.x - p1.x) * dx + (pt.z - p1.z) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance2D(pt, {
    x: p1.x + t * dx,
    z: p1.z + t * dz,
  });
}
