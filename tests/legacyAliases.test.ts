import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FUNCTIONAL_BUILDING_DEFINITIONS,
  LEGACY_ALIAS_BUILDING_TYPE_IDS,
  isLegacyAliasBuildingType,
} from '../src/data/functionalBuildings';

const defs = Object.values(FUNCTIONAL_BUILDING_DEFINITIONS);

test('legacy alias registry is complete: every body-aliased def is registered, nothing else is', () => {
  for (const def of defs) {
    const isBodyAlias = def.type !== def.id;
    assert.equal(
      isLegacyAliasBuildingType(def.id),
      isBodyAlias,
      `def '${def.id}' has type '${def.type}' but alias-registry membership does not match (body alias = ${isBodyAlias})`
    );
  }
});

test('every registered alias exists and resolves to a real, non-alias canonical def', () => {
  for (const aliasId of LEGACY_ALIAS_BUILDING_TYPE_IDS) {
    const alias = FUNCTIONAL_BUILDING_DEFINITIONS[aliasId];
    assert.ok(alias, `alias '${aliasId}' has no definition`);
    assert.ok(alias.type && alias.type !== aliasId, `alias '${aliasId}' does not redirect to a canonical type`);
    const canonical = FUNCTIONAL_BUILDING_DEFINITIONS[alias.type as keyof typeof FUNCTIONAL_BUILDING_DEFINITIONS];
    assert.ok(canonical, `alias '${aliasId}' points at missing canonical '${alias.type}'`);
    assert.equal(
      isLegacyAliasBuildingType(canonical.id),
      false,
      `alias '${aliasId}' canonical target '${canonical.id}' is itself an alias`
    );
  }
});

test('canonical adaptation roster is alias-free and each alias concept appears once under its real name', () => {
  // Mirrors the sidebar inspector + Buildings-panel roster rule: show every
  // adaptationAllowed def EXCEPT legacy aliases.
  const roster = defs.filter((d) => d.adaptationAllowed && !isLegacyAliasBuildingType(d.id));
  const rosterIds = new Set(roster.map((d) => d.id));

  for (const aliasId of LEGACY_ALIAS_BUILDING_TYPE_IDS) {
    assert.ok(!rosterIds.has(aliasId), `alias '${aliasId}' leaked into the canonical adaptation roster`);
  }

  // Every alias whose canonical target can be adapted is represented once by
  // that target (name parity check) — the old-name duplicate must never be the
  // only way to reach a facility concept.
  for (const aliasId of LEGACY_ALIAS_BUILDING_TYPE_IDS) {
    const alias = FUNCTIONAL_BUILDING_DEFINITIONS[aliasId];
    const canonical = FUNCTIONAL_BUILDING_DEFINITIONS[alias.type as keyof typeof FUNCTIONAL_BUILDING_DEFINITIONS];
    if (canonical.adaptationAllowed) {
      assert.ok(rosterIds.has(canonical.id), `canonical '${canonical.id}' (of alias '${aliasId}') missing from adaptation roster`);
    }
  }
});

test('purpose-built infrastructure defs (cistern/generator/battery) are not aliases', () => {
  for (const id of ['water_cistern', 'generator_station', 'battery_bank', 'floodlight_tower']) {
    assert.equal(
      isLegacyAliasBuildingType(id),
      false,
      `purpose-built infra '${id}' must not be treated as a legacy alias`
    );
    const def = FUNCTIONAL_BUILDING_DEFINITIONS[id as keyof typeof FUNCTIONAL_BUILDING_DEFINITIONS];
    assert.ok(def, `missing def '${id}'`);
    assert.equal(def.type, id, `'${id}' must be its own canonical type`);
  }
});
