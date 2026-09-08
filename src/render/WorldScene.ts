import * as THREE from 'three';
import { CombatVisualFx, DroppedItem, HostileHumanUnit, TacticalSquadUnit, ZombieLair, ZombieUnit, getWeaponDefinition } from '../types/combat';
import { findPileAt, getStrandedLootOrderId } from '../services/strandedLootService';
import { BuildingPolygon, MapData, Point2D, ResourceNode, RoadSegment, WorldAreaBounds } from '../types/map';
import { isPointInArea } from '../services/scavengingService';
import { ResourceWorkOrder } from '../types/resourceGathering';
import { HiddenSurvivorGroup } from '../types/population';
import { RivalHideout } from '../types/rivalFaction';
import { BuildingOccupation } from '../types/occupation';
import { AdaptedBuilding, ConstructionWorkOrder, DeconstructionJob, FogOfWarState, FunctionalBuildingTypeId, SettlementState } from '../types/settlement';
import { PowerGridVisual, getPowerGridVisual } from '../services/powerService';
import { BuildingSearchState } from '../types/scavenging';
import { WorldVehicle } from '../types/vehicle';
import { classifyPoint } from '../services/fogOfWarService';
import { sampleElevation } from '../services/elevationService';
import { polygonArea, sweepFootprintSelection } from '../services/adaptationGeometry';
import { getAdaptedCost } from '../data/functionalBuildings';
import type { ResourceCost } from '../types/settlement';
import { getFreestandingDimensions, getFreestandingCollisionPolygon, freestandingFootprintOverlapsWater } from '../services/freestandingFootprint';
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
import { clusterZombies } from '../services/zombieClusterService';
import { WeatherFX } from './WeatherFX';
import type { WeatherType, MoonPhase } from '../types/weather';

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
    type === 'school' ||
    /industrial|warehouse|factory|hardware|timber|diy|works|depot|plant|storage|builder|school|university|college|academy|laboratory|research/i.test(name)
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
  // Midnight (0h / 24h): Dark but readable — cool desaturated blue-grey
  // ambient (~60% of noon) plus soft moonlight. Colours mute at night yet the
  // map stays legible; lit windows, floodlights and squad flashlights carry
  // the scene.
  { hour: 0, skyTop: 0x15202f, horizon: 0x33415a, fog: 0x33415a, fogDensity: 0.0006, ambient: 0x6b7c92, ambientIntensity: 0.46, hemiSky: 0x7789a2, hemiGround: 0x2a3444, hemiIntensity: 0.40, sunColor: 0xb9c9de, sunIntensity: 0.42, sunElevation: -0.15, sunAzimuth: -1.2 },
  // Late night / Pre-dawn (5h): Still dark, a hint of coming light
  { hour: 5, skyTop: 0x182234, horizon: 0x3a4860, fog: 0x3a4860, fogDensity: 0.0007, ambient: 0x71829a, ambientIntensity: 0.50, hemiSky: 0x7c8eaa, hemiGround: 0x2f3846, hemiIntensity: 0.42, sunColor: 0xbccadd, sunIntensity: 0.46, sunElevation: -0.05, sunAzimuth: -1.9 },
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
  // Nightfall (20.5h): Smooth transition into dark nocturnal greyscale
  { hour: 20.5, skyTop: 0x182234, horizon: 0x37455c, fog: 0x37455c, fogDensity: 0.0007, ambient: 0x71829a, ambientIntensity: 0.50, hemiSky: 0x7c8eaa, hemiGround: 0x2f3846, hemiIntensity: 0.42, sunColor: 0xbccadd, sunIntensity: 0.46, sunElevation: -0.05, sunAzimuth: 1.9 },
  // Midnight (24h)
  { hour: 24, skyTop: 0x15202f, horizon: 0x33415a, fog: 0x33415a, fogDensity: 0.0006, ambient: 0x6b7c92, ambientIntensity: 0.46, hemiSky: 0x7789a2, hemiGround: 0x2a3444, hemiIntensity: 0.40, sunColor: 0xb9c9de, sunIntensity: 0.42, sunElevation: -0.15, sunAzimuth: -1.2 },
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
  /**
   * Initial graphics quality preset. Applied at context creation: 'low' starts
   * without MSAA antialiasing (the largest single GPU saving) and with pixel
   * ratio capped at 1. Runtime quality changes can only alter pixel ratio,
   * shadows and culling — MSAA is fixed for the life of the GL context.
   */
  graphicsQuality?: import('../types/saveGame').GraphicsQuality;
  onSelectBuilding?: (building: BuildingPolygon | null) => void;
  onHoverBuilding?: (building: BuildingPolygon | null) => void;
  onSelectPosition?: (pos: Point2D) => void;
  onSelectSquad?: (squadId: string | null) => void;
  /** §IFZ CTRL+drag box selection: fired on release with every squad inside the rectangle. */
  onSelectSquads?: (squadIds: string[]) => void;
  onSelectResourceNode?: (node: import('../types/map').ResourceNode | null) => void;
  onSelectVehicle?: (vehicleId: string | null) => void;
  /** Clicking a discovered hidden-survivor group's '?' / HOSTILE marker. */
  onSelectSurvivorGroup?: (groupId: string | null) => void;
  /** Clicking a zombie cluster marker (or any zombie body) selects its cluster. */
  onSelectZombieCluster?: (clusterKey: string | null) => void;
  onOrderSquadMove?: (squadId: string, pos: Point2D, targetBuildingId?: string | number, targetBuildingName?: string) => void;
  onOrderSquadAttack?: (squadId: string, zombieId: string) => void;
  onMountVehicle?: (squadId: string, vehicleId: string) => void;
  onScavengeViewToggle?: (active: boolean) => void;
  onPlaceFreestandingRun?: (
    typeId: FunctionalBuildingTypeId,
    placements: FreestandingPlacementPoint[]
  ) => void;
  /**
   * §7.1 IFZ-style drag adaptation: fired when the player finishes a paint
   * sweep across a building's OWN footprint while a conversion type is armed.
   * `polygon` is the swept portion, clipped to the real building footprint and
   * measured in the building's local axis frame (never an arbitrary world
   * rectangle); a plain click (no meaningful drag) passes the whole footprint
   * so the caller can convert the entire structure.
   */
  onAdaptArea?: (
    typeId: FunctionalBuildingTypeId,
    bldg: BuildingPolygon,
    polygon: Point2D[]
  ) => void;
}

/** Clicking within this radius of a stranded pile dispatches a recovery order. */
const STRANDED_DISPATCH_RADIUS = 12;

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
  public weatherFX: WeatherFX;
  private currentWeather: WeatherType = 'clear';
  private currentMoonPhase: MoonPhase = 'full';
  private scratchWeather = new THREE.Color();

  // Interaction
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  /** Stranded field-loot piles (gatherer / demolition overflow) rendered as
   *  crates and orderable via right-click recovery. Refreshed every tick with
   *  updateEntityMarkers. */
  private strandedPiles: import('../types/settlement').FieldLootPile[] = [];
  private onSelectBuilding?: (building: BuildingPolygon | null) => void;
  private onHoverBuilding?: (building: BuildingPolygon | null) => void;
  private onSelectPosition?: (pos: Point2D) => void;
  private onSelectSquad?: (squadId: string | null) => void;
  private onSelectSquads?: (squadIds: string[]) => void;
  private onSelectResourceNode?: (node: import('../types/map').ResourceNode | null) => void;
  private onSelectVehicle?: (vehicleId: string | null) => void;
  private onSelectSurvivorGroup?: (groupId: string | null) => void;
  private onSelectZombieCluster?: (clusterKey: string | null) => void;
  private onOrderSquadMove?: (squadId: string, pos: Point2D, targetBuildingId?: string | number, targetBuildingName?: string, queue?: boolean) => void;
  private onOrderSquadAttack?: (squadId: string, zombieId: string) => void;
  private onMountVehicle?: (squadId: string, vehicleId: string) => void;
  public onScavengeViewToggle?: (active: boolean) => void;
  private onPlaceFreestandingRun?: (
    typeId: FunctionalBuildingTypeId,
    placements: FreestandingPlacementPoint[]
  ) => void;
  private onAdaptArea?: (
    typeId: FunctionalBuildingTypeId,
    bldg: BuildingPolygon,
    polygon: Point2D[]
  ) => void;

  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownTime = 0;
  private pointerType = 'mouse';
  private pointerDragged = false;
  private longPressTimer: number | null = null;

  // §IFZ CTRL+drag box selection: multi-squad selection state plus the
  // screen-space rectangle overlay that follows the drag.
  private selectedSquadIds = new Set<string>();
  private boxSelectActive = false;
  private boxSelectStartX = 0;
  private boxSelectStartY = 0;
  private boxSelectEl: HTMLDivElement | null = null;
  private tapFeedbackMesh: THREE.Mesh | null = null;
  private tapFeedbackTime = 0;

  private simulationPaused = false;

  private selectedSquadId: string | null = null;
  private selectedVehicleId: string | null = null;
  /** Latest squad list from updateCombat — used to resolve box-selection hits. */
  private liveSquads: TacticalSquadUnit[] = [];
  /** null = follow the day/night cycle; true/false = HUD flashlight toggle override. */
  private flashlightOverride: boolean | null = null;
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
  /** Latest sim zombie list — clicked bodies/clusters resolve against this. */
  private latestZombies: ZombieUnit[] = [];
  private rivalHideouts: Map<string | number, RivalHideout> = new Map();
  private zombieLairs: Map<string | number, ZombieLair> = new Map();
  private occupiedBuildings: Map<string | number, BuildingOccupation> = new Map();
  private deconstructionJobs: Map<string | number, DeconstructionJob> = new Map();
  private demolishedBuildings: Map<string | number, true> = new Map();

  // Power-grid overlay: translucent generator/battery reach discs plus a
  // floating status marker over every powered consumer (green = powered,
  // amber = in reach but shed, red = outside the live grid). Toggled from the
  // minimap Layers panel; refreshed whenever the settlement state changes.
  private showPowerGrid = false;
  private powerOverlayGroup = new THREE.Group();

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

  // §7.1 IFZ-style drag adaptation: while a conversion type is armed, pressing
  // on a building and dragging ACROSS ITS OWN FOOTPRINT paints the physical
  // portion to convert. The live preview is a translucent fill clipped to the
  // real footprint (floating at roof level) plus a % coverage readout; release
  // commits the painted region through onAdaptArea. A plain click converts the
  // whole building — full adaptation never requires drawing a box.
  private pendingAdaptType: FunctionalBuildingTypeId | null = null;
  private adaptDragActive = false;
  private adaptDragStart: THREE.Vector3 | null = null;
  private adaptDragBldg: BuildingPolygon | null = null;
  /** Sweep axis (building-long vs cross-section) latched for this gesture. */
  private adaptPaintAlongLong = true;
  private adaptAxisLocked = false;
  /** Full-size material cost of the armed conversion for the pressed building
   *  (size-derived §Terminus economics), shown live next to the % readout. */
  private adaptPaintFullCost: ResourceCost | null = null;
  /** Live paint preview: footprint-clipped fill + outline + % readout pill. */
  private adaptPaintGroup: THREE.Group = new THREE.Group();
  private adaptPaintFill: THREE.Mesh | null = null;
  private adaptPaintEdge: THREE.LineSegments | null = null;
  private adaptPaintReadout: HTMLDivElement | null = null;
  private adaptReadoutHideTimer: number | null = null;


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

  // Lightweight perf HUD: a plain DOM overlay updated once per second (no
  // React involvement, so measuring costs nothing). Toggle with F9 or
  // `__terminusScene.togglePerfHud()` in the console. Hidden by default.
  private perfHud: HTMLDivElement | null = null;
  private perfHudVisible = false;
  private msaaEnabled = true;
  private frameMsAccum = 0;
  private frameMsSamples = 0;
  private frameMsAvg = 16.7;

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'F9') {
      e.preventDefault();
      this.togglePerfHud();
    }
  };

  /** Show/hide the FPS / draw-call / triangle profiler overlay. */
  public togglePerfHud(force?: boolean) {
    this.perfHudVisible = force ?? !this.perfHudVisible;
    if (this.perfHud) this.perfHud.style.display = this.perfHudVisible ? 'block' : 'none';
    if (this.perfHudVisible) this.updatePerfHud();
  }

  /** Refreshes the perf HUD text (called ~1 Hz from animate, never per frame). */
  private updatePerfHud() {
    if (!this.perfHudVisible || !this.perfHud) return;
    const info = this.renderer.info;
    const counts = this.combatRenderer.getEntityCounts();
    const lines = [
      `FPS ${this.fps}   frame ${this.frameMsAvg.toFixed(1)}ms`,
      `calls ${info.render.calls}   tris ${info.render.triangles.toLocaleString()}`,
      `geo ${info.memory.geometries}   tex ${info.memory.textures}   prog ${info.programs?.length ?? 0}`,
      `dpr ${this.renderer.getPixelRatio().toFixed(2)}   quality ${this.graphicsQuality}   msaa ${this.msaaEnabled ? 'on' : 'off'}`,
      `units ${counts.squads}s/${counts.workers}w/${counts.zombies}z/${counts.hostiles}h   bb ${this.combatRenderer.billboardCount}   rigLodSkips/f ${this.combatRenderer.rigLodSkips}`,
    ];
    this.perfHud.textContent = lines.join('\n');
  }

  // Bumped on every loadMapData so a stale progressive build (triggered before a
  // newer map payload arrived) can detect it aborted and stop adding meshes.
  private loadGeneration = 0;

  // Uniform-grid spatial index over the current map's buildings for O(cells)
  // point-in-building queries. Rebuilt only on map load; queried at sim-tick
  // frequency by the marker/label phase (previously a linear O(N) scan per
  // query, which at 1,600+ buildings × 10 Hz dominated the frame budget).
  private buildingIndex: {
    cellSize: number;
    minX: number;
    minZ: number;
    cols: number;
    rows: number;
    cells: Map<number, BuildingPolygon[]>;
  } | null = null;
  private buildingById: Map<string, BuildingPolygon> = new Map();
  private lastMarkerBuildAt = 0;

  // §Graphics quality presets. 'high' = full detail always; 'medium'/'low'
  // cull full-detail buildings beyond a camera-distance radius and drop
  // shadow quality. Radii scale with zoom so panning never pops buildings in
  // and out at the view centre.
  private graphicsQuality: import('../types/saveGame').GraphicsQuality = 'high';
  private qualityLodScale = 1.0;   // altitude-LOD threshold multiplier
  private detailCullRadius = 0;    // 0 = disabled (high preset)
  private detailCullAccum = 0;
  private detailCullActive = false;

  constructor(options: WorldSceneOptions) {
    this.container = options.container;
    this.onSelectBuilding = options.onSelectBuilding;
    this.onHoverBuilding = options.onHoverBuilding;
    this.onSelectPosition = options.onSelectPosition;
    this.onSelectSquad = options.onSelectSquad;
    this.onSelectSquads = options.onSelectSquads;
    this.onSelectResourceNode = options.onSelectResourceNode;
    this.onSelectVehicle = options.onSelectVehicle;
    this.onSelectSurvivorGroup = options.onSelectSurvivorGroup;
    this.onSelectZombieCluster = options.onSelectZombieCluster;
    this.onOrderSquadMove = options.onOrderSquadMove;
    this.onOrderSquadAttack = options.onOrderSquadAttack;
    this.onMountVehicle = options.onMountVehicle;
    this.onPlaceFreestandingRun = options.onPlaceFreestandingRun;
    this.onAdaptArea = options.onAdaptArea;

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

    // 3. Renderer. Antialias is fixed at context creation and keyed off the
    // initial quality preset — 'low' runs without MSAA. Later quality switches
    // can only change pixel ratio, shadows and culling (see setGraphicsQuality).
    this.graphicsQuality = options.graphicsQuality ?? 'high';
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.graphicsQuality !== 'low',
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
    this.renderer.setSize(width, height);
    this.applyQualityPixelRatio();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.msaaEnabled = this.graphicsQuality !== 'low';

    // Perf HUD overlay (hidden by default, F9 toggles). Plain DOM element —
    // deliberately outside React so its cost is a 1 Hz textContent write.
    this.perfHud = document.createElement('div');
    this.perfHud.style.cssText = [
      'position:absolute',
      'top:8px',
      'left:8px',
      'z-index:60',
      'display:none',
      'pointer-events:none',
      'white-space:pre',
      'font:11px/1.5 ui-monospace,Consolas,monospace',
      'color:#7df0c0',
      'background:rgba(6,10,12,0.78)',
      'border:1px solid rgba(125,240,192,0.25)',
      'border-radius:4px',
      'padding:6px 9px',
      'text-shadow:0 1px 2px rgba(0,0,0,0.8)',
    ].join(';');
    this.container.appendChild(this.perfHud);
    window.addEventListener('keydown', this.onKeyDown);

    this.container.appendChild(this.renderer.domElement);

    // Debug/perf handle: lets tooling and the console read renderer stats
    // (draw calls, triangles) and toggle quality knobs live.
    (window as unknown as Record<string, unknown>).__terminusScene = this;

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

    // 4c. Weather visuals (rain, snow, cloud canopy, lightning) + weather lighting
    this.weatherFX = new WeatherFX();
    this.scene.add(this.weatherFX.group);

    // 5. Initialize Sub-renderers
    this.groundRenderer = new GroundRenderer();
    // One authoritative "terrain as rendered" sampler shared by every layer
    // that must sit ON the visible ground. The terrain draws linear triangles
    // between ~20m vertices; the smooth analytic elevation can sit meters
    // BELOW those chords on slopes, which buried building bottoms, floated
    // landuse over walls and sank roads/resources/units.
    const terrainSurfaceSampler = (x: number, z: number) =>
      this.groundRenderer.sampleTerrainSurface(x, z);
    this.roadRenderer = new RoadRenderer();
    this.roadRenderer.setTerrainSurfaceSampler(terrainSurfaceSampler);
    this.buildingRenderer = new BuildingRenderer();
    this.buildingRenderer.setTerrainSurfaceSampler(terrainSurfaceSampler);
    this.resourceRenderer = new ResourceRenderer();
    this.fogOfWarRenderer = new FogOfWarRenderer();
    this.smokeSystem = new SmokeParticleSystem();
    this.combatRenderer = new CombatRenderer();
    // Rig-pose distance LOD needs the camera to cull far-entity limb updates.
    this.combatRenderer.setCamera(this.camera);
    this.combatRenderer.setTerrainSurfaceSampler(terrainSurfaceSampler);
    this.vehicleRenderer = new VehicleRenderer();
    this.vehicleRenderer.setTerrainSurfaceSampler(terrainSurfaceSampler);
    this.markerRenderer = new EntityMarkerRenderer();
    this.resourceRenderer.setTerrainSurfaceSampler(terrainSurfaceSampler);

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

    // §7.1 drag-adaptation paint preview: a translucent polygon rebuilt on
    // every pointermove showing the portion of the footprint being painted,
    // with a crisp outline, floating just above the building's roof so the
    // coverage reads against the structure itself (never a map rectangle).
    this.adaptPaintFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.adaptPaintFill.rotation.x = -Math.PI / 2;
    this.adaptPaintEdge = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.95 })
    );
    this.adaptPaintEdge.rotation.x = -Math.PI / 2;
    this.adaptPaintGroup.add(this.adaptPaintFill);
    this.adaptPaintGroup.add(this.adaptPaintEdge);
    this.adaptPaintGroup.visible = false;
    this.scene.add(this.adaptPaintGroup);

    // Power-grid overlay group (added last so it renders above terrain/buildings).
    this.powerOverlayGroup.name = 'PowerOverlayGroup';
    this.powerOverlayGroup.visible = false;
    this.scene.add(this.powerOverlayGroup);

    // 6. Event listeners
    this.container.addEventListener('pointerdown', this.onPointerDown);
    this.container.addEventListener('pointermove', this.onPointerMove);
    this.container.addEventListener('pointerup', this.onPointerUp);
    this.container.addEventListener('click', this.onClick);
    this.container.addEventListener('contextmenu', this.onContextMenu);
    // A CTRL+drag released OUTSIDE the scene (cursor escaped the container)
    // must not leave the box-select active or the camera locked — clear it.
    window.addEventListener('pointerup', this.onWindowPointerUp);
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
    this.buildingById = new Map(
      (mapData.buildings || []).map((b) => [String(b.id), b])
    );
    this.buildingIndex = this.buildSpatialIndex(mapData.buildings || []);
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

  /**
   * Toggle the power-grid overlay (generator/battery reach + powered/shed
   * consumer markers). Pass the settlement so turning it on paints instantly;
   * otherwise it appears on the next state push via updatePowerOverlay.
   */
  public setPowerGridOverlay(visible: boolean, settlement: SettlementState | null = null) {
    this.showPowerGrid = visible;
    if (settlement) this.updatePowerOverlay(settlement);
    this.powerOverlayGroup.visible = visible && !!this.currentMapData;
  }

  /** Refresh the power-grid overlay from the latest settlement allocation. */
  public updatePowerOverlay(settlement: SettlementState) {
    if (!this.showPowerGrid || !this.currentMapData) return;
    this.renderPowerOverlay(getPowerGridVisual(settlement));
    this.powerOverlayGroup.visible = true;
  }

  private clearPowerOverlay() {
    while (this.powerOverlayGroup.children.length > 0) {
      const mesh = this.powerOverlayGroup.children[0] as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) if (m) m.dispose();
      this.powerOverlayGroup.remove(mesh);
    }
  }

  private renderPowerOverlay(visual: PowerGridVisual) {
    this.clearPowerOverlay();
    const elevation = this.disableElevation ? null : (this.currentMapData?.elevation ?? null);
    const groundY = (x: number, z: number) =>
      elevation ? sampleElevation(elevation, x, z, this.currentExaggeration) : 0;
    const flatMesh = (
      geo: THREE.BufferGeometry,
      color: number,
      opacity: number,
      y: number
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      return mesh;
    };

    // 1. Generator reach discs — bright amber rim while running (Advanced
    // Power Systems reach included via the record's powerRadiusM), grey when
    // the tank is dry so an outage is visible at a glance.
    for (const g of visual.generators) {
      const y = groundY(g.x, g.z) + 0.5;
      const on = g.running;
      const disc = flatMesh(
        new THREE.CircleGeometry(g.radiusM, 96),
        on ? 0xf59e0b : 0x94a3b8,
        on ? 0.09 : 0.04,
        y
      );
      disc.position.set(g.x, y, g.z);
      const rim = flatMesh(
        new THREE.RingGeometry(Math.max(1.2, g.radiusM - 1.4), g.radiusM, 96),
        on ? 0xfbbf24 : 0x64748b,
        on ? 0.55 : 0.3,
        y + 0.05
      );
      rim.position.set(g.x, y, g.z);
      this.powerOverlayGroup.add(disc, rim);
    }

    // 2. Battery reach — GRID EXTENSION / EMERGENCY RESERVE. A charged bank is
    // NOT a generator: instead of a solid supply ring it paints a soft reserve
    // footprint with a DASHED cyan boundary, so it reads as "backup reach"
    // rather than live generation. While the bank is actually feeding the grid
    // the dashes fuse into a bright, near-solid arc.
    for (const b of visual.batteries) {
      if (b.storedKwh <= 0) continue;
      const y = groundY(b.x, b.z) + 0.5;
      const feeding = b.discharging;
      const disc = flatMesh(
        new THREE.CircleGeometry(b.radiusM, 96),
        0x22d3ee,
        feeding ? 0.1 : 0.05,
        y
      );
      disc.position.set(b.x, y, b.z);
      this.powerOverlayGroup.add(disc);
      // Dashed ring: 14 short arcs with gaps (armed), near-continuous when
      // discharging. Arc span mirrors "this reach is on standby vs live now".
      const dashCount = 14;
      const pitch = (2 * Math.PI) / dashCount;
      const drawn = feeding ? 0.92 : 0.5; // fraction of each pitch actually drawn
      for (let i = 0; i < dashCount; i++) {
        const seg = flatMesh(
          new THREE.RingGeometry(
            Math.max(1.2, b.radiusM - 1.4),
            b.radiusM,
            10,
            1,
            i * pitch,
            pitch * drawn
          ),
          feeding ? 0x67e8f9 : 0x22d3ee,
          feeding ? 0.85 : 0.4,
          y + 0.05
        );
        seg.position.set(b.x, y, b.z);
        this.powerOverlayGroup.add(seg);
      }
    }

    // 3. Consumer status markers — only while grid infrastructure exists, so a
    // settlement with no power plant isn't covered in red dots. A coloured
    // pillar floats off the roof: green = powered this tick, amber = inside a
    // live radius but shed (not enough supply / fuel), red = outside the grid.
    if (!visual.hasInfrastructure) return;
    for (const c of visual.consumers) {
      const roofY = this.getBuildingTopY(c.meshId);
      const statusColor = c.powered ? 0x22c55e : c.inReach ? 0xf59e0b : 0xef4444;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 1.5, 5.4, 10),
        new THREE.MeshBasicMaterial({
          color: statusColor,
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
        })
      );
      pillar.position.set(c.x, roofY + 3.2, c.z);
      pillar.renderOrder = 80;
      this.powerOverlayGroup.add(pillar);
      // Flat ring around the pillar base on the roof so the marker reads even
      // edge-on from a shallow camera angle.
      const ring = flatMesh(
        new THREE.RingGeometry(2.4, 3.6, 28),
        statusColor,
        0.8,
        roofY + 0.4
      );
      ring.position.set(c.x, roofY + 0.4, c.z);
      ring.renderOrder = 80;
      this.powerOverlayGroup.add(ring);
    }
  }

  /**
   * §Graphics quality presets.
   *
   * - **high** — everything renders, distance culling off (pixel ratio cap 2).
   * - **medium** — pixel ratio capped at 1.5, shadows off beyond 140m camera
   *   distance, full-detail buildings culled beyond ~2.6× camera distance,
   *   and the merged-city LOD swaps in at a lower altitude.
   * - **low** — pixel ratio capped at 1, shadows disabled entirely, detail
   *   cull radius ~1.7× camera distance, merged LOD swaps in even lower.
   *
   * Cull radii track the camera's focus distance, so the buildings the player
   * is actually looking at always render full detail and only the horizon
   * thins out. Toggling this at runtime is safe: culled meshes keep their
   * state and `restoreAllDetailVisibility()` un-hides everything on upgrade.
   */
  /**
   * Applies the quality preset's device-pixel-ratio cap. Called at context
   * creation (so the initial preset takes effect before GameCanvas's effect
   * runs) and on every runtime quality switch.
   */
  private applyQualityPixelRatio() {
    switch (this.graphicsQuality) {
      case 'low':
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
        break;
      case 'medium':
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        break;
      case 'high':
      default:
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        break;
    }
  }

  public setGraphicsQuality(quality: import('../types/saveGame').GraphicsQuality) {
    if (this.graphicsQuality === quality) return;
    this.graphicsQuality = quality;

    switch (quality) {
      case 'low':
        this.qualityLodScale = 0.45;
        this.detailCullRadius = 1.7;
        this.sunLight.castShadow = false;
        this.buildingRenderer.setEdgesVisible(false);
        break;
      case 'medium':
        this.qualityLodScale = 0.72;
        this.detailCullRadius = 2.6;
        this.sunLight.castShadow = true;
        this.buildingRenderer.setEdgesVisible(this.showBuildingEdges);
        break;
      case 'high':
      default:
        this.qualityLodScale = 1.0;
        this.detailCullRadius = 0;
        this.sunLight.castShadow = true;
        this.buildingRenderer.setEdgesVisible(this.showBuildingEdges);
        break;
    }
    this.applyQualityPixelRatio();
  }

  /**
   * Hides full-detail building bodies beyond `detailCullRadius × camera
   * distance` from the camera focus point. Runs at 4 Hz — far cheaper than
   * per-frame, and pop-in at the cull horizon is masked by fog + distance.
   * Roof meshes ride along with their body; the selected/hovered building is
   * always kept visible so interaction never breaks.
   */
  private applyDistanceDetailCull() {
    const mapData = this.currentMapData;
    if (!mapData || this.detailCullRadius <= 0) return;
    const focus = this.cameraController.target;
    const radius = this.cameraController.distance * this.detailCullRadius;
    const r2 = radius * radius;
    let anyCulled = false;

    for (const [id, mesh] of this.buildingRenderer.buildingMeshes) {
      const bldg = this.buildingRenderer.getBuildingById(id);
      if (!bldg) continue;
      const dx = bldg.center.x - focus.x;
      const dz = bldg.center.z - focus.z;
      const within = dx * dx + dz * dz <= r2;
      const keep = within || String(id) === String(this.buildingRenderer.getSelectedId());
      if (mesh.visible !== keep) {
        mesh.visible = keep;
        anyCulled = true;
      }
      const roof = this.buildingRenderer.getRoofMesh(id);
      if (roof && roof.visible !== keep) roof.visible = keep;
    }
    this.detailCullActive = anyCulled || this.detailCullActive;
  }

  public setDisableElevation(disable: boolean) {
    if (this.disableElevation === disable || !this.currentMapData) return;
    this.disableElevation = disable;
    const activeElevation = disable ? null : this.currentMapData.elevation;
    this.combatRenderer.setElevation(activeElevation, this.currentExaggeration);
    this.vehicleRenderer.setElevation(activeElevation, this.currentExaggeration);
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

  /**
   * Feed the simulation's current weather + moon phase into the scene so it is
   * visually represented: rain/snow particles, overcast cloud canopy, lightning,
   * moon phase sprite and weather-tinted fog/lighting.
   */
  public setWeather(weather: WeatherType, moonPhase?: MoonPhase) {
    this.currentWeather = weather || 'clear';
    if (moonPhase) this.currentMoonPhase = moonPhase;
    this.weatherFX.setWeather(this.currentWeather, this.currentMoonPhase);
    this.skyAtmosphere.setMoonPhase(this.currentMoonPhase);
    // Barriers weather with the sky: rain raises puddle grime up their bases,
    // snow caps their tops (rebuild only when the look actually changes).
    const rain = weather === 'rain' || weather === 'thunderstorm' ? 1 : 0;
    const snow = weather === 'blizzard' || weather === 'freezing_frost' ? 1 : 0;
    this.buildingRenderer.setBarrierWeather(snow, rain);
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

    // Weather modulation: cloud dimming, fog scale/tint, lightning flash boost
    // and moon phase brightness applied to the day/night baseline.
    const weatherDim = this.weatherFX.getDim();
    const lightning = this.weatherFX.getLightning();
    const flashBoost = lightning * 1.6;
    const moonPhaseBrightness = this.skyAtmosphere.getMoonPhaseBrightness();
    // Full moons light the colony at night; new moons leave it near-black.
    const moonDim = 1 - (1 - moonPhaseBrightness) * 0.35;

    // Celestial atmosphere, scene background & atmospheric fog
    const topCol = this.scratchA.setHex(k0.skyTop).clone().lerp(this.scratchB.setHex(k1.skyTop), t);
    const horizCol = this.scratchA.setHex(k0.horizon).clone().lerp(this.scratchB.setHex(k1.horizon), t);
    const sunCol = this.scratchA.setHex(k0.sunColor).clone().lerp(this.scratchB.setHex(k1.sunColor), t);
    const moonCol = new THREE.Color(0xa5c4e8);

    // Weather sky tint (overcast grey, storm slate, heat haze, snow white)
    const skyTintWeight = this.weatherFX.getSkyTintWeight();
    if (skyTintWeight > 0.001) {
      this.weatherFX.getSkyTint(this.scratchWeather);
      topCol.lerp(this.scratchWeather, 0.35 * skyTintWeight);
      horizCol.lerp(this.scratchWeather, 0.55 * skyTintWeight);
    }

    this.skyAtmosphere.setSkyColors(topCol, horizCol, sunCol, moonCol);
    // Dome clouds + star occlusion follow the eased weather cloud cover.
    this.skyAtmosphere.setCloudCover(this.weatherFX.getCloudCover());
    this.skyAtmosphere.update(h, this.camera.position, performance.now() / 1000);

    const sceneBg = this.scene.background instanceof THREE.Color ? this.scene.background : null;
    if (sceneBg) this.lerpColor(sceneBg, k0.horizon, k1.horizon, t);
    if (sceneBg && skyTintWeight > 0.001) {
      this.weatherFX.getSkyTint(this.scratchWeather);
      sceneBg.lerp(this.scratchWeather, 0.4 * skyTintWeight);
    }
    this.lerpColor(this.fog.color, k0.fog, k1.fog, t);
    this.fog.density = mix(k0.fogDensity, k1.fogDensity) * this.weatherFX.getFogScale();

    // Weather fog tint (rain blue-grey, smoke haze, blizzard white)
    const fogTintWeight = this.weatherFX.getFogTintWeight();
    if (fogTintWeight > 0.001) {
      this.weatherFX.getFogTint(this.scratchWeather);
      this.fog.color.lerp(this.scratchWeather, 0.55 * fogTintWeight);
    }

    // Ambient, hemisphere & sun — dimmed by cloud cover, boosted by lightning,
    // and at night scaled by moon phase brightness.
    this.lerpColor(this.ambientLight.color, k0.ambient, k1.ambient, t);
    this.ambientLight.intensity = mix(k0.ambientIntensity, k1.ambientIntensity)
      * (1 - weatherDim * 0.55)
      * (k1.sunElevation < 0.05 ? moonDim : 1)
      + flashBoost * 0.35;
    this.lerpColor(this.hemiLight.color, k0.hemiSky, k1.hemiSky, t);
    this.lerpColor(this.hemiLight.groundColor, k0.hemiGround, k1.hemiGround, t);
    this.hemiLight.intensity = mix(k0.hemiIntensity, k1.hemiIntensity)
      * (1 - weatherDim * 0.45)
      * (k1.sunElevation < 0.05 ? moonDim : 1)
      + flashBoost * 0.25;
    this.lerpColor(this.sunLight.color, k0.sunColor, k1.sunColor, t);
    this.sunLight.intensity = mix(k0.sunIntensity, k1.sunIntensity)
      * (1 - weatherDim * 0.85)
      + flashBoost;

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

    // Squad flashlights ramp on as night falls and off after dawn; the eased
    // factor scales the beam so torches fade in rather than snapping on. The
    // HUD toggle overrides the automatic behaviour (forced on = min 50% beam,
    // forced off = dark).
    const nightFactor = Math.max(0, (nightGlow - 0.08) / 0.92);
    let flashFactor = nightFactor;
    if (this.flashlightOverride !== null) {
      flashFactor = this.flashlightOverride ? Math.max(0.5, nightFactor) : 0;
    }
    this.combatRenderer.setFlashlightIntensity(flashFactor);
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

    // §7.1 Armed conversion: pointer-down on a building anchors a paint sweep
    // across that building's OWN footprint. The camera is locked while dragging
    // so the painted band stays anchored to the building (same as freestanding
    // placement); release commits the swept portion.
    if (this.pendingAdaptType && e.button === 0) {
      const rect = this.container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const buildingHits = this.raycaster.intersectObjects(this.buildingRenderer.group.children, true);
      if (buildingHits.length > 0) {
        const bldgId = buildingHits[0].object.userData?.buildingId;
        const bldg = bldgId !== undefined && bldgId !== null
          ? this.buildingRenderer.getBuildingById(bldgId) || null
          : null;
        if (bldg && bldg.polygon && bldg.polygon.length >= 3) {
          const groundHits = this.raycaster.intersectObjects(this.groundRenderer.group.children, true);
          const ground = groundHits.length > 0 ? groundHits[0].point : buildingHits[0].point;
          this.adaptDragActive = true;
          this.adaptDragBldg = bldg;
          this.adaptDragStart = new THREE.Vector3(ground.x, ground.y, ground.z);
          this.adaptAxisLocked = false;
          this.adaptPaintAlongLong = true;
          // §Terminus economics: the price shown while painting is the real,
          // size-derived cost for THIS structure (footprint × height × share).
          this.adaptPaintFullCost = getAdaptedCost(
            this.pendingAdaptType as FunctionalBuildingTypeId,
            bldg.type,
            polygonArea(bldg.polygon),
            bldg.height
          );
          this.cameraController.placementActive = true;
          this.updateAdaptPaint(ground.x, ground.z, e.clientX, e.clientY);
          return;
        }
      }
    }

    // §IFZ CTRL+drag box selection: pressing CTRL (or CMD on macOS) with the
    // left button drags a selection rectangle over squads. The camera is
    // locked while the gesture is active so the box stays put.
    if (e.button === 0 && (e.ctrlKey || e.metaKey) && !this.pendingFreestandingType && !this.pendingAdaptType) {
      this.boxSelectActive = true;
      this.boxSelectStartX = e.clientX;
      this.boxSelectStartY = e.clientY;
      this.cameraController.placementActive = true;
      this.showBoxSelectRect(e.clientX, e.clientY, e.clientX, e.clientY);
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

    // §IFZ CTRL+drag box selection — stretch the rectangle from the anchor to
    // the live cursor. Everything else (hover, camera) is suspended while the
    // gesture owns the pointer.
    if (this.boxSelectActive) {
      this.showBoxSelectRect(this.boxSelectStartX, this.boxSelectStartY, e.clientX, e.clientY);
      return;
    }

    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // §7.1 Drag-adaptation: paint the footprint-clipped band from the anchor to
    // the live cursor, relative to the building's own local axes, and refresh
    // the % readout so the player sees exactly what will be converted.
    if (this.adaptDragActive && this.adaptDragStart) {
      const groundHits = this.raycaster.intersectObjects(this.groundRenderer.group.children, true);
      if (groundHits.length > 0) {
        this.updateAdaptPaint(groundHits[0].point.x, groundHits[0].point.z, e.clientX, e.clientY);
      }
      return;
    }

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
   * given rotation, genuinely collides with open water (corner/edge crossing
   * the waterline beyond the grazing tolerance). Shared with the commit path in
   * useSettlementActions so the red ghost exactly predicts rejected placement.
   */
  private isPlacementOverWater(x: number, z: number, rotDeg: number): boolean {
    const type = this.pendingFreestandingType;
    if (!type) return false;
    const dims = getFreestandingDimensions(type);
    return freestandingFootprintOverlapsWater(
      { typeId: type, position: { x, z }, rotationDeg: rotDeg, width: dims.width, length: dims.length },
      this.waterPolygons
    );
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

    // §IFZ CTRL+drag box selection: on release, select every deployed squad
    // whose on-screen position falls inside the rectangle. A ctrl+CLICK (no
    // meaningful drag) falls through to the normal click path (which adds the
    // clicked squad to the selection instead of replacing it).
    if (this.boxSelectActive) {
      this.endSquadBoxSelect(e.clientX, e.clientY);
      return;
    }

    // Finishing an IFZ-style drag-adaptation selection. A release without a
    // meaningful drag (a plain click) converts the whole building footprint; a
    // real drag commits the footprint-relative band the preview showed.
    if (this.adaptDragActive && this.adaptDragStart) {
      this.cameraController.placementActive = false;
      this.finalizeAdaptDrag(e.clientX, e.clientY);
      this.lastProcessedTapTime = performance.now();
      return;
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

  /**
   * Arms / disarms IFZ-style drag adaptation. While armed, pressing on a
   * building and dragging across its footprint paints the physical area to
   * convert; releasing reports the swept sub-region through `onAdaptArea`. A
   * plain click (no meaningful drag) converts the whole building.
   */
  public setPendingAdaptType(type: FunctionalBuildingTypeId | null) {
    this.pendingAdaptType = type;
    if (!type) {
      this.cancelAdaptDrag();
    }
  }

  /**
   * Live paint preview: measures the band the cursor has swept across the
   * building's own footprint (in the building's local axis frame), rebuilds the
   * clipped fill at roof level, and reports the % coverage next to the cursor.
   */
  private updateAdaptPaint(x: number, z: number, clientX: number, clientY: number) {
    const start = this.adaptDragStart;
    const bldg = this.adaptDragBldg;
    if (!start || !bldg || !bldg.polygon) return;

    const dragDist = Math.hypot(x - start.x, z - start.z);
    if (!this.adaptAxisLocked && dragDist >= 2.5) {
      // Latch the sweep axis at the first meaningful drag so a wobbling cursor
      // can't flip the band between the building's axes mid-gesture.
      const decided = sweepFootprintSelection(bldg.polygon, { x: start.x, z: start.z }, { x, z });
      if (decided) this.adaptPaintAlongLong = decided.alongLongAxis;
      this.adaptAxisLocked = true;
    }

    const sel = sweepFootprintSelection(
      bldg.polygon,
      { x: start.x, z: start.z },
      { x, z },
      this.adaptAxisLocked ? this.adaptPaintAlongLong : undefined
    );
    if (!sel) {
      this.hideAdaptPaint();
      return;
    }
    const pct = Math.min(100, Math.max(0, Math.round(sel.fraction * 100)));
    this.setAdaptPaintPolygon(sel.polygon.length >= 3 ? sel.polygon : []);

    // Float the fill just above the building's roof (same plane as the
    // committed region overlays), regardless of how far the cursor wandered.
    const roofY = this.buildingRenderer.getBuildingRoofY(bldg.id) ?? start.y + (bldg.height || 6);
    this.adaptPaintGroup.position.y = roofY;
    const title = pct >= 100 ? '100% · FULL STRUCTURE' : `${pct}%`;
    let costLine: string | undefined;
    if (this.adaptPaintFullCost && pct > 0) {
      const share = sel.fraction;
      costLine = `~${Math.ceil(this.adaptPaintFullCost.wood * share)}W / ${Math.ceil(this.adaptPaintFullCost.metal * share)}M / ${Math.ceil(this.adaptPaintFullCost.bricks * share)}B`;
    }
    this.showAdaptReadout(title, costLine, clientX, clientY);
  }

  /** Rebuilds the paint fill + outline from a footprint-clipped polygon. */
  private setAdaptPaintPolygon(poly: Point2D[]) {
    if (!this.adaptPaintFill || !this.adaptPaintEdge) return;
    if (poly.length < 3) {
      this.adaptPaintFill.visible = false;
      this.adaptPaintEdge.visible = false;
      this.adaptPaintGroup.visible = false;
      return;
    }
    const shape = new THREE.Shape();
    shape.moveTo(poly[0].x, -poly[0].z);
    for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i].x, -poly[i].z);
    shape.closePath();
    const geom = new THREE.ShapeGeometry(shape);
    this.adaptPaintFill.geometry.dispose();
    this.adaptPaintFill.geometry = geom;
    const edgeGeom = new THREE.EdgesGeometry(geom);
    this.adaptPaintEdge.geometry.dispose();
    this.adaptPaintEdge.geometry = edgeGeom;
    this.adaptPaintFill.visible = true;
    this.adaptPaintEdge.visible = true;
    this.adaptPaintGroup.visible = true;
  }

  private hideAdaptPaint() {
    if (this.adaptPaintGroup) this.adaptPaintGroup.visible = false;
    if (this.adaptPaintFill) this.adaptPaintFill.visible = false;
    if (this.adaptPaintEdge) this.adaptPaintEdge.visible = false;
  }

  private ensureAdaptReadoutEl(): HTMLDivElement {
    if (this.adaptPaintReadout) return this.adaptPaintReadout;
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;pointer-events:none;z-index:41;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'background:rgba(8,12,16,0.92);border:1px solid #38bdf8;color:#7dd3fc;padding:4px 8px;' +
      'font-size:12px;font-weight:700;letter-spacing:0.04em;display:none;white-space:pre-line;' +
      'line-height:1.35;box-shadow:0 0 14px rgba(56,189,248,0.25);';
    this.container.appendChild(el);
    this.adaptPaintReadout = el;
    return el;
  }

  private showAdaptReadout(text: string, costLine?: string, clientX?: number, clientY?: number) {
    const el = this.ensureAdaptReadoutEl();
    if (costLine) {
      el.textContent = `${text}\n${costLine}`;
    } else {
      el.textContent = text;
    }
    if (clientX !== undefined && clientY !== undefined) {
      const rect = this.container.getBoundingClientRect();
      const pad = 8;
      const left = Math.min(clientX - rect.left + 16, rect.width - 210);
      const top = Math.max(pad, clientY - rect.top - 44);
      el.style.left = `${Math.max(pad, left)}px`;
      el.style.top = `${top}px`;
    }
    el.style.display = 'block';
    if (this.adaptReadoutHideTimer !== null) {
      window.clearTimeout(this.adaptReadoutHideTimer);
      this.adaptReadoutHideTimer = null;
    }
  }

  /** Shows the readout pill for a moment (feedback that needs no gesture). */
  private showAdaptReadoutAuto(text: string, ms: number) {
    const el = this.ensureAdaptReadoutEl();
    el.textContent = text;
    el.style.left = '50%';
    el.style.top = '46%';
    el.style.transform = 'translateX(-50%)';
    el.style.display = 'block';
    if (this.adaptReadoutHideTimer !== null) window.clearTimeout(this.adaptReadoutHideTimer);
    this.adaptReadoutHideTimer = window.setTimeout(() => {
      el.style.display = 'none';
      this.adaptReadoutHideTimer = null;
    }, ms);
  }

  private hideAdaptReadout() {
    if (this.adaptReadoutHideTimer !== null) {
      window.clearTimeout(this.adaptReadoutHideTimer);
      this.adaptReadoutHideTimer = null;
    }
    if (this.adaptPaintReadout) this.adaptPaintReadout.style.display = 'none';
  }

  private cancelAdaptDrag() {
    this.adaptDragActive = false;
    this.adaptDragStart = null;
    this.adaptDragBldg = null;
    this.adaptAxisLocked = false;
    this.hideAdaptPaint();
    this.hideAdaptReadout();
  }

  // ---------------- §IFZ CTRL+drag squad box selection ----------------

  private ensureBoxSelectEl(): HTMLDivElement {
    if (this.boxSelectEl) return this.boxSelectEl;
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;pointer-events:none;z-index:40;border:2px dashed #22d3ee;' +
      'background:rgba(34,211,238,0.10);box-shadow:0 0 18px rgba(34,211,238,0.35);' +
      'display:none;';
    this.container.appendChild(el);
    this.boxSelectEl = el;
    return el;
  }

  private showBoxSelectRect(x1: number, y1: number, x2: number, y2: number) {
    const el = this.ensureBoxSelectEl();
    const rect = this.container.getBoundingClientRect();
    const left = Math.min(x1, x2) - rect.left;
    const top = Math.min(y1, y2) - rect.top;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${Math.abs(x2 - x1)}px`;
    el.style.height = `${Math.abs(y2 - y1)}px`;
    el.style.display = 'block';
  }

  private hideBoxSelectRect() {
    if (this.boxSelectEl) this.boxSelectEl.style.display = 'none';
  }

  /** Shared release path for CTRL+drag (also used by the window-level fallback). */
  private endSquadBoxSelect(endX: number, endY: number) {
    this.cameraController.placementActive = false;
    this.boxSelectActive = false;
    this.hideBoxSelectRect();
    if (this.pointerDragged) {
      this.finalizeSquadBoxSelect(endX, endY);
      this.lastProcessedTapTime = performance.now();
    }
  }

  private onWindowPointerUp = (e: PointerEvent) => {
    if (this.boxSelectActive) this.endSquadBoxSelect(e.clientX, e.clientY);
    // A conversion paint released OUTSIDE the scene must not leave the camera
    // locked or the preview frozen — abort the gesture cleanly.
    if (this.adaptDragActive) {
      this.cameraController.placementActive = false;
      this.cancelAdaptDrag();
      this.showAdaptReadoutAuto('CONVERSION CANCELLED', 1400);
    }
  };

  /** Squads inside the dragged screen-space rectangle become the selection. */
  private finalizeSquadBoxSelect(endX: number, endY: number) {
    const rect = this.container.getBoundingClientRect();
    const minX = Math.min(this.boxSelectStartX, endX);
    const maxX = Math.max(this.boxSelectStartX, endX);
    const minY = Math.min(this.boxSelectStartY, endY);
    const maxY = Math.max(this.boxSelectStartY, endY);
    if (maxX - minX < 4 || maxY - minY < 4) return;

    const v = new THREE.Vector3();
    const inside = this.liveSquads.filter((sq) => {
      if (!sq.isDeployed || sq.currentHp <= 0 || sq.mountedVehicleId) return false;
      v.set(sq.x, 0, sq.z).project(this.camera);
      // Projected point is behind the camera on a far view — cull it.
      if (v.z > 1) return false;
      const sx = ((v.x + 1) / 2) * rect.width + rect.left;
      const sy = ((-v.y + 1) / 2) * rect.height + rect.top;
      return sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;
    });

    if (inside.length === 0) return; // empty box keeps the current selection
    this.selectedSquadIds = new Set(inside.map((s) => s.squadId));
    this.selectedSquadId = inside[0].squadId;
    // onSelectSquads alone drives the state: the hook sets both the full set
    // and the primary id, so calling onSelectSquad here too would collapse the
    // multi-selection back to a single squad.
    this.onSelectSquads?.(Array.from(this.selectedSquadIds));
    // A box of squads replaces the building/vehicle inspection selection.
    this.buildingRenderer.setSelected(null);
    this.onSelectBuilding?.(null);
    this.onSelectVehicle?.(null);
  }

  private finalizeAdaptDrag(clientX: number, clientY: number) {
    const type = this.pendingAdaptType;
    const start = this.adaptDragStart;
    const bldg = this.adaptDragBldg;
    if (!type || !start || !bldg || !bldg.polygon) {
      this.cancelAdaptDrag();
      return;
    }

    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const groundHits = this.raycaster.intersectObjects(this.groundRenderer.group.children, true);
    const end = groundHits.length > 0 ? groundHits[0].point : null;
    const axisLock = this.adaptAxisLocked ? this.adaptPaintAlongLong : undefined;
    this.cancelAdaptDrag();

    if (!end || !this.onAdaptArea) return;

    const dragDist = Math.hypot(end.x - start.x, end.z - start.z);
    // A plain click (no meaningful drag) converts the whole building — full
    // adaptation never requires dragging a box.
    if (dragDist < 2) {
      this.onAdaptArea(type, bldg, bldg.polygon);
      return;
    }

    // A real drag commits the swept footprint-relative band (mirroring exactly
    // what the live preview showed).
    const sel = sweepFootprintSelection(
      bldg.polygon,
      { x: start.x, z: start.z },
      { x: end.x, z: end.z },
      axisLock
    );
    if (!sel || sel.polygon.length < 3) return;
    const pct = sel.fraction * 100;
    if (pct < 4) {
      // Sub-4% slivers are accidental noise — reject with feedback, keep the
      // player in control to retry the sweep.
      this.showAdaptReadoutAuto(
        `SELECTION TOO SMALL (${Math.max(1, Math.round(pct))}%) — DRAG FURTHER ACROSS THE BUILDING`,
        2200
      );
      return;
    }
    this.onAdaptArea(type, bldg, pct >= 99 ? bldg.polygon : sel.polygon);
  }

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
    this.handleTapAt(e.clientX, e.clientY, e.ctrlKey || e.metaKey);
  };

  /** CTRL (or CMD on macOS) adds a clicked squad to the selection; a ground
   *  click with CTRL held leaves the current selection untouched. */
  private selectSquadInternal(squadId: string, additive: boolean) {
    if (additive) {
      if (this.selectedSquadIds.has(squadId)) return; // already selected
      this.selectedSquadIds.add(squadId);
      this.onSelectSquads?.(Array.from(this.selectedSquadIds));
      return;
    }
    this.selectedSquadIds = new Set([squadId]);
    this.selectedSquadId = squadId;
    this.onSelectSquads?.(Array.from(this.selectedSquadIds));
    this.onSelectSquad?.(squadId);
  }

  private handleTapAt(clientX: number, clientY: number, ctrl = false) {
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
      if (markerHit.kind === 'loot_pin' || markerHit.kind === 'leftover_loot') {
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
        this.selectSquadInternal(markerHit.id, ctrl);
        return;
      }
      if (markerHit.kind === 'survivor') {
        this.onSelectSurvivorGroup?.(markerHit.id);
        return;
      }
      if (markerHit.kind === 'zombie') {
        this.onSelectZombieCluster?.(markerHit.id);
        return;
      }
    }

    // 1. Check if a Tactical Squad unit was clicked
    const squadHit = this.combatRenderer.raycastSquad(this.raycaster);
    if (squadHit) {
      this.selectSquadInternal(squadHit, ctrl);
      return;
    }

    // 1b. A zombie body clicked directly selects its cluster.
    const zombieHit = this.combatRenderer.raycastZombie(this.raycaster);
    if (zombieHit) {
      this.onSelectZombieCluster?.(zombieHit);
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

    // 5. Clicked ground (Left-click / single tap: Selection only, NEVER move/attack order).
    //    A CTRL-held ground click is a box-select gesture affordance — it must
    //    NOT clear the current multi-selection.
    const groundIntersects = this.raycaster.intersectObjects(this.groundRenderer.group.children, true);
    if (groundIntersects.length > 0) {
      if (ctrl) return;
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

  /** With a multi-squad selection, orders fan out to EVERY selected squad. */
  private orderSquadIdsFor(targetSquadId: string | null): string[] {
    if (this.selectedSquadIds.size > 1) return Array.from(this.selectedSquadIds);
    return targetSquadId ? [targetSquadId] : [];
  }

  private issueMoveOrder(
    ids: string[],
    pos: Point2D,
    targetBuildingId?: string | number,
    targetBuildingName?: string,
    queue = false
  ) {
    for (const id of ids) this.onOrderSquadMove?.(id, pos, targetBuildingId, targetBuildingName, queue);
  }

  private executeTacticalOrderAtScreenPos(clientX: number, clientY: number, queue = false) {
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

    // 1.45 Stranded field-loot recovery — right-clicking a stranded pile
    // (gatherer / demolition overflow) dispatches the squad to collect it.
    // Checked before building raycasts so a pile inside a demolished structure
    // wins over enter/scavenge orders.
    //
    // Two hit paths, because the pile badge floats above the terrain: clicking
    // the badge sprite hits the marker (key `stranded_<pileId>`), while clicking
    // the ground next to it resolves via terrain intersection below.
    if (markerHit?.kind === 'stranded_loot' && this.onOrderSquadMove) {
      const pile = this.strandedPiles.find((p) => markerHit.key === `stranded_${p.id}`);
      if (pile) {
        const elevAt = this.disableElevation ? 0 : sampleElevation(
          this.currentMapData?.elevation,
          pile.position.x,
          pile.position.z,
          this.currentExaggeration
        );
        this.spawnTapFeedback(pile.position.x, elevAt, pile.position.z, 0xf59e0b);
        this.issueMoveOrder(
          this.orderSquadIdsFor(targetSquadId),
          { x: Math.round(pile.position.x * 10) / 10, z: Math.round(pile.position.z * 10) / 10 },
          getStrandedLootOrderId(pile.id),
          `Stranded Field Loot (${pile.wood + pile.metal + pile.bricks} units)`,
          queue
        );
        return;
      }
    }
    {
      const ground = this.raycaster.intersectObjects([
        ...this.groundRenderer.group.children,
        ...this.roadRenderer.group.children,
      ], true)[0]?.point;
      const at = ground
        ? { x: ground.x, z: ground.z }
        : (() => {
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const p = new THREE.Vector3();
            return this.raycaster.ray.intersectPlane(plane, p) ? { x: p.x, z: p.z } : null;
          })();
      if (at && this.strandedPiles.length > 0 && this.onOrderSquadMove) {
        const pile = findPileAt(this.strandedPiles, at, STRANDED_DISPATCH_RADIUS);
        if (pile) {
          // Feedback ring rides the terrain like the pile's marker badge.
          const elevAt = this.disableElevation ? 0 : sampleElevation(
            this.currentMapData?.elevation,
            pile.position.x,
            pile.position.z,
            this.currentExaggeration
          );
          this.spawnTapFeedback(pile.position.x, elevAt, pile.position.z, 0xf59e0b);
          this.issueMoveOrder(
            this.orderSquadIdsFor(targetSquadId),
            { x: Math.round(pile.position.x * 10) / 10, z: Math.round(pile.position.z * 10) / 10 },
            getStrandedLootOrderId(pile.id),
            `Stranded Field Loot (${pile.wood + pile.metal + pile.bricks} units)`,
            queue
          );
          return;
        }
      }
    }

    // 1.5 Check if clicked on a loot pin / leftover crate marker
    const lootHit = markerHit?.kind === 'loot_pin' || markerHit?.kind === 'leftover_loot' ? markerHit.id : null;
    if (lootHit && this.onOrderSquadMove) {
      const bldg = this.buildingRenderer.getBuildingById(lootHit) || this.currentMapData?.buildings.find((b) => String(b.id) === String(lootHit));
      if (bldg) {
        // Preserve the exact point selected on the building surface. This lets
        // squads enter different parts of a structure instead of always routing
        // to its centroid, which is often outside irregular footprints.
        const hit = this.raycaster.intersectObjects(this.buildingRenderer.group.children, true)[0];
        const pt = hit?.point || new THREE.Vector3(bldg.center.x, 0, bldg.center.z);
        this.spawnTapFeedback(pt.x, pt.y, pt.z, 0x10b981);
        this.issueMoveOrder(
          this.orderSquadIdsFor(targetSquadId),
          {
            x: Math.round(pt.x * 10) / 10,
            z: Math.round(pt.z * 10) / 10,
          },
          bldg.id,
          bldg.name || bldg.type,
          queue
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
      for (const id of this.orderSquadIdsFor(targetSquadId)) this.onOrderSquadAttack(id, zombieHit);
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
          this.issueMoveOrder(
            this.orderSquadIdsFor(targetSquadId),
            {
              x: Math.round(hitPoint.x * 10) / 10,
              z: Math.round(hitPoint.z * 10) / 10,
            },
            bldg.id,
            bldg.name || bldg.type,
            queue
          );
          return;
        }
      }
    }

    // 4. Otherwise raycast ground & roads for Move Command
    const groundIntersects = this.raycaster.intersectObjects([
      ...this.groundRenderer.group.children,
      ...this.roadRenderer.group.children,
    ], true);    if (groundIntersects.length > 0 && this.onOrderSquadMove) {
      const pt = groundIntersects[0].point;
      this.spawnTapFeedback(pt.x, pt.y, pt.z, 0x10b981);
      this.issueMoveOrder(this.orderSquadIdsFor(targetSquadId), {
        x: Math.round(pt.x * 10) / 10,
        z: Math.round(pt.z * 10) / 10,
      }, undefined, undefined, queue);
      return;
    }

    // 5. Fallback: Raycast infinite mathematical ground plane (y = 0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPos = new THREE.Vector3();

    if (this.raycaster.ray.intersectPlane(plane, hitPos) && this.onOrderSquadMove) {
      // Ring must sit on the actual terrain: the mathematical plane is at y=0,
      // but on elevated maps the hit point can be well above/below the surface.
      const hitElev = this.disableElevation
        ? 0
        : this.currentMapData?.elevation
        ? sampleElevation(this.currentMapData.elevation, hitPos.x, hitPos.z, this.currentExaggeration)
        : 0;
      this.spawnTapFeedback(hitPos.x, hitElev, hitPos.z, 0x10b981);
      this.issueMoveOrder(this.orderSquadIdsFor(targetSquadId), {
        x: Math.round(hitPos.x * 10) / 10,
        z: Math.round(hitPos.z * 10) / 10,
      }, undefined, undefined, queue);
    }
  }

  /**
   * Translates a 2D viewport screen drag box into exact 3D world ground bounding coordinates
   * taking into account perspective camera angle, pitch, and zoom.
   *
   * The AABB of the four unprojected corners OVER-COVERS the visible region
   * whenever the camera is pitched (the screen rectangle projects to a
   * trapezoid on the ground, and its axis-aligned bounds swallow the space
   * outside the trapezoid's sides near the far edge). To make box selection
   * match the drawn rectangle exactly, the ground-plane corners are also
   * returned in `polygon`; callers test points against that quad.
   */
  public screenRectToWorldBounds(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): WorldAreaBounds {
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

    // Perspective-correct quad: the projected corners in screen order. Only
    // attach when at least 3 corners resolved (a corner ray parallel to the
    // ground would drop one — 3 points still bound the visible region well).
    const polygon =
      worldPoints.length >= 3 ? worldPoints.map((p) => ({ x: p.x, z: p.z })) : undefined;

    return { minX, maxX, minZ, maxZ, polygon };
  }

  public updateResourceAmounts(nodes: ResourceNode[]) {
    if (this.currentMapData) {
      this.currentMapData.resourceNodes = nodes;
    }
    this.resourceRenderer.updateNodeAmounts(nodes);
  }

  public setGatherHighlight(
    gatherType: 'wood' | 'metal' | 'bricks' | 'demolish' | null,
    bounds: WorldAreaBounds | null
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
          isPointInArea(b.center, bounds) &&
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
        (n) => n.type === gatherType && n.amount > 0 && isPointInArea(n.position, bounds)
      );
      this.resourceRenderer.setHighlightedNodes(selectedNodes, activeElevation, exaggeration);
    }
  }

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault(); // Prevent default browser context menu
    if (this.pointerDragged) return; // If user dragged with right-click to rotate/elevate camera, do NOT execute squad order
    this.executeTacticalOrderAtScreenPos(e.clientX, e.clientY, e.shiftKey);
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

  /**
   * HUD flashlight toggle: null restores the automatic day/night behaviour,
   * true forces torches on (fading to at-least-half strength in daylight),
   * false forces them off even at night.
   */
  public setFlashlightOverride(enabled: boolean | null) {
    this.flashlightOverride = enabled;
  }

  public updateCombat(
    zombies: ZombieUnit[],
    squads: TacticalSquadUnit[],
    visualFx: CombatVisualFx[],
    selectedSquadId: string | null,
    droppedItems: DroppedItem[] = [],
    hostileHumans: HostileHumanUnit[] = [],
    workers: ResourceWorkOrder[] = [],
    constructionOrders: ConstructionWorkOrder[] = [],
    selectedSquadIds?: string[]
  ) {
    this.selectedSquadId = selectedSquadId;
    this.liveSquads = squads;
    if (selectedSquadIds) {
      this.selectedSquadIds = new Set(selectedSquadIds);
    }
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
    selectedVehicleId: string | null,
    nightFactor = 0
  ) {
    this.selectedVehicleId = selectedVehicleId;
    this.gateTriggerVehicles = vehicles.map((v) => ({ x: v.position.x, z: v.position.z }));
    this.vehicleRenderer.setSelectedVehicle(selectedVehicleId);
    this.vehicleRenderer.setHeadlightIntensity(nightFactor);
    const activeElevation = this.disableElevation ? null : this.currentMapData?.elevation;
    this.vehicleRenderer.updateVehicles(
      vehicles,
      activeElevation,
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
    occupiedBuildings?: Map<string | number, BuildingOccupation>,
    resourceWorkOrders: ResourceWorkOrder[] = [],
    constructionOrders: ConstructionWorkOrder[] = [],
    buildingSearches?: Map<string | number, BuildingSearchState>,
    strandedPiles: import('../types/settlement').FieldLootPile[] = []
  ) {
    this.strandedPiles = strandedPiles;
    this.latestZombies = zombies;
    const safeHidden = toSafeMap<string | number, HiddenSurvivorGroup>(hiddenGroups);
    this.hiddenGroups = safeHidden;
    if (rivalHideouts) this.rivalHideouts = toSafeMap<string | number, RivalHideout>(rivalHideouts);
    if (zombieLairs) this.zombieLairs = toSafeMap<string | number, ZombieLair>(zombieLairs);
    if (occupiedBuildings) this.occupiedBuildings = toSafeMap<string | number, BuildingOccupation>(occupiedBuildings);

    // Marker rebuild throttle: the sim loop pushes state at 10 Hz, but marker
    // sprites glide between updates via PositionSmoother, so rebuilding the
    // whole marker list (O(entities + map scans)) at full tick rate wastes
    // frame budget. 5 Hz keeps badges visually live; positions interpolate in
    // the per-frame markerRenderer.update() regardless.
    const nowMs = performance.now();
    if (nowMs - this.lastMarkerBuildAt < 200) return;
    this.lastMarkerBuildAt = nowMs;

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
        .sort((a, b) => getWeaponDefinition(b.weaponId).tier - getWeaponDefinition(a.weaponId).tier)[0];
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

      // §IFZ multi-select: every squad inside the CTRL+drag box highlights.
      const isSelected = this.selectedSquadIds.has(squad.squadId);
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
        bestWeaponName: bestWeaponId ? getWeaponDefinition(bestWeaponId).name : undefined,
        activity,
        damageRatio,
        searchProgress: squad.searchProgress,
        inBuilding: Boolean(insideBldg),
        detailMode: detail,
      });
    }

    // 1b. IFZ "no path" indicators: an ordered building the pathfinder proved
    // unreachable gets a red warning badge over its roof. One icon per building
    // even when several squads are blocked on it; squads without a building
    // target anchor the icon at their own stuck position.
    {
      const noPathTargets = new Map<string, { x: number; z: number; label: string }>();
      for (const squad of squads) {
        if (!squad.noPath || squad.currentHp <= 0) continue;
        const key =
          squad.noPath.buildingId !== undefined
            ? String(squad.noPath.buildingId)
            : `pos_${squad.noPath.x.toFixed(1)}_${squad.noPath.z.toFixed(1)}`;
        if (noPathTargets.has(key)) continue;
        const bldg = this.findBuildingById(mapData, squad.noPath.buildingId);
        if (bldg) {
          noPathTargets.set(key, { x: bldg.center.x, z: bldg.center.z, label: bldg.name || 'NO PATH' });
        } else {
          noPathTargets.set(key, { x: squad.noPath.x, z: squad.noPath.z, label: 'NO PATH' });
        }
      }
      for (const [bldgKey, target] of noPathTargets.entries()) {
        if (classify(target.x, target.z) !== 'visible') continue;
        const elev = activeElevation ? sampleElevation(activeElevation, target.x, target.z, this.currentExaggeration) : 0;
        const anchorY = Math.max(elev, this.getBuildingTopY(bldgKey));
        markers.push({
          key: `no_path_${bldgKey}`,
          kind: 'no_path',
          faction: 'hostile',
          x: target.x,
          z: target.z,
          y: anchorY + 5.0,
          anchorY,
          label: target.label,
          sublabel: 'UNREACHABLE',
          detailMode: detail,
        });
      }
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
      const isUnknownVehicle = !vehicle.isDiscovered && !isOccupied;
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
        label: isUnknownVehicle ? 'UNKNOWN VEHICLE' : vehicle.name,
        squadNumber: isUnknownVehicle ? '?' : vehNum,
        sublabel: mountedSquad ? mountedSquad.name : undefined,
        isSelected,
        isMoving,
        isOccupied,
        isArmed: isOccupied,
        memberCount: mountedAlive,
        bestWeaponName: isUnknownVehicle ? 'Unidentified vehicle' : undefined,
        maxMembers: mountedSquad ? mountedSquad.members.length : undefined,
        damageRatio,
        inBuilding: Boolean(insideBldg),
        detailMode: detail,
      });
    }

    // 4. Discovered survivor groups — orange unknown (? icon) until encountered, or red if hostile
    for (const group of safeHidden.values()) {
      if (!group.isDiscovered || group.isRecruited) continue;
      const bldg = this.findBuildingById(mapData, group.buildingId);
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
      const bldg = this.findBuildingById(mapData, hideout.buildingId);
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
      const bldg = this.findBuildingById(mapData, lair.buildingId);
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
        // Fill vs the founding garrison (baselinePopulation) — full at/above
        // baseline; a swollen nest simply shows a full badge.
        damageRatio:
          lair.baselinePopulation > 0
            ? Math.max(0, Math.min(1, lair.population / lair.baselinePopulation))
            : 1,
        detailMode: detail,
      });
    }

    // 7b. Occupied buildings (§IFZ) — unadapted structures taken over by
    // infected. A red badge sits over the building until every infected inside
    // is dead (the occupation clears and the marker disappears).
    for (const occ of this.occupiedBuildings.values()) {
      if (occ.isCleared) continue;
      const bldg = this.findBuildingById(mapData, occ.buildingId);
      if (!bldg) continue;
      if (classify(bldg.center.x, bldg.center.z) !== 'visible') continue;

      const topY = this.getBuildingTopY(bldg.id);
      markers.push({
        key: `occupied_${occ.id}`,
        kind: 'lair',
        faction: 'hostile',
        x: bldg.center.x,
        z: bldg.center.z,
        y: topY + 4.0,
        anchorY: topY,
        label: 'OCCUPIED',
        sublabel: `${occ.infectedRemaining} INSIDE`,
        damageRatio:
          occ.maxInfected > 0 ? Math.max(0, Math.min(1, occ.infectedRemaining / occ.maxInfected)) : 1,
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

    // 10. Scavenge View Loot Pins (unscavenged buildings with item categories).
    // The headquarters is never a loot target, so it never gets a pin.
    if (this.isScavengeViewActive && this.precomputedLootPins.length > 0) {
      for (const pin of this.precomputedLootPins) {
        if (String(pin.id) === String(this.hqBuildingId)) continue;
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
        if (String(bldg.id) === String(this.hqBuildingId)) continue;
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

    // 10b. Leftover loot crates — buildings whose search COMPLETED (100%) but
    // left items behind because the squad ran out of carry slots. Always shown
    // (not just in scavenge view) so the player can spot uncollected loot and
    // send someone back. Hidden inside unexplored fog like the loot pins.
    if (mapData?.buildings) {
      for (const bldg of mapData.buildings) {
        // The HQ never leaves leftover crates behind — it can't be scavenged.
        if (String(bldg.id) === String(this.hqBuildingId)) continue;
        const searchState =
          buildingSearches?.get(bldg.id) || buildingSearches?.get(String(bldg.id));
        if (!searchState) continue;
        if (searchState.searched === true) continue;
        const unlooted = Array.isArray(searchState.unlootedItems) ? searchState.unlootedItems : [];
        if (unlooted.length === 0) continue;
        // Progress < 100 means items are still being discovered, not left behind.
        if ((searchState.searchProgress ?? 0) < 100) continue;
        if (classify(bldg.center.x, bldg.center.z) === 'unexplored') continue;

        const topY = this.getBuildingTopY(bldg.id);
        markers.push({
          key: `leftover_${bldg.id}`,
          kind: 'leftover_loot',
          faction: 'unknown',
          x: bldg.center.x,
          z: bldg.center.z,
          y: topY + 4.2,
          anchorY: topY,
          label: `${unlooted.length} loot stack${unlooted.length === 1 ? '' : 's'} left`, // tooltip text
          lootCategory: getBuildingLootCategory(bldg),
          lootCategories: unlooted.map((item) => item.label),
          leftoverCount: unlooted.length,
          buildingId: bldg.id,
          detailMode: detail,
        });
      }
    }

    // 11. Stranded field-loot piles — gatherer / demolition overflow left at
    // the worksite when storage was full. Always shown once explored so the
    // player can spot and recover them (right-click dispatch).
    if (this.strandedPiles.length > 0) {
      for (const pile of this.strandedPiles) {
        const pileUnits =
          pile.wood + pile.metal + pile.bricks +
          (pile.items || []).reduce((sum, it) => sum + it.quantity, 0);
        if (pileUnits <= 0) continue;
        if (classify(pile.position.x, pile.position.z) === 'unexplored') continue;
        // Elevation-aware anchor: stranded piles sit on real terrain (and can
        // strand inside a building footprint during deconstruction). Sampling
        // keeps the badge on the ground — a y=0 anchor would end up buried or
        // floating on hilly maps, and the displaced badge breaks click-to-
        // recover because the ground ray lands far from the pile.
        const pileElev = activeElevation
          ? sampleElevation(activeElevation, pile.position.x, pile.position.z, this.currentExaggeration)
          : 0;
        const pileBldg = mapData ? this.getBuildingAtPoint(mapData, pile.position.x, pile.position.z) : null;
        const pileTopY = pileBldg ? this.getBuildingTopY(pileBldg.id) : 0;
        const pileAnchorY = Math.max(pileElev, pileTopY);
        markers.push({
          key: `stranded_${pile.id}`,
          kind: 'stranded_loot',
          faction: 'unknown',
          x: pile.position.x,
          z: pile.position.z,
          y: pileAnchorY + 2.2,
          anchorY: pileAnchorY,
          label: `Stranded Field Loot — ${pileUnits} units`,
          lootCategory: pile.wood + pile.metal + pile.bricks > 0 ? 'materials' : 'assorted',
          leftoverCount: pileUnits,
          detailMode: detail,
        });
      }
    }

    // 12. Street labels are rendered directly on the road surface by RoadRenderer (flat text with no boxes)

    this.markerRenderer.updateMarkers(markers);
  }

  /**
   * Builds a uniform-grid index (cell ≈ 25 m) over building footprints. A
   * point query visits only the buildings registered in its cell — typically
   * zero or one — instead of testing every footprint on the map.
   */
  private buildSpatialIndex(buildings: BuildingPolygon[]) {
    const cellSize = 25;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const b of buildings) {
      for (const p of b.polygon || []) {
        if (p.x < minX) minX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.x > maxX) maxX = p.x;
        if (p.z > maxZ) maxZ = p.z;
      }
    }
    if (!Number.isFinite(minX)) return null;
    const cols = Math.ceil((maxX - minX) / cellSize) + 1;
    const rows = Math.ceil((maxZ - minZ) / cellSize) + 1;
    const cells = new Map<number, BuildingPolygon[]>();
    for (const b of buildings) {
      if (!b.polygon || b.polygon.length < 3) continue;
      // Register the footprint in every cell its AABB overlaps. Real OSM
      // footprints are small, so overlap lists stay tiny.
      const xs = b.polygon.map((p) => p.x);
      const zs = b.polygon.map((p) => p.z);
      const c0 = Math.max(0, Math.floor((Math.min(...xs) - minX) / cellSize));
      const c1 = Math.min(cols - 1, Math.floor((Math.max(...xs) - minX) / cellSize));
      const r0 = Math.max(0, Math.floor((Math.min(...zs) - minZ) / cellSize));
      const r1 = Math.min(rows - 1, Math.floor((Math.max(...zs) - minZ) / cellSize));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const key = r * cols + c;
          const list = cells.get(key);
          if (list) list.push(b);
          else cells.set(key, [b]);
        }
      }
    }
    return { cellSize, minX, minZ, cols, rows, cells };
  }

  private getBuildingAtPoint(mapData: MapData, x: number, z: number): BuildingPolygon | null {
    // Fast path: spatial index (available whenever this map was loaded).
    const idx = this.buildingIndex;
    if (idx && mapData === this.currentMapData) {
      const col = Math.floor((x - idx.minX) / idx.cellSize);
      const row = Math.floor((z - idx.minZ) / idx.cellSize);
      if (col < 0 || row < 0 || col >= idx.cols || row >= idx.rows) return null;
      const list = idx.cells.get(row * idx.cols + col);
      if (!list) return null;
      for (const bldg of list) {
        if (this.pointInFootprint(x, z, bldg)) return bldg;
      }
      return null;
    }
    // Fallback for foreign map payloads: legacy linear scan.
    for (const bldg of mapData.buildings) {
      if (this.pointInFootprint(x, z, bldg)) return bldg;
    }
    return null;
  }

  private pointInFootprint(x: number, z: number, bldg: BuildingPolygon): boolean {
    if (!bldg.polygon || bldg.polygon.length < 3) return false;
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
    return inside;
  }

  private isPointInsideAnyBuilding(mapData: MapData, x: number, z: number): boolean {
    return this.getBuildingAtPoint(mapData, x, z) !== null;
  }

  /**
   * O(1) building lookup by id (falls back to a linear find for payloads that
   * were never indexed — e.g. tests passing a hand-built map).
   */
  private findBuildingById(mapData: MapData | null, id: string | number): BuildingPolygon | undefined {
    const key = String(id);
    if (mapData === this.currentMapData) return this.buildingById.get(key);
    return mapData?.buildings.find((b) => String(b.id) === key);
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

  private clusterZombies(zombies: ZombieUnit[]) {
    return clusterZombies(zombies);
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
    this.frameMsAccum += delta * 1000;
    this.frameMsSamples++;
    if (now - this.fpsLastTime >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.fpsLastTime));
      this.frameMsAvg = this.frameMsAccum / Math.max(1, this.frameMsSamples);
      this.frameCount = 0;
      this.frameMsAccum = 0;
      this.frameMsSamples = 0;
      this.fpsLastTime = now;
      this.updatePerfHud();
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

    // Update weather visuals (rain/snow fall, cloud drift, lightning, easing)
    this.weatherFX.update(delta, now / 1000, this.camera.position);

    // Update resource-node depletion animations (felling trees, dissolving cars)
    this.resourceRenderer.update(delta, now / 1000);

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
    // overview meshes when the camera is high (hysteresis avoids flicker).
    // Quality presets shift the swap threshold: on Medium/Low the merged LOD
    // kicks in much sooner, so tilted/wide views render mostly merged geometry.
    const camY = this.camera.position.y;
    const distantOn = 380 * this.qualityLodScale;
    const distantOff = distantOn * 0.74;
    if (!this.buildingLodDistant && camY > distantOn) {
      this.buildingLodDistant = true;
      this.buildingRenderer.setLodMode('distant');
    } else if (this.buildingLodDistant && camY < distantOff) {
      this.buildingLodDistant = false;
      this.buildingRenderer.setLodMode('detailed');
    }

    // Distance-based detail culling (quality-gated): in detailed mode, hide
    // far-away individual buildings so a tilted zoomed-out view — where the
    // frustum contains the whole city but the altitude LOD hasn't fired —
    // doesn't draw thousands of full-detail meshes. Near buildings stay full
    // detail; far ones vanish (the fog + ground layer reads as distance haze).
    // Merged distant cells, freestanding structures, roofs and edges skip this
    // (visibility is per body-mesh only, and freestanding walls are gameplay
    // objects the player placed).
    if (this.graphicsQuality !== 'high' && !this.buildingLodDistant) {
      this.detailCullAccum += delta;
      if (this.detailCullAccum >= 0.25) {
        this.detailCullAccum = 0;
        this.applyDistanceDetailCull();
      }
    } else if (this.detailCullActive) {
      this.detailCullActive = false;
      this.buildingRenderer.restoreAllDetailVisibility();
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
    window.removeEventListener('keydown', this.onKeyDown);
    this.perfHud?.remove();
    this.perfHud = null;
    this.weatherFX.dispose();

    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('click', this.onClick);
    this.container.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('resize', this.onWindowResize);

    this.clearPowerOverlay();
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
