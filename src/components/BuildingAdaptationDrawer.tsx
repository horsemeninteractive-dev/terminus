import React, { useState } from 'react';
import {
 Award,
 Check,
 ChevronDown,
 ChevronUp,
 Crosshair,
 Flame,
 Hammer,
 Maximize2,
 RotateCcw,
 Search,
 Shield,
 ShieldAlert,
 Trash2,
 UserPlus,
 Users,
 X,
} from 'lucide-react';
import {
 calculatePolygonArea,
 FUNCTIONAL_BUILDING_DEFINITIONS,
} from '../data/functionalBuildings';
import { CATEGORY_COLORS } from '../render/BuildingRenderer';
import { calculateBuildingRepairCost } from '../services/combatService';
import { getDefaultHeadTitle } from '../services/populationService';
import { BuildingPolygon } from '../types/map';
import { HiddenSurvivorGroup } from '../types/population';
import {
 AdaptedBuilding,
 SettlementState,
} from '../types/settlement';

interface BuildingAdaptationDrawerProps {
 building: BuildingPolygon | null;
 adaptedInfo?: AdaptedBuilding;
 isHQ: boolean;
 settlement: SettlementState;
 hiddenGroup?: HiddenSurvivorGroup | null;
 onClose: () => void;
 onDismantle: (buildingId: string | number) => void;
 onFocusBuilding: (bldg: BuildingPolygon) => void;
 onAppointHead: (survivorId: string, buildingId: string | number, title?: string) => void;
 onVacateSurvivorRole: (survivorId: string) => void;
 onInvestigateHiddenGroup: (group: HiddenSurvivorGroup) => void;
 onRepairBuilding?: (buildingId: string | number) => void;
 onSearchInfestedBuilding?: (building: BuildingPolygon) => void;
}

export const BuildingAdaptationDrawer: React.FC<BuildingAdaptationDrawerProps> = ({
 building,
 adaptedInfo,
 isHQ,
 settlement,
 hiddenGroup,
 onClose,
 onDismantle,
 onFocusBuilding,
 onAppointHead,
 onVacateSurvivorRole,
 onInvestigateHiddenGroup,
 onRepairBuilding,
 onSearchInfestedBuilding,
}) => {
 const [isAppointingHead, setIsAppointingHead] = useState(false);
 const [isMinimized, setIsMinimized] = useState(false);

 if (!building) return null;

 const footprintArea = Math.round(calculatePolygonArea(building.polygon));
 const levels = Math.max(1, building.levels || Math.round(building.height / 3.5));
 const totalFloorArea = footprintArea * levels;
 const volume = footprintArea * building.height;

 // If building is already adapted, get current stats
 const activeDef = adaptedInfo ? FUNCTIONAL_BUILDING_DEFINITIONS[adaptedInfo.typeId] : null;

 // Appointed Head
 const currentHead = adaptedInfo?.assignedHeadId
 ? settlement.namedSurvivors.find((s) => s.id === adaptedInfo.assignedHeadId)
 : null;

 

  if (isMinimized) {
    return (
      <div className="relative z-40 w-full md:w-[min(94vw,340px)] shrink-0 bg-[#0e1012]/95 border-2 border-[#38bdf8] p-2.5 flex items-center justify-between font-mono text-white shadow-2xl backdrop-blur-md clip-tactical-bracket pointer-events-auto animate-in fade-in duration-150">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-3 h-3 shrink-0 inline-block"
            style={{
              backgroundColor: `#${CATEGORY_COLORS[building.type]?.accent.toString(16).padStart(6, '0')}`,
            }}
          />
          <div className="flex flex-col min-w-0">
            <span className="font-heading font-bold text-xs uppercase truncate text-white">
              {isHQ ? 'COMMAND HQ' : building.name || activeDef?.name || CATEGORY_COLORS[building.type]?.label || 'Structure'}
            </span>
            <div className="text-[10px] text-[#9ca3af]">
              {adaptedInfo ? (
                <span className="text-[#38bdf8] uppercase font-bold">{activeDef?.name || 'Adapted Facility'}</span>
              ) : (
                <span>OSM: {building.type} ({footprintArea}m²)</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={() => setIsMinimized(false)}
            title="Expand Building Panel"
            className="p-1 text-[#38bdf8] hover:text-white bg-[#0369a1]/40 hover:bg-[#0369a1] border border-[#38bdf8] transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-[#9ca3af] hover:text-white bg-[#1e222a] border border-[#2d333e] transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-40 w-full md:w-[min(94vw,340px)] shrink-0 max-h-[50vh] md:max-h-[70vh] overflow-y-auto bg-[#0e1012]/95 border-2 border-[#33373d] clip-sidebar-edge-right surface-bevel backdrop-blur-md flex flex-col font-mono pointer-events-auto text-white shadow-2xl">
 {/* Header */}
 <div className="p-3 bg-[#14171c] border-b border-[#292c31] flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span
 className="w-3 h-3 inline-block"
 style={{
 backgroundColor: `#${CATEGORY_COLORS[building.type]?.accent.toString(16).padStart(6, '0')}`,
 }}
 />
 <div>
 <h2 className="font-black text-sm uppercase tracking-wider text-white truncate max-w-[200px]">
 {isHQ ? 'COMMAND HQ' : building.name || CATEGORY_COLORS[building.type]?.label || 'Real Structure'}
 </h2>
 <div className="text-[10px] text-[#9ca3af]">
 OSM: <span className="text-[#fcd34d] uppercase font-bold">{building.type}</span> (#{building.id})
 </div>
 </div>
 </div>

 <div className="flex items-center gap-1">
 <button
 onClick={() => onFocusBuilding(building)}
 className="p-1 text-[#9ca3af] hover:text-white bg-[#1e222a] border border-[#2d333e]"
 title="Focus Camera"
 >
 <Maximize2 className="w-3.5 h-3.5" />
 </button>
 <button
 onClick={() => setIsMinimized(true)}
 className="p-1 text-[#9ca3af] hover:text-white bg-[#1e222a] border border-[#2d333e]"
 title="Minimize Panel"
 >
 <ChevronDown className="w-3.5 h-3.5" />
 </button>
 <button
 onClick={onClose}
 className="p-1 text-[#9ca3af] hover:text-white bg-[#1e222a] border border-[#2d333e]"
 title="Close"
 >
 <X className="w-3.5 h-3.5" />
 </button>
 </div>
 </div>

 {/* Building Physical Properties (§7.1 Footprint scaling) */}
 <div className="p-3 bg-[#111317] border-b border-[#24272c] grid grid-cols-4 gap-2 text-center text-[10px]">
 <div className="bg-[#171a20] p-1.5 border border-[#252a33]">
 <div className="text-[8px] text-[#6b7280] uppercase">Footprint</div>
 <div className="font-black text-[#38bdf8] text-xs">{footprintArea} m²</div>
 </div>
 <div className="bg-[#171a20] p-1.5 border border-[#252a33]">
 <div className="text-[8px] text-[#6b7280] uppercase">Levels</div>
 <div className="font-black text-white text-xs">{levels} ({building.height}m)</div>
 </div>
 <div className="bg-[#171a20] p-1.5 border border-[#252a33]">
 <div className="text-[8px] text-[#6b7280] uppercase">Floor Space</div>
 <div className="font-black text-[#4ade80] text-xs">{totalFloorArea} m²</div>
 </div>
 <div className="bg-[#171a20] p-1.5 border border-[#252a33]">
 <div className="text-[8px] text-[#6b7280] uppercase">Volume</div>
 <div className="font-black text-[#f59e0b] text-xs">{Math.round(volume)} m³</div>
 </div>
 </div>

 {/* Main Body */}
 <div className="flex-1 overflow-y-auto p-3 space-y-3">
 {/* Hidden Survivor Group Environmental Clue Banner (§4.4) */}
 {hiddenGroup && !hiddenGroup.isRecruited && (
 <div className="p-3 bg-amber-950/40 border-2 border-amber-500 space-y-2">
 <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
 <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
 <span>UNEXPLORED ACTIVITY DETECTED</span>
 </div>
 <p className="text-[11px] text-amber-200/90 leading-relaxed">
 {hiddenGroup.hasSmokeClue
 ? 'Active chimney smoke plumes detected rising from this roof. Human survivors are sheltering inside.'
 : 'Scouts report signs of survivor habitation inside this structural interior.'}
 </p>
 <button
 id="investigate-group-btn"
 onClick={() => onInvestigateHiddenGroup(hiddenGroup)}
 className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-slate-900 font-bold text-xs uppercase flex items-center justify-center gap-2 transition-colors"
 >
 <Users className="w-3.5 h-3.5" />
 Make Contact & Scout Group
 </button>
 </div>
 )}

 {/* CASE 1: Building is HQ */}
 {isHQ && (
 <div className="bg-[#18241b] border border-[#22c55e] p-3 text-center space-y-2">
 <div className="w-10 h-10 bg-[#15803d]/30 border border-[#22c55e] flex items-center justify-center mx-auto text-[#4ade80]">
 <Shield className="w-6 h-6" />
 </div>
 <div className="font-black text-sm text-[#4ade80] uppercase">Settlement Command Headquarters</div>
 <p className="text-[11px] text-[#d1d5db]">
 Central command nexus of the outpost. Provides fortified defense perimeter, default survivor housing, and base inventory storage.
 </p>
 <div className="grid grid-cols-2 gap-2 text-[10px] text-left pt-2 border-t border-[#2d4734]">
 <div>
 <span className="text-[#6b7280]">Living Quarters:</span>{' '}
 <span className="font-bold text-white">{settlement.hq?.maxCapacity} Beds</span>
 </div>
 <div>
 <span className="text-[#6b7280]">Defense Bonus:</span>{' '}
 <span className="font-bold text-[#4ade80]">+{settlement.hq?.defenseRating} Def</span>
 </div>
 </div>
 </div>
 )}

 {/* CASE 2: Building is Already Adapted */}
 {!isHQ && adaptedInfo && activeDef && (
 <div className="space-y-3">
 <div className="bg-[#141820] border-2 border-[#3b82f6] p-3 space-y-2.5">
 <div className="flex items-center justify-between">
 <span className="text-[10px] font-black uppercase text-[#38bdf8] bg-[#1e2838] px-2 py-0.5 border border-[#2b3c54]">
 Active Adapted Facility
 </span>
 <span className="text-[10px] text-[#6b7280]">
 {new Date(adaptedInfo.adaptedAt).toLocaleTimeString()}
 </span>
 </div>

 <div className="flex items-center gap-2 pt-1">
 <div className="p-2 bg-[#1e2533] border border-[#303f54] text-[#38bdf8]">
 <Hammer className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-black text-base text-white">{adaptedInfo.name}</h3>
 <div className="text-[11px] text-[#9ca3af]">{activeDef.description}</div>
 </div>
 </div>

 {/* Construction Progress Over Time (§4.6) */}
 {adaptedInfo.constructionStatus === 'in_progress' ? (
 (() => {
 const workOrder = settlement.constructionOrders?.find(
 (o) => String(o.buildingId) === String(building.id)
 );
 const isTraveling = workOrder?.state === 'traveling';
 const isPaused = workOrder?.state === 'paused_materials';
 const isReturning = workOrder?.state === 'returning';

 return (
 <div className="bg-amber-950/30 border border-amber-500/50 p-2.5 space-y-2">
 <div className="flex justify-between items-center text-xs">
 <span className="font-bold text-amber-300 flex items-center gap-1.5">
 <Hammer className="w-3.5 h-3.5 animate-bounce text-amber-400" />
 {isTraveling
 ? 'Workers En Route'
 : isPaused
 ? 'Construction Paused'
 : isReturning
 ? 'Workers Returning'
 : `Under Construction (${Math.round(adaptedInfo.constructionProgress || 0)}%)`}
 </span>
 <span className="text-[10px] text-slate-300">
 {workOrder?.workerCount || adaptedInfo.assignedWorkers || 0} Workers
 </span>
 </div>

 <div className="w-full bg-slate-800 h-2 overflow-hidden">
 <div
 className={`h-full transition-all duration-300 ${
 isPaused ? 'bg-rose-500' : isTraveling ? 'bg-sky-400' : 'bg-amber-400'
 }`}
 style={{ width: `${Math.min(100, adaptedInfo.constructionProgress || 0)}%` }}
 />
 </div>

 {workOrder && (
 <div className="bg-slate-900/80 p-2 border border-slate-800 rounded text-[10px] space-y-1">
 <div className="text-slate-400 flex justify-between">
 <span>Materials Allocated:</span>
 <span className="text-amber-300 font-mono">
 {Math.round(workOrder.deductedCost.wood)}/{workOrder.totalCost.wood}W •{' '}
 {Math.round(workOrder.deductedCost.metal)}/{workOrder.totalCost.metal}M •{' '}
 {Math.round(workOrder.deductedCost.bricks)}/{workOrder.totalCost.bricks}B
 </span>
 </div>
 <div className="text-slate-400 text-[10px]">
 {isTraveling
 ? 'Crew is walking from HQ to the construction site.'
 : isPaused
 ? '⚠️ Insufficient stockpile materials to continue building.'
 : isReturning
 ? 'Final inspection complete. Crew returning to HQ.'
 : 'Workers actively constructing and deducting materials as work advances.'}
 </div>
 </div>
 )}
 </div>
 );
 })()
 ) : (
 <div className="px-2 py-1 bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 text-[10px] flex items-center gap-1.5 font-bold">
 <Check className="w-3.5 h-3.5" />
 Construction Complete & Operational
 </div>
 )}

 {/* Scaled Capacity Details (§7.1) */}
 <div className="bg-[#0e1117] p-2.5 border border-[#202836] space-y-1.5 text-[11px]">
 <div className="flex justify-between items-center">
 <span className="text-[#9ca3af]">Scalable Capacity:</span>
 <span className="font-black text-[#4ade80] text-sm">
 {adaptedInfo.maxCapacity} {adaptedInfo.capacityUnit}
 </span>
 </div>
 <div className="w-full bg-[#1b2230] h-2 overflow-hidden">
 <div className="bg-[#22c55e] h-full" style={{ width: '35%' }} />
 </div>
 <div className="flex justify-between text-[10px] text-[#6b7280]">
 <span>Formula: {activeDef.capacityLabel}</span>
 </div>
 </div>

 {/* Appointed Facility Head (§4.6) */}
 <div className="bg-[#0e1117] p-2.5 border border-[#202836] space-y-2">
 <div className="flex items-center justify-between text-[11px]">
 <span className="text-[#9ca3af] font-semibold">Appointed Facility Head (§4.6):</span>
 {currentHead && (
 <button
 onClick={() => onVacateSurvivorRole(currentHead.id)}
 className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
 >
 <RotateCcw className="w-3 h-3" />
 Vacate
 </button>
 )}
 </div>

 {currentHead ? (
 <div className="p-2 bg-slate-900 border border-purple-500/40 flex items-center justify-between">
 <div>
 <div className="text-xs font-bold text-purple-300">{currentHead.name}</div>
 <div className="text-[10px] text-slate-400">
 {adaptedInfo.assignedHeadTitle || 'Facility Head'} (Production: {currentHead.stats.production})
 </div>
 </div>
 <Award className="w-4 h-4 text-purple-400" />
 </div>
 ) : (
 <div>
 {!isAppointingHead ? (
 <button
 onClick={() => setIsAppointingHead(true)}
 className="w-full py-1.5 px-2 bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-500/40 text-indigo-300 text-[11px] font-semibold flex items-center justify-center gap-1.5"
 >
 <UserPlus className="w-3.5 h-3.5" />
 Appoint Specialist as Head (+Efficiency Bonus)
 </button>
 ) : (
 <div className="space-y-1.5 p-2 bg-slate-900 border border-indigo-500/50">
 <div className="text-[10px] text-slate-300 font-semibold">Select Named Survivor:</div>
 <div className="space-y-1 max-h-32 overflow-y-auto">
 {settlement.namedSurvivors.map((s) => (
 <button
 key={s.id}
 onClick={() => {
 onAppointHead(s.id, adaptedInfo.buildingId, getDefaultHeadTitle(adaptedInfo.typeId));
 setIsAppointingHead(false);
 }}
 className="w-full p-1.5 text-left text-[10px] bg-slate-800 hover:bg-indigo-900/70 border border-slate-700 flex items-center justify-between"
 >
 <span>{s.name}</span>
 <span className="text-[9px] text-amber-300 font-mono">
 Prod: {s.stats.production}
 </span>
 </button>
 ))}
 </div>
 <button
 onClick={() => setIsAppointingHead(false)}
 className="text-[9px] text-slate-400 hover:text-slate-200 mt-1"
 >
 Cancel
 </button>
 </div>
 )}
 </div>
 )}
 </div>

 {/* Durability & Material Repair Section (§5) */}
 <div className="bg-[#0e1117] p-2.5 border border-[#202836] space-y-2">
 <div className="flex items-center justify-between text-[11px]">
 <span className="text-[#9ca3af] font-semibold flex items-center gap-1.5">
 <Shield className="w-3.5 h-3.5 text-[#CBD5E1]" />
 Structure Durability:
 </span>
 <span
 className={`font-mono font-bold ${
 adaptedInfo.currentDurability < adaptedInfo.maxDurability * 0.5
 ? 'text-rose-400 animate-pulse'
 : adaptedInfo.currentDurability < adaptedInfo.maxDurability
 ? 'text-amber-400'
 : 'text-emerald-400'
 }`}
 >
 {adaptedInfo.currentDurability} / {adaptedInfo.maxDurability} HP
 </span>
 </div>

 <div className="w-full bg-slate-800 h-2 overflow-hidden">
 <div
 className={`h-full transition-all duration-300 ${
 adaptedInfo.currentDurability / adaptedInfo.maxDurability > 0.5
 ? 'bg-emerald-500'
 : adaptedInfo.currentDurability / adaptedInfo.maxDurability > 0.25
 ? 'bg-amber-500'
 : 'bg-rose-500'
 }`}
 style={{
 width: `${Math.max(
 0,
 (adaptedInfo.currentDurability / adaptedInfo.maxDurability) * 100
 )}%`,
 }}
 />
 </div>

 {/* Repair Button if Damaged */}
 {adaptedInfo.currentDurability < adaptedInfo.maxDurability && (
 <div className="pt-1.5 space-y-1.5">
 {(() => {
 const repairCost = calculateBuildingRepairCost(adaptedInfo);
 const hasMaterials =
 settlement.stockpile.materials.wood >= repairCost.woodCost &&
 settlement.stockpile.materials.metal >= repairCost.metalCost &&
 settlement.stockpile.materials.bricks >= repairCost.bricksCost;

 return (
 <div className="p-2 bg-amber-950/30 border border-amber-500/50 space-y-1.5 text-[10px]">
 <div className="text-amber-300 font-bold flex items-center gap-1">
 <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
 Structure Damaged from Infected Assault
 </div>
 <div className="text-slate-300">
 Repair Cost: {repairCost.woodCost} Wood, {repairCost.metalCost} Metal,{' '}
 {repairCost.bricksCost} Bricks
 </div>
 <button
 id="repair-building-btn"
 onClick={() => onRepairBuilding && onRepairBuilding(building.id)}
 disabled={!hasMaterials}
 className={`w-full py-1.5 font-bold uppercase flex items-center justify-center gap-1.5 transition-colors ${
 hasMaterials
 ? 'bg-amber-600 hover:bg-amber-500 text-slate-900 cursor-pointer'
 : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
 }`}
 >
 <Hammer className="w-3.5 h-3.5" />
 <span>Repair Structure ({repairCost.missingHp} HP)</span>
 </button>
 </div>
 );
 })()}
 </div>
 )}
 </div>

 <div className="grid grid-cols-2 gap-2 text-[10px] bg-[#0e1117] p-2 border border-[#202836]">
 <div>
 <span className="text-[#6b7280]">Durability:</span>{' '}
 <span className="font-bold text-white">
 {adaptedInfo.currentDurability} / {adaptedInfo.maxDurability}
 </span>
 </div>
 <div>
 <span className="text-[#6b7280]">Defense Score:</span>{' '}
 <span className="font-bold text-[#38bdf8]">+{adaptedInfo.defenseRating}</span>
 </div>
 </div>
 </div>

 {/* Dismantle Button */}
 <button
 onClick={() => onDismantle(building.id)}
 className="w-full py-2 bg-[#2a171a] hover:bg-[#3d1e23] border border-[#ef4444] text-[#ef4444] hover:text-white text-[11px] font-bold uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
 >
 <Trash2 className="w-3.5 h-3.5" />
 <span>Dismantle Structure (Reclaim 50% Materials)</span>
 </button>
 </div>
 )}

 {/* CASE 3: Building is Adaptable Real Structure (§7.1, §7.2) */}
 {!isHQ && !adaptedInfo && (
 <div className="space-y-3">
 {/* Search & Secure Building Action */}
 <div className="p-3 bg-[#131922] border border-[#475569]/40 space-y-2">
 <div className="flex items-center justify-between text-xs">
 <span className="font-bold text-[#CBD5E1] flex items-center gap-1.5">
 <Search className="w-3.5 h-3.5 text-[#CBD5E1]" />
 Building Recon & Scavenge
 </span>
 <span className="text-[10px] text-slate-400">Tactical Expedition</span>
 </div>
 <p className="text-[11px] text-slate-300">
 Dispatch an active squad to travel here, search the premises for food, gear, and materials, and return loot back to the settlement HQ stockpile.
 </p>
 <button
 id="search-building-ambush-btn"
 onClick={() => onSearchInfestedBuilding && onSearchInfestedBuilding(building)}
 className="w-full py-2 bg-[#334155]/30 hover:bg-[#334155]/50 border border-[#475569]/50 text-[#E8E8E8] font-bold text-xs uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
 >
 <Crosshair className="w-3.5 h-3.5 text-[#CBD5E1]" />
 <span>Dispatch Squad to Scavenge</span>
 </button>
 </div>

 
 </div>
 )}
 </div>
 </div>
 );
};

