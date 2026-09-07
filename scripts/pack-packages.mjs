import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const destination = resolve(process.argv[2] ?? 'dist-pack');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packageRoot = resolve('packages');
const packages = new Map();

for (const directory of await readdir(packageRoot)) {
  const root = resolve(packageRoot, directory);
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (!manifest.private) packages.set(manifest.name, { root, manifest });
}

const ordered = [];
const visiting = new Set();
const visited = new Set();
function visit(name) {
  if (visited.has(name)) return;
  if (visiting.has(name)) throw new Error(`Package dependency cycle at ${name}`);
  const entry = packages.get(name);
  if (!entry) throw new Error(`Unknown package ${name}`);
  visiting.add(name);
  for (const dependency of Object.keys(entry.manifest.dependencies ?? {})) {
    if (packages.has(dependency)) visit(dependency);
  }
  visiting.delete(name);
  visited.add(name);
  ordered.push(entry);
}
for (const name of [...packages.keys()].sort()) visit(name);

await mkdir(destination, { recursive: true });
const existing = (await readdir(destination)).filter((name) => name.endsWith('.tgz') || name === 'publish-order.txt');
if (existing.length > 0) throw new Error(`Refusing to mix release artifacts with existing files: ${existing.join(', ')}`);

const tarballs = [];
for (const { root, manifest } of ordered) {
  const result = spawnSync(
    npm,
    ['pack', root, '--json', '--silent', '--pack-destination', destination],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (result.status !== 0) {
    throw new Error(`Packing failed for ${manifest.name}: ${result.stderr ?? result.error?.message ?? 'unknown error'}`);
  }
  const [packed] = JSON.parse(result.stdout);
  const filename = basename(packed.filename);
  if (!/^[A-Za-z0-9._-]+\.tgz$/.test(filename)) throw new Error(`Unsafe tarball filename: ${filename}`);
  tarballs.push(filename);
  console.log(`Packed ${manifest.name}@${manifest.version} as ${filename}`);
}

if (tarballs.length !== 14 || new Set(tarballs).size !== tarballs.length) {
  throw new Error(`Expected 14 unique public package tarballs, got ${tarballs.length}`);
}
await writeFile(resolve(destination, 'publish-order.txt'), `${tarballs.join('\n')}\n`, 'utf8');
console.log(`Wrote dependency order for ${tarballs.length} packages.`);
