import React from 'react';
import {
 Box,
 Check,
 Crosshair,
 Droplets,
 Fuel,
 HeartPulse,
 Minus,
 Plus,
 RefreshCw,
 Sparkles,
 Trees,
 Truck,
 Utensils,
 X,
} from 'lucide-react';
import { INITIAL_STOCKPILE } from '../services/settlementService';
import { SettlementStockpile } from '../types/settlement';

interface ResourceDebugModalProps {
 isOpen: boolean;
 onClose: () => void;
 stockpile: SettlementStockpile;
 onUpdateStockpile: (newStockpile: SettlementStockpile) => void;
}

export const ResourceDebugModal: React.FC<ResourceDebugModalProps> = ({
 isOpen,
 onClose,
 stockpile,
 onUpdateStockpile,
}) => {
 if (!isOpen) return null;

 const handleAdjustMaterial = (mat: 'wood' | 'metal' | 'bricks', delta: number) => {
 const updated: SettlementStockpile = {
 ...stockpile,
 materials: {
 ...stockpile.materials,
 [mat]: Math.max(0, stockpile.materials[mat] + delta),
 },
 };
 onUpdateStockpile(updated);
 };

 const handleAdjustFood = (item: keyof SettlementStockpile['food'], delta: number) => {
 const updated: SettlementStockpile = {
 ...stockpile,
 food: {
 ...stockpile.food,
 [item]: Math.max(0, stockpile.food[item] + delta),
 },
 };
 onUpdateStockpile(updated);
 };

 const handleAdjustWater = (item: keyof SettlementStockpile['water'], delta: number) => {
 const updated: SettlementStockpile = {
 ...stockpile,
 water: {
 ...stockpile.water,
 [item]: Math.max(0, stockpile.water[item] + delta),
 },
 };
 onUpdateStockpile(updated);
 };

 const handleAdjustMedical = (item: keyof SettlementStockpile['medical'], delta: number) => {
 const updated: SettlementStockpile = {
 ...stockpile,
 medical: {
 ...stockpile.medical,
 [item]: Math.max(0, stockpile.medical[item] + delta),
 },
 };
 onUpdateStockpile(updated);
 };

 const handleAdjustFuel = (item: keyof SettlementStockpile['fuel'], delta: number) => {
 const updated: SettlementStockpile = {
 ...stockpile,
 fuel: {
 ...stockpile.fuel,
 [item]: Math.max(0, stockpile.fuel[item] + delta),
 },
 };
 onUpdateStockpile(updated);
 };

 const handleAdjustAmmo = (delta: number) => {
 const updated: SettlementStockpile = {
 ...stockpile,
 ammo: {
 sharedPool: Math.max(0, stockpile.ammo.sharedPool + delta),
 },
 };
 onUpdateStockpile(updated);
 };

 // Quick Preset Packs
 const applyPreset = (preset: 'starter' | 'builder' | 'rich' | 'depleted') => {
 if (preset === 'starter') {
 onUpdateStockpile(JSON.parse(JSON.stringify(INITIAL_STOCKPILE)));
 } else if (preset === 'builder') {
 onUpdateStockpile({
 ...stockpile,
 materials: {
 wood: stockpile.materials.wood + 500,
 metal: stockpile.materials.metal + 500,
 bricks: stockpile.materials.bricks + 500,
 },
 });
 } else if (preset === 'rich') {
 onUpdateStockpile({
 food: { canned_goods: 250, mre_rations: 200, dried_rations: 200, fresh_harvest: 100 },
 water: { bottled_water: 300, purified_water: 250, rainwater: 100 },
 medical: { first_aid_kits: 50, sterile_bandages: 100, antibiotics: 40, painkillers: 60 },
 fuel: { gasoline: 200, diesel: 150, biofuel: 50 },
 ammo: { sharedPool: 600 },
 materials: { wood: 1000, metal: 1000, bricks: 1000 },
 });
 } else if (preset === 'depleted') {
 onUpdateStockpile({
 food: { canned_goods: 5, mre_rations: 0, dried_rations: 0, fresh_harvest: 0 },
 water: { bottled_water: 10, purified_water: 0, rainwater: 0 },
 medical: { first_aid_kits: 1, sterile_bandages: 2, antibiotics: 0, painkillers: 0 },
 fuel: { gasoline: 5, diesel: 0, biofuel: 0 },
 ammo: { sharedPool: 20 },
 materials: { wood: 15, metal: 10, bricks: 10 },
 });
 }
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm font-mono select-none">
 <div className="bg-[#0e1012] border border-[#4c1d95] clip-tactical-bracket surface-bevel w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-white">
 {/* Header */}
 <div className="p-3 bg-[#171322] border-b border-[#2d2244] flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Sparkles className="w-4 h-4 text-[#c084fc]" />
 <h2 className="font-black text-sm uppercase tracking-wider text-white">
 SETTLEMENT RESOURCE DEBUG PANEL <span className="text-[#c084fc]">(§7.2)</span>
 </h2>
 </div>
 <button
 onClick={onClose}
 className="p-1 text-[#9ca3af] hover:text-white bg-[#221a30] hover:bg-[#322549] border border-[#3e2b5c] transition-colors"
 >
 <X className="w-4 h-4" />
 </button>
 </div>

 {/* Body Content */}
 <div className="p-4 overflow-y-auto space-y-4 text-[11px]">
 {/* Preset Buttons */}
 <div>
 <div className="text-[10px] text-[#9ca3af] uppercase font-bold mb-1.5">
 Quick Testing Presets:
 </div>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 <button
 onClick={() => applyPreset('builder')}
 className="p-2 bg-[#1c2230] hover:bg-[#283246] border border-[#3b82f6] text-[#cbd5e1] font-bold text-center"
 >
 +500 Materials Pack
 </button>
 <button
 onClick={() => applyPreset('rich')}
 className="p-2 bg-[#20291f] hover:bg-[#2d3a2b] border border-[#22c55e] text-[#4ade80] font-bold text-center"
 >
 Max Out All Stocks
 </button>
 <button
 onClick={() => applyPreset('starter')}
 className="p-2 bg-[#1b1e24] hover:bg-[#272c35] border border-[#4b5563] text-[#d1d5db] font-bold text-center"
 >
 Reset Default Start
 </button>
 <button
 onClick={() => applyPreset('depleted')}
 className="p-2 bg-[#2a171a] hover:bg-[#3b2024] border border-[#ef4444] text-[#f87171] font-bold text-center"
 >
 Depleted Reserves
 </button>
 </div>
 </div>

 {/* 1. Construction Materials */}
 <div className="bg-[#121417] p-3 border border-[#24272c]">
 <div className="text-white font-bold uppercase text-[11px] mb-2 flex items-center justify-between border-b border-[#24272c] pb-1">
 <span className="flex items-center gap-1.5 text-[#38bdf8]">
 <Box className="w-3.5 h-3.5" />
 <span>1. Construction Materials (Wood / Metal / Bricks)</span>
 </span>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 {/* Wood */}
 <div className="bg-[#181a1f] p-2 border border-[#292c31] flex flex-col justify-between">
 <div className="flex justify-between items-center mb-1">
 <span className="text-[#4ade80] font-bold flex items-center gap-1">
 <Trees className="w-3 h-3" /> Wood
 </span>
 <span className="text-base font-black text-white">{stockpile.materials.wood}</span>
 </div>
 <div className="flex gap-1 mt-2">
 <button
 onClick={() => handleAdjustMaterial('wood', -50)}
 className="flex-1 bg-[#22252c] hover:bg-[#30353f] py-1 text-center font-bold text-[#ef4444]"
 >
 -50
 </button>
 <button
 onClick={() => handleAdjustMaterial('wood', 50)}
 className="flex-1 bg-[#22252c] hover:bg-[#30353f] py-1 text-center font-bold text-[#4ade80]"
 >
 +50
 </button>
 <button
 onClick={() => handleAdjustMaterial('wood', 200)}
 className="flex-1 bg-[#22252c] hover:bg-[#30353f] py-1 text-center font-bold text-[#38bdf8]"
 >
 +200
 </button>
 </div>
 </div>

 {/* Metal */}
 <div className="bg-[#181a1f] p-2 border border-[#292c31] flex flex-col justify-between">
 <div className="flex justify-between items-center mb-1">
 <span className="text-[#38bdf8] font-bold flex items-center gap-1">
 <Truck className="w-3 h-3" /> Metal
 </span>
 <span className="text-base font-black text-white">{stockpile.materials.metal}</span>
 </div>
 <div className="flex gap-1 mt-2">
 <button
 onClick={() => handleAdjustMaterial('metal', -50)}
 className="flex-1 bg-[#22252c] hover:bg-[#30353f] py-1 text-center font-bold text-[#ef4444]"
 >
 -50
 </button>
 <button
 onClick={() => handleAdjustMaterial('metal', 50)}
 className="flex-1 bg-[#22252c] hover:bg-[#30353f] py-1 text-center font-bold text-[#4ade80]"
 >
 +50
 </button>
 <button
 onClick={() => handleAdjustMaterial('metal', 200)}
 className="flex-1 bg-[#22252c] hover:bg-[#30353f] py-1 text-center font-bold text-[#38bdf8]"
 >
 +200
 </button>
 </div>
 </div>

 {/* Bricks */}
 <div className="bg-[#181a1f] p-2 border border-[#292c31] flex flex-col justify-between">
 <div className="flex justify-between items-center mb-1">
 <span className="text-[#f97316] font-bold flex items-center gap-1">
 <Box className="w-3 h-3" /> Bricks
 </span>
 <span className="text-base font-black text-white">{stockpile.materials.bricks}</span>
 </div>
 <div className="flex gap-1 mt-2">
 <button
 onClick={() => handleAdjustMaterial('bricks', -50)}
 className="flex-1 bg-[#22252c] hover:bg-[#30353f] py-1 text-center font-bold text-[#ef4444]"
 >
 -50
 </button>
 <button
 onClick={() => handleAdjustMaterial('bricks', 50)}
 className="flex-1 bg-[#22252c] hover:bg-[#30353f] py-1 text-center font-bold text-[#4ade80]"
 >
 +50
 </button>
 <button
 onClick={() => handleAdjustMaterial('bricks', 200)}
 className="flex-1 bg-[#22252c] hover:bg-[#30353f] py-1 text-center font-bold text-[#38bdf8]"
 >
 +200
 </button>
 </div>
 </div>
 </div>
 </div>

 {/* 2. Itemized Food Categories */}
 <div className="bg-[#121417] p-3 border border-[#24272c]">
 <div className="text-[#fbbf24] font-bold uppercase text-[11px] mb-2 flex items-center gap-1.5 border-b border-[#24272c] pb-1">
 <Utensils className="w-3.5 h-3.5" />
 <span>2. Itemized Food Stockpile</span>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {(['canned_goods', 'mre_rations', 'dried_rations', 'fresh_harvest'] as (keyof SettlementStockpile['food'])[]).map(
 (item) => (
 <div key={item} className="bg-[#181a1f] p-2 border border-[#292c31]">
 <div className="text-[9px] text-[#9ca3af] uppercase truncate">{item.replace('_', ' ')}</div>
 <div className="text-sm font-black text-white my-1">{stockpile.food[item]}</div>
 <div className="flex gap-1">
 <button
 onClick={() => handleAdjustFood(item, -10)}
 className="flex-1 bg-[#22252c] hover:bg-[#30353f] py-0.5 text-center font-bold text-[#ef4444]"
 >
 -10
 </button>
 <button
 onClick={() => handleAdjustFood(item, 25)}
 className="flex-1 bg-[#22252c] hover:bg-[#30353f] py-0.5 text-center font-bold text-[#4ade80]"
 >
 +25
 </button>
 </div>
 </div>
 )
 )}
 </div>
 </div>

 {/* 3. Water & Medical Items */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {/* Water */}
 <div className="bg-[#121417] p-3 border border-[#24272c]">
 <div className="text-[#cbd5e1] font-bold uppercase text-[11px] mb-2 flex items-center gap-1.5 border-b border-[#24272c] pb-1">
 <Droplets className="w-3.5 h-3.5" />
 <span>3. Water Reserves</span>
 </div>
 <div className="space-y-1.5">
 {(['bottled_water', 'purified_water', 'rainwater'] as (keyof SettlementStockpile['water'])[]).map((item) => (
 <div key={item} className="flex justify-between items-center bg-[#181a1f] p-1.5 border border-[#292c31]">
 <span className="text-[10px] text-[#9ca3af] capitalize">{item.replace('_', ' ')}</span>
 <div className="flex items-center gap-2">
 <span className="font-bold text-white">{stockpile.water[item]}L</span>
 <button
 onClick={() => handleAdjustWater(item, 20)}
 className="px-1.5 py-0.5 bg-[#22252c] hover:bg-[#30353f] text-[#cbd5e1] font-bold"
 >
 +20
 </button>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Medical */}
 <div className="bg-[#121417] p-3 border border-[#24272c]">
 <div className="text-[#f43f5e] font-bold uppercase text-[11px] mb-2 flex items-center gap-1.5 border-b border-[#24272c] pb-1">
 <HeartPulse className="w-3.5 h-3.5" />
 <span>4. Medical Supplies</span>
 </div>
 <div className="space-y-1.5">
 {(['first_aid_kits', 'sterile_bandages', 'antibiotics', 'painkillers'] as (keyof SettlementStockpile['medical'])[]).map((item) => (
 <div key={item} className="flex justify-between items-center bg-[#181a1f] p-1.5 border border-[#292c31]">
 <span className="text-[10px] text-[#9ca3af] capitalize">{item.replace('_', ' ')}</span>
 <div className="flex items-center gap-2">
 <span className="font-bold text-white">{stockpile.medical[item]}</span>
 <button
 onClick={() => handleAdjustMedical(item, 10)}
 className="px-1.5 py-0.5 bg-[#22252c] hover:bg-[#30353f] text-[#f43f5e] font-bold"
 >
 +10
 </button>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* 4. Fuel & Shared Ammunition */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {/* Fuel */}
 <div className="bg-[#121417] p-3 border border-[#24272c]">
 <div className="text-[#a855f7] font-bold uppercase text-[11px] mb-2 flex items-center gap-1.5 border-b border-[#24272c] pb-1">
 <Fuel className="w-3.5 h-3.5" />
 <span>5. Fuel Reserves</span>
 </div>
 <div className="space-y-1.5">
 {(['gasoline', 'diesel', 'biofuel'] as (keyof SettlementStockpile['fuel'])[]).map((item) => (
 <div key={item} className="flex justify-between items-center bg-[#181a1f] p-1.5 border border-[#292c31]">
 <span className="text-[10px] text-[#9ca3af] capitalize">{item}</span>
 <div className="flex items-center gap-2">
 <span className="font-bold text-white">{stockpile.fuel[item]}L</span>
 <button
 onClick={() => handleAdjustFuel(item, 25)}
 className="px-1.5 py-0.5 bg-[#22252c] hover:bg-[#30353f] text-[#a855f7] font-bold"
 >
 +25
 </button>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Shared Ammunition Pool */}
 <div className="bg-[#121417] p-3 border border-[#24272c]">
 <div className="text-[#ef4444] font-bold uppercase text-[11px] mb-2 flex items-center gap-1.5 border-b border-[#24272c] pb-1">
 <Crosshair className="w-3.5 h-3.5" />
 <span>6. Shared Ammunition Pool</span>
 </div>
 <div className="bg-[#181a1f] p-3 border border-[#292c31] text-center">
 <div className="text-[10px] text-[#9ca3af]">Current Shared Rounds</div>
 <div className="text-2xl font-black text-[#ef4444] my-1">
 {stockpile.ammo.sharedPool} RDS
 </div>
 <div className="flex justify-center gap-2 mt-2">
 <button
 onClick={() => handleAdjustAmmo(-50)}
 className="px-3 py-1 bg-[#22252c] hover:bg-[#30353f] text-[#ef4444] font-bold"
 >
 -50
 </button>
 <button
 onClick={() => handleAdjustAmmo(50)}
 className="px-3 py-1 bg-[#22252c] hover:bg-[#30353f] text-[#4ade80] font-bold"
 >
 +50
 </button>
 <button
 onClick={() => handleAdjustAmmo(200)}
 className="px-3 py-1 bg-[#22252c] hover:bg-[#30353f] text-[#38bdf8] font-bold"
 >
 +200
 </button>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Footer */}
 <div className="p-3 bg-[#171322] border-t border-[#2d2244] flex justify-end">
 <button
 onClick={onClose}
 className="px-4 py-1.5 bg-[#4c1d95] hover:bg-[#6b21a8] text-white font-bold text-xs uppercase transition-colors"
 >
 Done & Return to World
 </button>
 </div>
 </div>
 </div>
 );
};
