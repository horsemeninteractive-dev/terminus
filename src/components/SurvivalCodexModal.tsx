import React, { useState } from 'react';
import {
 X,
 BookOpen,
 Shield,
 Crosshair,
 Moon,
 Zap,
 Hammer,
 Truck,
 Globe,
 Users,
 Search,
 Sparkles,
 Heart,
 Thermometer,
 Radio,
 Clock,
 Compass,
} from 'lucide-react';
import { soundService } from '../services/soundService';

interface SurvivalCodexModalProps {
 isOpen: boolean;
 onClose: () => void;
}

interface CodexTopic {
 id: string;
 title: string;
 category: 'basics' | 'tactics' | 'economy' | 'survival';
 icon: any;
 summary: string;
 content: {
 overview: string;
 keyPoints: string[];
 proTips: string[];
 };
}

const CODEX_TOPICS: CodexTopic[] = [
 {
 id: 'hq_establishment',
 title: '1. HQ Selection & Zone Adaptation',
 category: 'basics',
 icon: Shield,
 summary: 'Choosing the ideal initial fortification and establishing colony territory.',
 content: {
 overview:
 'The Headquarters (HQ) is the heartbeat of the settlement. If your HQ falls, the colony collapses. Choose a building with large floor space, multi-floor levels, and solid masonry for a higher structural defense rating.',
 keyPoints: [
 'The PRIMARY HQ is command infrastructure, not a warehouse: its vault is a fixed 850 storage units and it commands a fixed squad complement of 2 — no matter how vast the building is.',
 'Larger footprints still raise the HQ\'s defense rating and initial bunk capacity; ADDITIONAL HQs and SQUAD QUARTERS scale with their size.',
 'Masonry (brick/stone) buildings resist zombie breaches better than light wooden structures.',
 'Initial HQ selection provides starting stockpile drop points and safe bunk rooms for your initial survivor detachment.',
 ],
 proTips: [
 'Central buildings near road junctions provide optimal patrol and scavenging coverage.',
 'Adapt surrounding buildings into Shelter Bunkhouses and Cookhouses to prevent severe morale penalties.',
 ],
 },
 },
 {
 id: 'squad_combat',
 title: '2. Squad Combat & Tactical Formations',
 category: 'tactics',
 icon: Crosshair,
 summary: 'RTS unit controls, line of sight, firearm ballistics, and weapon loadouts.',
 content: {
 overview:
 'Tactical squads are 4-person units formed from your named survivors and general workforce. They execute real-time movement, building breach operations, and defensive firepower along street corridors.',
 keyPoints: [
 'Line of sight and range determine weapon effectiveness: Pistol 28 m, Pump Shotgun 22 m, Assault Rifle 36 m, Hunting Rifle 42 m, Heavy Machine Gun 42 m, Sniper Rifle 52 m.',
 'Assault rifles deliver high burst DPS at mid range; Hunting Rifles and Snipers own the long field; Pistols are close-quarters weapons that spend less ammunition.',
 'Bows are silent and consume no ammunition (40 m range) — the right tool for quiet sectors.',
 'Kevlar vests and ballistic helmets reduce trauma damage during melee zombie swarms.',
 ],
 proTips: [
 'Always garrison squads inside fortified buildings or towers during nightfall.',
 'Mounted vehicles allow fast tactical hit-and-run tactics against large horde concentrations.',
 ],
 },
 },
 {
 id: 'day_night_cycle',
 title: '3. Day/Night Cycle & Zombie AI',
 category: 'survival',
 icon: Moon,
 summary: 'Sensory behavior, noise mechanics, darkness aggression, and dawn recoveries.',
 content: {
 overview:
 'Infected are sensitive to ultraviolet light. During the day (07:00 - 19:00) they shelter inside dark building interiors. When night falls, roaming hordes emerge and actively follow sound events, gunfire acoustics, and engine noises.',
 keyPoints: [
 'Day (07:00 - 19:00): Safe scavenging and construction window.',
 'Dusk (19:00 - 21:00): Infected roaming accelerates — recall squads to HQ or defensible positions.',
 'Night (21:00 - 05:00): Nightfall incursion and relentless aggression. Barricade doors and illuminate the perimeter.',
 'Dawn (05:00 - 07:00): The horde withdraws; construction and scavenging can safely resume.',
 'Noise radius from gunfire draws nearby hordes. Equip silencers or melee weapons when clearing quiet sectors.',
 ],
 proTips: [
 'Floodlight towers stun approaching swarms and improve squad hit accuracy in darkness.',
 ],
 },
 },
 {
 id: 'infection_triage',
 title: '4. Infection, Outbreaks & Clinical Triage',
 category: 'survival',
 icon: Heart,
 summary: 'Bite contagion, incubation symptoms, quarantine isolation, and field treatments.',
 content: {
 overview:
 'Zombie bites and scratch wounds introduce the lethal pathogen. If left untreated, incubation progresses from mild fever to full turn into aggressive infected within your living quarters.',
 keyPoints: [
 'Symptom Stages: Exposed -> Feverish -> Lethargic -> Aggressive Outbreak.',
 'Quarantine: Move symptomatic survivors to quarantine isolation in Medbays to protect healthy colonists.',
 'Medical Supplies: Antibiotics and sterile bandages slow disease progression until natural immunity or advanced cures are researched.',
 ],
 proTips: [
 'Appointing a Head Doctor with high intellect accelerates patient recovery rates and prevents sudden dormitory outbreaks.',
 ],
 },
 },
 {
 id: 'building_adaptation',
 title: '5. Building Adaptation & Construction',
 category: 'economy',
 icon: Hammer,
 summary: 'Repurposing real-world structures into functional survival infrastructure.',
 content: {
 overview:
 'Every real-world building mapped from OpenStreetMap can be adapted into functional survival infrastructure: Shelters, Warehouses, Cookhouses, Greenhouses, Research Centres, Medbays, and more. Purpose-built facilities (Cisterns, Generator Stations, Battery Banks, walls, towers) are freestanding-only — you build them, you never find them.',
 keyPoints: [
 'Shelters provide bed capacity and prevent the severe "homeless" morale penalty; Houses improve mood further.',
 'Cookhouse: 2 Grain + 1 Wood → 4 Food Rations, or 2 Raw Meat + 1 Wood → 5 Food Rations — the morale engine.',
 'Barn / Livestock Pen: 2 Grain → 2 Raw Meat + 1 Fertilizer. Cannery: 1 Food Ration + 1 Metal → 1 Canned Good (long-storage reserve).',
 'Sawmill: 10 Logs → 16 Wood · Scrapyard: 10 Scrap → 14 Metal · Chemical Plant: 2 Wood → 1 Fertilizer, 1 Fuel → 3 Fertilizer, 6 Wood → 1 Fuel, 3 Fertilizer → 1 Fuel.',
 'Fields produce 4 Grain per cycle (7 when fertilized); Vast Fields yield 22/day. Greenhouses ignore outdoor weather — essential in winter.',
 'Deconstruction: Dismantle ruined or redundant buildings to recover wood, metal, and brick scrap.',
 ],
 proTips: [
 'Assign skilled Foremen to construction tasks to double structural build velocity.',
 ],
 },
 },
 {
 id: 'vehicles_motorpool',
 title: '6. Motor Pool & World Vehicles',
 category: 'tactics',
 icon: Truck,
 summary: 'Finding, repairing, fueling, and commanding vehicles across road networks.',
 content: {
 overview:
 'Abandoned sedans, off-road SUVs, and transport vans are scattered across city street networks. Squads can repair and refuel vehicles to dramatically increase travel speed, cargo capacity, and mobile fire support.',
 keyPoints: [
 'Vehicles navigate along real-world road networks using A* pathfinding.',
 'Transport Vans can haul hundreds of units of scavenged building supplies in a single run.',
 'Mounted squads fire directly from open vehicle windows while on the move.',
 ],
 proTips: [
 'Maintain a steady stockpile of refined gasoline/biofuel. Running out of fuel in the dark leaves squads stranded.',
 ],
 },
 },
 {
 id: 'caravan_trade',
 title: '7. Multi-Colony Caravan Trade Network',
 category: 'economy',
 icon: Globe,
 summary: 'Establishing inter-settlement trade routes across the 3D globe.',
 content: {
 overview:
 'Establish additional outposts across regional and global sectors. Dispatch armed trade caravans to exchange surplus munitions, food, and raw construction materials between friendly zones.',
 keyPoints: [
 'Caravans travel across the global map over days and weeks.',
 'Equip caravan escorts with firearms to fend off highway bandit ambushes and wandering hordes.',
 'If a remote settlement is overrun, dispatch relief convoys or evacuate surviving refugees.',
 ],
 proTips: [
 'Specialized industrial settlements can supply advanced electronics to agricultural outposts.',
 ],
 },
 },
 {
 id: 'morale_and_growth',
 title: '8. Morale, Seasons & Population Growth',
 category: 'survival',
 icon: Sparkles,
 summary: 'Maintaining mental resilience, passive birth rates, and surviving winter freezes.',
 content: {
 overview:
 'Colony morale directly governs work velocity, combat resolve, and natural population growth. Morale is driven by food diversity, adequate housing, and safety from recent attacks.',
 keyPoints: [
 'Morale ≥85: +30% work productivity, +15% squad damage, +10% weapon fire rate, +50% passive birth rate.',
 'Morale 65–84: baseline performance — no bonus, no penalty.',
 'Morale 40–64: −30% productivity, −20% squad damage, population growth frozen.',
 'Morale <40: severe stall (−65% productivity, −40% squad damage) — strikes, desertion risk, sluggish combat.',
 'Seasons: Winter causes severe freezing weather, halts outdoor farming, and increases wood/fuel heating consumption.',
 ],
 proTips: [
 'Research Hydroponics and Greenhouses early to secure uninterrupted food harvests through the winter.',
 ],
 },
 },
];

export const SurvivalCodexModal: React.FC<SurvivalCodexModalProps> = ({
 isOpen,
 onClose,
}) => {
 const [selectedTopicId, setSelectedTopicId] = useState<string>(CODEX_TOPICS[0].id);
 const [searchQuery, setSearchQuery] = useState<string>('');

 if (!isOpen) return null;

 const filteredTopics = CODEX_TOPICS.filter(
 (t) =>
 t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
 t.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
 t.content.overview.toLowerCase().includes(searchQuery.toLowerCase())
 );

 const selectedTopic =
 CODEX_TOPICS.find((t) => t.id === selectedTopicId) || filteredTopics[0] || CODEX_TOPICS[0];

 const handleSelectTopic = (id: string) => {
 setSelectedTopicId(id);
 soundService.playCombatActionSFX('assault_order');
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
 <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col bg-[#0B0F19] border-2 border-[#24334A] overflow-hidden text-[#CBD5E1] font-sans clip-tactical-bracket surface-bevel">
 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E293B] bg-[#0E1524]">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-[#1E293B] border border-[#E8E8E8]/40 text-[#E8E8E8]">
 <BookOpen className="w-5 h-5" />
 </div>
 <div>                <h2 className="text-xl font-heading font-black tracking-wide text-white uppercase">
                  TERMINUS // SURVIVAL CODEX
                </h2>
 <p className="text-xs font-mono text-[#94A3B8]">
 Tactical field manual, combat ballistics, infection triage, and settlement logistics
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

 {/* Content Layout */}
 <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-[#1E293B]">
 {/* Left: Navigation Topic List */}
 <div className="md:col-span-4 p-4 bg-[#080C14] flex flex-col gap-3 overflow-y-auto max-h-[65vh]">
 {/* Search Input */}
 <div className="relative">
 <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#64748B]" />
 <input
 id="codex-search"
 name="codexSearch"
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search survival protocols..."
 className="w-full pl-8 pr-3 py-1.5 bg-[#0E1524] border border-[#24334A] focus:border-[#E8E8E8] text-white font-mono text-xs outline-none"
 />
 </div>

 {/* List */}
 <div className="space-y-1.5">
 {filteredTopics.map((topic) => {
 const Icon = topic.icon;
 const isSelected = topic.id === selectedTopic.id;
 return (
 <button
 key={topic.id}
 onClick={() => handleSelectTopic(topic.id)}
 className={`w-full flex items-start gap-2.5 p-2.5 border text-left transition-all ${
 isSelected
 ? 'bg-[#131E33] border-[#E8E8E8] text-white'
 : 'bg-[#0E1524]/70 hover:bg-[#152033] border-[#1E293B] text-[#94A3B8]'
 }`}
 >
 <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-[#E8E8E8]' : 'text-[#64748B]'}`} />
 <div className="flex-1 min-w-0">
 <div className="text-xs font-heading font-bold uppercase truncate">
 {topic.title}
 </div>
 <div className="text-[10px] font-mono text-[#64748B] line-clamp-1 mt-0.5">
 {topic.summary}
 </div>
 </div>
 </button>
 );
 })}
 </div>
 </div>

 {/* Right: Article Details */}
 <div className="md:col-span-8 p-6 bg-[#0B0F19] overflow-y-auto max-h-[65vh] space-y-5">
 {selectedTopic && (
 <div>
 <div className="flex items-center gap-2 text-xs font-mono text-[#E8E8E8] uppercase tracking-wider mb-1">
 <Shield className="w-3.5 h-3.5" />
 <span>TACTICAL SURVIVAL DIRECTIVE</span>
 </div>
 <h3 className="text-2xl font-heading font-black text-white tracking-wide uppercase">
 {selectedTopic.title}
 </h3>
 <p className="text-xs font-mono text-[#94A3B8] mt-1 italic">
"{selectedTopic.summary}"
 </p>

 {/* Overview Box */}
 <div className="mt-4 p-4 bg-[#0E1524] border border-[#1E293B]">
 <h4 className="text-xs font-heading font-bold text-white uppercase tracking-wider mb-1.5 text-[#E8E8E8]">
 EXECUTIVE OVERVIEW
 </h4>
 <p className="text-xs font-mono text-[#CBD5E1] leading-relaxed">
 {selectedTopic.content.overview}
 </p>
 </div>

 {/* Key Points */}
 <div className="mt-4 space-y-2">
 <h4 className="text-xs font-heading font-bold text-white uppercase tracking-wider">
 OPERATIONAL PROTOCOLS
 </h4>
 <div className="space-y-2">
 {selectedTopic.content.keyPoints.map((point, idx) => (
 <div
 key={idx}
 className="flex items-start gap-2.5 p-2.5 bg-[#090D16] border border-[#1C283B] text-xs font-mono text-[#94A3B8]"
 >
 <span className="text-[#E8E8E8] font-bold">[{idx + 1}]</span>
 <span className="leading-relaxed">{point}</span>
 </div>
 ))}
 </div>
 </div>

 {/* Pro Tips */}
 <div className="mt-4 p-3.5 bg-gradient-to-r from-[#172554]/40 to-[#0F172A]/40 border border-[#64748B]/50">
 <div className="flex items-center gap-2 text-xs font-heading font-bold text-[#CBD5E1] uppercase tracking-wide mb-1.5">
 <Sparkles className="w-4 h-4 text-[#CBD5E1]" />
 <span>VETERAN SURVIVOR FIELD TIPS</span>
 </div>
 <ul className="space-y-1.5 text-xs font-mono text-[#93C5FD]">
 {selectedTopic.content.proTips.map((tip, idx) => (
 <li key={idx} className="flex items-start gap-2">
 <span className="text-[#CBD5E1]">•</span>
 <span>{tip}</span>
 </li>
 ))}
 </ul>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Footer */}
 <div className="flex items-center justify-between px-6 py-3.5 border-t border-[#1E293B] bg-[#0E1524]">
 <span className="text-[10px] font-mono text-[#64748B]">
 HOTKEY CHEAT SHEET: [ESC] Tactical Menu | [F5] Quick Save | [F9] Quick Load | [SPACE] Pause Time
 </span>
 <button
 onClick={onClose}
 className="px-5 py-1.5 bg-[#1E293B] hover:bg-[#2A374A] border border-[#E8E8E8]/40 text-xs font-mono text-white transition-colors"
 >
 CLOSE MANUAL
 </button>
 </div>
 </div>
 </div>
 );
};
