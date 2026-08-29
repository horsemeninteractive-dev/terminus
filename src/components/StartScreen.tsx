import React, { useEffect, useState, useCallback } from 'react';
import { soundService } from '../services/soundService';
import { MousePointer, Touchpad } from 'lucide-react';
import { DynamicAtmosphericBackground } from './DynamicAtmosphericBackground';
import { TerminusLogo } from './TerminusLogo';

interface StartScreenProps {
  onStart: () => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({ onStart }) => {
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
  });
  
  const [hasStarted, setHasStarted] = useState(false);

  // Dynamic input detection listener
  useEffect(() => {
    const handleTouch = () => setIsTouchDevice(true);
    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        setIsTouchDevice(true);
      } else if (e.pointerType === 'mouse') {
        setIsTouchDevice(false);
      }
    };

    window.addEventListener('touchstart', handleTouch, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouch);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  const triggerStart = useCallback(() => {
    if (hasStarted) return;
    setHasStarted(true);

    // Initialize audio context immediately on first gesture and start main menu music
    soundService.onUserStart();
    soundService.playStartGameImpact();

    // Trigger browser Fullscreen API
    if (document.documentElement && typeof document.documentElement.requestFullscreen === 'function') {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen request might be ignored in some iframe or security contexts
      });
    }

    onStart();
  }, [hasStarted, onStart]);

  // Keyboard shortcut support (Space, Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        triggerStart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerStart]);

  return (
    <div
      id="terminus-start-screen"
      onClick={triggerStart}
      className="relative w-screen h-screen bg-[#0A0A0A] overflow-hidden select-none font-tactical text-[#E8E8E8] cursor-pointer flex flex-col items-center justify-center"
    >
      {/* Dynamic Apocalyptic Day/Night Cycle Background */}
      <DynamicAtmosphericBackground />

      {/* Atmospheric Vignette & Darkness Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/60 to-[#0A0A0A]/75 pointer-events-none" />
      <div className="absolute inset-0 bg-radial from-transparent via-[#0A0A0A]/40 to-[#0A0A0A]/90 pointer-events-none" />
      <div className="absolute inset-0 bg-tactical-stripes opacity-20 pointer-events-none" />

      {/* Center Content: Logo, Subtitle, and Start Button */}
      <div className="relative z-20 flex flex-col items-center justify-center px-4 text-center">
        {/* Terminus Logo with prominent skull */}
        <TerminusLogo size="xl" showSubtitle={true} />

        {/* Click / Tap to Start Button */}
        <div className="mt-14 md:mt-16">
          <div className="group relative px-8 py-3.5 md:px-12 md:py-4 bg-[#0E1013]/90 hover:bg-[#1A2634] border border-[#B31217]/70 hover:border-[#EF4444] text-[#E8E8E8] hover:text-white transition-all clip-tactical-bracket surface-bevel shadow-[0_0_30px_rgba(179,18,23,0.3)]">
            <div className="flex items-center gap-3 md:gap-4">
              {isTouchDevice ? (
                <Touchpad className="w-5 h-5 text-[#EF4444] animate-bounce" />
              ) : (
                <MousePointer className="w-5 h-5 text-[#EF4444] animate-pulse" />
              )}
              
              <span className="font-heading font-black text-lg sm:text-2xl md:text-3xl tracking-[0.2em] uppercase text-white animate-pulse">
                {isTouchDevice ? 'TAP TO START' : 'CLICK TO START'}
              </span>

              <span className="text-[#EF4444] font-bold text-lg">»</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
