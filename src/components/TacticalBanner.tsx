import React from 'react';
import {
  Sword,
  Swords,
  Crosshair,
  Target,
  Skull,
  Axe,
  Bomb,
  Zap,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Siren,
  Trophy,
  Medal,
  ShieldQuestion,
  Radar,
  Radiation,
  Flame,
  AlertTriangle,
  Activity,
  Stethoscope,
  Syringe,
  Pill,
  Thermometer,
  Radio,
  Compass,
  Flashlight,
  Tent,
  Sun,
  Moon,
  CloudRain,
  Snowflake,
  TreePine,
  Mountain,
  Fish,
  Apple,
  Wheat,
  Sprout,
  Droplet,
  Bone,
  PawPrint,
  Bird,
  Bug,
  Shield,
  Star,
  Crown,
  Flag,
  Award,
  Eye,
  Anchor,
  Key,
  Lock,
  Feather,
  Landmark,
  Scale,
  Sparkles,
  Infinity as InfinityIcon,
  Gem,
  Fingerprint,
  Globe,
  Bell,
  ShieldBan,
  Cross,
  TowerControl,
  Hammer,
  Pickaxe,
  Cog,
  Factory,
  Truck,
  Cpu,
  BatteryCharging,
  Fuel,
  Lightbulb,
  Boxes,
  Package,
  Antenna,
  Gauge,
  HardHat,
  Anvil,
  Satellite,
  CircuitBoard,
} from 'lucide-react';
import { ColonyBannerConfig, BannerIconId, BannerPatternId } from '../types/saveGame';
import { BANNER_STYLES, DEFAULT_BANNER_CONFIG } from '../data/bannerCatalog';

interface TacticalBannerProps {
  banner?: Partial<ColonyBannerConfig> | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  showBorder?: boolean;
}

export const TacticalBanner: React.FC<TacticalBannerProps> = ({
  banner,
  className = '',
  size = 'md',
  showBorder = true,
}) => {
  const config: ColonyBannerConfig = {
    ...DEFAULT_BANNER_CONFIG,
    ...(banner || {}),
  };

  const styleDef =
    BANNER_STYLES.find((s) => s.id === config.style) || BANNER_STYLES[0];

  // Prominently sized crest icon ensuring it dominates the banner face
  const iconSize =
    size === 'sm' ? 26 : size === 'md' ? 42 : size === 'lg' ? 68 : 96;

  const renderIcon = () => {
    const iconProps = {
      size: iconSize,
      strokeWidth: 2.2,
      className: 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] transition-transform hover:scale-105',
      style: { color: config.iconColor || '#FFFFFF' },
    };

    switch (config.icon as BannerIconId) {
      // Combat & Defense
      case 'sword':
        return <Sword {...iconProps} />;
      case 'swords':
        return <Swords {...iconProps} />;
      case 'crosshair':
        return <Crosshair {...iconProps} />;
      case 'target':
        return <Target {...iconProps} />;
      case 'skull':
        return <Skull {...iconProps} />;
      case 'axe':
        return <Axe {...iconProps} />;
      case 'bomb':
        return <Bomb {...iconProps} />;
      case 'zap':
        return <Zap {...iconProps} />;
      case 'shield_alert':
        return <ShieldAlert {...iconProps} />;
      case 'shield_check':
        return <ShieldCheck {...iconProps} />;
      case 'shield_off':
        return <ShieldOff {...iconProps} />;
      case 'siren':
        return <Siren {...iconProps} />;
      case 'trophy':
        return <Trophy {...iconProps} />;
      case 'medal':
        return <Medal {...iconProps} />;
      case 'shield_question':
        return <ShieldQuestion {...iconProps} />;
      case 'radar':
        return <Radar {...iconProps} />;
      case 'radiation':
        return <Radiation {...iconProps} />;

      // Survival & Medical & Nature
      case 'flame':
        return <Flame {...iconProps} />;
      case 'biohazard':
        return <AlertTriangle {...iconProps} />;
      case 'heart_pulse':
        return <Activity {...iconProps} />;
      case 'stethoscope':
        return <Stethoscope {...iconProps} />;
      case 'syringe':
        return <Syringe {...iconProps} />;
      case 'pill':
        return <Pill {...iconProps} />;
      case 'thermometer':
        return <Thermometer {...iconProps} />;
      case 'radio':
        return <Radio {...iconProps} />;
      case 'compass':
        return <Compass {...iconProps} />;
      case 'flashlight':
        return <Flashlight {...iconProps} />;
      case 'tent':
        return <Tent {...iconProps} />;
      case 'sun':
        return <Sun {...iconProps} />;
      case 'moon':
        return <Moon {...iconProps} />;
      case 'cloud_rain':
        return <CloudRain {...iconProps} />;
      case 'snowflake':
        return <Snowflake {...iconProps} />;
      case 'tree_pine':
        return <TreePine {...iconProps} />;
      case 'mountain':
        return <Mountain {...iconProps} />;
      case 'fish':
        return <Fish {...iconProps} />;
      case 'apple':
        return <Apple {...iconProps} />;
      case 'wheat':
      case 'leaf':
        return <Wheat {...iconProps} />;
      case 'sprout':
        return <Sprout {...iconProps} />;
      case 'droplet':
        return <Droplet {...iconProps} />;
      case 'bone':
        return <Bone {...iconProps} />;
      case 'paw_print':
        return <PawPrint {...iconProps} />;
      case 'bird':
        return <Bird {...iconProps} />;
      case 'bug':
        return <Bug {...iconProps} />;

      // Leadership & Heraldry
      case 'shield':
        return <Shield {...iconProps} />;
      case 'star':
        return <Star {...iconProps} />;
      case 'crown':
        return <Crown {...iconProps} />;
      case 'flag':
        return <Flag {...iconProps} />;
      case 'award':
        return <Award {...iconProps} />;
      case 'eye':
        return <Eye {...iconProps} />;
      case 'anchor':
        return <Anchor {...iconProps} />;
      case 'key':
        return <Key {...iconProps} />;
      case 'lock':
        return <Lock {...iconProps} />;
      case 'feather':
        return <Feather {...iconProps} />;
      case 'landmark':
        return <Landmark {...iconProps} />;
      case 'scale':
        return <Scale {...iconProps} />;
      case 'sparkles':
        return <Sparkles {...iconProps} />;
      case 'infinity':
        return <InfinityIcon {...iconProps} />;
      case 'gem':
        return <Gem {...iconProps} />;
      case 'fingerprint':
        return <Fingerprint {...iconProps} />;
      case 'globe':
        return <Globe {...iconProps} />;
      case 'bell':
        return <Bell {...iconProps} />;
      case 'shield_ban':
        return <ShieldBan {...iconProps} />;
      case 'cross_icon':
        return <Cross {...iconProps} />;
      case 'tower_control':
        return <TowerControl {...iconProps} />;

      // Industry & Technology
      case 'wrench':
      case 'hammer':
        return <Hammer {...iconProps} />;
      case 'pickaxe':
        return <Pickaxe {...iconProps} />;
      case 'cog':
        return <Cog {...iconProps} />;
      case 'factory':
        return <Factory {...iconProps} />;
      case 'truck':
        return <Truck {...iconProps} />;
      case 'cpu':
        return <Cpu {...iconProps} />;
      case 'battery_charging':
        return <BatteryCharging {...iconProps} />;
      case 'fuel':
        return <Fuel {...iconProps} />;
      case 'lightbulb':
        return <Lightbulb {...iconProps} />;
      case 'boxes':
        return <Boxes {...iconProps} />;
      case 'package':
        return <Package {...iconProps} />;
      case 'antenna':
        return <Antenna {...iconProps} />;
      case 'gauge':
        return <Gauge {...iconProps} />;
      case 'hard_hat':
        return <HardHat {...iconProps} />;
      case 'anvil':
        return <Anvil {...iconProps} />;
      case 'satellite':
        return <Satellite {...iconProps} />;
      case 'circuit_board':
        return <CircuitBoard {...iconProps} />;

      default:
        return <Sword {...iconProps} />;
    }
  };

  const sizeClasses = {
    sm: 'w-9 h-12',
    md: 'w-14 h-18',
    lg: 'w-22 h-30',
    hero: 'w-32 h-40',
  }[size];

  const getPatternBg = () => {
    const p = config.pattern as BannerPatternId;
    const pri = config.primaryColor || '#8B0000';
    const sec = config.secondaryColor || '#DC2626';

    switch (p) {
      case 'stripes':
        return `repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(0,0,0,0.35) 6px, rgba(0,0,0,0.35) 12px)`;
      case 'horizontal_stripes':
        return `repeating-linear-gradient(0deg, ${pri}, ${pri} 10px, ${sec} 10px, ${sec} 20px)`;
      case 'vertical_stripes':
        return `repeating-linear-gradient(90deg, ${pri}, ${pri} 10px, ${sec} 10px, ${sec} 20px)`;
      case 'split':
        return `linear-gradient(135deg, ${pri} 50%, ${sec} 50%)`;
      case 'quarters':
        return `linear-gradient(90deg, ${pri} 50%, ${sec} 50%), linear-gradient(0deg, rgba(0,0,0,0.2) 50%, transparent 50%)`;
      case 'saltire':
        return `linear-gradient(45deg, transparent 40%, ${sec} 40%, ${sec} 60%, transparent 60%), linear-gradient(-45deg, transparent 40%, ${sec} 40%, ${sec} 60%, transparent 60%)`;
      case 'chevron':
        return `radial-gradient(circle at 50% 0%, ${sec} 45%, ${pri} 46%)`;
      case 'cross':
        return `linear-gradient(to right, transparent 44%, ${sec} 44%, ${sec} 56%, transparent 56%), linear-gradient(to bottom, transparent 44%, ${sec} 44%, ${sec} 56%, transparent 56%)`;
      case 'checker':
        return `repeating-conic-gradient(${pri} 0% 25%, ${sec} 0% 50%) 50% / 18px 18px`;
      case 'camo':
        return `radial-gradient(ellipse at top left, ${sec} 32%, transparent 36%), radial-gradient(ellipse at bottom right, rgba(0,0,0,0.5) 30%, transparent 35%)`;
      case 'sunburst':
        return `repeating-conic-gradient(from 0deg, transparent 0deg 15deg, rgba(0,0,0,0.3) 15deg 30deg)`;
      case 'diamonds':
        return `repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0,0,0,0.25) 8px, rgba(0,0,0,0.25) 16px), repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(0,0,0,0.25) 8px, rgba(0,0,0,0.25) 16px)`;
      case 'honeycomb':
        return `radial-gradient(circle at 50% 50%, ${sec} 15%, transparent 20%), radial-gradient(circle at 0% 0%, ${sec} 15%, transparent 20%)`;
      case 'dots_matrix':
        return `radial-gradient(${sec} 22%, transparent 26%) 0 0 / 10px 10px`;
      case 'hazard_stripes':
        return `repeating-linear-gradient(-45deg, ${pri}, ${pri} 8px, ${sec} 8px, ${sec} 16px)`;
      case 'vignette_glow':
        return `radial-gradient(ellipse at center, ${pri} 25%, rgba(0,0,0,0.7) 100%)`;
      case 'circuit_grid':
        return `linear-gradient(${sec} 1px, transparent 1px), linear-gradient(90deg, ${sec} 1px, transparent 1px), radial-gradient(circle at 50% 50%, ${sec} 2px, transparent 3px)`;
      case 'sunburst_radial':
        return `repeating-conic-gradient(from 0deg, ${pri} 0deg 22.5deg, ${sec} 22.5deg 45deg)`;
      case 'chevron_triple':
        return `repeating-linear-gradient(135deg, ${pri}, ${pri} 12px, ${sec} 12px, ${sec} 24px), repeating-linear-gradient(45deg, ${pri}, ${pri} 12px, ${sec} 12px, ${sec} 24px)`;
      case 'cross_nordic':
        return `linear-gradient(to right, transparent 30%, ${sec} 30%, ${sec} 45%, transparent 45%), linear-gradient(to bottom, transparent 40%, ${sec} 40%, ${sec} 55%, transparent 55%)`;
      case 'scallop_scale':
        return `radial-gradient(circle at 50% 0%, ${sec} 35%, transparent 36%), radial-gradient(circle at 0% 50%, ${sec} 35%, transparent 36%) 0 0 / 16px 16px`;
      case 'diamond_lattice':
        return `linear-gradient(60deg, transparent 40%, ${sec} 42%, ${sec} 58%, transparent 60%), linear-gradient(-60deg, transparent 40%, ${sec} 42%, ${sec} 58%, transparent 60%)`;
      case 'camo_digital':
        return `repeating-conic-gradient(${sec} 0deg 90deg, ${pri} 90deg 180deg) 0 0 / 8px 8px`;
      default:
        return undefined;
    }
  };

  return (
    <div
      className={`relative flex items-center justify-center select-none ${styleDef.clipClass} ${sizeClasses} ${className}`}
      style={{
        backgroundColor: config.primaryColor || '#8B0000',
        backgroundImage: getPatternBg(),
        boxShadow: showBorder
          ? `inset 0 0 0 1.5px ${config.secondaryColor || '#DC2626'}, inset 0 2px 10px rgba(0,0,0,0.7)`
          : undefined,
      }}
    >
      {/* Texture grain overlay */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)',
          backgroundSize: '4px 4px',
        }}
      />

      {/* Top metallic grommet / mount clamp */}
      <div className="absolute top-0 inset-x-0 h-1.5 bg-black/60 border-b border-white/20" />

      {/* Center Icon */}
      <div className="relative z-10 flex items-center justify-center p-0.5">
        {renderIcon()}
      </div>

      {/* Bottom shadow gradient for depth */}
      <div className="absolute bottom-0 inset-x-0 h-4 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
    </div>
  );
};

