import * as THREE from 'three';
import { IFZ_IMAGES } from '../assets/images';
import { sampleElevation } from '../services/elevationService';
import { ElevationGrid } from '../types/map';
import { FogOfWarState } from '../types/settlement';
import { VisionSource } from '../services/fogOfWarService';

interface FogStratumConfig {
  name: string;
  baseHeight: number;
  billowAmp: number;
  wallHeight: number;
  noiseScale: number;
  speedMult: number;
  layerPhase: number;
  globalDensity: number;
  layerDensityMult: number;
  renderOrder: number;
  baseColorHex: number;
  exploredColorHex: number;
}

const STRATA_CONFIGS: FogStratumConfig[] = [
  {
    name: 'GroundMist',
    baseHeight: 1.8,
    billowAmp: 1.8,
    wallHeight: 2.0,
    noiseScale: 1.8,
    speedMult: 1.2,
    layerPhase: 0.0,
    globalDensity: 0.55,
    layerDensityMult: 0.5,
    renderOrder: 18,
    baseColorHex: 0xcddde8,
    exploredColorHex: 0x9eb4c8,
  },
  {
    name: 'LowRollingFog',
    baseHeight: 6.5,
    billowAmp: 3.5,
    wallHeight: 4.0,
    noiseScale: 1.4,
    speedMult: 0.95,
    layerPhase: 1.57,
    globalDensity: 0.6,
    layerDensityMult: 0.55,
    renderOrder: 19,
    baseColorHex: 0xd4e4f0,
    exploredColorHex: 0xa4b8cc,
  },
  {
    name: 'MidCumulusDeck',
    baseHeight: 14.0,
    billowAmp: 6.0,
    wallHeight: 6.5,
    noiseScale: 1.0,
    speedMult: 0.75,
    layerPhase: 3.14,
    globalDensity: 0.65,
    layerDensityMult: 0.6,
    renderOrder: 20,
    baseColorHex: 0xdeebf7,
    exploredColorHex: 0xaec2d4,
  },
  {
    name: 'HighCloudDeck',
    baseHeight: 24.0,
    billowAmp: 8.0,
    wallHeight: 9.0,
    noiseScale: 0.75,
    speedMult: 0.55,
    layerPhase: 4.71,
    globalDensity: 0.7,
    layerDensityMult: 0.65,
    renderOrder: 21,
    baseColorHex: 0xe5f0fa,
    exploredColorHex: 0xb5c8da,
  },
  {
    name: 'UpperAtmosphericCanopy',
    baseHeight: 36.0,
    billowAmp: 10.0,
    wallHeight: 12.0,
    noiseScale: 0.50,
    speedMult: 0.38,
    layerPhase: 2.35,
    globalDensity: 0.75,
    layerDensityMult: 0.7,
    renderOrder: 22,
    baseColorHex: 0xedf5fc,
    exploredColorHex: 0xbdcee0,
  },
];

export class FogOfWarRenderer {
  public group = new THREE.Group();

  // Dynamic vision mask canvas & texture
  private maskCanvas: HTMLCanvasElement;
  private maskCtx: CanvasRenderingContext2D | null;
  private exploredCanvas: HTMLCanvasElement;
  private exploredCtx: CanvasRenderingContext2D | null;
  private maskTexture: THREE.CanvasTexture;

  // Explored ("last known") footprint grey value, 0..1 in mask space. Must sit
  // between unexplored (0) and the clear cutout (1): high enough that the shader
  // renders a distinctly lighter fog, low enough that it never approaches the
  // >0.94 "fully clear" discard threshold.
  private static readonly EXPLORED_GREY = 46 / 255; // ~0.18 -> ~1/3 explored mix

  // Textures
  private volumetricTexture: THREE.Texture;
  private mistTexture: THREE.Texture;

  // Multi-tier 3D Volumetric Meshes & Materials
  private strataMeshes: THREE.Mesh[] = [];
  private lastLightingHour: number | null = null;
  private lightingTransition = 1;
  private strataMaterials: THREE.ShaderMaterial[] = [];

  // World bounds
  private worldBoundsMin = new THREE.Vector2(-1300, -1300);
  private worldBoundsMax = new THREE.Vector2(1300, 1300);
  private mapRadius = 650;
  private currentElevation: ElevationGrid | null = null;
  private currentExaggeration = 1.0;

  constructor() {
    this.group.name = 'FogOfWarVolumetricGroup';

    // 1. Setup 2D Canvas for dynamic vision mask (1024x1024)
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = 1024;
    this.maskCanvas.height = 1024;
    this.maskCtx = this.maskCanvas.getContext('2d');

    this.exploredCanvas = document.createElement('canvas');
    this.exploredCanvas.width = 1024;
    this.exploredCanvas.height = 1024;
    this.exploredCtx = this.exploredCanvas.getContext('2d');

    // Initialize unexplored state (black = full shroud)
    if (this.maskCtx) {
      this.maskCtx.fillStyle = '#000000';
      this.maskCtx.fillRect(0, 0, 1024, 1024);
    }
    if (this.exploredCtx) {
      this.exploredCtx.fillStyle = '#000000';
      this.exploredCtx.fillRect(0, 0, 1024, 1024);
    }

    this.maskTexture = new THREE.CanvasTexture(this.maskCanvas);
    this.maskTexture.flipY = false;
    this.maskTexture.generateMipmaps = false;
    this.maskTexture.minFilter = THREE.LinearFilter;
    this.maskTexture.magFilter = THREE.LinearFilter;
    this.maskTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.maskTexture.wrapT = THREE.ClampToEdgeWrapping;

    // 2. Load atmospheric textures
    const textureLoader = new THREE.TextureLoader();
    this.volumetricTexture = textureLoader.load(IFZ_IMAGES.volumetricFog);
    this.volumetricTexture.wrapS = THREE.RepeatWrapping;
    this.volumetricTexture.wrapT = THREE.RepeatWrapping;

    this.mistTexture = textureLoader.load(IFZ_IMAGES.groundMist);
    this.mistTexture.wrapS = THREE.RepeatWrapping;
    this.mistTexture.wrapT = THREE.RepeatWrapping;

    // 3. Initialize Strata Shaders and Meshes
    this.initStrata(1300);
  }

  private initStrata(radius: number) {
    const vertexShader = `
      uniform float uTime;
      uniform float uSpeedMult;
      uniform float uBillowAmp;
      uniform float uLayerPhase;
      uniform float uWallHeight;
      uniform float uExploredWallScale;
      uniform sampler2D uFogMask;
      uniform vec2 uWorldBoundsMin;
      uniform vec2 uWorldBoundsMax;

      #include <common>
      #include <logdepthbuf_pars_vertex>

      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormalVec;
      varying vec3 vViewVec;

      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        
        // Calculate mask value at this world position
        vec2 maskUv = (worldPos.xz - uWorldBoundsMin) / (uWorldBoundsMax - uWorldBoundsMin);
        float maskVal = 0.0;
        if (maskUv.x >= 0.0 && maskUv.x <= 1.0 && maskUv.y >= 0.0 && maskUv.y <= 1.0) {
          maskVal = texture2D(uFogMask, maskUv).r;
        }

        // Multi-harmonic 3D procedural wave billows
        float t = uTime * uSpeedMult;
        float w1 = sin(worldPos.x * 0.005 + t * 0.03 + uLayerPhase) * cos(worldPos.z * 0.005 + t * 0.025);
        float w2 = sin(worldPos.x * 0.012 - t * 0.045) * sin(worldPos.z * 0.012 + t * 0.035);
        float w3 = cos(worldPos.x * 0.024 + worldPos.z * 0.024 + t * 0.06);
        float billowY = (w1 * 0.60 + w2 * 0.28 + w3 * 0.12) * uBillowAmp;

        // At the boundary of unexplored fog, the clouds dome up into vertical 3D walls
        float fogEdge = smoothstep(0.12, 0.75, 1.0 - maskVal);
        // "Last known" (explored) territory raises lower, gentler mist walls than
        // never-explored shroud, keeping the two visually distinct.
        float isExploredV = smoothstep(0.08, 0.38, maskVal);
        float domeY = fogEdge * mix(uWallHeight, uWallHeight * uExploredWallScale, isExploredV);

        // Apply vertical 3D displacement
        worldPos.y += billowY + domeY;
        vWorldPosition = worldPos.xyz;

        // Approximate analytical surface normal for 3D lighting highlights
        float dYdx = (cos(worldPos.x * 0.005 + t * 0.03 + uLayerPhase) * cos(worldPos.z * 0.005 + t * 0.025) * 0.005) * uBillowAmp;
        float dYdz = (-sin(worldPos.x * 0.005 + t * 0.03 + uLayerPhase) * sin(worldPos.z * 0.005 + t * 0.025) * 0.005) * uBillowAmp;
        vec3 calcNormal = normalize(vec3(-dYdx, 1.0, -dYdz));
        vNormalVec = normalize(normalMatrix * calcNormal);
        vViewVec = normalize(cameraPosition - worldPos.xyz);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
        #include <logdepthbuf_vertex>
      }
    `;

    const fragmentShader = `
      uniform sampler2D uFogMask;
      uniform sampler2D uNoiseTex;
      uniform sampler2D uMistTex;
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform vec3 uFogColorExplored;
      uniform vec2 uWorldBoundsMin;
      uniform vec2 uWorldBoundsMax;
      uniform float uGlobalFogDensity;
      uniform float uLayerDensityMult;
      uniform float uNoiseScale;
      uniform float uSpeedMult;

      #include <common>
      #include <logdepthbuf_pars_fragment>

      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormalVec;
      varying vec3 vViewVec;

      void main() {
        vec2 maskUv = (vWorldPosition.xz - uWorldBoundsMin) / (uWorldBoundsMax - uWorldBoundsMin);
        
        float maskVal = 0.0;
        if (maskUv.x >= 0.0 && maskUv.x <= 1.0 && maskUv.y >= 0.0 && maskUv.y <= 1.0) {
          maskVal = texture2D(uFogMask, maskUv).r;
        }

        // If in fully clear active vision cutout, discard immediately
        if (maskVal > 0.94) {
          discard;
        }

        // Multi-octave swirling atmospheric cloud textures with parallax UVs
        vec2 uv1 = vWorldPosition.xz * (0.0014 * uNoiseScale) + vec2(uTime * 0.004 * uSpeedMult, uTime * 0.002 * uSpeedMult);
        vec2 uv2 = vWorldPosition.xz * (0.0035 * uNoiseScale) - vec2(uTime * 0.003 * uSpeedMult, uTime * 0.005 * uSpeedMult);
        vec2 uv3 = vWorldPosition.xz * (0.0070 * uNoiseScale) + vec2(-uTime * 0.002 * uSpeedMult, uTime * 0.004 * uSpeedMult);

        float n1 = texture2D(uNoiseTex, uv1).r;
        float n2 = texture2D(uMistTex, uv2).r;
        float n3 = texture2D(uNoiseTex, uv3).r;

        float noise = n1 * 0.50 + n2 * 0.35 + n3 * 0.15;

        // Modulate boundary with 3D noise for natural volumetric cloud billows
        float noisyMask = maskVal + (noise - 0.5) * 0.16;
        float cutout = smoothstep(0.35, 0.82, noisyMask);

        // Explored vs Unexplored density
        float isExplored = smoothstep(0.08, 0.38, maskVal);
        // Explored territory is essentially transparent (0.002), Unexplored is a soft, translucent volumetric cloud deck
        float baseDensity = mix(0.42, 0.002, isExplored);

        // 3D View-angle Fresnel / depth attenuation
        float viewDot = clamp(dot(vNormalVec, vViewVec), 0.0, 1.0);
        float fresnel = pow(1.0 - viewDot, 1.5) * 0.08;

        float alpha = (1.0 - cutout) * baseDensity * uGlobalFogDensity * uLayerDensityMult;
        alpha += fresnel * (1.0 - cutout) * 0.06;

        // Soft cloud rim enhancement around cutout boundaries
        float edgeRim = smoothstep(0.16, 0.62, noisyMask) * (1.0 - cutout) * 0.04;
        alpha = clamp(alpha + edgeRim, 0.0, 0.45);

        if (alpha < 0.005) discard;

        // 3D Lighting & Sunlight/Moonlight highlights on cloud crests
        vec3 fogCol = mix(uFogColor, uFogColorExplored, isExplored);
        
        // Normal-based top illumination (sunlight catching the top of 3D cloud billows)
        float topLight = clamp(vNormalVec.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 sunRim = vec3(0.08, 0.09, 0.10) * pow(topLight, 2.0) * pow(noise, 1.6);
        
        vec3 finalCol = fogCol + sunRim;

        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(finalCol, alpha);
      }
    `;

    const size = Math.max(2600, radius * 4);
    const segments = 80;

    STRATA_CONFIGS.forEach((config) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uFogMask: { value: this.maskTexture },
          uNoiseTex: { value: this.volumetricTexture },
          uMistTex: { value: this.mistTexture },
          uTime: { value: 0 },
          uFogColor: { value: new THREE.Color(config.baseColorHex) },
          uFogColorExplored: { value: new THREE.Color(config.exploredColorHex) },
          uWorldBoundsMin: { value: this.worldBoundsMin },
          uWorldBoundsMax: { value: this.worldBoundsMax },
          uGlobalFogDensity: { value: config.globalDensity },
          uLayerDensityMult: { value: config.layerDensityMult },
          uNoiseScale: { value: config.noiseScale },
          uSpeedMult: { value: config.speedMult },
          uBillowAmp: { value: config.billowAmp },
          uWallHeight: { value: config.wallHeight },
          uExploredWallScale: { value: 0.45 },
          uLayerPhase: { value: config.layerPhase },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const geo = new THREE.PlaneGeometry(size, size, segments, segments);
      geo.rotateX(-Math.PI / 2);

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = config.baseHeight;
      mesh.renderOrder = config.renderOrder;

      this.strataMaterials.push(mat);
      this.strataMeshes.push(mesh);
      this.group.add(mesh);
    });
  }

  public rebuildFog(
    radius: number,
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    this.mapRadius = radius;
    this.currentElevation = elevation || null;
    this.currentExaggeration = exaggeration;

    const extent = Math.max(1300, radius * 2);
    this.worldBoundsMin.set(-extent, -extent);
    this.worldBoundsMax.set(extent, extent);

    this.strataMaterials.forEach((mat) => {
      mat.uniforms.uWorldBoundsMin.value = this.worldBoundsMin;
      mat.uniforms.uWorldBoundsMax.value = this.worldBoundsMax;
    });

    const size = extent * 2;
    const segments = 80;

    this.strataMeshes.forEach((mesh, index) => {
      const config = STRATA_CONFIGS[index];
      mesh.geometry.dispose();

      const geo = new THREE.PlaneGeometry(size, size, segments, segments);
      geo.rotateX(-Math.PI / 2);

      // Displace each vertex according to terrain elevation so all volumetric cloud strata roll over hills & valleys
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vz = pos.getZ(i);
        const vy = sampleElevation(elevation, vx, vz, exaggeration);
        pos.setY(i, vy + config.baseHeight);
      }
      pos.needsUpdate = true;
      mesh.geometry = geo;
      mesh.position.y = 0;
    });

    // Reset mask canvases on map change
    if (this.maskCtx) {
      this.maskCtx.fillStyle = '#000000';
      this.maskCtx.fillRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    }
    if (this.exploredCtx) {
      this.exploredCtx.fillStyle = '#000000';
      this.exploredCtx.fillRect(0, 0, this.exploredCanvas.width, this.exploredCanvas.height);
    }
    this.maskTexture.needsUpdate = true;
  }

  /**
   * Updates the live dynamic Fog of War mask with circular vision apertures around:
   * 1. Player occupied or built structures (HQ, adapted buildings, freestanding buildings)
   * 2. Player squads (deployed and alive)
   * 3. Vehicles occupied/mounted by player squads
   * 4. Worker populations out gathering (resource work orders, deconstruction/construction jobs)
   *
   * The mask is rebuilt from scratch every tick from the CURRENTLY live vision
   * apertures plus a "last known" explored footprint. When a squad moves away, its
   * old clear cutout is gone and a lighter re-fogged shroud re-forms there — never
   * fully cleared again, but visibly thinner than never-explored territory.
   * Permanent vision sources like the HQ and adapted buildings keep their areas
   * clear as long as they exist.
   */
  public updateVisionSources(
    sources: VisionSource[],
    fogEnabled: boolean,
    _fogGrid?: FogOfWarState | null
  ) {
    if (!this.maskCtx || !this.exploredCtx) return;

    const width = this.maskCanvas.width;
    const height = this.maskCanvas.height;

    if (!fogEnabled) {
      // If fog of war is not active yet (e.g. before initial settlement HQ selection),
      // keep entire terrain completely revealed (white mask = 1.0).
      this.maskCtx.fillStyle = 'rgba(255, 255, 255, 1.0)';
      this.maskCtx.fillRect(0, 0, width, height);
      this.maskTexture.needsUpdate = true;
      return;
    }

    // 1. Reset live mask to unexplored black (re-fogs everything left behind)
    this.maskCtx.fillStyle = '#000000';
    this.maskCtx.fillRect(0, 0, width, height);

    // 2. Composite the "last known" explored footprint (mid-grey = thinner fog)
    this.maskCtx.drawImage(this.exploredCanvas, 0, 0);

    const spanX = this.worldBoundsMax.x - this.worldBoundsMin.x;
    const spanZ = this.worldBoundsMax.y - this.worldBoundsMin.y;

    // 3. Cut out LIVE vision sources with feathered radial gradients, and remember
    //    their footprint as explored ("last known") territory
    for (const src of sources) {
      const px = ((src.x - this.worldBoundsMin.x) / spanX) * width;
      const py = ((src.z - this.worldBoundsMin.y) / spanZ) * height;
      const pr = (src.radius / spanX) * width;

      if (pr <= 0) continue;

      // Live 100% crystal-clear cutout across 85% of aperture, feathering smoothly at the rim
      const grad = this.maskCtx.createRadialGradient(px, py, pr * 0.82, px, py, pr);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.88, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

      this.maskCtx.save();
      this.maskCtx.fillStyle = grad;
      this.maskCtx.beginPath();
      this.maskCtx.arc(px, py, pr, 0, Math.PI * 2);
      this.maskCtx.fill();
      this.maskCtx.restore();

      // Explored footprint on the explored canvas (mid-grey, never accumulates to clear)
      const grey = FogOfWarRenderer.EXPLORED_GREY * 255;
      const expGrad = this.exploredCtx.createRadialGradient(px, py, pr * 0.82, px, py, pr);
      expGrad.addColorStop(0, `rgba(${grey}, ${grey}, ${grey}, 1.0)`);
      expGrad.addColorStop(0.88, `rgba(${grey}, ${grey}, ${grey}, 0.95)`);
      expGrad.addColorStop(1.0, `rgba(${grey}, ${grey}, ${grey}, 0.0)`);

      this.exploredCtx.save();
      this.exploredCtx.fillStyle = expGrad;
      this.exploredCtx.beginPath();
      this.exploredCtx.arc(px, py, pr, 0, Math.PI * 2);
      this.exploredCtx.fill();
      this.exploredCtx.restore();
    }

    this.maskTexture.needsUpdate = true;
  }

  public updateLighting(fogColor: THREE.Color, _ambientIntensity: number, clockHour: number) {
    // Dynamically tint volumetric fog strata with time-of-day atmospheric colors.
    // Transition over real render time rather than switching palettes at a phase
    // boundary, which otherwise makes the fog visibly pop.
    const previousHour = this.lastLightingHour;
    this.lastLightingHour = clockHour;
    const isNight = clockHour < 5.5 || clockHour > 20.5;
    const isDuskDawn = (clockHour >= 5.5 && clockHour < 7.5) || (clockHour >= 18.5 && clockHour <= 20.5);

    this.strataMaterials.forEach((mat, idx) => {
      const config = STRATA_CONFIGS[idx];
      const altRatio = idx / (STRATA_CONFIGS.length - 1); // 0 (ground) to 1 (top canopy)

      if (isNight) {
        // Moonlit silver-blue cloud shroud (ground mist is darker, upper cloud catches moonlight)
        const shroudCol = new THREE.Color(0x607898).lerp(new THREE.Color(0x829ec0), altRatio);
        const exploredCol = new THREE.Color(0x384a5e).lerp(new THREE.Color(0x4c627a), altRatio);
        mat.uniforms.uFogColor.value.copy(shroudCol);
        mat.uniforms.uFogColorExplored.value.copy(exploredCol);
      } else if (isDuskDawn) {
        // Golden twilight amber haze
        const shroudCol = new THREE.Color(0xd4b4a0).lerp(new THREE.Color(0xf0d0be), altRatio);
        const exploredCol = new THREE.Color(0xa68c7c).lerp(new THREE.Color(0xc2a694), altRatio);
        mat.uniforms.uFogColor.value.copy(shroudCol);
        mat.uniforms.uFogColorExplored.value.copy(exploredCol);
      } else {
        // Day - crisp, luminous silvery-white atmospheric cloud field
        const shroudCol = new THREE.Color(config.baseColorHex);
        const exploredCol = new THREE.Color(config.exploredColorHex);
        mat.uniforms.uFogColor.value.copy(shroudCol);
        mat.uniforms.uFogColorExplored.value.copy(exploredCol);
      }
    });
  }

  public update(_delta: number, time: number) {
    this.strataMaterials.forEach((mat) => {
      mat.uniforms.uTime.value = time;
    });
  }

  public dispose() {
    this.strataMeshes.forEach((mesh) => mesh.geometry.dispose());
    this.strataMaterials.forEach((mat) => mat.dispose());
    this.maskTexture.dispose();
    this.volumetricTexture.dispose();
    this.mistTexture.dispose();
  }
}

