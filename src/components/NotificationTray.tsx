import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Crosshair, Info, X } from 'lucide-react';
import type { TacticalAlert } from './TacticalAlertStream';

export type ToastKind = 'success' | 'info' | 'warn' | 'danger';

export interface ToastItem {
  id: number;
  title: string;
  desc: string;
  type: ToastKind;
  onClick?: () => void;
}

interface TrayRow {
  id: string;
  title: string;
  desc: string;
  type: ToastKind;
  onClick?: () => void;
}

interface NotificationTrayProps {
  alerts: TacticalAlert[];
  toasts: ToastItem[];
  /** Called with the `alert.id` when a tactical alert's dismiss X is clicked. */
  onDismissAlert: (id: string) => void;
  /** Called with the `toast.id` when a toast's dismiss X is clicked. */
  onDismissToast: (id: number) => void;
}

const LEAVE_MS = 320;

/**
 * Unified bottom-left notification tray. Merges the persistent tactical alert
 * stream and the queued toast list into one coordinated stack. Every row animates
 * in on entrance (.animate-notify-in) and exits smoothly (clear + slide up) on
 * dismissal or auto-hide, so the pile collapses fluidly instead of rows blinking.
 */
export const NotificationTray: React.FC<NotificationTrayProps> = ({
  alerts,
  toasts,
  onDismissAlert,
  onDismissToast,
}) => {
  const [rows, setRows] = useState<TrayRow[]>([]);
  const [leaving, setLeaving] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, number>>({});
  const rowsRef = useRef<TrayRow[]>([]);
  const setRowsAndMirror = (fn: (prev: TrayRow[]) => TrayRow[]) => {
    setRows((prev) => {
      const next = fn(prev);
      rowsRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    return () => {
      Object.keys(timers.current).forEach((id) => window.clearTimeout(timers.current[id]));
    };
  }, []);

  // Build the full desired row set: tactical alerts then queued toasts.
  const desired = useMemo(() => {
    const alertRows: TrayRow[] = alerts.slice(0, 5).map((a) => ({
      id: `alert:${a.id}`,
      title: a.title,
      desc: a.desc,
      type: a.type,
      onClick: a.onClick,
    }));
    const toastRows: TrayRow[] = toasts.map((t) => ({
      id: `toast:${t.id}`,
      title: t.title,
      desc: t.desc,
      type: t.type,
      onClick: t.onClick,
    }));
    return { alertRows, toastRows };
  }, [alerts, toasts]);

  const scheduleLeave = (id: string) => {
    if (timers.current[id]) return;
    timers.current[id] = window.setTimeout(() => {
      setRowsAndMirror((prev) => prev.filter((r) => r.id !== id));
      setLeaving((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete timers.current[id];
      if (id.startsWith('toast:')) {
        onDismissToast(Number(id.slice('toast:'.length)));
      }
    }, LEAVE_MS);
    requestAnimationFrame(() => {
      setLeaving((prev) => ({ ...prev, [id]: true }));
    });
  };

  // Diff desired rows against the currently rendered set.
  useEffect(() => {
    const { alertRows, toastRows } = desired;
    const desiredIds = new Set<string>([...alertRows, ...toastRows].map((r) => r.id));
    const current = rowsRef.current;
    const curIds = new Set(current.map((r) => r.id));

    current.forEach((r) => {
      if (!desiredIds.has(r.id)) scheduleLeave(r.id);
    });

    const nextNeeded = [...alertRows, ...toastRows]
      .filter((r) => !curIds.has(r.id) && timers.current[r.id] === undefined);

    if (nextNeeded.length > 0) {
      setRowsAndMirror((prev) => {
        const merged = [...prev];
        for (const rn of nextNeeded) {
          if (merged.some((m) => m.id === rn.id) || timers.current[rn.id] !== undefined) continue;
          merged.push(rn);
        }
        return merged;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desired]);

  // Alerts on top, toasts below them in exact arrival order. Keeping insertion
  // order (rather than re-sorting ids) avoids the stack reordering when rows
  // enter/leave, so the pile glides instead of jumping.
  const renderRows = [
    ...rows.filter((r) => r.id.startsWith('alert:')),
    ...rows.filter((r) => r.id.startsWith('toast:')),
  ];

  return (
    // Rows manage their own bottom margin (instead of a container gap) so a
    // leaving row can collapse its spacing too, letting the stack close up
    // smoothly rather than snapping.
    <div
      id="notification-tray"
      className="fixed bottom-20 sm:bottom-24 left-3 sm:left-4 z-[42] flex flex-col w-72 pointer-events-none"
    >
      {renderRows.map((row) => {
        const isLeaving = Boolean(leaving[row.id]);
        const isToast = row.id.startsWith('toast:');
        return (
          // Outer wrapper collapses height (grid-rows 1fr -> 0fr), margin, opacity
          // and a slight upward slide on exit, so the remaining stack flows up
          // into place as one coordinated motion after the fade finishes.
          <div
            key={row.id}
            className={`grid w-full transition-all duration-[280ms] ease-out ${
              isLeaving
                ? 'grid-rows-[0fr] overflow-hidden opacity-0 -translate-y-2 mb-0 pointer-events-none'
                : 'grid-rows-[1fr] mb-1.5 animate-notify-in pointer-events-auto'
            }`}
            onClick={row.onClick}
            role="alert"
          >
            <div className="min-h-0">
            <div
              className={`relative w-full p-2.5 border clip-card-chip ${
                row.type === 'danger'
                  ? 'bg-[#180B0D] border-[#B31217] text-[#FF9B9B]'
                  : row.type === 'warn'
                  ? 'bg-[#1A140B] border-[#78350F] text-[#FDE68A]'
                  : row.type === 'success'
                  ? 'bg-[#0B1710] border-[#065F46] text-[#A7F3D0]'
                  : 'bg-[#0E1116] border-[#252C36] text-[#CBD5E1]'
              }`}
            >
              {/* Per-type left accent + soft glow so the row type reads at a glance. */}
              <span
                aria-hidden
                className={`absolute left-0 top-[3px] bottom-[3px] w-1 rounded-sm ${
                  row.type === 'danger'
                    ? 'bg-[#B31217] shadow-[0_0_8px_#B31217]'
                    : row.type === 'warn'
                    ? 'bg-[#D97706] shadow-[0_0_8px_#D97706]'
                    : row.type === 'success'
                    ? 'bg-[#10B981] shadow-[0_0_8px_#10B981]'
                    : 'bg-[#64748B] shadow-[0_0_8px_#64748B]'
                }`}
              />
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="shrink-0 mt-0.5">
                    {row.type === 'danger' ? (
                      <Crosshair className="w-3.5 h-3.5 text-[#B31217]" />
                    ) : row.type === 'warn' ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-[#D97706]" />
                    ) : row.type === 'success' ? (
                      <CheckCircle className="w-3.5 h-3.5 text-[#10B981]" />
                    ) : (
                      <Info className="w-3.5 h-3.5 text-[#CBD5E1]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-heading font-bold text-[11px] uppercase tracking-wider block truncate">
                      {row.title}
                    </span>
                    <p className="text-[10px] font-mono leading-tight text-[#94A3B8] mt-0.5 line-clamp-2">
                      {row.desc}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isToast) {
                      onDismissToast(Number(row.id.slice('toast:'.length)));
                    } else {
                      onDismissAlert(row.id.slice('alert:'.length));
                    }
                  }}
                  className="text-[#64748B] hover:text-[#E8E8E8] transition-colors shrink-0 p-0.5"
                  aria-label="Dismiss"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};