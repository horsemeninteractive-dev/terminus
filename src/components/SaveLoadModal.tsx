import React, { useEffect, useState, useRef } from 'react';
import {
 X,
 FolderOpen,
 Save,
 Trash2,
 Download,
 Upload,
 Clock,
 MapPin,
 Users,
 Sparkles,
 Shield,
 Check,
 AlertCircle,
 Plus,
 RefreshCw,
} from 'lucide-react';
import { SaveGameData, SaveGameMeta } from '../types/saveGame';
import { saveService } from '../services/saveService';
import { soundService } from '../services/soundService';

interface SaveLoadModalProps {
 isOpen: boolean;
 initialMode?: 'save' | 'load';
 mode?: 'save' | 'load';
 onClose: () => void;
 onLoadGame: (saveId: string) => void;
 onSaveCurrentGame?: (saveName: string, overwriteId?: string) => void;
 onSaveGame?: (saveName: string, overwriteId?: string) => void;
 currentColonyName?: string;
 activeColonyName?: string;
 currentDay?: number;
 activeDayNumber?: number;
}

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({
 isOpen,
 initialMode = 'load',
 mode: propMode,
 onClose,
 onLoadGame,
 onSaveCurrentGame,
 onSaveGame,
 currentColonyName,
 activeColonyName,
 currentDay,
 activeDayNumber,
}) => {
 const effectiveColonyName = activeColonyName || currentColonyName || 'Outpost Alpha';
 const effectiveDay = activeDayNumber ?? currentDay ?? 1;
 const effectiveSaveHandler = onSaveGame || onSaveCurrentGame;
 const startMode = propMode || initialMode;

 const [mode, setMode] = useState<'save' | 'load'>(startMode);
 const [saves, setSaves] = useState<SaveGameMeta[]>([]);
 const [selectedSaveId, setSelectedSaveId] = useState<string | null>(null);
 const [newSaveName, setNewSaveName] = useState<string>(`${effectiveColonyName} - Day ${effectiveDay}`);
 const [isDeleting, setIsDeleting] = useState<string | null>(null);
 const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
 const fileInputRef = useRef<HTMLInputElement>(null);

 useEffect(() => {
 setMode(propMode || initialMode);
 setNewSaveName(`${effectiveColonyName} - Day ${effectiveDay}`);
 refreshSaves();
 }, [initialMode, propMode, isOpen, effectiveColonyName, effectiveDay]);

 const refreshSaves = () => {
 const list = saveService.listSaves();
 setSaves(list);
 if (list.length > 0 && !selectedSaveId) {
 setSelectedSaveId(list[0].id);
 }
 };

 if (!isOpen) return null;

 const handleSelectSave = (id: string) => {
 setSelectedSaveId(id);
 soundService.playCombatActionSFX('assault_order');
 };

 const handlePerformLoad = () => {
 if (!selectedSaveId) return;
 soundService.playCombatActionSFX('assault_order');
 onLoadGame(selectedSaveId);
 onClose();
 };

 const handlePerformSave = () => {
 if (!effectiveSaveHandler) return;
 const name = newSaveName.trim() || `${effectiveColonyName} - Day ${effectiveDay}`;
 soundService.playCombatActionSFX('assault_order');
 effectiveSaveHandler(name);
 setStatusMessage({ text: 'Game saved successfully!', type: 'success' });
 setTimeout(() => {
 refreshSaves();
 setStatusMessage(null);
 }, 800);
 };

 const handleOverwrite = (id: string) => {
 if (!effectiveSaveHandler) return;
 const target = saves.find((s) => s.id === id);
 const name = target ? target.name : newSaveName;
 soundService.playCombatActionSFX('assault_order');
 effectiveSaveHandler(name, id);
 setStatusMessage({ text: 'Save overwritten successfully!', type: 'success' });
 setTimeout(() => {
 refreshSaves();
 setStatusMessage(null);
 }, 800);
 };

 const handleDelete = (id: string) => {
 soundService.playCombatActionSFX('assault_order');
 const ok = saveService.deleteSave(id);
 if (ok) {
 if (selectedSaveId === id) setSelectedSaveId(null);
 refreshSaves();
 setIsDeleting(null);
 }
 };

 const handleExport = (id: string) => {
 const json = saveService.exportSaveJson(id);
 if (!json) return;
 const blob = new Blob([json], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `terminus_save_${id}.json`;
 a.click();
 URL.revokeObjectURL(url);
 };

 const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;
 const reader = new FileReader();
 reader.onload = (event) => {
 const content = event.target?.result as string;
 if (content) {
 const meta = saveService.importSaveJson(content);
 if (meta) {
 refreshSaves();
 setSelectedSaveId(meta.id);
 setStatusMessage({ text: 'Save file imported successfully!', type: 'success' });
 } else {
 setStatusMessage({ text: 'Failed to import save file.', type: 'error' });
 }
 }
 };
 reader.readAsText(file);
 };

 const selectedSave = saves.find((s) => s.id === selectedSaveId);

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
 <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0B0F19] border-2 border-[#24334A] overflow-hidden text-[#CBD5E1] font-sans clip-tactical-bracket surface-bevel">
 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E293B] bg-[#0E1524]">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-[#1E293B] border border-[#E8E8E8]/40 text-[#E8E8E8]">
 {mode === 'save' ? <Save className="w-5 h-5" /> : <FolderOpen className="w-5 h-5" />}
 </div>
 <div>
 <h2 className="text-xl font-heading font-black tracking-wide text-white uppercase">
 {mode === 'save' ? 'SAVE EXPEDITION PROGRESS' : 'LOAD SAVED EXPEDITION'}
 </h2>
 <p className="text-xs font-mono text-[#94A3B8]">
 {mode === 'save'
 ? 'Record active settlement state and defense coordinates to local storage'
 : 'Resume tactical simulation from a prior expedition checkpoint'}
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

 {/* Mode Switch Tabs */}
 <div className="flex items-center justify-between border-b border-[#1E293B] bg-[#090D15] px-6">
 <div className="flex">
 <button
 onClick={() => setMode('load')}
 className={`px-5 py-2.5 text-xs font-heading font-bold uppercase tracking-wider border-b-2 transition-colors ${
 mode === 'load'
 ? 'border-[#E8E8E8] text-[#E8E8E8] bg-[#0E1524]'
 : 'border-transparent text-[#64748B] hover:text-white'
 }`}
 >
 LOAD MISSION ({saves.length})
 </button>
 {onSaveCurrentGame && (
 <button
 onClick={() => setMode('save')}
 className={`px-5 py-2.5 text-xs font-heading font-bold uppercase tracking-wider border-b-2 transition-colors ${
 mode === 'save'
 ? 'border-[#E8E8E8] text-[#E8E8E8] bg-[#0E1524]'
 : 'border-transparent text-[#64748B] hover:text-white'
 }`}
 >
 SAVE CURRENT MISSION
 </button>
 )}
 </div>

 {/* Import Button */}
 <div className="flex items-center gap-2">
 <input
 id="save-import-file"
 name="saveImportFile"
 type="file"
 ref={fileInputRef}
 onChange={handleImportFile}
 accept=".json"
 className="hidden"
 />
 <button
 onClick={() => fileInputRef.current?.click()}
 className="flex items-center gap-1.5 px-3 py-1 bg-[#121826] hover:bg-[#1E293B] border border-[#24334A] text-[11px] font-mono text-[#94A3B8] hover:text-white transition-colors"
 >
 <Upload className="w-3.5 h-3.5" />
 <span>IMPORT JSON</span>
 </button>
 </div>
 </div>

 {/* Status Alert if any */}
 {statusMessage && (
 <div
 className={`px-6 py-2 text-xs font-mono flex items-center gap-2 ${
 statusMessage.type === 'success'
 ? 'bg-emerald-950/60 border-b border-emerald-800/80 text-emerald-300'
 : 'bg-red-950/60 border-b border-red-800/80 text-red-300'
 }`}
 >
 <Check className="w-3.5 h-3.5" />
 <span>{statusMessage.text}</span>
 </div>
 )}

 {/* Content Area */}
 <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-[#1E293B]">
 {/* Left Column: Save List */}
 <div className="md:col-span-7 p-4 overflow-y-auto max-h-[55vh] space-y-2.5">
 {/* Create New Save Slot (in Save Mode) */}
 {mode === 'save' && (
 <div className="p-3.5 bg-[#121D30] border border-[#E8E8E8]/50 mb-4">
 <div className="text-xs font-heading font-bold text-[#E8E8E8] uppercase mb-1.5 flex items-center gap-1.5">
 <Plus className="w-4 h-4" />
 <span>CREATE NEW SAVE RECORD</span>
 </div>
 <div className="flex gap-2">
 <input
 id="new-save-name"
 name="saveName"
 type="text"
 value={newSaveName}
 onChange={(e) => setNewSaveName(e.target.value)}
 className="flex-1 px-3 py-1.5 bg-[#080C14] border border-[#24334A] text-white font-mono text-xs outline-none focus:border-[#E8E8E8]"
 placeholder="Enter save designation"
 />
 <button
 onClick={handlePerformSave}
 className="px-4 py-1.5 bg-[#475569] hover:bg-[#64748B] text-white text-xs font-heading font-bold uppercase transition-colors"
 >
 SAVE
 </button>
 </div>
 </div>
 )}

 {saves.length === 0 ? (
 <div className="p-8 text-center text-xs font-mono text-[#64748B]">
 <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
 No saved mission files detected.
 </div>
 ) : (
 saves.map((s) => {
 const isSelected = s.id === selectedSaveId;
 return (
 <div
 key={s.id}
 onClick={() => handleSelectSave(s.id)}
 className={`cursor-pointer p-3.5 border transition-all ${
 isSelected
 ? 'bg-[#131E33] border-[#E8E8E8] '
 : 'bg-[#0E1524] hover:bg-[#152033] border-[#1E293B]'
 }`}
 >
 <div className="flex items-start justify-between">
 <div className="flex-1">
 <div className="flex items-center gap-2">
 <h4 className="text-sm font-heading font-black text-white uppercase tracking-wide">
 {s.name}
 </h4>
 <span
 className={`text-[9px] font-mono px-1.5 py-0.5 border ${
 s.type === 'autosave'
 ? 'bg-amber-950/40 border-amber-800 text-amber-300'
 : s.type === 'quicksave'
 ? 'bg-purple-950/40 border-purple-800 text-purple-300'
 : 'bg-[#1E293B] border-[#E8E8E8]/40 text-[#E8E8E8]'
 }`}
 >
 {s.type.toUpperCase()}
 </span>
 </div>
 <div className="flex items-center gap-2 text-xs font-mono text-[#94A3B8] mt-1">
 <MapPin className="w-3 h-3 text-[#E8E8E8]" />
 <span>{s.colonyName} ({s.sectorName})</span>
 </div>
 </div>

 <div className="text-right text-[10px] font-mono text-[#64748B]">
 <div>{s.formattedDate}</div>
 <div className="text-[#E8E8E8] font-bold">DAY {s.day}</div>
 </div>
 </div>
 </div>
 );
 })
 )}
 </div>

 {/* Right Column: Selected Save Details & Quick Actions */}
 <div className="md:col-span-5 p-6 bg-[#090D16] flex flex-col justify-between overflow-y-auto">
 {selectedSave ? (
 <div className="space-y-4">
 <div>
 <span className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider">
 SELECTED MISSION INTEL
 </span>
 <h3 className="text-xl font-heading font-black text-white tracking-wide mt-0.5">
 {selectedSave.name}
 </h3>
 <div className="text-xs font-mono text-[#E8E8E8] mt-0.5">
 {selectedSave.sectorName}, {selectedSave.country}
 </div>
 </div>

 {/* Details Grid */}
 <div className="grid grid-cols-2 gap-2.5 pt-2">
 <div className="p-2.5 bg-[#0E1524] border border-[#1E293B]">
 <div className="text-[10px] font-mono text-[#64748B] uppercase">SURVIVORS</div>
 <div className="text-base font-heading font-bold text-white mt-0.5 flex items-center gap-1.5">
 <Users className="w-3.5 h-3.5 text-[#E8E8E8]" />
 <span>{selectedSave.survivorCount} (Squads: {selectedSave.squadCount})</span>
 </div>
 </div>

 <div className="p-2.5 bg-[#0E1524] border border-[#1E293B]">
 <div className="text-[10px] font-mono text-[#64748B] uppercase">COLONY MORALE</div>
 <div className="text-base font-heading font-bold text-white mt-0.5 flex items-center gap-1.5">
 <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
 <span>{selectedSave.morale}%</span>
 </div>
 </div>

 <div className="p-2.5 bg-[#0E1524] border border-[#1E293B]">
 <div className="text-[10px] font-mono text-[#64748B] uppercase">IN-GAME TIME</div>
 <div className="text-base font-heading font-bold text-white mt-0.5 flex items-center gap-1.5">
 <Clock className="w-3.5 h-3.5 text-amber-400" />
 <span>Day {selectedSave.day}, {String(selectedSave.hour).padStart(2, '0')}:00</span>
 </div>
 </div>

 <div className="p-2.5 bg-[#0E1524] border border-[#1E293B]">
 <div className="text-[10px] font-mono text-[#64748B] uppercase">CLIMATE & SEASON</div>
 <div className="text-base font-heading font-bold text-white mt-0.5 capitalize">
 {selectedSave.season} ({selectedSave.weather})
 </div>
 </div>
 </div>

 {/* Slot Management Buttons */}
 <div className="pt-4 border-t border-[#1E293B] flex items-center gap-2">
 <button
 onClick={() => handleExport(selectedSave.id)}
 title="Export JSON"
 className="flex-1 flex items-center justify-center gap-1.5 p-2 bg-[#101726] hover:bg-[#1E293B] border border-[#24334A] text-xs font-mono text-[#94A3B8] hover:text-white transition-colors"
 >
 <Download className="w-3.5 h-3.5" />
 <span>EXPORT</span>
 </button>

 {mode === 'save' && (
 <button
 onClick={() => handleOverwrite(selectedSave.id)}
 className="flex-1 flex items-center justify-center gap-1.5 p-2 bg-[#1E293B] hover:bg-[#2A374A] border border-[#E8E8E8]/50 text-xs font-mono text-[#E8E8E8] hover:text-white transition-colors"
 >
 <Save className="w-3.5 h-3.5" />
 <span>OVERWRITE</span>
 </button>
 )}

 <button
 onClick={() => {
 if (isDeleting === selectedSave.id) {
 handleDelete(selectedSave.id);
 } else {
 setIsDeleting(selectedSave.id);
 }
 }}
 className={`flex items-center justify-center gap-1.5 p-2 border text-xs font-mono transition-colors ${
 isDeleting === selectedSave.id
 ? 'bg-red-900/80 border-red-500 text-white'
 : 'bg-[#101726] hover:bg-red-950/40 border-[#24334A] text-red-400'
 }`}
 >
 <Trash2 className="w-3.5 h-3.5" />
 <span>{isDeleting === selectedSave.id ? 'CONFIRM' : 'DELETE'}</span>
 </button>
 </div>
 </div>
 ) : (
 <div className="p-8 text-center text-xs font-mono text-[#64748B]">
 Select a saved mission from the list to view tactical metrics.
 </div>
 )}

 {/* Main Action (Load or Save) */}
 <div className="pt-4 border-t border-[#1E293B]">
 {mode === 'load' ? (
 <button
 disabled={!selectedSaveId}
 onClick={handlePerformLoad}
 className="w-full flex items-center justify-center gap-2 py-3 bg-[#475569] hover:bg-[#64748B] disabled:bg-[#1E293B] disabled:text-[#64748B] text-white font-heading font-bold tracking-wider uppercase transition-all"
 >
 <FolderOpen className="w-4 h-4" />
 <span>LOAD EXPEDITION</span>
 </button>
 ) : (
 <button
 onClick={handlePerformSave}
 className="w-full flex items-center justify-center gap-2 py-3 bg-[#475569] hover:bg-[#64748B] text-white font-heading font-bold tracking-wider uppercase transition-all"
 >
 <Save className="w-4 h-4" />
 <span>SAVE EXPEDITION RECORD</span>
 </button>
 )}
 </div>
 </div>
 </div>
 </div>
 </div>
 );
};
