/**
 * Laws & Policy (§IFZ Major Update #5) — enacted through the Gathering Place.
 *
 * The Gathering Place unlocks at GATHERING_PLACE_UNLOCK_POPULATION citizens
 * (IFZ lowered the law threshold from 200 to 100) and lets the colony change
 * ONE law per in-game day. Laws are not cosmetic: they
 * alter food consumption, citizen satisfaction (a standing morale factor), and
 * adult/child work rules.
 */

export type LawId =
  | 'standard_rations'
  | 'extended_rations'
  | 'generous_rations'
  | 'childcare_program'
  | 'child_labor_permitted';

export type LawCategory = 'food' | 'childcare' | 'labor';

export interface LawDefinition {
  id: LawId;
  name: string;
  category: LawCategory;
  description: string;
  /** Multiplier on the per-citizen daily food consumption baseline (0.5/day). */
  foodConsumptionMult: number;
  /** Standing morale delta applied while this law is active. */
  moraleDelta: number;
  /** Human-readable morale effect, shown in the law panel and morale breakdown. */
  moraleDescription: string;
  /** When true, children (age < 16) may join the general labour pool. */
  childLaborAllowed: boolean;
}

export interface LawsState {
  activeLawId: LawId;
  /** In-game day of the last enacted change; -1 means none yet (first change is free). */
  lastLawChangeDay: number;
}

/** Population threshold for the Gathering Place to open the law forum. IFZ
 *  originally launched the building at 200 citizens and later lowered the law
 *  requirement to 100 — current IFZ unlocks laws at 100. */
export const GATHERING_PLACE_UNLOCK_POPULATION = 100;

export const DEFAULT_LAW_ID: LawId = 'standard_rations';