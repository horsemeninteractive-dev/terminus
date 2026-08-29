import React, { useEffect, useState } from 'react';
import {
 Activity,
 Box,
 Compass,
 Database,
 Eye,
 EyeOff,
 Globe as GlobeIcon,
 Layers,
 MapPin,
 Maximize2,
 Moon,
 Mountain,
 RefreshCw,
 RotateCcw,
 RotateCw,
 Sliders,
 Sun,
 Sunrise,
 Sunset,
 Trees,
 Truck,
 Wind,
 Zap,
} from 'lucide-react';
import { CATEGORY_COLORS } from '../render/BuildingRenderer';
import { TimeOfDay, WorldScene } from '../render/WorldScene';
import { sampleElevation } from '../services/elevationService';
import { BuildingPolygon, LocationPreset, MapData, Point2D } from '../types/map';

interface DebugOverlayProps {
 mapData: MapData | null;
 isLoading: boolean;
 loadingMessage: string;
 loadError: string | null;
 cacheSource: string;
 selectedBuilding: BuildingPolygon | null;
 hoveredBuilding: BuildingPolygon | null;
 clickedPosition: Point2D | null;
 timeOfDay: TimeOfDay;
 elevationExaggeration: number;
 showTerrainWireframe: boolean;
 showBuildingEdges: boolean;
 showBuildings: boolean;
 showRoads: boolean;
 showWood: boolean;
 showMetal: boolean;
 showBricks: boolean;
 showLanduse: boolean;
 locationPresets: LocationPreset[];
 currentPresetId: string;
 scene: WorldScene | null;
 onSelectPreset: (preset: LocationPreset) => void;
 onFetchCustom: (lat: number, lon: number, radius: number) => void;
 onClearCache: () => void;
 onRefetch: () => void;
 setTimeOfDay: (time: TimeOfDay) => void;
 setElevationExaggeration: (v: number) => void;
 setShowTerrainWireframe: (v: boolean) => void;
 setShowBuildingEdges: (v: boolean) => void;
 setShowBuildings: (v: boolean) => void;
 setShowRoads: (v: boolean) => void;
 setShowWood: (v: boolean) => void;
 setShowMetal: (v: boolean) => void;
 setShowBricks: (v: boolean) => void;
 setShowLanduse: (v: boolean) => void;
 onFocusBuilding: (bldg: BuildingPolygon) => void;
 onResetCamera: () => void;
 onReturnToGlobe?: () => void;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({
 mapData,
 isLoading,
 loadingMessage,
 loadError,
 cacheSource,
 selectedBuilding,
 hoveredBuilding,
 clickedPosition,
 timeOfDay,
 elevationExaggeration,
 showTerrainWireframe,
 showBuildingEdges,
 showBuildings,
 showRoads,
 showWood,
 showMetal,
 showBricks,
 showLanduse,
 locationPresets,
 currentPresetId,
 scene,
 onSelectPreset,
 onFetchCustom,
 onClearCache,
 onRefetch,
 setTimeOfDay,
 setElevationExaggeration,
 setShowTerrainWireframe,
 setShowBuildingEdges,
 setShowBuildings,
 setShowRoads,
 setShowWood,
 setShowMetal,
 setShowBricks,
 setShowLanduse,
 onFocusBuilding,
 onResetCamera,
 onReturnToGlobe,
}) => {
 const [panelOpen, setPanelOpen] = useState(true);
 // Hidden debug menu: off by default — the normal play HUD shows none of this.
 // Toggle via backtick/` key or the unobtrusive DEV chip in the corner.
 const [debugVisible, setDebugVisible] = useState(false);
 const [customLat, setCustomLat] = useState('51.7520');
 const [customLon, setCustomLon] = useState('-1.2577');
 const [customRadius, setCustomRadius] = useState('450');

 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if (e.key === '`' || e.key === '~' || e.key === 'F12') {
 e.preventDefault();
 setDebugVisible((v) => !v);
 }
 };
 window.addEventListener('keydown', onKey);
 return () => window.removeEventListener('keydown', onKey);
 }, []);

 const activeBuilding = selectedBuilding || hoveredBuilding;

 const handleCustomSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 const lat = parseFloat(customLat);
 const lon = parseFloat(customLon);
 const rad = parseInt(customRadius, 10);
 if (!isNaN(lat) && !isNaN(lon) && !isNaN(rad)) {
 onFetchCustom(lat, lon, rad);
 }
 };

 const fps = scene?.fps || 60;
 const camState = scene?.cameraController.getState() || { distance: 300, yawDeg: 45, pitchDeg: 45 };

 // Calculate terrain heights for inspected items
 const activeBuildingBaseElev =
 activeBuilding && mapData?.elevation
 ? Math.round(
 mapData.elevation.minElevation +
 (sampleElevation(mapData.elevation, activeBuilding.center.x, activeBuilding.center.z, 1.0) - 0)
 )
 : null;

 const clickedPosElevation =
 clickedPosition && mapData?.elevation
 ? Math.round(
 mapData.elevation.minElevation +
 sampleElevation(mapData.elevation, clickedPosition.x, clickedPosition.z, 1.0)
 )
 : null;

 // Hidden by default: only the unobtrusive debug toggle chip is rendered.
 if (!debugVisible) {
 return (
 <button
 id="debug-menu-toggle"
 onClick={() => setDebugVisible(true)}
 title="Toggle Debug Menu (Press ` backtick)"
 className="fixed bottom-1 right-1 z-50 px-1.5 py-0.5 bg-[#0E1012] border border-[#2D333B] text-[#4B5563] hover:text-[#E8E8E8] hover:border-[#5A6270] text-[9px] font-mono tracking-wider uppercase transition-colors pointer-events-auto"
 >
 DEV
 </button>
 );
 }

 return (
 <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 font-mono">
 {/* Top Header Bar: Location, Status, and Controls */}
 <div className="flex justify-between items-start pointer-events-auto gap-4">
 {/* Title & Coordinates Box */}
 <div className="bg-[#0e1012]/95 border border-[#33373d] p-2.5 clip-tactical-bracket backdrop-blur-sm">
 <div className="flex items-center gap-2 mb-1">
 <span className="w-2.5 h-2.5 bg-[#b31217] animate-pulse" />
 <h1 className="font-black tracking-widest text-white text-sm uppercase">
 TERMINUS <span className="text-[#b31217]">3D WORLD VIEW</span>
 </h1>
 <span className="bg-[#1f2228] text-[#8e95a5] px-1.5 py-0.5 text-[9px] uppercase border border-[#2b2f38]">
 OSM §3 + §12 Map Engine
 </span>
 </div>

 <div className="flex items-center gap-2 text-[11px] text-[#b0b5be]">
 <MapPin className="w-3.5 h-3.5 text-[#b31217]" />
 <span className="font-medium text-white">
 {locationPresets.find((p) => p.id === currentPresetId)?.name || 'Custom Location'}
 </span>
 <span className="text-[#6b7280]">|</span>
 <span>
 {mapData?.center.lat.toFixed(4)}, {mapData?.center.lon.toFixed(4)} (Grid: 8km × 8km)
 </span>
 </div>

 <div className="mt-1 flex items-center gap-3 text-[10px] text-[#868e9b]">
 <span>
 SOURCE: <span className="text-[#4ade80]">{cacheSource}</span>
 </span>
 {mapData?.elevation && (
 <span>
 ELEVATION:{' '}
 <span className="text-[#38bdf8] font-bold">
 {mapData.elevation.minElevation}m → {mapData.elevation.maxElevation}m (Δ
 {Math.round(mapData.elevation.maxElevation - mapData.elevation.minElevation)}m)
 </span>
 </span>
 )}
 <span>
 FPS: <span className="text-white font-bold">{fps}</span>
 </span>
 <span>
 CAM: {camState.distance}m / {camState.yawDeg}°
 </span>
 </div>
 </div>

 {/* Top Controls: Time of Day & Camera Buttons */}
 <div className="flex items-center gap-2 bg-[#0e1012]/95 border border-[#33373d] p-1.5 clip-tactical-bracket backdrop-blur-sm">
 {/* Time of Day */}
 <div className="flex items-center gap-1 bg-[#16181b] p-1 border border-[#292c31]">
 <button
 id="time-day-btn"
 onClick={() => {
 setTimeOfDay('day');
 scene?.setTimeOfDay('day');
 }}
 className={`p-1.5 transition-colors ${
 timeOfDay === 'day' ? 'bg-[#2b3038] text-[#fcd34d]' : 'text-[#6b7280] hover:text-white'
 }`}
 title="Day Sunlight"
 >
 <Sun className="w-3.5 h-3.5" />
 </button>
 <button
 id="time-dusk-btn"
 onClick={() => {
 setTimeOfDay('dusk');
 scene?.setTimeOfDay('dusk');
 }}
 className={`p-1.5 transition-colors ${
 timeOfDay === 'dusk' ? 'bg-[#2b3038] text-[#f97316]' : 'text-[#6b7280] hover:text-white'
 }`}
 title="Dusk / Sunset"
 >
 <Sunset className="w-3.5 h-3.5" />
 </button>
 <button
 id="time-night-btn"
 onClick={() => {
 setTimeOfDay('night');
 scene?.setTimeOfDay('night');
 }}
 className={`p-1.5 transition-colors ${
 timeOfDay === 'night' ? 'bg-[#2b3038] text-[#cbd5e1]' : 'text-[#6b7280] hover:text-white'
 }`}
 title="Night / Moonlight (Zombies Active)"
 >
 <Moon className="w-3.5 h-3.5" />
 </button>
 <button
 id="time-dawn-btn"
 onClick={() => {
 setTimeOfDay('dawn');
 scene?.setTimeOfDay('dawn');
 }}
 className={`p-1.5 transition-colors ${
 timeOfDay === 'dawn' ? 'bg-[#2b3038] text-[#a78bfa]' : 'text-[#6b7280] hover:text-white'
 }`}
 title="Dawn"
 >
 <Sunrise className="w-3.5 h-3.5" />
 </button>
 </div>

 <div className="h-4 w-[1px] bg-[#33373d]" />

 {/* Orbit / Zoom quick buttons */}
 <div className="flex items-center gap-1">
 <button
 id="cam-rot-left-btn"
 onClick={() => scene?.cameraController.rotate('left')}
 className="p-1.5 bg-[#16181b] hover:bg-[#25282e] border border-[#292c31] text-[#9ca3af] hover:text-white"
 title="Orbit Left (Q)"
 >
 <RotateCcw className="w-3.5 h-3.5" />
 </button>
 <button
 id="cam-rot-right-btn"
 onClick={() => scene?.cameraController.rotate('right')}
 className="p-1.5 bg-[#16181b] hover:bg-[#25282e] border border-[#292c31] text-[#9ca3af] hover:text-white"
 title="Orbit Right (E)"
 >
 <RotateCw className="w-3.5 h-3.5" />
 </button>
 <button
 id="cam-reset-btn"
 onClick={onResetCamera}
 className="p-1.5 bg-[#16181b] hover:bg-[#25282e] border border-[#292c31] text-[#9ca3af] hover:text-white"
 title="Reset View (R)"
 >
 <Compass className="w-3.5 h-3.5" />
 </button>
 </div>

 {onReturnToGlobe && (
 <button
 id="return-to-globe-btn"
 onClick={onReturnToGlobe}
 className="px-2 py-1 bg-[#16181b] hover:bg-[#b31217] border border-[#292c31] hover:border-[#b31217] text-[#9ca3af] hover:text-white text-[10px] font-bold flex items-center gap-1.5 transition-colors"
 title="Return to Orbital 3D Satellite Recon (§3.4)"
 >
 <GlobeIcon className="w-3.5 h-3.5 text-[#38bdf8]" />
 <span>ORBITAL GLOBE</span>
 </button>
 )}

 <button
 id="toggle-panel-btn"
 onClick={() => setPanelOpen(!panelOpen)}
 className={`p-1.5 border transition-colors ${
 panelOpen ? 'bg-[#b31217] text-white border-[#b31217]' : 'bg-[#16181b] text-[#9ca3af] border-[#292c31]'
 }`}
 title="Toggle Debug & Pipeline Panel"
 >
 <Layers className="w-3.5 h-3.5" />
 </button>
 </div>
 </div>

 {/* Center Loading / Error Banner */}
 {isLoading && (
 <div className="self-center bg-[#0e1012]/95 border border-[#b31217] p-3 text-center clip-tactical-bracket backdrop-blur-md pointer-events-auto">
 <div className="flex items-center gap-2 justify-center text-white mb-1">
 <RefreshCw className="w-4 h-4 text-[#b31217] animate-spin" />
 <span className="font-bold tracking-wider uppercase">Fetching OpenStreetMap & Elevation Data</span>
 </div>
 <p className="text-[11px] text-[#9ca3af]">{loadingMessage}</p>
 </div>
 )}

 {loadError && !isLoading && (
 <div className="self-center bg-[#1a0c0e]/95 border border-[#b31217] p-3 text-center clip-tactical-bracket backdrop-blur-md pointer-events-auto max-w-md">
 <div className="flex items-center gap-2 justify-center text-[#ef4444] mb-1">
 <Zap className="w-4 h-4 text-[#ef4444]" />
 <span className="font-bold tracking-wider uppercase">Pipeline Notice</span>
 </div>
 <p className="text-[11px] text-[#d1d5db] mb-2">{loadError}</p>
 <div className="flex justify-center gap-2">
 <button
 onClick={onRefetch}
 className="bg-[#b31217] hover:bg-[#8f0e12] text-white px-2.5 py-1 text-[11px] font-bold"
 >
 Retry Overpass Query
 </button>
 </div>
 </div>
 )}

 {/* Middle Workspace: Left Control Drawer & Right Entity Inspector */}
 <div className="flex justify-between items-start pointer-events-none mt-2 flex-1">
 {/* Left Side: Pipeline, Presets, Elevation & Stats Panel */}
 {panelOpen && (
 <div className="bg-[#0e1012]/95 border border-[#33373d] p-3 clip-tactical-bracket backdrop-blur-md w-80 max-h-[calc(100vh-140px)] overflow-y-auto pointer-events-auto space-y-3">
 {/* 1. Location Presets */}
 <div>
 <div className="flex items-center justify-between text-[#9ca3af] font-bold uppercase tracking-wider mb-1.5 pb-1 border-b border-[#22262c]">
 <span>1. Real-World Locations</span>
 <MapPin className="w-3.5 h-3.5 text-[#b31217]" />
 </div>
 <div className="grid grid-cols-1 gap-1">
 {locationPresets.map((preset) => (
 <button
 key={preset.id}
 onClick={() => {
 setCustomLat(preset.lat.toString());
 setCustomLon(preset.lon.toString());
 setCustomRadius(preset.radius.toString());
 onSelectPreset(preset);
 }}
 className={`text-left p-2 border transition-all ${
 currentPresetId === preset.id
 ? 'bg-[#1b2026] border-[#b31217] text-white'
 : 'bg-[#121417] border-[#22262c] text-[#9ca3af] hover:text-white hover:border-[#383d45]'
 }`}
 >
 <div className="font-bold flex items-center justify-between">
 <span>{preset.name}</span>
 <span className="text-[9px] text-[#6b7280]">{preset.country}</span>
 </div>
 <div className="text-[10px] text-[#71717a] mt-0.5 truncate">{preset.description}</div>
 </button>
 ))}
 </div>
 </div>

 {/* 2. Topography & Elevation Controls */}
 <div>
 <div className="flex items-center justify-between text-[#9ca3af] font-bold uppercase tracking-wider mb-1.5 pb-1 border-b border-[#22262c]">
 <span>2. 3D Elevation & Topography</span>
 <Mountain className="w-3.5 h-3.5 text-[#38bdf8]" />
 </div>

 <div className="bg-[#141619] p-2 border border-[#24272c] space-y-2">
 <div className="flex justify-between items-center text-[10px]">
 <span className="text-[#9ca3af]">Terrain Range:</span>
 <span className="text-[#38bdf8] font-bold">
 {mapData?.elevation ? (
 `${mapData.elevation.minElevation}m – ${mapData.elevation.maxElevation}m (Δ${Math.round(
 mapData.elevation.maxElevation - mapData.elevation.minElevation
 )}m)`
 ) : (
 'Loading...'
 )}
 </span>
 </div>

 <div>
 <div className="flex justify-between items-center text-[10px] mb-1">
 <span className="text-[#9ca3af]">Elevation Exaggeration:</span>
 <span className="text-white font-bold">{elevationExaggeration.toFixed(1)}x</span>
 </div>
 <div className="grid grid-cols-4 gap-1">
 {[1.0, 1.5, 2.0, 3.0].map((ex) => (
 <button
 key={ex}
 onClick={() => setElevationExaggeration(ex)}
 className={`py-1 text-[10px] font-bold border transition-colors ${
 elevationExaggeration === ex
 ? 'bg-[#b31217] border-[#b31217] text-white'
 : 'bg-[#1b1e23] border-[#2c3038] text-[#9ca3af] hover:text-white'
 }`}
 >
 {ex.toFixed(1)}x
 </button>
 ))}
 </div>
 </div>

 <div className="pt-1 flex items-center justify-between border-t border-[#22262c]">
 <span className="text-[10px] text-[#9ca3af]">Contour Wireframe:</span>
 <button
 onClick={() => setShowTerrainWireframe(!showTerrainWireframe)}
 className={`px-2 py-0.5 text-[10px] font-bold border flex items-center gap-1 ${
 showTerrainWireframe
 ? 'bg-[#1b2026] border-[#38bdf8] text-[#38bdf8]'
 : 'bg-[#121417] border-[#22262c] text-[#52525b]'
 }`}
 >
 {showTerrainWireframe ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
 <span>{showTerrainWireframe ? 'Active' : 'Off'}</span>
 </button>
 </div>
 </div>
 </div>

 {/* 3. Custom Coordinate Query */}
 <div>
 <div className="flex items-center justify-between text-[#9ca3af] font-bold uppercase tracking-wider mb-1.5 pb-1 border-b border-[#22262c]">
 <span>3. Overpass API Pipeline</span>
 <Database className="w-3.5 h-3.5 text-[#3b82f6]" />
 </div>
 <form onSubmit={handleCustomSubmit} className="space-y-1.5">
 <div className="grid grid-cols-2 gap-1.5">
 <div>
 <label className="text-[10px] text-[#6b7280]">Latitude</label>
 <input
 id="debug-latitude"
 name="latitude"
 type="text"
 value={customLat}
 onChange={(e) => setCustomLat(e.target.value)}
 className="w-full bg-[#16181b] border border-[#292c31] px-1.5 py-1 text-white text-[11px] focus:border-[#b31217] outline-none"
 />
 </div>
 <div>
 <label className="text-[10px] text-[#6b7280]">Longitude</label>
 <input
 id="debug-longitude"
 name="longitude"
 type="text"
 value={customLon}
 onChange={(e) => setCustomLon(e.target.value)}
 className="w-full bg-[#16181b] border border-[#292c31] px-1.5 py-1 text-white text-[11px] focus:border-[#b31217] outline-none"
 />
 </div>
 </div>

 <div className="flex items-center gap-2">
 <div className="w-1/2">
 <label className="text-[10px] text-[#6b7280]">Grid Half-Span (m)</label>
 <input
 id="debug-grid-radius"
 name="gridRadius"
 type="number"            min="500"
            max="4000"
            step="250"
 value={customRadius}
 onChange={(e) => setCustomRadius(e.target.value)}
 className="w-full bg-[#16181b] border border-[#292c31] px-1.5 py-1 text-white text-[11px] focus:border-[#b31217] outline-none"
 />
 </div>
 <div className="w-1/2 pt-3">
 <button
 type="submit"
 disabled={isLoading}
 className="w-full bg-[#20252c] hover:bg-[#b31217] border border-[#383e47] hover:border-[#b31217] text-white py-1 px-2 font-bold text-[10px] uppercase transition-colors"
 >
 Fetch OSM
 </button>
 </div>
 </div>
 </form>

 <div className="mt-2 flex gap-1.5">
 <button
 onClick={onRefetch}
 disabled={isLoading}
 className="flex-1 bg-[#16181b] hover:bg-[#20242a] border border-[#292c31] text-[#9ca3af] hover:text-white py-1 text-[10px] flex items-center justify-center gap-1"
 >
 <RefreshCw className="w-3 h-3" />
 <span>Re-fetch</span>
 </button>
 <button
 onClick={onClearCache}
 className="bg-[#16181b] hover:bg-[#2e1719] border border-[#292c31] hover:border-[#8f0e12] text-[#9ca3af] hover:text-[#ef4444] px-2 py-1 text-[10px]"
 title="Clear Local Map Cache"
 >
 Clear Cache
 </button>
 </div>
 </div>

 {/* 4. Physical Resource Nodes (§7.2) */}
 <div>
 <div className="flex items-center justify-between text-[#9ca3af] font-bold uppercase tracking-wider mb-1.5 pb-1 border-b border-[#22262c]">
 <span>4. Physical Resource Nodes (§7.2)</span>
 <span className="text-[10px] text-[#4ade80] font-normal">
 {mapData?.stats.resourceCount.total || 0} Total
 </span>
 </div>
 <div className="space-y-1">
 {/* Wood */}
 <div className="flex items-center justify-between bg-[#141619] p-1.5 border border-[#24272c]">
 <div className="flex items-center gap-1.5">
 <Trees className="w-3.5 h-3.5 text-[#4ade80]" />
 <div>
 <div className="font-bold text-white text-[11px]">Wood (Trees / Vegetation)</div>
 <div className="text-[9px] text-[#71717a]">Natural trees & park clusters</div>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <span className="font-bold text-[#4ade80]">{mapData?.stats.resourceCount.wood || 0}</span>
 <button
 onClick={() => setShowWood(!showWood)}
 className={`p-1 ${showWood ? 'text-white' : 'text-[#52525b]'}`}
 >
 {showWood ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
 </button>
 </div>
 </div>

 {/* Metal */}
 <div className="flex items-center justify-between bg-[#141619] p-1.5 border border-[#24272c]">
 <div className="flex items-center gap-1.5">
 <Truck className="w-3.5 h-3.5 text-[#38bdf8]" />
 <div>
 <div className="font-bold text-white text-[11px]">Metal (Vehicles / Lamps)</div>
 <div className="text-[9px] text-[#71717a]">Abandoned cars & street metal</div>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <span className="font-bold text-[#38bdf8]">{mapData?.stats.resourceCount.metal || 0}</span>
 <button
 onClick={() => setShowMetal(!showMetal)}
 className={`p-1 ${showMetal ? 'text-white' : 'text-[#52525b]'}`}
 >
 {showMetal ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
 </button>
 </div>
 </div>

 {/* Bricks */}
 <div className="flex items-center justify-between bg-[#141619] p-1.5 border border-[#24272c]">
 <div className="flex items-center gap-1.5">
 <Box className="w-3.5 h-3.5 text-[#f97316]" />
 <div>
 <div className="font-bold text-white text-[11px]">Bricks (Rubble / Debris)</div>
 <div className="text-[9px] text-[#71717a]">Building perimeter debris</div>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <span className="font-bold text-[#f97316]">{mapData?.stats.resourceCount.bricks || 0}</span>
 <button
 onClick={() => setShowBricks(!showBricks)}
 className={`p-1 ${showBricks ? 'text-white' : 'text-[#52525b]'}`}
 >
 {showBricks ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
 </button>
 </div>
 </div>
 </div>
 </div>

 {/* 5. Visual Layer Toggles */}
 <div>
 <div className="flex items-center justify-between text-[#9ca3af] font-bold uppercase tracking-wider mb-1.5 pb-1 border-b border-[#22262c]">
 <span>5. 3D World Layers</span>
 <Layers className="w-3.5 h-3.5 text-[#eab308]" />
 </div>
 <div className="grid grid-cols-2 gap-1">
 <button
 onClick={() => setShowBuildings(!showBuildings)}
 className={`p-1.5 border text-left flex items-center justify-between ${
 showBuildings ? 'bg-[#1b2026] border-[#3b424d] text-white' : 'bg-[#121417] border-[#22262c] text-[#52525b]'
 }`}
 >
 <span>Buildings ({mapData?.stats.buildingCount || 0})</span>
 {showBuildings ? <Eye className="w-3 h-3 text-[#4ade80]" /> : <EyeOff className="w-3 h-3" />}
 </button>

 <button
 onClick={() => setShowBuildingEdges(!showBuildingEdges)}
 className={`p-1.5 border text-left flex items-center justify-between ${
 showBuildingEdges ? 'bg-[#1b2026] border-[#3b424d] text-white' : 'bg-[#121417] border-[#22262c] text-[#52525b]'
 }`}
 >
 <span>Outlines</span>
 {showBuildingEdges ? <Eye className="w-3 h-3 text-[#4ade80]" /> : <EyeOff className="w-3 h-3" />}
 </button>

 <button
 onClick={() => setShowRoads(!showRoads)}
 className={`p-1.5 border text-left flex items-center justify-between ${
 showRoads ? 'bg-[#1b2026] border-[#3b424d] text-white' : 'bg-[#121417] border-[#22262c] text-[#52525b]'
 }`}
 >
 <span>Roads ({mapData?.stats.roadCount || 0})</span>
 {showRoads ? <Eye className="w-3 h-3 text-[#4ade80]" /> : <EyeOff className="w-3 h-3" />}
 </button>

 <button
 onClick={() => setShowLanduse(!showLanduse)}
 className={`p-1.5 border text-left flex items-center justify-between ${
 showLanduse ? 'bg-[#1b2026] border-[#3b424d] text-white' : 'bg-[#121417] border-[#22262c] text-[#52525b]'
 }`}
 >
 <span>Landuse/Parks</span>
 {showLanduse ? <Eye className="w-3 h-3 text-[#4ade80]" /> : <EyeOff className="w-3 h-3" />}
 </button>
 </div>
 </div>

 {/* 6. Camera & Navigation Controls Guide */}
 <div className="bg-[#121417] p-2 border border-[#22262c] text-[10px] space-y-1 text-[#9ca3af]">
 <div className="font-bold text-white uppercase text-[10px] flex items-center gap-1 mb-1">
 <Compass className="w-3 h-3 text-[#b31217]" />
 <span>3D Camera Controls</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Pan / Move:</span>
 <span className="text-white">Left-Click Drag or WASD</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Rotate / Orbit:</span>
 <span className="text-white">Q / E or Right-Click Drag</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Zoom:</span>
 <span className="text-white">Mouse Scroll Wheel / +/-</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#6b7280]">Reset:</span>
 <span className="text-white">R Key</span>
 </div>
 </div>
 </div>
 )}

 {/* Right Side: Selected / Hovered Building Inspector */}
 {activeBuilding && (
 <div className="bg-[#0e1012]/95 border border-[#b31217] p-3 clip-tactical-bracket backdrop-blur-md w-72 pointer-events-auto">
 <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#292c31]">
 <div className="flex items-center gap-1.5">
 <span
 className="w-2.5 h-2.5"
 style={{
 backgroundColor: `#${CATEGORY_COLORS[activeBuilding.type]?.accent.toString(16).padStart(6, '0')}`,
 }}
 />
 <span className="font-bold uppercase tracking-wider text-white text-[11px]">
 {CATEGORY_COLORS[activeBuilding.type]?.label || 'Building Entity'}
 </span>
 </div>
 <span className="text-[9px] text-[#71717a] font-mono">#{activeBuilding.id}</span>
 </div>

 <div className="space-y-1.5">
 {activeBuilding.name && (
 <div>
 <div className="text-[9px] text-[#6b7280] uppercase">Identified Name</div>
 <div className="font-bold text-white text-[12px]">{activeBuilding.name}</div>
 </div>
 )}

 <div className="grid grid-cols-2 gap-2 bg-[#141619] p-1.5 border border-[#24272c]">
 <div>
 <div className="text-[9px] text-[#6b7280]">Extruded Height</div>
 <div className="font-bold text-white">{activeBuilding.height}m</div>
 </div>
 <div>
 <div className="text-[9px] text-[#6b7280]">Estimated Levels</div>
 <div className="font-bold text-white">{activeBuilding.levels} Floors</div>
 </div>
 <div>
 <div className="text-[9px] text-[#6b7280]">Terrain Base ASL</div>
 <div className="font-bold text-[#38bdf8]">{activeBuildingBaseElev ?? '--'}m</div>
 </div>
 <div>
 <div className="text-[9px] text-[#6b7280]">Roof Altitude ASL</div>
 <div className="font-bold text-white">
 {activeBuildingBaseElev ? `${activeBuildingBaseElev + activeBuilding.height}m` : '--'}
 </div>
 </div>
 <div>
 <div className="text-[9px] text-[#6b7280]">OSM Category</div>
 <div className="font-bold text-[#fcd34d] uppercase truncate">{activeBuilding.type}</div>
 </div>
 <div>
 <div className="text-[9px] text-[#6b7280]">Center Offset</div>
 <div className="font-bold text-white">
 {Math.round(activeBuilding.center.x)}m, {Math.round(activeBuilding.center.z)}m
 </div>
 </div>
 </div>

 {Object.keys(activeBuilding.tags || {}).length > 0 && (
 <div>
 <div className="text-[9px] text-[#6b7280] uppercase mb-1">OpenStreetMap Tags</div>
 <div className="bg-[#141619] p-1.5 border border-[#24272c] space-y-0.5 max-h-28 overflow-y-auto text-[9px]">
 {Object.entries(activeBuilding.tags || {}).map(([k, v]) => (
 <div key={k} className="flex justify-between gap-1">
 <span className="text-[#9ca3af]">{k}:</span>
 <span className="text-white truncate">{v}</span>
 </div>
 ))}
 </div>
 </div>
 )}

 <button
 onClick={() => onFocusBuilding(activeBuilding)}
 className="w-full bg-[#1b2026] hover:bg-[#b31217] border border-[#3b424d] hover:border-[#b31217] text-white py-1 px-2 font-bold text-[10px] flex items-center justify-center gap-1 transition-colors mt-2"
 >
 <Maximize2 className="w-3 h-3" />
 <span>Focus Camera On Building</span>
 </button>
 </div>
 </div>
 )}
 </div>

 {/* Bottom Bar: Mandatory OpenStreetMap Attribution per §3.1 */}
 <div className="flex items-center justify-between bg-[#0e1012]/95 border border-[#33373d] px-3 py-1.5 backdrop-blur-sm pointer-events-auto">
 <div className="flex items-center gap-2 text-[10px] text-[#9ca3af]">
 <span className="font-bold text-[#b31217]">TERMINUS 3D MAP ENGINE</span>
 <span className="text-[#4b5563]">|</span>
 <span>
 Map data ©{' '}
 <a
 href="https://www.openstreetmap.org/copyright"
 target="_blank"
 rel="noreferrer"
 className="text-white hover:text-[#4ade80] underline underline-offset-2"
 >
 OpenStreetMap
 </a>{' '}
 contributors (ODbL 1.0)
 </span>
 <span className="text-[#4b5563]">|</span>
 <span>
 DEM Topography via{' '}
 <span className="text-[#38bdf8]">Open-Meteo & SRTM-90m</span>
 </span>
 </div>

 <div className="flex items-center gap-3 text-[10px] text-[#6b7280]">
 {clickedPosition && (
 <span className="text-[#38bdf8]">
 Target: ({clickedPosition.x}m, {clickedPosition.z}m) @ {clickedPosElevation ?? '--'}m ASL
 </span>
 )}
 <span>WebGL Three.js Engine</span>
 </div>
 </div>
 </div>
 );
};
