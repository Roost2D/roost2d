import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const targets = ['apps/showcase/public', 'docs/public'].map((directory) => resolve(directory));
const detailed = await readFile(resolve('assets/icon/roost2d-icon.svg'));
const simplified = await readFile(resolve('assets/icon/roost2d-icon-small.svg'));

// Below roughly 48px the Rift stencil and tile sides need heavier geometry, so the favicon
// sizes render from the simplified variant instead.
const rasters = [
  ['roost2d-icon.png', 512, detailed],
  ['roost2d-icon-192.png', 192, detailed],
  ['apple-touch-icon.png', 180, detailed],
  ['roost2d-icon-64.png', 64, detailed],
  ['favicon-32x32.png', 32, simplified],
  ['favicon-16x16.png', 16, simplified],
];

// One render per size, written to every target, so the duplicated public directories cannot drift.
const emit = async (name, data) => {
  for (const directory of targets) await writeFile(resolve(directory, name), data);
};

await emit('roost2d-icon.svg', detailed);
for (const [name, size, source] of rasters) {
  await emit(name, await sharp(source).resize(size, size).png({ compressionLevel: 9, effort: 10, adaptiveFiltering: false, palette: false }).toBuffer());
}

console.log(`rendered ${rasters.length + 1} icon files into ${targets.length} directories`);
