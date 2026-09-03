import React, { useMemo, useState } from 'react';
import {
  Antenna, Archive, Baby, Beer, BookOpenCheck, Bomb, Boxes, BrickWall, Car,
  Check, ClipboardList, CloudSun, Cog, CookingPot, Cross, Crosshair, Droplet,
  Fish, Flame, FlaskConical, Focus, Fuel, Gauge, GraduationCap, Hammer,
  HeartPulse, Layers, Leaf, Lock, Microscope, Pickaxe, Pill, Radar, Radio,
  RadioTower, Recycle, Rocket, School, Scissors, Shield, ShieldCheck, Skull,
  Soup, Sprout, Stethoscope, Sun, Swords, Syringe, Target, TreePine, Users,
  Wheat, Wine, Wrench, X, Zap,
} from 'lucide-react';
import { RESEARCH_BRANCHES, RESEARCH_TREE_NODES } from '../data/researchTreeData';
import {
  FUNCTIONAL_BUILDING_DEFINITIONS,
  isLegacyAliasBuildingType,
} from '../data/functionalBuildings';
import {
  canUnlockResearchNode,
  getEstimatedResearchSeconds,
  getResearchWorkerCount,
  getScientificMaterials,
  pauseResearch,
  startResearchNode,
} from '../services/researchService';
import { ResearchBranch, ResearchNode } from '../types/research';
import { FunctionalBuildingDefinition, SettlementState } from '../types/settlement';
import { soundService } from '../services/soundService';

interface ResearchTreeModalProps {
  settlement: SettlementState;
  onUpdateSettlement: (updated: SettlementState) => void;
  onClose: () => void;
  onOpenBuildingDrawer?: () => void;
}

const BRANCH_ICONS: Record<ResearchBranch, React.FC<{ className?: string }>> = {
  medicine: Pill,
  communication: Radio,
  chemistry: FlaskConical,
  arms: Wrench,
  construction: Wrench,
  food: Soup,
  infection: Skull,
  education: GraduationCap,
};

// Per-node tech icon, matching the reference tree (each node carries its own
// discipline icon, with a padlock overlay when the node is still locked).
const NODE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  // Medicine
  medical_care: Cross, drugs_production: Pill, first_aid: Cross,
  surgery: Scissors, clinical_efficiency: Gauge,
  // Communication
  basic_antenna: RadioTower, weather_forecast: CloudSun,
  triangulation: Radar, long_range_antenna: Antenna,
  // Chemistry
  chemistry: FlaskConical, fertilizer_production: Sprout,
  manufacture_of_fuels: Fuel, nitrocellulose_powder: Bomb,
  polymers: Layers, biofuel_production: Leaf,
  process_intensification: Flame, explosives_production: Bomb,
  // Arms Production
  pistol: Crosshair, assault_rifle: Target, shotgun: Swords,
  sniper_rifle: Focus, precision_machinery: Cog,
  heavy_machine_gun: Shield, mortar: Rocket,
  // Construction
  tool_factory: Wrench, advanced_woodworks: TreePine,
  clay_processing: BrickWall, advanced_metalworks: Hammer,
  recycling: Recycle, advanced_masonry: BrickWall,
  mechanics: Car, ore_extraction_and_smelting: Pickaxe,
  workflow_management: ClipboardList, structural_bracing: ShieldCheck,
  advanced_mechanics: Cog, prefabricated_elements: Boxes,
  // Food
  farming: Wheat, fishery: Fish, fertilization_techniques: Sprout,
  greenhouses: Sun, food_preservation: Archive, fermentation: Beer,
  efficient_cooking: CookingPot, high_efficiency_brewing: Wine,
  // Infection
  early_diagnosis: Stethoscope, symptomatic_treatment: HeartPulse,
  vaccine: Syringe, dosing_optimisation: Droplet, turning_prevention: Skull,
  // Education
  survival_training: Flame, combat_training: Crosshair, nursery: Baby,
  scientific_apprenticeship: Microscope, archery_techniques: Target,
  nursery_assistants: Users,
};

// Per-category scene backdrop for the detail panel, standing in for the
// reference's photography while keeping the same layout.
const BRANCH_SCENES: Record<ResearchBranch, { gradient: string; icon: React.FC<{ className?: string }>; label: string }> = {
  medicine: { gradient: 'linear-gradient(135deg,#10161c 0%,#12212b 45%,#1b2b30 100%)', icon: HeartPulse, label: 'Field Care' },
  communication: { gradient: 'linear-gradient(135deg,#0d1518 0%,#0e2430 45%,#12384a 100%)', icon: RadioTower, label: 'Signal Networks' },
  chemistry: { gradient: 'linear-gradient(135deg,#141310 0%,#1e1a12 45%,#33260f 100%)', icon: FlaskConical, label: 'Applied Science' },
  arms: { gradient: 'linear-gradient(135deg,#171112 0%,#241418 45%,#3a1614 100%)', icon: Crosshair, label: 'Firearms & Ordnance' },
  construction: { gradient: 'linear-gradient(135deg,#12141a 0%,#171b29 45%,#232342 100%)', icon: Wrench, label: 'Workshops & Engineering' },
  food: { gradient: 'linear-gradient(135deg,#101710 0%,#152115 45%,#203016 100%)', icon: Wheat, label: 'Agriculture & Provision' },
  infection: { gradient: 'linear-gradient(135deg,#131310 0%,#1e1c12 45%,#2b2610 100%)', icon: Skull, label: 'Virology & Containment' },
  education: { gradient: 'linear-gradient(135deg,#141118 0%,#1e1524 45%,#331a3d 100%)', icon: GraduationCap, label: 'Training & Expertise' },
};

// Compact node metrics so the tallest, widest trees (Construction: 4 tiers × 4
// wide) fit inside the panel without the central canvas needing to scroll.
const NODE_W = 132;
const NODE_H = 60;
const COL_GAP = 44;
const ROW_GAP = 26;

const fmtTime = (seconds: number) => {
  if (seconds === Infinity) return 'NO RESEARCHERS';
  if (!isFinite(seconds) || seconds <= 0) return 'Instant';
  const totalMin = Math.ceil(seconds / 60);
  if (totalMin < 60) return `${totalMin} MIN`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}H ${m}M`;
};

export const ResearchTreeModal: React.FC<ResearchTreeModalProps> = ({ settlement, onUpdateSettlement, onClose }) => {
  const [activeBranch, setActiveBranch] = useState<ResearchBranch>('medicine');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const research = settlement.research!;
  const nodes = useMemo(
    () => Object.values(RESEARCH_TREE_NODES).filter((node) => node.branch === activeBranch),
    [activeBranch]
  );
  // Which buildings each research node unlocks: reverse-lookup of every building
  // definition's researchRequirement, plus the explicit unlockedBuildingTypeId
  // declarations on the tree nodes themselves (deduped).
  const buildingsByNode = useMemo(() => {
    const map = new Map<string, FunctionalBuildingDefinition[]>();
    const add = (nodeId: string, def?: FunctionalBuildingDefinition) => {
      if (!def) return;
      const list = map.get(nodeId) || [];
      if (!list.some((d) => d.id === def.id)) list.push(def);
      map.set(nodeId, list);
    };
    // Skip legacy alias defs so a research node never lists a duplicate
    // facility under an old name (each facility appears once, canonical).
    Object.values(FUNCTIONAL_BUILDING_DEFINITIONS).forEach((def) => {
      if (isLegacyAliasBuildingType(def.id)) return;
      if (def.researchRequirement) add(def.researchRequirement, def);
    });
    Object.values(RESEARCH_TREE_NODES).forEach((node) => {
      if (node.unlockedBuildingTypeId) {
        add(node.id, FUNCTIONAL_BUILDING_DEFINITIONS[node.unlockedBuildingTypeId]);
      }
    });
    return map;
  }, []);
  const selected = selectedId ? RESEARCH_TREE_NODES[selectedId] : null;
  const researcherCount = getResearchWorkerCount(settlement);
  const SceneIcon = BRANCH_SCENES[activeBranch].icon;
  const branch = RESEARCH_BRANCHES.find((item) => item.id === activeBranch)!;
  const unlockedNodes = research.unlockedNodes || [];
  const unlocked = (node: ResearchNode) => unlockedNodes.includes(node.id);
  const isActive = (node: ResearchNode) => research.activeResearchId === node.id;

  const maxTier = Math.max(1, ...nodes.map((node) => node.tier));
  const tiers = useMemo(
    () => Array.from({ length: maxTier }, (_, i) => nodes.filter((node) => node.tier === i + 1).sort((a, b) => a.costSciMat - b.costSciMat)),
    [nodes, maxTier]
  );
  const maxRow = Math.max(1, ...tiers.map((t) => t.length));
  // Tiers progress top-to-bottom: tier 1 (root) sits at the top, deeper tiers
  // cascade downward as they unlock. Within each tier the nodes are fanned out
  // horizontally, centred so branches read symmetrically instead of left-to-right.
  const layout = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const slotW = NODE_W + COL_GAP;
    const centerX = (maxRow * slotW) / 2;
    tiers.forEach((tierNodes, tierIdx) => {
      const span = tierNodes.length * slotW;
      const startX = centerX - span / 2;
      tierNodes.forEach((node, i) =>
        map.set(node.id, { x: startX + i * slotW, y: tierIdx * (NODE_H + ROW_GAP) })
      );
    });
    return map;
  }, [tiers, maxRow]);
  const graphW = Math.max(520, maxRow * (NODE_W + COL_GAP));
  const graphH = Math.max(320, maxTier * (NODE_H + ROW_GAP) + 70);

  const edgePath = (parentId: string, childId: string) => {
    const from = layout.get(parentId);
    const to = layout.get(childId);
    if (!from || !to) return null;
    if (from.x === to.x && to.y > from.y) {
      // Pure vertical (single child)
      return (
        <path key={`${parentId}-${childId}`} d={`M ${from.x + NODE_W / 2} ${from.y + NODE_H} V ${to.y}`} fill="none" stroke="#3B5054" strokeWidth="2" />
      );
    }
    const x1 = from.x + NODE_W / 2;
    const y1 = from.y + NODE_H;
    const x2 = to.x + NODE_W / 2;
    const y2 = to.y;
    const midY = y1 + Math.max(30, (y2 - y1) / 2);
    return (
      <path key={`${parentId}-${childId}`} d={`M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`} fill="none" stroke="#3B5054" strokeWidth="2" />
    );
  };
  const edgeColor = (childId: string) => {
    const node = RESEARCH_TREE_NODES[childId];
    if (!node) return '#3B5054';
    if (unlocked(node)) return '#35D895';
    if (isActive(node)) return '#38BDF8';
    return canUnlockResearchNode(settlement, childId).allowed ? '#4E6A70' : '#2C3A3D';
  };
  const coloredEdge = (parentId: string, to: { x: number; y: number }, childId: string) => {
    const from = layout.get(parentId)!;
    if (from.x === to.x) {
      return <path key={`${parentId}-${childId}`} d={`M ${from.x + NODE_W / 2} ${from.y + NODE_H} V ${to.y}`} fill="none" stroke={edgeColor(childId)} strokeWidth="2" />;
    }
    const y1 = from.y + NODE_H;
    const midY = y1 + Math.max(30, (to.y - y1) / 2);
    return <path key={`${parentId}-${childId}`} d={`M ${from.x + NODE_W / 2} ${y1} V ${midY} H ${to.x + NODE_W / 2} V ${to.y}`} fill="none" stroke={edgeColor(childId)} strokeWidth="2" />;
  };

  const start = () => {
    if (!selected) return;
    try { const r = startResearchNode(settlement, selected.id); onUpdateSettlement(r.updatedSettlement); soundService.playTechUnlock(); setError(null); } catch (e: any) { setError(e?.message || 'Cannot start research.'); soundService.notify({ title: 'RESEARCH', desc: e?.message || 'Cannot start research.', type: 'warn' }); }
  };
  const pause = () => { onUpdateSettlement(pauseResearch(settlement)); soundService.notify({ title: 'RESEARCH', desc: 'Research paused.', type: 'info' }); setError(null); };

  const selectedProgress = selected && isActive(selected) ? Math.min(100, (research.activeProgressSec / selected.baseTimeSec) * 100) : 0;
  const selectedActive = selected ? isActive(selected) : false;
  const check = selected ? canUnlockResearchNode(settlement, selected.id) : null;
  const unlockedBuildings = selected ? buildingsByNode.get(selected.id) || [] : [];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-6">
      <section className="relative w-full max-w-[1260px] h-[min(86vh,740px)] bg-[#0B1114] border border-[#52656B] clip-tactical-bracket flex flex-col overflow-hidden font-sans shadow-[0_0_70px_rgba(0,0,0,.85)]">
        <header className="h-12 shrink-0 flex items-center justify-between px-4 bg-[#151D20] border-b border-[#42545A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 border border-[#9BAEB2] rounded-full grid place-items-center text-white"><Microscope className="w-5 h-5" /></div>
            <span className="font-heading text-sm uppercase tracking-widest text-white">Technology</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[11px] text-[#AEBEC0]">
              <span className="uppercase tracking-wider">Researchers</span>
              <strong className="text-white">{researcherCount}</strong>
            </div>
            <div className="flex items-center gap-1.5 border border-[#2F8F5B] bg-[#0E241A] px-2.5 py-1" title="Scientific Materials in stockpile — produced by staffed Research Centers">
              <BookOpenCheck className="w-4 h-4 text-[#37F59A]" />
              <strong className="text-[#37F59A] text-lg leading-none">{Math.floor(getScientificMaterials(settlement))}</strong>
            </div>
            <div className="relative">
              <button onClick={() => setShowHelp((v) => !v)} className="p-1.5 text-[#AEBEC0] hover:text-white hover:bg-[#263033]" aria-label="Help">?</button>
              {showHelp && (
                <div className="absolute right-0 top-full z-10 mt-1 w-72 border border-[#42545A] bg-[#151D20] p-3 text-[11px] leading-relaxed text-[#B5C2C3] shadow-xl">
                  <p className="mb-1 font-bold uppercase tracking-wider text-white">How research works</p>
                  <p>Each category holds its own branch of technologies. Assign survivors to completed <strong className="text-[#5DF0AC]">Research Stations</strong> to produce <strong className="text-[#5DF0AC]">Scientific Materials</strong> (the green counter, held in the stockpile) and to advance the active project — the more researchers, the faster it completes. Starting a project banks its material cost; completing it consumes the materials. Only one project can run at a time.</p>
                </div>
              )}
            </div>
            <button onClick={onClose} className="p-1.5 text-[#AEBEC0] hover:text-white hover:bg-[#263033]"><X className="w-5 h-5" /></button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-[180px] shrink-0 bg-[#11191C] border-r border-[#34464A] p-3">
            <div className="text-[10px] font-bold text-[#7E9194] uppercase tracking-wider mb-2.5">Categories:</div>
            <div className="space-y-1">
              {RESEARCH_BRANCHES.map((item) => {
                const Icon = BRANCH_ICONS[item.id] || School;
                const branchNodes = Object.values(RESEARCH_TREE_NODES).filter((n) => n.branch === item.id);
                const done = branchNodes.filter((n) => unlocked(n)).length;
                const selectedBranch = activeBranch === item.id;
                return (
                  <button key={item.id} onClick={() => { setActiveBranch(item.id); setSelectedId(null); setError(null); }} className={`w-full flex items-center gap-2 px-2 py-2 text-left border-l-2 transition-colors ${selectedBranch ? 'bg-[#123A2E] border-[#37F59A] text-white' : 'bg-[#22303A] hover:bg-[#2A3A46] border-[#26343B] text-[#B8C5C6]'}`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 truncate font-heading text-[11px] font-bold uppercase">{item.id === 'medicine' ? 'Medicine' : item.id === 'construction' ? 'Construction' : item.name}</span>
                    <span className="text-[10px] text-[#8FA1A4]">{done}/{branchNodes.length}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="relative flex-1 min-w-0 overflow-auto bg-[#0B1316] p-5">
            <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: branch.accentColor }}>
              {branch.name} <span className="h-px flex-1 bg-[#314A4A]" />
            </div>
            <div className="relative" style={{ width: graphW, height: graphH }}>
              <svg className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true">
                {nodes.flatMap((node) => {
                  const to = layout.get(node.id);
                  if (!to) return null;
                  return node.prerequisites.map((parentId) => {
                    const from = layout.get(parentId);
                    if (!from) return null;
                    return edgeColor(node.id) === '#3B5054' ? edgePath(parentId, node.id) : coloredEdge(parentId, to, node.id);
                  });
                })}
              </svg>
              {nodes.map((node) => {
                const pos = layout.get(node.id)!;
                const done = unlocked(node);
                const active = isActive(node);
                const available = canUnlockResearchNode(settlement, node.id).allowed;
                const chosen = selectedId === node.id;
                const progress = active ? Math.min(100, (research.activeProgressSec / node.baseTimeSec) * 100) : 0;
                const NodeIcon = NODE_ICONS[node.id] || Zap;
                return (
                  <button key={node.id} onClick={() => { setSelectedId(node.id); setError(null); }} className={`absolute text-center transition-transform ${chosen ? 'scale-105' : ''}`} style={{ left: pos.x, top: pos.y, width: NODE_W }}>
                    <div className={`relative mx-auto w-8 h-8 grid place-items-center border-2 ${done ? 'border-[#39F39A] bg-[#123C30] text-[#43F5A4]' : active ? 'border-[#38BDF8] bg-[#12303D] text-[#42D4FF]' : available ? 'border-[#29C8FF]/70 bg-[#12303D] text-[#42D4FF]' : 'border-[#4B5A5E] bg-[#1C262A] text-[#6E7F82] opacity-80'} ${chosen ? 'ring-2 ring-white/60' : ''}`}>
                      <NodeIcon className="w-4 h-4" />
                      {done && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#37F59A]" />}
                      {!done && !active && !available && (
                        <span className="absolute -top-1 -right-1 grid h-3.5 w-3.5 place-items-center rounded-full border border-[#2C3A3D] bg-[#0F1618] text-[#8FA1A4]"><Lock className="h-2.5 w-2.5" /></span>
                      )}
                    </div>
                    <span className={`mt-1 block min-h-6 px-1.5 py-0.5 text-[8px] font-heading font-bold uppercase leading-tight border ${done ? 'bg-[#173129] border-[#35D895] text-[#5DF0AC]' : active ? 'bg-[#12303D] border-[#38BDF8] text-[#A8D9EE]' : 'bg-[#293538] border-[#3B4045] text-[#9AA6A8]'}`}>
                      {node.name}
                      {active && <span className="mt-0.5 block h-1 w-full bg-[#1C262A]"><span className="block h-full bg-[#38BDF8]" style={{ width: `${progress}%` }} /></span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </main>

          <aside className="w-[300px] shrink-0 bg-[#11191C] border-l border-[#34464A] flex flex-col overflow-hidden">
            <div className="relative h-[120px] shrink-0 overflow-hidden border-b border-[#34464A]" style={{ background: BRANCH_SCENES[activeBranch].gradient }}>
              <div className="absolute inset-0 opacity-[0.14]" style={{ background: 'repeating-linear-gradient(115deg, transparent 0 14px, rgba(255,255,255,0.35) 14px 15px)' }} />
              <SceneIcon className="absolute -right-4 -bottom-6 h-28 w-28 text-white/10" />
              <span className="absolute left-4 top-4 font-heading text-[10px] font-bold uppercase tracking-widest" style={{ color: branch.accentColor }}>{branch.name}</span>
              <span className="absolute bottom-3 left-4 text-[10px] uppercase tracking-widest text-[#7D9295]">{BRANCH_SCENES[activeBranch].label}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
            {selected ? (
              <>
                <div className="text-[10px] uppercase tracking-widest text-[#7D9295]">Tier {selected.tier} · {selected.categoryTag}</div>
                <h2 className="mt-3 font-heading text-2xl font-black uppercase text-white">{selected.name}</h2>
                <p className="mt-2.5 text-[11px] leading-relaxed text-[#B5C2C3]">{selected.description}</p>

                {selected.effects.length > 0 && (
                  <div className="mt-5"><div className="text-[10px] uppercase tracking-widest text-[#7D9295]">Effects</div>
                    <div className="mt-2 space-y-2">{selected.effects.map((effect, i) => (
                      <div key={i} className="flex justify-between gap-3 border-b border-[#293B3E] py-2 text-[11px]"><span className="text-[#B8C5C6]">{effect.stat}</span><strong className="text-[#4BEFA8]">{effect.value}</strong></div>
                    ))}</div>
                  </div>
                )}

                {unlockedBuildings.length > 0 && (
                  <div className="mt-5">
                    <div className="text-[10px] uppercase tracking-widest text-[#7D9295]">Unlocks Buildings</div>
                    <div className="mt-2 space-y-1.5">
                      {unlockedBuildings.map((b) => (
                        <div key={b.id} className="flex items-center gap-2 border border-[#2A3A3E] bg-[#0E171A] px-2 py-1.5">
                          <span className="h-3 w-1 shrink-0 rounded-sm" style={{ background: b.badgeColor }} />
                          <span className="flex-1 min-w-0 truncate font-heading text-[11px] font-bold uppercase text-[#D7E2E3]">
                            {b.name}
                          </span>
                          <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider text-[#7D9295]">
                            {b.adaptationAllowed ? (b.constructionAllowed ? 'Adapt / Build' : 'Adapt') : 'Build'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-4">
                  <div className="flex items-center justify-between text-[10px] text-[#87999B]"><span className="uppercase tracking-wider">Scientific Materials Cost</span><span className="text-white font-bold"><BookOpenCheck className="inline w-3.5 h-3.5 mr-1 text-[#37F59A]" />{selected.costSciMat}</span></div>
                  {selectedActive && (
                    <>
                      <div className="mt-2 flex items-center justify-between text-[11px]"><span className="text-[#87999B]">ESTIMATED TIME</span><strong className="text-white">{fmtTime(getEstimatedResearchSeconds(settlement, selected, research.activeProgressSec))}</strong></div>
                      <div className="mt-1 flex items-center justify-between text-[11px]"><span className="text-[#87999B]">PROGRESS</span><strong className="text-[#38BDF8]">{selectedProgress.toFixed(1)}%</strong></div>
                      <div className="mt-2 h-2 w-full bg-[#1C262A] overflow-hidden"><div className="h-full bg-[#38BDF8]" style={{ width: `${selectedProgress}%` }} /></div>
                    </>
                  )}

                  {error && <div className="mt-3 border border-[#7f1d1d] bg-[#2a171a] p-2 text-[10px] text-[#fca5a5]">{error}</div>}

                  {unlocked(selected) ? (
                    <div className="mt-3 w-full py-2.5 border border-[#2F8F5B] bg-[#123A2E] text-[#5DF0AC] font-heading text-xs font-bold uppercase flex items-center justify-center gap-2"><Check className="w-4 h-4" />Researched</div>
                  ) : selectedActive ? (
                    <button onClick={pause} className="mt-3 w-full py-2.5 bg-[#344549] hover:bg-[#456066] border border-[#718386] font-heading text-xs font-bold uppercase">Pause Research</button>
                  ) : (
                    <>
                      <button onClick={start} className="mt-3 w-full py-2.5 bg-[#243941] hover:bg-[#2E4A54] disabled:opacity-40 border border-[#4E8FA0] text-white font-heading text-xs font-bold uppercase flex items-center justify-center gap-2" disabled={!!check && !check.allowed}>Start Research <Zap className="w-4 h-4" /></button>
                      <div className="mt-2 text-[11px] text-[#87999B]"><span className="uppercase">Estimated time:</span> <strong className="text-white">{fmtTime(getEstimatedResearchSeconds(settlement, selected))}</strong></div>
                      {check && !check.allowed && <div className="mt-1 text-[10px] text-[#f59e0b]">{check.reason}</div>}
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="m-auto text-center text-[#718487]"><Microscope className="mx-auto mb-3 w-8 h-8 opacity-50" /><p className="text-[11px] uppercase">Select a technology</p></div>
            )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
};