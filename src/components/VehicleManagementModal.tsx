import React, { useState } from 'react';
import {
 Car,
 Shield,
 Fuel,
 Wrench,
 Crosshair,
 Users,
 AlertTriangle,
 CheckCircle,
 Navigation,
 ArrowRight,
 Sparkles,
 RefreshCw,
 X,
 Droplets,
 Truck,
 Package,
} from 'lucide-react';
import { SettlementState } from '../types/settlement';
import { VEHICLE_DEFINITIONS, VehicleType, WorldVehicle } from '../types/vehicle';
import {
 dismountSquadFromVehicle,
 mountSquadToVehicle,
 refuelVehicle,
 repairVehicle,
 siphonVehicleFuel,
} from '../services/vehicleService';
import { TacticalSquadUnit } from '../types/combat';

interface VehicleManagementModalProps {
 isOpen: boolean;
 onClose: () => void;
 settlement: SettlementState;
 onUpdateSettlement: (updated: SettlementState) => void;
 combatSquads: TacticalSquadUnit[];
 onUpdateCombatSquads: (updated: TacticalSquadUnit[]) => void;
 selectedVehicleId: string | null;
 onSelectVehicle: (vehicleId: string | null) => void;
 onFocusVehicle?: (vehicle: WorldVehicle) => void;
}

export const VehicleManagementModal: React.FC<VehicleManagementModalProps> = ({
 isOpen,
 onClose,
 settlement,
 onUpdateSettlement,
 combatSquads,
 onUpdateCombatSquads,
 selectedVehicleId,
 onSelectVehicle,
 onFocusVehicle,
}) => {
 const [filterType, setFilterType] = useState<VehicleType | 'all'>('all');
 const [actionFeedback, setActionFeedback] = useState<string | null>(null);

 if (!isOpen) return null;

 const vehicles = settlement.vehicles || [];
 const filteredVehicles = vehicles.filter(
 (v) => filterType === 'all' || v.type === filterType
 );

 const activeVehicle =
 vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0] || null;

 // Handle Refueling
 const handleRefuel = (vehicle: WorldVehicle, amountLiters: number = 25) => {
 const res = refuelVehicle(settlement, vehicle, amountLiters);
 if (!res.success) {
 setActionFeedback(res.error || 'Refueling failed.');
 return;
 }

 const updatedVehicles = settlement.vehicles.map((v) =>
 v.id === vehicle.id ? res.updatedVehicle : v
 );

 onUpdateSettlement({
 ...settlement,
 stockpile: res.updatedStockpile,
 vehicles: updatedVehicles,
 });

 setActionFeedback(
 `Fueled ${vehicle.name} with ${vehicle.fuelType.toUpperCase()}. Tank at ${(
 (res.updatedVehicle.currentFuel / res.updatedVehicle.maxFuel) *
 100
 ).toFixed(0)}%.`
 );
 };

 // Handle Repairing
 const handleRepair = (vehicle: WorldVehicle) => {
 const res = repairVehicle(settlement, vehicle);
 if (!res.success) {
 setActionFeedback(res.error || 'Repair failed.');
 return;
 }

 const updatedVehicles = settlement.vehicles.map((v) =>
 v.id === vehicle.id ? res.updatedVehicle : v
 );

 onUpdateSettlement({
 ...settlement,
 stockpile: res.updatedStockpile,
 vehicles: updatedVehicles,
 });

 setActionFeedback(
 `Restored ${vehicle.name} to 100% operational condition using metal scrap.`
 );
 };

 // Handle Siphoning Fuel
 const handleSiphon = (vehicle: WorldVehicle) => {
 const res = siphonVehicleFuel(settlement, vehicle);
 if (!res.success) {
 setActionFeedback('No fuel available to siphon from this vehicle.');
 return;
 }

 const updatedVehicles = settlement.vehicles.map((v) =>
 v.id === vehicle.id ? res.updatedVehicle : v
 );

 onUpdateSettlement({
 ...settlement,
 stockpile: res.updatedStockpile,
 vehicles: updatedVehicles,
 });

 setActionFeedback(
 `Siphoned ${res.siphonedAmount}L of ${vehicle.fuelType} into colony stockpile.`
 );
 };

 // Handle Squad Boarding / Mounting
 const handleMountSquad = (vehicle: WorldVehicle, squadId: string) => {
 const squad = combatSquads.find((s) => s.squadId === squadId);
 if (!squad) return;

 const { updatedVehicle, updatedSquad } = mountSquadToVehicle(vehicle, squad);

 const updatedVehicles = settlement.vehicles.map((v) =>
 v.id === vehicle.id ? updatedVehicle : v
 );
 const updatedSquads = combatSquads.map((s) =>
 s.squadId === squad.squadId ? updatedSquad : s
 );

 onUpdateSettlement({
 ...settlement,
 vehicles: updatedVehicles,
 });
 onUpdateCombatSquads(updatedSquads);
 setActionFeedback(`${squad.name} mounted into ${vehicle.name}. Ready for road travel.`);
 };

 // Handle Squad Dismount
 const handleDismount = (vehicle: WorldVehicle) => {
 if (!vehicle.assignedSquadId) return;
 const squad = combatSquads.find((s) => s.squadId === vehicle.assignedSquadId);
 if (!squad) return;

 const { updatedVehicle, updatedSquad } = dismountSquadFromVehicle(vehicle, squad);

 const updatedVehicles = settlement.vehicles.map((v) =>
 v.id === vehicle.id ? updatedVehicle : v
 );
 const updatedSquads = combatSquads.map((s) =>
 s.squadId === squad.squadId ? updatedSquad : s
 );

 onUpdateSettlement({
 ...settlement,
 vehicles: updatedVehicles,
 });
 onUpdateCombatSquads(updatedSquads);
 setActionFeedback(`${squad.name} dismounted from ${vehicle.name} onto road shoulder.`);
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
 <div className="bg-[#121418] border border-[#2b323d] clip-tactical-bracket surface-bevel w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-slate-200">
 {/* Header Bar */}
 <div className="px-6 py-4 bg-[#161a22] border-b border-[#242b35] flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-[#334155]/20 border border-[#475569]/40 text-[#CBD5E1]">
 <Truck className="w-6 h-6" />
 </div>
 <div>
 <h2 className="text-lg font-black tracking-wide text-white uppercase flex items-center gap-2">
 <span>Motor Pool & Vehicle Fleet (§8)</span>
 <span className="text-xs px-2 py-0.5 bg-[#0F172A] text-[#CBD5E1] border border-[#1E293B]">
 {vehicles.length} Discovered
 </span>
 </h2>
 <p className="text-xs text-slate-400">
 OSM Road Geometry Pathing • Fuel Consumption • Armed Truck Turrets • Squad Extraction
 </p>
 </div>
 </div>

 <div className="flex items-center gap-4">
 {/* Colony Fuel Reserves Quick Bar */}
 <div className="flex items-center gap-3 bg-[#0d1014] px-3 py-1.5 border border-[#212731] text-xs">
 <div className="flex items-center gap-1.5 text-amber-400">
 <Fuel className="w-4 h-4" />
 <span className="font-bold">Gasoline:</span>
 <span className="text-white font-mono font-bold">
 {settlement.stockpile.fuel.gasoline.toFixed(0)}L
 </span>
 </div>
 <div className="w-px h-3 bg-slate-700" />
 <div className="flex items-center gap-1.5 text-emerald-400">
 <Droplets className="w-4 h-4" />
 <span className="font-bold">Diesel:</span>
 <span className="text-white font-mono font-bold">
 {settlement.stockpile.fuel.diesel.toFixed(0)}L
 </span>
 </div>
 <div className="w-px h-3 bg-slate-700" />
 <div className="flex items-center gap-1.5 text-slate-400">
 <Wrench className="w-3.5 h-3.5" />
 <span className="font-bold">Metal:</span>
 <span className="text-white font-mono font-bold">
 {settlement.stockpile.materials.metal}
 </span>
 </div>
 </div>

 <button
 onClick={onClose}
 className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
 >
 <X className="w-5 h-5" />
 </button>
 </div>
 </div>

 {/* Action Feedback Banner */}
 {actionFeedback && (
 <div className="px-6 py-2 bg-[#0F172A]/70 border-b border-[#1E293B]/60 text-xs text-[#E8E8E8] flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Sparkles className="w-4 h-4 text-[#CBD5E1] shrink-0" />
 <span>{actionFeedback}</span>
 </div>
 <button
 onClick={() => setActionFeedback(null)}
 className="text-[#CBD5E1] hover:text-white text-xs underline"
 >
 Dismiss
 </button>
 </div>
 )}

 {/* Main Content Layout */}
 <div className="flex-1 flex overflow-hidden">
 {/* Left Column: Vehicle List & Type Filters */}
 <div className="w-80 border-r border-[#242b35] flex flex-col bg-[#111317]">
 {/* Filter Tabs */}
 <div className="p-3 border-b border-[#242b35] grid grid-cols-4 gap-1 text-[11px] font-bold uppercase">
 <button
 onClick={() => setFilterType('all')}
 className={`py-1.5 text-center transition-all ${
 filterType === 'all'
 ? 'bg-[#334155] text-white'
 : 'bg-[#181c22] text-slate-400 hover:text-slate-200'
 }`}
 >
 All
 </button>
 <button
 onClick={() => setFilterType('car')}
 className={`py-1.5 text-center transition-all ${
 filterType === 'car'
 ? 'bg-[#334155] text-white'
 : 'bg-[#181c22] text-slate-400 hover:text-slate-200'
 }`}
 >
 Cars
 </button>
 <button
 onClick={() => setFilterType('armed_truck')}
 className={`py-1.5 text-center transition-all ${
 filterType === 'armed_truck'
 ? 'bg-[#334155] text-white'
 : 'bg-[#181c22] text-slate-400 hover:text-slate-200'
 }`}
 >
 Trucks
 </button>
 <button
 onClick={() => setFilterType('cargo_van')}
 className={`py-1.5 text-center transition-all ${
 filterType === 'cargo_van'
 ? 'bg-[#334155] text-white'
 : 'bg-[#181c22] text-slate-400 hover:text-slate-200'
 }`}
 >
 Vans
 </button>
 </div>

 {/* Vehicle List Items */}
 <div className="flex-1 overflow-y-auto p-3 space-y-2">
 {filteredVehicles.length === 0 ? (
 <div className="text-center py-8 text-slate-500 text-xs">
 No vehicles found matching filter.
 </div>
 ) : (
 filteredVehicles.map((veh) => {
 const isSelected = activeVehicle?.id === veh.id;
 const isArmed = veh.type === 'armed_truck';
 const isVan = veh.type === 'cargo_van';
 const fuelPercent = Math.round((veh.currentFuel / veh.maxFuel) * 100);
 const hpPercent = Math.round((veh.currentHp / veh.maxHp) * 100);

 return (
 <button
 key={veh.id}
 onClick={() => onSelectVehicle(veh.id)}
 className={`w-full text-left p-3 border transition-all cursor-pointer ${
 isSelected
 ? 'bg-[#1c2330] border-[#CBD5E1] text-white'
 : 'bg-[#16191f] border-[#252b36] text-slate-300 hover:border-slate-600'
 }`}
 >
 <div className="flex items-center justify-between mb-1.5">
 <div className="flex items-center gap-2">
 {isArmed ? (
 <Shield className="w-4 h-4 text-red-400" />
 ) : isVan ? (
 <Package className="w-4 h-4 text-amber-400" />
 ) : (
 <Car className="w-4 h-4 text-[#CBD5E1]" />
 )}
 <span className="font-bold text-xs">{veh.name}</span>
 </div>
 <span
 className={`text-[10px] px-1.5 py-0.5 font-black uppercase ${
 veh.condition === 'operational'
 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
 : 'bg-amber-950 text-amber-400 border border-amber-800'
 }`}
 >
 {veh.condition}
 </span>
 </div>

 {/* Mounted Squad Status */}
 <div className="text-[11px] text-slate-400 mb-2 flex items-center gap-1.5">
 <Users className="w-3.5 h-3.5 text-[#CBD5E1]" />
 <span>
 {veh.assignedSquadName ? (
 <span className="text-[#CBD5E1] font-bold">
 {veh.assignedSquadName}
 </span>
 ) : (
 <span className="italic text-slate-500">Unassigned</span>
 )}
 </span>
 </div>

 {/* Mini Fuel & HP Bars */}
 <div className="space-y-1 text-[10px]">
 <div className="flex justify-between text-slate-400">
 <span>Fuel ({veh.fuelType}):</span>
 <span
 className={
 fuelPercent < 20 ? 'text-red-400 font-bold' : 'text-slate-200'
 }
 >
 {veh.currentFuel.toFixed(0)}/{veh.maxFuel}L ({fuelPercent}%)
 </span>
 </div>
 <div className="w-full h-1.5 bg-slate-800 overflow-hidden">
 <div
 className={`h-full ${
 fuelPercent < 20
 ? 'bg-red-500'
 : veh.fuelType === 'diesel'
 ? 'bg-emerald-500'
 : 'bg-amber-500'
 }`}
 style={{ width: `${fuelPercent}%` }}
 />
 </div>

 <div className="flex justify-between text-slate-400 pt-0.5">
 <span>Armor HP:</span>
 <span className="text-slate-200">
 {veh.currentHp}/{veh.maxHp}
 </span>
 </div>
 <div className="w-full h-1.5 bg-slate-800 overflow-hidden">
 <div
 className={`h-full ${
 hpPercent < 30 ? 'bg-red-500' : 'bg-[#334155]'
 }`}
 style={{ width: `${hpPercent}%` }}
 />
 </div>
 </div>
 </button>
 );
 })
 )}
 </div>
 </div>

 {/* Right Column: Selected Vehicle Inspector & Actions */}
 {activeVehicle ? (
 <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#13161c]">
 {/* Vehicle Title & Archetype Info */}
 <div className="flex items-center justify-between border-b border-[#242b35] pb-4">
 <div>
 <div className="flex items-center gap-3">
 <h3 className="text-xl font-black text-white">{activeVehicle.name}</h3>
 <span
 className={`text-xs px-2.5 py-0.5 font-black uppercase ${
 activeVehicle.condition === 'operational'
 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
 : 'bg-amber-950 text-amber-400 border border-amber-800'
 }`}
 >
 {activeVehicle.condition}
 </span>
 {activeVehicle.turret && (
 <span className="text-xs px-2.5 py-0.5 font-black uppercase bg-red-950 text-red-400 border border-red-800 flex items-center gap-1">
 <Crosshair className="w-3.5 h-3.5" />
 .50 Cal HMG Turret
 </span>
 )}
 </div>
 <p className="text-xs text-slate-400 mt-1 max-w-2xl">
 {VEHICLE_DEFINITIONS[activeVehicle.type].description}
 </p>
 </div>

 {onFocusVehicle && (
 <button
 onClick={() => onFocusVehicle(activeVehicle)}
 className="px-3 py-2 bg-[#334155]/20 hover:bg-[#334155]/40 border border-[#475569]/50 text-[#CBD5E1] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
 >
 <Navigation className="w-4 h-4" />
 <span>Locate on Map</span>
 </button>
 )}
 </div>

 {/* Specs & Performance Stats Grid */}
 <div className="grid grid-cols-4 gap-3 text-xs">
 <div className="p-3 bg-[#171b22] border border-[#262c38]">
 <div className="text-[10px] text-slate-500 uppercase font-bold">
 Road Cruising Speed
 </div>
 <div className="text-base font-black text-[#CBD5E1] mt-0.5">
 {activeVehicle.speed * 3.6} km/h
 </div>
 <div className="text-[10px] text-slate-400">
 ({activeVehicle.speed.toFixed(1)} m/s along OSM roads)
 </div>
 </div>

 <div className="p-3 bg-[#171b22] border border-[#262c38]">
 <div className="text-[10px] text-slate-500 uppercase font-bold">
 Fuel Consumption Rate
 </div>
 <div className="text-base font-black text-amber-400 mt-0.5">
 {activeVehicle.fuelConsumptionPer100m} L / 100m
 </div>
 <div className="text-[10px] text-slate-400">
 {activeVehicle.fuelType.toUpperCase()} Engine
 </div>
 </div>

 <div className="p-3 bg-[#171b22] border border-[#262c38]">
 <div className="text-[10px] text-slate-500 uppercase font-bold">
 Cargo / Payload Bonus
 </div>
 <div className="text-base font-black text-emerald-400 mt-0.5">
 +{VEHICLE_DEFINITIONS[activeVehicle.type].cargoBonus} Capacity
 </div>
 <div className="text-[10px] text-slate-400">Expedition loot storage</div>
 </div>

 <div className="p-3 bg-[#171b22] border border-[#262c38]">
 <div className="text-[10px] text-slate-500 uppercase font-bold">
 Combat Weaponry
 </div>
 <div className="text-base font-black text-red-400 mt-0.5">
 {activeVehicle.turret ? '38 Dmg / 0.35s' : 'Ramming Only'}
 </div>
 <div className="text-[10px] text-slate-400">
 {activeVehicle.turret ? 'Mounted .50 cal Gunner' : 'Kinetic road impact'}
 </div>
 </div>
 </div>

 {/* Status Bars (Fuel Tank & Armor Integrity) */}
 <div className="grid grid-cols-2 gap-4">
 {/* Fuel Tank Gauge */}
 <div className="p-4 bg-[#171b22] border border-[#262c38] space-y-2 text-xs">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2 font-bold text-white">
 <Fuel className="w-4 h-4 text-amber-400" />
 <span>Fuel Tank ({activeVehicle.fuelType.toUpperCase()})</span>
 </div>
 <span className="font-mono font-bold text-amber-400">
 {activeVehicle.currentFuel.toFixed(1)} / {activeVehicle.maxFuel} L
 </span>
 </div>

 <div className="w-full h-3 bg-slate-800 overflow-hidden border border-slate-700">
 <div
 className={`h-full ${
 activeVehicle.fuelType === 'diesel' ? 'bg-emerald-500' : 'bg-amber-500'
 }`}
 style={{
 width: `${(activeVehicle.currentFuel / activeVehicle.maxFuel) * 100}%`,
 }}
 />
 </div>

 <div className="flex items-center justify-between text-[11px] pt-2">
 <span className="text-slate-400">
 Stockpile Available:{' '}
 <strong className="text-white">
 {settlement.stockpile.fuel[activeVehicle.fuelType].toFixed(1)}L
 </strong>
 </span>

 <div className="flex gap-2">
 <button
 onClick={() => handleRefuel(activeVehicle, 25)}
 disabled={settlement.stockpile.fuel[activeVehicle.fuelType] < 5}
 className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs transition-colors cursor-pointer"
 >
 +25L Refuel
 </button>
 <button
 onClick={() => handleRefuel(activeVehicle, activeVehicle.maxFuel)}
 disabled={settlement.stockpile.fuel[activeVehicle.fuelType] < 5}
 className="px-3 py-1 bg-amber-700 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs transition-colors cursor-pointer"
 >
 Top Off Tank
 </button>
 </div>
 </div>
 </div>

 {/* Armor & Durability */}
 <div className="p-4 bg-[#171b22] border border-[#262c38] space-y-2 text-xs">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2 font-bold text-white">
 <Shield className="w-4 h-4 text-[#CBD5E1]" />
 <span>Armor & Durability</span>
 </div>
 <span className="font-mono font-bold text-[#CBD5E1]">
 {activeVehicle.currentHp} / {activeVehicle.maxHp} HP
 </span>
 </div>

 <div className="w-full h-3 bg-slate-800 overflow-hidden border border-slate-700">
 <div
 className="h-full bg-[#334155]"
 style={{
 width: `${(activeVehicle.currentHp / activeVehicle.maxHp) * 100}%`,
 }}
 />
 </div>

 <div className="flex items-center justify-between text-[11px] pt-2">
 <span className="text-slate-400">
 Cost:{' '}
 <strong className="text-white">
 {VEHICLE_DEFINITIONS[activeVehicle.type].repairMetalCost} Metal
 </strong>
 </span>

 <button
 onClick={() => handleRepair(activeVehicle)}
 disabled={
 activeVehicle.currentHp >= activeVehicle.maxHp ||
 settlement.stockpile.materials.metal <
 VEHICLE_DEFINITIONS[activeVehicle.type].repairMetalCost
 }
 className="px-3 py-1 bg-[#334155] hover:bg-[#334155] disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
 >
 <Wrench className="w-3.5 h-3.5" />
 <span>Repair Vehicle</span>
 </button>
 </div>
 </div>
 </div>

 {/* Squad Crew Boarding & Assignment */}
 <div className="p-4 bg-[#171b22] border border-[#262c38] space-y-3">
 <div className="flex items-center justify-between text-xs">
 <div className="flex items-center gap-2 font-bold text-white">
 <Users className="w-4 h-4 text-[#CBD5E1]" />
 <span>Assigned Squad & Crew (§8)</span>
 </div>
 {activeVehicle.assignedSquadId && (
 <button
 onClick={() => handleDismount(activeVehicle)}
 className="px-2.5 py-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 font-bold text-[11px] transition-colors cursor-pointer"
 >
 Dismount Squad onto Road
 </button>
 )}
 </div>

 {activeVehicle.assignedSquadId ? (
 <div className="p-3 bg-[#11141a] border border-[#334155]/50 flex items-center justify-between">
 <div>
 <div className="text-sm font-black text-[#CBD5E1]">
 {activeVehicle.assignedSquadName}
 </div>
 <div className="text-xs text-slate-400">
 Mounted inside vehicle • Travels at vehicle road speed
 </div>
 </div>
 <span className="text-xs px-2 py-1 bg-[#0F172A] text-[#CBD5E1] border border-[#1E293B] font-bold">
 CREW MOUNTED
 </span>
 </div>
 ) : (
 <div className="space-y-2">
 <p className="text-xs text-slate-400">
 Select a deployed squad to board this vehicle for rapid road travel and mobile fire support:
 </p>
 <div className="grid grid-cols-2 gap-2">
 {combatSquads.map((sq) => {
 const isAssignedOther = settlement.vehicles.some(
 (v) => v.assignedSquadId === sq.squadId && v.id !== activeVehicle.id
 );

 return (
 <button
 key={sq.squadId}
 disabled={isAssignedOther}
 onClick={() => handleMountSquad(activeVehicle, sq.squadId)}
 className="p-2.5 bg-[#11141a] hover:bg-[#181d26] disabled:opacity-50 border border-[#272e3b] text-left text-xs transition-colors cursor-pointer flex items-center justify-between"
 >
 <div>
 <div className="font-bold text-white">{sq.name}</div>
 <div className="text-[10px] text-slate-400">
 Leader: {sq.leaderName} ({sq.generalCount + 1} survivors)
 </div>
 </div>
 <ArrowRight className="w-4 h-4 text-[#CBD5E1]" />
 </button>
 );
 })}
 </div>
 </div>
 )}
 </div>

 {/* Siphon Action if Abandoned */}
 {!activeVehicle.isSiphoned && activeVehicle.currentFuel > 0 && (
 <div className="p-3 bg-[#1e1713] border border-amber-900/40 flex items-center justify-between text-xs">
 <div>
 <div className="font-bold text-amber-300">Siphon Remaining Fuel</div>
 <div className="text-[11px] text-slate-400">
 Extract {activeVehicle.currentFuel.toFixed(0)}L {activeVehicle.fuelType} into settlement stockpile.
 </div>
 </div>
 <button
 onClick={() => handleSiphon(activeVehicle)}
 className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white font-bold text-xs transition-colors cursor-pointer"
 >
 Siphon Fuel
 </button>
 </div>
 )}
 </div>
 ) : (
 <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
 No vehicle selected.
 </div>
 )}
 </div>
 </div>
 </div>
 );
};
