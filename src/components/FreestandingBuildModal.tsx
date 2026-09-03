import React, { useState } from 'react';
import {
 Archive,
 Bed,
 Box,
 Check,
 Crosshair,
 Droplets,
 Flame,
 Hammer,
 HeartPulse,
 Info,
 MapPin,
 Shield,
 ShieldAlert,
 Trees,
 Truck,
 Wrench,
 X,
 Zap,
} from 'lucide-react';import {
  FUNCTIONAL_BUILDING_DEFINITIONS,
  FUNCTIONAL_CATEGORIES,
  isLegacyAliasBuildingType,
} from '../data/functionalBuildings';
import { getFreestandingDimensions } from '../services/freestandingFootprint';
import { isResearchUnlocked } from '../services/researchService';
import { Point2D } from '../types/map';
import {
 FunctionalBuildingTypeId,
 FunctionalCategory,
 SettlementState,
} from '../types/settlement';

interface FreestandingBuildModalProps {
 isOpen: boolean;
 onClose: () => void;
 settlement: SettlementState;
 targetPosition: Point2D | null;
 onBuildFreestanding: (typeId: FunctionalBuildingTypeId, pos: Point2D) => void;
 onArmBlueprint?: (typeId: FunctionalBuildingTypeId) => void;
}

export const FreestandingBuildModal: React.FC<FreestandingBuildModalProps> = ({
 isOpen,
 onClose,
 settlement,
 targetPosition,
 onBuildFreestanding,
 onArmBlueprint,
}) => {
 const [selectedCategory, setSelectedCategory] = useState<FunctionalCategory>('basic');
 // Default to the canonical Shelter module — legacy alias defs (e.g.
 // shelter_bunkhouse) are save-compat duplicates and never lead the picker.
 const [selectedTypeId, setSelectedTypeId] = useState<FunctionalBuildingTypeId>('shelter');
 const [errorMsg, setErrorMsg] = useState<string | null>(null);

 if (!isOpen) return null;

 const currentDef = FUNCTIONAL_BUILDING_DEFINITIONS[selectedTypeId];
 // §Terminus: every freestanding facility has its own PREDEFINED module
 // footprint (never a generic 8×8 box) — show the real one being placed.
 const currentDims = currentDef ? getFreestandingDimensions(currentDef.id) : null;
 const cost = currentDef?.freestandingCost; const canAfford =
   cost &&
   settlement.stockpile.materials.wood >= (cost.wood || 0) &&
   settlement.stockpile.materials.metal >= (cost.metal || 0) &&
   settlement.stockpile.materials.bricks >= (cost.bricks || 0) &&
   (settlement.stockpile.materials.tools || 0) >= (cost.tools || 0);

 const posToUse: Point2D = targetPosition || { x: 0, z: 0 };

 const handleBuild = () => {
 setErrorMsg(null);
 if (!canAfford) {
 setErrorMsg('Insufficient construction materials in stockpile.');
 return;
 }
 if (onArmBlueprint) {
 onArmBlueprint(selectedTypeId);
 onClose();
 } else {
 onBuildFreestanding(selectedTypeId, posToUse);
 onClose();
 }
 };

 // Adaptation-type facilities can only be erected freestanding once the
 // colony researches Advanced Masonry (service-enforced in buildFreestanding).
 // Genuinely freestanding IFZ structures (walls/gates/towers, adaptationAllowed
 // false) are always listed; locked facilities are hidden until unlocked.
 const masonryUnlocked = isResearchUnlocked(settlement, 'advanced_masonry');
 // Legacy alias defs are save-compat duplicates of a canonical building and
 // never surface in the freestanding picker (each facility appears once).
 const categoryDefs = Object.values(FUNCTIONAL_BUILDING_DEFINITIONS).filter(
 (def) =>
   def.category === selectedCategory &&
   !isLegacyAliasBuildingType(def.id) &&
   (!def.adaptationAllowed || masonryUnlocked)
 );
 const lockedCount = Object.values(FUNCTIONAL_BUILDING_DEFINITIONS).filter(
 (def) =>
   def.category === selectedCategory &&
   !isLegacyAliasBuildingType(def.id) &&
   def.adaptationAllowed &&
   !masonryUnlocked
 ).length;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm font-mono select-none">
 <div className="bg-[#0e1012] border border-[#f59e0b] clip-tactical-bracket surface-bevel w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-white">
 {/* Header */}
 <div className="p-3 bg-[#171410] border-b border-[#332512] flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Wrench className="w-4 h-4 text-[#f59e0b]" />
 <h2 className="font-black text-sm uppercase tracking-wider text-white">
 FREESTANDING CONSTRUCTION (§7.1)
 </h2>
 <span className="bg-[#291e10] text-[#f59e0b] text-[9px] px-1.5 py-0.5 border border-[#4d371a] uppercase">
 Higher Cost / Lower Durability
 </span>
 </div>
 <button
 onClick={onClose}
 className="p-1 text-[#9ca3af] hover:text-white bg-[#221c15] border border-[#3b2d1d]"
 >
 <X className="w-4 h-4" />
 </button>
 </div>

 {/* Notice comparing Freestanding vs Adaptation (§7.1) */}
 <div className="p-3 bg-[#1a150e] border-b border-[#2b2014] text-[11px] text-[#fde68a] flex items-start gap-2">
 <Info className="w-4 h-4 shrink-0 text-[#f59e0b] mt-0.5" />
 <p>
 Freestanding structures are assembled from scratch on open ground. They require significantly more timber, metal, and masonry, and possess lower structural integrity compared to adapting existing real-world masonry buildings.
 </p>
 </div>

 {/* Modal Body */}
 <div className="p-4 overflow-y-auto space-y-4 text-[11px]">
 {/* Target Location Coordinate */}
 <div className="flex items-center justify-between bg-[#14161a] p-2.5 border border-[#232730]">
 <div className="flex items-center gap-2">
 <MapPin className="w-4 h-4 text-[#f59e0b]" />
 <div>
 <span className="text-[#6b7280] uppercase text-[10px]">Placement Coordinates:</span>
 <div className="font-bold text-white">
 Target: ({posToUse.x.toFixed(1)}m East, {posToUse.z.toFixed(1)}m South)
 </div>
 </div>
 </div>
 <span className="text-[10px] text-[#9ca3af]">
 {targetPosition ? 'Custom Ground Click' : 'Default Sector Grid'}
 </span>
 </div>

 {/* Category Tabs */}
 <div>
 <div className="text-[10px] text-[#9ca3af] uppercase font-bold mb-1.5">
 1. Choose Building Category:
 </div>
 <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
 {FUNCTIONAL_CATEGORIES.map((cat) => (
 <button
 key={cat.id}
 onClick={() => {
 setSelectedCategory(cat.id);
 const first = Object.values(FUNCTIONAL_BUILDING_DEFINITIONS).find(
 (d) => d.category === cat.id && !isLegacyAliasBuildingType(d.id)
 );
 if (first) setSelectedTypeId(first.id);
 }}
 className={`p-1.5 text-[10px] font-bold uppercase border transition-all text-center truncate ${
 selectedCategory === cat.id
 ? 'bg-[#291e10] border-[#f59e0b] text-[#fde68a]'
 : 'bg-[#121417] border-[#22262c] text-[#9ca3af] hover:text-white'
 }`}
 >
 {cat.label.split(' ')[0]}
 </button>
 ))}
 </div>
 </div>

 {/* Building Types */}
 <div>
 <div className="text-[10px] text-[#9ca3af] uppercase font-bold mb-1.5">
 2. Select Freestanding Blueprint:
 </div>
 {lockedCount > 0 && (
 <div className="px-2 py-1.5 bg-[#1a150e] border border-[#4d371a] text-[#fde68a] text-[10px]">
 {lockedCount} facility type{lockedCount === 1 ? '' : 's'} in this category {lockedCount === 1 ? 'is' : 'are'} locked behind Advanced Masonry research — freestanding facilities need masonry expertise.
 </div>
 )}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 {categoryDefs.map((def) => {
 const isSelected = selectedTypeId === def.id;
 const defCost = def.freestandingCost;
 return (
 <button
 key={def.id}
 onClick={() => setSelectedTypeId(def.id)}
 className={`p-2.5 border text-left transition-all ${
 isSelected
 ? 'bg-[#1e1b15] border-[#f59e0b] text-white'
 : 'bg-[#121417] border-[#22262c] text-[#9ca3af] hover:border-[#383d45] hover:text-white'
 }`}
 >
 <div className="font-black text-sm text-white flex items-center justify-between mb-1">
 <span>{def.name}</span>
 <span className="text-[9px] text-[#ef4444] font-bold">
 +{def.freestandingDefense} Def
 </span>
 </div>
 <p className="text-[10px] text-[#6b7280] mb-2">{def.description}</p>
 <div className="bg-[#0e1012] p-1.5 border border-[#1d2026] text-[10px] flex justify-between">
 <span className="text-[#9ca3af]">Freestanding Cost:</span>
 <span className="text-white font-bold">
 {defCost.wood}W / {defCost.metal}M / {defCost.bricks}B
 {defCost.tools ? ` / ${defCost.tools}T` : ''}
 </span>
 </div>
 </button>
 );
 })}
 </div>
 </div>

 {/* Selected Blueprint Cost & Stat Comparison */}
 {currentDef && cost && (
 <div className="bg-[#121417] p-3 border border-[#24272c] space-y-2">
 <div className="font-black text-xs uppercase text-white flex justify-between">
 <span>Construction Breakdown: {currentDef.name}</span>
 {currentDims && (
 <span className="text-[#f59e0b]">
 Module {currentDims.width}×{currentDims.length} m · {Math.round(currentDims.width * currentDims.length)} m²
 </span>
 )}
 </div>

 {/* Material checks */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px]">
 <div
 className={`p-2 border ${
 settlement.stockpile.materials.wood >= (cost.wood || 0)
 ? 'bg-[#142417] border-[#22c55e] text-[#4ade80]'
 : 'bg-[#291719] border-[#ef4444] text-[#ef4444]'
 }`}
 >
 <div className="uppercase">Wood Required</div>
 <div className="text-base font-black">
 {(cost.wood || 0)} / {settlement.stockpile.materials.wood}
 </div>
 </div>

 <div
 className={`p-2 border ${
 settlement.stockpile.materials.metal >= (cost.metal || 0)
 ? 'bg-[#142417] border-[#22c55e] text-[#4ade80]'
 : 'bg-[#291719] border-[#ef4444] text-[#ef4444]'
 }`}
 >
 <div className="uppercase">Metal Required</div>
 <div className="text-base font-black">
 {(cost.metal || 0)} / {settlement.stockpile.materials.metal}
 </div>
 </div>

 <div
 className={`p-2 border ${
 settlement.stockpile.materials.bricks >= (cost.bricks || 0)
 ? 'bg-[#142417] border-[#22c55e] text-[#4ade80]'
 : 'bg-[#291719] border-[#ef4444] text-[#ef4444]'
 }`}
 >
 <div className="uppercase">Bricks Required</div>
 <div className="text-base font-black">
 {(cost.bricks || 0)} / {settlement.stockpile.materials.bricks}
 </div>
 </div>

 <div
 className={`p-2 border ${
 (settlement.stockpile.materials.tools || 0) >= (cost.tools || 0)
 ? 'bg-[#142417] border-[#22c55e] text-[#4ade80]'
 : 'bg-[#291719] border-[#ef4444] text-[#ef4444]'
 }`}
 >
 <div className="uppercase">Tools Required</div>
 <div className="text-base font-black">
 {(cost.tools || 0)} / {settlement.stockpile.materials.tools || 0}
 </div>
 </div>
 </div>

 {errorMsg && (
 <div className="p-2 bg-[#2a171a] border border-[#ef4444] text-[#ef4444] text-[10px]">
 {errorMsg}
 </div>
 )}
 </div>
 )}
 </div>

 {/* Footer Actions */}
 <div className="p-3 bg-[#171410] border-t border-[#332512] flex justify-between items-center">
 <button
 onClick={onClose}
 className="px-3 py-1.5 bg-[#22252c] hover:bg-[#2d323c] text-[#9ca3af] hover:text-white font-bold text-xs uppercase"
 >
 Cancel
 </button>

 <button
 id="confirm-freestanding-btn"
 onClick={handleBuild}
 disabled={!canAfford}
 className={`px-4 py-2 text-xs font-black uppercase flex items-center gap-2 border transition-all ${
 canAfford
 ? 'bg-[#b45309] hover:bg-[#d97706] border-[#f59e0b] text-white cursor-pointer'
 : 'bg-[#1b1e24] border-[#2c313a] text-[#52525b] cursor-not-allowed'
 }`}
 >
 <Check className="w-4 h-4" />
 <span>Construct Freestanding Structure</span>
 </button>
 </div>
 </div>
 </div>
 );
};
