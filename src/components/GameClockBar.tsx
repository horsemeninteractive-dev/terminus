import React from 'react';
import {
 AlertTriangle,
 Moon,
 Pause,
 Play,
 Radio,
 Sun,
 Sunrise,
 Sunset,
 Volume2,
} from 'lucide-react';
import { GameClockState, NoiseEvent } from '../types/combat';

interface GameClockBarProps {
 clock: GameClockState;
 activeNoiseEvents?: NoiseEvent[];
 zombieCount: number;
 onSetSpeed: (speed: 0 | 1 | 2 | 4) => void;
}

export const GameClockBar: React.FC<GameClockBarProps> = ({
 clock,
 activeNoiseEvents = [],
 zombieCount,
 onSetSpeed,
}) => {
 const { day, hour, minute, speed, phase, isNight } = clock;

 // Format 12-hour AM/PM
 const hourInt = Math.floor(hour);
 const period = hourInt >= 12 ? 'PM' : 'AM';
 const displayHour = hourInt % 12 === 0 ? 12 : hourInt % 12;
 const displayMinute = minute < 10 ? `0${minute}` : minute;
 const timeString = `${displayHour}:${displayMinute} ${period}`;

 // Time progress through 24-hour cycle (0% at 00:00, 100% at 24:00)
 const dayProgressPercent = (hour / 24) * 100;

 // Most recent loud noise
 const loudestNoise = activeNoiseEvents.length > 0 ? activeNoiseEvents[activeNoiseEvents.length - 1] : null;

 return (
 <div
 id="game-clock-bar"
 className="fixed top-14 left-4 z-40 flex flex-col gap-1.5 pointer-events-auto select-none"
 >
 {/* Main Clock Card */}
 <div
 className={`px-3.5 py-2 backdrop-blur-md border clip-tactical-bracket surface-bevel transition-all duration-300 flex items-center gap-4 ${
 isNight
 ? 'bg-[#0e111a]/90 border-rose-500/50'
 : phase === 'dusk' || phase === 'dawn'
 ? 'bg-[#18151b]/90 border-amber-500/40'
 : 'bg-[#131720]/90 border-slate-700/70'
 }`}
 >
 {/* Day & Phase Indicator */}
 <div className="flex items-center gap-2.5 pr-3 border-r border-slate-700/60">
 <div
 className={`p-2 border ${
 isNight
 ? 'bg-rose-950/40 border-rose-500/50 text-rose-400 animate-pulse'
 : phase === 'dawn'
 ? 'bg-amber-950/40 border-amber-500/50 text-amber-400'
 : phase === 'dusk'
 ? 'bg-orange-950/40 border-orange-500/50 text-orange-400'
 : 'bg-yellow-950/30 border-yellow-500/40 text-yellow-300'
 }`}
 >
 {isNight ? (
 <Moon className="w-4 h-4" />
 ) : phase === 'dawn' ? (
 <Sunrise className="w-4 h-4" />
 ) : phase === 'dusk' ? (
 <Sunset className="w-4 h-4" />
 ) : (
 <Sun className="w-4 h-4" />
 )}
 </div>

 <div>
 <div className="flex items-center gap-1.5">
 <span className="text-xs font-black tracking-wider text-slate-100 uppercase">
 DAY {day}
 </span>
 <span
 className={`text-[9px] font-bold px-1.5 py-0.2 border uppercase tracking-tight ${
 isNight
 ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
 : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
 }`}
 >
 {phase}
 </span>
 </div>
 <div className="font-mono text-sm font-black text-slate-200 tracking-tight mt-0.5">
 {timeString}
 </div>
 </div>
 </div>

 {/* Speed Controls (§5 Real-Time with Pause) */}
 <div className="flex items-center gap-1">
 <button
 id="speed-pause-btn"
 onClick={() => onSetSpeed(0)}
 title="Pause Simulation (Space)"
 className={`p-1.5 border text-xs font-mono font-bold transition-all ${
 speed === 0
 ? 'bg-amber-500 text-black border-amber-400'
 : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
 }`}
 >
 <Pause className="w-3.5 h-3.5" />
 </button>

 <button
 id="speed-1x-btn"
 onClick={() => onSetSpeed(1)}
 title="1x Normal Speed"
 className={`px-2 py-1.5 border text-xs font-mono font-bold transition-all ${
 speed === 1
 ? 'bg-slate-200 text-black border-slate-400'
 : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
 }`}
 >
 1x
 </button>

 <button
 id="speed-2x-btn"
 onClick={() => onSetSpeed(2)}
 title="2x Fast Speed"
 className={`px-2 py-1.5 border text-xs font-mono font-bold transition-all ${
 speed === 2
 ? 'bg-slate-200 text-black border-slate-400'
 : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
 }`}
 >
 2x
 </button>

 <button
 id="speed-4x-btn"
 onClick={() => onSetSpeed(4)}
 title="4x Super Fast"
 className={`px-2 py-1.5 border text-xs font-mono font-bold transition-all ${
 speed === 4
 ? 'bg-slate-200 text-black border-slate-400'
 : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
 }`}
 >
 4x
 </button>
 </div>

 {/* Threat Level & Infected Count */}
 <div className="pl-3 border-l border-slate-700/60 flex items-center gap-3 text-xs">
 <div>
 <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
 Infected in Sector
 </div>
 <div
 className={`font-mono font-bold ${
 zombieCount > 10
 ? 'text-rose-400 animate-pulse'
 : zombieCount > 0
 ? 'text-amber-400'
 : 'text-emerald-400'
 }`}
 >
 {zombieCount} Hostiles
 </div>
 </div>
 </div>
 </div>

 {/* 24-Hour Cycle Slider Bar with Night Zone Marker */}
 <div className="w-full bg-[#131720]/80 border border-slate-800 p-1.5 backdrop-blur-sm">
 <div className="flex items-center justify-between text-[9px] text-slate-400 px-1 mb-1 font-mono">
 <span>06:00 (DAWN)</span>
 <span className="text-yellow-400/80">12:00 (NOON)</span>
 <span className="text-rose-400 font-bold">21:00 (NIGHTFALL)</span>
 </div>
 <div className="relative w-full h-1.5 bg-slate-800 overflow-hidden">
 {/* Night hours visual overlay (21:00 to 05:00) */}
 <div
 className="absolute top-0 bottom-0 bg-rose-950/60 border-l border-rose-500/40"
 style={{ left: `${(21 / 24) * 100}%`, right: 0 }}
 />
 <div
 className="absolute top-0 bottom-0 bg-rose-950/60 border-r border-rose-500/40"
 style={{ left: 0, width: `${(5 / 24) * 100}%` }}
 />

 {/* Current Time Cursor */}
 <div
 className={`absolute top-0 bottom-0 transition-all duration-300 ${
 isNight ? 'bg-rose-400' : 'bg-yellow-400'
 }`}
 style={{ width: `${dayProgressPercent}%` }}
 />
 </div>
 </div>

 {/* Acoustic Noise Alert Banner (§5) */}
 {loudestNoise && (
 <div className="px-3 py-1.5 bg-rose-950/40 border border-rose-500/40 text-rose-300 text-[11px] font-mono clip-card-chip flex items-center gap-2 animate-in slide-in-from-top-1">
 <Volume2 className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
 <span>
 ACOUSTIC EVENT: <span className="font-bold text-rose-200">{loudestNoise.label}</span> ({loudestNoise.radius}m footprint)
 </span>
 </div>
 )}

 {/* Nightfall Warning Banner (§6.1) */}
 {isNight && (
 <div className="px-3 py-1.5 bg-rose-950/70 border border-rose-500/70 text-rose-200 text-[11px] font-mono clip-card-chip flex items-center gap-2">
 <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
 <span>
 NIGHTFALL IN EFFECT — Zombies active and drawn to noise!
 </span>
 </div>
 )}
 </div>
 );
};
