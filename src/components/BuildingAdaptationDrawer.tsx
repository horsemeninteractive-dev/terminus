import React, { useState } from 'react';
import {
 ArrowDown,
 ArrowUp,
 Award,
 Check,
 ChevronDown,
 ChevronUp,
 Crosshair,
 Flame,
 Hammer,
 HeartPulse,
 ListOrdered,
 Maximize2,
 RotateCcw,
 Scissors,
 Search,
 Shield,
 ShieldAlert,
 Sprout,
 Trash2,
 UserPlus,  Users,
  X,
  Droplets,
  Sun,
  Zap,
  BatteryCharging,
  FlaskConical,
} from 'lucide-react';
import { CISTERN_WEATHER_MULT } from '../services/waterService';
import {
 calculatePolygonArea,
 FUNCTIONAL_BUILDING_DEFINITIONS,
 getCanonicalDefenseDef,
 getBuildingWorkerSlots,
} from '../data/functionalBuildings';
import { RESEARCH_TREE_NODES } from '../data/researchTreeData';
import { CATEGORY_COLORS } from '../render/BuildingRenderer';
import {
  humanLocationLabel,
  resolveBuildingLocation,
} from '../services/osmLocationResolver';
import { calculateBuildingRepairCost } from '../services/combatService';
import {
  WeaponItemId,
  WEAPON_CATALOG,
  getArmorDefinition,
  getWeaponDefinition,
} from '../types/combat';
import { getBuildingLockStatus } from '../services/researchService';
import { getPrimaryHQ, isHQOperational } from '../services/buildingOperational';
import {
  getAutomatedRepairConfig,
  getDefaultHeadTitle,
  getPrioritizedConstructionSites,
} from '../services/populationService';
import { BuildingPolygon } from '../types/map';
import { HiddenSurvivorGroup } from '../types/population';
import {
 AdaptedBuilding,
 AutomatedRepairConfig,
 BuildingSection,
 FunctionalBuildingTypeId,
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
 /** Tower armament: equips/unequips a ranged weapon from the colony armory. */
 onAssignTowerWeapon?: (buildingId: string | number, weaponId: WeaponItemId | null) => void;
 onSearchInfestedBuilding?: (building: BuildingPolygon) => void;
 onReorderConstruction?: (buildingId: string | number, direction: 'up' | 'down') => void;
 onExpandAdaptation?: (buildingId: string | number, targetPct: number) => void;
 onSetRecipe?: (buildingId: string | number, recipeId: string) => void;
 onSetFertilize?: (buildingId: string | number, enabled: boolean) => void;
 /** §IFZ Repairmen Shop: which maintenance bands the crews may repair. */
 onSetRepairmenBands?: (bands: AutomatedRepairConfig) => void;
 /** §7.1 split sections of this source building (IFZ footprint splitting). */
 buildingSections?: BuildingSection[];
 /** Per-section adaptations currently in the settlement (keyed by section id). */
 sectionAdaptations?: AdaptedBuilding[];
 onSplitBuilding?: (bldg: BuildingPolygon, parts: 2 | 3 | 4) => void;
 /** Adapts a facility type into ONE split section. */
 onAdaptSection?: (bldg: BuildingPolygon, sectionId: string, typeId: FunctionalBuildingTypeId) => void;
 /** Deadapts a single split section (removes only that adaptation). */
 onDeadaptSection?: (sectionId: string) => void;  /** Wounded squad members currently inside this facility's treatment radius. */
  nearbyWounded?: number;
  /** Shooting Range: order / cancel a squad's training course (§Terminus). */
  onStartTraining?: (squadId: string) => void;
  onStopTraining?: (squadId: string) => void;
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
 onAssignTowerWeapon,
 onSearchInfestedBuilding,
 onReorderConstruction,
 onExpandAdaptation,
 onSetRecipe,
 onSetFertilize,
 onSetRepairmenBands,
 buildingSections = [],
 sectionAdaptations = [],
 onSplitBuilding,
 onAdaptSection,    onDeadaptSection,
    nearbyWounded,
    onStartTraining,
    onStopTraining,
}) => {
 const [isAppointingHead, setIsAppointingHead] = useState(false);
 const [isMinimized, setIsMinimized] = useState(false);

 // Default facility type for one-click section conversion. The player can also
 // arm a different type from the Build menu and paint across that section's
 // footprint in the world.
 const defaultSectionType: FunctionalBuildingTypeId = 'shelter_bunkhouse';

 if (!building) return null;

 const footprintArea = Math.round(calculatePolygonArea(building.polygon));
 const resolvedLocation = resolveBuildingLocation(building);
 const resolvedLabel = humanLocationLabel(resolvedLocation);
 const levels = Math.max(1, building.levels || Math.round(building.height / 3.5));
 const totalFloorArea = footprintArea * levels;
 const volume = footprintArea * building.height;

 // If building is already adapted, get current stats
 const activeDef = adaptedInfo ? FUNCTIONAL_BUILDING_DEFINITIONS[adaptedInfo.typeId] : null; // Appointed Head
 const currentHead = adaptedInfo?.assignedHeadId
   ? settlement.namedSurvivors.find((s) => s.id === adaptedInfo.assignedHeadId)
   : null;

 // Construction queue position: index within all queued sites, and whether
 // this site is inside the active building window.
 const constructionQueue = getPrioritizedConstructionSites(settlement);
 const queueIndex = adaptedInfo
   ? constructionQueue.all.findIndex(
       (b) => String(b.buildingId) === String(adaptedInfo.buildingId)
     )
   : -1;
 const isQueueActive =
   queueIndex >= 0 && queueIndex < constructionQueue.active.length;

 

  if (isMinimized) {
    return (
      <div className="relative z-40 w-full md:w-[min(94vw,340px)] shrink-0 bg-[#07090C]/95 border-2 border-[#10B981] p-2.5 flex items-center justify-between font-mono text-white shadow-2xl backdrop-blur-md clip-tactical-bracket pointer-events-auto animate-in fade-in duration-150">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-3 h-3 shrink-0 inline-block"
            style={{
              backgroundColor: `#${CATEGORY_COLORS[building.type]?.accent.toString(16).padStart(6, '0')}`,
            }}
          />
          <div className="flex flex-col min-w-0">
            <span className="font-heading font-bold text-xs uppercase truncate text-white">
              {isHQ ? 'COMMAND HQ' : building.name || activeDef?.name || resolvedLabel || 'Structure'}
            </span>
            <div className="text-[10px] text-[#9ca3af]">
              {adaptedInfo ? (
                <span className="text-[#4BEFA8] uppercase font-bold">{activeDef?.name || 'Adapted Facility'}</span>
              ) : (
                <span>OSM: {resolvedLabel} ({footprintArea}m²)</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={() => setIsMinimized(false)}
            title="Expand Building Panel"
            className="p-1 text-[#10B981] hover:text-white bg-[#064E3B]/40 hover:bg-[#064E3B] border border-[#10B981] transition-colors"
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
    <div className="relative z-40 w-full md:w-[min(94vw,340px)] shrink-0 max-h-[50vh] md:max-h-[70vh] overflow-y-auto bg-[#07090C]/95 border-2 border-[#1E293B] clip-sidebar-edge-right surface-bevel backdrop-blur-md flex flex-col font-mono pointer-events-auto text-white shadow-2xl">
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
 {isHQ ? 'COMMAND HQ' : building.name || resolvedLabel || 'Real Structure'}
 </h2>
 <div className="text-[10px] text-[#9ca3af]">
 OSM: <span className="text-[#fcd34d] uppercase font-bold">{resolvedLabel}</span> (#{building.id})
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
 <div className="font-black text-[#4BEFA8] text-xs">{footprintArea} m²</div>
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
 )}{/* CASE 1: Building is HQ */}
  {isHQ && (() => {
  const hqRecord = getPrimaryHQ(settlement);
  const hqBreached = !hqRecord || !isHQOperational(hqRecord);
  const hqDurabilityPct = hqRecord && hqRecord.maxDurability > 0
    ? Math.max(0, Math.min(100, (hqRecord.currentDurability / hqRecord.maxDurability) * 100))
    : 0;
  return (
  <div className={hqBreached ? 'bg-[#2a1215] border border-red-600 p-3 text-center space-y-2' : 'bg-[#18241b] border border-[#22c55e] p-3 text-center space-y-2'}>
    <div className={hqBreached ? 'w-10 h-10 bg-red-950/40 border border-red-600 flex items-center justify-center mx-auto text-red-400' : 'w-10 h-10 bg-[#15803d]/30 border border-[#22c55e] flex items-center justify-center mx-auto text-[#4ade80]'}>
    <Shield className="w-6 h-6" />
    </div>
    <div className={hqBreached ? 'font-black text-sm text-red-400 uppercase' : 'font-black text-sm text-[#4ade80] uppercase'}>
    {hqBreached ? 'Command Center Breached' : 'Settlement Command Headquarters'}
    </div>
    <p className="text-[11px] text-[#d1d5db]">
    {hqBreached
      ? 'The command post has been overrun. It provides no storage, shelter, defense or squad capacity — secure the sector and re-establish the HQ at a new structure to restore the colony.'
      : 'Central command nexus of the outpost. Provides fortified defense perimeter, default survivor housing, and base inventory storage.'}
    </p>
    <div className="text-[10px] text-left pt-2 border-t border-[#2d4734] space-y-1.5">
    <div className="flex justify-between items-center">
      <span className="text-[#6b7280]">Command Center Integrity:</span>
      <span className={hqBreached ? 'font-bold text-red-400' : 'font-bold text-white'}>
      {hqRecord ? `${Math.max(0, Math.round(hqRecord.currentDurability))} / ${hqRecord.maxDurability} HP` : '—'}
      </span>
    </div>
    <div className="h-1.5 bg-black/40 rounded-sm overflow-hidden">
      <div
      className={hqBreached ? 'h-full bg-red-600' : hqDurabilityPct > 50 ? 'h-full bg-[#22c55e]' : 'h-full bg-amber-500'}
      style={{ width: `${hqDurabilityPct}%` }}
      />
    </div>
    {!hqBreached && (
      <div className="grid grid-cols-2 gap-2">
      <div>
        <span className="text-[#6b7280]">Living Quarters:</span>{' '}
        <span className="font-bold text-white">{hqRecord?.maxCapacity} Beds</span>
      </div>
      <div>
        <span className="text-[#6b7280]">Defense Bonus:</span>{' '}
        <span className="font-bold text-[#4ade80]">+{hqRecord?.defenseRating} Def</span>
      </div>
      </div>
    )}
    {!hqBreached && (
      <>
      <div className="grid grid-cols-2 gap-2">
      <div>
        <span className="text-[#6b7280]">Command Complement:</span>{' '}
        <span className="font-bold text-white">{settlement.squadCapacity} Squads</span>
      </div>
      <div>
        <span className="text-[#6b7280]">Storage Vault:</span>{' '}
        <span className="font-bold text-white">850 Units</span>
      </div>
      </div>
      <p className="text-[9px] leading-relaxed text-[#7d8a96]">
      FIXED COMMAND CAPACITY — this primary HQ commands {settlement.squadCapacity} squads and an 850-unit vault regardless of its footprint. A larger starting HQ grants more durability, beds and defense, but never more command slots. Expand by establishing additional HQs or Squad Quarters, which scale with building size.
      </p>
      </>
    )}
    </div>
  </div>
  );
  })()}

 {/* CASE 2: Building is Already Adapted */}
 {!isHQ && adaptedInfo && activeDef && (
 <div className="space-y-3">
 <div className="bg-[#0c2f22] border-2 border-[#14532d] p-3 space-y-2.5">
 <div className="flex items-center justify-between">
 <span className="text-[10px] font-black uppercase text-[#4BEFA8] bg-[#1e2838] px-2 py-0.5 border border-[#2b3c54]">
 Active Adapted Facility
 </span>
 <span className="text-[10px] text-[#6b7280]">
 {new Date(adaptedInfo.adaptedAt).toLocaleTimeString()}
 </span>
 </div>

 <div className="flex items-center gap-2 pt-1">
 <div className="p-2 bg-[#1e2533] border border-[#303f54] text-[#4BEFA8]">
 <Hammer className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-black text-base text-white">{adaptedInfo.name}</h3>
 <div className="text-[11px] text-[#9ca3af]">{activeDef.description}</div>
 </div>
 </div>

 {/* Construction Progress Over Time (§4.6) */}
 {adaptedInfo.constructionStatus === 'in_progress' || adaptedInfo.constructionStatus === 'planned' ? (
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

 {/* Construction Queue Position & Priority Controls */}
 {queueIndex >= 0 && onReorderConstruction && constructionQueue.all.length > 1 ? (
 <div className="flex items-center justify-between gap-2 bg-slate-900/80 border border-slate-800 rounded px-2 py-1.5">
 <div className="flex items-center gap-1.5 text-[10px] min-w-0">
 <ListOrdered className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
 <span className="text-slate-300">
 QUEUE {queueIndex + 1} OF {constructionQueue.all.length}
 </span>
 <span className={`font-bold ${isQueueActive ? 'text-emerald-400' : 'text-amber-400'}`}>
 {isQueueActive ? 'BUILDING' : 'QUEUED'}
 </span>
 </div>
 <div className="flex items-center gap-1 shrink-0">
 <button
 onClick={() => onReorderConstruction(adaptedInfo.buildingId, 'up')}
 disabled={queueIndex === 0}
 title="Move earlier in the construction queue"
 className="w-6 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors"
 >
 <ArrowUp className="w-3.5 h-3.5" />
 </button>
 <button
 onClick={() => onReorderConstruction(adaptedInfo.buildingId, 'down')}
 disabled={queueIndex === constructionQueue.all.length - 1}
 title="Move later in the construction queue"
 className="w-6 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors"
 >
 <ArrowDown className="w-3.5 h-3.5" />
 </button>
 </div>
 </div>
 ) : null}

 {workOrder && (
 <div className="bg-slate-900/80 p-2 border border-slate-800 rounded text-[10px] space-y-1">
 <div className="text-slate-400 flex justify-between">
 <span>Materials Allocated:</span>
 <span className="text-amber-300 font-mono">
 {Math.round(workOrder.deductedCost.wood)}/{workOrder.totalCost.wood}W •{' '}
 {Math.round(workOrder.deductedCost.metal)}/{workOrder.totalCost.metal}M •{' '}
 {Math.round(workOrder.deductedCost.bricks)}/{workOrder.totalCost.bricks}B
 {workOrder.totalCost.tools ? <> •{' '}{Math.round(workOrder.deductedCost.tools || 0)}/{workOrder.totalCost.tools}T</> : null}
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

 {/* §IFZ Repairmen Shop — player-chosen repair bands. The automated crews
 repair only the structural categories the player enables; disabling a band
 stops crews servicing those buildings (Emergency = HQ/gates/towers/
 generators/hospitals, High = warehouse/water/research, Normal = production,
 Low = housing). */}
 {activeDef &&
   adaptedInfo.typeId === 'repairmen_shop' &&
   adaptedInfo.constructionStatus === 'completed' &&
   onSetRepairmenBands && (
   <div className="bg-[#0e1117] p-2.5 border border-[#202836] space-y-1.5 text-[11px]">
    <div className="flex justify-between items-center">
     <span className="text-[#9ca3af] font-semibold">Automated Repair Bands:</span>
     <span className="text-[10px] text-[#6b7280]">CREWS SERVICE ENABLED BANDS ONLY</span>
    </div>
    {(() => {
     const config = getAutomatedRepairConfig(settlement);
     const bands: { key: keyof AutomatedRepairConfig; label: string; hint: string }[] = [
       { key: 'emergency', label: 'EMERGENCY', hint: 'HQ · Gates · Towers · Generators · Hospital' },
       { key: 'high', label: 'HIGH', hint: 'Warehouse · Cistern · Medbay · Research' },
       { key: 'normal', label: 'NORMAL', hint: 'Production · Farming · Crafting' },
       { key: 'low', label: 'LOW', hint: 'Housing & Civilian' },
     ];
     return (
      <div className="grid grid-cols-2 gap-1.5">
       {bands.map((band) => {
        const on = config[band.key];
        return (
         <button
          key={band.key}
          onClick={() => onSetRepairmenBands({ ...config, [band.key]: !on })}
          className={`p-2 border text-left transition-colors ${
           on
            ? 'bg-[#0c2f22] border-[#10b981] text-emerald-200'
            : 'bg-[#12161d] border-[#28303c] text-slate-500 hover:border-[#10B981]'
          }`}
         >
          <div className="flex items-center justify-between gap-1">
           <span className="font-bold text-[10px]">{band.label}</span>
           <span className={`text-[9px] font-bold ${on ? 'text-emerald-300' : 'text-[#6b7280]'}`}>{on ? 'REPAIR ✓' : 'OFF'}</span>
          </div>
          <div className="text-[8px] font-mono text-[#718096] mt-0.5 leading-tight">{band.hint}</div>
         </button>
        );
       })}
      </div>
     );
    })()}
    <div className="text-[9px] text-[#6b7280]">
     Crews prioritise the most damaged structure within enabled bands — disable
     a band to leave those buildings unrepaired and conserve materials.
    </div>
   </div>
  )}

 {/* §7.2 Production Recipe — multi-recipe facilities run the player's choice. */}
 {activeDef && (activeDef.recipes?.length || 0) > 1 &&
   adaptedInfo.constructionStatus === 'completed' &&
   onSetRecipe && (
   <div className="bg-[#0e1117] p-2.5 border border-[#202836] space-y-1.5 text-[11px]">
    <div className="flex justify-between items-center">
     <span className="text-[#9ca3af] font-semibold">Production Recipe:</span>
     {adaptedInfo.selectedRecipeId ? (
      <span className="text-[10px] text-[#6b7280]">Player set</span>
     ) : (
      <span className="text-[10px] font-bold text-amber-400 animate-pulse">
      CHOOSE PRODUCTION — IDLE
      </span>
     )}
    </div>
    {activeDef.recipes!.map((r) => {
     const fmtFlow = (flows: { resource: string; amountPerDay: number }[]) =>
       flows.map((f) => `${f.amountPerDay} ${f.resource.replace(/_/g, ' ')}`).join(' + ');
     const lock = r.researchRequirement
       ? getBuildingLockStatus(settlement, r.researchRequirement)
       : { unlocked: true, requiredName: '' };
     const locked = !lock.unlocked;
     // §IFZ gear lines (Arms/Protective Gear factories) end in a real armory
     // item instead of a stockpile resource — show the manufactured gear name.
     const gearName = r.gear
       ? r.gear.kind === 'weapon'
         ? getWeaponDefinition(r.gear.itemId).name
         : getArmorDefinition(r.gear.itemId).name
       : null;
     // No recipe is "active" until the player picks one — the line only ever
     // runs an explicit choice (production never auto-selects).
     const isActive = !locked && adaptedInfo.selectedRecipeId === r.id;
     return (
      <button
       key={r.id}
       onClick={() => onSetRecipe(adaptedInfo.buildingId, r.id)}
       disabled={isActive || locked}
       title={locked ? `Requires research: ${lock.requiredName}` : undefined}
       className={`w-full p-2 border text-left transition-colors ${
        isActive
         ? 'bg-[#0c2f22] border-[#10b981] text-emerald-200 cursor-default'
         : locked
         ? 'bg-[#0d0f13] border-[#232830] text-slate-500 cursor-not-allowed opacity-80'
         : 'bg-[#12161d] border-[#28303c] text-slate-300 hover:border-[#10B981] hover:text-white cursor-pointer'
       }`}
      >
       <div className="flex items-center justify-between">
        <span className="font-bold text-xs">{r.name}</span>
        {isActive && <span className="text-[9px] font-bold text-emerald-300">ACTIVE</span>}
       </div>
       <div className="text-[9px] text-slate-400 mt-0.5 font-mono">
        {r.inputs.length ? fmtFlow(r.inputs) : 'No inputs'} →{' '}
        {locked
         ? `REQUIRES ${lock.requiredName.toUpperCase()}`
         : gearName
         ? `MANUFACTURE ${gearName.toUpperCase()}`
         : fmtFlow(r.outputs)}
       </div>
      </button>
     );
    })}
    <div className="text-[9px] text-[#6b7280]">
     The crew runs only the selected recipe — if its inputs run short the
     building idles instead of silently switching recipes.
    </div>
   </div>
  )}

 {/* §7.2 Fertilizer — a per-plot choice that consumes stockpile fertilizer. */}
 {activeDef &&
   (adaptedInfo.typeId === 'field' ||
     adaptedInfo.typeId === 'vast_field' ||
     adaptedInfo.typeId === 'greenhouse' ||
     adaptedInfo.typeId === 'greenhouse_hydro') &&
   adaptedInfo.constructionStatus === 'completed' &&
   onSetFertilize && (
   <div className="bg-[#0e1117] p-2.5 border border-[#202836] space-y-1.5 text-[11px]">
    <div className="flex items-center justify-between">
     <span className="text-[#9ca3af] font-semibold">Fertilization:</span>
     <span className="text-[10px] font-mono text-[#6b7280]">
      Stockpile: {Math.floor((settlement.stockpile.materials.fertilizer || 0) * 100) / 100}
     </span>
    </div>
    <button
     onClick={() => onSetFertilize(adaptedInfo.buildingId, !adaptedInfo.isFertilized)}
     className={`w-full py-1.5 px-2 border text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
      adaptedInfo.isFertilized
       ? 'bg-[#0c2f22] border-[#10b981] text-emerald-200 hover:bg-[#103a2b]'
       : 'bg-[#12161d] border-[#28303c] text-slate-300 hover:border-[#10b981] hover:text-emerald-200'
     }`}
    >
     {adaptedInfo.isFertilized
      ? <><Sprout className="w-3.5 h-3.5" /> FERTILIZING THIS PLOT — STOP</>
      : <><Sprout className="w-3.5 h-3.5" /> APPLY FERTILIZER (+75% YIELD)</>}
    </button>
    <div className="text-[9px] text-[#6b7280]">
     A fertilized plot consumes 0.5 Fertilizer per crop cycle from the
     stockpile; with an empty stock the cycle simply runs unfertilized.{" "}
     {adaptedInfo.isFertilized &&
      (settlement.stockpile.materials.fertilizer || 0) < 0.5 && (
       <span className="text-amber-400">Out of fertilizer — next cycle runs unfertilized.</span>
      )}
    </div>
   </div>
  )}

 {/* §5.3 Medical care — beds, assigned nurses, patient queue. */}
 {activeDef &&
   ((activeDef.medicalProperties?.treatsWounded) ||
     adaptedInfo.typeId === 'medbay' ||
     adaptedInfo.typeId === 'infirmary_clinic' ||
     adaptedInfo.typeId === 'hospital') &&
   adaptedInfo.constructionStatus === 'completed' && (
   <div className="bg-[#0e1117] p-2.5 border border-[#202836] space-y-1.5 text-[11px]">
    <div className="flex items-center justify-between">
     <span className="text-[#9ca3af] font-semibold flex items-center gap-1.5">
      <HeartPulse className="w-3.5 h-3.5 text-rose-400" /> Medical Care
     </span>
     <span className="text-[10px] font-mono text-[#6b7280]">
      {adaptedInfo.assignedWorkers || 0} NURSE{adaptedInfo.assignedWorkers === 1 ? '' : 'S'}
     </span>
    </div>
    <div className="flex justify-between text-[10px] font-mono text-[#94a3b8]">
     <span>BEDS:
      <span className="text-white font-bold ml-1">
       {activeDef.medicalProperties?.bedCapacity ?? Math.floor(adaptedInfo.maxCapacity || 0)}
      </span>
     </span>
     {typeof nearbyWounded === 'number' && nearbyWounded > 0 ? (
      <span>WOUNDED IN FACILITY: <span className="text-rose-300 font-bold">{nearbyWounded}</span></span>
     ) : (
      <span>NO WOUNDED PRESENT</span>
     )}
    </div>
    <div className="text-[9px] text-[#6b7280]">
     Each assigned nurse attends one admitted patient at +0.1 HP per in-game
     hour; wounded beyond the bed count wait in queue, and an unstaffed
     facility heals nobody. Park wounded squads inside the building to treat
     them.
    </div>
   </div>
  )}

  {/* §10 Scientific Research & Analysis — staffed scientists, active research project, and daily SciMat production */}
  {activeDef &&
    (adaptedInfo.typeId === 'research_center' || adaptedInfo.typeId === 'research_lab') &&
    adaptedInfo.constructionStatus === 'completed' && (() => {
      const slots = getBuildingWorkerSlots(adaptedInfo);
      const staffed = Math.min(adaptedInfo.assignedWorkers || 0, slots);
      const activeProject = settlement.research?.activeResearchId
        ? RESEARCH_TREE_NODES[settlement.research.activeResearchId]
        : null;
      const progressSec = settlement.research?.activeProgressSec || 0;
      const progressPct = activeProject
        ? Math.min(100, (progressSec / activeProject.baseTimeSec) * 100)
        : 0;
      const isPowered = (settlement.powerState?.poweredBuildingIds || []).includes(String(adaptedInfo.buildingId));
      const dailyOutput = ((staffed / Math.max(1, slots)) * (activeDef.outputs?.[0]?.amountPerDay ?? 8)).toFixed(1);

      return (
        <div className="bg-[#0e1117] p-2.5 border border-[#3b3c64] space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-[#a5b4fc] font-semibold flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5 text-[#818cf8]" /> Scientific Research
            </span>
            <span className="text-[10px] font-mono text-[#818cf8] font-bold">
              {staffed} / {slots} SCIENTIST{slots === 1 ? '' : 'S'}
            </span>
          </div>

          <div className="flex justify-between text-[10px] font-mono text-[#94a3b8]">
            <span>SYNTHESIS:
              <span className="text-emerald-300 font-bold ml-1">+{dailyOutput} SciMat/day</span>
            </span>
            <span>POWERED:
              <span className="text-white font-bold ml-1">
                {isPowered ? 'YES (+50% SPD)' : 'NO'}
              </span>
            </span>
          </div>

          {activeProject ? (
            <div className="p-1.5 bg-[#131628] border border-[#2b2e50] space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-[#cbd5e1] font-bold truncate">PROJECT: {activeProject.name}</span>
                <span className="text-[#818cf8] font-mono font-bold shrink-0">{progressPct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-[#1b1e36] h-1.5 overflow-hidden">
                <div className="h-full bg-[#818cf8]" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 italic">
              No project currently active. Open the Tech Tree (Research) to select a technology to research.
            </div>
          )}

          {staffed === 0 && (
            <div className="p-1.5 bg-amber-950/40 border border-amber-500/40 text-[10px] text-amber-300">
              ⚠️ Unstaffed facility: Assign scientists in the Citizens & Workers menu (bottom-left) to advance research and produce Scientific Materials.
            </div>
          )}

          <div className="text-[9px] text-[#6b7280]">
            Scientists staff research benches during the day shift to advance active projects and formulate Scientific Materials. At night, scientists shelter and active projects hold until dawn.
          </div>
        </div>
      );
    })()}

 {/* §7.1 Partial Adaptation — converted share of the real structure. */}
 <div className="bg-[#0e1117] p-2.5 border border-[#202836] space-y-1.5 text-[11px]">
 <div className="flex justify-between items-center">
 <span className="text-[#9ca3af]">Adaptation Coverage:</span>
 <span className="font-black text-[#4BEFA8] text-sm">
 {adaptedInfo.adaptationPercentage}%
 </span>
 </div>
 <div className="w-full bg-[#1b2230] h-2 overflow-hidden">
 <div
 className="h-full transition-all duration-300"
 style={{
 width: `${Math.min(100, adaptedInfo.adaptationPercentage || 0)}%`,
 background:
 (adaptedInfo.adaptationPercentage || 0) >= 100
 ? 'linear-gradient(90deg,#059669,#10b981)'
 : 'linear-gradient(90deg,#0f766e,#14b8a6)',
 }}
 />
 </div>
 <div className="flex justify-between text-[10px] text-[#6b7280]">
 <span>
 {Math.round(adaptedInfo.adaptedAreaM2 || 0)}m² of{' '}
 {Math.round(adaptedInfo.footprintAreaM2 || 0)}m² footprint
 </span>
 <span>
 {adaptedInfo.maxCapacity} / {adaptedInfo.fullCapacity ?? adaptedInfo.maxCapacity}{' '}
 {adaptedInfo.capacityUnit}
 </span>
 </div>

 {/* Expand a partial conversion to full coverage — cost scales with the
     remaining unadapted area and construction re-queues the crew. */}
 {!adaptedInfo.isFreestanding &&
 (adaptedInfo.adaptationPercentage || 0) < 100 &&
 adaptedInfo.constructionStatus === 'completed' &&
 onExpandAdaptation && (
 <button
 onClick={() => onExpandAdaptation(adaptedInfo.buildingId, 100)}
 title={`Convert the remaining ${(100 - (adaptedInfo.adaptationPercentage || 0))}% of this structure — the crew expands the facility to full ${adaptedInfo.fullCapacity ?? adaptedInfo.maxCapacity} ${adaptedInfo.capacityUnit} capacity.`}
 className="w-full mt-1 py-1.5 px-2 bg-[#059669]/15 hover:bg-[#059669]/30 border border-[#10B981]/50 text-[#10B981] text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
 >
 <Maximize2 className="w-3.5 h-3.5" />
 EXPAND ADAPTATION TO 100%
 </button>
 )}
 </div>

 {/* §7.1 IFZ footprint splitting — divide a large building into independently
     adaptable sections (brick cost for the partition walls). */}
 {!isHQ && !adaptedInfo.isFreestanding && (
 <div className="bg-[#0e1117] p-2.5 border border-[#202836] space-y-1.5 text-[11px]">
  <div className="flex justify-between items-center">
   <span className="text-[#9ca3af] font-semibold flex items-center gap-1.5">
    <Scissors className="w-3.5 h-3.5 text-[#10B981]" /> Sections
   </span>
   <span className="text-[10px] font-mono text-[#6b7280]">
    {buildingSections.length > 0 ? `${buildingSections.length} sections` : 'unsplit'}
   </span>
  </div>

  {buildingSections.length > 0 ? (
   <div className="space-y-1">
    {buildingSections.map((sec, i) => {
     const adapted = sectionAdaptations.find((a) => String(a.buildingId) === String(sec.id));
     return (
      <div key={sec.id} className="p-1.5 bg-[#12161d] border border-[#28303c] flex items-center justify-between gap-1">
       <div className="min-w-0">
        <div className="text-[10px] font-bold text-[#e2e8f0]">
         Section {i + 1}
         {adapted && (
          <span className="ml-1.5 font-mono text-[9px] text-[#10B981]">
           {FUNCTIONAL_BUILDING_DEFINITIONS[adapted.typeId]?.name || adapted.typeId}
          </span>
         )}
        </div>
        <div className="text-[9px] font-mono text-[#6b7280]">
         {Math.round(sec.footprintAreaM2)}m² footprint
         {adapted ? (
          <> • {adapted.maxCapacity} {adapted.capacityUnit} • {adapted.constructionStatus.replace('_', ' ')}</>
         ) : (
          ' • unconverted'
         )}
        </div>
       </div>
       <div className="flex items-center gap-1 shrink-0">
        {!adapted && onAdaptSection && (
         <button
          onClick={() => onAdaptSection(building, sec.id, defaultSectionType)}
          title="Convert this section into a facility (defaults to a Shelter; convert from the Build menu to choose another type)"
          className="px-1.5 py-0.5 text-[9px] font-bold bg-[#059669]/15 hover:bg-[#059669]/30 border border-[#10B981]/50 text-[#10B981] transition-colors"
         >
          CONVERT
         </button>
        )}
        {adapted && onDeadaptSection && (
         <button
          onClick={() => onDeadaptSection(String(sec.id))}
          title="Remove this section's adaptation (the section becomes unconverted)"
          className="px-1.5 py-0.5 text-[9px] font-bold bg-rose-950/30 hover:bg-rose-900/50 border border-rose-500/40 text-rose-300 transition-colors"
         >
          DEADAPT
         </button>
        )}
       </div>
      </div>
     );
    })}
    <div className="text-[9px] text-[#6b7280]">
     Each section adapts independently — arm a facility type from the Build menu,
     then press on the section you want and drag across its footprint to convert it.
    </div>
   </div>
  ) : (
   <>
    <div className="text-[9px] text-[#6b7280]">
     Split this large structure into independently adaptable sections. Partition
     walls cost bricks; afterwards each region converts into its own facility.
    </div>
    {onSplitBuilding && (
     <div className="flex items-center gap-1.5">
      {([2, 3, 4] as const).map((parts) => (
       <button
        key={parts}
        onClick={() => onSplitBuilding(building, parts)}
        title={`Split into ${parts} sections (brick cost for partition walls)`}
        className="flex-1 py-1 text-[10px] font-bold bg-[#12161d] hover:bg-[#1a2332] border border-[#28303c] hover:border-[#10B981] text-[#e2e8f0] transition-colors"
       >
        SPLIT ×{parts}
       </button>
      ))}
     </div>
    )}
   </>
  )}
 </div>
 )}

 {/* Appointed Facility Head (§4.6) */}
 <div className="bg-[#0e1117] p-2.5 border border-[#202836] space-y-2">
 <div className="flex items-center justify-between text-[11px]">
 <span className="text-[#9ca3af] font-semibold">Appointed Facility Head:</span>
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
 disabled={!hasMaterials || adaptedInfo.isUnderRepair}
 className={`w-full py-1.5 font-bold uppercase flex items-center justify-center gap-1.5 transition-colors ${
 hasMaterials
 ? 'bg-amber-600 hover:bg-amber-500 text-slate-900 cursor-pointer'
 : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
 }`}
 >
 <Hammer className="w-3.5 h-3.5" />
 <span>{adaptedInfo.isUnderRepair ? `Repairing (${adaptedInfo.repairProgress || 0}%)` : `Start Repair (${repairCost.missingHp} HP)`}</span>
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
 <span className="font-bold text-[#4BEFA8]">+{adaptedInfo.defenseRating}</span>
 </div>
 </div>

 {/* Water Cistern (§Terminus) — roof-area weather collection readout */}
 {adaptedInfo.typeId === 'water_cistern' && (() => {
 const rec = settlement.waterState?.cisterns.get(adaptedInfo.buildingId);
 if (!rec) return null;
 const mult = CISTERN_WEATHER_MULT[settlement.weather?.currentWeather || 'clear'] || 0;
 const ratePerDay = rec.roofAreaM2 * 0.5 * mult * rec.efficiency;
 return (
 <div className="bg-[#0e1117] p-2.5 border border-[#164E63] space-y-1.5">
 <div className="flex items-center justify-between text-[11px]">
 <span className="text-[#9ca3af] font-semibold flex items-center gap-1.5">
 <Droplets className="w-3.5 h-3.5 text-cyan-400" />
 Rain Catchment
 </span>
 <span className="text-[9px] px-1.5 py-0.5 bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold uppercase">
 {Math.round(rec.currentWater)} / {rec.capacity} L
 </span>
 </div>
 <div className="text-[10px] font-mono text-[#94A3B8]">
 {Math.round(rec.roofAreaM2)} M² ROOF · COLLECTS {ratePerDay >= 0.5 ? `${Math.round(ratePerDay)} L/DAY` : 'NOTHING NOW'}
 </div>
 <div className="w-full h-1.5 bg-[#1A1E24]">
 <div className="h-full bg-[#22D3EE]" style={{ width: `${Math.min(100, (rec.currentWater / rec.capacity) * 100)}%` }} />
 </div>
 <div className="text-[9px] font-mono text-[#718096]">
 {mult > 0
   ? `${settlement.weather?.currentWeather?.toUpperCase() || 'CLEAR'} — ${mult.toFixed(2)}× COLLECTION (${rec.efficiency.toFixed(1)}× EFFICIENCY)`
   : 'CLEAR SKIES — NO COLLECTION. CISTERNS ARE YOUR RAIN BUFFER: BIGGER ROOFS BANK MORE.'}
 </div>
 </div>
 );
 })()}  {/* Generator Station (§Terminus) — fuel → local power grid readout */}
  {adaptedInfo.typeId === 'generator_station' && (() => {
    const rec = settlement.powerState?.generators.get(adaptedInfo.buildingId);
    if (!rec) return null;
    const fuelTotal =
      (settlement.stockpile?.fuel?.gasoline || 0) +
      (settlement.stockpile?.fuel?.diesel || 0) +
      (settlement.stockpile?.fuel?.biofuel || 0);
    return (
      <div className="bg-[#0e1117] p-2.5 border border-[#4D3E00] space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#9ca3af] font-semibold flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            Generator Station
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 border font-bold uppercase ${rec.running ? 'bg-yellow-950 text-yellow-300 border-yellow-800' : 'bg-rose-950 text-rose-300 border-rose-800'}`}>
            {rec.running ? 'Running' : 'Offline'}
          </span>
        </div>
        <div className="text-[10px] font-mono text-[#94A3B8]">
          {rec.powerOutputKw} KW · {rec.powerRadiusM}M RADIUS · BURNS {rec.fuelPerHour} FUEL/HR
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-[#94A3B8]">BUFFER: {Math.round(rec.currentFuel)} / {rec.fuelCapacity}</span>
          <span className="text-[#64748B]">STOCKPILE FUEL: {Math.round(fuelTotal)}</span>
        </div>
        <div className="w-full h-1.5 bg-[#1A1E24]">
          <div className="h-full bg-[#FDE047]" style={{ width: `${Math.min(100, (rec.currentFuel / rec.fuelCapacity) * 100)}%` }} />
        </div>
        <div className="text-[9px] font-mono text-[#718096]">
          {rec.running
            ? 'RUNS ONLY WHILE FACILITIES INSIDE ITS RADIUS NEED POWER — THE BUFFER TOPS UP FROM THE STOCKPILE (GASOLINE → DIESEL → BIOFUEL). NO LOAD, NO BURN.'
            : rec.currentFuel > 0 || fuelTotal > 0
              ? 'STANDBY — NO FACILITIES INSIDE ITS RADIUS NEED POWER RIGHT NOW, SO THE UNIT IS IDLING AND CONSERVING FUEL. IT AUTO-STARTS WHEN A LOAD APPEARS.'
              : 'OUT OF FUEL — NO FUEL IN THE BUFFER OR THE STOCKPILE. POWERED FACILITIES INSIDE ITS RADIUS ARE DARK.'}
        </div>
      </div>
    );
  })()}

  {/* Battery Bank (§Terminus) — GRID EXTENSION / EMERGENCY RESERVE, not a
      generator: a charged bank backs critical facilities inside ITS OWN
      radius when generators can't cover them */}
  {adaptedInfo.typeId === 'battery_bank' && (() => {
    const ps: import('../types/power').PowerState | undefined = settlement.powerState;
    const rec = ps?.batteries.get(adaptedInfo.buildingId);
    if (!rec) return null;
    const pct = rec.capacityKwh ? (rec.storedKwh / rec.capacityKwh) * 100 : 0;
    const feeding = rec.discharging;
    const armed = !feeding && pct > 0;
    return (
      <div className="bg-[#0e1117] p-2.5 border border-[#155E75] space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#9ca3af] font-semibold flex items-center gap-1.5">
            <BatteryCharging className="w-3.5 h-3.5 text-cyan-400" />
            {feeding ? 'Emergency Reserve' : armed ? 'Grid Extension' : 'Battery Bank'}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 border font-bold uppercase ${feeding ? 'bg-cyan-950 text-cyan-300 border-cyan-800' : armed ? 'bg-teal-950 text-teal-300 border-teal-800' : 'bg-slate-950 text-slate-400 border-slate-800'}`}>
            {feeding ? 'Reserve · Feeding' : armed ? 'Reserve · Armed' : 'Reserve · Empty'}
          </span>
        </div>
        <div className="text-[10px] font-mono text-[#94A3B8]">
          {Math.round(rec.storedKwh)} / {Math.round(rec.capacityKwh)} KWH · {rec.powerRadiusM}M RESERVE REACH · CHARGES {rec.chargeKw} KW · DISCHARGES {rec.dischargeKw} KW
        </div>
        <div className="w-full h-1.5 bg-[#1A1E24]">
          <div className={`h-full ${feeding ? 'bg-[#22D3EE]' : 'bg-[#67E8F9]'}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="text-[9px] font-mono text-[#718096]">
          {feeding
            ? 'EMERGENCY RESERVE FEEDING THE GRID — STORED POWER IS CARRYING CRITICAL LOADS INSIDE THIS REACH WHILE THE GENERATOR IS DOWN OR OVERWHELMED. REFUEL IT BEFORE THE RESERVE IS SPENT.'
            : armed
              ? 'GRID EXTENSION ARMED — THIS IS NOT A GENERATOR. ANY CRITICAL FACILITY INSIDE THE BANK\'S OWN REACH IS BACKED THE MOMENT GENERATORS CAN\'T COVER IT, AND IT REFILLS FROM SURPLUS WHILE THEY RUN.'
              : 'RESERVE EMPTY — A CHARGED BANK EXTENDS THE GRID FROM ITS OWN POSITION. CONNECT A RUNNING GENERATOR WITH SURPLUS TO CHARGE IT.'}
        </div>
      </div>
    );
  })()}

  {/* Floodlight Tower — power dependency readout (§Terminus grid) */}
  {adaptedInfo.typeId === 'floodlight_tower' && (() => {
    const powered = (settlement.powerState?.poweredBuildingIds || []).includes(String(adaptedInfo.buildingId));
    return (
      <div className="bg-[#0e1117] p-2.5 border border-[#78350F] space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#9ca3af] font-semibold flex items-center gap-1.5">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            Night Illumination
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 border font-bold uppercase ${powered ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-slate-950 text-slate-300 border-slate-800'}`}>
            {powered ? 'Powered · 80m' : 'Dim · 30m'}
          </span>
        </div>
        <div className="text-[9px] font-mono text-[#718096]">
          {powered
            ? 'ON THE GRID — FULL 80M SUPPRESSION CONE AT NIGHT. THIS IS WHY DEFENDING YOUR GENERATOR MATTERS.'
            : 'NO POWER — RUNS ON BATTERY AT A DIM 30M GLOW. CONNECT A RUNNING GENERATOR WITHIN ITS RADIUS FOR THE FULL CONE.'}
        </div>
      </div>
    );
  })()}

  {/* Shooting Range (§Terminus) — ammo-into-proficiency training */}
  {adaptedInfo.typeId === 'shooting_range' && (() => {
    const powered = (settlement.powerState?.poweredBuildingIds || []).includes(String(adaptedInfo.buildingId));
    const staffed = (adaptedInfo.assignedWorkers || 0) > 0;
    const rangeWorkers = Math.max(0, adaptedInfo.assignedWorkers || 0);
    const sessions = settlement.trainingState?.sessions || new Map();
    const lanesInUse = [...sessions.values()].filter(
      (sess: any) => String(sess.rangeBuildingId) === String(adaptedInfo.buildingId)
    ).length;
    return (
      <div className="bg-[#0e1117] p-2.5 border border-[#3F2E0E] space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#9ca3af] font-semibold flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5 text-orange-400" />
            Combat Training
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.5 border font-bold uppercase ${
              powered && staffed
                ? 'bg-orange-950 text-orange-300 border-orange-800'
                : 'bg-slate-950 text-slate-400 border-slate-800'
            }`}
          >
            {!powered ? 'No Power' : staffed ? `${rangeWorkers} Officer${rangeWorkers === 1 ? '' : 's'} · ${lanesInUse}/${rangeWorkers} Lanes` : 'No Staff'}
          </span>
        </div>
        <div className="text-[9px] font-mono text-[#718096]">
          TRAINING DRAWS AMMUNITION AND GRANTS A PERMANENT TIER: UNTRAINED → BASIC
          → TRAINED → VETERAN → EXPERT. HIGHER TIERS TAKE LONGER. THE RANGE MUST
          STAY POWERED AND STAFFED — RANGE OFFICERS RUN THE LANES, AND EACH EXTRA
          OFFICER SPEEDS UP ACTIVE COURSES. AN UNSTAFFED RANGE DRILLS NOBODY.
        </div>
        {(settlement.squads || []).slice(0, 4).map((sq) => {
          const tier = sq.trainingTier ?? 0;
          const session = sessions.get(sq.id);
          return (
            <div key={sq.id} className="p-2 bg-[#141a22] border border-[#202836] flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold text-slate-200">{sq.name}</div>
                <div className="text-[9px] font-mono text-[#94A3B8]">
                  {['Untrained', 'Basic', 'Trained', 'Veteran', 'Expert'][tier]}
                  {session ? ` · ${Math.min(100, Math.round((session.progressSec / [600, 600, 1800, 3600, 7200][Math.min(4, session.tier + 1)] || 1) * 100))}%` : ''}
                </div>
              </div>
              {session ? (
                <button
                  onClick={() => onStopTraining && onStopTraining(sq.id)}
                  disabled={!onStopTraining}
                  className="px-2 py-1 bg-slate-950/60 hover:bg-slate-900 border border-slate-700 text-slate-300 font-bold text-[10px] cursor-pointer"
                >
                  Stop
                </button>
              ) : tier >= 4 ? (
                <span className="text-[9px] font-bold text-emerald-400">EXPERT</span>
              ) : (
                <button
                  onClick={() => onStartTraining && onStartTraining(sq.id)}
                  disabled={!onStartTraining || !powered || !staffed || lanesInUse >= rangeWorkers}
                  className="px-2 py-1 bg-orange-950/60 hover:bg-orange-900 border border-orange-700/60 text-orange-300 font-bold text-[10px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    !powered
                      ? 'The range needs power'
                      : !staffed
                      ? 'Assign range officers to open training lanes'
                      : lanesInUse >= rangeWorkers
                      ? 'All training lanes are busy'
                      : 'Start the next training course'
                  }
                >
                  Train
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  })()}

  {/* Tower Armament — mount a ranged weapon from the colony armory (§4.3) */}
 {(() => {
 const towerDef = getCanonicalDefenseDef(adaptedInfo.typeId);
 if (!towerDef?.weaponMountable) return null;
 const isBuilt = adaptedInfo.constructionStatus === 'completed';
 const equipped = adaptedInfo.equippedWeaponId;
 const equippedDef = equipped ? getWeaponDefinition(equipped) : null;
 const armoryWeapons = (settlement.armory?.weapons || []).filter(
   (w) => getWeaponDefinition(w).ammoPerVolley > 0 && w !== equipped
 );
 return (
 <div className="bg-[#0e1117] p-2.5 border border-[#202836] space-y-2">
 <div className="flex items-center justify-between text-[11px]">
 <span className="text-[#9ca3af] font-semibold flex items-center gap-1.5">
 <Crosshair className="w-3.5 h-3.5 text-rose-400" />
 Tower Armament
 </span>
 {equipped && equippedDef && (
 <span className="text-[9px] px-1.5 py-0.5 bg-rose-950 text-rose-300 border border-rose-800 font-bold uppercase">
 Armed
 </span>
 )}
 </div>

 {!isBuilt ? (
 <p className="text-[10px] text-slate-500 italic">
 The tower is still under construction — finish building it before mounting a weapon.
 </p>
 ) : equipped ? (
 <div className="p-2 bg-[#141a22] border border-rose-800/40 flex items-center justify-between">
 <div>
 <div className="text-xs font-bold text-rose-300">
 {equippedDef?.name || equipped}
 </div>
 <div className="text-[10px] text-slate-400">
 {equippedDef?.damage || 0} dmg / shot • {equippedDef?.ammoPerVolley} ammo per volley
 </div>
 </div>
 <button
 onClick={() => onAssignTowerWeapon && onAssignTowerWeapon(adaptedInfo.buildingId, null)}
 disabled={!onAssignTowerWeapon}
 className="px-2 py-1 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-700/60 text-rose-300 font-bold text-[10px] transition-colors cursor-pointer"
 title="Returns the weapon to the colony armory"
 >
 Unequip
 </button>
 </div>
 ) : (
 <div className="space-y-1.5">
 <div className="p-1.5 bg-[#141a22] border border-emerald-800/40 flex items-start gap-1.5">
 <span className="text-[10px] text-slate-400">
 <span className="font-bold text-emerald-300">BOW FALLBACK ACTIVE</span> — an unarmed tower fires a bow with{' '}
 <span className="font-bold text-emerald-300">infinite ammunition</span> ({WEAPON_CATALOG.bow.damage} dmg, no ammo cost). Mount a firearm for real stopping power:
 </span>
 </div>
 {armoryWeapons.length === 0 ? (
 <p className="text-[10px] text-amber-400/80 italic">
 No ranged weapons in the armory. Scavenge firearms (police stations, gun shops) to arm this tower.
 </p>
 ) : (
 <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
 {armoryWeapons.map((wid) => {
 const wdef = getWeaponDefinition(wid);
 return (
 <button
 key={wid}
 onClick={() => onAssignTowerWeapon && onAssignTowerWeapon(adaptedInfo.buildingId, wid)}
 disabled={!onAssignTowerWeapon}
 className="w-full p-1.5 text-left text-[10px] bg-[#141a22] hover:bg-rose-950/50 border border-[#273240] hover:border-rose-700/50 flex items-center justify-between transition-colors cursor-pointer"
 >
 <span className="font-bold text-slate-200">{wdef.name}</span>
 <span className="font-mono text-rose-300">
 {wdef.damage} dmg
 </span>
 </button>
 );
 })}
 </div>
 )}
 </div>
 )}

 <p className="text-[9px] text-slate-500 leading-snug">
 A manned tower (assigned workers) fires {equipped ? 'its mounted weapon' : 'once armed'} at zombies in
 range, consuming {equippedDef?.ammoPerVolley || 1} ammo per shot from the colony reserve. Equipping moves the
 weapon out of the shared armory; unequipping returns it.
 </p>
 </div>
 );
 })()}
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

