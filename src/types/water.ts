/**
 * Water Cistern (§Terminus-original) — turns weather into a renewable
 * settlement resource.
 *
 * Each operational cistern is a BUFFER with a roof-area-scaled capacity:
 *
 *   • A big warehouse roof collects substantially more than a tiny house roof.
 *   • Collection depends on the weather (rain ≫ snowmelt ≫ nothing).
 *   • Consumption draws the settlement reserve (stockpile water) first, then
 *     drains the cistern buffers — so "600 L stored but no rain for six days"
 *     is a real, watchable tension.
 */

export interface CisternRecord {
  buildingId: string | number;
  buildingName: string;
  /** Roof catchment area in m² (converted footprint for adapted buildings). */
  roofAreaM2: number;
  /** Liters this cistern can hold — 25 L per 10 m² of roof. */
  capacity: number;
  /** Liters currently sitting in the buffer (fresh, not yet consumed). */
  currentWater: number;
  /** Collection efficiency — 1.0 base, +50% with Rainwater Harvesting research. */
  efficiency: number;
}

export interface WaterState {
  cisterns: Map<string | number, CisternRecord>;
  /** Sum of all cistern capacities — the settlement's rainwater storage cap. */
  totalCapacity: number;
  /** Liters currently held across all cistern buffers. */
  totalStored: number;
  /** Consecutive days the settlement has been in water shortage (morale escalator). */
  shortageDays: number;
}

export function createEmptyWaterState(): WaterState {
  return { cisterns: new Map(), totalCapacity: 0, totalStored: 0, shortageDays: 0 };
}