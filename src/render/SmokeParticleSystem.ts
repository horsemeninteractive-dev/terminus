import * as THREE from 'three';
import { HiddenSurvivorGroup } from '../types/population';
import { AdaptedBuilding, DeconstructionJob } from '../types/settlement';

interface SmokePuff {
  mesh: THREE.Mesh;
  baseX: number;
  baseY: number;
  baseZ: number;
  offsetTime: number;
  speed: number;
  driftX: number;
  driftZ: number;
}

function toValues<V = any>(val: any): V[] {
  if (!val) return [];
  if (val instanceof Map) return Array.from(val.values());
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return Object.values(val) as V[];
  return [];
}

export class SmokeParticleSystem {
  public group = new THREE.Group();
  private puffs: SmokePuff[] = [];
  private smokeGeometry = new THREE.SphereGeometry(0.8, 6, 6);
  private smokeMaterial = new THREE.MeshLambertMaterial({
    color: 0x9ca3af,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });

  // Construction scaffold markers
  public constructionGroup = new THREE.Group();
  private constructionMarkers: { ring: THREE.Mesh; bldgId: string | number }[] = [];

  // Deconstruction progress markers (§7.2)
  public deconstructionGroup = new THREE.Group();
  private deconstructionMarkers: { ring: THREE.Mesh; job: DeconstructionJob; baseRadius: number }[] = [];

  constructor() {
    this.group.name = 'SmokeParticleGroup';
    this.constructionGroup.name = 'ConstructionMarkersGroup';
    this.deconstructionGroup.name = 'DeconstructionMarkersGroup';
  }

  /**
   * Rebuilds smoke emitters for hidden survivor groups with smoke clues
   */
  public updateEmitters(
    hiddenGroups: Map<string | number, HiddenSurvivorGroup>,
    buildingMeshes: Map<string | number, THREE.Mesh>,
    adaptedBuildings?: Map<string | number, AdaptedBuilding>
  ) {
    // Clean up previous puffs
    for (const p of this.puffs) {
      this.group.remove(p.mesh);
      p.mesh.geometry.dispose();
    }
    this.puffs = [];

    // Add smoke for hidden groups with smoke clue
    const groupsList = toValues<HiddenSurvivorGroup>(hiddenGroups);
    groupsList.forEach((group) => {
      if (group && group.hasSmokeClue && !group.isRecruited) {
        const mesh = buildingMeshes.get(group.buildingId);
        if (mesh && mesh.geometry) {
          mesh.geometry.computeBoundingBox();
          const bbox = mesh.geometry.boundingBox;
          const topY = bbox ? mesh.position.y + bbox.max.y : mesh.position.y + 12;
          const pos = mesh.position;

          this.createSmokePlume(pos.x, topY, pos.z, 7);
        }
      }
    });

    // Also add subtle smoke for active cookhouses/workshops
    if (adaptedBuildings) {
      const adaptedList = toValues<AdaptedBuilding>(adaptedBuildings);
      adaptedList.forEach((bldg) => {
        if (bldg && (bldg.category === 'food' || bldg.category === 'production')) {
          const mesh = buildingMeshes.get(bldg.buildingId);
          if (mesh) {
            const topY = mesh.position.y + (bldg.height || 10);
            this.createSmokePlume(bldg.position.x, topY, bldg.position.z, 5);
          }
        }
      });
    }
  }

  private createSmokePlume(x: number, y: number, z: number, count = 6) {
    for (let i = 0; i < count; i++) {
      const puffMesh = new THREE.Mesh(this.smokeGeometry, this.smokeMaterial);
      puffMesh.position.set(x, y, z);
      this.group.add(puffMesh);

      this.puffs.push({
        mesh: puffMesh,
        baseX: x + (Math.random() - 0.5) * 1.5,
        baseY: y,
        baseZ: z + (Math.random() - 0.5) * 1.5,
        offsetTime: (i / count) * 4.0, // Staggered loop
        speed: 2.2 + Math.random() * 0.8,
        driftX: 0.4 + Math.random() * 0.3,
        driftZ: 0.2 + (Math.random() - 0.5) * 0.4,
      });
    }
  }

  /**
   * Updates construction progress visual cues in 3D scene
   */
  public updateConstructionVisuals(
    adaptedMap: Map<string | number, AdaptedBuilding>,
    freestanding: AdaptedBuilding[],
    buildingMeshes: Map<string | number, THREE.Mesh>
  ) {
    // Clear previous
    while (this.constructionGroup.children.length > 0) {
      const obj = this.constructionGroup.children[0] as THREE.Mesh;
      this.constructionGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    }
    this.constructionMarkers = [];

    const all = [...toValues<AdaptedBuilding>(adaptedMap), ...(Array.isArray(freestanding) ? freestanding : [])];
    for (const bldg of all) {
      if (bldg && (bldg.constructionStatus === 'in_progress' || bldg.constructionStatus === 'planned')) {
        const mesh = buildingMeshes.get(bldg.buildingId);
        const y = mesh ? mesh.position.y + (bldg.height || 6) + 1.5 : (bldg.height || 6) + 1.5;

        // Rotating gear / construction beacon ring
        const ringGeom = new THREE.TorusGeometry(3.5, 0.25, 8, 24);
        ringGeom.rotateX(Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.85,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.position.set(bldg.position.x, y, bldg.position.z);
        this.constructionGroup.add(ring);
        this.constructionMarkers.push({ ring, bldgId: bldg.buildingId });
      }
    }
  }

  /**
   * Renders deconstruction progress rings on buildings being torn down (§7.2).
   */
  public updateDeconstructionVisuals(
    jobs: Map<string | number, DeconstructionJob>,
    buildingMeshes: Map<string | number, THREE.Mesh>
  ) {
    while (this.deconstructionGroup.children.length > 0) {
      const obj = this.deconstructionGroup.children[0] as THREE.Mesh;
      this.deconstructionGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    }
    this.deconstructionMarkers = [];

    for (const job of toValues<DeconstructionJob>(jobs)) {
      const mesh = buildingMeshes.get(job.buildingId);
      let topY = 12;
      if (mesh && mesh.geometry) {
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        topY = bbox ? mesh.position.y + bbox.max.y + 1.2 : mesh.position.y + 12;
      }

      const ringGeom = new THREE.TorusGeometry(1, 0.22, 8, 28);
      ringGeom.rotateX(Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.9,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.set(job.position.x, topY, job.position.z);
      this.deconstructionGroup.add(ring);
      this.deconstructionMarkers.push({ ring, job, baseRadius: 4.5 });
    }
  }

  /**
   * Animation tick
   */
  public update(delta: number, totalTime: number) {
    // 1. Animate smoke puffs
    const loopDuration = 4.0; // 4 seconds per cycle
    const maxHeight = 16.0;

    for (const p of this.puffs) {
      const t = (totalTime + p.offsetTime) % loopDuration;
      const progress = t / loopDuration; // 0 to 1

      // Height increases
      const curY = p.baseY + progress * maxHeight;
      // Gentle wind drift
      const curX = p.baseX + progress * p.driftX * 8 + Math.sin(totalTime * 1.5 + p.offsetTime) * 0.6;
      const curZ = p.baseZ + progress * p.driftZ * 8 + Math.cos(totalTime * 1.2 + p.offsetTime) * 0.6;

      p.mesh.position.set(curX, curY, curZ);

      // Expands as it rises
      const scale = 1.0 + progress * 2.8;
      p.mesh.scale.set(scale, scale, scale);

      // Fade in then out
      const opacity = progress < 0.2 ? progress / 0.2 * 0.4 : (1 - progress) * 0.4;
      (p.mesh.material as THREE.MeshLambertMaterial).opacity = opacity;
    }

    // 2. Animate construction rotating markers
    for (const c of this.constructionMarkers) {
      c.ring.rotation.y += delta * 1.2;
    }

    // 3. Animate deconstruction markers: rotate and shrink as the building is torn down
    for (const d of this.deconstructionMarkers) {
      d.ring.rotation.y -= delta * 1.4;
      const progress = Math.max(0, Math.min(100, d.job.progressPct || 0)) / 100;
      const radius = Math.max(1.1, d.baseRadius * (1 - progress));
      d.ring.scale.set(radius, radius, 1);
      (d.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + progress * 0.45;
    }
  }

  public dispose() {
    for (const p of this.puffs) {
      p.mesh.geometry.dispose();
    }
    this.puffs = [];
    this.smokeGeometry.dispose();
    this.smokeMaterial.dispose();
  }
}
