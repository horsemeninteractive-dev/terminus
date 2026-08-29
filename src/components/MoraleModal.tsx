import React from 'react';
import {
 Heart,
 TrendingUp,
 AlertTriangle,
 Users,
 Shield,
 Utensils,
 Home,
 Activity,
 X,
 CheckCircle2,
 Sparkles,
 Zap,
 Crosshair,
 Baby,
} from 'lucide-react';
import { SettlementState } from '../types/settlement';
import { SettlementMoraleState } from '../types/morale';
import { WeatherState } from '../types/weather';

interface MoraleModalProps {
 isOpen: boolean;
 onClose: () => void;
 settlement: SettlementState;
 weather?: WeatherState;
 onGrantFood?: () => void;
 onDrainFood?: () => void;
}

export const MoraleModal: React.FC<MoraleModalProps> = ({
 isOpen,
 onClose,
 settlement,
 onGrantFood,
 onDrainFood,
}) => {
 if (!isOpen) return null;

 const morale: SettlementMoraleState = settlement.morale || {
 overallScore: 75,
 tier: 'content',
 tierLabel: 'Content & Stable',
 tierDescription: 'Survivors are optimistic and working steadily with standard efficiency.',
 factors: [],
 modifiers: {
 productivityMultiplier: 1.0,
 combatDamageMultiplier: 1.0,
 combatFireRateMultiplier: 1.0,
 combatCritBonus: 0.0,
 passiveGrowthMultiplier: 1.0,
 },
 passiveGrowth: {
 currentProgress: 20,
 ratePercentPerDay: 25,
 isGrowing: true,
 blockReason: null,
 totalBirthsAndArrivals: 0,
 estimatedDaysRemaining: 3.2,
 },
 dailyFoodConsumption: 12,
 daysOfFoodRemaining: 8,
 dailyWaterConsumption: 18,
 daysOfWaterRemaining: 7,
 };

 const score = morale.overallScore;
 const isEuphoric = morale.tier === 'euphoric';
 const isContent = morale.tier === 'content';
 const isDiscontent = morale.tier === 'discontent';
 const isDespair = morale.tier === 'despair';

 const tierColor = isEuphoric
 ? 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40'
 : isContent
 ? 'text-sky-400 border-sky-500/40 bg-sky-950/40'
 : isDiscontent
 ? 'text-amber-400 border-amber-500/40 bg-amber-950/40'
 : 'text-rose-400 border-rose-500/40 bg-rose-950/40';

 const growth = morale.passiveGrowth;

 return (
 <div
 id="morale-modal-backdrop"
 className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
 onClick={onClose}
 >
 <div
 id="morale-modal-container"
 className="bg-neutral-900 border border-neutral-700/80 clip-tactical-bracket surface-bevel max-w-3xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto"
 onClick={(e) => e.stopPropagation()}
 >
 {/* Header */}
 <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
 <div className="flex items-center gap-3">
 <div className="p-2.5 bg-rose-950/60 border border-rose-500/30 text-rose-400">
 <Heart className="w-6 h-6 animate-pulse" />
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h2 className="text-xl font-bold text-neutral-100 tracking-wide">
 SETTLEMENT MORALE & SOCIAL COHESION
 </h2>
 <span className="text-xs px-2 py-0.5 bg-neutral-800 text-neutral-400 font-mono border border-neutral-700">
 §4.5
 </span>
 </div>
 <p className="text-xs text-neutral-400">
 Colony spirit directly drives labor productivity, tactical combat efficiency, and passive population growth.
 </p>
 </div>
 </div>
 <button
 id="close-morale-modal-btn"
 onClick={onClose}
 className="p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Top Summary Banner */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 {/* Big Morale Meter */}
 <div className={`p-4 border flex flex-col justify-between ${tierColor}`}>
 <div>
 <div className="flex items-center justify-between">
 <span className="text-xs font-mono font-semibold uppercase tracking-wider text-neutral-300">
 OVERALL MORALE
 </span>
 <span className="text-xs font-bold px-2 py-0.5 border bg-neutral-900/60 uppercase">
 {morale.tier}
 </span>
 </div>
 <div className="mt-2 flex items-baseline gap-2">
 <span className="text-4xl font-black font-mono">{score}%</span>
 <span className="text-sm font-medium opacity-90">{morale.tierLabel}</span>
 </div>
 </div>

 {/* Progress bar */}
 <div className="mt-4">
 <div className="w-full bg-neutral-950/80 h-2.5 overflow-hidden border border-neutral-800">
 <div
 className={`h-full transition-all duration-500 ${
 isEuphoric
 ? 'bg-emerald-500'
 : isContent
 ? 'bg-sky-500'
 : isDiscontent
 ? 'bg-amber-500'
 : 'bg-rose-500'
 }`}
 style={{ width: `${score}%` }}
 />
 </div>
 <p className="text-[11px] text-neutral-300/90 mt-2 leading-relaxed">
 {morale.tierDescription}
 </p>
 </div>
 </div>

 {/* Active Effects Card */}
 <div className="p-4 border border-neutral-800 bg-neutral-950/60 space-y-3 md:col-span-2">
 <h3 className="text-xs font-mono font-semibold uppercase text-neutral-400 tracking-wider flex items-center gap-2">
 <Zap className="w-4 h-4 text-amber-400" />
 ACTIVE MORALE SYSTEM MODIFIERS
 </h3>

 <div className="grid grid-cols-3 gap-3">
 {/* Productivity */}
 <div className="p-3 bg-neutral-900/80 border border-neutral-800/80">
 <div className="flex items-center justify-between text-neutral-400 text-xs">
 <span className="flex items-center gap-1.5">
 <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
 Productivity
 </span>
 </div>
 <div className="mt-1 font-mono font-bold text-lg text-neutral-100">
 {Math.round(morale.modifiers.productivityMultiplier * 100)}%
 </div>
 <div className="text-[10px] text-neutral-400 mt-0.5">
 {morale.modifiers.productivityMultiplier > 1.0 ? (
 <span className="text-emerald-400 font-medium">
 +
 {Math.round(
 (morale.modifiers.productivityMultiplier - 1.0) * 100
 )}
 % Work Speed
 </span>
 ) : morale.modifiers.productivityMultiplier < 1.0 ? (
 <span className="text-rose-400 font-medium">
 -
 {Math.round(
 (1.0 - morale.modifiers.productivityMultiplier) * 100
 )}
 % Labor Drag
 </span>
 ) : (
 'Normal Speed'
 )}
 </div>
 </div>

 {/* Combat */}
 <div className="p-3 bg-neutral-900/80 border border-neutral-800/80">
 <div className="flex items-center justify-between text-neutral-400 text-xs">
 <span className="flex items-center gap-1.5">
 <Crosshair className="w-3.5 h-3.5 text-rose-400" />
 Squad Combat
 </span>
 </div>
 <div className="mt-1 font-mono font-bold text-lg text-neutral-100">
 {Math.round(morale.modifiers.combatDamageMultiplier * 100)}%
 </div>
 <div className="text-[10px] text-neutral-400 mt-0.5">
 {morale.modifiers.combatDamageMultiplier > 1.0 ? (
 <span className="text-emerald-400 font-medium">
 +
 {Math.round(
 (morale.modifiers.combatDamageMultiplier - 1.0) * 100
 )}
 % Volley Dmg
 </span>
 ) : morale.modifiers.combatDamageMultiplier < 1.0 ? (
 <span className="text-rose-400 font-medium">
 -
 {Math.round(
 (1.0 - morale.modifiers.combatDamageMultiplier) * 100
 )}
 % Firepower Loss
 </span>
 ) : (
 'Standard Dmg'
 )}
 </div>
 </div>

 {/* Population Growth */}
 <div className="p-3 bg-neutral-900/80 border border-neutral-800/80">
 <div className="flex items-center justify-between text-neutral-400 text-xs">
 <span className="flex items-center gap-1.5">
 <Baby className="w-3.5 h-3.5 text-purple-400" />
 Birth Rate
 </span>
 </div>
 <div className="mt-1 font-mono font-bold text-lg text-neutral-100">
 {growth.isGrowing ? (
 <span className="text-purple-400 font-medium">
 {growth.ratePercentPerDay}%/day
 </span>
 ) : (
 <span className="text-neutral-500">FROZEN</span>
 )}
 </div>
 <div className="text-[10px] text-neutral-400 mt-0.5">
 {growth.isGrowing ? (
 <span className="text-purple-300">
 ETA ~{growth.estimatedDaysRemaining}d
 </span>
 ) : (
 <span className="text-amber-400/90 truncate block">
 Conditions Unmet
 </span>
 )}
 </div>
 </div>
 </div>

 {/* Quick Testing buttons */}
 <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-800/60">
 <span className="text-[11px] text-neutral-500 font-mono">
 Simulation Test:
 </span>
 {onDrainFood && (
 <button
 id="test-drain-food-btn"
 onClick={onDrainFood}
 className="px-2.5 py-1 text-xs bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 font-mono transition-colors"
 title="Simulate complete food starvation to witness morale collapse"
 >
 Deplete Food (Test Starvation)
 </button>
 )}
 {onGrantFood && (
 <button
 id="test-grant-food-btn"
 onClick={onGrantFood}
 className="px-2.5 py-1 text-xs bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 font-mono transition-colors"
 title="Grant fresh harvest & meals to restore high morale"
 >
 Restock Food (+100 Fresh)
 </button>
 )}
 </div>
 </div>
 </div>

 {/* Passive Population Growth System (§4.5) */}
 <div className="p-4 border border-purple-500/20 bg-purple-950/20 space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Baby className="w-5 h-5 text-purple-400" />
 <h3 className="text-sm font-bold text-neutral-100 uppercase tracking-wide font-mono">
 PASSIVE POPULATION GROWTH & BIRTH RATE
 </h3>
 </div>
 <div className="flex items-center gap-2">
 <span
 className={`text-xs px-2.5 py-0.5 border font-mono ${
 growth.isGrowing
 ? 'text-emerald-400 bg-emerald-950/80 border-emerald-500/30'
 : 'text-amber-400 bg-amber-950/80 border-amber-500/30'
 }`}
 >
 {growth.isGrowing ? 'GROWTH ACTIVE' : 'GROWTH HALTED'}
 </span>
 </div>
 </div>

 <div className="space-y-1.5">
 <div className="flex items-center justify-between text-xs font-mono">
 <span className="text-neutral-400">
 New Resident Conception & Peaceful Intake Progress:
 </span>
 <span className="text-purple-300 font-bold">
 {Math.round(growth.currentProgress)}% / 100%
 </span>
 </div>
 <div className="w-full bg-neutral-900 h-3 overflow-hidden border border-neutral-700">
 <div
 className="h-full bg-gradient-to-r from-purple-600 via-pink-500 to-purple-400 transition-all duration-300 relative"
 style={{ width: `${Math.min(100, growth.currentProgress)}%` }}
 >
 <div className="absolute inset-0 bg-white/20 animate-pulse" />
 </div>
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
 <div className="p-2 bg-neutral-900/80 border border-neutral-800">
 <span className="text-neutral-500 block text-[10px] uppercase font-mono">
 Total Colony Births
 </span>
 <span className="font-mono font-bold text-neutral-200 text-sm">
 {growth.totalBirthsAndArrivals} Survivors
 </span>
 </div>
 <div className="p-2 bg-neutral-900/80 border border-neutral-800">
 <span className="text-neutral-500 block text-[10px] uppercase font-mono">
 Daily Rate
 </span>
 <span className="font-mono font-bold text-purple-300 text-sm">
 +{growth.ratePercentPerDay}% / in-game day
 </span>
 </div>
 <div className="p-2 bg-neutral-900/80 border border-neutral-800">
 <span className="text-neutral-500 block text-[10px] uppercase font-mono">
 Requirements Status
 </span>
 {growth.isGrowing ? (
 <span className="font-mono font-medium text-emerald-400 flex items-center gap-1 text-xs">
 <CheckCircle2 className="w-3.5 h-3.5" /> Thriving Conditions
 </span>
 ) : (
 <span className="font-mono font-medium text-amber-400 text-xs truncate block">
 {growth.blockReason}
 </span>
 )}
 </div>
 </div>
 </div>

 {/* Detailed Morale Factors Breakdown */}
 <div className="space-y-3">
 <h3 className="text-xs font-mono font-semibold uppercase text-neutral-400 tracking-wider flex items-center justify-between">
 <span>MORALE DRIVERS & FACTOR BREAKDOWN</span>
 <span className="text-neutral-500 font-normal">
 {morale?.factors?.length || 0} active factors
 </span>
 </h3>

 <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
 {morale.factors.map((factor) => {
 const isPos = factor.scoreDelta > 0;
 const isCrit = factor.statusType === 'critical';

 return (
 <div
 key={factor.id}
 className={`p-3 border flex items-center justify-between gap-3 text-xs ${
 isCrit
 ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
 : isPos
 ? 'bg-neutral-900/80 border-neutral-800 text-neutral-200'
 : 'bg-amber-950/20 border-amber-800/40 text-amber-200'
 }`}
 >
 <div className="flex items-center gap-3">
 <div
 className={`p-1.5 ${
 factor.category === 'food'
 ? 'bg-emerald-950 text-emerald-400'
 : factor.category === 'housing'
 ? 'bg-sky-950 text-sky-400'
 : factor.category === 'safety'
 ? 'bg-rose-950 text-rose-400'
 : factor.category === 'health'
 ? 'bg-cyan-950 text-cyan-400'
 : 'bg-purple-950 text-purple-400'
 }`}
 >
 {factor.category === 'food' && <Utensils className="w-4 h-4" />}
 {factor.category === 'housing' && <Home className="w-4 h-4" />}
 {factor.category === 'safety' && <Shield className="w-4 h-4" />}
 {factor.category === 'health' && <Activity className="w-4 h-4" />}
 {factor.category === 'events' && <Sparkles className="w-4 h-4" />}
 </div>

 <div>
 <div className="font-semibold text-neutral-100 flex items-center gap-2">
 {factor.name}
 <span className="text-[10px] px-1.5 py-0.2 bg-neutral-800 text-neutral-400 uppercase font-mono">
 {factor.category}
 </span>
 </div>
 <div className="text-neutral-400 text-[11px] mt-0.5">
 {factor.description}
 </div>
 </div>
 </div>

 <div className="text-right flex-shrink-0">
 <span
 className={`font-mono font-bold text-sm px-2 py-0.5 border ${
 isPos
 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-950/50'
 : 'text-rose-400 border-rose-500/30 bg-rose-950/50'
 }`}
 >
 {isPos ? `+${factor.scoreDelta}` : factor.scoreDelta} pts
 </span>
 </div>
 </div>
 );
 })}
 </div>
 </div>

 {/* Footer */}
 <div className="border-t border-neutral-800 pt-4 flex items-center justify-between text-xs text-neutral-400">
 <div className="flex items-center gap-2">
 <Users className="w-4 h-4 text-sky-400" />
 <span>
 Colony Pop: {settlement.namedSurvivors?.length || 0} Named +{' '}
 {typeof settlement.generalPopulation === 'number' ? settlement.generalPopulation : (settlement.generalPopulation?.total || 0)} General (
 {settlement.totalLivingCapacity} Shelter Capacity)
 </span>
 </div>
 <button
 onClick={onClose}
 className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium transition-colors"
 >
 Close Overview
 </button>
 </div>
 </div>
 </div>
 );
};
