import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Regression: adapting a building (which completes fine) then placing a
 * freestanding field left the field permanently unbuilt. Root cause: the
 * single-placement handlers committed `setSettlement(res.newState)` but never
 * synced `settlementRef.current`, so the very next simulation tick ran on the
 * pre-placement state and overwrote both the ref and React state — the field
 * and its construction order vanished before a crew ever reached it.
 *
 * The simulation loop reads `settlementRef.current` (useSimulationLoop.ts:
 * `let workingSettlement = settlementRef.current`) and commits back
 * `settlementRef.current = nextState; setSettlement(nextState)`. Therefore
 * EVERY settlement action that mutates settlement state MUST update the ref
 * in the same commit, ref-first. This test pins that contract for the
 * handlers that had the hole.
 */
test('settlement actions sync settlementRef before/with React state commit', () => {
  const hookPath = fileURLToPath(new URL('../src/hooks/useSettlementActions.ts', import.meta.url));
  const source = readFileSync(hookPath, 'utf8');

  // Split the hook into handler bodies and assert each mutating handler
  // contains a settlementRef sync. A handler that commits new state without
  // syncing the ref would silently lose the mutation to the next sim tick.
  const handlerNames = [
    'handleConfirmHQ',
    'handleAdaptBuilding',
    'handleSplitBuilding',
    'handleAdaptBuildingSection',
    'handleDeadaptBuilding',
    'handleBuildFreestanding',
    'handleBuildFreestandingRun',
    'handleOrderDeconstruction',
    'handleCancelDeconstruction',
  ];

  // Locate each handler declaration and scan to the NEXT handler declaration
  // (or end of file), so growing handler bodies never outgrow a fixed window.
  const declPositions = handlerNames
    .map((name) => ({ name, idx: source.indexOf(`const ${name} =`) }))
    .filter((h) => {
      assert.notEqual(h.idx, -1, `handler ${h.name} not found in useSettlementActions.ts`);
      return true;
    })
    .sort((a, b) => a.idx - b.idx);

  for (let i = 0; i < declPositions.length; i++) {
    const { name, idx } = declPositions[i];
    const end = i + 1 < declPositions.length ? declPositions[i + 1].idx : source.length;
    const body = source.slice(idx, end);
    assert.match(
      body,
      /settlementRef\.current\s*=/,
      `${name} commits settlement state without syncing settlementRef.current — the sim loop will discard the change on its next tick`
    );
  }
});
