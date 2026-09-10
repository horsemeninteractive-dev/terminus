import React, { useState } from 'react';
import {
 X,
 Settings,
 Volume2,
 VolumeX,
 Monitor,
 Gamepad2,
 Keyboard,
 Shield,
 Save,
 Check,
 RotateCcw,
} from 'lucide-react';
import { GameSettings } from '../types/saveGame';
import { gameSettingsService, DEFAULT_SETTINGS } from '../services/gameSettingsService';
import { soundService, RadioVoiceCharacter } from '../services/soundService';

interface GameSettingsModalProps {
 isOpen: boolean;
 onClose: () => void;
 onApplySettings?: (settings: GameSettings) => void;
}

export const GameSettingsModal: React.FC<GameSettingsModalProps> = ({
 isOpen,
 onClose,
 onApplySettings,
}) => {
 const [settings, setSettings] = useState<GameSettings>(() => gameSettingsService.getSettings());
 const [activeTab, setActiveTab] = useState<'audio' | 'graphics' | 'gameplay' | 'controls'>('audio');
 const [saveSuccess, setSaveSuccess] = useState(false);
 const [radioSettings, setRadioSettings] = useState(soundService.getSettings());
 const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

 // Fullscreen is live display state (not a persisted setting): mirrored from
 // the Fullscreen API so the toggle stays in sync even when the user exits via
 // Esc, and hidden/disabled in browsers without support.
 const fullscreenSupported =
   typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function';
 const [isFullscreen, setIsFullscreen] = useState<boolean>(
   typeof document !== 'undefined' && !!document.fullscreenElement
 );
 React.useEffect(() => {
   if (!fullscreenSupported) return;
   const onChange = () => setIsFullscreen(!!document.fullscreenElement);
   document.addEventListener('fullscreenchange', onChange);
   return () => document.removeEventListener('fullscreenchange', onChange);
 }, [fullscreenSupported]);
 // The modal stays mounted (renders null when closed), so state survives a
 // close/reopen — re-read the live API state every time it opens.
 React.useEffect(() => {
   if (isOpen) setIsFullscreen(!!document.fullscreenElement);
 }, [isOpen]);
 const handleFullscreenToggle = () => {
   if (!fullscreenSupported) return;
   // Reconcile state from the API result directly (not just the
   // fullscreenchange event): some webviews/embeds never dispatch the event,
   // and a rejected request must not leave a stale checked box.
   if (document.fullscreenElement) {
     document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => setIsFullscreen(!!document.fullscreenElement));
   } else {
     document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => setIsFullscreen(false));
   }
 };
 React.useEffect(() => {
   if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
   const refreshVoices = () => setAvailableVoices(window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('en')));
   refreshVoices();
   window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
   return () => window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices);
 }, [isOpen]);

 if (!isOpen) return null;

 const handleUpdate = (partial: Partial<GameSettings>) => {
 const updated = { ...settings, ...partial };
 setSettings(updated);
 if (partial.masterVolume !== undefined) {
 soundService.setMasterVolume(partial.masterVolume / 100);
 }
 };

 const handleSave = () => {
 gameSettingsService.updateSettings(settings);
 if (onApplySettings) {
 onApplySettings(settings);
 }
 soundService.playCombatActionSFX('assault_order');
 setSaveSuccess(true);
 setTimeout(() => {
 setSaveSuccess(false);
 onClose();
 }, 600);
 };

 const handleReset = () => {
 setSettings(DEFAULT_SETTINGS);
 soundService.setMasterVolume(DEFAULT_SETTINGS.masterVolume / 100);
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
 <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-[#0B0F19] border-2 border-[#24334A] overflow-hidden text-[#CBD5E1] font-sans clip-tactical-bracket surface-bevel">
 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E293B] bg-[#0E1524]">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-[#1E293B] border border-[#E8E8E8]/40 text-[#E8E8E8]">
 <Settings className="w-5 h-5" />
 </div>
 <div>
 <h2 className="text-xl font-heading font-black tracking-wide text-white uppercase">
 SYSTEM CONFIGURATION & OPTIONS
 </h2>
 <p className="text-xs font-mono text-[#94A3B8]">
 Audio soundscapes, visual fidelity, simulation automation, and hotkeys
 </p>
 </div>
 </div>

 <button
 onClick={onClose}
 className="p-1.5 text-[#64748B] hover:text-white hover:bg-[#1E293B] transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Tab Navigation */}
 <div className="flex border-b border-[#1E293B] bg-[#090D15] px-6">
 {[
 { id: 'audio', label: 'AUDIO & SOUNDSCAPE', icon: Volume2 },
 { id: 'graphics', label: 'GRAPHICS & RENDERING', icon: Monitor },
 { id: 'gameplay', label: 'SIMULATION & AUTOSAVE', icon: Gamepad2 },
 { id: 'controls', label: 'KEYBOARD & CONTROLS', icon: Keyboard },
 ].map((tab) => {
 const Icon = tab.icon;
 const isSelected = activeTab === tab.id;
 return (
 <button
 key={tab.id}
 onClick={() => setActiveTab(tab.id as any)}
 className={`flex items-center gap-2 px-4 py-2.5 text-xs font-heading font-bold uppercase tracking-wider border-b-2 transition-colors ${
 isSelected
 ? 'border-[#E8E8E8] text-[#E8E8E8] bg-[#0E1524]'
 : 'border-transparent text-[#64748B] hover:text-white'
 }`}
 >
 <Icon className="w-3.5 h-3.5" />
 <span>{tab.label}</span>
 </button>
 );
 })}
 </div>

 {/* Tab Content */}
 <div className="flex-1 overflow-y-auto p-6 space-y-6">
 {activeTab === 'audio' && (
 <div className="space-y-5">

 {/* Music Volume */}
 <div className="p-4 bg-[#0E1524] border border-[#1E293B]">
 <div className="flex items-center justify-between mb-2">
 <label className="text-xs font-heading font-bold text-white uppercase">MUSIC VOLUME</label>
 <span className="text-xs font-mono text-[#E8E8E8]">{radioSettings.musicEnabled ? `${Math.round(radioSettings.musicVolume * 100)}%` : 'OFF'}</span>
 </div>
 <div className="flex items-center gap-2 mb-2">
 <input id="settings-music-enabled" name="musicEnabled" type="checkbox" checked={radioSettings.musicEnabled} onChange={(e) => { const patch = { musicEnabled: e.target.checked }; soundService.updateSettings(patch); setRadioSettings((prev) => ({ ...prev, ...patch })); }} className="w-4 h-4 accent-[#E8E8E8]" />
 <span className="text-[11px] font-mono text-[#94A3B8]">ENABLE MUSIC</span>
 </div>
 <input id="settings-music-volume" name="musicVolume" type="range" min="0" max="1" step="0.05" disabled={!radioSettings.musicEnabled} value={radioSettings.musicVolume} onChange={(e) => { const patch = { musicVolume: Number(e.target.value) }; soundService.updateSettings(patch); setRadioSettings((prev) => ({ ...prev, ...patch })); }} className="w-full h-1.5 bg-[#1E293B] appearance-none cursor-pointer accent-[#E8E8E8] disabled:opacity-40" />
 </div>

 {/* Ambient Volume */}
 <div className="p-4 bg-[#0E1524] border border-[#1E293B]">
 <div className="flex items-center justify-between mb-2">
 <label className="text-xs font-heading font-bold text-white uppercase">AMBIENT SOUNDSCAPE VOLUME</label>
 <span className="text-xs font-mono text-[#E8E8E8]">{radioSettings.ambientEnabled ? `${Math.round(radioSettings.ambientVolume * 100)}%` : 'OFF'}</span>
 </div>
 <div className="flex items-center gap-2 mb-2">
 <input id="settings-ambient-enabled" name="ambientEnabled" type="checkbox" checked={radioSettings.ambientEnabled} onChange={(e) => { const patch = { ambientEnabled: e.target.checked }; soundService.updateSettings(patch); setRadioSettings((prev) => ({ ...prev, ...patch })); }} className="w-4 h-4 accent-[#E8E8E8]" />
 <span className="text-[11px] font-mono text-[#94A3B8]">ENABLE AMBIENT SOUNDSCAPE</span>
 </div>
 <input id="settings-ambient-volume" name="ambientVolume" type="range" min="0" max="1" step="0.05" disabled={!radioSettings.ambientEnabled} value={radioSettings.ambientVolume} onChange={(e) => { const patch = { ambientVolume: Number(e.target.value) }; soundService.updateSettings(patch); setRadioSettings((prev) => ({ ...prev, ...patch })); }} className="w-full h-1.5 bg-[#1E293B] appearance-none cursor-pointer accent-[#E8E8E8] disabled:opacity-40" />
 </div>

 {/* SFX Volume */}
 <div className="p-4 bg-[#0E1524] border border-[#1E293B]">
 <div className="flex items-center justify-between mb-2">
 <label className="text-xs font-heading font-bold text-white uppercase">SOUND EFFECTS VOLUME</label>
 <span className="text-xs font-mono text-[#E8E8E8]">{radioSettings.sfxEnabled ? `${Math.round(radioSettings.sfxVolume * 100)}%` : 'OFF'}</span>
 </div>
 <div className="flex items-center gap-2 mb-2">
 <input id="settings-sfx-enabled" name="sfxEnabled" type="checkbox" checked={radioSettings.sfxEnabled} onChange={(e) => { const patch = { sfxEnabled: e.target.checked }; soundService.updateSettings(patch); setRadioSettings((prev) => ({ ...prev, ...patch })); }} className="w-4 h-4 accent-[#E8E8E8]" />
 <span className="text-[11px] font-mono text-[#94A3B8]">ENABLE SOUND EFFECTS</span>
 </div>
 <input id="settings-sfx-volume" name="sfxVolume" type="range" min="0" max="1" step="0.05" disabled={!radioSettings.sfxEnabled} value={radioSettings.sfxVolume} onChange={(e) => { const patch = { sfxVolume: Number(e.target.value) }; soundService.updateSettings(patch); setRadioSettings((prev) => ({ ...prev, ...patch })); }} className="w-full h-1.5 bg-[#1E293B] appearance-none cursor-pointer accent-[#E8E8E8] disabled:opacity-40" />
 </div>

 {/* Radio Voice Controls */}
 <div className="p-4 bg-[#0E1524] border border-emerald-500/40">
 <div className="flex items-center justify-between mb-2">
 <label className="text-xs font-heading font-bold text-emerald-300 uppercase">
 RADIO CHARACTER VOICE VOLUME
 </label>
 <span className="text-xs font-mono text-[#E8E8E8]">{radioSettings.radioVoiceEnabled !== false ? `${Math.round((radioSettings.radioVoiceVolume ?? 0.9) * 100)}%` : 'OFF'}</span>
 </div>
 <div className="flex items-center gap-2 mb-2">
 <input
 type="checkbox"
 checked={radioSettings.radioVoiceEnabled !== false}
 onChange={(e) => {
 const patch = { radioVoiceEnabled: e.target.checked };
 soundService.updateSettings(patch);
 setRadioSettings((prev) => ({ ...prev, ...patch }));
 }}
 className="w-4 h-4 accent-emerald-400 cursor-pointer"
 />
 <span className="text-[11px] font-mono text-[#94A3B8]">ENABLE BROWSER RADIO VOICES</span>
 </div>
 <input
 type="range"
 min="0"
 max="1"
 step="0.05"
 disabled={radioSettings.radioVoiceEnabled === false}
 value={radioSettings.radioVoiceVolume ?? 0.9}
 onChange={(e) => {
 const patch = { radioVoiceVolume: Number(e.target.value) };
 soundService.updateSettings(patch);
 setRadioSettings((prev) => ({ ...prev, ...patch }));
 }}
 className="w-full h-1.5 bg-[#1E293B] appearance-none cursor-pointer accent-emerald-400"
 />
 <div className="mt-2 text-[10px] font-mono text-[#64748B]">Uses free browser speech synthesis. Different characters use different voices, pitch, and speaking rate.</div>
 <div className="grid grid-cols-1 gap-1.5 mt-3">
 {(['vance', 'operator', 'system'] as const).map((character) => (
 <label key={character} className="flex items-center justify-between gap-2 text-[10px] font-mono text-[#94A3B8]">
 <span className="uppercase">{character} voice</span>
 <select
 value={radioSettings.radioVoiceAssignments?.[character] || ''}
 onChange={(e) => {
  const assignments: Record<RadioVoiceCharacter, string> = {
    vance: '',
    operator: '',
    system: '',
    ...(radioSettings.radioVoiceAssignments || {}),
    [character]: e.target.value,
  };
  soundService.updateSettings({ radioVoiceAssignments: assignments });
  setRadioSettings((prev) => ({ ...prev, radioVoiceAssignments: assignments }));
 }}
 className="min-w-0 flex-1 bg-[#080C14] border border-[#24334A] text-[#CBD5E1] px-1.5 py-1"
 >
 <option value="">Automatic distinct voice</option>
 {availableVoices.map((voice) => <option key={voice.name} value={voice.name}>{voice.name} ({voice.lang})</option>)}
 </select>
 </label>
 ))}
 </div>
 </div>

 {/* Ambient Soundscape Toggle */}
 <div className="p-4 bg-[#0E1524] border border-[#1E293B] flex items-center justify-between">
 <div>
 <div className="text-xs font-heading font-bold text-white uppercase">
 DYNAMIC DAY/NIGHT AMBIENT SOUNDSCAPE
 </div>
 <div className="text-[11px] font-mono text-[#64748B] mt-0.5">
 Procedural wind, cricket night ambiance, generator hums, and horde threat drones
 </div>
 </div>
 <input
 type="checkbox"
 checked={radioSettings.ambientEnabled}
 onChange={(e) => { const patch = { ambientEnabled: e.target.checked }; soundService.updateSettings(patch); setRadioSettings((prev) => ({ ...prev, ...patch })); }}
 className="w-5 h-5 accent-[#E8E8E8] cursor-pointer"
 />
 </div>
 </div>
 )}

 {activeTab === 'graphics' && (
 <div className="space-y-5">
 {/* Graphics Quality Preset */}
 <div className="p-4 bg-[#0E1524] border border-[#1E293B]">
 <div className="flex items-center justify-between mb-2">
 <label className="text-xs font-heading font-bold text-white uppercase">
 GRAPHICS QUALITY
 </label>
 <span className="text-xs font-mono text-[#E8E8E8] uppercase">{settings.graphicsQuality ?? 'high'}</span>
 </div>
 <div className="text-[10px] font-mono text-[#64748B] mb-2">
 Lower presets cull full-detail buildings beyond a distance from the camera (helps FPS in tilted/zoomed-out views)
 </div>
 <div className="grid grid-cols-3 gap-2">
 {(['high', 'medium', 'low'] as const).map((q) => (
 <button
 key={q}
 onClick={() => handleUpdate({ graphicsQuality: q })}
 className={`p-2 text-xs font-mono uppercase border transition-colors ${
 (settings.graphicsQuality ?? 'high') === q
 ? 'bg-[#1E293B] border-[#E8E8E8] text-white'
 : 'bg-[#080C14] border-[#1C283B] text-[#64748B] hover:text-white'
 }`}
 >
 {q}
 </button>
 ))}
 </div>
 </div>

 {/* Fullscreen Mode */}
 <div className="p-4 bg-[#0E1524] border border-[#1E293B] flex items-center justify-between">
 <div>
 <div className="text-xs font-heading font-bold text-white uppercase">FULLSCREEN MODE</div>
 <div className="text-[10px] font-mono text-[#64748B]">
 {fullscreenSupported ? 'Toggle the game between windowed and fullscreen display' : 'Fullscreen is not supported by this browser or context'}
 </div>
 </div>
 <input
 type="checkbox"
 checked={isFullscreen}
 disabled={!fullscreenSupported}
 onChange={handleFullscreenToggle}
 className="w-4 h-4 accent-[#E8E8E8] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
 />
 </div>

 {/* Elevation Exaggeration */}
 <div className="p-4 bg-[#0E1524] border border-[#1E293B]">
 <div className="flex items-center justify-between mb-2">
 <label className="text-xs font-heading font-bold text-white uppercase">
 TERRAIN ELEVATION EXAGGERATION
 </label>
 <span className="text-xs font-mono text-[#E8E8E8]">{settings.elevationExaggeration}x</span>
 </div>
 <div className="grid grid-cols-3 gap-2">
 {[0.5, 1.0, 2.0].map((val) => (
 <button
 key={val}
 onClick={() => handleUpdate({ elevationExaggeration: val })}
 className={`p-2 text-xs font-mono border transition-colors ${
 settings.elevationExaggeration === val
 ? 'bg-[#1E293B] border-[#E8E8E8] text-white'
 : 'bg-[#080C14] border-[#1C283B] text-[#64748B] hover:text-white'
 }`}
 >
 {val}x {val === 1.0 ? '(Realistic)' : val > 1 ? '(Dramatic Hills)' : '(Flatter)'}
 </button>
 ))}
 </div>
 </div>

 {/* Visual Toggles */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 <div className="p-4 bg-[#0E1524] border border-[#1E293B] flex items-center justify-between">
 <div>
 <div className="text-xs font-heading font-bold text-white uppercase">TERRAIN WIREFRAME</div>
 <div className="text-[10px] font-mono text-[#64748B]">Display tactical elevation contour grid</div>
 </div>
 <input
 type="checkbox"
 checked={settings.showTerrainWireframe}
 onChange={(e) => handleUpdate({ showTerrainWireframe: e.target.checked })}
 className="w-4 h-4 accent-[#E8E8E8] cursor-pointer"
 />
 </div>

 <div className="p-4 bg-[#0E1524] border border-[#1E293B] flex items-center justify-between">
 <div>
 <div className="text-xs font-heading font-bold text-white uppercase">BUILDING EDGE HIGHLIGHTS</div>
 <div className="text-[10px] font-mono text-[#64748B]">Outline architectural rooftop perimeters</div>
 </div>
 <input
 type="checkbox"
 checked={settings.showBuildingEdges}
 onChange={(e) => handleUpdate({ showBuildingEdges: e.target.checked })}
 className="w-4 h-4 accent-[#E8E8E8] cursor-pointer"
 />
 </div>

 <div className="p-4 bg-[#0E1524] border border-[#1E293B] flex items-center justify-between md:col-span-2">
 <div>
 <div className="text-xs font-heading font-bold text-white uppercase">DISABLE ELEVATION DATA (FLAT MESH)</div>
 <div className="text-[10px] font-mono text-[#64748B]">
 Flattens terrain elevation to prevent road meshes clipping on steep curated maps
 </div>
 </div>
 <input
 type="checkbox"
 checked={settings.disableElevation ?? false}
 onChange={(e) => handleUpdate({ disableElevation: e.target.checked })}
 className="w-4 h-4 accent-[#E8E8E8] cursor-pointer"
 />
 </div>
 </div>
 </div>
 )}

 {activeTab === 'gameplay' && (
 <div className="space-y-5">
 {/* Autosave Interval */}
 <div className="p-4 bg-[#0E1524] border border-[#1E293B]">
 <label className="block text-xs font-heading font-bold text-white uppercase mb-2">
 TACTICAL AUTOSAVE FREQUENCY
 </label>
 <div className="grid grid-cols-3 gap-2">
 {[
 { val: 1, label: 'EVERY IN-GAME DAY (DAWN)' },
 { val: 3, label: 'EVERY 3 DAYS' },
 { val: 0, label: 'DISABLED (MANUAL ONLY)' },
 ].map((opt) => (
 <button
 key={opt.val}
 onClick={() => handleUpdate({ autosaveIntervalDays: opt.val })}
 className={`p-2.5 text-xs font-mono border transition-colors ${
 settings.autosaveIntervalDays === opt.val
 ? 'bg-[#1E293B] border-[#E8E8E8] text-white'
 : 'bg-[#080C14] border-[#1C283B] text-[#64748B] hover:text-white'
 }`}
 >
 {opt.label}
 </button>
 ))}
 </div>
 </div>

 {/* Pause Events */}
 <div className="space-y-3">
 <div className="p-4 bg-[#0E1524] border border-[#1E293B] flex items-center justify-between">
 <div>
 <div className="text-xs font-heading font-bold text-white uppercase">
 AUTO-PAUSE AT NIGHTFALL (20:00)
 </div>
 <div className="text-[10px] font-mono text-[#64748B]">
 Pause time velocity at dusk to review defensive positions
 </div>
 </div>
 <input
 type="checkbox"
 checked={settings.pauseOnNightfall}
 onChange={(e) => handleUpdate({ pauseOnNightfall: e.target.checked })}
 className="w-4 h-4 accent-[#E8E8E8] cursor-pointer"
 />
 </div>

 <div className="p-4 bg-[#0E1524] border border-[#1E293B] flex items-center justify-between">
 <div>
 <div className="text-xs font-heading font-bold text-white uppercase">
 AUTO-PAUSE ON MAJOR INFECTION RAID
 </div>
 <div className="text-[10px] font-mono text-[#64748B]">
 Pause simulation when massive swarms or lairs trigger an assault
 </div>
 </div>
 <input
 type="checkbox"
 checked={settings.pauseOnRaid}
 onChange={(e) => handleUpdate({ pauseOnRaid: e.target.checked })}
 className="w-4 h-4 accent-[#E8E8E8] cursor-pointer"
 />
 </div>
 </div>
 </div>
 )}

 {activeTab === 'controls' && (
 <div className="space-y-3">
 <div className="text-xs font-mono text-[#94A3B8] uppercase mb-2">
 STANDARD TACTICAL RTS KEYBOARD SHORTCUTS
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
 {[
 { key: 'ESC', action: 'Open Tactical Menu / Cancel Selection' },
 { key: 'F5', action: 'Quick Save Current Expedition' },
 { key: 'F9', action: 'Quick Load Most Recent Checkpoint' },
 { key: 'SPACE', action: 'Pause / Resume Simulation' },
 { key: '1, 2, 3, 4', action: 'Simulation Velocity (1x, 2x, 4x)' },
 { key: 'W, A, S, D / Arrows', action: 'Pan Camera Across World Map' },
 { key: 'Right Click', action: 'Order Selected Squad Move / Attack' },
 { key: 'Left Click', action: 'Select Building, Vehicle, or Squad' },
 { key: 'Mouse Scroll', action: 'Zoom In / Out' },
 { key: 'Middle Mouse Drag', action: 'Rotate 3D Tactical Camera Angle' },
 ].map((binding, idx) => (
 <div
 key={idx}
 className="flex items-center justify-between p-2.5 bg-[#0E1524] border border-[#1E293B]"
 >
 <span className="text-[#E8E8E8] font-bold px-2 py-0.5 bg-[#142033] border border-[#233550]">
 {binding.key}
 </span>
 <span className="text-[#94A3B8]">{binding.action}</span>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>

 {/* Footer */}
 <div className="flex items-center justify-between px-6 py-4 border-t border-[#1E293B] bg-[#0E1524]">
 <button
 onClick={handleReset}
 className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#121826] hover:bg-[#1E293B] border border-[#24334A] text-xs font-mono text-[#94A3B8] hover:text-white transition-colors"
 >
 <RotateCcw className="w-3.5 h-3.5" />
 <span>RESET DEFAULTS</span>
 </button>

 <div className="flex items-center gap-3">
 <button
 onClick={onClose}
 className="px-4 py-2 bg-[#121826] hover:bg-[#1E293B] border border-[#24334A] text-xs font-mono text-[#94A3B8] hover:text-white transition-colors"
 >
 CANCEL
 </button>
 <button
 onClick={handleSave}
 className="flex items-center gap-2 px-5 py-2 bg-[#475569] hover:bg-[#64748B] text-white text-xs font-heading font-bold uppercase transition-all"
 >
 {saveSuccess ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
 <span>{saveSuccess ? 'CONFIG APPLIED' : 'APPLY & SAVE'}</span>
 </button>
 </div>
 </div>
 </div>
 </div>
 );
};
