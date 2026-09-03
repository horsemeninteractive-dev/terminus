/**
 * Building Occupation (§IFZ) — the unadapted-structure distinction:
 *
 *   • An UNADAPTED structure can become OCCUPIED by infected: a persistent
 *     nest of real infected that take the building over until they are killed.
 *   • An ADAPTED structure is never occupied — it is damaged until destroyed,
 *     at which point it becomes neutral (a ruin).
 *
 * Occupations are passive: unlike Lairs they never regrow or spawn new
 * infected. The infected inside are REAL ZombieUnits carrying occupationId;
 * killing every one of them clears the occupation.
 */

export type OccupationThreatTier = 'low' | 'medium' | 'high';

export interface BuildingOccupation {
  id: string;
  buildingId: string | number;
  buildingName: string;
  threatTier: OccupationThreatTier;
  /** Infected seeded inside when the building was taken over. */
  maxInfected: number;
  /** Live infected inside, synced each tick from units carrying occupationId. */
  infectedRemaining: number;
  occupiedAt: number;
  isCleared: boolean;
}

export interface OccupationState {
  buildings: Map<string | number, BuildingOccupation>;
  /** Game-time accumulator throttling new occupations (seconds). */
  seedAccumSec: number;
}

export function createEmptyOccupationState(): OccupationState {
  return { buildings: new Map(), seedAccumSec: 0 };
}