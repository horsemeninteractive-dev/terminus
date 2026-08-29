import React, { useState } from 'react';
import {
  Car,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Droplets,
  Edit2,
  Flashlight,
  Footprints,
  HelpCircle,
  Lock,
  LogOut,
  MapPin,
  Minus,
  MinusCircle,
  Package,
  RotateCcw,
  Shield,
  ShieldAlert,
  Skull,
  Star,
  Swords,
  User,
  UserCheck,
  UserMinus,
  Users,
  Wheat,
  X,
  Zap,
} from 'lucide-react';
import { WorldVehicle } from '../types/vehicle';
import {
  ARMOR_CATALOG,
  ArmorItemId,
  CombatStance,
  SquadMemberUnit,
  TacticalSquadUnit,
  WEAPON_CATALOG,
  WeaponItemId,
} from '../types/combat';
import { soundEngine } from '../services/soundService';

interface TacticalSquadHUDProps {
  squad: TacticalSquadUnit | null;
  onDeselect: () => void;
  onChangeStance: (squadId: string, stance: CombatStance) => void;
  onOrderFallbackHQ?: (squadId: string) => void;
  armory?: { weapons: WeaponItemId[]; armor: ArmorItemId[] };
  onAssignWeapon?: (squadId: string, memberId: string, weaponId: WeaponItemId | null) => void;
  onAssignArmor?: (squadId: string, memberId: string, armorId: ArmorItemId | null) => void;
  allSquads?: TacticalSquadUnit[];
  onSelectSquad?: (squadId: string) => void;
  onDisbandSquad?: (squadId: string) => void;
  inventory?: { capacity: number; used: number; items: { id: string; quantity: number }[] };
  /** Vehicle the selected squad is currently riding in (shows condition/fuel + unmount). */
  mountedVehicle?: WorldVehicle | null;
  onDismountVehicle?: () => void;
  onStartScavengeArea?: () => void;
  isScavengeAreaActive?: boolean;
}

// Survivor portrait avatars for realistic squad representation
const SURVIVOR_AVATARS = [
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
];

export const TacticalSquadHUD: React.FC<TacticalSquadHUDProps> = ({
  squad,
  onDeselect,
  onChangeStance,
  onOrderFallbackHQ,
  armory,
  onAssignWeapon,
  onAssignArmor,
  allSquads = [],
  onSelectSquad,
  onDisbandSquad,
  inventory,
  mountedVehicle,
  onDismountVehicle,
  onStartScavengeArea,
  isScavengeAreaActive = false,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [squadName, setSquadName] = useState(squad?.name || 'SQUAD 1');
  const [isRunning, setIsRunning] = useState(true);
  const [isFlashlightActive, setIsFlashlightActive] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  if (!squad) return null;

  const aliveCount = squad.members.filter((m) => m.isAlive).length;
  const totalSlots = 4;

  const currentSquadIndex = allSquads.findIndex((s) => s.squadId === squad.squadId);
  const squadDisplayIndex = currentSquadIndex >= 0 ? currentSquadIndex + 1 : 1;
  const totalSquadsCount = Math.max(allSquads.length, 1);

  const handlePrevSquad = () => {
    if (allSquads.length <= 1) return;
    const prevIdx = (currentSquadIndex - 1 + allSquads.length) % allSquads.length;
    if (onSelectSquad) onSelectSquad(allSquads[prevIdx].squadId);
  };

  const handleNextSquad = () => {
    if (allSquads.length <= 1) return;
    const nextIdx = (currentSquadIndex + 1) % allSquads.length;
    if (onSelectSquad) onSelectSquad(allSquads[nextIdx].squadId);
  };

  if (isMinimized) {
    return (
      <div
        id="tactical-squad-hud-minimized"
        className="relative z-40 flex items-center justify-between bg-[#07090C]/95 border-2 border-[#10B981] px-3 py-2 text-[#E8E8E8] select-none w-full md:w-[min(94vw,340px)] shrink-0 pointer-events-auto backdrop-blur-md clip-tactical-bracket surface-bevel shadow-2xl animate-in fade-in duration-150"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 bg-[#064E3B] border border-[#10B981] flex items-center justify-center text-[#10B981] shrink-0">
            <Footprints className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-heading font-black text-xs text-white uppercase truncate">
              {squad.name}
            </span>
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#94A3B8]">
              <span className="text-[#10B981] font-bold">{aliveCount}/{squad.members.length} ALIVE</span>
              <span>HP: {squad.currentHp}/{squad.maxHp}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">            <button
            onClick={() => {
              setIsMinimized(false);
              soundEngine.playClick();
            }}
            title="Expand Squad Panel"
            className="p-1 text-[#10B981] hover:text-white bg-[#064E3B]/40 hover:bg-[#064E3B] border border-[#10B981] transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={onDeselect}
            title="Deselect Squad"
            className="p-1 text-[#94A3B8] hover:text-white bg-[#1E293B]/40 hover:bg-[#1E293B] border border-[#334155] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id="tactical-squad-hud"
      className="relative z-40 flex flex-col bg-[#07090C]/95 border-2 border-[#1E293B] text-[#E8E8E8] select-none w-full md:w-[min(94vw,340px)] shrink-0 max-h-[48vh] md:max-h-[70vh] overflow-y-auto pointer-events-auto backdrop-blur-md clip-tactical-bracket surface-bevel shadow-2xl"
    >
      {/* 1. Squad Header Bar */}
      <div className="h-8 px-2.5 bg-[#0B0F15] border-b border-[#1E293B] flex items-center justify-between">
        {/* Left: Green glowing walking soldier icon & Squad Name */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-[#064E3B] border border-[#10B981] flex items-center justify-center text-[#10B981]">
            <Footprints className="w-3.5 h-3.5" />
          </div>

          {isEditingName ? (
            <input
              type="text"
              value={squadName}
              onChange={(e) => setSquadName(e.target.value)}
              onBlur={() => setIsEditingName(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
              autoFocus
              className="bg-black border border-[#E8E8E8] text-white text-xs font-heading font-bold uppercase px-1 py-0.5 outline-none w-28"
            />
          ) : (
            <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setIsEditingName(true)}>
              <span className="font-heading font-bold text-xs uppercase tracking-wider text-white">
                {squad.name}
              </span>
              <Edit2 className="w-2.5 h-2.5 text-[#64748B] hover:text-[#E8E8E8]" />
            </div>
          )}
        </div>

        {/* Right: Squad index counter, Minimize & Close */}
        <div className="flex items-center gap-1.5 font-mono text-[10px]">
          <div className="flex items-center gap-1 bg-[#151D28] px-1.5 py-0.5 border border-[#222E3E] text-slate-300">
            <button
              onClick={handlePrevSquad}
              className="text-[#64748B] hover:text-white px-0.5"
              title="Previous Squad"
            >
              ‹
            </button>
            <span className="font-bold">{squadDisplayIndex}/{totalSquadsCount}</span>
            <User className="w-3 h-3 text-[#10B981]" />
            <button
              onClick={handleNextSquad}
              className="text-[#64748B] hover:text-white px-0.5"
              title="Next Squad"
            >
              ›
            </button>
          </div>
            <button
            onClick={() => {
              setIsMinimized(true);
              soundEngine.playClick();
            }}
            title="Minimize Panel"
            className="text-[#94A3B8] hover:text-white p-1"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onDeselect}
            title="Close / Deselect (ESC)"
            className="text-[#64748B] hover:text-white transition-colors p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Cinematic Squad Artwork Banner */}
      <div className="relative h-24 sm:h-28 w-full bg-[#050709] overflow-hidden border-b border-[#1E293B]">
        <img
          src="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80"
          alt="Tactical Squad Patrol in Ruined City"
          className="w-full h-full object-cover opacity-60 filter saturate-50 contrast-125"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07090C] via-transparent to-transparent" />
        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/80 backdrop-blur-md border border-slate-700 text-[9px] font-mono font-bold">
          {squad.state === 'searching' ? (
            <span className="text-amber-400 animate-pulse flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              SCAVENGING
            </span>
          ) : squad.state === 'returning' ? (
            <span className="text-sky-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />
              RETURNING HAUL
            </span>
          ) : (
            <span className="text-emerald-400">{squad.state.toUpperCase()}</span>
          )}
        </div>
      </div>

      {/* 2b. Live Scavenging Progress Bar Section */}
      {squad.state === 'searching' || (squad.searchProgress !== undefined && squad.searchProgress > 0) ? (
        <div className="p-2.5 bg-[#0F172A]/90 border-b border-amber-500/40 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-heading font-bold text-amber-300">
            <span className="flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-amber-400" />
              SCAVENGING STRUCTURE:
            </span>
            <span className="font-mono text-amber-400 text-xs font-black">
              {squad.searchProgress || 0}%
            </span>
          </div>

          <div className="text-[10px] text-slate-300 font-mono truncate">
            {squad.targetBuildingName || 'Ruined Structure'}
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full bg-black/80 border border-amber-500/40 rounded-sm overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 transition-all duration-300 relative"
              style={{ width: `${Math.min(100, Math.max(0, squad.searchProgress || 0))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
            <span>Progress: {squad.searchProgress || 0}/100%</span>
            <span className={inventory && inventory.used >= inventory.capacity * 0.9 ? 'text-red-400 font-bold' : 'text-slate-300'}>
              Weight: {inventory?.used || 0}/{inventory?.capacity || 45}kg
            </span>
          </div>
        </div>
      ) : squad.state === 'returning' ? (
        <div className="p-2.5 bg-[#0C1929]/90 border-b border-sky-500/40 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-heading font-bold text-sky-300">
            <span className="flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-sky-400" />
              RETURNING TO STORAGE
            </span>
            <span className="font-mono text-sky-400 text-[10px]">
              {inventory?.used || 0}/{inventory?.capacity || 45}kg
            </span>
          </div>
          <div className="text-[10px] text-slate-300 font-mono truncate">
            Dropoff: {squad.targetBuildingName || 'HQ Fortress'}
          </div>
        </div>
      ) : null}

      {/* 3. MEMBERS : 4/4 Section */}
      <div className="p-2.5 border-b border-[#1E293B] space-y-2">
        <div className="flex items-center justify-between text-[11px] font-heading font-bold text-slate-300 tracking-wide">
          <span>MEMBERS :</span>
          <span className="font-mono text-white">{aliveCount}/{squad.members.length}</span>
        </div>

        {/* 4 Survivor Portrait Tiles */}
        <div className="grid grid-cols-4 gap-2">
          {squad.members.map((member, idx) => {
            const hpPct = member.maxHp > 0 ? (member.currentHp / member.maxHp) * 100 : 0;
            const avatarUrl = SURVIVOR_AVATARS[idx % SURVIVOR_AVATARS.length];
            const weapon = WEAPON_CATALOG[member.weaponId];
            const armor = member.armorId ? ARMOR_CATALOG[member.armorId] : null;

            return (
              <div key={member.id} className="flex flex-col items-center gap-1">
                {/* Photo Portrait */}
                <div className="relative w-full aspect-square bg-[#10141C] border border-[#2D3B4E] overflow-hidden group">
                  <img
                    src={avatarUrl}
                    alt={member.name}
                    className="w-full h-full object-cover filter grayscale contrast-125 group-hover:grayscale-0 transition-all"
                  />
                  {/* HP bar under portrait */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-900">
                    <div
                      className={`h-full ${hpPct < 30 ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>
                  {!member.isAlive && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                      <Skull className="w-5 h-5 text-red-500" />
                    </div>
                  )}
                </div>

                {/* Weapon & Armor Icons */}
                <div className="flex items-center gap-1 w-full justify-center">
                  {/* Weapon Pill (Green Pistol) */}
                  <button
                    onClick={() => {
                      if (!onAssignWeapon || !member.isAlive) return;
                      const best = armory?.weapons?.[0];
                      if (best) onAssignWeapon(squad.squadId, member.id, best);
                    }}
                    title={`Weapon: ${weapon.name}`}
                    className="w-5 h-4 bg-[#064E3B] border border-[#10B981]/60 flex items-center justify-center text-[#10B981] hover:bg-[#065F46] transition-colors touch-manipulation"
                  >
                    <Crosshair className="w-2.5 h-2.5" />
                  </button>

                  {/* Armor Pill */}
                  <button
                    onClick={() => {
                      if (!onAssignArmor || !member.isAlive) return;
                      const best = armory?.armor?.[0];
                      if (best) onAssignArmor(squad.squadId, member.id, best);
                    }}
                    title={armor ? `Armor: ${armor.name}` : 'No Armor'}
                    className="w-5 h-4 bg-[#1E293B] border border-[#475569] flex items-center justify-center text-slate-300 hover:bg-[#334155] transition-colors touch-manipulation"
                  >
                    <Shield className="w-2.5 h-2.5 text-[#94A3B8]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. SQUAD RESOURCES : 1/4 🔒 Section */}
      <div className="p-2.5 border-b border-[#1E293B] space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-heading font-bold text-slate-300 tracking-wide">
          <span>SQUAD RESOURCES:</span>
          <div className="flex items-center gap-1 font-mono text-white text-[10px]">
            <span>{inventory?.items.length || 0}/{inventory?.capacity || 0}</span>
            <Lock className="w-3 h-3 text-[#64748B]" />
          </div>
        </div>

        {/* 4 Inventory Slot Boxes */}
        <div className="grid grid-cols-4 gap-2">
          {/* Slot 1: Active Loot / Food wheat icon */}
          <div className="h-10 bg-[#10141C] border border-[#2D3B4E] flex items-center justify-center text-[#10B981]">
            <Wheat className="w-4 h-4 text-[#10B981]" />
          </div>

          {/* Slot 2: Empty / Ammo if carrying */}
          <div className="h-10 bg-[#0A0D12] border border-[#1E293B] flex items-center justify-center text-[#64748B]">
            {inventory?.items?.[0] ? (
              <Package className="w-4 h-4 text-[#E8E8E8]" />
            ) : null}
          </div>

          {/* Slot 3: Empty */}
          <div className="h-10 bg-[#0A0D12] border border-[#1E293B] flex items-center justify-center text-[#64748B]">
            {inventory?.items?.[1] ? (
              <Package className="w-4 h-4 text-[#E8E8E8]" />
            ) : null}
          </div>

          {/* Slot 4: Locked */}
          <div className="h-10 bg-[#07090C] border border-[#151D28] flex items-center justify-center text-[#475569]">
            <Lock className="w-3 h-3 text-[#334155]" />
          </div>
        </div>
      </div>

      {/* 5. Stance & Action Button Strip */}
      <div className="p-2.5 bg-[#0A0D12] flex items-center justify-between gap-1">
        {/* Left: Green Toggle Buttons (Running & Flashlight) */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setIsRunning(!isRunning);
              soundEngine.playClick();
            }}
            title={isRunning ? 'Sprint Mode (Fast)' : 'Stealth Walk Mode (Quiet)'}
            className={`w-8 h-8 flex items-center justify-center border transition-all touch-manipulation active:scale-95 ${
              isRunning
                ? 'bg-[#064E3B] border-[#10B981] text-[#10B981]'
                : 'bg-[#151D28] border-[#2D3B4E] text-[#64748B]'
            }`}
          >
            <Footprints className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setIsFlashlightActive(!isFlashlightActive);
              soundEngine.playClick();
            }}
            title="Toggle Tactical Flashlights / Night Flares"
            className={`w-8 h-8 flex items-center justify-center border transition-all touch-manipulation active:scale-95 ${
              isFlashlightActive
                ? 'bg-[#064E3B] border-[#10B981] text-[#10B981]'
                : 'bg-[#151D28] border-[#2D3B4E] text-[#64748B]'
            }`}
          >
            <Flashlight className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Tactical Utility Actions */}
        <div className="flex items-center gap-1">
          {/* Queue building scavenging */}
          <button
            onClick={() => {
              onStartScavengeArea?.();
              soundEngine.playClick();
            }}
            title="Drag a box over buildings to queue scavenging"
            className={`w-8 h-8 sm:w-7 sm:h-7 border transition-colors flex items-center justify-center ${isScavengeAreaActive ? 'bg-amber-900/60 border-amber-400 text-amber-300' : 'bg-[#151D28] hover:bg-[#1E293B] text-amber-400 border-[#2D3B4E]'}`}
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>
          {/* Center on Squad */}
          <button
            onClick={() => onOrderFallbackHQ?.(squad.squadId)}
            title="Recall Squad back to HQ"
            className="w-8 h-8 sm:w-7 sm:h-7 bg-[#151D28] hover:bg-[#1E293B] border border-[#2D3B4E] hover:border-[#CBD5E1] flex items-center justify-center text-slate-300 hover:text-white transition-colors touch-manipulation active:scale-95"
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>

          {/* Disband Squad */}
          <button
            onClick={() => {
              if (onDisbandSquad && window.confirm(`Disband ${squad.name} and return members to workforce?`)) {
                onDisbandSquad(squad.squadId);
                onDeselect();
              }
            }}
            title="Disband Squad"
            className="w-8 h-8 sm:w-7 sm:h-7 bg-[#151D28] hover:bg-[#2A0E10] border border-[#2D3B4E] hover:border-red-500 flex items-center justify-center text-slate-300 hover:text-red-400 transition-colors touch-manipulation active:scale-95"
          >
            <UserMinus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 5b. Mounted Vehicle Status & Unmount (shown while the squad rides in a vehicle) */}
      {mountedVehicle && (() => {
        const vehFuelPct = Math.round((mountedVehicle.currentFuel / mountedVehicle.maxFuel) * 100);
        const vehHpPct = Math.round((mountedVehicle.currentHp / mountedVehicle.maxHp) * 100);
        const vehDef = mountedVehicle.type === 'cargo_van' ? 'CARGO VAN' : mountedVehicle.type === 'armed_truck' ? 'ARMED TRUCK' : 'PICKUP TRUCK';
        return (
          <div className="p-2.5 border-b border-[#1E293B] bg-[#0A0D12] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-heading font-bold text-amber-300 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-amber-400" />
                MOUNTED VEHICLE
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 font-black uppercase ${
                  mountedVehicle.condition === 'operational'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-amber-950 text-amber-400 border border-amber-800'
                }`}
              >
                {mountedVehicle.condition}
              </span>
            </div>

            <div className="text-[10px] font-mono text-slate-300 truncate">
              {mountedVehicle.name} · {vehDef}
            </div>

            {/* Fuel gauge */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[9px] font-mono text-slate-400">
                <span className="flex items-center gap-1">
                  <Droplets className="w-2.5 h-2.5 text-amber-400" />
                  FUEL
                </span>
                <span className="font-bold text-amber-400">
                  {mountedVehicle.currentFuel.toFixed(0)}/{mountedVehicle.maxFuel}L ({vehFuelPct}%)
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full ${vehFuelPct < 20 ? 'bg-red-500' : 'bg-amber-500'}`}
                  style={{ width: `${Math.max(0, Math.min(100, vehFuelPct))}%` }}
                />
              </div>
            </div>

            {/* Hull / condition gauge */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[9px] font-mono text-slate-400">
                <span className="flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5 text-[#CBD5E1]" />
                  HULL
                </span>
                <span className="font-bold text-[#CBD5E1]">
                  {mountedVehicle.currentHp}/{mountedVehicle.maxHp} HP ({vehHpPct}%)
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full ${vehHpPct < 30 ? 'bg-red-500' : 'bg-[#334155]'}`}
                  style={{ width: `${Math.max(0, Math.min(100, vehHpPct))}%` }}
                />
              </div>
            </div>

            <div className="text-[9px] font-mono text-slate-500">
              Right-click the ground to drive to a location.
            </div>

            <button
              onClick={onDismountVehicle}
              className="w-full py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-700/60 text-red-300 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>UNMOUNT SQUAD FROM VEHICLE</span>
            </button>
          </div>
        );
      })()}

      {/* 6. Footer Coordinates */}
      <div className="h-6 px-2.5 bg-[#06080B] border-t border-[#1E293B] flex items-center justify-between text-[9px] font-mono text-[#64748B]">
        <div className="flex items-center gap-1 text-[#E8E8E8]">
          <MapPin className="w-2.5 h-2.5" />
          <span>LAT: 52.094 N</span>
        </div>
        <span>LON: 1.920 W</span>
      </div>
    </div>
  );
};
