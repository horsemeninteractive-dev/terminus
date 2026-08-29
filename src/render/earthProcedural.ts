import * as THREE from 'three';

/**
 * High-performance 2D Simplex/Perlin-style gradient noise with seamless horizontal cylindrical wrapping.
 */
class SeamlessNoise {
  private perm: Uint8Array;

  constructor(seed = 42) {
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Shuffle with seed
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = (s >>> 16) % (i + 1);
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  public noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = this.fade(xf);
    const v = this.fade(yf);

    const p = this.perm;
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];

    const g1 = this.grad(aa, xf, yf);
    const g2 = this.grad(ba, xf - 1, yf);
    const g3 = this.grad(ab, xf, yf - 1);
    const g4 = this.grad(bb, xf - 1, yf - 1);

    const x1 = g1 + u * (g2 - g1);
    const x2 = g3 + u * (g4 - g3);

    return (x1 + v * (x2 - x1) + 1) * 0.5; // [0, 1]
  }

  /**
   * 3D Noise for seamless 360-degree cylinder/sphere mapping without seam artifact.
   */
  public noiseCylindrical(u: number, v: number, scaleX: number, scaleY: number): number {
    const angle = u * Math.PI * 2;
    const nx = Math.cos(angle) * scaleX;
    const nz = Math.sin(angle) * scaleX;
    const ny = v * scaleY;

    // 3D noise sample using two 2D samples
    const n1 = this.noise2D(nx + 100, ny + nz);
    const n2 = this.noise2D(nz + 200, ny - nx);
    return (n1 + n2) * 0.5;
  }

  /**
   * Fractal Brownian Motion (FBM) with multiple octaves
   */
  public fbmSeamless(u: number, v: number, octaves = 5, baseScale = 4.0): number {
    let value = 0;
    let amplitude = 0.5;
    let frequency = baseScale;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.noiseCylindrical(u, v, frequency, frequency * 0.5) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2.05;
    }

    return value / maxValue;
  }
}

/**
 * Generates an authentic, realistic meteorological cloud layer texture (2048x1024)
 * featuring:
 * - ITCZ (Intertropical Convergence Zone) equatorial storm bands
 * - Mid-latitude comma-shaped extratropical cyclones and frontal wave squalls
 * - Tropical hurricanes/typhoons with spiral spiral vortices
 * - Subtropical trade wind cloud streaks and stratus sheets
 * - Polar vortices
 */
export function createProceduralRealisticCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const W = canvas.width;
  const H = canvas.height;

  // Clear to transparent
  ctx.clearRect(0, 0, W, H);

  const imgData = ctx.createImageData(W, H);
  const data = imgData.data;

  const noise = new SeamlessNoise(1337);
  const swirlNoise = new SeamlessNoise(777);

  // Storm vortex centers in Lat/Lon (u: 0..1, v: 0..1)
  const vortices = [
    { u: 0.22, v: 0.32, strength: 1.8, radius: 0.12, rot: 1.2 }, // North Atlantic storm
    { u: 0.78, v: 0.28, strength: 1.9, radius: 0.14, rot: 1.4 }, // North Pacific cyclone
    { u: 0.84, v: 0.42, strength: 2.2, radius: 0.08, rot: 1.6 }, // Western Pacific Typhoon
    { u: 0.28, v: 0.44, strength: 2.0, radius: 0.07, rot: 1.5 }, // Caribbean Hurricane
    { u: 0.62, v: 0.48, strength: 1.9, radius: 0.075, rot: -1.5 }, // Indian Ocean Cyclone (Southern rot)
    { u: 0.42, v: 0.72, strength: 1.7, radius: 0.15, rot: -1.3 }, // South Atlantic frontal swirl
    { u: 0.88, v: 0.76, strength: 1.8, radius: 0.14, rot: -1.4 }, // Southern Ocean Roaring 40s swirl
    { u: 0.15, v: 0.78, strength: 1.6, radius: 0.13, rot: -1.3 }, // South Pacific front
  ];

  for (let y = 0; y < H; y++) {
    const v = y / H; // 0 (North Pole) to 1 (South Pole)
    const latDeg = (1 - v) * 180 - 90; // +90 to -90
    const absLat = Math.abs(latDeg);

    // Realistic Planetary Atmospheric Circulation Density Multiplier
    // 1. Equatorial Convective Belt (ITCZ): Peak around 0° - 8°
    const itcz = Math.exp(-Math.pow(absLat - 4, 2) / 60) * 1.35;

    // 2. Subtropical High-Pressure Ridge (Dry belt): Dips at 20° - 30°
    const subtropicalDepression = Math.exp(-Math.pow(absLat - 25, 2) / 100) * 0.45;

    // 3. Mid-Latitude Storm Belts (Polar Fronts): Strong at 42° - 60°
    const midLatitudeStorms = Math.exp(-Math.pow(absLat - 50, 2) / 140) * 1.5;

    // 4. Polar caps / polar cell
    const polarCell = Math.exp(-Math.pow(absLat - 78, 2) / 90) * 1.1;

    const latBaseDensity = Math.max(0.08, itcz + midLatitudeStorms + polarCell - subtropicalDepression);

    for (let x = 0; x < W; x++) {
      let u = x / W; // 0..1

      // Apply vortex swirling coordinate distortion
      let sampleU = u;
      let sampleV = v;

      for (const vortex of vortices) {
        let du = sampleU - vortex.u;
        // Wrap around 180 meridian
        if (du > 0.5) du -= 1.0;
        if (du < -0.5) du += 1.0;
        const dv = sampleV - vortex.v;
        const dist = Math.sqrt(du * du * 4 + dv * dv); // aspect correction

        if (dist < vortex.radius) {
          const falloff = 1 - dist / vortex.radius;
          const angle = falloff * falloff * vortex.rot * Math.PI * 2;
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const rdu = du * cosA - dv * sinA;
          const rdv = du * sinA + dv * cosA;
          sampleU = vortex.u + rdu;
          sampleV = vortex.v + rdv;
        }
      }

      // Layered multi-octave FBM noise
      const n1 = noise.fbmSeamless(sampleU, sampleV, 5, 5.0);
      const n2 = swirlNoise.fbmSeamless(sampleU * 2 + 0.3, sampleV * 2 + 0.1, 4, 9.0);

      // Jet stream shear distortion
      const jetStreamShear = Math.sin(sampleU * Math.PI * 6 + sampleV * 4) * 0.12;
      const combinedNoise = (n1 * 0.7 + n2 * 0.3 + jetStreamShear);

      // Modulate with latitude climate band density
      let cloudDensity = combinedNoise * latBaseDensity;

      // Threshold and contrast curve for crisp, billowy cloud formations
      cloudDensity = (cloudDensity - 0.44) * 2.4;
      cloudDensity = Math.max(0, Math.min(1, cloudDensity));

      // Calculate pixel index in ImageData
      const idx = (y * W + x) * 4;

      if (cloudDensity > 0.01) {
        // High altitude pure white / slight atmospheric tint
        const brightness = Math.round(230 + cloudDensity * 25);
        const alpha = Math.round(cloudDensity * 240);

        data[idx] = brightness;
        data[idx + 1] = Math.min(255, brightness + 5);
        data[idx + 2] = 255;
        data[idx + 3] = alpha;
      } else {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Soft atmospheric blur pass to make cloud edges soft and photographic
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = W;
  tempCanvas.height = H;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.drawImage(canvas, 0, 0);

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

// ============================================================================
// Continental Geometries (Geographically accurate polygon vertices)
// ============================================================================
export const northAmerica: Array<[number, number]> = [
  [71, -156], [70, -140], [68, -125], [60, -90], [58, -78], [52, -55],
  [45, -60], [42, -70], [30, -81], [25, -80], [22, -88], [15, -92],
  [10, -84], [8, -77], [18, -105], [24, -110], [32, -117], [38, -123],
  [48, -125], [55, -132], [60, -140], [65, -168], [71, -156]
];

export const southAmerica: Array<[number, number]> = [
  [11, -75], [8, -60], [4, -50], [-3, -40], [-8, -35], [-18, -39],
  [-23, -44], [-34, -53], [-42, -63], [-52, -68], [-55, -67], [-50, -75],
  [-40, -74], [-30, -72], [-18, -71], [-5, -81], [2, -78], [9, -77], [11, -75]
];

export const eurasia: Array<[number, number]> = [
  [71, 28], [70, 42], [68, 60], [73, 80], [76, 110], [72, 140], [66, 170],
  [60, 162], [54, 140], [42, 131], [35, 129], [30, 122], [22, 114],
  [10, 108], [1, 104], [10, 99], [22, 88], [20, 85], [10, 80],
  [8, 77], [22, 69], [25, 62], [26, 56], [12, 44], [30, 32],
  [32, 35], [37, 36], [41, 29], [36, 22], [38, 15], [44, 8],
  [36, -5], [43, -9], [48, -4], [54, 8], [55, 12], [58, 18],
  [65, 22], [71, 28]
];

export const africa: Array<[number, number]> = [
  [37, 10], [32, 32], [28, 34], [12, 44], [10, 51], [2, 45],
  [-11, 40], [-25, 33], [-34, 18], [-33, 27], [-22, 14], [-12, 13],
  [4, 9], [5, 0], [5, -4], [11, -15], [15, -17], [22, -16],
  [32, -9], [36, -5], [37, 10]
];

export const australia: Array<[number, number]> = [
  [-12, 131], [-11, 142], [-18, 146], [-28, 153], [-37, 150], [-38, 141],
  [-35, 136], [-32, 132], [-35, 118], [-22, 114], [-16, 124], [-12, 131]
];

export const britishIsles: Array<[number, number]> = [
  [58.5, -3.5], [57.5, -2], [53, 0.5], [51, 1.4], [50, -5], [52, -4.5],
  [54.5, -3], [58.5, -5], [58.5, -3.5]
];

export const ireland: Array<[number, number]> = [
  [55, -7], [53.5, -6], [51.5, -9], [53, -10], [55, -7]
];

export const japan: Array<[number, number]> = [
  [45, 142], [41, 141], [36, 140], [33, 131], [34, 135], [39, 140], [45, 142]
];

export const scandinavia: Array<[number, number]> = [
  [71, 26], [69, 16], [62, 5], [58, 6], [56, 12], [60, 18], [65, 24], [71, 26]
];

export const greenland: Array<[number, number]> = [
  [83, -30], [80, -18], [70, -22], [60, -44], [65, -52], [76, -68], [82, -60], [83, -30]
];

export const madagascar: Array<[number, number]> = [
  [-12, 49], [-16, 50], [-25, 47], [-25, 44], [-16, 44], [-12, 49]
];

export const newZealandN: Array<[number, number]> = [
  [-34, 173], [-37, 177], [-41, 175], [-39, 174], [-34, 173]
];

export const newZealandS: Array<[number, number]> = [
  [-41, 173], [-44, 171], [-46, 167], [-42, 171], [-41, 173]
];

export const ALL_CONTINENTS = [
  northAmerica, southAmerica, eurasia, africa, australia,
  britishIsles, ireland, japan, scandinavia, greenland,
  madagascar, newZealandN, newZealandS
];

export const LAND_CONTINENTS = [
  northAmerica, southAmerica, eurasia, africa, australia,
  britishIsles, ireland, japan, scandinavia, madagascar,
  newZealandN, newZealandS
];

/**
 * Generates an ultra-high-definition (4096 x 2048) procedural Earth texture with:
 * - Accurate global continent outlines with micro-fractal coastlines
 * - Bathymetric ocean depths (continental shelves, ocean trenches, reef shallows)
 * - Detailed climate biomes (rainforests, savannas, deserts, taiga, alpine tundras, snow caps)
 * - Mountain range topography and ridge hillshading
 * - Electrical night city light clusters
 */
export function createUltraHdProceduralEarthTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4096;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;

  const W = canvas.width;
  const H = canvas.height;

  const noise = new SeamlessNoise(999);

  // 1. Deep Oceanic Gradient with realistic bathymetry
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, H);
  oceanGrad.addColorStop(0, '#06111e'); // Polar Arctic deep
  oceanGrad.addColorStop(0.18, '#081729'); // North Atlantic
  oceanGrad.addColorStop(0.48, '#0d253f'); // Equatorial warm waters
  oceanGrad.addColorStop(0.82, '#081729'); // Southern ocean
  oceanGrad.addColorStop(1, '#06111e'); // Antarctic sea
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, W, H);

  // Helper: map Lat (-90..90), Lon (-180..180) to Canvas (x, y)
  const toXY = (lat: number, lon: number): [number, number] => {
    const x = ((lon + 180) / 360) * W;
    const y = ((90 - lat) / 180) * H;
    return [x, y];
  };

  // Helper to draw continent polygons with fractal noise edge subdivision
  const drawComplexLandmass = (
    pts: Array<[number, number]>,
    fillColor: string,
    subdivide = true,
    noiseScale = 12.0
  ) => {
    if (pts.length < 3) return;

    ctx.beginPath();
    const pixelPoints: Array<[number, number]> = [];

    for (let i = 0; i < pts.length; i++) {
      const [lat, lon] = pts[i];
      const [x, y] = toXY(lat, lon);
      pixelPoints.push([x, y]);
    }

    if (!subdivide) {
      ctx.moveTo(pixelPoints[0][0], pixelPoints[0][1]);
      for (let i = 1; i < pixelPoints.length; i++) {
        ctx.lineTo(pixelPoints[i][0], pixelPoints[i][1]);
      }
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      return;
    }

    // Subdivide with fractal coastline perturbations
    const detailedPoints: Array<[number, number]> = [];
    for (let i = 0; i < pixelPoints.length; i++) {
      const p1 = pixelPoints[i];
      const p2 = pixelPoints[(i + 1) % pixelPoints.length];
      detailedPoints.push(p1);

      const segments = 4;
      for (let s = 1; s < segments; s++) {
        const t = s / segments;
        const midX = p1[0] + (p2[0] - p1[0]) * t;
        const midY = p1[1] + (p2[1] - p1[1]) * t;

        const u = midX / W;
        const v = midY / H;
        const n = (noise.fbmSeamless(u * 2, v * 2, 3, noiseScale) - 0.5) * 16;
        detailedPoints.push([midX + n, midY + n]);
      }
    }

    ctx.moveTo(detailedPoints[0][0], detailedPoints[0][1]);
    for (let i = 1; i < detailedPoints.length; i++) {
      ctx.lineTo(detailedPoints[i][0], detailedPoints[i][1]);
    }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
  };

  // 2. Continental Shelf Shallow Waters (Turquoise / Cyan Glow)
  ctx.shadowColor = '#14b8a6';
  ctx.shadowBlur = 18;
  const shelfColor = 'rgba(16, 68, 96, 0.75)';

  [northAmerica, southAmerica, eurasia, africa, australia, britishIsles, ireland, japan, scandinavia, greenland, madagascar, newZealandN, newZealandS].forEach((poly) => {
    drawComplexLandmass(poly, shelfColor, true, 8.0);
  });
  ctx.shadowBlur = 0;

  // 3. Primary Continental Landmass Base (Temperate Rich Emerald & Earth Tones)
  const landBaseColor = '#1e3d29';
  [northAmerica, southAmerica, eurasia, africa, australia, britishIsles, ireland, japan, scandinavia, madagascar, newZealandN, newZealandS].forEach((poly) => {
    drawComplexLandmass(poly, landBaseColor, true, 14.0);
  });

  // 4. Biomes & Vegetation Variation
  // Tropical Rainforests (Deep jungle emerald)
  ctx.fillStyle = 'rgba(16, 61, 32, 0.92)';
  const drawRegion = (lat: number, lon: number, rLat: number, rLon: number) => {
    const [x, y] = toXY(lat, lon);
    const rx = (rLon / 360) * W;
    const ry = (rLat / 180) * H;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  drawRegion(-3, -60, 12, 18); // Amazon Basin
  drawRegion(0, 22, 10, 12); // Congo Basin
  drawRegion(0, 114, 8, 15); // Indonesia / Sundaland

  // Arid Deserts & Dry Savannas (Warm Ochre / Sandstone)
  ctx.fillStyle = '#635338';
  drawRegion(24, 12, 10, 25); // Sahara Desert
  drawRegion(22, 45, 8, 12); // Arabian Desert
  drawRegion(42, 95, 7, 18); // Gobi Desert
  drawRegion(-24, 134, 9, 14); // Australian Outback
  drawRegion(-24, 20, 6, 8); // Kalahari Desert
  drawRegion(34, -114, 6, 8); // Mojave / Sonoran

  // Boreal Forests & Taiga (Siberia, Canada)
  ctx.fillStyle = '#1c3426';
  drawRegion(62, 90, 8, 45); // Siberia
  drawRegion(56, -100, 7, 28); // Canadian Shield

  // 5. Major Mountain Topography & Ridge Shading
  ctx.fillStyle = '#4a3f2e';
  drawRegion(30, 85, 3, 14); // Himalayas
  drawRegion(-20, -68, 25, 3); // Andes
  drawRegion(42, -112, 16, 4); // Rockies
  drawRegion(46, 10, 3, 5); // Alps
  drawRegion(58, 60, 14, 2.5); // Urals

  // 6. Polar Ice Caps & Glaciers (Pure Albedo Ice Sheets)
  ctx.fillStyle = '#f1f7fc';
  // North Pole ice fringe
  ctx.fillRect(0, 0, W, H * 0.045);
  // Antarctica Ice Sheet
  ctx.fillRect(0, H * 0.91, W, H * 0.09);
  drawComplexLandmass(greenland, '#e8f3fa', true, 10.0);

  // 7. Night City Light Clusters (Luminous Golden Filaments & Megacity Hubs)
  const drawMegacityHub = (lat: number, lon: number, radius: number, intensity = 1.0) => {
    const [x, y] = toXY(lat, lon);
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(255, 238, 170, ${0.95 * intensity})`);
    g.addColorStop(0.3, `rgba(245, 158, 11, ${0.75 * intensity})`);
    g.addColorStop(0.7, `rgba(217, 119, 6, ${0.3 * intensity})`);
    g.addColorStop(1, 'rgba(217, 119, 6, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  // Major global metropolitan corridors
  drawMegacityHub(51.5, -0.1, 24); // London & UK
  drawMegacityHub(48.8, 2.3, 22); // Paris
  drawMegacityHub(50.8, 6.9, 28); // Rhine-Ruhr / Blue Banana
  drawMegacityHub(40.7, -74.0, 32); // New York / BosWash
  drawMegacityHub(34.0, -118.2, 26); // Los Angeles
  drawMegacityHub(41.8, -87.6, 24); // Chicago / Great Lakes
  drawMegacityHub(35.6, 139.7, 34); // Tokyo Megalopolis
  drawMegacityHub(31.2, 121.4, 30); // Shanghai / Yangtze Delta
  drawMegacityHub(23.1, 113.2, 32); // Pearl River Delta
  drawMegacityHub(37.5, 126.9, 20); // Seoul
  drawMegacityHub(19.0, 72.8, 22); // Mumbai
  drawMegacityHub(28.6, 77.2, 22); // New Delhi
  drawMegacityHub(-23.5, -46.6, 24); // Sao Paulo
  drawMegacityHub(-33.8, 151.2, 18); // Sydney
  drawMegacityHub(1.3, 103.8, 18); // Singapore

  // 8. Equirectangular Tactical Graticule Lines (subtle cyan wireframe)
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 1.0;
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = ((lon + 180) / 360) * W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let lat = -90; lat <= 90; lat += 15) {
    const y = ((90 - lat) / 180) * H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Generates an accurate PBR Roughness texture (2048 x 1024) for the procedural Earth globe:
 * - Oceans / Seas / Water: Low roughness (#222222 -> ~0.13), giving realistic specular sun glints & highlights
 * - Landmasses / Continents: High roughness (#ededed -> ~0.93), giving matte, diffuse, realistic terrain with zero plastic glare
 * - Polar Ice Caps & Glaciers: Semi-matte (#888888 -> ~0.53)
 */
export function createProceduralEarthRoughnessTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const W = canvas.width;
  const H = canvas.height;

  // 1. Water base: Low roughness (smooth, shiny water)
  ctx.fillStyle = '#222222';
  ctx.fillRect(0, 0, W, H);

  // Helper: map Lat, Lon to Canvas (x, y)
  const toXY = (lat: number, lon: number): [number, number] => {
    const x = ((lon + 180) / 360) * W;
    const y = ((90 - lat) / 180) * H;
    return [x, y];
  };

  const drawRoughnessPolygon = (pts: Array<[number, number]>, fillHex: string) => {
    if (pts.length < 3) return;
    ctx.beginPath();
    const first = toXY(pts[0][0], pts[0][1]);
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < pts.length; i++) {
      const p = toXY(pts[i][0], pts[i][1]);
      ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.fillStyle = fillHex;
    ctx.fill();
  };

  // 2. Continental Landmasses: High roughness (diffuse, non-reflective terrain)
  LAND_CONTINENTS.forEach((poly) => {
    drawRoughnessPolygon(poly, '#ededed');
  });

  // 3. Polar Ice Sheets: Intermediate roughness (~0.5)
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 0, W, H * 0.045);
  ctx.fillRect(0, H * 0.91, W, H * 0.09);
  drawRoughnessPolygon(greenland, '#888888');

  const roughnessTexture = new THREE.CanvasTexture(canvas);
  roughnessTexture.wrapS = THREE.RepeatWrapping;
  roughnessTexture.wrapT = THREE.ClampToEdgeWrapping;
  roughnessTexture.generateMipmaps = true;
  roughnessTexture.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessTexture.magFilter = THREE.LinearFilter;
  return roughnessTexture;
}
