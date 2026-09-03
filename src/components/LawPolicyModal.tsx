import React from 'react';
import {
  Scale,
  X,
  CheckCircle2,
  Lock,
  Users,
  Building2,
  UtensilsCrossed,
  Baby,
  Hammer,
  AlertTriangle,
  Hourglass,
} from 'lucide-react';
import { SettlementState } from '../types/settlement';
import { LawId, LawCategory } from '../types/laws';
import {
  LAWS,
  getActiveLaw,
  getLawsUnlockInfo,
} from '../services/lawService';

interface LawPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  settlement: SettlementState;
  today: number;
  onEnactLaw: (lawId: LawId) => void;
}

const CATEGORY_META: Record<LawCategory, { label: string; color: string; icon: React.ReactNode }> = {
  food: { label: 'FOOD & RATIONS', color: 'text-[#FBBF24]', icon: <UtensilsCrossed className="w-3.5 h-3.5" /> },
  childcare: { label: 'CHILDCARE', color: 'text-[#F472B6]', icon: <Baby className="w-3.5 h-3.5" /> },
  labor: { label: 'WORK RULES', color: 'text-[#60A5FA]', icon: <Hammer className="w-3.5 h-3.5" /> },
};

export const LawPolicyModal: React.FC<LawPolicyModalProps> = ({
  isOpen,
  onClose,
  settlement,
  today,
  onEnactLaw,
}) => {
  if (!isOpen) return null;

  const unlock = getLawsUnlockInfo(settlement);
  const activeLaw = getActiveLaw(settlement);
  const laws = settlement.laws;
  const alreadyChangedToday = laws?.lastLawChangeDay === today;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[520px] max-h-[85vh] overflow-y-auto bg-[#0B1220] border border-[#3B4A63] rounded-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#243349] bg-[#0E1728]">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#FBBF24]" />
            <span className="font-heading font-bold text-[12px] text-[#FDE68A] uppercase tracking-wider">
              Law & Policy
            </span>
            <span className="text-[9px] font-mono text-[#64748B] uppercase">Gathering Place Forum</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {/* Unlock status */}
          <div className={`p-2.5 rounded border flex flex-col gap-1 ${unlock.unlocked ? 'bg-[#0D1F14] border-[#3F6212]' : 'bg-[#1A1213] border-[#4A1C20]'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-heading font-bold text-[10px] uppercase ${unlock.unlocked ? 'text-[#BEF264]' : 'text-[#FCA5A5]'}`}>
                {unlock.unlocked ? 'Forum Open' : 'Forum Locked'}
              </span>
              {unlock.unlocked ? (
                <CheckCircle2 className="w-4 h-4 text-[#A3E635]" />
              ) : (
                <Lock className="w-4 h-4 text-[#F87171]" />
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono text-[#94A3B8]">
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {unlock.gatheringPlaceOperational ? 'Gathering Place ✓' : 'No Gathering Place'}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {unlock.population} / {unlock.requiredPopulation} citizens
              </span>
            </div>
            {!unlock.unlocked && <p className="text-[9px] font-mono text-[#FCA5A5]/80">{unlock.reason}</p>}
          </div>

          {/* One-change-per-day status */}
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#101A2E] border border-[#243349] rounded">
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#94A3B8]">
              <Hourglass className="w-3 h-3 text-[#38BDF8]" />
              Changes per day: <span className="text-[#38BDF8] font-bold">1</span>
            </span>
            <span className={`text-[10px] font-mono font-bold ${alreadyChangedToday ? 'text-[#F87171]' : 'text-[#4ADE80]'}`}>
              {alreadyChangedToday ? 'LIMIT REACHED — RETURNS TOMORROW' : 'CHANGE AVAILABLE'}
            </span>
          </div>

          {/* Law list */}
          <div className="flex flex-col gap-2">
            {LAWS.map((law) => {
              const isActive = law.id === activeLaw.id;
              const meta = CATEGORY_META[law.category];
              return (
                <div
                  key={law.id}
                  className={`p-2.5 rounded border flex flex-col gap-1.5 transition-colors ${
                    isActive ? 'bg-[#14202E] border-[#FBBF24]/70' : 'bg-[#0E1728] border-[#243349]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={meta.color}>{meta.icon}</span>
                      <span className={`font-heading font-bold text-[11px] ${isActive ? 'text-[#FDE68A]' : 'text-[#E8E8E8]'}`}>
                        {law.name}
                      </span>
                      <span className={`text-[8px] font-mono uppercase ${meta.color}`}>{meta.label}</span>
                    </div>
                    {isActive && (
                      <span className="text-[8px] font-mono font-bold text-[#FBBF24] uppercase shrink-0">Active</span>
                    )}
                  </div>

                  <p className="text-[10px] font-mono text-[#94A3B8] leading-snug">{law.description}</p>

                  <div className="flex items-center gap-3 text-[9px] font-mono">
                    <span className={law.foodConsumptionMult === 1 ? 'text-[#64748B]' : law.foodConsumptionMult < 1 ? 'text-[#4ADE80]' : 'text-[#FBBF24]'}>
                      FOOD ×{law.foodConsumptionMult.toFixed(1)}/DAY
                    </span>
                    <span className={law.moraleDelta === 0 ? 'text-[#64748B]' : law.moraleDelta > 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}>
                      {law.moraleDelta === 0 ? 'NO MORALE EFFECT' : `${law.moraleDelta > 0 ? '+' : ''}${law.moraleDelta} SATISFACTION`}
                    </span>
                    <span className={law.childLaborAllowed ? 'text-[#FCA5A5]' : 'text-[#64748B]'}>
                      {law.childLaborAllowed ? 'CHILDREN WORK' : 'CHILDREN EXEMPT'}
                    </span>
                  </div>

                  {!isActive && (
                    <button
                      disabled={!unlock.unlocked || alreadyChangedToday}
                      onClick={() => onEnactLaw(law.id)}
                      className="self-end mt-0.5 px-3 py-1 bg-[#1E3A8A] hover:bg-[#1D4ED8] disabled:bg-[#1A2230] disabled:text-[#475569] disabled:cursor-not-allowed border border-[#3B82F6]/50 disabled:border-[#243349] rounded text-[9px] font-heading font-bold text-[#BFDBFE] uppercase transition-colors"
                    >
                      {!unlock.unlocked ? 'LOCKED' : alreadyChangedToday ? 'TODAY USED' : 'ENACT'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footnote */}
          <div className="flex items-start gap-1.5 px-1 text-[9px] font-mono text-[#64748B] leading-snug">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-[#FBBF24]" />
            <span>
              Laws take effect immediately: rationing changes the colony&apos;s daily food draw, satisfaction is a
              standing morale factor, and Child Labour Permitted adds children to the worker pool.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};