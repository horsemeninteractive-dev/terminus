import React from 'react';
import { Layers, Footprints, Building2, Car } from 'lucide-react';
import { GameCanvas } from './GameCanvas';
import { TacticalHeaderStrip } from './TacticalHeaderStrip';
import { AudioSettingsModal } from './AudioSettingsModal';
import { TacticalSquadSelectorStrip } from './TacticalSquadSelectorStrip';
import { TutorialHintArrow } from './TutorialHintArrow';
import { SquadManagementModal } from './SquadManagementModal';
import { LawPolicyModal } from './LawPolicyModal';
import { ExpeditionModal } from './ExpeditionModal';
import { TacticalSquadHUD } from './TacticalSquadHUD';
import { BuildingAdaptationDrawer } from './BuildingAdaptationDrawer';
import { VehicleTacticalDrawer } from './VehicleTacticalDrawer';
import { AreaGatherOverlay } from './AreaGatherOverlay';
import { NotificationTray } from './NotificationTray';
import { TacticalActionBar } from './TacticalActionBar';
import { TacticalMinimapWidget, ScavengeLootFilter } from './TacticalMinimapWidget';
import { HQSelectionCard } from './HQSelectionCard';
import { RecruitmentEncounterModal } from './RecruitmentEncounterModal';
import { RansomEventModal } from './RansomEventModal';
import { ColonyOverrunModal } from './ColonyOverrunModal';
import { GameOverExtinctModal } from './GameOverExtinctModal';
import type { ActiveSidebarTab } from './TacticalHeaderStrip';
import type { TacticalAlert } from './TacticalAlertStream';
import type { ToastItem } from './NotificationTray';
import type { GatherResourceType } from './AreaGatherOverlay';
import type { AppViewMode } from '../App';
import { soundService, ToastMessage } from '../services/soundService';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../data/functionalBuildings';
import { getHiddenGroupValues } from '../lib/scavengeQueueHelpers';
import { isPointInsidePolygon, isSquadInsideBuilding } from '../services/scavengingService';
import { polygonCentroid } from '../services/adaptationGeometry';
import { calculateGlobalNetworkStats } from '../services/caravanService';
import { countSettlementSurvivors } from '../services/settlementLifecycleService';
import { getLawsUnlockInfo } from '../services/lawService';
import { isAntennaOperational } from '../services/expeditionService';
import { getPrimaryHQ, isHQOperational, getPrimaryAdaptedEntry, getAdaptedEntriesForBuilding } from '../services/buildingOperational';
import { reorderConstructionQueue, updateWorkerJobLimit, updateWorkerJobPriority, setWorkerJobToZero, setWorkerJobToMax } from '../services/populationService';
import { CATEGORY_COLORS } from '../render/BuildingRenderer';
import { humanLocationLabel, resolveBuildingLocation } from '../services/osmLocationResolver';
import type { WorldScene, FreestandingPlacementPoint } from '../render/WorldScene';
import type { GameClockState, NoiseEvent, TacticalSquadUnit, ZombieUnit, WeaponItemId, ArmorItemId } from '../types/combat';
import type { LawId } from '../types/laws';
import type { BuildingPolygon, MapData, Point2D, ResourceNode, WorldAreaBounds } from '../types/map';
import type { SettlementState, FunctionalBuildingTypeId } from '../types/settlement';
import type { HiddenSurvivorGroup } from '../types/population';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import type { SettlementRecord, TradeCaravan } from '../types/caravan';
import type { WorldVehicle } from '../types/vehicle';
type WorldScenePlacement = FreestandingPlacementPoint;

export interface TacticalWorldSceneProps {
  activeGatherType: GatherResourceType | null;
  activeRansomHideoutId: string | number | null;
  activeRecruitmentGroup: HiddenSurvivorGroup | null;
  activeSidebarTab: ActiveSidebarTab | null;
  activeSettlementId: string;
  alerts: TacticalAlert[];
  caravans: TradeCaravan[];
  combatSquads: TacticalSquadUnit[];
  combatSquadsRef: React.MutableRefObject<TacticalSquadUnit[]>;
  contactedSurvivorGroupIdsRef: React.MutableRefObject<Set<string>>;
  dangerLevel: number;
  disableElevation: boolean;
  elevationExaggeration: number;
  gameClock: GameClockState;
  handleAdaptBuilding: (
    bldg: BuildingPolygon,
    typeId: FunctionalBuildingTypeId,
    adaptation?: number | Point2D[]
  ) => void;
  /** Removes a building/section adaptation, freeing the structure again. */
  handleDeadaptBuilding: (buildingId: string | number) => void;
  /** Adapts ONE split section of a building into a facility (§7.1). */
  handleAdaptBuildingSection: (bldg: BuildingPolygon, sectionId: string, typeId: FunctionalBuildingTypeId) => void;
  /** Splits a large building into independently adaptable sections (§7.1). */
  handleSplitBuilding: (bldg: BuildingPolygon, parts: 2 | 3 | 4) => void;
  /** Shooting Range: order/cancel a squad's training course. */
  handleStartTraining: (squadId: string) => void;
  handleStopTraining: (squadId: string) => void;
  handleAppointHead: (buildingId: string | number, survivorId: string) => void;
  handleAssignArmor: (squadId: string, memberId: string, armorId: ArmorItemId | null) => void;
  handleAssignWeapon: (squadId: string, memberId: string, weaponId: WeaponItemId | null) => void;
  handleAssignTowerWeapon: (buildingId: string | number, weaponId: WeaponItemId | null) => void;
  handleBuildFreestanding: (typeId: FunctionalBuildingTypeId, pos: Point2D, rotationDeg?: number) => void;
  handleBuildFreestandingRun: (typeId: FunctionalBuildingTypeId, placements: WorldScenePlacement[]) => void;
  handleChangeSquadStance: (squadId: string, stance: 'aggressive' | 'defensive' | 'hold_fire') => void;
  handleConfirmHQ: (bldg: BuildingPolygon) => void;
  handleCreateSquad: (name: string, leaderId: string, memberCount: number, weaponLoadout?: import('../types/population').SquadWeaponLoadout, armorLoadout?: import('../types/population').SquadArmorLoadout) => void;
  handleDesignateGatherArea: (type: GatherResourceType, bounds: WorldAreaBounds) => void;
  handleDesignateSquadScavenge: (bounds: WorldAreaBounds) => void;
  handleDisbandSquad: (squadId: string) => void;
  handleDismissAlert: (id: string) => void;
  handleDismountVehicle: (vehicleId: string) => void;
  handleFocusBuilding: (building: BuildingPolygon) => void;
  handleLoadProgress: (progress: number, label?: string) => void;
  handleMinimapPanTo: (pos: Point2D) => void;
  handleModifySquadGeneralMembers: (squadId: string, memberCount: number) => void;
  handleMountVehicle: (squadId: string, vehicleId: string) => void;
  handleOrderDeconstruction: (buildingId: string | number) => void;
  handleOrderSquadAttack: (squadId: string, zombieId: string) => void;
  handleOrderSquadMove: (squadId: string, pos: Point2D, targetBuildingId?: string | number, targetBuildingName?: string) => void;
  handleOrderSquadRecall: (squadId: string) => void;
  handleOrderAllSquadsRecall: () => void;
  handleOrderVehicleExtraction: (vehicle: WorldVehicle) => void;
  handlePayRansom: (hideoutId: string | number) => void;
  handleRecruitGroup: (buildingId: string | number, persuasionLeaderId?: string) => void;
  handleRefuseRescue: (hideoutId: string | number) => void;
  handleRepairBuilding: (buildingId: string | number) => void;
  handleRestartGame: () => void;
  handleSearchBuilding: (building: BuildingPolygon, squadIdOverride?: string) => void;
  handleSelectExistingSettlement: (id: string) => void;
  handleSelectSquad: (squadId: string | null) => void;
  handleSelectSquads?: (squadIds: string[]) => void;
  handleSelectVehicle: (vehicleId: string | null) => void;
  handleSetClockSpeed: (speed: 0 | 1 | 2 | 4) => void;
  handleStartSquadScavengeArea: (squadId: string) => void;
  handleUpdateCombatSquads: (updated: TacticalSquadUnit[]) => void;
  handleVacateSurvivorRole: (buildingId: string | number) => void;
  isAudioModalOpen: boolean;
  isExpeditionViewActive: boolean;
  isExtinct: boolean;
  isHQSelectionUnlocked: boolean;
  isHideUi: boolean;
  isInitialCommsPending: boolean;
  isQuestListOpen: boolean;
  isScavengeViewActive: boolean;
  isSquadModalOpen: boolean;
  /** Tutorial/mission task actively asks the player to muster a squad. */
  squadMusterActive?: boolean;
  /** Whether modals the player must dismiss are covering the world view —
   *  used to suppress the tutorial arrow when its target is unreachable. */
  isTutorialTargetObscured?: boolean;
  labelDetailMode: 'detailed' | 'minimal';
  mapData: MapData | null;
  noiseEvents: NoiseEvent[];
  overrunSettlement: SettlementRecord | null;
  pendingAdaptType: FunctionalBuildingTypeId | null;
  pendingFreestandingType: FunctionalBuildingTypeId | null;
  radioDirectiveState: RadioDirectiveState | null;
  scavengeFilterType: ScavengeLootFilter;
  sceneRef: React.MutableRefObject<WorldScene | null>;
  selectedBuilding: BuildingPolygon | null;
  selectedSquadId: string | null;
  selectedSquadIds?: string[];
  selectedVehicleId: string | null;
  setActiveGatherType: React.Dispatch<React.SetStateAction<GatherResourceType | null>>;
  setActiveRadioTransmission: React.Dispatch<React.SetStateAction<RadioTransmission | null>>;
  setActiveRansomHideoutId: React.Dispatch<React.SetStateAction<string | number | null>>;
  setActiveRecruitmentGroup: React.Dispatch<React.SetStateAction<HiddenSurvivorGroup | null>>;
  setActiveSidebarTab: React.Dispatch<React.SetStateAction<ActiveSidebarTab | null>>;
  setClickedPosition: React.Dispatch<React.SetStateAction<Point2D | null>>;
  setHoveredBuilding: React.Dispatch<React.SetStateAction<BuildingPolygon | null>>;
  setIsAudioModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsExpeditionViewActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsFreestandingModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsHideUi: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMoraleModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLawModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isLawModalOpen: boolean;
  handleEnactLaw: (lawId: LawId) => void;
  setIsExpeditionModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isExpeditionModalOpen: boolean;
  handleDispatchExpedition: (siteId: string, squadId: string) => void;
  handleRecallExpedition: (squadId: string) => void;
  setIsPauseMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPopulationModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsQuestListOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRadioModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsResearchModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsScavengeViewActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSceneRendered: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSquadModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsVehicleModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsWeatherModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLabelDetailMode: React.Dispatch<React.SetStateAction<'detailed' | 'minimal'>>;
  setOverrunSettlement: React.Dispatch<React.SetStateAction<SettlementRecord | null>>;
  setPendingAdaptType: React.Dispatch<React.SetStateAction<FunctionalBuildingTypeId | null>>;
  setPendingFreestandingType: React.Dispatch<React.SetStateAction<FunctionalBuildingTypeId | null>>;
  setScavengeFilterType: React.Dispatch<React.SetStateAction<ScavengeLootFilter>>;
  setSelectedBuilding: React.Dispatch<React.SetStateAction<BuildingPolygon | null>>;
  setSelectedResourceNode: React.Dispatch<React.SetStateAction<ResourceNode | null>>;
  setSettlements: React.Dispatch<React.SetStateAction<Record<string, SettlementRecord>>>;
  setSelectedSquadId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedVehicleId: React.Dispatch<React.SetStateAction<string | null>>;
  setSettlement: any;
  setShowBuildingEdges: React.Dispatch<React.SetStateAction<boolean>>;
  setShowLanduse: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPowerGrid: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSatelliteOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  setSatelliteQuality: React.Dispatch<React.SetStateAction<import('../types/saveGame').SatelliteQuality>>;
  setShowStreetLabels: React.Dispatch<React.SetStateAction<boolean>>;
  setToastMessage: (msg: ToastMessage | null) => void;
  setToasts: React.Dispatch<React.SetStateAction<ToastItem[]>>;
  setViewMode: (m: AppViewMode) => void;
  settlement: SettlementState;
  settlementRef: React.MutableRefObject<SettlementState>;
  settlements: Record<string, SettlementRecord>;
  showBricks: boolean;
  showBuildingEdges: boolean;
  showBuildings: boolean;
  showLanduse: boolean;
  showMetal: boolean;
  showRoads: boolean;
  showPowerGrid: boolean;
  showSatelliteOverlay: boolean;
  satelliteQuality: import('../types/saveGame').SatelliteQuality;
  showStreetLabels: boolean;
  showTerrainWireframe: boolean;
  graphicsQuality: import('../types/saveGame').GraphicsQuality;
  showWood: boolean;
  toasts: ToastItem[];
  viewMode: AppViewMode;
  zombies: ZombieUnit[];
}

export const TacticalWorldScene: React.FC<TacticalWorldSceneProps> = (props) => {
  const {
    activeGatherType,
    activeRansomHideoutId,
    activeRecruitmentGroup,
    activeSidebarTab,
    activeSettlementId,
    alerts,
    caravans,
    combatSquads,
    combatSquadsRef,
    contactedSurvivorGroupIdsRef,
    dangerLevel,
    disableElevation,
    elevationExaggeration,
    gameClock,
    handleAdaptBuilding,
    handleAdaptBuildingSection,
    handleSplitBuilding,
    handleDeadaptBuilding,
    handleStartTraining,
    handleStopTraining,
    handleAppointHead,
    handleAssignArmor,
    handleAssignWeapon,
    handleAssignTowerWeapon,
    handleBuildFreestanding,
    handleBuildFreestandingRun,
    handleChangeSquadStance,
    handleConfirmHQ,
    handleCreateSquad,
    handleDesignateGatherArea,
    handleDesignateSquadScavenge,
    handleDisbandSquad,
    handleDismissAlert,
    handleDismountVehicle,
    handleFocusBuilding,
    handleLoadProgress,
    handleMinimapPanTo,
    handleModifySquadGeneralMembers,
    handleMountVehicle,
    handleOrderDeconstruction,
    handleOrderSquadAttack,
    handleOrderSquadMove,
    handleOrderSquadRecall,
    handleOrderAllSquadsRecall,
    handleOrderVehicleExtraction,
    handlePayRansom,
    handleRecruitGroup,
    handleRefuseRescue,
    handleRepairBuilding,
    handleRestartGame,
    handleSearchBuilding,
    handleSelectExistingSettlement,
    handleSelectSquad,
  handleSelectSquads,
    handleSelectVehicle,
    handleSetClockSpeed,
    handleStartSquadScavengeArea,
    handleUpdateCombatSquads,
    handleVacateSurvivorRole,
    isAudioModalOpen,
    isExpeditionViewActive,
    isExtinct,
    isHQSelectionUnlocked,
    isHideUi,
    isInitialCommsPending,
    isQuestListOpen,
    isScavengeViewActive,
    isSquadModalOpen,
    squadMusterActive,
    isTutorialTargetObscured,
    labelDetailMode,
    mapData,
    noiseEvents,
    overrunSettlement,
    pendingAdaptType,
    pendingFreestandingType,
    radioDirectiveState,
    scavengeFilterType,
    sceneRef,
    selectedBuilding,
    selectedSquadId,
  selectedSquadIds,
    selectedVehicleId,
    setActiveGatherType,
    setActiveRadioTransmission,
    setActiveRansomHideoutId,
    setActiveRecruitmentGroup,
    setActiveSidebarTab,
    setClickedPosition,
    setHoveredBuilding,
    setIsAudioModalOpen,
    setIsExpeditionViewActive,
    setIsFreestandingModalOpen,
    setIsHideUi,
    setIsMoraleModalOpen,
    setIsLawModalOpen,
    isLawModalOpen,
    handleEnactLaw,
    setIsExpeditionModalOpen,
    isExpeditionModalOpen,
    handleDispatchExpedition,
    handleRecallExpedition,
    setIsPauseMenuOpen,
    setIsPopulationModalOpen,
    setIsQuestListOpen,
    setIsRadioModalOpen,
    setIsResearchModalOpen,
    setIsScavengeViewActive,
    setIsSceneRendered,
    setIsSquadModalOpen,
    setIsVehicleModalOpen,
    setIsWeatherModalOpen,
    setLabelDetailMode,
    setOverrunSettlement,
    setPendingAdaptType,
    setPendingFreestandingType,
    setScavengeFilterType,
    setSelectedBuilding,
    setSelectedResourceNode,
    setSelectedSquadId,
    setSelectedVehicleId,
    setSettlement,
    setSettlements,
    setShowBuildingEdges,
    setShowLanduse,
    setShowPowerGrid,
    setShowSatelliteOverlay,
    setSatelliteQuality,
    setShowStreetLabels,
    setToastMessage,
    setToasts,
    setViewMode,
    settlement,
    settlementRef,
    settlements,
    showBricks,
    showBuildingEdges,
    showBuildings,
    showLanduse,
    showMetal,
    showPowerGrid,
    showRoads,
    showSatelliteOverlay,
    satelliteQuality,
    showStreetLabels,
    showTerrainWireframe,
    graphicsQuality,
    showWood,
    toasts,
    viewMode,
    zombies,
  } = props;

  // Selection dock tab (squad / building / vehicle). Only one info panel is
  // shown at a time; a tab strip appears when several entities are selected.
  // The active tab follows the MOST RECENT selection, so clicking a squad then
  // a building surfaces the building panel while the squad stays one tab away.
  const [dockActiveTab, setDockActiveTab] = React.useState<'squad' | 'building' | 'vehicle'>('squad');
  const prevDockSelRef = React.useRef<{ s: string | null; b: string | number | null; v: string | null }>({
    s: null,
    b: null,
    v: null,
  });
  React.useEffect(() => {
    const prev = prevDockSelRef.current;
    const bId = selectedBuilding ? selectedBuilding.id : null;
    if (selectedSquadId && selectedSquadId !== prev.s) setDockActiveTab('squad');
    else if (selectedBuilding && bId !== prev.b) setDockActiveTab('building');
    else if (selectedVehicleId && selectedVehicleId !== prev.v) setDockActiveTab('vehicle');
    prevDockSelRef.current = { s: selectedSquadId, b: bId, v: selectedVehicleId };
  }, [selectedSquadId, selectedBuilding, selectedVehicleId]);

  // Reorder a queued construction site: promote/demote within the build queue
  // so the player controls which structure completes first.
  // `headquarters` is the authoritative HQ collection; the primary command
  // center is the entry matching primaryHQId. A breached command center
  // commands nothing — treated as absent until a new HQ is established.
  const primaryHQ = getPrimaryHQ(settlement);
  const hqOperational = isHQOperational(primaryHQ);
  const lawsUnlock = getLawsUnlockInfo(settlement);
  const antennaOperational = isAntennaOperational(settlement);

  // §7.1 IFZ-style drag adaptation: conversions select a physical portion by
  // pressing on a building and dragging across its own footprint — the swept
  // band is clipped to the real building (see GameCanvas onAdaptArea). A plain
  // click converts the whole structure.

  const handleReorderConstruction = (buildingId: string | number, direction: 'up' | 'down') => {
    const r = reorderConstructionQueue(settlement, buildingId, direction);
    if (r.success) {
      setSettlement(r.newState);
      soundService.playClick();
    }
  };

  return (
    <>
              <GameCanvas
                mapData={mapData}
                settlement={settlement}
                clockHour={gameClock.hour}
                elevationExaggeration={elevationExaggeration}
                disableElevation={disableElevation}
                showTerrainWireframe={showTerrainWireframe}
                graphicsQuality={graphicsQuality}
                showBuildingEdges={showBuildingEdges}
                showBuildings={showBuildings}
                showRoads={showRoads}
                showWood={showWood}
                showMetal={showMetal}
                showBricks={showBricks}
                showLanduse={showLanduse}
                showSatelliteOverlay={showSatelliteOverlay}
                showPowerGrid={showPowerGrid}
                selectedSquadId={selectedSquadId}
                selectedVehicleId={selectedVehicleId}
                pendingFreestandingType={pendingFreestandingType}
                pendingAdaptType={pendingAdaptType}
                onAdaptArea={(typeId, bldg, polygon) => {
                  setPendingAdaptType(null);
                  if (settlement.buildingSections?.get(bldg.id)?.length) {
                    // §7.1 split buildings: route the dragged area to the
                    // section containing the selection centroid so each region
                    // adapts independently.
                    const centroid = polygonCentroid(polygon);
                    const sections = settlement.buildingSections?.get(bldg.id) || [];
                    const target =
                      sections.find((s) => isPointInsidePolygon(centroid, s.polygon)) ||
                      sections[0];
                    if (target) {
                      handleAdaptBuildingSection(bldg, target.id, typeId);
                    }
                  } else {
                    handleAdaptBuilding(bldg, typeId, polygon);
                  }
                }}
                onSelectBuilding={(bldg) => {
                  if (!hqOperational && !isHQSelectionUnlocked) {
                    setToastMessage({
                      title: 'INCOMING TRANSMISSION PENDING',
                      desc: 'Press PUSH TO TALK to receive your operational mandate before designating an HQ.',
                      type: 'info',
                    });
                    const unread =
                      radioDirectiveState?.currentIncomingTransmission ||
                      radioDirectiveState?.transmissionLog?.find((t) => !t.isRead) ||
                      radioDirectiveState?.transmissionLog?.[0] ||
                      null;
                    setActiveRadioTransmission(unread);
                    setIsRadioModalOpen(true);
                    return;
                  }
    
                  // WorldScene calls onSelectBuilding(null) whenever nothing is
                  // selected by a click: empty ground (deselect), a squad
                  // drag-box that replaces the building inspection, or a
                  // resource node hit (a parallel onSelectResourceNode carries
                  // that selection). A null building must only clear the
                  // building inspection — dereferencing it below would throw.
                  if (!bldg) {
                    setSelectedBuilding(null);
                    return;
                  }
    
                  setSelectedBuilding(bldg);
                  setSelectedResourceNode(null);
    
                  // Selecting a smoke-marked structure while a squad is inside it is
                  // also a reliable interaction fallback. This uses string-normalized
                  // building IDs so numeric IDs from bundled maps and string IDs from
                  // saved games resolve to the same survivor group.
                  const selectedSmokeGroup = getHiddenGroupValues(settlementRef.current.hiddenGroups)
                    .find((group) => String(group.buildingId) === String(bldg.id));
                  // Contact is based on any deployed squad physically inside the
                  // smoke building, not on which squad happens to be selected in the HUD.
                  const contactSquad = (combatSquadsRef.current.length ? combatSquadsRef.current : combatSquads)
                    .find((sq) => sq.isDeployed && sq.currentHp > 0 && isSquadInsideBuilding({ x: sq.x, z: sq.z }, bldg));
                  if (
                    selectedSmokeGroup &&
                    selectedSmokeGroup.hasSmokeClue &&
                    !selectedSmokeGroup.isRecruited &&
                    contactSquad
                  ) {
                    setSettlement((prev) => {
                      const groups = new Map(prev.hiddenGroups);
                      const entry = (Array.from(groups.entries()) as [string | number, HiddenSurvivorGroup][]).find(
                        ([key, value]) => String(key) === String(bldg.id) || String(value.buildingId) === String(bldg.id)
                      );
                      if (entry) groups.set(entry[0], { ...entry[1], isDiscovered: true });
                      return { ...prev, hiddenGroups: groups };
                    });
                    contactedSurvivorGroupIdsRef.current.add(String(bldg.id));
                    setActiveRecruitmentGroup({ ...selectedSmokeGroup, isDiscovered: true });
                    setToastMessage({
                      title: 'SURVIVORS CONTACTED',
                      desc: `${selectedSmokeGroup.leader.name} responded from ${selectedSmokeGroup.buildingName}.`,
                      type: 'success',
                    });
                  }
                  // §7.1 IFZ-style drag adaptation: the armed conversion type is
                  // applied by painting across the building's own footprint in
                  // the 3D scene (GameCanvas onAdaptArea). The click here only
                  // selects and disarms.
                  if (pendingAdaptType) {
                    setPendingAdaptType(null);
                    setToastMessage({
                      title: 'PAINT TO CONVERT',
                      desc: `Press on ${bldg.name || 'the structure'} and drag across its footprint to paint the exact area to convert — the fill shows your coverage. A plain click converts the whole building.`,
                      type: 'info',
                    });
                  }
                }}
                onHoverBuilding={(bldg) => {
                  if (isHQSelectionUnlocked || hqOperational) {
                    setHoveredBuilding(bldg);
                  }
                }}
                onSelectResourceNode={(node) => { setSelectedResourceNode(node); setSelectedBuilding(null); setActiveSidebarTab(node ? 'inspector' : null); }}
                onSelectPosition={(pos, rotationDeg) => {
                  setClickedPosition(pos);
                  if (pendingFreestandingType) {
                    handleBuildFreestanding(pendingFreestandingType, pos, rotationDeg);
                    setPendingFreestandingType(null);
                  }
                }}
                onPlaceFreestandingRun={(typeId, placements) => handleBuildFreestandingRun(typeId, placements)}
                onSelectSquad={handleSelectSquad}
                onSelectSquads={handleSelectSquads}
                onOrderSquadMove={handleOrderSquadMove}
                onOrderSquadAttack={handleOrderSquadAttack}
                onSelectVehicle={handleSelectVehicle}
                onMountVehicle={handleMountVehicle}
                onSceneReady={(s) => {
                  sceneRef.current = s;
                  // Seed the freshly-built world with the settlement's current
                  // weather & moon phase so visuals match the simulation from
                  // the first frame (rain, snow, cloud cover, lightning, phase).
                  if (settlement?.weather) {
                    s.setWeather(settlement.weather.currentWeather, settlement.weather.moonPhase);
                  }
                }}
                onMapRendered={() => {
                  // The 3D map has been built and drawn — safe to reveal the world.
                  setIsSceneRendered(true);
                }}
                onLoadProgress={handleLoadProgress}
              />
    
              {/* Restore Tactical UI Button when HUD is toggled off */}
              {isHideUi && (
                <div className="fixed bottom-4 right-4 z-50 pointer-events-auto">
                  <button
                    id="btn-restore-tactical-ui"
                    onClick={() => {
                      soundService.playClick();
                      setIsHideUi(false);
                    }}
                    title="Restore Tactical HUD"
                    className="px-3.5 py-2.5 bg-[#07090C]/95 border-2 border-[#1E293B] hover:border-[#10B981] text-[#10B981] hover:text-white shadow-2xl flex items-center gap-2 backdrop-blur-md transition-all active:scale-95 touch-manipulation clip-tactical-bracket"
                  >
                    <Layers className="w-5 h-5" />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider">Restore HUD</span>
                  </button>
                </div>
              )}
    
              {!isHideUi && (
                <>
                  {/* Tactical Diegetic Header Strip (Torn Bottom Edge, Compact Readouts, Speed, Tabs) */}
                  <TacticalHeaderStrip
                    settlement={settlement}
                    clock={gameClock}
                    activeNoiseEvents={noiseEvents}
                    zombieCount={zombies.filter((z) => z.state !== 'dead').length}
                    onSetSpeed={handleSetClockSpeed}
                    activeSidebar={activeSidebarTab}
                    onToggleSidebar={(tab) => setActiveSidebarTab(tab)}
                    onOpenGlobe={() => setViewMode('globe')}
                    questTrackerVisible={isQuestListOpen}
                    onToggleQuestTracker={() => setIsQuestListOpen((v) => !v)}
                    hasHQ={hqOperational}
                    onOpenAudioSettings={() => setIsAudioModalOpen(true)}
                    onOpenPauseMenu={() => setIsPauseMenuOpen(true)}
                    onOpenTechTree={() => setIsResearchModalOpen(true)}
                    onOpenMoraleModal={() => setIsMoraleModalOpen(true)}
                    onOpenWeatherModal={() => setIsWeatherModalOpen(true)}
                    onOpenPopulationModal={() => setIsPopulationModalOpen(true)}
                    onOpenLawModal={() => setIsLawModalOpen(true)}
                    lawsUnlocked={lawsUnlock.unlocked}
                    lawsUnlockReason={lawsUnlock.reason}
                    onOpenExpeditionModal={() => setIsExpeditionModalOpen(true)}
                    antennaOperational={antennaOperational}
                    onOpenRadio={() => {
                      const unread =
                        radioDirectiveState?.transmissionLog?.find((t) => !t.isRead) ||
                        radioDirectiveState?.transmissionLog?.[0] ||
                        null;
                      setActiveRadioTransmission(unread);
                      setIsRadioModalOpen(true);
                    }}
                    radioUnreadCount={radioDirectiveState?.unreadCount ?? 0}
                  />
    
                  {/* Active Blueprint Hologram Placement Banner */}
                  {pendingFreestandingType && (
                    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 bg-amber-950/90 border-2 border-amber-500 rounded-lg shadow-2xl backdrop-blur-md animate-pulse">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                      <div className="text-xs font-mono font-bold text-amber-200">
                        PLACING <span className="text-amber-400 uppercase">{FUNCTIONAL_BUILDING_DEFINITIONS[pendingFreestandingType]?.name || pendingFreestandingType}</span> — Tap open ground on the map to construct
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingFreestandingType(null);
                          soundService.playClick();
                        }}
                        className="px-2 py-0.5 ml-2 text-[10px] uppercase font-bold text-amber-950 bg-amber-400 hover:bg-amber-300 rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
    
                  {/* Audio Subsystem & Soundscape Modal (§15) */}
                  <AudioSettingsModal
                    isOpen={isAudioModalOpen}
                    onClose={() => setIsAudioModalOpen(false)}
                    currentPhase={gameClock.phase}
                    isNight={gameClock.isNight}
                    dangerLevel={dangerLevel}
                  />
    
                  {/* Tutorial affordance: floats beside the form-squad button */}
                  <TutorialHintArrow
                    target="#form-new-squad-btn"
                    label="MUSTER FIRST SQUAD"
                    sub="Open the + panel → form a fireteam"
                    side="left"
                    active={Boolean(squadMusterActive && !isTutorialTargetObscured)}
                  />

                  {/* Top-Right Squad Tactical Command Card & Selector Strip */}
                  <TacticalSquadSelectorStrip
                    squads={combatSquads}
                    selectedSquadId={selectedSquadId}
                    onSelectSquad={handleSelectSquad}
                    onCreateSquad={() => setIsSquadModalOpen(true)}
                    highlightMuster={squadMusterActive}
                    onPanToSquad={(sq) => {
                      handleMinimapPanTo({ x: sq.position ? sq.position.x : sq.x, z: sq.position ? sq.position.z : sq.z });
                    }}
                  />
    
                  {/* Squad Command & Muster Panel — opened by the '+' Form Squad button (§4.3) */}
                  <SquadManagementModal
                    isOpen={isSquadModalOpen}
                    onClose={() => setIsSquadModalOpen(false)}
                    settlement={settlement}
                    onCreateSquad={handleCreateSquad}
                    onModifyGeneralMembers={handleModifySquadGeneralMembers}
                    onDisbandSquad={handleDisbandSquad}
                  />
    
                  {/* Laws & Policy (§IFZ Major Update #5) — Gathering Place forum */}
                  <LawPolicyModal
                    isOpen={isLawModalOpen}
                    onClose={() => setIsLawModalOpen(false)}
                    settlement={settlement}
                    today={gameClock.day}
                    onEnactLaw={handleEnactLaw}
                  />
    
                  {/* Expeditions (§IFZ) — off-map scavenging revealed via the Antenna */}
                  <ExpeditionModal
                    isOpen={isExpeditionModalOpen}
                    onClose={() => setIsExpeditionModalOpen(false)}
                    settlement={settlement}
                    squads={combatSquads}
                    selectedSquadId={selectedSquadId}
                    onDispatch={handleDispatchExpedition}
                    onRecall={handleRecallExpedition}
                  />
    
                  {/* Selection Info Dock — squad / building / vehicle panels share one
                      slot; only one panel is shown at a time, and a tab strip
                      switches between whichever entities are currently selected. */}
                  {(selectedSquadId || selectedBuilding || selectedVehicleId) && (() => {
                    const selectedSquadObj = combatSquads.find((s) => s.squadId === selectedSquadId) || null;
                    const selectedMountedVehicle = (() => {
                      if (!selectedSquadId) return null;
                      const byAssigned = settlement.vehicles?.find((v) => v.assignedSquadId === selectedSquadId);
                      if (byAssigned) return byAssigned;
                      const mid = selectedSquadObj?.mountedVehicleId;
                      return mid ? settlement.vehicles?.find((v) => v.id === mid) || null : null;
                    })();
                    const selectedDockVehicle = selectedVehicleId
                      ? settlement.vehicles?.find((v) => v.id === selectedVehicleId) || null
                      : null;
                    const selectedBuildingAdapt = selectedBuilding
                      ? settlement.freestandingBuildings?.find(
                          (f) => String(f.buildingId) === String(selectedBuilding.id)
                        ) ||
                        getPrimaryAdaptedEntry(settlement.adaptedBuildings, selectedBuilding.id) ||
                        null
                      : null;
                    // Rebuild the strip from the CURRENT selections every render so
                    // closing one panel never leaves a dead tab behind.
                    const dockTabs: {
                      kind: 'squad' | 'building' | 'vehicle';
                      label: string;
                      icon: React.ElementType;
                    }[] = [];
                    if (selectedSquadObj) {
                      dockTabs.push({ kind: 'squad', label: selectedSquadObj.name || 'Squad', icon: Footprints });
                    }
                    if (selectedBuilding) {
                      dockTabs.push({
                        kind: 'building',
                        label:
                          selectedBuildingAdapt?.name ||
                          selectedBuilding.name ||
                          humanLocationLabel(resolveBuildingLocation(selectedBuilding)) ||
                          'Structure',
                        icon: Building2,
                      });
                    }
                    if (selectedDockVehicle) {
                      dockTabs.push({ kind: 'vehicle', label: selectedDockVehicle.name || 'Vehicle', icon: Car });
                    }
                    if (dockTabs.length === 0) return null;
                    const activeDockTab = dockTabs.some((t) => t.kind === dockActiveTab)
                      ? dockActiveTab
                      : dockTabs[0].kind;
                    return (
                    <div
                      id="selection-info-dock"
                      className="fixed bottom-14 left-2 right-2 md:top-12 md:left-auto md:right-16 md:bottom-auto z-40 flex flex-col gap-2 pointer-events-none max-h-[calc(100vh-72px)] overflow-y-auto no-scrollbar"
                    >
                      {dockTabs.length > 1 && (
                        <div className="w-full md:w-[min(94vw,340px)] shrink-0 flex items-stretch gap-1 pointer-events-auto select-none">
                          {dockTabs.map((tab) => {
                            const TabIcon = tab.icon;
                            const isActiveTab = tab.kind === activeDockTab;
                            return (
                              <button
                                key={tab.kind}
                                type="button"
                                onClick={() => {
                                  setDockActiveTab(tab.kind);
                                  soundService.playClick();
                                }}
                                title={tab.label}
                                aria-pressed={isActiveTab}
                                className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-1.5 border text-[10px] font-heading font-black uppercase tracking-wider transition-colors clip-tactical-bracket ${
                                  isActiveTab
                                    ? 'bg-[#064E3B]/90 border-[#10B981] text-white'
                                    : 'bg-[#0B0F15]/95 border-[#1E293B] text-[#94A3B8] hover:text-white hover:border-[#334155]'
                                }`}
                              >
                                <TabIcon
                                  className={`w-3.5 h-3.5 shrink-0 ${isActiveTab ? 'text-[#10B981]' : 'text-[#475569]'}`}
                                />
                                <span className="truncate">{tab.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {activeDockTab === 'squad' && (
                      <TacticalSquadHUD
                        squad={selectedSquadObj}
                        mountedVehicle={selectedMountedVehicle}
                        selectedCount={selectedSquadIds?.length || 1}
                        onDismountVehicle={
                          selectedMountedVehicle ? () => handleDismountVehicle(selectedMountedVehicle.id) : undefined
                        }
                        onDeselect={() => handleSelectSquad(null)}
                        onChangeStance={handleChangeSquadStance}
                        onOrderFallbackHQ={handleOrderSquadRecall}
                        onRecallAll={handleOrderAllSquadsRecall}
                        onStartScavengeArea={() => handleStartSquadScavengeArea(selectedSquadId || selectedSquadObj?.squadId || '')}
                        isScavengeAreaActive={activeGatherType === 'scavenge'}
                        inventory={selectedSquadId ? settlement.squadInventories?.[selectedSquadId] : undefined}
                        armory={settlement.armory || { weapons: [], armor: [] }}
                        onAssignWeapon={handleAssignWeapon}
                        onAssignArmor={handleAssignArmor}
                        allSquads={combatSquads}
                        onSelectSquad={handleSelectSquad}
                        onDisbandSquad={handleDisbandSquad}
                      />
                      )}
    
                      {activeDockTab === 'building' && selectedBuilding && (
                        <BuildingAdaptationDrawer
                          building={selectedBuilding}
                          adaptedInfo={
                            settlement.freestandingBuildings?.find(
                              (f) => String(f.buildingId) === String(selectedBuilding.id)
                            ) ||
                            getPrimaryAdaptedEntry(settlement.adaptedBuildings, selectedBuilding.id)
                          }
                          buildingSections={
                            settlement.buildingSections?.get(selectedBuilding.id) || []
                          }
                          sectionAdaptations={
                            getAdaptedEntriesForBuilding(settlement.adaptedBuildings, selectedBuilding.id).filter(
                              (a) => String(a.buildingId) !== String(selectedBuilding.id)
                            )
                          }
                          onSplitBuilding={handleSplitBuilding}
                          onStartTraining={handleStartTraining}
                          onStopTraining={handleStopTraining}
                          onAdaptSection={(bldg, sectionId, typeId) =>
                            handleAdaptBuildingSection(bldg, sectionId, typeId)
                          }
                          onDeadaptSection={(sectionId) => handleDeadaptBuilding(sectionId)}
                          isHQ={
                            !!primaryHQ &&
                            String(primaryHQ.buildingId) === String(selectedBuilding.id)
                          }
                          settlement={settlement}
                          hiddenGroup={
                            getHiddenGroupValues(settlement.hiddenGroups)
                              .find((group) => String(group.buildingId) === String(selectedBuilding.id)) || null
                          }
                          onClose={() => {
                            setSelectedBuilding(null);
                            setActiveSidebarTab(null);
                          }}
                          onDismantle={handleOrderDeconstruction}
                          onFocusBuilding={handleFocusBuilding}
                          onAppointHead={handleAppointHead}
                          onVacateSurvivorRole={handleVacateSurvivorRole}
                          onInvestigateHiddenGroup={(group) => {
                            if (group) setActiveRecruitmentGroup(group);
                          }}
                          onRepairBuilding={handleRepairBuilding}
                          onAssignTowerWeapon={handleAssignTowerWeapon}
                          onSearchInfestedBuilding={handleSearchBuilding}
                          onReorderConstruction={handleReorderConstruction}
                          onExpandAdaptation={(buildingId, targetPct) => {
                            // §7.1 expanding a partial conversion — reuses the
                            // existing building's type and advances its coverage.
                            if (!selectedBuilding) return;
                            const info =
                              settlement.adaptedBuildings?.get(buildingId) ||
                              settlement.freestandingBuildings?.find(
                                (f) => String(f.buildingId) === String(buildingId)
                              );
                            if (!info || info.isFreestanding || info.constructionStatus !== 'completed') return;
                            handleAdaptBuilding(selectedBuilding, info.typeId, Math.min(100, targetPct));
                          }}
                          onSetRecipe={(buildingId, recipeId) => {
                            // §7.2 the crew runs only the recipe the player
                            // selects (persisted per building).
                            const id = String(buildingId);
                            setSettlement((prev) => {
                              const adapted = prev.adaptedBuildings?.get(buildingId);
                              if (adapted) {
                                const next = new Map(prev.adaptedBuildings || []);
                                next.set(buildingId, { ...adapted, selectedRecipeId: recipeId } as never);
                                return { ...prev, adaptedBuildings: next };
                              }
                              const fs = prev.freestandingBuildings?.find(
                                (f) => String(f.buildingId) === id
                              );
                              if (fs) {
                                return {
                                  ...prev,
                                  freestandingBuildings: prev.freestandingBuildings?.map((f) =>
                                    String(f.buildingId) === id
                                      ? { ...f, selectedRecipeId: recipeId }
                                      : f
                                  ),
                                };
                              }
                              return prev;
                            });
                          }}
                          nearbyWounded={(() => {
                            // §5.3 wounded squad members inside this
                            // building's treatment radius (mirrors the sim).
                            const center = selectedBuilding?.center;
                            if (!center) return 0;
                            return (combatSquads || []).reduce((sum, sq) => {
                              if (!sq || typeof sq.x !== 'number' || typeof sq.z !== 'number') return sum;
                              if (Math.hypot(sq.x - (center.x ?? 0), sq.z - (center.z ?? 0)) >= 18) return sum;
                              return (
                                sum +
                                (sq.members || []).filter(
                                  (m) => m.isAlive && m.currentHp < m.maxHp
                                ).length
                              );
                            }, 0);
                          })()}
                          onSetFertilize={(buildingId, enabled) => {
                            // §7.2 fertilizing is a per-plot choice — it
                            // consumes fertilizer each cycle, never a passive
                            // aura while any fertilizer exists.
                            const id = String(buildingId);
                            setSettlement((prev) => {
                              const patch = (b: { buildingId: string | number }) => ({
                                ...b,
                                isFertilized: enabled,
                              });
                              const adapted = prev.adaptedBuildings?.get(buildingId);
                              if (adapted) {
                                const next = new Map(prev.adaptedBuildings || []);
                                next.set(buildingId, patch(adapted) as never);
                                return { ...prev, adaptedBuildings: next };
                              }
                              const fs = prev.freestandingBuildings?.find(
                                (f) => String(f.buildingId) === id
                              );
                              if (fs) {
                                return {
                                  ...prev,
                                  freestandingBuildings: prev.freestandingBuildings?.map((f) =>
                                    String(f.buildingId) === id ? patch(f) : f
                                  ),
                                };
                              }
                              return prev;
                            });
                          }}
                          onSetRepairmenBands={(bands) => {
                            // §IFZ Repairmen Shop: player-chosen repair bands
                            // are settlement-wide (crews in every shop obey).
                            setSettlement((prev) => ({ ...prev, automatedRepairConfig: bands }));
                          }}
                        />
                      )}
    
                      {activeDockTab === 'vehicle' && selectedVehicleId && (
                        <VehicleTacticalDrawer
                          vehicle={settlement.vehicles?.find((v) => v.id === selectedVehicleId) || null}
                          onClose={() => setSelectedVehicleId(null)}
                          settlement={settlement}
                          onUpdateSettlement={setSettlement}
                          combatSquads={combatSquads}
                          onUpdateCombatSquads={handleUpdateCombatSquads}
                          onOpenFullFleetModal={() => setIsVehicleModalOpen(true)}
                          onOrderVehicleExtraction={handleOrderVehicleExtraction}
                        />
                      )}
                    </div>
                    );
                  })()}
    
                  {/* Area Drag-Box Gathering Overlay */}
                  <AreaGatherOverlay
                    isActive={activeGatherType !== null}
                    gatherType={activeGatherType || 'wood'}
                    onCancel={() => {
                      setActiveGatherType(null);
                      sceneRef.current?.setGatherHighlight(null, null);
                    }}
                    onDragBoundsChange={(bounds) => {
                      if (activeGatherType && activeGatherType !== 'scavenge') {
                        sceneRef.current?.setGatherHighlight(activeGatherType, bounds);
                      } else {
                        sceneRef.current?.setGatherHighlight(null, null);
                      }
                    }}
                    onDesignateArea={(type, bounds) => {
                      sceneRef.current?.setGatherHighlight(null, null);
                      if (type === 'scavenge') handleDesignateSquadScavenge(bounds);
                      else handleDesignateGatherArea(type, bounds);
                    }}
                    screenRectToWorldBounds={(x1, y1, x2, y2) => {
                      if (sceneRef.current) {
                        return sceneRef.current.screenRectToWorldBounds(x1, y1, x2, y2);
                      }
                      return { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
                    }}
                  />
    
                  {/* Unified bottom-left notification stack — single tray holds both the
                      persistent tactical alert stream and the transient toast, so they never
                      overlap. Rows animate in/out smoothly as a coordinated column. */}
                  <NotificationTray
                    alerts={alerts}
                    toasts={toasts}
                    onDismissAlert={handleDismissAlert}
                    onDismissToast={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
                  />
    
                  {/* Bottom-Left 4-Button Action Bar (Buildings, Fortifications, Area Works, Citizens/Workers) */}
                  <TacticalActionBar
                    settlement={settlement}
                    onSelectAdaptationType={(typeId) => {
                      // Arm the conversion: the player presses on a building and
                      // drags across its OWN footprint to paint the portion to
                      // convert (IFZ); the live fill shows the coverage.
                      setPendingAdaptType(typeId);
                      setSelectedBuilding(null);
                      setToastMessage({
                        title: 'CONVERSION ARMED',
                        desc: 'Press on a building and drag across its footprint to paint the portion to convert — the fill shows your % coverage. A plain click converts the whole building; drag the full length for 100%.',
                        type: 'info',
                      });
                      soundService.playClick();
                    }}
                    onSelectFreestandingBlueprint={(typeId) => {
                      if (typeId) {
                        setPendingFreestandingType(typeId);
                        setPendingAdaptType(null);
                        setSelectedBuilding(null);
                        const def = FUNCTIONAL_BUILDING_DEFINITIONS[typeId];
                        setToastMessage({
                          title: 'BLUEPRINT ARMED: ' + (def?.name || typeId).toUpperCase(),
                          desc: 'Tap anywhere on open ground to place structure and deploy builders.',
                          type: 'info',
                        });
                        soundService.playCombatActionSFX('assault_order');
                      } else {
                        setIsFreestandingModalOpen(true);
                        soundService.playClick();
                      }
                    }}
                    onStartGatherArea={(type) => {
                      setActiveGatherType(type);
                      soundService.playClick();
                    }}
                    activeGatherType={activeGatherType}
                    onUpdateWorkerJobPriority={(jobId, priority) => {
                      const next = updateWorkerJobPriority(settlementRef.current || settlement, jobId, priority);
                      settlementRef.current = next;
                      setSettlement(next);
                    }}
                    onUpdateWorkerJobLimit={(jobId, limit) => {
                      const next = updateWorkerJobLimit(settlementRef.current || settlement, jobId, limit);
                      settlementRef.current = next;
                      setSettlement(next);
                    }}
                    onSetWorkerJobToZero={(jobId) => {
                      const next = setWorkerJobToZero(settlementRef.current || settlement, jobId);
                      settlementRef.current = next;
                      setSettlement(next);
                    }}
                    onSetWorkerJobToMax={(jobId) => {
                      const next = setWorkerJobToMax(settlementRef.current || settlement, jobId);
                      settlementRef.current = next;
                      setSettlement(next);
                    }}
                    onOpenPopulationRoster={() => setIsPopulationModalOpen(true)}
                    idleLaborCount={settlement.generalPopulation?.unassigned || 0}
                    totalLaborCount={settlement.namedSurvivors.length + (settlement.generalPopulation?.total || 0)}
                  />
    
                  {/* Bottom-Right Radar Minimap */}
                  <TacticalMinimapWidget
                    selectedBuilding={selectedBuilding}
                    buildings={mapData?.buildings || []}
                    landuse={mapData?.landuse || []}
                    squads={combatSquads}
                    zombies={zombies.filter((z) => z.state !== 'dead')}
                    vehicles={settlement.vehicles || []}
                    hqBuildingId={primaryHQ?.buildingId || null}
                    mapRadius={mapData?.radius || 4000}
                    cameraPosition={sceneRef.current?.cameraController?.target || { x: 0, z: 0 }}
                    onPanTo={handleMinimapPanTo}
                    onCenterHQ={() => {
                      if (primaryHQ) {
                        const bldg = mapData?.buildings.find((b) => b.id === primaryHQ?.buildingId);
                        if (bldg) handleMinimapPanTo(bldg.center);
                      }
                    }}
                    onResetNorth={() => {
                      soundService.playClick();
                      sceneRef.current?.cameraController.faceNorth();
                    }}
                    isScavengeViewActive={isScavengeViewActive}
                    scavengeFilterType={scavengeFilterType}
                    onToggleScavengeView={() => {
                      setIsScavengeViewActive((prev) => {
                        const next = !prev;
                        if (sceneRef.current) {
                          sceneRef.current.setScavengeView(next, scavengeFilterType);
                        }
                        return next;
                      });
                    }}
                    onSetScavengeFilter={(filter) => {
                      setScavengeFilterType(filter);
                      setIsScavengeViewActive(true);
                      if (sceneRef.current) {
                        sceneRef.current.setScavengeView(true, filter);
                      }
                    }}
                    showStreetLabels={showStreetLabels}
                    onToggleStreetLabels={() => {
                      setShowStreetLabels((prev) => {
                        const next = !prev;
                        if (sceneRef.current) {
                          sceneRef.current.setShowStreetLabels(next);
                        }
                        return next;
                      });
                    }}
                    showSatelliteOverlay={showSatelliteOverlay}
                    onToggleSatelliteOverlay={() => {
                      setShowSatelliteOverlay((prev) => {
                        const next = !prev;
                        if (sceneRef.current) {
                          sceneRef.current.setSatelliteOverlay(next, satelliteQuality);
                        }
                        return next;
                      });
                    }}
                    showPowerGrid={showPowerGrid}
                    onTogglePowerGrid={() => {
                      setShowPowerGrid((prev) => {
                        const next = !prev;
                        if (sceneRef.current) {
                          sceneRef.current.setPowerGridOverlay(next, settlement || null);
                        }
                        return next;
                      });
                    }}
                    satelliteQuality={satelliteQuality}
                    onSatelliteQualityChange={(q) => {
                      setSatelliteQuality(q);
                      if (showSatelliteOverlay && sceneRef.current) {
                        sceneRef.current.setSatelliteOverlay(true, q);
                      }
                    }}
                    showLanduse={showLanduse}
                    onToggleLanduse={() => {
                      setShowLanduse((prev) => !prev);
                    }}
                    showStructureOutlines={showBuildingEdges}
                    onToggleStructureOutlines={() => {
                      setShowBuildingEdges((prev) => {
                        const next = !prev;
                        if (sceneRef.current) {
                          sceneRef.current.setShowBuildingEdges(next);
                        }
                        return next;
                      });
                    }}
                    labelDetailMode={labelDetailMode}
                    onToggleLabelDetailMode={() => {
                      setLabelDetailMode((prev) => {
                        const next = prev === 'detailed' ? 'minimal' : 'detailed';
                        if (sceneRef.current) {
                          sceneRef.current.setLabelDetailMode(next);
                        }
                        return next;
                      });
                    }}
                    onToggleHideUi={() => setIsHideUi(true)}
                    isExpeditionViewActive={isExpeditionViewActive}
                    onToggleExpeditionView={() => {
                      if (sceneRef.current) {
                        const isExp = sceneRef.current.cameraController.toggleExpeditionView();
                        setIsExpeditionViewActive(isExp);
                      }
                    }}
                    onOpenRadio={() => {
                      const unread =
                        radioDirectiveState?.currentIncomingTransmission ||
                        radioDirectiveState?.transmissionLog?.find((t) => !t.isRead) ||
                        radioDirectiveState?.transmissionLog?.[0] ||
                        null;
                      setActiveRadioTransmission(unread);
                      setIsRadioModalOpen(true);
                    }}
                    unreadRadioCount={radioDirectiveState?.unreadCount || 0}
                    hasIncomingRadio={Boolean(radioDirectiveState?.unreadCount && radioDirectiveState.unreadCount > 0)}
                    isInitialPendingRadio={isInitialCommsPending}
                  />
    
    
                  {/* Phase 1 HQ Selection Card (shown ONLY after initial radio communication has been confirmed AND no HQ is selected yet) */}
                  {!hqOperational && isHQSelectionUnlocked && (
                    <HQSelectionCard
                      selectedBuilding={selectedBuilding}
                      onConfirmHQ={handleConfirmHQ}
                    />
                  )}
                </>
              )}
    
              {/* World Discovery Recruitment Encounter Modal (§4.4) */}
              <RecruitmentEncounterModal
                isOpen={!!activeRecruitmentGroup}
                onClose={() => setActiveRecruitmentGroup(null)}
                group={activeRecruitmentGroup}
                settlement={settlement}
                onRecruit={handleRecruitGroup}
              />
    
              {/* Rival-Faction Ransom Event Modal (§5.2) */}
              <RansomEventModal
                isOpen={!!activeRansomHideoutId}
                onClose={() => setActiveRansomHideoutId(null)}
                hideout={
                  (activeRansomHideoutId && settlement.rivalHideouts?.get(activeRansomHideoutId)) || null
                }
                settlement={settlement}
                onPayRansom={handlePayRansom}
                onRefuseRescue={handleRefuseRescue}
              />
    
              {/* Colony Overrun & Destruction Alert Modal (§7.5) */}
              {overrunSettlement && (
                <ColonyOverrunModal
                  isOpen={!!overrunSettlement && !isExtinct}
                  destroyedSettlement={overrunSettlement}
                  survivorsRemaining={countSettlementSurvivors(overrunSettlement.state || settlement)}
                  operationalSettlements={(Object.values(settlements) as SettlementRecord[]).filter(
                    (s) => s.status === 'operational'
                  )}
                  onStartReclaim={() => {
                    // §7.5 local reclamation: survivors abandon the ruined
                    // command post and designate a fresh one — the founding
                    // HQ-selection flow takes over on this map.
                    setSettlement((prev) => ({
                      ...prev,
                      headquarters: [],
                      primaryHQId: null,
                      isInitialized: false,
                    }));
                    setSettlements((registry) => ({
                      ...registry,
                      [activeSettlementId]: {
                        ...registry[activeSettlementId],
                        status: 'reclaiming',
                      },
                    }));
                    setOverrunSettlement(null);
                    setToastMessage({
                      title: 'RECLAMATION UNDERWAY',
                      desc: 'Secure the sector — designate a new command post as HQ to make the colony operational again.',
                      type: 'info',
                    });
                  }}
                  onOpenGlobe={() => {
                    setOverrunSettlement(null);
                    setViewMode('globe');
                  }}
                  onSwitchToSettlement={(targetId) => {
                    setOverrunSettlement(null);
                    handleSelectExistingSettlement(targetId);
                  }}
                  onDispatchRelief={(originId) => {
                    setOverrunSettlement(null);
                    handleSelectExistingSettlement(originId);
                    setActiveSidebarTab('caravans');
                  }}
                />
              )}
    
              {/* Total Extinction Game Over Modal (§7.5) */}
              <GameOverExtinctModal
                isOpen={isExtinct}
                stats={calculateGlobalNetworkStats(settlements, caravans)}
                totalZombiesKilled={settlement.lifetimeStats?.infectedKills ?? 0}
                onRestartGame={handleRestartGame}
              />
    
    </>
  );
};
