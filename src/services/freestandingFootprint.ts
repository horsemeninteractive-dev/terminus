import { Point2D } from '../types/map';
import { AdaptedBuilding } from '../types/settlement';

const WALL_TYPES = ['wooden_palisade', 'brick_wall', 'fortified_wall', 'metal_fence', 'barbed_wire'];
const GATE_TYPES = ['wooden_gate', 'metal_gate', 'fortified_gate'];
const TOWER_TYPES = ['wooden_tower', 'metal_tower', 'fortified_tower', 'floodlight_tower'];
// IFZ fields/greenhouses: freestanding flat rectangular plots (vast = bigger).
const FIELD_TYPES = ['field', 'vast_field'];
const GREENHOUSE_TYPES = ['greenhouse', 'greenhouse_hydro'];

/**
 * Rendered footprint dimensions for a freestanding structure type. Must stay in
 * sync with BuildingRenderer.renderFreestandingBody so collision matches what
 * the player actually sees.
 */
export function getFreestandingDimensions(typeId: string): { width: number; length: number } {
  if (WALL_TYPES.includes(typeId)) return { width: 2.4, length: 10 };
  if (GATE_TYPES.includes(typeId)) return { width: 10, length: 3.2 };
  if (TOWER_TYPES.includes(typeId)) return { width: 5.2, length: 5.2 };
  if (FIELD_TYPES.includes(typeId)) return { width: 16, length: 20 };
  if (GREENHOUSE_TYPES.includes(typeId)) return { width: 12, length: 16 };
  return { width: 8, length: 8 };
}

export function isFreestandingField(typeId: string): boolean {
  return FIELD_TYPES.includes(typeId) || GREENHOUSE_TYPES.includes(typeId);
}

export function isFreestandingWall(typeId: string): boolean {
  return WALL_TYPES.includes(typeId);
}

export function isFreestandingTower(typeId: string): boolean {
  return TOWER_TYPES.includes(typeId);
}

/** Gates are openings in a fence line — pathing and vehicles may pass through. */
export function isFreestandingGate(typeId: string): boolean {
  return GATE_TYPES.includes(typeId);
}

/**
 * Collision footprint of a freestanding structure: a rectangle of the type's
 * width x length centred on `position`, rotated by `rotationDeg` using the same
 * rotation convention as the three.js renderer (local +Z is the length axis).
 */
export function getFreestandingCollisionPolygon(free: Pick<AdaptedBuilding, 'typeId' | 'position' | 'rotationDeg'>): Point2D[] {
  // Fence/wall segments store their exact per-segment run length (so consecutive
  // segments butt with no gaps); fall back to the type's canonical dimensions.
  const dims = getFreestandingDimensions(free.typeId);
  const withDims = free as Pick<AdaptedBuilding, 'typeId' | 'position' | 'rotationDeg'> & { width?: number; length?: number };
  const width = withDims.width ?? dims.width;
  const length = withDims.length ?? dims.length;
  const rot = ((free.rotationDeg || 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const hw = width / 2;
  const hl = length / 2;
  const local: Array<{ x: number; z: number }> = [
    { x: -hw, z: -hl },
    { x: hw, z: -hl },
    { x: hw, z: hl },
    { x: -hw, z: hl },
  ];
  return local.map((p) => ({
    x: free.position.x + p.x * cos + p.z * sin,
    z: free.position.z - p.x * sin + p.z * cos,
  }));
}
