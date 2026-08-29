import React from 'react';
import {
 AlertTriangle,
 ArrowRight,
 Globe,
 RefreshCw,
 RotateCcw,
 ShieldAlert,
 Skull,
 Truck,
 Users,
} from 'lucide-react';
import { SettlementRecord } from '../types/caravan';

interface ColonyOverrunModalProps {
 isOpen?: boolean;
 overrunSettlement?: SettlementRecord;
 destroyedSettlement?: SettlementRecord;
 survivingSettlements?: SettlementRecord[];
 operationalSettlements?: SettlementRecord[];
 onSwitchSettlement?: (settlementId: string) => void;
 onSwitchToSettlement?: (settlementId: string) => void;
 onOpenGlobe: () => void;
 onOpenCaravans?: () => void;
 onDispatchRelief?: (originId: string) => void;
 onClose?: () => void;
}

export const ColonyOverrunModal: React.FC<ColonyOverrunModalProps> = ({
 isOpen = true,
 overrunSettlement,
 destroyedSettlement,
 survivingSettlements,
 operationalSettlements,
 onSwitchSettlement,
 onSwitchToSettlement,
 onOpenGlobe,
 onOpenCaravans,
 onDispatchRelief,
 onClose,
}) => {
 const colony = destroyedSettlement || overrunSettlement;
 if (!isOpen || !colony) return null;

 const validSurviving = operationalSettlements || survivingSettlements || [];
 const firstSurvivorColony = validSurviving[0];
 const handleSwitch = onSwitchToSettlement || onSwitchSettlement || (() => {});
 const handleClose = onClose || (() => {});

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-mono select-none">
 <div className="relative w-full max-w-xl bg-[#0e1013] border-2 border-[#ef4444] clip-tactical-bracket surface-bevel p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
 {/* Top Hazard Alert */}
 <div className="flex items-center gap-3 border-b border-[#3b1215] pb-4">
 <div className="p-3 bg-[#7f1d1d]/40 border border-[#ef4444] text-[#ef4444] animate-pulse">
 <Skull className="w-8 h-8" />
 </div>
 <div>
 <div className="flex items-center gap-2">
 <span className="text-xs font-black text-[#ef4444] uppercase tracking-widest">
 CRITICAL EMERGENCY: SECTOR LOST
 </span>
 <span className="bg-[#b31217] text-white text-[9px] font-bold px-1.5 py-0.2 uppercase">
 §7.5
 </span>
 </div>
 <h2 className="text-xl font-black text-white uppercase tracking-wider">
 {colony.name} HAS FALLEN
 </h2>
 </div>
 </div>

 {/* Casualty & Destruction Description */}
 <div className="space-y-3 text-xs leading-relaxed text-[#d1d5db]">
 <p>
 The perimeter has been breached and the colony defenses overrun by the infected horde.
 All defenders and civilian workers at this sector have fallen.
 </p>

 <div className="bg-[#191315] border border-[#4a1c22] p-3 space-y-1.5 text-[11px] clip-card-chip">
 <div className="flex justify-between text-[#9ca3af]">
 <span>Sector Location:</span>
 <span className="text-white font-bold">{colony.placement.sectorName}</span>
 </div>
 <div className="flex justify-between text-[#9ca3af]">
 <span>Status:</span>
 <span className="text-[#ef4444] font-bold uppercase">DESTROYED / DERELICT</span>
 </div>
 <div className="flex justify-between text-[#9ca3af]">
 <span>Surviving Colonies on Earth:</span>
 <span className="text-[#4ade80] font-bold">{validSurviving.length} Operational</span>
 </div>
 </div>

 <div className="bg-[#141b24] border border-[#25384e] p-3 text-[11px] text-[#93c5fd] space-y-1 clip-card-chip">
 <div className="font-bold flex items-center gap-1 text-white">
 <Truck className="w-3.5 h-3.5 text-[#CBD5E1]" />
 <span>COLONY RECOVERY PROTOCOL (§7.5):</span>
 </div>
 <p>
 Settlement loss is a serious setback, but <strong>NOT</strong> a game over. You can repopulate and rebuild this destroyed colony by dispatching a relief trade caravan with survivors, materials, and food from one of your operational colonies!
 </p>
 </div>
 </div>

 {/* Action Buttons */}
 <div className="space-y-2 pt-2 border-t border-[#292e38]">
 {firstSurvivorColony && (
 <button
 onClick={() => handleSwitch(firstSurvivorColony.id)}
 className="w-full py-2.5 px-4 bg-[#b31217] hover:bg-[#8f0e12] border border-[#ef4444] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
 >
 <span>SWITCH COMMAND TO {firstSurvivorColony.name.toUpperCase()}</span>
 <ArrowRight className="w-4 h-4" />
 </button>
 )}

 <div className="grid grid-cols-2 gap-2">
 <button
 onClick={onOpenGlobe}
 className="py-2 px-3 bg-[#171b22] hover:bg-[#252b36] border border-[#313a49] text-white text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
 >
 <Globe className="w-3.5 h-3.5 text-[#CBD5E1]" />
 <span>Open Orbital Globe</span>
 </button>
 <button
 onClick={handleClose}
 className="py-2 px-3 bg-[#171b22] hover:bg-[#252b36] border border-[#313a49] text-[#9ca3af] hover:text-white text-xs font-bold uppercase transition-colors cursor-pointer"
 >
 <span>Inspect Ruins</span>
 </button>
 </div>
 </div>
 </div>
 </div>
 );
};
