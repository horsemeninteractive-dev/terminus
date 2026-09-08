import * as THREE from 'three';
import { sampleElevation } from '../services/elevationService';
import { ElevationGrid } from '../types/map';
import { WorldVehicle } from '../types/vehicle';
import { PositionSmoother } from './movementSmoothing';

export class VehicleRenderer {
  public group = new THREE.Group();

  /**
   * Terrain surface sampler injected by WorldScene: height of the terrain AS
   * RENDERED (piecewise-linear mesh) or null outside the mesh. Vehicles must
   * drive ON the visible terrain — the smooth analytic elevation can sit
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
  private vehicleMeshes = new Map<string, THREE.Group>();
  private vehicleSmoothers = new Map<string, PositionSmoother>();
  private selectedVehicleId: string | null = null;
  private pathLine: THREE.Line | null = null;
  private pathEnd: THREE.Group | null = null;
  private hoveredVehicleId: string | null = null;

  // When true, per-frame interpolation is frozen at each vehicle's latest sim
  // position so nothing keeps sliding after the player pauses.
  private paused = false;

  // Night headlights: two SpotLights per operational vehicle (one per headlamp)
  // throwing a wide warm beam onto the road ahead. Wrecked (salvageable)
  // vehicles stay dark. Intensity follows the day/night cycle.
  private headlights = new Map<string, THREE.SpotLight[]>();
  private headlightsOn = false;

  // Night taillights: red lamp meshes + faint backward red SpotLights per
  // operational vehicle — convoy columns read from behind. Lamps glow dim red
  // (running lights) and flare brighter while the vehicle is moving or has an
  // active destination (throttle/brake). Wrecks stay dark.
  private tailLampMats = new Map<string, THREE.MeshStandardMaterial[]>();
  private tailLights = new Map<string, THREE.SpotLight[]>();
  private tailNightFactor = 0;
  private static readonly TAIL_RUNNING = 1.2;
  private static readonly TAIL_ACTIVE = 4.0;

  // Terrain elevation (kept from the last updateVehicles call so the per-frame
  // interpolation can sample the ground under the smoothed position).
  private currentElevation: ElevationGrid | null = null;
  private currentExaggeration = 1.0;

  // Shared reusable materials
  private carBodyMat: THREE.MeshStandardMaterial;
  private truckBodyMat: THREE.MeshStandardMaterial;
  private vanBodyMat: THREE.MeshStandardMaterial;
  private salvageableMat: THREE.MeshStandardMaterial;
  private glassMat: THREE.MeshStandardMaterial;
  private wheelMat: THREE.MeshStandardMaterial;
  private rimMat: THREE.MeshStandardMaterial;
  private turretMat: THREE.MeshStandardMaterial;
  private lightMat: THREE.MeshBasicMaterial;
  private selectionRingMat: THREE.MeshBasicMaterial;



  constructor() {
    this.group.name = 'VehiclesGroup';

    const line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: 0x10b981, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.85, depthTest: false })
    );
    line.renderOrder = 1000;
    line.visible = false;
    this.pathLine = line;
    this.group.add(line);

    const end = new THREE.Group();
    const xMaterial = new THREE.LineBasicMaterial({ color: 0xef4444, depthTest: false });
    const xGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.8, 0.05, -0.8), new THREE.Vector3(0.8, 0.05, 0.8),
      new THREE.Vector3(-0.8, 0.05, 0.8), new THREE.Vector3(0.8, 0.05, -0.8),
    ]);
    end.add(new THREE.LineSegments(xGeometry, xMaterial));
    end.renderOrder = 1001;
    end.visible = false;
    this.pathEnd = end;
    this.group.add(end);

    // Materials
    this.carBodyMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb, // Cobalt Blue civilian sedan
      metalness: 0.5,
      roughness: 0.4,
    });

    this.truckBodyMat = new THREE.MeshStandardMaterial({
      color: 0x3f3f46, // Dark tactical gunmetal armed truck
      metalness: 0.7,
      roughness: 0.35,
    });

    this.vanBodyMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Amber/Ochre utility cargo van
      metalness: 0.3,
      roughness: 0.5,
    });

    this.salvageableMat = new THREE.MeshStandardMaterial({
      color: 0x713f12, // Rust oxidized finish
      metalness: 0.1,
      roughness: 0.9,
    });

    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
    });

    this.wheelMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.9,
    });

    this.rimMat = new THREE.MeshStandardMaterial({
      color: 0xa1a1aa,
      metalness: 0.8,
      roughness: 0.2,
    });

    this.turretMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.85,
      roughness: 0.25,
    });

    this.lightMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
    });

    this.selectionRingMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
  }

  public setSelectedVehicle(id: string | null) {
    this.selectedVehicleId = id;
  }

  public setHoveredVehicle(id: string | null) {
    this.hoveredVehicleId = id;
  }

  /** Immediately update the cached elevation so the per-frame update() uses the right ground height. */
  public setElevation(elevation: ElevationGrid | null, exaggeration: number) {
    this.currentElevation = elevation;
    this.currentExaggeration = exaggeration;
  }

  public updateVehicles(
    vehicles: WorldVehicle[],
    elevation?: ElevationGrid | null,
    exaggeration: number = 1.0
  ) {
    const activeIds = new Set<string>();
    this.currentElevation = elevation || null;
    this.currentExaggeration = exaggeration;

    for (const veh of vehicles) {
      activeIds.add(veh.id);
      let vehGroup = this.vehicleMeshes.get(veh.id);

      if (!vehGroup) {
        vehGroup = this.buildVehicleModel(veh);
        vehGroup.name = `Vehicle_${veh.id}`;
        if (!VehicleRenderer.isWrecked(veh)) {
          this.attachHeadlights(veh.id, vehGroup);
          this.attachTailLights(veh.id, vehGroup);
        }
        this.group.add(vehGroup);
        this.vehicleMeshes.set(veh.id, vehGroup);
      }

      let smoother = this.vehicleSmoothers.get(veh.id);
      if (!smoother) {
        // First appearance: place directly, then glide between simulation ticks.
        smoother = new PositionSmoother();
        this.vehicleSmoothers.set(veh.id, smoother);
        smoother.snap(veh.position.x, veh.position.z, veh.rotation);
        const groundY = this.terrainY(elevation, veh.position.x, veh.position.z, exaggeration);
        vehGroup.position.set(veh.position.x, groundY + 0.1, veh.position.z);
        vehGroup.rotation.y = veh.rotation;
      } else {
        smoother.setTarget(veh.position.x, veh.position.z, performance.now(), veh.rotation);
      }

      // Update Turret Rotation if Armed Truck
      if (veh.type === 'armed_truck' && veh.turret) {
        const turretMount = vehGroup.getObjectByName('TurretMount');
        if (turretMount) {
          // Turret rotation relative to vehicle body
          turretMount.rotation.y = veh.turret.rotation - veh.rotation;
        }
      }

      if (this.selectedVehicleId === veh.id && veh.targetPos && this.pathLine && this.pathEnd) {
        // Squad-style route preview: one dashed green line sampled over the
        // terrain from the vehicle through every remaining waypoint to the
        // destination, so it hugs hills exactly like the squad waypoint line.
        const remaining = veh.roadPathWaypoints.slice(veh.currentWaypointIndex);
        const elevAt = (p: { x: number; z: number }) => this.terrainY(elevation, p.x, p.z, exaggeration) + 0.35;
        const pts: { x: number; z: number }[] = [{ ...veh.position }, ...remaining];
        if (!remaining.length ||
            Math.hypot(remaining[remaining.length - 1].x - veh.targetPos.x, remaining[remaining.length - 1].z - veh.targetPos.z) > 1) {
          pts.push({ ...veh.targetPos });
        }
        const positions = new Float32Array(pts.flatMap((p) => [p.x, elevAt(p), p.z]));
        this.pathLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const lineMat = this.pathLine.material as THREE.LineDashedMaterial;
        lineMat.depthTest = false;
        lineMat.dashSize = 1.2;
        lineMat.gapSize = 0.8;
        this.pathLine.computeLineDistances();
        this.pathLine.visible = true;

        this.pathEnd.position.set(veh.targetPos.x, this.terrainY(elevation, veh.targetPos.x, veh.targetPos.z, exaggeration) + 0.4, veh.targetPos.z);
        this.pathEnd.visible = true;
      }

      // Update Selection Indicator
      const selRing = vehGroup.getObjectByName('SelectionRing');
      if (selRing) {
        selRing.visible = this.selectedVehicleId === veh.id || this.hoveredVehicleId === veh.id;
      }

      // Taillight state: dim running lights when parked, flare up while the
      // vehicle is under way or braking toward a destination. Scaled by the
      // night factor here (assignment time) so lamps are fully dark through
      // daylight and fade in with dusk — never glowing in full sun.
      const active = veh.isMoving || veh.targetPos !== null;
      const glow = (active ? VehicleRenderer.TAIL_ACTIVE : VehicleRenderer.TAIL_RUNNING) * this.tailNightFactor;
      const tailMats = this.tailLampMats.get(veh.id);
      if (tailMats) {
        for (const m of tailMats) m.emissiveIntensity = glow;
      }
    }

    if (!vehicles.some((v) => v.id === this.selectedVehicleId && v.targetPos)) {
      if (this.pathLine) this.pathLine.visible = false;
      if (this.pathEnd) this.pathEnd.visible = false;
    }

    // Clean up removed vehicles
    for (const [id, mesh] of this.vehicleMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.group.remove(mesh);
        this.vehicleMeshes.delete(id);
        this.vehicleSmoothers.delete(id);
        this.headlights.delete(id);
        this.tailLampMats.delete(id);
        this.tailLights.delete(id);
      }
    }
  }

  /**
   * Night headlight beams: each operational vehicle gets a SpotLight per
   * headlamp aimed ~25m down the road (vehicles face +Z, so the beams track
   * steering automatically). Wrecks are never given lights (see attach guard).
   */
  private attachHeadlights(vehicleId: string, container: THREE.Group) {
    const lights: THREE.SpotLight[] = [];
    for (const x of [0.7, -0.7]) {
      const light = new THREE.SpotLight(0xfff3d0, 0, 45, Math.PI / 5.5, 0.5, 1.2);
      light.position.set(x, 0.95, 2.8);
      light.target.position.set(x * 2, 0, 26);
      light.visible = this.headlightsOn;
      container.add(light);
      container.add(light.target);
      lights.push(light);
    }
    this.headlights.set(vehicleId, lights);
  }

  /** Drives beam brightness from the day/night cycle (0 = day, 1 = deep night). */
  public setHeadlightIntensity(nightFactor: number) {
    const enabled = nightFactor > 0.02;
    if (this.headlightsOn !== enabled) {
      this.headlightsOn = enabled;
      for (const lights of this.headlights.values()) {
        for (const l of lights) l.visible = enabled;
      }
      for (const lights of this.tailLights.values()) {
        for (const l of lights) l.visible = enabled;
      }
    }
    if (enabled) {
      const intensity = 60 + 240 * nightFactor;
      for (const lights of this.headlights.values()) {
        for (const l of lights) l.intensity = intensity;
      }
      const tailIntensity = 6 + 18 * nightFactor;
      for (const lights of this.tailLights.values()) {
        for (const l of lights) l.intensity = tailIntensity;
      }
    }
    // Emissive lamp meshes are scaled at their per-frame assignment site
    // (updateVehicles) — scaling here too would double-apply or be overwritten
    // by the same-frame assignment right after this call.
    this.tailNightFactor = nightFactor;
  }

  /**
   * Red taillights: two glowing lamp meshes at the rear plus faint backward
   * red SpotLights so a following vehicle's cab picks up red light. Lamps use
   * per-vehicle emissive materials (running vs. brake glow set in
   * updateVehicles); emissive intensity scales with night so they read only
   * after dusk instead of glowing in daylight.
   */
  private attachTailLights(vehicleId: string, container: THREE.Group) {
    const mats: THREE.MeshStandardMaterial[] = [];
    for (const x of [0.65, -0.65]) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x3d0608,
        roughness: 0.4,
        emissive: 0xff1a1a,
        emissiveIntensity: 0,
      });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.08), mat);
      lamp.position.set(x, 0.9, -2.85);
      container.add(lamp);
      mats.push(mat);
    }
    this.tailLampMats.set(vehicleId, mats);

    const lights: THREE.SpotLight[] = [];
    for (const x of [0.65, -0.65]) {
      const light = new THREE.SpotLight(0xff2020, 0, 14, Math.PI / 4, 0.7, 1.4);
      light.position.set(x, 0.9, -2.9);
      light.target.position.set(x, 0, -10);
      light.visible = this.headlightsOn;
      container.add(light);
      container.add(light.target);
      lights.push(light);
    }
    this.tailLights.set(vehicleId, lights);
  }

  /** Lamp emissive = per-vehicle state glow scaled by the night factor. */
  /** Only operational vehicles light up — wrecks and rusted hulls stay dark. */
  private static isWrecked(veh: WorldVehicle): boolean {
    return veh.condition !== 'operational';
  }

  /**
   * Per-frame interpolation: glides each vehicle between the last two simulation
   * positions so movement reads as fluid instead of teleporting between ticks.
   */
  public setSimulationPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      for (const sm of this.vehicleSmoothers.values()) sm.freezeAtTarget();
    }
  }

  public update(delta: number, nowSec: number) {
    const now = performance.now();
    for (const [id, mesh] of this.vehicleMeshes.entries()) {
      const sm = this.vehicleSmoothers.get(id);
      if (!sm) continue;
      let px: number, pz: number, prot: number | null;
      if (this.paused) {
        const t = sm.targetPosition();
        px = t.x; pz = t.z; prot = sm.targetRotation();
      } else {
        const p = sm.sample(now);
        px = p.x; pz = p.z; prot = p.rot;
      }
      const groundY = this.terrainY(this.currentElevation, px, pz, this.currentExaggeration);
      mesh.position.set(px, groundY + 0.1, pz);
      if (prot !== null) mesh.rotation.y = prot;
    }
  }

  /** Hides vehicles outside the currently-visible fog area (§3.5, §5.0). */
  public applyFogVisibility(isVisible: (x: number, z: number) => boolean) {
    for (const mesh of this.vehicleMeshes.values()) {
      mesh.visible = isVisible(mesh.position.x, mesh.position.z);
    }
  }

  public raycastVehicle(raycaster: THREE.Raycaster): string | null {
    const intersects = raycaster.intersectObjects(this.group.children, true);
    if (intersects.length > 0) {
      let curr: THREE.Object3D | null = intersects[0].object;
      while (curr && curr !== this.group) {
        if (curr.userData && curr.userData.vehicleId) {
          return curr.userData.vehicleId;
        }
        curr = curr.parent;
      }
    }
    return null;
  }

  private buildVehicleModel(veh: WorldVehicle): THREE.Group {
    const group = new THREE.Group();
    group.userData = { vehicleId: veh.id, vehicleType: veh.type };

    const isSalvageable = veh.condition === 'salvageable';
    const bodyMat = isSalvageable
      ? this.salvageableMat
      : veh.type === 'armed_truck'
      ? this.truckBodyMat
      : veh.type === 'cargo_van'
      ? this.vanBodyMat
      : this.carBodyMat;

    switch (veh.type) {
      case 'armed_truck':
        this.buildArmedTruckGeometry(group, bodyMat, isSalvageable);
        break;
      case 'cargo_van':
        this.buildCargoVanGeometry(group, bodyMat, isSalvageable);
        break;
      case 'car':
      default:
        this.buildCarGeometry(group, bodyMat, isSalvageable);
        break;
    }

    // Selection ring at base
    const ringGeo = new THREE.RingGeometry(2.4, 2.7, 16);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMesh = new THREE.Mesh(ringGeo, this.selectionRingMat);
    ringMesh.name = 'SelectionRing';
    ringMesh.position.y = 0.05;
    ringMesh.visible = false;
    group.add(ringMesh);

    return group;
  }

  private addWheel(parent: THREE.Group, x: number, y: number, z: number, radius = 0.45, width = 0.3) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, y, z);

    const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 12);
    tireGeo.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, this.wheelMat);
    tire.castShadow = true;
    wheelGroup.add(tire);

    const rimGeo = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width * 1.05, 8);
    rimGeo.rotateZ(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, this.rimMat);
    wheelGroup.add(rim);

    parent.add(wheelGroup);
  }

  // 1. Armed Truck Model (Pickup Technical with Turret)
  private buildArmedTruckGeometry(group: THREE.Group, bodyMat: THREE.Material, isSalvageable: boolean) {
    // Main Cab & Chassis
    const cabGeo = new THREE.BoxGeometry(2.1, 1.2, 2.0);
    const cab = new THREE.Mesh(cabGeo, bodyMat);
    cab.position.set(0, 1.2, 0.4);
    cab.castShadow = true;
    group.add(cab);

    // Front Hood & Engine bay
    const hoodGeo = new THREE.BoxGeometry(2.0, 0.8, 1.6);
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, 0.9, 2.0);
    hood.castShadow = true;
    group.add(hood);

    // Reinforced Bullbar Grille
    const grilleGeo = new THREE.BoxGeometry(2.1, 0.7, 0.2);
    const grille = new THREE.Mesh(grilleGeo, this.rimMat);
    grille.position.set(0, 0.85, 2.85);
    group.add(grille);

    // Windshield
    const windshieldGeo = new THREE.BoxGeometry(1.85, 0.65, 0.1);
    windshieldGeo.rotateX(-0.25);
    const windshield = new THREE.Mesh(windshieldGeo, this.glassMat);
    windshield.position.set(0, 1.45, 1.35);
    group.add(windshield);

    // Flatbed in Rear
    const bedGeo = new THREE.BoxGeometry(2.0, 0.6, 2.2);
    const bed = new THREE.Mesh(bedGeo, bodyMat);
    bed.position.set(0, 0.8, -1.4);
    bed.castShadow = true;
    group.add(bed);

    // Heavy Rollcage in Bed
    const rollcageGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4);
    const rc1 = new THREE.Mesh(rollcageGeo, this.turretMat);
    rc1.position.set(0.9, 1.4, -0.6);
    const rc2 = new THREE.Mesh(rollcageGeo, this.turretMat);
    rc2.position.set(-0.9, 1.4, -0.6);
    group.add(rc1);
    group.add(rc2);

    // Mounted Turret Assembly
    const turretMount = new THREE.Group();
    turretMount.name = 'TurretMount';
    turretMount.position.set(0, 1.4, -1.3);

    const baseStand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 0.8, 8),
      this.turretMat
    );
    baseStand.position.y = 0.4;
    turretMount.add(baseStand);

    const gunBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.9),
      this.turretMat
    );
    gunBody.position.set(0, 0.85, 0);
    turretMount.add(gunBody);

    const gunBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8),
      this.turretMat
    );
    gunBarrel.rotateX(Math.PI / 2);
    gunBarrel.position.set(0, 0.85, 0.9);
    turretMount.add(gunBarrel);

    const ammoBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.25, 0.35),
      this.vanBodyMat
    );
    ammoBox.position.set(0.25, 0.85, 0);
    turretMount.add(ammoBox);

    group.add(turretMount);

    // 4 Heavy Offroad Wheels
    this.addWheel(group, 1.15, 0.45, 1.6, 0.5, 0.35);
    this.addWheel(group, -1.15, 0.45, 1.6, 0.5, 0.35);
    this.addWheel(group, 1.15, 0.45, -1.5, 0.5, 0.35);
    this.addWheel(group, -1.15, 0.45, -1.5, 0.5, 0.35);

    // Headlights
    const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), this.lightMat);
    hl1.position.set(0.7, 0.9, 2.82);
    const hl2 = hl1.clone();
    hl2.position.x = -0.7;
    group.add(hl1);
    group.add(hl2);
  }

  // 2. Cargo Van Model
  private buildCargoVanGeometry(group: THREE.Group, bodyMat: THREE.Material, isSalvageable: boolean) {
    // Big Box Body
    const vanBodyGeo = new THREE.BoxGeometry(2.1, 1.9, 4.4);
    const vanBody = new THREE.Mesh(vanBodyGeo, bodyMat);
    vanBody.position.set(0, 1.45, -0.2);
    vanBody.castShadow = true;
    group.add(vanBody);

    // Front Nose / Sloped Cab
    const noseGeo = new THREE.BoxGeometry(2.05, 1.1, 0.9);
    const nose = new THREE.Mesh(noseGeo, bodyMat);
    nose.position.set(0, 1.0, 2.2);
    nose.castShadow = true;
    group.add(nose);

    // Windshield
    const wsGeo = new THREE.BoxGeometry(1.9, 0.75, 0.1);
    wsGeo.rotateX(-0.35);
    const ws = new THREE.Mesh(wsGeo, this.glassMat);
    ws.position.set(0, 1.8, 1.95);
    group.add(ws);

    // Side Windows
    const sideWinGeo = new THREE.BoxGeometry(0.05, 0.55, 0.9);
    const sw1 = new THREE.Mesh(sideWinGeo, this.glassMat);
    sw1.position.set(1.06, 1.75, 1.3);
    const sw2 = sw1.clone();
    sw2.position.x = -1.06;
    group.add(sw1);
    group.add(sw2);

    // Roof Cargo Rack with Crates
    const rackGeo = new THREE.BoxGeometry(1.8, 0.1, 2.5);
    const rack = new THREE.Mesh(rackGeo, this.rimMat);
    rack.position.set(0, 2.45, -0.6);
    group.add(rack);

    const crateGeo = new THREE.BoxGeometry(0.8, 0.5, 0.8);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.8 });
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(-0.3, 2.75, -0.6);
    group.add(crate);

    // 4 Van Wheels
    this.addWheel(group, 1.1, 0.45, 1.5, 0.45, 0.32);
    this.addWheel(group, -1.1, 0.45, 1.5, 0.45, 0.32);
    this.addWheel(group, 1.1, 0.45, -1.4, 0.45, 0.32);
    this.addWheel(group, -1.1, 0.45, -1.4, 0.45, 0.32);

    // Headlights
    const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), this.lightMat);
    hl1.position.set(0.7, 0.95, 2.66);
    const hl2 = hl1.clone();
    hl2.position.x = -0.7;
    group.add(hl1);
    group.add(hl2);
  }

  // 3. Civilian Car Model
  private buildCarGeometry(group: THREE.Group, bodyMat: THREE.Material, isSalvageable: boolean) {
    // Lower Chassis
    const lowerGeo = new THREE.BoxGeometry(1.9, 0.65, 4.2);
    const lower = new THREE.Mesh(lowerGeo, bodyMat);
    lower.position.set(0, 0.7, 0);
    lower.castShadow = true;
    group.add(lower);

    // Upper Cabin
    const cabinGeo = new THREE.BoxGeometry(1.65, 0.7, 2.2);
    const cabin = new THREE.Mesh(cabinGeo, bodyMat);
    cabin.position.set(0, 1.25, -0.2);
    cabin.castShadow = true;
    group.add(cabin);

    // Windshields (Front & Rear)
    const frontWsGeo = new THREE.BoxGeometry(1.5, 0.6, 0.1);
    frontWsGeo.rotateX(-0.4);
    const frontWs = new THREE.Mesh(frontWsGeo, this.glassMat);
    frontWs.position.set(0, 1.25, 0.95);
    group.add(frontWs);

    const rearWsGeo = new THREE.BoxGeometry(1.5, 0.55, 0.1);
    rearWsGeo.rotateX(0.4);
    const rearWs = new THREE.Mesh(rearWsGeo, this.glassMat);
    rearWs.position.set(0, 1.25, -1.35);
    group.add(rearWs);

    // 4 Wheels
    this.addWheel(group, 1.0, 0.38, 1.3, 0.4, 0.28);
    this.addWheel(group, -1.0, 0.38, 1.3, 0.4, 0.28);
    this.addWheel(group, 1.0, 0.38, -1.3, 0.4, 0.28);
    this.addWheel(group, -1.0, 0.38, -1.3, 0.4, 0.28);

    // Headlights
    const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.1), this.lightMat);
    hl1.position.set(0.65, 0.75, 2.11);
    const hl2 = hl1.clone();
    hl2.position.x = -0.65;
    group.add(hl1);
    group.add(hl2);
  }
}
