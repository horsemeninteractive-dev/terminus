import React, { useState } from 'react';
import {
 AlertTriangle,
 ArrowRight,
 ChevronRight,
 Clock,
 Compass,
 DollarSign,
 Fuel,
 Info,
 Map,
 MapPin,
 Package,
 Plus,
 Radio,
 Send,
 Shield,
 ShieldAlert,
 Truck,
 Users,
 X,
 Zap,
} from 'lucide-react';
import {
  calculateGeographicDistanceKm,
  calculateCaravanSpeedAndDuration,
  dispatchTradeCaravan,
  getExpeditionCenterCount,
  LONG_RANGE_EXPEDITION_KM,
} from '../services/caravanService';
import { CaravanDispatchConfig, SettlementRecord, TradeCaravan } from '../types/caravan';
import { SettlementStockpile } from '../types/settlement';

interface CaravanTradeModalProps {
 settlements: Record<string, SettlementRecord>;
 activeSettlementId: string;
 caravans: TradeCaravan[];
 currentDay: number;
 onDispatchCaravan: (config: CaravanDispatchConfig) => void;
 onClose: () => void;
 onSelectSettlement?: (settlementId: string) => void;
}

export const CaravanTradeModal: React.FC<CaravanTradeModalProps> = ({
 settlements,
 activeSettlementId,
 caravans,
 currentDay,
 onDispatchCaravan,
 onClose,
 onSelectSettlement,
}) => {
 const [tab, setTab] = useState<'dispatch' | 'active'>('dispatch');

 // Dispatch Form State
 const [originId, setOriginId] = useState<string>(activeSettlementId);
 const otherSettlementIds = Object.keys(settlements).filter((id) => id !== originId);
 const [destId, setDestId] = useState<string>(otherSettlementIds[0] || '');

 const origin = settlements[originId] || settlements[activeSettlementId];
 const dest = settlements[destId];

 // Selected vehicle & squad
 const availableVehicles = origin?.state.vehicles.filter((v) => !v.isMoving) || [];
 const [selectedVehicleId, setSelectedVehicleId] = useState<string>(availableVehicles[0]?.id || '');

 const availableSquads = origin?.state.squads || [];
 const [selectedSquadId, setSelectedSquadId] = useState<string>(availableSquads[0]?.id || '');

 // Cargo selection state
 const [cargo, setCargo] = useState<SettlementStockpile>({
 food: { canned_goods: 0, mre_rations: 0, dried_rations: 0, fresh_harvest: 0 },
 water: { bottled_water: 0, purified_water: 0, rainwater: 0 },
 medical: { first_aid_kits: 0, sterile_bandages: 0, antibiotics: 0, painkillers: 0 },
 fuel: { gasoline: 0, diesel: 0, biofuel: 0 },
 ammo: { sharedPool: 0 },
 materials: { wood: 0, metal: 0, bricks: 0, tools: 0 },
 });

 // Survivor transfer state
 const [transportGeneralCount, setTransportGeneralCount] = useState<number>(0);
 const [selectedNamedIds, setSelectedNamedIds] = useState<string[]>([]);
 const [errorMsg, setErrorMsg] = useState<string | null>(null);

 const selectedVehicle = origin?.state.vehicles.find((v) => v.id === selectedVehicleId);
 const selectedSquad = origin?.state.squads.find((s) => s.id === selectedSquadId);

 // Compute distance & metrics
 const distanceKm = origin && dest
 ? calculateGeographicDistanceKm(origin.placement.center, dest.placement.center)
 : 0;

 const metrics = selectedVehicle && origin
 ? calculateCaravanSpeedAndDuration(distanceKm, selectedVehicle, origin.state)
 : { speedKmh: 60, durationSeconds: 30, fuelRequired: 10 };

 const availableFuel = (origin?.state.stockpile.fuel.gasoline || 0) + (origin?.state.stockpile.fuel.diesel || 0);
 const hasEnoughFuel = availableFuel >= metrics.fuelRequired;

 const expeditionCenterCount = origin ? getExpeditionCenterCount(origin.state) : 0;
 const isLongRange = distanceKm >= LONG_RANGE_EXPEDITION_KM;
 const expeditionReady = !isLongRange || expeditionCenterCount >= 1;

 const handleUpdateCargo = (category: keyof SettlementStockpile, item: string, value: number) => {
 setCargo((prev: any) => ({
 ...prev,
 [category]: {
 ...prev[category],
 [item]: Math.max(0, value),
 },
 }));
 };

 const handleDispatch = () => {
 if (!origin || !dest) {
 setErrorMsg('Please select a valid origin and destination colony.');
 return;
 }
 if (!selectedVehicleId) {
 setErrorMsg('Please select an operational transport vehicle.');
 return;
 }
 if (!selectedSquadId) {
 setErrorMsg('Please assign an armed escort squad for convoy security.');
 return;
 }
 if (!hasEnoughFuel) {
 setErrorMsg(`Insufficient fuel: requires ${metrics.fuelRequired}L (available: ${availableFuel}L).`);
 return;
 }

 const config: CaravanDispatchConfig = {
 originSettlementId: originId,
 destinationSettlementId: destId,
 vehicleId: selectedVehicleId,
 squadId: selectedSquadId,
 cargo,
 transportNamedSurvivorIds: selectedNamedIds,
 transportGeneralCount,
 };

 onDispatchCaravan(config);
 setTab('active');
 setErrorMsg(null);
 };

 const activeCaravanList = caravans.filter((c) => c.status === 'traveling' || c.status === 'ambushed');

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono select-none">
 <div className="relative w-full max-w-5xl bg-[#0e1013] border-2 border-[#b31217] clip-tactical-bracket surface-bevel flex flex-col max-h-[90vh] overflow-hidden">
 {/* Header Strip */}
 <div className="flex items-center justify-between px-4 py-3 bg-[#14171c] border-b border-[#2b303c]">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-[#b31217]/20 border border-[#b31217] text-[#b31217]">
 <Truck className="w-5 h-5" />
 </div>
 <div>
 <div className="flex items-center gap-2">
 <span className="text-xs font-black text-white uppercase tracking-widest">
 GLOBAL LOGISTICS & INTER-COLONY TRADE CARAVANS
 </span>
 <span className="bg-[#b31217] text-white text-[9px] font-bold px-1.5 py-0.2 uppercase">
 §7.5
 </span>
 </div>
 <p className="text-[11px] text-[#9ca3af]">
 Dispatch overland vehicle convoys with armed escort squads across real-world geography.
 </p>
 </div>
 </div>

 <div className="flex items-center gap-2">
 <button
 onClick={() => setTab('dispatch')}
 className={`px-3 py-1.5 text-xs font-bold uppercase border transition-colors ${
 tab === 'dispatch'
 ? 'bg-[#b31217] text-white border-[#b31217]'
 : 'bg-[#181c22] text-[#9ca3af] border-[#2f3542] hover:text-white'
 }`}
 >
 Dispatch Convoy
 </button>
 <button
 onClick={() => setTab('active')}
 className={`px-3 py-1.5 text-xs font-bold uppercase border flex items-center gap-1.5 transition-colors ${
 tab === 'active'
 ? 'bg-[#b31217] text-white border-[#b31217]'
 : 'bg-[#181c22] text-[#9ca3af] border-[#2f3542] hover:text-white'
 }`}
 >
 <span>Active Convoys</span>
 {activeCaravanList.length > 0 && (
 <span className="px-1.5 py-0.2 bg-[#10B981] text-black text-[10px] font-black">
 {activeCaravanList.length}
 </span>
 )}
 </button>
 <button
 onClick={onClose}
 className="p-1.5 text-[#9ca3af] hover:text-white hover:bg-[#20252e] border border-[#2b303c]"
 >
 <X className="w-5 h-5" />
 </button>
 </div>
 </div>

 {/* Tab 1: Dispatch New Trade / Relief Caravan */}
 {tab === 'dispatch' && (
 <div className="p-4 overflow-y-auto space-y-4 flex-1">
 {Object.keys(settlements).length < 2 ? (
 <div className="bg-[#181c22] border border-[#3b4252] p-6 text-center space-y-3">
 <Compass className="w-10 h-10 text-[#10B981] mx-auto animate-spin" />
 <h3 className="text-white font-bold text-sm uppercase tracking-wider">
 Single Settlement Active
 </h3>
 <p className="text-xs text-[#9ca3af] max-w-md mx-auto leading-relaxed">
 Inter-colony trade and relief expeditions require at least two established colonies on Earth.
 Open the <strong>Orbital Globe</strong> to survey and found an additional outpost in another city or region.
 </p>
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 {/* Column 1: Route & Origin / Destination Selection */}
 <div className="space-y-3">
 <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-[#252a34]">
 <MapPin className="w-3.5 h-3.5 text-[#b31217]" />
 <span>1. Route & Territory</span>
 </div>

 {/* Origin */}
 <div>
 <label className="text-[10px] text-[#9ca3af] uppercase font-bold">Departure Origin</label>
 <select
 value={originId}
 onChange={(e) => {
 setOriginId(e.target.value);
 const remaining = Object.keys(settlements).filter((id) => id !== e.target.value);
 if (destId === e.target.value && remaining[0]) {
 setDestId(remaining[0]);
 }
 }}
 className="w-full mt-1 bg-[#121519] border border-[#2e3440] p-2 text-xs text-white outline-none focus:border-[#b31217]"
 >
 {(Object.values(settlements) as SettlementRecord[]).map((s) => (
 <option key={s.id} value={s.id} disabled={s.status === 'destroyed'}>
 {s.name} {s.status === 'destroyed' ? '(OVERRUN)' : `(${s.placement.sectorName})`}
 </option>
 ))}
 </select>
 </div>

 {/* Destination */}
 <div>
 <label className="text-[10px] text-[#9ca3af] uppercase font-bold">Arrival Destination</label>
 <select
 value={destId}
 onChange={(e) => setDestId(e.target.value)}
 className="w-full mt-1 bg-[#121519] border border-[#2e3440] p-2 text-xs text-white outline-none focus:border-[#b31217]"
 >
 {(Object.values(settlements) as SettlementRecord[])
 .filter((s) => s.id !== originId)
 .map((s) => (
 <option key={s.id} value={s.id}>
 {s.name} {s.status === 'destroyed' ? '⚠️ [OVERRUN / RECLAMATION]' : `(${s.placement.sectorName})`}
 </option>
 ))}
 </select>
 </div>

 {dest?.status === 'destroyed' && (
 <div className="bg-[#7f1d1d]/30 border border-[#ef4444] p-2.5 text-[11px] text-[#fca5a5] space-y-1">
 <div className="font-bold flex items-center gap-1.5 text-white">
 <AlertTriangle className="w-3.5 h-3.5 text-[#ef4444]" />
 <span>RECLAMATION EXPEDITION TARGET</span>
 </div>
 <p>
 This destination was overrun by a horde. Delivering a caravan with a squad, general survivors, and supplies will <strong>reclaim, repopulate, and rebuild</strong> the colony!
 </p>
 </div>
 )}

 {/* Distance & Telemetry Card */}
 <div className="bg-[#13161b] border border-[#242933] p-3 text-xs space-y-2">
 <div className="flex justify-between items-center text-[11px]">
 <span className="text-[#9ca3af]">Geographic Distance:</span>
 <span className="text-[#10B981] font-bold">{distanceKm} km</span>
 </div>
 <div className="flex justify-between items-center text-[11px]">
 <span className="text-[#9ca3af]">Convoy Cruising Speed:</span>
 <span className="text-white font-bold">{metrics.speedKmh} km/h</span>
 </div>
 <div className="flex justify-between items-center text-[11px]">
 <span className="text-[#9ca3af]">Estimated Transit Time:</span>
 <span className="text-[#4ade80] font-bold">~{metrics.durationSeconds}s (in-game)</span>
 </div>
 <div className="flex justify-between items-center text-[11px] pt-1.5 border-t border-[#222731]">
 <span className="text-[#9ca3af] flex items-center gap-1">
 <Fuel className="w-3.5 h-3.5 text-[#f59e0b]" />
 <span>Fuel Required:</span>
 </span>
 <span className={`font-bold ${hasEnoughFuel ? 'text-white' : 'text-[#ef4444]'}`}>
 {metrics.fuelRequired}L / {availableFuel}L available
 </span>
 </div>
 <div
 className={`flex justify-between items-center text-[11px] border-t border-[#222731] pt-1.5 ${
 isLongRange ? (expeditionReady ? 'text-[#4ade80]' : 'text-[#ef4444]') : 'text-[#9ca3af]'
 }`}
 >
 <span className="flex items-center gap-1">
 <Map className="w-3.5 h-3.5" />
 <span>Expedition Logistics:</span>
 </span>
 <span className="font-bold">
 {isLongRange
 ? expeditionReady
 ? `ACTIVE (${expeditionCenterCount} HQ${expeditionCenterCount > 1 ? 's' : ''})`
 : 'REQUIRED — NO HQ'
 : expeditionCenterCount > 0
 ? `HQ READY (+${Math.min(3, expeditionCenterCount) * 12}% speed, -${Math.min(3, expeditionCenterCount) * 10}% fuel)`
 : 'Local route (no HQ needed)'}
 </span>
 </div>
 </div>
 </div>

 {/* Column 2: Vehicle & Escort Squad */}
 <div className="space-y-3">
 <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-[#252a34]">
 <Shield className="w-3.5 h-3.5 text-[#10B981]" />
 <span>2. Vehicle & Escort Squad</span>
 </div>

 {/* Vehicle Picker */}
 <div>
 <label className="text-[10px] text-[#9ca3af] uppercase font-bold">Select Transport Vehicle</label>
 {availableVehicles.length === 0 ? (
 <div className="text-[11px] text-[#ef4444] p-2 bg-[#2a1315] border border-[#4a1c20] mt-1">
 No operational vehicles available in this colony's garage.
 </div>
 ) : (
 <div className="space-y-1.5 mt-1 max-h-36 overflow-y-auto">
 {availableVehicles.map((v) => (
 <button
 key={v.id}
 onClick={() => setSelectedVehicleId(v.id)}
 className={`w-full text-left p-2 border text-xs transition-colors ${
 selectedVehicleId === v.id
 ? 'bg-[#1b222c] border-[#10B981] text-white'
 : 'bg-[#111418] border-[#222731] text-[#9ca3af] hover:text-white'
 }`}
 >
 <div className="flex justify-between items-center font-bold">
 <span>{v.name}</span>
 <span className="text-[10px] text-[#10B981]">
 {v.type === 'armed_truck' ? '🔫 .50 Cal Turret' : v.type === 'cargo_van' ? '📦 High Payload' : '⚡ Swift Cruiser'}
 </span>
 </div>
 <div className="text-[10px] text-[#6b7280] mt-0.5">
 HP: {v.currentHp}/{v.maxHp} | Fuel: {v.currentFuel}/{v.maxFuel}L
 </div>
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Escort Squad Picker */}
 <div>
 <label className="text-[10px] text-[#9ca3af] uppercase font-bold">Assign Convoy Escort Squad</label>
 {availableSquads.length === 0 ? (
 <div className="text-[11px] text-[#ef4444] p-2 bg-[#2a1315] border border-[#4a1c20] mt-1">
 No active squads stationed at this colony. Form a squad in Squad Management first.
 </div>
 ) : (
 <div className="space-y-1.5 mt-1 max-h-36 overflow-y-auto">
 {availableSquads.map((s) => (
 <button
 key={s.id}
 onClick={() => setSelectedSquadId(s.id)}
 className={`w-full text-left p-2 border text-xs transition-colors ${
 selectedSquadId === s.id
 ? 'bg-[#1b222c] border-[#4ade80] text-white'
 : 'bg-[#111418] border-[#222731] text-[#9ca3af] hover:text-white'
 }`}
 >
 <div className="flex justify-between items-center font-bold">
 <span>{s.name}</span>
 <span className="text-[10px] text-[#4ade80]">
 Leader: {s.leaderId || 'Assigned'}
 </span>
 </div>
 <div className="text-[10px] text-[#6b7280] mt-0.5">
 Members: {(s.generalCount || 0) + 1} / 4 | Weapon: Standard Rifles
 </div>
 </button>
 ))}
 </div>
 )}
 </div>
 </div>

 {/* Column 3: Cargo & Survivor Manifest */}
 <div className="space-y-3">
 <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-[#252a34]">
 <Package className="w-3.5 h-3.5 text-[#f59e0b]" />
 <span>3. Cargo & Survivor Manifest</span>
 </div>

 {/* General Survivors Transfer Slider */}
 <div className="bg-[#121519] p-2.5 border border-[#242933] space-y-1.5">
 <div className="flex justify-between items-center text-xs">
 <span className="text-[#9ca3af] flex items-center gap-1">
 <Users className="w-3.5 h-3.5 text-[#4ade80]" />
 <span>Transfer General Survivors:</span>
 </span>
 <span className="text-white font-bold">{transportGeneralCount}</span>
 </div>
 <input
 type="range"
 min="0"
 max={origin?.state.generalPopulation.unassigned || 0}
 value={transportGeneralCount}
 onChange={(e) => setTransportGeneralCount(parseInt(e.target.value) || 0)}
 className="w-full accent-[#b31217]"
 />
 <div className="text-[10px] text-[#6b7280]">
 Available unassigned labor: {origin?.state.generalPopulation.unassigned || 0}
 </div>
 </div>

 {/* Resource Cargo Quantities */}
 <div className="bg-[#121519] p-2.5 border border-[#242933] space-y-2 text-xs">
 <div className="text-[10px] font-bold text-[#9ca3af] uppercase">Resource Transfers:</div>

 <div className="grid grid-cols-2 gap-2">
 <div>
 <label className="text-[9px] text-[#6b7280] uppercase">Canned Goods</label>
 <input
 type="number"
 min="0"
 max={origin?.state.stockpile.food.canned_goods || 0}
 value={cargo.food.canned_goods}
 onChange={(e) => handleUpdateCargo('food', 'canned_goods', parseInt(e.target.value) || 0)}
 className="w-full bg-[#181c22] border border-[#2e3440] px-1.5 py-1 text-white text-xs"
 />
 </div>
 <div>
 <label className="text-[9px] text-[#6b7280] uppercase">Bottled Water</label>
 <input
 type="number"
 min="0"
 max={origin?.state.stockpile.water.bottled_water || 0}
 value={cargo.water.bottled_water}
 onChange={(e) => handleUpdateCargo('water', 'bottled_water', parseInt(e.target.value) || 0)}
 className="w-full bg-[#181c22] border border-[#2e3440] px-1.5 py-1 text-white text-xs"
 />
 </div>
 <div>
 <label className="text-[9px] text-[#6b7280] uppercase">First Aid Kits</label>
 <input
 type="number"
 min="0"
 max={origin?.state.stockpile.medical.first_aid_kits || 0}
 value={cargo.medical.first_aid_kits}
 onChange={(e) => handleUpdateCargo('medical', 'first_aid_kits', parseInt(e.target.value) || 0)}
 className="w-full bg-[#181c22] border border-[#2e3440] px-1.5 py-1 text-white text-xs"
 />
 </div>
 <div>
 <label className="text-[9px] text-[#6b7280] uppercase">Ammunition</label>
 <input
 type="number"
 min="0"
 max={origin?.state.stockpile.ammo.sharedPool || 0}
 value={cargo.ammo.sharedPool}
 onChange={(e) => handleUpdateCargo('ammo', 'sharedPool', parseInt(e.target.value) || 0)}
 className="w-full bg-[#181c22] border border-[#2e3440] px-1.5 py-1 text-white text-xs"
 />
 </div>
 <div>
 <label className="text-[9px] text-[#6b7280] uppercase">Wood</label>
 <input
 type="number"
 min="0"
 max={origin?.state.stockpile.materials.wood || 0}
 value={cargo.materials.wood}
 onChange={(e) => handleUpdateCargo('materials', 'wood', parseInt(e.target.value) || 0)}
 className="w-full bg-[#181c22] border border-[#2e3440] px-1.5 py-1 text-white text-xs"
 />
 </div>
 <div>
 <label className="text-[9px] text-[#6b7280] uppercase">Metal</label>
 <input
 type="number"
 min="0"
 max={origin?.state.stockpile.materials.metal || 0}
 value={cargo.materials.metal}
 onChange={(e) => handleUpdateCargo('materials', 'metal', parseInt(e.target.value) || 0)}
 className="w-full bg-[#181c22] border border-[#2e3440] px-1.5 py-1 text-white text-xs"
 />
 </div>
 </div>
 </div>
 </div>
 </div>
 )}

 {errorMsg && (
 <div className="p-2.5 bg-[#450a0a] border border-[#ef4444] text-[#fca5a5] text-xs flex items-center gap-2">
 <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[#ef4444]" />
 <span>{errorMsg}</span>
 </div>
 )}
 </div>
 )}

 {/* Tab 2: Active Caravans In Transit */}
 {tab === 'active' && (
 <div className="p-4 overflow-y-auto space-y-3 flex-1">
 {activeCaravanList.length === 0 ? (
 <div className="bg-[#14171c] border border-[#282d38] p-8 text-center space-y-2">
 <Truck className="w-8 h-8 text-[#6b7280] mx-auto" />
 <div className="text-white font-bold text-xs uppercase">No Caravans In Transit</div>
 <p className="text-[11px] text-[#9ca3af]">
 Convoys currently traveling between colonies will appear here with live transit tracking.
 </p>
 </div>
 ) : (
 <div className="space-y-3">
 {activeCaravanList.map((c) => (
 <div key={c.id} className="bg-[#12151a] border border-[#2a303c] p-3.5 space-y-2.5">
 <div className="flex justify-between items-start">
 <div>
 <div className="flex items-center gap-2">
 <span className="text-xs font-black text-white">{c.name}</span>
 <span className="px-1.5 py-0.5 bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 text-[9px] font-bold uppercase">
 {c.vehicle.type.replace('_', ' ')}
 </span>
 <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border ${
 c.ambushRiskRating === 'Extreme' ? 'bg-[#7f1d1d] text-white border-[#ef4444]' :
 c.ambushRiskRating === 'High' ? 'bg-[#78350f] text-[#fde68a] border-[#f59e0b]' :
 'bg-[#064e3b] text-[#6ee7b7] border-[#10b981]'
 }`}>
 Ambush Risk: {c.ambushRiskRating}
 </span>
 </div>
 <div className="text-[11px] text-[#9ca3af] mt-0.5">
 Route: {c.originSettlementName} ➔ {c.destinationSettlementName} ({c.distanceKm} km)
 </div>
 </div>

 <div className="text-right">
 <div className="text-xs font-black text-[#4ade80]">
 {Math.round(c.progress * 100)}% Traveled
 </div>
 <div className="text-[10px] text-[#6b7280]">
 ETA: ~{Math.max(1, Math.round((c.totalDurationSeconds || 60) - (c.elapsedSeconds || 0)))}s
 </div>
 </div>
 </div>

 {/* Progress Bar */}
 <div className="w-full bg-[#1e232c] h-2 border border-[#373e4e] overflow-hidden">
 <div
 className="bg-[#b31217] h-full transition-all duration-150"
 style={{ width: `${Math.round(c.progress * 100)}%` }}
 />
 </div>

 {/* Manifest Pill Tags */}
 <div className="flex flex-wrap gap-2 text-[10px] text-[#9ca3af]">
 <span className="px-2 py-0.5 bg-[#181c22] border border-[#2b313d] text-white">
 Escort: {c.escortSquad?.name || 'Escort'} ({((c.escortSquad?.generalCount || 0) + 1)} pax)
 </span>
 {c.transportedSurvivors.generalCount > 0 && (
 <span className="px-2 py-0.5 bg-[#181c22] border border-[#2b313d] text-[#4ade80]">
 +{c.transportedSurvivors.generalCount} Settlers
 </span>
 )}
 {(c.cargo.food.canned_goods > 0 || c.cargo.food.mre_rations > 0) && (
 <span className="px-2 py-0.5 bg-[#181c22] border border-[#2b313d] text-[#f59e0b]">
 🥫 {c.cargo.food.canned_goods + c.cargo.food.mre_rations} Food
 </span>
 )}
 {c.cargo.medical.first_aid_kits > 0 && (
 <span className="px-2 py-0.5 bg-[#181c22] border border-[#2b313d] text-[#ef4444]">
 🩹 {c.cargo.medical.first_aid_kits} Meds
 </span>
 )}
 {c.cargo.ammo.sharedPool > 0 && (
 <span className="px-2 py-0.5 bg-[#181c22] border border-[#2b313d] text-[#10B981]">
 🎯 {c.cargo.ammo.sharedPool} Ammo
 </span>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 )}

 {/* Footer Actions */}
 <div className="flex items-center justify-between px-4 py-3 bg-[#14171c] border-t border-[#2b303c]">
 <div className="text-[11px] text-[#9ca3af]">
 Total Network: <strong>{Object.keys(settlements).length} Colonies</strong> | Active Caravans:{' '}
 <strong>{activeCaravanList.length}</strong>
 </div>

 <div className="flex items-center gap-2">
 <button
 onClick={onClose}
 className="px-4 py-1.5 bg-[#1a1e26] hover:bg-[#252b36] border border-[#333b49] text-white text-xs font-bold uppercase transition-colors"
 >
 Close
 </button>
 {tab === 'dispatch' && Object.keys(settlements).length >= 2 && (
 <button
 id="confirm-dispatch-caravan-btn"
 onClick={handleDispatch}
 disabled={!selectedVehicleId || !selectedSquadId || !hasEnoughFuel}
 className={`px-5 py-1.5 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border transition-all ${
 selectedVehicleId && selectedSquadId && hasEnoughFuel
 ? 'bg-[#b31217] hover:bg-[#8f0e12] border-[#ef4444] text-white cursor-pointer'
 : 'bg-[#222730] border-[#383f4f] text-[#555d6e] cursor-not-allowed'
 }`}
 >
 <Send className="w-3.5 h-3.5" />
 <span>DISPATCH CONVOY</span>
 </button>
 )}
 </div>
 </div>
 </div>
 </div>
 );
};
