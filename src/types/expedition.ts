/**
 * Expeditions (§IFZ) — separate OFF-MAP scavenging areas revealed through the
 * Antenna. A squad travels to a site, fights whatever is there, then slowly
 * scavenges it. Crucially the squad does NOT auto-return when its backpack is
 * full — the player must manually recall it.
 */
import { SquadLootItem } from './population';

export type ExpeditionPhase =
  | 'travel_out'
  | 'combat'
  | 'scavenging'
  | 'travel_back'
  | 'idle';

export type ExpeditionThreatTier = 'low' | 'medium' | 'high';

export interface ExpeditionSite {
  id: string;
  name: string;
  description: string;
  /** Abstract off-map distance; drives travel time (km → game-seconds). */
  distanceKm: number;
  threatTier: ExpeditionThreatTier;
  /** Starting infected garrison (each counts DEFENDER_HP against the squad). */
  defenders: number;
  /** Live defender HP pool — reduced in real squad-vs-garrison battle ticks. */
  defendersRemaining: number;
  /** The site's physical loot, drawn one item at a time during scavenging. */
  lootItems: SquadLootItem[];
  /** Number of loot items still recoverable (0 → exhausted). */
  lootRemaining: number;
  revealed: boolean;
  /** Defenders all dead — the site is safe to scavenge. */
  cleared: boolean;
  exhausted: boolean;
  assignedSquadId?: string;
  phase: ExpeditionPhase;
  /** Remaining travel (outbound or return) in game-seconds. */
  travelRemainingSec: number;
  /** Accumulator for the slow scavenge cadence (game-seconds). */
  scavengeAccumSec: number;
  discoveredAt: number;
  /** One-shot UI flag: the assigned squad's backpack filled (IFZ: it waits, it
   *  does not auto-return). Reset on (re)dispatch. */
  fullWarned?: boolean;
}

export interface ExpeditionState {
  sites: ExpeditionSite[];
  /** Wall-clock ms when the antenna first revealed the sites. */
  revealedAt: number;
}

export function createEmptyExpeditionState(): ExpeditionState {
  return { sites: [], revealedAt: 0 };
}