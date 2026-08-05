import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
const packages = [];
for (const directory of await readdir(resolve('packages'))) {
  const manifest = JSON.parse(await readFile(resolve('packages', directory, 'package.json'), 'utf8'));
  packages.push(manifest);
  if (manifest.version !== root.version) throw new Error(`${manifest.name} is ${manifest.version}; expected lockstep ${root.version}`);
}
console.log(`Lockstep release version ${root.version} verified across ${packages.length} public packages.`);
