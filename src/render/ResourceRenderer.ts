import * as THREE from 'three';
import { sampleElevation, sampleElevationNormal } from '../services/elevationService';
import { ElevationGrid, ResourceNode, ResourceNodeType } from '../types/map';

export interface HoveredResourceInfo {
  id: string;
  type: ResourceNodeType;
  subType: string;
  position: { x: number; z: number };
  description: string;
}

interface DepletionAnimation {
  mesh: THREE.InstancedMesh;
  instanceIdx: number;
  node: ResourceNode;
  basePos: THREE.Vector3;
  startTime: number;
  duration: number;
  axis: THREE.Vector3; // world-space fall axis (trees) / unused for other types
  isTree: boolean;
  phase: 'falling' | 'settling' | 'done';
  phaseStart: number;
}

export class ResourceRenderer {
  public group = new THREE.Group();

  /**
   * Terrain surface sampler injected by WorldScene: height of the terrain AS
   * RENDERED (piecewise-linear mesh) or null outside the mesh. Resource nodes
   * must sit ON the visible terrain — the smooth analytic elevation can sit
   * meters below the rendered triangles on slopes.
   */
  private terrainSurfaceSampler: ((x: number, z: number) => number | null) | null = null;

  public setTerrainSurfaceSampler(sampler: ((x: number, z: number) => number | null) | null) {
    this.terrainSurfaceSampler = sampler;
  }

  /** Rendered-terrain height when available, else the smooth analytic surface. */
  private terrainY(
    elevation: ElevationGrid | null | undefined,
    x: number,
    z: number,
    exaggeration: number
  ): number {
    return this.terrainSurfaceSampler?.(x, z) ?? sampleElevation(elevation, x, z, exaggeration);
  }

  private nodes: ResourceNode[] = [];
  private instancedMeshes: THREE.InstancedMesh[] = [];
  private nodeLookup: Map<number, ResourceNode> = new Map(); // instanceId -> node

  // Depletion animations: when a node hits 0 the tree falls over (rotating
  // around its base) and then shrinks away, leaving a stump behind. Non-tree
  // nodes (cars/lampposts/rubble) just dissolve via scale-down.
  private depletionAnimations: DepletionAnimation[] = [];
  private queuedDepletions = new Set<string>();
  private lastFrameNow = 0;
  private depletionDummy = new THREE.Object3D();
  // Remembers the elevation grid used at rebuild so animated/stump placements
  // land on the correct terrain height.
  private elevation: ElevationGrid | null = null;
  private exaggeration = 1.0;

  // Depleted-tree markers: stubby gray stumps persist where a felled tree was.
  private stumpMaterial = new THREE.MeshLambertMaterial({ color: 0x5a4633 });
  private stumpMesh: THREE.InstancedMesh | null = null;
  private stumpCount = 0;
  private maxTreeCount = 0;

  // Materials
  private woodTrunkMaterial = new THREE.MeshLambertMaterial({ color: 0x3d2817 });
  private woodFoliageMaterial = new THREE.MeshLambertMaterial({ color: 0x2e4228 });
  private woodFoliageAltMaterial = new THREE.MeshLambertMaterial({ color: 0x3d5433 });

  private metalCarMaterial = new THREE.MeshLambertMaterial({ color: 0x4a433e });
  private metalCarAltMaterial = new THREE.MeshLambertMaterial({ color: 0x5c382e }); // Rusted reddish
  private metalGlassMaterial = new THREE.MeshLambertMaterial({ color: 0x1f272e });
  private metalWheelMaterial = new THREE.MeshLambertMaterial({ color: 0x17181c });
  private metalLampMaterial = new THREE.MeshLambertMaterial({ color: 0x383a3d });

  private brickRubbleMaterial = new THREE.MeshLambertMaterial({ color: 0x6e4539 });
  private concreteRubbleMaterial = new THREE.MeshLambertMaterial({ color: 0x595855 });

  // Selection Highlight in Tactical Blue
  private highlightGroup = new THREE.Group();
  private highlightRingMesh: THREE.InstancedMesh | null = null;
  private highlightColumnMesh: THREE.InstancedMesh | null = null;
  private highlightRingMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private highlightColumnMaterial = new THREE.MeshBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  constructor() {
    this.group.name = 'ResourceNodesGroup';
    this.highlightGroup.name = 'ResourceHighlightGroup';
    this.group.add(this.highlightGroup);
    this.highlightGroup.visible = false;
  }

  public rebuildResources(
    nodes: ResourceNode[],
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    this.clear();
    this.elevation = elevation ?? null;
    this.exaggeration = exaggeration;
    // Every tree (active or already depleted) can eventually leave a stump, so
    // size the stump pool to the full tree count on the map.
    this.maxTreeCount = nodes.filter(
      (n) => n.subType === 'tree' || n.subType === 'tree_large'
    ).length;
    const activeNodes = nodes.filter(n => n.amount > 0);
    this.nodes = activeNodes;

    const treesNormal: ResourceNode[] = [];
    const treesLarge: ResourceNode[] = [];
    const carsSedan: ResourceNode[] = [];
    const carsSuv: ResourceNode[] = [];
    const trucks: ResourceNode[] = [];
    const lampposts: ResourceNode[] = [];
    const rubbleBrick: ResourceNode[] = [];
    const rubbleConcrete: ResourceNode[] = [];

    activeNodes.forEach((node) => {
      switch (node.subType) {
        case 'tree':
          treesNormal.push(node);
          break;
        case 'tree_large':
          treesLarge.push(node);
          break;
        case 'car_sedan':
          carsSedan.push(node);
          break;
        case 'car_suv':
          carsSuv.push(node);
          break;
        case 'truck':
          trucks.push(node);
          break;
        case 'lamppost':
          lampposts.push(node);
          break;
        case 'rubble_brick':
          rubbleBrick.push(node);
          break;
        case 'rubble_concrete':
        default:
          rubbleConcrete.push(node);
          break;
      }
    });

    // 1. Build Tree Instanced Meshes (Trunk + Foliage)
    this.createTreeInstances(treesNormal, false, elevation, exaggeration);
    this.createTreeInstances(treesLarge, true, elevation, exaggeration);

    // 2. Build Abandoned Vehicle Instanced Meshes
    this.createVehicleInstances(carsSedan, 'sedan', elevation, exaggeration);
    this.createVehicleInstances(carsSuv, 'suv', elevation, exaggeration);
    this.createVehicleInstances(trucks, 'truck', elevation, exaggeration);

    // 3. Build Lamppost Instanced Meshes
    this.createLamppostInstances(lampposts, elevation, exaggeration);

    // 4. Build Rubble Instanced Meshes
    this.createRubbleInstances(rubbleBrick, true, elevation, exaggeration);
    this.createRubbleInstances(rubbleConcrete, false, elevation, exaggeration);

    // Seed stumps for trees that were already depleted on this map (e.g. a
    // reloaded save whose resource depletion was persisted), so the world stays
    // consistent between gaming sessions.
    for (const n of nodes) {
      if ((n.subType === 'tree' || n.subType === 'tree_large') && n.amount <= 0) {
        const y = this.terrainY(this.elevation, n.position.x, n.position.z, this.exaggeration);
        this.addStump(n, y);
      }
    }
  }

  private createTreeInstances(
    nodes: ResourceNode[],
    isLarge: boolean,
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    if (nodes.length === 0) return;

    // Combined Tree Geometry (Trunk cylinder + 2 Cones)
    const trunkH = isLarge ? 4.5 : 3.2;
    const trunkR = isLarge ? 0.35 : 0.25;
    const foliageR = isLarge ? 2.4 : 1.8;
    const foliageH = isLarge ? 4.8 : 3.6;

    const trunkGeom = new THREE.CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 6);
    trunkGeom.translate(0, trunkH / 2, 0);

    const foliage1Geom = new THREE.ConeGeometry(foliageR, foliageH, 7);
    foliage1Geom.translate(0, trunkH * 0.7 + foliageH / 2, 0);

    const foliage2Geom = new THREE.ConeGeometry(foliageR * 0.75, foliageH * 0.8, 7);
    foliage2Geom.translate(0, trunkH * 0.7 + foliageH * 0.7 + (foliageH * 0.8) / 2, 0);

    // Merge into one geometry with vertex groups for 2 materials
    const treeGeom = new THREE.BufferGeometry();
    const pos = [];
    const norms = [];

    const nonIndexedTrunk = trunkGeom.toNonIndexed();
    const nonIndexedF1 = foliage1Geom.toNonIndexed();
    const nonIndexedF2 = foliage2Geom.toNonIndexed();

    // Trunk
    const tPos = nonIndexedTrunk.attributes.position.array;
    const tNorm = nonIndexedTrunk.attributes.normal.array;
    for (let i = 0; i < tPos.length; i++) pos.push(tPos[i]);
    for (let i = 0; i < tNorm.length; i++) norms.push(tNorm[i]);
    const trunkVertexCount = nonIndexedTrunk.attributes.position.count;

    // Foliage 1
    const f1Pos = nonIndexedF1.attributes.position.array;
    const f1Norm = nonIndexedF1.attributes.normal.array;
    for (let i = 0; i < f1Pos.length; i++) pos.push(f1Pos[i]);
    for (let i = 0; i < f1Norm.length; i++) norms.push(f1Norm[i]);
    const f1VertexCount = nonIndexedF1.attributes.position.count;

    // Foliage 2
    const f2Pos = nonIndexedF2.attributes.position.array;
    const f2Norm = nonIndexedF2.attributes.normal.array;
    for (let i = 0; i < f2Pos.length; i++) pos.push(f2Pos[i]);
    for (let i = 0; i < f2Norm.length; i++) norms.push(f2Norm[i]);
    const f2VertexCount = nonIndexedF2.attributes.position.count;

    treeGeom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    treeGeom.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));

    treeGeom.addGroup(0, trunkVertexCount, 0);
    treeGeom.addGroup(trunkVertexCount, f1VertexCount + f2VertexCount, 1);

    trunkGeom.dispose();
    foliage1Geom.dispose();
    foliage2Geom.dispose();
    nonIndexedTrunk.dispose();
    nonIndexedF1.dispose();
    nonIndexedF2.dispose();

    const instancedMesh = new THREE.InstancedMesh(
      treeGeom,
      [this.woodTrunkMaterial, isLarge ? this.woodFoliageAltMaterial : this.woodFoliageMaterial],
      nodes.length
    );
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;
    instancedMesh.userData = { type: 'resource_tree', isLarge, resourceNodes: nodes };

    const dummy = new THREE.Object3D();
    nodes.forEach((node, idx) => {
      const terrainY = this.terrainY(elevation, node.position.x, node.position.z, exaggeration);
      dummy.position.set(node.position.x, terrainY, node.position.z);
      dummy.rotation.set(0, node.rotation, 0);
      dummy.scale.set(node.scale, node.scale, node.scale);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(idx, dummy.matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    this.group.add(instancedMesh);
    this.instancedMeshes.push(instancedMesh);
  }

  private createVehicleInstances(
    nodes: ResourceNode[],
    variant: 'sedan' | 'suv' | 'truck',
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    if (nodes.length === 0) return;

    let length = 4.2;
    let width = 1.9;
    let bodyH = 0.8;
    let cabinH = 0.7;

    if (variant === 'suv') {
      length = 4.6;
      width = 2.0;
      bodyH = 0.95;
      cabinH = 0.8;
    } else if (variant === 'truck') {
      length = 5.8;
      width = 2.2;
      bodyH = 1.1;
      cabinH = 1.0;
    }

    // Chassis / lower body
    const bodyGeom = new THREE.BoxGeometry(width, bodyH, length);
    bodyGeom.translate(0, bodyH / 2 + 0.3, 0);

    // Cabin / upper glass box
    const cabinLen = variant === 'truck' ? length * 0.4 : length * 0.55;
    const cabinZOffset = variant === 'truck' ? length * 0.22 : -0.15;
    const cabinGeom = new THREE.BoxGeometry(width * 0.88, cabinH, cabinLen);
    cabinGeom.translate(0, bodyH + cabinH / 2 + 0.3, cabinZOffset);

    // Wheels (4 corner boxes)
    const wheelGeom1 = new THREE.BoxGeometry(0.3, 0.6, 0.6);
    wheelGeom1.translate(width / 2, 0.3, length * 0.3);
    const wheelGeom2 = new THREE.BoxGeometry(0.3, 0.6, 0.6);
    wheelGeom2.translate(-width / 2, 0.3, length * 0.3);
    const wheelGeom3 = new THREE.BoxGeometry(0.3, 0.6, 0.6);
    wheelGeom3.translate(width / 2, 0.3, -length * 0.3);
    const wheelGeom4 = new THREE.BoxGeometry(0.3, 0.6, 0.6);
    wheelGeom4.translate(-width / 2, 0.3, -length * 0.3);

    // Composite single geometry
    const carGeom = new THREE.BufferGeometry();
    const pos: number[] = [];
    const norms: number[] = [];

    const addGeom = (g: THREE.BufferGeometry) => {
      const nonIndexed = g.toNonIndexed();
      const p = nonIndexed.attributes.position.array;
      const n = nonIndexed.attributes.normal.array;
      for (let i = 0; i < p.length; i++) pos.push(p[i]);
      for (let i = 0; i < n.length; i++) norms.push(n[i]);
      const count = nonIndexed.attributes.position.count;
      nonIndexed.dispose();
      g.dispose();
      return count;
    };

    const bCount = addGeom(bodyGeom);
    const cCount = addGeom(cabinGeom);
    const w1 = addGeom(wheelGeom1);
    const w2 = addGeom(wheelGeom2);
    const w3 = addGeom(wheelGeom3);
    const w4 = addGeom(wheelGeom4);

    carGeom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    carGeom.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));

    carGeom.addGroup(0, bCount, 0); // Body material
    carGeom.addGroup(bCount, cCount, 1); // Cabin glass
    carGeom.addGroup(bCount + cCount, w1 + w2 + w3 + w4, 2); // Wheels

    const instancedMesh = new THREE.InstancedMesh(
      carGeom,
      [
        variant === 'truck' ? this.metalCarAltMaterial : this.metalCarMaterial,
        this.metalGlassMaterial,
        this.metalWheelMaterial,
      ],
      nodes.length
    );
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;
    instancedMesh.userData = { type: 'resource_metal_vehicle', variant, resourceNodes: nodes };

    const dummy = new THREE.Object3D();
    const upVector = new THREE.Vector3(0, 1, 0);

    nodes.forEach((node, idx) => {
      const terrainY = this.terrainY(elevation, node.position.x, node.position.z, exaggeration);
      const normal = sampleElevationNormal(elevation, node.position.x, node.position.z, exaggeration);

      dummy.position.set(node.position.x, terrainY, node.position.z);

      // Align vehicle orientation to slope normal and heading rotation
      const slopeNormal = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
      dummy.quaternion.setFromUnitVectors(upVector, slopeNormal);
      dummy.rotateY(node.rotation);

      dummy.scale.set(node.scale, node.scale, node.scale);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(idx, dummy.matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    this.group.add(instancedMesh);
    this.instancedMeshes.push(instancedMesh);
  }

  private createLamppostInstances(
    nodes: ResourceNode[],
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    if (nodes.length === 0) return;

    const poleH = 5.5;
    const poleGeom = new THREE.CylinderGeometry(0.08, 0.12, poleH, 6);
    poleGeom.translate(0, poleH / 2, 0);

    const armGeom = new THREE.BoxGeometry(0.12, 0.12, 1.2);
    armGeom.translate(0, poleH - 0.1, 0.5);

    const lampGeom = new THREE.BufferGeometry();
    const pos: number[] = [];
    const norms: number[] = [];

    const pPos = poleGeom.attributes.position.array;
    const pNorm = poleGeom.attributes.normal.array;
    for (let i = 0; i < pPos.length; i++) pos.push(pPos[i]);
    for (let i = 0; i < pNorm.length; i++) norms.push(pNorm[i]);

    const aPos = armGeom.attributes.position.array;
    const aNorm = armGeom.attributes.normal.array;
    for (let i = 0; i < aPos.length; i++) pos.push(aPos[i]);
    for (let i = 0; i < aNorm.length; i++) norms.push(aNorm[i]);

    lampGeom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lampGeom.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));

    poleGeom.dispose();
    armGeom.dispose();

    const instancedMesh = new THREE.InstancedMesh(lampGeom, this.metalLampMaterial, nodes.length);
    instancedMesh.castShadow = true;
    instancedMesh.userData = { type: 'resource_metal_lamp', resourceNodes: nodes };

    const dummy = new THREE.Object3D();
    nodes.forEach((node, idx) => {
      const terrainY = this.terrainY(elevation, node.position.x, node.position.z, exaggeration);
      dummy.position.set(node.position.x, terrainY, node.position.z);
      dummy.rotation.set(0, node.rotation, 0);
      dummy.scale.set(node.scale, node.scale, node.scale);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(idx, dummy.matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    this.group.add(instancedMesh);
    this.instancedMeshes.push(instancedMesh);
  }

  private createRubbleInstances(
    nodes: ResourceNode[],
    isBrick: boolean,
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    if (nodes.length === 0) return;

    const rubbleGeom = new THREE.DodecahedronGeometry(1.0, 0);
    rubbleGeom.scale(1.4, 0.45, 1.2);
    rubbleGeom.translate(0, 0.22, 0);

    const instancedMesh = new THREE.InstancedMesh(
      rubbleGeom,
      isBrick ? this.brickRubbleMaterial : this.concreteRubbleMaterial,
      nodes.length
    );
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;
    instancedMesh.userData = { type: 'resource_bricks', isBrick, resourceNodes: nodes };

    const dummy = new THREE.Object3D();
    nodes.forEach((node, idx) => {
      const terrainY = this.terrainY(elevation, node.position.x, node.position.z, exaggeration);
      dummy.position.set(node.position.x, terrainY, node.position.z);
      dummy.rotation.set(0, node.rotation, 0);
      dummy.scale.set(node.scale, node.scale, node.scale);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(idx, dummy.matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    this.group.add(instancedMesh);
    this.instancedMeshes.push(instancedMesh);
  }

  public raycastResource(raycaster: THREE.Raycaster): ResourceNode | null {
    const hits = raycaster.intersectObjects(this.group.children, true);
    for (const hit of hits) {
      const nodes = (hit.object as THREE.Object3D).userData?.resourceNodes as ResourceNode[] | undefined;
      const instanceId = (hit as THREE.Intersection & { instanceId?: number }).instanceId;
      if (nodes && instanceId !== undefined && nodes[instanceId]) return nodes[instanceId];
    }
    return null;
  }

  public updateNodeAmounts(nodes: ResourceNode[]) {
    const amounts = new Map(nodes.map(n => [n.id, n.amount]));
    const tmpMatrix = new THREE.Matrix4();
    const tmpPos = new THREE.Vector3();
    const tmpQuat = new THREE.Quaternion();
    const tmpScale = new THREE.Vector3();
    for (const mesh of this.instancedMeshes) {
      const resourceNodes = mesh.userData?.resourceNodes as ResourceNode[] | undefined;
      if (!resourceNodes) continue;
      resourceNodes.forEach((node, idx) => {
        if (this.queuedDepletions.has(node.id)) return;
        if ((amounts.get(node.id) ?? node.amount) > 0) return;
        // Node just hit zero — queue its falling/dissolve animation instead of
        // popping it out of existence instantly.
        mesh.getMatrixAt(idx, tmpMatrix);
        tmpMatrix.decompose(tmpPos, tmpQuat, tmpScale);
        this.queueDepletion(mesh, idx, node, tmpPos.clone());
      });
    }
  }

  /** Advance all in-flight depletion animations; call once per render frame. */
  public update(deltaSec: number, nowSec: number) {
    this.lastFrameNow = nowSec;
    if (this.depletionAnimations.length === 0) return;
    const MAX_FALL_ANGLE = Math.PI * 0.5 - 0.05; // ~87°, just short of flat
    for (const anim of this.depletionAnimations) {
      if (anim.phase === 'falling') {
        const t = Math.min(1, (nowSec - anim.phaseStart) / anim.duration);
        const angle = anim.isTree ? (1 - Math.pow(1 - t, 3)) * MAX_FALL_ANGLE : 0;
        const scaleMul = anim.isTree ? 1 : Math.max(0, 1 - t * t);
        this.applyDepletionMatrix(anim, angle, scaleMul);
        if (t >= 1) {
          anim.phase = 'settling';
          anim.phaseStart = nowSec;
        }
      } else if (anim.phase === 'settling') {
        const t2 = Math.min(1, (nowSec - anim.phaseStart) / 0.4);
        this.applyDepletionMatrix(anim, MAX_FALL_ANGLE, Math.max(0, 1 - t2 * t2));
        if (t2 >= 1) {
          anim.phase = 'done';
          // Tree is felled — hide it permanently and leave a stump marker.
          this.depletionDummy.position.copy(anim.basePos);
          this.depletionDummy.quaternion.identity();
          this.depletionDummy.scale.set(0, 0, 0);
          this.depletionDummy.updateMatrix();
          anim.mesh.setMatrixAt(anim.instanceIdx, this.depletionDummy.matrix);
          anim.mesh.instanceMatrix.needsUpdate = true;
          if (anim.isTree) this.addStump(anim.node, anim.basePos.y);
        }
      }
    }
    this.depletionAnimations = this.depletionAnimations.filter(a => a.phase !== 'done');
  }

  private queueDepletion(
    mesh: THREE.InstancedMesh,
    instanceIdx: number,
    node: ResourceNode,
    basePos: THREE.Vector3
  ) {
    this.queuedDepletions.add(node.id);
    const isTree = node.subType === 'tree' || node.subType === 'tree_large';
    const now = this.lastFrameNow >= 1 ? this.lastFrameNow : this.timeNow();
    this.depletionAnimations.push({
      mesh,
      instanceIdx,
      node,
      basePos,
      startTime: now,
      duration: isTree ? 1.4 : 0.8,
      axis: Math.random() < 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1),
      isTree,
      phase: 'falling',
      phaseStart: now,
    });
  }

  private applyDepletionMatrix(anim: DepletionAnimation, angle: number, scaleMul: number) {
    const m = new THREE.Matrix4();
    const rot = new THREE.Matrix4().makeRotationAxis(anim.axis, angle);
    const rotY = new THREE.Matrix4().makeRotationY(anim.node.rotation || 0);
    const s = (anim.node.scale || 1) * scaleMul;
    const sc = new THREE.Matrix4().makeScale(s, s, s);
    m.makeTranslation(anim.basePos.x, anim.basePos.y, anim.basePos.z);
    // World-space fall around the trunk base, then the node's own yaw + scale.
    m.multiply(rot).multiply(rotY).multiply(sc);
    anim.mesh.setMatrixAt(anim.instanceIdx, m);
    anim.mesh.instanceMatrix.needsUpdate = true;
  }

  private ensureStumpMesh() {
    if (this.stumpMesh) return;
    const geom = new THREE.CylinderGeometry(0.28, 0.38, 0.5, 7);
    geom.translate(0, 0.25, 0);
    const mesh = new THREE.InstancedMesh(geom, this.stumpMaterial, Math.max(this.maxTreeCount, 1));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type: 'resource_stump' };
    this.group.add(mesh);
    this.stumpMesh = mesh;
  }

  private addStump(node: ResourceNode, groundY: number) {
    if (this.stumpCount >= this.maxTreeCount) return;
    this.ensureStumpMesh();
    this.depletionDummy.position.set(node.position.x, groundY, node.position.z);
    this.depletionDummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const s = (node.scale || 1) * 0.85;
    this.depletionDummy.scale.set(s, s, s);
    this.depletionDummy.updateMatrix();
    this.stumpMesh!.setMatrixAt(this.stumpCount, this.depletionDummy.matrix);
    this.stumpCount++;
    this.stumpMesh!.count = this.stumpCount;
    this.stumpMesh!.instanceMatrix.needsUpdate = true;
  }

  /** Number of felled-tree stumps currently rendered (used by tests/debug). */
  public getStumpCount(): number {
    return this.stumpCount;
  }

  private timeNow(): number {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  }

  public setHighlightedNodes(
    nodes: ResourceNode[],
    elevation?: ElevationGrid | null,
    exaggeration = 1.0
  ) {
    if (!nodes || nodes.length === 0) {
      this.highlightGroup.visible = false;
      return;
    }

    // Rebuild or resize highlight instanced meshes if needed
    const count = nodes.length;
    if (
      !this.highlightRingMesh ||
      !this.highlightColumnMesh ||
      this.highlightRingMesh.count < count
    ) {
      if (this.highlightRingMesh) {
        this.highlightGroup.remove(this.highlightRingMesh);
        this.highlightRingMesh.geometry.dispose();
      }
      if (this.highlightColumnMesh) {
        this.highlightGroup.remove(this.highlightColumnMesh);
        this.highlightColumnMesh.geometry.dispose();
      }

      const ringGeom = new THREE.RingGeometry(1.6, 2.3, 24);
      ringGeom.rotateX(-Math.PI / 2);
      const columnGeom = new THREE.CylinderGeometry(1.8, 1.8, 4.0, 16, 1, true);

      this.highlightRingMesh = new THREE.InstancedMesh(
        ringGeom,
        this.highlightRingMaterial,
        Math.max(count, 64)
      );
      this.highlightColumnMesh = new THREE.InstancedMesh(
        columnGeom,
        this.highlightColumnMaterial,
        Math.max(count, 64)
      );

      this.highlightGroup.add(this.highlightRingMesh);
      this.highlightGroup.add(this.highlightColumnMesh);
    }

    const dummyRing = new THREE.Object3D();
    const dummyCol = new THREE.Object3D();

    nodes.forEach((node, idx) => {
      const terrainY = this.terrainY(elevation, node.position.x, node.position.z, exaggeration);
      const scale = node.scale || 1.0;

      dummyRing.position.set(node.position.x, terrainY + 0.15, node.position.z);
      dummyRing.scale.set(scale, 1, scale);
      dummyRing.updateMatrix();
      this.highlightRingMesh!.setMatrixAt(idx, dummyRing.matrix);

      dummyCol.position.set(node.position.x, terrainY + 2.0, node.position.z);
      dummyCol.scale.set(scale, 1, scale);
      dummyCol.updateMatrix();
      this.highlightColumnMesh!.setMatrixAt(idx, dummyCol.matrix);
    });

    this.highlightRingMesh.count = count;
    this.highlightColumnMesh.count = count;
    this.highlightRingMesh.instanceMatrix.needsUpdate = true;
    this.highlightColumnMesh.instanceMatrix.needsUpdate = true;
    this.highlightGroup.visible = true;
  }

  public setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  public clear() {
    this.setHighlightedNodes([]);
    this.instancedMeshes.forEach((mesh) => {
      mesh.geometry.dispose();
    });
    // Remove all children except highlightGroup
    const toRemove: THREE.Object3D[] = [];
    for (const child of this.group.children) {
      if (child !== this.highlightGroup) toRemove.push(child);
    }
    for (const child of toRemove) {
      this.group.remove(child);
    }
    this.instancedMeshes = [];
    this.nodes = [];
    this.nodeLookup.clear();
    // Reset depletion/animation state so a new map starts clean.
    this.depletionAnimations = [];
    this.queuedDepletions.clear();
    this.stumpCount = 0;
    this.maxTreeCount = 0;
    if (this.stumpMesh) {
      this.stumpMesh.geometry.dispose();
      this.stumpMesh = null;
    }
  }

  public dispose() {
    this.clear();
    if (this.highlightRingMesh) {
      this.highlightRingMesh.geometry.dispose();
    }
    if (this.highlightColumnMesh) {
      this.highlightColumnMesh.geometry.dispose();
    }
    this.highlightRingMaterial.dispose();
    this.highlightColumnMaterial.dispose();
    this.woodTrunkMaterial.dispose();
    this.woodFoliageMaterial.dispose();
    this.woodFoliageAltMaterial.dispose();
    this.metalCarMaterial.dispose();
    this.metalCarAltMaterial.dispose();
    this.metalGlassMaterial.dispose();
    this.metalWheelMaterial.dispose();
    this.metalLampMaterial.dispose();
    this.brickRubbleMaterial.dispose();
    this.concreteRubbleMaterial.dispose();
    this.stumpMaterial.dispose();
  }
}
