import React from 'react';
import {
 CloudSun,
 Snowflake,
 Sun,
 Sprout,
 CloudFog,
 CloudRain,
 CloudLightning,
 Flame,
 ThermometerSnowflake,
 Wind,
 Droplets,
 Building,
 CheckCircle2,
 AlertTriangle,
 X,
 Sparkles,
 Zap,
 ArrowRight,
} from 'lucide-react';
import { WeatherState, SeasonType, WeatherType } from '../types/weather';
import { SettlementState } from '../types/settlement';
import {
 SEASONS_CONFIG,
 WEATHER_CONDITIONS,
 calculateCropYieldFactors,
 forecastUpcomingWeather,
 getZombieActivityModifiers,
} from '../services/weatherService';
import { isResearchUnlocked } from '../services/researchService';

interface SeasonWeatherModalProps {
 isOpen: boolean;
 onClose: () => void;
 weather?: WeatherState;
 settlement: SettlementState;
 onSetSeason?: (season: SeasonType) => void;
 onSetWeather?: (weather: WeatherType) => void;
 onBuildGreenhouse?: () => void;
}

export const SeasonWeatherModal: React.FC<SeasonWeatherModalProps> = ({
 isOpen,
 onClose,
 weather,
 settlement,
 onSetSeason,
 onSetWeather,
 onBuildGreenhouse,
}) => {
 if (!isOpen || !weather) return null;

 const seasonInfo = SEASONS_CONFIG[weather.currentSeason];
 const weatherInfo = WEATHER_CONDITIONS[weather.currentWeather];
 const cropStats = calculateCropYieldFactors(weather.currentSeason, weather.currentWeather, settlement);

 // §6.1 addition: lunar cycle + weather-modulated zombie activity, plus a forecast
 // gated behind the Early Warning communications tech (§10).
 const activityMods = getZombieActivityModifiers(weather.currentWeather, weather.moonPhase);
 const hasForecastTech = isResearchUnlocked(settlement, 'communications_early_warning');
 const forecast = hasForecastTech
 ? forecastUpcomingWeather(weather.currentSeason, weather.currentWeather, 4)
 : [];

 const isWinter = weather.currentSeason === 'winter';
 const isSpring = weather.currentSeason === 'spring';
 const isSummer = weather.currentSeason === 'summer';
 const isAutumn = weather.currentSeason === 'autumn';

 const seasonBadgeColor = isWinter
 ? 'text-sky-400 bg-sky-950/60 border-sky-500/40'
 : isSpring
 ? 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40'
 : isSummer
 ? 'text-amber-400 bg-amber-950/60 border-amber-500/40'
 : 'text-orange-400 bg-orange-950/60 border-orange-500/40';

 const getWeatherIcon = (type: WeatherType) => {
 switch (type) {
 case 'clear':
 return <Sun className="w-6 h-6 text-amber-400" />;
 case 'rain':
 return <CloudRain className="w-6 h-6 text-sky-400" />;
 case 'thunderstorm':
 return <CloudLightning className="w-6 h-6 text-indigo-400 animate-pulse" />;
 case 'dense_fog':
 return <CloudFog className="w-6 h-6 text-neutral-400" />;
 case 'heatwave':
 return <Flame className="w-6 h-6 text-rose-500 animate-bounce" />;
 case 'freezing_frost':
 return <ThermometerSnowflake className="w-6 h-6 text-sky-300" />;
 case 'blizzard':
 return <Snowflake className="w-6 h-6 text-sky-200 animate-spin" />;
 default:
 return <CloudSun className="w-6 h-6 text-neutral-300" />;
 }
 };

 return (
 <div
 id="season-weather-modal-backdrop"
 className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
 onClick={onClose}
 >
 <div
 id="season-weather-modal-container"
 className="bg-neutral-900 border border-neutral-700/80 clip-tactical-bracket surface-bevel max-w-3xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto"
 onClick={(e) => e.stopPropagation()}
 >
 {/* Header */}
 <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
 <div className="flex items-center gap-3">
 <div className="p-2.5 bg-sky-950/60 border border-sky-500/30 text-sky-400">
 {isWinter ? <Snowflake className="w-6 h-6" /> : <CloudSun className="w-6 h-6" />}
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h2 className="text-xl font-bold text-neutral-100 tracking-wide">
 WEATHER & SEASONAL SIMULATION
 </h2>
 <span className="text-xs px-2 py-0.5 bg-neutral-800 text-neutral-400 font-mono border border-neutral-700">
 §9
 </span>
 </div>
 <p className="text-xs text-neutral-400">
 Seasons dictate outdoor crop yields and zombie behavior patterns. Greenhouses insulate crops during harsh winter frosts.
 </p>
 </div>
 </div>
 <button
 id="close-weather-modal-btn"
 onClick={onClose}
 className="p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Current Season & Weather Hero */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {/* Season Card */}
 <div className={`p-4 border flex flex-col justify-between ${seasonBadgeColor}`}>
 <div>
 <div className="flex items-center justify-between">
 <span className="text-xs font-mono font-semibold uppercase tracking-wider text-neutral-300">
 CURRENT SEASON • YEAR {weather.year}
 </span>
 <span className="text-xs font-bold px-2.5 py-0.5 border bg-neutral-900/60 uppercase">
 DAY {weather.seasonDay} / 7
 </span>
 </div>
 <div className="mt-2 flex items-center gap-3">
 {isWinter && <Snowflake className="w-8 h-8 text-sky-300" />}
 {isSpring && <Sprout className="w-8 h-8 text-emerald-400" />}
 {isSummer && <Sun className="w-8 h-8 text-amber-400" />}
 {isAutumn && <CloudFog className="w-8 h-8 text-orange-400" />}
 <div>
 <h3 className="text-2xl font-black text-neutral-100">
 {seasonInfo.name}
 </h3>
 <div className="text-xs text-neutral-300 mt-0.5">
 {seasonInfo.description}
 </div>
 </div>
 </div>
 </div>

 <div className="mt-4 pt-3 border-t border-neutral-700/50 flex items-center justify-between text-xs font-mono">
 <span className="text-neutral-300">Infected Behavior:</span>
 <span className="text-neutral-100 font-bold">{seasonInfo.zombieBehaviorTag}</span>
 </div>
 </div>

 {/* Weather Condition Card */}
 <div className="p-4 border border-neutral-800 bg-neutral-950/70 flex flex-col justify-between">
 <div>
 <div className="flex items-center justify-between">
 <span className="text-xs font-mono font-semibold uppercase tracking-wider text-neutral-400">
 ATMOSPHERIC CONDITIONS
 </span>
 {weatherInfo.isSevere && (
 <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-950 border border-rose-600/40 text-rose-300 uppercase">
 SEVERE WEATHER
 </span>
 )}
 </div>
 <div className="mt-2 flex items-center gap-3">
 <div className="p-2.5 bg-neutral-900 border border-neutral-800">
 {getWeatherIcon(weather.currentWeather)}
 </div>
 <div>
 <h3 className="text-lg font-bold text-neutral-100">
 {weatherInfo.name}
 </h3>
 <div className="text-xs text-neutral-400 mt-0.5">
 {weatherInfo.description}
 </div>
 </div>
 </div>
 </div>

 <div className="mt-4 pt-3 border-t border-neutral-800/80 grid grid-cols-3 gap-2 text-center text-xs font-mono">
 <div className="p-1.5 bg-neutral-900/60 border border-neutral-800">
 <span className="text-neutral-500 block text-[10px]">TEMP</span>
 <span className="text-neutral-200 font-bold">{weather.temperatureC}°C</span>
 </div>
 <div className="p-1.5 bg-neutral-900/60 border border-neutral-800">
 <span className="text-neutral-500 block text-[10px]">WIND</span>
 <span className="text-neutral-200 font-bold">{weather.windSpeedKmh} km/h</span>
 </div>
 <div className="p-1.5 bg-neutral-900/60 border border-neutral-800">
 <span className="text-neutral-500 block text-[10px]">CISTERN FILL</span>
 <span className={weather.rainwaterCollectionActive ? 'text-sky-400 font-bold' : 'text-neutral-400'}>
 {weather.rainwaterCollectionActive ? 'ACTIVE' : 'IDLE'}
 </span>
 </div>
 </div>
 </div>
 </div>

 {/* Agricultural Crop Yield & Greenhouse Mitigation Panel (§9, §10) */}
 <div className="p-4 border border-emerald-500/30 bg-emerald-950/20 space-y-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Sprout className="w-5 h-5 text-emerald-400" />
 <h3 className="text-sm font-bold text-neutral-100 uppercase tracking-wide font-mono">
 AGRICULTURAL CROP YIELD & GREENHOUSE MITIGATION
 </h3>
 </div>
 <span className="text-xs px-2.5 py-0.5 border border-emerald-500/30 bg-emerald-950 font-mono text-emerald-300">
 EFFECTIVE YIELD: {Math.round(cropStats.effectiveMultiplier * 100)}%
 </span>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 {/* Outdoor Crop Status */}
 <div className="p-3 bg-neutral-900/80 border border-neutral-800 space-y-2">
 <div className="flex items-center justify-between text-xs">
 <span className="text-neutral-400 font-medium">Outdoor Soil & Foraging:</span>
 <span
 className={`font-mono font-bold ${
 cropStats.outdoorMultiplier < 0.5 ? 'text-rose-400' : 'text-emerald-400'
 }`}
 >
 {Math.round(cropStats.outdoorMultiplier * 100)}% Yield
 </span>
 </div>
 <div className="text-[11px] text-neutral-400 leading-relaxed">
 {isWinter ? (
 <span className="text-rose-300/90">
 ⚠️ Winter frost freezes open soil (-75% yield penalty). Outdoor foraging alone will lead to colony starvation!
 </span>
 ) : isSpring ? (
 <span className="text-emerald-300/90">
 🌱 Spring thaw boosts open-field germination (+25% yield bonus).
 </span>
 ) : (
 'Standard open weather conditions for crops and wild foraging.'
 )}
 </div>
 </div>

 {/* Greenhouse Hydroponics Status */}
 <div className="p-3 bg-neutral-900/80 border border-neutral-800 space-y-2">
 <div className="flex items-center justify-between text-xs">
 <span className="text-neutral-400 font-medium">Hydroponic Greenhouses:</span>
 <span className="font-mono font-bold text-emerald-400">
 {cropStats.greenhouseCount} Active Unit(s)
 </span>
 </div>
 <div className="text-[11px] text-neutral-400 leading-relaxed">
 {cropStats.greenhouseCount > 0 ? (
 <span className="text-emerald-300/90 flex items-center gap-1">
 <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
 Greenhouse climate control is active, insulating crops from winter frost (
 {Math.round(cropStats.greenhouseMultiplier * 100)}% insulated yield)!
 </span>
 ) : (
 <span className="text-amber-400 flex items-center gap-1">
 <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
 No functional Greenhouses built! Adapt buildings or build freestanding Greenhouses.
 </span>
 )}
 </div>
 </div>
 </div>

 {/* Tech Integration Info */}
 <div className="pt-2 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
 <div className="flex items-center gap-3">
 <span className="text-neutral-400">Agricultural Tech Tree:</span>
 <span
 className={`px-2 py-0.5 ${
 cropStats.hasHydroponicsTech
 ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-600/40'
 : 'bg-neutral-800 text-neutral-500'
 }`}
 >
 Hydroponics {cropStats.hasHydroponicsTech ? '(+40% Active)' : '(Locked)'}
 </span>
 <span
 className={`px-2 py-0.5 ${
 cropStats.hasPermacultureTech
 ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-600/40'
 : 'bg-neutral-800 text-neutral-500'
 }`}
 >
 Permaculture {cropStats.hasPermacultureTech ? '(+12 Food/d Active)' : '(Locked)'}
 </span>
 </div>

 {onBuildGreenhouse && cropStats.greenhouseCount === 0 && (
 <button
 id="quick-build-greenhouse-btn"
 onClick={onBuildGreenhouse}
 className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-sans text-xs font-semibold transition-colors flex items-center gap-1"
 >
 <Building className="w-3.5 h-3.5" />
 Build Greenhouse Unit
 </button>
 )}
 </div>
 </div>

 {/* Sensory & Zombie Activity Modifiers Panel (§9) */}
 <div className="p-4 border border-neutral-800 bg-neutral-950/60 space-y-3">
 <h3 className="text-xs font-mono font-semibold uppercase text-neutral-400 tracking-wider flex items-center gap-2">
 <Zap className="w-4 h-4 text-purple-400" />
 WEATHER IMPACT ON COMBAT & ZOMBIE SENSES
 </h3>

 <div className="grid grid-cols-3 gap-3 text-xs">
 <div className="p-2.5 bg-neutral-900/80 border border-neutral-800">
 <span className="text-neutral-500 block text-[10px] uppercase font-mono">
 Zombie Move Speed
 </span>
 <span
 className={`font-mono font-bold text-sm ${
 weatherInfo.zombieSpeedMult > 1.0
 ? 'text-rose-400'
 : weatherInfo.zombieSpeedMult < 1.0
 ? 'text-emerald-400'
 : 'text-neutral-200'
 }`}
 >
 {Math.round(weatherInfo.zombieSpeedMult * 100)}%
 </span>
 <span className="text-[10px] text-neutral-400 mt-0.5 block">
 {weatherInfo.zombieSpeedMult < 1.0
 ? 'Slowed by cold stiffening'
 : weatherInfo.zombieSpeedMult > 1.0
 ? 'Agitated by extreme heat'
 : 'Standard speed'}
 </span>
 </div>

 <div className="p-2.5 bg-neutral-900/80 border border-neutral-800">
 <span className="text-neutral-500 block text-[10px] uppercase font-mono">
 Visual Detection Range
 </span>
 <span
 className={`font-mono font-bold text-sm ${
 weatherInfo.zombieVisualRangeMult < 1.0
 ? 'text-emerald-400'
 : 'text-neutral-200'
 }`}
 >
 {Math.round(weatherInfo.zombieVisualRangeMult * 100)}%
 </span>
 <span className="text-[10px] text-neutral-400 mt-0.5 block">
 {weatherInfo.zombieVisualRangeMult < 1.0
 ? 'Muffled by fog/blizzard'
 : 'Normal line of sight'}
 </span>
 </div>

 <div className="p-2.5 bg-neutral-900/80 border border-neutral-800">
 <span className="text-neutral-500 block text-[10px] uppercase font-mono">
 Acoustic Noise Travel
 </span>
 <span
 className={`font-mono font-bold text-sm ${
 weatherInfo.acousticSoundRadiusMult > 1.0
 ? 'text-rose-400'
 : weatherInfo.acousticSoundRadiusMult < 1.0
 ? 'text-emerald-400'
 : 'text-neutral-200'
 }`}
 >
 {Math.round(weatherInfo.acousticSoundRadiusMult * 100)}%
 </span>
 <span className="text-[10px] text-neutral-400 mt-0.5 block">
 {weatherInfo.acousticSoundRadiusMult < 1.0
 ? 'Gunshots masked by rain'
 : weatherInfo.acousticSoundRadiusMult > 1.0
 ? 'Echoing farther in fog'
 : 'Standard acoustics'}
 </span>
 </div>
 </div>
 </div>

 {/* Weather Forecast & Lunar Cycle (§6.1, §10) */}
 <div className="p-4 border border-indigo-500/30 bg-indigo-950/20 space-y-3">
 <div className="flex items-center gap-2">
 <ArrowRight className="w-4 h-4 text-indigo-400" />
 <h3 className="text-xs font-mono font-semibold uppercase text-indigo-300 tracking-wider">
 LUNAR CYCLE & WEATHER FORECAST
 </h3>
 <span className="ml-auto text-[11px] font-mono text-indigo-300">
 {hasForecastTech ? 'EARLY WARNING ARRAY ACTIVE' : 'WEATHER STATION OFFLINE'}
 </span>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="p-2.5 bg-neutral-900/70 border border-neutral-800">
 <span className="text-neutral-500 block text-[10px] uppercase font-mono">Current Moon</span>
 <span className="font-mono font-bold text-sm text-indigo-300 uppercase">
 {weather.moonPhase}
 </span>
 <span className="text-[10px] text-neutral-400 mt-0.5 block">{activityMods.label}</span>
 </div>
 <div className="p-2.5 bg-neutral-900/70 border border-neutral-800">
 <span className="text-neutral-500 block text-[10px] uppercase font-mono">Daylight Dormancy</span>
 <span
 className={`font-mono font-bold text-sm ${
 activityMods.daytimeActivity > 0 ? 'text-rose-400' : 'text-emerald-400'
 }`}
 >
 {activityMods.daytimeActivity > 0
 ? `SHIELDED ${Math.round(activityMods.daytimeActivity * 100)}%`
 : 'FULL SUNLIGHT'}
 </span>
 <span className="text-[10px] text-neutral-400 mt-0.5 block">
 {activityMods.daytimeActivity > 0
 ? 'Infected can roam during the day'
 : 'Infected dormant in clear daylight'}
 </span>
 </div>
 </div>

 {hasForecastTech && forecast.length > 0 && (
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {forecast.map((entry) => (
 <div
 key={entry.hoursFromNow}
 className={`p-2 border ${
 entry.isSevere
 ? 'border-rose-500/40 bg-rose-950/40'
 : 'border-neutral-800 bg-neutral-900/70'
 }`}
 >
 <div className="text-[10px] text-neutral-500 uppercase font-mono">+{entry.hoursFromNow}h</div>
 <div className="text-xs font-mono font-bold text-neutral-200">{entry.label}</div>
 </div>
 ))}
 </div>
 )}

 {!hasForecastTech && (
 <p className="text-[11px] text-neutral-500 font-mono">
 Research the Early Warning Array (Communications tech, §10) to forecast upcoming weather and plan around
 dangerous overcast/storm windows.
 </p>
 )}
 </div>

 {/* Debug Testing Controls */}
 <div className="p-4 border border-neutral-800 bg-neutral-950/80 space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-xs font-mono font-semibold uppercase text-neutral-400 tracking-wider">
 SIMULATION TEST CONTROLS
 </span>
 <span className="text-[11px] text-neutral-500 font-mono">
 Quickly test seasonal transitions and crop impacts
 </span>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 <button
 id="switch-season-spring-btn"
 onClick={() => onSetSeason && onSetSeason('spring')}
 className={`px-3 py-2 border text-xs font-medium transition-all ${
 isSpring
 ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
 : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
 }`}
 >
 🌸 Set Spring Thaw
 </button>
 <button
 id="switch-season-summer-btn"
 onClick={() => onSetSeason && onSetSeason('summer')}
 className={`px-3 py-2 border text-xs font-medium transition-all ${
 isSummer
 ? 'bg-amber-950 border-amber-500 text-amber-300'
 : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
 }`}
 >
 ☀️ Set Summer Swelter
 </button>
 <button
 id="switch-season-autumn-btn"
 onClick={() => onSetSeason && onSetSeason('autumn')}
 className={`px-3 py-2 border text-xs font-medium transition-all ${
 isAutumn
 ? 'bg-orange-950 border-orange-500 text-orange-300'
 : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
 }`}
 >
 🍂 Set Autumn Descent
 </button>
 <button
 id="switch-season-winter-btn"
 onClick={() => onSetSeason && onSetSeason('winter')}
 className={`px-3 py-2 border text-xs font-medium transition-all ${
 isWinter
 ? 'bg-sky-950 border-sky-500 text-sky-300'
 : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
 }`}
 >
 ❄️ Set Winter Frost (-75%)
 </button>
 </div>

 <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-800">
 <span className="text-[11px] text-neutral-500 font-mono">Weather:</span>
 {(['clear', 'rain', 'thunderstorm', 'dense_fog', 'blizzard', 'heatwave'] as WeatherType[]).map(
 (w) => (
 <button
 key={w}
 onClick={() => onSetWeather && onSetWeather(w)}
 className={`px-2 py-1 text-xs font-mono border transition-all ${
 weather.currentWeather === w
 ? 'bg-neutral-800 text-white border-neutral-600'
 : 'bg-neutral-900/80 text-neutral-400 border-neutral-800 hover:text-neutral-200'
 }`}
 >
 {w.replace('_', ' ')}
 </button>
 )
 )}
 </div>
 </div>

 {/* Footer */}
 <div className="border-t border-neutral-800 pt-4 flex items-center justify-end">
 <button
 onClick={onClose}
 className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium transition-colors text-xs"
 >
 Close Weather System
 </button>
 </div>
 </div>
 </div>
 );
};
