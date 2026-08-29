import { BuildingPolygon, MapData, Point2D } from '../types/map';

/**
 * Grid-based weighted A* pathfinding (§5 movement).
 *
 * Open terrain and roads are fast, while traversing through building footprints
 * has a high travel cost / low movement speed (0.4x).
 * Pathfinding always computes the FASTEST path to a destination:
 * - If routing around a building is faster, units cleanly path around the perimeter.
 * - If going through is faster (or entering a building), units can path through at reduced speed.
 */

const DEFAULT_CELL_SIZE = 5;
export const INDOOR_SPEED_MULTIPLIER = 0.42;

// A* traversal cost of a building cell. Kept exactly inverse of the real indoor
// movement slowdown so the pathfinder's time model matches the movement model:
// a route is chosen through a building only when it genuinely saves travel time.
const INDOOR_CELL_COST = 1 / INDOOR_SPEED_MULTIPLIER; // ~2.38

function pointInPolygon(x: number, z: number, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

class MinHeap {
  private indices: number[] = [];
  private scores: number[] = [];

  get size() {
    return this.indices.length;
  }

  push(index: number, score: number) {
    this.indices.push(index);
    this.scores.push(score);
    let i = this.indices.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.scores[p] <= this.scores[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.indices[0];
    const lastIndex = this.indices.pop()!;
    const lastScore = this.scores.pop()!;
    if (this.indices.length > 0) {
      this.indices[0] = lastIndex;
      this.scores[0] = lastScore;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.indices.length && this.scores[l] < this.scores[smallest]) smallest = l;
        if (r < this.indices.length && this.scores[r] < this.scores[smallest]) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number) {
    [this.indices[a], this.indices[b]] = [this.indices[b], this.indices[a]];
    [this.scores[a], this.scores[b]] = [this.scores[b], this.scores[a]];
  }
}

export interface PathState {
  path: Point2D[];
  index: number;
  goalKey: string;
}

export class PathGrid {
  readonly cellSize: number;
  readonly minX: number;
  readonly minZ: number;
  readonly cols: number;
  readonly rows: number;
  private cellCosts: Float32Array;
  private isBuildingCell: Uint8Array;
  private rawBuildings: BuildingPolygon[];

  constructor(mapData: MapData, cellSize = DEFAULT_CELL_SIZE) {
    this.cellSize = cellSize;
    this.rawBuildings = mapData.buildings || [];
    const b = mapData.bounds;
    // Pad extra ring of cells so entities can route around the outermost buildings.
    this.minX = b.minX - cellSize * 2;
    this.minZ = b.minZ - cellSize * 2;
    this.cols = Math.ceil((b.maxX - b.minX + cellSize * 4) / cellSize) + 1;
    this.rows = Math.ceil((b.maxZ - b.minZ + cellSize * 4) / cellSize) + 1;

    const totalCells = this.cols * this.rows;
    this.cellCosts = new Float32Array(totalCells).fill(1.0);
    this.isBuildingCell = new Uint8Array(totalCells);

    // Rasterize roads as lower-cost traversal (0.75x)
    if (mapData.roads) {
      for (const rd of mapData.roads) {
        if (!rd.points) continue;
        for (let i = 0; i < rd.points.length - 1; i++) {
          this.rasterizeRoadSegment(rd.points[i], rd.points[i + 1]);
        }
      }
    }

    // Rasterize buildings with indoor traversal cost (3.8x)
    for (const bldg of this.rawBuildings) {
      this.rasterizeBuilding(bldg);
    }
  }

  private idx(col: number, row: number): number {
    return row * this.cols + col;
  }

  private isInside(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  private rasterizeRoadSegment(p1: Point2D, p2: Point2D) {
    const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const steps = Math.max(1, Math.ceil(dist / (this.cellSize * 0.6)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = p1.x + (p2.x - p1.x) * t;
      const z = p1.z + (p2.z - p1.z) * t;
      const cell = this.worldToCell(x, z);
      if (cell && this.isInside(cell.col, cell.row)) {
        const id = this.idx(cell.col, cell.row);
        if (this.isBuildingCell[id] === 0) {
          this.cellCosts[id] = 0.72; // Faster along road network
        }
      }
    }
  }

  private rasterizeBuilding(bldg: BuildingPolygon) {
    if (!bldg.polygon || bldg.polygon.length < 3) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of bldg.polygon) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    const c0 = Math.floor((minX - this.minX) / this.cellSize);
    const c1 = Math.floor((maxX - this.minX) / this.cellSize);
    const r0 = Math.floor((minZ - this.minZ) / this.cellSize);
    const r1 = Math.floor((maxZ - this.minZ) / this.cellSize);

    // Mark a cell as building if its center OR any of its four corners lies
    // inside the polygon. The corner test grows the blocked footprint to the
    // real silhouette (cells the polygon merely clips), so a straight line can
    // never slip through the gap between the rasterized cells and the actual
    // building edge — the main cause of squads cutting through buildings.
    const half = this.cellSize / 2;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!this.isInside(c, r)) continue;
        const cx = this.minX + (c + 0.5) * this.cellSize;
        const cz = this.minZ + (r + 0.5) * this.cellSize;
        const inside =
          pointInPolygon(cx, cz, bldg.polygon) ||
          pointInPolygon(cx - half, cz - half, bldg.polygon) ||
          pointInPolygon(cx + half, cz - half, bldg.polygon) ||
          pointInPolygon(cx - half, cz + half, bldg.polygon) ||
          pointInPolygon(cx + half, cz + half, bldg.polygon);
        if (inside) {
          const id = this.idx(c, r);
          this.isBuildingCell[id] = 1;
          this.cellCosts[id] = INDOOR_CELL_COST; // Matches the real 0.42x indoor speed
        }
      }
    }
  }

  public isInsideBuilding(x: number, z: number): boolean {
    const cell = this.worldToCell(x, z);
    if (!cell) return false;
    return this.isBuildingCell[this.idx(cell.col, cell.row)] === 1;
  }

  private worldToCell(x: number, z: number): { col: number; row: number } | null {
    const col = Math.floor((x - this.minX) / this.cellSize);
    const row = Math.floor((z - this.minZ) / this.cellSize);
    if (!this.isInside(col, row)) return null;
    return { col, row };
  }

  private cellCenter(idx: number): Point2D {
    const col = idx % this.cols;
    const row = Math.floor(idx / this.cols);
    return {
      x: this.minX + (col + 0.5) * this.cellSize,
      z: this.minZ + (row + 0.5) * this.cellSize,
    };
  }

  private heuristic(c: number, r: number, gc: number, gr: number): number {
    const dc = Math.abs(c - gc);
    const dr = Math.abs(r - gr);
    return (Math.max(dc, dr) + 0.4142 * Math.min(dc, dr)) * 0.95;
  }

  /**
   * True when the straight line between two points traverses only open terrain
   * (no buildings). Samples the geometric segment every ~1.2m against the
   * (corner-inflated) building mask instead of walking Bresenham cells, so a
   * line can never cut a building corner the cell walk would skip over.
   */
  hasLineOfSight(x1: number, z1: number, x2: number, z2: number): boolean {
    const a = this.worldToCell(x1, z1);
    const b = this.worldToCell(x2, z2);
    if (!a || !b) return false;
    if (a.col === b.col && a.row === b.row) {
      return this.isBuildingCell[this.idx(a.col, a.row)] === 0;
    }

    const dist = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(1, Math.ceil(dist / 1.2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      const cell = this.worldToCell(x, z);
      if (!cell) continue;
      if (this.isBuildingCell[this.idx(cell.col, cell.row)] === 1) return false;
    }
    return true;
  }

  findPath(startX: number, startZ: number, goalX: number, goalZ: number): Point2D[] | null {
    const start = this.worldToCell(startX, startZ);
    const goal = this.worldToCell(goalX, goalZ);
    if (!start || !goal) return null;

    if (start.col === goal.col && start.row === goal.row) return [];

    const size = this.cols * this.rows;
    const gScore = new Float32Array(size).fill(Infinity);
    const cameFrom = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size);

    const startIdx = this.idx(start.col, start.row);
    const goalIdx = this.idx(goal.col, goal.row);
    gScore[startIdx] = 0;

    const open = new MinHeap();
    open.push(startIdx, this.heuristic(start.col, start.row, goal.col, goal.row));

    const dirs: [number, number, number][] = [
      [1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0],
      [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
    ];

    let iterations = 0;
    // Large maps can span several thousand cells in each direction. A fixed
    // 3,500-node ceiling caused distant orders to be treated as failed and then
    // silently fell back to a straight line. Bound the search by the grid size
    // instead, while retaining a generous safety multiplier for malformed maps.
    const maxIterations = Math.max(3500, Math.min(size, 250000));

    while (open.size > 0 && iterations++ < maxIterations) {
      const current = open.pop();
      if (current === goalIdx) break;
      if (closed[current] === 1) continue;
      closed[current] = 1;

      const c = current % this.cols;
      const r = Math.floor(current / this.cols);

      for (const [dc, dr, distMult] of dirs) {
        const nc = c + dc;
        const nr = r + dr;
        if (!this.isInside(nc, nr)) continue;
        const nIdx = this.idx(nc, nr);
        if (closed[nIdx] === 1) continue;

        const cellWeight = this.cellCosts[nIdx];
        const stepCost = distMult * cellWeight;
        const tentative = gScore[current] + stepCost;

        if (tentative < gScore[nIdx]) {
          gScore[nIdx] = tentative;
          cameFrom[nIdx] = current;
          open.push(nIdx, tentative + this.heuristic(nc, nr, goal.col, goal.row));
        }
      }
    }

    if (cameFrom[goalIdx] === -1 && startIdx !== goalIdx) {
      return null;
    }

    const cells: number[] = [];
    let cur = goalIdx;
    while (cur !== -1 && cur !== startIdx) {
      cells.push(cur);
      cur = cameFrom[cur];
    }
    cells.reverse();

    const rawWaypoints = cells.map((i) => this.cellCenter(i));
    rawWaypoints.push({ x: goalX, z: goalZ });

    // Waypoint simplification / smoothing
    return this.smoothPath(rawWaypoints);
  }

  private smoothPath(path: Point2D[]): Point2D[] {
    if (path.length <= 2) return path;
    const smoothed: Point2D[] = [path[0]];
    let currentIdx = 0;

    while (currentIdx < path.length - 1) {
      let furthestIdx = currentIdx + 1;
      for (let next = path.length - 1; next > currentIdx + 1; next--) {
        if (this.hasLineOfSight(path[currentIdx].x, path[currentIdx].z, path[next].x, path[next].z)) {
          furthestIdx = next;
          break;
        }
      }
      smoothed.push(path[furthestIdx]);
      currentIdx = furthestIdx;
    }

    return smoothed;
  }
}

function goalKeyFor(x: number, z: number): string {
  return `${Math.round(x / 2)},${Math.round(z / 2)}`;
}

/**
 * Advances an entity one tick along a path toward a goal.
 * Automatically checks indoor status for movement speed adjustments.
 */
export function stepAlongPath(
  grid: PathGrid | null | undefined,
  state: PathState | null | undefined,
  x: number,
  z: number,
  goalX: number,
  goalZ: number,
  baseSpeed: number,
  delta: number,
  arriveRadius = 1.2
): { x: number; z: number; rotation: number; state: PathState; arrived: boolean; isIndoor: boolean } {
  const goalKey = goalKeyFor(goalX, goalZ);
  let st: PathState =
    state && state.goalKey === goalKey
      ? state
      : { path: [], index: 0, goalKey };

  if (st.path.length === 0) {
    const obstructed = grid ? !grid.hasLineOfSight(x, z, goalX, goalZ) : false;
    const path = obstructed ? grid?.findPath(x, z, goalX, goalZ) : null;
    // Never replace a failed long-distance search with a direct segment: that
    // bypasses buildings and is exactly the regression seen on distant orders.
    // Keep the destination as a last resort only when no grid exists.
    st.path = path && path.length > 0
      ? path
      : grid
      ? [{ x, z }]
      : [{ x: goalX, z: goalZ }];
    st.index = 0;
  }

  // Skip waypoints already reached.
  while (st.index < st.path.length - 1) {
    const wp = st.path[st.index];
    if (Math.hypot(wp.x - x, wp.z - z) < 1.2) st.index++;
    else break;
  }

  const distToGoal = Math.hypot(goalX - x, goalZ - z);
  if (distToGoal <= arriveRadius) {
    return { x, z, rotation: Math.atan2(goalX - x, goalZ - z), state: st, arrived: true, isIndoor: false };
  }

  const isIndoor = grid ? grid.isInsideBuilding(x, z) : false;
  const effectiveSpeed = isIndoor ? baseSpeed * INDOOR_SPEED_MULTIPLIER : baseSpeed;

  const wp = st.path[st.index] ?? { x: goalX, z: goalZ };
  const dx = wp.x - x;
  const dz = wp.z - z;
  const dist = Math.hypot(dx, dz);

  if (dist <= 0.01) {
    st.index = Math.min(st.index + 1, st.path.length - 1);
    return { x, z, rotation: Math.atan2(goalX - x, goalZ - z), state: st, arrived: false, isIndoor };
  }

  const step = Math.min(dist, effectiveSpeed * delta);
  return {
    x: x + (dx / dist) * step,
    z: z + (dz / dist) * step,
    rotation: Math.atan2(dx, dz),
    state: st,
    arrived: false,
    isIndoor,
  };
}
