import * as THREE from 'three';
import { sampleElevation } from '../services/elevationService';
import {
  ARMOR_CATALOG,
  CombatVisualFx,
  DroppedItem,
  HostileHumanUnit,
  NoiseEvent,
  TacticalSquadUnit,
  WEAPON_CATALOG,
  ZombieUnit,
} from '../types/combat';
import { ResourceWorkOrder } from '../types/resourceGathering';
import { ConstructionWorkOrder } from '../types/settlement';
import { ElevationGrid } from '../types/map';
import { PositionSmoother } from './movementSmoothing';
import {
  applyRigPose,
  createHostileRig,
  createSoldierRig,
  createWorkerRig,
  createZombieRig,
  HumanoidRig,
  RigPoseMode,
} from './HumanoidRig';

export class CombatRenderer {
  public group = new THREE.Group();
  public squadGroup = new THREE.Group();
  public workerGroup = new THREE.Group();
  public zombieGroup = new THREE.Group();
  public hostileHumanGroup = new THREE.Group();
  public fxGroup = new THREE.Group();
  public droppedItemsGroup = new THREE.Group();
  public uiOverlayGroup = new THREE.Group();

  // Terrain elevation
  private currentElevation: ElevationGrid | null = null;
  private currentExaggeration = 1.0;

  // Mesh caches
  private squadMeshes = new Map<string, THREE.Group>();
  private workerMeshes = new Map<string, THREE.Group>();
  private zombieMeshes = new Map<string, THREE.Group>();
  private hostileHumanMeshes = new Map<string, THREE.Group>();
  private fxMeshes = new Map<string, THREE.Object3D>();
  private droppedItemMeshes = new Map<string, THREE.Group>();

  // Render-lag position smoothers (state ticks at 100ms; meshes glide between ticks)
  private squadSmoothers = new Map<string, PositionSmoother>();
  private workerSmoothers = new Map<string, PositionSmoother>();
  private zombieSmoothers = new Map<string, PositionSmoother>();
  private hostileHumanSmoothers = new Map<string, PositionSmoother>();
  private workerAnimState = new Map<string, 'harvesting' | 'constructing' | null>();
  // Simulation clock speed (1/2/4) — worker animation cadence scales with it so
  // limbs keep up with the speed-scaled ground movement instead of slow-motion.
  private clockSpeed = 1;

  // Selected squad
  private selectedSquadId: string | null = null;
  private moveWaypointMesh: THREE.Mesh | null = null;
  private waypointLine: THREE.Line | null = null;
  private waypointLineMaterial: THREE.LineDashedMaterial | null = null;
  private waypointEndMesh: THREE.Group | null = null;
  private rangeRadiusMesh: THREE.Mesh | null = null;
  private currentSquads: TacticalSquadUnit[] = [];

  // When true, per-frame interpolation is frozen at each unit's latest sim position
  // so nothing keeps sliding after the player pauses.
  private paused = false;

  // Character meshes are articulated HumanoidRigs (shared geometries and
  // materials owned by HumanoidRig.ts) — nothing character-shaped lives here.
  private tracerMat: THREE.LineBasicMaterial;
  // Per-frame rig animation clocks (seconds, scaled by sim clock speed) and the
  // last sampled ground position per entity, used to detect actual movement.
  private animClocks = new Map<string, number>();
  private lastSample = new Map<string, { x: number; z: number }>();
  // Combat flags refreshed on every simulation tick so the frame loop can
  // switch each entity between locomotion and weapon-aimed/attacking poses.
  private squadCombatIds = new Set<string>();
  private zombieAttacking = new Set<string>();
  private hostileCombatIds = new Set<string>();

  constructor() {
    this.group.name = 'CombatRendererGroup';
    this.group.add(this.squadGroup);
    this.group.add(this.workerGroup);
    this.group.add(this.zombieGroup);
    this.group.add(this.hostileHumanGroup);
    this.group.add(this.fxGroup);
    this.group.add(this.droppedItemsGroup);
    this.group.add(this.uiOverlayGroup);

    // Character models: articulated HumanoidRigs (see HumanoidRig.ts) — shared
    // geometries/materials live there; this renderer only holds rig instances.

    this.tracerMat = new THREE.LineBasicMaterial({
      color: 0xfef08a,
      linewidth: 2,
    });

    // Move waypoint indicator
    const waypointGeo = new THREE.RingGeometry(0.6, 0.9, 16);
    waypointGeo.rotateX(-Math.PI / 2);
    const waypointMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.moveWaypointMesh = new THREE.Mesh(waypointGeo, waypointMat);
    this.moveWaypointMesh.visible = false;
    this.fxGroup.add(this.moveWaypointMesh);

    // Dashed waypoint trajectory line (matching screenshot)
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x10b981,
      dashSize: 1.2,
      gapSize: 0.8,
      transparent: true,
      opacity: 0.85,
    });
    this.waypointLineMaterial = lineMat;
    this.waypointLine = new THREE.Line(lineGeo, lineMat);
    this.waypointLine.renderOrder = 1000;
    this.waypointLine.visible = false;
    this.fxGroup.add(this.waypointLine);

    // Bright X marker at the exact destination.
    const endGroup = new THREE.Group();
    const xMat = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.95, depthTest: false });
    const xGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.8, 0, -0.8), new THREE.Vector3(0.8, 0, 0.8),
      new THREE.Vector3(-0.8, 0, 0.8), new THREE.Vector3(0.8, 0, -0.8),
    ]);
    const xMesh = new THREE.LineSegments(xGeo, xMat);
    endGroup.add(xMesh);
    endGroup.renderOrder = 1001;
    endGroup.visible = false;
    this.waypointEndMesh = endGroup;
    this.fxGroup.add(endGroup);

    // Tactical Weapon Attack Range Ring (matches squad attackRange radius)
    const rangeGeo = new THREE.RingGeometry(0.96, 1.0, 64);
    rangeGeo.rotateX(-Math.PI / 2);
    const rangeMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.rangeRadiusMesh = new THREE.Mesh(rangeGeo, rangeMat);
    this.rangeRadiusMesh.visible = false;
    this.fxGroup.add(this.rangeRadiusMesh);
  }

  public setSelectedSquad(squadId: string | null) {
    this.selectedSquadId = squadId;
  }

  public updateState(
    zombies: ZombieUnit[],
    squads: TacticalSquadUnit[],
    visualFx: CombatVisualFx[],
    selectedSquadId: string | null,
    droppedItems: DroppedItem[] = [],
    hostileHumans: HostileHumanUnit[] = [],
    workers: ResourceWorkOrder[] = [],
    constructionOrders: ConstructionWorkOrder[] = []
  ) {
    this.selectedSquadId = selectedSquadId;
    this.updateSquads(squads);
    this.updateWorkers(workers, constructionOrders);
    this.updateZombies(zombies);
    this.updateHostileHumans(hostileHumans);
    this.renderVisualEffects(visualFx);
    this.updateDroppedItems(droppedItems);
  }

  public setSimulationPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      // Freeze instantly at latest sim positions — no interpolation tail.
      for (const sm of this.squadSmoothers.values()) sm.freezeAtTarget();
      for (const sm of this.workerSmoothers.values()) sm.freezeAtTarget();
      for (const sm of this.zombieSmoothers.values()) sm.freezeAtTarget();
      for (const sm of this.hostileHumanSmoothers.values()) sm.freezeAtTarget();
    }
  }

  /**
   * Simulation clock speed (1/2/4) — worker animation cadence (walk stride,
   * harvest bob) scales with it so limbs keep pace with the speed-scaled ground
   * movement instead of looking slow-motion at high time speeds.
   */
  public setClockSpeed(speed: number) {
    this.clockSpeed = speed > 0 ? speed : 1;
  }

  /** Advance one entity's animation clock (seconds) by this frame's delta. */
  private advanceClock(key: string, delta: number, rate: number): number {
    const next = (this.animClocks.get(key) ?? Math.random() * 3) + delta * this.clockSpeed * rate;
    this.animClocks.set(key, next);
    return next;
  }

  /** True when the entity actually covered ground since the last sampled frame. */
  private trackMotion(key: string, x: number, z: number, epsilon = 0.003): boolean {
    const prev = this.lastSample.get(key);
    this.lastSample.set(key, { x, z });
    return prev ? Math.hypot(x - prev.x, z - prev.z) > epsilon : false;
  }

  /** Pose every rig attached to one container (each with its own phase seed). */
  private poseRigs(rigs: HumanoidRig[] | undefined, mode: RigPoseMode, timeSec: number) {
    if (!rigs) return;
    for (const rig of rigs) {
      applyRigPose(rig, mode, timeSec + rig.anim.workPhase);
    }
  }

  public update(delta: number, nowSec: number) {
    const now = performance.now();

    // When paused, skip interpolation so units hold exactly where the simulation
    // left them (the smoothers were frozen to their targets on pause).
    if (this.paused) {
      this.renderAtTargets();
      return;
    }

    // Interpolate every moving mesh between simulation ticks so movement is fluid
    // instead of teleporting between waypoints.
    for (const [id, container] of this.squadMeshes.entries()) {
      const sm = this.squadSmoothers.get(id);
      if (!sm) continue;
      const p = sm.sample(now);
      const elev = sampleElevation(this.currentElevation, p.x, p.z, this.currentExaggeration);
      container.position.set(p.x, elev, p.z);
      if (p.rot !== null) container.rotation.y = p.rot;

      // Rigged members: rifle-port jog while covering ground (squads move at
      // ~10 m/s tactical run, so a walk cadence would look like moon-walking),
      // weapons raised in combat.
      const moving = this.trackMotion(`squad:${id}`, p.x, p.z);
      const combat = this.squadCombatIds.has(id);
      const mode: RigPoseMode = combat && !moving ? 'aim' : moving ? 'run' : 'idle';
      const t = this.advanceClock(`squad:${id}`, delta, combat && !moving ? 0.5 : moving ? 1 : 0.4);
      this.poseRigs(container.userData?.rigs, mode, t);
    }

    for (const [id, mesh] of this.workerMeshes.entries()) {
      const sm = this.workerSmoothers.get(id);
      if (!sm) continue;
      const p = sm.sample(now);
      const elev = sampleElevation(this.currentElevation, p.x, p.z, this.currentExaggeration);
      mesh.position.set(p.x, elev, p.z);
      const anim = this.workerAnimState.get(id);
      // Rigs animate whenever a work action is underway or the worker is on the
      // move; idle crews breathe in place (cadence scales with clock speed so
      // limbs keep up with speed-scaled ground movement — no slow-motion at 2x).
      const moving = this.trackMotion(`worker:${id}`, p.x, p.z);
      const mode: RigPoseMode = anim === 'harvesting'
        ? 'workHarvest'
        : anim === 'constructing'
        ? 'workBuild'
        : moving
        ? 'walk'
        : 'idle';
      const t = this.advanceClock(`worker:${id}`, delta, anim ? 1 : moving ? 1 : 0.4);
      this.poseRigs(mesh.userData?.rigs, mode, t);
    }

    for (const [id, mesh] of this.zombieMeshes.entries()) {
      const sm = this.zombieSmoothers.get(id);
      if (!sm) continue;
      const p = sm.sample(now);
      const elev = sampleElevation(this.currentElevation, p.x, p.z, this.currentExaggeration);
      mesh.position.set(p.x, elev, p.z);
      if (p.rot !== null) mesh.rotation.y = p.rot;

      const rig: HumanoidRig | undefined = mesh.userData?.rig;
      if (rig) {
        const attacking = this.zombieAttacking.has(id);
        const moving = this.trackMotion(`zombie:${id}`, p.x, p.z);
        let mode: RigPoseMode;
        if (rig.kind === 'brute') {
          mode = attacking ? 'zombieAttack' : 'zombieBrute';
        } else if (rig.kind === 'runner') {
          mode = attacking ? 'zombieAttack' : moving ? 'zombieRun' : 'zombieIdle';
        } else {
          mode = attacking ? 'zombieAttack' : moving ? 'zombieShamble' : 'zombieIdle';
        }
        const t = this.advanceClock(`zombie:${id}`, delta, attacking ? 1.3 : moving ? 1 : 0.5);
        applyRigPose(rig, mode, t + rig.anim.workPhase);
      }
    }

    for (const [id, mesh] of this.hostileHumanMeshes.entries()) {
      const sm = this.hostileHumanSmoothers.get(id);
      if (!sm) continue;
      const p = sm.sample(now);
      const elev = sampleElevation(this.currentElevation, p.x, p.z, this.currentExaggeration);
      mesh.position.set(p.x, elev, p.z);
      if (p.rot !== null) mesh.rotation.y = p.rot;

      const rig: HumanoidRig | undefined = mesh.userData?.rig;
      if (rig) {
        const moving = this.trackMotion(`hostile:${id}`, p.x, p.z);
        const combat = this.hostileCombatIds.has(id);
        const mode: RigPoseMode = combat && !moving ? 'aim' : moving ? 'walk' : 'idle';
        const t = this.advanceClock(`hostile:${id}`, delta, combat && !moving ? 0.5 : moving ? 1 : 0.4);
        applyRigPose(rig, mode, t + rig.anim.workPhase);
      }
    }
  }

  /** Park every moving mesh exactly at its latest simulation position (paused). */
  private renderAtTargets() {
    for (const [id, container] of this.squadMeshes.entries()) {
      const sm = this.squadSmoothers.get(id);
      if (!sm) continue;
      const pos = sm.targetPosition();
      const elev = sampleElevation(this.currentElevation, pos.x, pos.z, this.currentExaggeration);
      container.position.set(pos.x, elev, pos.z);
      const r = sm.targetRotation();
      if (r !== null) container.rotation.y = r;
    }
    for (const [id, mesh] of this.workerMeshes.entries()) {
      const sm = this.workerSmoothers.get(id);
      if (!sm) continue;
      const pos = sm.targetPosition();
      const elev = sampleElevation(this.currentElevation, pos.x, pos.z, this.currentExaggeration);
      mesh.position.set(pos.x, elev, pos.z);
    }
    for (const [id, mesh] of this.zombieMeshes.entries()) {
      const sm = this.zombieSmoothers.get(id);
      if (!sm) continue;
      const pos = sm.targetPosition();
      const elev = sampleElevation(this.currentElevation, pos.x, pos.z, this.currentExaggeration);
      mesh.position.set(pos.x, elev, pos.z);
      const r = sm.targetRotation();
      if (r !== null) mesh.rotation.y = r;
    }
    for (const [id, mesh] of this.hostileHumanMeshes.entries()) {
      const sm = this.hostileHumanSmoothers.get(id);
      if (!sm) continue;
      const pos = sm.targetPosition();
      const elev = sampleElevation(this.currentElevation, pos.x, pos.z, this.currentExaggeration);
      mesh.position.set(pos.x, elev, pos.z);
      const r = sm.targetRotation();
      if (r !== null) mesh.rotation.y = r;
    }
  }

  public setElevation(elevation: ElevationGrid | null | undefined, exaggeration = 1.0) {
    this.currentElevation = elevation || null;
    this.currentExaggeration = exaggeration;
  }

  // ==========================================
  // Squad 3D Units Rendering
  // ==========================================

  public getDeployedSquads(): TacticalSquadUnit[] {
    return this.currentSquads.filter((s) => s.isDeployed && s.currentHp > 0);
  }

  public getCurrentSquads(): TacticalSquadUnit[] {
    return this.currentSquads;
  }

  public updateSquads(squads: TacticalSquadUnit[]) {
    this.currentSquads = squads;
    this.squadCombatIds.clear();
    const activeIds = new Set<string>();

    for (const squad of squads) {
      if (!squad.isDeployed || squad.currentHp <= 0) continue;
      
      const isMounted = Boolean(squad.mountedVehicleId);
      if (isMounted) {
        // If mounted in a vehicle, hide the on-foot soldier mesh
        const existingMesh = this.squadMeshes.get(squad.squadId);
        if (existingMesh) {
          existingMesh.visible = false;
        }
        if (squad.squadId === this.selectedSquadId && this.rangeRadiusMesh) {
          this.rangeRadiusMesh.visible = false;
        }
        continue;
      }

      activeIds.add(squad.squadId);
      if (squad.state === 'combat' || Boolean(squad.targetZombieId)) {
        this.squadCombatIds.add(squad.squadId);
      }

      let squadContainer = this.squadMeshes.get(squad.squadId);
      let smoother = this.squadSmoothers.get(squad.squadId);
      if (!squadContainer) {
        squadContainer = this.createSquad3DMesh(squad);
        this.squadMeshes.set(squad.squadId, squadContainer);
        this.squadGroup.add(squadContainer);
      }
      if (!smoother) {
        // First appearance: place directly, then glide on subsequent ticks.
        smoother = new PositionSmoother();
        this.squadSmoothers.set(squad.squadId, smoother);
        smoother.snap(squad.x, squad.z, squad.rotation);
        const elev = sampleElevation(this.currentElevation, squad.x, squad.z, this.currentExaggeration);
        squadContainer.position.set(squad.x, elev, squad.z);
        squadContainer.rotation.y = squad.rotation;
      } else {
        smoother.setTarget(squad.x, squad.z, performance.now(), squad.rotation);
      }
      squadContainer.visible = true;

      // Per-member visibility: hide meshes of fallen units (memberIndex userData)
      for (const child of squadContainer.children) {
        const idx = child.userData?.memberIndex;
        if (typeof idx === 'number') {
          const member = squad.members?.[idx];
          child.visible = member ? member.isAlive : false;
        }
      }

      // Update health bar width
      const hpBar = squadContainer.getObjectByName('hpBar');
      if (hpBar) {
        const hpPercent = Math.max(0, squad.currentHp / squad.maxHp);
        hpBar.scale.x = hpPercent;
      }

      // UI overlays (range ring / waypoint line) track the state position; the
      // 3D mesh itself is interpolated per-frame by update().
      const elev = sampleElevation(this.currentElevation, squad.x, squad.z, this.currentExaggeration);

      // Update Weapon Attack Range circle for selected squad
      if (squad.squadId === this.selectedSquadId && this.rangeRadiusMesh) {
        this.rangeRadiusMesh.position.set(squad.x, elev + 0.08, squad.z);
        const radius = Math.max(8, squad.attackRange || 8);
        // Ring lies flat (geometry rotateX -PI/2): scale X/Z by the radius and
        // leave Y (the ring's normal) at 1 — scaling Y instead distorts the
        // flat annulus into an ellipse that reads as "angled".
        this.rangeRadiusMesh.scale.set(radius, 1, radius);
        const isCombatMode = squad.state === 'combat' || Boolean(squad.targetZombieId);
        const rangeMat = this.rangeRadiusMesh.material as THREE.MeshBasicMaterial;
        rangeMat.color.setHex(isCombatMode ? 0xef4444 : 0x10b981);
        rangeMat.opacity = isCombatMode ? 0.65 : 0.45;
        this.rangeRadiusMesh.visible = true;
      }

      // Waypoint display & dashed trajectory line (matching screenshot)
      if (squad.squadId === this.selectedSquadId && squad.targetPos) {
        const isAttackOrder = squad.state === 'combat' || Boolean(squad.targetZombieId);
        const targetColor = isAttackOrder ? 0xef4444 : 0x10b981;

        const targetElev = sampleElevation(this.currentElevation, squad.targetPos.x, squad.targetPos.z, this.currentExaggeration);
        if (this.moveWaypointMesh) {
          this.moveWaypointMesh.position.set(squad.targetPos.x, targetElev + 0.15, squad.targetPos.z);
          (this.moveWaypointMesh.material as THREE.MeshBasicMaterial).color.setHex(targetColor);
          this.moveWaypointMesh.visible = true;
        }
        if (this.waypointLine) {
          const pathPoints = squad.pathState?.path?.length
            ? [{ x: squad.x, z: squad.z }, ...squad.pathState.path.slice(squad.pathState.index || 0)]
            : [{ x: squad.x, z: squad.z }, squad.targetPos];
          const points = pathPoints.map((point: { x: number; z: number }) => new THREE.Vector3(
            point.x,
            sampleElevation(this.currentElevation, point.x, point.z, this.currentExaggeration) + 0.35,
            point.z
          ));
          const positions = new Float32Array(points.flatMap((point) => [point.x, point.y, point.z]));
          this.waypointLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          const lineMat = this.waypointLine.material as THREE.LineDashedMaterial;
          lineMat.color.setHex(targetColor);
          lineMat.depthTest = false;
          lineMat.dashSize = 1.2;
          lineMat.gapSize = 0.8;
          this.waypointLine.computeLineDistances();
          this.waypointLine.visible = true;
          if (this.waypointEndMesh) {
            this.waypointEndMesh.position.set(squad.targetPos.x, targetElev + 0.4, squad.targetPos.z);
            this.waypointEndMesh.visible = true;
          }
        }
      } else if (squad.squadId === this.selectedSquadId && !squad.targetPos) {
        if (this.moveWaypointMesh) this.moveWaypointMesh.visible = false;
        if (this.waypointLine) this.waypointLine.visible = false;
        if (this.waypointEndMesh) this.waypointEndMesh.visible = false;
      }
    }

    if (!this.selectedSquadId && this.rangeRadiusMesh) {
      this.rangeRadiusMesh.visible = false;
    }
    // Clear shared order graphics whenever the selected unit no longer has an
    // active destination; otherwise the previous squad's path remains ghosted.
    const selected = squads.find((s) => s.squadId === this.selectedSquadId);
    if (!selected?.targetPos) {
      if (this.moveWaypointMesh) this.moveWaypointMesh.visible = false;
      if (this.waypointLine) this.waypointLine.visible = false;
      if (this.waypointEndMesh) this.waypointEndMesh.visible = false;
    }

    // Cleanup despawned squads
    for (const [id, container] of this.squadMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.squadGroup.remove(container);
        this.squadMeshes.delete(id);
        this.squadSmoothers.delete(id);
        this.squadCombatIds.delete(id);
        this.animClocks.delete(`squad:${id}`);
        this.lastSample.delete(`squad:${id}`);
      }
    }
  }

  private createSquad3DMesh(squad: TacticalSquadUnit): THREE.Group {
    const group = new THREE.Group();
    group.userData = { squadId: squad.squadId, type: 'squad' };

    // 1. Articulated fireteam: the leader plus escorts in a wedge formation.
    // Every soldier is an independent HumanoidRig so each one walks, aims and
    // falls alone (dead members are hidden via their memberIndex userData).
    const rigs: HumanoidRig[] = [];
    const leaderRig = createSoldierRig(true);
    leaderRig.root.scale.setScalar(1.06);
    leaderRig.root.userData.memberIndex = 0;
    group.add(leaderRig.root);
    rigs.push(leaderRig);

    // 3. Escort General Members (Wedge / fireteam formation)
    const offsets = [
      { x: -0.9, z: -0.7 },
      { x: 0.9, z: -0.7 },
      { x: 0.0, z: -1.3 },
    ];

    for (let i = 0; i < squad.generalCount; i++) {
      const offset = offsets[i % offsets.length];
      const memberRig = createSoldierRig(false);
      memberRig.root.position.set(offset.x, 0, offset.z);
      memberRig.root.userData.memberIndex = 1 + i;
      group.add(memberRig.root);
      rigs.push(memberRig);
    }
    group.userData.rigs = rigs;

    // 4. Overhead Mini Health Bar
    const bgGeo = new THREE.PlaneGeometry(1.8, 0.22);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide });
    const hpBg = new THREE.Mesh(bgGeo, bgMat);
    hpBg.position.set(0, 2.6, 0);

    const fgGeo = new THREE.PlaneGeometry(1.7, 0.16);
    const fgMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide });
    const hpFg = new THREE.Mesh(fgGeo, fgMat);
    hpFg.name = 'hpBar';
    hpFg.position.set(0, 0, 0.01);
    hpBg.add(hpFg);

    group.add(hpBg);

    // (Squad identity is now rendered by EntityMarkerRenderer as a torn-edge card.)

    return group;
  }

  // ==========================================
  // Worker Civilian Gathering Units
  // ==========================================

  public updateWorkers(
    workers: ResourceWorkOrder[],
    constructionOrders?: ConstructionWorkOrder[]
  ) {
    const activeIds = new Set<string>();

    for (const worker of workers) {
      activeIds.add(worker.id);

      let mesh = this.workerMeshes.get(worker.id);
      let smoother = this.workerSmoothers.get(worker.id);
      if (!mesh) {
        mesh = this.createWorker3DMesh(worker.id, worker.workerCount);
        this.workerMeshes.set(worker.id, mesh);
        this.workerGroup.add(mesh);
      }
      if (!smoother) {
        smoother = new PositionSmoother();
        // Worker positions are published by the 500ms gathering loop. Keep a
        // buffered half-second interpolation window so scheduling jitter cannot
        // turn each update into a visible pause.
        smoother.setTickWindow(500);
        this.workerSmoothers.set(worker.id, smoother);
        smoother.snap(worker.position.x, worker.position.z);
        const elev = sampleElevation(this.currentElevation, worker.position.x, worker.position.z, this.currentExaggeration);
        mesh.position.set(worker.position.x, elev, worker.position.z);
      } else {
        smoother.setTarget(worker.position.x, worker.position.z, performance.now());
      }
      this.workerAnimState.set(worker.id, worker.state === 'harvesting' ? 'harvesting' : null);
    }

    if (constructionOrders) {
      for (const order of constructionOrders) {
        activeIds.add(order.id);

        let mesh = this.workerMeshes.get(order.id);
        let smoother = this.workerSmoothers.get(order.id);
        if (!mesh) {
          mesh = this.createWorker3DMesh(order.id, order.workerCount);
          this.workerMeshes.set(order.id, mesh);
          this.workerGroup.add(mesh);
        }
        if (!smoother) {
          smoother = new PositionSmoother();
          smoother.setTickWindow(500);
          this.workerSmoothers.set(order.id, smoother);
          smoother.snap(order.position.x, order.position.z);
          const elev = sampleElevation(this.currentElevation, order.position.x, order.position.z, this.currentExaggeration);
          mesh.position.set(order.position.x, elev, order.position.z);
        } else {
          smoother.setTarget(order.position.x, order.position.z, performance.now());
        }
        this.workerAnimState.set(order.id, order.state === 'constructing' ? 'constructing' : null);
      }
    }

    // Cleanup despawned or completed worker orders
    for (const [id, container] of this.workerMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.workerGroup.remove(container);
        this.workerMeshes.delete(id);
        this.workerSmoothers.delete(id);
        this.workerAnimState.delete(id);
        this.animClocks.delete(`worker:${id}`);
        this.lastSample.delete(`worker:${id}`);
      }
    }
  }

  private createWorker3DMesh(workerId: string, workerCount = 1): THREE.Group {
    const group = new THREE.Group();
    group.userData = { workerId, type: 'worker' };

    // Primary worker: an articulated labourer with hi-vis vest, hardhat and
    // tool rucksack; larger crews add extra rigs offset around the primary.
    const rigs: HumanoidRig[] = [createWorkerRig()];
    group.add(rigs[0].root);

    if (workerCount > 1) {
      const extraOffsets = [
        { x: -0.65, z: -0.5 },
        { x: 0.65, z: -0.5 },
        { x: 0.0, z: -0.9 },
      ];
      const extraCount = Math.min(workerCount - 1, 3);
      for (let i = 0; i < extraCount; i++) {
        const off = extraOffsets[i % extraOffsets.length];
        const extraRig = createWorkerRig();
        extraRig.root.position.set(off.x, 0, off.z);
        group.add(extraRig.root);
        rigs.push(extraRig);
      }
    }
    group.userData.rigs = rigs;

    return group;
  }

  // ==========================================
  // Dropped Equipment Ground Markers (§4.3)
  // ==========================================

  public updateDroppedItems(items: DroppedItem[]) {
    const activeIds = new Set<string>();

    for (const item of items) {
      activeIds.add(item.id);
      let marker = this.droppedItemMeshes.get(item.id);
      if (!marker) {
        marker = this.createDroppedItemMarker(item);
        this.droppedItemMeshes.set(item.id, marker);
        this.droppedItemsGroup.add(marker);
      }
      const elev = sampleElevation(this.currentElevation, item.x, item.z, this.currentExaggeration);
      marker.position.set(item.x, elev + 0.18, item.z);
    }

    for (const [id, marker] of this.droppedItemMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.droppedItemsGroup.remove(marker);
        this.droppedItemMeshes.delete(id);
      }
    }
  }

  private createDroppedItemMarker(item: DroppedItem): THREE.Group {
    const group = new THREE.Group();
    group.userData = { type: 'dropped_item', itemId: item.id };

    // Amber pickup ring so the drop is findable on the ground
    const ringGeo = new THREE.RingGeometry(0.55, 0.72, 20);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.05;
    group.add(ring);

    // Weapon crate (dark steel) or armor roll (olive)
    const isWeapon = Boolean(item.weaponId);
    const boxGeo = isWeapon
      ? new THREE.BoxGeometry(0.42, 0.16, 0.3)
      : new THREE.BoxGeometry(0.5, 0.12, 0.4);
    const boxMat = new THREE.MeshStandardMaterial({
      color: isWeapon ? 0x334155 : 0x57534e,
      roughness: 0.6,
      metalness: 0.4,
      emissive: isWeapon ? 0x1e293b : 0x292524,
      emissiveIntensity: 0.4,
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.y = 0.16;
    box.rotation.y = item.x * 0.7;
    group.add(box);

    return group;
  }

  // ==========================================
  // Zombie 3D Units Rendering (§5.1)
  // ==========================================

  public updateZombies(zombies: ZombieUnit[]) {
    this.zombieAttacking.clear();
    const activeIds = new Set<string>();

    for (const zombie of zombies) {
      if (zombie.state === 'dead' || zombie.currentHp <= 0) continue;
      activeIds.add(zombie.id);
      if (zombie.state === 'attacking_unit' || zombie.state === 'attacking_building') {
        this.zombieAttacking.add(zombie.id);
      }

      let mesh = this.zombieMeshes.get(zombie.id);
      let smoother = this.zombieSmoothers.get(zombie.id);
      if (!mesh) {
        mesh = this.createZombie3DMesh(zombie);
        this.zombieMeshes.set(zombie.id, mesh);
        this.zombieGroup.add(mesh);
      }
      if (!smoother) {
        smoother = new PositionSmoother();
        this.zombieSmoothers.set(zombie.id, smoother);
        smoother.snap(zombie.x, zombie.z, zombie.rotation);
        const elev = sampleElevation(this.currentElevation, zombie.x, zombie.z, this.currentExaggeration);
        mesh.position.set(zombie.x, elev, zombie.z);
        mesh.rotation.y = zombie.rotation;
      } else {
        smoother.setTarget(zombie.x, zombie.z, performance.now(), zombie.rotation);
      }

      // IFZ deliberately shows no per-zombie health or alert overhead — group
      // health is surfaced on the clustered skull pin's radial meter instead.
    }

    // Cleanup dead zombies
    for (const [id, mesh] of this.zombieMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.zombieGroup.remove(mesh);
        this.zombieMeshes.delete(id);
        this.zombieSmoothers.delete(id);
        this.zombieAttacking.delete(id);
        this.animClocks.delete(`zombie:${id}`);
        this.lastSample.delete(`zombie:${id}`);
      }
    }
  }

  private createZombie3DMesh(zombie: ZombieUnit): THREE.Group {
    const group = new THREE.Group();
    group.userData = { zombieId: zombie.id, variant: zombie.variant, type: 'zombie' };

    // Articulated infected rig — shambler/runner/brute all share the skeleton
    // and differ by proportions, skin and pose (assigned per frame).
    const rig = createZombieRig(zombie.variant);
    group.add(rig.root);
    group.userData.rig = rig;

    const isBrute = zombie.variant === 'brute';
    // IFZ shows no overhead health/alert markers on individual zombies — only
    // the group pin's radial health meter. (Individual HP still drives combat.)

    return group;
  }

  // ==========================================
  // Hostile Human Faction Units (§5.2)
  // ==========================================

  public updateHostileHumans(humans: HostileHumanUnit[]) {
    this.hostileCombatIds.clear();
    const activeIds = new Set<string>();

    for (const human of humans) {
      if (human.state === 'dead' || human.currentHp <= 0) continue;
      activeIds.add(human.id);
      if (human.state === 'combat' || human.targetSquadId) {
        this.hostileCombatIds.add(human.id);
      }

      let mesh = this.hostileHumanMeshes.get(human.id);
      let smoother = this.hostileHumanSmoothers.get(human.id);
      if (!mesh) {
        mesh = this.createHostileHuman3DMesh(human);
        this.hostileHumanMeshes.set(human.id, mesh);
        this.hostileHumanGroup.add(mesh);
      }
      if (!smoother) {
        smoother = new PositionSmoother();
        this.hostileHumanSmoothers.set(human.id, smoother);
        smoother.snap(human.x, human.z, human.rotation);
        const elev = sampleElevation(this.currentElevation, human.x, human.z, this.currentExaggeration);
        mesh.position.set(human.x, elev, human.z);
        mesh.rotation.y = human.rotation;
      } else {
        smoother.setTarget(human.x, human.z, performance.now(), human.rotation);
      }

      const hpBar = mesh.getObjectByName('hpBar');
      if (hpBar) {
        const pct = Math.max(0, human.currentHp / human.maxHp);
        hpBar.scale.x = pct;
      }
    }

    for (const [id, mesh] of this.hostileHumanMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.hostileHumanGroup.remove(mesh);
        this.hostileHumanMeshes.delete(id);
        this.hostileHumanSmoothers.delete(id);
        this.hostileCombatIds.delete(id);
        this.animClocks.delete(`hostile:${id}`);
        this.lastSample.delete(`hostile:${id}`);
      }
    }
  }

  private createHostileHuman3DMesh(human: HostileHumanUnit): THREE.Group {
    const group = new THREE.Group();
    group.userData = { hostileHumanId: human.id, type: 'hostile_human' };

    // Armed raider rig — rifle rides in the right hand so it raises to aim.
    const rig = createHostileRig();
    group.add(rig.root);
    group.userData.rig = rig;

    // Mini health bar
    const barWidth = 1.3;
    const bgGeo = new THREE.PlaneGeometry(barWidth, 0.14);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x111827, side: THREE.DoubleSide });
    const hpBg = new THREE.Mesh(bgGeo, bgMat);
    hpBg.position.set(0, 2.3, 0);
    const fgGeo = new THREE.PlaneGeometry(barWidth - 0.08, 0.1);
    const fgMat = new THREE.MeshBasicMaterial({ color: 0xfb923c, side: THREE.DoubleSide });
    const hpFg = new THREE.Mesh(fgGeo, fgMat);
    hpFg.name = 'hpBar';
    hpFg.position.set(0, 0, 0.01);
    hpBg.add(hpFg);
    group.add(hpBg);

    return group;
  }

  // ==========================================
  // Visual FX & Sound Acoustic Rings (§5, §6.1)
  // ==========================================

  public renderVisualEffects(fxList: CombatVisualFx[]) {
    const now = Date.now();

    for (const fx of fxList) {
      if (this.fxMeshes.has(fx.id)) continue;

      if (fx.type === 'noise_ring') {
        const ring = this.createNoiseRingMesh(fx);
        this.fxMeshes.set(fx.id, ring);
        this.fxGroup.add(ring);
      } else if (fx.type === 'bullet_tracer') {
        const tracer = this.createTracerMesh(fx);
        this.fxMeshes.set(fx.id, tracer);
        this.fxGroup.add(tracer);
      } else if (fx.type === 'muzzle_flash') {
        const flash = this.createMuzzleFlashMesh(fx);
        this.fxMeshes.set(fx.id, flash);
        this.fxGroup.add(flash);
      } else if (fx.type === 'melee_slash') {
        const slash = this.createSlashMesh(fx);
        this.fxMeshes.set(fx.id, slash);
        this.fxGroup.add(slash);
      }
    }

    // Animate and fade out expired FX
    for (const [id, mesh] of this.fxMeshes.entries()) {
      const fxData = fxList.find((f) => f.id === id);
      if (!fxData || now - fxData.createdAt > fxData.durationMs) {
        this.fxGroup.remove(mesh);
        this.fxMeshes.delete(id);
        continue;
      }

      const elapsed = now - fxData.createdAt;
      const progress = elapsed / fxData.durationMs;

      // Animate noise ring expansion
      if (fxData.type === 'noise_ring') {
        const currentRadius = (fxData.radius || 40) * Math.min(1.0, progress * 1.5);
        mesh.scale.set(currentRadius, currentRadius, 1);
        const mat = (mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.8 * (1.0 - progress));
      } else if (fxData.type === 'bullet_tracer' || fxData.type === 'muzzle_flash') {
        if (progress > 0.8) {
          this.fxGroup.remove(mesh);
          this.fxMeshes.delete(id);
        }
      }
    }
  }

  private createNoiseRingMesh(fx: CombatVisualFx): THREE.Mesh {
    const geo = new THREE.RingGeometry(0.95, 1.0, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: fx.color || 0xef4444,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const elev = sampleElevation(this.currentElevation, fx.startX, fx.startZ, this.currentExaggeration);
    mesh.position.set(fx.startX, elev + 0.2, fx.startZ);
    mesh.scale.set(1, 1, 1);
    return mesh;
  }

  private createTracerMesh(fx: CombatVisualFx): THREE.Line {
    const startElev = sampleElevation(this.currentElevation, fx.startX, fx.startZ, this.currentExaggeration);
    const endX = fx.endX || fx.startX;
    const endZ = fx.endZ || fx.startZ;
    const endElev = sampleElevation(this.currentElevation, endX, endZ, this.currentExaggeration);
    const points = [
      new THREE.Vector3(fx.startX, fx.startY + startElev, fx.startZ),
      new THREE.Vector3(endX, (fx.endY || 1.0) + endElev, endZ),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, this.tracerMat);
    return line;
  }

  private createMuzzleFlashMesh(fx: CombatVisualFx): THREE.PointLight {
    const light = new THREE.PointLight(0xfde047, 3.0, 8);
    const elev = sampleElevation(this.currentElevation, fx.startX, fx.startZ, this.currentExaggeration);
    light.position.set(fx.startX, fx.startY + elev, fx.startZ);
    return light;
  }

  private createSlashMesh(fx: CombatVisualFx): THREE.Mesh {
    const geo = new THREE.RingGeometry(0.6, 1.1, 16, 1, 0, Math.PI * 0.8);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf87171,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const elev = sampleElevation(this.currentElevation, fx.startX, fx.startZ, this.currentExaggeration);
    mesh.position.set(fx.startX, fx.startY + elev, fx.startZ);
    return mesh;
  }

  /**
   * Hides squad/zombie meshes whose world position is outside the currently-visible
   * area (§3.5, §5.0). Mobile entities do not persist a "last known" silhouette.
   */
  public applyFogVisibility(isVisible: (x: number, z: number) => boolean) {
    for (const mesh of this.squadMeshes.values()) {
      mesh.visible = isVisible(mesh.position.x, mesh.position.z);
    }
    for (const mesh of this.workerMeshes.values()) {
      mesh.visible = isVisible(mesh.position.x, mesh.position.z);
    }
    for (const mesh of this.zombieMeshes.values()) {
      mesh.visible = isVisible(mesh.position.x, mesh.position.z);
    }
    for (const mesh of this.hostileHumanMeshes.values()) {
      mesh.visible = isVisible(mesh.position.x, mesh.position.z);
    }
    for (const mesh of this.droppedItemMeshes.values()) {
      mesh.visible = isVisible(mesh.position.x, mesh.position.z);
    }
  }

  public raycastSquad(raycaster: THREE.Raycaster): string | null {
    const intersects = raycaster.intersectObjects(this.squadGroup.children, true);
    if (intersects.length > 0) {
      let cur: THREE.Object3D | null = intersects[0].object;
      while (cur && cur !== this.squadGroup) {
        if (cur.userData?.squadId) {
          return cur.userData.squadId;
        }
        cur = cur.parent;
      }
    }
    return null;
  }

  public raycastZombie(raycaster: THREE.Raycaster): string | null {
    // 1. Raycast zombies
    const intersects = raycaster.intersectObjects(this.zombieGroup.children, true);
    if (intersects.length > 0) {
      let cur: THREE.Object3D | null = intersects[0].object;
      while (cur && cur !== this.zombieGroup) {
        if (cur.userData?.zombieId) {
          return cur.userData.zombieId;
        }
        cur = cur.parent;
      }
    }
    // 2. Raycast hostile humans
    const humanIntersects = raycaster.intersectObjects(this.hostileHumanGroup.children, true);
    if (humanIntersects.length > 0) {
      let cur: THREE.Object3D | null = humanIntersects[0].object;
      while (cur && cur !== this.hostileHumanGroup) {
        if (cur.userData?.hostileHumanId) {
          return cur.userData.hostileHumanId;
        }
        cur = cur.parent;
      }
    }
    return null;
  }

  public dispose() {
    // Character geometries/materials are shared singletons owned by
    // HumanoidRig.ts and live for the whole app session — nothing to free here.
    this.tracerMat.dispose();
    this.waypointLineMaterial?.dispose();
    if (this.waypointEndMesh) {
      this.waypointEndMesh.traverse((object) => {
        if (object instanceof THREE.BufferGeometry) object.dispose();
        if (object instanceof THREE.Material) object.dispose();
      });
    }
  }
}
