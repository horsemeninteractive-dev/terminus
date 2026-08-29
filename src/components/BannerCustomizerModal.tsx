import React, { useState } from 'react';
import {
  X,
  Check,
  Flag,
  RotateCcw,
  Swords,
  Heart,
  Crown,
  Cog,
  LayoutGrid,
} from 'lucide-react';
import { ColonyBannerConfig } from '../types/saveGame';
import {
  BANNER_ACCENT_COLORS,
  BANNER_ICONS,
  BANNER_PATTERNS,
  BANNER_PRIMARY_COLORS,
  BANNER_STYLES,
  DEFAULT_BANNER_CONFIG,
} from '../data/bannerCatalog';
import { TacticalBanner } from './TacticalBanner';

interface BannerCustomizerModalProps {
  isOpen: boolean;
  initialBanner?: Partial<ColonyBannerConfig>;
  colonyName?: string;
  onClose: () => void;
  onSave: (banner: ColonyBannerConfig) => void;
}

export const BannerCustomizerModal: React.FC<BannerCustomizerModalProps> = ({
  isOpen,
  initialBanner,
  colonyName = 'Colony Banner',
  onClose,
  onSave,
}) => {
  const [config, setConfig] = useState<ColonyBannerConfig>({
    ...DEFAULT_BANNER_CONFIG,
    ...(initialBanner || {}),
  });

  const [activeTab, setActiveTab] = useState<'style' | 'icon' | 'color' | 'pattern'>('style');
  const [iconCategory, setIconCategory] = useState<'all' | 'combat' | 'survival' | 'leadership' | 'industry'>('all');

  if (!isOpen) return null;

  const handleReset = () => {
    setConfig(DEFAULT_BANNER_CONFIG);
  };

  const handleApply = () => {
    onSave(config);
    onClose();
  };

  const filteredIcons = iconCategory === 'all'
    ? BANNER_ICONS
    : BANNER_ICONS.filter((ic) => ic.category === iconCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn select-none">
      <div className="relative w-full max-w-3xl bg-[#111317] border border-[#2D333B] shadow-[0_0_60px_rgba(0,0,0,0.95)] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#181B20] border-b border-[#2D333B]">
          <div className="flex items-center gap-2.5">
            <Flag className="w-5 h-5 text-amber-500" />
            <span className="font-heading text-lg tracking-wider text-neutral-100 font-bold">
              EXPEDITION STANDARD & BANNER CUSTOMIZER
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Layout: Left is Interactive Live Preview, Right is Options */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 p-5 overflow-y-auto">
          {/* Left Preview Pane */}
          <div className="md:col-span-4 flex flex-col items-center justify-between p-4 bg-[#0A0C0E] border border-[#23272E] relative">
            <div className="w-full text-center border-b border-neutral-800 pb-2 mb-3">
              <span className="text-[10px] font-mono text-neutral-400 tracking-wider">
                LIVE HUD STANDARD
              </span>
              <p className="text-sm font-heading font-bold text-amber-400 truncate mt-0.5">
                {colonyName}
              </p>
            </div>

            {/* Banner Display */}
            <div className="my-4 flex flex-col items-center gap-3">
              <TacticalBanner banner={config} size="hero" showBorder={true} />
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
                <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-900 border border-neutral-700 text-neutral-300 uppercase">
                  {config.style.replace('_', ' ')}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-900 border border-neutral-700 text-neutral-300 uppercase">
                  {config.icon.replace('_', ' ')}
                </span>
                {config.pattern && (
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-900 border border-neutral-700 text-amber-300/80 uppercase">
                    {config.pattern}
                  </span>
                )}
              </div>
            </div>

            {/* In-Game HUD Simulation Preview */}
            <div className="w-full bg-[#16191E] border border-[#2D333B] p-2 flex items-center gap-2">
              <TacticalBanner banner={config} size="sm" showBorder={false} />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-mono text-neutral-500 uppercase leading-none">
                  Colony Crest
                </div>
                <div className="text-xs font-bold text-neutral-200 truncate uppercase">
                  {colonyName}
                </div>
              </div>
            </div>
          </div>

          {/* Right Customization Controls */}
          <div className="md:col-span-8 flex flex-col space-y-3">
            {/* Tab navigation */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-[#0A0C0E] border border-[#23272E]">
              {(['style', 'icon', 'color', 'pattern'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-2 text-xs font-heading font-bold uppercase tracking-wider transition-colors ${
                    activeTab === tab
                      ? 'bg-amber-500/20 text-amber-400 border-b-2 border-amber-500'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[280px] max-h-[380px] overflow-y-auto bg-[#0A0C0E] border border-[#23272E] p-3.5">
              {/* Tab 1: Style Cut */}
              {activeTab === 'style' && (
                <div className="space-y-3">
                  <div className="text-xs text-neutral-400 font-mono">
                    SELECT BANNER CUT & SILHOUETTE ({BANNER_STYLES.length} STYLES):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {BANNER_STYLES.map((st) => {
                      const isSelected = config.style === st.id;
                      return (
                        <button
                          key={st.id}
                          onClick={() => setConfig((prev) => ({ ...prev, style: st.id }))}
                          className={`flex items-center gap-3 p-2.5 text-left border transition-all ${
                            isSelected
                              ? 'bg-amber-500/10 border-amber-500 text-neutral-100'
                              : 'bg-[#121519] border-[#22272E] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
                          }`}
                        >
                          <TacticalBanner
                            banner={{ ...config, style: st.id }}
                            size="sm"
                            showBorder={false}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-heading font-bold text-sm leading-tight text-neutral-200">
                              {st.name}
                            </div>
                            <div className="text-[10px] text-neutral-500 leading-tight truncate mt-0.5">
                              {st.description}
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab 2: Icon Emblems */}
              {activeTab === 'icon' && (
                <div className="space-y-3">
                  {/* Category Filter */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1">
                    {[
                      { id: 'all', label: 'All', icon: LayoutGrid },
                      { id: 'combat', label: 'Combat', icon: Swords },
                      { id: 'survival', label: 'Survival', icon: Heart },
                      { id: 'leadership', label: 'Leadership', icon: Crown },
                      { id: 'industry', label: 'Industry', icon: Cog },
                    ].map((cat) => {
                      const IconComp = cat.icon;
                      const isCatActive = iconCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setIconCategory(cat.id as any)}
                          className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider border transition-all ${
                            isCatActive
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500 font-bold'
                              : 'bg-[#121519] text-neutral-400 border-[#22272E] hover:text-neutral-200'
                          }`}
                        >
                          <IconComp className="w-3 h-3" />
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {filteredIcons.map((ic) => {
                      const isSelected = config.icon === ic.id;
                      return (
                        <button
                          key={ic.id}
                          onClick={() => setConfig((prev) => ({ ...prev, icon: ic.id }))}
                          className={`flex flex-col items-center justify-center p-2.5 border transition-all ${
                            isSelected
                              ? 'bg-amber-500/15 border-amber-500 text-neutral-100 shadow-[inset_0_0_12px_rgba(245,158,11,0.25)]'
                              : 'bg-[#121519] border-[#22272E] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
                          }`}
                        >
                          <TacticalBanner
                            banner={{ ...config, icon: ic.id }}
                            size="md"
                            showBorder={false}
                          />
                          <span className="font-heading font-bold text-[11px] mt-1.5 text-center truncate w-full">
                            {ic.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab 3: Colors */}
              {activeTab === 'color' && (
                <div className="space-y-4">
                  {/* Primary Banner Color */}
                  <div>
                    <div className="text-xs text-neutral-400 font-mono mb-2">
                      PRIMARY FIELD COLOR:
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                      {BANNER_PRIMARY_COLORS.map((col) => (
                        <button
                          key={col.id}
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              primaryColor: col.hex,
                              secondaryColor: col.borderHex,
                            }))
                          }
                          className={`flex items-center gap-2 p-1.5 border text-left text-xs ${
                            config.primaryColor === col.hex
                              ? 'border-amber-500 bg-neutral-800 font-bold text-white'
                              : 'border-[#22272E] bg-[#121519] text-neutral-400 hover:border-neutral-600'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-none border border-black shrink-0 shadow-sm"
                            style={{ backgroundColor: col.hex }}
                          />
                          <span className="truncate text-[10px]">{col.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Icon Accent Color */}
                  <div>
                    <div className="text-xs text-neutral-400 font-mono mb-2">
                      EMBLEM ACCENT COLOR:
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                      {BANNER_ACCENT_COLORS.map((col) => (
                        <button
                          key={col.id}
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              iconColor: col.hex,
                            }))
                          }
                          className={`flex items-center gap-2 p-1.5 border text-left text-xs ${
                            config.iconColor === col.hex
                              ? 'border-amber-500 bg-neutral-800 font-bold text-white'
                              : 'border-[#22272E] bg-[#121519] text-neutral-400 hover:border-neutral-600'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-none border border-black shrink-0 shadow-sm"
                            style={{ backgroundColor: col.hex }}
                          />
                          <span className="truncate text-[10px]">{col.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Pattern */}
              {activeTab === 'pattern' && (
                <div className="space-y-3">
                  <div className="text-xs text-neutral-400 font-mono">
                    TACTICAL FIELD PATTERN ({BANNER_PATTERNS.length} PATTERNS):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {BANNER_PATTERNS.map((pat) => (
                      <button
                        key={pat.id}
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            pattern: pat.id,
                          }))
                        }
                        className={`p-2.5 border text-left transition-all ${
                          config.pattern === pat.id
                            ? 'bg-amber-500/10 border-amber-500 text-neutral-100'
                            : 'bg-[#121519] border-[#22272E] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
                        }`}
                      >
                        <div className="font-heading font-bold text-xs text-neutral-200">
                          {pat.name}
                        </div>
                        <div className="text-[10px] text-neutral-500 mt-0.5 leading-tight">
                          {pat.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-[#181B20] border-t border-[#2D333B]">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-neutral-400 hover:text-neutral-200 bg-neutral-800/60 border border-neutral-700 hover:border-neutral-500 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            RESET DEFAULT
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-heading font-bold tracking-wider text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 transition-colors"
            >
              CANCEL
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-1.5 px-5 py-1.5 text-xs font-heading font-bold tracking-wider text-black bg-amber-500 hover:bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)] transition-colors"
            >
              <Check className="w-4 h-4" />
              CONFIRM STANDARD
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
