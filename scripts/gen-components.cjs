// One-shot generator: emits the three presentational view components.
const fs = require('fs');

const TYPE_MAP = {
  // menuflow
  viewMode: "AppViewMode",
  setViewMode: "(m: AppViewMode) => void",
  activePlacement: "SettlementPlacement | null",
  setActivePlacement: "React.Dispatch<React.SetStateAction<SettlementPlacement | null>>",
  currentPreset: "LocationPreset",
  descentProgress: "number",
  descentAltitudeKm: "number",
  loadingMessage: "string | null",
  isDescentActive: "boolean",
  isPwaUpdateAvailable: "boolean",
  setIsPwaUpdateAvailable: "React.Dispatch<React.SetStateAction<boolean>>",
  handleContinueGame: "() => void",
  handleBeginDescent: "() => void",
  handleConfirmSettlementPlacement: "(placement: SettlementPlacement) => void",
  handleSelectExistingSettlement: "(id: string) => void",
  handleDirectiveAction: "(actionType: string) => void",
  handleClaimDawnReward: "() => void",
  isCelebrationModalOpen: "boolean",
  isQuestListOpen: "boolean",
  isRadioModalOpen: "boolean",
  isInitialCommsPending: "boolean",
  radioDirectiveState: "RadioDirectiveState | null",
  setRadioDirectiveState: "React.Dispatch<React.SetStateAction<RadioDirectiveState>>",
  setActiveRadioTransmission: "React.Dispatch<React.SetStateAction<RadioTransmission | null>>",
  settlement: "SettlementState",
  settlements: "Record<string, SettlementRecord>",
  setSettlements: "React.Dispatch<React.SetStateAction<Record<string, SettlementRecord>>>",
  activeSettlementId: "string",
  setActiveSettlementId: "React.Dispatch<React.SetStateAction<string>>",
  caravans: "TradeCaravan[]",
  setMapData: "React.Dispatch<React.SetStateAction<MapData | null>>",
  gameClock: "GameClockState",
  setSaveLoadMode: "React.Dispatch<React.SetStateAction<'save' | 'load'>>",
  setIsSaveLoadModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  setIsSettingsModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  setIsCodexModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  setIsCreditsModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  // world
  mapData: "MapData | null",
  zombies: "ZombieUnit[]",
  combatSquads: "TacticalSquadUnit[]",
  combatSquadsRef: "React.MutableRefObject<TacticalSquadUnit[]>",
  settlementRef: "React.MutableRefObject<SettlementState>",
  sceneRef: "React.MutableRefObject<WorldScene | null>",
  selectedBuilding: "BuildingPolygon | null",
  setSelectedBuilding: "React.Dispatch<React.SetStateAction<BuildingPolygon | null>>",
  selectedSquadId: "string | null",
  setSelectedSquadId: "React.Dispatch<React.SetStateAction<string | null>>",
  selectedVehicleId: "string | null",
  setSelectedVehicleId: "React.Dispatch<React.SetStateAction<string | null>>",
  selectedResourceNode: "ResourceNode | null",
  setSelectedResourceNode: "React.Dispatch<React.SetStateAction<ResourceNode | null>>",
  hoveredBuilding: "BuildingPolygon | null",
  setHoveredBuilding: "React.Dispatch<React.SetStateAction<BuildingPolygon | null>>",
  clickedPosition: "Point2D | null",
  setClickedPosition: "React.Dispatch<React.SetStateAction<Point2D | null>>",
  pendingFreestandingType: "FunctionalBuildingTypeId | null",
  setPendingFreestandingType: "React.Dispatch<React.SetStateAction<FunctionalBuildingTypeId | null>>",
  pendingAdaptType: "FunctionalBuildingTypeId | null",
  setPendingAdaptType: "React.Dispatch<React.SetStateAction<FunctionalBuildingTypeId | null>>",
  isHideUi: "boolean",
  setIsHideUi: "React.Dispatch<React.SetStateAction<boolean>>",
  isScavengeViewActive: "boolean",
  setIsScavengeViewActive: "React.Dispatch<React.SetStateAction<boolean>>",
  scavengeFilterType: "string | null",
  setScavengeFilterType: "React.Dispatch<React.SetStateAction<string | null>>",
  showStreetLabels: "boolean",
  setShowStreetLabels: "React.Dispatch<React.SetStateAction<boolean>>",
  showSatelliteOverlay: "boolean",
  setShowSatelliteOverlay: "React.Dispatch<React.SetStateAction<boolean>>",
  showBuildingEdges: "boolean",
  setShowBuildingEdges: "React.Dispatch<React.SetStateAction<boolean>>",
  showLanduse: "boolean",
  setShowLanduse: "React.Dispatch<React.SetStateAction<boolean>>",
  labelDetailMode: "'detailed' | 'minimal'",
  setLabelDetailMode: "React.Dispatch<React.SetStateAction<'detailed' | 'minimal'>>",
  isExpeditionViewActive: "boolean",
  setIsExpeditionViewActive: "React.Dispatch<React.SetStateAction<boolean>>",
  activeGatherType: "GatherResourceType | null",
  setActiveGatherType: "React.Dispatch<React.SetStateAction<GatherResourceType | null>>",
  elevationExaggeration: "number",
  disableElevation: "boolean",
  showTerrainWireframe: "boolean",
  showBuildings: "boolean",
  showRoads: "boolean",
  showWood: "boolean",
  showMetal: "boolean",
  showBricks: "boolean",
  noiseEvents: "NoiseEvent[]",
  toasts: "ToastItem[]",
  setToasts: "React.Dispatch<React.SetStateAction<ToastItem[]>>",
  alerts: "TacticalAlert[]",
  setToastMessage: "(msg: ToastMessage | null) => void",
  dangerLevel: "number",
  isAudioModalOpen: "boolean",
  setIsAudioModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  isSquadModalOpen: "boolean",
  setIsSquadModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  isResearchModalOpen: "boolean",
  setIsResearchModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  isPauseMenuOpen: "boolean",
  setIsPauseMenuOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  isPopulationModalOpen: "boolean",
  setIsPopulationModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  isVehicleModalOpen: "boolean",
  setIsVehicleModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  isWeatherModalOpen: "boolean",
  setIsWeatherModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  isMoraleModalOpen: "boolean",
  setIsMoraleModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  isFreestandingModalOpen: "boolean",
  setIsFreestandingModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  activeRansomHideoutId: "string | number | null",
  setActiveRansomHideoutId: "React.Dispatch<React.SetStateAction<string | number | null>>",
  activeRecruitmentGroup: "HiddenSurvivorGroup | null",
  setActiveRecruitmentGroup: "React.Dispatch<React.SetStateAction<HiddenSurvivorGroup | null>>",
  contactedSurvivorGroupIdsRef: "React.MutableRefObject<Set<string>>",
  overrunSettlement: "SettlementRecord | null",
  setOverrunSettlement: "React.Dispatch<React.SetStateAction<SettlementRecord | null>>",
  isExtinct: "boolean",
  setIsSceneRendered: "React.Dispatch<React.SetStateAction<boolean>>",
  activeSidebarTab: "ActiveSidebarTab | null",
  setActiveSidebarTab: "React.Dispatch<React.SetStateAction<ActiveSidebarTab | null>>",
  setIsQuestListOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  setIsRadioModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  handleAdaptBuilding: "(bldg: BuildingPolygon, typeId: FunctionalBuildingTypeId) => void",
  handleBuildFreestanding: "(typeId: FunctionalBuildingTypeId, pos: Point2D, rotationDeg?: number) => void",
  handleBuildFreestandingRun: "(typeId: FunctionalBuildingTypeId, placements: WorldScenePlacement[]) => void",
  handleConfirmHQ: "(bldg: BuildingPolygon) => void",
  handleSelectSquad: "(squadId: string | null) => void",
  handleSelectVehicle: "(vehicleId: string | null) => void",
  handleOrderSquadMove: "(squadId: string, pos: Point2D, targetBuildingId?: string | number, targetBuildingName?: string) => void",
  handleOrderSquadAttack: "(squadId: string, zombieId: string) => void",
  handleMountVehicle: "(squadId: string, vehicleId: string) => void",
  handleDismountVehicle: "(vehicleId: string) => void",
  handleUpdateCombatSquads: "(updated: TacticalSquadUnit[]) => void",
  handleOrderVehicleExtraction: "(vehicle: WorldVehicle) => void",
  handleStartSquadScavengeArea: "(squadId: string) => void",
  handleDesignateSquadScavenge: "(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) => void",
  handleDesignateGatherArea: "(type: GatherResourceType, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) => void",
  handleOrderSquadRecall: "(squadId: string) => void",
  handleSetClockSpeed: "(speed: 0 | 1 | 2 | 4) => void",
  handleDismissAlert: "(id: string) => void",
  handleDisbandSquad: "(squadId: string) => void",
  handleCreateSquad: "(name: string, leaderId: string, memberCount: number) => void",
  handleModifySquadGeneralMembers: "(squadId: string, memberCount: number) => void",
  handleAssignWeapon: "(squadId: string, memberId: string, weaponId: WeaponItemId | null) => void",
  handleAssignArmor: "(squadId: string, memberId: string, armorId: ArmorItemId | null) => void",
  handleChangeSquadStance: "(squadId: string, stance: 'aggressive' | 'defensive' | 'hold_fire') => void",
  handleSearchBuilding: "(building: BuildingPolygon, squadIdOverride?: string) => void",
  handleRepairBuilding: "(buildingId: string | number) => void",
  handleOrderDeconstruction: "(buildingId: string | number) => void",
  handleFocusBuilding: "(building: BuildingPolygon) => void",
  handleAppointHead: "(buildingId: string | number, survivorId: string) => void",
  handleVacateSurvivorRole: "(buildingId: string | number) => void",
  handleMinimapPanTo: "(pos: Point2D) => void",
  handleLoadProgress: "(progress: number, label?: string) => void",
  handlePayRansom: "(hideoutId: string | number) => void",
  handleRefuseRescue: "(hideoutId: string | number) => void",
  handleRecruitGroup: "(buildingId: string | number, persuasionLeaderId?: string) => void",
  handleRestartGame: "() => void",
  isHQSelectionUnlocked: "boolean",
  // modals
  activeRadioTransmission: "RadioTransmission | null",
  alarmHoursRemaining: "number",
  handleToggleAlarm: "() => void",
  isAlarmActive: "boolean",
  mannedTowersCount: "number",
  mannedGatesCount: "number",
  isNewGameModalOpen: "boolean",
  setIsNewGameModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  isSaveLoadModalOpen: "boolean",
  saveLoadMode: "'save' | 'load'",
  isCodexModalOpen: "boolean",
  isSettingsModalOpen: "boolean",
  isCreditsModalOpen: "boolean",
  isPopulationModalOpen: "boolean",
  setIsMedbayModalOpen: "React.Dispatch<React.SetStateAction<boolean>>",
  handleSaveGame: "(name: string, overwriteId?: string) => void",
  handleLoadGame: "(saveId: string) => void",
  handleQuickSave: "() => void",
  handleStartNewGame: "() => void",
  handleExitToMainMenu: "() => void",
  handleApplyGameSettings: "(settings: GameSettings) => void",
  handleUpdateJobPriorities: "(allocation: Partial<SettlementState['jobPriorities']>) => void",
};

function propsList(label) {
  return fs.readFileSync(`.jsxsplit/${label}.props-clean.txt`, 'utf8').trim().split('\n').filter(Boolean);
}

function emit(name, header, propsNames, bodyLines) {
  const iface = propsNames.map((p) => `  ${p}: ${TYPE_MAP[p] || 'any'};`).join('\n');
  const out = `${header}
export interface ${name}Props {
${iface}
}

export const ${name}: React.FC<${name}Props> = (props) => {
  const {
${propsNames.map((p) => `    ${p},`).join('\n')}
  } = props;
  return (
${bodyLines.map((l) => '    ' + l).join('\n')}
  );
};
`;
  fs.writeFileSync(`src/components/${name}.tsx`, out);
  console.log(name, propsNames.length, 'props,', out.split('\n').length, 'lines');
}

// ---------- MenuFlowScreens ----------
{
  const propsNames = propsList('menuflow');
  const body = fs.readFileSync('.jsxsplit/menuflow.txt', 'utf8').split('\n');
  // region already yields sibling conditionals; wrap in a fragment
  const header = `import React from 'react';
import { AtmosphericDescent } from './AtmosphericDescent';
import { StartScreen } from './StartScreen';
import { IntroSequence } from './IntroSequence';
import { MainMenu } from './MainMenu';
import { GlobeView } from './GlobeView';
import { TacticalQuestTracker } from './TacticalQuestTracker';
import { OnboardingCelebrationModal } from './OnboardingCelebrationModal';
import { saveService } from '../services/saveService';
import { getInitialRadioDirectiveState } from '../services/radioDirectiveService';
import type { AppViewMode } from '../App';
import type { GameClockState } from '../types/combat';
import type { LocationPreset, MapData, SettlementPlacement } from '../types/map';
import type { SettlementState } from '../types/settlement';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import type { SettlementRecord, TradeCaravan } from '../types/caravan';
`;
  emit('MenuFlowScreens', header, propsNames, ['<>', ...body, '</>']);
}

// ---------- TacticalWorldScene ----------
{
  const propsNames = propsList('world');
  const raw = fs.readFileSync('.jsxsplit/world.txt', 'utf8').split('\n');
  // world.txt wraps everything in `{viewMode === 'world' && (<> ... </>)}`.
  // Strip line 1 (comment), line 2 (the `{viewMode === 'world' && (` gate), the
  // closing `</>` and `)}`; keep the inner `<>` fragment.
  const body = [
    '<>',
    ...raw.slice(3, raw.length - 4),
    '</>',
  ];
  const header = `import React from 'react';
import { Layers } from 'lucide-react';
import { GameCanvas } from './GameCanvas';
import { TacticalHeaderStrip } from './TacticalHeaderStrip';
import { AudioSettingsModal } from './AudioSettingsModal';
import { TacticalSquadSelectorStrip } from './TacticalSquadSelectorStrip';
import { SquadManagementModal } from './SquadManagementModal';
import { TacticalSquadHUD } from './TacticalSquadHUD';
import { BuildingAdaptationDrawer } from './BuildingAdaptationDrawer';
import { VehicleTacticalDrawer } from './VehicleTacticalDrawer';
import { AreaGatherOverlay } from './AreaGatherOverlay';
import { NotificationTray } from './NotificationTray';
import { TacticalActionBar } from './TacticalActionBar';
import { TacticalMinimapWidget } from './TacticalMinimapWidget';
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
import { isSquadInsideBuilding } from '../services/scavengingService';
import { calculateGlobalNetworkStats } from '../services/caravanService';
import { updateWorkerJobLimit, updateWorkerJobPriority, setWorkerJobToZero, setWorkerJobToMax } from '../services/populationService';
import type { WorldScene, FreestandingPlacementPoint } from '../render/WorldScene';
import type { GameClockState, NoiseEvent, TacticalSquadUnit, ZombieUnit, WeaponItemId, ArmorItemId } from '../types/combat';
import type { BuildingPolygon, MapData, Point2D, ResourceNode } from '../types/map';
import type { SettlementState, FunctionalBuildingTypeId } from '../types/settlement';
import type { HiddenSurvivorGroup } from '../types/population';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import type { SettlementRecord } from '../types/caravan';
import type { WorldVehicle } from '../types/vehicle';
type WorldScenePlacement = FreestandingPlacementPoint;
`;
  emit('TacticalWorldScene', header, propsNames, body);
}

// ---------- GlobalGameModals ----------
{
  const propsNames = propsList('modals');
  const body = fs.readFileSync('.jsxsplit/modals.txt', 'utf8').split('\n');
  const header = `import React from 'react';
import { NewGameSetupModal } from './NewGameSetupModal';
import { SaveLoadModal } from './SaveLoadModal';
import { TacticalPauseMenu } from './TacticalPauseMenu';
import { PopulationRosterModal } from './PopulationRosterModal';
import { ResearchTreeModal } from './ResearchTreeModal';
import { SurvivalCodexModal } from './SurvivalCodexModal';
import { FreestandingBuildModal } from './FreestandingBuildModal';
import { GameSettingsModal } from './GameSettingsModal';
import { CreditsModal } from './CreditsModal';
import { RadioTransmissionModal } from './RadioTransmissionModal';
import type { AppViewMode } from '../App';
import { soundService, ToastMessage } from '../services/soundService';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../data/functionalBuildings';
import { acknowledgeTransmission } from '../services/radioDirectiveService';
import type { GameClockState } from '../types/combat';
import type { SettlementState, FunctionalBuildingTypeId } from '../types/settlement';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import type { GameSettings } from '../types/saveGame';
import type { Point2D } from '../types/map';
`;
  emit('GlobalGameModals', header, propsNames, ['<>', ...body, '</>']);
}