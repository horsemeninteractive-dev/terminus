import * as THREE from 'three';
import { BuildingCategory } from '../types/map';

/**
 * Procedural building facades & roofs — drawn once per (category, variant) and
 * shared across every building of that type so the LOD merge stays intact.
 *
 * UV convention (matches WorldUVGenerator in three's ExtrudeGeometry):
 *  - Side walls: u = world meters along the wall, v = 1 - height_meters.
 *    The wall material repeat is (1/18, -1/18) with offset.y = 1/18 so the
 *    tile spans 18m (six storeys) and the ground floor sits at the image
 *    bottom. A tall tile means doors/shopfronts appear only once, at street
 *    level, instead of repeating on every storey of tall buildings.
 *  - Roof caps: u/v = world X / -Z in meters; repeat = 1/4 per 4m tile.
 */

export interface FacadeStyle {
  base: string;
  pattern: 'brick' | 'render' | 'panel' | 'corrugated' | 'glass';
  upperWindows: boolean;
  groundFloor: 'shopfront' | 'door' | 'rollup' | 'blank';
  windowColor: string;
  accent: string;
  grime: number;
}

export type RoofStyle = { kind: 'gravel' | 'corrugated' | 'membrane' | 'tiles' | 'slate'; base: string; dark: string; light: string };

/**
 * Per-category FACADE VARIANT palettes. Each category offers several clearly
 * distinct looks (different base materials, patterns and colour families) so
 * neighbouring buildings of the same OSM type read as individual structures
 * instead of clones — a brick terrace next to a pebbledash house next to a
 * painted render, a red-brick high street next to a glass shopfront block.
 */
const FACADE_STYLES: Record<BuildingCategory, FacadeStyle[]> = {
  residential: [
    { base: '#8a5a3e', pattern: 'brick', upperWindows: true, groundFloor: 'door', windowColor: '#2b3a46', accent: '#c9a87e', grime: 0.55 }, // brown-red brick terrace
    { base: '#b0a78f', pattern: 'render', upperWindows: true, groundFloor: 'door', windowColor: '#31424e', accent: '#d3c9b2', grime: 0.45 }, // pebbledash cream
    { base: '#9c4a35', pattern: 'brick', upperWindows: true, groundFloor: 'door', windowColor: '#24333f', accent: '#d9b18a', grime: 0.5 }, // red brick
  ],
  commercial: [
    { base: '#99a2ac', pattern: 'panel', upperWindows: true, groundFloor: 'shopfront', windowColor: '#1f2f3d', accent: '#c7d0d8', grime: 0.4 },
    { base: '#b6a892', pattern: 'render', upperWindows: true, groundFloor: 'shopfront', windowColor: '#2b3944', accent: '#d6c9b4', grime: 0.45 }, // cream stucco high street
    { base: '#94503a', pattern: 'brick', upperWindows: true, groundFloor: 'shopfront', windowColor: '#1e2c36', accent: '#d0b390', grime: 0.5 }, // brick shop terrace
  ],
  supermarket: [
    { base: '#bcc3c9', pattern: 'panel', upperWindows: false, groundFloor: 'shopfront', windowColor: '#16222c', accent: '#e5e9ee', grime: 0.35 },
    { base: '#a6b0b6', pattern: 'panel', upperWindows: false, groundFloor: 'shopfront', windowColor: '#1a2830', accent: '#d3dde2', grime: 0.4 },
    { base: '#c9c1b2', pattern: 'render', upperWindows: false, groundFloor: 'shopfront', windowColor: '#1f2a30', accent: '#e6ddcb', grime: 0.3 }, // big-box stucco
  ],
  pharmacy: [
    { base: '#c3c9cf', pattern: 'render', upperWindows: true, groundFloor: 'shopfront', windowColor: '#22323f', accent: '#eef1f4', grime: 0.3 },
    { base: '#d3d5cf', pattern: 'render', upperWindows: true, groundFloor: 'shopfront', windowColor: '#2b3940', accent: '#f2f2e9', grime: 0.28 },
    { base: '#b4c0c4', pattern: 'panel', upperWindows: true, groundFloor: 'shopfront', windowColor: '#22333c', accent: '#dbe6e8', grime: 0.35 },
  ],
  hospital: [
    { base: '#b9c4c8', pattern: 'panel', upperWindows: true, groundFloor: 'door', windowColor: '#2b3e48', accent: '#e2eaec', grime: 0.35 },
    { base: '#cdd4d5', pattern: 'render', upperWindows: true, groundFloor: 'door', windowColor: '#33434a', accent: '#f0f4f4', grime: 0.3 },
    { base: '#a9b6bb', pattern: 'panel', upperWindows: true, groundFloor: 'door', windowColor: '#243740', accent: '#d5e1e5', grime: 0.4 },
  ],
  police: [
    { base: '#8d959d', pattern: 'panel', upperWindows: true, groundFloor: 'door', windowColor: '#1c2b36', accent: '#c3ccd4', grime: 0.45 },
    { base: '#7e6b57', pattern: 'brick', upperWindows: true, groundFloor: 'door', windowColor: '#202d36', accent: '#ad9780', grime: 0.5 },
    { base: '#a2a69f', pattern: 'render', upperWindows: true, groundFloor: 'door', windowColor: '#26323b', accent: '#cdd1c8', grime: 0.4 },
  ],
  gas_station: [
    { base: '#c6cbd1', pattern: 'render', upperWindows: false, groundFloor: 'shopfront', windowColor: '#24323d', accent: '#f2f4f6', grime: 0.3 },
    { base: '#b6bcc3', pattern: 'panel', upperWindows: false, groundFloor: 'shopfront', windowColor: '#1d2a33', accent: '#e1e6ea', grime: 0.35 },
    { base: '#cfc8ba', pattern: 'render', upperWindows: false, groundFloor: 'shopfront', windowColor: '#2a353d', accent: '#f0ead9', grime: 0.28 },
  ],
  industrial: [
    { base: '#6d7178', pattern: 'corrugated', upperWindows: false, groundFloor: 'rollup', windowColor: '#33383e', accent: '#8a9098', grime: 0.7 }, // grey steel
    { base: '#7a5a4c', pattern: 'corrugated', upperWindows: false, groundFloor: 'rollup', windowColor: '#3a2f2a', accent: '#98725f', grime: 0.75 }, // rusted brown
    { base: '#54707c', pattern: 'corrugated', upperWindows: false, groundFloor: 'rollup', windowColor: '#263942', accent: '#73919c', grime: 0.6 }, // blue-grey steel
  ],
  warehouse: [
    { base: '#767b82', pattern: 'corrugated', upperWindows: false, groundFloor: 'rollup', windowColor: '#2e343a', accent: '#92989f', grime: 0.65 },
    { base: '#6c5d52', pattern: 'corrugated', upperWindows: false, groundFloor: 'rollup', windowColor: '#332b26', accent: '#8c7a6c', grime: 0.7 }, // weathered brown
    { base: '#565f67', pattern: 'corrugated', upperWindows: false, groundFloor: 'rollup', windowColor: '#232c33', accent: '#747f89', grime: 0.7 }, // charcoal
  ],
  civic: [
    { base: '#9a958c', pattern: 'render', upperWindows: true, groundFloor: 'door', windowColor: '#26333c', accent: '#c9c2b4', grime: 0.4 }, // stone
    { base: '#b2ad9f', pattern: 'render', upperWindows: true, groundFloor: 'door', windowColor: '#2f3a40', accent: '#ddd6c5', grime: 0.35 }, // pale limestone
    { base: '#7d5a44', pattern: 'brick', upperWindows: true, groundFloor: 'door', windowColor: '#222e36', accent: '#a98d72', grime: 0.5 }, // brick civic block
  ],
  school: [
    { base: '#9d7f63', pattern: 'brick', upperWindows: true, groundFloor: 'door', windowColor: '#31424e', accent: '#c3a98a', grime: 0.4 },
    { base: '#a05239', pattern: 'brick', upperWindows: true, groundFloor: 'door', windowColor: '#2a3942', accent: '#d2a584', grime: 0.45 }, // red-brick school
    { base: '#c4bcab', pattern: 'render', upperWindows: true, groundFloor: 'door', windowColor: '#3a4248', accent: '#e0d8c3', grime: 0.3 }, // pale hall
  ],
  restaurant: [
    { base: '#7c6254', pattern: 'render', upperWindows: true, groundFloor: 'shopfront', windowColor: '#262f36', accent: '#a98a72', grime: 0.5 },
    { base: '#8a4f38', pattern: 'brick', upperWindows: true, groundFloor: 'shopfront', windowColor: '#241f1c', accent: '#c08a68', grime: 0.55 }, // brick pub
    { base: '#4a5056', pattern: 'panel', upperWindows: true, groundFloor: 'shopfront', windowColor: '#131a1f', accent: '#6b747c', grime: 0.55 }, // dark modern
  ],
  other: [
    { base: '#858b91', pattern: 'panel', upperWindows: true, groundFloor: 'door', windowColor: '#2a3944', accent: '#aeb5bb', grime: 0.5 },
    { base: '#8a6a52', pattern: 'brick', upperWindows: true, groundFloor: 'door', windowColor: '#2b3640', accent: '#b39577', grime: 0.5 },
    { base: '#a2a69f', pattern: 'render', upperWindows: true, groundFloor: 'door', windowColor: '#33404a', accent: '#cdd2c9', grime: 0.45 },
  ],
};

// Roofing palettes are muted and roof-like: blue-grey slate and terracotta
// pantiles for houses/schools, grey membrane / gravel / corrugated elsewhere.
// Each facade variant pairs with a roof variant (same index) so a red-brick
// terrace wears terracotta tiles while a stone terrace wears blue-grey slate.
const ROOF_STYLES: Record<BuildingCategory, RoofStyle[]> = {
  residential: [
    { kind: 'slate', base: '#5c6773', dark: '#474f5a', light: '#6f7a87' }, // blue-grey slate
    { kind: 'slate', base: '#414a54', dark: '#313840', light: '#545f6b' }, // charcoal slate
    { kind: 'tiles', base: '#a4583f', dark: '#8a422c', light: '#bd6a4a' }, // terracotta pantiles
  ],
  commercial: [
    { kind: 'membrane', base: '#8e959c', dark: '#757c83', light: '#a7aeb5' },
    { kind: 'gravel', base: '#969a99', dark: '#7d8180', light: '#aeb2b1' },
    { kind: 'membrane', base: '#7d848b', dark: '#666d74', light: '#949ba2' },
  ],
  supermarket: [
    { kind: 'membrane', base: '#9aa1a8', dark: '#7f868d', light: '#b3bac1' },
    { kind: 'membrane', base: '#aab0b4', dark: '#8e9498', light: '#c4cace' },
    { kind: 'membrane', base: '#8b9298', dark: '#727980', light: '#a2a9af' },
  ],
  pharmacy: [
    { kind: 'membrane', base: '#9299a0', dark: '#7a8188', light: '#aab1b8' },
    { kind: 'membrane', base: '#a2a8ab', dark: '#888e91', light: '#bac0c3' },
    { kind: 'membrane', base: '#858d94', dark: '#6d757c', light: '#9da5ac' },
  ],
  hospital: [
    { kind: 'membrane', base: '#99a0a6', dark: '#7f868c', light: '#b0b7bd' },
    { kind: 'gravel', base: '#a7abad', dark: '#8c9092', light: '#c0c4c6' },
    { kind: 'membrane', base: '#8d959b', dark: '#747c82', light: '#a4acb2' },
  ],
  police: [
    { kind: 'gravel', base: '#838a90', dark: '#6b7278', light: '#9aa1a7' },
    { kind: 'slate', base: '#555f6a', dark: '#424a53', light: '#68727d' },
    { kind: 'membrane', base: '#8d9499', dark: '#757c81', light: '#a3aaaf' },
  ],
  gas_station: [
    { kind: 'membrane', base: '#8f969d', dark: '#767d84', light: '#a6adb4' },
    { kind: 'membrane', base: '#9ea4a8', dark: '#848a8e', light: '#b6bcbf' },
    { kind: 'membrane', base: '#b0a89a', dark: '#968e80', light: '#c8c0b2' },
  ],
  industrial: [
    { kind: 'corrugated', base: '#70757b', dark: '#5a5f65', light: '#868b91' },
    { kind: 'corrugated', base: '#6e5a4e', dark: '#58463c', light: '#846e60' }, // rust
    { kind: 'corrugated', base: '#556b74', dark: '#42545c', light: '#69818b' }, // steel blue
  ],
  warehouse: [
    { kind: 'corrugated', base: '#787d83', dark: '#60656b', light: '#90959b' },
    { kind: 'corrugated', base: '#6b5b50', dark: '#54473e', light: '#827064' },
    { kind: 'corrugated', base: '#525c64', dark: '#3e474e', light: '#68737c' },
  ],
  civic: [
    { kind: 'gravel', base: '#8a908f', dark: '#717776', light: '#a1a7a6' },
    { kind: 'slate', base: '#5a6470', dark: '#47505a', light: '#6d7783' },
    { kind: 'membrane', base: '#92999c', dark: '#7a8184', light: '#a9b0b3' },
  ],
  school: [
    { kind: 'slate', base: '#57636e', dark: '#434b56', light: '#68737e' },
    { kind: 'tiles', base: '#a4583f', dark: '#8a422c', light: '#bd6a4a' },
    { kind: 'gravel', base: '#949b9e', dark: '#7b8285', light: '#acb3b6' },
  ],
  restaurant: [
    { kind: 'gravel', base: '#7f8589', dark: '#676d71', light: '#969ca0' },
    { kind: 'slate', base: '#4e5a66', dark: '#3c4650', light: '#606c78' },
    { kind: 'membrane', base: '#8e9499', dark: '#767c81', light: '#a4aaaf' },
  ],
  other: [
    { kind: 'gravel', base: '#81878c', dark: '#697075', light: '#999fa4' },
    { kind: 'slate', base: '#505c68', dark: '#3f4954', light: '#626e7a' },
    { kind: 'membrane', base: '#8f9599', dark: '#777d81', light: '#a6acb0' },
  ],
};

/** Style lookups — variant is clamped per category so tables may differ in length. */
export function facadeStyleFor(category: BuildingCategory, variant: number): FacadeStyle {
  const list = FACADE_STYLES[category];
  return list[variant % list.length];
}

export function roofStyleFor(category: BuildingCategory, variant: number): RoofStyle {
  const list = ROOF_STYLES[category];
  return list[variant % list.length];
}

// Deterministic PRNG so textures are stable across reloads
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

/** Subtle vertical gradient + grime for depth. */
function shadeWall(ctx: CanvasRenderingContext2D, w: number, h: number, grime: number, rng: () => number) {
  // vertical lighting falloff (lighter top, darker base)
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // grime streaks near the ground
  if (grime > 0) {
    for (let i = 0; i < 26 * grime; i++) {
      const x = rng() * w;
      const y = h * (0.82 + rng() * 0.18);
      const len = 8 + rng() * 40;
      ctx.fillStyle = `rgba(30,30,28,${0.03 + rng() * 0.07})`;
      ctx.fillRect(x, y, len, 2 + rng() * 3);
    }
  }
}

function drawBrick(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, rng: () => number) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // Real-world brick scale: the tile spans 18m at 512px (~28px/m), so a brick
  // is ~0.6m × 0.25m → ~17px × 7px. Much finer than the old 3m-wide slabs.
  const rowH = h / Math.round(h / 7);
  const rows = Math.round(h / rowH);
  const brickW = w / 30;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (brickW / 2);
    for (let x = -brickW; x < w + brickW; x += brickW) {
      const tone = rng();
      ctx.fillStyle = tone < 0.5
        ? `rgba(0,0,0,${0.06 + tone * 0.14})`
        : `rgba(255,255,255,${(tone - 0.5) * 0.16})`;
      ctx.fillRect(x + offset + 1, r * rowH + 1, brickW - 2, rowH - 2);
    }
  }
  // mortar lines
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth = 1;
  for (let r = 1; r < rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * rowH);
    ctx.lineTo(w, r * rowH);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (brickW / 2);
    for (let x = offset; x < w; x += brickW) {
      ctx.beginPath();
      ctx.moveTo(x, r * rowH);
      ctx.lineTo(x, (r + 1) * rowH);
      ctx.stroke();
    }
  }
}

function drawRender(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, rng: () => number) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // fine plaster mottling — denser now the tile spans 18m
  for (let i = 0; i < 3800; i++) {
    const a = rng() * 0.06;
    ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(rng() * w, rng() * h, 2, 2);
  }
}

function drawPanel(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, rng: () => number) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // horizontal panel bands (one per storey — tile spans six storeys)
  const bands = 6;
  const bandH = h / bands;
  for (let b = 0; b < bands; b++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)';
    ctx.fillRect(0, b * bandH + 2, w, bandH - 4);
    // panel seams
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, b * bandH, w, 2);
    // vertical seam every ~4m
    for (let x = 0; x < w; x += w / 4.5) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(x, b * bandH + 2, 1.5, bandH - 4);
    }
  }
}

function drawCorrugated(ctx: CanvasRenderingContext2D, w: number, h: number, base: string) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // ~0.25m ribs (18m tile at 512px)
  const ribW = w / 74;
  for (let x = 0; x < w; x += ribW) {
    const g = ctx.createLinearGradient(x, 0, x + ribW, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.14)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, ribW, h);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, w, 2);
}

function drawGlassCurtain(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number) {
  ctx.fillStyle = '#27363f';
  ctx.fillRect(0, 0, w, h);
  // Real pane scale: ~1.6m × 2.4m (18m tile at 512px)
  const cols = 11;
  const rows = 7;
  const cw = w / cols;
  const ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = rng();
      ctx.fillStyle = t < 0.25 ? '#1a2830' : t < 0.5 ? '#2e424d' : t < 0.75 ? '#22333d' : '#1e2d35';
      ctx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4);
      // sky reflection streak
      ctx.fillStyle = 'rgba(160,200,220,0.10)';
      ctx.fillRect(c * cw + 4, r * ch + 4, cw - 8, 3);
    }
  }
  ctx.strokeStyle = '#0f1a20';
  ctx.lineWidth = 2;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(w, r * ch); ctx.stroke();
  }
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, h); ctx.stroke();
  }
}

function drawWindow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, winW: number, winH: number,
  color: string, rng: () => number
) {
  // sill shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x - 2, y + winH, winW + 4, 4);
  // frame
  ctx.fillStyle = '#1a1d20';
  ctx.fillRect(x - 3, y - 3, winW + 6, winH + 6);
  // glass — always dark and abandoned in the albedo; any warm glow comes
  // exclusively from the emissive map at night (powered buildings only)
  ctx.fillStyle = color;
  ctx.fillRect(x, y, winW, winH);
  // glass glint
  ctx.fillStyle = 'rgba(170,205,230,0.14)';
  ctx.fillRect(x + 2, y + 2, winW * 0.45, 2);
  // mullion
  ctx.fillStyle = '#101316';
  ctx.fillRect(x + winW / 2 - 1, y, 2, winH);
}

function drawDoor(ctx: CanvasRenderingContext2D, x: number, y: number, doorW: number, doorH: number, color: string, rng: () => number) {
  // pale threshold step + shadow so the door sits visibly on the ground
  ctx.fillStyle = 'rgba(230,225,214,0.9)';
  ctx.fillRect(x - 3, y + doorH, doorW + 6, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x - 4, y + doorH + 3, doorW + 8, 4);
  // pale frame — makes the door pop against the facade pattern
  ctx.fillStyle = '#d9d2c2';
  ctx.fillRect(x - 3, y - 3, doorW + 6, doorH + 3);
  // door leaf
  ctx.fillStyle = color;
  ctx.fillRect(x, y, doorW, doorH);
  // inset panel
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x + 5, y + 8, doorW - 10, doorH - 22);
  // vertical stile highlight
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(x + doorW - 13, y + 5, 5, doorH - 12);
  // bright handle
  ctx.fillStyle = '#e8e2d2';
  ctx.fillRect(x + doorW - 10, y + doorH / 2 - 5, 4, 10);
}

function drawShopfront(ctx: CanvasRenderingContext2D, w: number, y0: number, h: number, rng: () => number) {
  // big glazed shopfront with awning + a clearly visible walk-in door
  const pad = 10;
  // awning stripe
  ctx.fillStyle = '#7a1f1f';
  ctx.fillRect(pad, y0 + 2, w - pad * 2, 8);
  ctx.fillStyle = '#d9d4c8';
  for (let x = pad; x < w - pad; x += 16) ctx.fillRect(x, y0 + 2, 8, 8);
  // pale frame around the glazing
  ctx.fillStyle = '#d9d2c2';
  ctx.fillRect(pad, y0 + 12, w - pad * 2, h - 16);
  ctx.fillStyle = '#20262b';
  ctx.fillRect(pad + 3, y0 + 15, w - pad * 2 - 6, h - 22);
  // glass panes — dark & abandoned; glow is emissive-map only
  const panes = 4;
  const pw = (w - pad * 2 - 6 - 38) / panes;
  for (let i = 0; i < panes; i++) {
    ctx.fillStyle = '#142129';
    ctx.fillRect(pad + 3 + i * pw + 4, y0 + 18, pw - 8, h - 30);
    ctx.fillStyle = 'rgba(160,200,220,0.12)';
    ctx.fillRect(pad + 3 + i * pw + 6, y0 + 20, pw * 0.3, 2);
  }
  // walk-in door at the right edge — pale frame so it reads as a door
  drawDoor(ctx, w - pad - 32, y0 + 14, 26, h - 20, '#3d352c', rng);
}

function drawRollup(ctx: CanvasRenderingContext2D, w: number, y0: number, h: number, rng: () => number) {
  const pad = 14;
  // pale frame around the shutter
  ctx.fillStyle = '#d9d2c2';
  ctx.fillRect(pad, y0 + 6, w - pad * 2 - 40, h - 10);
  ctx.fillStyle = '#2c2f33';
  ctx.fillRect(pad + 3, y0 + 9, w - pad * 2 - 46, h - 16);
  // shutter slats
  for (let y = y0 + 10; y < y0 + h; y += 8) {
    ctx.fillStyle = rng() > 0.5 ? '#3a3e43' : '#34383d';
    ctx.fillRect(pad + 3, y, w - pad * 2 - 46, 6);
  }
  // centre roller line + handle
  ctx.fillStyle = '#23262a';
  ctx.fillRect(pad + 3, y0 + h / 2 - 1, w - pad * 2 - 46, 2);
  ctx.fillStyle = '#565c63';
  ctx.fillRect(pad + 3 + (w - pad * 2 - 46) / 2 - 3, y0 + h / 2 - 12, 6, 24);
  // pedestrian door beside the shutter
  drawDoor(ctx, w - pad - 26, y0 + 6, 22, h - 12, '#4a4034', rng);
}

/**
 * Builds the facade (wall) tile, roof tile and window-glow tile for a building
 * category. Tile is 18m wide × 18m tall (six storeys) for walls; roofs tile at
 * 8m. All three textures share the same wrap/repeat so windows align exactly.
 */
export function getBuildingTextureSet(category: BuildingCategory, variant: number): {
  wall: THREE.CanvasTexture;
  roof: THREE.CanvasTexture;
  glow: THREE.CanvasTexture;
  gable: THREE.CanvasTexture;
  wallBump: THREE.CanvasTexture;
  roofBump: THREE.CanvasTexture;
  gableBump: THREE.CanvasTexture;
} {
  const key = `${category}_${variant}`;
  const cached = BuildingTextureCache.get(key);
  if (cached) return cached;

  const style = facadeStyleFor(category, variant);
  const roofStyle = roofStyleFor(category, variant);
  const rng = mulberry32(hashString(key));

  const W = 512;
  const H = 512; // 18m × 18m tile (six storeys) — ground floor at the bottom
  const STOREY = Math.floor(H / 6); // ~85px per storey
  const GROUND_Y = STOREY * 5; // top edge of the ground-floor band

  // Shared window layout — used for both the albedo and the emissive glow map.
  // Windows are vertical (taller than wide), ~1.6m × 2.2m at real scale.
  const winW = 44;
  const winH = 64;
  const winGap = (W - winW * 2) / 3;
  const upperWindowRects: { x: number; y: number }[] = [];
  if (style.upperWindows) {
    for (let s = 5; s >= 1; s--) {
      const yTop = (5 - s) * STOREY;
      const yC = yTop + (STOREY - winH) / 2;
      upperWindowRects.push({ x: winGap, y: yC }, { x: winGap * 2 + winW, y: yC });
    }
  }

  // ---------- SHARED BASE SURFACE ----------
  // Pattern + storey slab lines + cornice + grime shading, WITHOUT windows,
  // doors or shopfronts. Used for the wall tile and, on its own, for the
  // gable-end tile — so a gable reads as the same masonry continuing up the
  // facade instead of a slice of roof material.
  const drawBaseSurface = (ctx: CanvasRenderingContext2D) => {
    switch (style.pattern) {
      case 'brick': drawBrick(ctx, W, H, style.base, rng); break;
      case 'render': drawRender(ctx, W, H, style.base, rng); break;
      case 'panel': drawPanel(ctx, W, H, style.base, rng); break;
      case 'corrugated': drawCorrugated(ctx, W, H, style.base); break;
      case 'glass': drawGlassCurtain(ctx, W, H, rng); break;
    }
    // storey slab lines (floor shadows at each storey boundary)
    for (let s = 1; s < 6; s++) {
      const y = s * STOREY;
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(0, y - 2, W, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, y + 2, W, 2);
    }
    // cornice band along the top of the tile (repeat boundary) — subtle
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, 3, W, 2);
    shadeWall(ctx, W, H, style.grime, rng);
  };

  // ---------- WALL (base + upper windows + ground-floor entrance) ----------
  const [wallCanvas, wallCtx] = makeCanvas(W, H);
  drawBaseSurface(wallCtx);

  // Upper-storey windows — abandoned & dark in the albedo
  for (const r of upperWindowRects) {
    drawWindow(wallCtx, r.x, r.y, winW, winH, style.windowColor, rng);
  }

  // Ground floor — the only storey with doors / shopfronts / roll-up shutters.
  // A pale plinth band separates it from the storeys above and the door / window
  // are drawn large with pale frames so they read clearly at a glance.
  const groundH = H - GROUND_Y;
  wallCtx.fillStyle = 'rgba(255,255,255,0.10)';
  wallCtx.fillRect(0, GROUND_Y - 4, W, 3);
  wallCtx.fillStyle = 'rgba(0,0,0,0.25)';
  wallCtx.fillRect(0, GROUND_Y - 1, W, 2);
  if (style.groundFloor === 'shopfront') drawShopfront(wallCtx, W, GROUND_Y + 8, groundH - 8, rng);
  else if (style.groundFloor === 'rollup') drawRollup(wallCtx, W, GROUND_Y + 8, groundH - 8, rng);
  else if (style.groundFloor === 'door') {
    const gWinW = 54;
    const gWinH = 62;
    drawWindow(wallCtx, 84, GROUND_Y + (groundH - gWinH) / 2, gWinW, gWinH, style.windowColor, rng);
    drawDoor(wallCtx, W - 84 - 60, GROUND_Y + 6, 60, groundH - 14, '#6b4a2f', rng);
  }

  // ---------- GABLE (same facade material, no openings) ----------
  const [gableCanvas, gableCtx] = makeCanvas(W, H);
  drawBaseSurface(gableCtx);

  // ---------- GLOW (lit windows, emissive map) ----------
  const [glowCanvas, glowCtx] = makeCanvas(W, H);
  glowCtx.clearRect(0, 0, W, H);
  // Re-draw windows in warm colour on black; anything not a window stays black.
  if (style.pattern === 'glass') {
    // approximate glass curtain mullions as lit windows
    glowCtx.fillStyle = '#ffd98a';
    const cols = 11, rows = 7, cw = W / cols, ch = H / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (rng() < 0.4) glowCtx.fillRect(c * cw + 4, r * ch + 4, cw - 8, ch - 8);
    }
  } else {
    for (const r of upperWindowRects) {
      if (rng() < 0.45) {
        glowCtx.fillStyle = '#ffd98a';
        glowCtx.fillRect(r.x + 4, r.y + 4, winW - 8, winH - 8);
      }
    }
  }
  if (style.groundFloor === 'shopfront') {
    const pad = 10;
    const panes = 4;
    const pw = (W - pad * 2 - 6 - 38) / panes;
    for (let i = 0; i < panes; i++) if (rng() < 0.4) {
      glowCtx.fillStyle = '#ffd98a';
      glowCtx.fillRect(pad + 3 + i * pw + 7, GROUND_Y + 8 + 20, pw - 12, groundH - 8 - 32);
    }
  } else if (style.groundFloor === 'door') {
    if (rng() < 0.4) {
      glowCtx.fillStyle = '#ffd98a';
      glowCtx.fillRect(88, GROUND_Y + (groundH - 62) / 2 + 4, 46, 54);
    }
  }

  // ---------- ROOF ----------
  const [roofCanvas, roofCtx] = makeCanvas(512, 512); // 4m × 4m tile
  drawRoof(roofCtx, roofStyle, rng);

  // ---------- BUMP MAPS (height relief per surface) ----------
  const bumpRng = mulberry32(hashString('bump:' + key));
  // Shared base-surface relief (no openings): the gable tile uses it as-is and
  // the wall tile gets window/door/shopfront relief stamped on top.
  const [bumpBaseCanvas, baseBumpCtx] = makeCanvas(W, H);
  paintWallRelief(baseBumpCtx, style.pattern, W, H, bumpRng);
  // storey slab shadows + lit lips, parapet/cornice band, street-level grime
  for (let s = 1; s < 6; s++) {
    const y = s * STOREY;
    heightFill(baseBumpCtx, 0, y - 2, W, 2, 66);
    heightFill(baseBumpCtx, 0, y + 1, W, 1, 160);
  }
  heightFill(baseBumpCtx, 0, 0, W, 2, 72);
  heightFill(baseBumpCtx, 0, 2, W, 1, 148);
  heightFill(baseBumpCtx, 0, GROUND_Y - 3, W, 2, 62); // plinth groove above ground floor
  heightFill(baseBumpCtx, 0, H - 3, W, 3, 58); // soot/shadow at the street

  // Wall relief = base + upper windows + ground-floor entrance recesses.
  const [wallBumpCanvas, wallBumpCtx] = makeCanvas(W, H);
  wallBumpCtx.drawImage(bumpBaseCanvas, 0, 0);
  for (const r of upperWindowRects) {
    paintWindowRelief(wallBumpCtx, r.x, r.y, winW, winH);
  }
  if (style.groundFloor === 'shopfront') {
    const pad = 10;
    const y0 = GROUND_Y + 8;
    const sh = groundH - 8;
    heightFill(wallBumpCtx, pad, y0 + 2, W - pad * 2, 8, 132); // awning
    heightFill(wallBumpCtx, pad, y0 + 12, W - pad * 2, sh - 16, 158); // pale frame proud
    heightFill(wallBumpCtx, pad + 3, y0 + 15, W - pad * 2 - 6, sh - 22, 100); // glazing recessed
    const panes = 4;
    const pw = (W - pad * 2 - 6 - 38) / panes;
    for (let i = 1; i < panes; i++) {
      heightFill(wallBumpCtx, pad + 3 + i * pw, y0 + 15, 2, sh - 22, 150); // mullions
    }
    paintWindowRelief(wallBumpCtx, W - pad - 32, y0 + 12, 26, sh - 24); // walk-in door
  } else if (style.groundFloor === 'rollup') {
    const pad = 14;
    const y0 = GROUND_Y + 6;
    const sh = groundH - 10;
    heightFill(wallBumpCtx, pad, y0 + 6, W - pad * 2 - 40, sh - 6, 96); // recessed shutter
    for (let y = y0 + 10; y < y0 + sh; y += 8) {
      heightFill(wallBumpCtx, pad + 3, y, W - pad * 2 - 46, 4, 140); // slat lips
    }
    heightFill(wallBumpCtx, pad + 3, y0 + sh / 2 - 1, W - pad * 2 - 46, 2, 60); // roller groove
    paintWindowRelief(wallBumpCtx, W - pad - 26, y0 + 4, 22, sh - 8); // pedestrian door
  } else if (style.groundFloor === 'door') {
    paintWindowRelief(wallBumpCtx, 84, GROUND_Y + (groundH - 62) / 2, 54, 62); // ground window
    const dx = W - 84 - 60;
    const dy = GROUND_Y + 6;
    const dw = 60;
    const dh = groundH - 14;
    heightFill(wallBumpCtx, dx - 4, dy + dh + 1, dw + 8, 3, 172); // threshold step
    heightFill(wallBumpCtx, dx - 3, dy - 3, dw + 6, dh + 6, 92); // door recess
    heightFill(wallBumpCtx, dx, dy, dw, dh, 118); // door leaf
    heightFill(wallBumpCtx, dx, dy, dw, 2, 140); // lit top edge of the leaf
  }
  if (style.groundFloor !== 'blank') {
    heightFill(wallBumpCtx, 0, GROUND_Y - 1, W, 1, 150);
  }

  // Gable relief is just the shared base surface (same masonry, no openings).
  const [gableBumpCanvas] = [bumpBaseCanvas];

  // Roof relief — same 4m tile convention as the roof albedo.
  const [roofBumpCanvas, roofBumpCtx] = makeCanvas(512, 512);
  paintRoofRelief(roofBumpCtx, roofStyle.kind, mulberry32(hashString('bump:roof:' + key)));

  const wrap = (t: THREE.CanvasTexture) => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  // Bump textures stay in linear space (no sRGB) — heights must reach the
  // shader un-gamma-corrected or the relief would flatten.
  const wrapBump = (t: THREE.CanvasTexture) => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  const wallTex = wrap(new THREE.CanvasTexture(wallCanvas));
  // v = 1 - height_meters, so tile spans 18m: v' = (1-v)/18 → repeat.y = -1/18, offset.y = 1/18
  wallTex.repeat.set(1 / 18, -1 / 18);
  wallTex.offset.set(0, 1 / 18);

  const glowTex = wrap(new THREE.CanvasTexture(glowCanvas));
  glowTex.repeat.set(1 / 18, -1 / 18);
  glowTex.offset.set(0, 1 / 18);

  const roofTex = wrap(new THREE.CanvasTexture(roofCanvas));
  roofTex.repeat.set(1 / 4, 1 / 4);

  // The gable tile is the FACADE material (no windows/doors) and shares the
  // wall tile's 18m metre transform, so masonry courses continue seamlessly
  // from the wall up into the vertical gable triangle.
  const gableTex = wrap(new THREE.CanvasTexture(gableCanvas));
  gableTex.repeat.set(1 / 18, -1 / 18);
  gableTex.offset.set(0, 1 / 18);

  // Height textures mirror their albedo's repeat/offset exactly.
  const wallBumpTex = wrapBump(new THREE.CanvasTexture(wallBumpCanvas));
  wallBumpTex.repeat.set(1 / 18, -1 / 18);
  wallBumpTex.offset.set(0, 1 / 18);
  const roofBumpTex = wrapBump(new THREE.CanvasTexture(roofBumpCanvas));
  roofBumpTex.repeat.set(1 / 4, 1 / 4);
  const gableBumpTex = wrapBump(new THREE.CanvasTexture(gableBumpCanvas));
  gableBumpTex.repeat.set(1 / 18, -1 / 18);
  gableBumpTex.offset.set(0, 1 / 18);

  const set = {
    wall: wallTex,
    roof: roofTex,
    glow: glowTex,
    gable: gableTex,
    wallBump: wallBumpTex,
    roofBump: roofBumpTex,
    gableBump: gableBumpTex,
  };
  BuildingTextureCache.set(key, set);
  return set;
}

function drawRoof(
  ctx: CanvasRenderingContext2D,
  style: { kind: 'gravel' | 'corrugated' | 'membrane' | 'tiles' | 'slate'; base: string; dark: string; light: string },
  rng: () => number
) {
  const S = 512;
  const { kind, base, dark, light } = style;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  if (kind === 'gravel') {
    for (let i = 0; i < 4200; i++) {
      ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${rng() * 0.09})` : `rgba(0,0,0,${rng() * 0.09})`;
      ctx.fillRect(rng() * S, rng() * S, 1.5 + rng() * 2.5, 1.5 + rng() * 2);
    }
  } else if (kind === 'slate') {
    // Natural blue-grey slate: rectangular slates laid in staggered courses.
    // Each slate reads as a thin rectangle (wider than tall) with a hard
    // head-lap shadow where the course above overlaps it, and a bright top
    // edge where it catches the light — NOT a brick pattern. Tile is 4m so a
    // slate is ~0.33m × 0.2m — proper slating, not oversized slabs.
    const rows = 20;
    const rowH = S / rows;
    const slateW = S / 12;
    for (let r = 0; r < rows; r++) {
      // half-width stagger so vertical joints never line up between courses
      const off = (r % 2) * (slateW / 2);
      const y = r * rowH;
      // dark head-lap line: the course above tucks under this course
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(-slateW, y, S + slateW * 2, 2.5);
      for (let x = -slateW; x < S + slateW; x += slateW) {
        const tx = x + off;
        // per-slate tone variance (some lighter, some darker natural slate)
        const tone = rng();
        ctx.fillStyle = tone < 0.35 ? dark : tone > 0.82 ? light : base;
        ctx.fillRect(tx + 1.5, y + 3, slateW - 3, rowH - 4);
        // bright top edge (slate catches light)
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(tx + 2, y + 3, slateW - 4, 2);
        // soft vertical joint between neighbours
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(tx + slateW - 1.5, y + 4, 1.5, rowH - 6);
      }
    }
  } else if (kind === 'corrugated') {
    // finer ribs (~0.25m at the 8m tile scale)
    const rib = S / 32;
    for (let x = 0; x < S; x += rib) {
      const g = ctx.createLinearGradient(x, 0, x + rib, 0);
      g.addColorStop(0, `rgba(255,255,255,0.14)`);
      g.addColorStop(0.5, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,0.20)`);
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, rib, S);
    }
  } else if (kind === 'membrane') {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let x = 0; x < S; x += S / 4) ctx.fillRect(x, 0, 2, S);
    for (let y = 0; y < S; y += S / 4) ctx.fillRect(0, y, S, 2);
    // sheen
    const g = ctx.createRadialGradient(S * 0.3, S * 0.3, 40, S * 0.3, S * 0.3, S * 0.9);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  } else {
    // Overlapping roof tiles — staggered courses with a top highlight and a
    // dark underlap shadow, so each tile reads as a curved pantile / slate
    // rather than a brick course. ~0.4m per course, ~0.5m per tile.
    const rows = 20;
    const rowH = S / rows;
    const tileW = S / 16;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (tileW / 2);
      const y = r * rowH;
      // course underlap shadow (this course tucks under the one above)
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(-tileW, y, S + tileW * 2, 2);
      for (let x = -tileW; x < S + tileW; x += tileW) {
        const tx = x + off;
        // slight per-tile tone variance
        ctx.fillStyle = rng() > 0.5 ? light : dark;
        ctx.fillRect(tx + 1, y + 2, tileW - 2, rowH - 2);
        // rounded top highlight (sun catching the tile's curve)
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(tx + 2, y + 2, tileW - 4, Math.max(1, rowH * 0.22));
        // bottom shadow where the tile slides under the next course
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(tx + 1, y + rowH - 3, tileW - 2, 2);
        // vertical grout gap between neighbouring tiles
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(tx + tileW - 1, y + 2, 1.5, rowH - 4);
      }
    }
  }

  // Soft edge vignette so tiles blend into each other instead of showing a hard
  // 4m grid; the building's own silhouette reads the parapet via EdgesGeometry.
  const vig = ctx.createRadialGradient(S / 2, S / 2, S * 0.35, S / 2, S / 2, S * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, S, S);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// BUMP / HEIGHT maps — grayscale relief companions to the albedo tiles. A flat
// painted texture has no physical depth: lighting cannot tell a mortar joint
// from a brick face or a slate course from a shadow. Each surface gets a
// matching height canvas (128 = flat, >128 raised, <128 recessed) exposed to
// the material as a bumpMap, so the sun actually rakes across brick courses,
// tile overlaps, corrugated ribs and wood grain instead of reading as paint.
// ---------------------------------------------------------------------------

/** Fills a rect with a single 0..255 height value (r,g,b identical). */
function heightFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number) {
  ctx.fillStyle = `rgb(${Math.round(v)},${Math.round(v)},${Math.round(v)})`;
  ctx.fillRect(x, y, w, h);
}

/**
 * Wall-surface relief — one wave / course per albedo feature. Geometry
 * (row counts, staggering, rib widths) deliberately mirrors drawBrick /
 * drawRender / drawPanel / drawCorrugated / drawGlassCurtain so the height
 * shading lands exactly on the painted joints, not a few pixels off.
 */
function paintWallRelief(ctx: CanvasRenderingContext2D, pattern: FacadeStyle['pattern'], w: number, h: number, rng: () => number) {
  if (pattern === 'brick') {
    // mortar read as the recessed backdrop; brick faces sit proud with a
    // lit top bevel and a darker lower lip, plus per-brick tone.
    heightFill(ctx, 0, 0, w, h, 92);
    const rowH = h / Math.round(h / 7);
    const rows = Math.round(h / rowH);
    const brickW = w / 30;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (brickW / 2);
      for (let x = -brickW; x < w + brickW; x += brickW) {
        const bx = x + offset + 1;
        heightFill(ctx, bx, r * rowH + 1, brickW - 2, rowH - 2, 146 + rng() * 22);
        heightFill(ctx, bx, r * rowH + 1, brickW - 2, 2, 186); // sun-lit top edge
        heightFill(ctx, bx, r * rowH + rowH - 4, brickW - 2, 2, 122); // shadowed lower lip
      }
    }
    heightFill(ctx, 0, 0, w, 1, 70);
    heightFill(ctx, 0, h - 1, w, 1, 70);
  } else if (pattern === 'render') {
    // pebbledash: fine stucco grain poking above / below the flat plane
    heightFill(ctx, 0, 0, w, h, 128);
    for (let i = 0; i < 4200; i++) {
      heightFill(ctx, rng() * w, rng() * h, 2, 2, rng() > 0.5 ? 150 + rng() * 22 : 96 + rng() * 18);
    }
  } else if (pattern === 'panel') {
    // raised concrete/brick storey panels with recessed seams between them
    heightFill(ctx, 0, 0, w, h, 130);
    const bands = 6;
    const bandH = h / bands;
    for (let b = 0; b < bands; b++) {
      heightFill(ctx, 0, b * bandH, w, 2, 64); // seam groove
      heightFill(ctx, 0, b * bandH + 3, w, 2, 168); // lit lower lip of the panel above
      for (let x = 0; x < w; x += w / 4.5) {
        heightFill(ctx, x, b * bandH + 2, 1.5, bandH - 4, 88); // vertical seams
      }
    }
    heightFill(ctx, 0, h - 2, w, 2, 70);
  } else if (pattern === 'corrugated') {
    // true sine-wave sheet metal — continuous relief, ridges catch light
    const ribW = w / 74;
    for (let x = 0; x < w; x++) {
      const v = 128 + 52 * Math.cos(((x % ribW) / ribW) * Math.PI * 2);
      heightFill(ctx, x, 0, 1, h, v);
    }
    heightFill(ctx, 0, 0, w, 2, 76);
  } else {
    // glass curtain wall: mullions recessed, panes flush but lightly sheened
    heightFill(ctx, 0, 0, w, h, 128);
    const cols = 11;
    const rows = 7;
    const cw = w / cols;
    const ch = h / rows;
    heightFill(ctx, 0, 0, w, 1, 82);
    for (let r = 0; r <= rows; r++) heightFill(ctx, 0, r * ch, w, 2, 70);
    for (let c = 0; c <= cols; c++) heightFill(ctx, c * cw, 0, 2, h, 70);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        heightFill(ctx, c * cw + 4, r * ch + 4, (cw - 8) * 0.4, 1, 160); // sky glint
      }
    }
  }
}

/** Recessed window relief: dark reveal, flush glass, sill that catches light. */
function paintWindowRelief(ctx: CanvasRenderingContext2D, x: number, y: number, winW: number, winH: number) {
  heightFill(ctx, x - 4, y + winH, winW + 8, 3, 178); // sill lip
  heightFill(ctx, x - 4, y + winH + 3, winW + 8, 3, 92); // sill shadow below
  heightFill(ctx, x - 3, y - 3, winW + 6, winH + 8, 96); // deep frame reveal
  heightFill(ctx, x - 3, y - 3, winW + 6, 2, 150); // lit top of the frame
  heightFill(ctx, x, y, winW, winH, 118); // glass set back from the frame
  heightFill(ctx, x, y, winW, 2, 138);
  heightFill(ctx, x + winW / 2 - 1, y, 2, winH, 156); // centre mullion proud
}

/**
 * Roof relief matching drawRoof's five kinds — slates/tiles get a lit top
 * edge and recessed head-lap / joints, corrugated gets its ribs, membrane its
 * seams and gravel a rough bumpy bed.
 */
function paintRoofRelief(ctx: CanvasRenderingContext2D, kind: RoofStyle['kind'], rng: () => number) {
  const S = 512;
  if (kind === 'gravel') {
    heightFill(ctx, 0, 0, S, S, 128);
    for (let i = 0; i < 4200; i++) {
      heightFill(ctx, rng() * S, rng() * S, 1.5 + rng() * 2.5, 1.5 + rng() * 2, rng() > 0.5 ? 150 + rng() * 26 : 92 + rng() * 20);
    }
  } else if (kind === 'slate') {
    heightFill(ctx, 0, 0, S, S, 96);
    const rows = 20;
    const rowH = S / rows;
    const slateW = S / 12;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (slateW / 2);
      const y = r * rowH;
      heightFill(ctx, 0, y, S, 2.5, 64); // head-lap: course above tucks under
      for (let x = -slateW; x < S + slateW; x += slateW) {
        const tx = x + off;
        heightFill(ctx, tx + 1.5, y + 3, slateW - 3, rowH - 4, 148 + rng() * 18);
        heightFill(ctx, tx + 2, y + 3, slateW - 4, 2, 186); // slate edge catches light
        heightFill(ctx, tx + slateW - 1.5, y + 4, 1.5, rowH - 6, 78); // joint
      }
    }
    heightFill(ctx, 0, S - 1, S, 1, 70);
  } else if (kind === 'corrugated') {
    const rib = S / 32;
    for (let x = 0; x < S; x++) {
      const v = 128 + 56 * Math.cos(((x % rib) / rib) * Math.PI * 2);
      heightFill(ctx, x, 0, 1, S, v);
    }
    heightFill(ctx, 0, 0, S, 2, 78);
  } else if (kind === 'membrane') {
    heightFill(ctx, 0, 0, S, S, 124);
    for (let x = 0; x < S; x += S / 4) heightFill(ctx, x, 0, 2, S, 90);
    for (let y = 0; y < S; y += S / 4) heightFill(ctx, 0, y, S, 2, 90);
  } else {
    // terracotta pantiles — rounded raised tiles, deep underlap + grout gaps
    heightFill(ctx, 0, 0, S, S, 92);
    const rows = 20;
    const rowH = S / rows;
    const tileW = S / 16;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (tileW / 2);
      const y = r * rowH;
      heightFill(ctx, 0, y, S, 2, 58); // underlap shadow of course above
      for (let x = -tileW; x < S + tileW; x += tileW) {
        const tx = x + off;
        heightFill(ctx, tx + 1, y + 2, tileW - 2, rowH - 2, 136 + rng() * 18);
        heightFill(ctx, tx + 2, y + 2, tileW - 4, Math.max(1, rowH * 0.24), 178); // sun on the curve
        heightFill(ctx, tx + 1, y + rowH - 3, tileW - 2, 2, 84); // slides under next course
        heightFill(ctx, tx + tileW - 1, y + 2, 1.5, rowH - 4, 66); // grout gap
      }
    }
  }
  // NOTE: no post-blur pass — anything that repaints the whole canvas (even a
  // faint vignette) would flatten the relief that matters for the bump map.
}

const BuildingTextureCache = new Map<string, {
  wall: THREE.CanvasTexture;
  roof: THREE.CanvasTexture;
  glow: THREE.CanvasTexture;
  gable: THREE.CanvasTexture;
  wallBump: THREE.CanvasTexture;
  roofBump: THREE.CanvasTexture;
  gableBump: THREE.CanvasTexture;
}>();

// ---------------------------------------------------------------------------
// Freestanding material textures (walls, towers, gates) — simple tileable
// wood / brick / metal / concrete surfaces.
// ---------------------------------------------------------------------------

export type FreestandingMaterialKind = 'wood' | 'brick' | 'metal' | 'concrete' | 'chainlink' | 'logs';

const FreestandingTextureCache = new Map<string, THREE.CanvasTexture>();

function drawWood(ctx: CanvasRenderingContext2D, S: number, rng: () => number) {
  ctx.fillStyle = '#6b4a22';
  ctx.fillRect(0, 0, S, S);
  const planks = 4;
  const plankH = S / planks;
  for (let p = 0; p < planks; p++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, p * plankH + 1, S, plankH - 2);
    // wood grain
    for (let g = 0; g < 6; g++) {
      const gy = p * plankH + rng() * plankH;
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + rng() * 0.08})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= S; x += 16) ctx.lineTo(x, gy + Math.sin(x / 24 + rng() * 3) * 2);
      ctx.stroke();
    }
  }
  // plank seams
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let p = 1; p < planks; p++) ctx.fillRect(0, p * plankH, S, 2);
  // nail heads
  ctx.fillStyle = '#2e2010';
  for (let p = 0; p < planks; p++) {
    ctx.fillRect(6, p * plankH + 6, 3, 3);
    ctx.fillRect(S - 10, p * plankH + 6, 3, 3);
  }
}

function drawBrickMat(ctx: CanvasRenderingContext2D, S: number, rng: () => number) {
  ctx.fillStyle = '#8a3a20';
  ctx.fillRect(0, 0, S, S);
  const rows = 8;
  const rowH = S / rows;
  const brickW = S / 4;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (brickW / 2);
    for (let x = -brickW; x < S + brickW; x += brickW) {
      const t = rng();
      ctx.fillStyle = t < 0.4 ? '#7c3018' : t < 0.7 ? '#963f22' : '#a34a28';
      ctx.fillRect(x + off + 1, r * rowH + 1, brickW - 2, rowH - 2);
    }
  }
  ctx.strokeStyle = 'rgba(40,15,5,0.6)';
  ctx.lineWidth = 1.5;
  for (let r = 1; r < rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * rowH); ctx.lineTo(S, r * rowH); ctx.stroke(); }
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (brickW / 2);
    for (let x = off; x < S; x += brickW) { ctx.beginPath(); ctx.moveTo(x, r * rowH); ctx.lineTo(x, (r + 1) * rowH); ctx.stroke(); }
  }
}

function drawMetal(ctx: CanvasRenderingContext2D, S: number) {
  ctx.fillStyle = '#5d646b';
  ctx.fillRect(0, 0, S, S);
  const rib = S / 12;
  for (let x = 0; x < S; x += rib) {
    const g = ctx.createLinearGradient(x, 0, x + rib, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.18)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.15)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, rib, S);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, S, 2);
}

/**
 * Vertical stockade staves — individual standing logs side by side. Used for
 * wooden palisade towers/doors so a wooden gate reads as timber, not a slab.
 */
function drawLogStaves(ctx: CanvasRenderingContext2D, S: number, rng: () => number) {
  const LOG_HEXES = ['#7d4e28', '#8a5a30', '#6f4522', '#8f6134', '#7a4a24'];
  const staves = 8;
  const sw = S / staves;
  for (let i = 0; i < staves; i++) {
    const x = i * sw;
    ctx.fillStyle = LOG_HEXES[i % LOG_HEXES.length];
    ctx.fillRect(x + 1, 0, sw - 2, S);
    // dark seam between staves + rounded-edge shading
    ctx.fillStyle = 'rgba(20,10,4,0.5)';
    ctx.fillRect(x, 0, 1.6, S);
    ctx.fillStyle = 'rgba(255,220,180,0.10)';
    ctx.fillRect(x + sw - 3, 0, 1.2, S);
    // vertical grain lines
    ctx.strokeStyle = `rgba(40,22,8,${0.18 + rng() * 0.2})`;
    ctx.lineWidth = 1;
    for (let g = 0; g < 3; g++) {
      const gx = x + 3 + rng() * (sw - 8);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      for (let y = 0; y <= S; y += 24) ctx.lineTo(gx + Math.sin(y / 26 + i) * 1.6, y);
      ctx.stroke();
    }
    // occasional knot
    if (rng() < 0.4) {
      ctx.fillStyle = 'rgba(50,28,12,0.55)';
      ctx.beginPath();
      ctx.ellipse(x + sw / 2 + rng() * 6 - 3, rng() * S, 3.4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // top weathering band so tiles don't read as a hard horizontal join
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, 0, S, 2);
}

/**
 * Chain-link mesh on a TRANSPARENT background — the fence fabric between the
 * posts reads as see-through diamond wire instead of a solid metal slab.
 */
function drawChainLink(ctx: CanvasRenderingContext2D, S: number) {
  ctx.clearRect(0, 0, S, S);
  const d = 11; // diamond pitch in px (≈5cm real chain-link when tiled per 2m)
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(122,136,148,0.9)';
  for (let cy = -1; cy <= S / d + 1; cy++) {
    for (let cx = -1; cx <= S / d + 1; cx++) {
      const x = cx * d;
      const y = cy * d;
      // one diamond link
      ctx.beginPath();
      ctx.moveTo(x, y - d / 2);
      ctx.lineTo(x + d / 2, y);
      ctx.lineTo(x, y + d / 2);
      ctx.lineTo(x - d / 2, y);
      ctx.closePath();
      ctx.stroke();
    }
  }
  // slight weathered tint on the nodes
  ctx.fillStyle = 'rgba(60,72,82,0.35)';
  for (let cy = 0; cy <= S / d; cy++) {
    for (let cx = 0; cx <= S / d; cx++) {
      ctx.fillRect(cx * d - 0.6, cy * d - 0.6, 1.2, 1.2);
    }
  }
}

function drawConcrete(ctx: CanvasRenderingContext2D, S: number, rng: () => number) {
  ctx.fillStyle = '#7c8288';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${rng() * 0.06})` : `rgba(0,0,0,${rng() * 0.06})`;
    ctx.fillRect(rng() * S, rng() * S, 2, 2);
  }
  // panel seams
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, S / 2, S, 2);
  ctx.fillRect(S / 2, 0, 2, S);
}

// Grayscale relief companions for the freestanding wood/brick/metal/concrete/
// logs materials — same tile, wired as bumpMap so planks, bricks, corrugation,
// staves and pour joints read with depth under the sun.
const FreestandingBumpTextureCache = new Map<string, THREE.CanvasTexture>();

function paintFreestandingRelief(ctx: CanvasRenderingContext2D, kind: FreestandingMaterialKind, S: number, rng: () => number) {
  if (kind === 'wood') {
    // raised plank faces, recessed seams, lit top edges
    heightFill(ctx, 0, 0, S, S, 120);
    const planks = 4;
    const plankH = S / planks;
    for (let p = 0; p < planks; p++) {
      heightFill(ctx, 0, p * plankH, S, 2, 64); // seam
      heightFill(ctx, 0, p * plankH + 2, S, plankH - 4, 142 + rng() * 14);
      heightFill(ctx, 0, p * plankH + 2, S, 1, 176); // plank edge catches light
      // fine grain grooves
      for (let g = 0; g < 4; g++) {
        const gy = p * plankH + 4 + rng() * (plankH - 6);
        heightFill(ctx, 0, gy, S, 1, 116);
      }
    }
  } else if (kind === 'brick') {
    heightFill(ctx, 0, 0, S, S, 82); // mortar recessed
    const rows = 8;
    const rowH = S / rows;
    const brickW = S / 4;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (brickW / 2);
      for (let x = -brickW; x < S + brickW; x += brickW) {
        heightFill(ctx, x + off + 1, r * rowH + 1, brickW - 2, rowH - 2, 146 + rng() * 20);
        heightFill(ctx, x + off + 1, r * rowH + 1, brickW - 2, 2, 182);
        heightFill(ctx, x + off + 1, r * rowH + rowH - 4, brickW - 2, 2, 118);
      }
    }
  } else if (kind === 'metal') {
    // corrugated sheet — continuous sine across the tile
    const rib = S / 12;
    for (let x = 0; x < S; x++) {
      const v = 128 + 58 * Math.cos(((x % rib) / rib) * Math.PI * 2);
      heightFill(ctx, x, 0, 1, S, v);
    }
    heightFill(ctx, 0, 0, S, 2, 80);
  } else if (kind === 'concrete') {
    heightFill(ctx, 0, 0, S, S, 128);
    for (let i = 0; i < 900; i++) {
      heightFill(ctx, rng() * S, rng() * S, 2, 2, rng() > 0.5 ? 144 + rng() * 16 : 104 + rng() * 14);
    }
    // construction-joint seams + tie holes
    heightFill(ctx, 0, S / 2 - 1, S, 2, 74);
    heightFill(ctx, S / 2 - 1, 0, 2, S, 74);
    for (let yy = 0; yy < S; yy += S / 4) {
      for (let xx = 0; xx < S; xx += S / 4) {
        heightFill(ctx, xx + S / 8 - 1, yy + S / 8 - 1, 2, 2, 148); // tie pocket lip
        heightFill(ctx, xx + S / 8, yy + S / 8, 1, 1, 70); // recessed tie hole
      }
    }
  } else if (kind === 'logs') {
    // standing rounded staves: recessed seams, convex faces catching light
    heightFill(ctx, 0, 0, S, S, 110);
    const staves = 8;
    const sw = S / staves;
    for (let i = 0; i < staves; i++) {
      const x = i * sw;
      heightFill(ctx, x, 0, 1.6, S, 56); // seam
      for (let c = 1; c < sw - 2; c += 1) {
        const t = c / (sw - 2); // 0 inner → 1 outer edge
        const v = 132 + 40 * Math.sin(Math.PI * Math.min(1, t * 1.25));
        heightFill(ctx, x + c, 0, 1, S, v);
      }
      heightFill(ctx, x + sw - 3, 0, 1.2, S, 150); // lit rounded edge
      for (let g = 0; g < 3; g++) {
        const gx = x + 3 + rng() * (sw - 8);
        heightFill(ctx, gx, 0, 1, S, 96); // grain furrow
      }
    }
  }
}

/** Grayscale bumpMap companion for a freestanding material (null = flat mesh,
 *  e.g. chain-link where the fabric is transparent and depth is meaningless). */
export function getFreestandingBumpTexture(kind: FreestandingMaterialKind): THREE.CanvasTexture | null {
  if (kind === 'chainlink') return null;
  const cached = FreestandingBumpTextureCache.get(kind);
  if (cached) return cached;
  const S = 256;
  const rng = mulberry32(hashString('matbump:' + kind));
  const [canvas, ctx] = makeCanvas(S, S);
  heightFill(ctx, 0, 0, S, S, 128);
  paintFreestandingRelief(ctx, kind, S, rng);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  FreestandingBumpTextureCache.set(kind, tex);
  return tex;
}

/** Tileable material surface for freestanding walls / towers / gates. */
export function getFreestandingMaterialTexture(kind: FreestandingMaterialKind): THREE.CanvasTexture {
  const cached = FreestandingTextureCache.get(kind);
  if (cached) return cached;
  const S = 256;
  const rng = mulberry32(hashString('mat:' + kind));
  const [canvas, ctx] = makeCanvas(S, S);
  if (kind === 'wood') drawWood(ctx, S, rng);
  else if (kind === 'brick') drawBrickMat(ctx, S, rng);
  else if (kind === 'metal') drawMetal(ctx, S);
  else if (kind === 'chainlink') drawChainLink(ctx, S);
  else if (kind === 'logs') drawLogStaves(ctx, S, rng);
  else drawConcrete(ctx, S, rng);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  FreestandingTextureCache.set(kind, tex);
  return tex;
}

/**
 * Number of facade variants per category. Each variant is a genuinely
 * different palette/pattern (see FACADE_STYLES), so a street of same-type
 * buildings reads as a mix of materials rather than clones. Variants stay
 * bounded so the shared-material LOD merge keeps working.
 */
export const BUILDING_TEXTURE_VARIANTS = 3;

/** Deterministic variant for a building id — stable across reloads and state changes. */
export function buildingVariantForId(id: string | number): number {
  return hashString(`bldg:${String(id)}`) % BUILDING_TEXTURE_VARIANTS;
}

// ---------------------------------------------------------------------------
// FLAT ROOF SYSTEM (A–E membrane families)
//
// Pitched/gabled roofs wear the pitched tile/slate textures above; BLOCKY,
// flat-roofed buildings get their own procedural family so a flat slab never
// reuses a gabled-roof texture. Each family is a 4m tile (same UV convention
// as `remapRoofUvs`), with a matching relief bump map and a roughness map that
// carries the rainwater puddle masks (smooth = low value). Weathering — corner
// grime, edge moss, puddle stains, edge wear — is baked into the shared albedo
// so the LOD merge (grouped by material) stays intact; per-building UV
// rotation/offset (see applyFlatRoofUvVariation in BuildingRenderer) breaks
// the tiling repetition city-wide.
//
// Exposed tuning knobs (FlatRoofParams):
//   roughness         base material roughness (also the roughness-map floor),
//                     lower = glossier membrane (TPO), higher = matte (felt)
//   seamSpacingMeters spacing of seams / felt courses / paver joints in metres
//   dirtIntensity     0..1 strength of the baked weathering overlay (grime /
//                     moss / puddle / edge wear)
// ---------------------------------------------------------------------------

export type FlatRoofType = 'gravel' | 'epdm' | 'felt' | 'tpo' | 'paved';

export interface FlatRoofParams {
  roughness: number;
  seamSpacingMeters: number;
  dirtIntensity: number;
}

export interface FlatRoofLook {
  type: FlatRoofType;
  shade: number;
  params: FlatRoofParams;
  albedo: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
}

/** Per-type tile: albedo palette (one entry per shade) + relief params. */
const FLAT_ROOF_PALETTES: Record<FlatRoofType, { shades: string[]; dark: string; light: string; params: FlatRoofParams }> = {
  // A — Gravel ballast: light-mid grey aggregate, harsh speckle, high roughness.
  gravel: {
    shades: ['#9aa0a6', '#a4a9ae', '#8f959c'],
    dark: '#60666d',
    light: '#d3d7db',
    params: { roughness: 0.96, seamSpacingMeters: 4, dirtIntensity: 0.55 },
  },
  // B — EPDM rubber: dark charcoal matte membrane, wide clean seams.
  epdm: {
    shades: ['#2c3034', '#373c41'],
    dark: '#1b1e21',
    light: '#545a60',
    params: { roughness: 0.85, seamSpacingMeters: 2.5, dirtIntensity: 0.45 },
  },
  // C — Mineral felt / bitumen: dark torch-on felt, overlapping courses, flecks.
  felt: {
    shades: ['#4e5155', '#5a5d60'],
    dark: '#33363a',
    light: '#72767b',
    params: { roughness: 0.92, seamSpacingMeters: 1.25, dirtIntensity: 0.62 },
  },
  // D — TPO / reflective: bright single-ply membrane, thin thermal welds.
  tpo: {
    shades: ['#e9e7e0', '#dedbd2'],
    dark: '#b8b5ac',
    light: '#f7f5ef',
    params: { roughness: 0.62, seamSpacingMeters: 3, dirtIntensity: 0.3 },
  },
  // E — Paved / terrace: concrete pavers (player-access & residential flats).
  paved: {
    shades: ['#a9a59a', '#b6b2a6'],
    dark: '#8a8679',
    light: '#cfcbc0',
    params: { roughness: 0.88, seamSpacingMeters: 1, dirtIntensity: 0.5 },
  },
};

/** A 4m roof tile is 512px → 128px per metre. */
const PX_PER_M = 512 / 4;

function shadeColor(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + t));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + t));
  const b = Math.min(255, Math.max(0, (n & 255) + t));
  return `rgb(${r},${g},${b})`;
}

function randEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(rx, ry);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Irregular puddle stains, shared by the albedo (dark) and roughness (smooth) layers. */
function makePuddleBlobs(rng: () => number, count: number): { x: number; y: number; rx: number; ry: number; rot: number; a: number }[] {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: rng() * 512,
      y: rng() * 512,
      rx: 28 + rng() * 70,
      ry: 18 + rng() * 50,
      rot: rng() * Math.PI,
      a: 0.12 + rng() * 0.16,
    });
  }
  return out;
}

/** Shared weathering overlay baked into the albedo tile (corner dirt + moss +
 *  puddle stains + edge wear). Strength follows params.dirtIntensity. */
function paintWeathering(
  ctx: CanvasRenderingContext2D,
  type: FlatRoofType,
  params: FlatRoofParams,
  rng: () => number,
  puddles: { x: number; y: number; rx: number; ry: number; rot: number; a: number }[]
) {
  const S = 512;
  const dirt = params.dirtIntensity;
  const isLight = type === 'tpo';

  // Corner / edge grime — dark irregular wedges bleeding in from each corner.
  const corners: [number, number][] = [[-0.1, -0.1], [1.1, -0.1], [-0.1, 1.1], [1.1, 1.1]];
  for (const [cx, cy] of corners) {
    const g = ctx.createRadialGradient(S * cx, S * cy, 8, S * cx, S * cy, S * (0.32 + rng() * 0.2));
    g.addColorStop(0, `rgba(${isLight ? '58,56,48' : '24,22,18'},${0.30 * dirt})`);
    g.addColorStop(0.55, `rgba(${isLight ? '58,56,48' : '24,22,18'},${0.10 * dirt})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }

  // Moss / algae streaks along the edges (green-grey), heavier on damp types.
  const mossAlpha = (type === 'felt' || type === 'gravel' ? 0.16 : 0.10) * dirt;
  const mossColour = type === 'tpo' || type === 'epdm' ? '78,84,58' : '74,88,50';
  for (let i = 0; i < 7; i++) {
    const edge = Math.floor(rng() * 4);
    const pos = rng() * S;
    const len = 40 + rng() * 130;
    const thick = 6 + rng() * 14;
    ctx.save();
    ctx.translate(edge <= 1 ? pos : edge === 2 ? 0 : S, edge >= 2 ? pos : 0);
    ctx.rotate(edge % 2 === 0 ? 0 : Math.PI / 2);
    ctx.fillStyle = `rgba(${mossColour},${mossAlpha})`;
    ctx.fillRect(-2, 0, len, thick);
    // mottled: punch transparency holes along the streak
    for (let k = 0; k < 5; k++) ctx.clearRect(rng() * len, rng() * thick, 5 + rng() * 12, 2 + rng() * 6);
    ctx.restore();
  }

  // Rainwater puddles — darker, slightly blue-grey stains.
  for (const p of puddles) {
    randEllipse(ctx, p.x, p.y, p.rx, p.ry, p.rot, `rgba(14,18,24,${p.a})`);
    randEllipse(ctx, p.x + p.rx * 0.25, p.y + p.ry * 0.3, p.rx * 0.45, p.ry * 0.4, p.rot, `rgba(10,12,18,${p.a * 0.7})`);
  }

  // Edge wear — lighter chipped flecks + a few dark scratchy short lines along
  // the tile borders, so parapet edges read as worn.
  for (let i = 0; i < 20; i++) {
    const edge = Math.floor(rng() * 4);
    const pos = rng() * S;
    const x = edge <= 1 ? pos : edge === 2 ? rng() * 26 : S - rng() * 26;
    const y = edge >= 2 ? pos : edge === 0 ? rng() * 26 : S - rng() * 26;
    ctx.fillStyle = rng() > 0.5
      ? `rgba(255,255,255,${0.05 * dirt})`
      : `rgba(0,0,0,${0.12 * dirt})`;
    ctx.fillRect(x, y, 2 + rng() * 5, 1 + rng() * 2);
  }
}

function drawFlatRoof(
  ctx: CanvasRenderingContext2D,
  type: FlatRoofType,
  shade: number,
  params: FlatRoofParams,
  rng: () => number
) {
  const S = 512;
  const pal = FLAT_ROOF_PALETTES[type];
  const base = pal.shades[shade % pal.shades.length];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  if (type === 'gravel') {
    // Aggregate stone: layered stone chips + fine speckle, well above the base.
    for (let i = 0; i < 2600; i++) {
      const v = rng();
      ctx.fillStyle = v < 0.3 ? `rgba(255,255,255,${0.10 + rng() * 0.14})`
        : v < 0.7 ? `rgba(0,0,0,${0.08 + rng() * 0.12})`
        : shadeColor(base, rng() > 0.5 ? 18 : -14);
      ctx.fillRect(rng() * S, rng() * S, 2 + rng() * 2.6, 1.6 + rng() * 2.2);
    }
    // a few larger ballast stones for scale
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${0.06 + rng() * 0.1})` : `rgba(0,0,0,${0.10 + rng() * 0.1})`;
      ctx.fillRect(rng() * S, rng() * S, 5 + rng() * 8, 4 + rng() * 6);
    }
  } else if (type === 'epdm') {
    // Matte rubber membrane: soft mottling + wide, cleanly spaced felt seams.
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${0.015 + rng() * 0.02})` : `rgba(0,0,0,${0.02 + rng() * 0.03})`;
      ctx.fillRect(rng() * S, rng() * S, 20 + rng() * 60, 4 + rng() * 22);
    }
    const spacing = PX_PER_M * params.seamSpacingMeters;
    for (let x = spacing / 2; x < S; x += spacing) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x - 1.5, 0, 3, S);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x + 1.5, 0, 1.5, S);
    }
  } else if (type === 'felt') {
    // Torch-on mineral felt: patchy mottling, overlapping lap courses with
    // mineral flecks and scattered bright grains.
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = rng() > 0.5 ? `rgba(0,0,0,${0.03 + rng() * 0.05})` : `rgba(255,255,255,${0.02 + rng() * 0.04})`;
      ctx.fillRect(rng() * S, rng() * S, 16 + rng() * 48, 8 + rng() * 30);
    }
    const courseH = PX_PER_M * params.seamSpacingMeters;
    for (let y = 0; y < S + courseH; y += courseH) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, y + 1, S, Math.max(3, courseH * 0.16)); // underlap shadow
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(0, y + 1, S, 1.5); // lit lip of the course above
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, y + Math.max(4, courseH * 0.2), S, 2);
      // mineral flecks along the lap
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${0.05 + rng() * 0.08})` : `rgba(0,0,0,${0.06 + rng() * 0.08})`;
        ctx.fillRect(rng() * S, y + 2 + rng() * 6, 1.4 + rng() * 2, 1 + rng() * 1.6);
      }
    }
    // fine surface grain
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${0.02 + rng() * 0.03})` : `rgba(0,0,0,${0.02 + rng() * 0.03})`;
      ctx.fillRect(rng() * S, rng() * S, 1.5, 1);
    }
  } else if (type === 'tpo') {
    // Bright single-ply: near-flat sheen + thin thermal weld seams.
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${0.02 + rng() * 0.03})` : `rgba(0,0,0,${0.015 + rng() * 0.025})`;
      ctx.fillRect(rng() * S, rng() * S, 30 + rng() * 80, 3 + rng() * 14);
    }
    const spacing = PX_PER_M * params.seamSpacingMeters;
    for (let x = spacing / 2; x < S; x += spacing) {
      ctx.fillStyle = 'rgba(120,118,110,0.55)';
      ctx.fillRect(x - 0.8, 0, 1.6, S);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x - 0.8 + 1.6, 0, 0.8, S);
    }
    // soft directional sheen
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(120,120,120,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  } else {
    // Paved terrace: square concrete pavers on a running-bond grid with
    // per-paver tone variance and a few chipped joints.
    const paver = PX_PER_M * params.seamSpacingMeters; // 1m pavers
    const rows = Math.ceil(S / paver);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (paver / 2);
      for (let x = -paver + off; x < S + paver; x += paver) {
        const y = r * paver;
        const t = (rng() - 0.5) * 22;
        ctx.fillStyle = shadeColor(base, Math.round(t));
        ctx.fillRect(x + 1.5, y + 1.5, paver - 3.5, paver - 3.5);
        // joint shadow on top + left edges
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x + 1.5, y + 1.5, paver - 3.5, 1.5);
        ctx.fillRect(x + 1.5, y + 1.5, 1.5, paver - 3.5);
        // occasional chipped corner
        if (rng() < 0.12) {
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(x + 3, y + 3, 4 + rng() * 6, 3 + rng() * 5);
        }
      }
    }
  }
}

/** Relief (bump) map for a flat roof family — mirrors the albedo feature placement. */
function drawFlatRoofBump(ctx: CanvasRenderingContext2D, type: FlatRoofType, params: FlatRoofParams, rng: () => number) {
  const S = 512;
  heightFill(ctx, 0, 0, S, S, 126);

  if (type === 'gravel') {
    for (let i = 0; i < 3200; i++) {
      heightFill(ctx, rng() * S, rng() * S, 2 + rng() * 2.4, 1.6 + rng() * 2, rng() > 0.5 ? 154 + rng() * 24 : 92 + rng() * 20);
    }
  } else if (type === 'epdm') {
    heightFill(ctx, 0, 0, S, S, 120);
    const spacing = PX_PER_M * params.seamSpacingMeters;
    for (let x = spacing / 2; x < S; x += spacing) {
      heightFill(ctx, x - 1.5, 0, 3, S, 96); // seam recess
      heightFill(ctx, x + 1.5, 0, 1.5, S, 134); // raised lip
    }
    // fine rubber grain
    for (let i = 0; i < 2600; i++) heightFill(ctx, rng() * S, rng() * S, 1.3, 1 + rng(), rng() > 0.5 ? 134 : 116);
  } else if (type === 'felt') {
    heightFill(ctx, 0, 0, S, S, 118);
    const courseH = PX_PER_M * params.seamSpacingMeters;
    for (let y = 0; y < S + courseH; y += courseH) {
      heightFill(ctx, 0, y + 1, S, 2, 96); // lap recess
      heightFill(ctx, 0, y + 1 + Math.max(3, courseH * 0.16), S, 3, 150); // lit lip
      for (let i = 0; i < 30; i++) heightFill(ctx, rng() * S, y + 2 + rng() * 7, 1.6 + rng() * 2, 1.2 + rng() * 1.5, 140 + rng() * 16);
    }
  } else if (type === 'tpo') {
    const spacing = PX_PER_M * params.seamSpacingMeters;
    for (let x = spacing / 2; x < S; x += spacing) {
      heightFill(ctx, x - 0.8, 0, 1.6, S, 112); // weld recess
      heightFill(ctx, x - 1.8, 0, 1, S, 130);
      heightFill(ctx, x + 0.8, 0, 1, S, 130);
    }
  } else {
    // paved
    heightFill(ctx, 0, 0, S, S, 130);
    const paver = PX_PER_M * params.seamSpacingMeters;
    const rows = Math.ceil(S / paver);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (paver / 2);
      for (let x = -paver + off; x < S + paver; x += paver) {
        const y = r * paver;
        heightFill(ctx, x + 1.5, y + 1.5, paver - 3.5, 1.5, 100); // joint groove
        heightFill(ctx, x + 1.5, y + 1.5, 1.5, paver - 3.5, 100);
        heightFill(ctx, x + 3, y + 2.5, paver - 7, 1.2, 148); // lit top bevel
        heightFill(ctx, x + 2.5, y + 3, 1.2, paver - 7, 148); // lit left bevel
      }
    }
  }
}

/** Roughness map: base = params.roughness·255, puddle blobs much lower (smooth/wet). */
function drawFlatRoofRoughness(
  ctx: CanvasRenderingContext2D,
  type: FlatRoofType,
  params: FlatRoofParams,
  rng: () => number,
  puddles: { x: number; y: number; rx: number; ry: number; rot: number; a: number }[]
) {
  const S = 512;
  const baseV = Math.round(params.roughness * 255);
  heightFill(ctx, 0, 0, S, S, baseV);

  if (type === 'gravel') {
    for (let i = 0; i < 2200; i++) heightFill(ctx, rng() * S, rng() * S, 1.6, 1.2, rng() > 0.5 ? baseV + 12 : baseV - 10);
  } else if (type === 'epdm') {
    for (let i = 0; i < 1500; i++) heightFill(ctx, rng() * S, rng() * S, 1.4, 1.2, baseV - 6 + Math.round(rng() * 12));
  } else if (type === 'felt') {
    for (let i = 0; i < 2000; i++) heightFill(ctx, rng() * S, rng() * S, 1.6, 1.3, baseV - 8 + Math.round(rng() * 14));
  } else if (type === 'tpo') {
    for (let i = 0; i < 700; i++) heightFill(ctx, rng() * S, rng() * S, 1.4, 1.2, baseV + 4 + Math.round(rng() * 8));
  }

  // Puddle masks: smooth (dark) wet patches — matches the albedo stain shapes.
  for (const p of puddles) {
    randEllipse(ctx, p.x, p.y, p.rx, p.ry, p.rot, `rgba(0,0,0,${Math.min(1, p.a * 3.2)})`);
    randEllipse(ctx, p.x + p.rx * 0.25, p.y + p.ry * 0.3, p.rx * 0.45, p.ry * 0.4, p.rot, `rgba(0,0,0,${Math.min(1, p.a * 2.2)})`);
  }
}

const FlatRoofCache = new Map<string, FlatRoofLook>();

/**
 * Shared (LOD-merge-friendly) flat roof material textures for one type+shade.
 * Bump and roughness maps are per-type; the albedo is per-shade. All texture
 * repeat 1/4 (4m tiles, matching the caps' dominant-axis UV remap).
 */
export function getFlatRoofSet(type: FlatRoofType, shade: number): FlatRoofLook {
  const key = `${type}_${shade}`;
  const cached = FlatRoofCache.get(key);
  if (cached) return cached;

  const pal = FLAT_ROOF_PALETTES[type];
  const params = pal.params;
  const rng = mulberry32(hashString('flatroof:' + key));
  const puddles = makePuddleBlobs(mulberry32(hashString('puddles:' + key)), 3);

  const [albedoCanvas, albedoCtx] = makeCanvas(512, 512);
  drawFlatRoof(albedoCtx, type, shade, params, rng);
  paintWeathering(albedoCtx, type, params, mulberry32(hashString('weather:' + key)), puddles);

  const [bumpCanvas, bumpCtx] = makeCanvas(512, 512);
  drawFlatRoofBump(bumpCtx, type, params, mulberry32(hashString('flatbump:' + type)));

  const [roughCanvas, roughCtx] = makeCanvas(512, 512);
  drawFlatRoofRoughness(roughCtx, type, params, mulberry32(hashString('flatrough:' + key)), puddles);

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.repeat.set(1 / 4, 1 / 4);
  albedo.anisotropy = 4;
  albedo.needsUpdate = true;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(1 / 4, 1 / 4);
  bump.anisotropy = 4;
  bump.needsUpdate = true;

  const roughness = new THREE.CanvasTexture(roughCanvas);
  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.repeat.set(1 / 4, 1 / 4);
  roughness.anisotropy = 4;
  roughness.needsUpdate = true;

  const look: FlatRoofLook = { type, shade, params, albedo, bump, roughness };
  FlatRoofCache.set(key, look);
  return look;
}

/**
 * Archetype weighting — picks a flat roof family (and shade) deterministically
 * from the building's id seed, so reloads are stable and neighbouring blocks
 * mix families instead of repeating one texture.
 *   - commercial / industrial → heavy EPDM, TPO, gravel
 *   - residential / outbuildings → heavy mineral felt, gravel
 *   - player-access rooftops (HQ / adapted) → paved terrace
 */
const FLAT_ROOF_WEIGHTS: [FlatRoofType, number][] = [
  ['epdm', 0.26],
  ['gravel', 0.26],
  ['felt', 0.22],
  ['tpo', 0.18],
  ['paved', 0.08],
];

const COMMERCIAL_WEIGHTS: [FlatRoofType, number][] = [
  ['epdm', 0.32],
  ['tpo', 0.30],
  ['gravel', 0.20],
  ['felt', 0.12],
  ['paved', 0.06],
];

const INDUSTRIAL_WEIGHTS: [FlatRoofType, number][] = [
  ['epdm', 0.30],
  ['gravel', 0.30],
  ['tpo', 0.26],
  ['felt', 0.10],
  ['paved', 0.04],
];

const RESIDENTIAL_WEIGHTS: [FlatRoofType, number][] = [
  ['felt', 0.38],
  ['gravel', 0.26],
  ['paved', 0.18],
  ['epdm', 0.12],
  ['tpo', 0.06],
];

const ACCESSIBLE_WEIGHTS: [FlatRoofType, number][] = [
  ['paved', 0.70],
  ['gravel', 0.16],
  ['tpo', 0.10],
  ['epdm', 0.04],
  ['felt', 0.0],
];

const COMMERCIAL_CATS = new Set<BuildingCategory>(['commercial', 'supermarket', 'restaurant', 'pharmacy', 'hospital', 'police', 'school', 'civic', 'gas_station']);
const INDUSTRIAL_CATS = new Set<BuildingCategory>(['industrial', 'warehouse']);

/** Deterministic flat-roof family selection for one building seed. */
export function selectFlatRoof(seed: number, category: BuildingCategory, accessible: boolean): { type: FlatRoofType; shade: number } {
  const rng = mulberry32(seed ^ 0x51ab3f);
  const table = accessible
    ? ACCESSIBLE_WEIGHTS
    : COMMERCIAL_CATS.has(category)
      ? COMMERCIAL_WEIGHTS
      : INDUSTRIAL_CATS.has(category)
        ? INDUSTRIAL_WEIGHTS
        : category === 'residential'
          ? RESIDENTIAL_WEIGHTS
          : FLAT_ROOF_WEIGHTS;
  let roll = rng();
  let type: FlatRoofType = 'gravel';
  for (const [t, w] of table) {
    roll -= w;
    if (roll <= 0) {
      type = t;
      break;
    }
  }
  const shades = FLAT_ROOF_PALETTES[type].shades.length;
  const shade = Math.floor(rng() * shades);
  return { type, shade };
}

/** Human-readable label for debug/UI. */
export function flatRoofLabel(type: FlatRoofType): string {
  switch (type) {
    case 'gravel': return 'Gravel ballast';
    case 'epdm': return 'EPDM rubber';
    case 'felt': return 'Mineral felt';
    case 'tpo': return 'TPO membrane';
    case 'paved': return 'Paved terrace';
  }
}

/** Expose the per-type tuning params (roughness / seam spacing / dirt). */
export function flatRoofParamsFor(type: FlatRoofType): FlatRoofParams {
  return { ...FLAT_ROOF_PALETTES[type].params };
}
