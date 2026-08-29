import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Radio,
  Sliders,
  Sparkles,
  ShieldAlert,
  Sun,
  Moon,
  Crosshair,
  Swords,
  Hammer,
  Users,
  AlertTriangle,
  Flame,
  Info,
  X,
  Play,
  Music,
} from 'lucide-react';
import { soundService, SoundSettings } from '../services/soundService';

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPhase: 'dawn' | 'day' | 'dusk' | 'night';
  isNight: boolean;
  dangerLevel: number;
}

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({
  isOpen,
  onClose,
  currentPhase,
  isNight,
  dangerLevel,
}) => {
  const [settings, setSettings] = useState<SoundSettings>(soundService.getSettings());

  useEffect(() => {
    setSettings(soundService.getSettings());
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpdate = (patch: Partial<SoundSettings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    soundService.updateSettings(patch);
  };

  const handleToggleMute = () => {
    const newMuted = soundService.toggleMute();
    setSettings((prev) => ({ ...prev, muted: newMuted }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#0F1216] border border-[#2B333E] clip-tactical-bracket surface-bevel overflow-hidden font-mono text-[#E2E8F0]">
        {/* Header Strip */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#161B22] border-b border-[#2B333E]">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 text-[#CBD5E1] animate-pulse" />
            <div>
              <h2 className="text-sm font-bold tracking-wider font-heading uppercase text-white flex items-center gap-2">
                Acoustic & Audio Subsystem
                <span className="text-[10px] px-1.5 py-0.5 bg-[#1C232E] text-[#CBD5E1] border border-[#2B3544]">
                  §15 Sound Engine
                </span>
              </h2>
              <p className="text-[11px] text-[#94A3B8]">
                Real-time Web Audio synthesis, background score & atmospheric soundscape
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#94A3B8] hover:text-white hover:bg-[#212833] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Real-Time Ambient Status Monitor */}
          <div className="p-3.5 bg-[#14181E] border border-[#222933] clip-card-chip space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#94A3B8] flex items-center gap-1.5 font-bold uppercase">
                {isNight ? (
                  <Moon className="w-4 h-4 text-[#818CF8]" />
                ) : (
                  <Sun className="w-4 h-4 text-[#FBBF24]" />
                )}
                Active Soundscape State
              </span>
              <span className="text-xs px-2 py-0.5 font-bold uppercase bg-[#1E2530] text-[#CBD5E1] border border-[#2D3748]">
                {currentPhase.toUpperCase()} • {isNight ? 'NIGHT HORROR DRONE' : 'DAYTIME AMBIENT'}
              </span>
            </div>

            {/* Danger Meter */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#94A3B8] flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-[#F87171]" />
                  Acoustic Threat / Danger Tension:
                </span>
                <span
                  className={`font-bold ${
                    dangerLevel > 0.6
                      ? 'text-[#EF4444]'
                      : dangerLevel > 0.3
                      ? 'text-[#FBBF24]'
                      : 'text-[#34D399]'
                  }`}
                >
                  {(dangerLevel * 100).toFixed(0)}% THREAT
                </span>
              </div>
              <div className="w-full h-2 bg-[#1A1F26] overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    dangerLevel > 0.6
                      ? 'bg-gradient-to-r from-amber-500 to-rose-600'
                      : dangerLevel > 0.3
                      ? 'bg-gradient-to-r from-emerald-500 to-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.max(4, dangerLevel * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Volume Controls */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-[#CBD5E1]" />
                Volume Levels
              </span>
              <button
                onClick={handleToggleMute}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold transition-colors ${
                  settings.muted
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-[#1C232E] hover:bg-[#242D3B] text-[#94A3B8] hover:text-white border border-[#2B3544]'
                }`}
              >
                {settings.muted ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                    MUTED
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-[#CBD5E1]" />
                    MUTE ALL
                  </>
                )}
              </button>
            </div>

            {/* Master Volume */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[#94A3B8]">
                <span>Master Volume</span>
                <span className="text-white font-bold">{Math.round(settings.masterVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.masterVolume}
                onChange={(e) => handleUpdate({ masterVolume: parseFloat(e.target.value) })}
                className="w-full accent-[#94A3B8] bg-[#1E2530] h-1.5 appearance-none cursor-pointer"
              />
            </div>

            {/* Background Music Volume */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[#94A3B8]">
                <span className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={settings.musicEnabled}
                    onChange={(e) => handleUpdate({ musicEnabled: e.target.checked })}
                    className="accent-[#94A3B8]"
                  />
                  Background Music (Menu & In-Game Dynamic Score)
                </span>
                <span className="text-white font-bold">
                  {settings.musicEnabled ? `${Math.round(settings.musicVolume * 100)}%` : 'OFF'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                disabled={!settings.musicEnabled}
                value={settings.musicVolume}
                onChange={(e) => handleUpdate({ musicVolume: parseFloat(e.target.value) })}
                className="w-full accent-[#94A3B8] bg-[#1E2530] h-1.5 appearance-none cursor-pointer disabled:opacity-40"
              />
            </div>

            {/* Ambient Soundscape Volume */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[#94A3B8]">
                <span className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={settings.ambientEnabled}
                    onChange={(e) => handleUpdate({ ambientEnabled: e.target.checked })}
                    className="accent-[#94A3B8]"
                  />
                  Ambient Soundscape (Wind, Night Drone, Threat Pulse)
                </span>
                <span className="text-white font-bold">
                  {settings.ambientEnabled ? `${Math.round(settings.ambientVolume * 100)}%` : 'OFF'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                disabled={!settings.ambientEnabled}
                value={settings.ambientVolume}
                onChange={(e) => handleUpdate({ ambientVolume: parseFloat(e.target.value) })}
                className="w-full accent-[#94A3B8] bg-[#1E2530] h-1.5 appearance-none cursor-pointer disabled:opacity-40"
              />
            </div>

            {/* Radio Voice Volume */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[#94A3B8]">
                <span className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={settings.radioVoiceEnabled !== false}
                    onChange={(e) => handleUpdate({ radioVoiceEnabled: e.target.checked })}
                    className="accent-[#94A3B8]"
                  />
                  Radio Character Voices (Browser Speech)
                </span>
                <span className="text-white font-bold">
                  {settings.radioVoiceEnabled !== false ? `${Math.round((settings.radioVoiceVolume ?? 0.9) * 100)}%` : 'OFF'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                disabled={settings.radioVoiceEnabled === false}
                value={settings.radioVoiceVolume ?? 0.9}
                onChange={(e) => handleUpdate({ radioVoiceVolume: parseFloat(e.target.value) })}
                className="w-full accent-[#94A3B8] bg-[#1E2530] h-1.5 appearance-none cursor-pointer disabled:opacity-40"
              />
            </div>

            {/* Radio Voice Volume */}
            <div className="space-y-1 border border-emerald-500/30 bg-emerald-950/10 p-2">
              <div className="flex justify-between text-xs text-[#94A3B8]">
                <span className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={settings.radioVoiceEnabled !== false}
                    onChange={(e) => handleUpdate({ radioVoiceEnabled: e.target.checked })}
                    className="accent-emerald-400"
                  />
                  <span className="text-emerald-300">Radio Voice / Browser Speech</span>
                </span>
                <span className="text-white font-bold">
                  {settings.radioVoiceEnabled !== false ? `${Math.round((settings.radioVoiceVolume ?? 0.9) * 100)}%` : 'OFF'}
                </span>
              </div>
              <input
                aria-label="Radio voice volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                disabled={settings.radioVoiceEnabled === false}
                value={settings.radioVoiceVolume ?? 0.9}
                onChange={(e) => handleUpdate({ radioVoiceVolume: parseFloat(e.target.value) })}
                className="w-full accent-emerald-400 bg-[#1E2530] h-1.5 appearance-none cursor-pointer disabled:opacity-40"
              />
              <p className="text-[9px] text-slate-500">Uses voices installed in your browser and operating system.</p>
            </div>

            {/* SFX Volume */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[#94A3B8]">
                <span className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={settings.sfxEnabled}
                    onChange={(e) => handleUpdate({ sfxEnabled: e.target.checked })}
                    className="accent-[#94A3B8]"
                  />
                  Combat & UI Sound Effects (Gunfire, Melee, Alerts)
                </span>
                <span className="text-white font-bold">
                  {settings.sfxEnabled ? `${Math.round(settings.sfxVolume * 100)}%` : 'OFF'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                disabled={!settings.sfxEnabled}
                value={settings.sfxVolume}
                onChange={(e) => handleUpdate({ sfxVolume: parseFloat(e.target.value) })}
                className="w-full accent-[#94A3B8] bg-[#1E2530] h-1.5 appearance-none cursor-pointer disabled:opacity-40"
              />
            </div>
          </div>

          {/* SFX Synthesizer Test Bench */}
          <div className="p-3.5 bg-[#14181E] border border-[#222933] clip-card-chip space-y-3">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#CBD5E1]" />
              Interactive Sound Testing Bench
            </span>

            {/* Combat Tests */}
            <div>
              <div className="text-[10px] text-[#94A3B8] uppercase font-bold mb-1.5">Combat SFX</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => soundService.playGunfire(false)}
                  className="px-2 py-1.5 bg-[#1C232E] hover:bg-[#253040] border border-[#2B3544] text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <Crosshair className="w-3 h-3 text-[#CBD5E1]" />
                  Gunfire (Rifle)
                </button>
                <button
                  onClick={() => soundService.playGunfire(true)}
                  className="px-2 py-1.5 bg-[#1C232E] hover:bg-[#253040] border border-[#2B3544] text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <Crosshair className="w-3 h-3 text-amber-400" />
                  Gunfire (Crit)
                </button>
                <button
                  onClick={() => soundService.playMelee(true)}
                  className="px-2 py-1.5 bg-[#1C232E] hover:bg-[#253040] border border-[#2B3544] text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <Swords className="w-3 h-3 text-rose-400" />
                  Melee Strike
                </button>
              </div>
            </div>

            {/* Zombie Variant Audio */}
            <div>
              <div className="text-[10px] text-[#94A3B8] uppercase font-bold mb-1.5">Zombie Variants</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => soundService.playZombieSound('shambler')}
                  className="px-2 py-1.5 bg-[#1C232E] hover:bg-[#253040] border border-[#2B3544] text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <Play className="w-3 h-3 text-emerald-400" />
                  Shambler Moan
                </button>
                <button
                  onClick={() => soundService.playZombieSound('runner')}
                  className="px-2 py-1.5 bg-[#1C232E] hover:bg-[#253040] border border-[#2B3544] text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <Flame className="w-3 h-3 text-amber-400" />
                  Runner Shriek
                </button>
                <button
                  onClick={() => soundService.playZombieSound('brute')}
                  className="px-2 py-1.5 bg-[#1C232E] hover:bg-[#253040] border border-[#2B3544] text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <ShieldAlert className="w-3 h-3 text-rose-400" />
                  Brute Roar/Slam
                </button>
              </div>
            </div>

            {/* Alerts & UI Actions */}
            <div>
              <div className="text-[10px] text-[#94A3B8] uppercase font-bold mb-1.5">Alerts & Key UI Actions</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => soundService.playHordeWarning()}
                  className="px-2 py-1.5 bg-[#1C232E] hover:bg-[#253040] border border-[#2B3544] text-[11px] flex items-center gap-1.5 transition-colors text-amber-300"
                >
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  Horde Siren Alarm
                </button>
                <button
                  onClick={() => soundService.playOutbreakAlert()}
                  className="px-2 py-1.5 bg-[#1C232E] hover:bg-[#253040] border border-[#2B3544] text-[11px] flex items-center gap-1.5 transition-colors text-rose-300"
                >
                  <ShieldAlert className="w-3 h-3 text-rose-400" />
                  Outbreak Hazard Alarm
                </button>
                <button
                  onClick={() => soundService.playBuildingPlaced()}
                  className="px-2 py-1.5 bg-[#1C232E] hover:bg-[#253040] border border-[#2B3544] text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <Hammer className="w-3 h-3 text-[#CBD5E1]" />
                  Building Placed Thud
                </button>
                <button
                  onClick={() => soundService.playRecruitmentResolved()}
                  className="px-2 py-1.5 bg-[#1C232E] hover:bg-[#253040] border border-[#2B3544] text-[11px] flex items-center gap-1.5 transition-colors text-emerald-300"
                >
                  <Users className="w-3 h-3 text-emerald-400" />
                  Recruitment Chime
                </button>
              </div>
            </div>
          </div>

          {/* Scope Note */}
          <div className="flex items-start gap-2.5 p-3 bg-[#181D24] border border-[#262E3A] clip-card-chip text-xs text-[#94A3B8]">
            <Info className="w-4 h-4 text-[#CBD5E1] shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">Music & Soundscape Architecture:</strong> Dual-track soundtrack transitions dynamically between main menu sequences and tactical gameplay, backed by procedural Web Audio ambient generators and SFX.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 bg-[#161B22] border-t border-[#2B333E]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#CBD5E1] hover:bg-[#E8E8E8] text-[#0A0C0E] font-bold text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
