import React from 'react';
import { Award, Skull, User, Users, X } from 'lucide-react';
import type { HiddenSurvivorGroup } from '../types/population';
import type { ZombieUnit } from '../types/combat';
import type { ZombieCluster } from '../services/zombieClusterService';
import { soundEngine } from '../services/soundService';

export interface EntityInfoSelection {
  /** `'survivor'` → hidden survivor group info card; `'zombie'` → cluster card. */
  kind: 'survivor' | 'zombie';
  id: string;
}

interface EntityInfoPanelProps {
  selection: EntityInfoSelection | null;
  hiddenGroups: Map<string | number, HiddenSurvivorGroup>;
  zombieClusters: ZombieCluster[];
  onClose: () => void;
}

const DISPOSITION_BADGE: Record<string, { label: string; cls: string }> = {
  willing: { label: 'WILLING', cls: 'text-emerald-300 border-emerald-500/60 bg-emerald-500/10' },
  distrustful: { label: 'DISTRUSTFUL', cls: 'text-amber-300 border-amber-500/60 bg-amber-500/10' },
  hostile: { label: 'HOSTILE', cls: 'text-red-300 border-red-500/60 bg-red-500/10' },
};

/** Capitalized display name for a zombie variant. */
const VARIANT_LABEL: Record<string, string> = {
  shambler: 'Shambler',
  runner: 'Runner',
  brute: 'Brute',
};

/**
 * Squad-style info card for neutral/hostile entities that have no command
 * panel: discovered hidden-survivor groups and zombie clusters. Rendered in
 * the same selection dock slot as the squad/building/vehicle panels.
 */
export const EntityInfoPanel: React.FC<EntityInfoPanelProps> = ({
  selection,
  hiddenGroups,
  zombieClusters,
  onClose,
}) => {
  if (!selection) return null;

  const closeBtn = (
    <button
      onClick={() => {
        soundEngine.playClick();
        onClose();
      }}
      title="Close (ESC)"
      className="text-[#64748B] hover:text-white transition-colors p-1"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  );

  if (selection.kind === 'survivor') {
    const group = hiddenGroups.get(selection.id);
    if (!group) return null;
    const leader = group.leader;
    const badge = DISPOSITION_BADGE[group.encounteredDisposition || group.disposition] || DISPOSITION_BADGE.distrustful;
    const total = 1 + group.generalCount;
    return (
      <div
        data-entity-info-panel
        className="relative z-40 flex flex-col bg-[#07090C]/95 border-2 border-[#F59E0B] text-[#E8E8E8] select-none w-full md:w-[min(94vw,340px)] shrink-0 max-h-[48vh] md:max-h-[70vh] overflow-y-auto pointer-events-auto backdrop-blur-md clip-tactical-bracket surface-bevel shadow-2xl"
      >
        <div className="h-8 px-2.5 bg-[#0B0F15] border-b border-[#1E293B] flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 bg-[#3A2A06] border border-[#F59E0B] flex items-center justify-center text-[#F59E0B] shrink-0">
              <Users className="w-3.5 h-3.5" />
            </div>
            <span className="font-heading font-bold text-xs uppercase tracking-wider text-white truncate">
              {leader.name}
            </span>
          </div>
          {closeBtn}
        </div>

        {/* Banner strip */}
        <div className="relative h-14 w-full bg-[#050709] overflow-hidden border-b border-[#1E293B] flex items-center gap-3 px-3">
          <div className="w-10 h-10 bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-bold text-sm shrink-0">
            {leader.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-[#94A3B8] truncate">{group.buildingName}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`px-1.5 py-0.5 text-[9px] font-bold border ${badge.cls}`}>{badge.label}</span>
              <span className="text-[10px] font-mono text-white flex items-center gap-1">
                <Users className="w-3 h-3 text-amber-400" />
                {total} SURVIVOR{total === 1 ? '' : 'S'}
              </span>
            </div>
          </div>
        </div>

        {/* Leader details */}
        <div className="p-2.5 border-b border-[#1E293B] space-y-2">
          <div className="flex items-center justify-between text-[11px] font-heading font-bold text-slate-300 tracking-wide">
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-400" />
              LEADER :
            </span>
            <span className="text-[10px] font-mono text-[#94A3B8] truncate max-w-[55%]">{leader.background}</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['Combat', leader.stats.combat],
                ['Scavenging', leader.stats.scavenging],
                ['Medical', leader.stats.medical],
                ['Driving', leader.stats.driving],
                ['Persuasion', leader.stats.persuasion],
                ['Construction', leader.stats.construction],
              ] as const
            ).map(([label, tier]) => (
              <div key={label} className="flex items-center justify-between bg-[#0A0D12] border border-[#1E293B] px-1.5 py-1">
                <span className="text-[10px] text-slate-400">{label}</span>
                <span
                  className={`text-[10px] font-mono font-bold uppercase ${
                    tier === 'expert' ? 'text-emerald-400' : tier === 'skilled' ? 'text-sky-400' : 'text-slate-400'
                  }`}
                >
                  {tier}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#94A3B8]">
            <Award className="w-3 h-3 text-amber-400 shrink-0" />
            <span>
              +{group.generalCount} general survivor{group.generalCount === 1 ? '' : 's'} · bribe cost{' '}
              {group.foodCostToBribe ? `${group.foodCostToBribe} food` : 'n/a'}
            </span>
          </div>
        </div>

        <div className="p-2.5 bg-[#0A0D12] text-[10px] font-mono text-[#94A3B8] leading-relaxed">
          “{group.dialogue}”
        </div>
      </div>
    );
  }

  // Zombie cluster card
  const cluster = zombieClusters.find((c) => c.key === selection.id);
  if (!cluster) return null;
  const variantCounts = new Map<string, number>();
  for (const z of cluster.members) {
    variantCounts.set(z.variant, (variantCounts.get(z.variant) || 0) + 1);
  }
  const dominant = [...variantCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const chasing = cluster.members.filter((z) => z.state === 'chasing' || z.state === 'attacking_unit').length;
  const dormant = cluster.members.filter((z) => z.isDormant).length;

  return (
    <div
      data-entity-info-panel
      className="relative z-40 flex flex-col bg-[#07090C]/95 border-2 border-[#EF4444] text-[#E8E8E8] select-none w-full md:w-[min(94vw,340px)] shrink-0 max-h-[48vh] md:max-h-[70vh] overflow-y-auto pointer-events-auto backdrop-blur-md clip-tactical-bracket surface-bevel shadow-2xl"
    >
      <div className="h-8 px-2.5 bg-[#0B0F15] border-b border-[#1E293B] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 bg-[#3A0A0A] border border-[#EF4444] flex items-center justify-center text-[#EF4444] shrink-0">
            <Skull className="w-3.5 h-3.5" />
          </div>
          <span className="font-heading font-bold text-xs uppercase tracking-wider text-white truncate">
            INFECTED GROUP · {cluster.size}
          </span>
        </div>
        {closeBtn}
      </div>

      {/* Aggregate health */}
      <div className="p-2.5 border-b border-[#1E293B] space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-heading font-bold text-slate-300 tracking-wide">
          <span>GROUP VITALS :</span>
          <span className="font-mono text-[10px] text-white">
            {Math.round(cluster.damageRatio * 100)}% AVG HP
          </span>
        </div>
        <div className="h-2 w-full bg-black/80 border border-red-500/40 rounded-sm overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${cluster.damageRatio < 0.35 ? 'bg-red-700' : cluster.damageRatio < 0.7 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${Math.round(cluster.damageRatio * 100)}%` }}
          />
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-[#94A3B8]">
          <span className="text-red-300 font-bold uppercase">
            DOMINANT: {VARIANT_LABEL[dominant?.[0] || 'shambler'] || 'Shambler'}
          </span>
          {chasing > 0 && <span className="text-orange-400">{chasing} AGGRO</span>}
          {dormant > 0 && <span>{dormant} DORMANT</span>}
        </div>
      </div>

      {/* Per-unit health meters */}
      <div className="p-2.5 border-b border-[#1E293B] space-y-2">
        <div className="flex items-center justify-between text-[11px] font-heading font-bold text-slate-300 tracking-wide">
          <span>MEMBERS :</span>
          <span className="font-mono text-white">{cluster.size}</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {cluster.members.slice(0, 12).map((z) => {
            const hpPct = z.maxHp > 0 ? (z.currentHp / z.maxHp) * 100 : 0;
            return (
              <div key={z.id} className="flex flex-col items-center gap-1" title={`${VARIANT_LABEL[z.variant] || z.variant} — ${z.name} · ${Math.ceil(z.currentHp)}/${z.maxHp} HP${z.alertLevel > 0 ? ' · ALERTED' : ''}`}>
                <div className="relative w-full aspect-square bg-[#160A0A] border border-[#5B2020] overflow-hidden flex items-center justify-center">
                  <Skull className={`w-5 h-5 ${z.alertLevel > 0 ? 'text-red-400' : 'text-[#7A3B3B]'}`} />
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-900">
                    <div
                      className={`h-full ${hpPct < 30 ? 'bg-amber-400' : 'bg-red-500'}`}
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>
                </div>
                <span className="text-[9px] font-mono text-[#94A3B8] uppercase">{VARIANT_LABEL[z.variant] || z.variant}</span>
              </div>
            );
          })}
        </div>
        {cluster.members.length > 12 && (
          <div className="text-[9px] font-mono text-[#64748B]">+{cluster.members.length - 12} more…</div>
        )}
      </div>

      <div className="p-2.5 bg-[#0A0D12] text-[10px] font-mono text-[#94A3B8] leading-relaxed">
        {cluster.size} infected · avg speed{' '}
        {(cluster.members.reduce((s, z) => s + z.speed, 0) / cluster.size).toFixed(1)} m/s
      </div>
    </div>
  );
};

/** Type guard for zombie unit arrays (avoids importing test-only helpers). */
export function isZombieUnit(z: unknown): z is ZombieUnit {
  return Boolean(z && typeof z === 'object' && 'variant' in (z as object) && 'currentHp' in (z as object));
}
