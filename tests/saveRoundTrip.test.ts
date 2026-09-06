import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSettlementState, establishSettlementHQ } from '../src/services/settlementService';
import { createBuildingSearchState } from '../src/services/scavengingService';
import { deserializeSettlementState, serializeSettlementState } from '../src/services/saveService';
import type { BuildingPolygon } from '../src/types/map';

function makeHqBuilding(): BuildingPolygon {
  return {
    id: 'b_hq',
    type: 'residential',
    rawType: 'residential',
    name: 'Command House',
    height: 8,
    levels: 2,
    polygon: [
      { x: -8, z: -8 },
      { x: 8, z: -8 },
      { x: 8, z: 8 },
      { x: -8, z: 8 },
    ],
    center: { x: 0, z: 0 },
  } as unknown as BuildingPolygon;
}

function buildSeededSettlement() {
  const settlement = establishSettlementHQ(createInitialSettlementState('Round Trip'), makeHqBuilding());
  settlement.buildingSearches.set('b_search', createBuildingSearchState('b_search'));
  settlement.demolishedBuildings.set('b_demolished', true);
  return settlement;
}

/** Recursively assert the serialized tree contains no Map/Set instance. A
 *  forgotten Map field would silently JSON.stringify to {} — the exact data
 *  loss this schema must never ship. */
function assertJsonSafe(value: unknown, path = '$'): void {
  if (value instanceof Map || value instanceof Set) {
    assert.fail(`Serialized payload still holds a ${value.constructor.name} at ${path} — add it to serializeSettlementState's mapToEntries conversion.`);
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertJsonSafe(v, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      assertJsonSafe(v, `${path}.${k}`);
    }
  }
}

test('serialized settlement contains no Map/Set (JSON-safe save payload)', () => {
  const serialized = serializeSettlementState(buildSeededSettlement());
  assertJsonSafe(serialized);
  // And it survives an actual JSON.stringify/parse without losing structure.
  const reparsed = JSON.parse(JSON.stringify(serialized));
  assert.equal(reparsed.name, 'Round Trip');
  assert.ok(Array.isArray(reparsed.adaptedBuildings));
  assert.ok(Array.isArray(reparsed.buildingSearches));
});

test('serialize -> JSON -> deserialize round trip preserves Maps and scalars', () => {
  const original = buildSeededSettlement();
  const serialized = serializeSettlementState(original);
  // Simulate localStorage: the payload is stringified to JSON and parsed back.
  const restored = deserializeSettlementState(JSON.parse(JSON.stringify(serialized)));

  // Scalar + nested stockpile fidelity.
  assert.equal(restored.name, original.name);
  assert.deepEqual(restored.stockpile, original.stockpile);
  assert.equal(restored.primaryHQId, original.primaryHQId);
  assert.equal(restored.headquarters.length, original.headquarters.length);

  // Map collections reconstruct with identical content.
  assert.ok(restored.adaptedBuildings instanceof Map);
  assert.equal(restored.adaptedBuildings.size, original.adaptedBuildings.size);
  assert.deepEqual(
    [...restored.adaptedBuildings.entries()],
    JSON.parse(JSON.stringify([...original.adaptedBuildings.entries()]))
  );

  assert.ok(restored.buildingSearches instanceof Map);
  assert.equal(restored.buildingSearches.size, original.buildingSearches.size);
  assert.deepEqual(
    [...restored.buildingSearches.entries()],
    JSON.parse(JSON.stringify([...original.buildingSearches.entries()]))
  );

  assert.ok(restored.demolishedBuildings instanceof Map);
  assert.deepEqual(
    [...restored.demolishedBuildings.entries()],
    JSON.parse(JSON.stringify([...original.demolishedBuildings.entries()]))
  );

  // Empty-but-present collections must still come back as Maps (not undefined).
  assert.ok(restored.hiddenGroups instanceof Map);
  assert.ok(restored.infections instanceof Map);
  assert.ok(restored.outbreaks instanceof Map);
  assert.ok(restored.zombieLairs instanceof Map);
  assert.ok(restored.rivalHideouts instanceof Map);
  assert.ok(restored.deconstructionJobs instanceof Map);
  assert.ok(restored.buildingSearches instanceof Map);
  assert.ok(restored.squads instanceof Array || restored.squads === undefined);
});

test('serialize is a fixpoint after one normalize pass (no drift on subsequent round trips)', () => {
  // deserialize fills optional sub-states (laws, power/water/training, …) that a
  // fresh settlement omits, so the first restore legitimately adds those keys.
  // After that normalization, serialization must be byte-stable: drift on a
  // second cycle would mean a field is dropped, renamed or reordered between
  // the serializer and deserializer.
  const original = buildSeededSettlement();
  const restored = deserializeSettlementState(JSON.parse(JSON.stringify(serializeSettlementState(original))));
  const second = JSON.stringify(serializeSettlementState(restored));
  const restoredAgain = deserializeSettlementState(JSON.parse(second));
  const third = JSON.stringify(serializeSettlementState(restoredAgain));
  assert.equal(third, second, 'serialize(deserialize(serialize(s))) must reach a fixpoint — drift means a field is dropped or reordered');
});
