import * as THREE from 'three';
import { sampleElevation } from '../services/elevationService';
import { loadSatelliteTexture } from '../services/satelliteService';
import { ElevationGrid, GeoPoint, LanduseArea, Point2D } from '../types/map';
import { tessellatePolygonConformal } from './terrainTessellation';
import {
  createRealisticWaterRippleCanvas,
  createRealisticGrassTexture,
  createRealisticGroundEarthTexture,
} from './realisticTextures';

export class GroundRenderer {
  public group = new THREE.Group();

  // Procedural realistic textures
  private baseGroundTexture: THREE.CanvasTexture = createRealisticGroundEarthTexture();
  private grassTexture: THREE.CanvasTexture = createRealisticGrassTexture('grass');
  private parkTexture: THREE.CanvasTexture = createRealisticGrassTexture('park');
  private forestTexture: THREE.CanvasTexture = createRealisticGrassTexture('forest');
  private meadowTexture: THREE.CanvasTexture = createRealisticGrassTexture('meadow');

  // Base ground material with organic soil texture
  private groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x858e99,
    roughness: 0.92,
    metalness: 0.04,
    map: this.baseGroundTexture,
    polygonOffset: true,
    polygonOffsetFactor: 1.0,
    polygonOffsetUnits: 1.0,
  });

  // Horizon disc for seamless boundary blending
  private horizonDiscMaterial = new THREE.MeshLambertMaterial({
    color: 0x16181b,
    wireframe: false,
  });

  private wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0x475569,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });

  private terrainMesh: THREE.Mesh | null = null;
  private terrainWireframeMesh: THREE.Mesh | null = null;
  private horizonDisc: THREE.Mesh | null = null;

  // Water rendering components
  private waterCanvas: HTMLCanvasElement;
  private waterTexture: THREE.CanvasTexture;
  private waterMaterial: THREE.MeshStandardMaterial;

  private landuseMaterials: Record<string, THREE.Material> = {};

  private currentElevation: ElevationGrid | null = null;
  private currentExaggeration = 1.0;
  private showWireframe = false;
  private isSatelliteActive = false;
  private currentCenter: GeoPoint | null = null;
  private currentRadius = 1200;
  private currentTerrainSize = 2600;

  // Water animation throttle
  private lastWaterUpdateTime = 0;
  private lightingColor = new THREE.Color(0xffffff);
  private targetLightingColor = new THREE.Color(0xffffff);
  private lightingBlend = 1;

  constructor() {
    this.group.name = 'GroundGroup';

    // 1. Initialize realistic water ripple system
    this.waterCanvas = createRealisticWaterRippleCanvas(0);
    this.waterTexture = new THREE.CanvasTexture(this.waterCanvas);
    this.waterTexture.wrapS = THREE.RepeatWrapping;
    this.waterTexture.wrapT = THREE.RepeatWrapping;
    this.waterTexture.repeat.set(6, 6);

    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e40af, // Deep natural aquatic blue
      roughness: 0.1,
      metalness: 0.25,
      map: this.waterTexture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -1.5,
      depthWrite: true,
    });

    // 2. Initialize Landuse Materials with realistic procedural textures & natural colors
    this.landuseMaterials = {
      grass: new THREE.MeshStandardMaterial({
        color: 0x93c57d,
        roughness: 0.88,
        metalness: 0.05,
        map: this.grassTexture,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0,
      }),
      park: new THREE.MeshStandardMaterial({
        color: 0x86efac,
        roughness: 0.82,
        metalness: 0.05,
        map: this.parkTexture,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0,
      }),
      forest: new THREE.MeshStandardMaterial({
        color: 0x4ade80,
        roughness: 0.95,
        metalness: 0.02,
        map: this.forestTexture,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0,
      }),
      meadow: new THREE.MeshStandardMaterial({
        color: 0xbbf7d0,
        roughness: 0.9,
        metalness: 0.05,
        map: this.meadowTexture,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0,
      }),
      water: this.waterMaterial,
      parking: new THREE.MeshStandardMaterial({
        color: 0x3b4252,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0,
      }),
      residential: new THREE.MeshStandardMaterial({
        color: 0x333b47,
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -0.8,
        polygonOffsetUnits: -0.8,
      }),
      commercial: new THREE.MeshStandardMaterial({
        color: 0x3e4756,
        roughness: 0.8,
        metalness: 0.08,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -0.8,
        polygonOffsetUnits: -0.8,
      }),
      industrial: new THREE.MeshStandardMaterial({
        color: 0x45484f,
        roughness: 0.75,
        metalness: 0.15,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -0.8,
        polygonOffsetUnits: -0.8,
      }),
      other: new THREE.MeshStandardMaterial({
        color: 0x2e3440,
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -0.8,
        polygonOffsetUnits: -0.8,
      }),
    };

    this.setupBaseGround(5200);
  }

  public update(delta: number, time: number) {
    // Fade terrain/satellite colour grading continuously with the scene lighting.
    this.lightingBlend = Math.min(1, this.lightingBlend + Math.max(0, delta) * 0.8);
    this.lightingColor.lerp(this.targetLightingColor, Math.min(1, Math.max(0, delta) * 0.8));
    this.groundMaterial.color.copy(this.lightingColor);
    Object.values(this.landuseMaterials).forEach((material) => {
      if (material !== this.waterMaterial && material instanceof THREE.MeshStandardMaterial) {
        material.color.lerp(this.targetLightingColor, Math.min(1, Math.max(0, delta) * 0.8));
      }
    });
    this.waterMaterial.color.lerp(this.targetLightingColor, Math.min(1, Math.max(0, delta) * 0.8));

    // Animate water ripples with smooth directional drift on GPU via UV offset
    if (this.waterTexture) {
      this.waterTexture.offset.x = (time * 0.02) % 1;
      this.waterTexture.offset.y = (time * 0.012) % 1;
    }
  }

  private setupBaseGround(size: number) {
    // 1. Extended horizon ground disc
    const horizonGeo = new THREE.CircleGeometry(18000, 64);
    horizonGeo.rotateX(-Math.PI / 2);
    this.horizonDisc = new THREE.Mesh(horizonGeo, this.horizonDiscMaterial);
    this.horizonDisc.position.y = -150;
    this.horizonDisc.receiveShadow = true;
    this.horizonDisc.userData = { isHorizonDisc: true };
    this.group.add(this.horizonDisc);

    // 2. Detailed terrain plane
    const segments = 220;
    const geom = new THREE.PlaneGeometry(size, size, segments, segments);
    geom.rotateX(-Math.PI / 2);

    this.terrainMesh = new THREE.Mesh(geom, this.groundMaterial);
    this.terrainMesh.receiveShadow = true;
    this.group.add(this.terrainMesh);

    // Wireframe overlay for terrain contours
    this.terrainWireframeMesh = new THREE.Mesh(geom, this.wireframeMaterial);
    this.terrainWireframeMesh.visible = this.showWireframe;
    this.group.add(this.terrainWireframeMesh);
  }

  /**
   * Displaces the terrain mesh vertices based on elevation data and exaggeration factor
   */
  public rebuildTerrain(
    elevation: ElevationGrid | null | undefined,
    radius: number,
    exaggeration = 1.0,
    center?: GeoPoint
  ) {
    this.currentElevation = elevation || null;
    this.currentExaggeration = exaggeration;
    this.currentRadius = radius;
    if (center) this.currentCenter = center;

    this.currentTerrainSize = Math.max(5000, Math.round(radius * 2.2));
    const size = this.currentTerrainSize;
    const segments = 220;

    if (this.terrainMesh) {
      this.terrainMesh.geometry.dispose();
      const geom = new THREE.PlaneGeometry(size, size, segments, segments);
      geom.rotateX(-Math.PI / 2);

      const pos = geom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vz = pos.getZ(i);
        const vy = sampleElevation(elevation, vx, vz, exaggeration);
        pos.setY(i, vy);
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();

      this.terrainMesh.geometry = geom;
      if (this.terrainWireframeMesh) {
        this.terrainWireframeMesh.geometry = geom;
      }
    }

    if (this.isSatelliteActive && this.currentCenter) {
      this.setSatelliteOverlay(true, this.currentCenter, this.currentRadius);
    }
  }

  /**
   * Toggles satellite imagery overlay on the terrain surface
   */
  public updateLighting(color: THREE.Color) {
    this.targetLightingColor.copy(color);
    this.lightingBlend = 0;
  }

  public async setSatelliteOverlay(active: boolean, center?: GeoPoint, radius?: number) {
    this.isSatelliteActive = active;
    if (center) this.currentCenter = center;
    if (radius) {
      this.currentRadius = radius;
      // IMPORTANT: do NOT recompute currentTerrainSize here. It must equal the
      // exact extent of the terrain mesh (set in rebuildTerrain: radius * 2.2,
      // min 5000) — the satellite canvas is projected for that extent and the
      // mesh UVs map [0,1] across it. Any mismatch (previously radius * 2.5)
      // scales the imagery wrong and drifts it out of alignment with the map.
    }

    if (!this.terrainMesh) return;

    if (active && this.currentCenter) {
      try {
        const tex = await loadSatelliteTexture(this.currentCenter, this.currentTerrainSize);
        if (this.terrainMesh && this.isSatelliteActive) {
          this.groundMaterial.map = tex;
          this.groundMaterial.color.setHex(0xffffff);
          this.groundMaterial.needsUpdate = true;

          // Fade solid vegetation overlays to reveal real satellite trees and landscape
          if (this.landuseMaterials.park) (this.landuseMaterials.park as any).opacity = 0.25;
          if (this.landuseMaterials.forest) (this.landuseMaterials.forest as any).opacity = 0.25;
          if (this.landuseMaterials.grass) (this.landuseMaterials.grass as any).opacity = 0.25;
        }
      } catch (err) {
        console.warn('Failed loading satellite texture overlay:', err);
      }
    } else {
      this.groundMaterial.map = this.baseGroundTexture;
      this.groundMaterial.color.setHex(0x858e99);
      this.groundMaterial.needsUpdate = true;

      // Restore solid landuse overlays
      if (this.landuseMaterials.park) (this.landuseMaterials.park as any).opacity = 1.0;
      if (this.landuseMaterials.forest) (this.landuseMaterials.forest as any).opacity = 1.0;
      if (this.landuseMaterials.grass) (this.landuseMaterials.grass as any).opacity = 1.0;
    }
  }

  /**
   * Rebuilds landuse meshes with conformal internal grid tessellation.
   * Eliminates chord clipping, z-fighting, and floating vertices on undulating elevation meshes.
   */
  public rebuildLanduse(
    landuseAreas: LanduseArea[],
    radius: number,
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    this.currentElevation = elevation || this.currentElevation;
    this.currentExaggeration = exaggeration;

    // Remove existing landuse meshes
    const toRemove: THREE.Object3D[] = [];
    this.group.children.forEach((child) => {
      if (child.userData?.isLanduse || child.userData?.isBoundary) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((c) => {
      if (c instanceof THREE.Mesh) c.geometry.dispose();
      if (c instanceof THREE.LineLoop) c.geometry.dispose();
      this.group.remove(c);
    });

    // 1. Build Terrain-Conforming Landuse Meshes
    for (const lu of landuseAreas) {
      if (!lu.polygon || lu.polygon.length < 3) continue;

      try {
        const isWater = lu.type === 'water';
        const typeKey = lu.type in this.landuseMaterials ? lu.type : 'other';
        const mat = this.landuseMaterials[typeKey] || this.landuseMaterials.other;

        // Tessellate polygon with internal grid points spaced every 4.0m to 5.0m
        // so every vertex strictly hugs the 3D elevation terrain!
        const gridStep = isWater ? 6.0 : 8.5;
        const tessellated = tessellatePolygonConformal(lu.polygon, 6.0, gridStep);
        if (tessellated.points.length < 3 || tessellated.indices.length === 0) continue;

        const pts = tessellated.points;
        const indices = tessellated.indices;

        const positions = new Float32Array(pts.length * 3);
        const uvs = new Float32Array(pts.length * 2);

        // Snug vertical offset above terrain base plane
        const yBaseOffset = isWater ? 0.05 : 0.03;

        for (let i = 0; i < pts.length; i++) {
          const vx = pts[i].x;
          const vz = pts[i].z;

          // Directly sample 3D terrain elevation so waterways follow riverbeds and valleys perfectly
          const vy = sampleElevation(elevation, vx, vz, exaggeration);

          positions[i * 3] = vx;
          positions[i * 3 + 1] = vy + yBaseOffset;
          positions[i * 3 + 2] = vz;

          // World-space UV mapping for seamless procedural texturing
          uvs[i * 2] = vx * 0.05;
          uvs[i * 2 + 1] = vz * 0.05;
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const mesh = new THREE.Mesh(geom, mat);
        mesh.receiveShadow = true;
        mesh.userData = { isLanduse: true, landuseType: lu.type, name: lu.name };

        this.group.add(mesh);
      } catch (err) {
        // Skip degenerate polygon
      }
    }
  }

  public setWireframe(show: boolean) {
    this.showWireframe = show;
    if (this.terrainWireframeMesh) {
      this.terrainWireframeMesh.visible = show;
    }
  }

  public setGridVisible(visible: boolean) {
    this.setWireframe(visible);
  }

  public setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  public dispose() {
    this.group.children.forEach((c) => {
      if (c instanceof THREE.Mesh) c.geometry.dispose();
      if (c instanceof THREE.LineLoop) c.geometry.dispose();
    });
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    this.groundMaterial.dispose();
    this.horizonDiscMaterial.dispose();
    this.wireframeMaterial.dispose();
    this.baseGroundTexture.dispose();
    this.grassTexture.dispose();
    this.parkTexture.dispose();
    this.forestTexture.dispose();
    this.meadowTexture.dispose();
    this.waterTexture.dispose();
    Object.values(this.landuseMaterials).forEach((m) => m.dispose());
  }
}
