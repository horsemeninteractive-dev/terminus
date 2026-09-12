import React from 'react';
import { Footprints, Car, Plus, Crosshair, Shield, Radio } from 'lucide-react';
import { TacticalSquadUnit, getWeaponDefinition } from '../types/combat';
import { soundEngine } from '../services/soundService';

interface TacticalSquadSelectorStripProps {
  squads: TacticalSquadUnit[];
  selectedSquadId: string | null;
  onSelectSquad: (squadId: string) => void;
  onCreateSquad?: () => void;
  onPanToSquad?: (squad: TacticalSquadUnit) => void;
  /** A tutorial/mission task is asking the player to muster a squad — the
   *  '+' button glows so the player knows exactly what to press. */
  highlightMuster?: boolean;
  /** Expeditions (§IFZ) — off-map scavenging via the Antenna. Rendered above
   *  the muster '+' and only once an operational Antenna exists. */
  onOpenExpeditionModal?: () => void;
  antennaOperational?: boolean;
}

export const TacticalSquadSelectorStrip: React.FC<TacticalSquadSelectorStripProps> = ({
  squads = [],
  selectedSquadId,
  onSelectSquad,
  onCreateSquad,
  onPanToSquad,
  highlightMuster = false,
  onOpenExpeditionModal,
  antennaOperational = false,
}) => {
  const handleSquadClick = (squad: TacticalSquadUnit) => {
    soundEngine.playRadioChirp();
    onSelectSquad(squad.squadId);
    if (onPanToSquad) onPanToSquad(squad);
  };

  const getBestWeapon = (squad: TacticalSquadUnit): string => {
    const weapons = squad.members
      .filter((m) => m.isAlive && m.weaponId)
      .map((m) => getWeaponDefinition(m.weaponId).name);
    if (weapons.length === 0) return 'Unarmed';
    const ranged = weapons.find((w) => !w?.toLowerCase().includes('knife') && !w?.toLowerCase().includes('crowbar'));
    return ranged || weapons[0] || 'Unarmed';
  };

  return (
    <div
      id="tactical-squad-selector-strip"
      className={`fixed top-16 md:top-12 right-2 z-25 flex flex-col gap-1.5 select-none pointer-events-auto max-h-[calc(100vh-140px)] overflow-y-auto ${
        selectedSquadId ? 'hidden sm:flex' : 'flex'
      }`}
    >
      {/* Expeditions (§IFZ) — off-map scavenging areas. Only shown once an
          operational Antenna exists; hidden entirely instead of greyed out so
          the strip stays clean before the feature unlocks. */}
      {onOpenExpeditionModal && antennaOperational && (
        <button
          id="expeditions-btn"
          onClick={() => {
            soundEngine.playClick();
            onOpenExpeditionModal();
          }}
          title="Expeditions — off-map scavenging areas (Antenna)"
          className="w-10 h-10 min-w-[40px] min-h-[40px] border flex items-center justify-center transition-all group self-start touch-manipulation active:scale-95 bg-[#0A0D12]/95 hover:bg-[#1E1430] border-[#2D3B4E] hover:border-[#A78BFA] text-[#A78BFA]"
        >
          <Radio className="w-4 h-4" />
        </button>
      )}

      {/* Form Squad Button — square '+' with a dotted add-box */}
      {onCreateSquad && squads.length < 8 && (
        <button
          id="form-new-squad-btn"
          onClick={() => {
            soundEngine.playClick();
            onCreateSquad();
          }}
          title={
            highlightMuster
              ? 'OBJECTIVE: MUSTER FIRETEAM — form your first tactical squad'
              : 'Form New Tactical Squad'
          }
          className={`w-10 h-10 min-w-[40px] min-h-[40px] border-2 border-dashed flex items-center justify-center transition-all group self-start touch-manipulation active:scale-95 ${
            highlightMuster
              ? 'bg-[#10B981]/20 hover:bg-[#10B981]/30 border-[#10B981] text-[#10B981] animate-pulse shadow-[0_0_14px_rgba(16,185,129,0.55)] ring-2 ring-[#10B981]/40'
              : 'bg-[#0A0D12]/95 hover:bg-[#151D28] border-[#334155] hover:border-[#10B981] text-[#64748B] hover:text-[#10B981]'
          }`}
        >
          <Plus className="w-4 h-4" />
        </button>
      )}

      {/* Squad Icons — square matching the form new squad button size */}
      {squads.map((squad, index) => {
        const isSelected = selectedSquadId === squad.squadId;
        const aliveMembers = squad.members.filter((m) => m.isAlive).length;
        const isMoving = squad.state === 'moving' || (squad.state as string) === 'patrol';
        const isCombat = squad.state === 'combat';
        const isDriving = !!squad.vehicleId || !!squad.mountedVehicleId;
        const totalHp = squad.members.reduce((sum, m) => sum + (m.isAlive ? m.currentHp : 0), 0);
        const maxHp = squad.members.reduce((sum, m) => sum + m.maxHp, 0);
        const hpPct = maxHp > 0 ? (totalHp / maxHp) * 100 : 0;
        const bestWeapon = getBestWeapon(squad);

        return (
          <button
            key={squad.squadId}
            onClick={() => handleSquadClick(squad)}
            title={`${squad.name} (${squad.state.toUpperCase()}) • ${aliveMembers}/${squad.members.length} Alive • ${bestWeapon}`}
            className={`relative w-10 h-10 min-w-[40px] min-h-[40px] flex flex-col items-center justify-center border transition-all group touch-manipulation active:scale-95 ${
              isSelected
                ? 'bg-[#10171F] border-[#CBD5E1] text-white shadow-[0_0_10px_rgba(203,213,225,0.3)]'
                : 'bg-[#0A0D12]/90 hover:bg-[#121820] border-[#2D3B4E] hover:border-[#475569] text-[#CBD5E1]'
            }`}
          >
            {/* Squad Index Number Top-Left */}
            <span className="absolute top-0.5 left-1 text-[8px] font-mono font-bold text-[#64748B] group-hover:text-[#94A3B8] leading-none">
              {index + 1}
            </span>

            {/* Combat Indicator Top-Right */}
            {isCombat && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#EF4444] rounded-full animate-ping shrink-0" />
            )}
            {isCombat && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#EF4444] rounded-full shrink-0" />
            )}

            {/* Main Center Icon */}
            <div className="flex items-center justify-center pb-1">
              {isDriving ? (
                <Car className="w-4 h-4 text-[#F59E0B]" />
              ) : isCombat ? (
                <Crosshair className="w-4 h-4 text-[#EF4444] animate-pulse" />
              ) : isMoving ? (
                <Footprints className="w-4 h-4 text-[#10B981]" />
              ) : (
                <Shield className="w-4 h-4 text-[#94A3B8] group-hover:text-white" />
              )}
            </div>

            {/* Member count indicator */}
            <div className="absolute bottom-1 left-0 right-0 flex justify-center">
              <span className="text-[7.5px] font-mono leading-none text-[#94A3B8] tracking-tighter">
                {aliveMembers}/{squad.members.length}
              </span>
            </div>

            {/* Health Bar along bottom edge */}
            <div className="absolute bottom-0 left-0 right-0 bg-[#1E293B] h-[2px] overflow-hidden">
              <div
                className={`h-full ${hpPct > 50 ? 'bg-[#10B981]' : hpPct > 20 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'}`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
};
