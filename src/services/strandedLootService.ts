import { Point2D } from '../types/map';
import { FieldLootPile, SettlementState } from '../types/settlement';
import { TacticalSquadUnit } from '../types/combat';
import { SquadLootItem, SquadInventory } from '../types/population';
import { createEmptySquadInventory, getSquadInventoryCapacity } from './scavengingService';

/** Marker prefix used in `targetBuildingId` for squad recovery orders — never
 *  collides with real map-building ids and also names the pile's render id. */
export const STRANDED_LOOT_ORDER_PREFIX = 'stranded';

/** Maximum distance a squad auto-collects a stranded pile on arrival. */
export const STRANDED_COLLECT_RADIUS_M = 6;

export function isStrandedLootOrderId(id: string | number | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(`${STRANDED_LOOT_ORDER_PREFIX}:`);
}

export function getStrandedLootOrderId(pileId: string): string {
  return `${STRANDED_LOOT_ORDER_PREFIX}:${pileId}`;
}

let pileSeq = 0;
export function createPileId(source?: string): string {
  pileSeq += 1;
  return `pile_${Date.now().toString(36)}_${pileSeq}${source ? `_${source}` : ''}`;
}

/**
 * Strands overflow materials at a world position as a field-loot pile. If a
 * pile already exists within ~1m (same worksite, consecutive drops) the new
 * units merge into it so gatherers don't litter dozens of one-unit piles.
 */
export function strandMaterialsAt(
  piles: FieldLootPile[],
  position: Point2D,
  materials: { wood?: number; metal?: number; bricks?: number },
  source?: string
): FieldLootPile[] {
  const wood = Math.max(0, Math.round(materials.wood || 0));
  const metal = Math.max(0, Math.round(materials.metal || 0));
  const bricks = Math.max(0, Math.round(materials.bricks || 0));
  if (wood + metal + bricks <= 0) return piles;

  const list = piles.map((p) => ({ ...p }));
  const existing = list.find(
    (p) => Math.hypot(p.position.x - position.x, p.position.z - position.z) < 2.0
  );
  if (existing) {
    existing.wood += wood;
    existing.metal += metal;
    existing.bricks += bricks;
  } else {
    list.push({
      id: createPileId(source),
      position: { x: position.x, z: position.z },
      wood,
      metal,
      bricks,
      source: source || 'gatherer',
      createdAt: Date.now(),
    });
  }
  return list;
}

/**
 * Strands a squad's whole leftover backpack at a world position (the death
 * site of a fallen squad, or any other squad-dropped load). Construction
 * materials map onto the pile's material fields; every other carried stack
 * (food, water, fuel, ammo, meds, tools, weapons, armor) is preserved as-is
 * in `pile.items` so nothing the squad carried is lost.
 */
export function strandSquadInventoryAt(
  piles: FieldLootPile[],
  position: Point2D,
  inventory: SquadInventory | undefined,
  source = 'fallen_squad'
): FieldLootPile[] {
  const items = inventory?.items || [];
  if (items.length === 0) return piles;

  let wood = 0;
  let metal = 0;
  let bricks = 0;
  const carried: SquadLootItem[] = [];
  for (const it of items) {
    if (it.label === 'wood') wood += it.quantity;
    else if (it.label === 'metal') metal += it.quantity;
    else if (it.label === 'bricks') bricks += it.quantity;
    else carried.push({ ...it });
  }
  if (wood + metal + bricks <= 0 && carried.length === 0) return piles;

  const list = piles.map((p) => ({ ...p }));
  const existing = list.find(
    (p) => Math.hypot(p.position.x - position.x, p.position.z - position.z) < 2.0
  );
  if (existing) {
    existing.wood += wood;
    existing.metal += metal;
    existing.bricks += bricks;
    existing.items = [...(existing.items || []), ...carried];
  } else {
    list.push({
      id: createPileId(source),
      position: { x: position.x, z: position.z },
      wood,
      metal,
      bricks,
      items: carried.length > 0 ? carried : undefined,
      source,
      createdAt: Date.now(),
    });
  }
  return list;
}

/** Total units (materials + item stacks' quantities) in a single pile. */
export function countPileUnits(pile: FieldLootPile): number {
  const items = (pile.items || []).reduce((sum, it) => sum + it.quantity, 0);
  return pile.wood + pile.metal + pile.bricks + items;
}

/** Total stockpile-units stranded across every pile (header warning feed). */
export function countFieldLootUnits(piles: FieldLootPile[] | undefined): number {
  if (!piles) return 0;
  return piles.reduce((sum, p) => sum + countPileUnits(p), 0);
}

/** Nearest pile to a world point within `maxDist` (used for order targeting). */
export function findPileAt(
  piles: FieldLootPile[] | undefined,
  pos: Point2D,
  maxDist = STRANDED_COLLECT_RADIUS_M * 2
): FieldLootPile | null {
  if (!piles) return null;
  let best: FieldLootPile | null = null;
  let bestD = maxDist;
  for (const p of piles) {
    const d = Math.hypot(p.position.x - pos.x, p.position.z - pos.z);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * Squad recovery: a squad that has arrived at a stranded pile collects what
 * fits into its backpack (one slot per alive member, like scavenged loot) and
 * leaves the rest on the ground. Collected units join the squad inventory so
 * the existing depot-unload flow deposits them (capacity-aware) later.
 */
export function collectStrandedLoot(
  state: SettlementState,
  squad: TacticalSquadUnit,
  pile: FieldLootPile
): { newState: SettlementState; collectedUnits: number } {
  const piles = (state.fieldLootPiles || []).map((p) => ({ ...p }));
  const target = piles.find((p) => p.id === pile.id);
  if (!target) return { newState: state, collectedUnits: 0 };

  const freeSlots = Math.max(0, getSquadInventoryCapacity(squad));
  const existingInv = state.squadInventories?.[squad.squadId];
  const inv = existingInv ? { ...existingInv, items: [...existingInv.items] } : createEmptySquadInventory(freeSlots);
  const used = inv.items.length;
  const available = Math.max(0, freeSlots - used);
  if (available <= 0) {
    return { newState: state, collectedUnits: 0 };
  }

  // One slot per resource type per trip (stacks into that single slot);
  // units consumed come out of `available` so a low-free-slots backpack still
  // takes the FULL amount of the types it can fit. Then non-material item
  // stacks are collected the same way (one slot per stack, full quantity).
  const toAdd: SquadLootItem[] = [];
  let free = available;
  for (const [label, amount] of [
    ['wood', target.wood],
    ['metal', target.metal],
    ['bricks', target.bricks],
  ] as const) {
    if (amount <= 0 || free <= 0) continue;
    const qty = Math.min(amount, free);
    toAdd.push({
      id: `${label}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      kind: 'resource',
      label,
      quantity: qty,
      weight: 1,
    });
    target[label] = Math.max(0, target[label] - qty);
    free -= 1;
  }
  const carriedItems = [...(target.items || [])];
  let collectedCount = 0;
  for (const it of carriedItems) {
    if (free <= 0) break;
    toAdd.push({ ...it });
    free -= 1;
    collectedCount += 1;
  }
  target.items = carriedItems.slice(collectedCount);

  const removed = toAdd.length > 0;
  const nextPiles = removed
    ? piles.filter((p) => countPileUnits(p) > 0)
    : piles;
  const slotsTaken = toAdd.length;

  return {
    newState: {
      ...state,
      fieldLootPiles: nextPiles,
      squadInventories: removed
        ? {
            ...(state.squadInventories || {}),
            [squad.squadId]: {
              ...inv,
              used: used + slotsTaken,
              items: [...inv.items, ...toAdd],
            },
          }
        : state.squadInventories,
    },
    collectedUnits: toAdd.reduce((sum, i) => sum + i.quantity, 0),
  };
}

/**
 * Strands the leftover backpack of every squad that is fully dead this tick
 * (all members dead / currentHp <= 0) as a field pile at its current position,
 * then clears the squad's inventory so the stranding is idempotent. Returns
 * the updated state and one event per squad that actually left loot behind.
 * Runs AFTER the logistics stage, so anything the squad managed to deposit at
 * a dropoff before dying is already safe — only what it was still carrying is
 * left on the ground.
 */
export function strandDeadSquadInventories(
  state: SettlementState,
  squads: TacticalSquadUnit[]
): {
  newState: SettlementState;
  events: { title: string; desc: string; type: 'warn' | 'info' | 'success' | 'danger' }[];
} {
  const inventories = state.squadInventories || {};
  let piles: FieldLootPile[] = (state.fieldLootPiles || []).map((p) => ({ ...p, items: p.items ? [...p.items] : undefined }));
  let nextInventories: Record<string, SquadInventory> | undefined;
  const events: { title: string; desc: string; type: 'warn' | 'info' | 'success' | 'danger' }[] = [];

  for (const squad of squads) {
    if (squad.currentHp > 0) continue;
    if (squad.members.some((m) => m.isAlive)) continue;
    const inventory = inventories[squad.squadId];
    if (!inventory?.items?.length) continue;

    const units = inventory.items.reduce((sum, it) => sum + it.quantity, 0);
    piles = strandSquadInventoryAt(piles, { x: squad.x, z: squad.z }, inventory);
    nextInventories = nextInventories || { ...inventories };
    nextInventories[squad.squadId] = { ...inventory, used: 0, items: [] };
    events.push({
      title: 'SQUAD SUPPLIES LEFT IN FIELD',
      desc: `${squad.name} fell carrying ${units} units of supplies — marked as stranded field loot at the death site for another squad to recover.`,
      type: 'warn',
    });
  }

  if (!nextInventories) return { newState: state, events };
  return {
    newState: {
      ...state,
      fieldLootPiles: piles,
      squadInventories: nextInventories,
    },
    events,
  };
}