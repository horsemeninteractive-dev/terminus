import { Point2D, RoadSegment } from '../types/map';

interface GraphNode {
  id: string;
  x: number;
  z: number;
  neighbors: Array<{ nodeId: string; dist: number }>;
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

    for (const road of this.roads) {
      const isPedestrian = [
        'footway',
        'pedestrian',
        'steps',
        'path',
        'cycleway',
      ].includes(road.highwayType);

      // Only include drivable roads in vehicle graph
      if (isPedestrian && road.width < 3.5) continue;

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

            if (!node0.neighbors.some((n) => n.nodeId === key1)) {
              node0.neighbors.push({ nodeId: key1, dist });
            }
            if (!road.isOneway && !node1.neighbors.some((n) => n.nodeId === key0)) {
              node1.neighbors.push({ nodeId: key0, dist });
            }
          }
        }
      }
    }
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
   * Compute A* route along real road geometry from start to target
   */
  public findRoute(startPos: Point2D, targetPos: Point2D): Point2D[] {
    const roadStart = this.findClosestPointOnRoad(startPos);
    const roadEnd = this.findClosestPointOnRoad(targetPos);

    if (!roadStart.road || !roadEnd.road || this.nodes.size === 0) {
      return [roadStart.point, roadEnd.point];
    }

    // Direct segment check if both start and end are on the same road
    if (roadStart.road.id === roadEnd.road.id) {
      const straightDist = Math.hypot(
        roadEnd.point.x - roadStart.point.x,
        roadEnd.point.z - roadStart.point.z
      );
      if (straightDist < 60) {
        return [roadStart.point, roadEnd.point];
      }
    }

    const startNode = this.findNearestNode(roadStart.point);
    const endNode = this.findNearestNode(roadEnd.point);

    if (!startNode || !endNode || startNode.id === endNode.id) {
      return [roadStart.point, roadEnd.point];
    }

    // A* Search on Road Graph
    const openSet = new Set<string>([startNode.id]);
    const cameFrom = new Map<string, string>();

    const gScore = new Map<string, number>();
    gScore.set(startNode.id, 0);

    const fScore = new Map<string, number>();
    fScore.set(
      startNode.id,
      Math.hypot(endNode.x - startNode.x, endNode.z - startNode.z)
    );

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
        const tentativeG = currentG + neighbor.dist;
        const neighborG = gScore.get(neighbor.nodeId) ?? Infinity;

        if (tentativeG < neighborG) {
          cameFrom.set(neighbor.nodeId, currentId);
          gScore.set(neighbor.nodeId, tentativeG);

          const neighborNode = this.nodes.get(neighbor.nodeId)!;
          const h = Math.hypot(
            endNode.x - neighborNode.x,
            endNode.z - neighborNode.z
          );
          fScore.set(neighbor.nodeId, tentativeG + h);

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
