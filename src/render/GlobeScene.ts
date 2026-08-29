import * as THREE from 'three';
import { ZONE_CONFIGS } from '../data/zoneConfigs';
import { GeoPoint, Point2D, ZoneGridSize } from '../types/map';
import {
  createUltraHdProceduralEarthTexture,
  createProceduralEarthRoughnessTexture,
} from './earthProcedural';

export interface GlobeSceneOptions {
  container: HTMLElement;
  onSelectLocation: (point: GeoPoint) => void;
  onAltitudeChange?: (distance: number, altitudeKm: number) => void;
}

/**
 * Creates an initial fast transparent satellite cloud texture while high-resolution
 * NASA satellite imagery downloads in the background.
 */
function createInitialTransparentCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 64, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

/**
 * Convert Lat/Lon (degrees) to 3D Cartesian coordinates on a sphere of given radius.
 * Standardized to match Three.js SphereGeometry equirectangular UV mapping.
 */
export function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  const x = radius * Math.cos(latRad) * Math.cos(lonRad);
  const y = radius * Math.sin(latRad);
  const z = -radius * Math.cos(latRad) * Math.sin(lonRad);

  return new THREE.Vector3(x, y, z);
}

/**
 * Convert 3D Cartesian coordinates in globe's local space to Lat/Lon.
 * Exact mathematical inverse of latLonToVector3.
 */
export function vector3ToLatLon(vec: THREE.Vector3): GeoPoint {
  const norm = vec.clone().normalize();
  const clampedY = Math.max(-1, Math.min(1, norm.y));
  const lat = Math.asin(clampedY) * (180 / Math.PI);
  const lon = Math.atan2(-norm.z, norm.x) * (180 / Math.PI);

  return {
    lat: Math.max(-89.9, Math.min(89.9, lat)),
    lon: Math.max(-180, Math.min(180, lon)),
  };
}

export class GlobeScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animationFrameId: number | null = null;
  private onSelectLocation: (point: GeoPoint) => void;
  private onAltitudeChange?: (distance: number, altitudeKm: number) => void;

  // Globe meshes
  public readonly GLOBE_RADIUS = 100;
  private globeMesh!: THREE.Mesh;
  private cloudsMesh!: THREE.Mesh;
  private atmosphereMesh!: THREE.Mesh;
  private graticuleGroup!: THREE.Group;

  // Multi-settlement cache
  private cachedSettlements: Array<{ id: string; name: string; lat: number; lon: number; status: 'operational' | 'destroyed'; isCurrent: boolean }> = [];
  private cachedCaravans: Array<{ id: string; origin: GeoPoint; dest: GeoPoint; progress: number; name: string }> = [];

  // Tactical Marker & 3D Projected Tile Grid
  private markerRootGroup!: THREE.Group;
  private tileGridGroup!: THREE.Group;
  private networkRootGroup!: THREE.Group;

  // Interaction & Camera State
  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  private dragDistance = 0;
  private rotationMomentum = { x: 0, y: 0.0006 };
  private targetRotation = new THREE.Quaternion();
  private globeQuaternion = new THREE.Quaternion();

  // Google Earth style zoom settings
  // GLOBE_RADIUS is 100, so distance 104 is ultra-close reconnaissance zoom!
  private cameraDistance = 240;
  private targetCameraDistance = 240;
  public readonly minCameraDistance = 104.5;
  public readonly maxCameraDistance = 380;

  // Descent transition state
  private isDescending = false;
  private descentProgress = 0;
  private descentDuration = 2200;
  private descentStartTime = 0;
  private descentStartDistance = 240;
  private descentOnComplete?: () => void;
  private descentOnProgress?: (progress: number, altitudeKm: number) => void;

  // Raycaster for click selection & cursor-focused zoom
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // Current selected location on globe
  private currentSelection: GeoPoint = { lat: 51.7520, lon: -1.2577 };
  private currentZoneSize: ZoneGridSize = '3x3';
  private currentOffsetMeters: Point2D = { x: 0, z: 0 };

  constructor(options: GlobeSceneOptions) {
    this.container = options.container;
    this.onSelectLocation = options.onSelectLocation;
    this.onAltitudeChange = options.onAltitudeChange;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06080c);

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 4000);
    this.camera.position.set(0, 0, this.cameraDistance);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.container.appendChild(this.renderer.domElement);

    this.initLighting();
    this.initStarfield();
    this.initGlobe();
    this.initTacticalMarker();
    this.initEventListeners();

    // Orient initially to Evesham/Oxford with clean direct alignment
    this.setTargetLocation(this.currentSelection.lat, this.currentSelection.lon, false, false);

    this.animate = this.animate.bind(this);
    this.animate(0);
  }

  private initLighting() {
    // Sun light (Directional Sunlight)
    const sunLight = new THREE.DirectionalLight(0xfff8ee, 2.4);
    sunLight.position.set(300, 160, 380);
    this.scene.add(sunLight);

    // Subtle dark side blue ambient fill
    const ambientLight = new THREE.AmbientLight(0x16253b, 1.1);
    this.scene.add(ambientLight);

    // Secondary rim fill
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    rimLight.position.set(-300, -120, -300);
    this.scene.add(rimLight);
  }

  private initStarfield() {
    const starGeo = new THREE.BufferGeometry();
    const count = 2200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 900 + Math.random() * 900;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const brightness = 0.35 + Math.random() * 0.65;
      colors[i * 3] = brightness;
      colors[i * 3 + 1] = brightness * (0.85 + Math.random() * 0.15);
      colors[i * 3 + 2] = brightness * (0.95 + Math.random() * 0.05);
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 1.7,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });

    const starField = new THREE.Points(starGeo, starMat);
    this.scene.add(starField);
  }

  private initGlobe() {
    // Ultra smooth sphere geometry for high-detail planetary silhouette
    const globeGeo = new THREE.SphereGeometry(this.GLOBE_RADIUS, 256, 256);
    const proceduralTex = createUltraHdProceduralEarthTexture();
    const proceduralRoughnessTex = createProceduralEarthRoughnessTexture();

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    proceduralTex.anisotropy = maxAnisotropy;
    proceduralRoughnessTex.anisotropy = maxAnisotropy;

    const globeMat = new THREE.MeshStandardMaterial({
      map: proceduralTex,
      roughnessMap: proceduralRoughnessTex,
      roughness: 1.0,
      metalness: 0.02,
    });

    this.globeMesh = new THREE.Mesh(globeGeo, globeMat);
    this.scene.add(this.globeMesh);

    // High-resolution satellite Earth texture loaders with fallback chain
    const textureLoader = new THREE.TextureLoader();
    const satelliteUrls = [
      'https://unpkg.com/three-globe@2.45.2/example/img/earth-blue-marble.jpg',
    ];

    const loadSatelliteTexture = (index = 0) => {
      if (index >= satelliteUrls.length) return;
      textureLoader.load(
        satelliteUrls[index],
        (tex) => {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.anisotropy = maxAnisotropy;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          globeMat.map = tex;
          globeMat.needsUpdate = true;
        },
        undefined,
        () => {
          loadSatelliteTexture(index + 1);
        }
      );
    };
    loadSatelliteTexture(0);

    // Load terrain normal/bump map for realistic 3D mountain relief shadows
    const bumpUrls = [
      'https://threejs.org/examples/textures/planets/earth_normal_2048.jpg',
    ];
    const loadBumpTexture = (index = 0) => {
      if (index >= bumpUrls.length) return;
      textureLoader.load(
        bumpUrls[index],
        (tex) => {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.anisotropy = maxAnisotropy;
          globeMat.normalMap = tex;
          globeMat.normalScale = new THREE.Vector2(0.65, 0.65);
          globeMat.needsUpdate = true;
        },
        undefined,
        () => loadBumpTexture(index + 1)
      );
    };
    loadBumpTexture(0);

    // Converts standard NASA specular map (white=ocean, black=land) into PBR roughness map (low=water, high=land)
    const createRoughnessFromSpecularImage = (image: HTMLImageElement): THREE.CanvasTexture => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width || 2048;
      canvas.height = image.height || 1024;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const spec = d[i]; // In NASA specular map: 255 for water, 0 for land
        // Invert to roughness: Water -> ~32 (0.12 roughness, shiny specular), Land -> ~238 (0.93 roughness, matte)
        const roughness = Math.round(238 - (spec / 255) * 206);
        d[i] = roughness;
        d[i + 1] = roughness;
        d[i + 2] = roughness;
        d[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);

      const roughnessTex = new THREE.CanvasTexture(canvas);
      roughnessTex.wrapS = THREE.RepeatWrapping;
      roughnessTex.wrapT = THREE.ClampToEdgeWrapping;
      roughnessTex.anisotropy = maxAnisotropy;
      roughnessTex.minFilter = THREE.LinearMipmapLinearFilter;
      roughnessTex.magFilter = THREE.LinearFilter;
      return roughnessTex;
    };

    // Load specular map and invert for ocean sun glints and matte landmasses
    const specUrls = [
      'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/textures/planets/earth_specular_2048.jpg',
    ];
    const loadSpecTexture = (index = 0) => {
      if (index >= specUrls.length) return;
      textureLoader.load(
        specUrls[index],
        (tex) => {
          try {
            if (tex.image && tex.image.width > 0) {
              const invertedRoughnessTex = createRoughnessFromSpecularImage(tex.image);
              globeMat.roughnessMap = invertedRoughnessTex;
              globeMat.roughness = 1.0;
              globeMat.metalness = 0.02;
              globeMat.needsUpdate = true;
            }
          } catch (e) {
            console.warn('Using procedural roughness map:', e);
          }
        },
        undefined,
        () => loadSpecTexture(index + 1)
      );
    };
    loadSpecTexture(0);

    // -------------------------------------------------------------
    // Literal NASA Satellite Atmospheric Cloud Layer
    // -------------------------------------------------------------
    const cloudsGeo = new THREE.SphereGeometry(this.GLOBE_RADIUS * 1.008, 128, 128);
    const initialCloudTex = createInitialTransparentCloudTexture();
    initialCloudTex.anisotropy = maxAnisotropy;

    const cloudsMat = new THREE.MeshStandardMaterial({
      map: initialCloudTex,
      transparent: true,
      opacity: 0.65,
      blending: THREE.NormalBlending,
      roughness: 0.9,
      depthWrite: false,
    });

    this.cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    this.scene.add(this.cloudsMesh);

    // Load authentic NASA satellite composite cloud layer texture
    // The remote Three.js cloud asset was removed upstream; retain the
    // procedural transparent layer instead of issuing a guaranteed 404.
    const cloudUrls: string[] = [];
    const loadCloudTexture = (index = 0) => {
      if (index >= cloudUrls.length) return;
      textureLoader.load(
        cloudUrls[index],
        (tex) => {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.anisotropy = maxAnisotropy;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          cloudsMat.map = tex;
          cloudsMat.opacity = 0.65;
          cloudsMat.needsUpdate = true;
        },
        undefined,
        () => loadCloudTexture(index + 1)
      );
    };
    loadCloudTexture(0);

    // Atmosphere Fresnel Rim Layer
    const atmosGeo = new THREE.SphereGeometry(this.GLOBE_RADIUS * 1.034, 128, 128);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.6);
          gl_FragColor = vec4(0.22, 0.75, 0.98, 1.0) * intensity * 0.95;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });

    this.atmosphereMesh = new THREE.Mesh(atmosGeo, atmosMat);
    this.scene.add(this.atmosphereMesh);
  }

  private initGraticules() {
    this.graticuleGroup = new THREE.Group();

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.18,
    });

    const equatorMat = new THREE.LineBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.4,
    });

    const primeMat = new THREE.LineBasicMaterial({
      color: 0xeab308,
      transparent: true,
      opacity: 0.4,
    });

    // Parallels (Latitude lines every 30 deg)
    for (let lat = -60; lat <= 60; lat += 30) {
      const circlePoints: THREE.Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const lon = -180 + (i / 96) * 360;
        circlePoints.push(latLonToVector3(lat, lon, this.GLOBE_RADIUS * 1.002));
      }

      const geo = new THREE.BufferGeometry().setFromPoints(circlePoints);
      const line = new THREE.Line(geo, lat === 0 ? equatorMat : lineMat);
      this.graticuleGroup.add(line);
    }

    // Meridians (Longitude lines every 45 deg)
    for (let lon = -180; lon < 180; lon += 45) {
      const meridianPoints: THREE.Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const lat = -90 + (i / 96) * 180;
        meridianPoints.push(latLonToVector3(lat, lon, this.GLOBE_RADIUS * 1.002));
      }

      const geo = new THREE.BufferGeometry().setFromPoints(meridianPoints);
      const line = new THREE.Line(geo, lon === 0 ? primeMat : lineMat);
      this.graticuleGroup.add(line);
    }

    // Graticules are added directly to the globe mesh so they rotate synchronously
    this.globeMesh.add(this.graticuleGroup);
  }

  /**
   * Initializes the tactical network groups for owned colonies on the globe.
   */
  private initTacticalMarker() {
    this.markerRootGroup = new THREE.Group();
    this.tileGridGroup = new THREE.Group();

    // Attach marker root directly to globeMesh so it moves with globe rotation
    this.globeMesh.add(this.markerRootGroup);

    // Multi-settlement network group for rendering all owned colonies and caravan arcs
    this.networkRootGroup = new THREE.Group();
    this.globeMesh.add(this.networkRootGroup);

    if (this.currentSelection) {
      this.updateTargetMarker3D(this.currentSelection.lat, this.currentSelection.lon);
    }
  }

  /**
   * Renders the 3D red tactical target beacon and surface radar ring atop the globe.
   */
  public updateTargetMarker3D(lat: number, lon: number) {
    if (!this.markerRootGroup) return;

    // Clear previous marker elements
    while (this.markerRootGroup.children.length > 0) {
      const child = this.markerRootGroup.children[0];
      this.markerRootGroup.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) {
        if (Array.isArray((child as any).material)) {
          (child as any).material.forEach((m: any) => m.dispose());
        } else {
          (child as any).material.dispose();
        }
      }
    }

    // Position sitting strictly above the planetary surface (never clipping inside)
    const R = this.GLOBE_RADIUS * 1.008;
    const pos = latLonToVector3(lat, lon, R);
    const normal = pos.clone().normalize();

    // 1. Concentric Ground Radar Base Ring
    const groundRingGeo = new THREE.RingGeometry(0.4, 0.8, 32);
    const groundRingMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const groundRing = new THREE.Mesh(groundRingGeo, groundRingMat);
    groundRing.position.copy(pos);
    groundRing.lookAt(pos.clone().add(normal));
    this.markerRootGroup.add(groundRing);

    // 2. Tactical Beacon Vertical Pin Stem (starts at surface, extends outward)
    const pinHeight = 3.2;
    const colGeo = new THREE.CylinderGeometry(0.05, 0.12, pinHeight, 16);
    colGeo.translate(0, pinHeight / 2, 0); // Translate so bottom of cylinder is at surface 0
    const colMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.9,
    });
    const colMesh = new THREE.Mesh(colGeo, colMat);
    colMesh.position.copy(pos);
    colMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    this.markerRootGroup.add(colMesh);

    // 3. Glowing Spherical Beacon Head atop the pin
    const topPos = pos.clone().add(normal.clone().multiplyScalar(pinHeight));
    const sphereGeo = new THREE.SphereGeometry(0.28, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    sphereMesh.position.copy(topPos);
    this.markerRootGroup.add(sphereMesh);

    // 4. Target Reticle Ring at top
    const reticleGeo = new THREE.RingGeometry(0.35, 0.5, 24);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const reticleMesh = new THREE.Mesh(reticleGeo, reticleMat);
    reticleMesh.position.copy(topPos);
    reticleMesh.lookAt(topPos.clone().add(normal));
    this.markerRootGroup.add(reticleMesh);
  }

  /**
   * Zone grid placeholder (grid is not displayed on the initial globe view).
   */
  public updateMarkerZoneGrid(zoneSize: ZoneGridSize, offsetMeters: Point2D = { x: 0, z: 0 }) {
    this.currentZoneSize = zoneSize;
    this.currentOffsetMeters = offsetMeters;
  }

  private updateMarkerPosition() {
    // Marker tracking is handled by the 2D tactical HUD pin label
  }

  /**
   * Renders 3D colony pins, status beacons, and real-time curved caravan trajectory arcs on the globe.
   * Player-owned headquarters are rendered with sleek, compact yellow pins with a white circle/sphere above.
   */
  public updateSettlementNetwork(
    settlements: Array<{ id: string; name: string; lat: number; lon: number; status: 'operational' | 'destroyed'; isCurrent: boolean }>,
    caravans: Array<{ id: string; origin: GeoPoint; dest: GeoPoint; progress: number; name: string }> = []
  ) {
    if (!this.networkRootGroup) return;

    // Clear previous network nodes
    while (this.networkRootGroup.children.length > 0) {
      const child = this.networkRootGroup.children[0];
      this.networkRootGroup.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) {
        if (Array.isArray((child as any).material)) {
          (child as any).material.forEach((m: any) => m.dispose());
        } else {
          (child as any).material.dispose();
        }
      }
    }

    const R = this.GLOBE_RADIUS * 1.006;

    // 1. Render Compact Tactical Colony Pins (Yellow pin with white circle above)
    for (const s of settlements) {
      const pos = latLonToVector3(s.lat, s.lon, R);
      const normal = pos.clone().normalize();

      const isDestroyed = s.status === 'destroyed';
      const pinColor = isDestroyed ? 0xef4444 : s.isCurrent ? 0xf59e0b : 0xeab308;

      // Base ring
      const ringGeo = new THREE.RingGeometry(0.35, 0.65, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: pinColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(pos);
      ringMesh.lookAt(pos.clone().add(normal));
      this.networkRootGroup.add(ringMesh);

      // Sleek vertical beacon column (pin stem)
      const pinHeight = 2.6;
      const colGeo = new THREE.CylinderGeometry(0.04, 0.10, pinHeight, 12);
      colGeo.translate(0, pinHeight / 2, 0);
      const colMat = new THREE.MeshBasicMaterial({
        color: pinColor,
        transparent: true,
        opacity: isDestroyed ? 0.45 : 0.85,
      });
      const colMesh = new THREE.Mesh(colGeo, colMat);
      colMesh.position.copy(pos);
      colMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      this.networkRootGroup.add(colMesh);

      // White circle / sphere cap above
      const sphereGeo = new THREE.SphereGeometry(0.22, 14, 14);
      const sphereMat = new THREE.MeshBasicMaterial({ color: isDestroyed ? 0xff0000 : 0xffffff });
      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      sphereMesh.position.copy(pos.clone().add(normal.clone().multiplyScalar(pinHeight)));
      this.networkRootGroup.add(sphereMesh);
    }

    // 2. Render Great-Circle Caravan Trajectories & Vehicle Position Dot
    for (const c of caravans) {
      const startVec = latLonToVector3(c.origin.lat, c.origin.lon, R);
      const endVec = latLonToVector3(c.dest.lat, c.dest.lon, R);

      // Build great-circle arc points
      const numPoints = 40;
      const arcPoints: THREE.Vector3[] = [];
      for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        // Slerp along sphere surface
        const slerped = new THREE.Vector3().copy(startVec).lerp(endVec, t).normalize();
        // Lift mid-arc above surface for nice orbital flight curve
        const arcHeight = Math.sin(t * Math.PI) * 4.5;
        arcPoints.push(slerped.multiplyScalar(R + arcHeight));
      }

      const lineGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.8,
      });
      const arcLine = new THREE.Line(lineGeo, lineMat);
      this.networkRootGroup.add(arcLine);

      // Moving vehicle indicator dot
      const clampedProgress = Math.max(0, Math.min(1, c.progress));
      const vehSlerp = new THREE.Vector3().copy(startVec).lerp(endVec, clampedProgress).normalize();
      const vehHeight = Math.sin(clampedProgress * Math.PI) * 4.5;
      const vehPos = vehSlerp.multiplyScalar(R + vehHeight + 0.3);

      const vehGeo = new THREE.SphereGeometry(0.75, 16, 16);
      const vehMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
      const vehMesh = new THREE.Mesh(vehGeo, vehMat);
      vehMesh.position.copy(vehPos);
      this.networkRootGroup.add(vehMesh);
    }
  }

  public updateColonyBeacons(
    settlements: Array<{ id: string; name: string; lat: number; lon: number; status?: string; isHQ?: boolean; isCurrent?: boolean; population?: number }>
  ) {
    this.cachedSettlements = settlements.map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      status: (s.status === 'destroyed' ? 'destroyed' : 'operational') as 'operational' | 'destroyed',
      isCurrent: s.isHQ ?? s.isCurrent ?? false,
    }));
    this.updateSettlementNetwork(this.cachedSettlements, this.cachedCaravans);
  }

  public updateCaravans(
    caravans: Array<{ id: string; origin: GeoPoint; dest: GeoPoint; progress: number; name: string }>
  ) {
    this.cachedCaravans = caravans || [];
    this.updateSettlementNetwork(this.cachedSettlements, this.cachedCaravans);
  }

  public updateZoneFootprint(
    zoneSize: ZoneGridSize,
    _radiusMeters?: number,
    offsetMeters: Point2D = { x: 0, z: 0 },
    _rotationDeg: number = 0
  ) {
    this.updateMarkerZoneGrid(zoneSize, offsetMeters);
  }

  /**
   * Sets target latitude/longitude and smoothly aligns the globe so the location faces the camera.
   */
  public setTargetLocation(lat: number, lon: number, smooth = true, zoomIn = false) {
    this.currentSelection = { lat, lon };
    this.updateMarkerZoneGrid(this.currentZoneSize, this.currentOffsetMeters);
    this.updateTargetMarker3D(lat, lon);

    // Calculate rotation to place (lat, lon) directly facing the camera (along +Z vector)
    const targetDir = latLonToVector3(lat, lon, 1.0).normalize();
    const cameraFacingDir = new THREE.Vector3(0, 0, 1);
    this.targetRotation.setFromUnitVectors(targetDir, cameraFacingDir);

    if (!smooth) {
      this.globeQuaternion.copy(this.targetRotation);
      this.globeMesh.quaternion.copy(this.targetRotation);
    }

    if (zoomIn) {
      // Smoothly zoom in close to reconnaissance altitude
      this.targetCameraDistance = 125;
    }
  }

  /**
   * Smooth zoom controls for Google Earth style navigation
   */
  public zoomIn(step = 30) {
    this.targetCameraDistance = Math.max(this.minCameraDistance, this.targetCameraDistance - step);
  }

  public zoomOut(step = 30) {
    this.targetCameraDistance = Math.min(this.maxCameraDistance, this.targetCameraDistance + step);
  }

  public setZoomDistance(distance: number) {
    this.targetCameraDistance = Math.max(this.minCameraDistance, Math.min(this.maxCameraDistance, distance));
  }

  public getCameraDistance(): number {
    return this.cameraDistance;
  }

  public focusOnSelection() {
    this.setTargetLocation(this.currentSelection.lat, this.currentSelection.lon, true, true);
  }

  /**
   * Projects a Lat/Lon point on the 3D globe to 2D container screen coordinates (x, y in pixels)
   */
  public getScreenPosition(lat: number, lon: number): { x: number; y: number; visible: boolean } {
    if (!this.container || !this.globeMesh) return { x: 0, y: 0, visible: false };

    const localPos = latLonToVector3(lat, lon, this.GLOBE_RADIUS * 1.01);
    // Apply current globe rotation to get world vector
    const worldPos = localPos.clone().applyQuaternion(this.globeQuaternion);

    // Check if the coordinate faces the camera
    const isFacing = worldPos.z > -15;

    const projected = worldPos.clone().project(this.camera);
    const rect = this.container.getBoundingClientRect();
    const x = ((projected.x + 1) / 2) * rect.width;
    const y = ((-projected.y + 1) / 2) * rect.height;

    return {
      x,
      y,
      visible: isFacing && projected.z < 1.0 && x >= 0 && x <= rect.width && y >= 0 && y <= rect.height,
    };
  }

  /**
   * Smoothly zooms into a chosen city before switching to street-level selection
   */
  public zoomToCity(lat: number, lon: number, onComplete?: () => void) {
    this.setTargetLocation(lat, lon, true, true);
    this.targetCameraDistance = 110;
    if (onComplete) {
      setTimeout(onComplete, 950);
    }
  }

  public resetView() {
    this.targetCameraDistance = 240;
    this.setTargetLocation(51.7520, -1.2577, true, false);
  }

  public triggerDescent(
    lat: number,
    lon: number,
    onComplete: () => void,
    onProgress?: (progress: number, altitudeKm: number) => void
  ) {
    if (this.isDescending) return;

    this.isDescending = true;
    this.descentProgress = 0;
    this.descentStartTime = performance.now();
    this.descentOnComplete = onComplete;
    this.descentOnProgress = onProgress;

    this.setTargetLocation(lat, lon, true, false);
    this.descentStartDistance = this.camera.position.z;
  }

  private initEventListeners() {
    const canvas = this.renderer.domElement;

    // Mouse Drag Orbit
    canvas.addEventListener('mousedown', (e) => {
      if (this.isDescending) return;
      this.isDragging = true;
      this.dragDistance = 0;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging || this.isDescending) return;

      const deltaX = e.clientX - this.previousMousePosition.x;
      const deltaY = e.clientY - this.previousMousePosition.y;
      this.dragDistance += Math.abs(deltaX) + Math.abs(deltaY);

      // Adaptive rotation sensitivity based on zoom depth (closer zoom = finer control)
      const zoomFactor = Math.max(0.25, (this.cameraDistance - this.GLOBE_RADIUS) / 140);
      const rotFactor = 0.0045 * zoomFactor;

      this.rotationMomentum.x = deltaY * rotFactor;
      this.rotationMomentum.y = deltaX * rotFactor;

      const deltaRotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(deltaY * rotFactor, deltaX * rotFactor, 0, 'XYZ')
      );

      this.globeQuaternion.multiplyQuaternions(deltaRotation, this.globeQuaternion);
      this.targetRotation.copy(this.globeQuaternion);

      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;

      // If clean click with minimal drag, raycast to select clicked location
      if (this.dragDistance < 6 && !this.isDescending) {
        this.handleCanvasClick(e.clientX, e.clientY);
      }
    });

    // Double click to zoom into point
    canvas.addEventListener('dblclick', (e) => {
      if (this.isDescending) return;
      this.handleCanvasDoubleClick(e.clientX, e.clientY);
    });

    // Touch Drag & Pinch Zoom Support
    let touchStartDist = 0;
    canvas.addEventListener(
      'touchstart',
      (e) => {
        if (this.isDescending) return;
        if (e.touches.length === 1) {
          this.isDragging = true;
          this.dragDistance = 0;
          this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
          this.isDragging = false;
          touchStartDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
        }
      },
      { passive: true }
    );

    window.addEventListener(
      'touchmove',
      (e) => {
        if (this.isDescending) return;

        if (this.isDragging && e.touches.length === 1) {
          const deltaX = e.touches[0].clientX - this.previousMousePosition.x;
          const deltaY = e.touches[0].clientY - this.previousMousePosition.y;
          this.dragDistance += Math.abs(deltaX) + Math.abs(deltaY);

          const zoomFactor = Math.max(0.25, (this.cameraDistance - this.GLOBE_RADIUS) / 140);
          const rotFactor = 0.0055 * zoomFactor;

          const deltaRotation = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(deltaY * rotFactor, deltaX * rotFactor, 0, 'XYZ')
          );
          this.globeQuaternion.multiplyQuaternions(deltaRotation, this.globeQuaternion);
          this.targetRotation.copy(this.globeQuaternion);

          this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
          // Pinch Zoom
          const currentDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          const delta = touchStartDist - currentDist;
          this.targetCameraDistance = Math.max(
            this.minCameraDistance,
            Math.min(this.maxCameraDistance, this.targetCameraDistance + delta * 0.4)
          );
          touchStartDist = currentDist;
        }
      },
      { passive: false }
    );

    window.addEventListener('touchend', (e) => {
      if (this.isDragging && this.dragDistance < 8 && e.changedTouches.length === 1) {
        this.handleCanvasClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
      this.isDragging = false;
    });

    // Google Earth style Wheel Zoom (zooms smoothly towards cursor)
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.isDescending) return;
        e.preventDefault();

        const zoomSpeed = 0.22;
        const delta = e.deltaY * zoomSpeed;
        const newDist = Math.max(
          this.minCameraDistance,
          Math.min(this.maxCameraDistance, this.targetCameraDistance + delta)
        );

        // If zooming in with mouse over globe, slightly bias rotation towards cursor point
        if (delta < 0) {
          const rect = this.container.getBoundingClientRect();
          this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

          this.raycaster.setFromCamera(this.mouse, this.camera);
          const intersects = this.raycaster.intersectObject(this.globeMesh);

          if (intersects.length > 0) {
            const hitPoint = intersects[0].point.clone().normalize();
            const centerVector = new THREE.Vector3(0, 0, 1);
            const toHitQuat = new THREE.Quaternion().setFromUnitVectors(hitPoint, centerVector);
            // Smoothly nudge globe toward cursor center
            this.targetRotation.slerp(this.targetRotation.clone().multiply(toHitQuat), 0.12);
          }
        }

        this.targetCameraDistance = newDist;
      },
      { passive: false }
    );

    // Resize Handler
    window.addEventListener('resize', this.onWindowResize);
  }

  private handleCanvasClick(clientX: number, clientY: number) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.globeMesh);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      let geo: GeoPoint;

      if (intersect.uv) {
        // Direct UV mapping for 100% precision with texture
        geo = {
          lat: Math.max(-89.9, Math.min(89.9, intersect.uv.y * 180 - 90)),
          lon: Math.max(-180, Math.min(180, intersect.uv.x * 360 - 180)),
        };
      } else {
        // Local point calculation
        const localPoint = this.globeMesh.worldToLocal(intersect.point.clone());
        geo = vector3ToLatLon(localPoint);
      }

      this.currentSelection = geo;
      this.updateMarkerZoneGrid(this.currentZoneSize, this.currentOffsetMeters);
      this.onSelectLocation(geo);
    }
  }

  private handleCanvasDoubleClick(clientX: number, clientY: number) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.globeMesh);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      let geo: GeoPoint;
      if (intersect.uv) {
        geo = {
          lat: Math.max(-89.9, Math.min(89.9, intersect.uv.y * 180 - 90)),
          lon: Math.max(-180, Math.min(180, intersect.uv.x * 360 - 180)),
        };
      } else {
        const localPoint = this.globeMesh.worldToLocal(intersect.point.clone());
        geo = vector3ToLatLon(localPoint);
      }

      this.setTargetLocation(geo.lat, geo.lon, true, true);
      this.onSelectLocation(geo);
    }
  }

  private onWindowResize = () => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private animate(time: number) {
    this.animationFrameId = requestAnimationFrame(this.animate);

    // 1. Idle rotation / damping
    if (!this.isDragging && !this.isDescending) {
      this.globeQuaternion.slerp(this.targetRotation, 0.08);

      // Gentle idle spin if stationary and zoomed out
      if (
        this.cameraDistance > 180 &&
        Math.abs(this.rotationMomentum.x) < 0.0001 &&
        Math.abs(this.rotationMomentum.y) < 0.0001
      ) {
        const idleRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.0003);
        this.globeQuaternion.multiplyQuaternions(this.globeQuaternion, idleRot);
        this.targetRotation.copy(this.globeQuaternion);
      }
    }

    // 2. Re-entry Descent sequence
    if (this.isDescending) {
      const elapsed = performance.now() - this.descentStartTime;
      this.descentProgress = Math.min(1.0, elapsed / this.descentDuration);

      const t = this.descentProgress;
      const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      // Dive camera straight down to surface
      this.camera.position.z = THREE.MathUtils.lerp(this.descentStartDistance, 101.8, easeT);
      this.globeQuaternion.slerp(this.targetRotation, 0.16);

      const altitudeKm = Math.max(0.5, Math.round(THREE.MathUtils.lerp(1200, 0.5, easeT)));
      if (this.descentOnProgress) {
        this.descentOnProgress(this.descentProgress, altitudeKm);
      }

      if (this.descentProgress >= 1.0) {
        this.isDescending = false;
        if (this.descentOnComplete) {
          this.descentOnComplete();
        }
      }
    } else {
      // Smooth Camera distance zoom
      this.cameraDistance = THREE.MathUtils.lerp(this.cameraDistance, this.targetCameraDistance, 0.12);
      this.camera.position.z = this.cameraDistance;

      // Report altitude
      if (this.onAltitudeChange) {
        const approxAltitudeKm = Math.round((this.cameraDistance - this.GLOBE_RADIUS) * 12.5);
        this.onAltitudeChange(this.cameraDistance, approxAltitudeKm);
      }
    }

    // Apply rotation to globe
    this.globeMesh.quaternion.copy(this.globeQuaternion);

    // Rotate clouds slightly faster
    this.cloudsMesh.quaternion.multiplyQuaternions(
      this.globeQuaternion,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), time * 0.00004)
    );

    this.renderer.render(this.scene, this.camera);
  }

  public dispose() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onWindowResize);
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
