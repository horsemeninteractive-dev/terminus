import { WeaponItemId } from './combat';
import { Point2D } from './map';

// ==========================================
// Rival Human Factions, Hideouts & Ransom (§5.2)
// ==========================================

export type RivalFactionId = 'iron_vultures' | 'blackout_marauders';

export interface RivalFactionDef {
  id: RivalFactionId;
  name: string;
  blurb: string;
  markerColor: string; // hostile accent used by the map marker
  defenderCountMin: number;
  defenderCountMax: number;
  weaponPool: WeaponItemId[];
  // Food rations demanded per captured squad member (§5.2 ransom events)
  ransomFoodPerMember: number;
}

export interface RansomDemand {
  squadId: string;
  squadName: string;
  foodCost: number; // total rations demanded
  demandedAt: number;
}

export interface RivalHideout {
  id: string;
  buildingId: string | number;
  buildingName: string;
  factionId: RivalFactionId;
  factionName: string;
  isDiscovered: boolean;
  isCleared: boolean;
  // Occupants remaining inside; the Hideout is cleared once its armed defenders
  // are eliminated in combat (§5, same combat system as squads vs. zombies).
  occupantCount: number;
  initialOccupantCount: number;
  threatTier: 'low' | 'medium' | 'high';
  position: Point2D;
  defendersSpawned: boolean;
  // Ransom / capture state: a squad defeated by this Hideout is captured,
  // not killed, and can be ransomed back or rescued by force.
  captiveSquadId?: string | null;
  captiveSquadName?: string | null;
  ransom?: RansomDemand | null;
}
