import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
 AlertTriangle,
 ArrowRight,
 CheckCircle2,
 ChevronDown,
 Compass,
 Edit2,
 Globe as GlobeIcon,
 HelpCircle,
 Info,
 Layers,
 MapPin,
 Maximize2,
 Minus,
 Navigation,
 Plus,
 Radio,
 RefreshCw,
 RotateCcw,
 Search,
 Shield,
 Sliders,
 Sparkles,
 Users,
 Volume2,
 X,
 Zap,
 ZoomIn,
} from 'lucide-react';
import { DOWNLOADED_PRESETS, LOCATION_PRESETS } from '../data/sampleMapData';
import { ZONE_CONFIGS } from '../data/zoneConfigs';
import { GlobeScene } from '../render/GlobeScene';
import { countryCodeForName, GeoSearchResult, LocationValidationResult, searchLocations, validateLocation } from '../services/locationValidator';
import { GeoPoint, LocationPreset, MapData, Point2D, SettlementPlacement, ZoneGridSize } from '../types/map';
import { SettlementRecord, TradeCaravan } from '../types/caravan';
import { ColonyBannerConfig, GameScenarioSettings } from '../types/saveGame';
import { DEFAULT_BANNER_CONFIG } from '../data/bannerCatalog';
import { calculateDifficultyScore } from '../services/difficultyCalculator';
import { BannerCustomizerModal } from './BannerCustomizerModal';
import { TacticalBanner } from './TacticalBanner';
import { StreetViewSelector } from './StreetViewSelector';

interface GlobeViewProps {
  onConfirmSettlement: (
    placement: SettlementPlacement,
    preloadedMapData?: MapData | null,
    scenarioSettings?: Partial<GameScenarioSettings>
  ) => void;
  onBeginDescent: (
    placement: SettlementPlacement,
    preloadedMapData?: MapData | null,
    scenarioSettings?: Partial<GameScenarioSettings>
  ) => void;
  initialLocation?: GeoPoint;
  settlements?: Record<string, SettlementRecord>;
  activeSettlementId?: string;
  caravans?: TradeCaravan[];
  onSelectExistingSettlement?: (settlementId: string) => void;
  onCancelReturnToGame?: () => void;
}

type MapSelectionPhase = 'GLOBE' | 'STREET_VIEW';

// Persist the player's last chosen location so a new game pre-fills the globe and
// search box with it instead of resetting to the default curated map every time.
const LAST_LOCATION_KEY = 'terminus_last_location_v1';

function loadLastLocation(): { lat: number; lon: number; query: string } | null {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (
      typeof p?.lat === 'number' &&
      typeof p?.lon === 'number' &&
      !isNaN(p.lat) &&
      !isNaN(p.lon) &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lon) <= 180
    ) {
      return { lat: p.lat, lon: p.lon, query: typeof p.query === 'string' ? p.query : '' };
    }
  } catch {}
  return null;
}

function saveLastLocation(lat: number, lon: number, query: string) {
  try {
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ lat, lon, query }));
  } catch {}
}

export const GlobeView: React.FC<GlobeViewProps> = ({
 onConfirmSettlement,
 onBeginDescent,
 initialLocation = { lat: 52.0917, lon: -1.9472 }, // Default to Evesham
 settlements = {},
 activeSettlementId,
 caravans = [],
 onSelectExistingSettlement,
 onCancelReturnToGame,
}) => {
 const containerRef = useRef<HTMLDivElement>(null);
 const globeSceneRef = useRef<GlobeScene | null>(null);

  // Two-step flow state: Step 1 (Globe View) -> Step 2 (Street View & Manual Grid Placement)
  const [selectionPhase, setSelectionPhase] = useState<MapSelectionPhase>('GLOBE');

 // Map data already fetched by the Street View recon screen — passed straight
 // to the world so the game does NOT re-fetch the same map a second time.
 const preloadedMapDataRef = useRef<MapData | null>(null);

 // Selected coordinates & validation. Hydrate from the persisted last location so
 // returning players land where they left off; otherwise fall back to the prop.
 const persistedLocation = useRef(loadLastLocation()).current;
 const [selectedLocation, setSelectedLocation] = useState<GeoPoint>(
   persistedLocation ? { lat: persistedLocation.lat, lon: persistedLocation.lon } : initialLocation
 );
 const [selectedPreset, setSelectedPreset] = useState<LocationPreset | null>(() => {
 return (
 LOCATION_PRESETS.find((p) => p.id === 'evesham') || LOCATION_PRESETS[0]
 );
 });
 const [validation, setValidation] = useState<LocationValidationResult | null>(null);
 const [isValidating, setIsValidating] = useState<boolean>(false);

 // Search filter query in Left Sidebar (Screenshot 972). Pre-fill from the last
 // chosen location so the search box reflects where the player left off.
 const [searchQuery, setSearchQuery] = useState<string>(persistedLocation?.query || '');
 const [geoResults, setGeoResults] = useState<GeoSearchResult[] | null>(null);
 const [geoLoading, setGeoLoading] = useState<boolean>(false);
 const [geoError, setGeoError] = useState<string | null>(null);

 // Zone Size & Placement configuration
 const [zoneSize, setZoneSize] = useState<ZoneGridSize>('3x3');
 const [placementOffset, setPlacementOffset] = useState<Point2D>({ x: 0, z: 0 });
 const [rotationDeg, setRotationDeg] = useState<number>(0);
 const [pendingPlacement, setPendingPlacement] = useState<SettlementPlacement | null>(null);

 // Altitude & Zoom telemetry (Google Earth style)
 const [currentAltitudeKm, setCurrentAltitudeKm] = useState<number>(1750);
 const [cameraDistance, setCameraDistance] = useState<number>(240);

 // 3D Screen Pin coordinates for floating badge on Globe
 const [pinScreenPos, setPinScreenPos] = useState<{ x: number; y: number; visible: boolean }>({
 x: 0,
 y: 0,
 visible: false,
 });

 // Customization Modal State
 const [isCustomizationOpen, setIsCustomizationOpen] = useState<boolean>(false);
 const [zoneName, setZoneName] = useState<string>('Terminus Zone of Evesham');
 const [workersManagement, setWorkersManagement] = useState<'Priorities' | 'Manual' | 'Balanced'>('Priorities');
 const [tutorialEvents, setTutorialEvents] = useState<boolean>(true);
 const [storyEvents, setStoryEvents] = useState<boolean>(true);
 const [convoyStart, setConvoyStart] = useState<boolean>(false);
 const [peopleLevel, setPeopleLevel] = useState<number>(2); // 1: Low, 2: Med, 3: High
 const [resourcesLevel, setResourcesLevel] = useState<number>(2);
 const [hordesLevel, setHordesLevel] = useState<number>(2);
 const [bannerConfig, setBannerConfig] = useState<ColonyBannerConfig>(DEFAULT_BANNER_CONFIG);
 const [isBannerModalOpen, setIsBannerModalOpen] = useState<boolean>(false);

 // Live difficulty calculation based on actual options chosen
 const diffResult = calculateDifficultyScore({
   startingPopulation: peopleLevel === 1 ? 5 : peopleLevel === 2 ? 10 : 18,
   startingSupplies: resourcesLevel === 1 ? 'scarce' : resourcesLevel === 3 ? 'plentiful' : 'standard',
   zombieAggression: hordesLevel === 1 ? 'low' : hordesLevel === 3 ? 'high' : 'normal',
   convoyStart,
 });

 const validationAbortController = useRef<AbortController | null>(null);

 // Trigger live location validation
 const runValidation = async (point: GeoPoint) => {
 if (validationAbortController.current) {
 validationAbortController.current.abort();
 }
 validationAbortController.current = new AbortController();

 setIsValidating(true);
 try {
 const result = await validateLocation(point, validationAbortController.current.signal);
 setValidation(result);
 if (result?.name) {
 setZoneName(`Terminus Zone of ${result.name.split(',')[0].trim()}`);
 }
 setIsValidating(false);
 } catch (err: any) {
 if (err.name !== 'AbortError') {
 setIsValidating(false);
 }
 }
 };

 // Initialize Three.js Globe scene
 useEffect(() => {
 if (!containerRef.current) return;

 const scene = new GlobeScene({
 container: containerRef.current,
 onSelectLocation: (point) => {
 setSelectedLocation(point);
 setPlacementOffset({ x: 0, z: 0 });

 // Find matching preset if near
 const matched = LOCATION_PRESETS.find(
 (p) => Math.abs(p.lat - point.lat) < 1.2 && Math.abs(p.lon - point.lon) < 1.2
 );
 if (matched) {
 setSelectedPreset(matched);
 setZoneName(`Terminus Zone of ${matched.name.split(',')[0].trim()}`);
 } else {
 setZoneName(`Terminus Sector (${point.lat.toFixed(2)}, ${point.lon.toFixed(2)})`);
 }

 runValidation(point);
 },
 onAltitudeChange: (distance, altitudeKm) => {
 setCameraDistance(distance);
 setCurrentAltitudeKm(altitudeKm);
 },
 });

 globeSceneRef.current = scene;
 scene.setTargetLocation(selectedLocation.lat, selectedLocation.lon, false, false);
 runValidation(selectedLocation);

 // Continuous update of 3D Pin screen projection
 let animId: number;
 const updatePinPosition = () => {
 if (globeSceneRef.current) {
 const pos = globeSceneRef.current.getScreenPosition(selectedLocation.lat, selectedLocation.lon);
 setPinScreenPos(pos);
 }
 animId = requestAnimationFrame(updatePinPosition);
 };
 animId = requestAnimationFrame(updatePinPosition);

 return () => {
 cancelAnimationFrame(animId);
 scene.dispose();
 globeSceneRef.current = null;
 };
 }, []);

 // Update 3D multi-settlement colony beacons and caravan trajectories
 useEffect(() => {
 if (!globeSceneRef.current) return;
 const settlementList = (Object.values(settlements) as SettlementRecord[]).map((s) => ({
 id: s.id,
 name: s.name,
 lat: s.placement.center.lat,
 lon: s.placement.center.lon,
 status: s.status,
 population: s.state.namedSurvivors.length + s.state.generalPopulation.total,
 isHQ: s.id === activeSettlementId,
 }));
 globeSceneRef.current.updateColonyBeacons(settlementList);
 globeSceneRef.current.updateCaravans((caravans || []).map((c: any) => ({ id: c.id, origin: c.originGeo || c.origin || { lat: 0, lon: 0 }, dest: c.destinationGeo || c.dest || { lat: 0, lon: 0 }, progress: c.progress ?? 0, name: c.name || 'Caravan' })));
 }, [settlements, activeSettlementId, caravans]);

 // Handle Preset selection from Left Sidebar (Screenshot 972)
 const handleSelectPreset = (preset: LocationPreset) => {
 const pt: GeoPoint = { lat: preset.lat, lon: preset.lon };
 setSelectedLocation(pt);
 setSelectedPreset(preset);
 setPlacementOffset({ x: 0, z: 0 });
 setZoneName(`Terminus Zone of ${preset.name.split(',')[0].trim()}`);
 globeSceneRef.current?.setTargetLocation(preset.lat, preset.lon, true, true);
 runValidation(pt);
 saveLastLocation(preset.lat, preset.lon, preset.name.split(',')[0].trim());
 };

 // Select a live-geocoded search result (clears the curated preset selection)
 const handleSelectGeo = (result: GeoSearchResult) => {
 const pt: GeoPoint = { lat: result.lat, lon: result.lon };
 setSelectedPreset(null);
 setSelectedLocation(pt);
 setPlacementOffset({ x: 0, z: 0 });
 setZoneName(`Terminus Zone of ${(result.city || result.name || 'Sector').split(',')[0].trim()}`);
 globeSceneRef.current?.setTargetLocation(result.lat, result.lon, true, true);
 runValidation(pt);
 setGeoResults(null);
 setGeoError(null);
 saveLastLocation(result.lat, result.lon, (result.city || result.name || '').split(',')[0].trim());
 };

 // Handle search input: live-geocode via Nominatim, or parse direct lat,lon coords
 const handleSearchSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 const query = searchQuery.trim();
 if (!query) return;

 // Check if user pasted coordinates:"lat, lon"
 const coordParts = query.split(/[\s,]+/);
 if (coordParts.length === 2) {
 const lat = parseFloat(coordParts[0]);
 const lon = parseFloat(coordParts[1]);
 if (!isNaN(lat) && !isNaN(lon) && lat >= -85 && lat <= 85 && lon >= -180 && lon <= 180) {
 const pt: GeoPoint = { lat, lon };
 setSelectedPreset(null);
 setSelectedLocation(pt);
 globeSceneRef.current?.setTargetLocation(lat, lon, true, true);
 runValidation(pt);
 saveLastLocation(lat, lon, `${lat.toFixed(3)}, ${lon.toFixed(3)}`);
 return;
 }
 }

 // Otherwise geocode the free-text query; select the top hit if any.
 searchLocations(query)
   .then((results) => {
     if (results.length > 0) {
       handleSelectGeo(results[0]);
     }
   })
   .catch(() => {
     // fall through to preset matching (offline)
     const match = LOCATION_PRESETS.find(
       (p) =>
         p.name.toLowerCase().includes(query.toLowerCase()) ||
         p.country.toLowerCase().includes(query.toLowerCase())
     );
     if (match) {
       handleSelectPreset(match);
     }
   });
 };

 // Debounced live geocoding while typing in the search box
 useEffect(() => {
   const q = searchQuery.trim();
   if (q.length < 3) {
     setGeoResults(null);
     setGeoLoading(false);
     setGeoError(null);
     return;
   }
   setGeoLoading(true);
   setGeoError(null);
   const controller = new AbortController();
   const timer = window.setTimeout(async () => {
     try {
       const results = await searchLocations(q, controller.signal);
       if (controller.signal.aborted) return;
       setGeoResults(results);
     } catch {
       if (!controller.signal.aborted) setGeoError('OFFLINE - CANNOT SEARCH');
     } finally {
       if (!controller.signal.aborted) setGeoLoading(false);
     }
   }, 350);
   return () => {
     window.clearTimeout(timer);
     controller.abort();
   };
 }, [searchQuery]);

 // Transition from Step 1 (Globe View) to Step 2 (Street View & Manual Grid Placement)
 const handleProceedToStreetView = () => {
 // Save whatever is currently chosen as the last location for next time.
 saveLastLocation(
   selectedLocation.lat,
   selectedLocation.lon,
   (activeCityName || '').split(',')[0].trim()
 );
 if (globeSceneRef.current) {
 // Smoothly zoom in to the chosen city on the 3D globe first
 globeSceneRef.current.zoomToCity(selectedLocation.lat, selectedLocation.lon, () => {
 setSelectionPhase('STREET_VIEW');
 });
 } else {
 setSelectionPhase('STREET_VIEW');
 }
 };

 // Handle Continue from Street View (Opens Game Customization Modal)
 const handleStreetViewContinue = (placement: SettlementPlacement, mapData?: MapData | null) => {
 preloadedMapDataRef.current = mapData || null;
 setPendingPlacement(placement);
 setIsCustomizationOpen(true);
 };

 // Execute loading transition sequence and drop into 3D world
 const handleStartGameWithCustomization = () => {
   setIsCustomizationOpen(false);

   const config = ZONE_CONFIGS[zoneSize];
   const cityName = selectedPreset?.name || validation?.name || 'Sector Alpha';
   const country = selectedPreset?.country || validation?.country || 'Earth Zone';

   const finalPlacement: SettlementPlacement = pendingPlacement || {
     center: selectedLocation,
     zoneSize: zoneSize,
     radius: config.radiusMeters,
     offsetMeters: placementOffset,
     rotationDeg: rotationDeg,
     sectorName: zoneName || cityName,
     country: country,
     locationDetails: (validation as any)?.reason || selectedPreset?.description || `${config.tilesCount} tiles tactical zone`,
   };

   globeSceneRef.current?.setTargetLocation(selectedLocation.lat, selectedLocation.lon, false, true);

   const scenarioSettings: GameScenarioSettings = {
     colonyName: zoneName || cityName,
     startingSeason: 'summer',
     startingPopulation: peopleLevel === 1 ? 5 : peopleLevel === 2 ? 10 : 18,
     startingSupplies: resourcesLevel === 1 ? 'scarce' : resourcesLevel === 3 ? 'plentiful' : 'standard',
     zombieAggression: hordesLevel === 1 ? 'low' : hordesLevel === 3 ? 'high' : 'normal',
     difficulty: 'custom',
     difficultyPreset: 'custom',
     difficultyScore: diffResult.score,
     difficultyPercentage: diffResult.percentage,
     tutorialEnabled: tutorialEvents,
     storyEventsEnabled: storyEvents,
     convoyStart: convoyStart,
     banner: bannerConfig,
     peopleLevel,
     resourcesLevel,
     hordesLevel,
     workersManagement,
   };

   // Defer to App: App owns the single loading screen (atmospheric descent),
   // which stays up until the world scene has actually rendered the map.
   onBeginDescent(finalPlacement, preloadedMapDataRef.current, scenarioSettings);
 };

 const activeCityName = selectedPreset?.name || validation?.name?.split(',')[0] || 'EVESHAM';

 // Filtered preset lists based on search
 const filteredPresets = LOCATION_PRESETS.filter(
 (p) =>
 p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
 p.country.toLowerCase().includes(searchQuery.toLowerCase())
 );

 const filteredDownloaded = DOWNLOADED_PRESETS.filter(
 (p) =>
 p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
 p.country.toLowerCase().includes(searchQuery.toLowerCase())
 );

 // Group live geocoded results by country so many hits scan as discrete clusters
 const groupedGeo = useMemo(() => {
   const groups: {
     key: string;
     code?: string;
     country: string;
     items: GeoSearchResult[];
   }[] = [];
   for (const r of geoResults || []) {
     const key = (r.countryCode || r.country || '').trim() || 'OTHER';
     let g = groups.find((x) => x.key === key);
     if (!g) {
       g = { key, code: r.countryCode, country: r.country || 'Other Region', items: [] };
       groups.push(g);
     }
     g.items.push(r);
   }
   return groups;
 }, [geoResults]);

 return (
 <div className="relative w-screen h-screen bg-[#06080C] overflow-hidden select-none font-tactical text-[#E8E8E8]">
 {/* 1. Step 2: Street-Level Tactical Vector Map & Manual Grid Placement (Screenshot 973) */}
 {selectionPhase === 'STREET_VIEW' && (
 <StreetViewSelector
 selectedLocation={selectedLocation}
 cityName={selectedPreset?.name?.split(',')[0] || activeCityName}
 countryName={selectedPreset?.country || 'Earth Zone'}
 onBackToGlobe={() => setSelectionPhase('GLOBE')}
 onContinue={handleStreetViewContinue}
 />
 )}

 {/* 2. Step 1: Zoomed-out 3D Satellite Globe Selection (Screenshot 972) */}
 {selectionPhase === 'GLOBE' && (
 <>
 {/* 3D WebGL Satellite Globe Canvas */}
 <div
 id="globe-canvas-container"
 ref={containerRef}
 className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
 />

 {/* Floating 3D Map Pin tracking the active location on the globe (Screenshot 972) */}
 {pinScreenPos.visible && (
 <div
 className="absolute z-20 pointer-events-none transition-transform duration-75"
 style={{
 left: `${pinScreenPos.x}px`,
 top: `${pinScreenPos.y}px`,
 transform: 'translate(-50%, -100%)',
 }}
 >
 {/* City Tag Label */}
 <div className="flex flex-col items-center">
 <div className="bg-[#0E1013]/95 border-2 border-[#10B981] text-[#10B981] text-xs font-display font-black px-3.5 py-1 uppercase tracking-widest clip-tactical-bracket surface-bevel">
 {activeCityName?.toUpperCase() || `${selectedLocation.lat.toFixed(2)}°, ${selectedLocation.lon.toFixed(2)}°`}
 </div>
 {/* Pointer Stem & Pulsing Core */}
 <div className="w-0.5 h-4 bg-[#10B981]" />
 <div className="w-2.5 h-2.5 bg-[#10B981] animate-ping" />
 </div>
 </div>
 )}

        {/* Left Tactical Navigation Sidebar (Matching Screenshot 972) */}
        <div className="absolute left-4 right-4 bottom-4 max-h-[50vh] md:max-h-none md:bottom-6 md:top-6 md:left-6 md:right-auto md:w-80 lg:w-92 bg-[#0E1013]/95 border border-[#262F3D] clip-tactical-bracket surface-bevel bg-tactical-steel backdrop-blur-md z-20 pointer-events-auto p-4 flex flex-col justify-between overflow-hidden shadow-2xl">
 <div className="space-y-4 flex flex-col flex-1 overflow-hidden">
 {/* Header Title:"CHOOSE LOCATION" with Green Border */}
 <div className="border-2 border-[#10B981] text-[#10B981] font-display font-black text-center py-2 text-sm tracking-widest uppercase clip-tactical-bracket surface-bevel">
 CHOOSE LOCATION
 </div>

 {/* Search Bar:"[ SEARCH (OR PASTE COORDINA... ]" */}
 <form onSubmit={handleSearchSubmit} className="relative">
 <input
 id="globe-location-search"
 name="locationSearch"
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="SEARCH (OR PASTE COORDINATES)..."
 className="w-full bg-[#14171C] border border-[#262F3D] focus:border-[#10B981] text-xs font-tech text-white placeholder-[#5A6270] px-3 py-2 outline-none clip-tactical-chamfer-tr-bl transition-colors"
 />
 <button
 type="submit"
 className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8C9BAE] hover:text-[#10B981] transition-colors"
 >
 <Search className="w-3.5 h-3.5" />
 </button>
 </form>

 {/* Scrollable Presets Section */}
 <div className="flex-1 overflow-y-auto space-y-4 pr-1">
 {/* LIVE GEOCODED SEARCH RESULTS (query >= 3 chars) */}
 {geoResults !== null && (
   <div className="space-y-1.5">
     <div className="text-[11px] font-heading font-black text-[#10B981] uppercase tracking-wider flex items-center justify-between">
       <span>{geoLoading ? 'SEARCHING…' : geoResults.length > 0 ? 'SEARCH RESULTS:' : 'NO MATCHES - TRY ANOTHER NAME'}</span>
     </div>
     {geoResults.length > 0 && (
       <div className="space-y-2.5">
         {groupedGeo.map((group) => (
           <div key={group.key} className="space-y-1">
             <div className="flex items-center gap-1.5 text-[10px] font-heading font-black text-[#5A6270] uppercase tracking-wider">
               {group.code && (
                 <span
                   aria-hidden
                   className="shrink-0 w-5 h-3.5 grid place-items-center text-[7px] font-black clip-card-chip border border-[#262F3D] bg-[#0E1116] text-[#8C9BAE]"
                 >
                   {group.code.toUpperCase()}
                 </span>
               )}
               <span>{group.country}</span>
               <span className="flex-1 h-px bg-[#262F3D]" />
             </div>
             {group.items.map((res) => {
               const isSelected =
                 Math.abs(res.lat - selectedLocation.lat) < 0.02 &&
                 Math.abs(res.lon - selectedLocation.lon) < 0.02;
               return (
                 <button
                   key={res.placeId}
                   onClick={() => handleSelectGeo(res)}
                   className={`w-full text-left px-3 py-2 text-xs font-heading font-bold uppercase flex flex-col items-start transition-colors clip-card-chip border ${
                     isSelected
                       ? 'bg-[#10B981] text-black border-[#10B981]'
                       : 'bg-[#14171C]/90 text-[#C2C9D1] border-[#262F3D] hover:bg-[#1A2634] hover:text-white'
                   }`}
                 >
                   <span className="truncate w-full flex items-center gap-2">
                     <span className="truncate">{res.name || res.displayName}</span>
                   </span>
                   <span className={`text-[9px] font-mono truncate w-full ${isSelected ? 'text-black/70' : 'text-[#5A6270]'}`}>
                     {res.displayName}
                   </span>
                 </button>
               );
             })}
           </div>
         ))}
       </div>
     )}
   </div>
 )}
 {geoError && (
   <div className="text-[10px] font-mono text-[#B31217]">
     {geoError}
   </div>
 )}

 {/* RECOMMENDED Section */}
 <div className="space-y-1.5">
 <div className="text-[11px] font-heading font-black text-[#8C9BAE] uppercase tracking-wider">
 RECOMMENDED:
 </div>
 <div className="space-y-1">
 {filteredPresets.map((preset) => {
 const isSelected =
 selectedPreset?.id === preset.id ||
 (Math.abs(preset.lat - selectedLocation.lat) < 0.05 &&
 Math.abs(preset.lon - selectedLocation.lon) < 0.05);

 return (
 <button
 key={preset.id}
 onClick={() => handleSelectPreset(preset)}
 className={`w-full text-left px-3 py-2 text-xs font-heading font-bold uppercase flex items-center justify-between transition-colors clip-card-chip border ${
 isSelected
 ? 'bg-[#10B981] text-black border-[#10B981] '
 : 'bg-[#14171C]/90 text-[#C2C9D1] border-[#262F3D] hover:bg-[#1A2634] hover:text-white'
 }`}
 >
 <span className="truncate flex items-center gap-2">
 {countryCodeForName(preset.country) && (
   <span
     aria-hidden
     className={`shrink-0 w-7 h-5 grid place-items-center text-[9px] font-black clip-card-chip border ${
       isSelected
         ? 'bg-black text-[#10B981] border-[#10B981]'
         : 'bg-[#0E1116] text-[#8C9BAE] border-[#262F3D]'
     }`}
   >
     {countryCodeForName(preset.country)!.toUpperCase()}
   </span>
 )}
 <span className="truncate">{preset.name}</span>
 </span>
 {preset.isNew && (
 <span
 className={`text-[9px] font-black px-1.5 py-0.2 ${
 isSelected ? 'bg-black text-[#10B981]' : 'bg-[#10B981] text-black'
 }`}
 >
 NEW
 </span>
 )}
 </button>
 );
 })}
 </div>
 </div>

 {/* DOWNLOADED Section */}
 {filteredDownloaded.length > 0 && (
 <div className="space-y-1.5 pt-2 border-t border-[#262F3D]">
 <div className="text-[11px] font-heading font-black text-[#8C9BAE] uppercase tracking-wider">
 DOWNLOADED:
 </div>
 <div className="space-y-1">
 {filteredDownloaded.map((dl) => {
 const isSelected =
 selectedPreset?.id === dl.id ||
 (Math.abs(dl.lat - selectedLocation.lat) < 0.05 &&
 Math.abs(dl.lon - selectedLocation.lon) < 0.05);

 return (
 <button
 key={dl.id}
 onClick={() => handleSelectPreset(dl)}
 className={`w-full text-left px-3 py-2 text-xs font-heading font-bold uppercase flex items-center justify-between transition-colors clip-card-chip border ${
 isSelected
 ? 'bg-[#10B981] text-black border-[#10B981] '
 : 'bg-[#14171C]/90 text-[#C2C9D1] border-[#262F3D] hover:bg-[#1A2634] hover:text-white'
 }`}
 >
 <span className="truncate flex items-center gap-2">
 {countryCodeForName(dl.country) && (
   <span
     aria-hidden
     className={`shrink-0 w-7 h-5 grid place-items-center text-[9px] font-black clip-card-chip border ${
       isSelected
         ? 'bg-black text-[#10B981] border-[#10B981]'
         : 'bg-[#0E1116] text-[#8C9BAE] border-[#262F3D]'
     }`}
   >
     {countryCodeForName(dl.country)!.toUpperCase()}
   </span>
 )}
 <span className="truncate">{dl.name}</span>
 </span>
 </button>
 );
 })}
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Bottom Actions inside Sidebar: BACK and NEXT */}
 <div className="flex items-center justify-between pt-3 border-t border-[#262F3D] gap-3">
 <button
 id="globe-back-btn"
 onClick={onCancelReturnToGame}
 className="px-6 py-2 bg-[#14171C] hover:bg-[#1A2634] border border-[#262F3D] text-[#E8E8E8] hover:text-white text-xs font-heading uppercase tracking-wider flex items-center gap-1.5 transition-colors clip-tactical-bracket surface-bevel"
 >
 <ArrowRight className="w-3.5 h-3.5 rotate-180" />
 <span>BACK</span>
 </button>

 <button
 id="globe-next-btn"
 onClick={handleProceedToStreetView}
 className="px-8 py-2 bg-[#B31217] hover:bg-[#EF4444] border border-[#EF4444] text-white text-xs font-heading uppercase tracking-wider flex items-center gap-1.5 transition-all clip-tactical-bracket surface-bevel cursor-pointer"
 >
 <span>NEXT</span>
 <ArrowRight className="w-3.5 h-3.5" />
 </button>
 </div>
 </div>

 {/* Right Top Orbital Camera Controls */}
 <div className="absolute top-6 right-6 z-20 pointer-events-auto flex items-center gap-2">
 <button
 onClick={() => globeSceneRef.current?.zoomIn()}
 className="p-2 bg-[#0E1013]/95 hover:bg-[#14171C] text-[#8C9BAE] hover:text-white border border-[#262F3D] transition-colors clip-card-chip surface-bevel"
 title="Zoom In"
 >
 <ZoomIn className="w-4 h-4" />
 </button>
 <button
 onClick={() => globeSceneRef.current?.zoomOut()}
 className="p-2 bg-[#0E1013]/95 hover:bg-[#14171C] text-[#8C9BAE] hover:text-white border border-[#262F3D] transition-colors clip-card-chip surface-bevel"
 title="Zoom Out"
 >
 <Minus className="w-4 h-4" />
 </button>
 <button
 onClick={() => globeSceneRef.current?.resetView()}
 className="p-2 bg-[#0E1013]/95 hover:bg-[#14171C] text-[#8C9BAE] hover:text-white border border-[#262F3D] transition-colors clip-card-chip surface-bevel"
 title="Reset Orbital View"
 >
 <RotateCcw className="w-4 h-4" />
 </button>
 </div>
 </>
 )}


 {/* 4. Game Customization Modal */}
 {isCustomizationOpen && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
 <div className="relative w-full max-w-2xl bg-[#0E1013] border border-[#262F3D] p-6 clip-tactical-bracket surface-bevel bg-tactical-steel space-y-6">
 {/* Modal Header */}
 <div className="flex items-center justify-between border-b border-[#262F3D] pb-3">
 <div className="flex items-center gap-2.5">
 <Sliders className="w-5 h-5 text-[#B31217]" />
 <h2 className="text-sm font-heading font-black tracking-widest uppercase text-white">
 GAME CUSTOMIZATION
 </h2>
 </div>
 <button
 onClick={() => setIsCustomizationOpen(false)}
 className="text-[#8C9BAE] hover:text-white transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 {/* Left Column: Game Rules & Toggles */}
 <div className="space-y-4">
 {/* Zone Name Input */}
 <div className="space-y-1">
 <label className="text-[11px] text-[#8C9BAE] font-heading font-bold uppercase">
 ZONE NAME:
 </label>
 <div className="flex items-center bg-[#0A0A0A] border border-[#262F3D] px-3 py-2 clip-tactical-chamfer-tr-bl">
 <input
 id="globe-zone-name"
 name="zoneName"
 type="text"
 value={zoneName}
 onChange={(e) => setZoneName(e.target.value)}
 className="bg-transparent text-[#E8E8E8] text-xs font-tech font-bold outline-none flex-1"
 />
 <Edit2 className="w-3.5 h-3.5 text-[#5A6270]" />
 </div>
 </div>

 {/* Workers Management */}
 <div className="space-y-1">
 <label className="text-[11px] text-[#8C9BAE] font-heading font-bold uppercase">
 WORKERS MANAGEMENT:
 </label>
 <select
 value={workersManagement}
 onChange={(e) => setWorkersManagement(e.target.value as any)}
 className="w-full bg-[#0A0A0A] border border-[#262F3D] text-[#E8E8E8] px-3 py-2 text-xs font-tech font-bold outline-none focus:border-[#10B981] clip-tactical-chamfer-tr-bl"
 >
 <option value="Priorities">Priorities (Automated allocation)</option>
 <option value="Manual">Manual (Direct squad control)</option>
 <option value="Balanced">Balanced (Standard IFZ)</option>
 </select>
 </div>

 {/* Event Checkboxes */}
 <div className="space-y-2.5 pt-2">
 <label className="flex items-center gap-2.5 cursor-pointer text-xs font-heading font-bold text-[#8C9BAE] hover:text-white">
 <input
 type="checkbox"
 checked={tutorialEvents}
 onChange={(e) => setTutorialEvents(e.target.checked)}
 className="accent-[#B31217] w-4 h-4 cursor-pointer"
 />
 <span>TUTORIAL EVENTS</span>
 </label>

 <label className="flex items-center gap-2.5 cursor-pointer text-xs font-heading font-bold text-[#8C9BAE] hover:text-white">
 <input
 type="checkbox"
 checked={storyEvents}
 onChange={(e) => setStoryEvents(e.target.checked)}
 className="accent-[#B31217] w-4 h-4 cursor-pointer"
 />
 <span>STORY EVENTS</span>
 </label>

 <label className="flex items-center gap-2.5 cursor-pointer text-xs font-heading font-bold text-[#8C9BAE] hover:text-white">
 <input
 type="checkbox"
 checked={convoyStart}
 onChange={(e) => setConvoyStart(e.target.checked)}
 className="accent-[#B31217] w-4 h-4 cursor-pointer"
 />
 <span>CONVOY START</span>
 </label>
 </div>
 </div>

 {/* Right Column: Crest & Resource Dials */}
 <div className="space-y-4 flex flex-col items-center">
 {/* Tactical Banner Crest */}
 <div
   onClick={() => setIsBannerModalOpen(true)}
   className="relative group cursor-pointer flex flex-col items-center p-2 bg-[#0A0E18] border border-[#24334A] hover:border-amber-500 transition-all clip-tactical-bracket surface-bevel"
 >
   <TacticalBanner banner={bannerConfig} size="lg" showBorder={false} />
   <div className="mt-1 flex items-center gap-1 text-[10px] font-mono text-amber-400 font-bold uppercase">
     <Edit2 className="w-3 h-3" />
     <span>CUSTOMIZE BANNER</span>
   </div>
 </div>

 {/* Resource Dials / Levels */}
 <div className="w-full space-y-3">
 <div className="space-y-1">
 <div className="flex justify-between text-[11px] font-heading font-bold">
 <span className="text-[#8C9BAE]">PEOPLE:</span>
 <span className="text-white font-tech">
 {peopleLevel === 1 ? 'LOW' : peopleLevel === 2 ? 'MEDIUM' : 'HIGH'}
 </span>
 </div>
 <input
 type="range"
 min={1}
 max={3}
 value={peopleLevel}
 onChange={(e) => setPeopleLevel(parseInt(e.target.value))}
 className="w-full accent-[#B31217] cursor-pointer"
 />
 </div>

 <div className="space-y-1">
 <div className="flex justify-between text-[11px] font-heading font-bold">
 <span className="text-[#8C9BAE]">RESOURCES:</span>
 <span className="text-white font-tech">
 {resourcesLevel === 1 ? 'LOW' : resourcesLevel === 2 ? 'MEDIUM' : 'HIGH'}
 </span>
 </div>
 <input
 type="range"
 min={1}
 max={3}
 value={resourcesLevel}
 onChange={(e) => setResourcesLevel(parseInt(e.target.value))}
 className="w-full accent-[#B31217] cursor-pointer"
 />
 </div>

 <div className="space-y-1">
 <div className="flex justify-between text-[11px] font-heading font-bold">
 <span className="text-[#8C9BAE]">HORDES SIZE:</span>
 <span className="text-white font-tech">
 {hordesLevel === 1 ? 'LOW' : hordesLevel === 2 ? 'MEDIUM' : 'HIGH'}
 </span>
 </div>
 <input
 type="range"
 min={1}
 max={3}
 value={hordesLevel}
 onChange={(e) => setHordesLevel(parseInt(e.target.value))}
 className="w-full accent-[#B31217] cursor-pointer"
 />
 </div>
 </div>

 {/* Difficulty Readout */}
 <div className="w-full flex items-center justify-between bg-[#0A0A0A] border border-[#262F3D] px-3 py-1.5 text-xs font-heading font-bold clip-card-chip surface-bevel">
 <span className="text-[#8C9BAE]">DIFFICULTY SCORE:</span>
 <span
   className="font-tech uppercase font-bold"
   style={{ color: diffResult.color }}
 >
   {diffResult.tier} ({diffResult.percentage})
 </span>
 </div>
 </div>
 </div>

 {/* Bottom Modal Actions */}
 <div className="flex items-center justify-between border-t border-[#262F3D] pt-4">
 <button
 onClick={() => setIsCustomizationOpen(false)}
 className="px-6 py-2 bg-[#14171C] hover:bg-[#1A2634] border border-[#262F3D] text-[#E8E8E8] text-xs font-heading uppercase tracking-wider transition-colors clip-tactical-bracket"
 >
 BACK
 </button>

 <button
 id="start-customized-game-btn"
 onClick={handleStartGameWithCustomization}
 className="px-8 py-2.5 bg-[#B31217] hover:bg-[#EF4444] border border-[#EF4444] text-white text-xs font-heading uppercase tracking-wider flex items-center gap-2 transition-all clip-tactical-bracket surface-bevel cursor-pointer"
 >
 <span>START</span>
 <ArrowRight className="w-4 h-4" />
 </button>
 </div>
 </div>
 </div>
 )}

  {/* Colony Banner Customizer Modal */}
  <BannerCustomizerModal
    isOpen={isBannerModalOpen}
    initialBanner={bannerConfig}
    colonyName={zoneName}
    onClose={() => setIsBannerModalOpen(false)}
    onSave={(newBanner) => setBannerConfig(newBanner)}
  />
 </div>
 );
};
