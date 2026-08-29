import React, { useEffect, useState } from 'react';
import { Crosshair, Globe as GlobeIcon, Radio } from 'lucide-react';
import { IFZ_IMAGES } from '../assets/images';

interface GlobeLoadingOverlayProps {
  progress?: number; // 0..1
  onComplete?: () => void;
  isReady?: boolean;
}

const RECON_TIPS = [
  'SELECT A DENSE URBAN SECTOR FOR MAXIMUM SCAVENGEABLE RESOURCES, OR A RURAL SUBURB FOR LOWER ZOMBIE CONCENTRATIONS.',
  'ESTABLISH YOUR FIRST HEADQUARTERS IN A LARGE MULTI-STORY FACILITY TO MAXIMIZE SURVIVOR HOUSING CAPACITY.',
  'ROADWAYS ALLOW FAST AUTOMOBILE TRANSIT AND TRADE CONVOYS BETWEEN COLONIES ACROSS THE REGION.',
  'ORBITAL SATELLITE RECONNAISSANCE CONTINUOUSLY MONITORS GLOBAL BIOLOGICAL OUTBREAK HOTSPOTS.',
  'SQUADS ASSIGNED TO SCAVENGING AUTOMATICALLY SEARCH STRUCTURES ROOM-BY-ROOM AND TRANSPORT SUPPLIES BACK TO BASE.',
];

/**
 * Orbital Satellite Reconnaissance Loading Screen.
 * Displayed immediately when the player presses "New Game" from the Main Menu,
 * providing instant tactical visual feedback with real-time telemetry while
 * satellite textures and 3D globe assets initialize.
 */
export const GlobeLoadingOverlay: React.FC<GlobeLoadingOverlayProps> = ({
  progress: externalProgress,
  onComplete,
  isReady = false,
}) => {
  const [internalProgress, setInternalProgress] = useState(0.12);
  const [tipIndex, setTipIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState('INITIALIZING ORBITAL SATELLITE RECONNAISSANCE...');

  useEffect(() => {
    if (externalProgress !== undefined) {
      setInternalProgress(externalProgress);
      return;
    }

    // Smooth progressive telemetry loading sequence
    const startTime = Date.now();
    const duration = 1400; // ~1.4 seconds smooth sequence

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(1, elapsed / duration);

      if (pct < 0.25) {
        setStatusMessage('INITIALIZING ORBITAL SATELLITE RECONNAISSANCE...');
      } else if (pct < 0.55) {
        setStatusMessage('STREAMING HIGH-RESOLUTION PLANETARY SATELLITE IMAGERY...');
      } else if (pct < 0.85) {
        setStatusMessage('TRIANGULATING CONTINENTAL BASINS & POPULATION SECTORS...');
      } else {
        setStatusMessage('ESTABLISHING TACTICAL SENSOR UPLINK...');
      }

      setInternalProgress(pct);

      if (pct >= 1) {
        clearInterval(timer);
        if (onComplete) {
          setTimeout(onComplete, 250);
        }
      }
    }, 30);

    return () => clearInterval(timer);
  }, [externalProgress, onComplete]);

  const currentProgress = externalProgress !== undefined ? externalProgress : internalProgress;
  const pct = Math.round(currentProgress * 100);

  return (
    <div className="fixed inset-0 z-[250] flex flex-col justify-between p-6 sm:p-10 bg-[#06080C] select-none font-tactical text-[#E8E8E8] animate-fade-in pointer-events-auto">
      {/* Apocalyptic Background Loading Artwork */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img
          src={IFZ_IMAGES.loadingTruck}
          alt="Orbital Satellite Recon"
          className="w-full h-full object-cover opacity-80 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06080C] via-[#06080C]/60 to-[#06080C]/80" />
      </div>

      {/* Top Title Banner */}
      <div className="relative z-10 flex items-center justify-between bg-[#0E1013]/95 border border-[#262F3D] px-4 py-2.5 clip-torn-header surface-bevel bg-tactical-steel shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-3.5 h-3.5 bg-[#10B981] animate-pulse clip-card-chip" />
          <div className="text-xs font-heading font-black tracking-widest uppercase text-[#E8E8E8]">
            TERMINUS // <span className="text-[#10B981]">ORBITAL RECONNAISSANCE UPLINK</span>
          </div>
        </div>
        <div className="text-xs text-[#8C9BAE] font-tech flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-[#10B981] animate-pulse" />
          <span>SATELLITE ARRAY: GLOBAL ACTIVE</span>
        </div>
      </div>

      {/* Center Target Telemetry & Radar Scope */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto text-center">
        <div className="relative flex items-center justify-center mb-6">
          <div className="w-56 h-56 rounded-full border border-[#10B981]/30 animate-ping pointer-events-none" />
          <div className="absolute w-44 h-44 rounded-full border-2 border-dashed border-[#10B981]/60 animate-spin" />
          <div className="absolute w-28 h-28 rounded-full border border-[#B31217]/50" />
          <div className="absolute flex flex-col items-center">
            <Crosshair className="w-10 h-10 text-[#10B981] animate-pulse mb-1.5" />
            <div className="text-[11px] text-[#10B981] font-heading font-black uppercase tracking-widest">
              ORBITAL SENSORS LOCKED
            </div>
            <div className="text-3xl font-display font-black text-white tracking-wide mt-0.5">
              1,750 KM
            </div>
            <div className="text-[10px] font-mono text-[#8C9BAE] tracking-widest uppercase mt-0.5">
              PLANETARY SURVEY ALTITUDE
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Loading Progress & Tip Box */}
      <div className="relative z-10 space-y-3 max-w-4xl mx-auto w-full">
        {/* Tactical Tip Banner with Controls */}
        <div className="bg-[#B31217] text-white px-4 py-2.5 flex items-center justify-between text-xs font-heading tracking-wide border border-[#EF4444] clip-tactical-bracket surface-bevel shadow-lg">
          <button
            onClick={() =>
              setTipIndex((prev) => (prev > 0 ? prev - 1 : RECON_TIPS.length - 1))
            }
            className="hover:text-black px-2 py-0.5 text-sm font-black transition-colors"
          >
            &lt;
          </button>
          <div className="text-center px-4 uppercase text-xs leading-relaxed font-heading">
            {RECON_TIPS[tipIndex]}
          </div>
          <button
            onClick={() =>
              setTipIndex((prev) => (prev < RECON_TIPS.length - 1 ? prev + 1 : 0))
            }
            className="hover:text-black px-2 py-0.5 text-sm font-black transition-colors"
          >
            &gt;
          </button>
        </div>

        {/* Red / Tactical Progress Bar */}
        <div className="space-y-1 bg-[#0E1013]/95 border border-[#262F3D] p-3 clip-tactical-bracket surface-bevel shadow-2xl">
          <div className="flex justify-between items-center text-xs font-tech font-bold text-[#E8E8E8]">
            <span>Calibrating Satellite Globe — {pct}%</span>
            <span className="text-[#10B981] uppercase tracking-wider">{statusMessage}</span>
          </div>
          <div className="w-full bg-[#0A0A0A] h-3.5 border border-[#262F3D] overflow-hidden p-0.5">
            <div
              className="bg-[#10B981] h-full transition-all duration-100"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
