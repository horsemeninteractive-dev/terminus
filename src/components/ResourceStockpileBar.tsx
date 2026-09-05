import React, { useState } from 'react';
import {
 AlertCircle,
 Archive,
 Award,
 BookOpen,
 Box,
 ChevronDown,
 ChevronUp,
 Compass,
 Crosshair,
 Droplets,
 Flame,
 Fuel,
 Globe,
 Heart,
 HeartPulse,
 Package,
 Plus,
 Radio,
 Send,
 Shield,
 Snowflake,
 Sprout,
 Trees,
 Truck,
 Users,
 Utensils,
 Wrench,
 Zap,
} from 'lucide-react';
import { BuildingOutbreakState, SurvivorInfection } from '../types/infection';
import { SettlementState, SettlementStockpile } from '../types/settlement';
import { SettlementRecord } from '../types/caravan';
import { getPrimaryHQ } from '../services/buildingOperational';

interface ResourceStockpileBarProps {
 settlement: SettlementState;
 onOpenFreestandingMenu: () => void;
 onOpenPopulation: () => void;
 onOpenSquads: () => void;
 onOpenMedbay: () => void;
 onOpenVehicles?: () => void;
 onOpenResearch?: () => void;
 onOpenCaravans?: () => void;
 onOpenGlobe?: () => void;
 onOpenMorale?: () => void;
 onOpenWeather?: () => void;
 settlements?: Record<string, SettlementRecord>;
 activeSettlementId?: string;
 onSelectSettlement?: (settlementId: string) => void;
 activeCaravansCount?: number;
 hasHQ: boolean;
}

export const ResourceStockpileBar: React.FC<ResourceStockpileBarProps> = ({
 settlement,
 onOpenFreestandingMenu,
 onOpenPopulation,
 onOpenSquads,
 onOpenMedbay,
 onOpenVehicles,
 onOpenResearch,
 onOpenCaravans,
 onOpenGlobe,
 onOpenMorale,
 onOpenWeather,
 settlements = {},
 activeSettlementId,
 onSelectSettlement,
 activeCaravansCount = 0,
 hasHQ,
}) => {
 const [detailsOpen, setDetailsOpen] = useState(false);
 const [colonyDropdownOpen, setColonyDropdownOpen] = useState(false);
 const {
 stockpile,
 totalStorageCapacity,
 totalLivingCapacity,
 totalDefenseRating,
 namedSurvivors,
 generalPopulation,
 squads,
 squadCapacity,
 infections,
 outbreaks,
 vehicles,
 } = settlement;

 const vehiclesList = vehicles || [];
 const operationalVehicles = vehiclesList.filter((v) => v.condition === 'operational').length;

 const infectionsList = (Array.from(infections?.values() || [])) as SurvivorInfection[];
 const outbreaksList = (Array.from(outbreaks?.values() || [])) as BuildingOutbreakState[];

 const activeInfections = infectionsList.filter(
 (inf) => inf.stage !== 'uninfected' && inf.stage !== 'cured' && inf.stage !== 'turned'
 );
 const symptomaticCount = activeInfections.filter(
 (inf) => inf.stage === 'symptomatic' || inf.stage === 'advanced'
 ).length;
 const activeOutbreaksCount = outbreaksList.filter((o) => o.isOutbreakActive).length;

 const generalTotal = typeof generalPopulation === 'number' ? generalPopulation : (generalPopulation?.total || 0);
 const totalPop = (namedSurvivors?.length || 0) + generalTotal;  // Stockpile amounts accumulate continuously (production × dt); every meter
  // floors to whole units for display.
  const totalFood =
 Math.floor(stockpile.food.canned_goods) +
 Math.floor(stockpile.food.mre_rations) +
 Math.floor(stockpile.food.dried_rations) +
 Math.floor(stockpile.food.fresh_harvest);

 const totalWater =
 Math.floor(stockpile.water.bottled_water) +
 Math.floor(stockpile.water.purified_water) +
 Math.floor(stockpile.water.rainwater);

 const totalMeds =
 Math.floor(stockpile.medical.first_aid_kits) +
 Math.floor(stockpile.medical.sterile_bandages) +
 Math.floor(stockpile.medical.antibiotics) +
 Math.floor(stockpile.medical.painkillers);

 const totalFuel =
 Math.floor(stockpile.fuel.gasoline) + Math.floor(stockpile.fuel.diesel) + Math.floor(stockpile.fuel.biofuel);

 return (
 <div className="absolute top-16 left-3 right-3 sm:left-4 sm:right-auto z-30 pointer-events-auto font-mono">
 {/* Main Consolidated Stockpile Bar (§7.2 Itemized Breakdown) */}
 <div className="bg-[#0e1012]/95 border border-[#33373d] clip-tactical-bracket surface-bevel backdrop-blur-md p-2 max-w-4xl">
 <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
 {/* 1. Settlement HQ & Status / Multi-Settlement Switcher (§7.5) */}
 <div className="relative flex items-center gap-2 pr-3 border-r border-[#262a30]">
 <div
 className={`p-1.5 border ${
 hasHQ
 ? 'bg-[#1b251d] border-[#22c55e] text-[#4ade80]'
 : 'bg-[#291719] border-[#ef4444] text-[#ef4444] animate-pulse'
 }`}
 >
 {hasHQ ? <Shield className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
 </div>
 <div>
 <div className="flex items-center gap-1.5">
 <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold">
 {hasHQ ? 'Settlement Outpost' : 'Starting Outpost'}
 </span>
 {Object.keys(settlements).length > 1 && (
 <button
 onClick={() => setColonyDropdownOpen(!colonyDropdownOpen)}
 className="text-[9px] text-[#10B981] hover:text-white bg-[#151D28] px-1 py-0.2 border border-[#1E293B] flex items-center gap-0.5"
 >
 <span>{Object.keys(settlements).length} Colonies</span>
 <ChevronDown className="w-2.5 h-2.5" />
 </button>
 )}
 </div>
  <div className="text-[12px] font-black text-white truncate max-w-[150px]">
    {hasHQ ? (getPrimaryHQ(settlement)?.buildingName || 'Headquarters') : 'No HQ Established'}
  </div>
 </div>

 {/* Quick Colony Switcher Dropdown */}
 {colonyDropdownOpen && (
 <div className="absolute top-12 left-0 z-50 w-64 bg-[#0e1014] border-2 border-[#CBD5E1] clip-tactical-bracket p-2 space-y-1.5">
 <div className="flex justify-between items-center text-[10px] text-[#9ca3af] font-bold pb-1 border-b border-[#232933]">
 <span>ESTABLISHED COLONIES</span>
 {onOpenGlobe && (
 <button
 onClick={() => {
 setColonyDropdownOpen(false);
 onOpenGlobe();
 }}
 className="text-[#10B981] hover:underline flex items-center gap-1"
 >
 <Globe className="w-3 h-3" />
 <span>Globe Map</span>
 </button>
 )}
 </div>
 <div className="max-h-48 overflow-y-auto space-y-1">
 {(Object.values(settlements) as SettlementRecord[]).map((s) => (
 <button
 key={s.id}
 onClick={() => {
 setColonyDropdownOpen(false);
 if (onSelectSettlement && s.status === 'operational') {
 onSelectSettlement(s.id);
 }
 }}
 className={`w-full text-left p-1.5 text-[11px] border transition-colors ${
 s.id === activeSettlementId
 ? 'bg-[#064E3B]/40 border-[#10B981] text-white font-bold'
 : s.status === 'destroyed'
 ? 'bg-[#210f11] border-[#591c20] text-[#fca5a5] cursor-not-allowed'
 : 'bg-[#121519] border-[#222730] text-[#9ca3af] hover:text-white'
 }`}
 >
 <div className="flex justify-between items-center">
 <span className="truncate">{s.name}</span>
 <span
 className={`text-[8px] font-bold px-1 uppercase ${
 s.status === 'destroyed' ? 'bg-[#7f1d1d] text-white' : 'bg-[#064e3b] text-[#6ee7b7]'
 }`}
 >
 {s.status}
 </span>
 </div>
 <div className="text-[9px] text-[#6b7280]">
 Pop: {(s.state.namedSurvivors?.length || 0) + (typeof s.state.generalPopulation === 'number' ? s.state.generalPopulation : (s.state.generalPopulation?.total || 0))}
 </div>
 </button>
 ))}
 </div>
 </div>
 )}
 </div>

 {/* 2. Construction Materials (§7.2 Wood / Metal / Bricks / Tools) */}
 <div className="flex items-center gap-3 pr-3 border-r border-[#262a30]">
 {/* Wood */}
 <div className="flex items-center gap-1.5" title="Construction Timber / Wood">
 <Trees className="w-3.5 h-3.5 text-[#4ade80]" />
 <div>
 <div className="text-[9px] text-[#6b7280] uppercase">Wood</div>
 <div className="text-[12px] font-black text-white">{Math.floor(stockpile.materials.wood)}</div>
 </div>
 </div>

 {/* Metal */}
 <div className="flex items-center gap-1.5" title="Structural & Scrap Metal">
 <Truck className="w-3.5 h-3.5 text-[#38bdf8]" />
 <div>
 <div className="text-[9px] text-[#6b7280] uppercase">Metal</div>
 <div className="text-[12px] font-black text-white">{Math.floor(stockpile.materials.metal)}</div>
 </div>
 </div>

 {/* Bricks */}
 <div className="flex items-center gap-1.5" title="Masonry & Debris Bricks">
 <Box className="w-3.5 h-3.5 text-[#f97316]" />
 <div>
 <div className="text-[9px] text-[#6b7280] uppercase">Bricks</div>
 <div className="text-[12px] font-black text-white">{Math.floor(stockpile.materials.bricks)}</div>
 </div>
 </div>

 {/* Tools */}
 <div className="flex items-center gap-1.5" title="Construction Tools (hand tools, toolkits)">
 <Wrench className="w-3.5 h-3.5 text-[#c084fc]" />
 <div>
 <div className="text-[9px] text-[#6b7280] uppercase">Tools</div>
 <div className="text-[12px] font-black text-white">{Math.floor(stockpile.materials.tools || 0)}</div>
 </div>
 </div>
 </div>

 {/* 3. Itemized Stockpile Categories (§7.2 Food, Water, Meds, Fuel, Ammo) */}
 <div className="flex items-center gap-3 pr-3 border-r border-[#262a30]">
 {/* Food */}
 <div className="flex items-center gap-1.5" title="Itemized Food Reserves">
 <Utensils className="w-3.5 h-3.5 text-[#fbbf24]" />
 <div>
 <div className="text-[9px] text-[#6b7280] uppercase">Food</div>
 <div className="text-[12px] font-black text-[#fbbf24]">{totalFood}</div>
 </div>
 </div>

 {/* Water */}
 <div className="flex items-center gap-1.5" title="Itemized Potable Water">
 <Droplets className="w-3.5 h-3.5 text-[#cbd5e1]" />
 <div>
 <div className="text-[9px] text-[#6b7280] uppercase">Water</div>
 <div className="text-[12px] font-black text-[#cbd5e1]">{totalWater}L</div>
 </div>
 </div>

 {/* Medical */}
 <div className="flex items-center gap-1.5" title="Medical Supplies & Trauma Kits">
 <HeartPulse className="w-3.5 h-3.5 text-[#f43f5e]" />
 <div>
 <div className="text-[9px] text-[#6b7280] uppercase">Meds</div>
 <div className="text-[12px] font-black text-[#f43f5e]">{totalMeds}</div>
 </div>
 </div>

 {/* Fuel */}
 <div className="flex items-center gap-1.5" title="Combustible Fuel Reserves">
 <Fuel className="w-3.5 h-3.5 text-[#a855f7]" />
 <div>
 <div className="text-[9px] text-[#6b7280] uppercase">Fuel</div>
 <div className="text-[12px] font-black text-[#a855f7]">{totalFuel}L</div>
 </div>
 </div>

 {/* Ammo */}
 <div className="flex items-center gap-1.5" title="Shared Ammunition Pool">
 <Crosshair className="w-3.5 h-3.5 text-[#ef4444]" />
 <div>
 <div className="text-[9px] text-[#6b7280] uppercase">Ammo</div>
 <div className="text-[12px] font-black text-[#ef4444]">{Math.floor(stockpile.ammo.sharedPool)}</div>
 </div>
 </div>
 </div>

 {/* 4. Capacities, Population, Squads & Action Buttons */}
 <div className="flex items-center gap-2">
 {/* Population Roster Button (§4.1 - §4.6) */}
 <button
 id="open-population-btn"
 onClick={onOpenPopulation}
 className="px-2.5 py-1 bg-[#151D28] hover:bg-[#243129] border border-[#1E293B] hover:border-[#10B981] text-[#CBD5E1] hover:text-white text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
 title="Open Population & Labor Command (§4.1 - §4.6)"
 >
 <Users className="w-3.5 h-3.5 text-indigo-400" />
 <span>
 POP: <strong className="text-white">{totalPop}</strong> ({namedSurvivors.length}N/{generalPopulation.total}G)
 </span>
 </button>

 {/* Vehicles / Motor Pool Button (§8) */}
 <button
 id="open-vehicles-btn"
 onClick={onOpenVehicles}
 className="px-2.5 py-1 bg-[#151D28] hover:bg-[#243129] border border-[#1E293B] hover:border-[#10B981] text-[#CBD5E1] hover:text-white text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
 title="Open Motor Pool & Vehicle Fleet Management (§8)"
 >
 <Truck className="w-3.5 h-3.5 text-[#CBD5E1]" />
 <span>
 VEHICLES: <strong className="text-white">{operationalVehicles}/{vehiclesList.length}</strong>
 </span>
 </button>

 {/* Squads Button (§4.3) */}
 <button
 id="open-squads-btn"
 onClick={onOpenSquads}
 className="px-2.5 py-1 bg-[#1c221e] hover:bg-[#25332a] border border-[#2d4f38] hover:border-[#4ade80] text-[#86efac] hover:text-white text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
 title="Open Tactical Squads Management (§4.3)"
 >
 <Shield className="w-3.5 h-3.5 text-emerald-400" />
 <span>
 SQUADS: <strong className="text-white">{squads.length}/{squadCapacity}</strong>
 </span>
 </button>

 {/* Medbay / Infection Triage Button (§6.2, §6.3) */}
 <button
 id="open-medbay-btn"
 onClick={onOpenMedbay}
 className={`px-2.5 py-1 text-[10px] font-bold flex items-center gap-1.5 transition-all border cursor-pointer ${
 activeOutbreaksCount > 0
 ? 'bg-rose-950/80 border-rose-500 text-rose-200 animate-pulse'
 : symptomaticCount > 0
 ? 'bg-amber-950/70 border-amber-500/80 text-amber-200 animate-pulse'
 : activeInfections.length > 0
 ? 'bg-indigo-950/60 border-indigo-500/60 text-indigo-200'
 : 'bg-[#221822] hover:bg-[#2f1f30] border-[#502e52] hover:border-[#ec4899] text-[#f472b6] hover:text-white'
 }`}
 title="Open Medbay, Clinical Triage & Infection Control (§6.2, §6.3)"
 >
 <HeartPulse className="w-3.5 h-3.5 text-pink-400" />
 <span>
 MEDBAY
 {activeOutbreaksCount > 0 ? (
 <strong className="text-white ml-1 bg-rose-600 px-1">OUTBREAK</strong>
 ) : symptomaticCount > 0 ? (
 <strong className="text-white ml-1 bg-amber-600 px-1">{symptomaticCount} SYMPTOM</strong>
 ) : activeInfections.length > 0 ? (
 <strong className="text-indigo-300 ml-1">({activeInfections.length})</strong>
 ) : null}
 </span>
 </button>

 {/* Morale Button (§4.5) */}
 {onOpenMorale && (
 <button
 id="open-morale-btn"
 onClick={onOpenMorale}
 className={`px-2.5 py-1 text-[10px] font-bold flex items-center gap-1.5 transition-colors border cursor-pointer ${
 settlement.morale?.tier === 'euphoric'
 ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/90'
 : settlement.morale?.tier === 'content'
 ? 'bg-sky-950/80 border-sky-500/60 text-sky-300 hover:bg-sky-900/90'
 : settlement.morale?.tier === 'discontent'
 ? 'bg-amber-950/80 border-amber-500/60 text-amber-300 hover:bg-amber-900/90 animate-pulse'
 : 'bg-rose-950/90 border-rose-500 text-rose-300 hover:bg-rose-900 animate-pulse'
 }`}
 title="Settlement Morale & Passive Growth (§4.5)"
 >
 <Heart className="w-3.5 h-3.5" />
 <span>
 MORALE:{' '}
 <strong className="text-white font-mono">
 {settlement.morale?.overallScore ?? 80}%
 </strong>{' '}
 <span className="text-[9px] uppercase opacity-90">
 ({settlement.morale?.tier || 'content'})
 </span>
 </span>
 </button>
 )}

 {/* Weather & Season Button (§9) */}
 {onOpenWeather && (
 <button
 id="open-weather-btn"
 onClick={onOpenWeather}
 className={`px-2.5 py-1 text-[10px] font-bold flex items-center gap-1.5 transition-colors border cursor-pointer ${
 settlement.weather?.currentSeason === 'winter'
 ? 'bg-sky-950/80 border-sky-500/60 text-sky-300 hover:bg-sky-900'
 : settlement.weather?.currentSeason === 'spring'
 ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900'
 : settlement.weather?.currentSeason === 'summer'
 ? 'bg-amber-950/80 border-amber-500/60 text-amber-300 hover:bg-amber-900'
 : 'bg-orange-950/80 border-orange-500/60 text-orange-300 hover:bg-orange-900'
 }`}
 title="Weather & Seasonal Agricultural Forecast (§9)"
 >
 {settlement.weather?.currentSeason === 'winter' ? (
 <Snowflake className="w-3.5 h-3.5 text-sky-300" />
 ) : (
 <Sprout className="w-3.5 h-3.5 text-emerald-400" />
 )}
 <span>
 SEASON:{' '}
 <strong className="text-white font-mono uppercase">
 {settlement.weather?.currentSeason || 'SPRING'}
 </strong>{' '}
 <span className="text-[9px] opacity-80">
 ({settlement.weather?.temperatureC ?? 16}°C)
 </span>
 </span>
 </button>
 )}

 {/* Research Tree Button (§10) */}
 <button
 id="open-research-btn"
 onClick={onOpenResearch}
 className="px-2.5 py-1 bg-[#151D28] hover:bg-[#243129] border border-[#1E293B] hover:border-[#10B981] text-[#CBD5E1] hover:text-white text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"   title="Open Colony Technology & Research Tree (§10) — Scientific Materials fund research"
 ><BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    TECH:{' '}<strong className="text-white font-mono">
                  {Math.floor(settlement.stockpile.materials.scientific_materials || 0)} SM
                </strong>{' '}
 <span className="text-[9px] text-slate-400">
 ({settlement.research?.unlockedNodes?.length || 0}/24)
 </span>
 </span>
 </button>

 {/* Trade Caravans & Inter-Colony Logistics (§7.5) */}
 {onOpenCaravans && (
 <button
 id="open-caravans-btn"
 onClick={onOpenCaravans}
 className="px-2.5 py-1 bg-[#221714] hover:bg-[#33201a] border border-[#52291d] hover:border-[#ea580c] text-[#fdba74] hover:text-white text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
 title="Trade Caravans & Inter-Colony Convoys (§7.5)"
 >
 <Truck className="w-3.5 h-3.5 text-[#fb923c]" />
 <span>
 CARAVANS
 {activeCaravansCount > 0 ? (
 <strong className="ml-1 bg-[#ea580c] text-white px-1 text-[9px] animate-pulse">
 {activeCaravansCount} ACTIVE
 </strong>
 ) : null}
 </span>
 </button>
 )}

 {/* Orbital Globe Map Trigger */}
 {onOpenGlobe && (
 <button
 id="open-globe-map-btn"
 onClick={onOpenGlobe}
 className="px-2.5 py-1 bg-[#151D28] hover:bg-[#243129] border border-[#1E293B] hover:border-[#10B981] text-[#CBD5E1] hover:text-white text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
 title="Open Global Satellite Map to found colonies and view network"
 ><Globe className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>GLOBE</span>
 </button>
 )}
 <div className="hidden lg:flex items-center gap-2 text-[10px] bg-[#141619] px-2 py-1 border border-[#24272c]">
 <div title="Total Storage Capacity">
 <span className="text-[#6b7280]">Cap: </span>
 <span className="text-white font-bold">{totalStorageCapacity}</span>
 </div>
 <span className="text-[#33373d]">|</span>
 <div title="Settlement Defense Rating">
 <span className="text-[#6b7280]">Def: </span>
 <span className="text-[#4ade80] font-bold">+{totalDefenseRating}</span>
 </div>
 </div>

 {/* Toggle Itemized Details */}
 <button
 onClick={() => setDetailsOpen(!detailsOpen)}
 className={`p-1.5 border transition-colors ${
 detailsOpen
 ? 'bg-[#064E3B]/40 border-[#10B981] text-[#10B981]'
 : 'bg-[#141619] border-[#292c31] text-[#9ca3af] hover:text-white'
 }`}
 title="Expand Itemized Resource Stockpile Breakdown"
 >
 {detailsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
 </button>

 {/* Freestanding Construction Button */}
 <button
 id="build-freestanding-btn"
 onClick={onOpenFreestandingMenu}
 disabled={!hasHQ}
 className={`px-2.5 py-1 text-[10px] font-black uppercase flex items-center gap-1.5 border transition-all ${
 hasHQ
 ? 'bg-[#1b2026] hover:bg-[#b31217] border-[#383d46] hover:border-[#b31217] text-white cursor-pointer'
 : 'bg-[#121417] border-[#22262c] text-[#52525b] cursor-not-allowed'
 }`}
 title={hasHQ ? 'Open Freestanding Construction Menu (§7.1)' : 'Establish HQ first'}
 >
 <Wrench className="w-3 h-3 text-[#f59e0b]" />
 <span>Build</span>
 </button>

 </div>
 </div>

 {/* Expandable Itemized Inventory Panel (§7.2 Explicit Tracking) */}
 {detailsOpen && (
 <div className="mt-2 pt-2 border-t border-[#262a30] grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] animate-fadeIn">
 {/* Food Item Breakdown */}
 <div className="bg-[#121417] p-2 border border-[#22262c] space-y-1">
 <div className="text-[#fbbf24] font-bold uppercase text-[9px] flex items-center gap-1 pb-1 border-b border-[#24272c]">
 <Utensils className="w-3 h-3" />
 <span>Food Items</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Canned Goods:</span>
 <span className="text-white font-bold">{Math.floor(stockpile.food.canned_goods)}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">MRE Rations:</span>
 <span className="text-white font-bold">{Math.floor(stockpile.food.mre_rations)}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Dried Rations:</span>
 <span className="text-white font-bold">{Math.floor(stockpile.food.dried_rations)}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Fresh Harvest:</span>
 <span className="text-[#4ade80] font-bold">{Math.floor(stockpile.food.fresh_harvest)}</span>
 </div>
 </div>

 {/* Water Breakdown */}
 <div className="bg-[#121417] p-2 border border-[#22262c] space-y-1">
 <div className="text-[#cbd5e1] font-bold uppercase text-[9px] flex items-center gap-1 pb-1 border-b border-[#24272c]">
 <Droplets className="w-3 h-3" />
 <span>Water Supplies</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Bottled Water:</span>
 <span className="text-white font-bold">{Math.floor(stockpile.water.bottled_water)}L</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Purified Water:</span>
 <span className="text-white font-bold">{Math.floor(stockpile.water.purified_water)}L</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Rain/Raw Water:</span>
 <span className="text-[#9ca3af] font-bold">{Math.floor(stockpile.water.rainwater)}L</span>
 </div>
 </div>

 {/* Medical Breakdown */}
 <div className="bg-[#121417] p-2 border border-[#22262c] space-y-1">
 <div className="text-[#f43f5e] font-bold uppercase text-[9px] flex items-center gap-1 pb-1 border-b border-[#24272c]">
 <HeartPulse className="w-3 h-3" />
 <span>Medical Supplies</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">First Aid Kits:</span>
 <span className="text-white font-bold">{Math.floor(stockpile.medical.first_aid_kits)}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Sterile Bandages:</span>
 <span className="text-white font-bold">{Math.floor(stockpile.medical.sterile_bandages)}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Antibiotics:</span>
 <span className="text-white font-bold">{Math.floor(stockpile.medical.antibiotics)}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Painkillers:</span>
 <span className="text-white font-bold">{Math.floor(stockpile.medical.painkillers)}</span>
 </div>
 </div>

 {/* Fuel Breakdown */}
 <div className="bg-[#121417] p-2 border border-[#22262c] space-y-1">
 <div className="text-[#a855f7] font-bold uppercase text-[9px] flex items-center gap-1 pb-1 border-b border-[#24272c]">
 <Fuel className="w-3 h-3" />
 <span>Fuel Reserves</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Gasoline:</span>
 <span className="text-white font-bold">{Math.floor(stockpile.fuel.gasoline)}L</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Diesel:</span>
 <span className="text-white font-bold">{Math.floor(stockpile.fuel.diesel)}L</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Biofuel:</span>
 <span className="text-[#4ade80] font-bold">{Math.floor(stockpile.fuel.biofuel)}L</span>
 </div>
 </div>

 {/* Settlement Infrastructure Overview */}
 <div className="bg-[#121417] p-2 border border-[#22262c] space-y-1">    <div className="text-[#10B981] font-bold uppercase text-[9px] flex items-center gap-1 pb-1 border-b border-[#24272c]">
      <Shield className="w-3 h-3" />
      <span>Outpost Assets</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Adapted Buildings:</span>
 <span className="text-white font-bold">
 {settlement.adaptedBuildings instanceof Map
 ? settlement.adaptedBuildings.size
 : Object.keys(settlement.adaptedBuildings || {}).length}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Freestanding Structures:</span>
 <span className="text-white font-bold">{settlement.freestandingBuildings?.length || 0}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Living Capacity:</span>    <span className="text-[#4BEFA8] font-bold">{totalLivingCapacity} Beds</span>
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 );
};
