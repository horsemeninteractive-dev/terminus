import { useMemo } from 'react';
import { useGameState } from './hooks/useGameState';
import { useSimulationLoop } from './hooks/useSimulationLoop';
import { useMapLoading } from './hooks/useMapLoading';
import { useSaveLoad } from './hooks/useSaveLoad';
import { useSettlementActions } from './hooks/useSettlementActions';
import { useSquadActions } from './hooks/useSquadActions';
import { useThreatActions } from './hooks/useThreatActions';
import { useWorldEffects } from './hooks/useWorldEffects';
import { MenuFlowScreens } from './components/MenuFlowScreens';
import { TacticalWorldScene } from './components/TacticalWorldScene';
import { GlobalGameModals } from './components/GlobalGameModals';

export type AppViewMode = 'start_screen' | 'intro' | 'main_menu' | 'globe' | 'world';

export default function App() {
  const {
    // Screen flow & globe
    viewMode, setViewMode, currentPreset, setCurrentPreset, activePlacement, setActivePlacement,
    // Modals & flow
    isNewGameModalOpen, setIsNewGameModalOpen, isSaveLoadModalOpen, setIsSaveLoadModalOpen,
    saveLoadMode, setSaveLoadMode, isPauseMenuOpen, setIsPauseMenuOpen, isCodexModalOpen, setIsCodexModalOpen,
    isSettingsModalOpen, setIsSettingsModalOpen, isCreditsModalOpen, setIsCreditsModalOpen,
    isPwaUpdateAvailable, setIsPwaUpdateAvailable,
    // Map loading
    mapData, setMapData, isLoading, setIsLoading, loadingMessage, setLoadingMessage,
    loadError, setLoadError, cacheSource, setCacheSource,
    isSceneRendered, setIsSceneRendered, pendingAdaptType, setPendingAdaptType,
    isDescentActive, setIsDescentActive, descentProgress, setDescentProgress, descentAltitudeKm,
    setDescentAltitudeKm, descentTimerRef, stopDescentTimer, handleLoadProgress,
    // Multi-settlement
    initialSettlementId, settlements, setSettlements, activeSettlementId, setActiveSettlementId,
    caravans, setCaravans, isCaravansModalOpen, setIsCaravansModalOpen,
    overrunSettlement, setOverrunSettlement, isExtinct, setIsExtinct,
    // Working settlement
    settlement, setSettlement, pendingFreestandingType, setPendingFreestandingType,
    scavengeQueue, setScavengeQueue, scavengeQueueRef,
    isFreestandingModalOpen, setIsFreestandingModalOpen, isPopulationModalOpen, setIsPopulationModalOpen,
    isSquadModalOpen, setIsSquadModalOpen, isMedbayModalOpen, setIsMedbayModalOpen,
    isVehicleModalOpen, setIsVehicleModalOpen, isResearchModalOpen, setIsResearchModalOpen,
    isMoraleModalOpen, setIsMoraleModalOpen, isWeatherModalOpen, setIsWeatherModalOpen,
    isLawModalOpen, setIsLawModalOpen, handleEnactLaw,
    isExpeditionModalOpen, setIsExpeditionModalOpen, handleDispatchExpedition, handleRecallExpedition,
    isAudioModalOpen, setIsAudioModalOpen,
    dangerLevel, setDangerLevel, selectedVehicleId, setSelectedVehicleId,
    activeRecruitmentGroup, setActiveRecruitmentGroup, contactedSurvivorGroupIdsRef,
    // Toasts
    toasts, setToasts, toastIdRef, handleToastNotify, setToastMessage, radioAlertIdsRef,
    lairDiscoveryAlertIdsRef,
    // Radio directives
    radioDirectiveState, setRadioDirectiveState, isRadioModalOpen, setIsRadioModalOpen,
    activeRadioTransmission, setActiveRadioTransmission,
    // Campaign missions
    missionState, setMissionState,
    isCelebrationModalOpen, setIsCelebrationModalOpen, handleClaimDawnReward,
    // Sidebar & alerts
    activeSidebarTab, setActiveSidebarTab, isQuestListOpen, setIsQuestListOpen,
    alerts, setAlerts, addTacticalAlert, handleDismissAlert, handleMinimapPanTo,
    // Combat & clock
    gameClock, setGameClock, zombies, setZombies, combatSquads, setCombatSquads,
    hostileHumans, setHostileHumans, activeRansomHideoutId, setActiveRansomHideoutId,
    combatSquadsRef, droppedItems, setDroppedItems, noiseEvents, setNoiseEvents,
    selectedSquadId, setSelectedSquadId, selectedSquadIds, setSelectedSquadIds,
    roadGraphRef, pathGridRef, fogVisibleCellsRef,
    // Selection & interaction
    selectedBuilding, setSelectedBuilding, selectedResourceNode, setSelectedResourceNode,
    hoveredBuilding, setHoveredBuilding, clickedPosition, setClickedPosition,
    timeOfDay, setTimeOfDay,
    // Elevation & layers
    elevationExaggeration, setElevationExaggeration, disableElevation, setDisableElevation,
    showTerrainWireframe, setShowTerrainWireframe,
    showBuildingEdges, setShowBuildingEdges, showBuildings, setShowBuildings,
    showRoads, setShowRoads, showWood, setShowWood, showMetal, setShowMetal,
    showBricks, setShowBricks, showLanduse, setShowLanduse, activeGatherType, setActiveGatherType,
    // Scavenge view & minimap layers
    isScavengeViewActive, setIsScavengeViewActive, scavengeFilterType, setScavengeFilterType,
    showStreetLabels, setShowStreetLabels, showSatelliteOverlay, setShowSatelliteOverlay,
    showPowerGrid, setShowPowerGrid,
    satelliteQuality, setSatelliteQuality,
    graphicsQuality, setGraphicsQuality,
    labelDetailMode, setLabelDetailMode, isHideUi, setIsHideUi,
    isExpeditionViewActive, setIsExpeditionViewActive,
    // Alarm
    isAlarmActive, setIsAlarmActive, alarmHoursRemaining, setAlarmHoursRemaining,
    mannedTowersCount, mannedGatesCount, handleToggleAlarm,
    // Scene & refs
    sceneRef, abortControllerRef, settlementRef, mapDataRef, gameClockRef, zombiesRef,
  } = useGameState();

  // Tutorial/mission feedback: TRUE while an active task asks the player to
  // muster their first squad (mission `form_squad` task, or the DIR-02
  // tutorial directive). Drives the glowing '+' form-squad button.
  const squadMusterActive = useMemo(() => {
    const missionAsk = (missionState?.activeMissions || []).some((m) =>
      m.tasks.some(
        (t) =>
          t.status === 'active' &&
          (t.type === 'form_squad' || t.focusAction === 'open_squad_panel' || t.focusAction === 'muster_squad')
      )
    );
    const directiveAsk = (radioDirectiveState?.activeDirectives || []).some(
      (d) =>
        d.status === 'active' &&
        (d.conditionType === 'form_squad' || d.actionType === 'muster_squad' || d.actionType === 'open_squad_panel')
    );
    return Boolean(missionAsk || directiveAsk);
  }, [missionState, radioDirectiveState]);

  // Suppress the world-space tutorial arrow while any full-screen modal covers
  // the world — pointing at a button the player can't see is worse than no hint.
  const isTutorialTargetObscured =
    isRadioModalOpen || isResearchModalOpen || isSaveLoadModalOpen || isCodexModalOpen ||
    isSettingsModalOpen || isCreditsModalOpen || isCaravansModalOpen || isFreestandingModalOpen ||
    isPopulationModalOpen || isSquadModalOpen || isMedbayModalOpen || isVehicleModalOpen ||
    isMoraleModalOpen || isWeatherModalOpen || isCelebrationModalOpen;

  settlementRef.current = settlement;
  // mapDataRef is synced inside useGameState only when the map state identity
  // changes; do NOT re-assign it here every render or the simulation loop's
  // per-tick resource-depletion commits would be clobbered.
  gameClockRef.current = gameClock;
  zombiesRef.current = zombies;

  // Standalone world-state effects (scene sync, audio lifecycle, gathering,
  // settlement/weather/morale sim, radio & caravan loops) — implementation in
  // hooks/useWorldEffects.ts.
  const { isInitialCommsPending, isHQSelectionUnlocked } = useWorldEffects({
    viewMode,
    isDescentActive,
    mapData,
    gameClock,
    gameClockRef,
    mapDataRef,
    settlement,
    settlementRef,
    zombies,
    zombiesRef,
    isAlarmActive,
    pathGridRef,
    roadGraphRef,
    sceneRef,
    fogVisibleCellsRef,
    combatSquadsRef,
    radioAlertIdsRef,
    lairDiscoveryAlertIdsRef,
    selectedBuilding,
    selectedSquadId,
    selectedVehicleId,
    selectedResourceNode,
    isScavengeViewActive,
    scavengeFilterType,
    showStreetLabels,
    showSatelliteOverlay,
    labelDetailMode,
    showBuildingEdges,
    isRadioModalOpen,
    isResearchModalOpen,
    isNewGameModalOpen,
    isSaveLoadModalOpen,
    isPauseMenuOpen,
    isCodexModalOpen,
    isSettingsModalOpen,
    isCreditsModalOpen,
    isCaravansModalOpen,
    isFreestandingModalOpen,
    isPopulationModalOpen,
    isSquadModalOpen,
    isMedbayModalOpen,
    isVehicleModalOpen,
    isMoraleModalOpen,
    isWeatherModalOpen,
    isAudioModalOpen,
    isCelebrationModalOpen,
    activeRecruitmentGroup,
    activeRansomHideoutId,
    overrunSettlement,
    caravans,
    settlements,
    activeSettlementId,
    setGameClock,
    setCombatSquads,
    setSelectedResourceNode,
    setSettlement,
    setSettlements,
    setOverrunSettlement,
    setIsExtinct,
    setCaravans,
    setToastMessage,
    radioDirectiveState,
    setRadioDirectiveState,
    setActiveRadioTransmission,
    setIsRadioModalOpen,
    missionState,
    setMissionState,
    setZombies,
    addTacticalAlert,
  });

  // Real-Time Combat, Day/Night Clock & Horde Simulation Tick (Every 100ms)
  // (§5, §5.1, §6.1) — the loop itself lives in hooks/useSimulationLoop.ts.
  useSimulationLoop({
    viewMode,
    isDescentActive,
    mapData,
    gameClock,
    zombies,
    combatSquads,
    hostileHumans,
    droppedItems,
    noiseEvents,
    selectedSquadId,
    selectedSquadIds,
    selectedVehicleId,
    settlement,
    timeOfDay,
    scavengeQueue,
    isAlarmActive,
    settlements,
    activeSettlementId,
    activePlacement,
    currentPreset,
    caravans,
    radioDirectiveState,
    missionState,
    dangerLevel,
    showSatelliteOverlay,
    satelliteQuality,
    settlementRef,
    mapDataRef,
    roadGraphRef,
    pathGridRef,
    combatSquadsRef,
    fogVisibleCellsRef,
    contactedSurvivorGroupIdsRef,
    scavengeQueueRef,
    sceneRef,
    setGameClock,
    setTimeOfDay,
    setZombies,
    setNoiseEvents,
    setToastMessage,
    setAlarmHoursRemaining,
    setIsAlarmActive,
    setDroppedItems,
    setHostileHumans,
    setSettlement,
    setScavengeQueue,
    setCombatSquads,
    setActiveRansomHideoutId,
    setActiveRecruitmentGroup,
    setDangerLevel,
    addTacticalAlert,
    // autoEquipScavengedGear is declared later in this component body; defer the
    // lookup into a closure so the hook only calls it once the body has run.
    autoEquipScavengedGear: (weaponId, armorId) => autoEquipScavengedGear(weaponId, armorId),
  });
  // Map pipeline + colony flow (loadLocation, found/switch colony, caravans)
  // — implementation moved to hooks/useMapLoading.ts.
  const {
    loadLocation,
    handleConfirmSettlementPlacement,
    handleBeginDescent,
    handleSelectExistingSettlement,
    handleDispatchCaravan,
  } = useMapLoading({
    settlements,
    activeSettlementId,
    settlement,
    mapData,
    zombies,
    gameClock,
    viewMode,
    setViewMode,
    abortControllerRef,
    roadGraphRef,
    pathGridRef,
    settlementRef,
    mapDataRef,
    sceneRef,
    descentTimerRef,
    stopDescentTimer,
    setIsLoading,
    setLoadError,
    setMapData,
    setPendingAdaptType,
    setLoadingMessage,
    setCacheSource,
    setDescentProgress,
    setDescentAltitudeKm,
    setIsDescentActive,
    setSettlement,
    setActiveSettlementId,
    setActivePlacement,
    setSelectedBuilding,
    setHoveredBuilding,
    setClickedPosition,
    setSelectedSquadId,
    setSelectedVehicleId,
    setCurrentPreset,
    setZombies,
    setCaravans,
    setSettlements,
    setRadioDirectiveState,
    setActiveRadioTransmission,
    setToastMessage,
    setIsCaravansModalOpen,
  });
  // Save/load, flow & keyboard handlers — implementation in hooks/useSaveLoad.ts.
  const {
    handleSaveGame,
    handleQuickSave,
    handleLoadGame,
    handleQuickLoad,
    handleContinueGame,
    handleStartNewGame,
    handleExitToMainMenu,
    handleApplyGameSettings,
    handleRestartGame,
    handleSelectPreset,
    handleFetchCustom,
    handleClearCache,
    handleRefetch,
    handleFocusBuilding,
    handleResetCamera,
    handleReturnToGlobe,
  } = useSaveLoad({
    settlement,
    gameClock,
    settlements,
    activeSettlementId,
    activePlacement,
    currentPreset,
    mapData,
    mapDataRef,
    caravans,
    radioDirectiveState,
    missionState,
    combatSquads,
    scavengeQueue,
    zombies,
    dangerLevel,
    timeOfDay,
    viewMode,
    showSatelliteOverlay,
    satelliteQuality,
    selectedBuilding,
    selectedSquadId,
    selectedVehicleId,
    combatSquadsRef,
    roadGraphRef,
    pathGridRef,
    sceneRef,
    descentTimerRef,
    loadLocation,
    stopDescentTimer,
    setToastMessage,
    setIsSaveLoadModalOpen,
    setSettlements,
    setActiveSettlementId,
    setSettlement,
    setGameClock,
    setActivePlacement,
    setCurrentPreset,
    setCaravans,
    setRadioDirectiveState,
    setActiveRadioTransmission,
    setMissionState,
    setDangerLevel,
    setTimeOfDay,
    setCombatSquads,
    setZombies,
    setMapData,
    setCacheSource,
    setIsPauseMenuOpen,
    setViewMode,
    setIsNewGameModalOpen,
    setOverrunSettlement,
    setIsExtinct,
    setIsCodexModalOpen,
    setIsSettingsModalOpen,
    setIsCreditsModalOpen,
    setElevationExaggeration,
    setDisableElevation,
    setShowTerrainWireframe,
    setShowBuildingEdges,
    setGraphicsQuality,
    setShowSatelliteOverlay,
    setSatelliteQuality,
    setSelectedBuilding,
    setSelectedSquadId,
    setSelectedSquadIds,
    setSelectedVehicleId,
    setScavengeQueue,
    setDescentProgress,
    setDescentAltitudeKm,
    setIsDescentActive,
  });
  // Settlement construction/adaptation/gathering actions — implementation in
  // hooks/useSettlementActions.ts.
  const {
    handleConfirmHQ,
    handleAdaptBuilding,
    handleAdaptBuildingSection,
    handleSplitBuilding,
    handleDeadaptBuilding,
    handleBuildFreestanding,
    handleBuildFreestandingRun,
    handleOrderDeconstruction,
    handleCancelDeconstruction,
    handleDesignateGatherArea,
    handleStartTraining,
    handleStopTraining,
  } = useSettlementActions({
    settlement,
    mapData,
    gameClock,
    zombies,
    selectedBuilding,
    gameClockRef,
    zombiesRef,
    settlementRef,
    radioAlertIdsRef,
    settlements,
    activeSettlementId,
    setSettlement,
    setSettlements,
    setOverrunSettlement,
    setIsExtinct,
    setSelectedBuilding,
    setGameClock,
    setRadioDirectiveState,
    setActiveRadioTransmission,
    setIsRadioModalOpen,
    setToastMessage,
    setPendingFreestandingType,
    setActiveGatherType,
    addTacticalAlert,
  });
  // Population & tactical squad actions — implementation in hooks/useSquadActions.ts.
  // handleSearchBuilding comes from useThreatActions below (deferred, so the two
  // hooks can call each other without a module-cycle).
  const {
    handleAppointHead,
    handleVacateSurvivorRole,
    handleUpdateJobPriorities,
    handleCreateSquad,
    handleModifySquadGeneralMembers,
    handleDisbandSquad,
    handleRecruitGroup,
    handleSelectSquad,
    handleSelectSquads,
    handleSelectVehicle,
    handleOrderSquadMove,
  } = useSquadActions({
    settlement,
    mapData,
    gameClock,
    zombies,
    combatSquads,
    selectedSquadId,
    gameClockRef,
    zombiesRef,
    settlementRef,
    combatSquadsRef,
    roadGraphRef,
    pathGridRef,
    setSettlement,
    setCombatSquads,
    setSelectedSquadId,
    setSelectedSquadIds,
    setSelectedVehicleId,
    setNoiseEvents,
    setToastMessage,
    setRadioDirectiveState,
    setActiveRadioTransmission,
    setIsRadioModalOpen,
    setActiveRecruitmentGroup,
    addTacticalAlert,
    handleSearchBuilding: (building, squadIdOverride) =>
      handleSearchBuilding(building, squadIdOverride),
  });
  // Threat response, vehicle, squad-attack/recall, building-search, scavenge-area
  // & utility actions — implementation in hooks/useThreatActions.ts.
  const {
    handleAssaultThreat,
    handlePayRansom,
    handleRefuseRescue,
    handleUpdateCombatSquads,
    handleMountVehicle,
    handleDismountVehicle,
    handleOrderVehicleExtraction,
    handleOrderVehicleMove,
    handleOrderSquadAttack,
    handleStartSquadScavengeArea,
    handleDesignateSquadScavenge,
    handleOrderSquadRecall,
    handleOrderAllSquadsRecall,
    handleSetClockSpeed,
    handleGrantFreshFood,
    handleDrainFoodStockpile,
    handleSetSeason,
    handleSetWeather,
    handleBuildGreenhouse,
    handleRepairBuilding,
    handleAssignGatherers,
    handleSearchBuilding,
    autoEquipScavengedGear,
    handleAssignWeapon,
    handleAssignTowerWeapon,
    handleAssignArmor,
    handleChangeSquadStance,
    handleStartResearchNode,
    handleRepairVehicle,
    handleRefuelVehicle,
    handleUpdateLaborAllocation,
    handleTriageSurvivor,
    handleDirectiveAction,
  } = useThreatActions({
    settlement,
    mapData,
    gameClock,
    zombies,
    hostileHumans,
    combatSquads,
    selectedSquadId,
    combatSquadsRef,
    sceneRef,
    roadGraphRef,
    pathGridRef,
    radioDirectiveState,
    setSettlement,
    setCombatSquads,
    setSelectedSquadId,
    setSelectedVehicleId,
    setSelectedBuilding,
    setNoiseEvents,
    setToastMessage,
    setActiveRansomHideoutId,
    setActiveGatherType,
    setScavengeQueue,
    setGameClock,
    setZombies,
    setActiveSidebarTab,
    setActiveRadioTransmission,
    setIsRadioModalOpen,
    setIsResearchModalOpen,
    setIsMedbayModalOpen,
    setIsSquadModalOpen,
    addTacticalAlert,
    handleOrderSquadMove,
  });

  return (
    <div className="relative w-screen h-screen bg-[#07080a] overflow-hidden select-none">
      <MenuFlowScreens
      activePlacement={activePlacement} activeSettlementId={activeSettlementId} caravans={caravans}
      currentPreset={currentPreset} descentAltitudeKm={descentAltitudeKm} descentProgress={descentProgress}
      gameClock={gameClock} handleBeginDescent={handleBeginDescent} handleClaimDawnReward={handleClaimDawnReward}
      handleConfirmSettlementPlacement={handleConfirmSettlementPlacement} handleContinueGame={handleContinueGame} handleDirectiveAction={handleDirectiveAction}
      handleSelectExistingSettlement={handleSelectExistingSettlement} isCelebrationModalOpen={isCelebrationModalOpen} isDescentActive={isDescentActive}
      isInitialCommsPending={isInitialCommsPending} isPwaUpdateAvailable={isPwaUpdateAvailable} isQuestListOpen={isQuestListOpen}
      isRadioModalOpen={isRadioModalOpen} loadingMessage={loadingMessage} missionState={missionState}
      radioDirectiveState={radioDirectiveState}
      setActivePlacement={setActivePlacement} setActiveRadioTransmission={setActiveRadioTransmission} setActiveSettlementId={setActiveSettlementId}
      setIsCodexModalOpen={setIsCodexModalOpen} setIsCreditsModalOpen={setIsCreditsModalOpen} setIsPwaUpdateAvailable={setIsPwaUpdateAvailable}
      setIsSaveLoadModalOpen={setIsSaveLoadModalOpen} setIsSettingsModalOpen={setIsSettingsModalOpen} setMapData={setMapData}
      setRadioDirectiveState={setRadioDirectiveState} setSaveLoadMode={setSaveLoadMode} setSettlements={setSettlements}
      setViewMode={setViewMode} settlement={settlement} settlements={settlements}
      viewMode={viewMode}
      />

      {viewMode === 'world' && (
        <TacticalWorldScene
      squadMusterActive={squadMusterActive} isTutorialTargetObscured={isTutorialTargetObscured} activeGatherType={activeGatherType} activeRansomHideoutId={activeRansomHideoutId} activeRecruitmentGroup={activeRecruitmentGroup}
      activeSidebarTab={activeSidebarTab} activeSettlementId={activeSettlementId} alerts={alerts} caravans={caravans}
      combatSquads={combatSquads} combatSquadsRef={combatSquadsRef} contactedSurvivorGroupIdsRef={contactedSurvivorGroupIdsRef}
      dangerLevel={dangerLevel} disableElevation={disableElevation} elevationExaggeration={elevationExaggeration}
      gameClock={gameClock} handleAdaptBuilding={handleAdaptBuilding} handleAdaptBuildingSection={handleAdaptBuildingSection}
      handleSplitBuilding={handleSplitBuilding} handleDeadaptBuilding={handleDeadaptBuilding}
      handleAppointHead={handleAppointHead}
      handleAssignArmor={handleAssignArmor} handleAssignWeapon={handleAssignWeapon} handleAssignTowerWeapon={handleAssignTowerWeapon}
      handleBuildFreestanding={handleBuildFreestanding}
      handleBuildFreestandingRun={handleBuildFreestandingRun} handleChangeSquadStance={handleChangeSquadStance} handleConfirmHQ={handleConfirmHQ}
      handleCreateSquad={handleCreateSquad} handleDesignateGatherArea={handleDesignateGatherArea} handleDesignateSquadScavenge={handleDesignateSquadScavenge}
      handleStartTraining={handleStartTraining} handleStopTraining={handleStopTraining}
      handleDisbandSquad={handleDisbandSquad} handleDismissAlert={handleDismissAlert} handleDismountVehicle={handleDismountVehicle}
      handleFocusBuilding={handleFocusBuilding} handleLoadProgress={handleLoadProgress} handleMinimapPanTo={handleMinimapPanTo}
      handleModifySquadGeneralMembers={handleModifySquadGeneralMembers} handleMountVehicle={handleMountVehicle} handleOrderDeconstruction={handleOrderDeconstruction}
      handleOrderSquadAttack={handleOrderSquadAttack} handleOrderSquadMove={handleOrderSquadMove} handleOrderSquadRecall={handleOrderSquadRecall} handleOrderAllSquadsRecall={handleOrderAllSquadsRecall}
      handleOrderVehicleExtraction={handleOrderVehicleExtraction} handlePayRansom={handlePayRansom} handleRecruitGroup={handleRecruitGroup}
      handleRefuseRescue={handleRefuseRescue} handleRepairBuilding={handleRepairBuilding} handleRestartGame={handleRestartGame}
      handleSearchBuilding={handleSearchBuilding} handleSelectExistingSettlement={handleSelectExistingSettlement} handleSelectSquad={handleSelectSquad} handleSelectSquads={handleSelectSquads} selectedSquadIds={selectedSquadIds}
      handleSelectVehicle={handleSelectVehicle} handleSetClockSpeed={handleSetClockSpeed} handleStartSquadScavengeArea={handleStartSquadScavengeArea}
      handleUpdateCombatSquads={handleUpdateCombatSquads} handleVacateSurvivorRole={handleVacateSurvivorRole} isAudioModalOpen={isAudioModalOpen}
      handleEnactLaw={handleEnactLaw} isLawModalOpen={isLawModalOpen} setIsLawModalOpen={setIsLawModalOpen}
      handleDispatchExpedition={handleDispatchExpedition} handleRecallExpedition={handleRecallExpedition}
      isExpeditionModalOpen={isExpeditionModalOpen} setIsExpeditionModalOpen={setIsExpeditionModalOpen}
      isExpeditionViewActive={isExpeditionViewActive} isExtinct={isExtinct} isHQSelectionUnlocked={isHQSelectionUnlocked}
      isHideUi={isHideUi} isInitialCommsPending={isInitialCommsPending} isQuestListOpen={isQuestListOpen}
      isScavengeViewActive={isScavengeViewActive} isSquadModalOpen={isSquadModalOpen} labelDetailMode={labelDetailMode}
      mapData={mapData} noiseEvents={noiseEvents} overrunSettlement={overrunSettlement}
      pendingAdaptType={pendingAdaptType} pendingFreestandingType={pendingFreestandingType} radioDirectiveState={radioDirectiveState}
      scavengeFilterType={scavengeFilterType} sceneRef={sceneRef} selectedBuilding={selectedBuilding}
      selectedSquadId={selectedSquadId} selectedVehicleId={selectedVehicleId} setActiveGatherType={setActiveGatherType}
      setActiveRadioTransmission={setActiveRadioTransmission} setActiveRansomHideoutId={setActiveRansomHideoutId} setActiveRecruitmentGroup={setActiveRecruitmentGroup}
      setActiveSidebarTab={setActiveSidebarTab} setClickedPosition={setClickedPosition} setHoveredBuilding={setHoveredBuilding}
      setSettlements={setSettlements}
      setIsAudioModalOpen={setIsAudioModalOpen} setIsExpeditionViewActive={setIsExpeditionViewActive} setIsFreestandingModalOpen={setIsFreestandingModalOpen}
      setIsHideUi={setIsHideUi} setIsMoraleModalOpen={setIsMoraleModalOpen} setIsPauseMenuOpen={setIsPauseMenuOpen}
      setIsPopulationModalOpen={setIsPopulationModalOpen} setIsQuestListOpen={setIsQuestListOpen} setIsRadioModalOpen={setIsRadioModalOpen}
      setIsResearchModalOpen={setIsResearchModalOpen} setIsScavengeViewActive={setIsScavengeViewActive} setIsSceneRendered={setIsSceneRendered}
      setIsSquadModalOpen={setIsSquadModalOpen} setIsVehicleModalOpen={setIsVehicleModalOpen} setIsWeatherModalOpen={setIsWeatherModalOpen}
      setLabelDetailMode={setLabelDetailMode} setOverrunSettlement={setOverrunSettlement} setPendingAdaptType={setPendingAdaptType}
      setPendingFreestandingType={setPendingFreestandingType} setScavengeFilterType={setScavengeFilterType} setSelectedBuilding={setSelectedBuilding}
      setSelectedResourceNode={setSelectedResourceNode} setSelectedSquadId={setSelectedSquadId} setSelectedVehicleId={setSelectedVehicleId}
      setSettlement={setSettlement} setShowBuildingEdges={setShowBuildingEdges} setShowLanduse={setShowLanduse}
      setShowPowerGrid={setShowPowerGrid}
      setShowSatelliteOverlay={setShowSatelliteOverlay} setSatelliteQuality={setSatelliteQuality}
      setShowStreetLabels={setShowStreetLabels} setToastMessage={setToastMessage}
      setToasts={setToasts} setViewMode={setViewMode} settlement={settlement}
      settlementRef={settlementRef} settlements={settlements} showBricks={showBricks}
      showBuildingEdges={showBuildingEdges} graphicsQuality={graphicsQuality} showBuildings={showBuildings} showLanduse={showLanduse}
      showMetal={showMetal} showPowerGrid={showPowerGrid} showRoads={showRoads} showSatelliteOverlay={showSatelliteOverlay}
      satelliteQuality={satelliteQuality}
      showStreetLabels={showStreetLabels} showTerrainWireframe={showTerrainWireframe} showWood={showWood}
      toasts={toasts} viewMode={viewMode} zombies={zombies}
      />
      )}

      <GlobalGameModals
      activeRadioTransmission={activeRadioTransmission} alarmHoursRemaining={alarmHoursRemaining} clickedPosition={clickedPosition}
      gameClock={gameClock} handleApplyGameSettings={handleApplyGameSettings} handleAppointHead={handleAppointHead}
      handleBuildFreestanding={handleBuildFreestanding} handleDirectiveAction={handleDirectiveAction} handleExitToMainMenu={handleExitToMainMenu}
      handleLoadGame={handleLoadGame} handleQuickSave={handleQuickSave} handleRestartGame={handleRestartGame}
      handleSaveGame={handleSaveGame} handleStartNewGame={handleStartNewGame} handleToggleAlarm={handleToggleAlarm}
      handleUpdateJobPriorities={handleUpdateJobPriorities} handleVacateSurvivorRole={handleVacateSurvivorRole} isAlarmActive={isAlarmActive}
      isCodexModalOpen={isCodexModalOpen} isCreditsModalOpen={isCreditsModalOpen} isFreestandingModalOpen={isFreestandingModalOpen}
      isNewGameModalOpen={isNewGameModalOpen} isPauseMenuOpen={isPauseMenuOpen} isPopulationModalOpen={isPopulationModalOpen}
      isRadioModalOpen={isRadioModalOpen} isResearchModalOpen={isResearchModalOpen} isSaveLoadModalOpen={isSaveLoadModalOpen}
      isSettingsModalOpen={isSettingsModalOpen}      mannedGatesCount={mannedGatesCount} mannedTowersCount={mannedTowersCount}
      missionState={missionState} setMissionState={setMissionState} mapData={mapData}
      caravans={caravans} settlements={settlements}
      radioDirectiveState={radioDirectiveState} saveLoadMode={saveLoadMode} setActiveRadioTransmission={setActiveRadioTransmission}
      setIsCodexModalOpen={setIsCodexModalOpen} setIsCreditsModalOpen={setIsCreditsModalOpen} setIsFreestandingModalOpen={setIsFreestandingModalOpen}
      setIsMedbayModalOpen={setIsMedbayModalOpen} setIsNewGameModalOpen={setIsNewGameModalOpen} setIsPauseMenuOpen={setIsPauseMenuOpen}
      setIsPopulationModalOpen={setIsPopulationModalOpen} setIsRadioModalOpen={setIsRadioModalOpen} setIsResearchModalOpen={setIsResearchModalOpen}
      setIsSaveLoadModalOpen={setIsSaveLoadModalOpen} setIsSettingsModalOpen={setIsSettingsModalOpen} setIsSquadModalOpen={setIsSquadModalOpen}
      setPendingAdaptType={setPendingAdaptType} setPendingFreestandingType={setPendingFreestandingType} setRadioDirectiveState={setRadioDirectiveState}
      setSaveLoadMode={setSaveLoadMode} setSelectedBuilding={setSelectedBuilding} setSettlement={setSettlement}
      setToastMessage={setToastMessage} setViewMode={setViewMode} settlement={settlement}
      settlementRef={settlementRef}
      />
    </div>
  );
}
