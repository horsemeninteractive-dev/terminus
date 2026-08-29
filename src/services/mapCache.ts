import { MapData } from '../types/map';

const DB_NAME = 'terminus_map_cache_db';
const STORE_NAME = 'map_data_cache';
const DB_VERSION = 1;

function getCacheKey(lat: number, lon: number, radius: number): string {
  return `map_${lat.toFixed(4)}_${lon.toFixed(4)}_${Math.round(radius)}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves processed map data into IndexedDB with localStorage fallback.
 */
export async function saveMapToCache(mapData: MapData): Promise<void> {
  const key = getCacheKey(mapData.center.lat, mapData.center.lon, mapData.radius);
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(mapData, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB save failed, falling back to localStorage:', err);
    try {
      localStorage.setItem(key, JSON.stringify(mapData));
    } catch (e) {
      console.warn('LocalStorage save failed (quota exceeded):', e);
    }
  }
}

/**
 * Retrieves processed map data from cache if present.
 */
export async function getMapFromCache(lat: number, lon: number, radius: number): Promise<MapData | null> {
  const key = getCacheKey(lat, lon, radius);
  try {
    const db = await openDatabase();
    const result = await new Promise<MapData | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (result) return result;
  } catch (err) {
    console.warn('IndexedDB read failed, checking localStorage:', err);
  }

  // Fallback check
  try {
    const item = localStorage.getItem(key);
    if (item) {
      return JSON.parse(item) as MapData;
    }
  } catch (e) {
    // ignore
  }

  return null;
}

/**
 * Clear map cache
 */
export async function clearMapCache(): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB clear failed:', err);
  }
}
