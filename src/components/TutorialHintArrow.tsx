import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Flag } from 'lucide-react';

export type HintArrowSide = 'left' | 'right' | 'top' | 'bottom';

interface TutorialHintArrowProps {
  /** CSS selector of the UI affordance the arrow points at. */
  target: string;
  /** Short imperative label, e.g. "MUSTER FIRST SQUAD". */
  label: string;
  /** Optional one-line explanation under the label. */
  sub?: string;
  /** Which side of the target the chip sits on (chevron points back at it). */
  side?: HintArrowSide;
  /** Gap in px between the chip and the target's edge. */
  offset?: number;
  /** Caller-controlled visibility — typically "an active tutorial task wants this affordance". */
  active: boolean;
}

interface ArrowPos {
  top: number;
  left: number;
  visible: boolean;
}

const HIDDEN: ArrowPos = { top: 0, left: 0, visible: false };

/**
 * World-space tutorial affordance: a pulsing objective chip with a bouncing
 * chevron that floats beside a target HUD element (found by CSS selector).
 *
 * The chip re-measures on resize/scroll and on a short interval so it tracks
 * targets that appear/disappear or shift as the HUD reflows (e.g. the squad
 * selector strip hides itself when a squad is selected). It is fully
 * pointer-events-none — it can never block the click it is pointing at.
 */
export const TutorialHintArrow: React.FC<TutorialHintArrowProps> = ({
  target,
  label,
  sub,
  side = 'left',
  offset = 10,
  active,
}) => {
  const [pos, setPos] = useState<ArrowPos>(HIDDEN);

  useEffect(() => {
    if (!active) {
      setPos(HIDDEN);
      return;
    }

    const measure = () => {
      const el = document.querySelector(target);
      if (!el) {
        setPos(HIDDEN);
        return;
      }
      const rect = el.getBoundingClientRect();
      // display:none / detached ancestors report a zero rect — treat as hidden.
      if (rect.width === 0 && rect.height === 0) {
        setPos(HIDDEN);
        return;
      }
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      switch (side) {
        case 'right':
          setPos({ top: cy, left: rect.right + offset, visible: true });
          break;
        case 'top':
          setPos({ top: rect.top - offset, left: cx, visible: true });
          break;
        case 'bottom':
          setPos({ top: rect.bottom + offset, left: cx, visible: true });
          break;
        case 'left':
        default:
          setPos({ top: cy, left: rect.left - offset, visible: true });
          break;
      }
    };

    measure();
    // The HUD reflows often (squads added/selected, modals open) — poll rather
    // than trying to observe every possible trigger.
    const intervalId = window.setInterval(measure, 300);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, target, side, offset]);

  if (!active || !pos.visible) return null;

  const Chevron = {
    left: ChevronRight,
    right: ChevronLeft,
    top: ChevronDown,
    bottom: ChevronUp,
  }[side];

  // Tailwind translate classes: shift the chip so its near edge (the chevron)
  // anchors to the measured point, plus vertical/horizontal centering.
  const translate = {
    left: '-translate-x-full -translate-y-1/2',
    right: '-translate-y-1/2',
    top: '-translate-x-1/2 -translate-y-full',
    bottom: '-translate-x-1/2',
  }[side];

  return (
    <div
      className={`fixed z-[60] pointer-events-none select-none flex items-center gap-0 ${translate}`}
      style={{ top: pos.top, left: pos.left }}
      role="status"
      aria-live="polite"
      aria-label={`Objective: ${label}`}
    >
      {/* Objective chip */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border-2 border-[#10B981] bg-[#04120c]/95 shadow-[0_0_16px_rgba(16,185,129,0.5)] animate-pulse max-w-[220px]">
        <Flag className="w-3.5 h-3.5 min-w-[14px] text-[#10B981]" />
        <div className="leading-tight">
          <div className="text-[10px] font-mono font-bold tracking-wider text-[#34D399] uppercase">
            {label}
          </div>
          {sub && (
            <div className="text-[9px] font-mono text-[#6EE7B7]/80">{sub}</div>
          )}
        </div>
      </div>
      {/* Bouncing chevron pointing at the target */}
      <Chevron className="w-5 h-5 min-w-[20px] text-[#10B981] animate-bounce drop-shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
    </div>
  );
};
