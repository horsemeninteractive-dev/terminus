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
 *  - Roof caps: u/v = world X / -Z in meters; repeat = 1/8 per 8m tile.
 */

interface FacadeStyle {
  base: string;
  pattern: 'brick' | 'render' | 'panel' | 'corrugated' | 'glass';
  upperWindows: boolean;
  groundFloor: 'shopfront' | 'door' | 'rollup' | 'blank';
  windowColor: string;
  accent: string;
  grime: number;
}

const FACADE_STYLES: Record<BuildingCategory, FacadeStyle> = {
  residential: { base: '#8f6b52', pattern: 'brick', upperWindows: true, groundFloor: 'door', windowColor: '#2b3a46', accent: '#c9a87e', grime: 0.55 },
  commercial: { base: '#9aa3ad', pattern: 'panel', upperWindows: true, groundFloor: 'shopfront', windowColor: '#1f2f3d', accent: '#c7d0d8', grime: 0.4 },
  supermarket: { base: '#b8bfc6', pattern: 'panel', upperWindows: false, groundFloor: 'shopfront', windowColor: '#16222c', accent: '#e5e9ee', grime: 0.35 },
  pharmacy: { base: '#c3c9cf', pattern: 'render', upperWindows: true, groundFloor: 'shopfront', windowColor: '#22323f', accent: '#eef1f4', grime: 0.3 },
  hospital: { base: '#b9c4c8', pattern: 'panel', upperWindows: true, groundFloor: 'door', windowColor: '#2b3e48', accent: '#e2eaec', grime: 0.35 },
  police: { base: '#8d959d', pattern: 'panel', upperWindows: true, groundFloor: 'door', windowColor: '#1c2b36', accent: '#c3ccd4', grime: 0.45 },
  gas_station: { base: '#c6cbd1', pattern: 'render', upperWindows: false, groundFloor: 'shopfront', windowColor: '#24323d', accent: '#f2f4f6', grime: 0.3 },
  industrial: { base: '#6d7178', pattern: 'corrugated', upperWindows: false, groundFloor: 'rollup', windowColor: '#33383e', accent: '#8a9098', grime: 0.7 },
  warehouse: { base: '#767b82', pattern: 'corrugated', upperWindows: false, groundFloor: 'rollup', windowColor: '#2e343a', accent: '#92989f', grime: 0.65 },
  civic: { base: '#9a958c', pattern: 'render', upperWindows: true, groundFloor: 'door', windowColor: '#26333c', accent: '#c9c2b4', grime: 0.4 },
  school: { base: '#9d7f63', pattern: 'brick', upperWindows: true, groundFloor: 'door', windowColor: '#31424e', accent: '#c3a98a', grime: 0.4 },
  restaurant: { base: '#7c6254', pattern: 'render', upperWindows: true, groundFloor: 'shopfront', windowColor: '#262f36', accent: '#a98a72', grime: 0.5 },
  other: { base: '#858b91', pattern: 'panel', upperWindows: true, groundFloor: 'door', windowColor: '#2a3944', accent: '#aeb5bb', grime: 0.5 },
};

// Roofing palettes are muted and roof-like: terracotta pantiles and slate for
// houses/schools, grey membrane / gravel / corrugated elsewhere. No brick tones
// and no per-category colour casts — a city of roofs, not coloured blocks.
const ROOF_STYLES: Record<BuildingCategory, { kind: 'gravel' | 'corrugated' | 'membrane' | 'tiles'; base: string; dark: string; light: string }> = {
  residential: { kind: 'tiles', base: '#7e4638', dark: '#5f3226', light: '#9e5d4b' }, // terracotta pantiles
  commercial: { kind: 'membrane', base: '#8e959c', dark: '#757c83', light: '#a7aeb5' },
  supermarket: { kind: 'membrane', base: '#9aa1a8', dark: '#7f868d', light: '#b3bac1' },
  pharmacy: { kind: 'membrane', base: '#9299a0', dark: '#7a8188', light: '#aab1b8' },
  hospital: { kind: 'membrane', base: '#99a0a6', dark: '#7f868c', light: '#b0b7bd' },
  police: { kind: 'gravel', base: '#838a90', dark: '#6b7278', light: '#9aa1a7' },
  gas_station: { kind: 'membrane', base: '#8f969d', dark: '#767d84', light: '#a6adb4' },
  industrial: { kind: 'corrugated', base: '#70757b', dark: '#5a5f65', light: '#868b91' },
  warehouse: { kind: 'corrugated', base: '#787d83', dark: '#60656b', light: '#90959b' },
  civic: { kind: 'gravel', base: '#8a908f', dark: '#717776', light: '#a1a7a6' },
  school: { kind: 'tiles', base: '#5f6a78', dark: '#47515d', light: '#77828f' }, // slate
  restaurant: { kind: 'gravel', base: '#7f8589', dark: '#676d71', light: '#969ca0' },
  other: { kind: 'gravel', base: '#81878c', dark: '#697075', light: '#999fa4' },
};

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
} {
  const key = `${category}_${variant}`;
  const cached = BuildingTextureCache.get(key);
  if (cached) return cached;

  const style = FACADE_STYLES[category];
  const roofStyle = ROOF_STYLES[category];
  const rng = mulberry32(hashString(key));

  const W = 512;
  const H = 512; // 18m × 18m tile (six storeys) — ground floor at the bottom
  const STOREY = Math.floor(H / 6); // ~85px per storey
  const GROUND_Y = STOREY * 5; // top edge of the ground-floor band

  // ---------- WALL ----------
  const [wallCanvas, wallCtx] = makeCanvas(W, H);
  switch (style.pattern) {
    case 'brick': drawBrick(wallCtx, W, H, style.base, rng); break;
    case 'render': drawRender(wallCtx, W, H, style.base, rng); break;
    case 'panel': drawPanel(wallCtx, W, H, style.base, rng); break;
    case 'corrugated': drawCorrugated(wallCtx, W, H, style.base); break;
    case 'glass': drawGlassCurtain(wallCtx, W, H, rng); break;
  }

  // storey slab lines (floor shadows at each storey boundary)
  for (let s = 1; s < 6; s++) {
    const y = s * STOREY;
    wallCtx.fillStyle = 'rgba(0,0,0,0.30)';
    wallCtx.fillRect(0, y - 2, W, 4);
    wallCtx.fillStyle = 'rgba(255,255,255,0.06)';
    wallCtx.fillRect(0, y + 2, W, 2);
  }

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

  // cornice band along the top of the tile (repeat boundary) — subtle
  wallCtx.fillStyle = 'rgba(0,0,0,0.25)';
  wallCtx.fillRect(0, 0, W, 3);
  wallCtx.fillStyle = 'rgba(255,255,255,0.10)';
  wallCtx.fillRect(0, 3, W, 2);

  shadeWall(wallCtx, W, H, style.grime, rng);

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
  const [roofCanvas, roofCtx] = makeCanvas(512, 512); // 8m × 8m tile
  drawRoof(roofCtx, roofStyle, rng);

  const wrap = (t: THREE.CanvasTexture) => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
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
  roofTex.repeat.set(1 / 8, 1 / 8);

  const set = { wall: wallTex, roof: roofTex, glow: glowTex };
  BuildingTextureCache.set(key, set);
  return set;
}

function drawRoof(
  ctx: CanvasRenderingContext2D,
  style: { kind: 'gravel' | 'corrugated' | 'membrane' | 'tiles'; base: string; dark: string; light: string },
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
  // 8m grid; the building's own silhouette reads the parapet via EdgesGeometry.
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

const BuildingTextureCache = new Map<string, { wall: THREE.CanvasTexture; roof: THREE.CanvasTexture; glow: THREE.CanvasTexture }>();

// ---------------------------------------------------------------------------
// Freestanding material textures (walls, towers, gates) — simple tileable
// wood / brick / metal / concrete surfaces.
// ---------------------------------------------------------------------------

export type FreestandingMaterialKind = 'wood' | 'brick' | 'metal' | 'concrete';

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

/** Number of facade variants per category (kept small so LOD merge stays tight). */
export const BUILDING_TEXTURE_VARIANTS = 2;

/** Deterministic variant for a building id — stable across reloads and state changes. */
export function buildingVariantForId(id: string | number): number {
  return hashString(`bldg:${String(id)}`) % BUILDING_TEXTURE_VARIANTS;
}
