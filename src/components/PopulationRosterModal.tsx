import React, { useState } from 'react';
import {
 Activity,
 AlertTriangle,
 ArrowDown,
 ArrowUp,
 Award,
 Briefcase,
 Crosshair,
 Eye,
 Hammer,
 HeartPulse,
 Lock,
 Package,
 RotateCcw,
 Shield,
 ShieldAlert,
 Skull,
 Stethoscope,
 Truck,
 UserCheck,
 UserPlus,
 Users,
 Utensils,
 X,
} from 'lucide-react';
import {
 ChildCitizen,
 JobSector,
 NamedSurvivor,
 StatTier,
} from '../types/population';
import { AdaptedBuilding, SettlementState } from '../types/settlement';
import { getDefaultHeadTitle } from '../services/populationService';

interface PopulationRosterModalProps {
 isOpen: boolean;
 onClose: () => void;
 settlement: SettlementState;
 onVacateSurvivorRole: (survivorId: string) => void;
 onAppointHead: (survivorId: string, buildingId: string | number, title?: string) => void;
 onUpdateJobPriority: (priorities: Record<JobSector, number>) => void;
 onOpenSquads: () => void;
 onOpenMedbay?: () => void;
}

const STAT_CONFIG: {
 key: keyof NamedSurvivor['stats'];
 label: string;
 icon: React.ElementType;
}[] = [
 { key: 'combat', label: 'Combat', icon: Crosshair },
 { key: 'scavenging', label: 'Scavenging', icon: Eye },
 { key: 'medical', label: 'Medical', icon: HeartPulse },
 { key: 'driving', label: 'Driving', icon: Truck },
 { key: 'persuasion', label: 'Persuasion', icon: Users },
 { key: 'construction', label: 'Construction', icon: Hammer },
 { key: 'production', label: 'Production', icon: Package },
];

function getTierBadge(tier: StatTier) {
 switch (tier) {
 case 'expert':
 return {
 label: 'Expert',
 bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
 dot: 'bg-amber-400',
 };
 case 'skilled':
 return {
 label: 'Skilled',
 bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
 dot: 'bg-emerald-400',
 };
 case 'novice':
 default:
 return {
 label: 'Novice',
 bg: 'bg-slate-700/50 text-slate-300 border-slate-600/40',
 dot: 'bg-slate-400',
 };
 }
}

export const PopulationRosterModal: React.FC<PopulationRosterModalProps> = ({
 isOpen,
 onClose,
 settlement,
 onVacateSurvivorRole,
 onAppointHead,
 onUpdateJobPriority,
 onOpenSquads,
 onOpenMedbay,
}) => {
 const [activeTab, setActiveTab] = useState<'named' | 'labor' | 'memorial'>('named');
 const [assigningSurvivorId, setAssigningSurvivorId] = useState<string | null>(null);

 if (!isOpen) return null;

 const {
 namedSurvivors,
 generalPopulation,
 jobPriorities,
 adaptedBuildings,
 freestandingBuildings,
 infections,
 fallenHeroes,
 } = settlement;
 const committedResourceWorkers = (settlement.resourceWorkOrders || []).reduce((sum, order) => sum + (order.workerCount || 0), 0);

 const allBuildings: AdaptedBuilding[] = [
 ...Array.from(adaptedBuildings.values()),
 ...freestandingBuildings,
 ];

 const sortedJobSectors = (Object.keys(jobPriorities) as JobSector[]).sort(
 (a, b) => jobPriorities[a] - jobPriorities[b]
 );

 const handleMovePriority = (sector: JobSector, direction: 'up' | 'down') => {
 const currentIndex = sortedJobSectors.indexOf(sector);
 const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
 if (targetIndex < 0 || targetIndex >= sortedJobSectors.length) return;
 const other = sortedJobSectors[targetIndex];
 const next: Record<JobSector, number> = { ...jobPriorities };
 next[sector] = jobPriorities[other];
 next[other] = jobPriorities[sector];
 onUpdateJobPriority(next);
 };

 const getJobSectorMeta = (sector: JobSector) => {
 switch (sector) {
 case 'construction':
 return { label: 'Construction & Adaptation', icon: Hammer, color: 'text-amber-400' };
 case 'food':
 return { label: 'Food & Agriculture', icon: Utensils, color: 'text-emerald-400' };
 case 'defense':
 return { label: 'Defensive Perimeter & Watch', icon: Shield, color: 'text-rose-400' };
 case 'production':
 return { label: 'Production & Smelting', icon: Package, color: 'text-yellow-400' };
 case 'medical':
 return { label: 'Medical & Triage', icon: HeartPulse, color: 'text-pink-400' };
 case 'other':
 return { label: 'General Facilities & Logistics', icon: Briefcase, color: 'text-purple-400' };
 }
 };

 return (
 <div
 id="population-roster-modal"
 className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
 >
 <div className="bg-[#181a1f] border border-slate-700/80 clip-tactical-bracket surface-bevel w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
 {/* Header */}
 <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#121418]">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
 <Users className="w-5 h-5" />
 </div>
 <div>
 <h2 className="text-lg font-bold text-slate-100 tracking-wide">
 POPULATION & WORKFORCE COMMAND
 </h2>
 <p className="text-xs text-slate-400">
 Two-tier population management: Named Specialists & Auto-Distributed General Labor
 </p>
 </div>
 </div>

 <button
 id="close-pop-roster-btn"
 onClick={onClose}
 className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Global Pop Overview Ribbon */}
 <div className="px-6 py-3 bg-[#15171c] border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
 <div className="p-2.5 bg-slate-800/40 border border-slate-700/40">
 <div className="text-slate-400">Total Population</div>
 <div className="text-base font-bold text-slate-100 mt-0.5">
 {namedSurvivors.length + generalPopulation.total}
 <span className="text-[11px] font-normal text-slate-400 ml-1.5">
 ({namedSurvivors.length} Named + {generalPopulation.total} General)
 </span>
 </div>
 </div>

 <div className="p-2.5 bg-emerald-950/20 border border-emerald-700/30">
 <div className="text-emerald-400">Assigned to Base Labor</div>
 <div className="text-base font-bold text-emerald-300 mt-0.5">
 {(Object.values(generalPopulation.assignedJobs) as number[]).reduce((a, b) => a + b, 0)} Workers
 </div>
 </div>

 <div className="p-2.5 bg-cyan-950/20 border border-cyan-700/30">
 <div className="text-cyan-400">Resource Crews</div>
 <div className="text-base font-bold text-cyan-300 mt-0.5">
 {committedResourceWorkers} Committed
 </div>
 </div>

 <div className="p-2.5 bg-cyan-950/20 border border-cyan-700/30">
 <div className="text-cyan-400">Resource Crews</div>
 <div className="text-base font-bold text-cyan-300 mt-0.5">{committedResourceWorkers} Committed</div>
 </div>

 <div className="p-2.5 bg-[#0F172A]/20 border border-[#334155]/30">
 <div className="text-[#CBD5E1]">Locked in Squads</div>
 <div className="text-base font-bold text-[#CBD5E1] mt-0.5">
 {generalPopulation.inSquads} General
 <span className="text-[11px] font-normal text-slate-400 ml-1.5">
 ({settlement.squads?.length || 0} Squads)
 </span>
 </div>
 </div>

 <div className="p-2.5 bg-amber-950/20 border border-amber-700/30">
 <div className="text-amber-400">Children (under 16)</div>
 <div className="text-base font-bold text-amber-300 mt-0.5">
 {(generalPopulation.children || []).filter((child) => child.age < 16).length}
 </div>
 </div>

 <div className="p-2.5 bg-amber-950/20 border border-amber-700/30">
 <div className="text-amber-400">Unassigned Labor Buffer</div>
 <div className="text-base font-bold text-amber-300 mt-0.5">
 {generalPopulation.unassigned} Free
 </div>
 </div>
 </div>

 {/* Tabs */}
 <div className="px-6 pt-3 flex items-center justify-between border-b border-slate-800 bg-[#16181e]">
 <div className="flex gap-2">
 <button
 id="tab-named-survivors"
 onClick={() => setActiveTab('named')}
 className={`px-4 py-2 text-xs font-semibold transition-colors flex items-center gap-2 border-t border-x ${
 activeTab === 'named'
 ? 'bg-[#181a1f] text-indigo-300 border-slate-700'
 : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
 }`}
 >
 <Award className="w-4 h-4 text-indigo-400" />
 Named Survivors ({namedSurvivors.length})
 </button>
 <button
 id="tab-general-labor"
 onClick={() => setActiveTab('labor')}
 className={`px-4 py-2 text-xs font-semibold transition-colors flex items-center gap-2 border-t border-x ${
 activeTab === 'labor'
 ? 'bg-[#181a1f] text-emerald-300 border-slate-700'
 : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
 }`}
 >
 <Hammer className="w-4 h-4 text-emerald-400" />
 Labor Priorities
 </button>
 <button
 id="tab-memorial-heroes"
 onClick={() => setActiveTab('memorial')}
 className={`px-4 py-2 text-xs font-semibold transition-colors flex items-center gap-2 border-t border-x ${
 activeTab === 'memorial'
 ? 'bg-[#181a1f] text-rose-300 border-slate-700'
 : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
 }`}
 >
 <Skull className="w-4 h-4 text-rose-400" />
 Memorial & Casualties ({fallenHeroes.length})
 </button>
 </div>

 {onOpenMedbay && (
 <button
 id="open-medbay-from-pop-modal"
 onClick={onOpenMedbay}
 className="mb-1.5 px-3 py-1 text-xs font-bold bg-pink-600/20 text-pink-300 hover:bg-pink-600/30 border border-pink-500/40 transition-colors flex items-center gap-1.5"
 >
 <Stethoscope className="w-3.5 h-3.5" />
 Medbay & Triage
 </button>
 )}
 </div>

 {/* Content Area */}
 <div className="flex-1 overflow-y-auto p-6 space-y-4">
 {activeTab === 'named' ? (
 <div className="space-y-4">
 <div className="flex items-center justify-between text-xs text-slate-400">
 <span>
 Seven-stat sheets evaluated as discrete proficiency tiers (Novice / Skilled / Expert).
 </span>
 <button
 id="open-squads-from-pop-btn"
 onClick={onOpenSquads}
 className="px-3 py-1.5 bg-[#334155]/20 hover:bg-[#334155]/30 text-[#CBD5E1] border border-[#475569]/30 transition-colors flex items-center gap-1.5"
 >
 <Shield className="w-3.5 h-3.5" />
 Manage Tactical Squads ({settlement.squads?.length || 0}/{settlement.squadCapacity})
 </button>
 </div>

 {namedSurvivors.map((survivor) => {
 const isHead = survivor.role.type === 'building_head';
 const isLeader = survivor.role.type === 'squad_leader';
 const inf = infections.get(survivor.id);
 const isSymptomatic = inf && (inf.stage === 'symptomatic' || inf.stage === 'advanced');
 const isIncubation = inf && inf.stage === 'incubation';
 const isQuarantined = inf && inf.isQuarantined;

 return (
 <div
 key={survivor.id}
 id={`survivor-card-${survivor.id}`}
 className={`p-4 border transition-all clip-card-chip ${
 isSymptomatic
 ? 'bg-[#25181a] border-rose-500/50'
 : isIncubation && inf.isConfirmedByMedbay
 ? 'bg-[#1e1b29] border-indigo-500/50'
 : 'bg-[#1d2027] border-slate-700/60 hover:border-slate-600'
 }`}
 >
 <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
 <div>
 <div className="flex items-center gap-2.5">
 <div className="w-8 h-8 bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center font-bold text-indigo-300 text-xs">
 {survivor.name
 .split(' ')
 .map((n) => n[0])
 .join('')
 .slice(0, 2)}
 </div>
 <div>
 <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 flex-wrap">
 {survivor.name}
 {survivor.role.type === "building_head" && (
 <span className="px-2 py-0.5 text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
 {survivor.role.title} ({survivor.role.facilityName})
 </span>
 )}
 {survivor.role.type === "squad_leader" && (
 <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#334155]/20 text-[#CBD5E1] border border-[#475569]/30">
 Squad Leader ({survivor.role.squadName})
 </span>
 )}
 {survivor.role.type === 'unassigned' && (
 <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-700/50 text-slate-300 border border-slate-600/40">
 Available
 </span>
 )}
 {isSymptomatic && (
 <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse flex items-center gap-1">
 <AlertTriangle className="w-3 h-3 text-rose-400" />
 {inf.stage === 'advanced' ? 'CRITICAL NECROSIS' : 'SYMPTOMATIC'}
 </span>
 )}
 {isIncubation && inf.isConfirmedByMedbay && (
 <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
 <Activity className="w-3 h-3 text-indigo-400" />
 INCUBATING (MEDBAY CONFIRMED)
 </span>
 )}
 {isQuarantined && (
 <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
 <Lock className="w-3 h-3 text-purple-400" />
 QUARANTINED
 </span>
 )}
 </h3>
 <p className="text-xs text-slate-400 mt-0.5">{survivor.background}</p>
 </div>
 </div>
 </div>

 {/* Action buttons */}
 <div className="flex items-center gap-2">
 {onOpenMedbay && (
 <button
 id={`medbay-triage-${survivor.id}`}
 onClick={onOpenMedbay}
 className="px-2.5 py-1.5 text-xs font-semibold bg-pink-950/40 text-pink-300 hover:bg-pink-900/60 border border-pink-700/40 transition-colors flex items-center gap-1"
 title="Open Medical Triage for diagnosis/treatment"
 >
 <Stethoscope className="w-3.5 h-3.5" />
 Triage
 </button>
 )}
 {survivor.role.type !== 'unassigned' ? (
 <button
 id={`vacate-role-${survivor.id}`}
 onClick={() => onVacateSurvivorRole(survivor.id)}
 className="px-3 py-1.5 text-xs font-semibold bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 border border-rose-700/50 transition-colors flex items-center gap-1.5"
 title="Instantly pull survivor from their current role"
 >
 <RotateCcw className="w-3.5 h-3.5" />
 Pull / Vacate Role
 </button>
 ) : (
 <button
 id={`appoint-head-${survivor.id}`}
 onClick={() =>
 setAssigningSurvivorId(
 assigningSurvivorId === survivor.id ? null : survivor.id
 )
 }
 className="px-3 py-1.5 text-xs font-semibold bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30 transition-colors flex items-center gap-1.5"
 >
 <UserPlus className="w-3.5 h-3.5" />
 Appoint as Facility Head
 </button>
 )}
 </div>
 </div>

 {/* Appoint Facility Head Dropdown */}
 {assigningSurvivorId === survivor.id && (
 <div className="mt-3 p-3 bg-slate-900/80 border border-indigo-500/40 animate-in fade-in duration-150">
 <div className="text-xs font-semibold text-slate-200 mb-2">
 Select Adapted Facility for {survivor.name}:
 </div>
 {allBuildings.length === 0 ? (
 <div className="text-xs text-slate-400">
 No adapted functional facilities exist yet. Convert buildings from the map first.
 </div>
 ) : (
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 {allBuildings.map((b) => (
 <button
 key={b.buildingId}
 onClick={() => {
 onAppointHead(survivor.id, b.buildingId, getDefaultHeadTitle(b.typeId));
 setAssigningSurvivorId(null);
 }}
 className="p-2 text-left bg-slate-800 hover:bg-indigo-950/60 border border-slate-700 hover:border-indigo-500/50 transition-colors text-xs flex items-center justify-between"
 >
 <div>
 <div className="font-semibold text-slate-200">{b.name}</div>
 <div className="text-[10px] text-slate-400">
 Role: {getDefaultHeadTitle(b.typeId)}
 </div>
 </div>
 <UserCheck className="w-4 h-4 text-indigo-400" />
 </button>
 ))}
 </div>
 )}
 </div>
 )}

 {/* 7-Stat Proficiency Grid */}
 <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
 {STAT_CONFIG.map(({ key, label, icon: Icon }) => {
 const tier = survivor.stats[key];
 const badge = getTierBadge(tier);
 return (
 <div
 key={key}
 className="p-2 bg-slate-900/40 border border-slate-800/80 flex flex-col justify-between"
 >
 <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
 <Icon className="w-3 h-3 text-slate-400" />
 <span>{label}</span>
 </div>
 <div
 className={`mt-1.5 px-2 py-0.5 text-[10px] font-bold border flex items-center gap-1.5 w-fit ${badge.bg}`}
 >
 <span className={`w-1.5 h-1.5 ${badge.dot}`} />
 {badge.label}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 );
 })}
 </div>
 ) : activeTab === 'labor' ? (
 <div className="space-y-4">
 <div className="p-4 bg-[#1d2027] border border-slate-700/60 text-xs text-slate-300">
 <div className="font-bold text-slate-100 mb-1 flex items-center gap-2">
 <Hammer className="w-4 h-4 text-emerald-400" />
 Automated Labor Distribution Principle
 </div>
 <p className="text-slate-400 leading-relaxed">
 Citizens are not individually micromanaged. General population workers automatically fill open facility demands
 and active construction sites based on your priority order below. Squad members are strictly quarantined from base labor.
 </p>
 </div>

 <div className="space-y-2">
 {sortedJobSectors.map((sector, index) => {
 const meta = getJobSectorMeta(sector);
 const Icon = meta.icon;
 const assigned = generalPopulation.assignedJobs[sector] || 0;
 const priorityNum = index + 1;

 return (
 <div
 key={sector}
 id={`job-sector-${sector}`}
 className="p-3.5 bg-[#1c1f26] border border-slate-700/60 flex items-center justify-between gap-3 hover:border-slate-600 transition-colors"
 >
 <div className="flex items-center gap-3">
 <div className="w-6 h-6 bg-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center border border-slate-700">
 #{priorityNum}
 </div>
 <div className={`p-2 bg-slate-800/80 border border-slate-700/60 ${meta.color}`}>
 <Icon className="w-4 h-4" />
 </div>
 <div>
 <div className="text-sm font-semibold text-slate-100">{meta.label}</div>
 <div className="text-xs text-slate-400">
 Currently Assigned:{' '}
 <span className="font-bold text-slate-200">{assigned} Workers</span>
 </div>
 </div>
 </div>

 {/* Up / Down Priority controls */}
 <div className="flex items-center gap-1.5">
 <button
 id={`priority-up-${sector}`}
 onClick={() => handleMovePriority(sector, 'up')}
 disabled={index === 0}
 className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-300 border border-slate-700 transition-colors"
 title="Increase Priority (Fills Earlier)"
 >
 <ArrowUp className="w-4 h-4" />
 </button>
 <button
 id={`priority-down-${sector}`}
 onClick={() => handleMovePriority(sector, 'down')}
 disabled={index === sortedJobSectors.length - 1}
 className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-300 border border-slate-700 transition-colors"
 title="Decrease Priority"
 >
 <ArrowDown className="w-4 h-4" />
 </button>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 ) : (
 <div className="space-y-4">
 <div className="p-4 bg-[#1d2027] border border-rose-900/40 text-xs text-slate-300">
 <div className="font-bold text-rose-300 mb-1 flex items-center gap-2">
 <Skull className="w-4 h-4 text-rose-400" />
 Permanent Casualty Registry & Memorial Wall
 </div>
 <p className="text-slate-400 leading-relaxed">
 Survivor death from combat, field infection turning, isolation euthanization, or settlement outbreaks is strictly permanent. Their deeds and sacrifice are honored here.
 </p>
 </div>

 {fallenHeroes.length === 0 ? (
 <div className="p-8 text-center bg-[#181a1f] border border-dashed border-slate-800 text-slate-500 text-xs">
 <Shield className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" />
 <div className="font-bold text-slate-300">NO CASUALTIES RECORDED</div>
 <p className="text-slate-400 mt-1">All colonists and tactical operatives remain alive and accounted for.</p>
 </div>
 ) : (
 <div className="space-y-3">
 {fallenHeroes.map((hero) => {
 const isTurned = hero.causeOfDeath === 'infection_turned';
 const isEuthanized = hero.causeOfDeath === 'euthanized_quarantine';
 const isCombat = hero.causeOfDeath === 'combat_slain';

 return (
 <div
 key={hero.id}
 id={`fallen-hero-${hero.id}`}
 className="p-4 bg-[#1c1a20] border border-rose-950/60 clip-card-chip flex flex-col sm:flex-row sm:items-center justify-between gap-3"
 >
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 bg-rose-950/50 border border-rose-800/60 flex items-center justify-center font-bold text-rose-300 text-xs">
 <Skull className="w-4 h-4 text-rose-400" />
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h4 className="text-sm font-bold text-slate-100">{hero.name}</h4>
 <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800/50 uppercase">
 {isTurned
 ? 'Turned to Infected'
 : isEuthanized
 ? 'Neutralized in Quarantine'
 : isCombat
 ? 'Killed in Action'
 : 'Outbreak Casualty'}
 </span>
 </div>
 <div className="text-xs text-slate-400 mt-0.5">
 {hero.roleDescription} • Fallen Day {hero.diedAtInGameDay} in {hero.locationName}
 </div>
 <p className="text-[11px] text-slate-400 italic mt-1">{hero.details}</p>
 </div>
 </div>

 <div className="text-right text-[10px] text-slate-500 font-mono">
 {new Date(hero.diedAtTimestamp).toLocaleTimeString()}
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 </div>
 );
};
