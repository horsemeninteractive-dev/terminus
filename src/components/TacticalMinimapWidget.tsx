import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Compass,
  MapPin,
  Layers,
  Map as MapIcon,
  PackageSearch,
  Eye,
  EyeOff,
  Filter,
  Check,
  Minimize2,
  Apple,
  Cross,
  Shield,
  Fuel,
  Wrench,
  HelpCircle,
  Sliders,
  X,
} from 'lucide-react';
import { BuildingPolygon, LanduseArea, Point2D } from '../types/map';
import { TacticalSquadUnit, ZombieUnit } from '../types/combat';
import { WorldVehicle } from '../types/vehicle';
import { soundEngine } from '../services/soundService';
import { estimateSatelliteVram } from '../services/satelliteService';
import { PushToTalkButton } from './PushToTalkButton';

export type ScavengeLootFilter = 'all' | 'food' | 'medical' | 'weapons' | 'fuel' | 'materials' | 'assorted';

interface TacticalMinimapWidgetProps {
  selectedBuilding: BuildingPolygon | null;
  buildings: BuildingPolygon[];
  landuse?: LanduseArea[];
  squads: TacticalSquadUnit[];
  zombies: ZombieUnit[];
  vehicles: WorldVehicle[];
  hqBuildingId: string | number | null;
  cameraPosition: { x: number; z: number };
  onPanTo: (pos: Point2D) => void;
  onCenterHQ?: () => void;
  onResetNorth?: () => void;

  // Icon 1: Scavenge View
  isScavengeViewActive?: boolean;
  scavengeFilterType?: ScavengeLootFilter;
  onToggleScavengeView?: () => void;
  onSetScavengeFilter?: (filter: ScavengeLootFilter) => void;

  // Icon 2: View Layers
  showStreetLabels?: boolean;
  onToggleStreetLabels?: () => void;
  showStructureOutlines?: boolean;
  onToggleStructureOutlines?: () => void;
  showSatelliteOverlay?: boolean;
  onToggleSatelliteOverlay?: () => void;
  satelliteQuality?: import('../types/saveGame').SatelliteQuality;
  showPowerGrid?: boolean;
  onTogglePowerGrid?: () => void;
  onSatelliteQualityChange?: (quality: import('../types/saveGame').SatelliteQuality) => void;
  showLanduse?: boolean;
  onToggleLanduse?: () => void;
  labelDetailMode?: 'detailed' | 'minimal';
  onToggleLabelDetailMode?: () => void;
  onToggleHideUi?: () => void;

  // Icon 3: Expedition View
  isExpeditionViewActive?: boolean;
  onToggleExpeditionView?: () => void;

  // Radio / PTT
  onOpenRadio?: () => void;
  unreadRadioCount?: number;
  hasIncomingRadio?: boolean;
  isInitialPendingRadio?: boolean;
  mapRadius?: number;
}

export const TacticalMinimapWidget: React.FC<TacticalMinimapWidgetProps> = ({
  selectedBuilding,
  buildings = [],
  landuse = [],
  squads = [],
  zombies = [],
  vehicles = [],
  hqBuildingId,
  cameraPosition,
  onPanTo,
  onCenterHQ,
  onResetNorth,
  isScavengeViewActive = false,
  scavengeFilterType = 'all',
  onToggleScavengeView,
  onSetScavengeFilter,
  showStreetLabels = false,
  onToggleStreetLabels,
  showStructureOutlines = true,
  onToggleStructureOutlines,
  showSatelliteOverlay = false,
  onToggleSatelliteOverlay,
  satelliteQuality = 'balanced',
  onSatelliteQualityChange,
  showPowerGrid = false,
  onTogglePowerGrid,
  showLanduse = true,
  onToggleLanduse,
  labelDetailMode = 'minimal',
  onToggleLabelDetailMode,
  onToggleHideUi,
  isExpeditionViewActive = false,
  onToggleExpeditionView,
  onOpenRadio,
  unreadRadioCount = 0,
  hasIncomingRadio = false,
  isInitialPendingRadio = false,
  mapRadius = 4000,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isMinimized, setIsMinimized] = useState(true);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isLayersMenuOpen, setIsLayersMenuOpen] = useState(false);

  const longPressTimerRef = useRef<number | null>(null);
  const layersCloseTimerRef = useRef<number | null>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapExtent = mapRadius || 4000;

  // 1. Render static layer (terrain, landuse, base buildings) to offscreen canvas only when map geometry changes
  useEffect(() => {
    if (isMinimized) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = canvas.width;
    if (!size) return;

    if (!staticCanvasRef.current) {
      staticCanvasRef.current = document.createElement('canvas');
    }
    const staticCanvas = staticCanvasRef.current;
    staticCanvas.width = size;
    staticCanvas.height = size;
    const sCtx = staticCanvas.getContext('2d');
    if (!sCtx) return;

    sCtx.clearRect(0, 0, size, size);

    // Dark radar background
    sCtx.fillStyle = '#07090C';
    sCtx.fillRect(0, 0, size, size);

    // Subtle tactical grid
    sCtx.strokeStyle = '#161B22';
    sCtx.lineWidth = 1;
    for (let i = 20; i < size; i += 25) {
      sCtx.beginPath();
      sCtx.moveTo(i, 0);
      sCtx.lineTo(i, size);
      sCtx.stroke();

      sCtx.beginPath();
      sCtx.moveTo(0, i);
      sCtx.lineTo(size, i);
      sCtx.stroke();
    }

    const toCanvas = (x: number, z: number): [number, number] => {
      const cx = ((x + mapExtent) / (mapExtent * 2)) * size;
      const cy = ((z + mapExtent) / (mapExtent * 2)) * size;
      return [cx, cy];
    };

    // Render Landuse (Water & Parks)
    if (showLanduse && landuse && landuse.length > 0) {
      for (const lu of landuse) {
        if (!lu.polygon || lu.polygon.length < 3) continue;
        sCtx.beginPath();
        const [spX, spY] = toCanvas(lu.polygon[0].x, lu.polygon[0].z);
        sCtx.moveTo(spX, spY);
        for (let i = 1; i < lu.polygon.length; i++) {
          const [px, py] = toCanvas(lu.polygon[i].x, lu.polygon[i].z);
          sCtx.lineTo(px, py);
        }
        sCtx.closePath();

        if (lu.type === 'water') {
          sCtx.fillStyle = '#0284C7';
          sCtx.fill();
          sCtx.strokeStyle = '#38BDF8';
          sCtx.lineWidth = 1;
          sCtx.stroke();
        } else if (lu.type === 'forest' || lu.type === 'park' || lu.type === 'grass') {
          sCtx.fillStyle = '#064E3B';
          sCtx.fill();
        }
      }
    }

    // Render Base Buildings
    sCtx.fillStyle = '#141A22';
    sCtx.strokeStyle = '#283342';
    sCtx.lineWidth = 0.5;

    for (const bldg of buildings) {
      if (!bldg.polygon || bldg.polygon.length < 3) continue;
      sCtx.beginPath();
      const [startPx, startPy] = toCanvas(bldg.polygon[0].x, bldg.polygon[0].z);
      sCtx.moveTo(startPx, startPy);
      for (let i = 1; i < bldg.polygon.length; i++) {
        const [px, py] = toCanvas(bldg.polygon[i].x, bldg.polygon[i].z);
        sCtx.lineTo(px, py);
      }
      sCtx.closePath();
      sCtx.fill();
      sCtx.stroke();
    }
  }, [buildings, landuse, showLanduse, mapExtent, isMinimized]);

  // 2. Fast dynamic compositing (HQ, selected building, entities, camera reticle)
  useEffect(() => {
    if (isMinimized) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    if (staticCanvasRef.current) {
      ctx.drawImage(staticCanvasRef.current, 0, 0);
    } else {
      ctx.fillStyle = '#07090C';
      ctx.fillRect(0, 0, size, size);
    }

    const toCanvas = (x: number, z: number): [number, number] => {
      const cx = ((x + mapExtent) / (mapExtent * 2)) * size;
      const cy = ((z + mapExtent) / (mapExtent * 2)) * size;
      return [cx, cy];
    };

    // Render HQ Highlight
    if (hqBuildingId !== null) {
      const hqBldg = buildings.find((b) => String(b.id) === String(hqBuildingId));
      if (hqBldg && hqBldg.polygon && hqBldg.polygon.length >= 3) {
        ctx.beginPath();
        const [startPx, startPy] = toCanvas(hqBldg.polygon[0].x, hqBldg.polygon[0].z);
        ctx.moveTo(startPx, startPy);
        for (let i = 1; i < hqBldg.polygon.length; i++) {
          const [px, py] = toCanvas(hqBldg.polygon[i].x, hqBldg.polygon[i].z);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = '#064E3B';
        ctx.fill();
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Render Selected Building Highlight
    if (selectedBuilding && selectedBuilding.polygon && selectedBuilding.polygon.length >= 3) {
      ctx.beginPath();
      const [startPx, startPy] = toCanvas(selectedBuilding.polygon[0].x, selectedBuilding.polygon[0].z);
      ctx.moveTo(startPx, startPy);
      for (let i = 1; i < selectedBuilding.polygon.length; i++) {
        const [px, py] = toCanvas(selectedBuilding.polygon[i].x, selectedBuilding.polygon[i].z);
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#1E293B';
      ctx.fill();
      ctx.strokeStyle = '#E8E8E8';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Render Zombies (Red Blips)
    ctx.fillStyle = '#EF4444';
    for (const z of zombies) {
      if (!z) continue;
      const zxCoord = typeof z.x === 'number' ? z.x : (z as any).position?.x;
      const zzCoord = typeof z.z === 'number' ? z.z : (z as any).position?.z;
      if (typeof zxCoord === 'number' && typeof zzCoord === 'number') {
        const [zx, zy] = toCanvas(zxCoord, zzCoord);
        ctx.fillRect(zx - 1, zy - 1, 2.5, 2.5);
      }
    }

    // Render Vehicles (Amber Squares)
    ctx.fillStyle = '#F59E0B';
    for (const v of vehicles) {
      if (!v || !v.position) continue;
      const [vx, vy] = toCanvas(v.position.x, v.position.z);
      ctx.fillRect(vx - 2, vy - 2, 4, 4);
    }

    // Render Squads (Green Chevron / Circles)
    ctx.fillStyle = '#10B981';
    ctx.strokeStyle = '#047857';
    ctx.lineWidth = 1;
    for (const s of squads) {
      if (!s) continue;
      const posX = s.position ? s.position.x : s.x;
      const posZ = s.position ? s.position.z : s.z;
      const [sx, sy] = toCanvas(posX, posZ);
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Render Camera Viewport Box (White Reticle)
    if (cameraPosition) {
      const [camX, camY] = toCanvas(cameraPosition.x, cameraPosition.z);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      const viewSize = 22;
      ctx.strokeRect(camX - viewSize / 2, camY - viewSize / 2, viewSize, viewSize);

      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(camX - 1, camY - 1, 2, 2);
    }
  }, [squads, zombies, vehicles, selectedBuilding, hqBuildingId, cameraPosition?.x, cameraPosition?.z, isMinimized, mapExtent]);

  const handleCanvasInteraction = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    const worldX = (clickX / canvas.width) * (mapExtent * 2) - mapExtent;
    const worldZ = (clickY / canvas.height) * (mapExtent * 2) - mapExtent;

    soundEngine.playClick();
    onPanTo({ x: worldX, z: worldZ });
  };

  // Scavenge button touch/click long-press logic
  const handleScavengePointerDown = () => {
    longPressTimerRef.current = window.setTimeout(() => {
      soundEngine.playClick();
      setIsFilterMenuOpen(true);
      longPressTimerRef.current = null;
    }, 380);
  };

  const handleScavengePointerUp = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      soundEngine.playClick();
      onToggleScavengeView?.();
    }
  };

  const handleScavengeContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    soundEngine.playClick();
    setIsFilterMenuOpen((prev) => !prev);
  };

  // Layers Menu Hover Handlers (desktop) with comfortable grace timeout
  const handleLayersMouseEnter = () => {
    if (layersCloseTimerRef.current) {
      window.clearTimeout(layersCloseTimerRef.current);
      layersCloseTimerRef.current = null;
    }
    setIsLayersMenuOpen(true);
  };

  const handleLayersMouseLeave = () => {
    layersCloseTimerRef.current = window.setTimeout(() => {
      setIsLayersMenuOpen(false);
      layersCloseTimerRef.current = null;
    }, 450);
  };

  // Satellite canvas footprint follows the terrain mesh extent (radius * 2.2,
  // min 5000) — same formula GroundRenderer uses for currentTerrainSize.
  const satelliteTerrainMeters = Math.max(5000, Math.round((mapRadius || 4000) * 2.2));
  const vramBytes = (q: import('../types/saveGame').SatelliteQuality) =>
    estimateSatelliteVram(q, satelliteTerrainMeters);
  const formatVram = (bytes: number) =>
    bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;

  const lootCategories: { id: ScavengeLootFilter; label: string; icon: React.ReactNode; desc: string; color: string }[] = [
    { id: 'all', label: 'All Loot Types', icon: <PackageSearch className="w-3.5 h-3.5" />, desc: 'Show all unscavenged locations', color: '#10B981' },
    { id: 'food', label: 'Food & Rations', icon: <Apple className="w-3.5 h-3.5" />, desc: 'Supermarkets, groceries, dining', color: '#D97706' },
    { id: 'medical', label: 'Medical & Pharma', icon: <Cross className="w-3.5 h-3.5" />, desc: 'Pharmacies, clinics, hospitals', color: '#10B981' },
    { id: 'weapons', label: 'Weapons & Armory', icon: <Shield className="w-3.5 h-3.5" />, desc: 'Police stations, security, armories', color: '#3B82F6' },
    { id: 'fuel', label: 'Fuel & Petroleum', icon: <Fuel className="w-3.5 h-3.5" />, desc: 'Gas stations, fuel depots', color: '#EF4444' },
    { id: 'materials', label: 'Building Materials', icon: <Wrench className="w-3.5 h-3.5" />, desc: 'Warehouses, industrial, hardware', color: '#64748B' },
    { id: 'assorted', label: 'Assorted / Residential (?)', icon: <HelpCircle className="w-3.5 h-3.5" />, desc: 'Residential homes & unclassified', color: '#94A3B8' },
  ];

  return (
    <div
      id="tactical-minimap-widget"
      className={`fixed bottom-3 sm:bottom-4 right-3 sm:right-4 z-[44] flex items-end gap-1.5 select-none pointer-events-auto ${
        isMinimized ? 'flex-row' : 'flex-col'
      }`}
    >
      {/* ---------------- PUSH TO TALK (left of the radar pill when minimized) ---------------- */}
      {onOpenRadio && (
        <PushToTalkButton
          unreadCount={unreadRadioCount}
          hasIncoming={hasIncomingRadio}
          isInitialPending={isInitialPendingRadio}
          onClick={onOpenRadio}
          className="shadow-2xl mb-0.5"
        />
      )}

      {/* ---------------- BOTTOM: RADAR MINIMAP & 4 ICON UTILITY COLUMN ---------------- */}
      {isMinimized ? (
        /* Minimized Radar Pill */
        <button
          id="btn-expand-radar"
          onClick={() => {
            soundEngine.playClick();
            setIsMinimized(false);
          }}
          className="w-11 h-11 bg-[#07090C]/95 border-2 border-[#1E293B] hover:border-[#10B981] flex items-center justify-center text-[#10B981] backdrop-blur-md shadow-xl touch-manipulation active:scale-95"
          title="Open Tactical Radar"
        >
          <Compass className="w-5 h-5 animate-spin-slow" />
        </button>
      ) : (
        <div className="w-[180px] sm:w-[200px] md:w-[210px] bg-[#07090C]/95 border-2 border-[#1E293B] p-1.5 flex gap-1.5 items-center justify-between backdrop-blur-md shadow-2xl relative rounded">
          {/* Radar Canvas */}
          <div className="relative border border-[#1E293B] bg-black">
            <canvas
              ref={canvasRef}
              width={128}
              height={128}
              onClick={handleCanvasInteraction}
              onTouchStart={handleCanvasInteraction}
              className="cursor-crosshair block touch-none"
            />

            {/* Compass Rose Indicator */}
            <div className="absolute top-1 right-1 font-mono text-[8px] text-[#EF4444] font-bold bg-black/60 px-0.5">
              N▲
            </div>

            {/* Minimap minimize button */}
            <button
              id="btn-minimize-radar"
              onClick={() => {
                soundEngine.playClick();
                setIsMinimized(true);
              }}
              className="absolute bottom-1 right-1 bg-black/80 hover:bg-[#1E293B] border border-slate-700 text-[#94A3B8] hover:text-white p-1 transition-colors z-10 rounded-xs"
              title="Minimize Radar"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          </div>

          {/* ---------------- 4 ICONS COLUMN (TOP TO BOTTOM) ---------------- */}
          <div className="flex flex-col gap-1 relative">
            {/* 1. SCAVENGE VIEW TOGGLE (Long press / right-click for filter list) */}
            <div className="relative">
              <button
                id="btn-minimap-scavenge-view"
                onPointerDown={handleScavengePointerDown}
                onPointerUp={handleScavengePointerUp}
                onContextMenu={handleScavengeContextMenu}
                title="Scavenge View (Click to toggle, long-press/right-click to filter loot types)"
                className={`w-7 h-7 sm:w-7 sm:h-7 min-w-[28px] min-h-[28px] flex items-center justify-center border transition-all touch-manipulation active:scale-95 relative ${
                  isScavengeViewActive
                    ? 'bg-[#064E3B] border-[#10B981] text-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.35)]'
                    : 'bg-[#0F141D] hover:bg-[#1A2332] border-[#1E293B] text-[#94A3B8] hover:text-white'
                }`}
              >
                <PackageSearch className="w-3.5 h-3.5" />
                {scavengeFilterType !== 'all' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#F59E0B] rounded-full border border-black" />
                )}
              </button>

              {/* Scavenge Filter Dropdown Popover */}
              {isFilterMenuOpen && (
                <div
                  id="scavenge-filter-popover"
                  className="absolute right-full mr-2 bottom-0 w-64 bg-[#07090C]/98 border-2 border-[#1E293B] shadow-2xl p-2 z-50 text-white backdrop-blur-md animate-fade-in"
                >
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#1E293B]">
                    <div className="flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-[#10B981]" />
                      <span className="font-heading font-black text-xs text-white uppercase tracking-wider">
                        Scavenge Filters
                      </span>
                    </div>
                    <button
                      onClick={() => setIsFilterMenuOpen(false)}
                      className="text-[#94A3B8] hover:text-white p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                    {lootCategories.map((cat) => {
                      const isSelected = scavengeFilterType === cat.id;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => {
                            soundEngine.playClick();
                            onSetScavengeFilter?.(cat.id);
                            setIsFilterMenuOpen(false);
                          }}
                          className={`flex items-center justify-between px-2 py-1.5 text-left border transition-all ${
                            isSelected
                              ? 'bg-[#064E3B]/60 border-[#10B981] text-white'
                              : 'bg-[#0F141D] hover:bg-[#1A2332] border-[#1E293B] text-[#CBD5E1]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span style={{ color: cat.color }}>{cat.icon}</span>
                            <div>
                              <div className="font-mono text-[10px] font-bold leading-tight">{cat.label}</div>
                              <div className="font-mono text-[8px] text-[#94A3B8] leading-tight">{cat.desc}</div>
                            </div>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 2. VIEW LAYERS (Hover / Long-press brings up options menu) */}
            <div
              className="relative"
              onMouseEnter={handleLayersMouseEnter}
              onMouseLeave={handleLayersMouseLeave}
            >
              <button
                id="btn-minimap-view-layers"
                onClick={() => {
                  soundEngine.playClick();
                  setIsLayersMenuOpen((prev) => !prev);
                }}
                title="View Layers (Hover/click for Street Labels, Outlines, Label Detail, HUD toggle)"
                className={`w-7 h-7 sm:w-7 sm:h-7 min-w-[28px] min-h-[28px] flex items-center justify-center border transition-all touch-manipulation active:scale-95 ${
                  isLayersMenuOpen || showStreetLabels
                    ? 'bg-[#1E293B] border-[#E8E8E8] text-[#E8E8E8]'
                    : 'bg-[#0F141D] hover:bg-[#1A2332] border-[#1E293B] text-[#94A3B8] hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
              </button>

              {/* View Layers Dropdown Popover */}
              {isLayersMenuOpen && (
                <div
                  id="view-layers-popover"
                  className="absolute right-full mr-2 bottom-0 w-64 bg-[#07090C]/98 border-2 border-[#1E293B] shadow-2xl p-2.5 z-50 text-white backdrop-blur-md animate-fade-in"
                >
                  <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#1E293B]">
                    <div className="flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-[#10B981]" />
                      <span className="font-heading font-black text-xs text-white uppercase tracking-wider">
                        Tactical View Layers
                      </span>
                    </div>
                    <button
                      onClick={() => setIsLayersMenuOpen(false)}
                      className="text-[#94A3B8] hover:text-white p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {/* Layer 1: Street Name Labels on Map */}
                    <div className="flex items-center justify-between bg-[#0F141D] p-2 border border-[#1E293B]">
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] font-bold text-white">Street Name Labels</span>
                        <span className="font-mono text-[8px] text-[#94A3B8]">Overlay road names in 3D scene</span>
                      </div>
                      <button
                        id="toggle-street-labels"
                        onClick={() => {
                          soundEngine.playClick();
                          onToggleStreetLabels?.();
                        }}
                        className={`px-2 py-1 text-[9px] font-mono font-bold uppercase border transition-all ${
                          showStreetLabels
                            ? 'bg-[#064E3B] border-[#10B981] text-[#10B981]'
                            : 'bg-[#1E293B]/60 border-slate-700 text-[#94A3B8]'
                        }`}
                      >
                        {showStreetLabels ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    {/* Layer 2: Satellite Aerial Imagery Overlay */}
                    <div className="flex items-center justify-between bg-[#0F141D] p-2 border border-[#1E293B]">
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] font-bold text-white">Satellite View Overlay</span>
                        <span className="font-mono text-[8px] text-[#94A3B8]">Real satellite aerial imagery surface</span>
                      </div>
                      <button
                        id="toggle-satellite-overlay"
                        onClick={() => {
                          soundEngine.playClick();
                          onToggleSatelliteOverlay?.();
                        }}
                        className={`px-2 py-1 text-[9px] font-mono font-bold uppercase border transition-all ${
                          showSatelliteOverlay
                            ? 'bg-[#064E3B] border-[#10B981] text-[#10B981]'
                            : 'bg-[#1E293B]/60 border-slate-700 text-[#94A3B8]'
                        }`}
                      >
                        {showSatelliteOverlay ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    {/* Layer 3: Power Grid Overlay */}
                    <div className="flex items-center justify-between bg-[#0F141D] p-2 border border-[#1E293B]">
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] font-bold text-white">Power Grid</span>
                        <span className="font-mono text-[8px] text-[#94A3B8]">Generator radius & powered/shed consumers</span>
                      </div>
                      <button
                        id="toggle-power-grid"
                        onClick={() => {
                          soundEngine.playClick();
                          onTogglePowerGrid?.();
                        }}
                        className={`px-2 py-1 text-[9px] font-mono font-bold uppercase border transition-all ${
                          showPowerGrid
                            ? 'bg-[#7C2D12] border-[#F59E0B] text-[#FBBF24]'
                            : 'bg-[#1E293B]/60 border-slate-700 text-[#94A3B8]'
                        }`}
                      >
                        {showPowerGrid ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    {/* Satellite imagery quality tier (persisted in the save) */}
                    <div className="flex flex-col gap-1.5 bg-[#0F141D] p-2 border border-[#1E293B]">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-mono text-[10px] font-bold text-white">Imagery Quality</span>
                          <span className="font-mono text-[8px] text-[#94A3B8]">Canvas resolution & tile budget (saved with expedition)</span>
                        </div>
                        <div className="flex gap-1">
                          {(['performance', 'balanced', 'detail'] as const).map((q) => (
                            <button
                              key={q}
                              onClick={() => {
                                soundEngine.playClick();
                                onSatelliteQualityChange?.(q);
                              }}
                              className={`px-2 py-1 text-[9px] font-mono font-bold uppercase border transition-all ${
                                satelliteQuality === q
                                  ? 'bg-[#064E3B] border-[#10B981] text-[#10B981]'
                                  : 'bg-[#1E293B]/60 border-slate-700 text-[#94A3B8]'
                              }`}
                            >
                              {q === 'performance' ? 'LOW' : q === 'balanced' ? 'MED' : 'HIGH'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* VRAM cost per tier (active tier highlighted) */}
                      <div className="flex items-center justify-between border-t border-[#1E293B] pt-1.5">
                        <span className="font-mono text-[8px] text-[#64748B]">VRAM cost</span>
                        <div className="flex gap-1.5">
                          {(['performance', 'balanced', 'detail'] as const).map((q) => (
                            <span
                              key={q}
                              className={`font-mono text-[8px] font-bold ${
                                satelliteQuality === q ? 'text-[#4BEFA8]' : 'text-[#64748B]'
                              }`}
                            >
                              {formatVram(vramBytes(q))}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Layer 3: Bodies of Water & Green Areas */}
                    <div className="flex items-center justify-between bg-[#0F141D] p-2 border border-[#1E293B]">
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] font-bold text-white">Water & Green Areas</span>
                        <span className="font-mono text-[8px] text-[#94A3B8]">Lakes, rivers, parks & forests</span>
                      </div>
                      <button
                        id="toggle-landuse-areas"
                        onClick={() => {
                          soundEngine.playClick();
                          onToggleLanduse?.();
                        }}
                        className={`px-2 py-1 text-[9px] font-mono font-bold uppercase border transition-all ${
                          showLanduse
                            ? 'bg-[#064E3B] border-[#10B981] text-[#10B981]'
                            : 'bg-[#1E293B]/60 border-slate-700 text-[#94A3B8]'
                        }`}
                      >
                        {showLanduse ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    {/* Layer 4: Structure Outlines */}
                    <div className="flex items-center justify-between bg-[#0F141D] p-2 border border-[#1E293B]">
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] font-bold text-white">Structure Outlines</span>
                        <span className="font-mono text-[8px] text-[#94A3B8]">High-contrast building edge lines</span>
                      </div>
                      <button
                        id="toggle-structure-outlines"
                        onClick={() => {
                          soundEngine.playClick();
                          onToggleStructureOutlines?.();
                        }}
                        className={`px-2 py-1 text-[9px] font-mono font-bold uppercase border transition-all ${
                          showStructureOutlines
                            ? 'bg-[#064E3B] border-[#10B981] text-[#10B981]'
                            : 'bg-[#1E293B]/60 border-slate-700 text-[#94A3B8]'
                        }`}
                      >
                        {showStructureOutlines ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    {/* Layer 3: Object Label Info (Detailed vs Minimal) */}
                    <div className="flex items-center justify-between bg-[#0F141D] p-2 border border-[#1E293B]">
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] font-bold text-white">Object Label Detail</span>
                        <span className="font-mono text-[8px] text-[#94A3B8]">Squads, vehicles, construction</span>
                      </div>
                      <button
                        id="toggle-label-detail-mode"
                        onClick={() => {
                          soundEngine.playClick();
                          onToggleLabelDetailMode?.();
                        }}
                        className="px-2 py-1 text-[9px] font-mono font-bold uppercase border bg-[#1E293B] border-[#E8E8E8] text-[#E8E8E8] hover:bg-[#334155] transition-all"
                      >
                        {labelDetailMode === 'detailed' ? 'DETAILED' : 'MINIMAL'}
                      </button>
                    </div>

                    {/* Layer 4: Toggle UI On/Off (Cinematic Tactical Mode) */}
                    <div className="flex items-center justify-between bg-[#0F141D] p-2 border border-[#1E293B]">
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] font-bold text-[#E8E8E8]">Hide Tactical UI</span>
                        <span className="font-mono text-[8px] text-[#94A3B8]">Leaves restore button on screen</span>
                      </div>
                      <button
                        id="toggle-hide-ui"
                        onClick={() => {
                          soundEngine.playClick();
                          setIsLayersMenuOpen(false);
                          onToggleHideUi?.();
                        }}
                        className="px-2 py-1 text-[9px] font-mono font-bold uppercase border border-[#EF4444] bg-[#7F1D1D]/40 text-[#EF4444] hover:bg-[#EF4444] hover:text-white flex items-center gap-1 transition-all"
                      >
                        <EyeOff className="w-2.5 h-2.5" /> HIDE HUD
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. EXPEDITION VIEW (Zoom out to 2D top-down street map view) */}
            <button
              id="btn-minimap-expedition-view"
              onClick={() => {
                soundEngine.playClick();
                onToggleExpeditionView?.();
              }}
              title="Expedition View (Toggle 2D Top-Down Strategic Map / 3D Isometric View)"
              className={`w-7 h-7 sm:w-7 sm:h-7 min-w-[28px] min-h-[28px] flex items-center justify-center border transition-all touch-manipulation active:scale-95 ${
                isExpeditionViewActive
                  ? 'bg-[#064E3B]/80 border-[#10B981] text-white shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                  : 'bg-[#0F141D] hover:bg-[#1A2332] border-[#1E293B] text-[#94A3B8] hover:text-white'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
            </button>

            {/* 4. FACE NORTH BUTTON */}
            <button
              id="btn-minimap-reset-north"
              onClick={() => {
                soundEngine.playClick();
                onResetNorth?.();
              }}
              title="Reset North Orientation"
              className="w-7 h-7 sm:w-7 sm:h-7 min-w-[28px] min-h-[28px] bg-[#0F141D] hover:bg-[#1A2332] border border-[#1E293B] hover:border-slate-500 flex flex-col items-center justify-center text-[#94A3B8] hover:text-white transition-all text-[8px] font-mono touch-manipulation active:scale-95"
            >
              <span className="text-[#EF4444] text-[7px] leading-none">▲</span>
              <span className="leading-none text-[8px] font-bold">N</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
