import { MapData, Point2D } from '../types/map';
import { SettlementState } from '../types/settlement';
import { ResourceWorkOrder } from '../types/resourceGathering';
import { PathGrid, stepAlongPath } from './pathfindingService';
import { terrainSlopeSpeedFactor } from './elevationService';
import { getPrimaryHQ } from './buildingOperational';
import { depositWithinCapacity, countStockpileUnits, type StockpileAddition } from './stockpileCapacity';
import { strandMaterialsAt } from './strandedLootService';

const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Find the nearest shelter or HQ location for workers to take cover in at night
 */
export function getWorkerShelterLocation(
  state: SettlementState,
  workerPos: Point2D,
  map?: MapData | null
): { center: Point2D; name: string } {
  let bestPos = getPrimaryHQ(state)?.center || { x: 0, z: 0 };
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
    position: { ...(getPrimaryHQ(state)?.center || node.position) },
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
  alarmActive: boolean = false,
  grid?: PathGrid | null
) {
  if (!getPrimaryHQ(state) || !state.resourceWorkOrders.length) {
    return { newState: state, mapData: map };
  }

  const nodes = map.resourceNodes.map((n) => ({ ...n }));
  const by = new Map(nodes.map((n) => [n.id, n]));
  const stock = structuredClone(state.stockpile);
  const next: ResourceWorkOrder[] = [];
  // Units that could not fit because the storage ceiling was full — surfaced
  // by the header's overflow warning. The load is stranded as a field-loot
  // pile at the worksite so a squad can physically recover it later (nothing
  // is silently lost, held past the ceiling, or dumped into storage).
  let overflowAccrued = 0;
  let fieldLootPiles = state.fieldLootPiles || [];
  const strandCarried = (o: ResourceWorkOrder, at: Point2D) => {
    const carried = o.carried;
    if (carried <= 0) return;
    // Finite stockpile: deposit only what fits; whatever doesn't fit is
    // stranded at the node (the gatherers' worksite) as a recoverable pile.
    const carry = { materials: { [o.resourceType]: carried } } as StockpileAddition;
    const { overflow } = depositWithinCapacity(stock, state.totalStorageCapacity ?? Infinity, carry);
    const overflowUnits = countStockpileUnits(overflow);
    if (overflowUnits > 0) {
      fieldLootPiles = strandMaterialsAt(
        fieldLootPiles,
        at,
        { [o.resourceType]: overflowUnits },
        'gatherer'
      );
      if (!o.depositBlocked) {
        o.depositBlocked = true;
        overflowAccrued += overflowUnits;
      }
    } else {
      o.depositBlocked = false;
    }
    o.carried = 0;
  };

  for (const src of state.resourceWorkOrders) {
    const o: ResourceWorkOrder = { ...src, position: { ...src.position } };
    const n = by.get(o.nodeId);
    if (!n || (n.amount <= 0 && o.state !== 'returning')) continue;

    // At night or during a colony alarm, workers prioritize returning to shelter / HQ
    if (isNight || alarmActive) {
      const shelter = getWorkerShelterLocation(state, o.position, map);
      const stepRes = stepAlongPath(
        grid, o.pathState, o.position.x, o.position.z,
        shelter.center.x, shelter.center.z,
        6.0 * (map.elevation ? terrainSlopeSpeedFactor(map.elevation, o.position.x, o.position.z) : 1),
        dt, 1.0
      );
      o.position.x = stepRes.x;
      o.position.z = stepRes.z;
      o.pathState = stepRes.state;
      if (stepRes.arrived) {
        // Deposited at shelter/HQ, wait sheltered. The deposit is
        // capacity-aware: a full storage ceiling strands the load at the
        // worksite (recoverable by a squad) instead of overflowing the
        // stockpile.
        strandCarried(o, n.position);
        o.state = 'returning';
      } else {
        o.state = 'returning';
      }
      next.push(o);
      continue;
    }

    // Normal Daytime Gathering Cycle
    if (o.state === 'moving_to_node') {
      const stepRes = stepAlongPath(
        grid, o.pathState, o.position.x, o.position.z,
        n.position.x, n.position.z,
        5.0 * (map.elevation ? terrainSlopeSpeedFactor(map.elevation, o.position.x, o.position.z) : 1),
        dt, 0.8
      );
      o.position.x = stepRes.x;
      o.position.z = stepRes.z;
      o.pathState = stepRes.state;
      if (stepRes.arrived) {
        o.state = 'harvesting';
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
      const stepRes = stepAlongPath(
        grid, o.pathState, o.position.x, o.position.z,
        shelter.center.x, shelter.center.z,
        5.5 * (map.elevation ? terrainSlopeSpeedFactor(map.elevation, o.position.x, o.position.z) : 1),
        dt, 0.8
      );
      o.position.x = stepRes.x;
      o.position.z = stepRes.z;
      o.pathState = stepRes.state;
      if (stepRes.arrived) {
        strandCarried(o, n.position);
        // A full storage ceiling strands the excess at the node (depositBlocked
        // stays live for the warning counter); the crew is free to gather again
        // rather than idling at the depot holding the load.
        if (n.amount > 0) o.state = 'moving_to_node';
        else continue;
      }
    }

    next.push(o);
  }

  return {
    newState: {
      ...state,
      stockpile: stock,
      resourceWorkOrders: next,
      overflowLootUnits: (state.overflowLootUnits || 0) + overflowAccrued,
      fieldLootPiles,
    },
    mapData: { ...map, resourceNodes: nodes },
  };
}
