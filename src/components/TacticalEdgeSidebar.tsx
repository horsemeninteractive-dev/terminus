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
import { WorldVehicle } from '../types/vehicle';
import { CaravanDispatchConfig, SettlementRecord, TradeCaravan } from '../types/caravan';
import { SeasonType, WeatherType } from '../types/weather';
import { ActiveSidebarTab } from './TacticalHeaderStrip';
import {
 calculateBuildingStats,
 calculatePolygonArea,
 FUNCTIONAL_BUILDING_DEFINITIONS,
 FUNCTIONAL_CATEGORIES,
} from '../data/functionalBuildings';
import { RESEARCH_TREE_NODES, RESEARCH_BRANCHES } from '../data/researchTreeData';
import { calculateResearchGenerationRate } from '../services/researchService';
import { soundService } from '../services/soundService';

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
 onCreateSquad?: (name: string, leaderId: string, generalCount: number) => void;
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

 if (!activeTab) return null;

 const labor = (settlement as any).labor || { food: 2, defense: 2, engineering: 2, logistics: 2 };
 const caravans = (settlement as any).caravans || [];
 const {
 stockpile,
 totalStorageCapacity,
 totalLivingCapacity,
 totalDefenseRating,
 hq,
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
 ? settlement.adaptedBuildings?.get(selectedBuilding.id) ||
 settlement.freestandingBuildings?.find(
 (f) => String(f.buildingId) === String(selectedBuilding.id)
 )
 : undefined;
 const selectedDeconJob = selectedBuilding
 ? settlement.deconstructionJobs?.get(selectedBuilding.id)
 : undefined;
 const isSelectedHQ = selectedBuilding && settlement.hq
 ? String(settlement.hq.buildingId) === String(selectedBuilding.id)
 : false;

 // §5.2 threat overlays: rival Hideouts & zombie Lairs occupying a selected building
 const selectedHideout: RivalHideout | undefined = selectedBuilding
 ? settlement.rivalHideouts?.get(selectedBuilding.id)
 : undefined;
 const selectedLair: ZombieLair | undefined = selectedBuilding
 ? settlement.zombieLairs?.get(selectedBuilding.id)
 : undefined;
 const selectedSearch = selectedBuilding ? settlement.buildingSearches?.get(selectedBuilding.id) : undefined;
 const selectedSquadDistance = selectedBuilding && selectedSquad ? Math.hypot(selectedSquad.x-selectedBuilding.center.x,selectedSquad.z-selectedBuilding.center.z) : null;
 const selectedHiddenGroup = selectedBuilding ? settlement.hiddenGroups?.get(selectedBuilding.id) : undefined;
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
 }
 }}
 disabled={atSquadCapacity || availableLeaders.length === 0}
 title={
 atSquadCapacity
 ? 'Squad capacity reached — disband a squad first'
 : availableLeaders.length === 0
 ? 'No available named survivors to lead'
 : 'Muster a new tactical squad'
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
 if (!newSquadLeaderId) {
 setSquadFormError('SELECT A NAMED SQUAD LEADER.');
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
 newSquadGeneralCount
 );
 setIsFormingSquad(false);
 setNewSquadName('');
 setNewSquadLeaderId('');
 setNewSquadGeneralCount(1);
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
 <option value="" disabled>
 -- SELECT LEADER --
 </option>
 {availableLeaders.map((s) => (
 <option key={s.id} value={s.id}>
 {s.name} (CMB {s.stats?.combat ?? 50})
 </option>
 ))}
 </select>
 </div>
 </div>

 <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#0E1014] border border-[#1E242E]">
 <span className="text-[9px] font-mono text-[#94A3B8]">
 CIVILIAN RECRUITS (0–3)
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
 Math.min(3, Math.min(freeGeneralWorkers, newSquadGeneralCount + 1))
 )
 }
 disabled={
 newSquadGeneralCount >= 3 || newSquadGeneralCount >= freeGeneralWorkers
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
 {Object.values(FUNCTIONAL_BUILDING_DEFINITIONS).map((bldg) => (
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
 COST: {bldg.freestandingCost.wood} Wood, {bldg.freestandingCost.metal} Metal, {bldg.freestandingCost.bricks} Bricks
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
 <span className="text-[#CBD5E1]">AVAILABLE RESEARCH POINTS</span>
 <span className="text-[#CBD5E1]">
 {Math.floor(research?.researchPoints ?? 0)} RP (+{calculateResearchGenerationRate(settlement).totalRatePerSec.toFixed(1)}/s)
 </span>
 </div>

 {research?.activeResearchId && (
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
 research?.activeResearchId
 ? ((research.researchPoints || 0) /
 (RESEARCH_TREE_NODES[research.activeResearchId]?.costRP || 100)) *
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
 const canAfford = (research?.researchPoints ?? 0) >= node.costRP;

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
 {isUnlocked ? 'RESEARCHED' : `${node.costRP} RP`}
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
 {canAfford ? 'COMMENCE RESEARCH' : `NEEDS ${node.costRP} RP`}
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
 <button
 onClick={() => onRepairVehicle?.(v.id)}
 className="flex-1 py-1 bg-[#17202B] hover:bg-[#202C3C] border border-[#2C3B4E] text-[10px] font-mono text-[#A0AEC0]"
 >
 REPAIR
 </button>
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
 <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[#94A3B8]"><div>DISTANCE: {selectedSquadDistance===null?'—':`${Math.round(selectedSquadDistance)}m`}</div><div>CARRY: {squadInventory?`${squadInventory.used.toFixed(1)}/${squadInventory.capacity}kg`:'—'}</div></div>
 {selectedSearch?.searchProgress !== undefined && selectedSearch.searchProgress > 0 && !selectedSearch.searched ? (
   <div className="space-y-1">
     <div className="h-1.5 w-full bg-black/80 border border-amber-500/40 rounded-sm overflow-hidden">
       <div className="h-full bg-amber-400" style={{ width: `${selectedSearch.searchProgress}%` }} />
     </div>
     <div className="text-[9px] font-mono text-amber-400">EST DURATION: ~{Math.round(selectedSearch.totalDurationSec || 20)}s (AREA BASED)</div>
   </div>
 ) : null}
 {selectedSearch?.searched ? <div className="text-[9px] font-mono text-[#A0AEC0]">SEARCH COMPLETE. SUPPLIES SECURED.</div> : <button disabled={!selectedSquad} onClick={()=>selectedBuilding&&onSearchBuilding?.(selectedBuilding)} className="w-full py-1.5 bg-[#17202B] disabled:opacity-35 border border-[#CBD5E1]/60 text-[10px] font-heading font-bold uppercase">{selectedSquadDistance!==null&&selectedSquadDistance<=16?(selectedSearch?.searchProgress?'SEARCHING...':'SEARCH STRUCTURE'):'DISPATCH SQUAD TO SEARCH'}</button>}
 {selectedSearch?.lootedItems && selectedSearch.lootedItems.length > 0 ? (
   <div className="text-[9px] font-mono text-[#CBD5E1]">
     RECOVERED: {selectedSearch.lootedItems.map(l => `${l.label.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase())} ×${l.quantity}`).join(', ')}
   </div>
 ) : selectedSearch?.searched&&selectedSearch.loot.map(l=><div key={l.id} className="text-[9px] font-mono text-[#CBD5E1]">{l.label.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase()).toUpperCase()} ×{l.quantity}</div>)}
 </div>
 {selectedHiddenGroup?.isDiscovered&&!selectedHiddenGroup.isRecruited&&<div className="p-2.5 bg-[#15171B] border border-[#4B5563] flex flex-col gap-2 clip-card-chip"><div className="font-heading font-bold text-[10px]">SURVIVORS DETECTED · GROUP OF {selectedHiddenGroup.generalCount+1}</div><div className="text-[9px] font-mono text-[#718096]">{selectedHiddenGroup.hasSmokeClue?'CHIMNEY SMOKE CONFIRMS HUMAN ACTIVITY.':'SIGNS OF HUMAN ACTIVITY.'}</div><button onClick={()=>onOpenRecruitment?.(selectedHiddenGroup)} className="w-full py-1.5 bg-[#17202B] border border-[#CBD5E1]/60 text-[10px] font-heading font-bold">APPROACH GROUP LEADER</button></div>}

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
 {selectedLair.occupantCount} OCCUPANTS · {selectedLair.initialOccupantCount - selectedLair.occupantCount} CLEARED
 </div>
 <p className="text-[10px] font-mono text-[#94A3B8]">
 A persistent nest spawning infected day and night. Stand a squad on the site to clear it — the longer it stands, the worse it gets.
 </p>
 <button
 onClick={() => onAssaultThreat?.(selectedBuilding.id)}
 className="w-full py-1.5 bg-[#1A2E0A] hover:bg-[#24400E] border border-[#65A30D] text-[10px] font-heading font-bold text-[#BEF264] hover:text-white uppercase"
 >
 ASSAULT LAIR
 </button>
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
 {(
 [
 'shelter_bunkhouse',
 'cookhouse',
 'greenhouse_hydro',
 'storage_depot',
 'water_cistern',
 'infirmary_clinic',
 'guard_watchtower',
 'barricade_gatehouse',
 'armory_cache',
 'workshop_forge',
 'timber_mill',
 'scrap_smelter',
 'comms_relay',
 'research_lab',
 'generator_station',
 'community_hall',
 ] as FunctionalBuildingTypeId[]
 ).map((typeId) => {
 const def = FUNCTIONAL_BUILDING_DEFINITIONS[typeId];
 if (!def) return null;
 const cost = def.adaptationCost;

 return (
 <div
 key={typeId}
 className="p-2.5 bg-[#11141A] border border-[#222832] flex items-center justify-between gap-2 clip-card-chip"
 >
 <div className="flex-1 min-w-0">
 <div className="font-heading font-bold text-xs text-[#E8E8E8] uppercase">
 {def.name}
 </div>
 <div className="text-[9px] font-mono text-[#718096] line-clamp-1">
 {def.description}
 </div>
 <div className="text-[9px] font-mono text-[#A0AEC0] mt-0.5">
 COST: {cost.wood} Wood, {cost.metal} Metal, {cost.bricks} Bricks
 </div>
 </div>

 <button
 onClick={() => onAdaptBuilding?.(selectedBuilding, typeId)}
 className="px-2.5 py-1.5 bg-[#17202B] hover:bg-[#202C3C] border border-[#CBD5E1]/70 text-[10px] font-heading font-bold text-[#E8E8E8] hover:border-[#CBD5E1] uppercase shrink-0"
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
