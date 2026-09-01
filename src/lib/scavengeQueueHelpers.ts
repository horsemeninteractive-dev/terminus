import type { BuildingSearchState } from '../types/scavenging';
import type { HiddenSurvivorGroup } from '../types/population';
import type { BuildingPolygon } from '../types/map';

/**
 * Shared scavenge-queue helpers, extracted verbatim from App.tsx's module scope
 * so both the simulation loop hook and the squad-action handlers can use them.
 */

export function getHiddenGroupValues(value: unknown): HiddenSurvivorGroup[] {
  if (value instanceof Map) return Array.from(value.values()) as HiddenSurvivorGroup[];
  if (Array.isArray(value)) return value as HiddenSurvivorGroup[];
  if (value && typeof value === 'object') return Object.values(value) as HiddenSurvivorGroup[];
  return [];
}

/** True when a building has been fully cleared (searched and nothing left to take). */
function isBuildingExhausted(id: string | number, searches: Map<string | number, BuildingSearchState>): boolean {
  const search = searches.get(id) ?? searches.get(String(id));
  if (!search) return false;
  return search.searched === true || (Array.isArray(search.unlootedItems) && search.unlootedItems.length === 0);
}

/**
 * Walk a scavenge queue and return the first building that still has loot.
 * Cleared/empty buildings are skipped so squads never get sent to dead ends.
 */
export function findNextScavengeTarget(
  queueIds: Array<string | number>,
  buildings: BuildingPolygon[],
  searches: Map<string | number, BuildingSearchState>
): BuildingPolygon | null {
  for (const id of queueIds) {
    const b = buildings.find((candidate) => String(candidate.id) === String(id));
    if (b && !isBuildingExhausted(b.id, searches)) return b;
  }
  return null;
}