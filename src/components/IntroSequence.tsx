import React, { useEffect, useState, useCallback, useRef } from 'react';
import { soundService } from '../services/soundService';
import { TerminusLogo } from './TerminusLogo';
import hiLogo from '../assets/images/HILogo.png';

interface IntroSequenceProps {
  onComplete: () => void;
}

interface IntroLogoItem {
  id: string;
  title: string;
  renderLogo: () => React.ReactNode;
}

export const IntroSequence: React.FC<IntroSequenceProps> = ({ onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const isFinishedRef = useRef<boolean>(false);

  const handleFinish = useCallback(() => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;
    onComplete();
  }, [onComplete]);

  // Keyboard shortcut (Escape, Space, Enter) or Click to skip immediately
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleFinish();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFinish]);

  const logoSequence: IntroLogoItem[] = [
    {
      id: 'developer',
      title: 'HORSEMEN INTERACTIVE',
      renderLogo: () => (
        <div className="relative w-40 h-40 md:w-52 md:h-52 flex items-center justify-center">
          {/* Official Horsemen Interactive logo */}
          <img
            src={hiLogo}
            alt="Horsemen Interactive"
            className="w-full h-full object-contain drop-shadow-[0_0_24px_rgba(179,18,23,0.45)]"
          />
        </div>
      ),
    },
    {
      id: 'threejs',
      title: 'THREE.JS',
      renderLogo: () => (
        <div className="relative w-32 h-32 md:w-40 md:h-40 flex items-center justify-center">
          {/* Official Three.js Isometric Triangle Mesh Logo */}
          <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
            <polygon
              points="50,12 88,78 12,78"
              stroke="#FFFFFF"
              strokeWidth="3"
              fill="rgba(255,255,255,0.05)"
              className="drop-shadow-[0_0_16px_rgba(255,255,255,0.35)]"
            />
            <line x1="50" y1="12" x2="50" y2="56" stroke="#FFFFFF" strokeWidth="2.5" />
            <line x1="12" y1="78" x2="50" y2="56" stroke="#FFFFFF" strokeWidth="2.5" />
            <line x1="88" y1="78" x2="50" y2="56" stroke="#FFFFFF" strokeWidth="2.5" />
            <polygon points="50,12 50,56 12,78" fill="rgba(255,255,255,0.12)" />
            <polygon points="50,12 88,78 50,56" fill="rgba(255,255,255,0.22)" />
            <polygon points="12,78 88,78 50,56" fill="rgba(255,255,255,0.06)" />
          </svg>
        </div>
      ),
    },
    {
      id: 'osm',
      title: 'OPENSTREETMAP',
      renderLogo: () => (
        <div className="relative w-32 h-32 md:w-40 md:h-40 flex items-center justify-center">
          {/* Official OpenStreetMap Magnifying Glass over Vector Map Tile */}
          <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
            {/* Rounded Map Tile Container */}
            <rect
              x="12"
              y="12"
              width="76"
              height="76"
              rx="16"
              fill="#0F172A"
              stroke="#7EBC6F"
              strokeWidth="2.5"
              className="drop-shadow-[0_0_16px_rgba(126,188,111,0.5)]"
            />
            {/* Green terrain / park sector */}
            <path
              d="M12 28 C12 19.16 19.16 12 28 12 L52 12 L38 48 L12 40 Z"
              fill="#7EBC6F"
              fillOpacity="0.4"
            />
            {/* Water sector */}
            <path
              d="M56 88 L88 88 C88 88 88 64 88 56 L50 56 Z"
              fill="#38BDF8"
              fillOpacity="0.35"
            />
            {/* Main Highway Curve */}
            <path
              d="M 12 60 Q 45 55 58 20 T 88 14"
              stroke="#FFFFFF"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 28 88 Q 52 68 88 60"
              stroke="#F59E0B"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            {/* OSM Magnifying Glass */}
            <circle
              cx="58"
              cy="48"
              r="17"
              stroke="#7EBC6F"
              strokeWidth="3.5"
              fill="#0E1013"
              fillOpacity="0.85"
            />
            <line
              x1="70"
              y1="60"
              x2="84"
              y2="74"
              stroke="#7EBC6F"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      ),
    },
    {
      id: 'react',
      title: 'REACT',
      renderLogo: () => (
        <div className="relative w-32 h-32 md:w-40 md:h-40 flex items-center justify-center">
          {/* Official React Atom Logo */}
          <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
            <circle
              cx="50"
              cy="50"
              r="6.5"
              fill="#61DAFB"
              className="drop-shadow-[0_0_12px_rgba(97,218,251,0.9)]"
            />
            <ellipse
              cx="50"
              cy="50"
              rx="38"
              ry="14.5"
              stroke="#61DAFB"
              strokeWidth="2.5"
              fill="none"
              className="drop-shadow-[0_0_8px_rgba(97,218,251,0.5)]"
            />
            <ellipse
              cx="50"
              cy="50"
              rx="38"
              ry="14.5"
              stroke="#61DAFB"
              strokeWidth="2.5"
              fill="none"
              transform="rotate(60 50 50)"
            />
            <ellipse
              cx="50"
              cy="50"
              rx="38"
              ry="14.5"
              stroke="#61DAFB"
              strokeWidth="2.5"
              fill="none"
              transform="rotate(120 50 50)"
            />
          </svg>
        </div>
      ),
    },
    {
      id: 'vite',
      title: 'VITE',
      renderLogo: () => (
        <div className="relative w-32 h-32 md:w-40 md:h-40 flex items-center justify-center">
          {/* Official Vite Lightning Bolt on Triangular Gradient Shield */}
          <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="viteBg" x1="10%" y1="0%" x2="90%" y2="100%">
                <stop offset="0%" stopColor="#41D1FF" />
                <stop offset="100%" stopColor="#BD34FE" />
              </linearGradient>
              <linearGradient id="viteBolt" x1="20%" y1="0%" x2="80%" y2="100%">
                <stop offset="0%" stopColor="#FFEA83" />
                <stop offset="100%" stopColor="#FFDD35" />
              </linearGradient>
            </defs>
            <path
              d="M50 14 L82 28 L50 88 L18 28 Z"
              fill="url(#viteBg)"
              className="drop-shadow-[0_0_18px_rgba(189,52,254,0.6)]"
            />
            <path
              d="M53 22 L36 50 L47 50 L41 74 L64 44 L52 44 Z"
              fill="url(#viteBolt)"
              stroke="#FFA800"
              strokeWidth="0.75"
              className="drop-shadow-[0_0_10px_rgba(255,221,53,0.9)]"
            />
          </svg>
        </div>
      ),
    },
    {
      id: 'tailwind',
      title: 'TAILWIND CSS',
      renderLogo: () => (
        <div className="relative w-32 h-32 md:w-40 md:h-40 flex items-center justify-center">
          {/* Official Tailwind CSS Twin Crest Wave Vector Logo */}
          <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
            <path
              d="M26 44 C29 32 37 28 44 32 C50 36 53 45 59 47 C63 48 68 45 74 38 C70 50 62 54 55 50 C49 46 46 37 40 35 C35 34 30 38 26 44 Z"
              fill="#38BDF8"
              className="drop-shadow-[0_0_14px_rgba(56,189,248,0.7)]"
            />
            <path
              d="M16 64 C19 52 27 48 34 52 C40 56 43 65 49 67 C53 68 58 65 64 58 C60 70 52 74 45 70 C39 66 36 57 30 55 C25 54 20 58 16 64 Z"
              fill="#38BDF8"
              className="drop-shadow-[0_0_14px_rgba(56,189,248,0.7)]"
            />
          </svg>
        </div>
      ),
    },
    {
      id: 'soundscape',
      title: 'WEB AUDIO API',
      renderLogo: () => (
        <div className="relative w-32 h-32 md:w-40 md:h-40 flex items-center justify-center">
          {/* Web Audio API Waveform Oscilloscope */}
          <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="40" stroke="#262F3D" strokeWidth="2" />
            <circle
              cx="50"
              cy="50"
              r="34"
              stroke="#B31217"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <line x1="24" y1="50" x2="24" y2="50" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="31" y1="42" x2="31" y2="58" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="38" y1="34" x2="38" y2="66" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="45" y1="24" x2="45" y2="76" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="52" y1="16" x2="52" y2="84" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="59" y1="24" x2="59" y2="76" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="66" y1="34" x2="66" y2="66" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="73" y1="42" x2="73" y2="58" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="80" y1="50" x2="80" y2="50" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
        </div>
      ),
    },
    {
      id: 'terminus',
      title: '',
      renderLogo: () => (
        <div className="flex flex-col items-center justify-center">
          <TerminusLogo size="xl" showSubtitle={true} />
        </div>
      ),
    },
  ];

  const currentLogo = logoSequence[currentIndex];

  useEffect(() => {
    soundService.playLogoWhoosh();
  }, [currentIndex]);

  const handleNextLogo = () => {
    if (currentIndex < logoSequence.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      handleFinish();
    }
  };

  return (
    <div
      id="terminus-intro-sequence"
      onClick={handleFinish}
      className="relative w-screen h-screen bg-[#050607] overflow-hidden select-none font-tactical text-[#E8E8E8] flex items-center justify-center cursor-pointer"
    >
      <div className="absolute inset-0 bg-radial from-[#12161D]/40 via-[#0A0A0A]/90 to-[#040405] pointer-events-none" />

      {/* Center Animated Logo Display with guaranteed CSS Keyframe Cycle & onAnimationEnd */}
      {currentLogo && (
        <div
          key={currentLogo.id}
          onAnimationEnd={handleNextLogo}
          className="animate-logo-cycle relative z-20 flex flex-col items-center justify-center gap-6"
        >
          <div>{currentLogo.renderLogo()}</div>
          {Boolean(currentLogo.title) && (
            <h2 className="text-2xl md:text-3xl font-display font-black tracking-widest uppercase text-white drop-shadow-md">
              {currentLogo.title}
            </h2>
          )}
        </div>
      )}
    </div>
  );
};
