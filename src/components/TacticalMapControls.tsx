import React from 'react';
import { MapPin, Layers, Grid, Compass } from 'lucide-react';

interface TacticalMapControlsProps {
 statusText?: string;
 lat?: number;
 lon?: number;
 onCenterHQ?: () => void;
 onToggleOverlays?: () => void;
 onToggleGrid?: () => void;
 onResetNorth?: () => void;
 isGridActive?: boolean;
 isOverlaysActive?: boolean;
}

export const TacticalMapControls: React.FC<TacticalMapControlsProps> = ({
 statusText = 'Sector Active',
 lat = 52.094,
 lon = -1.920,
 onCenterHQ,
 onToggleOverlays,
 onToggleGrid,
 onResetNorth,
 isGridActive,
 isOverlaysActive,
}) => {
 return (
 <div
 id="tactical-map-controls-group"
 className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2 select-none pointer-events-auto"
 >
 {/* Status capsule pill */}
 <div className="flex items-center gap-2 px-3 py-1 bg-black/80 backdrop-blur-md border border-[#1E293B] text-[11px] font-mono text-[#CBD5E1] clip-card-chip">
 <span className="text-[#10B981] font-bold uppercase">{statusText}</span>
 <span className="text-[#475569]">|</span>
 <div className="flex items-center gap-1 text-[10px] text-[#94A3B8]">
 <MapPin className="w-3 h-3 text-[#E8E8E8]" />
 <span>{Math.abs(lat).toFixed(3)}° {lat >= 0 ? 'N' : 'S'}</span>
 <span>{Math.abs(lon).toFixed(3)}° {lon >= 0 ? 'E' : 'W'}</span>
 </div>
 </div>

 {/* Vertical circular utility buttons column */}
 <div className="flex flex-col items-center gap-1.5 bg-black/60 backdrop-blur-md p-1.5 border border-[#1E293B]">
 {/* 1. Center HQ Location Pin (Glowing Green) */}
 <button
 onClick={onCenterHQ}
 title="Center Camera on Colony HQ"
 className="w-8 h-8 bg-[#064E3B] hover:bg-[#047857] border border-[#10B981] flex items-center justify-center text-[#10B981] hover:text-white transition-all"
 >
 <MapPin className="w-4 h-4" />
 </button>

 {/* 2. Layer Stack / Overlays Toggle */}
 <button
 onClick={onToggleOverlays}
 title="Toggle Tactical Layer Overlays (Heatmaps / Fog of War)"
 className={`w-8 h-8 flex items-center justify-center border transition-all ${
 isOverlaysActive
 ? 'bg-[#1E293B] border-[#E8E8E8] text-[#E8E8E8]'
 : 'bg-[#0F172A] hover:bg-[#1E293B] border-[#334155] text-[#94A3B8] hover:text-white'
 }`}
 >
 <Layers className="w-4 h-4" />
 </button>

 {/* 3. Grid / Sector View Toggle */}
 <button
 onClick={onToggleGrid}
 title="Toggle Building Grid & Sector Zones"
 className={`w-8 h-8 flex items-center justify-center border transition-all ${
 isGridActive
 ? 'bg-[#1E293B] border-[#E8E8E8] text-[#E8E8E8]'
 : 'bg-[#0F172A] hover:bg-[#1E293B] border-[#334155] text-[#94A3B8] hover:text-white'
 }`}
 >
 <Grid className="w-4 h-4" />
 </button>

 {/* 4. Compass North Indicator */}
 <button
 onClick={onResetNorth}
 title="Reset Camera Orientation North (N)"
 className="w-8 h-8 bg-[#0F172A] hover:bg-[#1E293B] border border-[#334155] flex flex-col items-center justify-center text-[#94A3B8] hover:text-white transition-all text-[8px] font-bold"
 >
 <span className="text-[#EF4444] leading-none text-[7px]">▲</span>
 <span className="leading-none">N</span>
 </button>
 </div>
 </div>
 );
};
