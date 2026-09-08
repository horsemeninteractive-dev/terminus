import { Point2D, RoadSegment } from '../types/map';

interface GraphNode {
  id: string;
  x: number;
  z: number;
  neighbors: Array<{ nodeId: string; dist: number; cost: number }>;
}

/**
 * Driving cost multiplier per OSM highway class. Vehicles PREFER bigger roads:
 * A* minimises cost, not distance, so a slightly longer trip along a main road
 * beats a shortcut through alleys and footpaths. Footways/steps remain drivable
 * (post-apocalypse) but are priced so they are only used when they are the
 * only connection. Order matters: first match wins in edgeCost().
 */
const ROAD_CLASS_COST: Array<{ types: string[]; cost: number }> = [
  { types: ['motorway', 'motorway_link', 'trunk', 'trunk_link'], cost: 0.55 },
  { types: ['primary', 'primary_link'], cost: 0.7 },
  { types: ['secondary', 'secondary_link'], cost: 0.85 },
  { types: ['tertiary', 'tertiary_link', 'unclassified'], cost: 1.0 },
  { types: ['residential', 'living_street', 'service'], cost: 1.35 },
  // Pedestrian classes: legal-ish for a 4x4 but slow and cramped — a big
  // penalty so genuine roads always win when available.
  { types: ['pedestrian', 'footway', 'cycleway', 'path', 'track', 'bridleway'], cost: 3.5 },
  { types: ['steps'], cost: 8 },
];

/** A* edge cost for a road segment: distance × class weight. */
function edgeCost(road: RoadSegment): number {
  const t = road.highwayType || 'unclassified';
  for (const tier of ROAD_CLASS_COST) {
    if (tier.types.includes(t)) return tier.cost;
  }
  return 1.0;
}

/**
 * Snap cost multiplier when choosing which road point to enter/leave the
 * network through: main roads are the preferred on/off ramps.
 */
function snapCost(road: RoadSegment): number {
  return edgeCost(road);
}

export class RoadNetworkGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private roads: RoadSegment[] = [];

  constructor(roads: RoadSegment[]) {
    this.roads = roads.filter((r) => r.points && r.points.length >= 2);
    this.buildGraph();
  }

  private getNodeKey(x: number, z: number): string {
    // Round to 1.5 meter precision to fuse adjacent road endpoints into shared intersection nodes
    const rx = Math.round(x / 1.5) * 1.5;
    const rz = Math.round(z / 1.5) * 1.5;
    return `${rx.toFixed(1)}_${rz.toFixed(1)}`;
  }

  private buildGraph() {
    this.nodes.clear();

    // Post-apocalypse driving: every road, path and track is drivable — nothing
    // is excluded (footways included), so the graph and the snapping used for
    // routes always agree and vehicles never get routed off the network onto a
    // footway point the graph doesn't contain.
    for (const road of this.roads) {
      const pts = road.points;
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const key1 = this.getNodeKey(p1.x, p1.z);

        if (!this.nodes.has(key1)) {
          this.nodes.set(key1, {
            id: key1,
            x: p1.x,
            z: p1.z,
            neighbors: [],
          });
        }

        if (i > 0) {
          const p0 = pts[i - 1];
          const key0 = this.getNodeKey(p0.x, p0.z);
          const dist = Math.hypot(p1.x - p0.x, p1.z - p0.z);

          if (key0 !== key1) {
            const node0 = this.nodes.get(key0)!;
            const node1 = this.nodes.get(key1)!;

            // Post-apocalypse driving: ignore OSM one-way restrictions — vehicles
            // may travel either direction on any road, path or track.
            const segCost = edgeCost(road);
            if (!node0.neighbors.some((n) => n.nodeId === key1)) {
              node0.neighbors.push({ nodeId: key1, dist, cost: segCost });
            }
            if (!node1.neighbors.some((n) => n.nodeId === key0)) {
              node1.neighbors.push({ nodeId: key0, dist, cost: segCost });
            }
          }
        }
      }
    }
  }

  /**
   * Best point to enter/leave the road network from `pos`. Unlike a pure
   * nearest-point projection this is cost-aware: given several candidate roads
   * within a comparable detour, a main road wins over a footway (driving costs
   * per class), so vehicles ramp onto main roads rather than ducking down a
   * path just because it's a metre closer. `snapRadius` caps how far we're
   * willing to detour to reach a better road class.
   */
  public findBestSnapPoint(
    pos: Point2D,
    snapRadius = 60
  ): { point: Point2D; road: RoadSegment | null; distance: number } {
    let bestPoint: Point2D = { ...pos };
    let bestRoad: RoadSegment | null = null;
    let bestScore = Infinity;

    for (const road of this.roads) {
      const classCost = snapCost(road);
      const pts = road.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const proj = projectPointOnSegment(pos, pts[i], pts[i + 1]);
        const d = Math.hypot(pos.x - proj.x, pos.z - proj.z);
        if (d > snapRadius) continue;
        // Score = drive distance to the ramp × class cost. A main road 30m
        // away (30 × 0.7 = 21) beats a footway 10m away (10 × 3.5 = 35).
        const score = d * classCost;
        if (score < bestScore) {
          bestScore = score;
          bestPoint = proj;
          bestRoad = road;
        }
      }
    }

    // Nothing inside the snap radius: fall back to the plain nearest point.
    if (!bestRoad) return this.findClosestPointOnRoad(pos);
    return { point: bestPoint, road: bestRoad, distance: Math.hypot(pos.x - bestPoint.x, pos.z - bestPoint.z) };
  }

  /**
   * Find the closest point on any road segment to a given point
   */
  public findClosestPointOnRoad(pos: Point2D): {
    point: Point2D;
    road: RoadSegment | null;
    distance: number;
  } {
    let closestPoint: Point2D = { ...pos };
    let minDistance = Infinity;
    let closestRoad: RoadSegment | null = null;

    for (const road of this.roads) {
      const pts = road.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];

        const proj = projectPointOnSegment(pos, p1, p2);
        const d = Math.hypot(pos.x - proj.x, pos.z - proj.z);

        if (d < minDistance) {
          minDistance = d;
          closestPoint = proj;
          closestRoad = road;
        }
      }
    }

    return { point: closestPoint, road: closestRoad, distance: minDistance };
  }

  /**
   * Find nearest graph node to a point
   */
  private findNearestNode(pos: Point2D): GraphNode | null {
    let bestNode: GraphNode | null = null;
    let minDist = Infinity;

    for (const node of this.nodes.values()) {
      const d = Math.hypot(node.x - pos.x, node.z - pos.z);
      if (d < minDist) {
        minDist = d;
        bestNode = node;
      }
    }

    return bestNode;
  }

  /**
   * Compute A* route along real road geometry from start to target. When
   * blockedPolys (player-built wall/tower footprints) are provided, road edges
   * whose midpoint falls inside a blocked footprint are skipped, so the route
   * genuinely goes around freestanding construction rather than re-computing a
   * path that dead-ends against a freshly placed wall.
   */
  public findRoute(
    startPos: Point2D,
    targetPos: Point2D,
    blockedPolys?: Point2D[][],
    edgeSize = 3.0
  ): Point2D[] {
    const roadStart = this.findBestSnapPoint(startPos);
    const roadEnd = this.findBestSnapPoint(targetPos);

    if (!roadStart.road || !roadEnd.road || this.nodes.size === 0) {
      return [roadStart.point, roadEnd.point];
    }

    const isBlockedSegment = (ax: number, az: number, bx: number, bz: number): boolean => {
      if (!blockedPolys || blockedPolys.length === 0) return false;
      // Sample along the segment roughly every edgeSize metres (min 2 samples).
      // If any sample falls inside a wall/tower footprint the edge is impassable,
      // so a short wall sitting mid-road is reliably caught.
      const segLen = Math.hypot(bx - ax, bz - az);
      const n = Math.max(2, Math.ceil(segLen / Math.max(1, edgeSize)));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const sx = ax + (bx - ax) * t;
        const sz = az + (bz - az) * t;
        for (const poly of blockedPolys) {
          if (poly.length >= 3 && isPointInPoly(sx, sz, poly)) return true;
        }
      }
      return false;
    };

    // Direct segment check if both start and end are on the same road
    if (roadStart.road.id === roadEnd.road.id) {
      const straightDist = Math.hypot(
        roadEnd.point.x - roadStart.point.x,
        roadEnd.point.z - roadStart.point.z
      );
      if (
        straightDist < 60 &&
        !isBlockedSegment(roadStart.point.x, roadStart.point.z, roadEnd.point.x, roadEnd.point.z)
      ) {
        return [roadStart.point, roadEnd.point];
      }
    }

    const startNode = this.findNearestNode(roadStart.point);
    const endNode = this.findNearestNode(roadEnd.point);

    if (!startNode || !endNode || startNode.id === endNode.id) {
      return [roadStart.point, roadEnd.point];
    }

    // A* Search on Road Graph. Cost = distance × road-class weight, so the
    // search naturally prefers main roads over alleys/footways even when the
    // shortcut is geometrically shorter. Heuristic stays pure distance (it's a
    // lower bound since every class cost is ≥ 0.55... actually can be < 1 for
    // main roads, so scale it by the cheapest possible class cost).
    const MIN_CLASS_COST = 0.55;
    const openSet = new Set<string>([startNode.id]);
    const cameFrom = new Map<string, string>();

    const gScore = new Map<string, number>();
    gScore.set(startNode.id, 0);

    const heuristic = (node: GraphNode) =>
      Math.hypot(endNode.x - node.x, endNode.z - node.z) * MIN_CLASS_COST;

    const fScore = new Map<string, number>();
    fScore.set(startNode.id, heuristic(startNode));

    let found = false;

    while (openSet.size > 0) {
      // Find node with lowest fScore
      let currentId = '';
      let lowestF = Infinity;

      for (const id of openSet) {
        const score = fScore.get(id) ?? Infinity;
        if (score < lowestF) {
          lowestF = score;
          currentId = id;
        }
      }

      if (currentId === endNode.id) {
        found = true;
        break;
      }

      openSet.delete(currentId);
      const currentNode = this.nodes.get(currentId);
      if (!currentNode) continue;

      const currentG = gScore.get(currentId) ?? Infinity;

      for (const neighbor of currentNode.neighbors) {
        // If the road edge to this neighbor crosses a wall/tower footprint, treat
        // it as impassable so A* routes around the construction.
        const neighborNode = this.nodes.get(neighbor.nodeId)!;
        if (isBlockedSegment(currentNode.x, currentNode.z, neighborNode.x, neighborNode.z)) {
          continue;
        }
        const tentativeG = currentG + neighbor.dist * neighbor.cost;
        const neighborG = gScore.get(neighbor.nodeId) ?? Infinity;

        if (tentativeG < neighborG) {
          cameFrom.set(neighbor.nodeId, currentId);
          gScore.set(neighbor.nodeId, tentativeG);

          fScore.set(neighbor.nodeId, tentativeG + heuristic(neighborNode));

          openSet.add(neighbor.nodeId);
        }
      }
    }

    if (!found) {
      // Direct road fallback
      return [roadStart.point, roadEnd.point];
    }

    // Reconstruct road path
    const path: Point2D[] = [];
    let curr = endNode.id;
    while (curr) {
      const node = this.nodes.get(curr);
      if (node) {
        path.unshift({ x: node.x, z: node.z });
      }
      curr = cameFrom.get(curr) || '';
    }

    // Prepend roadStart and append roadEnd
    const finalPath: Point2D[] = [roadStart.point, ...path, roadEnd.point];

    // Clean up close duplicates
    return cleanPath(finalPath);
  }
}

/**
 * Ray-cast point-in-polygon test (same convention used by the PathGrid).
 */
function isPointInPoly(x: number, z: number, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Geometric projection of point P onto segment AB
 */
function projectPointOnSegment(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lenSq = abx * abx + abz * abz;

  if (lenSq === 0) return { ...a };

  let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    x: a.x + t * abx,
    z: a.z + t * abz,
  };
}

/**
 * Clean path by removing redundant duplicate points (< 1.2m)
 */
function cleanPath(pts: Point2D[]): Point2D[] {
  if (pts.length <= 1) return pts;
  const result: Point2D[] = [pts[0]];

  for (let i = 1; i < pts.length; i++) {
    const prev = result[result.length - 1];
    const curr = pts[i];
    if (Math.hypot(curr.x - prev.x, curr.z - prev.z) > 1.2) {
      result.push(curr);
    }
  }

  return result;
}
