import type { AdaptedBuilding, BuildingSection, SettlementHQ, SettlementState } from '../types/settlement';
import type { BuildingSearchState } from '../types/scavenging';

/** A building must be complete, standing, and not currently under repair. */
export function isBuildingOperational(building: Pick<AdaptedBuilding, 'constructionStatus' | 'currentDurability' | 'isUnderRepair'>): boolean {
  return building.constructionStatus === 'completed'
    && building.currentDurability > 0
    && !building.isUnderRepair;
}

/** A command center provides its stats (storage, shelter, defense, squad
 *  slots) only while its structural integrity holds. A breached HQ is a ruin:
 *  no vault, no housing, no command — until a new HQ is established. */
export function isHQOperational(
  hq: Pick<SettlementHQ, 'currentDurability' | 'maxDurability'> | null | undefined
): boolean {
  if (!hq) return false;
  return (hq.currentDurability ?? hq.maxDurability) > 0;
}

/**
 * Returns the settlement's primary command HQ. `headquarters` is the
 * authoritative collection; the primary is the entry matching `primaryHQId`.
 * Saves predating `primaryHQId` (single-HQ era) fall back to the first entry.
 */
export function getPrimaryHQ(
  state: Pick<SettlementState, 'headquarters' | 'primaryHQId'> | null | undefined
): SettlementHQ | null {
  const list = state?.headquarters;
  if (!Array.isArray(list) || list.length === 0) return null;
  const id = state!.primaryHQId;
  if (id != null) {
    const byId = list.find((h) => String(h.buildingId) === String(id));
    if (byId) return byId;
  }
  return list[0];
}

/**
 * Returns the adaptation record(s) that belong to a real building. Split
 * sections live in the adaptedBuildings map under section keys
 * (`<bldgId>::s<N>`); the primary (whole-building) adaptation — when it exists
 * — is keyed by the building id itself. This resolves both so callers that
 * previously did a single `adaptedBuildings.get(bldg.id)` keep working after
 * a building is split.
 */
export function getAdaptedEntriesForBuilding(
  adaptedBuildings: Map<string | number, AdaptedBuilding> | undefined | null,
  bldgId: string | number
): AdaptedBuilding[] {
  if (!adaptedBuildings) return [];
  const out: AdaptedBuilding[] = [];
  const id = String(bldgId);
  const direct = adaptedBuildings.get(bldgId);
  if (direct) out.push(direct);
  for (const entry of adaptedBuildings.values()) {
    if (String(entry.sourceBuildingId) === id) out.push(entry);
  }
  return out;
}

/**
 * Primary adaptation for a real building: the whole-building entry when it
 * exists, otherwise the first split section (sorted by section index) so
 * renderers / repair / labour keep a stable "the building is adapted" view.
 */
export function getPrimaryAdaptedEntry(
  adaptedBuildings: Map<string | number, AdaptedBuilding> | undefined | null,
  bldgId: string | number
): AdaptedBuilding | undefined {
  if (!adaptedBuildings) return undefined;
  const id = String(bldgId);
  const direct = adaptedBuildings.get(bldgId);
  if (direct) return direct;
  const sections = getAdaptedEntriesForBuilding(adaptedBuildings, bldgId);
  sections.sort((a, b) => {
    const ia = Number(String(a.buildingId).split('::s')[1] ?? 0);
    const ib = Number(String(b.buildingId).split('::s')[1] ?? 0);
    return ia - ib;
  });
  return sections[0];
}

/**
 * True when a building is the primary (or any established) headquarters. The
 * HQ is command infrastructure: it can never be scavenged for loot, and it can
 * never be converted into another adaptation type.
 */
export function isHQBuilding(
  settlement: SettlementState,
  buildingId: string | number
): boolean {
  const id = String(buildingId);
  if (Array.isArray(settlement.headquarters)) {
    return settlement.headquarters.some((h) => String(h.buildingId) === id);
  }
  return false;
}

/**
 * True when a building's search is both COMPLETE and fully cleared — nothing
 * left behind. `searched` alone can slip through on legacy saves where it was
 * set at 100% progress even when carry-capacity leftovers remained, so the
 * authoritative gate always re-checks the actual leftover stack.
 */
export function isBuildingFullyLooted(search: BuildingSearchState | undefined | null): boolean {
  if (!search) return false;
  if (search.searched !== true) return false;
  if (Array.isArray(search.unlootedItems) && search.unlootedItems.length > 0) return false;
  return true;
}