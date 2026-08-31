import { Point2D, ResourceNodeType } from './map';
export type ResourceWorkerState = 'moving_to_node' | 'harvesting' | 'returning';
export interface ResourceWorkOrder {
  id: string; nodeId: string; resourceType: ResourceNodeType; workerCount: number;
  state: ResourceWorkerState; position: Point2D; carried: number; createdAt: number;
  // Cached A* path state so gatherers route around obstacles (walls, towers,
  // buildings) instead of walking straight through them. Structurally matches
  // PathState from services/pathfindingService.
  pathState?: { path: Point2D[]; index: number; goalKey: string };
}
