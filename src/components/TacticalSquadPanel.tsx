import React from 'react';
import {
 Car,
 Crosshair,
 Heart,
 Home,
 Navigation,
 RotateCcw,
 Shield,
 ShieldAlert,
 Skull,
 Truck,
 User,
 Users,
} from 'lucide-react';
import { TacticalSquadUnit } from '../types/combat';

interface TacticalSquadPanelProps {
 squads: TacticalSquadUnit[];
 selectedSquadId: string | null;
 onSelectSquad: (squadId: string | null) => void;
 onOrderRecall: (squadId: string) => void;
 onOpenSquadsModal: () => void;
}

export const TacticalSquadPanel: React.FC<TacticalSquadPanelProps> = ({
 squads,
 selectedSquadId,
 onSelectSquad,
 onOrderRecall,
 onOpenSquadsModal,
}) => {
 if (squads.length === 0) {
 return (
 <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
 <button
 id="muster-first-squad-btn"
 onClick={onOpenSquadsModal}
 className="px-4 py-2 bg-[#1C232E] hover:bg-[#28303D] text-[#E8E8E8] font-mono text-xs font-bold border border-[#CBD5E1]/60 backdrop-blur-md transition-all flex items-center gap-2 clip-tactical-bracket"
 >
 <Shield className="w-4 h-4" />
 Muster Tactical Squad
 </button>
 </div>
 );
 }

 const selectedSquad = squads.find((s) => s.squadId === selectedSquadId);

 return (
 <div
 id="tactical-squad-panel"
 className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 pointer-events-auto select-none max-w-4xl w-[95%]"
 >
 {/* RTS Control Hint Banner */}
 <div className="px-3 py-1 bg-slate-900/80 border border-slate-700/60 text-[10px] font-mono text-slate-300 backdrop-blur-md clip-card-chip flex items-center gap-2">
 <span className="text-[#CBD5E1] font-bold">RTS CONTROLS:</span>
 <span>Left-click squad to select</span>
 <span className="text-slate-500">•</span>
 <span className="text-emerald-400">Right-click ground to Move</span>
 <span className="text-slate-500">•</span>
 <span className="text-rose-400">Right-click enemy to Focus Fire</span>
 </div>

 {/* Squads Dock Bar */}
 <div className="bg-[#12151d]/90 border border-slate-700/80 clip-tactical-bracket surface-bevel p-2.5 backdrop-blur-md flex flex-wrap items-center justify-center gap-3 w-full">
 {squads.map((squad) => {
 const isSelected = squad.squadId === selectedSquadId;
 const hpPercent = Math.max(0, (squad.currentHp / squad.maxHp) * 100);
 const isDowned = squad.currentHp <= 0;
 const isCombat = squad.state === 'combat';
 const isHealing = squad.isInSafeZone && squad.currentHp < squad.maxHp;

 return (
 <div
 key={squad.squadId}
 id={`squad-dock-${squad.squadId}`}
 onClick={() => onSelectSquad(isSelected ? null : squad.squadId)}
 className={`p-2.5 border transition-all cursor-pointer clip-card-chip min-w-[200px] flex-1 max-w-xs ${
 isSelected
 ? 'bg-[#1c2330] border-[#CBD5E1]'
 : isCombat
 ? 'bg-rose-950/30 border-rose-500/60 animate-pulse'
 : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
 }`}
 >
 {/* Squad Header */}
 <div className="flex items-center justify-between gap-1 mb-1.5">
 <div className="flex items-center gap-1.5">
 <div
 className={`w-2 h-2 ${
 isDowned
 ? 'bg-rose-500'
 : isCombat
 ? 'bg-rose-400 animate-ping'
 : isHealing
 ? 'bg-emerald-400 animate-pulse'
 : 'bg-[#475569]'
 }`}
 />
 <span className="text-xs font-bold text-slate-100 truncate">{squad.name}</span>
 </div>

 <div className="flex items-center gap-1">
 {squad.mountedVehicleId && (
 <span
 title="Mounted in motor vehicle"
 className="text-[9px] px-1.5 py-0.2 bg-amber-950 text-amber-300 border border-amber-800 font-bold flex items-center gap-1"
 >
 <Truck className="w-2.5 h-2.5" />
 VEHICLE
 </span>
 )}
 <span
 className={`text-[9px] font-bold px-1.5 py-0.2 border uppercase tracking-tight ${
 isDowned
 ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
 : isCombat
 ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
 : isHealing
 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
 : 'bg-slate-800 text-slate-300 border-slate-700'
 }`}
 >
 {isDowned ? 'DOWNED' : isCombat ? 'ENGAGED' : isHealing ? 'HEALING' : squad.state}
 </span>
 </div>
 </div>

 {/* Leader & Escort Info */}
 <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
 <span className="flex items-center gap-1 text-slate-300 font-medium">
 <User className="w-3 h-3 text-[#CBD5E1]" />
 {squad.leaderName}
 </span>
 <span className="flex items-center gap-1 text-slate-400">
 <Users className="w-3 h-3" />
 +{squad.generalCount} Escorts
 </span>
 </div>

 {/* Health Bar */}
 <div className="space-y-1">
 <div className="flex items-center justify-between text-[10px] font-mono">
 <span className="text-slate-400 flex items-center gap-1">
 <Heart className="w-3 h-3 text-rose-400" />
 HP
 </span>
 <span className="font-bold text-slate-200">
 {Math.round(squad.currentHp)} / {squad.maxHp}
 </span>
 </div>
 <div className="w-full h-1.5 bg-slate-800 overflow-hidden">
 <div
 className={`h-full transition-all duration-300 ${
 hpPercent > 50
 ? 'bg-emerald-500'
 : hpPercent > 25
 ? 'bg-amber-500'
 : 'bg-rose-500'
 }`}
 style={{ width: `${hpPercent}%` }}
 />
 </div>
 </div>

 {/* Quick Actions if selected */}
 {isSelected && (
 <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-800/80">
 <button
 onClick={(e) => {
 e.stopPropagation();
 onOrderRecall(squad.squadId);
 }}
 title="Order squad to return to HQ Base for safety and healing"
 className="flex-1 py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold border border-slate-700 flex items-center justify-center gap-1 transition-colors"
 >
 <Home className="w-3 h-3 text-amber-400" />
 Recall to HQ Base
 </button>

 <button
 onClick={(e) => {
 e.stopPropagation();
 onOpenSquadsModal();
 }}
 title="Manage Squad members and loadout"
 className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
 >
 <Shield className="w-3 h-3 text-[#CBD5E1]" />
 </button>
 </div>
 )}
 </div>
 );
 })}

 {/* Muster New Squad Button */}
 <button
 id="open-squad-management-btn"
 onClick={onOpenSquadsModal}
 className="p-3 border border-dashed border-slate-700 hover:border-[#475569]/60 bg-slate-900/40 hover:bg-[#0F172A]/20 text-slate-400 hover:text-[#CBD5E1] text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all h-[92px] min-w-[100px]"
 >
 <Shield className="w-4 h-4 text-[#CBD5E1]" />
 <span>Squads HQ</span>
 </button>
 </div>
 </div>
 );
};
