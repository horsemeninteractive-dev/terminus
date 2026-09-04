import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Building,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Crosshair,
  Droplet,
  Globe,
  HelpCircle,
  Info,
  Layers,
  MapPin,
  Maximize2,
  Minus,
  Move,
  Navigation,
  Plus,
  Radio,
  RotateCcw,
  Shield,
  Thermometer,
  Trees,
  Truck,
  Wind,
  Zap,
} from 'lucide-react';
import { IFZ_IMAGES } from '../assets/images';
import { GeoPoint, MapData, Point2D, SettlementPlacement, ZoneGridSize } from '../types/map';
import { fetchFromOverpass } from '../services/osmFetcher';
import { cropMapDataToGrid, processOsmData } from '../services/mapProcessor';
import { fetchElevationGrid } from '../services/elevationService';
import { getBundledMapData } from '../services/bundledMapData';

interface StreetViewSelectorProps {
  selectedLocation: GeoPoint;
  cityName: string;
  countryName?: string;
  onBackToGlobe: () => void;
  onContinue: (placement: SettlementPlacement, mapData?: MapData | null) => void;
}

interface StreetMapFeatures {
  roads: Array<{ name?: string; type: string; points: Point2D[]; width: number }>;
  waterways: Array<{ points: Point2D[]; width: number; name?: string }>;
  forests: Array<{ polygon: Point2D[]; name?: string }>;
  buildings: Array<{ polygon: Point2D[]; center: Point2D; type: string; levels: number }>;
}

// World-space width of one tactical grid tile in meters (300m × 300m = 9 hectares per sector tile).
const TILE_METERS = 300;

// Convert a processed MapData into 2D street-map features.
function toStreetFeatures(md: MapData): StreetMapFeatures {
  return {
    roads: md.roads.map((r) => ({
      name: r.name,
      type: r.highwayType,
      points: r.points,
      width: r.width,
    })),
    waterways: md.landuse
      .filter((l) => l.type === 'water')
      .map((w) => ({ points: w.polygon, width: 22, name: w.name })),
    forests: md.landuse
      .filter((l) => l.type === 'forest' || l.type === 'park' || l.type === 'grass')
      .map((f) => ({ polygon: f.polygon, name: f.name })),
    buildings: md.buildings.map((b) => ({
      polygon: b.polygon,
      center: b.center,
      type: b.type,
      levels: b.levels,
    })),
  };
}

// Fallback flat elevation grid used when the Open-Meteo DEM call fails
function flatElevationGrid(): {
  minElevation: number;
  maxElevation: number;
  baseElevation: number;
  resolution: number;
  grid: number[][];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
} {
  const n = 16;
  return {
    minElevation: 0,
    maxElevation: 0,
    baseElevation: 0,
    resolution: n,
    grid: Array.from({ length: n }, () => Array(n).fill(0)),
    bounds: { minX: -1800, maxX: 1800, minZ: -1800, maxZ: 1800 },
  };
}

export const StreetViewSelector: React.FC<StreetViewSelectorProps> = ({
  selectedLocation,
  cityName,
  countryName = 'Earth Zone',
  onBackToGlobe,
  onContinue,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Tactical HUD options
  const [highlightPlayableTiles, setHighlightPlayableTiles] = useState<boolean>(true);
  const [mapSize, setMapSize] = useState<string>('5x5');
  const [expeditionSize, setExpeditionSize] = useState<string>('15x15');
  const [telemetryCollapsed, setTelemetryCollapsed] = useState<boolean>(false);

  // Manual grid placement offset (in meters from city center)
  const [gridOffsetMeters, setGridOffsetMeters] = useState<Point2D>({ x: 0, z: 0 });

  // Camera viewport pan and zoom on the 2D street map canvas
  const [viewPan, setViewPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [viewZoom, setViewZoom] = useState<number>(0.35); // meters to pixels scale

  // Dragging state for the manual grid vs panning the map
  const [isDraggingGrid, setIsDraggingGrid] = useState<boolean>(false);
  const [isPanningMap, setIsPanningMap] = useState<boolean>(false);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startOffsetX: number;
    startOffsetZ: number;
    startPanX: number;
    startPanY: number;
    initialPinchDistance?: number;
    initialPinchZoom?: number;
  }>({
    clientX: 0,
    clientY: 0,
    startOffsetX: 0,
    startOffsetZ: 0,
    startPanX: 0,
    startPanY: 0,
  });

  // Street map vector geometries
  const [mapFeatures, setMapFeatures] = useState<StreetMapFeatures | null>(null);
  const [loadedMapData, setLoadedMapData] = useState<MapData | null>(null);
  const [isLoadingMap, setIsLoadingMap] = useState<boolean>(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  // Live telemetry counts based on grid position
  const [telemetry, setTelemetry] = useState({
    allBuildings: 0,
    centralTileBuildings: 0,
    elevation: '-',
    forest: '-',
    water: '-',
    poi: 0,
    roads: '-',
    temperature: '-',
    expeditions: 0,
    vehicles: 0,
  });

  // Fetch real city vector street map data from Overpass / bundled cache
  useEffect(() => {
    let isCancelled = false;

    setIsLoadingMap(true);
    setMapError(null);
    setMapFeatures(null);
    setLoadedMapData(null);

    const loadRealCityMap = async () => {
      try {
        const bundled = await getBundledMapData(selectedLocation.lat, selectedLocation.lon);
        if (isCancelled) return;
        if (bundled) {
          setLoadedMapData(bundled);
          setMapFeatures(toStreetFeatures(bundled));
          return;
        }

        const rawOsm = await fetchFromOverpass(selectedLocation, 4000);
        if (isCancelled) return;

        let elevation = null;
        try {
          elevation = await fetchElevationGrid(selectedLocation, 4000, 16);
        } catch {
          elevation = null;
        }
        if (isCancelled) return;

        const processed = processOsmData(
          rawOsm,
          selectedLocation,
          4000,
          'Live Overpass + Open-Meteo DEM',
          elevation || flatElevationGrid()
        );
        if (isCancelled) return;

        if (processed.buildings.length === 0 && processed.roads.length === 0) {
          setMapError('No streets or buildings were found around this location.');
        } else {
          setLoadedMapData(processed);
          setMapFeatures(toStreetFeatures(processed));
        }
      } catch (err: any) {
        if (!isCancelled) {
          const msg =
            err instanceof Error && err.message
              ? err.message
              : 'The OpenStreetMap server could not be reached.';
          setMapError(msg);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingMap(false);
        }
      }
    };

    loadRealCityMap();

    return () => {
      isCancelled = true;
    };
  }, [selectedLocation.lat, selectedLocation.lon, cityName, reloadKey]);

  const handleRetryMapLoad = () => setReloadKey((k) => k + 1);

  // Recalculate dynamic telemetry
  useEffect(() => {
    if (!mapFeatures) return;

    const dim = mapSize === '3x3' ? 3 : mapSize === '7x7' ? 7 : mapSize === '9x9' ? 9 : 5;
    const expeditionDim = expeditionSize === '9x9' ? 9 : expeditionSize === '21x21' ? 21 : 15;
    const centralTileHalfMeters = TILE_METERS / 2;
    const totalExpeditionRadiusMeters = (expeditionDim * TILE_METERS) / 2;

    let centralCount = 0;
    let totalInZone = 0;

    mapFeatures.buildings.forEach((b) => {
      const dx = b.center.x - gridOffsetMeters.x;
      const dz = b.center.z - gridOffsetMeters.z;

      if (Math.abs(dx) < centralTileHalfMeters && Math.abs(dz) < centralTileHalfMeters) {
        centralCount++;
      }
      if (Math.abs(dx) < totalExpeditionRadiusMeters && Math.abs(dz) < totalExpeditionRadiusMeters) {
        totalInZone++;
      }
    });

    setTelemetry({
      allBuildings: totalInZone,
      centralTileBuildings: centralCount,
      elevation: Math.abs(selectedLocation.lat) > 45 ? 'HILLY (+45m)' : 'FLAT',
      forest: mapFeatures.forests.length > 3 ? 'MODERATE' : mapFeatures.forests.length > 0 ? 'LOW' : 'VERY LOW',
      water: mapFeatures.waterways.length > 0 ? 'HIGH (RIVER LOOP)' : 'LOW',
      poi: Math.round(totalInZone * 0.03),
      roads: mapFeatures.roads.length > 50 ? 'HIGH' : mapFeatures.roads.length > 15 ? 'MEDIUM' : 'LOW',
      temperature: selectedLocation.lat > 50 ? 'COLD (8°C)' : selectedLocation.lat < 25 ? 'WARM (26°C)' : 'MODERATE (16°C)',
      expeditions: expeditionDim * expeditionDim,
      vehicles: Math.max(8, Math.round(totalInZone * 0.015)),
    });
  }, [gridOffsetMeters, mapSize, expeditionSize, mapFeatures, selectedLocation.lat]);

  // Convert Grid dimensions for CSS positioning
  const dim = mapSize === '3x3' ? 3 : mapSize === '7x7' ? 7 : mapSize === '9x9' ? 9 : 5;
  const expeditionDim = expeditionSize === '9x9' ? 9 : expeditionSize === '21x21' ? 21 : 15;
  const tilePx = TILE_METERS * viewZoom;
  const fullGridPx = dim * tilePx;
  const expeditionPx = expeditionDim * tilePx;

  // Screen coordinates of the grid center
  const gridScreenX = typeof window !== 'undefined' ? window.innerWidth / 2 + viewPan.x + gridOffsetMeters.x * viewZoom : 0;
  const gridScreenY = typeof window !== 'undefined' ? window.innerHeight / 2 + viewPan.y + gridOffsetMeters.z * viewZoom : 0;

  // Render the high-resolution vector Street Map on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);

    ctx.fillStyle = '#06131c';
    ctx.fillRect(0, 0, width, height);

    const originX = width / 2 + viewPan.x;
    const originY = height / 2 + viewPan.y;
    const scale = viewZoom;

    const toScreen = (pt: Point2D): { x: number; y: number } => ({
      x: originX + pt.x * scale,
      y: originY + pt.z * scale,
    });

    if (!mapFeatures) return;

    // 1. Waterways
    mapFeatures.waterways.forEach((w) => {
      if (w.points.length < 2) return;
      ctx.beginPath();
      const p0 = toScreen(w.points[0]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < w.points.length; i++) {
        const pt = toScreen(w.points[i]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = '#135c75';
      ctx.lineWidth = Math.max(12, w.width * scale * 1.5);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.strokeStyle = '#228ba8';
      ctx.lineWidth = Math.max(4, (w.width * scale * 1.5) / 3);
      ctx.stroke();
    });

    // 2. Forests & Parks
    mapFeatures.forests.forEach((f) => {
      if (f.polygon.length < 3) return;
      ctx.beginPath();
      const p0 = toScreen(f.polygon[0]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < f.polygon.length; i++) {
        const pt = toScreen(f.polygon[i]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(11, 41, 34, 0.85)';
      ctx.fill();
      ctx.strokeStyle = '#124538';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // 3. Building Footprint Polygons
    mapFeatures.buildings.forEach((b) => {
      if (b.polygon.length < 3) return;
      ctx.beginPath();
      const p0 = toScreen(b.polygon[0]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < b.polygon.length; i++) {
        const pt = toScreen(b.polygon[i]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fillStyle = b.type === 'hospital' ? '#152e3d' : '#0a1d27';
      ctx.fill();
      ctx.strokeStyle = '#183b4e';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // 4. Street Network
    mapFeatures.roads.forEach((r) => {
      if (r.points.length < 2) return;
      ctx.beginPath();
      const p0 = toScreen(r.points[0]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < r.points.length; i++) {
        const pt = toScreen(r.points[i]);
        ctx.lineTo(pt.x, pt.y);
      }

      const isPrimary = r.type === 'primary' || r.type === 'trunk' || r.type === 'motorway';
      ctx.strokeStyle = isPrimary ? '#266f85' : '#144654';
      ctx.lineWidth = Math.max(1.5, (isPrimary ? 4.5 : 2.5) * scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    });

    // Render street text names
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#458196';
    mapFeatures.roads.forEach((r, idx) => {
      if (r.name && r.points.length >= 2 && idx % 3 === 0) {
        const midIdx = Math.floor(r.points.length / 2);
        const pA = toScreen(r.points[Math.max(0, midIdx - 1)]);
        const pB = toScreen(r.points[midIdx]);
        const midX = (pA.x + pB.x) / 2;
        const midY = (pA.y + pB.y) / 2;
        const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);

        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(angle);
        ctx.fillText(r.name.toUpperCase(), -ctx.measureText(r.name.toUpperCase()).width / 2, -3);
        ctx.restore();
      }
    });
  }, [mapFeatures, viewPan, viewZoom]);

  // ==========================================
  // Mouse and Touch Drag / Pan Handlers
  // ==========================================

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startOffsetX: gridOffsetMeters.x,
      startOffsetZ: gridOffsetMeters.z,
      startPanX: viewPan.x,
      startPanY: viewPan.y,
    };

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const gScreenX = rect.width / 2 + viewPan.x + gridOffsetMeters.x * viewZoom;
    const gScreenY = rect.height / 2 + viewPan.y + gridOffsetMeters.z * viewZoom;

    // Check if clicked near grid center or within grid bounds
    const gridRadiusPx = Math.max(140, fullGridPx / 2);
    if (Math.hypot(clickX - gScreenX, clickY - gScreenY) < gridRadiusPx) {
      setIsDraggingGrid(true);
    } else {
      setIsPanningMap(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const deltaX = e.clientX - dragStartRef.current.clientX;
    const deltaY = e.clientY - dragStartRef.current.clientY;

    if (isDraggingGrid) {
      const meterDeltaX = deltaX / viewZoom;
      const meterDeltaZ = deltaY / viewZoom;
      setGridOffsetMeters({
        x: Math.round(dragStartRef.current.startOffsetX + meterDeltaX),
        z: Math.round(dragStartRef.current.startOffsetZ + meterDeltaZ),
      });
    } else if (isPanningMap) {
      setViewPan({
        x: dragStartRef.current.startPanX + deltaX,
        y: dragStartRef.current.startPanY + deltaY,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDraggingGrid(false);
    setIsPanningMap(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
    setViewZoom((prev) => Math.max(0.35, Math.min(2.4, prev * zoomDelta)));
  };

  // --- TOUCH HANDLERS (for smartphones, tablets, and touch displays) ---
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      dragStartRef.current = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        startOffsetX: gridOffsetMeters.x,
        startOffsetZ: gridOffsetMeters.z,
        startPanX: viewPan.x,
        startPanY: viewPan.y,
      };

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const touchX = touch.clientX - rect.left;
      const touchY = touch.clientY - rect.top;

      const gScreenX = rect.width / 2 + viewPan.x + gridOffsetMeters.x * viewZoom;
      const gScreenY = rect.height / 2 + viewPan.y + gridOffsetMeters.z * viewZoom;

      const gridRadiusPx = Math.max(150, fullGridPx / 2 + 20);
      if (Math.hypot(touchX - gScreenX, touchY - gScreenY) < gridRadiusPx) {
        setIsDraggingGrid(true);
      } else {
        setIsPanningMap(true);
      }
    } else if (e.touches.length === 2) {
      // Pinch gesture
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      dragStartRef.current.initialPinchDistance = dist;
      dragStartRef.current.initialPinchZoom = viewZoom;
      setIsDraggingGrid(false);
      setIsPanningMap(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - dragStartRef.current.clientX;
      const deltaY = touch.clientY - dragStartRef.current.clientY;

      if (isDraggingGrid) {
        const meterDeltaX = deltaX / viewZoom;
        const meterDeltaZ = deltaY / viewZoom;
        setGridOffsetMeters({
          x: Math.round(dragStartRef.current.startOffsetX + meterDeltaX),
          z: Math.round(dragStartRef.current.startOffsetZ + meterDeltaZ),
        });
      } else if (isPanningMap) {
        setViewPan({
          x: dragStartRef.current.startPanX + deltaX,
          y: dragStartRef.current.startPanY + deltaY,
        });
      }
    } else if (e.touches.length === 2 && dragStartRef.current.initialPinchDistance) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = currentDist / dragStartRef.current.initialPinchDistance;
      const baseZoom = dragStartRef.current.initialPinchZoom || viewZoom;
      setViewZoom(Math.max(0.35, Math.min(2.4, baseZoom * ratio)));
    }
  };

  const handleTouchEnd = () => {
    setIsDraggingGrid(false);
    setIsPanningMap(false);
    dragStartRef.current.initialPinchDistance = undefined;
  };

  // Nudge the grid in world meters (tactical precision buttons)
  const handleNudgeGrid = (dx: number, dz: number) => {
    setGridOffsetMeters((prev) => ({
      x: prev.x + dx,
      z: prev.z + dz,
    }));
  };

  const handleResetGridCenter = () => {
    setGridOffsetMeters({ x: 0, z: 0 });
    setViewPan({ x: 0, y: 0 });
  };

  const handleConfirmPlacement = () => {
    const halfDimMeters = (dim * TILE_METERS) / 2;
    // Retain the full expedition survey perimeter (e.g. 15x15 or 21x21 tiles, 4.5km - 6.3km)
    // rather than discarding all outer buildings beyond the immediate starting colony core.
    // This ensures roads outside the central tile retain all their real buildings for expeditions.
    const expeditionHalfMeters = Math.max((expeditionDim * TILE_METERS) / 2, 2250);
    const expeditionBounds = {
      minX: gridOffsetMeters.x - expeditionHalfMeters,
      maxX: gridOffsetMeters.x + expeditionHalfMeters,
      minZ: gridOffsetMeters.z - expeditionHalfMeters,
      maxZ: gridOffsetMeters.z + expeditionHalfMeters,
    };

    const preservedMap = loadedMapData ? cropMapDataToGrid(loadedMapData, expeditionBounds) : null;

    const finalPlacement: SettlementPlacement = {
      center: selectedLocation,
      zoneSize: mapSize === '3x3' ? '3x3' : mapSize === '7x7' ? '7x7' : mapSize === '9x9' ? '9x9' : mapSize === '5x5' ? '5x5' : '4x4',
      radius: halfDimMeters,
      offsetMeters: gridOffsetMeters,
      rotationDeg: 0,
      sectorName: cityName,
      country: countryName,
      locationDetails: `Starting Sector at ${cityName} with ${preservedMap?.buildings.length ?? telemetry.allBuildings} buildings`,
    };
    onContinue(finalPlacement, preservedMap);
  };

  return (
    <div
      id="street-view-selector-screen"
      className="relative w-screen h-screen bg-[#06131c] overflow-hidden select-none font-tactical text-[#E8E8E8] touch-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* 1. Fullscreen Vector Street Map Canvas */}
      <canvas
        ref={canvasRef}
        id="street-view-canvas"
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      />

      {/* 2. Interactive Draggable Starting Grid Overlay (real N×N tiles + dashed expedition perimeter) */}
      <div
        id="street-view-tactical-grid-overlay"
        className="absolute pointer-events-auto cursor-move transition-transform duration-75 touch-none"
        style={{
          left: `${gridScreenX}px`,
          top: `${gridScreenY}px`,
          transform: 'translate(-50%, -50%)',
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          dragStartRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            startOffsetX: gridOffsetMeters.x,
            startOffsetZ: gridOffsetMeters.z,
            startPanX: viewPan.x,
            startPanY: viewPan.y,
          };
          setIsDraggingGrid(true);
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          if (e.touches.length === 1) {
            const touch = e.touches[0];
            dragStartRef.current = {
              clientX: touch.clientX,
              clientY: touch.clientY,
              startOffsetX: gridOffsetMeters.x,
              startOffsetZ: gridOffsetMeters.z,
              startPanX: viewPan.x,
              startPanY: viewPan.y,
            };
            setIsDraggingGrid(true);
          }
        }}
      >
        {/* Dashed Expedition Perimeter (EXPEDITION SIZE) */}
        <div
          className="absolute border-2 border-dashed border-[#10B981]/60 pointer-events-none transition-all duration-200"
          style={{
            width: `${expeditionPx}px`,
            height: `${expeditionPx}px`,
            left: `${-expeditionPx / 2}px`,
            top: `${-expeditionPx / 2}px`,
          }}
        >
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-tech uppercase tracking-wider text-[#10B981]/70 bg-black/75 px-1.5 py-0.5 border border-[#10B981]/30 whitespace-nowrap pointer-events-none">
            EXPEDITION {expeditionDim}x{expeditionDim}
          </span>
        </div>

        {/* Real N×N Playable Tile Grid (MAP SIZE) */}
        <div
          className="absolute pointer-events-none transition-all duration-200"
          style={{
            width: `${fullGridPx}px`,
            height: `${fullGridPx}px`,
            left: `${-fullGridPx / 2}px`,
            top: `${-fullGridPx / 2}px`,
            display: 'grid',
            gridTemplateColumns: `repeat(${dim}, 1fr)`,
            gridTemplateRows: `repeat(${dim}, 1fr)`,
          }}
        >
          {Array.from({ length: dim * dim }).map((_, i) => {
            const row = Math.floor(i / dim);
            const col = i % dim;
            const isCentral = row === Math.floor(dim / 2) && col === Math.floor(dim / 2);
            return (
              <div
                key={i}
                className={`relative ${
                  isCentral
                    ? highlightPlayableTiles
                      ? 'border border-[#10B981] bg-[#10B981]/25 z-10'
                      : 'border border-[#10B981]/70 z-10'
                    : 'border border-[#10B981]/30'
                }`}
              >
                {isCentral && (
                  <>
                    {/* Tactical Corner Brackets */}
                    <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#10B981]" />
                    <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#10B981]" />
                    <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#10B981]" />
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#10B981]" />

                    {/* Tactical Center Reticle and Label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <div className="text-center space-y-0.5 bg-[#0E1013]/90 px-2 py-0.5 border border-[#10B981]/60 clip-tactical-bracket surface-bevel">
                        <div className="text-[8px] font-heading font-black text-[#8C9BAE] uppercase tracking-wider">
                          SELECTED AREA:
                        </div>
                        <div className="text-[10px] font-display font-black text-[#10B981] uppercase tracking-widest">
                          {cityName}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Drag handle hint */}
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[9px] text-[#10B981]/90 font-tech uppercase tracking-wider bg-black/80 px-2 py-0.5 border border-[#10B981]/40 whitespace-nowrap pointer-events-none shadow-md">
          <Move className="w-2.5 h-2.5 animate-pulse" />
          <span>DRAG GRID OR TOUCH TO MOVE</span>
        </div>
      </div>

      {/* Loading overlay while real OSM data is being fetched */}
      {isLoadingMap && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#06131c]/85 backdrop-blur-sm pointer-events-auto">
          <Compass className="w-10 h-10 text-[#10B981] animate-spin" />
          <div className="text-sm font-heading font-black uppercase tracking-widest text-[#E8E8E8]">
            FETCHING REAL MAP DATA FOR {cityName.toUpperCase()}...
          </div>
          <div className="text-[11px] font-tech text-[#8C9BAE] max-w-md text-center">
            Downloading streets, buildings and terrain from OpenStreetMap (Overpass API).
          </div>
        </div>
      )}

      {/* Error state */}
      {mapError && !isLoadingMap && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#06131c]/92 backdrop-blur-sm pointer-events-auto px-6 text-center">
          <AlertTriangle className="w-10 h-10 text-[#B31217]" />
          <div className="text-sm font-heading font-black uppercase tracking-widest text-[#B31217]">
            UNABLE TO LOAD REAL MAP DATA
          </div>
          <div className="text-[11px] font-tech text-[#8C9BAE] max-w-md">
            The live OpenStreetMap fetch failed for {cityName}.{' '}
            <span className="text-white">{mapError}</span>
          </div>
          <div className="text-[11px] font-tech text-[#8C9BAE] max-w-md">
            This screen requires an internet connection to the Overpass API to show the real map of this location.
          </div>
          <div className="flex gap-3 mt-2">
            <button
              onClick={handleRetryMapLoad}
              className="px-6 py-2 bg-[#B31217] hover:bg-[#EF4444] border border-[#EF4444] text-white text-xs font-heading uppercase tracking-wider transition-colors clip-tactical-bracket surface-bevel"
            >
              RETRY FETCH
            </button>
            <button
              onClick={onBackToGlobe}
              className="px-6 py-2 bg-[#14171C] hover:bg-[#1A2634] border border-[#262F3D] text-[#E8E8E8] hover:text-white text-xs font-heading uppercase tracking-wider transition-colors clip-tactical-bracket"
            >
              BACK TO GLOBE
            </button>
          </div>
        </div>
      )}

      {/* 3. Top Left Controls (Highlight Tiles, Map Size, Expedition Size) */}
      <div className="absolute top-3 left-3 sm:top-6 sm:left-6 z-20 pointer-events-auto space-y-1.5 sm:space-y-3 max-w-[calc(100vw-132px)] sm:max-w-none">
        {/* Highlight Playable Tiles Checkbox */}
        <label className="flex items-center gap-2 cursor-pointer text-[#10B981] font-heading font-bold text-[10px] sm:text-xs tracking-wider bg-[#0E1013]/95 border border-[#10B981]/50 px-2.5 sm:px-3.5 py-1 sm:py-2 clip-tactical-bracket surface-bevel backdrop-blur-md hover:border-[#10B981] transition-colors">
          <input
            type="checkbox"
            checked={highlightPlayableTiles}
            onChange={(e) => setHighlightPlayableTiles(e.target.checked)}
            className="accent-[#10B981] w-3.5 h-3.5 sm:w-4 sm:h-4 cursor-pointer"
          />
          <span className="truncate">HIGHLIGHT PLAYABLE TILES</span>
        </label>

        {/* Map Size and Expedition Size Selectors */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
          <div className="flex items-center gap-1 sm:gap-2 bg-[#0E1013]/95 border border-[#262F3D] px-2 sm:px-3 py-0.5 sm:py-1.5 clip-tactical-bracket surface-bevel backdrop-blur-md">
            <span className="text-[#10B981] font-heading font-bold text-[9px] sm:text-xs tracking-wider">MAP SIZE</span>
            <select
              value={mapSize}
              onChange={(e) => setMapSize(e.target.value)}
              className="bg-[#14171C] border border-[#10B981]/50 text-white font-tech font-bold text-[9px] sm:text-xs px-1.5 py-0.5 sm:px-2.5 sm:py-1 outline-none focus:border-[#10B981] cursor-pointer clip-card-chip"
            >
              <option value="3x3">3x3</option>
              <option value="5x5">5x5</option>
              <option value="7x7">7x7</option>
              <option value="9x9">9x9</option>
            </select>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 bg-[#0E1013]/95 border border-[#262F3D] px-2 sm:px-3 py-0.5 sm:py-1.5 clip-tactical-bracket surface-bevel backdrop-blur-md">
            <span className="text-[#10B981] font-heading font-bold text-[9px] sm:text-xs tracking-wider">EXPEDITION</span>
            <select
              value={expeditionSize}
              onChange={(e) => setExpeditionSize(e.target.value)}
              className="bg-[#14171C] border border-[#10B981]/50 text-white font-tech font-bold text-[9px] sm:text-xs px-1.5 py-0.5 sm:px-2.5 sm:py-1 outline-none focus:border-[#10B981] cursor-pointer clip-card-chip"
            >
              <option value="9x9">9x9</option>
              <option value="15x15">15x15</option>
              <option value="21x21">21x21</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Top Center Title Header */}
      <div className="hidden md:block absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <div className="bg-[#0E1013]/95 border-2 border-[#10B981] text-[#10B981] font-display font-black text-sm sm:text-base px-8 py-2 tracking-widest clip-tactical-bracket backdrop-blur-md surface-bevel">
          SELECT STARTING AREA
        </div>
      </div>

      {/* 5. Precision Grid Mover & D-Pad: Top Right on Mobile, Bottom-Left on Desktop */}
      <div className="absolute top-3 right-3 sm:top-6 sm:right-6 md:top-auto md:bottom-24 md:left-6 md:right-auto z-20 pointer-events-auto flex flex-col gap-1 bg-[#0E1013]/95 border border-[#262F3D] p-1.5 sm:p-2 clip-tactical-bracket backdrop-blur-md shadow-2xl">
        <div className="text-[7.5px] sm:text-[8px] font-heading font-bold text-[#10B981] uppercase tracking-wider text-center border-b border-[#262F3D] pb-0.5">
          GRID POSITION
        </div>
        <div className="grid grid-cols-3 gap-0.5 sm:gap-1 w-24 sm:w-28">
          <div />
          <button
            id="nudge-north-btn"
            onClick={() => handleNudgeGrid(0, -150)}
            title="Nudge Grid North (Up)"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-[#14171C] hover:bg-[#10B981]/20 active:bg-[#10B981]/40 border border-[#262F3D] hover:border-[#10B981] flex items-center justify-center text-slate-200 transition-colors mx-auto"
          >
            <ArrowUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#10B981]" />
          </button>
          <div />

          <button
            id="nudge-west-btn"
            onClick={() => handleNudgeGrid(-150, 0)}
            title="Nudge Grid West (Left)"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-[#14171C] hover:bg-[#10B981]/20 active:bg-[#10B981]/40 border border-[#262F3D] hover:border-[#10B981] flex items-center justify-center text-slate-200 transition-colors mx-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#10B981]" />
          </button>
          <button
            id="nudge-center-btn"
            onClick={handleResetGridCenter}
            title="Reset Grid to Center"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-[#10B981]/15 hover:bg-[#10B981]/30 active:bg-[#10B981]/50 border border-[#10B981]/60 flex items-center justify-center text-[#10B981] transition-colors mx-auto text-[9px] font-bold"
          >
            <Crosshair className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            id="nudge-east-btn"
            onClick={() => handleNudgeGrid(150, 0)}
            title="Nudge Grid East (Right)"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-[#14171C] hover:bg-[#10B981]/20 active:bg-[#10B981]/40 border border-[#262F3D] hover:border-[#10B981] flex items-center justify-center text-slate-200 transition-colors mx-auto"
          >
            <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#10B981]" />
          </button>

          <div />
          <button
            id="nudge-south-btn"
            onClick={() => handleNudgeGrid(0, 150)}
            title="Nudge Grid South (Down)"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-[#14171C] hover:bg-[#10B981]/20 active:bg-[#10B981]/40 border border-[#262F3D] hover:border-[#10B981] flex items-center justify-center text-slate-200 transition-colors mx-auto"
          >
            <ArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#10B981]" />
          </button>
          <div />
        </div>

        {/* Zoom In / Out Touch Buttons */}
        <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#262F3D]">
          <button
            onClick={() => setViewZoom((prev) => Math.min(2.0, prev * 1.2))}
            title="Zoom In"
            className="flex-1 py-0.5 sm:py-1 bg-[#14171C] hover:bg-[#10B981]/20 border border-[#262F3D] flex items-center justify-center text-[#10B981] rounded text-[11px] sm:text-xs font-bold"
          >
            <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
          <button
            onClick={() => setViewZoom((prev) => Math.max(0.12, prev * 0.8))}
            title="Zoom Out"
            className="flex-1 py-0.5 sm:py-1 bg-[#14171C] hover:bg-[#10B981]/20 border border-[#262F3D] flex items-center justify-center text-[#10B981] rounded text-[11px] sm:text-xs font-bold"
          >
            <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>
      </div>

      {/* 6. Telemetry Info Panel: Sits directly above Back/Next buttons on mobile, Right Sidebar on Desktop */}
      <div
        className={`absolute left-3 right-3 sm:left-4 sm:right-4 md:left-auto md:right-6 ${
          telemetryCollapsed
            ? 'bottom-16 sm:bottom-20 md:top-6 md:bottom-auto md:w-80'
            : 'bottom-16 sm:bottom-20 md:bottom-6 md:top-6 md:w-80 lg:w-92 max-h-[46vh] sm:max-h-[50vh] md:max-h-none'
        } bg-[#0E1013]/95 border border-[#262F3D] clip-tactical-bracket surface-bevel bg-tactical-steel backdrop-blur-md z-20 pointer-events-auto p-3 sm:p-4 flex flex-col justify-between overflow-y-auto shadow-2xl transition-all duration-300`}
      >
        <div className="space-y-2.5 sm:space-y-4">
          {/* Header Bar with Collapse Toggle on Mobile */}
          <div className="flex items-center justify-between pb-1 border-b border-[#262F3D]">
            <div className="text-xs font-display font-black text-[#10B981] uppercase tracking-wider">
              {cityName} TELEMETRY
            </div>
            <button
              onClick={() => setTelemetryCollapsed(!telemetryCollapsed)}
              title={telemetryCollapsed ? 'Expand Telemetry' : 'Minimize Telemetry'}
              className="text-[#94A3B8] hover:text-white p-0.5"
            >
              {telemetryCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>

          {!telemetryCollapsed && (
            <>
              {/* City Landscape Header Thumbnail */}
              <div className="relative w-full h-20 sm:h-24 md:h-32 border border-[#262F3D] overflow-hidden bg-black surface-bevel">
                <img
                  src={IFZ_IMAGES.eveshamCity}
                  alt={cityName}
                  className="w-full h-full object-cover opacity-90 hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0E1013] via-transparent to-transparent" />
                <div className="absolute top-2 left-2 sm:top-3 sm:left-3">
                  <div className="text-sm sm:text-base md:text-lg font-display font-black text-white uppercase tracking-wider">
                    {cityName}
                  </div>
                </div>
              </div>

              {/* Telemetry Breakdown Table */}
              <div className="space-y-1 text-[11px] sm:text-xs font-tech">
                <div className="flex justify-between items-center py-1 border-b border-[#262F3D]/80">
                  <span className="flex items-center gap-2 text-[#10B981] font-heading font-bold">
                    <Building className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="text-[#E8E8E8]">ALL BUILDINGS</span>
                  </span>
                  <span className="font-bold text-white font-tech">
                    {telemetry.allBuildings ? telemetry.allBuildings.toLocaleString() : '-'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[#262F3D]/80">
                  <span className="flex items-center gap-2 text-[#10B981] font-heading font-bold">
                    <Building className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="text-[#E8E8E8]">CENTRAL TILE</span>
                  </span>
                  <span className="font-bold text-white font-tech">
                    {telemetry.centralTileBuildings ? telemetry.centralTileBuildings.toLocaleString() : '-'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[#262F3D]/80">
                  <span className="flex items-center gap-2 text-[#10B981] font-heading font-bold">
                    <Compass className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="text-[#E8E8E8]">ELEVATION</span>
                  </span>
                  <span className="font-bold text-white font-tech">{telemetry.elevation}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[#262F3D]/80">
                  <span className="flex items-center gap-2 text-[#10B981] font-heading font-bold">
                    <Trees className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="text-[#E8E8E8]">FOREST</span>
                  </span>
                  <span className="font-bold text-white font-tech">{telemetry.forest}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[#262F3D]/80">
                  <span className="flex items-center gap-2 text-[#10B981] font-heading font-bold">
                    <Droplet className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="text-[#E8E8E8]">WATER</span>
                  </span>
                  <span className="font-bold text-white font-tech">{telemetry.water}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[#262F3D]/80">
                  <span className="flex items-center gap-2 text-[#10B981] font-heading font-bold">
                    <MapPin className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="text-[#E8E8E8]">POI</span>
                  </span>
                  <span className="font-bold text-white font-tech">{telemetry.poi}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[#262F3D]/80">
                  <span className="flex items-center gap-2 text-[#10B981] font-heading font-bold">
                    <Radio className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="text-[#E8E8E8]">ROADS</span>
                  </span>
                  <span className="font-bold text-white font-tech">{telemetry.roads}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[#262F3D]/80">
                  <span className="flex items-center gap-2 text-[#10B981] font-heading font-bold">
                    <Thermometer className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="text-[#E8E8E8]">TEMPERATURE</span>
                  </span>
                  <span className="font-bold text-white font-tech">{telemetry.temperature}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[#262F3D]/80">
                  <span className="flex items-center gap-2 text-[#10B981] font-heading font-bold">
                    <Layers className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="text-[#E8E8E8]">EXPEDITIONS</span>
                  </span>
                  <span className="font-bold text-white font-tech">{telemetry.expeditions}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[#262F3D]/80">
                  <span className="flex items-center gap-2 text-[#10B981] font-heading font-bold">
                    <Truck className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="text-[#E8E8E8]">VEHICLES</span>
                  </span>
                  <span className="font-bold text-white font-tech">{telemetry.vehicles}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer info & difficulty rating */}
        {!telemetryCollapsed && (
          <div className="space-y-1.5 pt-2 border-t border-[#262F3D] mt-2">
            <div className="flex justify-between items-center text-[10px] sm:text-xs font-heading font-bold text-[#10B981]">
              <span>MORE INFO</span>
              <span className="tracking-widest">★ ★ ★</span>
            </div>
            <div className="flex justify-between items-center text-[10px] sm:text-xs font-heading font-bold text-[#10B981]">
              <span>DIFFICULTY</span>
              <span className="tracking-widest">● ● ●</span>
            </div>
          </div>
        )}
      </div>

      {/* 7. Bottom Navigation Bar */}
      <div className="absolute bottom-3 left-3 right-3 sm:bottom-6 sm:left-6 sm:right-6 z-20 pointer-events-auto flex items-center justify-between">
        {/* Left Back Button */}
        <button
          id="street-view-back-btn"
          onClick={onBackToGlobe}
          className="px-5 sm:px-8 py-2 sm:py-2.5 bg-[#0E1013]/95 hover:bg-[#14171C] border border-[#262F3D] text-[#E8E8E8] hover:text-white text-xs font-heading uppercase tracking-wider flex items-center gap-1.5 sm:gap-2 transition-colors clip-tactical-bracket surface-bevel"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>BACK</span>
        </button>

        {/* Right Continue Button */}
        <button
          id="street-view-continue-btn"
          onClick={handleConfirmPlacement}
          className="px-6 sm:px-10 py-2 sm:py-2.5 bg-[#B31217] hover:bg-[#EF4444] border border-[#EF4444] text-white text-xs font-heading uppercase tracking-wider flex items-center gap-1.5 sm:gap-2 transition-all clip-tactical-bracket surface-bevel cursor-pointer"
        >
          <span>CONTINUE</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
