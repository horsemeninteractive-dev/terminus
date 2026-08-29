import React, { useState } from 'react';
import {
  Award,
  Building,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Radio,
  Square,
  Target,
  Users,
  Search,
  Moon,
  Shield,
  Zap,
} from 'lucide-react';
import { SettlementState } from '../types/settlement';
import {
  OperationalDirective,
  RadioDirectiveState,
} from '../types/radioDirective';
import { CLASSIFICATION_COLORS } from '../services/radioDirectiveService';

interface TacticalQuestTrackerProps {
  settlement: SettlementState;
  radioState?: RadioDirectiveState;
  hasCompletedScavenge?: boolean;
  onActionClick?: (actionType: string) => void;
}

export const TacticalQuestTracker: React.FC<TacticalQuestTrackerProps> = ({
  radioState,
  onActionClick,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const activeDirectives: OperationalDirective[] = radioState?.activeDirectives || [];
  const completedIds = new Set(radioState?.completedDirectiveIds || []);

  // Derive directive action label
  const getActionLabel = (actionType?: string, code?: string) => {
    switch (actionType) {
      case 'focus_candidate_hq':
        return 'LOCATE CANDIDATE HQ';
      case 'open_squad_panel':
      case 'muster_squad':
        return 'MUSTER FIRETEAM';
      case 'trigger_recruitment':
        return 'RECON SURVIVORS';
      case 'trigger_scavenge':
        return 'ORDER SCAVENGE SORTIE';
      case 'speed_clock':
        return 'ACCELERATE TIME (4X)';
      case 'open_build_menu':
      case 'open_build_drawer':
        return 'ADAPT FACILITIES';
      case 'open_research_modal':
        return 'OPEN TECH TREE';
      default:
        return code ? `EXECUTE ${code}` : 'VIEW DIRECTIVE';
    }
  };

  const getDirectiveIcon = (conditionType: string) => {
    switch (conditionType) {
      case 'establish_hq':
        return <Building className="w-3.5 h-3.5 text-emerald-400" />;
      case 'form_squad':
        return <Users className="w-3.5 h-3.5 text-amber-400" />;
      case 'recruit_survivors':
        return <Target className="w-3.5 h-3.5 text-purple-400" />;
      case 'scavenge_supplies':
        return <Search className="w-3.5 h-3.5 text-sky-400" />;
      case 'survive_night':
        return <Moon className="w-3.5 h-3.5 text-red-400" />;
      case 'build_facility':
        return <Shield className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Zap className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  const activeCount = activeDirectives.filter((d) => d.status === 'active').length;
  const completedDirectives = activeDirectives.filter((d) => d.status === 'completed');

  return (
    <div
      id="tactical-quest-tracker"
      className="fixed top-[80px] left-2 sm:left-3 z-40 flex flex-col text-[#E8E8E8] select-none pointer-events-auto max-w-[min(94vw,340px)] w-full shadow-2xl transition-all"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#0A0C0E]/95 backdrop-blur-md border-l-2 border-[#10B981] clip-tactical-bracket surface-bevel shadow-md border-y border-r border-[#1E293B]">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-xs bg-[#10B981]/20 flex items-center justify-center text-[#10B981]">
            <Target className="w-3 h-3 text-[#10B981]" />
          </div>
          <span className="font-display font-black text-xs text-[#10B981] tracking-wider uppercase">
            OPERATIONAL DIRECTIVES
          </span>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.2 rounded font-bold">
            {activeCount > 0 ? `${activeCount} ACTIVE` : completedIds.size > 0 ? 'STANDBY' : 'COMMS WAITING'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-[#94A3B8] hover:text-white p-1 transition-colors touch-manipulation cursor-pointer"
            title={isCollapsed ? 'Expand Directives' : 'Minimize Directives'}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Body */}
      {!isCollapsed && (
        <div className="p-2.5 bg-[#07090C]/95 backdrop-blur-md border border-[#1E293B] border-t-0 space-y-2 text-xs max-h-[65vh] overflow-y-auto shadow-inner">
          {/* If no active directives yet (waiting for first radio comm) */}
          {activeDirectives.length === 0 && (
            <div className="p-3 text-center bg-[#0a0d14]/80 border border-slate-800 rounded space-y-2">
              <Radio className="w-5 h-5 text-emerald-400 mx-auto animate-bounce" />
              <div className="text-xs font-display font-bold text-slate-200 uppercase">
                Awaiting Initial Comms
              </div>
              <div className="text-[11px] font-mono text-slate-400 leading-relaxed">
                Recon Lead Sgt. Vance is broadcasting on frequency 104.20 MHz. Use the <strong className="text-emerald-400">Push To Talk</strong> channel to decrypt incoming sitrep.
              </div>
            </div>
          )}

          {/* Active Directives List */}
          <div className="space-y-1.5">
            {activeDirectives
              .filter((d) => d.status === 'active')
              .map((directive) => {
                const cfg =
                  CLASSIFICATION_COLORS[directive.classification] ||
                  CLASSIFICATION_COLORS.DIRECTIVE;
                const hasTargetCount =
                  directive.targetCount && directive.targetCount > 1;
                const actionLabel = getActionLabel(
                  directive.actionType,
                  directive.code
                );

                return (
                  <div
                    key={directive.id}
                    className={`p-2 rounded border transition-all ${
                      directive.isPrimary
                        ? 'bg-[#0E1B15] border-emerald-500/60 shadow-md ring-1 ring-emerald-500/30'
                        : 'bg-[#0A0D12]/90 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    {/* Header line: code badge, title, and status */}
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Square className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-pulse" />
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold border ${cfg.badge}`}
                        >
                          {directive.code}
                        </span>
                        <span className="font-display font-bold text-xs uppercase tracking-wide text-white truncate">
                          {directive.title}
                        </span>
                      </div>

                      {hasTargetCount && (
                        <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-1 py-0.2 rounded shrink-0">
                          {directive.currentCount || 0}/{directive.targetCount}
                        </span>
                      )}
                    </div>

                    {/* Directive Goal / Description */}
                    <div className="pl-5 text-[11px] font-mono text-emerald-300 leading-snug">
                      {directive.description}
                    </div>

                    {/* Reward Summary if available */}
                    {directive.rewardSummary && (
                      <div className="pl-5 pt-1 text-[9px] font-mono text-slate-400 flex items-center gap-1">
                        <Award className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="truncate">{directive.rewardSummary}</span>
                      </div>
                    )}

                    {/* Interactive Tactical Action Button */}
                    {directive.actionType && onActionClick && (
                      <div className="pl-5 pt-1.5">
                        <button
                          onClick={() => onActionClick(directive.actionType!)}
                          className="w-full py-1 px-2.5 bg-[#10B981] hover:bg-[#059669] text-[#042417] font-display font-black text-[10px] uppercase tracking-wider rounded flex items-center justify-center gap-1 transition-all shadow cursor-pointer active:scale-98"
                        >
                          <span>{actionLabel}</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Completed Directives Archive Toggle */}
          {completedDirectives.length > 0 && (
            <div className="pt-2 border-t border-[#1E293B] space-y-1">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 hover:text-slate-200 py-0.5 px-1 cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1">
                  <CheckSquare className="w-3 h-3 text-emerald-400" />
                  <span>COMPLETED DIRECTIVES ({completedDirectives.length})</span>
                </span>
                {showCompleted ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>

              {showCompleted && (
                <div className="space-y-1 pt-1">
                  {completedDirectives.map((directive) => (
                    <div
                      key={directive.id}
                      className="p-1.5 bg-[#07090E]/60 border border-slate-800/60 rounded text-[11px] opacity-75"
                    >
                      <div className="flex items-center gap-1.5">
                        <CheckSquare className="w-3 h-3 text-[#10B981] shrink-0" />
                        <span className="text-[9px] font-mono text-slate-400 font-bold">
                          {directive.code}
                        </span>
                        <span className="font-display font-bold text-xs uppercase tracking-wide text-slate-400 line-through truncate">
                          {directive.title}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
