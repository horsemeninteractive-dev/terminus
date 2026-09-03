import type { Point2D } from '../types/map';

/** Absolute 2D polygon area via the shoelace formula. */
export function polygonArea(poly: Point2D[]): number {
  if (!poly || poly.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].z - poly[j].x * poly[i].z;
  }
  return Math.abs(area) / 2;
}

/** Axis-aligned bounding box of a polygon. */
export function polygonBounds(poly: Point2D[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  if (!isFinite(minX)) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return { minX, maxX, minZ, maxZ };
}

/** Centroid (average of vertices — good enough for gameplay purposes). */
export function polygonCentroid(poly: Point2D[]): Point2D {
  let x = 0;
  let z = 0;
  const n = Math.max(1, poly.length);
  for (const p of poly) {
    x += p.x;
    z += p.z;
  }
  return { x: x / n, z: z / n };
}

/**
 * Dominant (longest) local axis of a footprint via PCA, plus the perpendicular
 * cross-section direction and the polygon centre. All footprint-relative
 * painting (§7.1) measures the building in this frame, so a drag's meaning is
 * "how far across THIS building" rather than an arbitrary world rectangle.
 * Mirrors the roof-ridge PCA used by BuildingRenderer (kept local there to
 * avoid a render→service import).
 */
export function footprintAxes(poly: Point2D[]): {
  cx: number;
  cz: number;
  ax: number; // unit vector along the longest axis
  az: number;
  nx: number; // unit vector perpendicular to it (cross-section direction)
  nz: number;
} {
  const n = Math.max(1, poly.length);
  let cx = 0, cz = 0;
  for (const p of poly) { cx += p.x; cz += p.z; }
  cx /= n; cz /= n;
  let xx = 0, xz = 0, zz = 0;
  for (const p of poly) {
    const dx = p.x - cx, dz = p.z - cz;
    xx += dx * dx; xz += dx * dz; zz += dz * dz;
  }
  const trace = xx + zz;
  const det = xx * zz - xz * xz;
  const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
  const l1 = trace / 2 + disc;
  let ax = l1 - zz, az = xz;
  const alen = Math.hypot(ax, az);
  if (alen < 1e-6) { ax = 1; az = 0; }
  else { ax /= alen; az /= alen; }
  return { cx, cz, ax, az, nx: -az, nz: ax };
}

type EdgeFunc = (p: Point2D) => boolean;

function clipHalfPlane(
  subject: Point2D[],
  inside: EdgeFunc,
  intersect: (a: Point2D, b: Point2D) => Point2D
): Point2D[] {
  const out: Point2D[] = [];
  const n = subject.length;
  if (n === 0) return out;
  for (let i = 0; i < n; i++) {
    const cur = subject[i];
    const next = subject[(i + 1) % n];
    const curIn = inside(cur);
    const nextIn = inside(next);
    if (curIn) out.push(cur);
    if (curIn !== nextIn) out.push(intersect(cur, next));
  }
  return out;
}

/**
 * Sutherland–Hodgman clip of an arbitrary polygon against the half-plane
 * `n.x * p.x + n.z * p.z <= c` (the kept side). Returns the clipped polygon,
 * possibly empty when nothing survives.
 */
export function clipPolygonHalfPlane(poly: Point2D[], n: { x: number; z: number }, c: number): Point2D[] {
  if (!poly || poly.length < 3) return [];
  return clipHalfPlane(
    poly,
    (p) => p.x * n.x + p.z * n.z <= c,
    (a, b) => {
      const da = a.x * n.x + a.z * n.z - c;
      const db = b.x * n.x + b.z * n.z - c;
      const t = da / (da - db || 1e-9);
      return { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) };
    }
  );
}

/**
 * Sutherland–Hodgman clip of an arbitrary polygon against the strip
 * `lo <= n.x * p.x + n.z * p.z <= hi` (two parallel half-plane cuts).
 */
export function clipPolygonToStrip(poly: Point2D[], n: { x: number; z: number }, lo: number, hi: number): Point2D[] {
  const above = clipPolygonHalfPlane(poly, n, hi);
  return clipPolygonHalfPlane(above, { x: -n.x, z: -n.z }, -lo);
}

/**
 * Sutherland–Hodgman clip of an arbitrary polygon against an axis-aligned
 * rectangle (kept for rectangle-mediated callers). Returns the clipped polygon,
 * possibly empty when there is no overlap.
 */
export function clipPolygonToRect(
  poly: Point2D[],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): Point2D[] {
  let result = poly;
  // Left
  result = clipHalfPlane(
    result,
    (p) => p.x >= minX,
    (a, b) => {
      const t = (minX - a.x) / (b.x - a.x || 1e-9);
      return { x: minX, z: a.z + t * (b.z - a.z) };
    }
  );
  // Right
  result = clipHalfPlane(
    result,
    (p) => p.x <= maxX,
    (a, b) => {
      const t = (maxX - a.x) / (b.x - a.x || 1e-9);
      return { x: maxX, z: a.z + t * (b.z - a.z) };
    }
  );
  // Bottom
  result = clipHalfPlane(
    result,
    (p) => p.z >= minZ,
    (a, b) => {
      const t = (minZ - a.z) / (b.z - a.z || 1e-9);
      return { x: a.x + t * (b.x - a.x), z: minZ };
    }
  );
  // Top
  result = clipHalfPlane(
    result,
    (p) => p.z <= maxZ,
    (a, b) => {
      const t = (maxZ - a.z) / (b.z - a.z || 1e-9);
      return { x: a.x + t * (b.x - a.x), z: maxZ };
    }
  );
  return result;
}

export interface SweptSelection {
  /** The footprint portion the player painted, clipped to the real building. */
  polygon: Point2D[];
  /** Selected area / full footprint area (0..1) — the physical coverage. */
  fraction: number;
  areaM2: number;
  /** True when the band sweeps along the building's longest axis. */
  alongLongAxis: boolean;
}

/**
 * §7.1 footprint-relative paint selection: interprets a press + drag as a
 * sweep ACROSS the building itself. The band between the anchor's and the
 * cursor's projection onto the building's local sweep axis (the axis the drag
 * most closely follows) is clipped to the real footprint, so the result is
 * always a physical portion of that building — never an arbitrary world-space
 * rectangle. Dragging the whole length yields ~100% regardless of how far the
 * cursor travels past the building.
 *
 * Returns null when the polygon/area is degenerate.
 *
 * Pass `alongLongAxis` to LOCK the sweep axis for a whole gesture (the caller
 * latches the first automatic choice), so a wobbling cursor mid-drag can never
 * make the painted band flip between axes.
 */
export function sweepFootprintSelection(
  poly: Point2D[],
  anchor: Point2D,
  cursor: Point2D,
  alongLongAxis?: boolean
): SweptSelection | null {
  if (!poly || poly.length < 3) return null;
  const full = polygonArea(poly);
  if (full <= 0) return null;
  const { ax, az, nx, nz } = footprintAxes(poly);

  // Sweep along whichever local axis the drag most closely follows. The cut
  // lines are perpendicular to it, so the band spans the whole cross-section.
  const dragX = cursor.x - anchor.x;
  const dragZ = cursor.z - anchor.z;
  const alongLong = Math.abs(dragX * ax + dragZ * az);
  const alongCross = Math.abs(dragX * nx + dragZ * nz);
  const useLong = alongLongAxis !== undefined ? alongLongAxis : alongLong >= alongCross;
  const n = useLong ? { x: ax, z: az } : { x: nx, z: nz };

  // Projection onto the sweep axis in RAW world coordinates (the half-plane
  // clip below interprets its constant the same way). Clamp both ends to the
  // real footprint's extent so the band never extends past the building.
  const proj = (p: Point2D) => p.x * n.x + p.z * n.z;
  let tMin = Infinity, tMax = -Infinity;
  for (const p of poly) {
    const t = proj(p);
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }
  const clamp = (t: number) => Math.min(tMax, Math.max(tMin, t));
  const lo = clamp(Math.min(proj(anchor), proj(cursor)));
  const hi = clamp(Math.max(proj(anchor), proj(cursor)));
  const clipped = hi - lo < 0.01 ? [] : clipPolygonToStrip(poly, n, lo, hi);
  if (clipped.length < 3) {
    return { polygon: [], fraction: 0, areaM2: 0, alongLongAxis: useLong };
  }
  const area = polygonArea(clipped);
  return { polygon: clipped, fraction: area / full, areaM2: area, alongLongAxis: useLong };
}

export interface FootprintStrip {
  polygon: Point2D[];
  center: Point2D;
  areaM2: number;
}

/**
 * Splits a building footprint into `parts` roughly-equal vertical strips cut
 * along the building's longest axis (IFZ-style sectioning). Each strip is the
 * polygon ∩ strip rectangle, so the sections tessellate the real footprint.
 */
export function splitFootprintIntoStrips(poly: Point2D[], parts: number): FootprintStrip[] {
  if (!poly || poly.length < 3 || parts < 2) return [];
  const b = polygonBounds(poly);
  const w = b.maxX - b.minX;
  const h = b.maxZ - b.minZ;
  const alongX = w >= h;
  const span = alongX ? w : h;
  const step = span / parts;
  const out: FootprintStrip[] = [];
  for (let i = 0; i < parts; i++) {
    const lo = (alongX ? b.minX : b.minZ) + i * step;
    const hi = lo + step;
    const clipped = alongX
      ? clipPolygonToRect(poly, lo, hi, b.minZ, b.maxZ)
      : clipPolygonToRect(poly, b.minX, b.maxX, lo, hi);
    if (clipped.length >= 3) {
      const area = polygonArea(clipped);
      if (area > 0.5) {
        out.push({ polygon: clipped, center: polygonCentroid(clipped), areaM2: area });
      }
    }
  }
  return out;
}