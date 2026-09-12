/**
 * One-off script: rasterize the Terminus skull SVG into the PWA icon set
 * (192/512 launcher PNGs, maskable variants with safe-zone padding, plus a
 * 32x32 favicon PNG). Run with: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/icons/terminus-skull-512.svg'));

mkdirSync(join(root, 'public/icons'), { recursive: true });

async function png(size, out, { pad = 0, bg = null } = {}) {
  // viewBox is 100x100; pad shrinks the art and centers it for maskable icons.
  const art = Math.round(100 - pad * 2);
  let img = sharp(svg, { density: 96 * (size / (art / 100)) });
  let pipeline;
  if (pad > 0) {
    const inner = await sharp(svg, { density: 96 * ((size * (art / 100)) / 100) })
      .resize(Math.round((size * art) / 100), Math.round((size * art) / 100))
      .png()
      .toBuffer();
    pipeline = sharp({
      create: { width: size, height: size, channels: 4, background: bg ?? '#0A0A0A' },
    }).composite([{ input: inner, gravity: 'center' }]);
  } else {
    pipeline = sharp(svg, { density: 96 * (size / 100) }).resize(size, size);
  }
  await pipeline.png().toFile(join(root, 'public/icons', out));
  console.log('wrote', out);
}

await png(192, 'terminus-skull-192.png');
await png(512, 'terminus-skull-512.png');
await png(192, 'terminus-skull-maskable-192.png', { pad: 10 });
await png(512, 'terminus-skull-maskable-512.png', { pad: 10 });
await png(32, 'favicon-32.png');
console.log('done');
