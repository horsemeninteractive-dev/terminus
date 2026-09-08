import type { ReactElement, ReactNode } from 'react';
import {
  Apple,
  BookOpen,
  Box,
  Crosshair,
  Cpu,
  Droplets,
  FlaskConical,
  Fuel,
  Hammer,
  Layers,
  Package,
  Pill,
  Shield,
  TreePine,
  Wrench,
} from 'lucide-react';
import type { SquadLootItem } from '../types/population';

/** Minimal icon signature — both lucide components and local aliases fit. */
type IconCmp = (props: { className?: string }) => ReactNode;

const mk = (Cmp: (props: { className?: string }) => ReactNode, color: string): IconCmp =>
  ({ className }) => <Cmp className={className ? `${className} ${color}` : color} />;

function Wheat({ className }: { className?: string }): ReactElement {
  return <Apple className={className ? `${className} text-amber-200` : 'text-amber-200'} />;
}

function HeartPulse({ className }: { className?: string }): ReactElement {
  return <Crosshair className={className ? `${className} text-rose-300` : 'text-rose-300'} />;
}

function PackageCrate({ className }: { className?: string }): ReactElement {
  return <Package className={className ? `${className} text-amber-300` : 'text-amber-300'} />;
}

/**
 * Per-resource inventory icons. Loot labels are stockpile ids (canned_goods,
 * scientific_materials, …) plus a few legacy labels (ammo, medical) and fuel
 * ids; each maps to a distinct lucide glyph + accent colour so slots read at a
 * glance instead of every resource showing the same crate.
 */
const RESOURCE_ICONS: Record<string, IconCmp> = {
  // Food & water
  canned_goods: mk(Apple, 'text-emerald-300'),
  dried_rations: mk(Wheat, 'text-amber-200'),
  bottled_water: mk(Droplets, 'text-cyan-300'),
  // Medical
  first_aid_kits: mk(HeartPulse, 'text-rose-300'),
  sterile_bandages: mk(FlaskConical, 'text-red-300'),
  antibiotics: mk(Pill, 'text-fuchsia-300'),
  painkillers: mk(Pill, 'text-pink-300'),
  medical: mk(HeartPulse, 'text-rose-300'),
  // Fuels
  gasoline: mk(Fuel, 'text-orange-300'),
  diesel: mk(Fuel, 'text-yellow-300'),
  // Munitions
  ammunition: mk(Crosshair, 'text-amber-300'),
  ammo: mk(Crosshair, 'text-amber-300'),
  // Materials
  wood: mk(TreePine, 'text-lime-300'),
  logs: mk(TreePine, 'text-green-300'),
  metal: mk(Layers, 'text-slate-300'),
  scrap: mk(Box, 'text-zinc-300'),
  bricks: mk(Layers, 'text-rose-200'),
  tools: mk(Wrench, 'text-sky-300'),
  scientific_materials: mk(BookOpen, 'text-violet-300'),
};

/** Extra keyword fallbacks for labels not in the table (e.g. fuel canisters). */
function fallbackIcon(label: string): IconCmp {
  const l = label.toLowerCase();
  if (l.includes('fuel')) return mk(Fuel, 'text-orange-300');
  if (l.includes('water')) return mk(Droplets, 'text-cyan-300');
  if (l.includes('canned') || l.includes('ration') || l.includes('food')) return mk(Apple, 'text-emerald-300');
  if (l.includes('ammo')) return mk(Crosshair, 'text-amber-300');
  if (l.includes('science') || l.includes('book') || l.includes('data')) return mk(BookOpen, 'text-violet-300');
  if (l.includes('chip') || l.includes('circuit')) return mk(Cpu, 'text-cyan-200');
  if (l.includes('tool')) return mk(Wrench, 'text-sky-300');
  if (l.includes('wood') || l.includes('log')) return mk(TreePine, 'text-lime-300');
  if (l.includes('metal') || l.includes('steel')) return mk(Layers, 'text-slate-300');
  if (l.includes('brick')) return mk(Layers, 'text-rose-200');
  if (l.includes('hammer') || l.includes('build')) return mk(Hammer, 'text-orange-200');
  return PackageCrate;
}

/**
 * The icon element for a loot item at a given size: unique per resource type
 * where known, keyword fallback beyond that, generic crate only when nothing
 * matches. Returns null for an empty slot.
 */
export function lootIconForItem(
  item: { kind?: string; label?: string } | undefined | null,
  sizeClass = 'w-4 h-4'
): ReactElement | null {
  if (!item) return null;
  if (item.kind === 'weapon') return <Crosshair className={`${sizeClass} text-rose-300`} />;
  if (item.kind === 'armor') return <Shield className={`${sizeClass} text-sky-300`} />;
  const label = (item.label || '').trim();
  const Cmp = label ? RESOURCE_ICONS[label] ?? fallbackIcon(label) : PackageCrate;
  return <Cmp className={sizeClass} />;
}
