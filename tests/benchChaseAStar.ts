/**
 * Chase re-planning cost bench: a zombie chasing a squad re-plans its route
 * every time the squad's 2 m goal bucket shifts. When the straight line to
 * the prey is "obstructed" (building, closed gate, or — since the water rules
 * — ANY non-bridge water on the segment), that re-plan is a FULL A* search.
 * This bench measures the per-tick cost with and without a river between
 * zombie and squad. Run:
 * node --import tsx --import ./tests/register-loader.mjs tests/benchChaseAStar.ts
 */
import { PathGrid, stepAlongPath } from '../src/services/pathfindingService';
import type { MapData } from '../src/types/map';

function makeMap(withRiver: boolean): MapData {
  const b = { minX: -600, maxX: 600, minZ: -600, maxZ: 600 };
  const buildings: any[] = [];
  // Scattered city blocks so the grid has realistic structure
  for (let i = 0; i < 300; i++) {
    const x = -540 + (i % 20) * 56;
    const z = -540 + Math.floor(i / 20) * 56;
    buildings.push({
      id: `b_${i}`, type: 'residential', rawType: 'yes', name: `B${i}`,
      height: 8, levels: 2, center: { x, z },
      polygon: [{ x: x - 8, z: z - 8 }, { x: x + 8, z: z - 8 }, { x: x + 8, z: z + 8 }, { x: x - 8, z: z + 8 }],
      tags: {},
    });
  }
  const landuse = withRiver
    ? [{ type: 'water', polygon: [
        // River that ENDS at z=200 (forks out of the grid): crossing requires a
        // real detour to the north end — the expensive successful-A* case.
        { x: -3, z: -700 }, { x: 3, z: -700 }, { x: 3, z: 200 }, { x: -3, z: 200 },
      ] } as any]
    : [];
  return {
    cityName: 'Chase', bounds: b,
    placement: { center: { lat: 0, lon: 0 }, sectorName: 'S', country: 'X' },
    buildings, roads: [], landuse, resourceNodes: [],
    stats: { buildingCount: buildings.length, roadCount: 0, resourceCount: { wood: 0, metal: 0, bricks: 0, total: 0 }, elevationRangeMeters: 5, processedTimeMs: 0 },
    fetchedAt: 0, source: 'test',
  } as unknown as MapData;
}

function measure(label: string, withRiver: boolean, goalBucketMeters?: number) {
  const map = makeMap(withRiver);
  const grid = new PathGrid(map);
  // Zombie on the west bank, squad on the east bank 40 m away (6 m from river).
  // Squad walks +2 m per iteration along +z — shifting its goal bucket every
  // iteration at the default bucket size, exactly like a squad moving at
  // ~5 m/s across 10 Hz ticks.
  let pathState: any = undefined;
  let zx = -20, zz = 0;
  const TICKS = 40;
  const t0 = performance.now();
  for (let i = 0; i < TICKS; i++) {
    const goal = { x: 20, z: (i + 1) * 2 }; // squad drifts 2 m per tick
    const step = stepAlongPath(grid, pathState, zx, zz, goal.x, goal.z, 1.2, 0.1, 1.2, {
      gatesOpen: false, wallsImpassable: true, waterImpassable: true,
      goalBucketMeters,
    });
    zx = step.x; zz = step.z; pathState = step.state;
  }
  const perTick = (performance.now() - t0) / TICKS;
  console.log(`${label}: ${perTick.toFixed(2)} ms per chasing zombie per tick (budget: 100 ms shared with everything else)`);
}

measure('chase, clear ground (no river)  ', false);
measure('chase, river between (path-LOS blocked)', true);
measure('chase, river between, 8m zombie bucket ', true, 8);
