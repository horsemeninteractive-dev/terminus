import React, { useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Flame,
  MessageSquare,
  UserCheck,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import { HiddenSurvivorGroup, StatTier } from '../types/population';
import { SettlementState } from '../types/settlement';

interface RecruitmentEncounterModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: HiddenSurvivorGroup;
  settlement: SettlementState;
  onRecruit?: (buildingId: string | number, persuasionLeaderId?: string) => void;
  onRecruitSuccess?: (groupId: string, method?: 'persuaded' | 'rations' | 'combat' | 'willing') => void;
}

function getTierBadge(tier: StatTier) {
  switch (tier) {
    case 'expert':
      return { label: 'Expert', color: 'text-amber-300 bg-amber-500/20 border-amber-500/40' };
    case 'skilled':
      return { label: 'Skilled', color: 'text-emerald-300 bg-emerald-500/20 border-emerald-500/40' };
    case 'novice':
    default:
      return { label: 'Novice', color: 'text-slate-400 bg-slate-800 border-slate-700' };
  }
}

export const RecruitmentEncounterModal: React.FC<RecruitmentEncounterModalProps> = ({
  isOpen,
  onClose,
  group,
  settlement,
  onRecruit,
  onRecruitSuccess,
}) => {
  const [negotiationOutcome, setNegotiationOutcome] = useState<string | null>(null);
  const [hasResolved, setHasResolved] = useState(false);

  if (!isOpen) return null;

  const leader = group.leader;
  const cannedGoods = settlement.stockpile.food.canned_goods;

  // Best persuader in settlement
  const persuaders = [...settlement.namedSurvivors].sort((a, b) => {
    const tierVal = (t: StatTier) => (t === 'expert' ? 3 : t === 'skilled' ? 2 : 1);
    return tierVal(b.stats.persuasion) - tierVal(a.stats.persuasion);
  });
  const bestPersuader = persuaders[0];

  const handleRecruitWilling = () => {
    if (onRecruitSuccess) onRecruitSuccess(group.id, 'willing');
    if (onRecruit) onRecruit(group.buildingId);
    setHasResolved(true);
    setNegotiationOutcome(
      `${leader.name} and ${group.generalCount} survivors gratefully accepted your leadership and joined the settlement.`
    );
  };

  const handlePersuade = () => {
    const persuaderTier = bestPersuader?.stats.persuasion || 'novice';
    if (persuaderTier === 'expert' || persuaderTier === 'skilled') {
      if (onRecruitSuccess) onRecruitSuccess(group.id, 'persuaded');
      if (onRecruit) onRecruit(group.buildingId, bestPersuader?.id);
      setHasResolved(true);
      setNegotiationOutcome(
        `Diplomatic Success! ${bestPersuader.name}'s ${persuaderTier} persuasion eased their suspicions. The group joined your enclave.`
      );
    } else {
      // 50% chance for novice
      const success = Math.random() > 0.35;
      if (success) {
        if (onRecruitSuccess) onRecruitSuccess(group.id, 'persuaded');
        if (onRecruit) onRecruit(group.buildingId, bestPersuader?.id);
        setHasResolved(true);
        setNegotiationOutcome(
          `Diplomatic Success! Through careful dialogue, ${leader.name} agreed to unite forces with your settlement.`
        );
      } else {
        setNegotiationOutcome(
          `${leader.name} remains guarded and refused your verbal overture. Try offering food rations instead.`
        );
      }
    }
  };

  const handleOfferRations = () => {
    if (cannedGoods >= 15) {
      if (onRecruitSuccess) onRecruitSuccess(group.id, 'rations');
      if (onRecruit) onRecruit(group.buildingId);
      setHasResolved(true);
      setNegotiationOutcome(
        `Generosity Won Them Over! Providing 15 canned rations proved your settlement's goodwill. The group joined gladly.`
      );
    }
  };

  const getDispositionBadge = () => {
    switch (group.disposition) {
      case 'willing':
        return {
          label: 'Willing & Receptive',
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        };
      case 'distrustful':
        return {
          label: 'Distrustful / Cautious (Needs Persuasion or Rations)',
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        };
      case 'hostile':
        return {
          label: 'Defensive / Hostile (High Tension)',
          color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        };
    }
  };

  const dispBadge = getDispositionBadge();

  return (
    <div
      id="recruitment-encounter-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-[#181a1f] border border-amber-500/40 w-full max-w-2xl flex flex-col clip-tactical-bracket surface-bevel overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#121418]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 tracking-wide">
                SURVIVOR ENCOUNTER DISCOVERY (§4.4)
              </h2>
              <p className="text-xs text-slate-400">
                {group.hasSmokeClue
                  ? 'Identified through rooftop chimney smoke plumes'
                  : 'Scouted within urban structural interior'}
              </p>
            </div>
          </div>

          <button
            id="close-encounter-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Encounter Introduction */}
          <div className="p-4 bg-[#1d2027] border border-slate-700/60 clip-card-chip flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-bold text-sm">
              {leader.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-100">{leader.name}</h3>
                <span className={`px-2.5 py-0.5 text-xs font-semibold border ${dispBadge.color}`}>
                  {dispBadge.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{leader.background}</p>
              <div className="mt-2 text-xs text-slate-300 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>
                  Accompanying Group:{' '}
                  <strong className="text-slate-100">+{group.generalCount} General Citizens</strong> (will join general workforce pool)
                </span>
              </div>
            </div>
          </div>

          {/* Leader 7-Stat Proficiency Sheet */}
          <div className="p-4 bg-[#14161a] border border-slate-800 clip-card-chip">
            <div className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" />
              Leader's Specialist Proficiency Sheet (§4.1)
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {(
                [
                  ['Combat', leader.stats.combat],
                  ['Scavenging', leader.stats.scavenging],
                  ['Medical', leader.stats.medical],
                  ['Driving', leader.stats.driving],
                  ['Persuasion', leader.stats.persuasion],
                  ['Construction', leader.stats.construction],
                  ['Production', leader.stats.production],
                ] as [string, StatTier][]
              ).map(([label, tier]) => {
                const badge = getTierBadge(tier);
                return (
                  <div
                    key={label}
                    className="p-2 bg-slate-900/60 border border-slate-800 clip-card-chip flex items-center justify-between"
                  >
                    <span className="text-slate-400 text-[11px]">{label}:</span>
                    <span className={`px-2 py-0.5 text-[10px] font-bold border ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dialogue / Result message */}
          {negotiationOutcome && (
            <div
              className={`p-3.5 border text-xs leading-relaxed clip-card-chip flex items-start gap-2.5 ${
                hasResolved
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
              }`}
            >
              {hasResolved ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>{negotiationOutcome}</div>
            </div>
          )}

          {/* Interactive Options */}
          {!hasResolved && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-xs font-semibold text-slate-400 mb-2">
                Choose Encounter Action:
              </div>

              {group.disposition === 'willing' ? (
                <button
                  id="recruit-willing-btn"
                  onClick={handleRecruitWilling}
                  className="w-full p-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  Invite Group to Join Enclave (1 Named + {group.generalCount} General)
                </button>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    id="persuade-leader-btn"
                    onClick={handlePersuade}
                    className="p-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 text-xs font-semibold transition-colors flex flex-col items-start gap-1"
                  >
                    <span className="flex items-center gap-1.5 font-bold text-slate-100">
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                      Diplomatic Persuasion
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Envoy: {bestPersuader?.name} ({bestPersuader?.stats.persuasion} tier)
                    </span>
                  </button>

                  <button
                    id="offer-rations-btn"
                    onClick={handleOfferRations}
                    disabled={cannedGoods < 15}
                    className="p-3 bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-40 disabled:pointer-events-none text-amber-200 border border-amber-500/40 text-xs font-semibold transition-colors flex flex-col items-start gap-1"
                  >
                    <span className="flex items-center gap-1.5 font-bold text-slate-100">
                      <Utensils className="w-3.5 h-3.5 text-amber-400" />
                      Offer Food Provisions (-15 Rations)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Stock: {cannedGoods} Canned Goods Available
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {hasResolved && (
            <div className="flex justify-end pt-2">
              <button
                id="close-resolved-encounter-btn"
                onClick={onClose}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                Close Encounter Sheet
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
