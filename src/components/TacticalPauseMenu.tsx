import React from 'react';
import {
 Play,
 Save,
 FolderOpen,
 Settings,
 BookOpen,
 RotateCcw,
 LogOut,
 X,
 Volume2,
 Shield,
 Clock,
 MapPin,
 Users,
} from 'lucide-react';
import { soundService } from '../services/soundService';
import { SettlementState } from '../types/settlement';
import { GameClockState } from '../types/combat';

interface TacticalPauseMenuProps {
 isOpen: boolean;
 onResume: () => void;
 onQuickSave?: () => void;
 onOpenSave?: () => void;
 onSaveGame?: () => void;
 onOpenLoad?: () => void;
 onLoadGame?: () => void;
 onOpenSettings?: () => void;
 onOpenCodex?: () => void;
 onOpenGlobe?: () => void;
 onRestartScenario?: () => void;
 onExitToMainMenu: () => void;
 settlement?: SettlementState;
 clock?: GameClockState;
 colonyName?: string;
 dayNumber?: number;
 season?: string;
}

export const TacticalPauseMenu: React.FC<TacticalPauseMenuProps> = ({
 isOpen,
 onResume,
 onQuickSave,
 onOpenSave,
 onSaveGame,
 onOpenLoad,
 onLoadGame,
 onOpenSettings,
 onOpenCodex,
 onOpenGlobe,
 onRestartScenario,
 onExitToMainMenu,
 settlement,
 clock,
 colonyName,
 dayNumber,
 season,
}) => {
 if (!isOpen) return null;

 const totalPop = settlement
 ? (settlement.namedSurvivors?.length || 0) +
 (typeof settlement.generalPopulation === 'number'
 ? settlement.generalPopulation
 : settlement.generalPopulation?.total || 0)
 : 12;

 const squadCount = settlement?.squads?.length || 1;
 const moraleScore = settlement?.morale?.overallScore ?? 75;
 const displayColonyName = colonyName || settlement?.name || 'Outpost Command';
 const displayDay = dayNumber ?? clock?.day ?? 1;
 const displayHour = clock?.hour ?? 12;

 const handleClick = (action?: () => void) => {
 soundService.playCombatActionSFX('assault_order');
 if (typeof action === 'function') {
 action();
 }
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
 <div className="relative w-full max-w-md bg-[#0B0F19] border-2 border-[#24334A] overflow-hidden text-[#CBD5E1] font-sans clip-tactical-bracket surface-bevel">
 {/* Header */}
 <div className="px-6 py-4 border-b border-[#1E293B] bg-[#0E1524] flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-[#1E293B] border border-[#E8E8E8]/40 text-[#E8E8E8]">
 <Shield className="w-5 h-5" />
 </div>
 <div>
 <h2 className="text-lg font-heading font-black tracking-wide text-white uppercase">
 TACTICAL SIMULATION PAUSED
 </h2>
 <p className="text-[11px] font-mono text-[#94A3B8]">
 {displayColonyName} // Day {displayDay} ({String(displayHour).padStart(2, '0')}:00)
 </p>
 </div>
 </div>

 <button
 onClick={onResume}
 className="p-1.5 text-[#64748B] hover:text-white hover:bg-[#1E293B] transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Quick Intel Summary */}
 <div className="px-6 py-3 bg-[#080C14] border-b border-[#1E293B] grid grid-cols-3 gap-2 text-center text-xs font-mono">
 <div>
 <span className="text-[#64748B] block text-[10px] uppercase">POPULATION</span>
 <span className="text-white font-bold">{totalPop} Survivors</span>
 </div>
 <div>
 <span className="text-[#64748B] block text-[10px] uppercase">SQUADS</span>
 <span className="text-[#E8E8E8] font-bold">{squadCount} Units</span>
 </div>
 <div>
 <span className="text-[#64748B] block text-[10px] uppercase">MORALE</span>
 <span className="text-emerald-400 font-bold">{moraleScore}%</span>
 </div>
 </div>

 {/* Menu Buttons List */}
 <div className="p-6 space-y-2.5">
 {/* RESUME */}
 <button
 onClick={() => handleClick(onResume)}
 className="w-full flex items-center justify-between px-4 py-3 bg-[#1E293B] hover:bg-[#475569] border border-[#E8E8E8] text-white text-sm font-heading font-black tracking-wider uppercase transition-all"
 >
 <div className="flex items-center gap-2.5">
 <Play className="w-4 h-4 fill-current text-[#93C5FD]" />
 <span>RESUME SIMULATION (ESC)</span>
 </div>
 <span className="text-[10px] font-mono text-[#93C5FD]">CONTINUE</span>
 </button>

 {/* QUICK SAVE (F5) */}
 {onQuickSave ? (
 <button
 onClick={() => handleClick(onQuickSave)}
 className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0E1524] hover:bg-[#152033] border border-[#24334A] hover:border-[#E8E8E8]/60 text-white text-xs font-heading font-bold tracking-wider uppercase transition-colors"
 >
 <div className="flex items-center gap-2.5">
 <Save className="w-4 h-4 text-[#E8E8E8]" />
 <span>QUICK SAVE</span>
 </div>
 <span className="text-[10px] font-mono text-[#64748B]">[F5]</span>
 </button>
 ) : null}

 {/* SAVE GAME */}
 <button
 onClick={() => handleClick(onOpenSave || onSaveGame)}
 className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0E1524] hover:bg-[#152033] border border-[#24334A] hover:border-[#E8E8E8]/60 text-white text-xs font-heading font-bold tracking-wider uppercase transition-colors"
 >
 <div className="flex items-center gap-2.5">
 <Save className="w-4 h-4 text-[#94A3B8]" />
 <span>SAVE EXPEDITION SLOTS</span>
 </div>
 </button>

 {/* LOAD GAME */}
 <button
 onClick={() => handleClick(onOpenLoad || onLoadGame)}
 className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0E1524] hover:bg-[#152033] border border-[#24334A] hover:border-[#E8E8E8]/60 text-white text-xs font-heading font-bold tracking-wider uppercase transition-colors"
 >
 <div className="flex items-center gap-2.5">
 <FolderOpen className="w-4 h-4 text-[#94A3B8]" />
 <span>LOAD SAVED EXPEDITION</span>
 </div>
 <span className="text-[10px] font-mono text-[#64748B]">[F9]</span>
 </button>

 {/* SURVIVAL CODEX */}
 <button
 onClick={() => handleClick(onOpenCodex)}
 className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0E1524] hover:bg-[#152033] border border-[#24334A] hover:border-[#E8E8E8]/60 text-white text-xs font-heading font-bold tracking-wider uppercase transition-colors"
 >
 <div className="flex items-center gap-2.5">
 <BookOpen className="w-4 h-4 text-[#94A3B8]" />
 <span>SURVIVAL CODEX & MANUAL</span>
 </div>
 </button>

 {/* SETTINGS */}
 <button
 onClick={() => handleClick(onOpenSettings)}
 className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0E1524] hover:bg-[#152033] border border-[#24334A] hover:border-[#E8E8E8]/60 text-white text-xs font-heading font-bold tracking-wider uppercase transition-colors"
 >
 <div className="flex items-center gap-2.5">
 <Settings className="w-4 h-4 text-[#94A3B8]" />
 <span>SETTINGS & AUDIO</span>
 </div>
 </button>

 {/* RESTART SCENARIO (optional) */}
 {onRestartScenario ? (
 <button
 onClick={() => handleClick(onRestartScenario)}
 className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0E1524] hover:bg-[#152033] border border-[#24334A] hover:border-amber-500/60 text-amber-300 text-xs font-heading font-bold tracking-wider uppercase transition-colors"
 >
 <div className="flex items-center gap-2.5">
 <RotateCcw className="w-4 h-4 text-amber-400" />
 <span>RESTART SCENARIO</span>
 </div>
 </button>
 ) : null}

 {/* EXIT TO MAIN MENU */}
 <button
 onClick={() => handleClick(onExitToMainMenu)}
 className="w-full flex items-center justify-between px-4 py-2.5 bg-[#170E14] hover:bg-[#25131E] border border-red-900/60 hover:border-red-500/80 text-red-300 text-xs font-heading font-bold tracking-wider uppercase transition-colors"
 >
 <div className="flex items-center gap-2.5">
 <LogOut className="w-4 h-4 text-red-400" />
 <span>QUIT TO MAIN MENU</span>
 </div>
 </button>
 </div>

 {/* Footer */}
 <div className="px-6 py-2.5 bg-[#080C14] border-t border-[#1E293B] text-[10px] font-mono text-[#64748B] text-center">
 Simulation paused. Press ESC to instantly resume.
 </div>
 </div>
 </div>
 );
};
