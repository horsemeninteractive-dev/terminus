import React from 'react';
import {
 Award,
 CheckCircle2,
 ChevronRight,
 Flame,
 Globe,
 Heart,
 Package,
 Shield,
 ShieldAlert,
 Sparkles,
 Sun,
 Trophy,
 Users,
 Zap,
} from 'lucide-react';
import { soundService } from '../services/soundService';

interface OnboardingCelebrationModalProps {
 isOpen: boolean;
 onClaimReward: () => void;
 dayNumber: number;
 colonyName: string;
 populationCount: number;
}

export const OnboardingCelebrationModal: React.FC<OnboardingCelebrationModalProps> = ({
 isOpen,
 onClaimReward,
 dayNumber,
 colonyName,
 populationCount,
}) => {
 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none font-mono">
 <div className="w-full max-w-lg bg-[#0A0C0E] border-2 border-[#F59E0B] p-6 text-[#E8E8E8] clip-tactical-bracket surface-bevel relative overflow-hidden">
 {/* Background ambient glow effect */}
 <div className="absolute top-0 right-0 w-48 h-48 bg-[#F59E0B]/10 blur-3xl pointer-events-none" />

 {/* Header Badge */}
 <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#252C36]">
 <div className="flex items-center gap-2">
 <span className="w-3 h-3 bg-[#F59E0B] inline-block animate-pulse" />
 <span className="text-xs font-bold uppercase tracking-widest text-[#F59E0B]">
 TACTICAL PROTOCOL // SEQUENCE COMPLETE
 </span>
 </div>
 <div className="flex items-center gap-1 text-[10px] text-[#10B981] font-bold px-2 py-0.5 bg-[#064E3B]/40 border border-[#059669]">
 <CheckCircle2 className="w-3 h-3" />
 <span>ALL OBJECTIVES VERIFIED</span>
 </div>
 </div>

 {/* Main Title Banner */}
 <div className="text-center my-4 space-y-1">
 <div className="inline-flex p-3 bg-[#1C1808] border border-[#F59E0B]/40 mb-2">
 <Sun className="w-8 h-8 text-[#F59E0B] animate-spin" style={{ animationDuration: '20s' }} />
 </div>
 <h2 className="text-2xl font-black text-white tracking-wide uppercase font-heading">
 FIRST NIGHT SURVIVED
 </h2>
 <p className="text-xs text-[#9CA3AF]">
 Dawn breaks over <span className="text-[#CBD5E1] font-bold">{colonyName}</span> on Day {dayNumber}.
 The nightfall horde incursion was repelled and the colony foundation holds firm.
 </p>
 </div>

 {/* Tactical Milestone Recap Grid */}
 <div className="my-5 grid grid-cols-2 gap-2 text-left">
 <div className="p-2.5 bg-[#101317] border border-[#1F2937] clip-card-chip">
 <div className="flex items-center gap-1.5 text-[10px] text-[#6B7280] uppercase">
 <Globe className="w-3 h-3 text-[#CBD5E1]" />
 <span>1. Globe Recon</span>
 </div>
 <div className="text-xs font-bold text-white mt-1">Sector Established</div>
 </div>

 <div className="p-2.5 bg-[#101317] border border-[#1F2937] clip-card-chip">
 <div className="flex items-center gap-1.5 text-[10px] text-[#6B7280] uppercase">
 <Shield className="w-3 h-3 text-[#F59E0B]" />
 <span>2. Command HQ</span>
 </div>
 <div className="text-xs font-bold text-white mt-1">Base Secured</div>
 </div>

 <div className="p-2.5 bg-[#101317] border border-[#1F2937] clip-card-chip">
 <div className="flex items-center gap-1.5 text-[10px] text-[#6B7280] uppercase">
 <Users className="w-3 h-3 text-[#10B981]" />
 <span>3. Tactical Militia</span>
 </div>
 <div className="text-xs font-bold text-white mt-1">Squad Operational</div>
 </div>

 <div className="p-2.5 bg-[#101317] border border-[#1F2937] clip-card-chip">
 <div className="flex items-center gap-1.5 text-[10px] text-[#6B7280] uppercase">
 <Sun className="w-3 h-3 text-[#A855F7]" />
 <span>4 & 5. Scavenge & Dawn</span>
 </div>
 <div className="text-xs font-bold text-white mt-1">Nightfall Repelled</div>
 </div>
 </div>

 {/* Dawn Reward Package */}
 <div className="p-3 bg-[#171408] border border-[#78350F] text-[11px] space-y-2 mb-5 clip-card-chip">
 <div className="flex items-center justify-between text-[#FCD34D] font-bold text-[10px] uppercase">
 <span className="flex items-center gap-1.5">
 <Trophy className="w-3.5 h-3.5 text-[#F59E0B]" />
 <span>FIRST DAWN COMMENDATION REWARD</span>
 </span>
 <span className="text-[#34D399]">+VITAL SUPPLIES</span>
 </div>

 <div className="grid grid-cols-4 gap-1.5 text-center pt-1 font-mono">
 <div className="bg-[#0A0C0E] p-1.5 border border-[#332A15] clip-card-chip">
 <div className="text-[9px] text-[#9CA3AF]">Morale</div>
 <div className="text-xs font-bold text-[#10B981]">+15 Boost</div>
 </div>
 <div className="bg-[#0A0C0E] p-1.5 border border-[#332A15] clip-card-chip">
 <div className="text-[9px] text-[#9CA3AF]">Rations</div>
 <div className="text-xs font-bold text-[#CBD5E1]">+50 Food</div>
 </div>
 <div className="bg-[#0A0C0E] p-1.5 border border-[#332A15] clip-card-chip">
 <div className="text-[9px] text-[#9CA3AF]">Materials</div>
 <div className="text-xs font-bold text-[#F59E0B]">+50 Scrap</div>
 </div>
 <div className="bg-[#0A0C0E] p-1.5 border border-[#332A15] clip-card-chip">
 <div className="text-[9px] text-[#9CA3AF]">Ammunition</div>
 <div className="text-xs font-bold text-[#EF4444]">+40 Ammo</div>
 </div>
 </div>
 </div>

 {/* Claim Reward & Dismiss Button */}
 <button
 onClick={() => {
 soundService.playRecruitmentResolved();
 onClaimReward();
 }}
 className="w-full py-3 bg-[#F59E0B] hover:bg-[#D97706] text-black font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 border border-[#FCD34D] cursor-pointer transition-all"
 >
 <span>CLAIM FIRST DAWN REWARD & ENTER AUTONOMOUS COMMAND</span>
 <ChevronRight className="w-4 h-4" />
 </button>
 </div>
 </div>
 );
};
