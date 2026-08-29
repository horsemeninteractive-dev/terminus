import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Axe,
  Boxes,
  Building,
  Building2,
  ChevronDown,
  ChevronsUp,
  ChevronUp,
  Construction,
  Equal,
  Factory,
  Flame,
  FlaskConical,
  Hammer,
  HeartPulse,
  Home,
  Layers,
  MoreHorizontal,
  Pickaxe,
  Plus,
  Radio,
  Search,
  Shield,
  ShieldAlert,
  Soup,
  Sprout,
  TreePine,
  Trees,
  User,
  Users,
  Utensils,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  FUNCTIONAL_CATEGORIES,
  FUNCTIONAL_BUILDING_DEFINITIONS,
} from '../data/functionalBuildings';
import {
  FunctionalBuildingTypeId,
  FunctionalCategory,
  SettlementState,
} from '../types/settlement';
import {
  WorkerJobTypeId,
  WorkerPriorityLevel,
  WorkerJobInfo,
  ALL_WORKER_JOB_TYPES,
  DEFAULT_WORKER_PRIORITIES,
  DEFAULT_WORKER_LIMITS,
  calculateCitizenBreakdownStats,
  getWorkerJobDemand,
  WORKER_JOB_METADATA,
} from '../services/populationService';
import { GatherResourceType } from './AreaGatherOverlay';
import { soundEngine } from '../services/soundService';

export interface TacticalActionBarProps {
  settlement: SettlementState;
  onSelectAdaptationType: (typeId: FunctionalBuildingTypeId) => void;
  onSelectFreestandingBlueprint: (typeId: FunctionalBuildingTypeId) => void;
  onStartGatherArea: (resourceType: GatherResourceType) => void;
  activeGatherType: GatherResourceType | null;
  onUpdateWorkerJobPriority: (jobId: WorkerJobTypeId, priority: WorkerPriorityLevel) => void;
  onUpdateWorkerJobLimit: (jobId: WorkerJobTypeId, limit: number) => void;
  onSetWorkerJobToZero: (jobId: WorkerJobTypeId) => void;
  onSetWorkerJobToMax: (jobId: WorkerJobTypeId) => void;
  onOpenPopulationRoster?: () => void;
  idleLaborCount: number;
  totalLaborCount: number;
}

// 6 Category Tabs for the Buildings Panel (matching Screenshot 1021)
interface BuildingCategoryTab {
  id: string;
  label: string;
  icon: LucideIcon;
  categories: FunctionalCategory[];
  buildingTypeIds?: FunctionalBuildingTypeId[];
}

const BUILDING_CATEGORY_TABS: BuildingCategoryTab[] = [
  {
    id: 'shelter',
    label: 'Shelter & Basic',
    icon: Home,
    categories: ['basic'],
  },
  {
    id: 'food',
    label: 'Food & Farming',
    icon: Sprout,
    categories: ['food'],
  },
  {
    id: 'production',
    label: 'Production & Crafting',
    icon: Factory,
    categories: ['production'],
  },
  {
    id: 'defense',
    label: 'Defense & Fortifications',
    icon: Shield,
    categories: ['defense_walls', 'defense_towers', 'defense'],
  },
  {
    id: 'civilian_medical',
    label: 'Civilian, Research & Medical',
    icon: User,
    categories: ['utility', 'civilian'],
  },
  {
    id: 'other',
    label: 'Utility & Decorative',
    icon: MoreHorizontal,
    categories: ['decorative', 'other'],
  },
];

const JOB_ICONS: Record<WorkerJobTypeId, LucideIcon> = {
  builder: Hammer,
  scavenger: Pickaxe,
  farming: Sprout,
  food_prep: Soup,
  guard: Shield,
  factory: Factory,
  scientist: FlaskConical,
  nurse: Plus,
};

export const TacticalActionBar: React.FC<TacticalActionBarProps> = ({
  settlement,
  onSelectAdaptationType,
  onSelectFreestandingBlueprint,
  onStartGatherArea,
  activeGatherType,
  onUpdateWorkerJobPriority,
  onUpdateWorkerJobLimit,
  onSetWorkerJobToZero,
  onSetWorkerJobToMax,
  onOpenPopulationRoster,
  idleLaborCount,
  totalLaborCount,
}) => {
  const [activePanel, setActivePanel] = useState<'buildings' | 'freestanding' | 'area_works' | 'citizens' | null>(null);
  const [selectedBuildingTab, setSelectedBuildingTab] = useState<string>('civilian_medical');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // keep open if user is dragging an area gather on map
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('touchstart', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleTogglePanel = (panel: 'buildings' | 'freestanding' | 'area_works' | 'citizens') => {
    soundEngine.playClick();
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  // Demographic breakdown calculation
  const citizenStats = useMemo(() => {
    return calculateCitizenBreakdownStats(settlement);
  }, [settlement]);

  // Worker Job Demands & Priorities
  const jobDemands = useMemo(() => {
    return getWorkerJobDemand(settlement);
  }, [settlement]);

  const generalPop = settlement.generalPopulation;
  const assignedWorkerJobs = generalPop?.assignedWorkerJobs || {
    builder: 0,
    scavenger: 0,
    farming: 0,
    food_prep: 0,
    guard: 0,
    factory: 0,
    scientist: 0,
    nurse: 0,
  };

  const workerPriorities = generalPop?.workerPriorities || DEFAULT_WORKER_PRIORITIES;
  const workerLimits = generalPop?.workerLimits || DEFAULT_WORKER_LIMITS;

  // Filter buildings for the selected building category tab
  const currentCategoryTab = BUILDING_CATEGORY_TABS.find((t) => t.id === selectedBuildingTab) || BUILDING_CATEGORY_TABS[0];
  const tabBuildings = useMemo(() => {
    return Object.values(FUNCTIONAL_BUILDING_DEFINITIONS).filter((def) => {
      return currentCategoryTab.categories.includes(def.category);
    });
  }, [selectedBuildingTab, currentCategoryTab]);

  return (
    <div
      id="tactical-bottom-action-bar"
      ref={containerRef}
      className="fixed bottom-3 sm:bottom-4 left-3 sm:left-4 z-40 flex flex-col select-none pointer-events-auto max-w-[calc(100vw-1.5rem)] font-sans"
    >
      {/* ------------------------------------------------------------- */}
      {/* 1. BUILDINGS PANEL (MATCHING SCREENSHOT 1021)                 */}
      {/* ------------------------------------------------------------- */}
      {activePanel === 'buildings' && (
        <div className="mb-2 w-[min(94vw,430px)] bg-[#0A0E14]/95 border-2 border-[#1E293B] backdrop-blur-md flex flex-col text-[#E2E8F0] animate-in fade-in slide-in-from-bottom-2 duration-150 max-h-[72vh] shadow-2xl rounded-sm">
          {/* Header */}
          <div className="px-3 py-2 bg-[#0F141D] border-b border-[#1E293B] flex items-center justify-between">
            <span className="font-heading font-black text-xs sm:text-sm text-[#E2E8F0] tracking-wider uppercase">
              BUILDINGS
            </span>
            <button
              onClick={() => setActivePanel(null)}
              className="text-[#94A3B8] hover:text-white transition-colors p-1"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-row flex-1 min-h-0 overflow-hidden">
            {/* Left Category Icon Rail */}
            <div className="flex flex-col w-12 sm:w-14 shrink-0 border-r border-[#1E293B] bg-[#070A0F] p-1 gap-1">
              {BUILDING_CATEGORY_TABS.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = selectedBuildingTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setSelectedBuildingTab(tab.id);
                      soundEngine.playClick();
                    }}
                    title={tab.label}
                    className={`w-full aspect-square flex items-center justify-center transition-all border ${
                      isActive
                        ? 'bg-[#10B981] border-[#10B981] text-black shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                        : 'bg-[#0E131B] hover:bg-[#1A2332] border-[#1E293B] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <TabIcon className="w-5 h-5 shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* Right Building List */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#0A0E14]/80 overflow-y-auto p-2 space-y-1.5 max-h-[58vh]">
              {tabBuildings.length === 0 ? (
                <div className="p-4 text-center text-xs font-mono text-[#64748B]">
                  No facilities available in this category.
                </div>
              ) : (
                tabBuildings.map((def) => {
                  return (
                    <button
                      key={def.id}
                      onClick={() => {
                        onSelectAdaptationType(def.id);
                        setActivePanel(null);
                        soundEngine.playClick();
                      }}
                      className="w-full flex items-center justify-between p-2.5 bg-[#0F141D] hover:bg-[#182232] border border-[#1E293B] hover:border-[#10B981] transition-all text-left group min-h-[46px] touch-manipulation"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6 h-6 rounded bg-[#1A2332] border border-[#2D3B4E] flex items-center justify-center shrink-0">
                          <Plus className="w-3.5 h-3.5 text-[#10B981]" />
                        </div>
                        <span className="font-heading font-black text-xs text-[#E2E8F0] group-hover:text-white uppercase tracking-wider truncate">
                          {def.name}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-[#64748B] group-hover:text-[#94A3B8] shrink-0 ml-2">
                        {def.adaptationCost.wood}W / {def.adaptationCost.metal}M / {def.adaptationCost.bricks}B
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. FREESTANDING DEFENSES PANEL                                */}
      {/* ------------------------------------------------------------- */}
      {activePanel === 'freestanding' && (
        <div className="mb-2 w-[min(90vw,340px)] bg-[#0A0E14]/95 border-2 border-[#1E293B] backdrop-blur-md p-1.5 flex flex-col gap-1 text-[#E2E8F0] animate-in fade-in slide-in-from-bottom-2 duration-150 shadow-2xl rounded-sm">
          <div className="px-2.5 py-1.5 bg-[#0F141D] border-b border-[#1E293B] flex items-center justify-between">
            <span className="font-heading font-black text-xs text-[#E2E8F0] tracking-wider uppercase">
              CONSTRUCT FORTIFICATIONS
            </span>
            <button
              onClick={() => setActivePanel(null)}
              className="text-[#94A3B8] hover:text-white transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col gap-1 p-1 max-h-72 overflow-y-auto">
            <button
              onClick={() => {
                onSelectFreestandingBlueprint('wooden_palisade');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className="flex items-center gap-2.5 p-2 bg-[#0F141D] hover:bg-[#1A2332] border border-[#1E293B] hover:border-[#10B981] transition-all text-left"
            >
              <Shield className="w-4 h-4 text-[#F59E0B] shrink-0" />
              <div className="flex flex-col">
                <span className="font-heading font-bold text-xs text-white uppercase">Wooden Palisade Wall</span>
                <span className="font-mono text-[9px] text-[#94A3B8]">Cost: 20 Wood | Perimeter Barrier</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectFreestandingBlueprint('brick_wall');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className="flex items-center gap-2.5 p-2 bg-[#0F141D] hover:bg-[#1A2332] border border-[#1E293B] hover:border-[#10B981] transition-all text-left"
            >
              <Shield className="w-4 h-4 text-[#EA580C] shrink-0" />
              <div className="flex flex-col">
                <span className="font-heading font-bold text-xs text-white uppercase">Solid Brick Wall</span>
                <span className="font-mono text-[9px] text-[#94A3B8]">Cost: 35 Bricks, 5 Wood, 5 Metal</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectFreestandingBlueprint('fortified_wall');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className="flex items-center gap-2.5 p-2 bg-[#0F141D] hover:bg-[#1A2332] border border-[#1E293B] hover:border-[#10B981] transition-all text-left"
            >
              <Construction className="w-4 h-4 text-[#E2E8F0] shrink-0" />
              <div className="flex flex-col">
                <span className="font-heading font-bold text-xs text-white uppercase">Reinforced Concrete Wall</span>
                <span className="font-mono text-[9px] text-[#94A3B8]">Cost: 50 Bricks, 30 Metal, 10 Wood</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectFreestandingBlueprint('metal_fence');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className="flex items-center gap-2.5 p-2 bg-[#0F141D] hover:bg-[#1A2332] border border-[#1E293B] hover:border-[#10B981] transition-all text-left"
            >
              <Shield className="w-4 h-4 text-[#94A3B8] shrink-0" />
              <div className="flex flex-col">
                <span className="font-heading font-bold text-xs text-white uppercase">Steel Mesh Fence</span>
                <span className="font-mono text-[9px] text-[#94A3B8]">Cost: 30 Metal, 5 Wood, 5 Bricks</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectFreestandingBlueprint('wooden_gate');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className="flex items-center gap-2.5 p-2 bg-[#0F141D] hover:bg-[#1A2332] border border-[#1E293B] hover:border-[#10B981] transition-all text-left"
            >
              <Home className="w-4 h-4 text-[#10B981] shrink-0" />
              <div className="flex flex-col">
                <span className="font-heading font-bold text-xs text-white uppercase">Fortified Wooden Gate</span>
                <span className="font-mono text-[9px] text-[#94A3B8]">Cost: 35 Wood, 10 Metal | Passable Gate</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectFreestandingBlueprint('metal_gate');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className="flex items-center gap-2.5 p-2 bg-[#0F141D] hover:bg-[#1A2332] border border-[#1E293B] hover:border-[#10B981] transition-all text-left"
            >
              <Home className="w-4 h-4 text-[#38BDF8] shrink-0" />
              <div className="flex flex-col">
                <span className="font-heading font-bold text-xs text-white uppercase">Heavy Steel Gate</span>
                <span className="font-mono text-[9px] text-[#94A3B8]">Cost: 45 Metal, 10 Bricks, 5 Wood</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectFreestandingBlueprint('wooden_tower');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className="flex items-center gap-2.5 p-2 bg-[#0F141D] hover:bg-[#1A2332] border border-[#1E293B] hover:border-[#10B981] transition-all text-left"
            >
              <ShieldAlert className="w-4 h-4 text-[#F59E0B] shrink-0" />
              <div className="flex flex-col">
                <span className="font-heading font-bold text-xs text-white uppercase">Guard Watchtower</span>
                <span className="font-mono text-[9px] text-[#94A3B8]">Cost: 45 Wood, 10 Metal, 10 Bricks</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectFreestandingBlueprint('metal_tower');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className="flex items-center gap-2.5 p-2 bg-[#0F141D] hover:bg-[#1A2332] border border-[#1E293B] hover:border-[#10B981] transition-all text-left"
            >
              <ShieldAlert className="w-4 h-4 text-[#38BDF8] shrink-0" />
              <div className="flex flex-col">
                <span className="font-heading font-bold text-xs text-white uppercase">Steel Truss Tower</span>
                <span className="font-mono text-[9px] text-[#94A3B8]">Cost: 55 Metal, 15 Wood, 15 Bricks</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectFreestandingBlueprint('floodlight_tower');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className="flex items-center gap-2.5 p-2 bg-[#0F141D] hover:bg-[#1A2332] border border-[#1E293B] hover:border-[#10B981] transition-all text-left"
            >
              <Zap className="w-4 h-4 text-[#FBBF24] shrink-0" />
              <div className="flex flex-col">
                <span className="font-heading font-bold text-xs text-white uppercase">Floodlight Tower</span>
                <span className="font-mono text-[9px] text-[#94A3B8]">Cost: 40 Metal, 10 Wood, 10 Bricks | Night Vision</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. AREA WORKS PANEL (MATCHING SCREENSHOT 1022)                */}
      {/* ------------------------------------------------------------- */}
      {activePanel === 'area_works' && (
        <div className="mb-2 w-[min(90vw,310px)] bg-[#0A0E14]/95 border-2 border-[#1E293B] backdrop-blur-md p-1.5 flex flex-col gap-1 text-[#E2E8F0] animate-in fade-in slide-in-from-bottom-2 duration-150 shadow-2xl rounded-sm">
          {/* Header */}
          <div className="px-2.5 py-1.5 bg-[#0F141D] border-b border-[#1E293B] flex items-center justify-between">
            <span className="font-heading font-black text-xs sm:text-sm text-[#E2E8F0] tracking-wider uppercase">
              AREA WORKS
            </span>
            <button
              onClick={() => setActivePanel(null)}
              className="text-[#94A3B8] hover:text-white transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-1 space-y-1.5">
            {/* 1. GATHER METAL */}
            <button
              onClick={() => {
                onStartGatherArea('metal');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className={`w-full flex items-center gap-3 p-2.5 border transition-all text-left group min-h-[44px] touch-manipulation ${
                activeGatherType === 'metal'
                  ? 'bg-[#152336] border-[#10B981] text-white'
                  : 'bg-[#0F141D] hover:bg-[#1A2332] border-[#1E293B] hover:border-[#10B981]'
              }`}
            >
              <Boxes className="w-4 h-4 text-[#94A3B8] group-hover:text-[#10B981] shrink-0" />
              <span className="font-heading font-black text-xs text-[#E2E8F0] group-hover:text-white uppercase tracking-wider">
                GATHER METAL
              </span>
            </button>

            {/* 2. GATHER BRICKS */}
            <button
              onClick={() => {
                onStartGatherArea('bricks');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className={`w-full flex items-center gap-3 p-2.5 border transition-all text-left group min-h-[44px] touch-manipulation ${
                activeGatherType === 'bricks'
                  ? 'bg-[#152336] border-[#10B981] text-white'
                  : 'bg-[#0F141D] hover:bg-[#1A2332] border-[#1E293B] hover:border-[#10B981]'
              }`}
            >
              <Layers className="w-4 h-4 text-[#94A3B8] group-hover:text-[#10B981] shrink-0" />
              <span className="font-heading font-black text-xs text-[#E2E8F0] group-hover:text-white uppercase tracking-wider">
                GATHER BRICKS
              </span>
            </button>

            {/* 3. GATHER WOOD */}
            <button
              onClick={() => {
                onStartGatherArea('wood');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className={`w-full flex items-center gap-3 p-2.5 border transition-all text-left group min-h-[44px] touch-manipulation ${
                activeGatherType === 'wood'
                  ? 'bg-[#152336] border-[#10B981] text-white'
                  : 'bg-[#0F141D] hover:bg-[#1A2332] border-[#1E293B] hover:border-[#10B981]'
              }`}
            >
              <Axe className="w-4 h-4 text-[#94A3B8] group-hover:text-[#10B981] shrink-0" />
              <span className="font-heading font-black text-xs text-[#E2E8F0] group-hover:text-white uppercase tracking-wider">
                GATHER WOOD
              </span>
            </button>

            {/* 4. PLANT TREES */}
            <button
              onClick={() => {
                onStartGatherArea('wood');
                setActivePanel(null);
                soundEngine.playClick();
              }}
              className="w-full flex items-center gap-3 p-2.5 bg-[#0F141D] hover:bg-[#1A2332] border border-[#1E293B] hover:border-[#10B981] transition-all text-left group min-h-[44px] touch-manipulation"
            >
              <Sprout className="w-4 h-4 text-[#94A3B8] group-hover:text-[#10B981] shrink-0" />
              <span className="font-heading font-black text-xs text-[#E2E8F0] group-hover:text-white uppercase tracking-wider">
                PLANT TREES
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. CITIZENS & WORKERS PANEL (MATCHING SCREENSHOT 1023)        */}
      {/* ------------------------------------------------------------- */}
      {activePanel === 'citizens' && (
        <div className="mb-2 w-[min(94vw,460px)] bg-[#0A0E14]/95 border-2 border-[#1E293B] backdrop-blur-md flex flex-col text-[#E2E8F0] animate-in fade-in slide-in-from-bottom-2 duration-150 max-h-[75vh] shadow-2xl rounded-sm">
          {/* Header */}
          <div className="px-3 py-2 bg-[#0F141D] border-b border-[#1E293B] flex items-center justify-between">
            <span className="font-heading font-black text-xs sm:text-sm text-[#E2E8F0] tracking-wider uppercase">
              CITIZENS
            </span>
            <button
              onClick={() => setActivePanel(null)}
              className="text-[#94A3B8] hover:text-white transition-colors p-1"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-2.5 overflow-y-auto max-h-[66vh] space-y-3">
            {/* Top Demographics Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="flex items-center gap-2 p-1.5 bg-[#070A0F] border border-[#1E293B] rounded-sm">
                <Users className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                <span className="text-[#94A3B8] text-[10px] sm:text-xs">TOTAL CITIZENS</span>
                <span className="font-bold text-white ml-auto">{citizenStats.totalCitizens}</span>
              </div>
              <div className="flex items-center gap-2 p-1.5 bg-[#070A0F] border border-[#1E293B] rounded-sm">
                <User className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                <span className="text-[#94A3B8] text-[10px] sm:text-xs">CHILDREN</span>
                <span className="font-bold text-white ml-auto">{citizenStats.children}</span>
              </div>
              <div className="flex items-center gap-2 p-1.5 bg-[#070A0F] border border-[#1E293B] rounded-sm">
                <Home className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                <span className="text-[#94A3B8] text-[10px] sm:text-xs">HOMELESS</span>
                <span className="font-bold text-white ml-auto">{citizenStats.homeless}</span>
              </div>
              <div className="flex items-center gap-2 p-1.5 bg-[#070A0F] border border-[#1E293B] rounded-sm">
                <HeartPulse className="w-3.5 h-3.5 text-[#EF4444] shrink-0" />
                <span className="text-[#94A3B8] text-[10px] sm:text-xs">ILL</span>
                <span className="font-bold text-white ml-auto">{citizenStats.ill}</span>
              </div>
            </div>

            {/* Workers Section Header & Sub-Stats */}
            <div className="pt-1 border-t border-[#1E293B]">
              <div className="font-heading font-black text-[11px] text-[#94A3B8] uppercase tracking-wider mb-1.5">
                WORKERS
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-2">
                <div className="flex items-center gap-2 p-1.5 bg-[#070A0F] border border-[#1E293B] rounded-sm">
                  <User className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                  <span className="text-[#94A3B8] text-[10px] sm:text-xs">UNEMPLOYED</span>
                  <span className="font-bold text-[#10B981] ml-auto">
                    {citizenStats.unemployed} / {citizenStats.totalWorkers}
                  </span>
                </div>
                <div className="flex items-center gap-2 p-1.5 bg-[#070A0F] border border-[#1E293B] rounded-sm">
                  <Shield className="w-3.5 h-3.5 text-[#3B82F6] shrink-0" />
                  <span className="text-[#94A3B8] text-[10px] sm:text-xs">SQUAD MEMBERS</span>
                  <span className="font-bold text-white ml-auto">{citizenStats.squadMembers}</span>
                </div>
              </div>

              {/* 8 Worker Job Rows with Priority Controls & 0/MAX Limit Buttons */}
              <div className="space-y-1.5">
                {ALL_WORKER_JOB_TYPES.map((jobId) => {
                  const meta = WORKER_JOB_METADATA[jobId];
                  const Icon = JOB_ICONS[jobId] || Hammer;
                  const assigned = assignedWorkerJobs[jobId] || 0;
                  const maxDemand = jobDemands[jobId] || 0;
                  const currentPriority = workerPriorities[jobId] ?? 2;
                  const isLimitZero = (workerLimits[jobId] ?? 9999) === 0;

                  return (
                    <div
                      key={jobId}
                      className="flex items-center justify-between p-2 bg-[#0F141D] border border-[#1E293B] hover:border-[#334155] rounded-sm transition-colors"
                    >
                      {/* Left: Icon + Job Title */}
                      <div className="flex items-center gap-2 min-w-[130px] sm:min-w-[150px]">
                        <Icon className="w-4 h-4 text-[#10B981] shrink-0" />
                        <span className="font-heading font-black text-[11px] sm:text-xs text-[#E2E8F0] tracking-wide uppercase truncate">
                          {meta.name}
                        </span>
                      </div>

                      {/* Middle: Count Display */}
                      <div className="font-mono font-bold text-xs text-right pr-2 min-w-[65px]">
                        <span className={assigned > 0 ? 'text-[#10B981]' : 'text-white'}>
                          {assigned}
                        </span>
                        <span className="text-[#64748B]"> / </span>
                        <span className="text-[#94A3B8]">{maxDemand}</span>
                      </div>

                      {/* Right: Priority Buttons & 0/MAX Limit Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* 4 Priority Chevrons: [v] [=] [^] [^^] */}
                        <div className="flex items-center bg-[#070A0F] border border-[#1E293B] p-0.5 rounded-sm">
                          {/* Low Priority [v] (1) */}
                          <button
                            onClick={() => {
                              onUpdateWorkerJobPriority(jobId, 1);
                              soundEngine.playClick();
                            }}
                            title="Low Priority"
                            className={`px-1.5 py-0.5 text-[10px] font-bold font-mono transition-all rounded-xs ${
                              currentPriority === 1 && !isLimitZero
                                ? 'bg-[#10B981] text-black shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                                : 'text-[#64748B] hover:text-white hover:bg-[#1E293B]'
                            }`}
                          >
                            v
                          </button>

                          {/* Normal Priority [=] (2) */}
                          <button
                            onClick={() => {
                              onUpdateWorkerJobPriority(jobId, 2);
                              soundEngine.playClick();
                            }}
                            title="Normal Priority"
                            className={`px-1.5 py-0.5 text-[10px] font-bold font-mono transition-all rounded-xs ${
                              currentPriority === 2 && !isLimitZero
                                ? 'bg-[#10B981] text-black shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                                : 'text-[#64748B] hover:text-white hover:bg-[#1E293B]'
                            }`}
                          >
                            =
                          </button>

                          {/* High Priority [^] (3) */}
                          <button
                            onClick={() => {
                              onUpdateWorkerJobPriority(jobId, 3);
                              soundEngine.playClick();
                            }}
                            title="High Priority"
                            className={`px-1.5 py-0.5 text-[10px] font-bold font-mono transition-all rounded-xs ${
                              currentPriority === 3 && !isLimitZero
                                ? 'bg-[#10B981] text-black shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                                : 'text-[#64748B] hover:text-white hover:bg-[#1E293B]'
                            }`}
                          >
                            ^
                          </button>

                          {/* Urgent Priority [^^] (4) */}
                          <button
                            onClick={() => {
                              onUpdateWorkerJobPriority(jobId, 4);
                              soundEngine.playClick();
                            }}
                            title="Urgent Priority"
                            className={`px-1.5 py-0.5 text-[10px] font-bold font-mono transition-all rounded-xs ${
                              currentPriority === 4 && !isLimitZero
                                ? 'bg-[#10B981] text-black shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                                : 'text-[#64748B] hover:text-white hover:bg-[#1E293B]'
                            }`}
                          >
                            ^^
                          </button>
                        </div>

                        {/* Quick 0 / MAX Limit Controls */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              onSetWorkerJobToZero(jobId);
                              soundEngine.playClick();
                            }}
                            title="Pause / Zero workers"
                            className={`px-1.5 py-0.5 text-[9px] font-mono font-bold border transition-all rounded-xs ${
                              isLimitZero
                                ? 'bg-[#EF4444] border-[#EF4444] text-white'
                                : 'bg-[#070A0F] hover:bg-[#1E293B] border-[#1E293B] text-[#94A3B8] hover:text-white'
                            }`}
                          >
                            0
                          </button>

                          <button
                            onClick={() => {
                              onSetWorkerJobToMax(jobId);
                              soundEngine.playClick();
                            }}
                            title="Set to Max capacity"
                            className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-[#070A0F] hover:bg-[#10B981] hover:text-black border border-[#1E293B] hover:border-[#10B981] text-[#94A3B8] transition-all rounded-xs"
                          >
                            MAX
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM DOCK TOOLBAR (4 ICONS IN BOTTOM LEFT)                  */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* 1. BUILDINGS BUTTON */}
        <button
          id="btn-action-adapt-building"
          onClick={() => handleTogglePanel('buildings')}
          title="Buildings (B)"
          className={`w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] flex items-center justify-center transition-all group relative touch-manipulation active:scale-95 border ${
            activePanel === 'buildings'
              ? 'bg-[#10B981] border-[#10B981] text-black shadow-[0_0_12px_rgba(16,185,129,0.5)]'
              : 'bg-[#0A0D12]/95 hover:bg-[#151D28] border-[#2D3B4E] hover:border-[#10B981] text-[#94A3B8] hover:text-white'
          }`}
        >
          <Home className={`w-5 h-5 sm:w-6 sm:h-6 ${activePanel === 'buildings' ? 'text-black font-bold' : 'text-[#94A3B8] group-hover:text-white'} transition-colors`} />
        </button>

        {/* 2. FREESTANDING DEFENSES BUTTON */}
        <button
          id="btn-action-build-walls"
          onClick={() => handleTogglePanel('freestanding')}
          title="Fortifications & Walls (W)"
          className={`w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] flex items-center justify-center transition-all group relative touch-manipulation active:scale-95 border ${
            activePanel === 'freestanding'
              ? 'bg-[#10B981] border-[#10B981] text-black shadow-[0_0_12px_rgba(16,185,129,0.5)]'
              : 'bg-[#0A0D12]/95 hover:bg-[#151D28] border-[#2D3B4E] hover:border-[#10B981] text-[#94A3B8] hover:text-white'
          }`}
        >
          <Construction className={`w-5 h-5 sm:w-6 sm:h-6 ${activePanel === 'freestanding' ? 'text-black font-bold' : 'text-[#94A3B8] group-hover:text-white'} transition-colors`} />
        </button>

        {/* 3. AREA WORKS BUTTON */}
        <button
          id="btn-action-harvest-wood"
          onClick={() => handleTogglePanel('area_works')}
          title="Area Works (H)"
          className={`w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] flex items-center justify-center transition-all group relative touch-manipulation active:scale-95 border ${
            activeGatherType !== null || activePanel === 'area_works'
              ? 'bg-[#10B981] border-[#10B981] text-black shadow-[0_0_12px_rgba(16,185,129,0.5)]'
              : 'bg-[#0A0D12]/95 hover:bg-[#151D28] border-[#2D3B4E] hover:border-[#10B981] text-[#94A3B8] hover:text-white'
          }`}
        >
          <Axe className={`w-5 h-5 sm:w-6 sm:h-6 ${activeGatherType !== null || activePanel === 'area_works' ? 'text-black font-bold' : 'text-[#94A3B8] group-hover:text-[#10B981]'} transition-colors`} />
        </button>

        {/* 4. CITIZENS / WORKERS BUTTON WITH BADGE */}
        <button
          id="btn-action-population-roster"
          onClick={() => handleTogglePanel('citizens')}
          title="Citizens & Workers (P)"
          className={`w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] flex flex-col items-center justify-center transition-all group relative touch-manipulation active:scale-95 border ${
            activePanel === 'citizens'
              ? 'bg-[#10B981] border-[#10B981] text-black shadow-[0_0_12px_rgba(16,185,129,0.5)]'
              : 'bg-[#0A0D12]/95 hover:bg-[#151D28] border-[#2D3B4E] hover:border-[#10B981] text-[#94A3B8] hover:text-white'
          }`}
        >
          <Users className={`w-4 h-4 sm:w-5 sm:h-5 ${activePanel === 'citizens' ? 'text-black font-bold' : 'text-[#94A3B8] group-hover:text-[#10B981]'} transition-colors`} />
          <span className={`text-[8px] sm:text-[9px] font-mono font-bold leading-none mt-0.5 ${activePanel === 'citizens' ? 'text-black' : 'text-[#E2E8F0]'}`}>
            {citizenStats.unemployed}/{citizenStats.totalWorkers}
          </span>
        </button>
      </div>
    </div>
  );
};
