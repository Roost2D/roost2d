import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packageRoot = resolve('packages');
const directories = (await readdir(packageRoot)).sort();
const errors = [];

for (const directory of directories) {
  const root = resolve(packageRoot, directory);
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (manifest.private) { errors.push(`${manifest.name}: packages/* must be public`); continue; }
  const result = spawnSync(npm, ['pack', root, '--json', '--dry-run', '--silent'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) { errors.push(`${manifest.name}: npm pack failed\n${result.stderr ?? result.error?.message ?? 'unknown error'}`); continue; }
  const [packed] = JSON.parse(result.stdout);
  const paths = new Set(packed.files.map(({ path }) => path));
  for (const required of ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/index.d.ts']) if (!paths.has(required)) errors.push(`${manifest.name}: packed file missing ${required}`);
  for (const { path } of packed.files) if (path.startsWith('src/') || path.startsWith('test/') || path.includes('node_modules/')) errors.push(`${manifest.name}: private development path packed: ${path}`);
  for (const { path } of packed.files) if (/\.(?:png|jpe?g|webp|gif|zip)$/i.test(path)) errors.push(`${manifest.name}: protected or game-specific binary content packed: ${path}`);
  if (packed.unpackedSize > 1_000_000) errors.push(`${manifest.name}: unpacked size ${packed.unpackedSize} exceeds 1 MB`);
  console.log(`${manifest.name}: ${packed.size} packed bytes, ${packed.unpackedSize} unpacked bytes, ${packed.files.length} files`);
}

if (errors.length) throw new Error(errors.join('\n'));
console.log(`Verified ${directories.length} public package tarballs; private app workspaces were excluded.`);
