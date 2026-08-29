/**
 * Offline water-polygon sanitizer. Clips every water landuse polygon to the
 * map bounds (±4200) and drops polygons that sit entirely outside — river
 * relations span the whole waterway, so elements far outside the fetch circle
 * previously bloated the bundles with giant out-of-bounds polygons.
 *
 *   npx tsx scripts/sanitize-water.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { clipPolygonToBounds } from './add-rivers';
import type { LanduseArea } from '../src/types/map';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../src/data/maps');
const CLIP_HALF = 4200;

function isInside(p: { x: number; z: number }): boolean {
  return Math.abs(p.x) <= CLIP_HALF && Math.abs(p.z) <= CLIP_HALF;
}

function processMap(file: string): { removed: number; clipped: number; unchanged: number } {
  const target = path.join(OUT_DIR, file);
  const data = JSON.parse(fs.readFileSync(target, 'utf8'));
  const landuse: LanduseArea[] = data.landuse || [];

  let removed = 0;
  let clipped = 0;
  let unchanged = 0;

  const sanitized = landuse.map((lu) => {
    if (lu.type !== 'water' || !lu.polygon || lu.polygon.length < 3) {
      unchanged++;
      return lu;
    }

    // Fast path: fully inside -> leave as-is.
    if (lu.polygon.every(isInside)) {
      unchanged++;
      return lu;
    }

    const clippedPoly = clipPolygonToBounds(lu.polygon, CLIP_HALF);
    if (clippedPoly.length < 3) {
      removed++;
      return null;
    }
    clipped++;
    return { ...lu, polygon: clippedPoly };
  }).filter((l): l is LanduseArea => l !== null);

  data.landuse = sanitized;
  fs.writeFileSync(target, JSON.stringify(data));
  return { removed, clipped, unchanged };
}

const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'));
let totalRemoved = 0;
for (const f of files) {
  const { removed, clipped, unchanged } = processMap(f);
  const data = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
  const water = (data.landuse || []).filter((l) => l.type === 'water').length;
  console.log(
    `${f.replace('.json', '').padEnd(18)} water: ${String(water).padEnd(4)} removed OOB: ${removed}, clipped: ${clipped}, unchanged: ${unchanged}`
  );
  totalRemoved += removed;
}
console.log(`\nDone. Removed ${totalRemoved} out-of-bounds water polygons.`);
