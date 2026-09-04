import React from 'react';
import {
  Archive,
  Calendar,
  Clock,
  Cloud,
  Crosshair,
  Droplets,
  FlaskConical,
  Hammer,
  ListTodo,
  Menu,
  Moon,
  Pause,
  Pill,
  Play,
  Radio,
  Scale,
  Sun,
  TriangleAlert,
  Wheat,
} from 'lucide-react';
import { GameClockState, NoiseEvent, WEAPON_IDS, WeaponItemId, getWeaponDefinition } from '../types/combat';
import { SettlementState } from '../types/settlement';
import { WEATHER_CONDITIONS } from '../services/weatherService';
import { WeatherType } from '../types/weather';
import { RESEARCH_TREE_NODES } from '../data/researchTreeData';
import { TacticalBanner } from './TacticalBanner';
import { soundService } from '../services/soundService';

export type ActiveSidebarTab =
  | null
  | 'squads'
  | 'survivors'
  | 'build'
  | 'research'
  | 'vehicles'
  | 'caravans'
  | 'vitals'
  | 'inspector'
  | 'debug';

interface TacticalHeaderStripProps {
  settlement: SettlementState;
  clock: GameClockState;
  activeNoiseEvents?: NoiseEvent[];
  zombieCount: number;
  onSetSpeed: (speed: 0 | 1 | 2 | 4) => void;
  activeSidebar: ActiveSidebarTab;
  onToggleSidebar: (tab: ActiveSidebarTab) => void;
  onOpenGlobe: () => void;
  hasHQ: boolean;
  onOpenAudioSettings?: () => void;
  onOpenPauseMenu?: () => void;
  onOpenTechTree?: () => void;
  onOpenMoraleModal?: () => void;
  onOpenWeatherModal?: () => void;
  onOpenPopulationModal?: () => void;
  /** Task List button state — whether the top-left quest/objectives panel is open */
  questTrackerVisible?: boolean;
  onToggleQuestTracker?: () => void;
  /** Radio directives modal trigger */
  onOpenRadio?: () => void;
  radioUnreadCount?: number;
  /** Laws & Policy (§IFZ Major Update #5) — Gathering Place forum */
  onOpenLawModal?: () => void;
  lawsUnlocked?: boolean;
  lawsUnlockReason?: string;
  /** Expeditions (§IFZ) — off-map scavenging via the Antenna */
  onOpenExpeditionModal?: () => void;
  antennaOperational?: boolean;
}

interface ResourceDropdownItem {
  label: string;
  value: number;
  unit?: string;
}

/** Hover/touch dropdown panel that breaks one resource category down into its items. */
const ResourceDropdown: React.FC<{
  title: string;
  icon: React.ReactNode;
  items: ResourceDropdownItem[];
  align?: 'left' | 'right' | 'center';
}> = ({ title, icon, items, align = 'right' }) => (
  <div
    className={`absolute top-full mt-1.5 z-50 w-52 sm:w-56 bg-[#0B0F17]/98 border border-[#334155] shadow-[0_12px_32px_rgba(0,0,0,0.95)] backdrop-blur-md clip-tactical-bracket p-2.5 pointer-events-auto ${
      align === 'right' ? 'right-0' : align === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2'
    }`}
  >
    <div className="flex items-center justify-between gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[#94A3B8] border-b border-[#1E293B] pb-1.5 mb-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span>{title}</span>
      </div>
      <span className="text-[9px] font-mono text-[#64748B]">
        SUM: {items.reduce((s, it) => s + it.value, 0)}
      </span>
    </div>
    <div className="space-y-0.5 max-h-48 overflow-y-auto">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex justify-between items-center text-[10px] font-mono py-0.5 px-1 hover:bg-[#151D28]/60 transition-colors"
        >
          <span className="text-[#94A3B8] truncate mr-2">{it.label}</span>
          <span className="text-white font-bold shrink-0">
            {it.value}
            {it.unit || ''}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export const TacticalHeaderStrip: React.FC<TacticalHeaderStripProps> = ({
  settlement,
  clock,
  activeNoiseEvents = [],
  zombieCount,
  onSetSpeed,
  activeSidebar,
  onToggleSidebar,
  onOpenGlobe,
  hasHQ,
  onOpenAudioSettings,
  onOpenPauseMenu,
  onOpenTechTree,
  onOpenMoraleModal,
  onOpenWeatherModal,
  onOpenPopulationModal,
  questTrackerVisible,
  onToggleQuestTracker,
  onOpenRadio,
  radioUnreadCount = 0,
  onOpenLawModal,
  lawsUnlocked = false,
  lawsUnlockReason,
  onOpenExpeditionModal,
  antennaOperational = false,
}) => {
  const {
    stockpile,
    totalStorageCapacity,
    overflowLootUnits = 0,
    totalLivingCapacity,
    totalDefenseRating,
    namedSurvivors = [],
    generalPopulation,
    squads = [],
    vehicles = [],
    infections,
    morale,
    weather,
  } = settlement;

  const generalCount = generalPopulation?.total || 0;
  const totalPop = namedSurvivors.length + generalCount;

  // Active idle workers (unassigned general population — §4.6)
  const idleWorkers = generalPopulation?.unassigned || 0;

  // Active research project (drives the blue bottom-up fill on the Research button).
  const activeResearchId = settlement.research?.activeResearchId ?? null;
  const activeResearchNode = activeResearchId ? RESEARCH_TREE_NODES[activeResearchId] : null;
  const researchProgressPct = activeResearchNode
    ? Math.min(100, Math.max(0, ((settlement.research?.activeProgressSec || 0) / activeResearchNode.baseTimeSec) * 100))
    : 0;

  // Scientific Materials stockpile — displayed on the Research button when idle.
  const sciMat = Math.floor(stockpile?.materials?.scientific_materials ?? 0);

  // Resource totals & per-item breakdowns — all read from the real stockpile.
  // Amounts accumulate continuously (production rates × dt), so every meter is
  // floored to whole units for display: you can't hold half a canned good.
  const foodItems = [
    { label: 'Canned Goods', value: Math.floor(stockpile.food?.canned_goods || 0) },
    { label: 'MRE Rations', value: Math.floor(stockpile.food?.mre_rations || 0) },
    { label: 'Dried Rations', value: Math.floor(stockpile.food?.dried_rations || 0) },
    { label: 'Fresh Harvest', value: Math.floor(stockpile.food?.fresh_harvest || 0) },
  ];
  const totalFood = foodItems.reduce((acc, it) => acc + it.value, 0);

  const ammoItems = [{ label: 'Ammunition (Shared Pool)', value: Math.floor(stockpile.ammo?.sharedPool || 0) }];
  const totalAmmo = ammoItems[0].value;

  // Firearms: armory stock + weapons equipped by squad members, per weapon type.
  const weaponCounts: Partial<Record<WeaponItemId, number>> = {};
  for (const w of settlement.armory?.weapons || []) {
    weaponCounts[w] = (weaponCounts[w] || 0) + 1;
  }
  for (const sq of (squads as any[])) {
    for (const m of (sq.members || [])) {
      if (m.weaponId) weaponCounts[m.weaponId as WeaponItemId] = (weaponCounts[m.weaponId as WeaponItemId] || 0) + 1;
    }
  }
  const weaponItems = WEAPON_IDS.map((id) => ({
    label: getWeaponDefinition(id).name,
    value: weaponCounts[id] || 0,
  }));
  const totalWeapons = weaponItems.reduce((acc, it) => acc + it.value, 0);

  const medItems = [
    { label: 'First Aid Kits', value: Math.floor(stockpile.medical?.first_aid_kits || 0) },
    { label: 'Sterile Bandages', value: Math.floor(stockpile.medical?.sterile_bandages || 0) },
    { label: 'Antibiotics', value: Math.floor(stockpile.medical?.antibiotics || 0) },
    { label: 'Painkillers', value: Math.floor(stockpile.medical?.painkillers || 0) },
  ];
  const totalMeds = medItems.reduce((acc, it) => acc + it.value, 0);

  const liquidItems = [
    { label: 'Bottled Water', value: Math.floor(stockpile.water?.bottled_water || 0), unit: 'L' },
    { label: 'Purified Water', value: Math.floor(stockpile.water?.purified_water || 0), unit: 'L' },
    { label: 'Rainwater', value: Math.floor(stockpile.water?.rainwater || 0), unit: 'L' },
    { label: 'Gasoline', value: Math.floor(stockpile.fuel?.gasoline || 0), unit: 'L' },
    { label: 'Diesel', value: Math.floor(stockpile.fuel?.diesel || 0), unit: 'L' },
    { label: 'Biofuel', value: Math.floor(stockpile.fuel?.biofuel || 0), unit: 'L' },
  ];
  const totalLiquids = liquidItems.reduce((acc, it) => acc + it.value, 0);

  const materialItems = [
    { label: 'Wood', value: Math.floor(stockpile.materials?.wood || 0) },
    { label: 'Metal', value: Math.floor(stockpile.materials?.metal || 0) },
    { label: 'Bricks', value: Math.floor(stockpile.materials?.bricks || 0) },
    { label: 'Tools', value: Math.floor(stockpile.materials?.tools || 0) },
  ];
  const totalMaterials = materialItems.reduce((acc, it) => acc + it.value, 0);
  const stockpileUnits = totalFood + totalAmmo + totalMeds + totalLiquids + totalMaterials;
  const storageFull = totalStorageCapacity > 0 && stockpileUnits >= totalStorageCapacity;

  // Time & Clock Formats
  const { day, hour, minute, speed, phase, isNight } = clock;
  const displayHour = Math.floor(hour) < 10 ? `0${Math.floor(hour)}` : `${Math.floor(hour)}`;
  const displayMinute = minute < 10 ? `0${minute}` : `${minute}`;
  const time24h = `${displayHour}:${displayMinute}`;

  // Month mapping based on day (3-letter acronym: JAN, FEB, MAR, APR, MAY, JUN, JUL, AUG, SEP, OCT, NOV, DEC)
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthName = months[(Math.floor((day - 1) / 30) + 3) % 12];
  const dayInMonth = ((day - 1) % 30) + 1;

  // Temperature
  const tempC = Math.round(weather?.temperatureC ?? 1);

  // Live in-game weather readout
  const currentWeatherType: WeatherType = weather?.currentWeather ?? 'clear';
  const weatherName = WEATHER_CONDITIONS[currentWeatherType]?.name || 'Clear Skies';
  const SHORT_WEATHER: Partial<Record<WeatherType, string>> = {
    clear: 'CLEAR',
    overcast: 'OVERCAST',
    rain: 'RAIN',
    thunderstorm: 'STORM',
    dense_fog: 'FOG',
    heatwave: 'HEAT',
    freezing_frost: 'FROST',
    blizzard: 'BLIZZARD',
  };
  const weatherShort = SHORT_WEATHER[currentWeatherType] || currentWeatherType.toUpperCase();

  // Morale dropdown readouts
  const moraleScore = morale?.overallScore ?? 0;
  const moraleLabel = morale?.tierLabel || 'No Colony';

  // Alerts
  const isAmmoLow = totalAmmo < 20;
  const isShelterLow = totalLivingCapacity < totalPop;
  const isFoodLow = totalFood < 30;
  // Real, active water shortage — waterService.consumeSettlementWater could not
  // meet the colony's draw (store and cistern reserves exhausted) last tick.
  const isWaterShortage = (settlement.waterState?.shortageDays || 0) > 0;

  // Render Morale Bar with hover tooltip dropdown
  const renderMoraleBar = (compact: boolean = false) => {
    const barColor =
      moraleScore >= 60 ? 'bg-[#10B981]' : moraleScore >= 30 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]';
    const textColor =
      moraleScore >= 60 ? 'text-[#10B981]' : moraleScore >= 30 ? 'text-[#F59E0B]' : 'text-[#EF4444]';

    return (
      <div className="relative group flex items-center h-full">
        <button
          onClick={onOpenMoraleModal || (() => onToggleSidebar('vitals'))}
          title={`Colony Morale: ${moraleScore}/100 (${moraleLabel}) — Click to view Morale Details`}
          className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-[#151D28] transition-colors cursor-pointer shrink-0"
        >
          {/* Segmented morale green/status bar gauge */}
          <div className="flex items-end gap-0.5 h-3.5 pb-0.5">
            <div
              className={`w-1 rounded-[0.5px] transition-all ${
                moraleScore > 10 ? barColor : 'bg-[#334155]'
              } h-1.5`}
            />
            <div
              className={`w-1 rounded-[0.5px] transition-all ${
                moraleScore > 35 ? barColor : 'bg-[#334155]'
              } h-2`}
            />
            <div
              className={`w-1 rounded-[0.5px] transition-all ${
                moraleScore > 65 ? barColor : 'bg-[#334155]'
              } h-2.5`}
            />
            <div
              className={`w-1 rounded-[0.5px] transition-all ${
                moraleScore > 85 ? barColor : 'bg-[#334155]'
              } h-3.5`}
            />
          </div>
          {!compact && (
            <span className={`text-[10px] font-mono font-bold leading-none ${textColor}`}>
              {moraleScore}
            </span>
          )}
        </button>

        {/* Morale hover dropdown tooltip */}
        <div className="hidden group-hover:block absolute top-full left-0 mt-1.5 z-50 w-60 bg-[#0B0F17]/98 border border-[#334155] shadow-[0_12px_32px_rgba(0,0,0,0.95)] backdrop-blur-md clip-tactical-bracket p-2.5 pointer-events-auto">
          <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-[#94A3B8] border-b border-[#1E293B] pb-1.5 mb-1.5">
            <span className="flex items-center gap-1.5">
              <div className="flex items-end gap-0.5 h-2.5">
                <div className="w-0.5 h-1.5 bg-[#10B981]" />
                <div className="w-0.5 h-2 bg-[#10B981]" />
                <div className="w-0.5 h-2.5 bg-[#10B981]" />
              </div>
              Colony Morale
            </span>
            <span className={`${textColor} font-mono font-bold`}>{moraleScore}/100</span>
          </div>
          <div className="text-[10px] font-mono text-white font-bold mb-1.5">{moraleLabel}</div>
          <div className="space-y-0.5">
            {(morale?.factors || []).slice(0, 3).map((f) => (
              <div
                key={f.id}
                className="flex justify-between items-center text-[10px] font-mono py-0.5 px-1 hover:bg-[#151D28]/60 transition-colors"
              >
                <span className="text-[#94A3B8] truncate mr-2">{f.name}</span>
                <span
                  className={`font-bold shrink-0 ${
                    f.scoreDelta >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                  }`}
                >
                  {f.scoreDelta >= 0 ? '+' : ''}
                  {f.scoreDelta}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-[#1E293B] text-[9px] font-mono text-[#64748B] flex justify-between">
            <span>Food: {morale?.daysOfFoodRemaining ?? '—'}d</span>
            <span className={isWaterShortage ? 'text-[#FF4D4D] font-bold animate-pulse' : ''}>
              Water: {isWaterShortage ? 'SHORTAGE' : `${morale?.daysOfWaterRemaining ?? '—'}d`}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Render Warning Alert Dropdown Ribbons
  const renderWarningRibbons = () => {
    if (!isAmmoLow && !isShelterLow && !isFoodLow && !isWaterShortage) return null;
    return (
      <div className="flex items-start justify-center gap-1 z-20 pointer-events-auto">
        {/* Yellow Ammo Low Ribbon */}
        {isAmmoLow && (
          <div
            title="Warning: Settlement Ammunition Depleted!"
            className="w-5 h-6 bg-[#F59E0B] border-x border-b border-[#D97706] flex items-center justify-center text-black font-black text-[9px] animate-bounce shadow-md"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% 80%, 50% 100%, 0 80%)' }}
          >
            !
          </div>
        )}

        {/* Red Shelter Warning Ribbon */}
        {isShelterLow && (
          <div
            title="Warning: Colonists Lack Shelters / Living Quarters!"
            className="w-5 h-6 bg-[#EF4444] border-x border-b border-[#B91C1C] flex items-center justify-center text-white font-black text-[9px] shadow-md"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% 80%, 50% 100%, 0 80%)' }}
          >
            !
          </div>
        )}

        {/* Yellow Food Warning Ribbon */}
        {isFoodLow && (
          <div
            title="Warning: Colony Food Stockpile Low!"
            className="w-5 h-6 bg-[#F59E0B] border-x border-b border-[#D97706] flex items-center justify-center text-black font-black text-[9px] shadow-md"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% 80%, 50% 100%, 0 80%)' }}
          >
            !
          </div>
        )}

        {/* Red Water Shortage Ribbon — real unmet draw, not a forecast */}
        {isWaterShortage && (
          <div
            title="Water Shortage: the colony cannot meet its water draw — stores and cisterns are dry!"
            className="w-5 h-6 bg-[#EF4444] border-x border-b border-[#B91C1C] flex items-center justify-center text-white font-black text-[9px] animate-bounce shadow-md"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% 80%, 50% 100%, 0 80%)' }}
          >
            ~
          </div>
        )}
      </div>
    );
  };

  // Render Day/Night White-Stroked Orb
  const renderDayNightOrb = (sizeClass: string = 'w-6 h-6') => (
    <div className="relative flex flex-col items-center shrink-0">
      <div
        id="tactical-time-of-day-orb"
        title={`Cycle Phase: ${phase.toUpperCase()} (${isNight ? 'Nightfall - High Threat' : 'Daylight'}) - Tap to Pause/Resume`}
        className={`relative ${sizeClass} rounded-full bg-[#0A0D12] border-2 border-white shadow-[0_0_8px_rgba(255,255,255,0.3)] flex items-center justify-center overflow-hidden cursor-pointer shrink-0 transition-transform hover:scale-105 active:scale-95`}
        onClick={() => {
          if (speed === 0) {
            soundService.playTimeResume();
            onSetSpeed(1);
          } else {
            soundService.playTimePause();
            onSetSpeed(0);
          }
        }}
      >
        {isNight ? (
          <div className="relative flex items-center justify-center">
            <Moon className="w-3 h-3 text-[#818CF8]" />
            <div className="absolute -top-0.5 -right-0.5 w-1 h-1 bg-white rounded-full animate-ping" />
          </div>
        ) : (
          <Sun className="w-3.5 h-3.5 text-[#FBBF24]" />
        )}
      </div>
    </div>
  );

  // Render Speed Controls
  const renderSpeedControls = (compact: boolean = false) => (
    <div className="flex items-center bg-[#0A0D12]/90 border border-[#2A3140] clip-tactical-chamfer-tr-bl p-0.5 shrink-0">
      <button
        id="header-speed-pause"
        onClick={() => {
          soundService.playTimePause();
          onSetSpeed(0);
        }}
        title="Pause Simulation (Space)"
        className={`px-1.5 py-0.5 text-[10px] font-mono font-bold transition-colors ${
          speed === 0
            ? 'bg-[#10B981]/25 text-[#10B981] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.4)]'
            : 'text-[#64748B] hover:text-white'
        }`}
      >
        <Pause className="w-2.5 h-2.5" />
      </button>
      <button
        id="header-speed-1x"
        onClick={() => {
          soundService.playTimeSpeed(1);
          onSetSpeed(1);
        }}
        title="Normal Speed (1x)"
        className={`px-1.5 py-0.5 text-[10px] font-mono font-bold transition-colors ${
          speed === 1 ? 'bg-[#10B981]/20 text-white' : 'text-[#64748B] hover:text-white'
        }`}
      >
        <Play className="w-2.5 h-2.5" />
      </button>
      <button
        id="header-speed-2x"
        onClick={() => {
          soundService.playTimeSpeed(2);
          onSetSpeed(2);
        }}
        title="Fast Forward (2x)"
        className={`px-1.5 py-0.5 text-[10px] font-mono font-bold transition-colors ${
          speed === 2 ? 'bg-[#10B981]/20 text-white' : 'text-[#64748B] hover:text-white'
        }`}
      >
        »
      </button>
      <button
        id="header-speed-4x"
        onClick={() => {
          soundService.playTimeSpeed(4);
          onSetSpeed(4);
        }}
        title="Ultra Velocity (4x)"
        className={`px-1.5 py-0.5 text-[10px] font-mono font-bold transition-colors ${
          speed === 4 ? 'bg-[#10B981]/20 text-white' : 'text-[#64748B] hover:text-white'
        }`}
      >
        »»
      </button>
    </div>
  );

  // Render Stockpile Resources
  const renderStockpileResources = (compact: boolean = false) => (
    <div className="flex items-center gap-2 sm:gap-2.5 px-1 sm:px-3 text-[10px] sm:text-xs font-mono shrink-0">
      {/* Storage capacity / overflow — hazard marker. The red pulsing triangle
          appears ONLY when storage is actually full; the crate stays visible so
          the tooltip remains discoverable. The stored-vs-capacity readout moved
          into the hover tooltip so the strip stays iconographic. */}
      <div className="relative group">
        <div
          className={`flex items-center gap-0.5 cursor-default ${storageFull ? 'text-red-400' : 'text-slate-300'}`}
        >
          {storageFull ? (
            <TriangleAlert className="w-3.5 h-3.5 text-red-500 animate-pulse" />
          ) : (
            <Archive className="w-3.5 h-3.5 text-slate-300" />
          )}
        </div>
        <div className="hidden group-hover:block absolute top-full right-0 mt-1.5 z-50 w-64 bg-[#0B0F17]/98 border border-[#23354A] shadow-[0_12px_32px_rgba(0,0,0,0.95)] backdrop-blur-md clip-tactical-bracket p-2.5">
          <div className="text-[10px] font-bold uppercase text-slate-300">Storage Capacity</div>
          <div className="mt-1 text-[10px] font-mono text-slate-200">
            {Math.floor(stockpileUnits)} / {totalStorageCapacity} units stored
          </div>
          <div className="mt-1 text-[10px] font-mono text-slate-400">
            {((totalStorageCapacity > 0 ? stockpileUnits / totalStorageCapacity : 0) * 100).toFixed(0)}%
          </div>
          {storageFull && (
            <div className="mt-1.5 pt-1.5 border-t border-[#23354A] text-[10px] font-mono text-red-400">
              STORAGE FULL — loot that cannot be stored stays with the carrying squad, vehicle or crew, and is auto-deposited once space frees.
            </div>
          )}
          {overflowLootUnits > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-[#23354A] text-[10px] font-mono text-amber-300">
              OVERFLOW +{overflowLootUnits} units — couldn't fit in storage; held by squads / vehicles / crews (deposits once space frees) or stranded by a full caravan arrival.
            </div>
          )}
        </div>
      </div>

      {/* Food / Grain */}
      <div className="relative group">
        <div className="flex items-center gap-1 text-slate-200 cursor-default" title={`Stockpiled Food: ${Math.floor(totalFood)}`}>
          <Wheat className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#F59E0B]" />
          <span className="font-bold">{Math.floor(totalFood)}</span>
        </div>
        <div className="hidden group-hover:block">
          <ResourceDropdown title="Food Items" icon={<Wheat className="w-3 h-3 text-[#F59E0B]" />} items={foodItems} align="right" />
        </div>
      </div>

      {/* Ammo Crate */}
      <div className="relative group">
        <div className="flex items-center gap-1 text-slate-200 cursor-default" title={`Ammunition: ${Math.floor(totalAmmo)} rounds`}>
          <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 bg-[#F97316]/20 border border-[#F97316] flex items-center justify-center text-[6px] text-[#F97316] font-black">
            ▮
          </div>
          <span className="font-bold">{Math.floor(totalAmmo)}</span>
        </div>
        <div className="hidden group-hover:block">
          <ResourceDropdown
            title="Ammunition"
            icon={
              <div className="w-3 h-3 bg-[#F97316]/20 border border-[#F97316] flex items-center justify-center text-[6px] text-[#F97316] font-black">
                ▮
              </div>
            }
            items={ammoItems}
            align="right"
          />
        </div>
      </div>

      {/* Firearms */}
      <div className="relative group">
        <div className="flex items-center gap-1 text-slate-200 cursor-default" title={`Equipped & Armory Firearms: ${totalWeapons}`}>
          <Crosshair className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#CBD5E1]" />
          <span className="font-bold">{totalWeapons}</span>
        </div>
        <div className="hidden group-hover:block">
          <ResourceDropdown title="Firearms by Type" icon={<Crosshair className="w-3 h-3 text-[#CBD5E1]" />} items={weaponItems} align="right" />
        </div>
      </div>

      {/* Meds */}
      <div className="relative group">
        <div className="flex items-center gap-1 text-slate-200 cursor-default" title={`Medical Supplies: ${Math.floor(totalMeds)}`}>
          <Pill className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#10B981]" />
          <span className="font-bold">{Math.floor(totalMeds)}</span>
        </div>
        <div className="hidden group-hover:block">
          <ResourceDropdown title="Medical Supplies" icon={<Pill className="w-3 h-3 text-[#10B981]" />} items={medItems} align="right" />
        </div>
      </div>

      {/* Water & Fuel */}
      <div className="relative group">
        <div
          className={`flex items-center gap-1 cursor-default ${isWaterShortage ? 'text-[#FF4D4D] animate-pulse' : 'text-slate-200'}`}
          title={
            isWaterShortage
              ? 'Water Shortage — the colony cannot meet its water draw! Stores and cisterns are dry.'
              : `Water & Fuel Reserves: ${Math.floor(totalLiquids)}L`
          }
        >
          <Droplets className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isWaterShortage ? 'text-[#FF4D4D]' : 'text-[#CBD5E1]'}`} />
          <span className="font-bold">{Math.floor(totalLiquids)}L</span>
        </div>
        <div className="hidden group-hover:block">
          <ResourceDropdown title="Water & Fuel" icon={<Droplets className="w-3 h-3 text-[#CBD5E1]" />} items={liquidItems} align="right" />
        </div>
      </div>

      {/* Materials & Wood/Metal */}
      <div className="relative group">
        <div className="flex items-center gap-1 text-slate-200 cursor-default" title={`Building Materials (Wood, Metal, Bricks, Tools): ${Math.floor(totalMaterials)}`}>
          <Hammer className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#94A3B8]" />
          <span className="font-bold">{Math.floor(totalMaterials)}</span>
        </div>
        <div className="hidden group-hover:block">
          <ResourceDropdown title="Construction Materials" icon={<Hammer className="w-3 h-3 text-[#94A3B8]" />} items={materialItems} align="right" />
        </div>
      </div>
    </div>
  );

  return (
    <header
      id="tactical-header-strip"
      className="fixed top-0 left-0 right-0 z-[48] isolate text-[#E8E8E8] select-none pointer-events-none"
    >
      {/* Outer Header Wrapper:
          - Desktop: 3-tier stepped height (Banner: 56px > 4-Buttons: 44px > Remainder: 36px)
          - Mobile: 2-row compact layout matching 52px height
          Padding pointer events back to none so the full-width wrapper doesn't
          sit invisibly on top of z-40/z-25 panels (squad info panel close button,
          create-squad button) and swallow their clicks. Only the actual
          interactive children (banner, button clusters, resource strip) re-enable
          pointer events. */}
      <div className="relative flex items-start w-full pointer-events-none">
        {/* TIER 1: Hanging colony banner/crest on the far left (56px tall) */}
        <div
          onClick={onOpenGlobe}
          title="Infection Free Zone - Colony Command (Click to Open Globe)"
          className="relative cursor-pointer transition-transform hover:scale-105 shrink-0 z-40 drop-shadow-lg pointer-events-auto"
        >
          <TacticalBanner banner={settlement.banner} size="md" showBorder={false} />
        </div>

        {/* TIER 2: 4-Button Cluster (Task List, Tech, Morale, Weather)
            - Desktop: 44px height (h-11)
            - Mobile: 52px height (h-13) */}
        <div className="relative flex items-stretch h-13 md:h-11 border-r border-[#1E293B] border-b border-[#1E293B] shrink-0 bg-[#07090C]/95 backdrop-blur-md shadow-md z-30 pointer-events-auto">
          <div className="absolute inset-0 bg-[#07090C] clip-torn-cluster surface-torn-glow pointer-events-none" />
          <div className="relative z-10 flex items-stretch h-full">
            {/* 1. Task List */}
            <button
              onClick={() => onToggleQuestTracker?.()}
              title={questTrackerVisible ? 'Hide Task List' : 'Show Task List'}
              className={`w-8 sm:w-9 h-full flex flex-col items-center justify-center border-r border-[#1E293B] transition-colors ${
                questTrackerVisible
                  ? 'bg-[#10B981]/15 text-[#10B981]'
                  : 'hover:bg-[#151D28] text-slate-300 hover:text-white'
              }`}
            >
              <ListTodo className="w-3.5 h-3.5 mt-0.5" />
            </button>

            {/* 2. Tech / Research Tree */}
            <button
              onClick={onOpenTechTree || (() => onToggleSidebar('research'))}
              title={activeResearchNode
                ? `Researching: ${activeResearchNode.name} (${Math.round(researchProgressPct)}%)`
                : `Research Tree — ${sciMat} Scientific Material${sciMat !== 1 ? 's' : ''} available`}
              className="relative w-8 sm:w-9 h-full flex flex-col items-center justify-center border-r border-[#1E293B] hover:bg-[#151D28] text-slate-300 hover:text-white transition-colors overflow-hidden"
            >
              {/* Blue bottom-to-top fill revealing research progress */}
              {activeResearchNode && (
                <span
                  className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0369a1] to-[#38bdf8]/70"
                  style={{ height: `${researchProgressPct}%` }}
                />
              )}
              <span className={`relative z-10 text-[9px] sm:text-[10px] font-mono font-bold leading-none ${activeResearchNode ? 'text-[#7dd3fc]' : sciMat > 0 ? 'text-[#a78bfa]' : 'text-[#64748B]'}`}>
                {activeResearchNode ? `${Math.round(researchProgressPct)}%` : sciMat}
              </span>
              <FlaskConical className={`relative z-10 w-3.5 h-3.5 mt-0.5 ${activeResearchNode ? 'text-[#38bdf8]' : sciMat > 0 ? 'text-[#a78bfa]' : 'text-[#CBD5E1]'}`} />
            </button>

            {/* 3. Laws & Policy (§IFZ Major Update #5) — Gathering Place forum */}
            <button
              disabled={!lawsUnlocked}
              onClick={lawsUnlocked ? onOpenLawModal : undefined}
              title={lawsUnlocked ? 'Colony Laws & Policy (Gathering Place forum)' : lawsUnlockReason || 'Colony Laws & Policy — locked'}
              className={`w-8 sm:w-9 h-full flex flex-col items-center justify-center border-r border-[#1E293B] transition-colors select-none ${
                lawsUnlocked
                  ? 'text-[#FDE68A] hover:bg-[#2A2415] hover:text-[#FBBF24] cursor-pointer'
                  : 'text-slate-600 cursor-not-allowed opacity-40'
              }`}
            >
              <span className={`text-[8px] font-mono tracking-tighter uppercase leading-none ${lawsUnlocked ? 'text-[#FDE68A]' : 'text-slate-600'}`}>LAW</span>
              <Scale className={`w-3.5 h-3.5 mt-0.5 ${lawsUnlocked ? 'text-[#FBBF24]' : 'text-slate-600'}`} />
            </button>

            {/* 3b. Expeditions (§IFZ) — off-map scavenging revealed via the Antenna */}
            <button
              onClick={onOpenExpeditionModal}
              title={antennaOperational ? 'Expeditions — off-map scavenging areas (Antenna)' : 'Expeditions — locked: build an operational Antenna (Basic Antenna research)'}
              className={`w-8 sm:w-9 h-full flex flex-col items-center justify-center border-r border-[#1E293B] transition-colors select-none ${
                antennaOperational
                  ? 'text-[#DDD6FE] hover:bg-[#1E1430] hover:text-[#C4B5FD] cursor-pointer'
                  : 'text-slate-600 cursor-not-allowed opacity-40'
              }`}
            >
              <span className={`text-[8px] font-mono tracking-tighter uppercase leading-none ${antennaOperational ? 'text-[#DDD6FE]' : 'text-slate-600'}`}>EXP</span>
              <Radio className={`w-3.5 h-3.5 mt-0.5 ${antennaOperational ? 'text-[#A78BFA]' : 'text-slate-600'}`} />
            </button>

            {/* 4. Weather & Temperature */}
            <button
              onClick={onOpenWeatherModal || (() => onToggleSidebar('vitals'))}
              title={`Weather: ${weatherName} · ${tempC}°C`}
              className="w-10 sm:w-12 h-full flex flex-col items-center justify-center hover:bg-[#151D28] text-slate-300 hover:text-white transition-colors"
            >
              <span className="text-[8px] sm:text-[9px] font-mono font-bold leading-none">{weatherShort}</span>
              <span className="text-[9px] sm:text-[10px] font-mono font-bold leading-none text-[#E8E8E8]">{tempC}°</span>
              <Cloud className="w-3 h-3 text-[#CBD5E1] mt-0.5" />
            </button>
          </div>
        </div>

        {/* TIER 3: The bar to the right of the 4-button section
            - On Mobile Portrait (max-md): 2-row configuration matching the height of the 4 buttons (h-13 / 52px)
            - On Desktop / Landscape (md+): 36px height (h-9) single horizontal strip (shortest tier) */}

        {/* --- MOBILE PORTRAIT (2-ROW CONFIGURATION) --- */}
        <div className="flex md:hidden flex-col justify-between h-13 flex-1 min-w-0 border-b border-[#1E293B] bg-[#07090C]/95 backdrop-blur-md px-1 py-0.5 overflow-visible pointer-events-auto">
          {/* Row 1: Morale Bar, Date (3-letter month), Time, Orb, Speed Controls, and Menu Button */}
          <div className="flex items-center justify-between h-[24px] gap-1 border-b border-[#1E293B]/60 pb-0.5 overflow-visible">
            <div className="flex items-center gap-1.5 font-mono text-[10px] min-w-0 overflow-visible">
              {/* Morale Bar to the left of the Date */}
              {renderMoraleBar(true)}

              {/* Date with 3-letter month acronym (e.g. 24 APR) */}
              <div className="flex items-center gap-1 text-slate-200 shrink-0">
                <Calendar className="w-3 h-3 text-[#94A3B8]" />
                <span className="font-bold text-[9px]">{dayInMonth} {monthName}</span>
              </div>

              {/* Time 24h */}
              <div className="flex items-center gap-1 text-slate-200 shrink-0">
                <Clock className="w-3 h-3 text-[#94A3B8]" />
                <span className="font-bold text-[9px]">{time24h}</span>
              </div>

              {/* White-Stroked Circular Day/Night Orb */}
              {renderDayNightOrb('w-5 h-5')}

              {/* Speed Controls */}
              {renderSpeedControls(true)}
            </div>

            {/* Menu Button */}
            {onOpenPauseMenu && (
              <button
                id="header-mobile-menu-btn"
                onClick={onOpenPauseMenu}
                title="Colony Operations Menu & Settings (ESC)"
                className="w-7 h-5 rounded border border-[#2A3140] bg-[#0A0D12] hover:bg-[#1E293B] flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <Menu className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Row 2: Resources Bar */}
          <div className="flex items-center justify-start h-[24px] overflow-x-auto no-scrollbar py-0.5">
            {renderStockpileResources(true)}
          </div>
        </div>

        {/* --- DESKTOP / LANDSCAPE (TIER 3: SLEEK 36PX SINGLE-ROW STRIP) --- */}
        <div className="hidden md:flex justify-between items-center h-9 flex-1 min-w-0 border-b border-[#1E293B] bg-[#07090C]/95 backdrop-blur-md shadow-md z-30 overflow-visible relative pointer-events-auto">
          <div className="absolute inset-0 bg-[#07090C] clip-torn-strip surface-torn-glow pointer-events-none" />
          <div className="relative z-10 flex justify-between items-center h-full w-full overflow-visible">
            {/* Center Calendar, Clock, White-Stroked Orb, Speed Controls */}
            <div className="flex items-center gap-2.5 font-mono text-xs px-2 overflow-visible">
              {/* Morale Bar to the left of the Date */}
              {renderMoraleBar(false)}

              {/* Calendar Day + 3-letter Month */}
              <div className="flex items-center gap-1 text-slate-200">
                <Calendar className="w-3 h-3 text-[#94A3B8]" />
                <span className="font-bold text-[11px]">{dayInMonth} {monthName}</span>
              </div>

              {/* Time 24h */}
              <div className="flex items-center gap-1 text-slate-200">
                <Clock className="w-3 h-3 text-[#94A3B8]" />
                <span className="font-bold text-[11px]">{time24h}</span>
              </div>

              {/* Center Circular White-Stroked Sun/Moon Day-Night Cycle Orb with warning ribbons touching bottom */}
              <div className="relative flex flex-col items-center shrink-0">
                {renderDayNightOrb('w-6 h-6')}
                <div className="hidden md:flex absolute top-[30px] left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
                  {renderWarningRibbons()}
                </div>
              </div>

              {/* Speed Controls */}
              {renderSpeedControls(false)}
            </div>

            {/* Right: Resources Bar & Menu Button */}
            <div className="flex items-center h-full">
              {renderStockpileResources(false)}

              {/* Menu Button ≡ */}
              {onOpenPauseMenu && (
                <button
                  id="header-desktop-menu-btn"
                  onClick={onOpenPauseMenu}
                  title="Colony Operations Menu & Settings (ESC)"
                  className="w-9 h-full border-l border-[#1E293B] hover:bg-[#1E293B] flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <Menu className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile: Warning banners sit centrally horizontally touching bottom of 2-row header strip */}
        <div className="flex md:hidden absolute top-full left-1/2 -translate-x-1/2 mt-0 z-20 pointer-events-auto">
          {renderWarningRibbons()}
        </div>
      </div>
    </header>
  );
};
