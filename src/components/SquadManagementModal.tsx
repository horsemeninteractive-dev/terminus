import React, { useState } from 'react';
import {
 Crosshair,
 Eye,
 Minus,
 Plus,
 Shield,
 Trash2,
 Truck,
 UserCheck,
 Users,
 X,
} from 'lucide-react';
import { NamedSurvivor, Squad, StatTier } from '../types/population';
import { SettlementState } from '../types/settlement';

interface SquadManagementModalProps {
 isOpen: boolean;
 onClose: () => void;
 settlement: SettlementState;
 onCreateSquad: (name: string, leaderId: string, generalCount: number) => void;
 onModifyGeneralMembers?: (squadId: string, newCount: number) => void;
 onModifyGeneralCount?: (squadId: string, newCount: number) => void;
 onDisbandSquad: (squadId: string) => void;
}

function getTierBadge(tier: StatTier) {
 switch (tier) {
 case 'expert':
 return 'text-amber-300 font-bold';
 case 'skilled':
 return 'text-emerald-300 font-semibold';
 case 'novice':
 default:
 return 'text-slate-400';
 }
}

export const SquadManagementModal: React.FC<SquadManagementModalProps> = ({
 isOpen,
 onClose,
 settlement,
 onCreateSquad,
 onModifyGeneralMembers,
 onModifyGeneralCount,
 onDisbandSquad,
}) => {
 const handleModifyCount = onModifyGeneralMembers || onModifyGeneralCount || (() => {});
 const [isFormingNew, setIsFormingNew] = useState(false);
 const [newSquadName, setNewSquadName] = useState('');
 const [selectedLeaderId, setSelectedLeaderId] = useState('');
 const [newGeneralCount, setNewGeneralCount] = useState(1);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);

 if (!isOpen) return null;

 const { namedSurvivors, squads, squadCapacity, generalPopulation } = settlement;

 const freeGeneralWorkers = Math.max(
 0,
 generalPopulation.total - generalPopulation.inSquads
 );

 // Available leaders: named survivors who are not already leading another squad
 const availableLeaders = namedSurvivors.filter((s) => s.role.type !== 'squad_leader');

 const handleOpenForm = () => {
 setIsFormingNew(true);
 setErrorMessage(null);
 if (availableLeaders.length > 0) {
 setSelectedLeaderId(availableLeaders[0].id);
 }
 setNewGeneralCount(Math.min(1, freeGeneralWorkers));
 };

 const handleCreateSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 setErrorMessage(null);

 const leaderIdToUse =
 selectedLeaderId || (availableLeaders.length > 0 ? availableLeaders[0].id : '');

 if (!leaderIdToUse) {
 setErrorMessage('Please select a Named Squad Leader.');
 return;
 }

 const validGeneralCount = Math.min(Math.max(0, newGeneralCount), freeGeneralWorkers);

 onCreateSquad(
 newSquadName.trim() || `Tactical Squad ${squads.length + 1}`,
 leaderIdToUse,
 validGeneralCount
 );

 setIsFormingNew(false);
 setNewSquadName('');
 setSelectedLeaderId('');
 setNewGeneralCount(1);
 };

 return (
 <div
 id="squad-management-modal"
 className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
 >
 <div className="bg-[#181a1f] border border-slate-700/80 clip-tactical-bracket surface-bevel w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
 {/* Header */}
 <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#121418]">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-[#334155]/10 border border-[#475569]/30 text-[#CBD5E1]">
 <Shield className="w-5 h-5" />
 </div>
 <div>
 <h2 className="text-lg font-bold text-slate-100 tracking-wide">
 TACTICAL SQUADS COMMAND (§4.3)
 </h2>
 <p className="text-xs text-slate-400">
 Squad composition: Exactly 1 Named Leader + up to 3 General Population members (Cap: 4)
 </p>
 </div>
 </div>

 <button
 id="close-squads-modal-btn"
 onClick={onClose}
 className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Squad Capacity Ribbon */}
 <div className="px-6 py-3 bg-[#15171c] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
 <div className="flex items-center gap-4">
 <div className="flex items-center gap-2">
 <span className="text-slate-400">Active Squad Capacity:</span>
 <span
 className={`font-bold px-2 py-0.5 ${
 squads.length >= squadCapacity
 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
 : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
 }`}
 >
 {squads.length} / {squadCapacity} Squads
 </span>
 </div>

 <div className="flex items-center gap-2">
 <span className="text-slate-400">Free General Population:</span>
 <span className="font-bold text-slate-200">{freeGeneralWorkers} Available</span>
 </div>
 </div>

 {!isFormingNew && (
 <button
 id="form-new-squad-btn"
 disabled={squads.length >= squadCapacity || availableLeaders.length === 0}
 onClick={handleOpenForm}
 className="px-3.5 py-1.5 bg-[#1C232E] hover:bg-[#28303D] disabled:opacity-40 disabled:pointer-events-none text-[#E8E8E8] font-semibold transition-all flex items-center gap-2 text-xs border border-[#CBD5E1]/50"
 >
 <Plus className="w-4 h-4" />
 Form New Squad
 </button>
 )}
 </div>

 {/* Modal Body */}
 <div className="flex-1 overflow-y-auto p-6 space-y-4">
 {/* Form New Squad Panel */}
 {isFormingNew && (
 <form
 onSubmit={handleCreateSubmit}
 className="p-5 bg-[#1c202a] border border-[#CBD5E1]/50 clip-card-chip space-y-4 animate-in fade-in duration-200"
 >
 <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
 <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
 <Shield className="w-4 h-4 text-[#CBD5E1]" />
 Muster New Tactical Expedition Squad
 </h3>
 <button
 type="button"
 onClick={() => setIsFormingNew(false)}
 className="text-xs text-slate-400 hover:text-slate-200"
 >
 Cancel
 </button>
 </div>

 {errorMessage && (
 <div className="p-2.5 bg-rose-950/40 border border-rose-600/50 text-rose-300 text-xs">
 {errorMessage}
 </div>
 )}

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label className="block text-xs font-semibold text-slate-300 mb-1">
 Squad Designation / Name
 </label>
 <input
 id="new-squad-name"
 name="squadName"
 type="text"
 value={newSquadName}
 onChange={(e) => setNewSquadName(e.target.value)}
 placeholder={`e.g. Strike Team ${squads.length + 1}`}
 className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-[#475569]"
 />
 </div>

 <div>
 <label className="block text-xs font-semibold text-slate-300 mb-1">
 Select Named Squad Leader (Required)
 </label>
 <select
 value={selectedLeaderId}
 onChange={(e) => setSelectedLeaderId(e.target.value)}
 className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-[#475569]"
 >
 <option value="" disabled>
 -- Choose a Named Survivor --
 </option>
 {availableLeaders.map((s) => (
 <option key={s.id} value={s.id}>
 {s.name} (Combat: {s.stats.combat}, Scavenge: {s.stats.scavenging})
 </option>
 ))}
 </select>
 </div>
 </div>

 {/* General Members Selector */}
 <div className="p-3 bg-slate-900/60 border border-slate-800 flex items-center justify-between">
 <div>
 <div className="text-xs font-semibold text-slate-200">
 General Population Recruits (0 to 3)
 </div>
 <div className="text-[11px] text-slate-400">
 Pulls non-combatant citizens into this squad. They will not work base jobs while deployed.
 </div>
 </div>

 <div className="flex items-center gap-3">
 <button
 type="button"
 onClick={() => setNewGeneralCount(Math.max(0, newGeneralCount - 1))}
 disabled={newGeneralCount <= 0}
 className="p-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 border border-slate-700"
 >
 <Minus className="w-3.5 h-3.5" />
 </button>
 <span className="text-sm font-bold text-slate-100 w-6 text-center">
 {newGeneralCount}
 </span>
 <button
 type="button"
 onClick={() =>
 setNewGeneralCount(Math.min(3, Math.min(freeGeneralWorkers, newGeneralCount + 1)))
 }
 disabled={newGeneralCount >= 3 || newGeneralCount >= freeGeneralWorkers}
 className="p-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 border border-slate-700"
 >
 <Plus className="w-3.5 h-3.5" />
 </button>
 </div>
 </div>

 <div className="flex justify-end gap-2 pt-2">
 <button
 type="button"
 onClick={() => setIsFormingNew(false)}
 className="px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 transition-colors"
 >
 Cancel
 </button>
 <button
 type="submit"
 className="px-4 py-2 text-xs bg-[#334155] hover:bg-[#334155] font-semibold text-white transition-colors flex items-center gap-2"
 >
 <UserCheck className="w-4 h-4" />
 Confirm & Muster Squad
 </button>
 </div>
 </form>
 )}

 {/* Active Squads List */}
 {squads.length === 0 && !isFormingNew ? (
 <div className="text-center py-12 px-4 border border-dashed border-slate-800 bg-slate-900/20">
 <Shield className="w-10 h-10 text-slate-600 mx-auto mb-3" />
 <h3 className="text-sm font-bold text-slate-300">No Active Tactical Squads</h3>
 <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
 Form a squad with a named leader and up to 3 general citizens to scout sectors, investigate smoke plumes, and discover survivor groups.
 </p>
 </div>
 ) : (
 <div className="space-y-4">
 {squads.map((squad) => {
 const leader = namedSurvivors.find((s) => s.id === squad.leaderId);
 const totalSquadSize = 1 + squad.generalCount;
 const isDeployed = squad.status !== 'idle';

 return (
 <div
 key={squad.id}
 id={`squad-card-${squad.id}`}
 className="p-4 bg-[#1d2027] border border-slate-700/60 clip-card-chip space-y-3"
 >
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-[#334155]/20 text-[#CBD5E1] border border-[#475569]/40 font-bold text-xs">
 SQ-{squad.id.slice(-4)}
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h3 className="text-sm font-bold text-slate-100">{squad.name}</h3>            <span
             className={`px-2 py-0.5 text-[10px] font-semibold border ${
              isDeployed
               ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
               : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
             }`}
            >
             {isDeployed ? 'Deployed / In Field' : 'Standby / Base Defense'}
            </span>
 </div>
 <div className="text-xs text-slate-400">
 Total Strength: <span className="font-bold text-slate-200">{totalSquadSize} / 4</span> (1 Leader + {squad.generalCount} General)
 </div>
 </div>
 </div>            {/* Disband Action */}
            <div className="flex items-center gap-2">
             <button
 id={`disband-squad-${squad.id}`}
 onClick={() => onDisbandSquad(squad.id)}
 className="px-3 py-1.5 text-xs font-semibold bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 border border-rose-700/50 transition-colors flex items-center gap-1.5"
 title="Disband squad and return members to base labor"
 >
 <Trash2 className="w-3.5 h-3.5" />
 Disband
 </button>
 </div>
 </div>

 {/* Squad Members Details */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
 {/* Leader Card */}
 <div className="p-2.5 bg-slate-900/60 border border-slate-800">
 <div className="text-[11px] text-slate-400 font-semibold mb-1">
 Squad Leader:
 </div>
 {leader ? (
 <div>
 <div className="font-bold text-slate-200">{leader.name}</div>
 <div className="flex gap-3 text-[11px] mt-1">
 <span className="flex items-center gap-1">
 <Crosshair className="w-3 h-3 text-slate-400" />
 Combat: <span className={getTierBadge(leader.stats.combat)}>{leader.stats.combat}</span>
 </span>
 <span className="flex items-center gap-1">
 <Eye className="w-3 h-3 text-slate-400" />
 Scav: <span className={getTierBadge(leader.stats.scavenging)}>{leader.stats.scavenging}</span>
 </span>
 <span className="flex items-center gap-1">
 <Truck className="w-3 h-3 text-slate-400" />
 Drive: <span className={getTierBadge(leader.stats.driving)}>{leader.stats.driving}</span>
 </span>
 </div>
 </div>
 ) : (
 <div className="text-rose-400">Leader Missing</div>
 )}
 </div>

 {/* General Members Controls */}
 <div className="p-2.5 bg-slate-900/60 border border-slate-800 flex items-center justify-between">
 <div>
 <div className="text-[11px] text-slate-400 font-semibold">
 General Citizen Escorts:
 </div>
 <div className="text-slate-200 font-semibold mt-0.5">
 {squad.generalCount} Assigned
 </div>
 </div>             {!isDeployed && (
              <div className="flex items-center gap-2">
               <button
                onClick={() =>
                 handleModifyCount(squad.id, Math.max(0, squad.generalCount - 1))
                }
 disabled={squad.generalCount <= 0}
 className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 border border-slate-700"
 >
 <Minus className="w-3 h-3" />
 </button>
 <span className="font-bold text-slate-200 text-xs px-1">
 {squad.generalCount}
 </span>
 <button
 onClick={() =>
 handleModifyCount(
 squad.id,
 Math.min(3, squad.generalCount + 1)
 )
 }
 disabled={squad.generalCount >= 3 || freeGeneralWorkers <= 0}
 className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 border border-slate-700"
 >
 <Plus className="w-3 h-3" />
 </button>
 </div>
 )}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 </div>
 </div>
 );
};
