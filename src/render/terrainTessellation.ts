import { Point2D } from '../types/map';

/**
 * Fast ray-casting point-in-polygon test
 */
export function isPointInPolygon(x: number, z: number, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;

    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Subdivides polygon boundary edges so no edge is longer than maxEdgeLength.
 * This ensures the boundary cleanly follows the 3D elevation curvature.
 */
export function subdividePolygonEdges(polygon: Point2D[], maxEdgeLength = 5.0): Point2D[] {
  if (polygon.length < 2) return polygon;
  const result: Point2D[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    result.push(p1);

    const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    if (dist > maxEdgeLength) {
      const steps = Math.ceil(dist / maxEdgeLength);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        result.push({
          x: p1.x + (p2.x - p1.x) * t,
          z: p1.z + (p2.z - p1.z) * t,
        });
      }
    }
  }

  return result;
}

interface Triangle {
  a: number;
  b: number;
  c: number;
}

/**
 * Robust 2D Bowyer-Watson Delaunay triangulation with super-triangle
 */
function delaunay2D(points: Point2D[]): number[] {
  const n = points.length;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  // Find bounding box
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const dx = maxX - minX;
  const dz = maxZ - minZ;
  const deltaMax = Math.max(dx, dz, 1) * 20;
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;

  // Add 3 super-triangle vertices
  const allPoints: Point2D[] = [...points];
  const st0 = n;
  const st1 = n + 1;
  const st2 = n + 2;

  allPoints.push({ x: midX - deltaMax, z: midZ - deltaMax });
  allPoints.push({ x: midX, z: midZ + deltaMax });
  allPoints.push({ x: midX + deltaMax, z: midZ - deltaMax });

  let triangles: Triangle[] = [{ a: st0, b: st1, c: st2 }];

  // Helper to check circumcircle inclusion
  const inCircumcircle = (p: Point2D, t: Triangle): boolean => {
    const pa = allPoints[t.a];
    const pb = allPoints[t.b];
    const pc = allPoints[t.c];

    const ax = pa.x - p.x;
    const az = pa.z - p.z;
    const bx = pb.x - p.x;
    const bz = pb.z - p.z;
    const cx = pc.x - p.x;
    const cz = pc.z - p.z;

    const det =
      (ax * ax + az * az) * (bx * cz - cx * bz) -
      (bx * bx + bz * bz) * (ax * cz - cx * az) +
      (cx * cx + cz * cz) * (ax * bz - bx * az);

    // CCW orientation factor
    const orientation = (pb.x - pa.x) * (pc.z - pa.z) - (pb.z - pa.z) * (pc.x - pa.x);
    return orientation > 0 ? det > 1e-9 : det < -1e-9;
  };

  // Insert each point into the triangulation
  for (let i = 0; i < n; i++) {
    const p = allPoints[i];
    const badTriangles: Triangle[] = [];
    const polygonEdges: Array<{ p1: number; p2: number }> = [];

    // Find all triangles that are no longer valid due to the insertion
    for (let t = 0; t < triangles.length; t++) {
      if (inCircumcircle(p, triangles[t])) {
        badTriangles.push(triangles[t]);
      }
    }

    // Find boundary of the polygonal hole
    for (let t = 0; t < badTriangles.length; t++) {
      const tri = badTriangles[t];
      const edges = [
        { p1: tri.a, p2: tri.b },
        { p1: tri.b, p2: tri.c },
        { p1: tri.c, p2: tri.a },
      ];

      for (let e = 0; e < 3; e++) {
        const edge = edges[e];
        let isShared = false;
        for (let otherT = 0; otherT < badTriangles.length; otherT++) {
          if (otherT === t) continue;
          const oTri = badTriangles[otherT];
          const oEdges = [
            { p1: oTri.a, p2: oTri.b },
            { p1: oTri.b, p2: oTri.c },
            { p1: oTri.c, p2: oTri.a },
          ];
          for (let oe = 0; oe < 3; oe++) {
            const oEdge = oEdges[oe];
            if (
              (edge.p1 === oEdge.p1 && edge.p2 === oEdge.p2) ||
              (edge.p1 === oEdge.p2 && edge.p2 === oEdge.p1)
            ) {
              isShared = true;
              break;
            }
          }
          if (isShared) break;
        }

        if (!isShared) {
          polygonEdges.push(edge);
        }
      }
    }

    // Remove bad triangles
    triangles = triangles.filter((t) => !badTriangles.includes(t));

    // Re-triangulate the polygonal hole with new point i
    for (let e = 0; e < polygonEdges.length; e++) {
      const edge = polygonEdges[e];
      triangles.push({ a: edge.p1, b: edge.p2, c: i });
    }
  }

  // Remove triangles that share vertices with the super-triangle
  const validIndices: number[] = [];
  for (let t = 0; t < triangles.length; t++) {
    const tri = triangles[t];
    if (tri.a < n && tri.b < n && tri.c < n) {
      validIndices.push(tri.a, tri.b, tri.c);
    }
  }

  return validIndices;
}

export interface TessellatedMesh2D {
  points: Point2D[];
  indices: number[];
}

/**
 * Tessellates an arbitrary 2D polygon with internal Steiner grid points.
 * Ensures the resulting mesh has vertices spaced every `gridStep` meters throughout
 * its entire interior, allowing it to conform precisely to undulating 3D terrain heightfields.
 */
export function tessellatePolygonConformal(
  polygon: Point2D[],
  maxEdgeLength = 5.0,
  gridStep = 5.0
): TessellatedMesh2D {
  if (!polygon || polygon.length < 3) {
    return { points: [], indices: [] };
  }

  // 1. Subdivide outer boundary edges
  const boundaryPoints = subdividePolygonEdges(polygon, maxEdgeLength);

  // 2. Compute bounding box
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const p of boundaryPoints) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const width = maxX - minX;
  const depth = maxZ - minZ;

  // Calculate appropriate internal sampling step based on polygon area & dimensions
  const maxSpan = Math.max(width, depth);
  const areaApprox = width * depth;
  const targetStep = Math.max(gridStep, Math.sqrt(areaApprox / 650));
  const effectiveGridStep = Math.min(Math.max(targetStep, 3.5), 10.0);

  const allPoints: Point2D[] = [...boundaryPoints];

  // 3. Generate internal sample points
  const startX = minX + effectiveGridStep * 0.5;
  const startZ = minZ + effectiveGridStep * 0.5;

  for (let z = startZ; z < maxZ; z += effectiveGridStep) {
    for (let x = startX; x < maxX; x += effectiveGridStep) {
      if (isPointInPolygon(x, z, polygon)) {
        // Add point with subtle jitter to prevent degenerate collinear grids in Delaunay
        const jitterX = (Math.sin(x * 12.9898 + z * 78.233) * 0.1) * effectiveGridStep;
        const jitterZ = (Math.cos(x * 39.346 + z * 11.135) * 0.1) * effectiveGridStep;
        const px = x + jitterX;
        const pz = z + jitterZ;
        if (isPointInPolygon(px, pz, polygon)) {
          allPoints.push({ x: px, z: pz });
        }
      }
    }
  }

  // 4. Perform 2D Delaunay Triangulation
  const rawIndices = delaunay2D(allPoints);
  const filteredIndices: number[] = [];

  // 5. Filter out triangles whose centroids lie outside the polygon
  for (let i = 0; i < rawIndices.length; i += 3) {
    const i0 = rawIndices[i];
    const i1 = rawIndices[i + 1];
    const i2 = rawIndices[i + 2];

    const p0 = allPoints[i0];
    const p1 = allPoints[i1];
    const p2 = allPoints[i2];

    const cx = (p0.x + p1.x + p2.x) / 3;
    const cz = (p0.z + p1.z + p2.z) / 3;

    if (isPointInPolygon(cx, cz, polygon)) {
      // Ensure counter-clockwise winding (for upward-facing normals when rotated to XZ plane)
      const winding = (p1.x - p0.x) * (p2.z - p0.z) - (p1.z - p0.z) * (p2.x - p0.x);
      if (winding < 0) {
        filteredIndices.push(i0, i1, i2);
      } else {
        filteredIndices.push(i0, i2, i1);
      }
    }
  }

  return {
    points: allPoints,
    indices: filteredIndices,
  };
}
