import React, { useEffect, useRef } from 'react';
import { Compass } from 'lucide-react';
import { BuildingPolygon, Point2D } from '../types/map';
import { TacticalSquadUnit, ZombieUnit } from '../types/combat';
import { WorldVehicle } from '../types/vehicle';

interface TacticalMinimapProps {
 buildings: BuildingPolygon[];
 squads: TacticalSquadUnit[];
 zombies: ZombieUnit[];
 vehicles: WorldVehicle[];
 hqBuildingId: string | number | null;
 cameraPosition: { x: number; z: number };
 onPanTo: (pos: Point2D) => void;
 mapRadius?: number;
}

export const TacticalMinimap: React.FC<TacticalMinimapProps> = ({
 buildings = [],
 squads = [],
 zombies = [],
 vehicles = [],
 hqBuildingId,
 cameraPosition,
 onPanTo,  mapRadius = 4000,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Bounds for radar projection (-4000m to +4000m for 8km x 8km grid)
  const mapExtent = mapRadius || 4000;

 useEffect(() => {
 const canvas = canvasRef.current;
 if (!canvas) return;
 const ctx = canvas.getContext('2d');
 if (!ctx) return;

 const size = canvas.width;
 ctx.clearRect(0, 0, size, size);

 // Background Grid
 ctx.fillStyle = '#080A0C';
 ctx.fillRect(0, 0, size, size);

 ctx.strokeStyle = '#161B22';
 ctx.lineWidth = 1;
 for (let i = 20; i < size; i += 25) {
 ctx.beginPath();
 ctx.moveTo(i, 0);
 ctx.lineTo(i, size);
 ctx.stroke();

 ctx.beginPath();
 ctx.moveTo(0, i);
 ctx.lineTo(size, i);
 ctx.stroke();
 }

 // World to Canvas coordinate mapper
 const toCanvas = (x: number, z: number): [number, number] => {
 const cx = ((x + mapExtent) / (mapExtent * 2)) * size;
 const cy = ((z + mapExtent) / (mapExtent * 2)) * size;
 return [cx, cy];
 };

 // Render Buildings
 ctx.fillStyle = '#1B222C';
 ctx.strokeStyle = '#283342';
 ctx.lineWidth = 0.5;

 for (const bldg of buildings) {
 if (!bldg.polygon || bldg.polygon.length < 3) continue;
 const isHQ = hqBuildingId !== null && String(bldg.id) === String(hqBuildingId);

 ctx.beginPath();
 const [startPx, startPy] = toCanvas(bldg.polygon[0].x, bldg.polygon[0].z);
 ctx.moveTo(startPx, startPy);
 for (let i = 1; i < bldg.polygon.length; i++) {
 const [px, py] = toCanvas(bldg.polygon[i].x, bldg.polygon[i].z);
 ctx.lineTo(px, py);
 }
 ctx.closePath();

 if (isHQ) {
 ctx.fillStyle = '#163D24';
 ctx.fill();
 ctx.strokeStyle = '#22C55E';
 ctx.stroke();
 } else {
 ctx.fillStyle = '#181F28';
 ctx.fill();
 ctx.stroke();
 }
 }

 // Render Zombies (Red Blips)
 ctx.fillStyle = '#EF4444';
 for (const z of zombies) {
 if (!z) continue;
 const zxCoord = typeof z.x === 'number' ? z.x : (z as any).position?.x;
 const zzCoord = typeof z.z === 'number' ? z.z : (z as any).position?.z;
 if (typeof zxCoord === 'number' && typeof zzCoord === 'number') {
 const [zx, zy] = toCanvas(zxCoord, zzCoord);
 ctx.fillRect(zx - 1, zy - 1, 2, 2);
 }
 }

 // Render Vehicles (Amber Squares)
 ctx.fillStyle = '#F59E0B';
 for (const v of vehicles) {
 if (!v || !v.position) continue;
 const [vx, vy] = toCanvas(v.position.x, v.position.z);
 ctx.fillRect(vx - 2, vy - 2, 4, 4);
 }

 // Render Squads (Cyan/Blue Dots)
 ctx.fillStyle = '#E8E8E8';
 for (const s of squads) {
 if (!s) continue;
 const sxCoord = typeof s.x === 'number' ? s.x : (s as any).position?.x;
 const szCoord = typeof s.z === 'number' ? s.z : (s as any).position?.z;
 if (typeof sxCoord === 'number' && typeof szCoord === 'number') {
 const [sx, sy] = toCanvas(sxCoord, szCoord);
 ctx.beginPath();
 ctx.arc(sx, sy, 3, 0, Math.PI * 2);
 ctx.fill();
 ctx.strokeStyle = '#FFFFFF';
 ctx.lineWidth = 1;
 ctx.stroke();
 }
 }

 // Render Camera Viewpoint Ping
 if (cameraPosition && typeof cameraPosition.x === 'number' && typeof cameraPosition.z === 'number') {
 const [camX, camY] = toCanvas(cameraPosition.x, cameraPosition.z);
 ctx.strokeStyle = '#E2E8F0';
 ctx.lineWidth = 1;
 ctx.strokeRect(camX - 6, camY - 6, 12, 12);
 }
 }, [buildings, squads, zombies, vehicles, hqBuildingId, cameraPosition]);

 const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
 const canvas = canvasRef.current;
 if (!canvas) return;
 const rect = canvas.getBoundingClientRect();
 const clickX = e.clientX - rect.left;
 const clickY = e.clientY - rect.top;

 const worldX = (clickX / canvas.width) * (mapExtent * 2) - mapExtent;
 const worldZ = (clickY / canvas.height) * (mapExtent * 2) - mapExtent;

 onPanTo({ x: worldX, z: worldZ });
 };

 return (
 <div
 id="tactical-minimap-container"
 className="fixed bottom-4 right-4 z-20 flex flex-col bg-[#0A0C0E] border border-[#252C36] text-[#E8E8E8] select-none clip-tactical-bracket surface-bevel pointer-events-auto"
 >
 {/* Top Header Plate */}
 <div className="h-6 px-2 bg-[#12151B] border-b border-[#252C36] flex items-center justify-between">
 <div className="flex items-center gap-1">
 <Compass className="w-3 h-3 text-[#A0AEC0]" />
 <span className="font-display text-xs tracking-wider uppercase text-[#CBD5E1]">
 RADAR TACTICAL GRID
 </span>
 </div>
 </div>

 {/* Canvas Radar */}
 <div className="p-1 relative">
 <canvas
 ref={canvasRef}
 width={150}
 height={150}
 onClick={handleCanvasClick}
 className="cursor-crosshair block"
 />

 {/* Legend Overlay */}
 <div className="absolute bottom-2 left-2 flex items-center gap-2 text-[8px] font-mono bg-[#0A0C0E]/80 px-1 py-0.5 border border-[#1E252F]">
 <span className="flex items-center gap-0.5 text-[#E8E8E8]">
 <span className="w-1.5 h-1.5 bg-[#E8E8E8]" /> SQUAD
 </span>
 <span className="flex items-center gap-0.5 text-[#EF4444]">
 <span className="w-1.5 h-1.5 bg-[#EF4444]" /> ZOMBIE
 </span>
 </div>
 </div>
 </div>
 );
};
