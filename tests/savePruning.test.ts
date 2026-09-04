import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveGameService } from '../src/services/saveService';

/**
 * Regression coverage for localStorage save pruning.
 *
 * The original bug: saveGame pruned the save INDEX to 20 entries but never
 * removed the payload keys of pruned saves, and it wrote the new (largest)
 * payload BEFORE any pruning. Every save ever written stayed in localStorage
 * until the quota filled, at which point every new save — dawn autosaves
 * included — threw QuotaExceededError and reloads silently lost progress.
 */

const PREFIX = 'terminus_ifz_save_';
const INDEX_KEY = 'terminus_ifz_save_index';

/** Quota-aware in-memory Storage used to drive the regression scenarios. */
function makeStorage(quotaBytes: number): Storage {
  const map = new Map<string, string>();
  let used = 0;
  const keyLen = (k: string) => k.length;
  const storage = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
      used = 0;
    },
    getItem(k: string): string | null {
      return map.has(k) ? map.get(k)! : null;
    },
    key(i: number): string | null {
      return [...map.keys()][i] ?? null;
    },
    removeItem(k: string) {
      const v = map.get(k);
      if (v !== undefined) {
        map.delete(k);
        used -= keyLen(k) + v.length;
      }
    },
    setItem(k: string, v: string) {
      // Replacing a key first frees its old bytes.
      const old = map.get(k);
      if (old !== undefined) {
        map.delete(k);
        used -= keyLen(k) + old.length;
      }
      if (used + keyLen(k) + v.length > quotaBytes) {
        throw Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' });
      }
      map.set(k, v);
      used += keyLen(k) + v.length;
    },
  };
  return storage as unknown as Storage;
}

function payloadKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)!;
    if (k.startsWith(PREFIX) && k !== INDEX_KEY) keys.push(k);
  }
  return keys;
}

function indexIds(storage: Storage): string[] {
  const raw = storage.getItem(INDEX_KEY);
  if (!raw) return [];
  return (JSON.parse(raw) as Array<{ id: string }>).map((m) => m.id);
}

/** A realistic save payload (~30 KB once stringified via the map-data blob). */
function makePayload(day: number): any {
  return {
    settlements: {},
    activeSettlementId: 's1',
    settlement: {
      name: 'Test Colony',
      stockpile: { food: { canned_goods: 10, mre_rations: 0, dried_rations: 0, fresh_harvest: 0 } },
      namedSurvivors: [],
      generalPopulation: { total: 8 },
      squads: [],
      morale: { overallScore: 70 },
      weather: { currentSeason: 'spring', currentWeather: 'clear' },
      headquarters: [],
      adaptedBuildings: [],
      buildingSearches: [],
    },
    gameClock: { day, hour: 8, minute: 0 },
    activePlacement: { sectorName: 'Test Zone', country: 'UK' },
    currentPreset: { name: 'Test Zone' },
    mapData: { blob: 'x'.repeat(30_000) },
    caravans: [],
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('repeated dawn autosaves never fill the quota and old autosaves are deleted', async () => {
  // Quota fits ~6 saves; autosave cap is 4, so an unbounded sequence must
  // succeed forever while only the newest autosaves remain on disk.
  const storage = makeStorage(200_000);
  (globalThis as any).localStorage = storage;
  const service = new SaveGameService();

  const saved: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const meta = service.saveGame(`Autosave Day ${i}`, 'autosave', makePayload(i));
    saved.push(meta.id);
    await sleep(2); // distinct timestamps keep ordering deterministic
  }

  // Steady state: only the newest 4 autosave payloads exist, all indexed, and
  // every indexed save has its payload (nothing leaked).
  const payloads = payloadKeys(storage);
  assert.ok(payloads.length <= 4, `expected <= 4 payloads, got ${payloads.length}`);
  const ids = indexIds(storage);
  assert.ok(ids.length <= 4, `expected <= 4 index entries, got ${ids.length}`);
  for (const id of ids) {
    assert.ok(storage.getItem(`${PREFIX}${id}`), `indexed save ${id} missing its payload`);
  }
  // The most recent autosave survived; the oldest are gone.
  const newest = saved[saved.length - 1];
  assert.ok(ids.includes(newest), 'newest autosave must be in the index');
  for (const id of saved.slice(0, saved.length - 4)) {
    assert.ok(!storage.getItem(`${PREFIX}${id}`), `old autosave ${id} should have been pruned`);
  }
});

test('orphaned payload keys (legacy leak) are deleted on the next save', () => {
  const storage = makeStorage(1_000_000);
  (globalThis as any).localStorage = storage;
  const service = new SaveGameService();

  // Legacy state: an index that references only 2 saves, but 5 payloads exist
  // (3 orphans leaked by the old index-only pruning / crashed writes).
  const listed = [
    { id: 'save_a', timestamp: 100, type: 'manual', name: 'A' },
    { id: 'save_b', timestamp: 200, type: 'manual', name: 'B' },
  ];
  storage.setItem(INDEX_KEY, JSON.stringify(listed));
  for (const id of ['save_a', 'save_b', 'save_orphan1', 'save_orphan2', 'save_orphan3']) {
    storage.setItem(`${PREFIX}${id}`, JSON.stringify({ data: 'x'.repeat(500) }));
  }

  service.saveGame('Fresh Save', 'manual', makePayload(1));

  const remaining = payloadKeys(storage).map((k) => k.slice(PREFIX.length));
  assert.ok(!remaining.includes('save_orphan1'), 'orphan payload must be removed');
  assert.ok(!remaining.includes('save_orphan2'), 'orphan payload must be removed');
  assert.ok(!remaining.includes('save_orphan3'), 'orphan payload must be removed');
  assert.ok(remaining.includes('save_a') && remaining.includes('save_b'), 'indexed saves keep their payloads');
});

test('save succeeds even when the quota is nearly full by pruning oldest saves', async () => {
  // Quota fits ~4.5 saves. Four manual saves nearly fill it; a new autosave
  // cannot fit until the aggressive prune drops the OLDEST manual save.
  const storage = makeStorage(150_000);
  (globalThis as any).localStorage = storage;
  const service = new SaveGameService();

  const manualIds: string[] = [];
  for (let i = 1; i <= 4; i++) {
    manualIds.push(service.saveGame(`Manual ${i}`, 'manual', makePayload(i)).id);
    await sleep(2);
  }
  assert.ok(manualIds.length === 4);

  // This write is larger than the remaining headroom — it must trigger the
  // aggressive prune + retry instead of throwing.
  const auto = service.saveGame('Autosave Day 5', 'autosave', makePayload(5));

  const ids = indexIds(storage);
  assert.ok(ids.includes(auto.id), 'new autosave must be saved');
  assert.ok(ids.includes(manualIds[3]), 'newest manual save must survive');
  assert.ok(!ids.includes(manualIds[0]), 'oldest manual save must be pruned to make room');
  // Every indexed save still has its payload.
  for (const id of ids) {
    assert.ok(storage.getItem(`${PREFIX}${id}`), `indexed save ${id} missing its payload`);
  }
});

test('overwriting an existing slot never prunes the slot being written', async () => {
  const storage = makeStorage(400_000);
  (globalThis as any).localStorage = storage;
  const service = new SaveGameService();

  const first = service.saveGame('My Save', 'manual', makePayload(1));
  for (let i = 2; i <= 6; i++) {
    service.saveGame(`Autosave Day ${i}`, 'autosave', makePayload(i));
  }
  // Overwrite the manual slot repeatedly (Save-modal behaviour).
  service.saveGame('My Save (updated)', 'manual', makePayload(2), first.id);
  service.saveGame('My Save (updated 2)', 'manual', makePayload(3), first.id);

  const ids = indexIds(storage);
  assert.ok(ids.includes(first.id), 'overwritten slot must stay in the index');
  assert.ok(storage.getItem(`${PREFIX}${first.id}`), 'overwritten slot payload must exist');
});
