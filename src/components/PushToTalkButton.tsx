import React from 'react';
import { Radio, Mic, Volume2 } from 'lucide-react';
import { soundEngine } from '../services/soundService';

interface PushToTalkButtonProps {
  unreadCount?: number;
  hasIncoming?: boolean;
  isInitialPending?: boolean;
  onClick: () => void;
  className?: string;
}

export const PushToTalkButton: React.FC<PushToTalkButtonProps> = ({
  unreadCount = 0,
  hasIncoming = false,
  isInitialPending = false,
  onClick,
  className = '',
}) => {
  const isAlerting = unreadCount > 0 || hasIncoming || isInitialPending;

  const handleClick = () => {
    soundEngine.playRadioChirp();
    onClick();
  };

  return (
    <div className="relative flex flex-col items-end">
      <button
        id="push-to-talk-btn"
        type="button"
        onClick={handleClick}
        title={
          isAlerting
            ? 'Incoming Radio Transmission! Click Push To Talk to listen.'
            : 'Safe Zones Radio Comms — Click Push To Talk to open terminal'
        }
        className={`group relative flex items-center justify-between gap-2.5 px-4 py-2 rounded-full font-display font-black text-xs uppercase tracking-wider transition-all duration-300 select-none shadow-xl cursor-pointer pointer-events-auto touch-manipulation active:scale-95 ${
          isAlerting
            ? 'bg-gradient-to-r from-[#047857] via-[#10B981] to-[#059669] text-[#042417] border-2 border-[#34D399] shadow-[0_0_25px_rgba(16,185,129,0.85)] animate-pulse ring-2 ring-[#10B981] ring-offset-2 ring-offset-black hover:brightness-110'
            : 'bg-[#062419]/90 hover:bg-[#064E3B] text-[#10B981] hover:text-white border-2 border-[#10B981]/70 hover:border-[#10B981] backdrop-blur-md shadow-[0_0_12px_rgba(16,185,129,0.25)]'
        } ${className}`}
      >
        {/* Icon & Live Signal Indicator */}
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
              isAlerting
                ? 'bg-[#042417] text-[#10B981]'
                : 'bg-[#10B981]/20 text-[#10B981] group-hover:bg-[#10B981] group-hover:text-black'
            }`}
          >
            {isAlerting ? (
              <Radio className="w-3.5 h-3.5 animate-bounce" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
          </div>

          {/* Text Label */}
          <div className="flex flex-col items-start leading-none text-left">
            <span className="font-heading font-black text-[11px] sm:text-xs tracking-widest uppercase">
              PUSH TO TALK
            </span>
            <span
              className={`text-[9px] font-mono font-bold tracking-normal ${
                isAlerting ? 'text-[#022c1b] underline' : 'text-emerald-400/80'
              }`}
            >
              {isAlerting ? 'INCOMING TRANSMISSION' : '104.20 MHz // COMMS'}
            </span>
          </div>
        </div>

        {/* Flashing Sonar Ping Wave & Badge if alerting */}
        {isAlerting && (
          <div className="relative flex items-center justify-center ml-1.5 shrink-0">
            <span className="absolute inline-flex h-6 w-6 rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="absolute inline-flex h-4 w-4 rounded-full bg-[#10B981] opacity-75 animate-pulse" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#022c1b] border-2 border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          </div>
        )}
      </button>
    </div>
  );
};
