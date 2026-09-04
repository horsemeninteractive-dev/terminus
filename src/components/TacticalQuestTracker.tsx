import React, { useState } from 'react';
import {
  AlertTriangle,
  Award,
  Building,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  MapPin,
  Moon,
  Radio,
  Search,
  Shield,
  Square,
  Swords,
  Target,
  Users,
  Zap,
  Crosshair,
} from 'lucide-react';
import { SettlementState } from '../types/settlement';
import {
  OperationalDirective,
  RadioDirectiveState,
} from '../types/radioDirective';
import { CLASSIFICATION_COLORS } from '../services/radioDirectiveService';
import { findMissionDefinition } from '../services/missionService';
import {
  COLD_STANDING,
  WARM_STANDING,
  factionCutoffFlag,
  getFactionDefinition,
  getFactionName,
} from '../data/factions';
import {
  MissionRuntimeState,
  MissionState,
  MissionTaskState,
} from '../types/mission';

interface TacticalQuestTrackerProps {
  settlement: SettlementState;
  radioState?: RadioDirectiveState;
  missionState?: MissionState;
  hasCompletedScavenge?: boolean;
  onActionClick?: (actionType: string) => void;
}

type GroupKey = 'main' | 'emergency' | 'side';

function missionGroup(def: { isMainStory?: boolean; category: string; priority: string } | undefined): GroupKey {
  if (!def) return 'side';
  if (def.isMainStory) return 'main';
  if (def.category === 'emergency' || def.priority === 'critical' || def.priority === 'high') return 'emergency';
  return 'side';
}

export const TacticalQuestTracker: React.FC<TacticalQuestTrackerProps> = ({
  radioState,
  missionState,
  onActionClick,
}: TacticalQuestTrackerProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedMissions, setExpandedMissions] = useState<Set<string>>(() => new Set());

  const activeDirectives: OperationalDirective[] = radioState?.activeDirectives || [];
  const completedIds = new Set(radioState?.completedDirectiveIds || []);
  const activeMissions = missionState?.activeMissions || [];
  const pendingMissions = missionState?.pendingMissions || [];

  // Faction standing rows (registry order) with posture derived from standing
  // and the persistent cutoff marker set when a faction broke contact.
  const factionRows = Object.keys(missionState?.factionRelations || {})
    .filter((id) => getFactionDefinition(id))
    .map((id) => {
      const standing = (missionState?.factionRelations || {})[id] ?? 0;
      const cut = Boolean(missionState?.narrativeFlags?.[factionCutoffFlag(id)]);
      const posture = cut
        ? { label: 'CONTACT LOST', cls: 'text-red-400 border-red-900/60 bg-red-950/30' }
        : standing >= WARM_STANDING
        ? { label: 'WARM', cls: 'text-emerald-400 border-emerald-900/60 bg-emerald-950/30' }
        : standing <= COLD_STANDING
        ? { label: 'COLD', cls: 'text-slate-400 border-slate-700/60 bg-slate-900/40' }
        : { label: 'NEUTRAL', cls: 'text-amber-400 border-amber-900/60 bg-amber-950/30' };
      return { id, standing, cut, posture, def: getFactionDefinition(id)! };
    });

  const toggleMission = (id: string) => {
    setExpandedMissions((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Directive action label (legacy tutorial)
  const getDirectiveActionLabel = (actionType?: string, code?: string) => {
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

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'establish_hq':
      case 'build_facility':
      case 'adapt_building':
        return <Building className="w-3 h-3 text-emerald-400" />;
      case 'form_squad':
        return <Users className="w-3 h-3 text-amber-400" />;
      case 'recruit_survivors':
      case 'rescue_survivors':
      case 'reach_population':
        return <Users className="w-3 h-3 text-purple-400" />;
      case 'scavenge_building':
      case 'scavenge_resource':
      case 'discover_location':
      case 'travel_to_location':
        return <Search className="w-3 h-3 text-sky-400" />;
      case 'clear_lair':
      case 'eliminate_infected':
        return <Swords className="w-3 h-3 text-red-400" />;
      case 'research_technology':
        return <Zap className="w-3 h-3 text-cyan-400" />;
      case 'survive_duration':
        return <Moon className="w-3 h-3 text-indigo-400" />;
      case 'deliver_resources':
      case 'establish_settlement':
      case 'contact_faction':
        return <MapPin className="w-3 h-3 text-amber-400" />;
      default:
        return <Target className="w-3 h-3 text-emerald-400" />;
    }
  };

  /** Focus action routing for a task (optional convenience — never required). */
  const renderTaskFocus = (task: MissionTaskState) => {
    if (!task.focusAction || !onActionClick || task.status === 'completed') return null;
    let label = 'FOCUS';
    let action = task.focusAction;
    switch (task.focusAction) {
      case 'focus_lair':
        label = 'FOCUS LAIR';
        break;
      case 'focus_location':
      case 'locate_target':
        label = task.boundTargetId !== undefined ? 'FOCUS LOCATION' : 'LOCATE';
        if (task.boundTargetId !== undefined) action = `focus_building:${task.boundTargetId}`;
        break;
      case 'trigger_recruitment':
        label = 'RECON SURVIVORS';
        break;
      case 'open_build_drawer':
      case 'open_build_menu':
        label = 'OPEN BUILD MENU';
        break;
      case 'open_squad_panel':
        label = 'OPEN SQUADS';
        break;
      case 'open_research_modal':
        label = 'OPEN TECH TREE';
        break;
    }
    return (
      <button
        onClick={() => onActionClick(action)}
        className="mt-1 w-full py-1 px-2 bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] border border-[#10B981]/40 font-display font-black text-[9px] uppercase tracking-wider rounded flex items-center justify-center gap-1 transition-all cursor-pointer"
      >
        <Crosshair className="w-2.5 h-2.5" />
        <span>{label}</span>
      </button>
    );
  };

  const renderTask = (task: MissionTaskState) => {
    const complete = task.status === 'completed';
    const isLocked = task.status === 'pending' || (task.dependsOn && task.dependsOn.length > 0 && task.status !== 'active' && !complete);
    const counted = task.target > 1;
    return (
      <div key={task.id} className="flex items-start gap-1.5 py-[3px]">
        {complete ? (
          <CheckCircle2 className="w-3 h-3 text-[#10B981] shrink-0 mt-0.5" />
        ) : task.status === 'failed' ? (
          <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
        ) : isLocked ? (
          <Circle className="w-3 h-3 text-slate-600 shrink-0 mt-0.5" />
        ) : task.status === 'active' ? (
          <Circle className="w-3 h-3 text-emerald-400 fill-emerald-400/40 animate-pulse shrink-0 mt-0.5" />
        ) : (
          <Circle className="w-3 h-3 text-slate-600 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[10px] font-mono leading-snug ${
                complete ? 'text-slate-500 line-through' : isLocked ? 'text-slate-500' : 'text-emerald-300'
              }`}
            >
              {task.title}
              {isLocked && (
                <span className="ml-1.5 text-[8px] font-mono text-slate-500 border border-slate-700/60 px-1 py-px rounded bg-slate-900/60">
                  LOCKED
                </span>
              )}
            </span>
            {counted && !complete && !isLocked && (
              <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1 rounded shrink-0">
                {task.current}/{task.target}
              </span>
            )}
          </div>
          {counted && !complete && !isLocked && task.target > 0 && (
            <div className="h-0.5 w-full bg-slate-800 rounded mt-0.5 overflow-hidden">
              <div
                className="h-full bg-emerald-500/70"
                style={{ width: `${Math.min(100, (task.current / task.target) * 100)}%` }}
              />
            </div>
          )}
          {!isLocked && renderTaskFocus(task)}
        </div>
      </div>
    );
  };

  const renderMission = (mission: MissionRuntimeState, group: GroupKey, isNew: boolean) => {
    const def = findMissionDefinition(mission.definitionId);
    if (!def) return null;
    const expanded = expandedMissions.has(mission.id) || (isNew && expandedMissions.size === 0);
    const completeCount = mission.tasks.filter((t) => t.status === 'completed').length;
    const totalTasks = mission.tasks.length;
    const groupBorder =
      group === 'main'
        ? 'border-emerald-500/60 ring-1 ring-emerald-500/20'
        : group === 'emergency'
        ? 'border-red-500/50'
        : 'border-slate-800';
    const groupBg =
      group === 'main'
        ? 'bg-[#0E1B15]'
        : group === 'emergency'
        ? 'bg-[#1c0d0f]/70'
        : 'bg-[#0A0D12]/90';

    return (
      <div
        key={mission.id}
        className={`p-2 rounded border ${groupBorder} ${groupBg} transition-all`}
      >
        <button
          onClick={() => toggleMission(mission.id)}
          className="w-full text-left cursor-pointer"
        >
          <div className="flex items-center justify-between gap-1.5 mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {def.priority === 'critical' ? (
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 animate-pulse" />
              ) : group === 'main' ? (
                <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Target className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              )}
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded font-bold border bg-slate-900/80 text-slate-400 border-slate-700 shrink-0">
                {def.code}
              </span>
              <span className="font-display font-bold text-xs uppercase tracking-wide text-white truncate">
                {def.title}
              </span>
            </div>
            <span className="text-[9px] font-mono text-slate-400 shrink-0">
              {expanded ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />}
            </span>
          </div>
          <div className="pl-5 flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-slate-500">
              {totalTasks > 0 ? `${completeCount}/${totalTasks} OBJECTIVES` : ''}
            </span>
            {def.priority === 'critical' && (
              <span className="text-[8px] font-mono font-black text-red-400 border border-red-500/50 px-1 rounded bg-red-950/60">
                CRITICAL
              </span>
            )}
          </div>
        </button>

        {expanded && (
          <div className="pl-5 pt-1 space-y-[1px]">
            {def.description && (
              <p className="text-[10px] font-mono text-slate-400 leading-snug pb-1 border-b border-slate-800/60 mb-1">
                {def.description}
              </p>
            )}
            {mission.tasks.map(renderTask)}
            {mission.tasks.length === 0 && (
              <p className="text-[10px] font-mono text-slate-500 italic">
                No field objectives — narrative operation.
              </p>
            )}
            {def.rewards?.summary && (
              <div className="pt-1 text-[9px] font-mono text-amber-400/80 flex items-center gap-1">
                <Award className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="truncate">{def.rewards.summary}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const groupedMissions = (group: GroupKey): MissionRuntimeState[] => {
    // Pending briefings are shown at top of the main list, not grouped.
    return activeMissions.filter((m: MissionRuntimeState) => missionGroup(findMissionDefinition(m.definitionId)) === group);
  };

  const groupHeader = (label: string, count: number, accent: string) =>
    count > 0 ? (
      <div className={`text-[9px] font-mono font-black tracking-widest ${accent} flex items-center gap-1 pt-1`}>
        <span>{label}</span>
        <span className="opacity-60">({count})</span>
      </div>
    ) : null;

  const activeCount = activeDirectives.filter((d) => d.status === 'active').length;
  const missionActiveCount = activeMissions.length;
  const totalOps = activeCount + missionActiveCount;
  const completedCount =
    (missionState?.completedMissionIds?.length || 0) +
    (radioState?.completedDirectiveIds?.filter((id: string) => activeDirectives.some((d) => d.id === id)).length || 0);

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
            OPERATIONS
          </span>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.2 rounded font-bold">
            {totalOps > 0 ? `${totalOps} ACTIVE` : 'STANDBY'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-[#94A3B8] hover:text-white p-1 transition-colors touch-manipulation cursor-pointer"
            title={isCollapsed ? 'Expand Operations' : 'Minimize Operations'}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Body */}
      {!isCollapsed && (
        <div className="p-2.5 bg-[#07090C]/95 backdrop-blur-md border border-[#1E293B] border-t-0 space-y-2 text-xs max-h-[65vh] overflow-y-auto shadow-inner">
          {/* Awaiting first comms — no directives, no missions */}
          {activeDirectives.length === 0 &&
            activeMissions.length === 0 &&
            pendingMissions.length === 0 && (
              <div className="p-3 text-center bg-[#0a0d14]/80 border border-slate-800 rounded space-y-2">
                <Radio className="w-5 h-5 text-emerald-400 mx-auto animate-bounce" />
                <div className="text-xs font-display font-bold text-slate-200 uppercase">
                  Awaiting Initial Comms
                </div>
                <div className="text-[11px] font-mono text-slate-400 leading-relaxed">
                  Recon Lead Sgt. Vance is broadcasting on frequency 104.20 MHz. Use the{' '}
                  <strong className="text-emerald-400">Push To Talk</strong> channel to decrypt
                  incoming sitrep.
                </div>
              </div>
            )}

          {/* Pending mission briefings awaiting a response */}
          {pendingMissions.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[9px] font-mono font-black tracking-widest text-amber-400 flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" />
                <span>INCOMING BRIEFINGS ({pendingMissions.length})</span>
              </div>
              {pendingMissions.map((pm) => {
                const def = findMissionDefinition(pm.definitionId);
                if (!def) return null;
                return (
                  <div
                    key={pm.id}
                    className="p-2 rounded border border-amber-500/40 bg-[#1a140b]/70"
                  >
                    <div className="flex items-center gap-1.5">
                      <Radio className="w-3 h-3 text-amber-400 animate-pulse shrink-0" />
                      <span className="text-[9px] font-mono text-amber-400 font-bold shrink-0">
                        {def.code}
                      </span>
                      <span className="font-display font-bold text-xs uppercase text-white truncate">
                        {def.title}
                      </span>
                    </div>
                    <p className="pl-5 text-[10px] font-mono text-amber-200/70 leading-snug pt-0.5">
                      Briefing received. Open the radio console to respond.
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tutorial directives block */}
          {activeDirectives.filter((d) => d.status === 'active').length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[9px] font-mono font-black tracking-widest text-slate-400 flex items-center gap-1">
                <Shield className="w-3 h-3 text-slate-400" />
                <span>CHAPTER 0 — DIRECTIVES</span>
              </div>
              {activeDirectives
                .filter((d) => d.status === 'active')
                .map((directive) => {
                  const cfg =
                    CLASSIFICATION_COLORS[directive.classification] ||
                    CLASSIFICATION_COLORS.DIRECTIVE;
                  const hasTargetCount = directive.targetCount && directive.targetCount > 1;
                  const actionLabel = getDirectiveActionLabel(
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
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Square className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-pulse" />
                          <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold border ${cfg.badge}`}>
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
                      <div className="pl-5 text-[11px] font-mono text-emerald-300 leading-snug">
                        {directive.description}
                      </div>
                      {directive.rewardSummary && (
                        <div className="pl-5 pt-1 text-[9px] font-mono text-slate-400 flex items-center gap-1">
                          <Award className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="truncate">{directive.rewardSummary}</span>
                        </div>
                      )}
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
          )}

          {/* Mission hierarchy */}
          {activeMissions.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-[#1E293B]/70">
              {groupHeader('MAIN STORY', groupedMissions('main').length, 'text-emerald-400')}
              <div className="space-y-1.5">
                {groupedMissions('main').map((m, i) =>
                  renderMission(m, 'main', i === 0)
                )}
              </div>

              {groupHeader('EMERGENCIES', groupedMissions('emergency').length, 'text-red-400')}
              <div className="space-y-1.5">
                {groupedMissions('emergency').map((m) =>
                  renderMission(m, 'emergency', false)
                )}
              </div>

              {groupHeader('SIDE OPERATIONS', groupedMissions('side').length, 'text-sky-400')}
              <div className="space-y-1.5">
                {groupedMissions('side').map((m) =>
                  renderMission(m, 'side', false)
                )}
              </div>
            </div>
          )}

          {/* Faction relations — consequences of past responses, always visible */}
          {factionRows.length > 0 && (
            <div className="pt-2 border-t border-[#1E293B]/70 space-y-1">
              <div className="flex items-center gap-1.5 px-0.5 pb-0.5">
                <Radio className="w-3 h-3 text-[#F59E0B]" />
                <span className="text-[9px] font-mono text-slate-500 font-bold tracking-widest">
                  FACTION STANDING
                </span>
              </div>
              <div className="space-y-1">
                {factionRows.map((row) => (
                  <div
                    key={row.id}
                    className="p-1.5 bg-[#07090E]/60 border border-slate-800/60 rounded flex items-center gap-2"
                    title={row.def.blurb}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display font-bold text-[10px] tracking-wide text-slate-200 truncate">
                          {getFactionName(row.id)}
                        </span>
                        <span className={`shrink-0 text-[8px] font-mono font-bold tracking-widest px-1 py-px rounded border ${row.posture.cls}`}>
                          {row.posture.label}
                        </span>
                      </div>
                      {row.def.operator && (
                        <div className="text-[8px] font-mono text-slate-600 truncate uppercase tracking-wider">
                          {row.def.operator}
                        </div>
                      )}
                    </div>
                    <div
                      className={`shrink-0 font-mono text-[11px] font-bold ${
                        row.cut
                          ? 'text-red-400'
                          : row.standing >= WARM_STANDING
                          ? 'text-emerald-400'
                          : row.standing <= COLD_STANDING
                          ? 'text-slate-500'
                          : 'text-amber-400'
                      }`}
                    >
                      {row.standing > 0 ? `+${row.standing}` : row.standing}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed archive toggle */}
          {completedCount > 0 && (
            <div className="pt-2 border-t border-[#1E293B] space-y-1">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 hover:text-slate-200 py-0.5 px-1 cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1">
                  <CheckSquare className="w-3 h-3 text-emerald-400" />
                  <span>COMPLETED OPERATIONS ({completedCount})</span>
                </span>
                {showCompleted ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showCompleted && (
                <div className="space-y-1 pt-1">
                  {activeDirectives
                    .filter((d) => d.status === 'completed')
                    .map((directive) => (
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
                  {(missionState?.completedMissionIds || []).map((id) => {
                    const def = findMissionDefinition(id);
                    if (!def) return null;
                    return (
                      <div
                        key={id}
                        className="p-1.5 bg-[#07090E]/60 border border-slate-800/60 rounded text-[11px] opacity-75"
                      >
                        <div className="flex items-center gap-1.5">
                          <CheckSquare className="w-3 h-3 text-[#10B981] shrink-0" />
                          <span className="text-[9px] font-mono text-slate-400 font-bold">
                            {def.code}
                          </span>
                          <span className="font-display font-bold text-xs uppercase tracking-wide text-slate-400 line-through truncate">
                            {def.title}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};