import * as THREE from 'three';
import type { WeatherType, MoonPhase } from '../types/weather';

/**
 * Procedural weather visuals driven by the simulation's WeatherState:
 * falling rain/snow, an overcast cloud canopy, weather fog/tint targets, and
 * periodic lightning for thunderstorms. All intensities are eased toward their
 * targets so weather changes blend smoothly instead of snapping.
 *
 * Lighting modulation (fog density/tint, cloud dimming, lightning boost) is
 * applied by WorldScene each frame from the eased values exposed here.
 */
export class WeatherFX {
  public group = new THREE.Group();

  // Eased weather state (read by WorldScene for lighting modulation)
  private fogScale = 1.0;
  private fogTint = new THREE.Color(0xffffff);
  private fogTintWeight = 0; // 0..1 how strongly the day/night fog color is tinted
  private dim = 0; // 0..1 cloud cover dimming applied to sun/hemi/ambient
  private lightning = 0; // 0..1 current flash boost
  private skyTint = new THREE.Color(0xffffff);
  private skyTintWeight = 0; // 0..1 sky/horizon tint strength

  // Particle systems
  private rain: THREE.Points;
  private rainVelocities: Float32Array;
  private snow: THREE.Points;
  private snowVelocities: Float32Array;
  private cloudCanopy: THREE.Mesh;

  // Lightning timing
  private nextFlashAt = 4;
  private flashTimer = 0;

  // Reusable temp objects
  private tmpCamera = new THREE.Vector3();

  constructor() {
    this.group.name = 'WeatherFXGroup';

    this.rain = this.buildRain();
    this.snow = this.buildSnow();
    this.cloudCanopy = this.buildCloudCanopy();

    this.group.add(this.rain);
    this.group.add(this.snow);
    this.group.add(this.cloudCanopy);

    // Start with clear skies; setWeather() moves everything to its targets.
    this.rain.visible = false;
    this.snow.visible = false;
    this.cloudCanopy.visible = false;
  }

  private buildParticleSprite(size: number, color: string, streakRatio = 1): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    if (streakRatio > 1.6) {
      // Vertical streak for rain
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      const w = size;
      const h = 64;
      const grad = ctx.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.45, color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(32 - w / 2, 0, w, h);
    } else {
      // Soft radial flake for snow / haze
      const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.4, color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(32, 32, 31, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private buildRain(): THREE.Points {
    // Full particle budget is allocated once; the visible count is switched by
    // intensity via drawRange. Rain gets a large pool so a torrential storm
    // can saturate the screen without rebuilding buffers mid-storm.
    const count = 9000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 900;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 260;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 900;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const tex = this.buildParticleSprite(3, 'rgba(174,202,240,0.9)', 2.2);
    const mat = new THREE.PointsMaterial({
      map: tex,
      color: 0xbfd4ff,
      size: 2.4,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const pts = new THREE.Points(geo, mat);
    pts.name = 'RainParticles';
    pts.frustumCulled = false;
    // Start fully active; setWeather() immediately clamps to the target count.
    geo.setDrawRange(0, count);
    this.rainVelocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.rainVelocities[i] = 38 + Math.random() * 22;
    }
    return pts;
  }

  private buildSnow(): THREE.Points {
    const count = 1600;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 1000;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 280;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1000;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const tex = this.buildParticleSprite(6, 'rgba(255,255,255,0.85)');
    const mat = new THREE.PointsMaterial({
      map: tex,
      color: 0xffffff,
      size: 4.5,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    });

    const pts = new THREE.Points(geo, mat);
    pts.name = 'SnowParticles';
    pts.frustumCulled = false;
    this.snowVelocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.snowVelocities[i] = 2.4 + Math.random() * 2.8;
    }
    return pts;
  }

  private buildCloudCanopy(): THREE.Mesh {
    // Procedural soft cloud base texture (tiling)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 512);

    for (let i = 0; i < 46; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 24 + Math.random() * 60;
      const a = 0.5 + Math.random() * 0.5;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, `rgba(235, 238, 245, ${a})`);
      g.addColorStop(0.7, `rgba(210, 216, 228, ${a * 0.45})`);
      g.addColorStop(1, 'rgba(210,216,228,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.55 + Math.random() * 0.4), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.needsUpdate = true;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });

    // A huge horizontal canopy high above the play area; the group it lives in
    // follows the camera horizontally, so the canopy itself stays centered at
    // local (0, y, 0). The pitch is baked into the GEOMETRY (rotateX so the
    // plane lies flat) rather than the mesh, so the per-frame drift rotation.y
    // remains a true spin around the world-up axis.
    const geo = new THREE.PlaneGeometry(4200, 4200);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'CloudCanopy';
    mesh.position.set(0, 420, 0);
    mesh.rotation.y = 0.4;
    return mesh;
  }

  /**
   * Target weather values for each condition. Keep fog/tint subtle; the heavy
   * visual work is done by the particles, canopy and lighting dimming.
   */
  private weatherTarget(weather: WeatherType): {
    rain: number;
    snow: number;
    cloud: number;
    fogScale: number;
    fogTint: string;
    fogTintWeight: number;
    dim: number;
    lightning: boolean;
    skyTint: string;
    skyTintWeight: number;
  } {
    switch (weather) {
      case 'overcast':
        return { rain: 0, snow: 0, cloud: 0.8, fogScale: 1.18, fogTint: '#aeb8c4', fogTintWeight: 0.25, dim: 0.3, lightning: false, skyTint: '#9aa6b5', skyTintWeight: 0.35 };
      case 'rain':
        return { rain: 1.0, snow: 0, cloud: 0.92, fogScale: 1.35, fogTint: '#8fa8c0', fogTintWeight: 0.35, dim: 0.45, lightning: false, skyTint: '#7c8c9e', skyTintWeight: 0.45 };
      case 'thunderstorm':
        // Torrential: roughly 3x the rain particle count of plain rain,
        // faster drops, heavier opacity — visually distinct from rain.
        return { rain: 3.0, snow: 0, cloud: 0.98, fogScale: 1.6, fogTint: '#5e7088', fogTintWeight: 0.45, dim: 0.62, lightning: true, skyTint: '#525f73', skyTintWeight: 0.55 };
      case 'dense_fog':
        return { rain: 0, snow: 0, cloud: 0.35, fogScale: 5.5, fogTint: '#cfc9bd', fogTintWeight: 0.75, dim: 0.5, lightning: false, skyTint: '#c9c4ba', skyTintWeight: 0.65 };
      case 'heatwave':
        return { rain: 0, snow: 0, cloud: 0.12, fogScale: 1.15, fogTint: '#e8c9a0', fogTintWeight: 0.2, dim: 0.08, lightning: false, skyTint: '#f2c48f', skyTintWeight: 0.25 };
      case 'freezing_frost':
        return { rain: 0, snow: 0.45, cloud: 0.6, fogScale: 1.3, fogTint: '#c9d9e6', fogTintWeight: 0.3, dim: 0.28, lightning: false, skyTint: '#c3d6e6', skyTintWeight: 0.35 };
      case 'blizzard':
        return { rain: 0, snow: 1.3, cloud: 0.95, fogScale: 2.6, fogTint: '#e8f0f8', fogTintWeight: 0.6, dim: 0.62, lightning: false, skyTint: '#e2ecf5', skyTintWeight: 0.6 };
      default:
        return { rain: 0, snow: 0, cloud: 0, fogScale: 1, fogTint: '#ffffff', fogTintWeight: 0, dim: 0, lightning: false, skyTint: '#ffffff', skyTintWeight: 0 };
    }
  }

  /** Send the current simulation weather to the visual system. */
  public setWeather(weather: WeatherType, _moonPhase?: MoonPhase) {
    // Moon brightness is handled by SkyAtmosphere; WeatherFX only cares about
    // the precipitation/atmosphere targets.
    const t = this.weatherTarget(weather);

    const rainMat = this.rain.material as THREE.PointsMaterial;
    const snowMat = this.snow.material as THREE.PointsMaterial;
    const cloudMat = this.cloudCanopy.material as THREE.MeshBasicMaterial;
    this.rainBaseOpacity = Math.min(1, 0.75 * Math.min(1.2, t.rain));
    this.snowBaseOpacity = Math.min(1, 0.85 * t.snow);
    this.canopyBaseOpacity = Math.max(0, Math.min(1, t.cloud));

    if (t.rain > 0.01 && !this.rain.visible) {
      this.rain.visible = true;
    } else if (t.rain <= 0.01 && this.rain.visible) {
      this.rain.visible = false;
    }
    // Particle-count scaling: rain intensity maps to how much of the pooled
    // 9000-particle field is actually drawn. Plain rain ≈ 3000 drops, a
    // thunderstorm saturates all 9000 — a torrential downpour, not a drizzle.
    const RAIN_POOL = this.rainVelocities.length;
    this.rain.geometry.setDrawRange(
      0,
      t.rain > 0.01
        ? Math.max(800, Math.min(RAIN_POOL, Math.round(RAIN_POOL * Math.min(1, t.rain / 3))))
        : 0
    );
    rainMat.size = t.rain > 2 ? 3.0 : 2.4;
    this.targetRainFallMultiplier = t.rain > 2 ? 1.5 : 1.0;

    if (t.snow > 0.01 && !this.snow.visible) {
      this.snow.visible = true;
    } else if (t.snow <= 0.01 && this.snow.visible) {
      this.snow.visible = false;
    }

    this.cloudCanopy.visible = t.cloud > 0.02;

    // Dome clouds + star occlusion track the eased cloud cover.
    this.targetCloudCover = t.cloud;

    // Store targets; update() eases current values toward them.
    this.targetFogScale = t.fogScale;
    this.targetFogTint.set(t.fogTint);
    this.targetFogTintWeight = t.fogTintWeight;
    this.targetDim = t.dim;
    this.targetSkyTint.set(t.skyTint);
    this.targetSkyTintWeight = t.skyTintWeight;
    this.thunderActive = t.lightning;

    // Snow fall rates are static; blizzard gusts are conveyed by opacity + dimming.
  }

  // Eased target fields
  private targetFogScale = 1;
  private targetFogTint = new THREE.Color(0xffffff);
  private targetFogTintWeight = 0;
  private targetDim = 0;
  private targetSkyTint = new THREE.Color(0xffffff);
  private targetSkyTintWeight = 0;
  private targetCloudCover = 0;
  private cloudCover = 0;
  private targetRainFallMultiplier = 1;
  private rainFallMultiplier = 1;
  private thunderActive = false;

  // Base (sea-level) opacities set per weather; update() multiplies them by
  // camera-altitude fades so high views thin out gracefully.
  private rainBaseOpacity = 0.75;
  private snowBaseOpacity = 0.85;
  private canopyBaseOpacity = 0;

  /** Fixed cloud-base altitude — the camera stays below this at max zoom. */
  private CANOPY_ALTITUDE = 420;

  /** Eased fog density multiplier (1 = clear). */
  public getFogScale(): number {
    return this.fogScale;
  }

  /** Eased fog tint color; WeatherFX lerps the existing fog color toward it. */
  public getFogTint(out: THREE.Color): THREE.Color {
    return out.copy(this.fogTint);
  }

  public getFogTintWeight(): number {
    return this.fogTintWeight;
  }

  /** Eased cloud dimming (0..1) applied to sun/hemi/ambient intensity. */
  public getDim(): number {
    return this.dim;
  }

  /** Current lightning flash intensity (0..1); 0 when no storm. */
  public getLightning(): number {
    return this.lightning;
  }

  /** Eased sky tint color applied to the atmosphere/horizon colors. */
  public getSkyTint(out: THREE.Color): THREE.Color {
    return out.copy(this.skyTint);
  }

  public getSkyTintWeight(): number {
    return this.skyTintWeight;
  }

  private ease(current: number, target: number, delta: number, speed = 1.2): number {
    return current + (target - current) * Math.min(1, delta * speed);
  }

  /**
   * Per-frame animation: moves the particle field under the camera, falls rain
   * & snow, drifts the canopy, runs lightning, and eases all lighting targets.
   */
  public update(delta: number, totalTime: number, cameraPosition: THREE.Vector3) {
    this.tmpCamera.copy(cameraPosition);

    // Follow the camera horizontally so precipitation/clouds always surround
    // the play area without the particles visibly wrapping.
    this.group.position.x = this.tmpCamera.x;
    this.group.position.z = this.tmpCamera.z;

    const now = totalTime;

    // --- Rain ---
    if (this.rain.visible) {
      const geo = this.rain.geometry;
      const attr = geo.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const n = arr.length / 3;
      const windX = 6 + Math.sin(now * 0.35) * 3; // slight gust
      const windZ = 3 + Math.cos(now * 0.22) * 2;
      const fallMult = this.rainFallMultiplier;
      for (let i = 0; i < n; i++) {
        arr[i * 3] += windX * delta * (fallMult > 1.2 ? 1.8 : 1);
        arr[i * 3 + 1] -= this.rainVelocities[i] * delta * fallMult;
        arr[i * 3 + 2] += windZ * delta * (fallMult > 1.2 ? 1.8 : 1);
        if (arr[i * 3 + 1] < -170) {
          arr[i * 3] = (Math.random() - 0.5) * 900;
          arr[i * 3 + 1] = 150 + Math.random() * 110;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 900;
        }
        // Wrap horizontally so the field trails the camera
        const dx = arr[i * 3];
        const dz = arr[i * 3 + 2];
        if (Math.abs(dx) > 520) arr[i * 3] = -Math.sign(dx) * 500;
        if (Math.abs(dz) > 520) arr[i * 3 + 2] = -Math.sign(dz) * 500;
      }
      attr.needsUpdate = true;
    }

    // --- Snow ---
    if (this.snow.visible) {
      const geo = this.snow.geometry;
      const attr = geo.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const n = arr.length / 3;
      const windX = 4 + Math.sin(now * 0.2) * 3.5;
      for (let i = 0; i < n; i++) {
        arr[i * 3] += windX * delta + Math.sin(now * 1.1 + i) * delta * 2.2;
        arr[i * 3 + 1] -= this.snowVelocities[i] * delta;
        arr[i * 3 + 2] += Math.cos(now * 0.9 + i * 1.3) * delta * 1.6;
        if (arr[i * 3 + 1] < -190) {
          arr[i * 3] = (Math.random() - 0.5) * 1000;
          arr[i * 3 + 1] = 170 + Math.random() * 110;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 1000;
        }
        const dx = arr[i * 3];
        const dz = arr[i * 3 + 2];
        if (Math.abs(dx) > 540) arr[i * 3] = -Math.sign(dx) * 520;
        if (Math.abs(dz) > 540) arr[i * 3 + 2] = -Math.sign(dz) * 520;
      }
      attr.needsUpdate = true;
    }

    // --- Cloud canopy drift ---
    // The canopy sits inside the camera-following group (x/z already track
    // the camera) at a fixed high altitude — a genuine cloud base the camera
    // always stays UNDER (zoom is capped below the deck). The dome's shader
    // cloud layer carries the overcast look from any altitude.
    if (this.cloudCanopy.visible) {
      this.cloudCanopy.position.x = 0;
      this.cloudCanopy.position.z = 0;
      this.cloudCanopy.position.y = this.CANOPY_ALTITUDE;
      this.cloudCanopy.rotation.y = now * 0.0012;

      // Altitude fade: as the camera nears the cloud base the plate thins out
      // to nothing, so the camera can never visually punch through a hard
      // cloud plane (the ugly below-the-plate artifact).
      const approach = THREE.MathUtils.clamp(
        1 - (this.tmpCamera.y - 200) / (this.CANOPY_ALTITUDE - 200),
        0,
        1
      );
      const cm = this.cloudCanopy.material as THREE.MeshBasicMaterial;
      cm.opacity = 0.85 * this.canopyBaseOpacity * approach;
      this.cloudCanopy.visible = cm.opacity > 0.01;
    }

    // --- Precipitation altitude fade ---
    // From very high up the particle box reads as a small streak cluster —
    // fade it so high-altitude views rely on the dome clouds instead.
    const precipFade = THREE.MathUtils.clamp(1 - (this.tmpCamera.y - 400) / 900, 0, 1);
    {
      const rm = this.rain.material as THREE.PointsMaterial;
      if (this.rain.visible) rm.opacity = this.rainBaseOpacity * precipFade;
      const sm = this.snow.material as THREE.PointsMaterial;
      if (this.snow.visible) sm.opacity = this.snowBaseOpacity * precipFade;
    }

    // --- Rain intensity: storms fall faster and harder ---
    this.rainFallMultiplier = this.ease(this.rainFallMultiplier, this.targetRainFallMultiplier, delta, 1.0);
    this.cloudCover = this.ease(this.cloudCover, this.targetCloudCover, delta, 0.7);

    // --- Lightning (thunderstorm) ---
    if (this.thunderActive) {
      this.flashTimer += delta;
      if (this.flashTimer >= this.nextFlashAt) {
        this.flashTimer = 0;
        this.nextFlashAt = 4.5 + Math.random() * 7;
        this.lightning = 0.85 + Math.random() * 0.15;
        // Occasional quick double-strike
        if (Math.random() < 0.4) {
          this.nextFlashAt = 0.25 + Math.random() * 0.4;
        }
      }
    } else {
      this.lightning = 0;
      this.flashTimer = 0;
      this.nextFlashAt = 4;
    }
    // Decay the flash quickly
    this.lightning = Math.max(0, this.lightning - delta * 3.2);

    // --- Ease lighting targets ---
    this.fogScale = this.ease(this.fogScale, this.targetFogScale, delta, 0.9);
    this.fogTint.lerp(this.targetFogTint, Math.min(1, delta * 0.9));
    this.fogTintWeight = this.ease(this.fogTintWeight, this.targetFogTintWeight, delta, 0.9);
    this.dim = this.ease(this.dim, this.targetDim, delta, 0.8);
    this.skyTint.lerp(this.targetSkyTint, Math.min(1, delta * 0.8));
    this.skyTintWeight = this.ease(this.skyTintWeight, this.targetSkyTintWeight, delta, 0.8);
  }

  /** Eased cloud cover 0..1 — WorldScene forwards it to the sky dome shader. */
  public getCloudCover(): number {
    return this.cloudCover;
  }

  /** Eased rain fall-speed multiplier (1 normal, ~1.5 torrential). */
  public getRainFallMultiplier(): number {
    return this.rainFallMultiplier;
  }

  public dispose() {
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    this.snow.geometry.dispose();
    (this.snow.material as THREE.Material).dispose();
    this.cloudCanopy.geometry.dispose();
    (this.cloudCanopy.material as THREE.Material).dispose();
    this.group.clear();
  }
}