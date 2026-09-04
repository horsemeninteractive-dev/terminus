import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectFlatRoof, flatRoofLabel, flatRoofParamsFor, FlatRoofType } from '../src/render/buildingTextures';

const TYPES: FlatRoofType[] = ['gravel', 'epdm', 'felt', 'tpo', 'paved'];

test('selectFlatRoof is deterministic for a given seed', () => {
  for (const cat of ['residential', 'commercial', 'industrial', 'other'] as const) {
    for (const accessible of [false, true]) {
      const a = selectFlatRoof(12345, cat, accessible);
      const b = selectFlatRoof(12345, cat, accessible);
      assert.deepEqual(a, b, `seed must be stable for ${cat} accessible=${accessible}`);
    }
  }
});

test('selectFlatRoof returns a valid family + shade', () => {
  for (let seed = 0; seed < 500; seed++) {
    const sel = selectFlatRoof(seed, 'residential', false);
    assert.ok(TYPES.includes(sel.type), `type ${sel.type} not a flat roof family`);
    assert.ok(Number.isInteger(sel.shade) && sel.shade >= 0 && sel.shade <= 2, `shade ${sel.shade} out of range`);
  }
});

test('commercial/industrial roofs bias to EPDM, TPO, gravel', () => {
  const counts: Record<string, number> = { gravel: 0, epdm: 0, felt: 0, tpo: 0, paved: 0 };
  for (let seed = 0; seed < 600; seed++) counts[selectFlatRoof(seed, 'commercial', false).type]++;
  const heavy = counts.epdm + counts.tpo + counts.gravel;
  assert.ok(heavy / 600 > 0.55, `commercial heavy families only ${heavy}/600: ${JSON.stringify(counts)}`);
  assert.ok(counts.felt < counts.epdm, `commercial felt (${counts.felt}) should not exceed epdm (${counts.epdm})`);

  const indCounts: Record<string, number> = { gravel: 0, epdm: 0, felt: 0, tpo: 0, paved: 0 };
  for (let seed = 0; seed < 600; seed++) indCounts[selectFlatRoof(seed, 'warehouse', false).type]++;
  const indHeavy = indCounts.epdm + indCounts.tpo + indCounts.gravel;
  assert.ok(indHeavy / 600 > 0.6, `industrial heavy families only ${indHeavy}/600: ${JSON.stringify(indCounts)}`);
});

test('residential/outbuilding roofs bias to mineral felt and gravel', () => {
  const counts: Record<string, number> = { gravel: 0, epdm: 0, felt: 0, tpo: 0, paved: 0 };
  for (let seed = 0; seed < 600; seed++) counts[selectFlatRoof(seed, 'residential', false).type]++;
  const resHeavy = counts.felt + counts.gravel;
  assert.ok(resHeavy / 600 > 0.5, `residential felt+gravel only ${resHeavy}/600: ${JSON.stringify(counts)}`);
  assert.ok(counts.felt > counts.tpo, `residential felt (${counts.felt}) should dominate tpo (${counts.tpo})`);
});

test('player-accessible rooftops are paved terrace', () => {
  const counts: Record<string, number> = { gravel: 0, epdm: 0, felt: 0, tpo: 0, paved: 0 };
  for (let seed = 0; seed < 600; seed++) counts[selectFlatRoof(seed, 'residential', true).type]++;
  assert.ok(counts.paved / 600 > 0.5, `accessible paved only ${counts.paved}/600: ${JSON.stringify(counts)}`);
});

test('params are exposed and ordered sensibly (TPO smoother than felt)', () => {
  const tpo = flatRoofParamsFor('tpo');
  const felt = flatRoofParamsFor('felt');
  assert.ok(tpo.roughness < felt.roughness, `TPO roughness ${tpo.roughness} should be lower than felt ${felt.roughness}`);
  for (const t of TYPES) {
    const p = flatRoofParamsFor(t);
    assert.ok(p.roughness > 0 && p.roughness <= 1, `${t} roughness ${p.roughness}`);
    assert.ok(p.seamSpacingMeters > 0, `${t} seam spacing`);
    assert.ok(p.dirtIntensity >= 0 && p.dirtIntensity <= 1, `${t} dirt ${p.dirtIntensity}`);
    assert.ok(flatRoofLabel(t).length > 0, `${t} label`);
  }
});