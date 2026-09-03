import React, { useState } from 'react';
import {
 Activity,
 AlertOctagon,
 AlertTriangle,
 Award,
 Bed,
 CheckCircle2,
 Clock,
 HeartPulse,
 Info,
 Lock,
 Pill,
 Radio,
 Shield,
 ShieldAlert,
 ShieldCheck,
 Skull,
 Stethoscope,
 Unlock,
 UserCheck,
 UserX,
 Users,
 X,
 Zap,
} from 'lucide-react';
import {
 BuildingOutbreakState,
 CheckupDiagnosis,
 InfectionStage,
 SurvivorInfection,
 TreatmentResult,
} from '../types/infection';
import { NamedSurvivor } from '../types/population';
import { AdaptedBuilding, SettlementState } from '../types/settlement';
import { getPrimaryHQ, isBuildingOperational } from '../services/buildingOperational';
import {
 administerTreatment,
 createSurvivorInfection,
 diagnoseSurvivor,
 toggleQuarantineSurvivor,
 containOutbreakInBuilding,
} from '../services/infectionService';

interface MedicalTriageModalProps {
 isOpen: boolean;
 onClose: () => void;
 settlement: SettlementState;
 onUpdateSettlement: (newState: SettlementState) => void;
 onSelectBuilding?: (buildingId: string | number) => void;
}

export const MedicalTriageModal: React.FC<MedicalTriageModalProps> = ({
 isOpen,
 onClose,
 settlement,
 onUpdateSettlement,
 onSelectBuilding,
}) => {
 const [selectedSurvivorId, setSelectedSurvivorId] = useState<string | null>(null);
 const [diagnosisResult, setDiagnosisResult] = useState<CheckupDiagnosis | null>(null);
 const [treatmentFeedback, setTreatmentFeedback] = useState<TreatmentResult | null>(null);
 const [filterMode, setFilterMode] = useState<'all' | 'infected' | 'quarantined'>('all');

 if (!isOpen) return null;

 const { namedSurvivors, stockpile, infections, outbreaks, adaptedBuildings } = settlement;

 // Find Doctor / Chief Medical Officer
 const doctor = namedSurvivors.find(
 (s) => s.stats.medical === 'expert' || s.role.type === 'building_head'
 ) || namedSurvivors.find((s) => s.stats.medical === 'skilled');

 const doctorBonus = doctor
 ? doctor.stats.medical === 'expert'
 ? 20
 : doctor.stats.medical === 'skilled'
 ? 10
 : 5
 : 0;

 // Find Infirmary Buildings (canonical Medbay or legacy Infirmary Clinic)
 const infirmaries = (Array.from(adaptedBuildings.values()) as AdaptedBuilding[]).filter(
 (b) => (b.typeId === 'infirmary_clinic' || b.typeId === 'medbay') && isBuildingOperational(b)
 );
 const hasOperationalMedbay = infirmaries.length > 0;

 // Count active stats
 const infectionsList = Array.from(infections.values()) as SurvivorInfection[];
 const activeInfections = infectionsList.filter(
 (inf) => inf.stage !== 'uninfected' && inf.stage !== 'cured' && inf.stage !== 'turned'
 );
 const symptomaticCount = activeInfections.filter(
 (inf) => inf.stage === 'symptomatic' || inf.stage === 'advanced'
 ).length;
 const quarantinedCount = infectionsList.filter((inf) => inf.isQuarantined).length;
 const activeOutbreaksList = (Array.from(outbreaks.values()) as BuildingOutbreakState[]).filter((o) => o.isOutbreakActive);

 // Combine survivors for listing
 const survivorList: {
 id: string;
 name: string;
 isNamed: boolean;
 namedData?: NamedSurvivor;
 infection?: SurvivorInfection;
 }[] = namedSurvivors.map((s) => ({
 id: s.id,
 name: s.name,
 isNamed: true,
 namedData: s,
 infection: infections.get(s.id),
 }));

 // Also include any general population members with active infections
 for (const [id, inf] of infections.entries()) {
 if (!inf.isNamed && inf.stage !== 'cured' && inf.stage !== 'uninfected') {
 survivorList.push({
 id,
 name: inf.survivorName,
 isNamed: false,
 infection: inf,
 });
 }
 }

 const filteredSurvivors = survivorList.filter((s) => {
 if (filterMode === 'infected') {
 return (
 s.infection &&
 s.infection.stage !== 'uninfected' &&
 s.infection.stage !== 'cured' &&
 s.infection.stage !== 'turned'
 );
 }
 if (filterMode === 'quarantined') {
 return s.infection?.isQuarantined;
 }
 return true;
 });

 const selectedSurvivor = survivorList.find((s) => s.id === selectedSurvivorId);
 const selectedInfection = selectedSurvivor?.infection;

 // Actions
 const handlePerformCheckup = (survivorId: string) => {
 const s = survivorList.find((item) => item.id === survivorId);
 if (!s) return;

 const inf = infections.get(survivorId);
 const diagnosis = diagnoseSurvivor(
 s.namedData || { id: s.id, name: s.name },
 inf,
 doctor
 );

 // If infected, mark as confirmed by Medbay
 if (inf && inf.stage !== 'cured' && inf.stage !== 'uninfected') {
 const updatedInfections = new Map(infections);
 updatedInfections.set(survivorId, {
 ...inf,
 isConfirmedByMedbay: true,
 });
 onUpdateSettlement({
 ...settlement,
 infections: updatedInfections,
 });
 }

 setDiagnosisResult(diagnosis);
 setTreatmentFeedback(null);
 };

 const handleAdministerTreatment = (survivorId: string) => {
 const { success, newState, result } = administerTreatment(
 settlement,
 survivorId,
 doctor?.id
 );
 setTreatmentFeedback(result);
 if (success) {
 onUpdateSettlement(newState);
 // Refresh diagnosis view if active
 const s = survivorList.find((item) => item.id === survivorId);
 if (s) {
 const inf = newState.infections.get(survivorId);
 setDiagnosisResult(diagnoseSurvivor(s.namedData || { id: s.id, name: s.name }, inf, doctor));
 }
 }
 };

 const handleToggleQuarantine = (survivorId: string, currentQuarantined: boolean) => {
 const primaryInfirmary = infirmaries[0];
 const { success, newState } = toggleQuarantineSurvivor(
 settlement,
 survivorId,
 !currentQuarantined,
 primaryInfirmary ? primaryInfirmary.buildingId : getPrimaryHQ(settlement)?.buildingId

 );
 if (success) {
 onUpdateSettlement(newState);
 }
 };

 const handlePurgeOutbreak = (buildingId: string | number) => {
 const { success, newState } = containOutbreakInBuilding(settlement, buildingId);
 if (success) {
 onUpdateSettlement(newState);
 }
 };

 const handleSimulateBite = (survivorId: string) => {
 const s = survivorList.find((item) => item.id === survivorId);
 if (!s) return;

 const newInf = createSurvivorInfection(
 survivorId,
 s.name,
 s.isNamed,
 'Field Zombie Attack (Simulated)'
 );

 const updatedInfections = new Map(infections);
 updatedInfections.set(survivorId, newInf);

 onUpdateSettlement({
 ...settlement,
 infections: updatedInfections,
 });

 setTreatmentFeedback({
 success: true,
 cured: false,
 turned: false,
 cureOddsPercentage: 90,
 doctorBonusPercentage: doctorBonus,
 message: `SIMULATION: ${s.name} received a zombie bite! The pathogen is now incubating in hidden stage.`,
 });
 setDiagnosisResult(null);
 };

 return (
 <div
 id="medical-triage-modal"
 className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
 >
 <div className="bg-[#121418] border border-slate-700/80 clip-tactical-bracket surface-bevel w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden font-mono text-slate-200">
 {/* Header */}
 <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0e1013]">
 <div className="flex items-center gap-3">
 <div className="p-2.5 bg-pink-500/10 border border-pink-500/30 text-pink-400">
 <Stethoscope className="w-5 h-5" />
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-wide uppercase">
 MEDBAY, TRIAGE & INFECTION COMMAND (§6.2, §6.3)
 </h2>
 {activeInfections.length > 0 && (
 <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
 {activeInfections.length} ACTIVE INFECTIONS
 </span>
 )}
 </div>
 <p className="text-xs text-slate-400">
 Pathogen Incubation, Clinical Triage, Scaled Antiviral Therapy & Isolation Containment
 </p>
 </div>
 </div>

 <button
 id="close-medbay-modal-btn"
 onClick={onClose}
 className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Global Medical Readiness & Stockpile Ribbon */}
 <div className="px-6 py-3 bg-[#15181e] border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
 {/* Medical Officer */}
 <div className="p-2.5 bg-slate-800/40 border border-slate-700/40 flex flex-col justify-between">
 <div className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
 <HeartPulse className="w-3 h-3 text-pink-400" />
 Chief Medical Officer
 </div>
 <div className="text-xs font-bold text-slate-100 mt-1 truncate">
 {doctor ? doctor.name : 'No Doctor Appointed'}
 </div>
 <div className="text-[10px] text-pink-400 mt-0.5">
 {doctor ? `+${doctorBonus}% Cure Odds Bonus (${doctor.stats.medical.toUpperCase()})` : 'Base odds only'}
 </div>
 </div>

 {/* Medbay Facility */}
 <div className="p-2.5 bg-slate-800/40 border border-slate-700/40 flex flex-col justify-between">
 <div className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
 <Bed className="w-3 h-3 text-[#CBD5E1]" />
 Medbay Facilities
 </div>
 <div className="text-xs font-bold text-slate-100 mt-1">
 {hasOperationalMedbay ? `${infirmaries.length} Operational Clinic` : 'HQ Emergency Ward'}
 </div>
 <div className="text-[10px] text-slate-400 mt-0.5">
 {quarantinedCount} Subjects in Isolation Ward
 </div>
 </div>

 {/* Antibiotics Stockpile */}
 <div className="p-2.5 bg-emerald-950/20 border border-emerald-700/30 flex flex-col justify-between">
 <div className="text-[10px] text-emerald-400 uppercase tracking-wider flex items-center gap-1">
 <Pill className="w-3 h-3 text-emerald-400" />
 Antibiotics & Antivirals
 </div>
 <div className="text-sm font-bold text-emerald-300 mt-1">
 {stockpile.medical.antibiotics} Doses
 </div>
 <div className="text-[10px] text-slate-400 mt-0.5">
 1 Dose required per treatment
 </div>
 </div>

 {/* First Aid & Bandages */}
 <div className="p-2.5 bg-slate-800/40 border border-slate-700/40 flex flex-col justify-between">
 <div className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
 <Activity className="w-3 h-3 text-amber-400" />
 Surgical Supplies
 </div>
 <div className="text-sm font-bold text-slate-200 mt-1">
 {stockpile.medical.first_aid_kits} Kits / {stockpile.medical.sterile_bandages} Bandages
 </div>
 <div className="text-[10px] text-slate-400 mt-0.5">
 Used in triage & trauma stabilization
 </div>
 </div>
 </div>

 {/* ACTIVE OUTBREAK ALERTS BANNER (If any) */}
 {activeOutbreaksList.length > 0 && (
 <div className="px-6 py-2.5 bg-rose-950/40 border-b border-rose-600/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-pulse">
 <div className="flex items-center gap-2.5">
 <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
 <div>
 <div className="text-xs font-bold text-rose-200">
 🚨 ACTIVE BASE OUTBREAK DETECTED: {activeOutbreaksList.map((o) => o.buildingName).join(', ')}
 </div>
 <div className="text-[11px] text-rose-300">
 An unquarantined subject turned inside the colony! Outbreak will breach and spread to adjacent structures in{' '}
 <span className="font-bold text-white">
 {Math.round(activeOutbreaksList[0].spreadCountdownSec)}s
 </span>
 .
 </div>
 </div>
 </div>

 <div className="flex items-center gap-2 shrink-0">
 <button
 id="contain-outbreak-btn"
 onClick={() => handlePurgeOutbreak(activeOutbreaksList[0].buildingId)}
 className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors"
 >
 Dispatch Security Containment Sweep
 </button>
 </div>
 </div>
 )}

 {/* Main Content: Two Columns */}
 <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
 {/* Left Column: Survivor Roster & Triage List (5 Cols) */}
 <div className="md:col-span-5 border-r border-slate-800 flex flex-col bg-[#111317] overflow-hidden">
 {/* Filter Tabs */}
 <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-[#15181e]">
 <div className="text-xs font-bold text-slate-300">SURVIVOR VITALS ROSTER</div>
 <div className="flex items-center gap-1 text-[10px]">
 <button
 onClick={() => setFilterMode('all')}
 className={`px-2 py-0.5 ${
 filterMode === 'all'
 ? 'bg-indigo-600 text-white font-bold'
 : 'bg-slate-800 text-slate-400 hover:text-slate-200'
 }`}
 >
 All ({survivorList.length})
 </button>
 <button
 onClick={() => setFilterMode('infected')}
 className={`px-2 py-0.5 ${
 filterMode === 'infected'
 ? 'bg-amber-600 text-white font-bold'
 : 'bg-slate-800 text-slate-400 hover:text-slate-200'
 }`}
 >
 Infected ({activeInfections.length})
 </button>
 <button
 onClick={() => setFilterMode('quarantined')}
 className={`px-2 py-0.5 ${
 filterMode === 'quarantined'
 ? 'bg-purple-600 text-white font-bold'
 : 'bg-slate-800 text-slate-400 hover:text-slate-200'
 }`}
 >
 Isolation ({quarantinedCount})
 </button>
 </div>
 </div>

 {/* List */}
 <div className="flex-1 overflow-y-auto p-3 space-y-2">
 {filteredSurvivors.map((s) => {
 const inf = s.infection;
 const isSelected = selectedSurvivorId === s.id;
 const isSymptomatic = inf && (inf.stage === 'symptomatic' || inf.stage === 'advanced');
 const isIncubation = inf && inf.stage === 'incubation';
 const isTurned = inf && inf.stage === 'turned';
 const isCured = inf && inf.stage === 'cured';
 const isQuarantined = inf && inf.isQuarantined;

 let statusBadge = (
 <span className="px-1.5 py-0.5 text-[9px] bg-emerald-950/40 text-emerald-300 border border-emerald-700/30">
 CLEAR
 </span>
 );

 if (isTurned) {
 statusBadge = (
 <span className="px-1.5 py-0.5 text-[9px] bg-rose-950/60 text-rose-300 border border-rose-700/50 flex items-center gap-1 font-bold">
 <Skull className="w-2.5 h-2.5 text-rose-400" /> TURNED
 </span>
 );
 } else if (inf?.stage === 'advanced') {
 statusBadge = (
 <span className="px-1.5 py-0.5 text-[9px] bg-rose-950/60 text-rose-300 border border-rose-700/50 flex items-center gap-1 font-bold animate-pulse">
 <AlertOctagon className="w-2.5 h-2.5 text-rose-400" /> ADVANCED NECROSIS
 </span>
 );
 } else if (isSymptomatic) {
 statusBadge = (
 <span className="px-1.5 py-0.5 text-[9px] bg-amber-950/60 text-amber-300 border border-amber-700/50 flex items-center gap-1 font-bold animate-pulse">
 <AlertTriangle className="w-2.5 h-2.5 text-amber-400" /> SYMPTOMATIC
 </span>
 );
 } else if (isIncubation) {
 if (inf.isConfirmedByMedbay) {
 statusBadge = (
 <span className="px-1.5 py-0.5 text-[9px] bg-indigo-950/60 text-indigo-300 border border-indigo-700/50 flex items-center gap-1 font-bold">
 <Clock className="w-2.5 h-2.5 text-indigo-400" /> INCUBATING (CONFIRMED)
 </span>
 );
 } else {
 statusBadge = (
 <span className="px-1.5 py-0.5 text-[9px] bg-slate-800 text-slate-300 border border-slate-700">
 ASYMPTOMATIC
 </span>
 );
 }
 } else if (isCured) {
 statusBadge = (
 <span className="px-1.5 py-0.5 text-[9px] bg-cyan-950/40 text-cyan-300 border border-cyan-700/30 flex items-center gap-1">
 <CheckCircle2 className="w-2.5 h-2.5 text-cyan-400" /> CURED
 </span>
 );
 }

 return (
 <div
 key={s.id}
 onClick={() => {
 setSelectedSurvivorId(s.id);
 setTreatmentFeedback(null);
 if (inf?.isConfirmedByMedbay) {
 setDiagnosisResult(diagnoseSurvivor(s.namedData || { id: s.id, name: s.name }, inf, doctor));
 } else {
 setDiagnosisResult(null);
 }
 }}
 className={`p-2.5 border cursor-pointer transition-all ${
 isSelected
 ? 'bg-slate-800/80 border-[#CBD5E1]'
 : 'bg-[#15181e] border-slate-800 hover:border-slate-700'
 }`}
 >
 <div className="flex items-center justify-between">
 <div className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
 {s.name}
 {s.namedData && (
 <span className="text-[9px] px-1 py-0.2 bg-slate-700/60 text-slate-300 font-normal">
 Specialist
 </span>
 )}
 </div>
 {statusBadge}
 </div>

 <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
 <div>
 {s.namedData?.role.type === 'squad_leader'
 ? `Squad: ${s.namedData.role.squadName}`
 : s.namedData?.role.type === 'building_head'
 ? `${s.namedData.role.title}`
 : 'General Labor'}
 </div>
 {isQuarantined && (
 <span className="text-purple-400 font-bold flex items-center gap-1">
 <Lock className="w-2.5 h-2.5" /> Quarantined
 </span>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>

 {/* Right Column: Triage Examination & Clinical Treatment (7 Cols) */}
 <div className="md:col-span-7 flex flex-col bg-[#14161b] overflow-y-auto p-4 sm:p-6">
 {selectedSurvivor ? (
 <div className="space-y-4">
 {/* Subject Header Card */}
 <div className="p-4 bg-[#1a1d24] border border-slate-700/70">
 <div className="flex items-start justify-between">
 <div>
 <div className="text-[10px] text-slate-400 uppercase tracking-wider">
 Subject Triage Profile
 </div>
 <h3 className="text-lg font-bold text-slate-100 mt-0.5">
 {selectedSurvivor.name}
 </h3>
 <p className="text-xs text-slate-400 mt-1">
 {selectedSurvivor.namedData?.background || 'Colony resident and civilian labor pool worker.'}
 </p>
 </div>

 <div className="flex flex-col items-end gap-1.5">
 <button
 onClick={() => handleSimulateBite(selectedSurvivor.id)}
 className="px-2 py-1 text-[10px] bg-rose-950/40 border border-rose-700/40 text-rose-300 hover:bg-rose-900/60 transition-colors"
 title="Simulate a zombie bite for testing §6.2 mechanics"
 >
 ⚡ Simulate Bite (Test)
 </button>
 </div>
 </div>

 {/* Vitals Summary */}
 <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-3 gap-2 text-[11px]">
 <div>
 <span className="text-slate-500">Clinical Status: </span>
 <span className="font-bold text-slate-200">
 {selectedInfection
 ? selectedInfection.stage.toUpperCase()
 : 'HEALTHY'}
 </span>
 </div>
 <div>
 <span className="text-slate-500">Diagnosis Confirmed: </span>
 <span
 className={`font-bold ${
 selectedInfection?.isConfirmedByMedbay ? 'text-emerald-400' : 'text-slate-400'
 }`}
 >
 {selectedInfection?.isConfirmedByMedbay ? 'YES (Medbay)' : 'UNCHECKED'}
 </span>
 </div>
 <div>
 <span className="text-slate-500">Confinement: </span>
 <span
 className={`font-bold ${
 selectedInfection?.isQuarantined ? 'text-purple-400' : 'text-slate-400'
 }`}
 >
 {selectedInfection?.isQuarantined ? 'ISOLATION WARD' : 'GENERAL COLONY'}
 </span>
 </div>
 </div>
 </div>

 {/* Treatment Feedback Notification (If just treated) */}
 {treatmentFeedback && (
 <div
 className={`p-3 border text-xs flex items-start gap-2.5 ${
 treatmentFeedback.cured
 ? 'bg-emerald-950/30 border-emerald-500/60 text-emerald-200'
 : 'bg-rose-950/30 border-rose-500/60 text-rose-200'
 }`}
 >
 {treatmentFeedback.cured ? (
 <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
 ) : (
 <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
 )}
 <div>
 <div className="font-bold">
 {treatmentFeedback.cured ? 'TREATMENT SUCCESSFUL' : 'TREATMENT RESISTED'}
 </div>
 <div className="mt-0.5 text-[11px] text-slate-300">
 {treatmentFeedback.message}
 </div>
 </div>
 </div>
 )}

 {/* DIAGNOSIS RESULTS CARD (§6.2 Medbay Check-up) */}
 {diagnosisResult ? (
 <div className="p-4 bg-[#181b22] border border-slate-700">
 <div className="flex items-center justify-between pb-2 border-b border-slate-800">
 <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
 <Stethoscope className="w-4 h-4 text-pink-400" />
 CLINICAL TRIAGE REPORT
 </div>
 <span className="text-[10px] text-slate-400">
 Examined by {doctor ? doctor.name : 'Emergency Triage Staff'}
 </span>
 </div>

 <div className="mt-3 space-y-3 text-xs">
 {diagnosisResult.isInfected ? (
 <>
 <div className="grid grid-cols-2 gap-3">
 <div className="p-2.5 bg-slate-900/60 border border-slate-800">
 <div className="text-[10px] text-slate-400">Pathogen Viral Load</div>
 <div className="text-base font-bold text-amber-400 mt-0.5">
 {diagnosisResult.pathogenLoad}%
 </div>
 <div className="w-full bg-slate-800 h-1.5 mt-1.5 overflow-hidden">
 <div
 className="bg-gradient-to-r from-amber-400 to-rose-500 h-full"
 style={{ width: `${diagnosisResult.pathogenLoad}%` }}
 />
 </div>
 </div>

 <div className="p-2.5 bg-slate-900/60 border border-slate-800">
 <div className="text-[10px] text-slate-400">Time to Cellular Turn</div>
 <div className="text-base font-bold text-rose-400 mt-0.5">
 {diagnosisResult.remainingTurnSeconds < 60
 ? `${Math.round(diagnosisResult.remainingTurnSeconds)}s (CRITICAL)`
 : `${Math.floor(diagnosisResult.remainingTurnSeconds / 60)}m ${Math.round(
 diagnosisResult.remainingTurnSeconds % 60
 )}s`}
 </div>
 <div className="text-[9px] text-slate-400 mt-1">
 Stage: {diagnosisResult.stage.toUpperCase()}
 </div>
 </div>
 </div>

 <div className="p-2.5 bg-slate-900/60 border border-slate-800">
 <div className="text-[10px] text-slate-400 font-bold">Pathologist Notes:</div>
 <p className="text-xs text-slate-300 mt-1 leading-relaxed">
 {diagnosisResult.doctorNotes}
 </p>
 </div>

 <div className="p-2.5 bg-indigo-950/20 border border-indigo-700/30 flex items-center justify-between">
 <div>
 <div className="text-[10px] text-indigo-400 font-bold">CURRENT CURE PROGNOSIS (§6.2)</div>
 <div className="text-[11px] text-slate-300">
 Base Stage Odds + Medical Skill Bonus ({doctorBonus > 0 ? `+${doctorBonus}%` : '0%'})
 </div>
 </div>
 <div className="text-lg font-black text-emerald-400">
 {diagnosisResult.currentCureOdds}%
 </div>
 </div>
 </>
 ) : (
 <div className="p-4 text-center bg-emerald-950/20 border border-emerald-700/30">
 <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
 <div className="font-bold text-emerald-300">PATIENT CERTIFIED CLEAR</div>
 <p className="text-xs text-slate-300 mt-1">
 No viral infection or necrotic markers detected. Cleared for normal colony duties.
 </p>
 </div>
 )}
 </div>
 </div>
 ) : (
 <div className="p-6 text-center bg-[#181b22] border border-dashed border-slate-700 text-slate-400 text-xs">
 <Stethoscope className="w-8 h-8 text-slate-500 mx-auto mb-2" />
 <div className="font-bold text-slate-300">CLINICAL EXAMINATION REQUIRED</div>
 <p className="mt-1 text-slate-400 max-w-md mx-auto">
 Conduct a thorough Medbay triage check-up to test blood samples and confirm if the subject carries necrotic viral RNA.
 </p>
 <button
 id="perform-checkup-btn"
 onClick={() => handlePerformCheckup(selectedSurvivor.id)}
 className="mt-3 px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs transition-colors"
 >
 Perform Clinical Triage Check-Up
 </button>
 </div>
 )}

 {/* RESOLUTION ACTIONS PANEL (§6.2, §6.3) */}
 <div className="p-4 bg-[#181b22] border border-slate-700 space-y-3">
 <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">
 RESOLUTION PATHWAYS (§6.2, §6.3)
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {/* Treatment Action */}
 <div className="p-3 bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
 <div>
 <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
 <Pill className="w-4 h-4" />
 Antiviral & Antibiotic Therapy
 </div>
 <p className="text-[11px] text-slate-400 mt-1">
 Administer targeted high-potency antibiotics and trauma dressings. Cure odds scale with early detection.
 </p>
 <div className="mt-2 text-[10px] text-slate-300">
 Cost: <span className="text-emerald-400 font-bold">1x Antibiotics</span> +{' '}
 <span className="text-slate-200 font-bold">1x First Aid/Bandage</span>
 </div>
 </div>

 <button
 id="administer-treatment-btn"
 onClick={() => handleAdministerTreatment(selectedSurvivor.id)}
 disabled={
 !selectedInfection ||
 selectedInfection.stage === 'cured' ||
 selectedInfection.stage === 'turned' ||
 stockpile.medical.antibiotics < 1 ||
 (stockpile.medical.first_aid_kits < 1 && stockpile.medical.sterile_bandages < 1)
 }
 className={`mt-3 w-full py-2 text-xs font-bold transition-colors ${
 !selectedInfection ||
 selectedInfection.stage === 'cured' ||
 selectedInfection.stage === 'turned' ||
 stockpile.medical.antibiotics < 1
 ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
 : 'bg-emerald-600 hover:bg-emerald-500 text-white'
 }`}
 >
 Administer Medical Treatment
 </button>
 </div>

 {/* Quarantine / Isolation Action */}
 <div className="p-3 bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
 <div>
 <div className="flex items-center gap-1.5 text-xs font-bold text-purple-400">
 <Lock className="w-4 h-4" />
 Isolation Ward Quarantine
 </div>
 <p className="text-[11px] text-slate-400 mt-1">
 Confine to secure isolation ward. If the subject turns, the containment cell safely isolates them without base outbreak spread.
 </p>
 <div className="mt-2 text-[10px] text-purple-300">
 {selectedInfection?.isQuarantined
 ? 'Subject is currently isolated in secure cell.'
 : 'Subject is currently uncontained in general quarters.'}
 </div>
 </div>

 <button
 id="toggle-quarantine-btn"
 onClick={() =>
 handleToggleQuarantine(selectedSurvivor.id, !!selectedInfection?.isQuarantined)
 }
 className={`mt-3 w-full py-2 text-xs font-bold transition-colors ${
 selectedInfection?.isQuarantined
 ? 'bg-purple-800 hover:bg-purple-700 text-purple-100 border border-purple-600'
 : 'bg-purple-600 hover:bg-purple-500 text-white'
 }`}
 >
 {selectedInfection?.isQuarantined
 ? 'Release from Quarantine Ward'
 : 'Confine to Isolation Ward'}
 </button>
 </div>
 </div>
 </div>
 </div>
 ) : (
 <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 p-8">
 <HeartPulse className="w-12 h-12 mb-3 text-slate-600" />
 <h4 className="text-sm font-bold text-slate-300">SELECT A SURVIVOR FOR CLINICAL TRIAGE</h4>
 <p className="text-xs text-slate-400 max-w-sm mt-1">
 Select a colonist from the left roster to view their viral pathogen load, order Medbay examinations, administer medicine, or manage quarantine confinement.
 </p>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 );
};
