// One-shot: reconstruct App.tsx = intact head (1..280) + useWorldEffects call +
// six hook calls (fields derived from each hook's runtime interface) + three view
// components (props derived from .jsxsplit/*.props-clean.txt).
const fs = require('fs');

// ---- brace-aware parser: extract top-level field names from `export interface X { ... }` ----
function ifaceFields(file, ifaceName) {
  const src = fs.readFileSync(file, 'utf8');
  const re = new RegExp('export interface ' + ifaceName + ' \\{');
  const m = src.match(re);
  if (!m) throw new Error('no interface ' + ifaceName + ' in ' + file);
  let i = m.index + m[0].length;
  let depth = 1; // we are already inside the interface body (its opening { was consumed)
  let paren = 0;
  let inStr = null;
  let cur = '';
  let fieldName = null;
  const fields = [];
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); i = e + 1; continue; }
    if (ch === '{') { depth++; if (depth === 1) cur = ''; continue; }
    if (ch === '}') {
      depth--;
      if (depth === 0) break;
      continue;
    }
    if (depth !== 1) continue;
    if (ch === '(') { paren++; continue; }
    if (ch === ')') { paren--; continue; }
    if (paren > 0) continue;
    if (ch === ':' && fieldName === null && cur.trim()) {
      fieldName = cur.trim().replace(/\?$/, '');
      cur = '';
      continue;
    }
    if (ch === ';' || ch === '\n') {
      if (fieldName) { fields.push(fieldName); fieldName = null; }
      cur = '';
      continue;
    }
    if (ch !== ' ') cur += ch;
  }
  return fields;
}

const current = fs.readFileSync('src/App.tsx', 'utf8').split('\n');

// 1. Head: original lines 1..280, which survived both splices. Ensure the
//    useWorldEffects/component imports are present.
let head = current.slice(0, 280);
{
  const h = head.join('\n');
  if (!h.includes("useWorldEffects")) {
    const idx = head.findIndex((l) => l.includes("import { useThreatActions }"));
    head.splice(idx + 1, 0, "import { useWorldEffects } from './hooks/useWorldEffects';");
  }
  if (!h.includes("MenuFlowScreens")) {
    const idx = head.findIndex((l) => l.includes("useWorldEffects"));
    head.splice(idx + 1, 0,
      "import { MenuFlowScreens } from './components/MenuFlowScreens';",
      "import { TacticalWorldScene } from './components/TacticalWorldScene';",
      "import { GlobalGameModals } from './components/GlobalGameModals';");
  }
}

// 2. useWorldEffects call — fields from WorldEffectsRuntime.
const worldFields = ifaceFields('src/hooks/useWorldEffects.ts', 'WorldEffectsRuntime');
const worldEffects = `  // Standalone world-state effects (scene sync, audio lifecycle, gathering,
  // settlement/weather/morale sim, radio & caravan loops) — implementation in
  // hooks/useWorldEffects.ts.
  const { isInitialCommsPending, isHQSelectionUnlocked } = useWorldEffects({
${worldFields.map((f) => `    ${f},`).join('\n')}
  });`;

// 3. Six hook calls — fields derived from each hook's runtime interface.
function hookCallDoc(setterName, ifaceName, file, comment, extraProps) {
  const fields = ifaceFields(file, ifaceName);
  const extra = (extraProps || []).map((f) => `    ${f},`).join('\n');
  return `  ${comment}
  const result = ${setterName}({
${fields.map((f) => `    ${f},`).join('\n')}
${extra}${extra ? '\n' : ''}  });`;
}

const calls = [];
calls.push(`  // Real-Time Combat, Day/Night Clock & Horde Simulation Tick (Every 100ms)
  // (§5, §5.1, §6.1) — the loop itself lives in hooks/useSimulationLoop.ts.
  useSimulationLoop({
${ifaceFields('src/hooks/useSimulationLoop.ts', 'SimLoopRuntime')
    .filter((f) => f !== 'autoEquipScavengedGear')
    .map((f) => `    ${f},`).join('\n')}
    // autoEquipScavengedGear is declared later in this component body; defer the
    // lookup into a closure so the hook only calls it once the body has run.
    autoEquipScavengedGear: (weaponId, armorId) => autoEquipScavengedGear(weaponId, armorId),
  });`);

calls.push(`  // Map pipeline + colony flow (loadLocation, found/switch colony, caravans)
  // — implementation moved to hooks/useMapLoading.ts.
  const {
    loadLocation,
    handleConfirmSettlementPlacement,
    handleBeginDescent,
    handleSelectExistingSettlement,
    handleDispatchCaravan,
  } = useMapLoading({
${ifaceFields('src/hooks/useMapLoading.ts', 'MapLoadingRuntime').map((f) => `    ${f},`).join('\n')}
  });`);

calls.push(`  // Save/load, flow & keyboard handlers — implementation in hooks/useSaveLoad.ts.
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
${ifaceFields('src/hooks/useSaveLoad.ts', 'SaveLoadRuntime').map((f) => `    ${f},`).join('\n')}
  });`);

calls.push(`  // Settlement construction/adaptation/gathering actions — implementation in
  // hooks/useSettlementActions.ts.
  const {
    handleConfirmHQ,
    handleAdaptBuilding,
    handleBuildFreestanding,
    handleBuildFreestandingRun,
    handleOrderDeconstruction,
    handleCancelDeconstruction,
    handleDesignateGatherArea,
  } = useSettlementActions({
${ifaceFields('src/hooks/useSettlementActions.ts', 'SettlementActionsRuntime').map((f) => `    ${f},`).join('\n')}
  });`);

calls.push(`  // Population & tactical squad actions — implementation in hooks/useSquadActions.ts.
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
    handleSelectVehicle,
    handleOrderSquadMove,
  } = useSquadActions({
${ifaceFields('src/hooks/useSquadActions.ts', 'SquadActionsRuntime')
    .filter((f) => f !== 'handleSearchBuilding')
    .map((f) => `    ${f},`).join('\n')}
    handleSearchBuilding: (building, squadIdOverride) =>
      handleSearchBuilding(building, squadIdOverride),
  });`);

calls.push(`  // Threat response, vehicle, squad-attack/recall, building-search, scavenge-area
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
    handleAssignArmor,
    handleChangeSquadStance,
    handleStartResearchNode,
    handleRepairVehicle,
    handleRefuelVehicle,
    handleUpdateLaborAllocation,
    handleTriageSurvivor,
    handleDirectiveAction,
  } = useThreatActions({
${ifaceFields('src/hooks/useThreatActions.ts', 'ThreatActionsRuntime')
    .filter((f) => f !== 'handleOrderSquadMove')
    .map((f) => `    ${f},`).join('\n')}
    handleOrderSquadMove,
  });`);

// 4. View components into the root div.
function propsList(label) {
  return fs.readFileSync(`.jsxsplit/${label}.props-clean.txt`, 'utf8').trim().split('\n').filter(Boolean);
}
function callBlock(name, label, pad) {
  const props = propsList(label);
  const rows = [];
  for (let i = 0; i < props.length; i += 3) rows.push('      ' + props.slice(i, i + 3).map((p) => `${p}={${p}}`).join(' '));
  return `${pad}<${name}\n${rows.join('\n')}\n      />`;
}
const menuBlock = callBlock('MenuFlowScreens', 'menuflow', '      ');
const worldBlock = `      {viewMode === 'world' && (
${callBlock('TacticalWorldScene', 'world', '        ')}
      )}`;
const modalsBlock = callBlock('GlobalGameModals', 'modals', '      ');

const out = [
  ...head,
  '',
  worldEffects,
  '',
  ...calls,
  '',
  '  return (',
  '    <div className="relative w-screen h-screen bg-[#07080a] overflow-hidden select-none">',
  menuBlock,
  '',
  worldBlock,
  '',
  modalsBlock,
  '    </div>',
  '  );',
  '}',
  '',
];
fs.writeFileSync('src/App.tsx', out.join('\n'));
console.log('App.tsx rebuilt, lines:', out.length, '(target <1000)');
