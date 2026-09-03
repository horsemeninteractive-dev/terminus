import { Point2D, ResourceNodeType } from './map';
export type ResourceWorkerState = 'moving_to_node' | 'harvesting' | 'returning';
export interface ResourceWorkOrder {
  id: string; nodeId: string; resourceType: ResourceNodeType; workerCount: number;
  state: ResourceWorkerState; position: Point2D; carried: number; createdAt: number;
  /** True while a full storage ceiling prevents the crew depositing its load;
   *  set once per blocked episode so the overflow warning counts each pile
   *  once instead of once per tick. Cleared when a deposit succeeds. */
  depositBlocked?: boolean;
  // Cached A* path state so gatherers route around obstacles (walls, towers,
  // buildings) instead of walking straight through them. Structurally matches
  // PathState from services/pathfindingService.
  pathState?: { path: Point2D[]; index: number; goalKey: string };
}
