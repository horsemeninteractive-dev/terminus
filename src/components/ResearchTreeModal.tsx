import React, { useMemo, useState } from 'react';
import {
 AlertTriangle,
 Award,
 BookOpen,
 Building2,
 CheckCircle2,
 ChevronRight,
 Clock,
 Droplets,
 Eye,
 Flame,
 Globe2,
 Hammer,
 HeartPulse,
 Info,
 Layers,
 Lock,
 MinusCircle,
 PlusCircle,
 Radio,
 RefreshCw,
 Search,
 Shield,
 ShieldAlert,
 Sparkles,
 Sprout,
 Sun,
 Truck,
 Users,
 Wrench,
 X,
 Zap,
} from 'lucide-react';
import {
 BranchInfo,
 RESEARCH_BRANCHES,
 RESEARCH_TREE_NODES,
} from '../data/researchTreeData';
import {
 calculateResearchGenerationRate,
 canUnlockResearchNode,
 grantDebugResearchPoints,
 isResearchUnlocked,
 unlockResearchNode,
} from '../services/researchService';
import { ResearchBranch, ResearchNode } from '../types/research';
import { SettlementState } from '../types/settlement';
import { soundService } from '../services/soundService';

interface ResearchTreeModalProps {
 settlement: SettlementState;
 onUpdateSettlement: (updated: SettlementState) => void;
 onClose: () => void;
 onOpenBuildingDrawer?: () => void;
}

// Icon mapper helper
function renderNodeIcon(iconName: string, className = 'w-5 h-5') {
 switch (iconName) {
 case 'Droplets':
 return <Droplets className={className} />;
 case 'Sprout':
 return <Sprout className={className} />;
 case 'Building':
 case 'Building2':
 return <Building2 className={className} />;
 case 'Sun':
 return <Sun className={className} />;
 case 'Shield':
 return <Shield className={className} />;
 case 'ShieldAlert':
 return <ShieldAlert className={className} />;
 case 'Zap':
 return <Zap className={className} />;
 case 'HeartPulse':
 return <HeartPulse className={className} />;
 case 'Eye':
 return <Eye className={className} />;
 case 'Users':
 return <Users className={className} />;
 case 'Sparkles':
 return <Sparkles className={className} />;
 case 'Hammer':
 return <Hammer className={className} />;
 case 'Flame':
 return <Flame className={className} />;
 case 'Wrench':
 return <Wrench className={className} />;
 case 'Truck':
 return <Truck className={className} />;
 case 'Radio':
 return <Radio className={className} />;
 case 'Globe2':
 return <Globe2 className={className} />;
 case 'Award':
 return <Award className={className} />;
 default:
 return <BookOpen className={className} />;
 }
}

export const ResearchTreeModal: React.FC<ResearchTreeModalProps> = ({
 settlement,
 onUpdateSettlement,
 onClose,
 onOpenBuildingDrawer,
}) => {
 const [activeBranchId, setActiveBranchId] = useState<ResearchBranch | 'overview'>('survival');
 const [selectedNodeId, setSelectedNodeId] = useState<string | null>('survival_water_purification');
 const [filterQuery, setFilterQuery] = useState('');
 const [toastNotification, setToastNotification] = useState<{
 title: string;
 desc: string;
 type: 'success' | 'warn' | 'info';
 } | null>(null);

 const researchState = settlement.research || {
 researchPoints: 0,
 totalAccumulatedRP: 0,
 passiveRatePerSec: 1.0,
 unlockedNodes: [],
 activeResearchId: null,
 activeProgressSec: 0,
 };

 const unlockedNodes = researchState.unlockedNodes || [];
 const currentRP = Math.floor(researchState.researchPoints || 0);

 // Rate Breakdown
 const rateBreakdown = useMemo(() => {
 return calculateResearchGenerationRate(settlement);
 }, [settlement]);

 // Selected Node data
 const selectedNode = selectedNodeId ? RESEARCH_TREE_NODES[selectedNodeId] : null;

 // Check if selected node can be unlocked
 const unlockStatus = useMemo(() => {
 if (!selectedNodeId) return { allowed: false, reason: 'No node selected' };
 return canUnlockResearchNode(settlement, selectedNodeId);
 }, [settlement, selectedNodeId]);

 const handleUnlockNode = (nodeId: string) => {
 try {
 const { updatedSettlement, node } = unlockResearchNode(settlement, nodeId);
 soundService.playTechUnlock();
 onUpdateSettlement(updatedSettlement);
 setToastNotification({
 title: `RESEARCH UNLOCKED: ${node.name}`,
 desc: `${node.tagline} is now active colony-wide.`,
 type: 'success',
 });
 setTimeout(() => setToastNotification(null), 4000);
 } catch (err: any) {
 soundService.playToastSound('warn');
 setToastNotification({
 title: 'RESEARCH BLOCKED',
 desc: err.message || 'Cannot unlock research node at this time.',
 type: 'warn',
 });
 setTimeout(() => setToastNotification(null), 4000);
 }
 };

 const handleGrantDebugRP = (amount: number) => {
 const updated = grantDebugResearchPoints(settlement, amount);
 onUpdateSettlement(updated);
 setToastNotification({
 title: amount > 0 ? `+${amount} RP ADDED` : 'RP RESET',
 desc: `Current available Research Points: ${Math.floor(updated.research.researchPoints)} RP`,
 type: 'info',
 });
 setTimeout(() => setToastNotification(null), 3000);
 };

 const allNodesList = useMemo(() => Object.values(RESEARCH_TREE_NODES), []);

 const totalUnlockedCount = unlockedNodes.length;
 const totalNodesCount = allNodesList.length;
 const progressPercent = Math.round((totalUnlockedCount / totalNodesCount) * 100);

 // Filtered nodes for search
 const filteredNodes = useMemo(() => {
 if (!filterQuery.trim()) return null;
 const q = filterQuery.toLowerCase();
 return allNodesList.filter(
 (n) =>
 n.name.toLowerCase().includes(q) ||
 n.tagline.toLowerCase().includes(q) ||
 n.description.toLowerCase().includes(q) ||
 n.categoryTag.toLowerCase().includes(q) ||
 n.branch.toLowerCase().includes(q)
 );
 }, [filterQuery, allNodesList]);

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 sm:p-6 overflow-hidden">
 <div className="relative w-full max-w-7xl h-[92vh] max-h-[850px] bg-slate-900 border border-slate-700/80 clip-tactical-bracket surface-bevel flex flex-col overflow-hidden text-slate-100 font-sans">
 {/* Toast Alert Banner */}
 {toastNotification && (
 <div
 className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 border clip-card-chip flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
 toastNotification.type === 'success'
 ? 'bg-emerald-950/95 border-emerald-500/80 text-emerald-100'
 : toastNotification.type === 'warn'
 ? 'bg-amber-950/95 border-amber-500/80 text-amber-100'
 : 'bg-indigo-950/95 border-indigo-500/80 text-indigo-100'
 }`}
 >
 {toastNotification.type === 'success' ? (
 <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
 ) : toastNotification.type === 'warn' ? (
 <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
 ) : (
 <Info className="w-5 h-5 text-indigo-400 shrink-0" />
 )}
 <div>
 <div className="font-bold text-sm tracking-wide">{toastNotification.title}</div>
 <div className="text-xs text-slate-300">{toastNotification.desc}</div>
 </div>
 <button
 onClick={() => setToastNotification(null)}
 className="ml-2 text-slate-400 hover:text-white p-1"
 >
 <X className="w-4 h-4" />
 </button>
 </div>
 )}

 {/* 1. Header Bar */}
 <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
 <BookOpen className="w-6 h-6" />
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h2 className="text-lg font-bold tracking-tight text-white uppercase">
 Colony Technology Tree
 </h2>
 <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
 §10 Unified Tech System
 </span>
 </div>
 <p className="text-xs text-slate-400">
 Unlock technological advancements across 6 scientific disciplines to enhance defense, medicine, and survival.
 </p>
 </div>
 </div>

 {/* Research Resource Counters & Debug Buttons */}
 <div className="flex items-center gap-4">
 <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-700/80 px-3.5 py-1.5 clip-card-chip">
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 bg-cyan-400 animate-pulse" />
 <span className="text-xs text-slate-400 font-medium">Available RP:</span>
 <span className="text-base font-bold text-cyan-300 font-mono">
 {currentRP} <span className="text-xs font-normal text-cyan-500">RP</span>
 </span>
 </div>
 <div className="h-4 w-px bg-slate-700" />
 <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
 <Zap className="w-3.5 h-3.5" />
 <span>+{rateBreakdown.totalRatePerSec.toFixed(1)} RP/s</span>
 </div>
 </div>

 {/* Quick Debug RP Grant */}
 <div className="hidden lg:flex items-center gap-1.5 bg-slate-950 px-2 py-1 border border-slate-800 text-xs">
 <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider px-1">
 RP Dev:
 </span>
 <button
 onClick={() => handleGrantDebugRP(100)}
 className="px-2 py-0.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 font-mono text-[11px] transition-colors"
 title="Grant 100 RP for testing"
 >
 +100
 </button>
 <button
 onClick={() => handleGrantDebugRP(500)}
 className="px-2 py-0.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 font-mono text-[11px] transition-colors"
 title="Grant 500 RP for testing"
 >
 +500
 </button>
 </div>

 <button
 onClick={onClose}
 className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>
 </div>

 {/* 2. Main Content Body */}
 <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
 {/* Left Column: Branch Navigator & Stats */}
 <div className="w-full md:w-64 bg-slate-950/60 border-r border-slate-800 flex flex-col shrink-0">
 {/* Search Input */}
 <div className="p-3 border-b border-slate-800/80">
 <div className="relative">
 <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
 <input
 type="text"
 value={filterQuery}
 onChange={(e) => setFilterQuery(e.target.value)}
 placeholder="Search technologies..."
 className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
 />
 {filterQuery && (
 <button
 onClick={() => setFilterQuery('')}
 className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs"
 >
 ×
 </button>
 )}
 </div>
 </div>

 {/* Branch List */}
 <div className="flex-1 p-2 space-y-1 overflow-y-auto custom-scrollbar">
 <button
 onClick={() => {
 setActiveBranchId('overview');
 setFilterQuery('');
 }}
 className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-all ${
 activeBranchId === 'overview'
 ? 'bg-indigo-600/20 border border-indigo-500/50 text-indigo-200'
 : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200 border border-transparent'
 }`}
 >
 <div className="flex items-center gap-2.5">
 <Layers className="w-4 h-4 text-indigo-400" />
 <span className="text-xs font-bold uppercase tracking-wide">Colony Tech Matrix</span>
 </div>
 <span className="text-[11px] font-mono font-semibold px-2 py-0.5 bg-slate-800 text-slate-300">
 {totalUnlockedCount}/{totalNodesCount}
 </span>
 </button>

 <div className="pt-2 pb-1 px-3">
 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
 Six Scientific Branches
 </span>
 </div>

 {RESEARCH_BRANCHES.map((branch) => {
 const branchNodes = allNodesList.filter((n) => n.branch === branch.id);
 const branchUnlocked = branchNodes.filter((n) => unlockedNodes.includes(n.id)).length;
 const isSelected = activeBranchId === branch.id;

 return (
 <button
 key={branch.id}
 onClick={() => {
 setActiveBranchId(branch.id);
 setFilterQuery('');
 // Select first node in branch if current is not in branch
 const firstInBranch = branchNodes[0];
 if (firstInBranch && (!selectedNode || selectedNode.branch !== branch.id)) {
 setSelectedNodeId(firstInBranch.id);
 }
 }}
 className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-all ${
 isSelected
 ? 'bg-slate-800/90 border border-slate-700 text-white'
 : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 border border-transparent'
 }`}
 >
 <div className="flex items-center gap-2.5 min-w-0">
 <div
 className="w-6 h-6 flex items-center justify-center shrink-0"
 style={{
 backgroundColor: `${branch.accentColor}20`,
 color: branch.accentColor,
 border: `1px solid ${branch.accentColor}40`,
 }}
 >
 {renderNodeIcon(branch.iconName, 'w-3.5 h-3.5')}
 </div>
 <div className="truncate">
 <div className="text-xs font-semibold truncate">{branch.name}</div>
 <div className="text-[10px] text-slate-500 truncate">{branch.tagline}</div>
 </div>
 </div>
 <span
 className={`text-[10px] font-mono font-bold px-1.5 py-0.5 shrink-0 ${
 branchUnlocked === branchNodes.length
 ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/50'
 : branchUnlocked > 0
 ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/50'
 : 'bg-slate-900 text-slate-500'
 }`}
 >
 {branchUnlocked}/{branchNodes.length}
 </span>
 </button>
 );
 })}
 </div>

 {/* RP Generation Source Box */}
 <div className="p-3 border-t border-slate-800 bg-slate-950/90">
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
 <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
 RP Ingestion
 </span>
 <span className="text-xs font-mono font-bold text-cyan-400">
 +{rateBreakdown.totalRatePerSec.toFixed(1)}/s
 </span>
 </div>
 <div className="space-y-1 text-[10px] text-slate-400">
 {rateBreakdown.details.map((d, i) => (
 <div key={i} className="truncate text-slate-300 flex items-center gap-1">
 <span className="text-slate-600">•</span>
 <span className="truncate">{d}</span>
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* Center Column: Node Graph or Matrix View */}
 <div className="flex-1 flex flex-col bg-slate-900/50 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
 {/* Active Branch Header */}
 {activeBranchId !== 'overview' && !filterQuery && (
 <div className="mb-6 p-4 bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
 {(() => {
 const br = RESEARCH_BRANCHES.find((b) => b.id === activeBranchId)!;
 const nodes = allNodesList.filter((n) => n.branch === br.id);
 const unlocked = nodes.filter((n) => unlockedNodes.includes(n.id)).length;
 return (
 <>
 <div className="flex items-center gap-3">
 <div
 className="w-10 h-10 flex items-center justify-center"
 style={{
 backgroundColor: `${br.accentColor}25`,
 color: br.accentColor,
 border: `1px solid ${br.accentColor}60`,
 }}
 >
 {renderNodeIcon(br.iconName, 'w-5 h-5')}
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h3 className="text-base font-bold text-white">{br.name}</h3>
 <span className="text-[11px] font-mono text-slate-400">
 Tier 1 → Tier 4 Progression
 </span>
 </div>
 <p className="text-xs text-slate-400 max-w-xl">{br.description}</p>
 </div>
 </div>
 <div className="text-right">
 <div className="text-xs text-slate-400 font-medium">Branch Completion</div>
 <div className="text-sm font-bold font-mono text-white">
 {unlocked} / {nodes.length} Nodes ({Math.round((unlocked / nodes.length) * 100)}%)
 </div>
 </div>
 </>
 );
 })()}
 </div>
 )}

 {/* If Search Query Active */}
 {filterQuery && (
 <div className="mb-4">
 <div className="text-xs text-slate-400 mb-3">
 Search results for <span className="font-bold text-white">"{filterQuery}"</span> (
 {filteredNodes?.length || 0} found)
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {filteredNodes?.map((node) => {
 const isUnlocked = unlockedNodes.includes(node.id);
 const isSelected = selectedNodeId === node.id;
 const canUnlock = canUnlockResearchNode(settlement, node.id).allowed;
 return (
 <div
 key={node.id}
 onClick={() => setSelectedNodeId(node.id)}
 className={`p-3.5 border cursor-pointer transition-all ${
 isSelected
 ? 'bg-indigo-950/60 border-indigo-500'
 : isUnlocked
 ? 'bg-emerald-950/30 border-emerald-800/40 hover:bg-emerald-950/50'
 : canUnlock
 ? 'bg-slate-900 border-cyan-500/50 hover:bg-slate-800'
 : 'bg-slate-950/60 border-slate-800 hover:bg-slate-900/60'
 }`}
 >
 <div className="flex items-start justify-between gap-2 mb-1.5">
 <div className="flex items-center gap-2">
 <div
 className={`p-1.5 text-xs font-bold ${
 isUnlocked
 ? 'bg-emerald-500/20 text-emerald-400'
 : canUnlock
 ? 'bg-cyan-500/20 text-cyan-400'
 : 'bg-slate-800 text-slate-400'
 }`}
 >
 {renderNodeIcon(node.iconName, 'w-4 h-4')}
 </div>
 <div>
 <div className="text-xs font-bold text-white">{node.name}</div>
 <div className="text-[10px] text-slate-400">{node.categoryTag}</div>
 </div>
 </div>
 <span
 className={`text-[10px] font-mono font-bold px-2 py-0.5 ${
 isUnlocked
 ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/60'
 : canUnlock
 ? 'bg-cyan-950 text-cyan-400 border border-cyan-700/60'
 : 'bg-slate-800 text-slate-400'
 }`}
 >
 {isUnlocked ? 'RESEARCHED' : `${node.costRP} RP`}
 </span>
 </div>
 <p className="text-[11px] text-slate-300 line-clamp-2">{node.tagline}</p>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Tree Branch Tiers Layout */}
 {activeBranchId !== 'overview' && !filterQuery && (
 <div className="space-y-6">
 {[1, 2, 3, 4].map((tierNum) => {
 const branchNodes = allNodesList.filter(
 (n) => n.branch === activeBranchId && n.tier === tierNum
 );
 if (branchNodes.length === 0) return null;

 return (
 <div key={tierNum} className="relative">
 <div className="flex items-center gap-2 mb-3">
 <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-[10px] font-mono font-bold text-slate-300 uppercase">
 Tier 0{tierNum}
 </span>
 <div className="h-px flex-1 bg-slate-800" />
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
 {branchNodes.map((node) => {
 const isUnlocked = unlockedNodes.includes(node.id);
 const isSelected = selectedNodeId === node.id;
 const check = canUnlockResearchNode(settlement, node.id);
 const canUnlock = check.allowed;

 // Prerequisites status
 const missingPrereqs = node.prerequisites.filter(
 (p) => !unlockedNodes.includes(p)
 );

 return (
 <div
 key={node.id}
 onClick={() => setSelectedNodeId(node.id)}
 className={`relative p-4 border cursor-pointer transition-all ${
 isSelected
 ? 'bg-indigo-950/80 border-indigo-400 ring-2 ring-indigo-500/30'
 : isUnlocked
 ? 'bg-emerald-950/20 border-emerald-600/50 hover:bg-emerald-950/40'
 : canUnlock
 ? 'bg-slate-900/90 border-cyan-500/60 hover:bg-slate-850 hover:border-cyan-400'
 : 'bg-slate-950/50 border-slate-800/80 opacity-75 hover:opacity-100 hover:bg-slate-900/40'
 }`}
 >
 <div className="flex items-start justify-between gap-3 mb-2">
 <div className="flex items-center gap-2.5">
 <div
 className={`w-8 h-8 flex items-center justify-center ${
 isUnlocked
 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
 : canUnlock
 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse'
 : 'bg-slate-800 text-slate-500 border border-slate-700'
 }`}
 >
 {isUnlocked ? (
 <CheckCircle2 className="w-4 h-4 text-emerald-400" />
 ) : canUnlock ? (
 renderNodeIcon(node.iconName, 'w-4 h-4')
 ) : (
 <Lock className="w-4 h-4" />
 )}
 </div>
 <div>
 <h4 className="text-xs font-bold text-white tracking-wide">
 {node.name}
 </h4>
 <div className="text-[10px] text-slate-400 font-medium">
 {node.categoryTag}
 </div>
 </div>
 </div>

 <span
 className={`text-[10px] font-mono font-bold px-2 py-0.5 shrink-0 ${
 isUnlocked
 ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/60'
 : canUnlock
 ? 'bg-cyan-950 text-cyan-300 border border-cyan-600/80'
 : 'bg-slate-850 text-slate-400 border border-slate-700'
 }`}
 >
 {isUnlocked ? 'RESEARCHED' : `${node.costRP} RP`}
 </span>
 </div>

 <p className="text-[11px] text-slate-300 mb-3 leading-relaxed">
 {node.tagline}
 </p>

 {/* Effects Pills */}
 <div className="flex flex-wrap gap-1.5 mb-2">
 {node.effects.slice(0, 2).map((eff, i) => (
 <span
 key={i}
 className="px-2 py-0.5 bg-slate-950/80 border border-slate-800 text-[10px] text-slate-300 font-mono"
 >
 <span className="text-cyan-400 font-bold">{eff.value}</span> {eff.stat}
 </span>
 ))}
 </div>

 {/* Prerequisites Warning if Locked */}
 {!isUnlocked && missingPrereqs.length > 0 && (
 <div className="text-[10px] text-amber-400/90 flex items-center gap-1 font-medium mt-1">
 <Lock className="w-3 h-3" />
 <span>
 Requires: {missingPrereqs.map((p) => RESEARCH_TREE_NODES[p]?.name || p).join(', ')}
 </span>
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
 })}
 </div>
 )}

 {/* Colony Overview Matrix Tab */}
 {activeBranchId === 'overview' && !filterQuery && (
 <div className="space-y-6">
 <div className="p-5 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-950 border border-indigo-900/50 flex flex-wrap items-center justify-between gap-6">
 <div>
 <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
 <Globe2 className="w-5 h-5 text-indigo-400" />
 Civilization Resurgence Matrix
 </h3>
 <p className="text-xs text-slate-300 max-w-xl">
 Rebuilding human knowledge across all 6 core survival pillars. Unlocking nodes provides passive boosts, new building construction blue-prints, and direct gameplay enhancements.
 </p>
 </div>
 <div className="flex items-center gap-4 bg-slate-950/80 px-4 py-3 border border-slate-800">
 <div>
 <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
 Colony Progress
 </div>
 <div className="text-lg font-bold font-mono text-cyan-300">
 {progressPercent}% Complete
 </div>
 </div>
 <div className="w-16 bg-slate-800 h-2.5 overflow-hidden">
 <div
 className="bg-cyan-500 h-full transition-all duration-500"
 style={{ width: `${progressPercent}%` }}
 />
 </div>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {RESEARCH_BRANCHES.map((br) => {
 const nodes = allNodesList.filter((n) => n.branch === br.id);
 const unlocked = nodes.filter((n) => unlockedNodes.includes(n.id)).length;
 const isComplete = unlocked === nodes.length;

 return (
 <div
 key={br.id}
 onClick={() => {
 setActiveBranchId(br.id);
 const firstNode = nodes[0];
 if (firstNode) setSelectedNodeId(firstNode.id);
 }}
 className="p-4 bg-slate-950/70 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 cursor-pointer transition-all flex flex-col justify-between"
 >
 <div>
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center gap-2">
 <div
 className="w-7 h-7 flex items-center justify-center"
 style={{
 backgroundColor: `${br.accentColor}25`,
 color: br.accentColor,
 }}
 >
 {renderNodeIcon(br.iconName, 'w-4 h-4')}
 </div>
 <span className="text-xs font-bold text-white">{br.name}</span>
 </div>
 <span
 className={`text-[10px] font-mono font-bold px-2 py-0.5 ${
 isComplete
 ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/60'
 : unlocked > 0
 ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/60'
 : 'bg-slate-900 text-slate-500'
 }`}
 >
 {unlocked}/{nodes.length}
 </span>
 </div>
 <p className="text-[11px] text-slate-400 mb-3 line-clamp-2">{br.tagline}</p>
 </div>

 <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
 {nodes.map((n) => {
 const isNodeUnlocked = unlockedNodes.includes(n.id);
 return (
 <div
 key={n.id}
 className="flex items-center justify-between text-[10px]"
 >
 <span
 className={
 isNodeUnlocked
 ? 'text-emerald-300 font-medium'
 : 'text-slate-500'
 }
 >
 {n.name}
 </span>
 {isNodeUnlocked ? (
 <CheckCircle2 className="w-3 h-3 text-emerald-400" />
 ) : (
 <span className="font-mono text-slate-600">{n.costRP} RP</span>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}
 </div>

 {/* Right Column: Node Details & Unlock Action */}
 <div className="w-full md:w-80 bg-slate-950/90 border-t md:border-t-0 md:border-l border-slate-800 p-5 flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
 {selectedNode ? (
 <div className="flex-1 flex flex-col justify-between space-y-4">
 <div>
 <div className="flex items-center justify-between gap-2 mb-2">
 <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-mono font-bold uppercase tracking-wider">
 Tier 0{selectedNode.tier} • {selectedNode.categoryTag}
 </span>
 <span
 className={`text-[10px] font-mono font-bold px-2 py-0.5 ${
 unlockedNodes.includes(selectedNode.id)
 ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/60'
 : unlockStatus.allowed
 ? 'bg-cyan-950 text-cyan-300 border border-cyan-600/80'
 : 'bg-slate-800 text-slate-400'
 }`}
 >
 {unlockedNodes.includes(selectedNode.id) ? 'RESEARCHED' : `${selectedNode.costRP} RP`}
 </span>
 </div>

 <div className="flex items-center gap-3 mb-3">
 <div className="w-10 h-10 bg-slate-900 border border-slate-700 flex items-center justify-center text-cyan-400">
 {renderNodeIcon(selectedNode.iconName, 'w-5 h-5')}
 </div>
 <div>
 <h3 className="text-sm font-bold text-white">{selectedNode.name}</h3>
 <div className="text-[11px] text-slate-400">{selectedNode.tagline}</div>
 </div>
 </div>

 <div className="p-3 bg-slate-900/80 border border-slate-800 text-xs text-slate-300 leading-relaxed mb-4">
 {selectedNode.description}
 </div>

 {/* Effects Breakdown */}
 <div className="space-y-2 mb-4">
 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
 Research Modifiers & Effects
 </span>
 <div className="space-y-1.5">
 {selectedNode.effects.map((eff, i) => (
 <div
 key={i}
 className="p-2.5 bg-slate-900 border border-slate-800 text-xs"
 >
 <div className="flex items-center justify-between font-medium mb-0.5">
 <span className="text-slate-200">{eff.stat}</span>
 <span className="text-cyan-400 font-mono font-bold">{eff.value}</span>
 </div>
 <div className="text-[10px] text-slate-400">{eff.description}</div>
 </div>
 ))}
 </div>
 </div>

 {/* Unlocked Building notice */}
 {selectedNode.unlockedBuildingTypeId && (
 <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 mb-4 flex items-center gap-3">
 <Building2 className="w-5 h-5 text-indigo-400 shrink-0" />
 <div>
 <div className="text-xs font-bold text-indigo-200">
 Unlocks Construction Blueprints
 </div>
 <div className="text-[10px] text-slate-300">
 Can be built via Adaptation or Freestanding construction.
 </div>
 </div>
 </div>
 )}

 {/* Prerequisites Requirement */}
 {selectedNode.prerequisites && selectedNode.prerequisites.length > 0 && (
 <div className="space-y-1 mb-4">
 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
 Prerequisites
 </span>
 <div className="space-y-1">
 {selectedNode.prerequisites.map((pId) => {
 const prereq = RESEARCH_TREE_NODES[pId];
 const isMet = unlockedNodes.includes(pId);
 return (
 <div
 key={pId}
 className={`px-2.5 py-1 border text-xs flex items-center justify-between ${
 isMet
 ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
 : 'bg-slate-900 border-slate-800 text-slate-400'
 }`}
 >
 <span>{prereq ? prereq.name : pId}</span>
 {isMet ? (
 <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
 ) : (
 <Lock className="w-3.5 h-3.5 text-slate-500" />
 )}
 </div>
 );
 })}
 </div>
 </div>
 )}
 </div>

 {/* Unlock Action Button */}
 <div className="pt-3 border-t border-slate-800 space-y-2">
 {unlockedNodes.includes(selectedNode.id) ? (
 <div className="w-full py-3 bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2">
 <CheckCircle2 className="w-4 h-4 text-emerald-400" />
 Technology Researched & Active
 </div>
 ) : (
 <>
 <button
 onClick={() => handleUnlockNode(selectedNode.id)}
 disabled={!unlockStatus.allowed}
 className={`w-full py-3 px-4 font-bold text-xs flex items-center justify-center gap-2 transition-all ${
 unlockStatus.allowed
 ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white cursor-pointer'
 : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
 }`}
 >
 <Zap className="w-4 h-4" />
 Unlock Technology ({selectedNode.costRP} RP)
 </button>

 {!unlockStatus.allowed && (
 <p className="text-[10px] text-amber-400/90 text-center font-medium">
 {unlockStatus.reason}
 </p>
 )}
 </>
 )}
 </div>
 </div>
 ) : (
 <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-slate-500">
 <BookOpen className="w-8 h-8 mb-2 opacity-40" />
 <p className="text-xs">Select any node on the left to view technical details, prerequisites, and unlock modifiers.</p>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 );
};
