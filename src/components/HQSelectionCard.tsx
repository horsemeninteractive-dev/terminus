import React from 'react';
import { Check } from 'lucide-react';
import { BuildingPolygon } from '../types/map';

interface HQSelectionCardProps {
  selectedBuilding: BuildingPolygon | null;
  onConfirmHQ: (bldg: BuildingPolygon) => void;
}

export const HQSelectionCard: React.FC<HQSelectionCardProps> = ({
  selectedBuilding,
  onConfirmHQ,
}) => {
  return (
    <div
      id="hq-selection-card"
      className="fixed bottom-4 md:bottom-11 left-1/2 -translate-x-1/2 z-40 pointer-events-auto w-[calc(100%-31rem)] min-w-[360px] max-w-3xl select-none"
    >
      {selectedBuilding ? (
        <button
          id="confirm-hq-btn"
          onClick={() => onConfirmHQ(selectedBuilding)}
          className="w-full py-3 bg-[#E8E8E8] hover:bg-[#CBD5E1] border-2 border-[#F8FAFC] text-[#0A0C0E] font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer animate-pulse clip-tactical-bracket surface-bevel"
        >
          <Check className="w-5 h-5 text-[#0A0C0E]" />
          <span>CONFIRM AS SETTLEMENT HEADQUARTERS</span>
        </button>
      ) : (
        <div className="py-3 px-4 text-center text-[11px] font-mono text-[#9ca3af] border-2 border-dashed border-[#2E3440] bg-[#0A0C0E]/95 backdrop-blur-md clip-tactical-bracket surface-bevel">
          CLICK A BUILDING IN THE SECTOR TO DESIGNATE IT AS COMMAND HQ
        </div>
      )}
    </div>
  );
};
