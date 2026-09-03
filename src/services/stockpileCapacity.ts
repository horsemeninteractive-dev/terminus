import type { SettlementStockpile } from '../types/settlement';

/** A stockpile-shaped partial where each category may be partially filled
 *  (e.g. `{ materials: { wood: 12 } }`). */
export type StockpileAddition = {
  [K in keyof SettlementStockpile]?: Partial<SettlementStockpile[K]>;
};

/**
 * Total item units currently held across every stockpile category — the unit
 * that `totalStorageCapacity` is measured in (IFZ-style finite physical
 * storage). Every numeric value in the stockpile counts as one unit, so a
 * partial/stockpile-shaped object also works (only its present fields count).
 */
export function getStockpileUnits(stockpile: SettlementStockpile | Partial<SettlementStockpile> | StockpileAddition): number {
  let units = 0;
  for (const category of Object.values(stockpile)) {
    if (!category || typeof category !== 'object') continue;
    for (const value of Object.values(category as Record<string, number>)) {
      if (typeof value === 'number' && Number.isFinite(value)) units += value;
    }
  }
  return units;
}

/**
 * Sum of the numeric units inside a stockpile-shaped partial — used to report
 * how many units of an overflow could not be stored.
 */
export function countStockpileUnits(partial: SettlementStockpile | Partial<SettlementStockpile> | StockpileAddition): number {
  return getStockpileUnits(partial);
}

/**
 * Deposits additions into the stockpile while respecting a finite storage
 * capacity. Fields are granted greedily (in category/field order) up to the
 * free ceiling; everything that does not fit is returned as `overflow` so the
 * caller can keep it held (backpack / crew load) or surface it as overflow —
 * never silently lost, never pushed past the capacity ceiling. Mutates
 * `stockpile` in place for the granted portion and returns it.
 */
export function depositWithinCapacity(
  stockpile: SettlementStockpile,
  capacity: number,
  additions: StockpileAddition
): { stockpile: SettlementStockpile; deposited: StockpileAddition; overflow: StockpileAddition } {
  const cap = typeof capacity === 'number' && Number.isFinite(capacity) ? Math.max(0, capacity) : Infinity;
  let used = getStockpileUnits(stockpile);
  const deposited: StockpileAddition = {};
  const overflow: StockpileAddition = {};

  for (const categoryKey of Object.keys(additions)) {
    const category = additions[categoryKey as keyof SettlementStockpile];
    if (!category || typeof category !== 'object') continue;
    const dst = stockpile[categoryKey as keyof SettlementStockpile] as unknown as Record<string, number>;
    const depCat: Record<string, number> = {};
    const ovfCat: Record<string, number> = {};
    for (const field of Object.keys(category)) {
      const amount = (category as unknown as Record<string, number>)[field] || 0;
      if (amount <= 0) continue;
      const free = cap - used;
      const fits = Math.max(0, Math.min(amount, free));
      if (fits > 0) {
        dst[field] = (dst[field] || 0) + fits;
        depCat[field] = fits;
        used += fits;
      }
      const left = amount - fits;
      if (left > 0) ovfCat[field] = left;
    }
    if (Object.keys(depCat).length > 0) (deposited as Record<string, unknown>)[categoryKey] = depCat;
    if (Object.keys(ovfCat).length > 0) (overflow as Record<string, unknown>)[categoryKey] = ovfCat;
  }

  return { stockpile, deposited, overflow };
}
