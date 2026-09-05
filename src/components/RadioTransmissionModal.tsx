import React, { useState, useEffect, useRef } from 'react';
import {
  RadioTransmission,
  TransmissionClassification,
  RadioDirectiveState,
} from '../types/radioDirective';
import {
  CLASSIFICATION_COLORS,
  filterTransmissionLog,
  getTransmissionCategory,
  isTransmissionDeclined,
} from '../services/radioDirectiveService';
import {
  Radio,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Shield,
  Clock,
  ChevronRight,
  ListFilter,
  X,
  Terminal,
  Activity,
  Award,
} from 'lucide-react';
import { soundService } from '../services/soundService';

interface RadioTransmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  radioState?: RadioDirectiveState;
  activeTransmission: RadioTransmission | null;
  transmissionHistory?: RadioTransmission[];
  activeDirectives?: any[];
  isAlarmActive?: boolean;
  alarmHoursRemaining?: number;
  onToggleAlarm?: (active: boolean) => void;
  mannedTowersCount?: number;
  mannedGatesCount?: number;
  onAcknowledgeTransmission?: (transmissionId: string) => void;
  onActionTrigger?: (actionType: string) => void;
  onAcknowledge?: (transmissionId: string, action?: string) => void;
  onSelectTransmission?: (transmission: RadioTransmission) => void;
  /** Mission ids the player declined — lets the archive flag declined briefings. */
  declinedMissionIds?: string[];
}

export const RadioTransmissionModal: React.FC<RadioTransmissionModalProps> = ({
  isOpen,
  onClose,
  radioState,
  activeTransmission,
  transmissionHistory,
  isAlarmActive = false,
  alarmHoursRemaining = 0,
  onToggleAlarm,
  mannedTowersCount = 0,
  mannedGatesCount = 0,
  onAcknowledgeTransmission,
  onActionTrigger,
  onAcknowledge,
  onSelectTransmission,
  declinedMissionIds = [],
}) => {
  const log = radioState?.transmissionLog || transmissionHistory || [];
  const unreadCount = radioState?.unreadCount ?? log.filter((t) => !t.isRead).length;
  const currentTx = activeTransmission || (unreadCount > 0 ? log.find((t) => !t.isRead) || null : null);

  const [activeTab, setActiveTab] = useState<'incoming' | 'alarm' | 'log'>(() => {
    return currentTx ? 'incoming' : 'alarm';
  });
  const [filterClass, setFilterClass] = useState<TransmissionClassification | 'ALL'>('ALL');
  const [filterRead, setFilterRead] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'mission' | 'directive' | 'informational'>('ALL');
  const [filterDeclined, setFilterDeclined] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  // True when the incoming view is showing a REPLAYED archived transmission
  // (already read) rather than a live incoming one.
  const [isReplaying, setIsReplaying] = useState(false);

  const typingTimerRef = useRef<number | null>(null);
  const skippedTxIdsRef = useRef<Set<string>>(new Set());

  const handleSkipAnimation = () => {
    if (currentTx) {
      skippedTxIdsRef.current.add(currentTx.id);
      if (typingTimerRef.current !== null) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      setDisplayedText(currentTx.message || '');
      setIsTyping(false);
    }
  };

  const handleAcknowledgeTx = (txId: string, action?: string, responseText?: string) => {
    const tx = log.find((entry) => entry.id === txId) || currentTx;
    if (tx) {
      void soundService.speakRadioLine(responseText || 'ACKNOWLEDGED.', 'operator');
    }
    if (onAcknowledge) {
      onAcknowledge(txId, action);
    }
    if (onAcknowledgeTransmission) {
      onAcknowledgeTransmission(txId);
    }
    if (action && onActionTrigger) {
      onActionTrigger(action);
    }
  };

  const handleSelectTx = (tx: RadioTransmission) => {
    setIsReplaying(true);
    if (onSelectTransmission) {
      onSelectTransmission(tx);
    }
  };

  const handleOpenIncoming = () => {
    setIsReplaying(false);
    setActiveTab('incoming');
  };

  // Vance speaks only after the player opens the radio console, never when the
  // simulation first creates the transmission or when a background tick runs.
  const spokenTransmissionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen || !currentTx || activeTab !== 'incoming' || isAudioMuted) return;
    if (spokenTransmissionRef.current === currentTx.id) return;
    spokenTransmissionRef.current = currentTx.id;
    void soundService.speakRadioLine(currentTx.message || currentTx.title, 'vance');
  }, [isOpen, currentTx?.id, currentTx?.message, currentTx?.title, activeTab, isAudioMuted]);

  // Typewriter effect for live incoming transmissions
  useEffect(() => {
    if (!isOpen || !currentTx) {
      setDisplayedText('');
      setIsTyping(false);
      if (typingTimerRef.current !== null) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      return;
    }

    if (typingTimerRef.current !== null) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    const hasBeenSkipped = skippedTxIdsRef.current.has(currentTx.id);

    // Replays from the archive always show instantly: selecting a record marks
    // it read, so a replayed unread briefing must not re-run the typewriter.
    if (activeTab === 'incoming' && !currentTx.isRead && !hasBeenSkipped && !isReplaying) {
      setIsTyping(true);
      setDisplayedText('');
      let currentLen = 0;
      const fullText = currentTx.message || '';
      const speed = Math.max(12, Math.min(25, 1200 / (fullText.length || 1)));

      if (!isAudioMuted && currentTx.audioCue) {
        soundService.playRadioChirp();
      }

      const timer = window.setInterval(() => {
        currentLen += 1;
        if (currentLen <= fullText.length) {
          setDisplayedText(fullText.slice(0, currentLen));
        } else {
          setDisplayedText(fullText);
          setIsTyping(false);
          if (typingTimerRef.current !== null) {
            clearInterval(typingTimerRef.current);
            typingTimerRef.current = null;
          }
        }
      }, speed);
      typingTimerRef.current = timer;

      return () => {
        clearInterval(timer);
        if (typingTimerRef.current === timer) {
          typingTimerRef.current = null;
        }
      };
    } else {
      setDisplayedText(currentTx.message || '');
      setIsTyping(false);
    }
  }, [currentTx?.id, currentTx?.message, currentTx?.isRead, activeTab, isAudioMuted, isOpen]);

  if (!isOpen) return null;

  const styleConfig = currentTx
    ? CLASSIFICATION_COLORS[currentTx.classification]
    : CLASSIFICATION_COLORS.SITREP;

  const filteredLog = filterTransmissionLog(
    log,
    {
      classification: filterClass,
      read: filterRead,
      category: filterCategory,
      declinedOnly: filterDeclined,
    },
    declinedMissionIds
  );
  const declinedSet = new Set(declinedMissionIds);

  return (
    <div
      id="radio-transmission-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md pointer-events-auto select-none"
    >
      <div
        id="radio-transmission-terminal-container"
        className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-[#0b0e14] border-2 border-[#10b981] clip-tactical-bracket surface-bevel shadow-[0_0_35px_rgba(16,185,129,0.3)] text-slate-100 overflow-hidden"
      >
        {/* Top Terminal Military Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0e131b] border-b border-[#262f3d]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#10b981]/20 border border-[#10b981] flex items-center justify-center text-[#10b981]">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-widest text-[#10b981] uppercase font-display">
                  SAFE ZONES OPERATIONS NETWORK
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 rounded">
                  FREQ: 104.20 MHz
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                <span>CHIEF OPERATOR TERMINAL</span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-emerald-400">SIGNAL STABLE</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="radio-audio-mute-toggle"
              onClick={() => setIsAudioMuted(!isAudioMuted)}
              className="p-1.5 rounded text-slate-400 hover:text-white bg-slate-800/60 border border-slate-700 transition-colors"
              title={isAudioMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              id="radio-modal-close-btn"
              onClick={onClose}
              className="p-1.5 rounded text-slate-400 hover:text-red-400 bg-slate-800/60 border border-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation (Live Transmission vs. Colony Defense Alarm vs. Radio Archive Log) */}
        <div className="flex border-b border-[#262f3d] bg-[#080b10] px-3 pt-2">
          <button
            id="radio-tab-incoming"
            onClick={() => {
              setIsReplaying(false);
              setActiveTab('incoming');
            }}
            className={`px-4 py-2 text-xs font-bold font-display uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'incoming'
                ? 'border-[#10b981] text-[#10b981] bg-[#10b981]/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>OPERATIONAL DIRECTIVE</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-mono bg-red-600 text-white rounded-full font-black">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            id="radio-tab-alarm"
            onClick={() => setActiveTab('alarm')}
            className={`px-4 py-2 text-xs font-bold font-display uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'alarm'
                ? isAlarmActive
                  ? 'border-red-500 text-red-400 bg-red-950/30'
                  : 'border-amber-500 text-amber-400 bg-amber-950/20'
                : isAlarmActive
                ? 'border-transparent text-red-400 animate-pulse'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className={`w-3.5 h-3.5 ${isAlarmActive ? 'text-red-400 animate-bounce' : 'text-amber-400'}`} />
            <span>DEFENSE ALARM {isAlarmActive ? `(${alarmHoursRemaining.toFixed(1)}h)` : ''}</span>
          </button>

          <button
            id="radio-tab-log"
            onClick={() => setActiveTab('log')}
            className={`px-4 py-2 text-xs font-bold font-display uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'log'
                ? 'border-[#10B981] text-[#10B981] bg-[#10B981]/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>TRANSMISSION ARCHIVE ({log.length})</span>
          </button>
        </div>

        {/* Main Body */}
        {activeTab === 'alarm' || (!currentTx && activeTab === 'incoming') ? (
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-5">
            {/* Alarm Status Banner */}
            <div
              className={`p-5 rounded border ${
                isAlarmActive
                  ? 'bg-red-950/50 border-red-500/80 shadow-[0_0_25px_rgba(239,68,68,0.3)]'
                  : 'bg-emerald-950/30 border-emerald-500/40'
              } space-y-3`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isAlarmActive
                        ? 'bg-red-500/20 text-red-400 border border-red-500 animate-pulse'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500'
                    }`}
                  >
                    <Flame className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-mono font-black uppercase px-2 py-0.5 rounded border ${
                          isAlarmActive
                            ? 'bg-red-900/80 text-red-200 border-red-400'
                            : 'bg-emerald-900/80 text-emerald-200 border-emerald-400'
                        }`}
                      >
                        {isAlarmActive ? 'DEFENSE ALARM ACTIVE' : 'DEFENSE SIREN STANDBY'}
                      </span>
                      {isAlarmActive && (
                        <span className="text-xs font-mono text-red-400 flex items-center gap-1 font-bold animate-pulse">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{alarmHoursRemaining.toFixed(1)} IN-GAME HOURS REMAINING</span>
                        </span>
                      )}
                    </div>
                    <h2 className="text-base sm:text-lg font-black font-display tracking-wide uppercase text-white mt-0.5">
                      COLONY EMERGENCY SIREN & DEFENSE STATIONS
                    </h2>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-300 font-mono leading-relaxed">
                {isAlarmActive
                  ? 'Colony Alarm is sounding! Field workers have ceased non-essential work and retreated to safe shelter, while defenders are actively manning all owned watchtowers, gates, and bastions.'
                  : 'When no incoming transmission is present, you may broadcast a Colony Defense Alarm. The siren sounds for 13 hours (or until manually toggled off). Workers immediately retreat to shelter or move to man all owned gates and watchtowers for perimeter defense.'}
              </p>
            </div>

            {/* Tactical Station Status Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
              <div className="p-3.5 bg-[#070a0e] border border-slate-800 rounded space-y-1">
                <div className="text-slate-400 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold uppercase tracking-wider">WATCHTOWERS</span>
                </div>
                <div className="text-lg font-black text-white font-display">
                  {mannedTowersCount} MANNED
                </div>
                <div className="text-[11px] text-slate-400">
                  Towers are manned by 1 worker by default even at night.
                </div>
              </div>

              <div className="p-3.5 bg-[#070a0e] border border-slate-800 rounded space-y-1">
                <div className="text-slate-400 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold uppercase tracking-wider">DEFENSE GATES</span>
                </div>
                <div className="text-lg font-black text-white font-display">
                  {isAlarmActive ? `${mannedGatesCount} MANNED` : 'STANDBY'}
                </div>
                <div className="text-[11px] text-slate-400">
                  Gates are fortified and manned by workers during active alarm.
                </div>
              </div>

              <div className="p-3.5 bg-[#070a0e] border border-slate-800 rounded space-y-1">
                <div className="text-slate-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="font-bold uppercase tracking-wider">FIELD WORKERS</span>
                </div>
                <div className="text-lg font-black text-white font-display">
                  {isAlarmActive ? 'SHELTERED' : 'ACTIVE IN FIELD'}
                </div>
                <div className="text-[11px] text-slate-400">
                  Workers return to HQ/shelters automatically during alarm & nightfall.
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-[#1f2937] flex flex-wrap gap-3 justify-end items-center">
              {isAlarmActive ? (
                <button
                  id="cancel-colony-alarm-btn"
                  type="button"
                  onClick={() => {
                    if (onToggleAlarm) onToggleAlarm(false);
                    soundService.playBuildingPlaced();
                  }}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-display font-black text-xs uppercase tracking-widest rounded border border-slate-600 transition-all flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>STAND DOWN / CANCEL DEFENSE ALARM</span>
                </button>
              ) : (
                <button
                  id="raise-colony-alarm-btn"
                  type="button"
                  onClick={() => {
                    if (onToggleAlarm) onToggleAlarm(true);
                    soundService.playHordeWarning();
                  }}
                  className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-display font-black text-xs uppercase tracking-widest rounded border border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)] transition-all flex items-center gap-2 cursor-pointer hover:scale-105"
                >
                  <Flame className="w-4 h-4 text-amber-300 animate-bounce" />
                  <span>RAISE 13-HOUR DEFENSE ALARM</span>
                </button>
              )}

              <button
                id="close-terminal-btn"
                type="button"
                onClick={onClose}
                className="px-4 py-3 bg-[#10b981]/20 hover:bg-[#10b981]/30 text-emerald-400 font-display font-bold text-xs uppercase tracking-wider rounded border border-emerald-500/40"
              >
                DISMISS TERMINAL
              </button>
            </div>
          </div>
        ) : activeTab === 'incoming' && currentTx ? (
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-5">
            {/* Header Box: Classification & Callsign */}
            <div className={`p-4 rounded border ${styleConfig.border} ${styleConfig.bg} space-y-2`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 text-xs font-black font-mono tracking-widest uppercase rounded border ${styleConfig.badge}`}
                  >
                    [{currentTx.classification}]
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    CALLSIGN: <strong className="text-white">{currentTx.callsign}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{currentTx.timestamp}</span>
                </div>
              </div>

              <h2 className={`text-base sm:text-lg font-black font-display tracking-wide uppercase ${styleConfig.text}`}>
                {currentTx.title}
              </h2>
            </div>

            {/* Replay banner — this is an archived record, not a live signal */}
            {isReplaying && (
              <div className="p-3 bg-[#0B1511]/90 border border-[#10B981]/40 rounded flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-300">
                  <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    ARCHIVE REPLAY — READ RECORD ·{' '}
                    {currentTx.missionId ? 'MISSION BRIEFING' : currentTx.directiveId ? 'DIRECTIVE' : 'TRANSMISSION'}
                    {isTransmissionDeclined(currentTx, declinedMissionIds) && ' · DECLINED'}
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab('log')}
                  className="px-3 py-1.5 text-[10px] font-display font-black uppercase tracking-wider text-emerald-300 bg-emerald-950/50 border border-emerald-500/40 rounded hover:bg-emerald-900/50 transition-colors"
                >
                  ← ARCHIVE
                </button>
              </div>
            )}

            {/* Audio Oscilloscope / Frequency Bar Visualizer */}
            <div className="h-4 w-full bg-slate-950 border border-slate-800 rounded flex items-center px-2 gap-1 overflow-hidden">
              <span className="text-[9px] font-mono text-emerald-500 font-black mr-1">SIGNAL:</span>
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2.5 flex-1 rounded-xs transition-all duration-150 ${
                    isTyping
                      ? 'bg-emerald-400 animate-pulse'
                      : i < 18
                      ? 'bg-emerald-600'
                      : 'bg-slate-800'
                  }`}
                  style={{
                    height: isTyping ? `${Math.max(20, Math.random() * 100)}%` : undefined,
                  }}
                />
              ))}
            </div>

            {/* Message Body with Typewriter & Scanline */}
            <div
              onClick={handleSkipAnimation}
              className="p-4 sm:p-5 rounded bg-[#070a0e] border border-[#1f2937] font-mono text-sm leading-relaxed text-slate-200 min-h-[120px] shadow-inner relative cursor-pointer"
              title={isTyping ? "Click to display full message instantly" : undefined}
            >
              <div className="absolute top-2 right-2 text-[10px] text-slate-500 font-mono">
                {isTyping ? 'DECRYPTING // CLICK TO SKIP' : 'DECRYPTED // SZO-PROTOCOL-2026'}
              </div>
              <p className="whitespace-pre-wrap">
                {displayedText}
                {isTyping && <span className="inline-block w-2 h-4 bg-emerald-400 ml-1 animate-pulse" />}
              </p>
            </div>

            {/* Incoming queue status — several transmissions may be pending */}
            {(unreadCount > 1 || (radioState?.incomingQueue?.length || 0) > 1) && (
              <div className="p-2 bg-slate-900/80 border border-slate-700 rounded flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-[11px] font-mono text-cyan-300">
                  {unreadCount - (currentTx && !currentTx.isRead ? 1 : 0)} FURTHER TRANSMISSION
                  {unreadCount - (currentTx && !currentTx.isRead ? 1 : 0) === 1 ? '' : 'S'} QUEUED
                </span>
              </div>
            )}

            {/* Associated Directive / Mission Info (if attached) */}
            {currentTx.missionId && !currentTx.directiveId && (
              <div className="p-3 bg-slate-900/90 border border-amber-700 rounded flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider font-display">
                    OPERATIONAL BRIEFING — RESPONSE REQUIRED
                  </div>
                  <div className="text-xs text-slate-300">
                    Your response determines the mission that is opened in the Operations tracker.
                  </div>
                </div>
              </div>
            )}
            {currentTx.directiveId && (
              <div className="p-3 bg-slate-900/90 border border-slate-700 rounded flex items-start gap-3">
                <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider font-display">
                    OPERATIONAL DIRECTIVE RECORD
                  </div>
                  <div className="text-xs text-slate-300">
                    This situation establishes an active directive in the Chief Operator Tactical Quests panel.
                  </div>
                </div>
              </div>
            )}

            {/* Replay footer — no response actions on a historical record */}
            {isReplaying ? (
              <div className="pt-3 border-t border-[#1f2937] flex flex-wrap gap-3 justify-end items-center">
                <div className="text-[11px] font-mono text-slate-400 mr-auto">
                  {getTransmissionCategory(currentTx) === 'mission' && declinedSet.has(currentTx.missionId || '')
                    ? 'BRIEFING DECLINED — NO MISSION OPENED.'
                    : 'ARCHIVE RECORD — RESPONSE ALREADY LOGGED.'}
                </div>
                <button
                  onClick={() => setActiveTab('log')}
                  className="px-5 py-2.5 bg-[#047857] hover:bg-[#065F46] text-white font-display font-black text-xs uppercase tracking-widest rounded clip-tactical-bracket surface-bevel flex items-center gap-2"
                >
                  <Terminal className="w-4 h-4" />
                  <span>BACK TO ARCHIVE</span>
                </button>
              </div>
            ) : currentTx.responseOptions && currentTx.responseOptions.length > 0 ? (
                currentTx.responseOptions.map((opt, idx) => (
                  <button
                    key={idx}
                    id={`radio-response-btn-${idx}`}
                    onClick={() => {
                      handleAcknowledgeTx(currentTx.id, opt.action, opt.label);
                      onClose();
                    }}
                    className="px-5 py-2.5 bg-[#10b981] hover:bg-[#059669] active:bg-[#047857] text-[#062419] font-display font-black text-xs uppercase tracking-widest rounded clip-tactical-bracket surface-bevel shadow-lg flex items-center gap-2 transition-all transform active:scale-95"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{opt.label}</span>
                  </button>
                ))
              ) : (
                <button
                  id="radio-ack-default-btn"
                  onClick={() => {
                    handleAcknowledgeTx(currentTx.id);
                    onClose();
                  }}
                  className="px-5 py-2.5 bg-[#10b981] hover:bg-[#059669] text-[#062419] font-display font-black text-xs uppercase tracking-widest rounded clip-tactical-bracket surface-bevel flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ACKNOWLEDGE SITREP</span>
                </button>
              )}
          </div>
        ) : activeTab === 'log' ? (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Archive filter sidebar */}
            <div className="w-full md:w-52 bg-[#0a0d13] border-b md:border-b-0 md:border-r border-[#1f2937] p-3 space-y-4 overflow-x-auto md:overflow-y-auto">
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider px-2 py-1 flex items-center gap-1">
                  <ListFilter className="w-3 h-3" />
                  <span>READ STATUS</span>
                </div>
                {(['ALL', 'UNREAD', 'READ'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setFilterRead(r)}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono transition-colors flex items-center justify-between ${
                      filterRead === r
                        ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {r === 'UNREAD' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
                      {r === 'READ' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                      {r}
                    </span>
                    <span className="text-[10px] opacity-70">
                      {r === 'ALL'
                        ? log.length
                        : log.filter((t) => (r === 'UNREAD' ? !t.isRead : t.isRead)).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider px-2 py-1 flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  <span>CATEGORY</span>
                </div>
                {([
                  ['ALL', 'ALL'],
                  ['mission', 'MISSIONS'],
                  ['directive', 'DIRECTIVES'],
                  ['informational', 'INFO'],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setFilterCategory(val)}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono transition-colors flex items-center justify-between ${
                      filterCategory === val
                        ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-[10px] opacity-70">
                      {val === 'ALL'
                        ? log.length
                        : log.filter((t) => getTransmissionCategory(t) === val).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider px-2 py-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>OUTCOME</span>
                </div>
                <button
                  onClick={() => setFilterDeclined((v) => !v)}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono transition-colors flex items-center justify-between ${
                    filterDeclined
                      ? 'bg-red-500/20 text-red-300 font-bold border border-red-500/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5">DECLINED</span>
                  <span className="text-[10px] opacity-70">
                    {log.filter((t) => isTransmissionDeclined(t, declinedMissionIds)).length}
                  </span>
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider px-2 py-1 flex items-center gap-1">
                  <Radio className="w-3 h-3" />
                  <span>CLASSIFICATION</span>
                </div>
                {(['ALL', 'SITREP', 'WARNING', 'DIRECTIVE', 'EMERGENCY', 'INTEL', 'UPDATE', 'MILESTONE'] as const).map(
                  (cls) => (
                    <button
                      key={cls}
                      onClick={() => setFilterClass(cls)}
                      className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono transition-colors flex items-center justify-between ${
                        filterClass === cls
                          ? 'bg-[#10b981]/20 text-[#10b981] font-bold border border-[#10b981]/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      <span>{cls}</span>
                      <span className="text-[10px] opacity-70">
                        {cls === 'ALL'
                          ? log.length
                          : log.filter((t) => t.classification === cls).length}
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Transmissions Log List */}
            <div className="flex-1 p-3 overflow-y-auto space-y-2">
              {filteredLog.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-mono text-xs">
                  NO TRANSMISSION RECORDS MATCH THE ACTIVE FILTERS.
                </div>
              ) : (
                filteredLog.map((tx) => {
                  const cfg = CLASSIFICATION_COLORS[tx.classification];
                  const isCurrentSelected = currentTx?.id === tx.id;
                  const txDeclined = isTransmissionDeclined(tx, declinedMissionIds);
                  const txCategory = getTransmissionCategory(tx);
                  return (
                    <div
                      key={tx.id}
                      onClick={() => {
                        handleSelectTx(tx);
                        setActiveTab('incoming');
                      }}
                      className={`p-3 rounded border cursor-pointer transition-all ${
                        isCurrentSelected
                          ? `${cfg.border} bg-slate-900 shadow-md`
                          : 'border-slate-800 bg-[#07090e] hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-mono mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.badge}`}>
                            [{tx.classification}]
                          </span>
                          {!tx.isRead && (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                          )}
                          {txCategory === 'mission' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border border-amber-500/50 bg-amber-950/40 text-amber-300 uppercase">
                              MISSION
                            </span>
                          )}
                          {txCategory === 'directive' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border border-sky-500/50 bg-sky-950/40 text-sky-300 uppercase">
                              DIRECTIVE
                            </span>
                          )}
                          {txDeclined && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border border-red-500/50 bg-red-950/40 text-red-300 uppercase">
                              DECLINED
                            </span>
                          )}
                        </div>
                        <span className="text-slate-500 shrink-0">{tx.timestamp}</span>
                      </div>
                      <div className="font-display font-bold text-xs sm:text-sm text-slate-200 mb-1">
                        {tx.title}
                      </div>
                      <div className="text-xs font-mono text-slate-400 line-clamp-2">
                        {tx.message}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
