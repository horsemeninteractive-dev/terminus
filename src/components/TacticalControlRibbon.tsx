import React from 'react';
import { MousePointer, Crosshair, Radio, Shield } from 'lucide-react';
import { soundEngine } from '../services/soundService';

interface TacticalControlRibbonProps {
 onPushToTalk?: () => void;
}

export const TacticalControlRibbon: React.FC<TacticalControlRibbonProps> = ({ onPushToTalk }) => {
 const handleRadioClick = () => {
 soundEngine.playRadioChirp();
 if (onPushToTalk) onPushToTalk();
 };

 return (
 <div
 id="tactical-control-ribbon"
 className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center bg-black/75 backdrop-blur-md border border-[#1E293B] text-[#94A3B8] text-[10px] font-mono px-3 py-1.5 gap-3.5 select-none pointer-events-auto hidden md:flex clip-card-chip"
 >
 {/* Select */}
 <div className="flex items-center gap-1.5">
 <div className="w-3.5 h-4 border border-[#475569] flex items-start justify-start p-0.5">
 <div className="w-1 h-1.5 bg-[#E8E8E8]" />
 </div>
 <span className="text-[#E2E8F0] font-medium">Select</span>
 </div>

 {/* Attack / Move */}
 <div className="flex items-center gap-1.5">
 <div className="w-3.5 h-4 border border-[#475569] flex items-start justify-end p-0.5">
 <div className="w-1 h-1.5 bg-[#10B981]" />
 </div>
 <span className="text-[#E2E8F0] font-medium">Attack/Move</span>
 </div>

 {/* CTRL + Select Multiple */}
 <div className="flex items-center gap-1">
 <span className="px-1 py-0.5 bg-[#1E293B] text-[#E8E8E8] font-bold text-[9px]">CTRL</span>
 <span>+</span>
 <div className="w-3.5 h-4 border border-[#475569] flex items-start justify-start p-0.5">
 <div className="w-1 h-1.5 bg-[#E8E8E8]" />
 </div>
 <span className="text-slate-300">Select Multiple</span>
 </div>

 {/* CTRL + Area Select */}
 <div className="flex items-center gap-1">
 <span className="px-1 py-0.5 bg-[#1E293B] text-[#E8E8E8] font-bold text-[9px]">CTRL</span>
 <span>+</span>
 <div className="w-3 h-3 border border-dashed border-[#E8E8E8]" />
 <span className="text-slate-300">Area Select</span>
 </div>

 {/* SHIFT + Queue Order */}
 <div className="flex items-center gap-1">
 <span className="px-1 py-0.5 bg-[#1E293B] text-[#10B981] font-bold text-[9px]">SHIFT</span>
 <span>+</span>
 <div className="w-3.5 h-4 border border-[#475569] flex items-start justify-end p-0.5">
 <div className="w-1 h-1.5 bg-[#10B981]" />
 </div>
 <span className="text-slate-300">Queue Order</span>
 </div>

 {/* SHIFT + Area Scavenge */}
 <div className="flex items-center gap-1">
 <span className="px-1 py-0.5 bg-[#1E293B] text-[#10B981] font-bold text-[9px]">SHIFT</span>
 <span>+</span>
 <Crosshair className="w-3 h-3 text-[#E8E8E8]" />
 <span className="text-slate-300">Area Scavenge</span>
 </div>

 {/* SHIFT + Patrol */}
 <div className="flex items-center gap-1">
 <span className="px-1 py-0.5 bg-[#1E293B] text-[#10B981] font-bold text-[9px]">SHIFT</span>
 <span>+</span>
 <Shield className="w-3 h-3 text-[#F59E0B]" />
 <span className="text-slate-300">Patrol</span>
 </div>

 {/* Diegetic Push to Talk / Radio Transceiver button */}
 <button
 onClick={handleRadioClick}
 className="flex items-center gap-1.5 px-2.5 py-0.5 bg-[#064E3B]/80 hover:bg-[#065F46] border border-[#10B981]/60 text-[#10B981] hover:text-white transition-all active:scale-95 group ml-1"
 title="Broadcast Tactical Radio Squelch"
 >
 <span className="text-[9px] font-bold tracking-wider">PUSH TO TALK</span>
 <Radio className="w-3 h-3 text-[#10B981] group-hover:animate-pulse" />
 </button>
 </div>
 );
};
