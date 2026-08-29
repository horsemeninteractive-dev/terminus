const fs = require('fs');
const path = require('path');
const MAX_BYTES = 9500000;
const dir = path.resolve('src/data/maps');
const kinds = ['buildings', 'roads', 'landuse', 'resourceNodes'];
function split(kind, items) {
  const out = []; let current = []; let size = 2;
  for (const item of items) {
    const encoded = JSON.stringify(item); const next = size + (current.length ? 1 : 0) + Buffer.byteLength(encoded);
    if (current.length && next > MAX_BYTES) { out.push(current); current = [item]; size = 2 + Buffer.byteLength(encoded); }
    else { current.push(item); size = next; }
  }
  if (current.length) out.push(current);
  return out;
}
for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json') && !n.includes('.part.') && !n.endsWith('.base.json'))) {
  const file = path.join(dir, name);
  if (fs.statSync(file).size <= MAX_BYTES) continue;
  console.log(`Reading ${name}...`);
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = name.slice(0, -5); const chunks = [];
  for (const kind of kinds) for (const items of split(kind, map[kind] || [])) {
    const out = `${base}.part.${kind}.${chunks.length}.json`;
    fs.writeFileSync(path.join(dir, out), JSON.stringify(items));
    chunks.push({ file: out, kind, count: items.length });
  }
  const baseFile = `${base}.base.json`;
  fs.writeFileSync(path.join(dir, baseFile), JSON.stringify({...map, buildings: [], roads: [], landuse: [], resourceNodes: []}));
  fs.writeFileSync(file, JSON.stringify({format:'terminus-map-chunks-v1', base:baseFile, chunks}));
  console.log(`${name}: ${chunks.length} chunks`);
}
