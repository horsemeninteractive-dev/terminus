import * as THREE from 'three';
import { CombatVisualFx, DroppedItem, HostileHumanUnit, TacticalSquadUnit, WEAPON_CATALOG, ZombieLair, ZombieUnit } from '../types/combat';
import { BuildingPolygon, MapData, Point2D, ResourceNode, RoadSegment } from '../types/map';
import { ResourceWorkOrder } from '../types/resourceGathering';
import { HiddenSurvivorGroup } from '../types/population';
import { RivalHideout } from '../types/rivalFaction';
import { AdaptedBuilding, ConstructionWorkOrder, DeconstructionJob, FogOfWarState, FunctionalBuildingTypeId } from '../types/settlement';
import { BuildingSearchState } from '../types/scavenging';
import { WorldVehicle } from '../types/vehicle';
import { classifyPoint } from '../services/fogOfWarService';
import { sampleElevation } from '../services/elevationService';
import { getFreestandingDimensions, getFreestandingCollisionPolygon } from '../services/freestandingFootprint';
import { BuildingRenderer } from './BuildingRenderer';
import { CameraController } from './CameraController';
import { CombatRenderer } from './CombatRenderer';
import { EntityMarker, EntityMarkerRenderer } from './EntityMarkerRenderer';
import { FogOfWarRenderer } from './FogOfWarRenderer';
import { GroundRenderer } from './GroundRenderer';
import { ResourceRenderer } from './ResourceRenderer';
import { RoadRenderer } from './RoadRenderer';
import { SmokeParticleSystem } from './SmokeParticleSystem';
import { VehicleRenderer } from './VehicleRenderer';
import { VisionSource } from '../services/fogOfWarService';
import type { SatelliteQuality } from '../types/saveGame';
import { SkyAtmosphere } from './SkyAtmosphere';

/** Yields to the browser so the loading overlay can animate between heavy build stages. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Thin cross-section of a wall/fence segment (meters). Kept in sync with
 * BuildingRenderer.renderFreestandingBody and freestandingFootprint. */
const FENCE_WIDTH = 1.2;

/** Radius (meters) around a freestanding structure's edge that a fence drag will snap to. */
const FREESTANDING_SNAP_DIST = 1.6;

export type TimeOfDay = 'day' | 'dusk' | 'night' | 'dawn';

export function getBuildingLootCategory(bldg: BuildingPolygon): 'food' | 'medical' | 'weapons' | 'fuel' | 'materials' | 'assorted' {
  const type = (bldg.type || '').toLowerCase();
  const name = (bldg.name || '').toLowerCase();

  if (
    type === 'supermarket' ||
    type === 'restaurant' ||
    type === 'grocery' ||
    type === 'bakery' ||
    type === 'cafe' ||
    /supermarket|grocery|market|food|dining|bistro|cafe|bakery|convenience|deli|butcher|provisions|store/i.test(name)
  ) {
    return 'food';
  }

  if (
    type === 'pharmacy' ||
    type === 'hospital' ||
    type === 'clinic' ||
    type === 'doctors' ||
    /pharmacy|chemist|hospital|clinic|doctor|surgery|medical|health|care|infirmary|dental/i.test(name)
  ) {
    return 'medical';
  }

  if (
    type === 'police' ||
    type === 'military' ||
    type === 'armory' ||
    /police|constabulary|station|military|barracks|guard|security|armory|gun/i.test(name)
  ) {
    return 'weapons';
  }

  if (
    type === 'gas_station' ||
    type === 'fuel' ||
    /petrol|gas|fuel|service station|oil|esso|bp|shell|texaco|total/i.test(name)
  ) {
    return 'fuel';
  }

  if (
    type === 'industrial' ||
    type === 'warehouse' ||
    type === 'commercial' ||
    /industrial|warehouse|factory|hardware|timber|diy|works|depot|plant|storage|builder/i.test(name)
  ) {
    return 'materials';
  }

  return 'assorted';
}

/**
 * Continuous day/night lighting keyframes (§4). Each keyframe is a full palette
 * at a specific clock hour; the scene interpolates between the two bracketing
 * keyframes so dawn/day/dusk/night blend smoothly instead of snapping at phase
 * boundaries. Hours wrap at 24 back to 0 (both 0 and 24 are night).
 */
interface DayNightKeyframe {
  hour: number;
  skyTop: number;
  horizon: number;
  fog: number;
  fogDensity: number;
  ambient: number;
  ambientIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  sunElevation: number; // -0.2 (below horizon) .. 1.0 (solar noon)
  sunAzimuth: number; // radians, sweeps east -> west
}

const DAY_NIGHT_KEYFRAMES: DayNightKeyframe[] = [
  // Midnight (0h / 24h): Greyscale nocturnal visibility. High contrast, cool silver ambient, moonlight highlights, clear ground & buildings.
  { hour: 0, skyTop: 0x1a2332, horizon: 0x3d4b60, fog: 0x3d4b60, fogDensity: 0.0006, ambient: 0x8e9ba8, ambientIntensity: 0.72, hemiSky: 0x9fb0c4, hemiGround: 0x4a5568, hemiIntensity: 0.62, sunColor: 0xd8e4f2, sunIntensity: 0.85, sunElevation: -0.15, sunAzimuth: -1.2 },
  // Late night / Pre-dawn (5h): Silvery twilight greyscale
  { hour: 5, skyTop: 0x222d3e, horizon: 0x475569, fog: 0x475569, fogDensity: 0.0007, ambient: 0x94a3b8, ambientIntensity: 0.70, hemiSky: 0xa4b5c8, hemiGround: 0x525f72, hemiIntensity: 0.60, sunColor: 0xdde7f5, sunIntensity: 0.82, sunElevation: -0.05, sunAzimuth: -1.9 },
  // Dawn (6.5h): Golden sunrise break
  { hour: 6.5, skyTop: 0x485a78, horizon: 0xd2bea0, fog: 0xada598, fogDensity: 0.0009, ambient: 0xaec6e2, ambientIntensity: 0.68, hemiSky: 0x9bc0e4, hemiGround: 0x2e3846, hemiIntensity: 0.52, sunColor: 0xffe2b8, sunIntensity: 1.15, sunElevation: 0.04, sunAzimuth: -1.55 },
  // Morning (9h): Crisp morning daylight
  { hour: 9, skyTop: 0x3a6082, horizon: 0xb8ccd8, fog: 0xaec2d4, fogDensity: 0.0007, ambient: 0xd8e2ee, ambientIntensity: 0.72, hemiSky: 0xebf2fa, hemiGround: 0x303640, hemiIntensity: 0.58, sunColor: 0xfff5e6, sunIntensity: 1.38, sunElevation: 0.5, sunAzimuth: -0.9 },
  // Noon (13h): Maximum daylight
  { hour: 13, skyTop: 0x365a7c, horizon: 0xbccfdc, fog: 0xb0c4d6, fogDensity: 0.0006, ambient: 0xe0e6f0, ambientIntensity: 0.75, hemiSky: 0xf0f4fc, hemiGround: 0x323842, hemiIntensity: 0.60, sunColor: 0xfffaee, sunIntensity: 1.48, sunElevation: 1.0, sunAzimuth: 0.0 },
  // Afternoon (17h): Warm daylight
  { hour: 17, skyTop: 0x365a7c, horizon: 0xbccfdc, fog: 0xb0c4d6, fogDensity: 0.0007, ambient: 0xdce2ec, ambientIntensity: 0.72, hemiSky: 0xecf0f8, hemiGround: 0x303640, hemiIntensity: 0.58, sunColor: 0xffecc8, sunIntensity: 1.38, sunElevation: 0.5, sunAzimuth: 0.9 },
  // Dusk (19h): Amber dusk sunset
  { hour: 19, skyTop: 0x342a3a, horizon: 0xd0805e, fog: 0xaa7866, fogDensity: 0.0009, ambient: 0xd08c6c, ambientIntensity: 0.60, hemiSky: 0xe0866c, hemiGround: 0x362422, hemiIntensity: 0.48, sunColor: 0xff8555, sunIntensity: 1.10, sunElevation: 0.04, sunAzimuth: 1.55 },
  // Nightfall (20.5h): Smooth transition to nocturnal greyscale
  { hour: 20.5, skyTop: 0x20293a, horizon: 0x425064, fog: 0x425064, fogDensity: 0.0007, ambient: 0x8c99a6, ambientIntensity: 0.70, hemiSky: 0x9eb0c4, hemiGround: 0x485364, hemiIntensity: 0.60, sunColor: 0xd4e0ee, sunIntensity: 0.82, sunElevation: -0.05, sunAzimuth: 1.9 },
  // Midnight (24h)
  { hour: 24, skyTop: 0x1a2332, horizon: 0x3d4b60, fog: 0x3d4b60, fogDensity: 0.0006, ambient: 0x8e9ba8, ambientIntensity: 0.72, hemiSky: 0x9fb0c4, hemiGround: 0x4a5568, hemiIntensity: 0.62, sunColor: 0xd8e4f2, sunIntensity: 0.85, sunElevation: -0.15, sunAzimuth: -1.2 },
];

const TIME_OF_DAY_HOURS: Record<TimeOfDay, number> = {
  day: 12,
  dusk: 19,
  night: 0,
  dawn: 6.5,
};

export interface FreestandingPlacementPoint {
  x: number;
  z: number;
  rotationDeg: number;
  // Explicit footprint applied at build time so fence segments render with their
  // exact per-segment run length (no gaps) and towers carry their real dims.
  width?: number;
  length?: number;
}

export interface WorldSceneOptions {
  container: HTMLElement;
  onSelectBuilding?: (building: BuildingPolygon | null) => void;
  onHoverBuilding?: (building: BuildingPolygon | null) => void;
  onSelectPosition?: (pos: Point2D) => void;
  onSelectSquad?: (squadId: string | null) => void;
  onSelectResourceNode?: (node: import('../types/map').ResourceNode | null) => void;
  onSelectVehicle?: (vehicleId: string | null) => void;
  onOrderSquadMove?: (squadId: string, pos: Point2D, targetBuildingId?: string | number, targetBuildingName?: string) => void;
  onOrderSquadAttack?: (squadId: string, zombieId: string) => void;
  onMountVehicle?: (squadId: string, vehicleId: string) => void;
  onScavengeViewToggle?: (active: boolean) => void;
  onPlaceFreestandingRun?: (
    typeId: FunctionalBuildingTypeId,
    placements: FreestandingPlacementPoint[]
  ) => void;
}

interface PrecomputedLootPin {
  id: string | number;
  x: number;
  z: number;
  topY: number;
  label: string;
  cat: 'food' | 'medical' | 'weapons' | 'fuel' | 'materials' | 'assorted';
}

function toSafeMap<K extends string | number = string | number, V = any>(val: any): Map<K, V> {
  if (!val) return new Map<K, V>();
  if (val instanceof Map) return val as Map<K, V>;
  if (Array.isArray(val)) return new Map<K, V>(val);
  if (typeof val === 'object') return new Map<K, V>(Object.entries(val) as any);
  return new Map<K, V>();
}

export class WorldScene {
  private container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public cameraController: CameraController;

  // Sub-renderers
  public buildingRenderer: BuildingRenderer;
  private buildingLodDistant = false;
  public roadRenderer: RoadRenderer;
  public resourceRenderer: ResourceRenderer;
  public groundRenderer: GroundRenderer;
  public fogOfWarRenderer: FogOfWarRenderer;
  public smokeSystem: SmokeParticleSystem;
  public combatRenderer: CombatRenderer;
  public vehicleRenderer: VehicleRenderer;
  public markerRenderer: EntityMarkerRenderer;

  // Lighting & Atmosphere
  private sunLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private fog: THREE.FogExp2;
  public skyAtmosphere: SkyAtmosphere;

  // Interaction
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private onSelectBuilding?: (building: BuildingPolygon | null) => void;
  private onHoverBuilding?: (building: BuildingPolygon | null) => void;
  private onSelectPosition?: (pos: Point2D) => void;
  private onSelectSquad?: (squadId: string | null) => void;
  private onSelectResourceNode?: (node: import('../types/map').ResourceNode | null) => void;
  private onSelectVehicle?: (vehicleId: string | null) => void;
  private onOrderSquadMove?: (squadId: string, pos: Point2D, targetBuildingId?: string | number, targetBuildingName?: string) => void;
  private onOrderSquadAttack?: (squadId: string, zombieId: string) => void;
  private onMountVehicle?: (squadId: string, vehicleId: string) => void;
  public onScavengeViewToggle?: (active: boolean) => void;
  private onPlaceFreestandingRun?: (
    typeId: FunctionalBuildingTypeId,
    placements: FreestandingPlacementPoint[]
  ) => void;

  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownTime = 0;
  private pointerType = 'mouse';
  private pointerDragged = false;
  private longPressTimer: number | null = null;
  private tapFeedbackMesh: THREE.Mesh | null = null;
  private tapFeedbackTime = 0;

  private simulationPaused = false;

  private selectedSquadId: string | null = null;
  private selectedVehicleId: string | null = null;
  private isRunning = false;
  private animationFrameId = 0;
  private lastTime = 0;
  private currentTimeOfDay: TimeOfDay = 'day';
  private clockHour = 8; // continuously-blended clock hour driving the lighting
  private scratchA = new THREE.Color();
  private scratchB = new THREE.Color();
  private lightingHour = 8;
  private targetLightingHour = 8;
  private currentMapData: MapData | null = null;
  private currentExaggeration = 1.0;
  private disableElevation = false;
  private showBuildingEdges = true;
  private showWireframe = false;

  // View Layers & Scavenge Overlay State
  public isScavengeViewActive = false;
  public scavengeFilterType = 'all';
  public showStreetLabels = false;
  // Satellite overlay replaces the vector map layers (roads, landuse) while shown.
  private satelliteOverlayActive = false;
  public labelDetailMode: 'detailed' | 'minimal' = 'minimal';
  private precomputedLootPins: PrecomputedLootPin[] = [];

  private hqBuildingId: string | number | null = null;
  private adaptedBuildings: Map<string | number, AdaptedBuilding> = new Map();
  private freestandingBuildings: AdaptedBuilding[] = [];
  private hiddenGroups: Map<string | number, HiddenSurvivorGroup> = new Map();
  private rivalHideouts: Map<string | number, RivalHideout> = new Map();
  private zombieLairs: Map<string | number, ZombieLair> = new Map();
  private deconstructionJobs: Map<string | number, DeconstructionJob> = new Map();
  private demolishedBuildings: Map<string | number, true> = new Map();

  // Ghost blueprint holographic placement helper (§7.1)
  private pendingFreestandingType: FunctionalBuildingTypeId | null = null;
  private blueprintGhostGroup: THREE.Group = new THREE.Group();
  private blueprintGhostMesh: THREE.Mesh | null = null;
  private blueprintGhostEdges: THREE.LineSegments | null = null;
  private blueprintGhostMaterial: THREE.MeshBasicMaterial | null = null;
  private blueprintPlacementStart: THREE.Vector3 | null = null;
  private blueprintPlacementRotation = 0;
  private placementGestureActive = false;
  private placementIsFence = false;
  private placementSegmentSpacing = 10;
  // Water polygons (landuse type === 'water') used to reject placement of
  // walls/towers/gates on water: the ghost turns red while the cursor is over
  // water and placement is cancelled on release.
  private waterPolygons: Point2D[][] = [];

  // Fog of war state (§3.5)
  private fogGrid: FogOfWarState | null = null;
  private visibleCells: Set<number> = new Set();
  private fogEnabled = false;

  // Friendly units that trigger gate doors to open (squads + vehicles). Kept
  // separate so updateCombat/updateVehicles can each refresh their half.
  private gateTriggerSquads: { x: number; z: number }[] = [];
  private gateTriggerVehicles: { x: number; z: number }[] = [];

  // Render stats
  public fps = 60;
  private frameCount = 0;
  private fpsLastTime = 0;

  // Bumped on every loadMapData so a stale progressive build (triggered before a
  // newer map payload arrived) can detect it aborted and stop adding meshes.
  private loadGeneration = 0;

  constructor(options: WorldSceneOptions) {
    this.container = options.container;
    this.onSelectBuilding = options.onSelectBuilding;
    this.onHoverBuilding = options.onHoverBuilding;
    this.onSelectPosition = options.onSelectPosition;
    this.onSelectSquad = options.onSelectSquad;
    this.onSelectResourceNode = options.onSelectResourceNode;
    this.onSelectVehicle = options.onSelectVehicle;
    this.onOrderSquadMove = options.onOrderSquadMove;
    this.onOrderSquadAttack = options.onOrderSquadAttack;
    this.onMountVehicle = options.onMountVehicle;
    this.onPlaceFreestandingRun = options.onPlaceFreestandingRun;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x131517);
    this.fog = new THREE.FogExp2(0x9db4c8, 0.00035);
    this.scene.fog = this.fog;

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 14000);
    this.cameraController = new CameraController(this.camera, this.container);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.container.appendChild(this.renderer.domElement);

    // 4. Lights
    this.ambientLight = new THREE.AmbientLight(0xd4d8e0, 0.6);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xe8ecf5, 0x1a1c1e, 0.45);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff7e8, 1.25);
    this.sunLight.position.set(120, 180, 80);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 500;
    const d = 250;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 4b. Sky dome & Celestial Atmosphere (realistic skybox, sun/moon trajectory, stars)
    this.skyAtmosphere = new SkyAtmosphere();
    this.scene.add(this.skyAtmosphere.group);

    // 5. Initialize Sub-renderers
    this.groundRenderer = new GroundRenderer();
    this.roadRenderer = new RoadRenderer();
    this.buildingRenderer = new BuildingRenderer();
    this.resourceRenderer = new ResourceRenderer();
    this.fogOfWarRenderer = new FogOfWarRenderer();
    this.smokeSystem = new SmokeParticleSystem();
    this.combatRenderer = new CombatRenderer();
    this.vehicleRenderer = new VehicleRenderer();
    this.markerRenderer = new EntityMarkerRenderer();

    this.scene.add(this.groundRenderer.group);
    this.scene.add(this.roadRenderer.group);
    this.scene.add(this.buildingRenderer.group);
    this.scene.add(this.buildingRenderer.lodGroup);
    this.scene.add(this.resourceRenderer.group);
    this.scene.add(this.fogOfWarRenderer.group);
    this.scene.add(this.smokeSystem.group);
    this.scene.add(this.smokeSystem.constructionGroup);
    this.scene.add(this.smokeSystem.deconstructionGroup);
    this.scene.add(this.combatRenderer.group);
    this.scene.add(this.vehicleRenderer.group);
    this.scene.add(this.markerRenderer.group);
    this.scene.add(this.blueprintGhostGroup);
    this.blueprintGhostGroup.visible = false;

    // 6. Event listeners
    this.container.addEventListener('pointerdown', this.onPointerDown);
    this.container.addEventListener('pointermove', this.onPointerMove);
    this.container.addEventListener('pointerup', this.onPointerUp);
    this.container.addEventListener('click', this.onClick);
    this.container.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('resize', this.onWindowResize);

    this.applyContinuousLighting(this.clockHour);
    this.start();
  }

  public async loadMapData(
    mapData: MapData,
    showBuildingEdges = true,
    exaggeration = 1.0,
    hqBuildingId: string | number | null = null,
    adaptedBuildings: Map<string | number, AdaptedBuilding> = new Map(),
    freestandingBuildings: AdaptedBuilding[] = [],
    demolishedBuildingIds: Map<string | number, true> = new Map(),
    disableElevation = false,
    onProgress?: (progress: number, label?: string) => void
  ) {
    const gen = ++this.loadGeneration;
    const stale = () => gen !== this.loadGeneration;

    this.currentMapData = mapData;
    this.waterPolygons = (mapData.landuse || [])
      .filter((l) => l.type === 'water' && l.polygon?.length >= 3)
      .map((l) => l.polygon as Point2D[]);
    this.showBuildingEdges = showBuildingEdges;
    this.currentExaggeration = exaggeration;
    this.disableElevation = disableElevation;
    this.hqBuildingId = hqBuildingId;
    this.adaptedBuildings = adaptedBuildings;
    this.freestandingBuildings = freestandingBuildings;
    this.demolishedBuildings = demolishedBuildingIds;
    this.cameraController.setMapRadius(mapData.radius);

    const activeElevation = this.disableElevation ? null : mapData.elevation;

    // Each stage yields to the event loop so the atmospheric-descent loading
    // screen keeps animating and reports where the load actually is instead of
    // freezing the main thread for the whole city build.
    onProgress?.(0.05, 'Lifting terrain elevation...');
    this.groundRenderer.rebuildTerrain(activeElevation, mapData.radius, exaggeration, mapData.center);
    if (stale()) return;

    onProgress?.(0.12, 'Sculpting landuse surfaces...');
    this.groundRenderer.rebuildLanduse(mapData.landuse, mapData.radius, activeElevation, exaggeration);
    await nextFrame();
    if (stale()) return;

    onProgress?.(0.18, 'Tracing road networks...');
    this.roadRenderer.rebuildRoads(mapData.roads, activeElevation, exaggeration);
    this.roadRenderer.setShowStreetLabels(this.showStreetLabels);
    await nextFrame();
    if (stale()) return;

    onProgress?.(0.22, 'Extruding building meshes...');
    await this.buildingRenderer.rebuildBuildingsProgressive(
      mapData.buildings,
      showBuildingEdges,
      activeElevation,
      exaggeration,
      hqBuildingId,
      adaptedBuildings,
      freestandingBuildings,
      this.demolishedBuildings,
      (done, total) => {
        onProgress?.(0.22 + 0.6 * (done / total), `Extruding building meshes (${done.toLocaleString()}/${total.toLocaleString()})...`);
      },
      stale
    );
    if (stale()) return;

    // Merge the zoomed-out building LOD once the detailed meshes exist
    this.buildingLodDistant = false;
    this.buildingRenderer.buildLod();
    this.buildingRenderer.setLodMode('detailed');

    onProgress?.(0.85, 'Scattering salvage resources...');
    this.resourceRenderer.rebuildResources(mapData.resourceNodes, activeElevation, exaggeration);
    await nextFrame();
    if (stale()) return;

    onProgress?.(0.9, 'Calibrating sensor fog...');
    this.fogOfWarRenderer.rebuildFog(mapData.radius, activeElevation, exaggeration);
    this.combatRenderer.setElevation(activeElevation, exaggeration);
    await nextFrame();
    if (stale()) return;

    onProgress?.(0.95, 'Tagging loot caches...');
    // Precompute scavenge loot pins for immediate instantaneous display
    this.precomputedLootPins = mapData.buildings.map((bldg) => {
      const topY = this.getBuildingTopY(bldg.id);
      const cat = getBuildingLootCategory(bldg);
      return {
        id: bldg.id,
        x: bldg.center.x,
        z: bldg.center.z,
        topY,
        label: bldg.name || bldg.type || 'Structure',
        cat,
      };
    });
    // A satellite overlay restored from a save may pre-date the layer builds
    // above (roads/landuse are recreated during load), so re-apply its state.
    this.applySatelliteOverlayVisibility();
    onProgress?.(1, 'Deployment ready');
  }

  public updateSettlementBuildings(
    hqBuildingId: string | number | null,
    adaptedBuildings: Map<string | number, AdaptedBuilding>,
    freestandingBuildings: AdaptedBuilding[],
    hiddenGroups: Map<string | number, HiddenSurvivorGroup> = new Map(),
    deconstructionJobs: Map<string | number, DeconstructionJob> = new Map(),
    demolishedBuildings: Map<string | number, true> = new Map()
  ) {
    const safeAdapted = toSafeMap<string | number, AdaptedBuilding>(adaptedBuildings);
    const safeHidden = toSafeMap<string | number, HiddenSurvivorGroup>(hiddenGroups);
    const safeDeconstruction = toSafeMap<string | number, DeconstructionJob>(deconstructionJobs);
    const safeDemolished = toSafeMap<string | number, true>(demolishedBuildings);

    this.hqBuildingId = hqBuildingId;
    this.adaptedBuildings = safeAdapted;
    this.freestandingBuildings = freestandingBuildings;
    this.hiddenGroups = safeHidden;
    this.deconstructionJobs = safeDeconstruction;
    this.demolishedBuildings = safeDemolished;

    if (this.currentMapData) {
      const activeElevation = this.disableElevation ? null : this.currentMapData.elevation;
      if (this.buildingRenderer.buildingMeshes.size > 0) {
        this.buildingRenderer.updateAdaptedStates(
          hqBuildingId,
          safeAdapted,
          freestandingBuildings,
          safeDemolished,
          activeElevation,
          this.currentExaggeration
        );
      } else {
        this.buildingRenderer.rebuildBuildings(
          this.currentMapData.buildings,
          this.showBuildingEdges,
          activeElevation,
          this.currentExaggeration,
          hqBuildingId,
          safeAdapted,
          freestandingBuildings,
          safeDemolished
        );
        this.buildingRenderer.buildLod();
        this.buildingRenderer.setLodMode('detailed');
      }

      this.smokeSystem.updateEmitters(
        safeHidden,
        this.buildingRenderer.buildingMeshes,
        safeAdapted
      );
      this.smokeSystem.updateConstructionVisuals(
        safeAdapted,
        freestandingBuildings,
        this.buildingRenderer.buildingMeshes
      );
      this.smokeSystem.updateDeconstructionVisuals(
        safeDeconstruction,
        this.buildingRenderer.buildingMeshes
      );
    }
  }

  public setDisableElevation(disable: boolean) {
    if (this.disableElevation === disable || !this.currentMapData) return;
    this.disableElevation = disable;
    const activeElevation = disable ? null : this.currentMapData.elevation;
    this.combatRenderer.setElevation(activeElevation, this.currentExaggeration);
    this.loadMapData(
      this.currentMapData,
      this.showBuildingEdges,
      this.currentExaggeration,
      this.hqBuildingId,
      this.adaptedBuildings,
      this.freestandingBuildings,
      this.demolishedBuildings,
      disable
    );
  }

  public setElevationExaggeration(exaggeration: number) {
    if (this.currentExaggeration === exaggeration || !this.currentMapData) return;
    this.currentExaggeration = exaggeration;
    this.loadMapData(
      this.currentMapData,
      this.showBuildingEdges,
      exaggeration,
      this.hqBuildingId,
      this.adaptedBuildings,
      this.freestandingBuildings,
      this.demolishedBuildings,
      this.disableElevation
    );
  }

  public setWireframe(show: boolean) {
    this.showWireframe = show;
    this.groundRenderer.setWireframe(show);
  }

  /**
   * Continuously drives the day/night lighting from the real clock hour (0..24).
   * Lighting is interpolated between keyframes, so dawn/day/dusk/night blend
   * smoothly as the hour advances instead of snapping at phase boundaries.
   */
  public setClockTime(hour: number) {
    this.targetLightingHour = ((hour % 24) + 24) % 24;
  }

  /**
   * Hard-jump to a discrete phase. Used by the debug overlay; the live game path
   * drives setClockTime with the continuous hour.
   */
  public setTimeOfDay(time: TimeOfDay) {
    this.currentTimeOfDay = time;
    this.targetLightingHour = TIME_OF_DAY_HOURS[time];
  }

  private lerpColor(out: THREE.Color, a: number, b: number, t: number): THREE.Color {
    this.scratchA.setHex(a);
    this.scratchB.setHex(b);
    return out.copy(this.scratchA).lerp(this.scratchB, t);
  }

  private applyContinuousLighting(hour: number) {
    const h = ((hour % 24) + 24) % 24;

    let k0 = DAY_NIGHT_KEYFRAMES[0];
    let k1 = DAY_NIGHT_KEYFRAMES[DAY_NIGHT_KEYFRAMES.length - 1];
    for (let i = 0; i < DAY_NIGHT_KEYFRAMES.length - 1; i++) {
      const a = DAY_NIGHT_KEYFRAMES[i];
      const b = DAY_NIGHT_KEYFRAMES[i + 1];
      if (h >= a.hour && h <= b.hour) {
        k0 = a;
        k1 = b;
        break;
      }
    }
    const span = k1.hour - k0.hour;
    const t = span <= 0 ? 0 : (h - k0.hour) / span;
    const mix = (a: number, b: number) => a + (b - a) * t;

    // Celestial atmosphere, scene background & atmospheric fog
    const topCol = this.scratchA.setHex(k0.skyTop).clone().lerp(this.scratchB.setHex(k1.skyTop), t);
    const horizCol = this.scratchA.setHex(k0.horizon).clone().lerp(this.scratchB.setHex(k1.horizon), t);
    const sunCol = this.scratchA.setHex(k0.sunColor).clone().lerp(this.scratchB.setHex(k1.sunColor), t);
    const moonCol = new THREE.Color(0xa5c4e8);

    this.skyAtmosphere.setSkyColors(topCol, horizCol, sunCol, moonCol);
    this.skyAtmosphere.update(h, this.camera.position, performance.now() / 1000);

    this.lerpColor(this.scene.background as THREE.Color, k0.horizon, k1.horizon, t);
    this.lerpColor(this.fog.color, k0.fog, k1.fog, t);
    this.fog.density = mix(k0.fogDensity, k1.fogDensity);

    // Ambient, hemisphere & sun
    this.lerpColor(this.ambientLight.color, k0.ambient, k1.ambient, t);
    this.ambientLight.intensity = mix(k0.ambientIntensity, k1.ambientIntensity);
    this.lerpColor(this.hemiLight.color, k0.hemiSky, k1.hemiSky, t);
    this.lerpColor(this.hemiLight.groundColor, k0.hemiGround, k1.hemiGround, t);
    this.hemiLight.intensity = mix(k0.hemiIntensity, k1.hemiIntensity);
    this.lerpColor(this.sunLight.color, k0.sunColor, k1.sunColor, t);
    this.sunLight.intensity = mix(k0.sunIntensity, k1.sunIntensity);

    // Sun position: smooth elevation curve + east-to-west azimuth sweep
    const elevation = mix(k0.sunElevation, k1.sunElevation);
    const azimuth = mix(k0.sunAzimuth, k1.sunAzimuth);
    const dist = 150;
    const y = elevation * 200;
    this.sunLight.position.set(Math.cos(azimuth) * dist, y, Math.sin(azimuth) * dist);

    // Apply the same continuous daylight colour grade to satellite imagery and
    // land-use surfaces; GroundRenderer eases toward this target every frame.
    const groundGrade = this.scratchB.copy(this.ambientLight.color).multiplyScalar(
      Math.min(1.15, Math.max(0.55, mix(k0.ambientIntensity, k1.ambientIntensity)))
    );
    this.groundRenderer.updateLighting(groundGrade);
    this.fogOfWarRenderer.updateLighting(this.fog.color, mix(k0.ambientIntensity, k1.ambientIntensity), h);

    // Window glow on textured facades: peak at midnight, zero by mid-morning/
    // mid-afternoon so lit windows ramp in at dusk and out at dawn.
    const nightGlow = Math.max(0, Math.cos(((h / 24) * Math.PI * 2)));
    this.buildingRenderer.setNightGlow(nightGlow > 0.08 ? (nightGlow - 0.08) / 0.92 : 0);
  }

  private spawnTapFeedback(x: number, y: number, z: number, color = 0xe2e8f0) {
    if (!this.tapFeedbackMesh) {
      const geo = new THREE.RingGeometry(0.5, 1.2, 32);
      const mat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      this.tapFeedbackMesh = new THREE.Mesh(geo, mat);
      this.tapFeedbackMesh.rotation.x = -Math.PI / 2;
      this.scene.add(this.tapFeedbackMesh);
    }

    if (this.tapFeedbackMesh) {
      this.tapFeedbackMesh.position.set(x, y + 0.15, z);
      this.tapFeedbackMesh.scale.set(0.5, 0.5, 0.5);
      (this.tapFeedbackMesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      (this.tapFeedbackMesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
      this.tapFeedbackMesh.visible = true;
      this.tapFeedbackTime = performance.now();
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDownX = e.clientX;
    this.pointerDownY = e.clientY;
    this.pointerDownTime = performance.now();
    this.pointerType = e.pointerType || 'mouse';
    this.pointerDragged = false;

    if (this.longPressTimer) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    // Armed freestanding blueprint: mouse-down anchors the placement. For fences
    // this becomes the start point of a run; for towers/gates the centre of the
    // footprint that you then rotate by dragging before releasing. Lock the
    // camera so the drag rotates/extends the blueprint instead of panning.
    if (this.pendingFreestandingType) {
      this.cameraController.placementActive = true;
      const rect = this.container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const groundHits = this.raycaster.intersectObjects(this.groundRenderer.group.children, true);
      if (groundHits.length > 0) {
        const pt = groundHits[0].point;
        // Snap a fence run's anchor to the edge of a nearby freestanding
        // structure (tower, gate or wall) so the run starts flush against it.
        // Towers/gates keep their free centre (snapping would offset the
        // footprint or skew the rotate-by-drag angle).
        const snap = this.placementIsFence ? this.snapToFreestandingEdge(pt.x, pt.z) : null;
        this.blueprintPlacementStart = new THREE.Vector3(
          snap ? snap.x : pt.x,
          pt.y,
          snap ? snap.z : pt.z
        );
        this.blueprintPlacementRotation = 0;
        this.placementGestureActive = true;
        this.blueprintGhostGroup.visible = true;
        this.blueprintGhostGroup.position.copy(pt);
        this.blueprintGhostGroup.scale.set(1, 1, 1);
        this.blueprintGhostGroup.rotation.y = 0;
      }
      return;
    }

    // On touch devices, set up long-press timer for context actions (movement, combat focus, enter building)
    if (this.pointerType === 'touch') {
      const clientX = e.clientX;
      const clientY = e.clientY;
      this.longPressTimer = window.setTimeout(() => {
        if (!this.pointerDragged) {
          this.executeTacticalOrderAtScreenPos(clientX, clientY);
          if (navigator.vibrate) {
            try { navigator.vibrate(35); } catch {}
          }
        }
      }, 420);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const dragThreshold = (e.pointerType === 'touch' || this.pointerType === 'touch') ? 18 : 6;
    if (Math.hypot(e.clientX - this.pointerDownX, e.clientY - this.pointerDownY) > dragThreshold) {
      this.pointerDragged = true;
      if (this.longPressTimer) {
        window.clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    }
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // While placing, the ghost follows the cursor. After the gesture starts,
    // fences become a live run stretched between the anchored start and the cursor;
    // towers/gates lock their centre and rotate the footprint toward the cursor.
    if (this.pendingFreestandingType && this.blueprintGhostGroup.visible) {
      const groundHits = this.raycaster.intersectObjects(this.groundRenderer.group.children, true);
      if (groundHits.length > 0) {
        const pt = groundHits[0].point;
        // Reject placement over water: tint the ghost red while the footprint
        // would straddle a river/lake so the player sees the invalid spot.
        const placementRot = this.placementGestureActive ? this.blueprintPlacementRotation : 0;
        const overWater = this.isPlacementOverWater(pt.x, pt.z, placementRot);
        if (this.blueprintGhostMaterial) {
          this.blueprintGhostMaterial.color.setHex(overWater ? 0xef4444 : 0x10b981);
        }
        // Snap the live cursor to a freestanding structure's edge so the ghost
        // preview matches the exact run that will be built (fence runs only).
        const snap = this.placementIsFence ? this.snapToFreestandingEdge(pt.x, pt.z) : null;
        const ex = snap ? snap.x : pt.x;
        const ez = snap ? snap.z : pt.z;
        if (this.placementGestureActive && this.blueprintPlacementStart) {
          const dx = ex - this.blueprintPlacementStart.x;
          const dz = ez - this.blueprintPlacementStart.z;
          const ang = Math.atan2(dx, dz);
          this.blueprintPlacementRotation = ang;
          this.blueprintGhostGroup.position.copy(this.blueprintPlacementStart);
          this.blueprintGhostGroup.rotation.y = ang;
          if (this.placementIsFence) {
            // Scale the small square footprint up to the dragged run length (units
            // of FENCE_WIDTH), so at rest it is a precise 1.2m marker and once
            // the drag begins it stretches A→B covering the exact run.
            const dragLength = Math.max(FENCE_WIDTH, Math.hypot(dx, dz));
            this.blueprintGhostGroup.scale.set(1, 1, dragLength / FENCE_WIDTH);
          } else {
            // Centre is locked; rotation is the only thing that changes while dragging.
            this.blueprintGhostGroup.scale.set(1, 1, 1);
          }
        } else if (!this.placementGestureActive) {
          this.blueprintGhostGroup.position.set(pt.x, pt.y, pt.z);
          this.blueprintGhostGroup.scale.set(1, 1, 1);
          this.blueprintGhostGroup.rotation.y = 0;
        }
      }
    }

    const intersects = this.raycaster.intersectObjects(this.buildingRenderer.group.children, true);

    let foundBuilding: BuildingPolygon | null = null;
    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const bldgId = hit.userData?.buildingId;
      if (bldgId !== undefined && bldgId !== null) {
        foundBuilding = this.buildingRenderer.getBuildingById(bldgId) || null;
      }
    }

    this.buildingRenderer.setHovered(foundBuilding ? foundBuilding.id : null);
    if (this.onHoverBuilding) {
      this.onHoverBuilding(foundBuilding);
    }
  };

  private isPointInsidePoly(p: Point2D, poly: Point2D[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * True when the current freestanding structure, placed at (x, z) with the
   * given rotation, has its footprint centre or any corner inside a water
   * polygon. Used to tint the placement ghost red and reject the placement.
   */
  private isPlacementOverWater(x: number, z: number, rotDeg: number): boolean {
    if (this.waterPolygons.length === 0) return false;
    const type = this.pendingFreestandingType;
    if (!type) return false;
    const poly = getFreestandingCollisionPolygon({ typeId: type, position: { x, z }, rotationDeg: rotDeg });
    const corners = [{ x, z }, ...poly];
    for (const water of this.waterPolygons) {
      for (const c of corners) {
        if (this.isPointInsidePoly(c, water)) return true;
      }
    }
    return false;
  }

  /**
   * Fence runs snap to the edges of existing freestanding structures — towers,
   * gates and wall segments alike. Given a world point, returns the closest
   * point on any structure's footprint edge if it is within
   * FREESTANDING_SNAP_DIST, otherwise null. Lets a wall dragged from or into
   * any built structure connect flush to it instead of stopping beside it, so
   * adjoining runs butt end-to-end (or T-junction into a wall's side).
   */
  private snapToFreestandingEdge(px: number, pz: number): { x: number; z: number } | null {
    const structures = this.freestandingBuildings;
    if (!structures || structures.length === 0) return null;
    let best: { x: number; z: number } | null = null;
    let bestD = FREESTANDING_SNAP_DIST;
    for (const f of structures) {
      const poly = getFreestandingCollisionPolygon(f);
      if (!poly || poly.length < 2) continue;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const ab2 = abx * abx + abz * abz;
        const t = ab2 > 0 ? ((px - a.x) * abx + (pz - a.z) * abz) / ab2 : 0;
        const ct = Math.max(0, Math.min(1, t));
        const cx = a.x + abx * ct;
        const cz = a.z + abz * ct;
        const d = Math.hypot(px - cx, pz - cz);
        if (d < bestD) {
          bestD = d;
          best = { x: cx, z: cz };
        }
      }
    }
    return best;
  }

  public setPendingFreestandingType(type: FunctionalBuildingTypeId | null) {
    this.pendingFreestandingType = type;
    this.blueprintPlacementStart = null;
    this.blueprintPlacementRotation = 0;
    this.placementGestureActive = false;
    if (!type) {
      this.blueprintGhostGroup.visible = false;
      return;
    }

    // Rebuild blueprint ghost geometry based on structure type
    while (this.blueprintGhostGroup.children.length > 0) {
      const ch = this.blueprintGhostGroup.children.pop();
      if (ch && (ch as THREE.Mesh).geometry) {
        (ch as THREE.Mesh).geometry.dispose();
      }
    }

    const isWall =
      type === 'wooden_palisade' ||
      type === 'brick_wall' ||
      type === 'fortified_wall' ||
      type === 'metal_fence' ||
      type === 'barbed_wire';
    const isGate = type === 'wooden_gate' || type === 'metal_gate' || type === 'fortified_gate';
    const isTower = type === 'wooden_tower' || type === 'metal_tower' || type === 'fortified_tower' || type === 'floodlight_tower';

    // Fences are placed as click-drag-release *runs*: many consecutive segments.
    // The ghost's length axis (local Z) runs along the dragged direction so it can
    // be stretched with scale z to preview the total run.
    this.placementIsFence = isWall;

    let width = 8;
    let length = 8;
    let height = 4.5;

    if (isWall) {
      width = FENCE_WIDTH;
      // A small square footprint at rest so the player can pinpoint exactly where
      // a run starts; it stretches into the full run length only while dragging.
      length = FENCE_WIDTH;
      height = type === 'fortified_wall' ? 4.2 : type === 'brick_wall' ? 3.6 : 3.2;
    } else if (isGate) {
      width = 10;
      length = 3.2;
      height = 4.2;
    } else if (isTower) {
      width = 5.2;
      length = 5.2;
      height = type === 'fortified_tower' ? 9.5 : 8.0;
    }

    const boxGeom = new THREE.BoxGeometry(width, height, length);
    // Fences start as a small square at the anchor (local Z 0..FENCE_WIDTH) and
    // stretch toward the cursor when scaled (scale.z = runLen / FENCE_WIDTH), so
    // the ghost reads as a precise placement marker rather than a full segment
    // hanging off the anchor symmetrically in both directions.
    boxGeom.translate(0, height / 2, isWall ? length / 2 : 0);

    this.blueprintGhostMaterial = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.45,
      wireframe: false,
    });
    const ghostMat = this.blueprintGhostMaterial;
    const ghostMesh = new THREE.Mesh(boxGeom, ghostMat);

    const edgeGeom = new THREE.EdgesGeometry(boxGeom);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    const edgeLine = new THREE.LineSegments(edgeGeom, edgeMat);

    // Add a pulsing ground grid ring beneath
    const ringGeom = new THREE.RingGeometry(0.5, Math.max(width, length) * 0.75, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.position.y = 0.1;

    this.blueprintGhostGroup.add(ghostMesh);
    this.blueprintGhostGroup.add(edgeLine);
    this.blueprintGhostGroup.add(ringMesh);

    // Gate previews as two door panels flanked by two full-size towers (like the
    // built gate), so the ghost doesn't read as a plain box.
    if (isGate) {
      const gateGhostMat = new THREE.MeshBasicMaterial({
        color: 0xec4899,
        transparent: true,
        opacity: 0.6,
        wireframe: true,
      });
      const twW = 4.4;
      const twH = type === 'fortified_gate' ? 9.5 : 8.0;
      const twD = 4.4;
      for (const sx of [-1, 1]) {
        const twGeom = new THREE.BoxGeometry(twW, twH, twD);
        twGeom.translate(0, twH / 2, 0);
        const tw = new THREE.Mesh(twGeom, gateGhostMat);
        tw.position.x = sx * (width / 2 + twW / 2 - 0.2);
        this.blueprintGhostGroup.add(tw);
      }
      // Two translucent door slabs spanning the full opening between the towers.
      const doorMat = new THREE.MeshBasicMaterial({
        color: 0xec4899,
        transparent: true,
        opacity: 0.35,
        wireframe: false,
      });
      const doorH = height;
      for (const sx of [-1, 1]) {
        const doorGeom = new THREE.BoxGeometry(width / 2 - 0.12, doorH, 0.28);
        doorGeom.translate(0, doorH / 2, 0);
        const door = new THREE.Mesh(doorGeom, doorMat);
        door.position.x = sx * (width / 4);
        this.blueprintGhostGroup.add(door);
      }
    }

    this.blueprintGhostGroup.visible = true;
  }

  private lastProcessedTapTime = 0;

  private onPointerUp = (e: PointerEvent) => {
    if (this.longPressTimer) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    // Finishing a freestanding placement gesture (click + drag + release).
    if (this.placementGestureActive && this.pendingFreestandingType) {
      this.cameraController.placementActive = false;
      this.finalizeFreestandingPlacement(e.clientX, e.clientY);
      this.lastProcessedTapTime = performance.now();
      return;
    }

    if (e.pointerType === 'touch' && !this.pointerDragged && performance.now() - this.pointerDownTime < 380) {
      this.handleTapAt(e.clientX, e.clientY);
      this.lastProcessedTapTime = performance.now();
    }
  };

  private finalizeFreestandingPlacement(clientX: number, clientY: number) {
    const type = this.pendingFreestandingType;
    const start = this.blueprintPlacementStart;
    const finalRotation = this.blueprintPlacementRotation;
    this.blueprintPlacementStart = null;
    this.blueprintPlacementRotation = 0;
    this.placementGestureActive = false;
    if (!type || !start || !this.onPlaceFreestandingRun) return;

    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const groundHits = this.raycaster.intersectObjects(this.groundRenderer.group.children, true);
    if (groundHits.length === 0) return;
    const pt = groundHits[0].point;

    const round = (v: number) => Math.round(v * 10) / 10;
    const placements: FreestandingPlacementPoint[] = [];

    if (this.placementIsFence) {
      // Click-start -> drag -> release builds the whole run as consecutive,
      // independent fence segments from anchor A to cursor B. The cursor is
      // snapped to any adjacent tower edge first so the wall terminates flush
      // against a tower.
      const snapEnd = this.snapToFreestandingEdge(pt.x, pt.z);
      const ex = snapEnd ? snapEnd.x : pt.x;
      const ez = snapEnd ? snapEnd.z : pt.z;
      const dx = ex - start.x;
      const dz = ez - start.z;
      const len = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      const rotDeg = (ang * 180) / Math.PI;
      const spacing = this.placementSegmentSpacing;
      const ux = len > 0.5 ? dx / len : 1;
      const uz = len > 0.5 ? dz / len : 0;
      // Tile the run from A with consecutive segments of AT MOST the max spacing:
      // as many full 10m segments as fit, then one shorter remainder. So a 17.5m
      // drag becomes a 10m + 7.5m pair (never even-split fragments), and segments
      // butt exactly end-to-end covering the whole dragged distance with no gap.
      const segLens: number[] = [];
      if (len < 0.8) {
        // A sub-metre flick produces a single short segment instead of an empty run.
        segLens.push(Math.max(0.4, len));
      } else {
        const fullSegments = Math.floor(len / spacing);
        for (let i = 0; i < fullSegments; i++) {
          segLens.push(spacing);
        }
        const remainder = len - fullSegments * spacing;
        if (remainder >= 0.5) {
          segLens.push(remainder);
        }
      }
      let cursor = 0;
      for (const segLen of segLens) {
        const cx = start.x + ux * (cursor + segLen / 2);
        const cz = start.z + uz * (cursor + segLen / 2);
        cursor += segLen;
        placements.push({
          x: round(cx),
          z: round(cz),
          rotationDeg: round(rotDeg),
          width: FENCE_WIDTH,
          length: round(segLen),
        });
      }
    } else {
      // Tower/gate: click places the centre, drag (still held) rotates the
      // footprint, release places it with the final rotation.
      const dims = getFreestandingDimensions(type);
      placements.push({
        x: round(start.x),
        z: round(start.z),
        rotationDeg: round((finalRotation * 180) / Math.PI),
        width: dims.width,
        length: dims.length,
      });
    }

    this.spawnTapFeedback(pt.x, pt.y, pt.z, 0x10b981);
    this.blueprintGhostGroup.scale.set(1, 1, 1);
    this.onPlaceFreestandingRun(type, placements);
  }

  private onClick = (e: MouseEvent) => {
    if (e.button !== 0 || this.pointerDragged) return;
    if (performance.now() - this.lastProcessedTapTime < 350) return; // already handled by touch pointerup
    this.handleTapAt(e.clientX, e.clientY);
  };

  private handleTapAt(clientX: number, clientY: number) {
    // Freestanding placement is fully driven by the pointerdown/drag/up gesture
    // (finalizeFreestandingPlacement), so taps while armed must not double-place.
    if (this.pendingFreestandingType) return;

    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 0. Check if an Entity Marker label/badge was clicked
    const markerHit = this.markerRenderer.raycastMarker(this.raycaster);
    if (markerHit) {
      if (markerHit.kind === 'loot_pin') {
        const bldg = this.buildingRenderer.getBuildingById(markerHit.id) || this.currentMapData?.buildings.find((b) => String(b.id) === String(markerHit.id)) || null;
        if (bldg) {
          this.buildingRenderer.setSelected(bldg.id);
          this.onSelectBuilding?.(bldg);
          return;
        }
      }
      if (markerHit.kind === 'vehicle') {
        this.selectedVehicleId = markerHit.id;
        if (this.onSelectVehicle) {
          this.onSelectVehicle(markerHit.id);
        }
        return;
      }
      if (markerHit.kind === 'squad') {
        this.selectedSquadId = markerHit.id;
        if (this.onSelectSquad) {
          this.onSelectSquad(markerHit.id);
        }
        return;
      }
    }

    // 1. Check if a Tactical Squad unit was clicked
    const squadHit = this.combatRenderer.raycastSquad(this.raycaster);
    if (squadHit) {
      this.selectedSquadId = squadHit;
      if (this.onSelectSquad) {
        this.onSelectSquad(squadHit);
      }
      return;
    }

    // 2. Check if a Vehicle was clicked
    const vehicleHit = this.vehicleRenderer.raycastVehicle(this.raycaster);
    if (vehicleHit) {
      this.selectedVehicleId = vehicleHit;
      if (this.onSelectVehicle) {
        this.onSelectVehicle(vehicleHit);
      }
      return;
    }

    // 3. Check physical resource nodes
    const resourceHit = this.resourceRenderer.raycastResource(this.raycaster);
    if (resourceHit) {
      this.onSelectResourceNode?.(resourceHit);
      this.onSelectBuilding?.(null);
      return;
    }

    // 4. Check if a building was clicked
    const buildingIntersects = this.raycaster.intersectObjects(this.buildingRenderer.group.children, true);

    if (buildingIntersects.length > 0) {
      const hit = buildingIntersects[0].object;
      const bldgId = hit.userData?.buildingId;
      if (bldgId !== undefined && bldgId !== null) {
        const bldg = this.buildingRenderer.getBuildingById(bldgId) || null;
        this.buildingRenderer.setSelected(bldg ? bldg.id : null);
        if (this.onSelectBuilding) {
          this.onSelectBuilding(bldg);
        }
        return;
      }
    }

    // 5. Clicked ground (Left-click / single tap: Selection only, NEVER move/attack order)
    const groundIntersects = this.raycaster.intersectObjects(this.groundRenderer.group.children, true);
    if (groundIntersects.length > 0) {
      const pt = groundIntersects[0].point;
      const position = { x: Math.round(pt.x * 10) / 10, z: Math.round(pt.z * 10) / 10 };

      // Spawn visual touch tap indicator on ground
      this.spawnTapFeedback(pt.x, pt.y, pt.z, 0xe2e8f0);

      this.buildingRenderer.setSelected(null);
      if (this.onSelectBuilding) {
        this.onSelectBuilding(null);
      }
      if (this.onSelectVehicle) {
        this.onSelectVehicle(null);
      }
      if (this.onSelectPosition) {
        this.onSelectPosition(position);
      }
    }
  }

  private executeTacticalOrderAtScreenPos(clientX: number, clientY: number) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check entity marker label hit first
    const markerHit = this.markerRenderer.raycastMarker(this.raycaster);
    const vehicleHit = (markerHit?.kind === 'vehicle' ? markerHit.id : null) || this.vehicleRenderer.raycastVehicle(this.raycaster);
    const zombieHit = (markerHit?.kind === 'zombie' ? markerHit.id : null) || this.combatRenderer.raycastZombie(this.raycaster);
    const squadHit = (markerHit?.kind === 'squad' ? markerHit.id : null) || this.combatRenderer.raycastSquad(this.raycaster);

    // 0. Right-clicking a vehicle = MOUNT order when a real squad is selected;
    //    otherwise select the vehicle (App redirects to its mounted squad if any).
    if (vehicleHit && this.selectedSquadId && this.onMountVehicle && this.selectedSquadId !== vehicleHit) {
      this.onMountVehicle(this.selectedSquadId, vehicleHit);
      return;
    }
    if (vehicleHit) {
      this.selectedVehicleId = vehicleHit;
      this.onSelectVehicle?.(vehicleHit);
      return;
    }

    // If no squad selected, right-clicking a squad selects it
    if (!this.selectedSquadId && squadHit) {
      this.selectedSquadId = squadHit;
      this.onSelectSquad?.(squadHit);
      return;
    }

    // Order target: the selected squad, or the selected vehicle (drives itself)
    let targetSquadId = this.selectedSquadId;
    if (!targetSquadId && this.selectedVehicleId) {
      targetSquadId = this.selectedVehicleId;
    }
    if (!targetSquadId) return;

    // 1.5 Check if clicked on a loot pin marker
    const lootHit = markerHit?.kind === 'loot_pin' ? markerHit.id : null;
    if (lootHit && this.onOrderSquadMove) {
      const bldg = this.buildingRenderer.getBuildingById(lootHit) || this.currentMapData?.buildings.find((b) => String(b.id) === String(lootHit));
      if (bldg) {
        // Preserve the exact point selected on the building surface. This lets
        // squads enter different parts of a structure instead of always routing
        // to its centroid, which is often outside irregular footprints.
        const hit = this.raycaster.intersectObjects(this.buildingRenderer.group.children, true)[0];
        const pt = hit?.point || new THREE.Vector3(bldg.center.x, 0, bldg.center.z);
        this.spawnTapFeedback(pt.x, pt.y, pt.z, 0x10b981);
        this.onOrderSquadMove(
          targetSquadId,
          {
            x: Math.round(pt.x * 10) / 10,
            z: Math.round(pt.z * 10) / 10,
          },
          bldg.id,
          bldg.name || bldg.type
        );
        return;
      }
    }

    // 2. Check if clicked on a hostile zombie or hostile human (Focus Fire Command)
    if (zombieHit && this.onOrderSquadAttack) {
      const zombieIntersects = this.raycaster.intersectObjects([
        ...this.combatRenderer.zombieGroup.children,
        ...this.combatRenderer.hostileHumanGroup.children,
      ], true);
      if (zombieIntersects.length > 0) {
        const pt = zombieIntersects[0].point;
        this.spawnTapFeedback(pt.x, pt.y, pt.z, 0xef4444);
      }
      this.onOrderSquadAttack(targetSquadId, zombieHit);
      return;
    }

    // 3. Check if clicked on a building (Enter / Move / Scavenge Command)
    const buildingIntersects = this.raycaster.intersectObjects(this.buildingRenderer.group.children, true);
    if (buildingIntersects.length > 0) {
      const hit = buildingIntersects[0].object;
      const bldgId = hit.userData?.buildingId;
      if (bldgId !== undefined && bldgId !== null) {
        const bldg = this.buildingRenderer.getBuildingById(bldgId);
        if (bldg && this.onOrderSquadMove) {
          // Use the actual raycast hit rather than the building centre so the
          // order can deliberately position a squad inside the structure.
          const hitPoint = buildingIntersects[0]?.point || new THREE.Vector3(bldg.center.x, 0, bldg.center.z);
          this.spawnTapFeedback(hitPoint.x, hitPoint.y, hitPoint.z, 0x10b981);
          this.onOrderSquadMove(
            targetSquadId,
            {
              x: Math.round(hitPoint.x * 10) / 10,
              z: Math.round(hitPoint.z * 10) / 10,
            },
            bldg.id,
            bldg.name || bldg.type
          );
          return;
        }
      }
    }

    // 4. Otherwise raycast ground & roads for Move Command
    const groundIntersects = this.raycaster.intersectObjects([
      ...this.groundRenderer.group.children,
      ...this.roadRenderer.group.children,
    ], true);

    if (groundIntersects.length > 0 && this.onOrderSquadMove) {
      const pt = groundIntersects[0].point;
      this.spawnTapFeedback(pt.x, pt.y, pt.z, 0x10b981);
      this.onOrderSquadMove(targetSquadId, {
        x: Math.round(pt.x * 10) / 10,
        z: Math.round(pt.z * 10) / 10,
      });
      return;
    }

    // 5. Fallback: Raycast infinite mathematical ground plane (y = 0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPos = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, hitPos) && this.onOrderSquadMove) {
      this.spawnTapFeedback(hitPos.x, 0, hitPos.z, 0x10b981);
      this.onOrderSquadMove(targetSquadId, {
        x: Math.round(hitPos.x * 10) / 10,
        z: Math.round(hitPos.z * 10) / 10,
      });
    }
  }

  /**
   * Translates a 2D viewport screen drag box into exact 3D world ground bounding coordinates
   * taking into account perspective camera angle, pitch, and zoom.
   */
  public screenRectToWorldBounds(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const rect = this.container.getBoundingClientRect();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const corners = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];
    const worldPoints: THREE.Vector3[] = [];
    const mouse = new THREE.Vector2();
    const ray = new THREE.Raycaster();

    for (const c of corners) {
      mouse.x = ((c.x - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((c.y - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(mouse, this.camera);
      const hitPos = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, hitPos)) {
        worldPoints.push(hitPos);
      }
    }

    if (worldPoints.length === 0) {
      return { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of worldPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    return { minX, maxX, minZ, maxZ };
  }

  public updateResourceAmounts(nodes: ResourceNode[]) {
    if (this.currentMapData) {
      this.currentMapData.resourceNodes = nodes;
    }
    this.resourceRenderer.updateNodeAmounts(nodes);
  }

  public setGatherHighlight(
    gatherType: 'wood' | 'metal' | 'bricks' | 'demolish' | null,
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null
  ) {
    if (!gatherType || !bounds || !this.currentMapData) {
      this.resourceRenderer.setHighlightedNodes([]);
      this.buildingRenderer.setDemolishCandidates(null);
      return;
    }

    const activeElevation = this.disableElevation ? null : this.currentMapData.elevation;
    const exaggeration = this.currentExaggeration;

    if (gatherType === 'demolish') {
      const candidateIds = new Set<string | number>();
      for (const b of this.currentMapData.buildings) {
        if (
          b.center.x >= bounds.minX &&
          b.center.x <= bounds.maxX &&
          b.center.z >= bounds.minZ &&
          b.center.z <= bounds.maxZ &&
          String(b.id) !== String(this.hqBuildingId)
        ) {
          candidateIds.add(b.id);
        }
      }
      this.buildingRenderer.setDemolishCandidates(candidateIds);
      this.resourceRenderer.setHighlightedNodes([]);
    } else {
      this.buildingRenderer.setDemolishCandidates(null);
      const selectedNodes = this.currentMapData.resourceNodes.filter(
        (n) =>
          n.type === gatherType &&
          n.amount > 0 &&
          n.position.x >= bounds.minX &&
          n.position.x <= bounds.maxX &&
          n.position.z >= bounds.minZ &&
          n.position.z <= bounds.maxZ
      );
      this.resourceRenderer.setHighlightedNodes(selectedNodes, activeElevation, exaggeration);
    }
  }

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault(); // Prevent default browser context menu
    if (this.pointerDragged) return; // If user dragged with right-click to rotate/elevate camera, do NOT execute squad order
    this.executeTacticalOrderAtScreenPos(e.clientX, e.clientY);
  };

  public setSelectedSquadId(squadId: string | null) {
    this.selectedSquadId = squadId;
    this.combatRenderer.setSelectedSquad(squadId);
  }

  public setSelectedVehicleId(vehicleId: string | null) {
    this.selectedVehicleId = vehicleId;
    this.vehicleRenderer.setSelectedVehicle(vehicleId);
  }

  public setScavengeView(active: boolean, filterType: string = 'all') {
    this.isScavengeViewActive = active;
    this.scavengeFilterType = filterType;
  }

  public setShowStreetLabels(active: boolean) {
    this.showStreetLabels = active;
    this.roadRenderer.setShowStreetLabels(active);
  }

  public setLabelDetailMode(mode: 'detailed' | 'minimal') {
    this.labelDetailMode = mode;
  }

  public setShowBuildingEdges(visible: boolean) {
    this.showBuildingEdges = visible;
    this.buildingRenderer.setEdgesVisible(visible);
  }

  public setSatelliteOverlay(active: boolean, quality?: SatelliteQuality) {
    this.satelliteOverlayActive = active;
    if (this.currentMapData) {
      this.groundRenderer.setSatelliteOverlay(active, quality, this.currentMapData.center, this.currentMapData.radius);
    }
    this.applySatelliteOverlayVisibility();
  }

  /**
   * While satellite imagery is shown the procedural map layers underneath are
   * hidden: road surface/curb/marking meshes (street name labels stay — they
   * read perfectly on top of aerial imagery) and all landuse polygons.
   */
  private applySatelliteOverlayVisibility() {
    this.roadRenderer.setMeshesVisible(!this.satelliteOverlayActive);
    this.groundRenderer.setLanduseVisible(!this.satelliteOverlayActive);
  }

  public updateCombat(
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
    this.gateTriggerSquads = squads
      .filter((s) => s.currentHp > 0)
      .map((s) => ({ x: s.x, z: s.z }));
    this.combatRenderer.updateState(
      zombies,
      squads,
      visualFx,
      selectedSquadId,
      droppedItems,
      hostileHumans,
      workers,
      constructionOrders
    );
  }

  public updateVehicles(
    vehicles: WorldVehicle[],
    selectedVehicleId: string | null
  ) {
    this.selectedVehicleId = selectedVehicleId;
    this.gateTriggerVehicles = vehicles.map((v) => ({ x: v.position.x, z: v.position.z }));
    this.vehicleRenderer.setSelectedVehicle(selectedVehicleId);
    this.vehicleRenderer.updateVehicles(
      vehicles,
      this.currentMapData?.elevation,
      this.currentExaggeration
    );
  }

  // ==========================================
  // Fog of War & Entity Markers (§3.5, §5.0)
  // ==========================================

  /**
   * Pause/unpause the simulation. While paused, all per-frame interpolation is
   * frozen at each entity's latest simulation position so nothing keeps moving
   * (or sliding its trail) after the player presses pause.
   */
  public setSimulationPaused(paused: boolean) {
    this.simulationPaused = paused;
    this.combatRenderer.setSimulationPaused(paused);
    this.vehicleRenderer.setSimulationPaused(paused);
    this.markerRenderer.setSimulationPaused(paused);
  }

  /**
   * Simulation clock speed (1/2/4) — forwarded to the combat renderer so worker
   * stride/harvest animation cadence scales with time speed.
   */
  public setClockSpeed(speed: number) {
    this.combatRenderer.setClockSpeed(speed);
  }

  public updateFogOfWar(
    fog: FogOfWarState,
    visibleCells: Set<number>,
    fogEnabled: boolean,
    visionSources: VisionSource[] = []
  ) {
    this.fogGrid = fog;
    this.visibleCells = visibleCells;
    this.fogEnabled = fogEnabled;

    const classify = (x: number, z: number) =>
      fogEnabled ? classifyPoint(fog, visibleCells, x, z) : 'visible';

    this.combatRenderer.applyFogVisibility((x, z) => classify(x, z) === 'visible');
    this.vehicleRenderer.applyFogVisibility((x, z) => classify(x, z) === 'visible');

    // Update the visual volumetric fog of war canopy & ground mist cutouts
    this.fogOfWarRenderer.updateVisionSources(visionSources, fogEnabled, fog);
  }

  public updateEntityMarkers(
    squads: TacticalSquadUnit[],
    vehicles: WorldVehicle[],
    hiddenGroups: Map<string | number, HiddenSurvivorGroup>,
    zombies: ZombieUnit[],
    mapData: MapData | null,
    fogEnabled: boolean,
    rivalHideouts?: Map<string | number, RivalHideout>,
    zombieLairs?: Map<string | number, ZombieLair>,
    resourceWorkOrders: ResourceWorkOrder[] = [],
    constructionOrders: ConstructionWorkOrder[] = [],
    buildingSearches?: Map<string | number, BuildingSearchState>
  ) {
    const safeHidden = toSafeMap<string | number, HiddenSurvivorGroup>(hiddenGroups);
    this.hiddenGroups = safeHidden;
    if (rivalHideouts) this.rivalHideouts = toSafeMap<string | number, RivalHideout>(rivalHideouts);
    if (zombieLairs) this.zombieLairs = toSafeMap<string | number, ZombieLair>(zombieLairs);

    const classify = (x: number, z: number) =>
      this.fogGrid && fogEnabled ? classifyPoint(this.fogGrid, this.visibleCells, x, z) : 'visible';

    const activeElevation = this.disableElevation ? null : this.currentMapData?.elevation;

    const markers: EntityMarker[] = [];
    const detail = this.labelDetailMode;

    // 1. Player squads — friendly rectangular badge, taller than wide, with activity, weapon, pips, walls
    for (const squad of squads) {
      if (!squad.isDeployed || squad.currentHp <= 0) continue;
      if (squad.mountedVehicleId) continue; // Mounted in vehicle: represented on vehicle marker
      if (classify(squad.x, squad.z) !== 'visible') continue;

      const squadElev = activeElevation ? sampleElevation(activeElevation, squad.x, squad.z, this.currentExaggeration) : 0;
      const insideBldg = mapData ? this.getBuildingAtPoint(mapData, squad.x, squad.z) : null;
      const topY = insideBldg ? this.getBuildingTopY(insideBldg.id) : 0;
      const anchorY = insideBldg ? Math.max(squadElev, topY) : squadElev;

      const alive = squad.members.filter((m) => m.isAlive).length;
      const bestWeaponObj = squad.members
        .filter((m) => m.isAlive)
        .sort((a, b) => (WEAPON_CATALOG[b.weaponId]?.tier ?? 0) - (WEAPON_CATALOG[a.weaponId]?.tier ?? 0))[0];
      const bestWeaponId = bestWeaponObj?.weaponId || '';
      
      let weaponType: import('./EntityMarkerRenderer').MarkerWeaponType = 'unarmed';
      const wid = bestWeaponId.toLowerCase();
      if (wid.includes('rifle') || wid.includes('sniper') || wid.includes('marksman') || wid.includes('carbine')) weaponType = 'rifle';
      else if (wid.includes('shotgun') || wid.includes('double_barrel')) weaponType = 'shotgun';
      else if (wid.includes('pistol') || wid.includes('revolver')) weaponType = 'pistol';
      else if (wid.includes('knife') || wid.includes('machete') || wid.includes('axe') || wid.includes('crowbar') || wid.includes('bat')) weaponType = 'melee';
      else if (wid.includes('rpg') || wid.includes('grenade') || wid.includes('launcher') || wid.includes('crossbow')) weaponType = 'heavy';
      else if (wid) weaponType = 'rifle';

      let activity: import('./EntityMarkerRenderer').MarkerActivity = 'idle';
      if (squad.state === 'combat' || squad.targetZombieId !== null || Boolean((squad as any).isInCombat)) activity = 'combat';
      else if (squad.searchProgress !== undefined && squad.searchProgress > 0) activity = 'scavenging';
      else if (squad.state === 'moving' || Boolean(squad.targetPos)) activity = 'moving';

      const isSelected = squad.squadId === this.selectedSquadId;
      const damageRatio = squad.maxHp > 0 ? Math.max(0, squad.currentHp / squad.maxHp) : 1;
      const squadNum = squad.name ? squad.name.replace(/[^0-9]/g, '') || squad.name.slice(0, 2) : '1';

      markers.push({
        key: `squad_${squad.squadId}`,
        kind: 'squad',
        faction: 'friendly',
        x: squad.x,
        z: squad.z,
        y: anchorY + 4.4,
        anchorY,
        label: squad.name,
        squadNumber: squadNum,
        isSelected,
        isMoving: activity === 'moving',
        isArmed: weaponType !== 'unarmed',
        memberCount: alive,
        maxMembers: squad.members.length,
        bestWeaponType: weaponType,
        bestWeaponName: bestWeaponId ? WEAPON_CATALOG[bestWeaponId]?.name : undefined,
        activity,
        damageRatio,
        searchProgress: squad.searchProgress,
        inBuilding: Boolean(insideBldg),
        detailMode: detail,
      });
    }

    // 2. Player vehicles — friendly if occupied/driven, neutral if parked
    for (const vehicle of vehicles) {
      if (vehicle.condition === 'wrecked') continue;
      if (classify(vehicle.position.x, vehicle.position.z) !== 'visible') continue;

      const vehElev = activeElevation ? sampleElevation(activeElevation, vehicle.position.x, vehicle.position.z, this.currentExaggeration) : 0;
      const insideBldg = mapData ? this.getBuildingAtPoint(mapData, vehicle.position.x, vehicle.position.z) : null;
      const topY = insideBldg ? this.getBuildingTopY(insideBldg.id) : 0;
      const anchorY = insideBldg ? Math.max(vehElev, topY) : vehElev;

      const mountedSquad = vehicle.assignedSquadId ? squads.find((s) => s.squadId === vehicle.assignedSquadId) : null;
      const isOccupied = Boolean(mountedSquad);
      const isSelected = vehicle.id === this.selectedVehicleId || Boolean(mountedSquad && mountedSquad.squadId === this.selectedSquadId);
      const isMoving = Boolean(vehicle.isMoving);
      const damageRatio = vehicle.maxHp > 0 ? Math.max(0, vehicle.currentHp / vehicle.maxHp) : 1;
      const mountedAlive = mountedSquad ? mountedSquad.members.filter((m) => m.isAlive).length : undefined;
      const vehNum = vehicle.name ? vehicle.name.replace(/[^0-9]/g, '') || vehicle.name.slice(0, 2) : 'V';

      markers.push({
        key: `vehicle_${vehicle.id}`,
        kind: 'vehicle',
        faction: isOccupied ? 'friendly' : 'neutral',
        x: vehicle.position.x,
        z: vehicle.position.z,
        y: anchorY + 3.2,
        anchorY,
        label: vehicle.name,
        squadNumber: vehNum,
        sublabel: mountedSquad ? mountedSquad.name : undefined,
        isSelected,
        isMoving,
        isOccupied,
        isArmed: isOccupied,
        memberCount: mountedAlive,
        maxMembers: mountedSquad ? mountedSquad.members.length : undefined,
        damageRatio,
        inBuilding: Boolean(insideBldg),
        detailMode: detail,
      });
    }

    // 4. Discovered survivor groups — orange unknown (? icon) until encountered, or red if hostile
    for (const group of safeHidden.values()) {
      if (!group.isDiscovered || group.isRecruited) continue;
      const bldg = mapData?.buildings.find((b) => String(b.id) === String(group.buildingId));
      if (!bldg) continue;
      if (classify(bldg.center.x, bldg.center.z) !== 'visible') continue;

      const topY = this.getBuildingTopY(bldg.id);
      const hostile = group.encounteredDisposition === 'hostile';
      markers.push({
        key: `survivor_${group.id}`,
        kind: 'survivor',
        faction: hostile ? 'hostile' : 'unknown',
        x: bldg.center.x,
        z: bldg.center.z,
        y: topY + 3.0,
        anchorY: topY,
        label: hostile ? 'HOSTILE' : '?',
        memberCount: (group as any).members?.length || 2,
        detailMode: detail,
      });
    }

    // 5. Zombie clusters — circular red badges with skull icon
    const clusters = this.clusterZombies(zombies);
    for (const cluster of clusters) {
      if (classify(cluster.x, cluster.z) !== 'visible') continue;
      const zElev = activeElevation ? sampleElevation(activeElevation, cluster.x, cluster.z, this.currentExaggeration) : 0;
      const insideBldg = mapData ? this.getBuildingAtPoint(mapData, cluster.x, cluster.z) : null;
      const topY = insideBldg ? this.getBuildingTopY(insideBldg.id) : 0;
      const anchorY = insideBldg ? Math.max(zElev, topY) : zElev;

      markers.push({
        key: `zombie_${cluster.key}`,
        kind: 'zombie',
        faction: 'hostile',
        x: cluster.x,
        z: cluster.z,
        y: anchorY + 4.6,
        anchorY,
        groupSize: cluster.size,
        damageRatio: cluster.damageRatio,
        detailMode: detail,
      });
    }

    // 6. Rival Hideouts (§5.2) — unfriendly NPC strongholds in red
    for (const hideout of this.rivalHideouts.values()) {
      if (!hideout.isDiscovered || hideout.isCleared) continue;
      const bldg = mapData?.buildings.find((b) => String(b.id) === String(hideout.buildingId));
      if (!bldg) continue;
      if (classify(bldg.center.x, bldg.center.z) !== 'visible') continue;

      const topY = this.getBuildingTopY(bldg.id);
      markers.push({
        key: `hideout_${hideout.id}`,
        kind: 'hideout',
        faction: 'hostile',
        x: bldg.center.x,
        z: bldg.center.z,
        y: topY + 3.0,
        anchorY: topY,
        label: hideout.factionName.toUpperCase(),
        memberCount: Math.min(6, Math.max(1, hideout.occupantCount)),
        damageRatio:
          hideout.initialOccupantCount > 0
            ? Math.max(0, Math.min(1, hideout.occupantCount / hideout.initialOccupantCount))
            : 1,
        detailMode: detail,
      });
    }

    // 7. Zombie Lairs (§5.2) — unfriendly NPC nests in round red badge
    for (const lair of this.zombieLairs.values()) {
      if (!lair.isDiscovered || lair.isCleared) continue;
      const bldg = mapData?.buildings.find((b) => String(b.id) === String(lair.buildingId));
      if (!bldg) continue;
      if (classify(bldg.center.x, bldg.center.z) !== 'visible') continue;

      const topY = this.getBuildingTopY(bldg.id);
      markers.push({
        key: `lair_${lair.id}`,
        kind: 'lair',
        faction: 'hostile',
        x: bldg.center.x,
        z: bldg.center.z,
        y: topY + 3.0,
        anchorY: topY,
        label: 'LAIR',
        damageRatio:
          lair.initialOccupantCount > 0
            ? Math.max(0, Math.min(1, lair.occupantCount / lair.initialOccupantCount))
            : 1,
        detailMode: detail,
      });
    }

    // 8. Construction crews — friendly workers traveling or building
    for (const order of constructionOrders) {
      if (classify(order.position.x, order.position.z) !== 'visible') continue;
      const cElev = activeElevation ? sampleElevation(activeElevation, order.position.x, order.position.z, this.currentExaggeration) : 0;
      const stateLabel =
        order.state === 'traveling'
          ? 'BUILD CREW (EN ROUTE)'
          : order.state === 'paused_materials'
          ? 'BUILDING (PAUSED: NO MATS)'
          : order.state === 'returning'
          ? 'BUILD CREW (RETURNING)'
          : `BUILDING: ${order.progress}%`;

      markers.push({
        key: `const_${order.id}`,
        kind: 'worker',
        faction: 'friendly',
        x: order.position.x,
        z: order.position.z,
        y: cElev + 3.2,
        anchorY: cElev,
        label: stateLabel,
        sublabel: `${order.workerCount} Workers • ${order.buildingName}`,
        groupSize: order.workerCount,
        isMoving: order.state === 'traveling' || order.state === 'returning',
        detailMode: detail,
      });
    }

    // 9. Resource gathering workers
    for (const order of resourceWorkOrders) {
      if (classify(order.position.x, order.position.z) !== 'visible') continue;
      const rElev = activeElevation ? sampleElevation(activeElevation, order.position.x, order.position.z, this.currentExaggeration) : 0;
      const stateLabel =
        order.state === 'moving_to_node'
          ? 'GATHER CREW (EN ROUTE)'
          : order.state === 'returning'
          ? 'RETURNING TO HQ'
          : `HARVESTING ${order.resourceType.toUpperCase()}`;

      markers.push({
        key: `gather_${order.id}`,
        kind: 'worker',
        faction: 'friendly',
        x: order.position.x,
        z: order.position.z,
        y: rElev + 3.2,
        anchorY: rElev,
        label: stateLabel,
        sublabel: `${order.workerCount} Workers`,
        groupSize: order.workerCount,
        isMoving: order.state === 'moving_to_node' || order.state === 'returning',
        detailMode: detail,
      });
    }

    // 10. Scavenge View Loot Pins (unscavenged buildings with item categories)
    if (this.isScavengeViewActive && this.precomputedLootPins.length > 0) {
      for (const pin of this.precomputedLootPins) {
        const searchState = buildingSearches?.get(pin.id) || buildingSearches?.get(String(pin.id));
        const isScavenged = searchState?.searched === true || (searchState?.unlootedItems && searchState.unlootedItems.length === 0 && searchState?.lootedItems && searchState.lootedItems.length > 0);
        if (isScavenged || classify(pin.x, pin.z) === 'unexplored') continue;

        if (this.scavengeFilterType !== 'all' && this.scavengeFilterType !== pin.cat) {
          continue;
        }

        markers.push({
          key: `loot_${pin.id}`,
          kind: 'loot_pin',
          faction: 'unknown',
          x: pin.x,
          z: pin.z,
          y: pin.topY + 4.2,
          anchorY: pin.topY,
          label: pin.label,
          lootCategory: pin.cat,
          lootCategories: searchState?.unlootedItems?.map((item) => item.label) || [pin.cat],
          buildingId: pin.id,
          detailMode: detail,
        });
      }
    } else if (this.isScavengeViewActive && mapData?.buildings) {
      for (const bldg of mapData.buildings) {
        const bldgIdStr = String(bldg.id);
        const searchState = buildingSearches?.get(bldg.id) || buildingSearches?.get(bldgIdStr);
        const isScavenged = searchState?.searched === true || (searchState?.unlootedItems && searchState.unlootedItems.length === 0 && searchState?.lootedItems && searchState.lootedItems.length > 0);
        if (isScavenged || classify(bldg.center.x, bldg.center.z) === 'unexplored') continue;

        const cat = getBuildingLootCategory(bldg);
        if (this.scavengeFilterType !== 'all' && this.scavengeFilterType !== cat) {
          continue;
        }

        const topY = this.getBuildingTopY(bldg.id);
        markers.push({
          key: `loot_${bldg.id}`,
          kind: 'loot_pin',
          faction: 'unknown',
          x: bldg.center.x,
          z: bldg.center.z,
          y: topY + 4.2,
          anchorY: topY,
          label: bldg.name || bldg.type || 'Structure',
          lootCategory: cat,
          lootCategories: searchState?.unlootedItems?.map((item) => item.label) || [cat],
          buildingId: bldg.id,
          detailMode: detail,
        });
      }
    }

    // 11. Street labels are rendered directly on the road surface by RoadRenderer (flat text with no boxes)

    this.markerRenderer.updateMarkers(markers);
  }

  private getBuildingAtPoint(mapData: MapData, x: number, z: number): BuildingPolygon | null {
    for (const bldg of mapData.buildings) {
      if (!bldg.polygon || bldg.polygon.length < 3) continue;
      let inside = false;
      const pts = bldg.polygon;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x;
        const zi = pts[i].z;
        const xj = pts[j].x;
        const zj = pts[j].z;
        const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
        if (intersect) inside = !inside;
      }
      if (inside) return bldg;
    }
    return null;
  }

  private isPointInsideAnyBuilding(mapData: MapData, x: number, z: number): boolean {
    return this.getBuildingAtPoint(mapData, x, z) !== null;
  }

  private getBuildingTopY(buildingId: string | number): number {
    const mesh = this.buildingRenderer.buildingMeshes.get(buildingId);
    if (mesh && mesh.geometry) {
      mesh.geometry.computeBoundingBox();
      const bbox = mesh.geometry.boundingBox;
      if (bbox) return mesh.position.y + bbox.max.y;
    }
    return 8;
  }

  private clusterZombies(zombies: ZombieUnit[]): {
    key: string;
    x: number;
    z: number;
    size: number;
    damageRatio: number;
  }[] {
    const alive = zombies.filter((z) => z.state !== 'dead' && z.currentHp > 0);
    if (alive.length === 0) return [];

    const CLUSTER_RADIUS = 26;
    const clusters: { key: string; members: ZombieUnit[]; sumX: number; sumZ: number }[] = [];

    for (const z of alive) {
      let target = clusters.find(
        (c) => Math.hypot(c.sumX / c.members.length - z.x, c.sumZ / c.members.length - z.z) <= CLUSTER_RADIUS
      );
      if (!target) {
        target = { key: z.id, members: [], sumX: 0, sumZ: 0 };
        clusters.push(target);
      }
      target.members.push(z);
      target.sumX += z.x;
      target.sumZ += z.z;
    }

    return clusters.map((c) => {
      const totalHp = c.members.reduce((s, z) => s + z.currentHp, 0);
      const totalMaxHp = c.members.reduce((s, z) => s + z.maxHp, 0);
      return {
        key: c.key,
        x: c.sumX / c.members.length,
        z: c.sumZ / c.members.length,
        size: c.members.length,
        damageRatio: totalMaxHp > 0 ? Math.max(0, Math.min(1, totalHp / totalMaxHp)) : 1,
      };
    });
  }

  public onWindowResize = () => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.fpsLastTime = this.lastTime;
    this.animate();
  }

  private animate = () => {
    if (!this.isRunning) return;
    this.animationFrameId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    // FPS calculation
    this.frameCount++;
    if (now - this.fpsLastTime >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.fpsLastTime));
      this.frameCount = 0;
      this.fpsLastTime = now;
    }

    // Update Camera and smoothly approach the latest simulation clock. This
    // prevents debug phase changes and React clock updates from snapping the
    // entire atmosphere/fog palette in one frame.
    this.cameraController.update(delta);
    const hourDelta = this.targetLightingHour - this.lightingHour;
    const wrappedDelta = Math.abs(hourDelta) > 12
      ? (hourDelta > 0 ? hourDelta - 24 : hourDelta + 24)
      : hourDelta;
    this.lightingHour = (this.lightingHour + wrappedDelta * Math.min(1, delta * 4) + 24) % 24;
    this.clockHour = this.lightingHour;
    this.applyContinuousLighting(this.lightingHour);

    // Update Ground water caustics & animations
    this.groundRenderer.update(delta, now / 1000);

    // Keep the satellite focal bands following the camera target (re-burn the
    // canvas around the view if the player has panned far enough).
    this.groundRenderer.setSatelliteFollowPoint(
      this.cameraController.target.x,
      this.cameraController.target.z
    );

    // Update Smoke & Construction Visuals
    this.smokeSystem.update(delta, now / 1000);

    // Update Volumetric Fog of War
    this.fogOfWarRenderer.update(delta, now / 1000);

    // Zoom-out LOD: swap the ~8.4k individual building meshes for the merged
    // overview meshes when the camera is high (hysteresis avoids flicker)
    const camY = this.camera.position.y;
    if (!this.buildingLodDistant && camY > 380) {
      this.buildingLodDistant = true;
      this.buildingRenderer.setLodMode('distant');
    } else if (this.buildingLodDistant && camY < 280) {
      this.buildingLodDistant = false;
      this.buildingRenderer.setLodMode('detailed');
    }

    // Update Combat & Zombies Animations
    this.combatRenderer.update(delta, now / 1000);

    // Animate gate doors — swing open as friendly squads/vehicles pass through
    this.buildingRenderer.update(delta, this.gateTriggerSquads.concat(this.gateTriggerVehicles));

    // Interpolate vehicle positions between simulation ticks
    this.vehicleRenderer.update(delta, now / 1000);

    // Update Entity Markers scale & faint tether lines for fixed-size zoom rendering
    this.markerRenderer.update(this.camera, this.container.clientHeight);

    // Animate tap feedback ring
    if (this.tapFeedbackMesh && this.tapFeedbackMesh.visible) {
      const elapsed = (performance.now() - this.tapFeedbackTime) / 1000;
      if (elapsed > 0.5) {
        this.tapFeedbackMesh.visible = false;
      } else {
        const progress = elapsed / 0.5;
        const currentScale = 0.5 + progress * 2.2;
        this.tapFeedbackMesh.scale.set(currentScale, currentScale, currentScale);
        (this.tapFeedbackMesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.9;
      }
    }

    // Update Sky Atmosphere position (follow camera) and celestial star animation
    this.skyAtmosphere.update(this.clockHour, this.camera.position, now / 1000);

    // Keep sun shadow camera aligned with target focus
    this.sunLight.target.position.copy(this.cameraController.target);

    // Render
    this.renderer.render(this.scene, this.camera);
  };

  public dispose() {
    this.isRunning = false;
    cancelAnimationFrame(this.animationFrameId);

    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('click', this.onClick);
    this.container.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('resize', this.onWindowResize);

    this.cameraController.dispose();
    this.buildingRenderer.dispose();
    this.roadRenderer.dispose();
    this.resourceRenderer.dispose();
    this.groundRenderer.dispose();
    this.fogOfWarRenderer.dispose();
    this.smokeSystem.dispose();
    this.markerRenderer.dispose();
    this.skyAtmosphere.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
