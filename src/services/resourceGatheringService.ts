import { MapData, Point2D } from '../types/map';
import { SettlementState } from '../types/settlement';
import { ResourceWorkOrder } from '../types/resourceGathering';

const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Find the nearest shelter or HQ location for workers to take cover in at night
 */
export function getWorkerShelterLocation(
  state: SettlementState,
  workerPos: Point2D,
  map?: MapData | null
): { center: Point2D; name: string } {
  let bestPos = state.hq?.center || { x: 0, z: 0 };
  let bestDist = dist(workerPos, bestPos);
  let bestName = 'Colony HQ';

  // Search adapted buildings for shelters/houses/bunkhouses
  if (state.adaptedBuildings) {
    for (const [_, bldg] of state.adaptedBuildings) {
      const type = (bldg.typeId as string) || '';
      if (
        type.includes('shelter') ||
        type.includes('house') ||
        type.includes('quarters') ||
        type.includes('dormitory')
      ) {
        const d = dist(workerPos, bldg.position);
        if (d < bestDist) {
          bestDist = d;
          bestPos = bldg.position;
          bestName = bldg.name || 'Shelter';
        }
      }
    }
  }

  // Search freestanding buildings for shelters/houses
  if (state.freestandingBuildings) {
    for (const fs of state.freestandingBuildings) {
      const type = (fs.typeId as string) || '';
      if (
        type.includes('shelter') ||
        type.includes('house') ||
        type.includes('quarters') ||
        type.includes('dormitory')
      ) {
        const d = dist(workerPos, fs.position);
        if (d < bestDist) {
          bestDist = d;
          bestPos = fs.position;
          bestName = 'Colony Shelter';
        }
      }
    }
  }

  return { center: bestPos, name: bestName };
}

export function assignResourceGatherers(
  state: SettlementState,
  map: MapData,
  nodeId: string,
  count: number
) {
  const node = map.resourceNodes.find((n) => n.id === nodeId);
  if (!node || node.amount <= 0) {
    return { success: false, newState: state, error: 'Resource node depleted.' };
  }

  const used =
    state.squads.reduce((n, s) => n + s.generalCount, 0) +
    state.resourceWorkOrders.reduce((n, w) => n + w.workerCount, 0);
  const free = state.generalPopulation.total - used;
  const c = Math.max(1, Math.min(count, free));

  if (free <= 0) {
    return { success: false, newState: state, error: 'No uncommitted general workers are available.' };
  }

  const o: ResourceWorkOrder = {
    id: `work_${nodeId}_${Date.now()}`,
    nodeId,
    resourceType: node.type,
    workerCount: c,
    state: 'moving_to_node',
    position: { ...(state.hq?.center || node.position) },
    carried: 0,
    createdAt: Date.now(),
  };

  return {
    success: true,
    newState: { ...state, resourceWorkOrders: [...state.resourceWorkOrders, o] },
  };
}

export function tickResourceGathering(
  state: SettlementState,
  map: MapData,
  dt: number,
  isNight: boolean = false,
  alarmActive: boolean = false
) {
  if (!state.hq || !state.resourceWorkOrders.length) {
    return { newState: state, mapData: map };
  }

  const nodes = map.resourceNodes.map((n) => ({ ...n }));
  const by = new Map(nodes.map((n) => [n.id, n]));
  const stock = structuredClone(state.stockpile);
  const next: ResourceWorkOrder[] = [];

  for (const src of state.resourceWorkOrders) {
    const o: ResourceWorkOrder = { ...src, position: { ...src.position } };
    const n = by.get(o.nodeId);
    if (!n || (n.amount <= 0 && o.state !== 'returning')) continue;

    // At night or during a colony alarm, workers prioritize returning to shelter / HQ
    if (isNight || alarmActive) {
      const shelter = getWorkerShelterLocation(state, o.position, map);
      const z = dist(o.position, shelter.center);
      const step = Math.min(z, 6.0 * dt);

      if (z <= 1.0) {
        // Deposited at shelter/HQ, wait sheltered
        if (o.carried > 0) {
          if (o.resourceType === 'wood') stock.materials.wood += o.carried;
          if (o.resourceType === 'metal') stock.materials.metal += o.carried;
          if (o.resourceType === 'bricks') stock.materials.bricks += o.carried;
          o.carried = 0;
        }
        o.state = 'returning';
      } else {
        o.state = 'returning';
        o.position.x += ((shelter.center.x - o.position.x) / z) * step;
        o.position.z += ((shelter.center.z - o.position.z) / z) * step;
      }
      next.push(o);
      continue;
    }

    // Normal Daytime Gathering Cycle
    if (o.state === 'moving_to_node') {
      const z = dist(o.position, n.position);
      const step = Math.min(z, 5.0 * dt);
      if (z <= 0.8) {
        o.state = 'harvesting';
      } else {
        o.position.x += ((n.position.x - o.position.x) / z) * step;
        o.position.z += ((n.position.z - o.position.z) / z) * step;
      }
    }

    if (o.state === 'harvesting') {
      const got = Math.min(n.amount, o.workerCount * 1.5 * dt);
      n.amount = Math.max(0, n.amount - got);
      n.isDepleted = n.amount <= 0;
      o.carried += got;
      if (o.carried >= 10 || n.amount <= 0) {
        o.state = 'returning';
      }
    }

    if (o.state === 'returning') {
      const shelter = getWorkerShelterLocation(state, o.position, map);
      const z = dist(o.position, shelter.center);
      const step = Math.min(z, 5.5 * dt);
      if (z <= 0.8) {
        const amount = o.carried;
        if (o.resourceType === 'wood') stock.materials.wood += amount;
        if (o.resourceType === 'metal') stock.materials.metal += amount;
        if (o.resourceType === 'bricks') stock.materials.bricks += amount;
        o.carried = 0;
        if (n.amount > 0) o.state = 'moving_to_node';
        else continue;
      } else {
        o.position.x += ((shelter.center.x - o.position.x) / z) * step;
        o.position.z += ((shelter.center.z - o.position.z) / z) * step;
      }
    }

    next.push(o);
  }

  return {
    newState: { ...state, stockpile: stock, resourceWorkOrders: next },
    mapData: { ...map, resourceNodes: nodes },
  };
}
