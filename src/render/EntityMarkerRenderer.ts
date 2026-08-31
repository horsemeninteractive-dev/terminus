import * as THREE from 'three';
import { PositionSmoother } from './movementSmoothing';

export type EntityMarkerKind =
  | 'squad'
  | 'vehicle'
  | 'worker'
  | 'survivor'
  | 'zombie'
  | 'hideout'
  | 'lair'
  | 'unexplored_building'
  | 'loot_pin'
  | 'street_label';

export type MarkerFaction = 'friendly' | 'neutral' | 'hostile' | 'unknown';

export type MarkerActivity = 'idle' | 'moving' | 'combat' | 'scavenging' | 'building' | 'gathering';

export type MarkerWeaponType = 'rifle' | 'pistol' | 'shotgun' | 'melee' | 'heavy' | 'unarmed';

export interface EntityMarker {
  key: string;
  kind: EntityMarkerKind;
  faction: MarkerFaction;
  x: number;
  z: number;
  y: number;
  anchorY?: number;
  label?: string;
  sublabel?: string;
  squadNumber?: string | number;
  isSelected?: boolean;
  isMoving?: boolean;
  isArmed?: boolean;
  isOccupied?: boolean;
  memberCount?: number;
  maxMembers?: number;
  bestWeaponType?: MarkerWeaponType;
  bestWeaponName?: string;
  activity?: MarkerActivity;
  inBuilding?: boolean;
  groupSize?: number;
  damageRatio?: number; // 0..1 (1 = full health)
  searchProgress?: number; // 0..100
  lootCategory?: 'food' | 'medical' | 'weapons' | 'fuel' | 'materials' | 'assorted';
  lootCategories?: string[];
  detailMode?: 'detailed' | 'minimal';
  buildingId?: string | number;
}

export const FACTION_COLORS: Record<
  MarkerFaction,
  { accent: string; border: string; glow: string; darkBg: string }
> = {
  friendly: {
    accent: '#10b981', // Tactical Emerald Green
    border: '#00ff9d',
    glow: 'rgba(16, 185, 129, 0.25)',
    darkBg: 'rgba(8, 14, 18, 0.95)',
  },
  neutral: {
    accent: '#cbd5e1', // Slate / Neutral White for empty vehicles
    border: '#64748b',
    glow: 'rgba(148, 163, 184, 0.12)',
    darkBg: 'rgba(12, 16, 20, 0.94)',
  },
  hostile: {
    accent: '#ef4444', // Tactical Crimson Red
    border: '#f87171',
    glow: 'rgba(239, 68, 68, 0.28)',
    darkBg: 'rgba(22, 8, 10, 0.95)',
  },
  unknown: {
    accent: '#f97316', // Orange for unknowns / unexplored
    border: '#fb923c',
    glow: 'rgba(249, 115, 22, 0.25)',
    darkBg: 'rgba(18, 10, 6, 0.95)',
  },
};

// Rectangular marker dimensions: taller than they are wide
const BADGE_W = 120;
const BADGE_H = 160;
const CIRCLE_DIM = 128;
const PIN_MINIMAL_W = 72;
const PIN_MINIMAL_H = 96;
const PIN_DETAILED_W = 160;
const PIN_DETAILED_H = 110;

/** Draw tactical corner brackets [ ] */
function drawCornerBrackets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  len: number,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';

  ctx.beginPath();
  // Top-left
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);

  // Top-right
  ctx.moveTo(x + w - len, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + len);

  // Bottom-right
  ctx.moveTo(x + w, y + h - len);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - len, y + h);

  // Bottom-left
  ctx.moveTo(x + len, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - len);

  ctx.stroke();
}

/** Draw squad member pips above the badge */
function drawMemberPips(
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  count: number,
  color: string
) {
  const pipCount = Math.max(1, Math.min(8, count));
  const pipW = 8;
  const pipH = 5;
  const gap = 4;
  const totalW = pipCount * pipW + (pipCount - 1) * gap;
  const startX = cx - totalW / 2;

  ctx.fillStyle = color;
  for (let i = 0; i < pipCount; i++) {
    const px = startX + i * (pipW + gap);
    ctx.fillRect(px, topY - pipH - 3, pipW, pipH);
  }
}

/** Draw activity icon in top-left with high legibility and large size */
function drawActivityIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  activity: MarkerActivity,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);

  // Background round disc for contrast
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.stroke();

  if (activity === 'combat') {
    // Combat crossed blades / burst cross
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(6, 6);
    ctx.moveTo(6, -6);
    ctx.lineTo(-6, 6);
    ctx.stroke();

    // Center flash dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (activity === 'moving') {
    // Movement chevrons »
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, -5);
    ctx.lineTo(0, 0);
    ctx.lineTo(-5, 5);
    ctx.moveTo(1, -5);
    ctx.lineTo(6, 0);
    ctx.lineTo(1, 5);
    ctx.stroke();
  } else if (activity === 'scavenging') {
    // Scavenge magnifying glass / search crate
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(-1.5, -1.5, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(2.5, 2.5);
    ctx.lineTo(7, 7);
    ctx.stroke();
  } else {
    // Idle / standby shield dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Draw weapon category icon in top-right with large, crisp silhouettes */
function drawWeaponIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  wType: MarkerWeaponType,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);

  // Background round disc for contrast
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  if (wType === 'rifle') {
    // Long rifle silhouette
    ctx.fillRect(-8, -2, 16, 3.5);
    ctx.fillRect(-6, 1.5, 3.5, 3.5); // grip
    ctx.fillRect(1, 1.5, 3, 4.5); // mag
  } else if (wType === 'shotgun') {
    // Pump action shotgun
    ctx.fillRect(-8, -2.5, 16, 4.5);
    ctx.fillRect(-6, 2, 4.5, 3);
  } else if (wType === 'melee') {
    // Combat blade / machete
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.lineTo(4, -4);
    ctx.lineTo(7, -7);
    ctx.stroke();
    // Guard
    ctx.fillRect(-2, 0, 5, 2.5);
  } else if (wType === 'heavy') {
    // Heavy launcher / rocket
    ctx.fillRect(-8, -3.5, 16, 6);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(6, -2, 3, 3);
  } else {
    // Default Pistol
    ctx.fillRect(-5, -3, 10, 3.5);
    ctx.fillRect(-4, 0.5, 3.5, 6);
  }

  ctx.restore();
}

/** Draw building wall brackets flanking the soldier */
function drawBuildingWallBrackets(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 2;

  const wallW = 6;
  const wallH = 46;
  const offset = 34;

  // Left building wall
  ctx.strokeRect(cx - offset - wallW, cy - wallH / 2, wallW, wallH);
  ctx.fillRect(cx - offset - wallW, cy - wallH / 2, wallW, wallH);
  // Mortar lines
  ctx.beginPath();
  ctx.moveTo(cx - offset - wallW, cy - 10);
  ctx.lineTo(cx - offset, cy - 10);
  ctx.moveTo(cx - offset - wallW, cy + 10);
  ctx.lineTo(cx - offset, cy + 10);
  ctx.stroke();

  // Right building wall
  ctx.strokeRect(cx + offset, cy - wallH / 2, wallW, wallH);
  ctx.fillRect(cx + offset, cy - wallH / 2, wallW, wallH);
  ctx.beginPath();
  ctx.moveTo(cx + offset, cy - 10);
  ctx.lineTo(cx + offset + wallW, cy - 10);
  ctx.moveTo(cx + offset, cy + 10);
  ctx.lineTo(cx + offset + wallW, cy + 10);
  ctx.stroke();

  ctx.restore();
}

/** Draw crisp silhouette of a tactical soldier in walking/combat stance */
function drawTacticalSoldier(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  scale = 1
) {
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Helmet / Head
  ctx.beginPath();
  ctx.arc(0, -21, 6.5, 0, Math.PI * 2);
  ctx.fill();

  // Visor
  ctx.fillRect(2, -23, 6, 2.5);

  // Vest
  ctx.beginPath();
  ctx.moveTo(-7, -13);
  ctx.lineTo(7, -13);
  ctx.lineTo(6, 5);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();

  // Arms & Rifle
  ctx.beginPath();
  ctx.moveTo(-7, -12);
  ctx.lineTo(-13, -2);
  ctx.lineTo(8, -1);
  ctx.lineTo(6, -7);
  ctx.closePath();
  ctx.fill();

  ctx.fillRect(-6, -5, 20, 3.5); // Barrel
  ctx.fillRect(9, -3, 3, 5);     // Mag

  // Legs
  ctx.beginPath();
  ctx.moveTo(-5, 5);
  ctx.lineTo(-10, 18);
  ctx.lineTo(-7, 23);
  ctx.lineTo(-2, 23);
  ctx.lineTo(-1, 16);
  ctx.lineTo(-1, 5);

  ctx.moveTo(1, 5);
  ctx.lineTo(6, 16);
  ctx.lineTo(11, 23);
  ctx.lineTo(15, 23);
  ctx.lineTo(9, 16);
  ctx.lineTo(5, 5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** Draw vehicle silhouette */
function drawTacticalVehicle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  scale = 1
) {
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Chassis
  ctx.beginPath();
  ctx.roundRect(-24, -2, 48, 11, 2);
  ctx.fill();

  // Cabin
  ctx.beginPath();
  ctx.moveTo(-15, -2);
  ctx.lineTo(-8, -13);
  ctx.lineTo(8, -13);
  ctx.lineTo(15, -2);
  ctx.closePath();
  ctx.fill();

  // Windows
  ctx.fillStyle = 'rgba(8, 14, 18, 0.95)';
  ctx.fillRect(-6, -11, 5, 8);
  ctx.fillRect(1, -11, 6, 8);

  // Wheels
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(-14, 9, 5.5, 0, Math.PI * 2);
  ctx.arc(14, 9, 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Draw skull silhouette */
function drawTacticalSkull(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  scale = 1
) {
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.arc(0, -4, 16, Math.PI * 0.85, Math.PI * 2.15);
  ctx.lineTo(8, 9);
  ctx.lineTo(5, 18);
  ctx.lineTo(-5, 18);
  ctx.lineTo(-8, 9);
  ctx.closePath();
  ctx.fill();

  // Sockets
  ctx.fillStyle = 'rgba(18, 6, 8, 0.95)';
  ctx.beginPath();
  ctx.ellipse(-5.5, -1, 3.5, 4.5, -0.15, 0, Math.PI * 2);
  ctx.ellipse(5.5, -1, 3.5, 4.5, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Nasal cavity
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(2, 8);
  ctx.lineTo(-2, 8);
  ctx.closePath();
  ctx.fill();

  // Teeth slits
  ctx.fillStyle = color;
  ctx.fillRect(-3, 12, 1.5, 4);
  ctx.fillRect(0, 12, 1.5, 4);
  ctx.fillRect(3, 12, 1.5, 4);

  ctx.restore();
}

/** Draw circular zombie marker */
function drawCircularZombieCanvas(marker: EntityMarker): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CIRCLE_DIM;
  canvas.height = CIRCLE_DIM;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cx = CIRCLE_DIM / 2;
  const cy = CIRCLE_DIM / 2;
  const radius = 44;
  const colors = FACTION_COLORS.hostile;

  ctx.clearRect(0, 0, CIRCLE_DIM, CIRCLE_DIM);

  // Outer ambient glow ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.fillStyle = colors.glow;
  ctx.fill();

  // Dark circular badge body
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = colors.darkBg;
  ctx.fill();

  // Red perimeter border
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = colors.border;
  ctx.stroke();

  // Inner subtle border
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 5, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
  ctx.stroke();
  ctx.restore();

  // Skull silhouette in center
  drawTacticalSkull(ctx, cx, cy - 2, colors.accent, 1.15);

  return canvas;
}

/** Draw circular unknown (?) marker floating over POIs */
function drawCircularUnknownCanvas(marker: EntityMarker): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CIRCLE_DIM;
  canvas.height = CIRCLE_DIM;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cx = CIRCLE_DIM / 2;
  const cy = CIRCLE_DIM / 2;
  const radius = 42;
  const colors = FACTION_COLORS.unknown;

  ctx.clearRect(0, 0, CIRCLE_DIM, CIRCLE_DIM);

  // Outer glow
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.fillStyle = colors.glow;
  ctx.fill();

  // Dark body
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = colors.darkBg;
  ctx.fill();

  // Orange border
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = colors.border;
  ctx.stroke();

  // Question mark
  ctx.fillStyle = colors.accent;
  ctx.font = '900 48px "Courier New", monospace, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', cx, cy - 1);

  return canvas;
}

/** Main squad / vehicle / NPC rectangular badge (taller than wide) */
function drawRectangularBadgeCanvas(marker: EntityMarker): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = BADGE_W;
  canvas.height = BADGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const isUnusedVehicle = marker.kind === 'vehicle' && marker.isOccupied === false;
  const faction = isUnusedVehicle
    ? FACTION_COLORS.neutral
    : FACTION_COLORS[marker.faction] || FACTION_COLORS.friendly;

  const isSelected = Boolean(marker.isSelected);
  const isMoving = Boolean(marker.isMoving);
  const inBuilding = Boolean(marker.inBuilding);

  ctx.clearRect(0, 0, BADGE_W, BADGE_H);

  const pad = 10;
  const cardX = pad;
  const cardY = 22; // room for pips above
  const cardW = BADGE_W - pad * 2;
  const cardH = BADGE_H - 32;
  const cornerRadius = 6;
  const cx = BADGE_W / 2;

  // 1. Draw Member Pips above top border if provided
  if (marker.memberCount !== undefined && marker.memberCount > 0) {
    drawMemberPips(ctx, cx, cardY, marker.memberCount, faction.accent);
  }

  // 2. Card Background
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, cornerRadius);
  ctx.fillStyle = faction.darkBg;
  ctx.fill();

  // Border
  ctx.lineWidth = isSelected ? 2.5 : 1.5;
  ctx.strokeStyle = isSelected ? faction.border : 'rgba(100, 116, 139, 0.45)';
  ctx.stroke();
  ctx.restore();

  // 3. Corner Brackets [ ] if selected
  if (isSelected) {
    drawCornerBrackets(ctx, cardX - 2, cardY - 2, cardW + 4, cardH + 4, 10, faction.border);
  }

  // 4. Top-Left Activity Icon
  const act = marker.activity || (isMoving ? 'moving' : 'idle');
  drawActivityIcon(ctx, cardX + 14, cardY + 14, act, faction.accent);

  // 5. Top-Right Best Weapon Icon
  if (marker.bestWeaponType && marker.bestWeaponType !== 'unarmed') {
    drawWeaponIcon(ctx, cardX + cardW - 14, cardY + 14, marker.bestWeaponType, faction.accent);
  } else if (marker.isArmed) {
    drawWeaponIcon(ctx, cardX + cardW - 14, cardY + 14, 'pistol', faction.accent);
  }

  // 6. Inside Building Walls Indicator
  if (inBuilding) {
    drawBuildingWallBrackets(ctx, cx, cardY + cardH / 2, faction.accent);
  }

  // 7. Central Silhouette
  const iconCenterY = cardY + cardH / 2 + 2;
  if (marker.kind === 'vehicle') {
    const vehColor = isUnusedVehicle ? '#94a3b8' : faction.accent;
    drawTacticalVehicle(ctx, cx, iconCenterY, vehColor, 1.0);
  } else if (marker.kind === 'hideout') {
    drawTacticalSoldier(ctx, cx, iconCenterY, faction.accent, 1.05);
  } else {
    drawTacticalSoldier(ctx, cx, iconCenterY, faction.accent, 1.08);
  }

  // 8. Squad / Unit Number in BOTTOM-RIGHT corner only (no illegible names)
  const squadNumStr = marker.squadNumber !== undefined
    ? String(marker.squadNumber)
    : (marker.label ? marker.label.replace(/[^0-9]/g, '') || marker.label.slice(0, 2).toUpperCase() : '');

  if (squadNumStr) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 15px "Courier New", monospace, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(squadNumStr, cardX + cardW - 6, cardY + cardH - 5);
  }

  // 9. Scavenge Progress Bar along bottom edge
  if (marker.searchProgress !== undefined && marker.searchProgress > 0 && marker.searchProgress <= 100) {
    const barX = cardX + 5;
    const barY = cardY + cardH - 12;
    const barW = cardW - 10;
    const barH = 4.5;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(barX, barY, (barW * marker.searchProgress) / 100, barH);
  }

  // 10. Damage Bar if damaged
  if (marker.damageRatio !== undefined && marker.damageRatio < 0.98) {
    const barX = cardX + 5;
    const barY = cardY + cardH - 4;
    const barW = cardW - 10;
    const barH = 3;

    ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = faction.accent;
    ctx.fillRect(barX, barY, barW * Math.max(0, Math.min(1, marker.damageRatio)), barH);
  }

  return canvas;
}

const LOOT_PIN_COLORS: Record<string, { accent: string; border: string; bg: string; iconBg: string }> = {
  food: { accent: '#f59e0b', border: '#fbbf24', bg: 'rgba(28, 18, 8, 0.95)', iconBg: '#b45309' },
  medical: { accent: '#10b981', border: '#34d399', bg: 'rgba(6, 26, 18, 0.95)', iconBg: '#047857' },
  weapons: { accent: '#ef4444', border: '#f87171', bg: 'rgba(28, 8, 8, 0.95)', iconBg: '#b91c1c' },
  fuel: { accent: '#06b6d4', border: '#38bdf8', bg: 'rgba(6, 22, 28, 0.95)', iconBg: '#0e7490' },
  materials: { accent: '#ea580c', border: '#fb923c', bg: 'rgba(28, 14, 6, 0.95)', iconBg: '#c2410c' },
  assorted: { accent: '#94a3b8', border: '#cbd5e1', bg: 'rgba(15, 23, 42, 0.95)', iconBg: '#475569' },
};

/** Draw minimal teardrop pindrop marker */
function drawMinimalLootPinCanvas(marker: EntityMarker): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PIN_MINIMAL_W;
  canvas.height = PIN_MINIMAL_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cat = marker.lootCategory || 'assorted';
  const cfg = LOOT_PIN_COLORS[cat] || LOOT_PIN_COLORS.assorted;
  const isSelected = Boolean(marker.isSelected);

  ctx.clearRect(0, 0, PIN_MINIMAL_W, PIN_MINIMAL_H);

  const cx = PIN_MINIMAL_W / 2;
  const cy = 36;
  const r = 28;
  const pointY = PIN_MINIMAL_H - 8;

  // Teardrop Pindrop Path
  ctx.save();
  ctx.beginPath();
  // Arc at top
  ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 0.2, false);
  // Point down
  ctx.lineTo(cx, pointY);
  ctx.closePath();

  // Dark background
  ctx.fillStyle = cfg.bg;
  ctx.fill();

  // Glowing category border
  ctx.lineWidth = isSelected ? 3.5 : 2.5;
  ctx.strokeStyle = isSelected ? '#FFFFFF' : cfg.border;
  ctx.stroke();
  ctx.restore();

  // Inner circular icon badge
  ctx.beginPath();
  ctx.arc(cx, cy, 19, 0, Math.PI * 2);
  ctx.fillStyle = cfg.iconBg;
  ctx.fill();
  ctx.strokeStyle = cfg.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Category Icon inside
  if (cat === 'medical') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx - 3.5, cy - 11, 7, 22);
    ctx.fillRect(cx - 11, cy - 3.5, 22, 7);
  } else if (cat === 'food') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, cy - 4, 8, Math.PI, 0);
    ctx.lineTo(cx + 8, cy + 8);
    ctx.lineTo(cx - 8, cy + 8);
    ctx.closePath();
    ctx.fill();
  } else if (cat === 'weapons') {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.moveTo(cx - 12, cy);
    ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();
  } else if (cat === 'fuel') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.quadraticCurveTo(cx + 9, cy + 2, cx, cy + 10);
    ctx.quadraticCurveTo(cx - 9, cy + 2, cx, cy - 10);
    ctx.fill();
  } else if (cat === 'materials') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx - 9, cy - 3, 18, 6);
    ctx.fillRect(cx - 3, cy - 9, 6, 18);
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px "Courier New", monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy);
  }

  return canvas;
}

/** Draw detailed loot pin with labels */
function drawDetailedLootPinCanvas(marker: EntityMarker): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PIN_DETAILED_W;
  canvas.height = PIN_DETAILED_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cat = marker.lootCategory || 'assorted';
  const cfg = LOOT_PIN_COLORS[cat] || LOOT_PIN_COLORS.assorted;
  const isSelected = Boolean(marker.isSelected);

  ctx.clearRect(0, 0, PIN_DETAILED_W, PIN_DETAILED_H);

  const cx = PIN_DETAILED_W / 2;
  const topY = 10;
  const bodyW = 144;
  const bodyH = 80;
  const bodyX = cx - bodyW / 2;
  const radius = 8;
  const pointY = PIN_DETAILED_H - 10;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(bodyX + radius, topY);
  ctx.lineTo(bodyX + bodyW - radius, topY);
  ctx.quadraticCurveTo(bodyX + bodyW, topY, bodyX + bodyW, topY + radius);
  ctx.lineTo(bodyX + bodyW, topY + bodyH - radius);
  ctx.quadraticCurveTo(bodyX + bodyW, topY + bodyH, bodyX + bodyW - radius, topY + bodyH);
  ctx.lineTo(cx + 12, topY + bodyH);
  ctx.lineTo(cx, pointY);
  ctx.lineTo(cx - 12, topY + bodyH);
  ctx.lineTo(bodyX + radius, topY + bodyH);
  ctx.quadraticCurveTo(bodyX, topY + bodyH, bodyX, topY + bodyH - radius);
  ctx.lineTo(bodyX, topY + radius);
  ctx.quadraticCurveTo(bodyX, topY, bodyX + radius, topY);
  ctx.closePath();

  ctx.fillStyle = cfg.bg;
  ctx.fill();
  ctx.lineWidth = isSelected ? 3.5 : 2;
  ctx.strokeStyle = isSelected ? '#FFFFFF' : cfg.border;
  ctx.stroke();
  ctx.restore();

  // Left Icon
  const iconX = bodyX + 30;
  const iconY = topY + bodyH / 2;
  ctx.beginPath();
  ctx.arc(iconX, iconY, 18, 0, Math.PI * 2);
  ctx.fillStyle = cfg.iconBg;
  ctx.fill();
  ctx.strokeStyle = cfg.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px "Courier New", monospace, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cat === 'medical' ? '+' : cat === 'weapons' ? '⚔' : cat.slice(0, 1).toUpperCase(), iconX, iconY);

  // Label text
  ctx.fillStyle = cfg.accent;
  ctx.font = 'bold 14px "Courier New", monospace, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(cat.toUpperCase(), iconX + 24, iconY - 8);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 10px "Courier New", monospace, sans-serif';
  ctx.fillText('CACHE', iconX + 24, iconY + 10);

  return canvas;
}

/** Draw street name sign on the map */
function drawStreetLabelCanvas(marker: EntityMarker): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 280;
  canvas.height = 70;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, 280, 70);

  const streetName = (marker.label || 'STREET').normalize('NFC').toLocaleUpperCase();
  const padX = 14;
  const padY = 12;
  const cardW = 280 - padX * 2;
  const cardH = 70 - padY * 2;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(padX, padY, cardW, cardH, 6);
  ctx.fillStyle = 'rgba(10, 15, 24, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 13px "Courier New", monospace, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(streetName, 140, 35);

  return canvas;
}

// Global texture cache for preloaded static templates
const PRELOADED_TEXTURES = new Map<string, THREE.CanvasTexture>();

export function getOrCreateSharedTexture(cacheKey: string, canvasGenerator: () => HTMLCanvasElement): THREE.CanvasTexture {
  let tex = PRELOADED_TEXTURES.get(cacheKey);
  if (!tex) {
    const canvas = canvasGenerator();
    tex = new THREE.CanvasTexture(canvas);
    PRELOADED_TEXTURES.set(cacheKey, tex);
  }
  return tex;
}

export function preloadAllLootPinTextures() {
  const categories: Array<'food' | 'medical' | 'weapons' | 'fuel' | 'materials' | 'assorted'> = [
    'food',
    'medical',
    'weapons',
    'fuel',
    'materials',
    'assorted',
  ];
  for (const cat of categories) {
    const dummy: EntityMarker = {
      key: `preload_${cat}`,
      kind: 'loot_pin',
      faction: 'unknown',
      x: 0,
      z: 0,
      y: 0,
      lootCategory: cat,
      detailMode: 'minimal',
    };
    getOrCreateSharedTexture(`loot_minimal_${cat}_0`, () => drawMinimalLootPinCanvas(dummy));
    getOrCreateSharedTexture(`loot_detailed_${cat}_0`, () => drawDetailedLootPinCanvas(dummy));
  }
}

function getMarkerTexture(marker: EntityMarker): THREE.CanvasTexture {
  if (marker.kind === 'loot_pin') {
    const isDetailed = marker.detailMode === 'detailed';
    const isSelected = Boolean(marker.isSelected);
    const cat = marker.lootCategory || 'assorted';
    const cacheKey = `loot_${isDetailed ? 'detailed' : 'minimal'}_${cat}_${isSelected ? 1 : 0}`;
    return getOrCreateSharedTexture(cacheKey, () =>
      isDetailed ? drawDetailedLootPinCanvas(marker) : drawMinimalLootPinCanvas(marker)
    );
  }

  if (marker.kind === 'street_label') {
    return new THREE.CanvasTexture(drawStreetLabelCanvas(marker));
  }

  if (marker.kind === 'zombie' || marker.kind === 'lair') {
    const cacheKey = `zombie_${marker.faction}`;
    return getOrCreateSharedTexture(cacheKey, () => drawCircularZombieCanvas(marker));
  }

  if (marker.kind === 'unexplored_building' || (marker.kind === 'survivor' && marker.faction === 'unknown')) {
    const cacheKey = `unknown_circle`;
    return getOrCreateSharedTexture(cacheKey, () => drawCircularUnknownCanvas(marker));
  }

  return new THREE.CanvasTexture(drawRectangularBadgeCanvas(marker));
}

function markerSignature(marker: EntityMarker): string {
  return [
    marker.key,
    marker.kind,
    marker.faction,
    marker.isSelected ? '1' : '0',
    marker.isMoving ? '1' : '0',
    marker.isArmed ? '1' : '0',
    marker.inBuilding ? '1' : '0',
    marker.memberCount || 0,
    marker.squadNumber || '',
    marker.bestWeaponType || '',
    marker.activity || '',
    marker.lootCategory || '',
    marker.detailMode || '',
    marker.damageRatio !== undefined ? marker.damageRatio.toFixed(2) : '',
    marker.searchProgress !== undefined ? marker.searchProgress.toFixed(1) : '',
  ].join('|');
}

interface MarkerEntry {
  key: string;
  marker: EntityMarker;
  sprite: THREE.Sprite;
  line: THREE.Line;
  anchorDot: THREE.Mesh;
  isSharedTexture: boolean;
  smoother: PositionSmoother;
}

export class EntityMarkerRenderer {
  public group = new THREE.Group();
  private entries = new Map<string, MarkerEntry>();
  private circleGeometry: THREE.BufferGeometry;
  private paused = false;

  constructor() {
    this.group.name = 'EntityMarkersGroup';
    this.group.renderOrder = 999;
    this.circleGeometry = new THREE.RingGeometry(0.2, 0.45, 16);
    preloadAllLootPinTextures();
  }

  public setSimulationPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      for (const entry of this.entries.values()) entry.smoother.freezeAtTarget();
    }
  }

  public setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  public updateMarkers(markers: EntityMarker[]) {
    const active = new Set<string>();

    for (const marker of markers) {
      if (marker.kind === 'worker') continue;
      active.add(marker.key);
      const signature = markerSignature(marker);

      const isUnusedVehicle = marker.kind === 'vehicle' && marker.isOccupied === false;
      const colorHex = isUnusedVehicle
        ? '#94a3b8'
        : (FACTION_COLORS[marker.faction] || FACTION_COLORS.friendly).accent;

      let entry = this.entries.get(marker.key);
      const isShared = marker.kind === 'loot_pin' || marker.kind === 'zombie' || marker.kind === 'unexplored_building';

      if (!entry) {
        const tex = getMarkerTexture(marker);
        const material = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          depthTest: false,
        });
        const sprite = new THREE.Sprite(material);
        sprite.userData.key = marker.key;
        sprite.userData.signature = signature;
        sprite.renderOrder = 999;
        this.group.add(sprite);

        // Leader line
        const lineGeo = new THREE.BufferGeometry();
        const posArray = new Float32Array(6);
        lineGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        const lineMat = new THREE.LineBasicMaterial({
          color: new THREE.Color(colorHex),
          transparent: true,
          opacity: marker.isSelected ? 0.85 : 0.45,
          depthWrite: false,
          depthTest: false,
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.renderOrder = 998;
        this.group.add(line);

        // Ground anchor dot
        const dotMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(colorHex),
          transparent: true,
          opacity: marker.isSelected ? 0.85 : 0.45,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
        });
        const anchorDot = new THREE.Mesh(this.circleGeometry, dotMat);
        anchorDot.rotation.x = -Math.PI / 2;
        anchorDot.renderOrder = 997;
        this.group.add(anchorDot);

        const smoother = new PositionSmoother();
        // Markers follow the same buffered render cadence as their entities.
        smoother.setTickWindow(100);
        smoother.snap(marker.x, marker.z);

        entry = {
          key: marker.key,
          marker,
          sprite,
          line,
          anchorDot,
          isSharedTexture: isShared,
          smoother,
        };
        this.entries.set(marker.key, entry);
      } else {
        entry.marker = marker;
        entry.smoother.setTarget(marker.x, marker.z, performance.now());
        if (entry.sprite.userData.signature !== signature) {
          const oldMap = (entry.sprite.material as THREE.SpriteMaterial).map;
          const newMap = getMarkerTexture(marker);
          (entry.sprite.material as THREE.SpriteMaterial).map = newMap;
          (entry.sprite.material as THREE.SpriteMaterial).needsUpdate = true;

          if (oldMap && !entry.isSharedTexture) {
            oldMap.dispose();
          }
          entry.isSharedTexture = isShared;

          const lineMat = entry.line.material as THREE.LineBasicMaterial;
          lineMat.color.set(colorHex);
          lineMat.opacity = marker.isSelected ? 0.75 : 0.35;

          const dotMat = entry.anchorDot.material as THREE.MeshBasicMaterial;
          dotMat.color.set(colorHex);
          dotMat.opacity = marker.isSelected ? 0.75 : 0.35;
        }
        entry.sprite.userData.signature = signature;
      }
    }

    // Remove deleted markers
    for (const [key, entry] of this.entries.entries()) {
      if (!active.has(key)) {
        this.group.remove(entry.sprite);
        const map = (entry.sprite.material as THREE.SpriteMaterial).map;
        if (map && !entry.isSharedTexture) map.dispose();
        (entry.sprite.material as THREE.SpriteMaterial).dispose();

        this.group.remove(entry.line);
        entry.line.geometry.dispose();
        (entry.line.material as THREE.LineBasicMaterial).dispose();

        this.group.remove(entry.anchorDot);
        (entry.anchorDot.material as THREE.MeshBasicMaterial).dispose();

        this.entries.delete(key);
      }
    }
  }

  public update(camera: THREE.Camera, canvasHeight: number) {
    if (!this.group.visible || this.entries.size === 0) return;

    const isPerspective = (camera as THREE.PerspectiveCamera).isPerspectiveCamera;
    const persCam = camera as THREE.PerspectiveCamera;
    const height = Math.max(canvasHeight || (typeof window !== 'undefined' ? window.innerHeight : 800), 1);
    const fovFactor = isPerspective
      ? (2 * Math.tan(THREE.MathUtils.degToRad(persCam.fov / 2))) / height
      : 1 / height;

    for (const entry of this.entries.values()) {
      const { marker, sprite, line, anchorDot } = entry;

      // Glide the marker between simulation ticks so badges follow their units
      // fluidly instead of snapping every 100ms. When paused, park at the exact
      // sim position so labels stop sliding the moment the game freezes.
      let mX: number, mZ: number;
      if (this.paused) {
        const t = entry.smoother.targetPosition();
        mX = t.x; mZ = t.z;
      } else {
        const pos = entry.smoother.sample(performance.now());
        mX = pos.x; mZ = pos.z;
      }

      const anchorY = marker.anchorY !== undefined ? marker.anchorY : Math.max(0, marker.y - 3.2);
      const isCircular =
        marker.kind === 'zombie' ||
        marker.kind === 'lair' ||
        marker.kind === 'unexplored_building' ||
        (marker.kind === 'survivor' && marker.faction === 'unknown');

      const isLootPin = marker.kind === 'loot_pin';
      const isDetailedLoot = isLootPin && marker.detailMode === 'detailed';

      // Target fixed screen height in CSS pixels across zoom
      let targetPxH = 46;
      let aspect = BADGE_W / BADGE_H;

      if (isCircular) {
        targetPxH = 34;
        aspect = 1.0;
      } else if (isLootPin) {
        if (isDetailedLoot) {
          targetPxH = 44;
          aspect = PIN_DETAILED_W / PIN_DETAILED_H;
        } else {
          targetPxH = 36;
          aspect = PIN_MINIMAL_W / PIN_MINIMAL_H;
        }
      } else if (marker.kind === 'street_label') {
        targetPxH = 26;
        aspect = 280 / 70;
      }

      let worldHeight: number;
      if (isPerspective) {
        const dist = persCam.position.distanceTo(new THREE.Vector3(marker.x, anchorY, marker.z));
        worldHeight = targetPxH * fovFactor * dist;
      } else {
        const orthoCam = camera as THREE.OrthographicCamera;
        const vHeight = (orthoCam.top - orthoCam.bottom) / (orthoCam.zoom || 1);
        worldHeight = (targetPxH / height) * vHeight;
      }

      const worldWidth = worldHeight * aspect;

      // 1. Set fixed visual screen size
      sprite.scale.set(worldWidth, worldHeight, 1);

      // 2. Float elevation above ground entity
      const floatElevation = anchorY + Math.max(2.4, worldHeight * 0.95 + 1.2);
      sprite.position.set(mX, floatElevation, mZ);

      // 3. Leader line
      const badgeBottomY = floatElevation - worldHeight * 0.44;
      const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
      const array = posAttr.array as Float32Array;
      array[0] = mX;
      array[1] = anchorY + 0.08;
      array[2] = mZ;
      array[3] = mX;
      array[4] = Math.max(anchorY + 0.1, badgeBottomY);
      array[5] = mZ;
      posAttr.needsUpdate = true;

      // 4. Ground anchor ring
      anchorDot.position.set(mX, anchorY + 0.04, mZ);
      const dotScale = Math.max(0.6, Math.min(3.0, worldHeight * 0.4));
      anchorDot.scale.set(dotScale, dotScale, dotScale);
    }
  }

  public raycastMarker(raycaster: THREE.Raycaster): { key: string; kind: EntityMarkerKind; id: string } | null {
    if (!this.group.visible || this.entries.size === 0) return null;
    const sprites: THREE.Sprite[] = [];
    for (const entry of this.entries.values()) {
      sprites.push(entry.sprite);
    }
    const intersects = raycaster.intersectObjects(sprites, false);
    if (intersects.length > 0) {
      const hitSprite = intersects[0].object as THREE.Sprite;
      const key = hitSprite.userData?.key;
      if (key && this.entries.has(key)) {
        const marker = this.entries.get(key)!.marker;
        let id = key;
        if (key.startsWith('loot_')) id = String(marker.buildingId || key.replace('loot_', ''));
        else if (key.startsWith('vehicle_')) id = key.replace('vehicle_', '');
        else if (key.startsWith('squad_')) id = key.replace('squad_', '');
        else if (key.startsWith('survivor_')) id = key.replace('survivor_', '');
        else if (key.startsWith('zombie_')) id = key.replace('zombie_', '');
        return { key, kind: marker.kind, id };
      }
    }
    return null;
  }

  public dispose() {
    for (const [key, entry] of this.entries.entries()) {
      this.group.remove(entry.sprite);
      const map = (entry.sprite.material as THREE.SpriteMaterial).map;
      if (map && !entry.isSharedTexture) map.dispose();
      (entry.sprite.material as THREE.SpriteMaterial).dispose();

      this.group.remove(entry.line);
      entry.line.geometry.dispose();
      (entry.line.material as THREE.LineBasicMaterial).dispose();

      this.group.remove(entry.anchorDot);
      (entry.anchorDot.material as THREE.MeshBasicMaterial).dispose();
    }
    this.entries.clear();
    this.circleGeometry.dispose();
  }
}
