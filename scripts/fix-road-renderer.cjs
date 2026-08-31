const fs = require('fs');
const p = 'src/render/RoadRenderer.ts';
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('  private decodeStreetName(value: string): string {\\n');
const next = s.indexOf('  private decodeStreetName(value: string): string {\n', start + 1);
if (start >= 0 && next > start) s = s.slice(0, start) + s.slice(next);
fs.writeFileSync(p, s);
