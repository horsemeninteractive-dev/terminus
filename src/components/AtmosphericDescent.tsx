import React, { useEffect, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { IFZ_IMAGES } from '../assets/images';

interface AtmosphericDescentProps {
  progress: number; // 0..1
  altitudeKm: number;
  zoneName: string;
  lat: number;
  lon: number;
  /** Real status line from the loading pipeline (e.g. "Checking local cache..."). */
  status?: string;
}

const LOADING_TIPS = [
  'IF YOU DECONSTRUCT AN ABANDONED BUILDING, IT WILL PROVIDE DIFFERENT RESOURCES DEPENDING ON THE MATERIALS IT IS MADE OF.',
  'SQUADS EQUIPPED WITH RANGED WEAPONS CAN GARRISON BUILDINGS FOR SUBSTANTIAL DEFENSIVE FIRING BONUSES.',
  'ZOMBIES ARE STRONGLY ATTRACTED TO GUNFIRE AND VEHICLE ENGINE NOISE DURING NIGHT HOURS.',
  'RESEARCH ANTIBIOTIC SYNTHESIS EARLY TO TREAT INFECTIONS IN THE FIELD BEFORE SURVIVORS TURN.',
  'AUTOMOBILE EXPEDITIONS EXTEND YOUR SCAVENGING RANGE ACROSS REAL-WORLD ROAD NETWORKS.',
];

/**
 * Single atmospheric-descent loading screen (Screenshot 957). Rendered at App
 * level so it persists across the Globe -> World transition: it stays up until
 * the world scene has actually built and drawn the map, then reveals the game.
 * All map fetch + render happens underneath this one overlay.
 */
export const AtmosphericDescent: React.FC<AtmosphericDescentProps> = ({
  progress,
  altitudeKm,
  zoneName,
  lat,
  lon,
  status,
}) => {
  const [tipIndex, setTipIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = IFZ_IMAGES.loadingTruck;
    if (img.complete) {
      const raf = requestAnimationFrame(() => {
        setImageLoaded(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      img.onload = () => setImageLoaded(true);
    }
  }, []);

  const pct = Math.round(progress * 100);
  const phaseLabel =
    status ||
    (progress < 0.3
      ? 'FETCHING DIGITAL ELEVATION MODEL...'
      : progress < 0.7
      ? 'TRIANGULATING OPENSTREETMAP ROADS & BUILDINGS...'
      : 'INITIALIZING SECTOR PERIMETER & SURVIVOR ROSTER...');

  return (
    <div className="fixed inset-0 z-[300] flex flex-col justify-between p-6 sm:p-10 bg-[#0A0A0A]">
      {/* Background Loading Artwork */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img
          src={IFZ_IMAGES.loadingTruck}
          alt="Loading"
          onLoad={() => setImageLoaded(true)}
          className={`w-full h-full object-cover scale-105 transition-opacity duration-700 ease-out ${
            imageLoaded ? 'opacity-90' : 'opacity-0'
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/45 to-[#0A0A0A]/70" />
      </div>

      {/* Top Title Banner */}
      <div className="relative z-10 flex items-center justify-between bg-[#0E1013]/95 border border-[#262F3D] px-4 py-2.5 clip-torn-header surface-bevel bg-tactical-steel">
        <div className="flex items-center gap-3">
          <div className="w-3.5 h-3.5 bg-[#B31217] animate-pulse clip-card-chip" />
          <div className="text-xs font-heading font-black tracking-widest uppercase text-[#E8E8E8]">
            TERMINUS // <span className="text-[#10B981]">{zoneName.toUpperCase()}</span>
          </div>
        </div>
        <div className="text-xs text-[#8C9BAE] font-tech">
          COORDINATES: {lat.toFixed(4)}°, {lon.toFixed(4)}°
        </div>
      </div>

      {/* Center Target Telemetry */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto text-center">
        <div className="relative flex items-center justify-center mb-6">
          <div className="w-48 h-48 border border-[#10B981]/40 animate-ping pointer-events-none" />
          <div className="absolute w-36 h-36 border border-dashed border-[#B31217] animate-spin" />
          <div className="absolute flex flex-col items-center">
            <Crosshair className="w-8 h-8 text-[#10B981] animate-pulse mb-1" />
            <div className="text-[10px] text-[#10B981] font-heading font-black uppercase tracking-widest">
              APPROACH
            </div>
            <div className="text-3xl font-display font-black text-white tracking-wide">
              {altitudeKm > 10 ? `${altitudeKm} KM` : `${Math.round(altitudeKm * 1000)} M`}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Loading Progress & Tip Box */}
      <div className="relative z-10 space-y-3 max-w-4xl mx-auto w-full">
        {/* Red Tip Banner with Arrows */}
        <div className="bg-[#B31217] text-white px-4 py-2.5 flex items-center justify-between text-xs font-heading tracking-wide border border-[#EF4444] clip-tactical-bracket surface-bevel">
          <button
            onClick={() =>
              setTipIndex((prev) => (prev > 0 ? prev - 1 : LOADING_TIPS.length - 1))
            }
            className="hover:text-black px-2 py-0.5 text-sm font-black transition-colors"
          >
            &lt;
          </button>
          <div className="text-center px-4 uppercase text-xs leading-relaxed font-heading">
            {LOADING_TIPS[tipIndex]}
          </div>
          <button
            onClick={() =>
              setTipIndex((prev) => (prev < LOADING_TIPS.length - 1 ? prev + 1 : 0))
            }
            className="hover:text-black px-2 py-0.5 text-sm font-black transition-colors"
          >
            &gt;
          </button>
        </div>

        {/* Red Progress Bar */}
        <div className="space-y-1 bg-[#0E1013]/90 border border-[#262F3D] p-2.5 clip-tactical-bracket surface-bevel">
          <div className="flex justify-between items-center text-xs font-tech font-bold text-[#E8E8E8]">
            <span>Loading Objects - {pct} %</span>
            <span className="text-[#10B981]">{phaseLabel}</span>
          </div>
          <div className="w-full bg-[#0A0A0A] h-3.5 border border-[#262F3D] overflow-hidden p-0.5">
            <div
              className="bg-[#B31217] h-full transition-all duration-75"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
