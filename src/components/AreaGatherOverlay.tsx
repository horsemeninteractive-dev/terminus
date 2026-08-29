import React, { useState, useEffect } from 'react';
import { Axe, Crosshair, X, Hammer, ShieldAlert, Check } from 'lucide-react';
import { soundEngine } from '../services/soundService';

export type GatherResourceType = 'wood' | 'metal' | 'bricks' | 'demolish' | 'scavenge';

interface AreaGatherOverlayProps {
  isActive: boolean;
  gatherType: GatherResourceType;
  onCancel: () => void;
  onDesignateArea: (type: GatherResourceType, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) => void;
  onDragBoundsChange?: (bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null) => void;
  screenRectToWorldBounds?: (x1: number, y1: number, x2: number, y2: number) => { minX: number; maxX: number; minZ: number; maxZ: number };
}

export const AreaGatherOverlay: React.FC<AreaGatherOverlayProps> = ({
  isActive,
  gatherType,
  onCancel,
  onDesignateArea,
  onDragBoundsChange,
  screenRectToWorldBounds,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);

  const getBoundsFromCoords = (x1Pix: number, y1Pix: number, x2Pix: number, y2Pix: number) => {
    const x1 = Math.min(x1Pix, x2Pix);
    const x2 = Math.max(x1Pix, x2Pix);
    const y1 = Math.min(y1Pix, y2Pix);
    const y2 = Math.max(y1Pix, y2Pix);
    if (x2 - x1 < 4 || y2 - y1 < 4) return null;

    if (screenRectToWorldBounds) {
      return screenRectToWorldBounds(x1, y1, x2, y2);
    }
    const mapExtent = 250;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    return {
      minX: ((x1 - screenW / 2) / (screenW / 2)) * mapExtent,
      maxX: ((x2 - screenW / 2) / (screenW / 2)) * mapExtent,
      minZ: ((y1 - screenH / 2) / (screenH / 2)) * mapExtent,
      maxZ: ((y2 - screenH / 2) / (screenH / 2)) * mapExtent,
    };
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isActive) {
        onDragBoundsChange?.(null);
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      onDragBoundsChange?.(null);
    };
  }, [isActive, onCancel, onDragBoundsChange]);

  if (!isActive) return null;

  const finishDrag = (endX: number, endY: number) => {
    if (!isDragging || !startPos) {
      setIsDragging(false);
      onDragBoundsChange?.(null);
      return;
    }

    const bounds = getBoundsFromCoords(startPos.x, startPos.y, endX, endY);
    if (bounds) {
      soundEngine.playHarvestWood();
      onDesignateArea(gatherType, bounds);
    }

    onDragBoundsChange?.(null);
    setIsDragging(false);
    setStartPos(null);
    setCurrentPos(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !startPos) return;
    e.stopPropagation();
    setCurrentPos({ x: e.clientX, y: e.clientY });
    const bounds = getBoundsFromCoords(startPos.x, startPos.y, e.clientX, e.clientY);
    onDragBoundsChange?.(bounds);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    finishDrag(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      e.stopPropagation();
      setIsDragging(true);
      setStartPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setCurrentPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length === 0 || !startPos) return;
    e.stopPropagation();
    const touch = e.touches[0];
    setCurrentPos({ x: touch.clientX, y: touch.clientY });
    const bounds = getBoundsFromCoords(startPos.x, startPos.y, touch.clientX, touch.clientY);
    onDragBoundsChange?.(bounds);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!isDragging || !currentPos) return;
    finishDrag(currentPos.x, currentPos.y);
  };

  const getTypeName = () => {
    switch (gatherType) {
      case 'wood':
        return 'WOOD / CUT DOWN TREES';
      case 'metal':
        return 'METAL / SCRAP WRECKAGE';
      case 'bricks':
        return 'BRICKS / CONCRETE RUBBLE';
      case 'demolish':
        return 'DEMOLISH / RUINS SALVAGE';
      case 'scavenge':
        return 'SCAVENGE BUILDINGS';
      default:
        return 'RESOURCE GATHERING';
    }
  };

  const getTypeColor = () => {
    switch (gatherType) {
      case 'wood':
        return '#10B981'; // emerald green
      case 'metal':
        return '#E8E8E8'; // cyan blue
      case 'bricks':
        return '#F59E0B'; // amber
      case 'demolish':
        return '#EF4444'; // red
      case 'scavenge':
        return '#F59E0B'; // amber
      default:
        return '#10B981';
    }
  };

  // Compute selection rectangle bounds
  let boxStyle = null;
  if (isDragging && startPos && currentPos) {
    const left = Math.min(startPos.x, currentPos.x);
    const top = Math.min(startPos.y, currentPos.y);
    const width = Math.abs(currentPos.x - startPos.x);
    const height = Math.abs(currentPos.y - startPos.y);

    boxStyle = {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    };
  }

  const color = getTypeColor();

  return (
    <div
      id="area-gather-overlay"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-30 cursor-crosshair select-none pointer-events-auto touch-none"
      style={{
        background: 'radial-gradient(circle at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.25) 100%)',
      }}
    >
      {/* Top Banner Guide */}
      <div className="absolute top-12 sm:top-14 left-1/2 -translate-x-1/2 w-[min(94vw,480px)] flex items-center justify-between gap-2 px-3 py-2 bg-[#07090C]/95 border-2 border-[#1E293B] backdrop-blur-md clip-card-chip">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-4 h-4 flex items-center justify-center font-bold text-xs shrink-0"
            style={{ color }}
          >
            <Axe className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-heading font-black text-xs tracking-wider uppercase truncate" style={{ color }}>
              {getTypeName()}
            </span>
            <span className="font-mono text-[9px] text-[#94A3B8] truncate">
              {gatherType === 'scavenge' ? 'Drag a box over buildings to queue scavenging.' : 'Drag finger or mouse box over nodes to assign labor.'}
            </span>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="shrink-0 px-2.5 py-1 bg-[#1E293B] hover:bg-[#334155] text-slate-300 hover:text-white font-mono text-[10px] uppercase border border-[#475569] transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Dragging Selection Rectangle */}
      {boxStyle && (
        <div
          className="absolute pointer-events-none"
          style={{
            ...boxStyle,
            border: `2px dashed ${color}`,
            backgroundColor: `${color}22`,
            boxShadow: `0 0 20px ${color}55`,
          }}
        >
          {/* Tactical Corner Brackets */}
          <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2" style={{ borderColor: color }} />
          <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2" style={{ borderColor: color }} />
          <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2" style={{ borderColor: color }} />
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2" style={{ borderColor: color }} />

          <div
            className="absolute top-1 left-1.5 flex items-center gap-1.5 px-2 py-0.5 font-mono text-[9px] font-bold bg-black/90 whitespace-nowrap shadow-md border"
            style={{ color, borderColor: `${color}88` }}
          >
            <Crosshair className="w-3 h-3 animate-spin" style={{ color, animationDuration: '6s' }} />
            <span>DESIGNATING {gatherType.toUpperCase()} AREA</span>
          </div>
        </div>
      )}
    </div>
  );
};
