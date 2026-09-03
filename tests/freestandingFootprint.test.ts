import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FUNCTIONAL_BUILDING_DEFINITIONS } from '../src/data/functionalBuildings';
import { getFreestandingDimensions } from '../src/services/freestandingFootprint';

const DEFAULT_8X8 = { width: 8, length: 8 };

test('every construction-capable facility has its OWN predefined module dimensions', () => {
  const defaults = [];
  for (const def of Object.values(FUNCTIONAL_BUILDING_DEFINITIONS)) {
    if (!def.constructionAllowed) continue;
    const dims = getFreestandingDimensions(def.id);
    if (dims.width === DEFAULT_8X8.width && dims.length === DEFAULT_8X8.length) {
      defaults.push(def.id);
    }
    assert.ok(dims.width > 0 && dims.length > 0, `${def.id} must have positive dimensions`);
  }
  assert.deepEqual(
    defaults,
    [],
    'no freestanding facility may silently fall back to the generic 8×8 box: ' + defaults.join(', ')
  );
});

test('predefined modules are distinct per facility, not a shared box', () => {
  // Representative real modules: a cannery, hospital, warehouse and research
  // centre all have genuinely different footprints.
  const cannery = getFreestandingDimensions('cannery');
  const hospital = getFreestandingDimensions('hospital');
  const warehouse = getFreestandingDimensions('warehouse');
  const research = getFreestandingDimensions('research_center');
  assert.equal(warehouse.width * warehouse.length, 16 * 22, 'warehouse is a large storage module');
  assert.equal(hospital.width * hospital.length, 14 * 20, 'hospital is a substantial facility module');
  assert.equal(cannery.width * cannery.length, 14 * 18, 'cannery has its own industrial footprint');
  assert.equal(research.width * research.length, 10 * 14, 'research centre is a mid-size lab module');
  const areas = new Set([
    Math.round(cannery.width * cannery.length),
    Math.round(hospital.width * hospital.length),
    Math.round(warehouse.width * warehouse.length),
    Math.round(research.width * research.length),
  ]);
  assert.equal(areas.size, 4, 'four different facility types must not share one footprint');
});

test('dynamic drag-built structures keep their line/tower rules', () => {
  assert.deepEqual(getFreestandingDimensions('wooden_palisade'), { width: 2.4, length: 10 });
  assert.deepEqual(getFreestandingDimensions('wooden_gate'), { width: 10, length: 3.2 });
  assert.deepEqual(getFreestandingDimensions('wooden_tower'), { width: 5.2, length: 5.2 });
  assert.deepEqual(getFreestandingDimensions('field'), { width: 16, length: 20 });
  assert.deepEqual(getFreestandingDimensions('vast_field'), { width: 24, length: 30 });
});

test('small utility modules are not bloated by the generic fallback', () => {
  const antenna = getFreestandingDimensions('antenna');
  const weather = getFreestandingDimensions('weather_center');
  assert.equal(antenna.width * antenna.length, 16, 'antenna is a compact 4×4 mast module');
  assert.equal(weather.width * weather.length, 48, 'weather centre is a small 6×8 station');
});
