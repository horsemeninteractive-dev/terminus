import { SquadLootItem } from './population';

export interface BuildingSearchState {
  buildingId: string | number;
  observed: boolean;
  searched: boolean; // true once 100% complete
  searchStartedAt?: number;
  searchProgress?: number; // 0 to 100
  totalDurationSec?: number; // duration required based on footprint area
  elapsedDurationSec?: number;
  loot: SquadLootItem[]; // all loot rolled for this building
  unlootedItems?: SquadLootItem[]; // items waiting to be discovered over time
  lootedItems?: SquadLootItem[]; // items already uncovered
}

