import React, { useState } from 'react';
import {
  X,
  Globe,
  MapPin,
  Shield,
  Zap,
  Users,
  Sun,
  Snowflake,
  Flame,
  AlertTriangle,
  ChevronRight,
  Sparkles,
  Check,
  Compass,
  Palette,
  Flag,
  Package,
  Skull,
} from 'lucide-react';
import { LOCATION_PRESETS } from '../data/sampleMapData';
import { LocationPreset } from '../types/map';
import { ColonyBannerConfig, GameDifficulty, GameScenarioSettings } from '../types/saveGame';
import { SeasonType } from '../types/weather';
import { soundService } from '../services/soundService';
import { calculateDifficultyScore } from '../services/difficultyCalculator';
import { DEFAULT_BANNER_CONFIG } from '../data/bannerCatalog';
import { BannerCustomizerModal } from './BannerCustomizerModal';
import { TacticalBanner } from './TacticalBanner';

interface NewGameSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartGame: (
    scenario: GameScenarioSettings,
    selectedPreset: LocationPreset,
    openGlobeDirectly?: boolean
  ) => void;
}

export const NewGameSetupModal: React.FC<NewGameSetupModalProps> = ({
  isOpen,
  onClose,
  onStartGame,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'scenario'>('presets');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(LOCATION_PRESETS[0].id);
  const [customColonyName, setCustomColonyName] = useState<string>('Sector Alpha Outpost');
  const [difficultyPreset, setDifficultyPreset] = useState<GameDifficulty>('normal');
  const [season, setSeason] = useState<SeasonType>('spring');
  const [supplies, setSupplies] = useState<'plentiful' | 'standard' | 'scarce'>('standard');
  const [zombieAggression, setZombieAggression] = useState<'low' | 'normal' | 'high'>('normal');
  const [populationCount, setPopulationCount] = useState<number>(8);
  const [tutorialEnabled, setTutorialEnabled] = useState<boolean>(true);
  const [convoyStart, setConvoyStart] = useState<boolean>(false);
  const [bannerConfig, setBannerConfig] = useState<ColonyBannerConfig>(DEFAULT_BANNER_CONFIG);
  const [isBannerModalOpen, setIsBannerModalOpen] = useState<boolean>(false);

  if (!isOpen) return null;

  const selectedPreset =
    LOCATION_PRESETS.find((p) => p.id === selectedPresetId) || LOCATION_PRESETS[0];

  const handleSelectPreset = (p: LocationPreset) => {
    setSelectedPresetId(p.id);
    setCustomColonyName(`${p.name} Sector Command`);
    soundService.playCombatActionSFX('assault_order');
  };

  const handleSelectDifficultyPreset = (preset: GameDifficulty) => {
    setDifficultyPreset(preset);
    if (preset === 'easy') {
      setSupplies('plentiful');
      setZombieAggression('low');
      setPopulationCount(14);
    } else if (preset === 'normal') {
      setSupplies('standard');
      setZombieAggression('normal');
      setPopulationCount(8);
    } else if (preset === 'hard') {
      setSupplies('scarce');
      setZombieAggression('high');
      setPopulationCount(5);
    } else if (preset === 'nightmare') {
      setSupplies('scarce');
      setZombieAggression('high');
      setPopulationCount(4);
    }
  };

  // Live difficulty calculation based on actual options chosen
  const diffResult = calculateDifficultyScore({
    startingPopulation: populationCount,
    startingSupplies: supplies,
    zombieAggression,
    difficultyPreset,
    season,
    convoyStart,
  });

  const handleLaunchGame = (useGlobe: boolean = false) => {
    soundService.playCombatActionSFX('assault_order');
    const scenario: GameScenarioSettings = {
      difficulty: difficultyPreset,
      colonyName: customColonyName.trim() || `${selectedPreset.name} Command`,
      startingSeason: season,
      startingSupplies: supplies,
      zombieAggression,
      startingPopulation: populationCount,
      tutorialEnabled,
      convoyStart,
      banner: bannerConfig,
      difficultyScore: diffResult.score,
      difficultyPercentage: diffResult.percentage,
      peopleLevel: populationCount <= 6 ? 1 : populationCount <= 12 ? 2 : 3,
      resourcesLevel: supplies === 'scarce' ? 1 : supplies === 'plentiful' ? 3 : 2,
      hordesLevel: zombieAggression === 'high' ? 3 : zombieAggression === 'low' ? 1 : 2,
    };
    onStartGame(scenario, selectedPreset, useGlobe);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none animate-fadeIn">
        <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#0B0F19] border-2 border-[#24334A] overflow-hidden text-[#CBD5E1] font-sans clip-tactical-bracket surface-bevel">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E293B] bg-[#0E1524]">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#1E293B] border border-[#E8E8E8]/40 text-[#E8E8E8]">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-heading font-black tracking-wide text-white uppercase">
                  NEW EXPEDITION SETUP
                </h2>
                <p className="text-xs font-mono text-[#94A3B8]">
                  Select operational theater and configure tactical survival parameters
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

          {/* Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-[#1E293B] bg-[#090D15] px-6">
            <div className="flex">
              <button
                onClick={() => setActiveTab('presets')}
                className={`px-4 py-2.5 text-xs font-heading font-bold uppercase tracking-wider border-b-2 transition-colors ${
                  activeTab === 'presets'
                    ? 'border-amber-500 text-amber-400 bg-[#0E1524]'
                    : 'border-transparent text-[#64748B] hover:text-white'
                }`}
              >
                1. LOCATION & SECTOR
              </button>
              <button
                onClick={() => setActiveTab('scenario')}
                className={`px-4 py-2.5 text-xs font-heading font-bold uppercase tracking-wider border-b-2 transition-colors ${
                  activeTab === 'scenario'
                    ? 'border-amber-500 text-amber-400 bg-[#0E1524]'
                    : 'border-transparent text-[#64748B] hover:text-white'
                }`}
              >
                2. SCENARIO & CUSTOMIZATION
              </button>
            </div>

            {/* Banner Quick Preview & Trigger */}
            <button
              onClick={() => setIsBannerModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1 bg-[#131E33] hover:bg-[#1A2A47] border border-[#24334A] hover:border-amber-500 text-xs font-heading text-neutral-200 transition-all cursor-pointer"
            >
              <TacticalBanner banner={bannerConfig} size="sm" showBorder={false} />
              <div className="text-left">
                <span className="text-[9px] font-mono text-neutral-400 uppercase leading-none block">
                  Colony Crest
                </span>
                <span className="text-xs font-bold text-amber-400">CUSTOMIZE BANNER</span>
              </div>
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === 'presets' ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs font-mono text-[#94A3B8] uppercase">
                    FEATURED GLOBAL SECTORS (REAL-WORLD OSM DATA)
                  </div>
                  <button
                    onClick={() => handleLaunchGame(true)}
                    className="flex items-center gap-1.5 text-xs font-mono text-amber-400 hover:text-amber-300 bg-[#10192A] hover:bg-[#1A263D] px-3 py-1.5 border border-amber-500/40 transition-colors"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>OPEN 3D GLOBE EXPLORER</span>
                  </button>
                </div>

                {/* Presets Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {LOCATION_PRESETS.map((p) => {
                    const isSelected = p.id === selectedPresetId;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectPreset(p)}
                        className={`cursor-pointer p-4 border transition-all text-left ${
                          isSelected
                            ? 'bg-[#131E33] border-amber-500 ring-1 ring-amber-500/50'
                            : 'bg-[#0E1524]/90 hover:bg-[#152033] border-[#1E2C42]'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="text-sm font-heading font-black text-white tracking-wide uppercase">
                              {p.name}
                            </h4>
                            <span className="text-[11px] font-mono text-amber-400">{p.country}</span>
                          </div>
                          {isSelected && (
                            <div className="p-1 bg-amber-500 text-black">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </div>
                        <p className="text-xs font-mono text-[#94A3B8] mt-2 line-clamp-2">
                          {p.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Colony Designation & Banner Banner Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 p-4 bg-[#0E1524] border border-[#1E293B]">
                    <label className="block text-xs font-mono text-[#94A3B8] uppercase mb-1">
                      EXPEDITION OUTPOST DESIGNATION
                    </label>
                    <input
                      id="new-game-colony-name"
                      name="colonyName"
                      type="text"
                      value={customColonyName}
                      onChange={(e) => setCustomColonyName(e.target.value)}
                      className="w-full bg-[#070A10] border border-[#24334A] text-white px-3.5 py-2 text-sm font-tech font-bold outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Banner Card Trigger */}
                  <div
                    onClick={() => setIsBannerModalOpen(true)}
                    className="p-4 bg-[#0E1524] border border-[#1E293B] hover:border-amber-500 cursor-pointer flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <TacticalBanner banner={bannerConfig} size="md" showBorder={true} />
                      <div>
                        <div className="text-[10px] font-mono text-[#94A3B8] uppercase">
                          BATTLE CREST
                        </div>
                        <div className="text-xs font-heading font-bold text-amber-400">
                          EDIT STANDARD
                        </div>
                      </div>
                    </div>
                    <Palette className="w-4 h-4 text-neutral-400" />
                  </div>
                </div>

                {/* Difficulty Archetypes */}
                <div className="space-y-2">
                  <div className="text-xs font-mono text-[#94A3B8] uppercase">
                    DIFFICULTY ARCHETYPE
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        id: 'easy',
                        name: 'SCAVENGER (EASY)',
                        desc: 'Abundant supplies, slower night horde surges, gentle start.',
                        badge: 'STORY',
                        color: 'border-emerald-700/60 bg-emerald-950/20 text-emerald-300',
                      },
                      {
                        id: 'normal',
                        name: 'SURVIVOR (STANDARD)',
                        desc: 'Authentic IFZ challenge. Balanced resources and aggression.',
                        badge: 'RECOMMENDED',
                        color: 'border-amber-700/60 bg-amber-950/20 text-amber-300',
                      },
                      {
                        id: 'hard',
                        name: 'NIGHTMARE (HARDCORE)',
                        desc: 'Relentless sprint hordes, scarce ammo, high mortality.',
                        badge: 'LETHAL',
                        color: 'border-red-700/60 bg-red-950/20 text-red-400',
                      },
                    ].map((d) => {
                      const isSelected = difficultyPreset === d.id;
                      return (
                        <div
                          key={d.id}
                          onClick={() => handleSelectDifficultyPreset(d.id as GameDifficulty)}
                          className={`cursor-pointer p-4 border transition-all ${
                            isSelected
                              ? 'bg-[#131E33] border-amber-500 ring-1 ring-amber-500/50'
                              : 'bg-[#0E1524] hover:bg-[#152033] border-[#1E293B]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-heading font-bold text-white uppercase">
                              {d.name}
                            </span>
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 border ${d.color}`}>
                              {d.badge}
                            </span>
                          </div>
                          <p className="text-xs font-mono text-[#94A3B8] mt-1">{d.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Modifiers Grid (People, Loot, Horde Size) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* People / Population */}
                  <div className="p-4 bg-[#0E1524] border border-[#1E293B] space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono text-[#94A3B8] uppercase flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        <span>STARTING POPULATION</span>
                      </label>
                      <span className="text-xs font-tech font-bold text-white">
                        {populationCount} SURVIVORS
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { count: 5, label: 'LOW (5)' },
                        { count: 10, label: 'MED (10)' },
                        { count: 18, label: 'HIGH (18)' },
                      ].map((p) => (
                        <button
                          key={p.count}
                          type="button"
                          onClick={() => {
                            setPopulationCount(p.count);
                            setDifficultyPreset('custom');
                          }}
                          className={`py-1.5 px-1 text-[11px] font-mono border transition-all text-center ${
                            populationCount === p.count
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                              : 'bg-[#0A0E18] border-[#1A2434] text-[#64748B] hover:text-white'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Loot / Supplies */}
                  <div className="p-4 bg-[#0E1524] border border-[#1E293B] space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono text-[#94A3B8] uppercase flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-amber-400" />
                        <span>LOOT & SUPPLIES</span>
                      </label>
                      <span className="text-xs font-tech font-bold text-white uppercase">
                        {supplies}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'scarce', label: 'SCARCE' },
                        { id: 'standard', label: 'STANDARD' },
                        { id: 'plentiful', label: 'PLENTIFUL' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSupplies(s.id as any);
                            setDifficultyPreset('custom');
                          }}
                          className={`py-1.5 px-1 text-[11px] font-mono border transition-all text-center ${
                            supplies === s.id
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                              : 'bg-[#0A0E18] border-[#1A2434] text-[#64748B] hover:text-white'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Horde Size & Aggression */}
                  <div className="p-4 bg-[#0E1524] border border-[#1E293B] space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono text-[#94A3B8] uppercase flex items-center gap-1.5">
                        <Skull className="w-3.5 h-3.5 text-red-400" />
                        <span>HORDE AGGRESSION</span>
                      </label>
                      <span className="text-xs font-tech font-bold text-white uppercase">
                        {zombieAggression}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'low', label: 'LOW' },
                        { id: 'normal', label: 'NORMAL' },
                        { id: 'high', label: 'INTENSE' },
                      ].map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => {
                            setZombieAggression(h.id as any);
                            setDifficultyPreset('custom');
                          }}
                          className={`py-1.5 px-1 text-[11px] font-mono border transition-all text-center ${
                            zombieAggression === h.id
                              ? 'bg-red-500/20 border-red-500 text-red-300 font-bold'
                              : 'bg-[#0A0E18] border-[#1A2434] text-[#64748B] hover:text-white'
                          }`}
                        >
                          {h.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Season & Climate Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-[#0E1524] border border-[#1E293B]">
                    <label className="block text-xs font-mono text-[#94A3B8] uppercase mb-2">
                      STARTING CLIMATE & SEASON (§9)
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: 'spring', label: 'SPRING', icon: Sun },
                        { id: 'summer', label: 'SUMMER', icon: Flame },
                        { id: 'autumn', label: 'AUTUMN', icon: Sparkles },
                        { id: 'winter', label: 'WINTER', icon: Snowflake },
                      ].map((s) => {
                        const Icon = s.icon;
                        const isSelected = season === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSeason(s.id as SeasonType)}
                            className={`flex flex-col items-center justify-center p-2 border text-xs font-mono transition-all ${
                              isSelected
                                ? 'bg-amber-500/20 border-amber-500 text-white'
                                : 'bg-[#0A0E18] border-[#1A2434] text-[#64748B] hover:text-white'
                            }`}
                          >
                            <Icon className="w-4 h-4 text-amber-400 mb-1" />
                            <span className="text-[10px]">{s.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Calculated Difficulty Score Banner */}
                  <div className="p-4 bg-[#080B12] border border-[#24334A] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-[#94A3B8] uppercase">
                          CALCULATED DIFFICULTY SCORE
                        </span>
                        <span
                          className="px-2 py-0.5 text-xs font-mono font-bold uppercase border"
                          style={{
                            borderColor: diffResult.color,
                            color: diffResult.color,
                            backgroundColor: `${diffResult.color}15`,
                          }}
                        >
                          {diffResult.tier} ({diffResult.percentage})
                        </span>
                      </div>
                      <div className="text-sm font-mono text-neutral-300 mt-2">
                        {diffResult.ratingStars} &mdash; {diffResult.summary}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-neutral-400 border-t border-neutral-800 pt-2">
                      <span>XP & SCORE MULTIPLIER:</span>
                      <span className="text-amber-400 font-bold">{(diffResult.score / 100).toFixed(2)}x</span>
                    </div>
                  </div>
                </div>

                {/* Additional Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 bg-[#0E1524] border border-[#1E293B] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-heading font-bold text-white uppercase">
                        TACTICAL ONBOARDING GUIDE
                      </div>
                      <div className="text-[11px] font-mono text-[#94A3B8]">
                        Step-by-step tutorial instructions for HQ and squads
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={tutorialEnabled}
                      onChange={(e) => setTutorialEnabled(e.target.checked)}
                      className="w-4 h-4 accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="p-3 bg-[#0E1524] border border-[#1E293B] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-heading font-bold text-white uppercase">
                        CONVOY START VEHICLE
                      </div>
                      <div className="text-[11px] font-mono text-[#94A3B8]">
                        Begin expedition with an operational patrol truck
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={convoyStart}
                      onChange={(e) => setConvoyStart(e.target.checked)}
                      className="w-4 h-4 accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#1E293B] bg-[#0E1524]">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#121826] hover:bg-[#1E293B] border border-[#24334A] text-xs font-mono text-[#94A3B8] hover:text-white transition-colors"
            >
              CANCEL
            </button>

            <div className="flex items-center gap-3">
              {activeTab === 'presets' ? (
                <button
                  onClick={() => setActiveTab('scenario')}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-heading font-bold tracking-wider uppercase transition-colors"
                >
                  <span>NEXT: SCENARIO SETTINGS</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => handleLaunchGame(false)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 border border-amber-300 text-black text-sm font-heading font-black tracking-wider uppercase shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all"
                >
                  <Shield className="w-4 h-4" />
                  <span>DEPLOY COLONY // START</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Banner Customizer Modal */}
      <BannerCustomizerModal
        isOpen={isBannerModalOpen}
        initialBanner={bannerConfig}
        colonyName={customColonyName}
        onClose={() => setIsBannerModalOpen(false)}
        onSave={(newBanner) => setBannerConfig(newBanner)}
      />
    </>
  );
};
