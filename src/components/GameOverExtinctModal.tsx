import React from 'react';
import { RotateCcw, Skull } from 'lucide-react';

interface GameOverExtinctModalProps {
 isOpen: boolean;
 stats?: {
 totalOperationalColonies: number;
 totalDestroyedColonies: number;
 totalGlobalSurvivors: number;
 totalCaravansInTransit: number;
 isExtinct: boolean;
 };
 daysSurvived?: number;
 totalColoniesCount?: number;
 totalZombiesKilled?: number;
 onRestart?: () => void;
 onRestartGame?: () => void;
}

export const GameOverExtinctModal: React.FC<GameOverExtinctModalProps> = ({
 isOpen,
 stats,
 daysSurvived = 1,
 totalColoniesCount = 1,
 totalZombiesKilled = 0,
 onRestart,
 onRestartGame,
}) => {
 if (!isOpen) return null;

 const handleRestart = onRestart || onRestartGame || (() => window.location.reload());
 const coloniesCount = stats ? (stats.totalOperationalColonies + stats.totalDestroyedColonies) : totalColoniesCount;
 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg p-4 font-mono select-none">
 <div className="relative w-full max-w-lg bg-[#0a0a0c] border-2 border-[#b31217] clip-tactical-bracket surface-bevel p-8 space-y-6 text-center">
 <div className="w-16 h-16 bg-[#7f1d1d]/30 border-2 border-[#b31217] text-[#ef4444] flex items-center justify-center mx-auto animate-bounce">
 <Skull className="w-8 h-8" />
 </div>

 <div className="space-y-1">
 <div className="text-xs font-black text-[#ef4444] uppercase tracking-widest">
 TERMINUS: EXTINCTION EVENT
 </div>
 <h1 className="text-2xl font-black text-white uppercase tracking-wider">
 HUMANITY HAS FALLEN
 </h1>
 <p className="text-xs text-[#9ca3af] max-w-md mx-auto pt-1">
 Every colony across the globe has been overrun. The final survivor has perished in the wasteland.
 </p>
 </div>

 {/* Global Statistics */}
 <div className="grid grid-cols-3 gap-2 bg-[#121418] border border-[#242830] p-4 text-center clip-card-chip">
 <div>
 <div className="text-[10px] text-[#6b7280] uppercase font-bold">Days Survived</div>
 <div className="text-xl font-black text-white mt-0.5">{daysSurvived}</div>
 </div>
 <div>
 <div className="text-[10px] text-[#6b7280] uppercase font-bold">Colonies Founded</div>
 <div className="text-xl font-black text-[#CBD5E1] mt-0.5">{coloniesCount}</div>
 </div>
 <div>
 <div className="text-[10px] text-[#6b7280] uppercase font-bold">Threat Repelled</div>
 <div className="text-xl font-black text-[#ef4444] mt-0.5">{totalZombiesKilled}</div>
 </div>
 </div>

 <button
 id="restart-game-btn"
 onClick={handleRestart}
 className="w-full py-3 px-6 bg-[#b31217] hover:bg-[#8f0e12] border border-[#ef4444] text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors cursor-pointer"
 >
 <RotateCcw className="w-4 h-4" />
 <span>RESTART HUMANITY'S STRUGGLE</span>
 </button>
 </div>
 </div>
 );
};
