import React from 'react';
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
import { handleTransmissionResponse } from '../services/missionService';
import { enqueueTransmissions } from '../services/transmissionService';
import type { MissionState } from '../types/mission';
import type { GameClockState } from '../types/combat';
import type { SettlementState, FunctionalBuildingTypeId } from '../types/settlement';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import type { GameSettings, GameScenarioSettings } from '../types/saveGame';
import type { MapData, Point2D, BuildingPolygon, LocationPreset } from '../types/map';
import type { SettlementRecord, TradeCaravan } from '../types/caravan';

export interface GlobalGameModalsProps {
  activeRadioTransmission: RadioTransmission | null;
  alarmHoursRemaining: number;
  clickedPosition: Point2D | null;
  gameClock: GameClockState;
  handleApplyGameSettings: (settings: GameSettings) => void;
  handleAppointHead: (buildingId: string | number, survivorId: string) => void;
  handleBuildFreestanding: (typeId: FunctionalBuildingTypeId, pos: Point2D, rotationDeg?: number) => void;
  handleDirectiveAction: (actionType: string) => void;
  handleExitToMainMenu: () => void;
  handleLoadGame: (saveId: string) => void;
  handleQuickSave: () => void;
  handleRestartGame: () => void;
  handleSaveGame: (name: string, overwriteId?: string) => void;
  handleStartNewGame: (scenario: GameScenarioSettings, preset: LocationPreset, openGlobeDirectly?: boolean) => void;
  handleToggleAlarm: (active: boolean) => void;
  handleUpdateJobPriorities: (allocation: Partial<SettlementState['jobPriorities']>) => void;
  handleVacateSurvivorRole: (buildingId: string | number) => void;
  isAlarmActive: boolean;
  isCodexModalOpen: boolean;
  isCreditsModalOpen: boolean;
  missionState: MissionState;
  setMissionState: React.Dispatch<React.SetStateAction<MissionState>>;
  mapData: MapData | null;
  caravans: TradeCaravan[];
  settlements: Record<string, SettlementRecord>;
  isFreestandingModalOpen: boolean;
  isNewGameModalOpen: boolean;
  isPauseMenuOpen: boolean;
  isPopulationModalOpen: boolean;
  isRadioModalOpen: boolean;
  isResearchModalOpen: boolean;
  isSaveLoadModalOpen: boolean;
  isSettingsModalOpen: boolean;
  mannedGatesCount: number;
  mannedTowersCount: number;
  radioDirectiveState: RadioDirectiveState | null;
  saveLoadMode: 'save' | 'load';
  setActiveRadioTransmission: React.Dispatch<React.SetStateAction<RadioTransmission | null>>;
  setIsCodexModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCreditsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsFreestandingModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMedbayModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsNewGameModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPauseMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPopulationModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRadioModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsResearchModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSaveLoadModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSquadModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingAdaptType: React.Dispatch<React.SetStateAction<FunctionalBuildingTypeId | null>>;
  setPendingFreestandingType: React.Dispatch<React.SetStateAction<FunctionalBuildingTypeId | null>>;
  setRadioDirectiveState: React.Dispatch<React.SetStateAction<RadioDirectiveState>>;
  setSaveLoadMode: React.Dispatch<React.SetStateAction<'save' | 'load'>>;
  setSelectedBuilding: React.Dispatch<React.SetStateAction<BuildingPolygon | null>>;
  setSettlement: any;
  setToastMessage: (msg: ToastMessage | null) => void;
  setViewMode: (m: AppViewMode) => void;
  settlement: SettlementState;
  settlementRef?: React.MutableRefObject<SettlementState>;
}

export const GlobalGameModals: React.FC<GlobalGameModalsProps> = (props) => {
  const {
    activeRadioTransmission,
    alarmHoursRemaining,
    clickedPosition,
    gameClock,
    handleApplyGameSettings,
    handleAppointHead,
    handleBuildFreestanding,
    handleDirectiveAction,
    handleExitToMainMenu,
    handleLoadGame,
    handleQuickSave,
    handleRestartGame,
    handleSaveGame,
    handleStartNewGame,
    handleToggleAlarm,
    handleUpdateJobPriorities,
    handleVacateSurvivorRole,
    isAlarmActive,
    isCodexModalOpen,
    isCreditsModalOpen,
    isFreestandingModalOpen,
    isNewGameModalOpen,
    isPauseMenuOpen,
    isPopulationModalOpen,
    isRadioModalOpen,
    isResearchModalOpen,
    isSaveLoadModalOpen,
    isSettingsModalOpen,
    mannedGatesCount,
    mannedTowersCount,
    missionState,
    setMissionState,
    mapData,
    caravans,
    settlements,
    radioDirectiveState,
    saveLoadMode,
    setActiveRadioTransmission,
    setIsCodexModalOpen,
    setIsCreditsModalOpen,
    setIsFreestandingModalOpen,
    setIsMedbayModalOpen,
    setIsNewGameModalOpen,
    setIsPauseMenuOpen,
    setIsPopulationModalOpen,
    setIsRadioModalOpen,
    setIsResearchModalOpen,
    setIsSaveLoadModalOpen,
    setIsSettingsModalOpen,
    setIsSquadModalOpen,
    setPendingAdaptType,
    setPendingFreestandingType,
    setRadioDirectiveState,
    setSaveLoadMode,
    setSelectedBuilding,
    setSettlement,
    setToastMessage,
    setViewMode,
    settlement,
  } = props;

  // Route mission briefing responses (accept/decline/branch) into the mission
  // engine. The mission is created HERE — never by a simulation tick.
  const handleMissionResponse = React.useCallback(
    (txId: string, action?: string) => {
      const tx = radioDirectiveState?.transmissionLog?.find((t) => t.id === txId);
      if (!tx?.missionId || !action) return;
      const ctx = {
        mapData: mapData || undefined,
        caravans,
        settlements: (Object.values(settlements) as SettlementRecord[]).map((s) => ({
          id: s.id,
          name: s.name,
        })),
      };
      const result = handleTransmissionResponse(
        missionState,
        tx,
        action,
        settlement,
        gameClock,
        ctx
      );
      setMissionState(result.newState);
      if (result.newTransmissions.length > 0 && radioDirectiveState) {
        setRadioDirectiveState((prev) => enqueueTransmissions(prev, result.newTransmissions));
      }
    },
    [
      radioDirectiveState,
      missionState,
      mapData,
      caravans,
      settlements,
      settlement,
      gameClock,
    ]
  );

  return (
    <>
    
          {/* New Game Setup Modal */}
          <NewGameSetupModal
            isOpen={isNewGameModalOpen}
            onClose={() => setIsNewGameModalOpen(false)}
            onStartGame={handleStartNewGame}
          />
    
          {/* Save / Load Game Modal */}
          <SaveLoadModal
            isOpen={isSaveLoadModalOpen}
            mode={saveLoadMode}
            onClose={() => setIsSaveLoadModalOpen(false)}
            onSaveGame={(name, overwriteId) => handleSaveGame(name, overwriteId)}
            onLoadGame={handleLoadGame}
            activeColonyName={settlement.name}
            activeDayNumber={gameClock.day}
          />
    
          {/* In-Game Tactical Pause Menu (ESC / Header Menu) */}
          <TacticalPauseMenu
            isOpen={isPauseMenuOpen}
            onResume={() => setIsPauseMenuOpen(false)}
            onQuickSave={handleQuickSave}
            onOpenSave={() => {
              setSaveLoadMode('save');
              setIsSaveLoadModalOpen(true);
            }}
            onSaveGame={() => {
              setSaveLoadMode('save');
              setIsSaveLoadModalOpen(true);
            }}
            onOpenLoad={() => {
              setSaveLoadMode('load');
              setIsSaveLoadModalOpen(true);
            }}
            onLoadGame={() => {
              setSaveLoadMode('load');
              setIsSaveLoadModalOpen(true);
            }}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onOpenCodex={() => setIsCodexModalOpen(true)}
            onOpenGlobe={() => {
              setIsPauseMenuOpen(false);
              setViewMode('globe');
            }}
            onRestartScenario={handleRestartGame}
            onExitToMainMenu={handleExitToMainMenu}
            settlement={settlement}
            clock={gameClock}
            colonyName={settlement.name}
            dayNumber={gameClock.day}
            season={settlement.weather?.currentSeason || 'summer'}
          />
    
          {/* Population & Workforce Command Modal (§4.1 - §4.6) */}
          <PopulationRosterModal
            isOpen={isPopulationModalOpen}
            onClose={() => setIsPopulationModalOpen(false)}
            settlement={settlement}
            onVacateSurvivorRole={handleVacateSurvivorRole}
            onAppointHead={handleAppointHead}
            onUpdateJobPriority={handleUpdateJobPriorities}
            onOpenSquads={() => setIsSquadModalOpen(true)}
            onOpenMedbay={() => setIsMedbayModalOpen(true)}
          />
    
          {/* Colony Technology Tree Modal (§10) — rendered once but only mounts when open */}
          {isResearchModalOpen && (
            <ResearchTreeModal
              settlement={settlement}
              onUpdateSettlement={(updated) => {
                if (props.settlementRef) props.settlementRef.current = updated;
                setSettlement(updated);
              }}
              onClose={() => setIsResearchModalOpen(false)}
              isNight={gameClock.isNight}
            />
          )}
    
          {/* Survival Codex / Guide Modal */}
          <SurvivalCodexModal
            isOpen={isCodexModalOpen}
            onClose={() => setIsCodexModalOpen(false)}
          />
    
          {/* Freestanding Building Construction Catalog Modal (§7.2) */}
          <FreestandingBuildModal
            isOpen={isFreestandingModalOpen}
            onClose={() => setIsFreestandingModalOpen(false)}
            settlement={settlement}
            targetPosition={clickedPosition}
            onBuildFreestanding={handleBuildFreestanding}
            onArmBlueprint={(typeId) => {
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
            }}
          />
    
          {/* Game Settings Modal */}
          <GameSettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            onApplySettings={handleApplyGameSettings}
          />
    
          {/* Credits Modal */}
          <CreditsModal
            isOpen={isCreditsModalOpen}
            onClose={() => setIsCreditsModalOpen(false)}
          />
    
          {/* Safe Zones Operations Radio Console Modal (§TERMINUS PROTOCOL) */}
          <RadioTransmissionModal
            isOpen={isRadioModalOpen}
            onClose={() => setIsRadioModalOpen(false)}
            radioState={radioDirectiveState}
            activeTransmission={activeRadioTransmission}
            transmissionHistory={radioDirectiveState.transmissionLog}
            activeDirectives={radioDirectiveState.activeDirectives}
            isAlarmActive={isAlarmActive}
            alarmHoursRemaining={alarmHoursRemaining}
            onToggleAlarm={handleToggleAlarm}
            mannedTowersCount={mannedTowersCount}
            mannedGatesCount={mannedGatesCount}
            onAcknowledgeTransmission={(txId) => {
              setRadioDirectiveState((prev) => acknowledgeTransmission(prev, txId));
            }}
            onSelectTransmission={(tx) => {
              setActiveRadioTransmission(tx);
              setRadioDirectiveState((prev) => acknowledgeTransmission(prev, tx.id));
            }}
            declinedMissionIds={missionState.declinedMissionIds}
            onAcknowledge={(txId, action) => {
              handleMissionResponse(txId, action);
            }}
            onActionTrigger={(actionType) => {
              // Mission response choices (accept/decline/branch) are handled by
              // the mission engine, not the directive action dispatcher.
              if (
                actionType === 'accept' ||
                actionType === 'decline' ||
                actionType.startsWith('branch:')
              ) {
                return;
              }
              setIsRadioModalOpen(false);
              handleDirectiveAction(actionType);
            }}
            />
    
    </>
  );
};
