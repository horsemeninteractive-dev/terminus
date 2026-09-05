import React from 'react';
import {
  Radio,
  X,
  MapPin,
  Swords,
  Package,
  Footprints,
  Undo2,
  AlertTriangle,
  CheckCircle2,
  Route,
} from 'lucide-react';
import { SettlementState } from '../types/settlement';
import { TacticalSquadUnit } from '../types/combat';
import { ExpeditionSite } from '../types/expedition';
import { expeditionPhaseLabel, isAntennaOperational } from '../services/expeditionService';

interface ExpeditionModalProps {
  isOpen: boolean;
  onClose: () => void;
  settlement: SettlementState;
  squads: TacticalSquadUnit[];
  selectedSquadId: string | null;
  onDispatch: (siteId: string, squadId: string) => void;
  onRecall: (squadId: string) => void;
}

const TIER_COLOR: Record<ExpeditionSite['threatTier'], string> = {
  low: 'text-[#4ADE80]',
  medium: 'text-[#FBBF24]',
  high: 'text-[#F87171]',
};

const PHASE_ICON: Record<string, React.ReactNode> = {
  travel_out: <Route className="w-3.5 h-3.5" />,
  travel_back: <Undo2 className="w-3.5 h-3.5" />,
  combat: <Swords className="w-3.5 h-3.5" />,
  scavenging: <Package className="w-3.5 h-3.5" />,
  idle: <Footprints className="w-3.5 h-3.5" />,
};

export const ExpeditionModal: React.FC<ExpeditionModalProps> = ({
  isOpen,
  onClose,
  settlement,
  squads,
  selectedSquadId,
  onDispatch,
  onRecall,
}) => {
  if (!isOpen) return null;

  const antennaUp = isAntennaOperational(settlement);
  const sites = settlement.expeditions?.sites || [];
  const selectedSquad = squads.find((s) => s.squadId === selectedSquadId) || null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[560px] max-h-[85vh] overflow-y-auto bg-[#0B1220] border border-[#3B4A63] rounded-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#243349] bg-[#0E1728]">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#A78BFA]" />
            <span className="font-heading font-bold text-[12px] text-[#DDD6FE] uppercase tracking-wider">Expeditions</span>
            <span className="text-[9px] font-mono text-[#64748B] uppercase">Off-Map Scavenging · Antenna</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {/* Antenna status */}
          <div className={`p-2.5 rounded border flex flex-col gap-1 ${antennaUp ? 'bg-[#16102A] border-[#7C3AED]/60' : 'bg-[#1A1213] border-[#4A1C20]'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-heading font-bold text-[10px] uppercase ${antennaUp ? 'text-[#C4B5FD]' : 'text-[#FCA5A5]'}`}>
                {antennaUp ? 'Antenna Online — Areas Revealed' : 'No Antenna Online'}
              </span>
              {antennaUp ? <CheckCircle2 className="w-4 h-4 text-[#A78BFA]" /> : <AlertTriangle className="w-4 h-4 text-[#F87171]" />}
            </div>
            <p className="text-[9px] font-mono text-[#94A3B8]">
              {antennaUp
                ? `${sites.length} off-map scavenging areas detected within broadcast range.`
                : 'Build and staff an Antenna (Basic Antenna research) to reveal off-map expedition areas.'}
            </p>
          </div>

          {/* Expedition rules */}
          <div className="flex items-start gap-1.5 px-1 text-[9px] font-mono text-[#64748B] leading-snug">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-[#FBBF24]" />
            <span>
              A dispatched squad travels out, fights the garrison, then scavenges slowly. When the backpack fills it
              <span className="text-[#FBBF24]"> waits at the site — it never returns on its own</span>. Issue a manual
              recall to bring the haul home.
            </span>
          </div>

          {/* Site list */}
          <div className="flex flex-col gap-2">
            {sites.length === 0 && (
              <div className="text-center py-6 text-[11px] font-mono text-[#64748B]">
                No expedition areas yet — the Antenna reveals them.
              </div>
            )}
            {sites.map((site) => {
              const assigned = squads.find((s) => s.squadId === site.assignedSquadId);
              const dispatchable =
                antennaUp &&
                !site.assignedSquadId &&
                !site.exhausted &&
                !!selectedSquad &&
                !selectedSquad.onExpedition &&
                site.revealed;
              return (
                <div key={site.id} className="p-2.5 rounded border border-[#243349] bg-[#0E1728] flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[#A78BFA]">{PHASE_ICON[site.phase]}</span>
                      <span className="font-heading font-bold text-[11px] text-[#E8E8E8] truncate">{site.name}</span>
                      <span className={`text-[8px] font-mono font-bold uppercase ${TIER_COLOR[site.threatTier]}`}>
                        {site.threatTier}
                      </span>
                    </div>
                    {site.assignedSquadId && (
                      <span className="text-[9px] font-mono font-bold text-[#6EE7B7] uppercase shrink-0">
                        {expeditionPhaseLabel(site.phase)} · {assigned?.name || 'Squad'}
                      </span>
                    )}
                    {!site.assignedSquadId && site.exhausted && (
                      <span className="text-[9px] font-mono text-[#475569] uppercase shrink-0">Exhausted</span>
                    )}
                  </div>

                  <p className="text-[9px] font-mono text-[#718096] leading-snug">{site.description}</p>

                  <div className="flex items-center gap-3 text-[9px] font-mono text-[#94A3B8]">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {site.distanceKm} km
                    </span>
                    <span className="flex items-center gap-1">
                      <Swords className="w-3 h-3" /> {Math.ceil(site.defendersRemaining / 35)} infected
                    </span>
                    <span className="flex items-center gap-1">
                      <Package className="w-3 h-3" /> {site.lootRemaining} loot {site.lootRemaining === 1 ? 'item' : 'items'}
                    </span>
                    {site.cleared && <span className="text-[#4ADE80]">CLEARED</span>}
                    {site.fullWarned && <span className="text-[#FBBF24]">BACKPACK FULL</span>}
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-0.5">
                    {site.assignedSquadId && (
                      <button
                        onClick={() => onRecall(site.assignedSquadId!)}
                        disabled={site.phase === 'travel_back'}
                        className="px-3 py-1 bg-[#7C2D12] hover:bg-[#9A3412] disabled:bg-[#1A2230] disabled:text-[#475569] disabled:cursor-not-allowed border border-[#EA580C]/50 disabled:border-[#243349] rounded text-[9px] font-heading font-bold text-[#FED7AA] uppercase transition-colors"
                      >
                        {site.phase === 'travel_back' ? 'RETURNING…' : 'RECALL SQUAD'}
                      </button>
                    )}
                    {!site.assignedSquadId && !site.exhausted && (
                      <button
                        onClick={() => selectedSquad && onDispatch(site.id, selectedSquad.squadId)}
                        disabled={!dispatchable}
                        title={!selectedSquad ? 'Select a squad first' : selectedSquad.onExpedition ? 'Selected squad is away' : ''}
                        className="px-3 py-1 bg-[#065F46] hover:bg-[#047857] disabled:bg-[#1A2230] disabled:text-[#475569] disabled:cursor-not-allowed border border-[#10B981]/50 disabled:border-[#243349] rounded text-[9px] font-heading font-bold text-[#A7F3D0] uppercase transition-colors"
                      >
                        DISPATCH {selectedSquad ? selectedSquad.name.toUpperCase() : ''}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};