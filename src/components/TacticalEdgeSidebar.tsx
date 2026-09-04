import React, { useState } from 'react';
import {
 AlertCircle,
 AlertTriangle,
 Archive,
 Award,
 Bed,
 Box,
 Building,
 Check,
 ChevronRight,
 Compass,
 Cpu,
 Crosshair,
 Droplets,
 Eye,
 Flame,
 Fuel,
 Globe,
 Hammer,
 Hand,
 Heart,
 HeartPulse,
 Info,
 Layers,
 Lock,
 Minus,
 Navigation,
 Package,
 Plus,
 Radio,
 RotateCcw,
 Search,
 Send,
 Shield,
 ShieldAlert,
 Skull,
 Sliders,
 Snowflake,
 Sparkles,
 Sprout,
 Sun,
 Target,
 Trees,
 Truck,
 UserCheck,
 UserPlus,
 Users,
 Utensils,
 Volume2,
 Wrench,
 X,
 Zap,
} from 'lucide-react';
import { BuildingPolygon, Point2D, ResourceNode } from '../types/map';
import {
 AdaptedBuilding,
 FunctionalBuildingTypeId,
 FunctionalCategory,
 LaborAllocation,
 SettlementState,
} from '../types/settlement';
import { NamedSurvivor, HiddenSurvivorGroup, StatTier } from '../types/population';
import { CombatStance, TacticalSquadUnit, WeaponLoadoutId, ZombieLair } from '../types/combat';
import { RivalHideout } from '../types/rivalFaction';
import { BuildingOccupation } from '../types/occupation';
import { WorldVehicle } from '../types/vehicle';
import { CaravanDispatchConfig, SettlementRecord, TradeCaravan } from '../types/caravan';
import { SeasonType, WeatherType } from '../types/weather';
import { ActiveSidebarTab } from './TacticalHeaderStrip';
import {
 calculateBuildingStats,
 calculatePolygonArea,
 FUNCTIONAL_BUILDING_DEFINITIONS,
 FUNCTIONAL_CATEGORIES,
 getAdaptedCost,
 isLegacyAliasBuildingType,
} from '../data/functionalBuildings';
import { RESEARCH_TREE_NODES, RESEARCH_BRANCHES } from '../data/researchTreeData';
import {
  getBuildingLockStatus,
  getResearchWorkerCount,
  getScientificMaterials,
} from '../services/researchService';
import { getPrimaryAdaptedEntry, getPrimaryHQ } from '../services/buildingOperational';
import { soundService } from '../services/soundService';

function isPointInsideBuilding(squad: TacticalSquadUnit, building: BuildingPolygon): boolean {
  if (!building.polygon || building.polygon.length < 3) {
    return Math.hypot(squad.x - building.center.x, squad.z - building.center.z) <= 4;
  }

  let inside = false;
  for (let i = 0, j = building.polygon.length - 1; i < building.polygon.length; j = i++) {
    const a = building.polygon[i];
    const b = building.polygon[j];
    const crosses = a.z > squad.z !== b.z > squad.z;
    if (crosses && squad.x < ((b.x - a.x) * (squad.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

interface TacticalEdgeSidebarProps {
 activeTab: ActiveSidebarTab;
 onClose: () => void;
 onSwitchTab: (tab: ActiveSidebarTab) => void;
 settlement: SettlementState;
 selectedBuilding: BuildingPolygon | null;
 selectedResourceNode: ResourceNode | null;
 selectedSquad: TacticalSquadUnit | null;
 selectedVehicle: WorldVehicle | null;
 // Actions
 onAdaptBuilding?: (bldg: BuildingPolygon, typeId: FunctionalBuildingTypeId) => void;
 onDismantleBuilding?: (buildingId: string | number) => void;
 onCancelDeconstruction?: (buildingId: string | number) => void;
 onRepairBuilding?: (buildingId: string | number) => void;
 onSearchBuilding?: (building: BuildingPolygon) => void;
 onAssignGatherers?: (nodeId: string, workerCount: number) => void;
 onOpenRecruitment?: (group: HiddenSurvivorGroup) => void;
 onAssaultThreat?: (buildingId: string | number) => void;
 onBuildFreestanding?: (typeId: FunctionalBuildingTypeId, pos: Point2D) => void;
 onUpdateLabor?: (allocation: LaborAllocation) => void;
 onCreateSquad?: (name: string, leaderId: string, generalCount: number, weaponLoadout?: import('../types/population').SquadWeaponLoadout) => void;
 onDisbandSquad?: (squadId: string) => void;
 onChangeSquadStance?: (squadId: string, stance: CombatStance) => void;
 onSelectSquad?: (squadId: string | null) => void;
 onSelectVehicle?: (vehicleId: string | null) => void;
 onRepairVehicle?: (vehicleId: string) => void;
 onRefuelVehicle?: (vehicleId: string, liters: number) => void;
 onStartResearch?: (nodeId: string) => void;
 onDispatchCaravan?: (config: CaravanDispatchConfig) => void;
 settlements?: Record<string, SettlementRecord>;
 activeSettlementId?: string;
 onOpenGlobe?: () => void;
 onQuarantineSurvivor?: (survivorId: string) => void;
 onReleaseSurvivor?: (survivorId: string) => void;
 onSetSeason?: (season: SeasonType) => void;
 onSetWeather?: (weather: WeatherType) => void;
 onBuildGreenhouse?: () => void;
}

export const TacticalEdgeSidebar: React.FC<TacticalEdgeSidebarProps> = ({
 activeTab,
 onClose,
 onSwitchTab,
 settlement,
 selectedBuilding,
 selectedResourceNode,
 selectedSquad,
 selectedVehicle,
 onAdaptBuilding,
 onDismantleBuilding,
 onCancelDeconstruction,
 onRepairBuilding,
 onSearchBuilding,
 onAssignGatherers,
 onOpenRecruitment,
 onAssaultThreat,
 onBuildFreestanding,
 onUpdateLabor,
 onCreateSquad,
 onDisbandSquad,
 onChangeSquadStance,
 onSelectSquad,
 onSelectVehicle,
 onRepairVehicle,
 onRefuelVehicle,
 onStartResearch,
 onDispatchCaravan,
 settlements = {},
 activeSettlementId,
 onOpenGlobe,
 onQuarantineSurvivor,
 onReleaseSurvivor,
 onSetSeason,
 onSetWeather,
 onBuildGreenhouse,
}) => {
 const [isFormingSquad, setIsFormingSquad] = useState(false);
 const [newSquadName, setNewSquadName] = useState('');
 const [newSquadLeaderId, setNewSquadLeaderId] = useState('');
 const [newSquadGeneralCount, setNewSquadGeneralCount] = useState(1);
 const [squadFormError, setSquadFormError] = useState<string | null>(null);
 const [newSquadWeaponLoadout, setNewSquadWeaponLoadout] = useState<'knife' | 'pistol' | 'shotgun' | 'assault_rifle'>('knife');

 if (!activeTab) return null;

 const labor = (settlement as any).labor || { food: 2, defense: 2, engineering: 2, logistics: 2 };
 const caravans = (settlement as any).caravans || [];
 const {
 stockpile,
 totalStorageCapacity,
 totalLivingCapacity,
 totalDefenseRating,
 namedSurvivors = [],
 generalPopulation,
  squads = [],
 vehicles = [],
 adaptedBuildings = {},
 freestandingBuildings = [],
 research,
  morale,
 weather,
 squadCapacity = 2,
 } = settlement;

 const freeGeneralWorkers =
 typeof generalPopulation === 'number'
 ? Math.max(
 0,
 generalPopulation - squads.reduce((sum, sq) => sum + sq.generalCount, 0)
 )
 : Math.max(
 0,
 (generalPopulation?.total || 0) - (generalPopulation?.inSquads || 0)
 );
 const availableLeaders = namedSurvivors.filter(
 (s) => s.role?.type !== 'squad_leader'
 );
 const atSquadCapacity = squads.length >= squadCapacity;

 const generalCount =
 typeof generalPopulation === 'number'
 ? generalPopulation
 : generalPopulation?.total || 0;
 const totalPop = namedSurvivors.length + generalCount;

 // Inspector helpers: whether the selected building is adapted/freestanding,
 // currently being deconstructed, or is the HQ.
 const selectedAdaptedInfo = selectedBuilding
  ? settlement.freestandingBuildings?.find(
 (f) => String(f.buildingId) === String(selectedBuilding.id)
 ) ||
 getPrimaryAdaptedEntry(settlement.adaptedBuildings, selectedBuilding.id)
 : undefined;
 const selectedDeconJob = selectedBuilding
 ? settlement.deconstructionJobs?.get(selectedBuilding.id)
 : undefined;
 const primaryHQ = getPrimaryHQ(settlement);
 const isSelectedHQ = selectedBuilding && primaryHQ
 ? String(primaryHQ.buildingId) === String(selectedBuilding.id)
 : false;

 // §5.2 threat overlays: rival Hideouts & zombie Lairs occupying a selected building
 const selectedHideout: RivalHideout | undefined = selectedBuilding
 ? settlement.rivalHideouts?.get(selectedBuilding.id)
 : undefined;  const selectedLair: ZombieLair | undefined = selectedBuilding
  ? settlement.zombieLairs?.get(selectedBuilding.id)
  : undefined;
  const selectedOccupation: BuildingOccupation | undefined = selectedBuilding
  ? settlement.occupiedBuildings?.buildings.get(selectedBuilding.id)
  : undefined;
 const selectedSearch = selectedBuilding ? settlement.buildingSearches?.get(selectedBuilding.id) : undefined;

 // §IFZ regional Lair pressure — the strategic layer: every STANDING lair
 // (even undiscovered ones) keeps feeding its neighbourhood and committing
 // night hordes, so the region stays hot until the nests are actually cleared.
 const lairMap: Map<string | number, ZombieLair> = settlement.zombieLairs;
 const standingLairs: ZombieLair[] = lairMap
   ? Array.from(lairMap.values()).filter((l) => !l.isCleared)
   : [];
 const lairCommittedInfected = standingLairs.reduce((n, l) => n + (l.population || 0), 0);
 const lairPressureLevel =
   standingLairs.length === 0
     ? 'NONE'
     : standingLairs.length >= 3 || lairCommittedInfected >= 80
     ? 'CRITICAL'
     : lairCommittedInfected >= 30
     ? 'HIGH'
     : 'MODERATE';
 const selectedSquadDistance = selectedBuilding && selectedSquad ? Math.hypot(selectedSquad.x-selectedBuilding.center.x,selectedSquad.z-selectedBuilding.center.z) : null;
 const selectedHiddenGroup = selectedBuilding
 ? (
     settlement.hiddenGroups instanceof Map
       ? Array.from(settlement.hiddenGroups.values())
       : Array.isArray(settlement.hiddenGroups)
       ? settlement.hiddenGroups
       : Object.values((settlement.hiddenGroups || {}) as Record<string, HiddenSurvivorGroup>)
   ).find((group) => String(group.buildingId) === String(selectedBuilding.id))
 : undefined;
 const selectedSquadInsideBuilding = Boolean(
   selectedBuilding &&
   selectedSquad &&
   isPointInsideBuilding(selectedSquad, selectedBuilding)
 );
 const squadInventory = selectedSquad ? settlement.squadInventories?.[selectedSquad.squadId] : undefined;

 return (
 <aside
 id="tactical-edge-sidebar"
 className="fixed top-11 bottom-0 right-0 w-[420px] sm:w-[480px] z-30 flex flex-col bg-[#0A0C0E] border-l border-[#262B33] text-[#E8E8E8] select-none clip-sidebar-edge-right surface-bevel pointer-events-auto"
 >
 {/* Damaged-metal surface texture (stamped steel grid + hazard stripes) */}
 <div className="absolute inset-0 pointer-events-none bg-tactical-steel opacity-60" />
 <div className="absolute inset-0 pointer-events-none bg-tactical-stripes opacity-30" />
 {/* Top Header Plate with Sub-Nav */}
 <div className="h-10 px-3 bg-[#11141A] border-b border-[#252C36] flex items-center justify-between shrink-0">
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 bg-[#CBD5E1]" />
 <span className="font-display text-sm tracking-widest text-[#E8E8E8] uppercase">
 {activeTab === 'squads' && 'TACTICAL SQUADS & COMBAT'}
 {activeTab === 'survivors' && 'COLONY LABOUR & POPULATION'}
 {activeTab === 'build' && 'CONSTRUCTION & ADAPTATION'}
 {activeTab === 'research' && 'TECH TREE RESEARCH'}
 {activeTab === 'vehicles' && 'MOTOR POOL & LOGISTICS'}
 {activeTab === 'caravans' && 'INTER-COLONY CARAVANS'}
 {activeTab === 'vitals' && 'COLONY VITALS & CLIMATE'}
 {activeTab === 'inspector' && 'STRUCTURE INSPECTION'}
 {activeTab === 'debug' && 'SYSTEM DEBUG TELEMETRY'}
 </span>
 </div>

 <button
 onClick={() => {
   soundService.playDrawerClose();
   onClose();
 }}
 title="Close Sidebar (ESC)"
 className="p-1 text-[#718096] hover:text-[#E8E8E8] hover:bg-[#1E2530] transition-colors"
 >
 <X className="w-4 h-4" />
 </button>
 </div>

 {/* Quick Navigation Tab Bar */}
 <div className="h-8 px-2 bg-[#0E1015] border-b border-[#1E242E] flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
 {(
 [
 { id: 'squads', label: 'SQUADS' },
 { id: 'survivors', label: 'LABOUR' },
 { id: 'build', label: 'BUILD' },
 { id: 'research', label: 'TECH' },
 { id: 'vehicles', label: 'VEHICLES' },
 { id: 'caravans', label: 'CARAVANS' },
 { id: 'vitals', label: 'VITALS' },
 ] as const
 ).map((tab) => (
 <button
 key={tab.id}
 onClick={() => {
   soundService.playTabSwitch();
   onSwitchTab(tab.id);
 }}
 className={`px-2 py-0.5 text-[10px] font-heading font-bold tracking-wider uppercase border transition-colors clip-tactical-tab ${
 activeTab === tab.id
 ? 'bg-[#232A34] border-[#CBD5E1] text-[#E8E8E8]'
 : 'bg-[#12151A] hover:bg-[#161B22] border-[#202630] text-[#718096] hover:text-[#E8E8E8]'
 }`}
 >
 {tab.label}
 </button>
 ))}
 </div>

 {/* Main Content Area */}
 <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
 {/* ========================================================================= */}
 {/* TAB 1: TACTICAL SQUADS & COMBAT */}
 {/* ========================================================================= */}
 {activeTab === 'squads' && (
 <div className="flex flex-col gap-3">
 {/* Squads Overview */}
 <div className="flex items-center justify-between p-2 bg-[#12161D] border border-[#232B36] clip-card-chip">
 <div>
 <div className="font-heading font-bold text-xs text-[#CBD5E1]">
 ACTIVE SQUADS ({squads.length})
 </div>
 <div className="text-[10px] font-mono text-[#718096]">
 DEFENSE RATING: {totalDefenseRating} PTS
 </div>
 </div>
 <div className="text-[10px] font-mono text-[#718096] text-right">
 CAPACITY {squads.length}/{squadCapacity}
 <div>FREE CIVILIANS: {freeGeneralWorkers}</div>
 </div>
 </div>

 {/* Squad Assembly */}
 <div className="p-2.5 bg-[#11141A] border border-[#222832] flex flex-col gap-2 clip-card-chip">
 {!isFormingSquad ? (
 <div className="flex items-center justify-between gap-2">
 <div>
 <div className="font-heading font-bold text-xs text-[#CBD5E1] uppercase">
 SQUAD ASSEMBLY
 </div>
 <div className="text-[10px] font-mono text-[#718096]">
 1 NAMED LEADER + UP TO 3 CIVILIAN RECRUITS (MAX 4)
 </div>
 </div>
 <button
 onClick={() => {
 setIsFormingSquad(true);
 setSquadFormError(null);
 if (availableLeaders.length > 0) {
 setNewSquadLeaderId(availableLeaders[0].id);
 } else {
 setNewSquadLeaderId('');
 }
 }}
 disabled={atSquadCapacity}
 title={
 atSquadCapacity
 ? 'Squad capacity reached — disband a squad first'
 : 'Muster a new tactical squad (leaderless all-recruit squads allowed)'
 }
 className="px-2.5 py-1.5 bg-[#17202B] hover:bg-[#202C3C] border border-[#CBD5E1]/70 hover:border-[#CBD5E1] text-[10px] font-heading font-bold text-[#E8E8E8] uppercase transition-colors shrink-0 disabled:opacity-40 disabled:pointer-events-none"
 >
 FORM SQUAD
 </button>
 </div>
 ) : (
 <form
 onSubmit={(e) => {
 e.preventDefault();
 setSquadFormError(null);
 if (newSquadGeneralCount > (newSquadLeaderId ? 3 : 4)) {
 setSquadFormError(
 'MAX SQUAD SIZE IS 4 (LEADER + 3, OR 4 RECRUITS WITHOUT A NAMED LEADER).'
 );
 return;
 }
 if (newSquadGeneralCount > freeGeneralWorkers) {
 setSquadFormError(
 `NOT ENOUGH FREE CIVILIANS (${freeGeneralWorkers} AVAILABLE).`
 );
 return;
 }
 onCreateSquad?.(
 newSquadName.trim() || `TACTICAL SQUAD ${squads.length + 1}`,
 newSquadLeaderId,
 newSquadGeneralCount,
 newSquadWeaponLoadout
 );
 setIsFormingSquad(false);
 setNewSquadName('');
 setNewSquadLeaderId('');
 setNewSquadGeneralCount(1);
 setNewSquadWeaponLoadout('knife');
 }}
 className="flex flex-col gap-2"
 >
 <div className="flex items-center justify-between">
 <span className="font-heading font-bold text-xs text-[#CBD5E1] uppercase">
 MUSTER NEW SQUAD
 </span>
 <button
 type="button"
 onClick={() => setIsFormingSquad(false)}
 className="text-[9px] font-mono text-[#64748B] hover:text-[#E8E8E8] uppercase"
 >
 Cancel
 </button>
 </div>

 {squadFormError && (
 <div className="p-1.5 bg-[#2A1414] border border-[#7F1D1D] text-[10px] font-mono text-[#FCA5A5]">
 {squadFormError}
 </div>
 )}

 <div className="grid grid-cols-2 gap-2">
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-heading font-bold text-[#718096] uppercase">
 Squad Designation
 </label>
 <input
 id="edge-new-squad-name"
 name="edgeSquadName"
 type="text"
 value={newSquadName}
 onChange={(e) => setNewSquadName(e.target.value)}
 placeholder={`STRIKE TEAM ${squads.length + 1}`}
 className="w-full px-2 py-1 text-[10px] font-mono bg-[#0E1014] border border-[#262C36] text-[#E8E8E8] placeholder-[#4B5563] focus:outline-none focus:border-[#CBD5E1]"
 />
 </div>
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-heading font-bold text-[#718096] uppercase">
 Squad Leader (Named Survivor)
 </label>
 <select
 value={newSquadLeaderId}
 onChange={(e) => setNewSquadLeaderId(e.target.value)}
 className="w-full px-2 py-1 text-[10px] font-mono bg-[#0E1014] border border-[#262C36] text-[#E8E8E8] focus:outline-none focus:border-[#CBD5E1]"
 >
 <option value="">
 {availableLeaders.length > 0
 ? '-- NO LEADER (ALL-RECRUIT 4-MAN) --'
 : '-- GENERIC FIELD LEADER --'}
 </option>
 {availableLeaders.map((s) => (
 <option key={s.id} value={s.id}>
 {s.name} (CMB {s.stats?.combat ?? 50})
 </option>
 ))}
 </select>
 {availableLeaders.length === 0 && (
 <span className="text-[9px] font-mono text-[#FBBF24]">
 LEADERLESS SQUADS ALLOWED
 </span>
 )}
 </div>
 </div>

 <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#0E1014] border border-[#1E242E]">
 <span className="text-[9px] font-mono text-[#94A3B8]">
 CIVILIAN RECRUITS (0–{newSquadLeaderId ? 3 : 4})
 </span>
 <div className="flex items-center gap-2">
 <button
 type="button"
 onClick={() => setNewSquadGeneralCount(Math.max(0, newSquadGeneralCount - 1))}
 disabled={newSquadGeneralCount <= 0}
 className="px-1.5 py-0.5 bg-[#1A1E24] border border-[#262C36] text-[#94A3B8] hover:text-[#E8E8E8] disabled:opacity-30"
 >
 −
 </button>
 <span className="text-[11px] font-mono font-bold text-[#CBD5E1] w-4 text-center">
 {newSquadGeneralCount}
 </span>
 <button
 type="button"
 onClick={() =>
 setNewSquadGeneralCount(
 Math.min(
 newSquadLeaderId ? 3 : 4,
 Math.min(freeGeneralWorkers, newSquadGeneralCount + 1)
 )
 )
 }
 disabled={
 newSquadGeneralCount >= (newSquadLeaderId ? 3 : 4) ||
 newSquadGeneralCount >= freeGeneralWorkers
 }
 className="px-1.5 py-0.5 bg-[#1A1E24] border border-[#262C36] text-[#94A3B8] hover:text-[#E8E8E8] disabled:opacity-30"
 >
 +
 </button>
 </div>
 </div>

 <button
 type="submit"
 className="w-full py-1.5 bg-[#17202B] hover:bg-[#202C3C] border border-[#CBD5E1]/70 hover:border-[#CBD5E1] text-[10px] font-heading font-bold text-[#E8E8E8] uppercase transition-colors"
 >
 CONFIRM & MUSTER SQUAD
 </button>
 </form>
 )}
 </div>

 {/* Squad List */}
 {squads.length === 0 ? (
 <div className="p-4 text-center border border-dashed border-[#262C36] text-xs font-mono text-[#718096] clip-card-chip">
 NO ACTIVE SQUADS DEPLOYED.
 </div>
 ) : (
 <div className="flex flex-col gap-2">
 {squads.map((sq) => {
 const leader = namedSurvivors.find((s) => s.id === sq.leaderId);
 const totalSize = 1 + sq.generalCount;
 const isSelected = (selectedSquad as any)?.squadId === sq.id || (selectedSquad as any)?.id === sq.id;

 return (
 <div
 key={sq.id}
 onClick={() => onSelectSquad?.(sq.id)}
 className={`p-2.5 border transition-colors cursor-pointer clip-card-chip ${
 isSelected
 ? 'bg-[#1A212B] border-[#CBD5E1]'
 : 'bg-[#11141A] hover:bg-[#161A22] border-[#222832]'
 }`}
 >
 <div className="flex items-center justify-between mb-1.5">
 <div className="flex items-center gap-1.5">
 <Crosshair className="w-3.5 h-3.5 text-[#CBD5E1]" />
 <span className="font-heading font-bold text-xs uppercase">{sq.name}</span>
 <span className="text-[9px] font-mono text-[#718096]">
 [1 LEADER + {sq.generalCount} RECRUIT{sq.generalCount === 1 ? '' : 'S'} · {totalSize}/4]
 </span>
 </div>
 <span className="text-[10px] font-mono text-[#A0AEC0] uppercase">
 {sq.status}
 </span>
 </div>

 {/* Leader & Composition */}
 <div className="text-[10px] font-mono text-[#94A3B8] mb-2">
 LEADER: <span className="text-[#E8E8E8]">{leader?.name || 'UNKNOWN'}</span>
 </div>

 {/* Disband */}
 <div className="flex items-center justify-end pt-1.5 border-t border-[#1C222B]">
 <button
 onClick={(e) => {
 e.stopPropagation();
 onDisbandSquad?.(sq.id);
 }}
 className="px-2 py-0.5 bg-[#2A1414] border border-[#7F1D1D] text-[9px] font-mono text-[#FCA5A5] hover:bg-[#3A1A1A] uppercase"
 >
 DISBAND
 </button>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 )}

 {/* ========================================================================= */}
 {/* TAB 2: COLONY LABOUR ALLOCATION & SURVIVORS */}
 {/* ========================================================================= */}
 {activeTab === 'survivors' && (
 <div className="flex flex-col gap-3">
 {/* Labor Allocation Sliders */}
 <div className="p-3 bg-[#11141A] border border-[#222832] flex flex-col gap-2.5 clip-card-chip">
 <div className="flex items-center justify-between">
 <span className="font-heading font-bold text-xs text-[#CBD5E1]">
 GENERAL LABOUR ALLOCATION
 </span>
 <span className="text-[10px] font-mono text-[#CBD5E1]">
 TOTAL WORKERS: {generalCount}
 </span>
 </div>

 {/* Food Gathering */}
 <div>
 <div className="flex justify-between text-[11px] font-mono mb-1">
 <span className="flex items-center gap-1 text-[#EAB308]">
 <Utensils className="w-3 h-3" /> FOOD GATHERING & FARMING
 </span>
 <span className="font-bold">{labor.food}</span>
 </div>
 <input
 type="range"
 min={0}
 max={Math.max(10, generalCount)}
 value={labor.food}
 onChange={(e) =>
 onUpdateLabor?.({ ...labor, food: parseInt(e.target.value) || 0 })
 }
 className="w-full accent-[#EAB308] cursor-pointer"
 />
 </div>

 {/* Defense & Guard Duty */}
 <div>
 <div className="flex justify-between text-[11px] font-mono mb-1">
 <span className="flex items-center gap-1 text-[#94A3B8]">
 <Shield className="w-3 h-3" /> DEFENSE & FORTIFICATIONS
 </span>
 <span className="font-bold">{labor.defense}</span>
 </div>
 <input
 type="range"
 min={0}
 max={Math.max(10, generalCount)}
 value={labor.defense}
 onChange={(e) =>
 onUpdateLabor?.({ ...labor, defense: parseInt(e.target.value) || 0 })
 }
 className="w-full accent-[#EF4444] cursor-pointer"
 />
 </div>

 {/* Engineering & Construction */}
 <div>
 <div className="flex justify-between text-[11px] font-mono mb-1">
 <span className="flex items-center gap-1 text-[#94A3B8]">
 <Hammer className="w-3 h-3" /> ENGINEERING & REPAIR
 </span>
 <span className="font-bold">{labor.engineering}</span>
 </div>
 <input
 type="range"
 min={0}
 max={Math.max(10, generalCount)}
 value={labor.engineering}
 onChange={(e) =>
 onUpdateLabor?.({ ...labor, engineering: parseInt(e.target.value) || 0 })
 }
 className="w-full accent-[#94A3B8] cursor-pointer"
 />
 </div>

 {/* Logistics & Scavenging */}
 <div>
 <div className="flex justify-between text-[11px] font-mono mb-1">
 <span className="flex items-center gap-1 text-[#FB923C]">
 <Package className="w-3 h-3" /> LOGISTICS & SCAVENGING
 </span>
 <span className="font-bold">{labor.logistics}</span>
 </div>
 <input
 type="range"
 min={0}
 max={Math.max(10, generalCount)}
 value={labor.logistics}
 onChange={(e) =>
 onUpdateLabor?.({ ...labor, logistics: parseInt(e.target.value) || 0 })
 }
 className="w-full accent-[#FB923C] cursor-pointer"
 />
 </div>
 </div>

 {/* Named Survivors Roster */}
 <div className="flex flex-col gap-1.5">
 <div className="font-heading font-bold text-xs text-[#CBD5E1] px-1">
 NAMED SURVIVOR SPECIALISTS ({namedSurvivors.length})
 </div>

 {namedSurvivors.map((survivor) => (
 <div
 key={survivor.id}
 className="p-2.5 bg-[#11141A] border border-[#222832] flex flex-col gap-1.5 clip-card-chip"
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-1.5">
 <Users className="w-3.5 h-3.5 text-[#CBD5E1]" />
 <span className="font-heading font-bold text-xs">{survivor.name}</span>
 <span className="text-[9px] font-mono text-[#718096]">
 [{typeof survivor.role === 'string'
 ? survivor.role
 : survivor.role?.type === 'squad_leader'
 ? `LEADER: ${survivor.role.squadName}`
 : survivor.role?.type === 'building_head'
 ? survivor.role.title.toUpperCase()
 : 'CITIZEN'}]
 </span>
 </div>

 <div className="flex items-center gap-1">
 <button
 onClick={() => onQuarantineSurvivor?.(survivor.id)}
 title="Quarantine in Medbay"
 className="px-1.5 py-0.5 text-[9px] font-mono bg-[#1E1712] border border-[#78350F] text-[#FDE68A] hover:bg-[#2C1E14]"
 >
 TRIAGE
 </button>
 </div>
 </div>

 {/* 7 Discrete Stats Grid */}
 <div className="grid grid-cols-4 gap-1 text-[9px] font-mono text-[#94A3B8] pt-1 border-t border-[#1C222B]">
 <div>CMB: {survivor.stats?.combat || 50}</div>
 <div>FRT: {survivor.stats?.fortification || 50}</div>
 <div>ENG: {survivor.stats?.engineering || 50}</div>
 <div>FRM: {survivor.stats?.farming || 50}</div>
 <div>MED: {survivor.stats?.medical || 50}</div>
 <div>SCAV: {survivor.stats?.scavenging || 50}</div>
 <div>LOG: {survivor.stats?.logistics || 50}</div>
 <div className="text-[#CBD5E1]">
 MORALE: {Math.round(survivor.morale ?? 75)}%
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* ========================================================================= */}
 {/* TAB 3: CONSTRUCTION & ADAPTATION CATALOG */}
 {/* ========================================================================= */}
 {activeTab === 'build' && (
 <div className="flex flex-col gap-3">
 {/* Blueprint Categories */}
 <div className="font-heading font-bold text-xs text-[#CBD5E1]">
 FREESTANDING STRUCTURES & FIELD DEFENSES
 </div>

 <div className="grid grid-cols-1 gap-2">
 {/* Legacy alias defs are save-compat duplicates — each facility appears
 once under its canonical name in the catalog. */}
 {Object.values(FUNCTIONAL_BUILDING_DEFINITIONS).filter((bldg) => !isLegacyAliasBuildingType(bldg.id)).map((bldg) => (
 <div
 key={bldg.id}
 className="p-2.5 bg-[#11141A] border border-[#222832] flex items-center justify-between gap-2 clip-card-chip"
 >
 <div className="flex-1 min-w-0">
 <div className="font-heading font-bold text-xs text-[#E8E8E8] uppercase truncate">
 {bldg.name}
 </div>
 <div className="text-[10px] font-mono text-[#718096] line-clamp-1">
 {bldg.description}
 </div>
 <div className="text-[9px] font-mono text-[#A0AEC0] mt-1">
 COST: {bldg.freestandingCost.wood} Wood, {bldg.freestandingCost.metal} Metal, {bldg.freestandingCost.bricks} Bricks{bldg.freestandingCost.tools ? `, ${bldg.freestandingCost.tools} Tools` : ''}
 </div>
 </div>

 <button
 onClick={() => onBuildFreestanding?.(bldg.id, { x: 0, z: 0 })}
 className="px-2.5 py-1.5 bg-[#17202B] hover:bg-[#202C3C] border border-[#2C3B4E] hover:border-[#CBD5E1] text-[11px] font-heading font-bold text-[#E8E8E8] transition-colors shrink-0"
 >
 DEPLOY
 </button>
 </div>
 ))}
 </div>

 {/* Building Adaptation Reference */}
 <div className="p-2.5 bg-[#12161D] border border-[#222832] text-xs font-mono text-[#94A3B8] clip-card-chip">
 <div className="font-heading font-bold text-xs text-[#CBD5E1] mb-1">
 BUILDING ADAPTATION (§7.1)
 </div>
 <p className="text-[10px] text-[#718096]">
 Click any civilian building in the 3D scene to inspect floorplans, structural integrity, and convert it into a Cookhouse, Medbay, Armory, Watchtower, or Hydroponics facility.
 </p>
 </div>
 </div>
 )}

 {/* ========================================================================= */}
 {/* TAB 4: TECH TREE RESEARCH */}
 {/* ========================================================================= */}
 {activeTab === 'research' && (
 <div className="flex flex-col gap-3">
 {/* Active Research Progress Plate */}
 <div className="p-3 bg-[#11141A] border border-[#222832] flex flex-col gap-1.5 clip-card-chip">
 <div className="flex items-center justify-between text-xs font-heading font-bold">
 <span className="text-[#CBD5E1]">SCIENTIFIC MATERIALS</span>
 <span className="text-[#CBD5E1]">
 {Math.floor(getScientificMaterials(settlement))} SciMat
 </span>
 </div>
 <div className="text-[10px] font-mono text-[#64748B]">
 Produced by staffed Research Centers ({getResearchWorkerCount(settlement)} scientists) — completing a project consumes its cost.
 </div>        {research?.activeResearchId && (
 <div className="text-[11px] font-mono text-[#94A3B8] mt-1">
 CURRENT PROJECT: <span className="text-[#CBD5E1] font-bold">{RESEARCH_TREE_NODES[research.activeResearchId]?.name || research.activeResearchId}</span>
 </div>
 )}

 <div className="w-full h-2 bg-[#1A1E24] border border-[#262C36] mt-1">
 <div
 className="h-full bg-[#A0AEC0] transition-all duration-300"
 style={{
 width: `${Math.min(
 100,
 research?.activeResearchId && RESEARCH_TREE_NODES[research.activeResearchId]
 ? (research.activeProgressSec || 0) /
 RESEARCH_TREE_NODES[research.activeResearchId].baseTimeSec *
 100
 : 0
 )}%`,
 }}
 />
 </div>
 </div>

 {/* Tech Nodes List */}
 <div className="flex flex-col gap-2">
 {Object.values(RESEARCH_TREE_NODES).map((node) => {
 const isUnlocked = research?.unlockedNodes?.includes(node.id);
 const isCurrent = research?.activeResearchId === node.id;
 const canAfford = getScientificMaterials(settlement) >= node.costSciMat;

 return (
 <div
 key={node.id}
 className={`p-2.5 border transition-colors clip-card-chip ${
 isUnlocked
 ? 'bg-[#0E1712] border-[#065F46] text-[#A7F3D0]'
 : isCurrent
 ? 'bg-[#1A212B] border-[#CBD5E1]'
 : 'bg-[#11141A] border-[#222832] text-[#CBD5E1]'
 }`}
 >
 <div className="flex items-center justify-between mb-1">
 <div className="flex items-center gap-1.5">
 <Cpu className="w-3.5 h-3.5 text-[#CBD5E1]" />
 <span className="font-heading font-bold text-xs uppercase">{node.name}</span>
 </div>
 <span className="text-[10px] font-mono">
 {isUnlocked ? 'RESEARCHED' : `${node.costSciMat} SciMat`}
 </span>
 </div>

 <p className="text-[10px] font-mono text-[#94A3B8] mb-2">{node.description}</p>

 {!isUnlocked && (
 <button
 onClick={() => onStartResearch?.(node.id)}
 disabled={!canAfford}
 className={`w-full py-1 border text-[10px] font-heading font-bold uppercase tracking-wider transition-colors cursor-pointer ${
 canAfford
 ? 'bg-[#17202B] hover:bg-[#202C3C] border-[#2C3B4E] hover:border-[#CBD5E1] text-[#E8E8E8]'
 : 'bg-[#12151a] border-[#1f242d] text-[#556070] cursor-not-allowed'
 }`}
 >
 {canAfford ? 'COMMENCE RESEARCH' : `NEEDS ${node.costSciMat} SciMat`}
 </button>
 )}
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* ========================================================================= */}
 {/* TAB 5: MOTOR POOL & VEHICLES */}
 {/* ========================================================================= */}
 {activeTab === 'vehicles' && (
 <div className="flex flex-col gap-3">
 <div className="font-heading font-bold text-xs text-[#CBD5E1]">
 MOTOR POOL ASSETS ({vehicles.length})
 </div>

 {vehicles.length === 0 ? (
 <div className="p-4 text-center border border-dashed border-[#262C36] text-xs font-mono text-[#718096]">
 NO MOTOR VEHICLES SECURED IN THE SECTOR.
 </div>
 ) : (
 <div className="flex flex-col gap-2">
 {vehicles.map((v) => (
 <div
 key={v.id}
 className="p-2.5 bg-[#11141A] border border-[#222832] flex flex-col gap-2 clip-card-chip"
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-1.5">
 <Truck className="w-3.5 h-3.5 text-[#F59E0B]" />
 <span className="font-heading font-bold text-xs">{v.name}</span>
 <span className="text-[9px] font-mono text-[#718096]">[{v.type}]</span>
 </div>
 <span className="text-[10px] font-mono text-[#CBD5E1] uppercase">
 {v.condition}
 </span>
 </div>

 <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[#94A3B8]">
 <div>FUEL: {Math.round(v.currentFuel)}/{v.maxFuel} L</div>
 <div>STATUS: {v.assignedSquadName ? `Assigned to ${v.assignedSquadName}` : 'Unassigned'}</div>
 </div>

 <div className="flex items-center gap-1 pt-1.5 border-t border-[#1C222B]">
 <button
 onClick={() => onRefuelVehicle?.(v.id, 20)}
 className="flex-1 py-1 bg-[#17202B] hover:bg-[#202C3C] border border-[#2C3B4E] text-[10px] font-mono text-[#E8E8E8]"
 >
 REFUEL (+20L)
 </button>
 {(() => {
 const vehOrder = (settlement.vehicleWorkshopOrders || []).find(
 (o) => String(o.vehicleId) === String(v.id)
 );
 if (vehOrder) {
 const pct = Math.min(100, Math.round((vehOrder.mechanicHoursDone / vehOrder.mechanicHoursRequired) * 100));
 return (
 <button
 disabled
 className="flex-1 py-1 bg-[#0d1b22] border border-[#155e75] text-[10px] font-mono text-cyan-300"
 >
 IN BAY {pct}%
 </button>
 );
 }
 return (
 <button
 onClick={() => onRepairVehicle?.(v.id)}
 disabled={v.currentHp >= v.maxHp}
 className="flex-1 py-1 bg-[#17202B] hover:bg-[#202C3C] border border-[#2C3B4E] text-[10px] font-mono text-[#A0AEC0] disabled:opacity-40"
 >
 WORKSHOP REPAIR
 </button>
 );
 })()}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 )}

 {/* ========================================================================= */}
 {/* TAB 6: INTER-COLONY CARAVANS & GLOBAL MAP */}
 {/* ========================================================================= */}
 {activeTab === 'caravans' && (
 <div className="flex flex-col gap-3">
 <div className="p-3 bg-[#11141A] border border-[#222832] flex items-center justify-between clip-card-chip">
 <div>
 <div className="font-heading font-bold text-xs text-[#CBD5E1]">
 GLOBAL SATELLITE NETWORK
 </div>
 <div className="text-[10px] font-mono text-[#718096]">
 ACTIVE COLONIES: {Object.keys(settlements).length}
 </div>
 </div>
 <button
 onClick={onOpenGlobe}
 className="px-2.5 py-1.5 bg-[#17202B] hover:bg-[#202C3C] border border-[#CBD5E1]/70 text-[11px] font-heading font-bold text-[#E8E8E8] hover:border-[#CBD5E1]"
 >
 OPEN GLOBE
 </button>
 </div>

 <div className="font-heading font-bold text-xs text-[#CBD5E1]">
 ACTIVE CONVOYS IN TRANSIT ({caravans.length})
 </div>

 {caravans.length === 0 ? (
 <div className="p-4 text-center border border-dashed border-[#262C36] text-xs font-mono text-[#718096]">
 NO ACTIVE CARAVANS IN TRANSIT.
 </div>
 ) : (
 <div className="flex flex-col gap-2">
 {caravans.map((c) => (
 <div
 key={c.id}
 className="p-2.5 bg-[#11141A] border border-[#222832] flex flex-col gap-1 clip-card-chip"
 >
 <div className="flex items-center justify-between text-xs font-heading font-bold">
 <span className="text-[#CBD5E1]">{c.originSettlementName} → {c.destinationSettlementName}</span>
 <span className="text-[10px] font-mono">{Math.round(c.distanceKm)} KM</span>
 </div>
 <div className="w-full h-1.5 bg-[#1A1E24] mt-1">
 <div
 className="h-full bg-[#A0AEC0]"
 style={{ width: `${Math.min(100, (c.progress || 0) * 100)}%` }}
 />
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 )}

 {/* ========================================================================= */}
 {/* TAB 7: COLONY VITALS, MORALE & CLIMATE */}
 {/* ========================================================================= */}
 {activeTab === 'vitals' && (
 <div className="flex flex-col gap-3">
 {/* Morale Card */}
 <div className="p-3 bg-[#11141A] border border-[#222832] flex flex-col gap-2 clip-card-chip">
 <div className="flex items-center justify-between">
 <span className="font-heading font-bold text-xs text-[#CBD5E1]">
 SETTLEMENT MORALE OVERVIEW
 </span>
 <span
 className={`font-heading font-bold text-sm uppercase ${
 morale?.tier === 'despair' ? 'text-[#FF4D4D]' : 'text-[#CBD5E1]'
 }`}
 >
 {Math.round(morale?.overallScore ?? 50)}% [{morale?.tier || 'NEUTRAL'}]
 </span>
 </div>

 {/* Passive Population Growth Progress */}
 <div>
 <div className="flex justify-between text-[10px] font-mono text-[#718096] mb-1">
 <span>PASSIVE POPULATION ARRIVAL / BIRTH PROGRESS</span>
 <span>{Math.round((morale?.passiveGrowth?.currentProgress ?? (morale as any)?.populationGrowthProgress) ?? 0)}%</span>
 </div>
 <div className="w-full h-1.5 bg-[#1A1E24]">
 <div
 className="h-full bg-[#10B981]"
 style={{ width: `${Math.min(100, (morale?.passiveGrowth?.currentProgress ?? (morale as any)?.populationGrowthProgress) ?? 0)}%` }}
 />
 </div>
 </div>
 </div>

 {/* Regional Lair Pressure Card (§IFZ) — the strategic consequence of nests */}
 <div className="p-3 bg-[#11141A] border border-[#7C2D12] flex flex-col gap-2 clip-card-chip">
 <div className="flex items-center justify-between">
 <span className="font-heading font-bold text-xs text-[#FDBA74]">
 REGIONAL LAIR PRESSURE
 </span>
 <span
 className={`font-heading font-bold text-xs uppercase ${
   lairPressureLevel === 'CRITICAL'
     ? 'text-[#FF4D4D] animate-pulse'
     : lairPressureLevel === 'HIGH'
     ? 'text-[#FB923C]'
     : lairPressureLevel === 'MODERATE'
     ? 'text-[#FBBF24]'
     : 'text-[#10B981]'
 }`}
 >
 {lairPressureLevel}
 </span>
 </div>
 {standingLairs.length === 0 ? (
 <div className="text-[10px] font-mono text-[#94A3B8]">
 NO ACTIVE NESTS — THE REGION IS QUIET. CLEARED LAIRS STAY CLEARED.
 </div>
 ) : (
 <>
 <div className="text-[10px] font-mono text-[#94A3B8]">
 {standingLairs.length} ACTIVE LAIR{standingLairs.length === 1 ? '' : 'S'} · {lairCommittedInfected} INFECTED COMMITTED ACROSS THE REGION
 </div>
 <div className="text-[9px] font-mono text-[#718096]">
 STANDING NESTS CLUSTER INFECTED AROUND THEM, OCCUPY NEARBY UNADAPTED
 BUILDINGS, AND COMMIT NIGHT HORDES TOWARD THE COLONY. CLEAR A LAIR AND
 ITS PRESSURE COLLAPSES — THE NEIGHBOURHOOD GENUINELY QUIETS.
 </div>
 </>
 )}
 </div>

 {/* Water Economy Card (§Terminus) — cistern reserve as the settlement buffer */}
 <div className="p-3 bg-[#11141A] border border-[#0E7490] flex flex-col gap-2 clip-card-chip">
 <div className="flex items-center justify-between">
 <span className="font-heading font-bold text-xs text-[#67E8F9]">
 WATER RESERVE
 </span>
 <span
 className={`font-heading font-bold text-xs uppercase ${
   (settlement.waterState?.shortageDays || 0) > 0
     ? 'text-[#FF4D4D] animate-pulse'
     : 'text-[#22D3EE]'
 }`}
 >
 {(settlement.waterState?.shortageDays || 0) > 0 ? 'SHORTAGE' : 'OK'}
 </span>
 </div>
 <div className="text-[10px] font-mono text-[#94A3B8]">
 {Math.round(settlement.stockpile?.water?.rainwater || 0) + Math.round(settlement.stockpile?.water?.purified_water || 0) + Math.round(settlement.stockpile?.water?.bottled_water || 0)} L STORE · {Math.round(settlement.waterState?.totalStored || 0)} L IN CISTERNS
 </div>
 <div className="text-[10px] font-mono text-[#94A3B8]">
 {settlement.waterState?.cisterns.size || 0} CISTERN{(settlement.waterState?.cisterns.size || 0) === 1 ? '' : 'S'} · {Math.round(settlement.waterState?.totalCapacity || 0)} L CAPACITY
 </div>
 <div className="w-full h-1.5 bg-[#1A1E24]">
 <div
 className="h-full bg-[#22D3EE]"
 style={{ width: `${settlement.waterState?.totalCapacity ? Math.min(100, (settlement.waterState.totalStored / settlement.waterState.totalCapacity) * 100) : 0}%` }}
 />
 </div>
 <div className="text-[9px] font-mono text-[#718096]">
 CISTERNS COLLECT RAIN BY ROOF AREA — A BIG WAREHOUSE BANKS FAR MORE THAN A
 TINY HOUSE. CONSUMPTION DRAWS THE STORE FIRST, THEN THE CISTERN BUFFERS.
 </div>
 </div>  {/* Power Grid Card (§Terminus) — fuel-burning generators, priority shutdown */}
  <div className="p-3 bg-[#11141A] border border-[#CA8A04] flex flex-col gap-2 clip-card-chip">
    <div className="flex items-center justify-between">
      <span className="font-heading font-bold text-xs text-[#FDE047]">
        POWER GRID
      </span>
      <span
        className={`font-heading font-bold text-xs uppercase ${
          (() => {
            const ps: import('../types/power').PowerState | undefined = settlement.powerState;
            const noGens = !ps || (ps.generators?.size || 0) === 0;
            const batStored = ps ? Array.from(ps.batteries?.values?.() || []).reduce((n, b) => n + b.storedKwh, 0) : 0;
            if (noGens && batStored === 0) return 'text-[#64748B]';
            if (noGens && batStored > 0) return 'text-[#22D3EE]';
            if (ps?.lowFuel) return 'text-[#FF4D4D] animate-pulse';
            if (ps && ps.demandKw > ps.supplyKw) return 'text-[#FB923C]';
            return 'text-[#FDE047]';
          })()
        }`}
      >
        {(() => {
          const ps: import('../types/power').PowerState | undefined = settlement.powerState;
          const noGens = !ps || (ps.generators?.size || 0) === 0;
          const batStored = ps ? Array.from(ps.batteries?.values?.() || []).reduce((n, b) => n + b.storedKwh, 0) : 0;
          if (noGens && batStored === 0) return 'OFFLINE';
          if (noGens && batStored > 0) return 'ON RESERVE';
          if (ps?.lowFuel) return 'LOW FUEL';
          if (ps && ps.demandKw > ps.supplyKw) return 'OVERLOADED';
          return 'ONLINE';
        })()}
      </span>
    </div>
    <div className="text-[10px] font-mono text-[#94A3B8]">
      {settlement.powerState?.generators?.size || 0} GENERATOR{(settlement.powerState?.generators?.size || 0) === 1 ? '' : 'S'} · {Math.round(settlement.powerState?.supplyKw || 0)} KW SUPPLY / {Math.round(settlement.powerState?.demandKw || 0)} KW DEMAND · {settlement.powerState?.poweredBuildingIds?.length || 0} POWERED
    </div>
    <div className="w-full h-1.5 bg-[#1A1E24]">
      <div
        className="h-full bg-[#FDE047]"
        style={{ width: `${settlement.powerState?.supplyKw ? Math.min(100, ((settlement.powerState.demandKw || 0) / settlement.powerState.supplyKw) * 100) : 0}%` }}
      />
    </div>
    {(() => {
      const ps: import('../types/power').PowerState | undefined = settlement.powerState;
      const bats = ps?.batteries;
      if (!bats || bats.size === 0) return null;
      const totalKwh = Array.from(bats.values()).reduce((n, b) => n + b.capacityKwh, 0);
      const storedKwh = Array.from(bats.values()).reduce((n, b) => n + b.storedKwh, 0);
      const draining = Array.from(bats.values()).some((b) => b.discharging);
      return (
        <>
          <div className={`text-[10px] font-mono ${draining ? 'text-[#22D3EE]' : 'text-[#67E8F9]'}`}>
            EMERGENCY RESERVE: {Math.round(storedKwh)} / {Math.round(totalKwh)} KWH{draining ? ' · FEEDING GRID' : storedKwh > 0 ? ' · ARMED (GRID EXTENSION)' : ' · EMPTY'}
          </div>
          <div className="w-full h-1.5 bg-[#1A1E24]">
            <div
              className={`h-full ${draining ? 'bg-[#22D3EE]' : 'bg-[#67E8F9]'}`}
              style={{ width: `${totalKwh ? Math.min(100, (storedKwh / totalKwh) * 100) : 0}%` }}
            />
          </div>
        </>
      );
    })()}
    <div className="text-[9px] font-mono text-[#718096]">
      GENERATORS RUN ONLY WHILE FACILITIES INSIDE THEIR RADIUS NEED POWER —
      NO LOAD, NO BURN, SO FUEL IS CONSERVED. WHEN DEMAND EXCEEDS SUPPLY THE
      LOWEST-PRIORITY FACILITIES SHUT DOWN FIRST — FLOODLIGHTS GO DARK BEFORE
      THE HOSPITAL DOES. A CHARGED BATTERY BANK IS THE EMERGENCY RESERVE: IT
      EXTENDS THE GRID FROM ITS OWN POSITION AND CARRIES CRITICAL FACILITIES
      WHEN GENERATORS CAN\'T.
    </div>
  </div>

  {/* Weather & Climate Card */}
  <div className="p-3 bg-[#11141A] border border-[#222832] flex flex-col gap-2 clip-card-chip">
 <div className="flex items-center justify-between">
 <span className="font-heading font-bold text-xs text-[#CBD5E1]">
 ENVIRONMENTAL CLIMATE & SEASONS
 </span>
 <span className="font-mono text-xs text-[#FBBF24]">
 {weather?.currentSeason?.toUpperCase() || 'SPRING'} | {Math.round(weather?.temperatureC ?? 18)}°C
 </span>
 </div>

 <div className="text-[10px] font-mono text-[#94A3B8]">
 ACTIVE WEATHER: {weather?.currentWeather?.toUpperCase().replace('_', ' ') || 'CLEAR'}
 </div>

 <div className="flex items-center gap-2 pt-2 border-t border-[#1C222B]">
 <button
 onClick={onBuildGreenhouse}
 className="w-full py-1.5 bg-[#17202B] hover:bg-[#202C3C] border border-[#2C3B4E] hover:border-[#CBD5E1] text-[10px] font-heading font-bold text-[#E8E8E8] uppercase"
 >
 DEPLOY GREENHOUSE HYDROPONICS (WINTER MITIGATION)
 </button>
 </div>
 </div>
 </div>
 )}

 {/* ========================================================================= */}
 {/* TAB 8: WORLD BUILDING INSPECTOR */}
 {/* ========================================================================= */}
 {activeTab === 'inspector' && (selectedBuilding || selectedResourceNode) && (
 <div className="flex flex-col gap-3">
 {selectedResourceNode && !selectedBuilding && <div className="p-3 bg-[#11141A] border border-[#2B323C] flex flex-col gap-2 clip-card-chip">
 <div className="font-heading font-bold text-xs text-[#CBD5E1]">RESOURCE NODE · {selectedResourceNode.type.toUpperCase()}</div>
 <div className="text-[10px] font-mono text-[#94A3B8]">{selectedResourceNode.subType.replaceAll('_',' ').toUpperCase()} · {Math.floor(selectedResourceNode.amount)}/{Math.floor(selectedResourceNode.maxAmount)} REMAINING</div>
 <div className="text-[9px] font-mono text-[#718096]">{settlement.resourceWorkOrders.filter(w=>w.nodeId===selectedResourceNode.id).reduce((n,w)=>n+w.workerCount,0)} WORKERS ASSIGNED</div>
 {selectedResourceNode.amount>0 ? <div className="flex gap-1"><button onClick={()=>onAssignGatherers?.(selectedResourceNode.id,1)} className="flex-1 py-1.5 bg-[#17202B] border border-[#CBD5E1]/60 text-[10px] font-heading font-bold">SEND 1</button><button onClick={()=>onAssignGatherers?.(selectedResourceNode.id,3)} className="flex-1 py-1.5 bg-[#17202B] border border-[#CBD5E1]/60 text-[10px] font-heading font-bold">SEND 3</button></div> : <div className="text-[10px] font-mono text-[#EF4444]">DEPLETED</div>}
 <div className="text-[9px] font-mono text-[#718096]">Workers physically travel from HQ, harvest the node, carry the material home, and return to the labour pool.</div>
 </div>}
 {selectedBuilding && <>
 <div className="p-3 bg-[#11141A] border border-[#222832] flex flex-col gap-1.5 clip-card-chip">
 <div className="flex items-center justify-between">
 <span className="font-heading font-bold text-xs text-[#CBD5E1] uppercase">
 STRUCTURE: {selectedBuilding.type.toUpperCase()}
 </span>
 <span className="text-[10px] font-mono text-[#718096]">
 ID: #{selectedBuilding.id}
 </span>
 </div>

 <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[#94A3B8] pt-1">
 <div>HEIGHT: {Math.round(selectedBuilding.height)}M</div>
 <div>FLOOR AREA: {Math.round(calculatePolygonArea(selectedBuilding.polygon))} M²</div>
 </div>
 </div>

 <div className="p-2.5 bg-[#11141A] border border-[#2B323C] flex flex-col gap-2 clip-card-chip">
 <div className="flex justify-between"><span className="font-heading font-bold text-[10px]">WORLD SEARCH STATE</span><span className="text-[10px] font-mono text-[#94A3B8]">{selectedSearch?.searched?'SEARCHED':selectedSearch?.searchProgress ? `SEARCHING (${selectedSearch.searchProgress}%)` : selectedSearch?.observed?'OBSERVED':'UNKNOWN'}</span></div>
 <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[#94A3B8]"><div>DISTANCE: {selectedSquadDistance===null?'—':`${Math.round(selectedSquadDistance)}m`}</div><div>CARRY: {squadInventory?`${squadInventory.used}/${squadInventory.capacity} slots`:'—'}</div></div>
 {selectedSearch?.searchProgress !== undefined && selectedSearch.searchProgress > 0 && !selectedSearch.searched ? (
   <div className="space-y-1">
     <div className="h-1.5 w-full bg-black/80 border border-amber-500/40 rounded-sm overflow-hidden">
       <div className="h-full bg-amber-400" style={{ width: `${selectedSearch.searchProgress}%` }} />
     </div>
     <div className="text-[9px] font-mono text-amber-400">EST DURATION: ~{Math.round(selectedSearch.totalDurationSec || 20)}s (AREA BASED)</div>
   </div>
 ) : null}
 {isSelectedHQ ? <div className="text-[9px] font-mono text-[#A0AEC0]">COMMAND HQ — NEVER SCAVENGED.</div> : selectedSearch?.searched ? <div className="text-[9px] font-mono text-[#A0AEC0]">SEARCH COMPLETE. SUPPLIES SECURED.</div> : <button disabled={!selectedSquad} onClick={()=>selectedBuilding&&onSearchBuilding?.(selectedBuilding)} className="w-full py-1.5 bg-[#17202B] disabled:opacity-35 border border-[#CBD5E1]/60 text-[10px] font-heading font-bold uppercase">{selectedSquadDistance!==null&&selectedSquadDistance<=16?(selectedSearch?.searchProgress?'SEARCHING...':'SEARCH STRUCTURE'):'DISPATCH SQUAD TO SEARCH'}</button>}
 {selectedSearch?.lootedItems && selectedSearch.lootedItems.length > 0 ? (
   <div className="text-[9px] font-mono text-[#CBD5E1]">
     RECOVERED: {selectedSearch.lootedItems.map(l => `${l.label.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase())} ×${l.quantity}`).join(', ')}
   </div>
 ) : selectedSearch?.searched&&selectedSearch.loot.map(l=><div key={l.id} className="text-[9px] font-mono text-[#CBD5E1]">{l.label.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase()).toUpperCase()} ×{l.quantity}</div>)}
 </div>
 {selectedHiddenGroup && !selectedHiddenGroup.isRecruited && (selectedHiddenGroup.isDiscovered || (selectedHiddenGroup.hasSmokeClue && selectedSquadInsideBuilding)) && <div className="p-2.5 bg-[#15171B] border border-[#4B5563] flex flex-col gap-2 clip-card-chip"><div className="font-heading font-bold text-[10px]">SURVIVORS DETECTED · GROUP OF {selectedHiddenGroup.generalCount+1}</div><div className="text-[9px] font-mono text-[#718096]">{selectedHiddenGroup.hasSmokeClue?'CHIMNEY SMOKE CONFIRMS HUMAN ACTIVITY.':'SIGNS OF HUMAN ACTIVITY.'}</div><button onClick={()=>onOpenRecruitment?.({ ...selectedHiddenGroup, isDiscovered: true })} className="w-full py-1.5 bg-[#17202B] border border-[#CBD5E1]/60 text-[10px] font-heading font-bold">MAKE CONTACT WITH SURVIVORS</button></div>}

 {/* Rival Hideout (§5.2) — hostile-on-sight human faction */}
 {selectedHideout && selectedHideout.isDiscovered && !selectedHideout.isCleared && (
 <div className="p-2.5 bg-[#1A1213] border border-[#7C2D12] flex flex-col gap-2 clip-card-chip">
 <div className="flex items-center justify-between">
 <span className="font-heading font-bold text-[10px] text-[#FDBA74] uppercase">
 RIVAL HIDEOUT (§5.2)
 </span>
 <span className="text-[10px] font-mono text-[#FB923C]">
 {selectedHideout.threatTier.toUpperCase()}
 </span>
 </div>
 <div className="text-[11px] font-mono text-[#E8E8E8]">
 {selectedHideout.factionName.toUpperCase()} — {selectedHideout.occupantCount} ARMED OCCUPANTS
 </div>
 {selectedHideout.captiveSquadName && (
 <div className="text-[10px] font-mono text-[#FCA5A5]">
 HOLDING CAPTIVE: {selectedHideout.captiveSquadName.toUpperCase()}
 {selectedHideout.ransom ? ` (RANSOM ${selectedHideout.ransom.foodCost} FOOD)` : ''}
 </div>
 )}
 <button
 onClick={() => onAssaultThreat?.(selectedBuilding.id)}
 className="w-full py-1.5 bg-[#3D1E23] hover:bg-[#54252B] border border-[#EF4444] text-[10px] font-heading font-bold text-[#FCA5A5] hover:text-white uppercase"
 >
 ASSAULT HIDEOUT
 </button>
 </div>
 )}

 {/* Zombie Lair (§5.2) — persistent nest, distinct from ordinary occupied buildings */}
 {selectedLair && selectedLair.isDiscovered && !selectedLair.isCleared && (
 <div className="p-2.5 bg-[#0F1410] border border-[#3F6212] flex flex-col gap-2 clip-card-chip">
 <div className="flex items-center justify-between">
 <span className="font-heading font-bold text-[10px] text-[#BEF264] uppercase">
 ZOMBIE LAIR (§5.2)
 </span>
 <span className="text-[10px] font-mono text-[#A3E635]">ESC LVL {selectedLair.escalation}</span>
 </div>
 <div className="text-[11px] font-mono text-[#E8E8E8]">
 {selectedLair.population} INFECTED NOW · SUSTAINABLE {selectedLair.garrisonCeiling ?? selectedLair.baselinePopulation}
 {selectedLair.population > selectedLair.baselinePopulation ? ' · SWOLLEN NEST' : ''}
 </div>
 <div className="text-[9px] font-mono text-[#6B8F5E]">
 FOUNDING GARRISON {selectedLair.baselinePopulation} · EMERGENCE CAP {selectedLair.emergenceCapacity ?? Math.max(8, Math.round((selectedLair.baselinePopulation || 0) * 0.35))}
 </div>
 <p className="text-[10px] font-mono text-[#94A3B8]">
 {selectedLair.population > selectedLair.baselinePopulation
 ? `A nest of real infected that shelter by day and emerge by night. It has swollen past its founding garrison of ${selectedLair.baselinePopulation} — at ESC LVL ${selectedLair.escalation} the nest is a genuine hive. Kill every last one of them to clear it.`
 : `A nest of real infected that shelter by day and emerge by night. Kill every one of them to clear it — a partially cleared nest regrows toward its founding garrison of ${selectedLair.baselinePopulation} while it stands, and neglect lets it swell beyond.`}
 </p>
 </div>
 )}

 {/* Building Occupation (§IFZ) — unadapted structure taken over by infected */}
 {selectedOccupation && !selectedOccupation.isCleared && (
 <div className="p-2.5 bg-[#1A1213] border border-[#7C2D12] flex flex-col gap-2 clip-card-chip">
 <div className="flex items-center justify-between">
 <span className="font-heading font-bold text-[10px] text-[#FDBA74] uppercase">
 BUILDING OCCUPIED (§IFZ)
 </span>
 <span className="text-[10px] font-mono text-[#FB923C]">
 {selectedOccupation.threatTier.toUpperCase()}
 </span>
 </div>
 <div className="text-[11px] font-mono text-[#E8E8E8]">
 {selectedOccupation.infectedRemaining}/{selectedOccupation.maxInfected} INFECTED INSIDE
 </div>
 <p className="text-[10px] font-mono text-[#94A3B8]">
 UNADAPTED STRUCTURE TAKEN OVER BY INFECTED. BREACHING IT WAKES THE REAL
 INFECTED INSIDE — KILL EVERY ONE TO RECLAIM THE BUILDING. ADAPTED
 STRUCTURES ARE NEVER OCCUPIED.
 </p>
 </div>
 )}

 {/* Deconstruction (§7.2) — tracked labour-over-time job */}
 {!isSelectedHQ && (
 <div className="p-2.5 bg-[#1A1213] border border-[#4A1C20] flex flex-col gap-2 clip-card-chip">
 <span className="font-heading font-bold text-[10px] text-[#FCA5A5] uppercase">
 BUILDING DECONSTRUCTION (§7.2)
 </span>

 {selectedDeconJob ? (
 <>
 <div className="text-[10px] font-mono text-[#E8E8E8]">
 {selectedDeconJob.buildingName.toUpperCase()} — TEARING DOWN ({selectedDeconJob.progressPct}%)
 </div>
 <div className="w-full h-1.5 bg-[#1A1E24]">
 <div
 className="h-full bg-[#EF4444]"
 style={{ width: `${Math.min(100, selectedDeconJob.progressPct)}%` }}
 />
 </div>
 <div className="text-[9px] font-mono text-[#94A3B8]">
 {selectedDeconJob.assignedWorkers}/{selectedDeconJob.maxWorkers} WORKERS ASSIGNED · RECOVERS{' '}
 {selectedDeconJob.recoverWood}W / {selectedDeconJob.recoverMetal}M / {selectedDeconJob.recoverBricks}B
 </div>
 <button
 onClick={() => onCancelDeconstruction?.(selectedBuilding.id)}
 className="w-full py-1.5 bg-[#2A1414] hover:bg-[#3A1A1A] border border-[#7F1D1D] text-[10px] font-heading font-bold text-[#FCA5A5] uppercase"
 >
 CANCEL DECONSTRUCTION
 </button>
 </>
 ) : (
 <>
 <p className="text-[10px] font-mono text-[#94A3B8]">
 {selectedAdaptedInfo
 ? 'Dismantle this structure over time with assigned Construction workers. Recover 50% of its materials when the job completes.'
 : 'Clear this unadapted structure for salvaged Wood, Metal and Bricks. Bigger buildings take longer and support more workers.'}
 </p>
 <button
 onClick={() => onDismantleBuilding?.(selectedBuilding.id)}
 className="w-full py-1.5 bg-[#3D1E23] hover:bg-[#54252B] border border-[#EF4444] text-[10px] font-heading font-bold text-[#FCA5A5] hover:text-white uppercase"
 >
 ORDER DECONSTRUCTION
 </button>
 </>
 )}
 </div>
 )}

 {/* Adaptation Options */}
 <div className="font-heading font-bold text-xs text-[#CBD5E1]">
 AVAILABLE ADAPTATION BLUEPRINTS (§7.1)
 </div>

 <div className="flex flex-col gap-2">
 {/* Canonical adaptation blueprints only — legacy alias defs (shelter_bunkhouse,
 storage_depot, infirmary_clinic, …) are save-compat duplicates of these and
 are never offered again under an old name. Each facility appears once. */}
 {Object.values(FUNCTIONAL_BUILDING_DEFINITIONS)
 .filter((def) => def.adaptationAllowed && !isLegacyAliasBuildingType(def.id))
 .sort(
 (a, b) =>
 FUNCTIONAL_CATEGORIES.findIndex((c) => c.id === a.category) -
 FUNCTIONAL_CATEGORIES.findIndex((c) => c.id === b.category) ||
 a.name.localeCompare(b.name)
 )
 .map((def) => {
 if (!selectedBuilding || !selectedBuilding.polygon) return null;
 const lock = getBuildingLockStatus(settlement, def.researchRequirement);
 const locked = !lock.unlocked;
 // §Terminus economics: exact full-conversion price for THIS structure,
 // derived from its real shell volume (footprint × height), not a flat fee.
 const area = Math.round(calculatePolygonArea(selectedBuilding.polygon));
 const cost = getAdaptedCost(def.id, selectedBuilding.type, area, selectedBuilding.height);

 return (
 <div
 key={def.id}
 className={`p-2.5 border flex items-center justify-between gap-2 clip-card-chip ${
 locked ? 'bg-[#0C0F14] border-[#1A212C] opacity-70' : 'bg-[#11141A] border-[#222832]'
 }`}
 >
 <div className="flex-1 min-w-0">
 <div className={`font-heading font-bold text-xs uppercase ${locked ? 'text-[#94A3B8]' : 'text-[#E8E8E8]'}`}>
 {def.name}
 </div>
 <div className="text-[9px] font-mono text-[#718096] line-clamp-1">
 {def.description}
 </div>
 {locked ? (
 <div className="text-[9px] font-mono text-[#B45309] mt-0.5">
 <Lock className="w-3 h-3 inline mr-1" />REQUIRES RESEARCH: {lock.requiredName.toUpperCase()}
 </div>
 ) : (
 <div className="text-[9px] font-mono text-[#A0AEC0] mt-0.5">
 FULL CONVERSION OF THIS STRUCTURE: {cost.wood}W / {cost.metal}M / {cost.bricks}B
 {cost.tools ? ` / ${cost.tools} Tools` : ''}
 {cost.scientific_materials
 ? ` / ${cost.scientific_materials} SciMat (one-time)`
 : ''}
 </div>
 )}
 </div>

 <button
 disabled={locked}
 onClick={() => onAdaptBuilding?.(selectedBuilding, def.id)}
 title={locked ? `Requires research: ${lock.requiredName}` : undefined}
 className="px-2.5 py-1.5 bg-[#17202B] hover:bg-[#202C3C] border border-[#CBD5E1]/70 text-[10px] font-heading font-bold text-[#E8E8E8] hover:border-[#CBD5E1] uppercase shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#17202B]"
 >
 ADAPT
 </button>
 </div>
 );
 })}
 </div>
 </>}
 </div>
 )}
 </div>
 </aside>
 );
};
