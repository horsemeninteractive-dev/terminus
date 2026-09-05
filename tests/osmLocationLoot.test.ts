// OSM location classification + loot profile tests.
//
// Covers the canonical resolver (priority ordering, synonyms, hybrid
// secondary categories, confidence, normalization, malformed/missing tags)
// and the loot-profile layer (thematic weighting over EXISTING Terminus
// resources — no new item ids). Loot roll OUTPUT is stochastic, so profile
// tests assert weighting structure (guaranteed entries, relative pool
// weights), not exact random draws, unless Math.random is stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOsmTags,
  resolveOsmLocation,
  resolveBuildingLocation,
  locationFromBuildingCategory,
} from '../src/services/osmLocationResolver';
import { getLootProfileForLocation } from '../src/data/lootProfiles';
import { sizeScaleForArea, rollLootForLocation } from '../src/services/lootRollService';
import { CATEGORY_LOOT_PROFILES } from '../src/data/lootProfiles';
import type { BuildingPolygon } from '../src/types/map';
import type { LootProfile, LootProfileEntry } from '../src/types/osmLocation';

function poolWeight(profile: LootProfile, label: string): number {
  const match = profile.pool.find((e) => e.label === label);
  return match ? match.weight : 0;
}

function guaranteedHas(profile: LootProfile, label: string): boolean {
  return profile.guaranteed.some((e) => e.label === label);
}

function hasArmedEntry(profile: LootProfile, kind: 'weapon' | 'armor'): boolean {
  return profile.guaranteed.some((e) => e.kind === kind) || profile.pool.some((e) => e.kind === kind);
}

// ---------------------------------------------------------------------------
// §26 classification: education
// ---------------------------------------------------------------------------
test('education tags resolve to education with correct subtypes', () => {
  assert.deepEqual(
    { category: resolveOsmLocation({ amenity: 'school' }).category, subtype: resolveOsmLocation({ amenity: 'school' }).subtype },
    { category: 'education', subtype: 'school' }
  );
  const university = resolveOsmLocation({ amenity: 'university' });
  assert.equal(university.category, 'education');
  assert.equal(university.subtype, 'university');
  assert.equal(resolveOsmLocation({ amenity: 'library' }).subtype, 'library');
  // education=* form and building=* form
  assert.equal(resolveOsmLocation({ education: 'university' }).subtype, 'university');
  assert.equal(resolveOsmLocation({ building: 'school' }).category, 'education');
  // office=research -> research (not education)
  const research = resolveOsmLocation({ office: 'research' });
  assert.equal(research.category, 'research');
  assert.equal(research.subtype, 'research_institute');
});

test('higher-priority amenity research_institute outranks education=university', () => {
  // amenity (155) is a more authoritative functional signal than education
  // (120): a building tagged education=university + amenity=research_institute
  // is primarily a research institute — the university signal only survives if
  // it shares the winning priority tier.
  const r = resolveOsmLocation({ education: 'university', amenity: 'research_institute' });
  assert.equal(r.category, 'research');
  assert.equal(r.subtype, 'research_institute');
  assert.equal(r.secondary.length, 0, 'lower-tier university role is subsumed by the research institute');
});

test('same-priority functional tags produce a subtype-aware hybrid secondary', () => {
  // shop and amenity share priority 155: the first-declared tag wins the
  // primary category and the other is recorded as a full secondary spec — the
  // pharmacy subtype must survive so loot blends use the pharmacy profile,
  // not generic medical.
  const r = resolveOsmLocation({ shop: 'supermarket', amenity: 'pharmacy' });
  assert.equal(r.category, 'food');
  assert.equal(r.subtype, 'supermarket');
  assert.equal(r.secondary.length, 1);
  assert.deepEqual(r.secondary[0], { category: 'medical', subtype: 'pharmacy' });
});

// ---------------------------------------------------------------------------
// §26 classification: medical, food, fuel, police, industrial
// ---------------------------------------------------------------------------
test('medical tags resolve to medical with hospital > clinic > pharmacy hierarchy', () => {
  assert.equal(resolveOsmLocation({ amenity: 'hospital' }).subtype, 'hospital');
  assert.equal(resolveOsmLocation({ amenity: 'hospital' }).confidence, 'high');
  assert.equal(resolveOsmLocation({ healthcare: 'clinic' }).subtype, 'clinic');
  assert.equal(resolveOsmLocation({ amenity: 'pharmacy' }).subtype, 'pharmacy');
  assert.equal(resolveOsmLocation({ shop: 'pharmacy' }).subtype, 'pharmacy');
});

test('food shops and eateries resolve to food with subtypes', () => {
  assert.equal(resolveOsmLocation({ shop: 'supermarket' }).subtype, 'supermarket');
  assert.equal(resolveOsmLocation({ shop: 'bakery' }).subtype, 'bakery');
  assert.equal(resolveOsmLocation({ shop: 'butcher' }).subtype, 'butcher');
  assert.equal(resolveOsmLocation({ amenity: 'restaurant' }).subtype, 'restaurant');
  assert.equal(resolveOsmLocation({ amenity: 'cafe' }).subtype, 'cafe');
});

test('fuel, police, industrial, and military resolve', () => {
  assert.equal(resolveOsmLocation({ amenity: 'fuel' }).category, 'fuel');
  assert.equal(resolveOsmLocation({ amenity: 'fuel' }).subtype, 'fuel_station');
  assert.equal(resolveOsmLocation({ amenity: 'police' }).category, 'police');
  // industrial=* is a catch-all key: ANY non-generic value counts.
  assert.equal(resolveOsmLocation({ industrial: 'sawmill' }).category, 'industrial');
  assert.equal(resolveOsmLocation({ military: 'barracks' }).category, 'military');
});

// ---------------------------------------------------------------------------
// §26 conflicting / missing / malformed / multiple / priority / case
// ---------------------------------------------------------------------------
test('healthcare outranks amenity, amenity outranks building=*', () => {
  // healthcare=hospital should beat building=commercial shells.
  const hospital = resolveOsmLocation({ building: 'commercial', healthcare: 'hospital' });
  assert.equal(hospital.category, 'medical');
  assert.equal(hospital.subtype, 'hospital');
  // amenity=police beats building=house.
  const police = resolveOsmLocation({ building: 'house', amenity: 'police' });
  assert.equal(police.category, 'police');
  // A functional amenity beats a specialist building value.
  const library = resolveOsmLocation({ building: 'house', amenity: 'library' });
  assert.equal(library.category, 'education');
  assert.equal(library.subtype, 'library');
});

test('missing and malformed tags never crash and fall back safely', () => {
  assert.equal(resolveOsmLocation(undefined).category, 'unknown');
  assert.equal(resolveOsmLocation({}).category, 'unknown');
  // Value noise: generic booleans carry no functional meaning.
  assert.equal(resolveOsmLocation({ building: 'yes', amenity: 'yes' }).category, 'unknown');
  // Semicolon separated + uppercase values are normalized.
  const multi = resolveOsmLocation({ shop: 'SUPERMARKET;bakery' });
  assert.equal(multi.category, 'food');
  assert.equal(multi.subtype, 'supermarket', 'first token wins deterministically');
  // Unknown values on known keys fall back to unknown (no crash).
  assert.equal(resolveOsmLocation({ amenity: 'frobnicator' }).category, 'unknown');
});

test('normalization splits semicolon lists and lowercases keys', () => {
  const tags = normalizeOsmTags({ SHOP: 'Hardware; DIY', name: 'ACME' });
  assert.deepEqual(tags.shop, ['hardware', 'diy']);
  assert.deepEqual(tags.name, ['acme']);
});

test('name keyword fallback is low confidence and loses to any functional tag', () => {
  // No functional tags: name fallback works.
  const byName = resolveOsmLocation({ building: 'yes' }, { name: 'West High School' });
  assert.equal(byName.category, 'education');
  assert.equal(byName.confidence, 'low');
  // With a contradicting strong tag the name never wins.
  const tagWins = resolveOsmLocation({ amenity: 'hospital' }, { name: 'St. Mary High School' });
  assert.equal(tagWins.category, 'medical');
});

test('building polygons with no tags fall back to their coarse map category', () => {
  const legacy = resolveOsmLocation(undefined, { fallbackCategory: 'gas_station' });
  assert.equal(legacy.category, 'fuel');
  assert.equal(locationFromBuildingCategory('school').subtype, 'school');
});

// ---------------------------------------------------------------------------
// §27 loot profiles: structure and theming over existing resources
// ---------------------------------------------------------------------------
const loc = (tags: Record<string, string>) => resolveOsmLocation(tags);

test('education profiles scale scientific materials by institution tier', () => {
  const school = getLootProfileForLocation(loc({ amenity: 'school' }));
  const college = getLootProfileForLocation(loc({ amenity: 'college' }));
  const university = getLootProfileForLocation(loc({ amenity: 'university' }));
  const research = getLootProfileForLocation(loc({ office: 'research' }));
  const library = getLootProfileForLocation(loc({ amenity: 'library' }));

  assert.ok(guaranteedHas(school, 'scientific_materials'), 'school guarantees scientific materials');
  assert.ok(guaranteedHas(university, 'scientific_materials'));
  assert.ok(guaranteedHas(research, 'scientific_materials'));
  assert.ok(guaranteedHas(library, 'scientific_materials'));

  // Weight ordering: research institute >= university > college > school.
  const w = (p: LootProfile) => poolWeight(p, 'scientific_materials');
  assert.ok(w(research) > w(university), `research (${w(research)}) > university (${w(university)})`);
  assert.ok(w(university) >= w(college), `university (${w(university)}) >= college (${w(college)})`);
  assert.ok(w(college) > w(school), `college (${w(college)}) > school (${w(school)})`);
  // Generic office has little research weight; residential none at all.
  assert.ok(poolWeight(getLootProfileForLocation(loc({ building: 'office' })), 'scientific_materials') <= 2);
  assert.equal(poolWeight(getLootProfileForLocation(loc({ building: 'house' })), 'scientific_materials'), 0);
});

test('medical profiles strongly favour medical resources', () => {
  const hospital = getLootProfileForLocation(loc({ amenity: 'hospital' }));
  const pharmacy = getLootProfileForLocation(loc({ amenity: 'pharmacy' }));
  for (const p of [hospital, pharmacy]) {
    assert.ok(guaranteedHas(p, 'first_aid_kits') || guaranteedHas(p, 'painkillers') || guaranteedHas(p, 'sterile_bandages'));
  }
  // Hospital guarantees four medical staples; pharmacy pools antibiotics hard.
  assert.ok(guaranteedHas(hospital, 'antibiotics'));
  assert.ok(guaranteedHas(hospital, 'painkillers'));
  assert.ok(poolWeight(pharmacy, 'antibiotics') >= 8, 'pharmacy pool is medicine-dominated');
});

test('food profiles favour food; supermarket carries high quantities', () => {
  const supermarket = getLootProfileForLocation(loc({ shop: 'supermarket' }));
  assert.ok(guaranteedHas(supermarket, 'canned_goods'));
  const canned = supermarket.guaranteed.find((e) => e.label === 'canned_goods')!;
  assert.ok(canned.maxQuantity >= 8, 'supermarket canned_goods stacks are large');
});

test('fuel stations favour fuel but stay economically bounded', () => {
  const fuel = getLootProfileForLocation(loc({ amenity: 'fuel' }));
  assert.ok(guaranteedHas(fuel, 'gasoline'));
  const gas = fuel.guaranteed.find((e) => e.label === 'gasoline')!;
  assert.ok(gas.maxQuantity <= 20, 'fuel rolls are capped, not piñata-sized');
});

test('police and military can yield arms but never guarantee a weapon', () => {
  const police = getLootProfileForLocation(loc({ amenity: 'police' }));
  assert.ok(guaranteedHas(police, 'ammunition'), 'police guarantees ammunition');
  assert.ok(!guaranteedHas(police, 'pistol') && !guaranteedHas(police, 'riot_vest'), 'police never guarantees a weapon');
  assert.ok(hasArmedEntry(police, 'weapon') && hasArmedEntry(police, 'armor'), 'police pools firearms and armor');

  const military = getLootProfileForLocation(loc({ military: 'barracks' }));
  assert.ok(guaranteedHas(military, 'ammunition'));
  assert.ok(hasArmedEntry(military, 'weapon'));
  assert.ok(!military.guaranteed.some((e) => e.kind === 'weapon'), 'military never guarantees a specific firearm');
});

test('workshop/hardware favours tools and materials', () => {
  const hardware = getLootProfileForLocation(loc({ shop: 'hardware' }));
  assert.ok(guaranteedHas(hardware, 'tools'));
  assert.ok(poolWeight(hardware, 'tools') >= 8);
  assert.ok(poolWeight(hardware, 'metal') >= 5);
});

test('unknown buildings produce a generic, scavengable profile', () => {
  const unknown = getLootProfileForLocation(loc({ building: 'weird_gizmo' }));
  assert.equal(unknown.category, 'unknown');
  assert.ok(guaranteedHas(unknown, 'canned_goods'));
  assert.ok(guaranteedHas(unknown, 'bottled_water'));
  // No specialist bias in the unknown pool (no arms, no fuel).
  assert.equal(poolWeight(unknown, 'gasoline'), 0);
  assert.equal(hasArmedEntry(unknown, 'weapon'), false);
});

test('all profile labels are real Terminus stockpile/armory resources', () => {
  const STOCKPILE = new Set([
    'canned_goods', 'dried_rations', 'bottled_water', 'first_aid_kits', 'sterile_bandages',
    'antibiotics', 'painkillers', 'gasoline', 'diesel', 'ammunition', 'wood', 'metal',
    'bricks', 'tools', 'logs', 'scrap', 'scientific_materials',
  ]);
  const checks: LootProfileEntry[] = [];
  for (const spec of Object.values(CATEGORY_LOOT_PROFILES)) {
    checks.push(...spec.guaranteed, ...spec.pool);
  }
  for (const e of checks) {
    if (e.kind === 'resource') {
      assert.ok(STOCKPILE.has(e.label), `unknown resource label in a loot profile: ${e.label}`);
    } else {
      assert.ok(e.itemId, `${e.kind} entries must carry an itemId: ${e.label}`);
    }
  }
});

// ---------------------------------------------------------------------------
// §18 diminishing size scaling + deterministic roll sanity
// ---------------------------------------------------------------------------
test('building size scaling has diminishing returns and caps', () => {
  const small = sizeScaleForArea(100);
  const large = sizeScaleForArea(1000);
  const huge = sizeScaleForArea(10000);
  assert.ok(large.quantityScale > small.quantityScale, 'bigger buildings scale up');
  assert.ok(huge.quantityScale < 2.5, 'enormous buildings do not scale linearly');
  assert.ok(huge.extraRolls >= large.extraRolls && huge.extraRolls <= 4, 'extra rolls cap out');
  assert.ok(small.extraRolls === 0, 'small buildings get no extra pool rolls');
});

test('guaranteed profile entries always roll, even with Math.random pinned at 1', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.9999; // adversarial: weighted sampling still can't skip guaranteed entries
  try {
    const loot = rollLootForLocation(
      { category: 'medical', subtype: 'hospital', confidence: 'high', source: 'tags', matchedTags: ['amenity=hospital'], secondary: [] },
      200
    );
    for (const label of ['first_aid_kits', 'sterile_bandages', 'antibiotics', 'painkillers']) {
      assert.ok(loot.some((l) => l.label === label), `hospital must always yield ${label}`);
    }
    assert.ok(loot.length >= 4, 'guaranteed stacks always occupy inventory slots');
  } finally {
    Math.random = originalRandom;
  }
});

test('hybrid secondaries blend their specialty into the roll', () => {
  // A supermarket with an in-store pharmacy: the resolver records food/
  // supermarket primary + medical/pharmacy secondary. Flipping random to ~0
  // makes weighted sampling deterministic (index order) — supermarket pool
  // entries come first, so the SECONDARY pharmacy stack is what proves the
  // blend ran (pharmacy guaranteed staples carry the top relative weights in
  // the 0.3-scaled secondary candidate set).
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const withPharmacy = rollLootForLocation(
      {
        category: 'food', subtype: 'supermarket', confidence: 'high',
        source: 'tags', matchedTags: ['shop=supermarket'],
        secondary: [{ category: 'medical', subtype: 'pharmacy' }],
      },
      200
    );
    const labels = withPharmacy.map((l) => l.label);
    assert.ok(
      labels.includes('painkillers') || labels.includes('antibiotics') || labels.includes('sterile_bandages'),
      `pharmacy secondary should surface its medicines, got ${labels.join(', ')}`
    );

    // The identical building WITHOUT the pharmacy secondary rolls NO
    // pharmacy-distinctive medicines (the supermarket profile itself only
    // carries a mild first_aid_kits entry, never painkillers/antibiotics).
    const without = rollLootForLocation(
      {
        category: 'food', subtype: 'supermarket', confidence: 'high',
        source: 'tags', matchedTags: ['shop=supermarket'], secondary: [],
      },
      200
    );
    const pharmaOnly = new Set(['painkillers', 'antibiotics', 'sterile_bandages']);
    assert.ok(
      !without.some((l) => pharmaOnly.has(l.label)),
      `plain supermarket rolls no pharmacy-only medicines, got ${without.map((l) => l.label).join(', ')}`
    );
  } finally {
    Math.random = originalRandom;
  }
});

test('same-category subtype hybrids blend the subtype profile (supermarket+restaurant)', () => {
  // Both tags are food category — the resolver keeps restaurant as a
  // subtype-level secondary instead of dropping it.
  const resolved = resolveOsmLocation({ shop: 'supermarket', amenity: 'restaurant' });
  assert.equal(resolved.category, 'food');
  assert.equal(resolved.subtype, 'supermarket');
  assert.deepEqual(
    resolved.secondary.map((s) => s.subtype),
    ['restaurant'],
    'restaurant survives as a same-category secondary'
  );

  // Under Math.random=0 the supermarket primary pool (index order) rolls
  // canned/dried/water/first-aid; restaurant-only staples only appear via the
  // hybrid blend (its guaranteed dried_rations + bottled_water are skipped as
  // duplicates, so the blend surfaces at all).
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const hybrid = rollLootForLocation(
      {
        category: 'food', subtype: 'supermarket', confidence: 'high',
        source: 'tags', matchedTags: ['shop=supermarket'],
        secondary: [{ category: 'food', subtype: 'restaurant' }],
      },
      200
    );
    const pure = rollLootForLocation(
      {
        category: 'food', subtype: 'supermarket', confidence: 'high',
        source: 'tags', matchedTags: ['shop=supermarket'], secondary: [],
      },
      200
    );
    // Both roll the supermarket staples; the hybrid adds at least one more
    // distinct stack than the pure supermarket.
    assert.ok(
      hybrid.length > pure.length,
      `restaurant secondary should add stacks (${pure.length} -> ${hybrid.length})`
    );
  } finally {
    Math.random = originalRandom;
  }
});

test('hybrid secondaries are capped so the primary identity dominates', () => {
  // A supermarket+warehouse+industrial pile-up still only adds a bounded
  // number of secondary stacks — never flooding the squad backpack.
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const blended = rollLootForLocation(
      {
        category: 'food', subtype: 'supermarket', confidence: 'high',
        source: 'tags', matchedTags: ['shop=supermarket'],
        secondary: [
          { category: 'medical', subtype: 'pharmacy' },
          { category: 'warehouse' },
          { category: 'industrial' },
        ],
      },
      400
    );
    const primaryCount = blended.filter((l) => l.label === 'canned_goods' || l.label === 'bottled_water').length;
    assert.ok(primaryCount >= 2, 'primary guaranteed stacks still roll');
    assert.ok(blended.length <= 2 + 5 + 2, 'secondary additions stay bounded');
  } finally {
    Math.random = originalRandom;
  }
});

// ---------------------------------------------------------------------------
// §23 adapted buildings keep their OSM identity via preserved tags
// ---------------------------------------------------------------------------
test('resolveBuildingLocation reads polygon tags and falls back to coarse type', () => {
  const school: BuildingPolygon = {
    id: 'b1', type: 'school', rawType: 'school', name: 'Old County Library',
    height: 10, levels: 2, center: { x: 0, z: 0 },
    polygon: [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }],
    tags: { amenity: 'library', building: 'yes' },
  };
  const r = resolveBuildingLocation(school);
  assert.equal(r.category, 'education');
  assert.equal(r.subtype, 'library');
  assert.ok(r.matchedTags.includes('amenity=library'));

  const tagless: BuildingPolygon = {
    ...school, id: 'b2', tags: {}, name: 'Generic Shell', rawType: 'supermarket',
  };
  // Wait — a tagless building whose type says supermarket should classify food
  // only when the map processor assigned that type (type==='supermarket').
  const taglessMapped: BuildingPolygon = { ...tagless, type: 'supermarket' as const };
  const r2 = resolveBuildingLocation(taglessMapped);
  assert.equal(r2.category, 'food', 'legacy tagless supermarkets keep their old classification');
});
