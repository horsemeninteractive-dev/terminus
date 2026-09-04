import React from 'react';
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
import type { MissionState } from '../types/mission';
import type { RadioDirectiveState, RadioTransmission } from '../types/radioDirective';
import type { SettlementRecord, TradeCaravan } from '../types/caravan';
import type { GameScenarioSettings } from '../types/saveGame';

// localStorage key recording that the first-launch cinematic credits roll
// (IntroSequence) has already played for this user.
const BOOT_INTRO_SEEN_KEY = 'terminus_ifz_boot_intro_seen';

function hasSeenBootIntro(): boolean {
  try {
    return localStorage.getItem(BOOT_INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markBootIntroSeen(): void {
  try {
    localStorage.setItem(BOOT_INTRO_SEEN_KEY, '1');
  } catch {
    // Storage may be unavailable (private mode) — the intro simply replays.
  }
}

export interface MenuFlowScreensProps {
  activePlacement: SettlementPlacement | null;
  activeSettlementId: string;
  caravans: TradeCaravan[];
  currentPreset: LocationPreset;
  descentAltitudeKm: number;
  descentProgress: number;
  gameClock: GameClockState;
  handleBeginDescent: (
    placement: SettlementPlacement,
    preloadedMapData?: MapData | null,
    scenarioSettings?: Partial<GameScenarioSettings>
  ) => void;
  handleClaimDawnReward: () => void;
  handleConfirmSettlementPlacement: (placement: SettlementPlacement) => void;
  handleContinueGame: () => void;
  handleDirectiveAction: (actionType: string) => void;
  handleSelectExistingSettlement: (id: string) => void;
  isCelebrationModalOpen: boolean;
  isDescentActive: boolean;
  isInitialCommsPending: boolean;
  isPwaUpdateAvailable: boolean;
  isQuestListOpen: boolean;
  isRadioModalOpen: boolean;
  loadingMessage: string | null;
  missionState: MissionState;
  radioDirectiveState: RadioDirectiveState | null;
  setActivePlacement: React.Dispatch<React.SetStateAction<SettlementPlacement | null>>;
  setActiveRadioTransmission: React.Dispatch<React.SetStateAction<RadioTransmission | null>>;
  setActiveSettlementId: React.Dispatch<React.SetStateAction<string>>;
  setIsCodexModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCreditsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPwaUpdateAvailable: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSaveLoadModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMapData: React.Dispatch<React.SetStateAction<MapData | null>>;
  setRadioDirectiveState: React.Dispatch<React.SetStateAction<RadioDirectiveState>>;
  setSaveLoadMode: React.Dispatch<React.SetStateAction<'save' | 'load'>>;
  setSettlements: React.Dispatch<React.SetStateAction<Record<string, SettlementRecord>>>;
  setViewMode: (m: AppViewMode) => void;
  settlement: SettlementState;
  settlements: Record<string, SettlementRecord>;
  viewMode: AppViewMode;
}

export const MenuFlowScreens: React.FC<MenuFlowScreensProps> = (props) => {
  const {
    activePlacement,
    activeSettlementId,
    caravans,
    currentPreset,
    descentAltitudeKm,
    descentProgress,
    gameClock,
    handleBeginDescent,
    handleClaimDawnReward,
    handleConfirmSettlementPlacement,
    handleContinueGame,
    handleDirectiveAction,
    handleSelectExistingSettlement,
    isCelebrationModalOpen,
    isDescentActive,
    isInitialCommsPending,
    isPwaUpdateAvailable,
    isQuestListOpen,
    isRadioModalOpen,
    loadingMessage,
    missionState,
    radioDirectiveState,
    setActivePlacement,
    setActiveRadioTransmission,
    setActiveSettlementId,
    setIsCodexModalOpen,
    setIsCreditsModalOpen,
    setIsPwaUpdateAvailable,
    setIsSaveLoadModalOpen,
    setIsSettingsModalOpen,
    setMapData,
    setRadioDirectiveState,
    setSaveLoadMode,
    setSettlements,
    setViewMode,
    settlement,
    settlements,
    viewMode,
  } = props;
  return (
    <>
          {/* Single atmospheric-descent loading screen — covers every view and stays
              up until the world scene has rendered, so all loading happens here. */}
          {isDescentActive && (
            <AtmosphericDescent
              progress={descentProgress}
              altitudeKm={descentAltitudeKm}
              zoneName={activePlacement?.sectorName || currentPreset.name || 'SECTOR'}
              lat={activePlacement?.center.lat ?? currentPreset.lat}
              lon={activePlacement?.center.lon ?? currentPreset.lon}
              status={loadingMessage || undefined}
            />
          )}
    
          {isPwaUpdateAvailable && (
            <div className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 bg-[#0E1013] border border-[#B31217] px-4 py-3 shadow-2xl flex items-center gap-4">
              <span className="text-xs font-heading uppercase tracking-wider text-white">A newer Terminus build is ready.</span>
              <button className="px-3 py-1.5 bg-[#B31217] text-white text-xs font-heading uppercase" onClick={() => window.location.reload()}>UPDATE</button>
              <button className="text-xs text-[#8C9BAE]" onClick={() => setIsPwaUpdateAvailable(false)}>×</button>
            </div>
          )}
    
          {/* 0a. Initial Start Screen (Fullscreen & Input Detection: Touch vs Click) */}
          {viewMode === 'start_screen' && (
            <StartScreen
              onStart={() => {
                // The cinematic credits roll before the menu only plays on the
                // very first launch; returning players jump straight to the menu.
                if (hasSeenBootIntro()) {
                  setViewMode('main_menu');
                } else {
                  markBootIntroSeen();
                  setViewMode('intro');
                }
              }}
            />
          )}
    
          {/* 0b. Cinematic Engine & Studio Intro Sequence */}
          {viewMode === 'intro' && (
            <IntroSequence onComplete={() => setViewMode('main_menu')} />
          )}
    
          {/* 0c. IFZ Game Flow: Main Menu (§ IFZ Game Flow) */}
          {viewMode === 'main_menu' && (
            <MainMenu
              onContinue={handleContinueGame}
              onNewGame={() => {
                setRadioDirectiveState(getInitialRadioDirectiveState());
                setActiveRadioTransmission(getInitialRadioDirectiveState().currentIncomingTransmission);
                setSettlements({});
                setActiveSettlementId('');
                setActivePlacement(null);
                setMapData(null);
                setViewMode('globe');
              }}
              onOpenLoadGame={() => {
                setSaveLoadMode('load');
                setIsSaveLoadModalOpen(true);
              }}
              onLoadGame={() => {
                setSaveLoadMode('load');
                setIsSaveLoadModalOpen(true);
              }}
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onOpenCodex={() => setIsCodexModalOpen(true)}
              onOpenCredits={() => setIsCreditsModalOpen(true)}
              hasExistingSave={saveService.hasSaves()}
              latestSave={saveService.getLatestSave()}
            />
          )}
    
          {/* 1. Rotatable 3D Satellite Globe Entry View (§3.4, §7.5) */}
          {viewMode === 'globe' && (
            <GlobeView
              onConfirmSettlement={handleConfirmSettlementPlacement}
              onBeginDescent={handleBeginDescent}
              initialLocation={
                activePlacement
                  ? activePlacement.center
                  : { lat: currentPreset.lat, lon: currentPreset.lon }
              }
              settlements={settlements}
              activeSettlementId={activeSettlementId}
              caravans={caravans}
              onSelectExistingSettlement={handleSelectExistingSettlement}
              onCancelReturnToGame={
                settlements[activeSettlementId]?.status === 'operational'
                  ? () => setViewMode('world')
                  : () => setViewMode('main_menu')
              }
            />
          )}
    
          {/* Guided Safe Zones Operations Directives & Quest Tracker */}
          {viewMode === 'world' && isQuestListOpen && !isInitialCommsPending && (
            <TacticalQuestTracker
              settlement={settlement}
              radioState={radioDirectiveState}
              missionState={missionState}
              onActionClick={handleDirectiveAction}
            />
          )}
    
          {/* 3D Tactical Scene Darkening when Initial Radio Communication is Pending */}
          {viewMode === 'world' && isInitialCommsPending && !isRadioModalOpen && (
            <div
              id="initial-comms-darkening-overlay"
              className="fixed inset-0 z-10 bg-black/60 backdrop-blur-[1.5px] pointer-events-none transition-opacity duration-700 animate-in fade-in"
              aria-hidden="true"
            />
          )}
    
          {/* Onboarding Celebration / First Dawn Modal (§14) */}
          <OnboardingCelebrationModal
            isOpen={isCelebrationModalOpen}
            onClaimReward={handleClaimDawnReward}
            dayNumber={gameClock.day}
            colonyName={settlement.name}
            populationCount={settlement.namedSurvivors.length + settlement.generalPopulation.total}
          />
    
    
    </>
  );
};
