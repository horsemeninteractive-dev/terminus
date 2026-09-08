import React, { useState } from 'react';
import {
 Car,
 ChevronDown,
 ChevronUp,
 Shield,
 Fuel,
 Wrench,
 Crosshair,
 Users,
 Navigation,
 X,
 Droplets,
 Package,
 Apple,
 Zap,
 ArrowUpRight,
 LogOut,
} from 'lucide-react';
import { SettlementState } from '../types/settlement';
import { VEHICLE_DEFINITIONS, WorldVehicle } from '../types/vehicle';
import { getVehicleInventoryCapacity } from '../services/vehicleService';
import { formatLootLabel } from '../services/scavengingService';
import { lootIconForItem } from './lootIcons';
import {
 dismountSquadFromVehicle,
 pickFuelCarrierSquad,
 startManualFuelDelivery,
} from '../services/vehicleService';
import { createVehicleWorkshopOrder } from '../services/vehicleWorkshopService';
import { TacticalSquadUnit } from '../types/combat';

interface VehicleTacticalDrawerProps {
 vehicle: WorldVehicle | null;
 onClose: () => void;
 settlement: SettlementState;
 onUpdateSettlement: (updated: SettlementState) => void;
 combatSquads: TacticalSquadUnit[];
 onUpdateCombatSquads: (updated: TacticalSquadUnit[]) => void;
 onOpenFullFleetModal: () => void;
 onOrderVehicleExtraction: (vehicle: WorldVehicle) => void;
}

export const VehicleTacticalDrawer: React.FC<VehicleTacticalDrawerProps> = ({
 vehicle,
 onClose,
 settlement,
 onUpdateSettlement,
 combatSquads,
 onUpdateCombatSquads,
 onOpenFullFleetModal,
 onOrderVehicleExtraction,
}) => {
 const [isMinimized, setIsMinimized] = useState(false);
 const [refuelError, setRefuelError] = useState<string | null>(null);

 if (!vehicle) return null;

 const def = VEHICLE_DEFINITIONS[vehicle.type];
 const fuelPercent = Math.round((vehicle.currentFuel / vehicle.maxFuel) * 100);
 const hpPercent = Math.round((vehicle.currentHp / vehicle.maxHp) * 100);
 const isArmed = vehicle.type === 'armed_truck';
 const isVan = vehicle.type === 'cargo_van';

 const deliverySquad = combatSquads.find(
   (s) => s.pendingFuelDeliveryVehicleId === vehicle.id
 );

 // IFZ manual refuel: a squad must CARRY a fuel item to the vehicle. Fuel is
 // withdrawn from the stockpile into the squad's backpack and poured into the
 // tank when the squad arrives — it is never teleported by a button press.
 const handleQuickRefuel = () => {
 setRefuelError(null);
 const carrier = pickFuelCarrierSquad(settlement, vehicle, combatSquads);
 if (!carrier) {
   setRefuelError('No squad with a free backpack slot is available to carry fuel to this vehicle.');
   return;
 }
 const res = startManualFuelDelivery(settlement, vehicle, carrier, 25);
 if (!res.success || !res.newState || !res.updatedSquad) {
   setRefuelError(res.error || 'Refuel dispatch failed.');
   return;
 }
 onUpdateSettlement(res.newState);
 onUpdateCombatSquads(
   combatSquads.map((s) =>
     s.squadId === carrier.squadId ? res.updatedSquad! : s
   )
 );
 };

 const handleWorkshopRepair = () => {
 // §8 — repairs happen at a staffed Vehicle Workshop over time, consuming
 // metal as HP is restored. The instant full-repair button is gone.
 const res = createVehicleWorkshopOrder(settlement, {
 type: 'repair',
 vehicleId: vehicle.id,
 });
 if (res.success && res.newState) onUpdateSettlement(res.newState);
 };

 const handleDismount = () => {
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
 };

 if (isMinimized) {
    return (
      <div className="relative z-40 w-full md:w-[min(94vw,340px)] shrink-0 bg-[#07090C]/95 border-2 border-[#10B981] backdrop-blur-md clip-tactical-bracket surface-bevel p-3 text-slate-200 shadow-2xl flex items-center justify-between pointer-events-auto animate-in fade-in duration-150">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 bg-[#334155]/20 border border-[#475569]/40 shrink-0">
            {isArmed ? (
              <Shield className="w-4 h-4 text-red-400" />
            ) : isVan ? (
              <Package className="w-4 h-4 text-amber-400" />
            ) : (
              <Car className="w-4 h-4 text-[#CBD5E1]" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-heading font-black text-xs text-white truncate uppercase">{vehicle.name}</span>
            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
              <span>HULL: <span className="text-emerald-400">{hpPercent}%</span></span>
              <span>FUEL: <span className="text-amber-400">{fuelPercent}%</span></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={() => setIsMinimized(false)}
            title="Expand Vehicle Panel"
            className="p-1 text-[#10B981] hover:text-white bg-[#064E3B]/40 hover:bg-[#064E3B] border border-[#10B981] transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
 }

 return (
 <div className="relative z-40 w-full md:w-[min(94vw,340px)] shrink-0 max-h-[70vh] overflow-y-auto bg-[#07090C]/95 border-2 border-[#1E293B] backdrop-blur-md clip-tactical-bracket surface-bevel p-4 text-slate-200 pointer-events-auto animate-in slide-in-from-bottom-4">
 {/* Header */}
 <div className="flex items-center justify-between border-b border-[#222833] pb-3 mb-3">
 <div className="flex items-center gap-2.5">
 <div className="p-2 bg-[#334155]/20 border border-[#475569]/40">
 {isArmed ? (
 <Shield className="w-5 h-5 text-red-400" />
 ) : isVan ? (
 <Package className="w-5 h-5 text-amber-400" />
 ) : (
 <Car className="w-5 h-5 text-[#CBD5E1]" />
 )}
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h4 className="font-black text-sm text-white">{vehicle.name}</h4>
 <span
 className={`text-[9px] px-1.5 py-0.5 font-black uppercase ${
 vehicle.condition === 'operational'
 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
 : 'bg-amber-950 text-amber-400 border border-amber-800'
 }`}
 >
 {vehicle.condition}
 </span>
 </div>
 <p className="text-[10px] text-slate-400">
 {vehicle.isMoving ? 'In Transit along OSM Road' : 'Parked / Standing By'}
 </p>
 </div>
 </div>

 <div className="flex items-center gap-1">
 <button
 onClick={() => setIsMinimized(true)}
 className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
 title="Minimize Panel"
 >
 <ChevronDown className="w-4 h-4" />
 </button>
 <button
 onClick={onClose}
 className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
 title="Close"
 >
 <X className="w-4 h-4" />
 </button>
 </div>
 </div>

 {/* Gauges (Fuel & Armor) */}
 <div className="space-y-2.5 mb-3 text-xs">
 {/* Fuel Gauge */}
 <div className="bg-[#0e1116] p-2.5 border border-[#1e242e] space-y-1.5">
 <div className="flex justify-between items-center text-[11px]">
 <span className="flex items-center gap-1.5 text-slate-300 font-bold">
 {vehicle.fuelType === 'diesel' ? (
 <Droplets className="w-3.5 h-3.5 text-emerald-400" />
 ) : (
 <Fuel className="w-3.5 h-3.5 text-amber-400" />
 )}
 <span>Fuel ({vehicle.fuelType.toUpperCase()})</span>
 </span>
 <span className="font-mono font-bold text-amber-400">
 {vehicle.currentFuel.toFixed(1)} / {vehicle.maxFuel} L ({fuelPercent}%)
 </span>
 </div>

 <div className="w-full h-2 bg-slate-800 overflow-hidden">
 <div
 className={`h-full ${
 fuelPercent < 20
 ? 'bg-red-500'
 : vehicle.fuelType === 'diesel'
 ? 'bg-emerald-500'
 : 'bg-amber-500'
 }`}
 style={{ width: `${fuelPercent}%` }}
 />
 </div>

 <div className="flex justify-between items-center pt-1 text-[10px]">
 <span className="text-slate-400">
 Burn: {vehicle.fuelConsumptionPer100m} L/100m
 </span>
 <button
 onClick={handleQuickRefuel}
 disabled={
   settlement.stockpile.fuel[vehicle.fuelType] < 5 || !!deliverySquad
 }
 title={
   deliverySquad
     ? `${deliverySquad.name} is carrying fuel to this vehicle`
     : 'Withdraws fuel into a squad backpack and dispatches them to carry it here'
 }
 className="px-2 py-0.5 bg-amber-600/30 hover:bg-amber-600/60 disabled:opacity-40 border border-amber-500/50 text-amber-200 font-bold text-[10px] transition-colors cursor-pointer"
 >
 +25L Refuel
 </button>
 </div>

 {deliverySquad && (
 <div className="flex items-center justify-between mt-2 text-[10px] bg-amber-950/40 border border-amber-700/40 px-2 py-1">
 <span className="text-amber-300 font-bold uppercase">
 Fuel en route
 </span>
 <span className="text-slate-300">
 {deliverySquad.name} carrying {vehicle.fuelType} to tank
 </span>
 </div>
 )}
 {refuelError && (
 <div className="mt-2 text-[10px] text-red-300 bg-red-950/40 border border-red-800/50 px-2 py-1 leading-snug">
 {refuelError}
 </div>
 )}
 </div>

 {/* Armor & Durability */}
 <div className="bg-[#0e1116] p-2.5 border border-[#1e242e] space-y-1.5">
 <div className="flex justify-between items-center text-[11px]">
 <span className="flex items-center gap-1.5 text-slate-300 font-bold">
 <Shield className="w-3.5 h-3.5 text-[#CBD5E1]" />
 <span>Armor Integrity</span>
 </span>
 <span className="font-mono font-bold text-[#CBD5E1]">
 {vehicle.currentHp} / {vehicle.maxHp} HP ({hpPercent}%)
 </span>
 </div>

 <div className="w-full h-2 bg-slate-800 overflow-hidden">
 <div
 className={`h-full ${hpPercent < 30 ? 'bg-red-500' : 'bg-[#334155]'}`}
 style={{ width: `${hpPercent}%` }}
 />
 </div>

 <div className="flex justify-between items-center pt-1 text-[10px]">
 <span className="text-slate-400">Kills: {vehicle.killCount}</span>
 {vehicle.currentHp < vehicle.maxHp && !vehicle.workshopJobId && (
 <button
 onClick={handleWorkshopRepair}
 className="px-2 py-0.5 bg-[#334155]/30 hover:bg-[#334155]/60 border border-[#475569]/50 text-[#E8E8E8] font-bold text-[10px] transition-colors cursor-pointer"
 title="Queues a bay at the nearest staffed Vehicle Workshop — metal is consumed as HP is restored over time."
 >
 Workshop Repair
 </button>
 )}
 {vehicle.workshopJobId && (
 <span className="text-cyan-300 font-bold uppercase">
 In workshop bay
 </span>
 )}
 </div>
 </div>
 </div>

 {/* Armed Truck Turret Combat Stats */}
 {vehicle.turret && (
 <div className="bg-[#181112] border border-red-950/60 p-2.5 mb-3 flex items-center justify-between text-xs">
 <div className="flex items-center gap-2">
 <Crosshair className="w-4 h-4 text-red-400" />
 <div>
 <div className="font-bold text-red-300">.50 Cal HMG Turret Active</div>
 <div className="text-[10px] text-slate-400">
 Range 36m • High-Caliber Shredding Fire
 </div>
 </div>
 </div>
 <span className="text-[10px] font-black text-red-400 px-1.5 py-0.5 bg-red-950 border border-red-800">
 AUTO-FIRE
 </span>
 </div>
 )}

 {/* Mounted Squad Assignment & Full Tactical Panel */}
 <div className="bg-[#0e1116] p-2.5 border border-[#1e242e] mb-3 text-xs">
 <div className="flex justify-between items-center mb-2">
 <span className="text-[11px] text-slate-300 font-bold flex items-center gap-1.5">
 <Users className="w-3.5 h-3.5 text-[#CBD5E1]" />
 <span>MOUNTED TACTICAL SQUAD</span>
 </span>
 {vehicle.assignedSquadId && (
 <span className="text-[9px] px-1.5 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold uppercase">
 EMBARKED
 </span>
 )}
 </div>

 {vehicle.assignedSquadId ? (
 (() => {
 const mountedSquad = combatSquads.find((s) => s.squadId === vehicle.assignedSquadId);
 return (
 <div className="space-y-2.5">
 <div className="flex items-center justify-between bg-[#141a22] p-2 border border-[#273240]">
 <div>
 <div className="font-bold text-white text-xs">{vehicle.assignedSquadName || mountedSquad?.name}</div>
 <div className="text-[10px] text-slate-400">
 Status: {mountedSquad?.state.toUpperCase() || 'IDLE'} • Kills: {mountedSquad?.killCount || 0}
 </div>
 </div>
 <div className="text-right">
 <div className="font-mono text-[11px] font-bold text-emerald-400">
 {mountedSquad ? Math.round((mountedSquad.currentHp / mountedSquad.maxHp) * 100) : 100}% HP
 </div>
 <div className="text-[10px] text-slate-400">
 {mountedSquad?.members.filter((m) => m.isAlive).length || 0} Operators
 </div>
 </div>
 </div>

 {/* Squad Members Roster */}
 {mountedSquad && mountedSquad.members.length > 0 && (
 <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
 {mountedSquad.members.map((member) => (
 <div
 key={member.survivorId}
 className="flex items-center justify-between bg-[#11161d] px-2 py-1 border border-[#1e2733] text-[10px]"
 >
 <div className="flex items-center gap-1.5">
 <span className={`w-1.5 h-1.5 rounded-full ${member.isAlive ? 'bg-emerald-400' : 'bg-red-400'}`} />
 <span className="font-medium text-slate-200">{member.name}</span>
 {member.isLeader && (
 <span className="text-[8px] bg-amber-950 text-amber-300 border border-amber-800 px-1 py-0.2 font-bold">
 LEAD
 </span>
 )}
 </div>
 <div className="flex items-center gap-2">
 <span className="text-slate-400 capitalize">{member.weaponId.replace(/_/g, ' ')}</span>
 <span className="font-mono text-emerald-400 font-bold">
 {Math.round(member.currentHp)}/{member.maxHp}
 </span>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* Dismount Button */}
 <button
 onClick={handleDismount}
 className="w-full py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-700/60 text-red-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
 >
 <LogOut className="w-3.5 h-3.5" />
 <span>DISMOUNT SQUAD TO FOOT</span>
 </button>
 </div>
 );
 })()
 ) : (
 <div className="py-1 space-y-1.5">
 <span className="text-[11px] italic text-slate-500">No squad currently mounted</span>
 <div className="text-[10px] text-slate-400 border border-dashed border-[#2D3B4E] bg-[#10141C] px-2 py-1.5 leading-relaxed">
 Select a squad (left-click), then <span className="text-[#4BEFA8] font-bold">right-click this vehicle</span> to
 mount it. The squad will path to the vehicle and board on contact.
 </div>
 </div>
 )}
 </div>

 {/* Vehicle Storage & Hauling Capacity */}
 <div className="bg-[#0e1116] p-2.5 border border-[#1e242e] mb-3 text-xs space-y-1.5">
 <div className="flex justify-between items-center text-[11px]">
 <span className="flex items-center gap-1.5 text-slate-300 font-bold">
 <Package className="w-3.5 h-3.5 text-amber-400" />
 <span>VEHICLE STORAGE & CARGO</span>
 </span>
 <span className="font-mono text-amber-300 text-[10px]">
 +{def.cargoBonus}kg Payload Bonus
 </span>
 </div>
 <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px] text-center">
 <div className="bg-[#141a22] p-1.5 border border-[#222c3a]">
 <div className="text-slate-400">Fuel Tank</div>
 <div className="font-mono font-bold text-white">{vehicle.currentFuel.toFixed(0)}L</div>
 </div>
 <div className="bg-[#141a22] p-1.5 border border-[#222c3a]">
 <div className="text-slate-400">Ammo Reserve</div>
 <div className="font-mono font-bold text-white">{settlement.stockpile.ammo.sharedPool} Rnds</div>
 </div>
 <div className="bg-[#141a22] p-1.5 border border-[#222c3a]">
 <div className="text-slate-400">Crew Cap</div>
 <div className="font-mono font-bold text-white">{def.crewCapacity} Seats</div>
 </div>
 </div>

 {/* Cargo bay slots — the mounted squad fills these while scavenging */}
 <div className="pt-1.5">
 <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 pb-1">
 <span className="flex items-center gap-1">
 <Package className="w-3 h-3 text-emerald-400" />
 CARGO BAY
 </span>
 <span className="font-bold text-emerald-400">
 {(vehicle.inventory || []).length}/{getVehicleInventoryCapacity(vehicle)}
 </span>
 </div>
 <div className="grid grid-cols-5 gap-1">
 {Array.from({ length: getVehicleInventoryCapacity(vehicle) }, (_, index) => {
 const item = (vehicle.inventory || [])[index];
 const icon = lootIconForItem(item, 'w-3 h-3');
 return (
 <div
 key={index}
 className={`h-6 flex items-center justify-center border ${item ? 'bg-[#10141C] border-[#10B981]/60' : 'bg-[#0A0D12] border-[#222c3a]'}`}
 title={item ? `${formatLootLabel(item.label || '') || 'Loot'} ×${item.quantity}` : `Empty cargo slot ${index + 1}`}
 >
 {icon}
 </div>
 );
 })}
 </div>
 </div>
 </div>

 {/* Tactical Quick Actions */}
 <div className="grid grid-cols-2 gap-2 text-xs">
 <button
 onClick={() => onOrderVehicleExtraction(vehicle)}
 className="p-2 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/50 text-amber-300 font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
 >
 <Zap className="w-3.5 h-3.5" />
 <span>HQ Extraction</span>
 </button>

 <button
 onClick={onOpenFullFleetModal}
 className="p-2 bg-[#334155]/20 hover:bg-[#334155]/40 border border-[#475569]/50 text-[#CBD5E1] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
 >
 <ArrowUpRight className="w-3.5 h-3.5" />
 <span>Fleet Panel</span>
 </button>
 </div>
 </div>
 );
};
