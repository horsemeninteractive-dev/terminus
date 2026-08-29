import React from 'react';
import {
 AlertTriangle,
 Crosshair,
 HandCoins,
 ShieldAlert,
 Users,
 Utensils,
 X,
} from 'lucide-react';
import { RivalHideout } from '../types/rivalFaction';
import { SettlementState } from '../types/settlement';

interface RansomEventModalProps {
 isOpen: boolean;
 onClose: () => void;
 hideout: RivalHideout | null;
 settlement: SettlementState;
 onPayRansom: (hideoutId: string | number) => void;
 onRefuseRescue: (hideoutId: string | number) => void;
}

/**
 * §5.2 ransom event: a rival faction has captured a player squad and demands a
 * food payment. The player can pay (squad returns, food cost) or refuse and
 * mount a rescue by assaulting the Hideout (combat risk, no food cost).
 */
export const RansomEventModal: React.FC<RansomEventModalProps> = ({
 isOpen,
 onClose,
 hideout,
 settlement,
 onPayRansom,
 onRefuseRescue,
}) => {
 if (!isOpen || !hideout || !hideout.ransom || !hideout.captiveSquadId) return null;

 const cost = hideout.ransom.foodCost;
 const availableFood = settlement.stockpile.food.canned_goods + settlement.stockpile.food.mre_rations;
 const canAfford = availableFood >= cost;

 return (
 <div
 id="ransom-event-modal-backdrop"
 className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto"
 onClick={onClose}
 >
 <div
 id="ransom-event-modal-container"
 className="bg-neutral-900 border border-orange-600/40 clip-tactical-bracket surface-bevel max-w-xl w-full p-6 space-y-5"
 onClick={(e) => e.stopPropagation()}
 >
 {/* Header */}
 <div className="flex items-start justify-between border-b border-neutral-800 pb-4">
 <div className="flex items-center gap-3">
 <div className="p-2.5 bg-orange-950/70 border border-orange-500/40 text-orange-400">
 <ShieldAlert className="w-6 h-6" />
 </div>
 <div>
 <h2 className="text-lg font-bold text-orange-300 tracking-wide uppercase font-heading">
 SQUAD CAPTURED — RANSOM DEMANDED
 </h2>
 <p className="text-xs text-neutral-400">
 §5.2 · Rival Human Faction Event
 </p>
 </div>
 </div>
 <button
 onClick={onClose}
 className="p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Faction & captive summary */}
 <div className="p-4 border border-neutral-800 bg-neutral-950/70 space-y-3">
 <div className="flex items-center gap-2">
 <Users className="w-4 h-4 text-orange-400" />
 <span className="text-sm text-neutral-200 font-semibold">
 {hideout.factionName}
 </span>
 <span className="ml-auto text-xs text-neutral-500 font-mono">
 HIDEOUT: {hideout.buildingName.toUpperCase()}
 </span>
 </div>

 <p className="text-xs text-neutral-400 leading-relaxed">
 Your squad <span className="text-orange-300 font-semibold">“{hideout.captiveSquadName}”</span> was
 overpowered by {hideout.factionName} and is being held at their hideout. They demand a food payment
 for its safe return. Pay and the squad walks free. Refuse and you can take it back by force.
 </p>

 <div className="flex items-center gap-2 p-3 bg-neutral-900 border border-neutral-800">
 <Utensils className="w-4 h-4 text-amber-400" />
 <span className="text-xs text-neutral-300">
 DEMAND: <span className="text-amber-300 font-bold">{cost} FOOD RATIONS</span>
 </span>
 <span className={`ml-auto text-xs font-mono ${canAfford ? 'text-emerald-400' : 'text-rose-400'}`}>
 {availableFood} AVAILABLE
 </span>
 </div>
 </div>

 {/* Choice buttons */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <button
 id="pay-ransom-btn"
 disabled={!canAfford}
 onClick={() => onPayRansom(hideout.buildingId)}
 className="px-4 py-3 border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/40 disabled:opacity-40 disabled:cursor-not-allowed text-left flex flex-col gap-1 transition-colors"
 >
 <span className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
 <HandCoins className="w-4 h-4" /> PAY RANSOM
 </span>
 <span className="text-[11px] text-neutral-400">
 Spend {cost} food. Squad returns immediately, no combat risk.
 </span>
 </button>

 <button
 id="refuse-ransom-btn"
 onClick={() => onRefuseRescue(hideout.buildingId)}
 className="px-4 py-3 border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/40 text-left flex flex-col gap-1 transition-colors"
 >
 <span className="flex items-center gap-2 text-rose-300 font-bold text-sm">
 <Crosshair className="w-4 h-4" /> REFUSE — RESCUE
 </span>
 <span className="text-[11px] text-neutral-400">
 No food cost. Assault the Hideout and eliminate its defenders to free the squad.
 </span>
 </button>
 </div>

 <div className="flex items-center gap-2 text-[11px] text-neutral-500 font-mono">
 <AlertTriangle className="w-4 h-4 text-amber-500" />
 The captive squad is unavailable until the ransom is paid or the Hideout is cleared.
 </div>
 </div>
 </div>
 );
};
