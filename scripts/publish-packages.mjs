import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const tag = process.argv[2];
if (!['next', 'latest'].includes(tag)) throw new Error('Usage: node scripts/publish-packages.mjs <next|latest>');
const bootstrap = process.argv.includes('--bootstrap');
if (bootstrap && tag !== 'next') {
  throw new Error('The one-time bootstrap publish is restricted to the next dist-tag.');
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packageRoot = resolve('packages');
const packages = new Map();
for (const directory of await readdir(packageRoot)) {
  const root = resolve(packageRoot, directory); const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (!manifest.private) packages.set(manifest.name, { root, manifest });
}

const ordered = []; const visiting = new Set(); const visited = new Set();
function visit(name) {
  if (visited.has(name)) return; if (visiting.has(name)) throw new Error(`Package dependency cycle at ${name}`);
  visiting.add(name); const entry = packages.get(name); if (!entry) throw new Error(`Unknown package ${name}`);
  for (const dependency of Object.keys(entry.manifest.dependencies ?? {})) if (packages.has(dependency)) visit(dependency);
  visiting.delete(name); visited.add(name); ordered.push(entry);
}
for (const name of [...packages.keys()].sort()) visit(name);

for (const { root, manifest } of ordered) {
  console.log(`Publishing ${manifest.name}@${manifest.version} under ${tag}...`);
  const provenance = bootstrap ? [] : ['--provenance'];
  const result = spawnSync(npm, ['publish', root, '--access', 'public', ...provenance, '--tag', tag], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`Publishing failed for ${manifest.name}`);
}
