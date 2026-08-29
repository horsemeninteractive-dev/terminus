import fs from 'fs';
import path from 'path';
import type { MapData } from '../src/types/map';

const MAX_BYTES = 9_500_000;
const dir = path.resolve('src/data/maps');

type ChunkKind = 'buildings' | 'roads' | 'landuse' | 'resourceNodes';
type Chunk = { kind: ChunkKind; index: number; items: unknown[] };

function splitArray(kind: ChunkKind, items: unknown[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: unknown[] = [];
  for (const item of items) {
    const candidate = [...current, item];
    if (current.length > 0 && Buffer.byteLength(JSON.stringify(candidate)) > MAX_BYTES) {
      chunks.push({ kind, index: chunks.length, items: current });
      current = [item];
    } else {
      current = candidate;
    }
  }
  if (current.length) chunks.push({ kind, index: chunks.length, items: current });
  return chunks;
}

for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json') && !name.includes('.part.'))) {
  const fullPath = path.join(dir, file);
  const map = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as MapData;
  if (fs.statSync(fullPath).size <= MAX_BYTES) continue;

  const chunks: Chunk[] = [
    ...splitArray('buildings', map.buildings),
    ...splitArray('roads', map.roads),
    ...splitArray('landuse', map.landuse),
    ...splitArray('resourceNodes', map.resourceNodes),
  ];
  const base = file.slice(0, -5);
  const manifest = {
    format: 'terminus-map-chunks-v1',
    base: `${base}.base.json`,
    chunks: chunks.map((chunk) => ({
      file: `${base}.part.${chunk.kind}.${chunk.index}.json`,
      kind: chunk.kind,
      count: chunk.items.length,
    })),
  };

  const baseMap = { ...map, buildings: [], roads: [], landuse: [], resourceNodes: [] };
  fs.writeFileSync(path.join(dir, manifest.base), JSON.stringify(baseMap));
  for (const chunk of chunks) {
    fs.writeFileSync(path.join(dir, `${base}.part.${chunk.kind}.${chunk.index}.json`), JSON.stringify(chunk.items));
  }
  fs.writeFileSync(fullPath, JSON.stringify(manifest));
  console.log(`${file}: ${chunks.length} chunks`);
}
