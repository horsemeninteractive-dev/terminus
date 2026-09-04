import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { soundService } from '../services/soundService';
import { TerminusLogo } from './TerminusLogo';
import hiLogo from '../assets/images/HILogo.png';
import menuBgNight from '../assets/images/main_menu_night.jpg';
import menuBgDusk from '../assets/images/main_menu_dusk.jpg';

interface EmberSpec {
  left: number;
  size: number;
  dur: number;
  delay: number;
  drift: number;
  peak: number;
  colour: string;
}

// Seeded field of drifting infection embers so the backdrop is lively without
// regenerating random values on every credits tick. Warm ember hues echo the
// burning-city art and the #EF4444 / #B31217 HUD accents.
const EMBER_COLOURS = ['#fbbf24', '#fb923c', '#ef4444', '#f87171', '#f59e0b', '#fca5a5'];
function makeEmbers(count: number, seed: number): EmberSpec[] {
  const out: EmberSpec[] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    out.push({
      left: rnd() * 100,
      size: 2 + rnd() * 4,
      dur: 9 + rnd() * 14,
      delay: -(rnd() * 20),
      drift: -60 + rnd() * 120,
      peak: 0.35 + rnd() * 0.55,
      colour: EMBER_COLOURS[Math.floor(rnd() * EMBER_COLOURS.length)],
    });
  }
  return out;
}
const EMBERS = makeEmbers(34, 20260903);

interface CreditSection {
  section: string;
  items: string[];
}

interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Cinematic timed credits sequence — ported from the previous-project
 * CreditsScreen so it looks and acts the same: the TERMINUS logo holds,
 * then credit sections fly in from the left while their names cycle
 * beneath, the last name of each section flies out right, and once all
 * sections have played the sequence loops back to the logo. The back
 * arrow (top-left) or ESC dismisses it.
 */
// The studio & production roster for Terminus: the real AI engineering stack
// that built the game, the Freebuff agent platform it was developed on, and
// the open web technologies powering the simulation.
const creditsData: CreditSection[] = [
  { section: 'A HORSEMEN INTERACTIVE PRODUCTION', items: [] },
  { section: 'ASSOCIATION', items: ['Horsemen Interactive'] },
  { section: 'CREATIVE DIRECTOR', items: ['Daniel Stone'] },
  {
    section: 'AI ENGINEERING',
    items: ['Google Gemini 3.8 Flash', 'Deepseek v4 Flash', 'ChatGPT 5.6 Luna', 'Claude Sonnet 5'],
  },
  { section: 'DEVELOPED WITH', items: ['Freebuff'] },
  {
    section: 'WEB TECHNOLOGIES',
    items: [
      'React & Three.js',
      'TypeScript & Vite',
      'Tailwind CSS & Lucide',
      'Earcut Geometry',
      'Web Audio API',
      'OpenStreetMap & Overpass API',
    ],
  },
  {
    section: 'QUALITY ASSURANCE',
    items: ['Aidan Godliman', 'Charlotte Thomas', 'Nikita Komkov', 'Brandon Corr', 'Cosmic Aspen'],
  },
  {
    section: 'THANKS',
    items: ['The OpenStreetMap Community', 'The Terminus Playtest Community'],
  },
];

export const CreditsModal: React.FC<CreditsModalProps> = ({ isOpen, onClose }) => {

  const [currentSectionIndex, setCurrentSectionIndex] = useState(-1); // -1 = logo
  const [currentNameIndex, setCurrentNameIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const exitTimerRef = useRef<number | null>(null);

  const LOGO_ANIMATION_DURATION = 5000;
  const CREDIT_HOLD_DURATION = 4500; // Time item stays on screen before advancing
  const EXIT_ANIMATION_DURATION = 500; // Duration of the exit animations

  // Reset the sequence each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setCurrentSectionIndex(-1);
      setCurrentNameIndex(0);
      setIsExiting(false);
      soundService.playPanelOpen();
    }
  }, [isOpen]);

  // Cleanup any pending exit timer when the component unmounts.
  useEffect(() => {
    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  // ESC dismisses the credits.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || isExiting) return; // Don't start a new timer while exiting

    let timerDuration: number;

    // Handle logo state
    if (currentSectionIndex === -1) {
      timerDuration = LOGO_ANIMATION_DURATION;
    } else {
      // Handle end of credits loop
      if (currentSectionIndex >= creditsData.length) {
        setCurrentSectionIndex(-1);
        setCurrentNameIndex(0);
        return; // Early exit to restart the loop
      }
      timerDuration = CREDIT_HOLD_DURATION;
    }

    const timer = setTimeout(() => {
      if (currentSectionIndex === -1) {
        // Transition from logo to first credit
        setCurrentSectionIndex(0);
        setCurrentNameIndex(0);
      } else {
        // Normal credit advancement
        const currentSection = creditsData[currentSectionIndex];
        const isLastName =
          currentSection.items.length === 0 ||
          currentNameIndex === currentSection.items.length - 1;

        if (isLastName) {
          // Trigger exit animation for both section and last name
          setIsExiting(true);
          exitTimerRef.current = window.setTimeout(() => {
            setIsExiting(false);
            setCurrentSectionIndex((prev) => prev + 1);
            setCurrentNameIndex(0);
            exitTimerRef.current = null;
          }, EXIT_ANIMATION_DURATION);
        } else {
          // Just advance to the next name in the same section
          setCurrentNameIndex((prev) => prev + 1);
        }
      }
    }, timerDuration);

    return () => clearTimeout(timer);
  }, [currentSectionIndex, currentNameIndex, isExiting, creditsData.length, isOpen]);

  const handleClose = () => {
    soundService.playPanelClose();
    onClose();
  };

  if (!isOpen) return null;

  const currentSectionData =
    currentSectionIndex >= 0 && currentSectionIndex < creditsData.length
      ? creditsData[currentSectionIndex]
      : null;
  const currentName = currentSectionData?.items[currentNameIndex];
  const hasItems = !!currentSectionData && currentSectionData.items.length > 0;
  const isLastName =
    !!hasItems && currentNameIndex === (currentSectionData?.items.length ?? 0) - 1;

  return (
    <div className="fixed inset-0 z-[120] overflow-hidden select-none">
      {/* Cinematic backdrop: slow Ken Burns drift over the AI city horizons.
          The night layer is the dark base; the dusk layer breathes over it, so
          the skyline never sits still while credits play. */}
      <div className="absolute inset-0 overflow-hidden bg-[#04060A]">
        {/* One shared slow zoom so both horizon layers stay perfectly aligned */}
        <div className="absolute inset-0 animate-credits-kenburns will-change-transform">
          {/* Night base */}
          <img
            src={menuBgNight}
            alt=""
            aria-hidden
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          {/* Dusk layer breathing over the night base */}
          <img
            src={menuBgDusk}
            alt=""
            aria-hidden
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center animate-credits-dusk"
          />
        </div>
      </div>

      {/* Tactical grid faintly over the skyline */}
      <div className="absolute inset-0 bg-tactical-steel opacity-20" />
      <div className="absolute inset-0 bg-tactical-stripes opacity-15" />

      {/* Readability veils: centre stays clearest so section/name text pops;
          edges and the very top/bottom carry the vignette. */}
      <div className="absolute inset-0 bg-[#04060A]/25" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#03050A]/80 via-transparent to-[#03050A]/85" />
      <div className="absolute inset-0 bg-radial from-transparent via-[#0A0F16]/35 to-[#03050A]/90" />

      {/* Drifting infection embers float above the veils, below the text */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        {EMBERS.map((e, i) => (
          <span
            key={i}
            className="ember-particle"
            style={
              {
                '--left': `${e.left}%`,
                '--size': `${e.size}px`,
                '--dur': `${e.dur}s`,
                '--delay': `${e.delay}s`,
                '--drift': `${e.drift}px`,
                '--peak': String(e.peak),
                '--colour': e.colour,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Screen body — mirrors the reference credits screen layout */}
      <div className="relative flex flex-col h-full p-4 md:p-8 animate-fade-in overflow-hidden">
        <button
          id="back_credits"
          onClick={handleClose}
          aria-label="Back"
          className="absolute top-4 left-4 md:top-8 md:left-8 text-[#64748B] hover:text-white transition-colors z-20"
        >
          <ArrowLeft className="w-12 h-12" />
        </button>

        <div className="flex-grow flex items-center justify-center relative">
          {/* LOGO */}
          {currentSectionIndex === -1 && (
            <div key="logo-step" className="text-center animate-logo-fade flex flex-col items-center justify-center">
              <TerminusLogo size="xl" showSubtitle={true} />
            </div>
          )}

          {/* SECTION */}
          {currentSectionData && (
            <div
              key={`section-${currentSectionIndex}`}
              className={`absolute inset-x-0 ${
                currentSectionIndex === 0 ? 'top-1/2 -translate-y-1/2' : 'bottom-1/2 mb-4'
              } text-center ${
                isExiting ? 'animate-fly-out-left' : 'animate-fly-in-left'
              }`}
            >
              {currentSectionIndex === 0 && (
                <img
                  src={hiLogo}
                  alt="Horsemen Interactive"
                  className="h-36 md:h-48 object-contain mx-auto mb-6 drop-shadow-[0_0_30px_rgba(179,18,23,0.6)]"
                />
              )}
              <h2 className="text-4xl md:text-5xl font-heading font-bold tracking-[0.08em] text-[#EF4444]">
                {currentSectionData.section}
              </h2>
            </div>
          )}

          {/* NAME */}
          {currentName && (
            <div
              key={`name-${currentSectionIndex}-${currentNameIndex}`}
              className={`absolute inset-x-0 top-1/2 mt-4 text-center ${
                isExiting && isLastName ? 'animate-fly-out-right' : 'animate-name-cycle'
              }`}
            >
              <p className="text-3xl md:text-4xl font-tactical font-light text-[#D7DEE8]">
                {currentName}
              </p>
            </div>
          )}

          {/* Sections with no items animate out cleanly too */}
          {currentSectionData && !hasItems && isExiting && (
            <div
              key={`empty-exit-${currentSectionIndex}`}
              className="absolute text-center animate-fly-out-right"
            />
          )}
        </div>

        <div className="text-center mt-4 flex-shrink-0 pb-2">
          <p className="text-lg font-tactical text-[#64748B]">
            © 2026 Horsemen Interactive
          </p>
        </div>
      </div>
    </div>
  );
};
