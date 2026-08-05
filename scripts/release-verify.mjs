import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const packageRoot = resolve('packages');
const packageDirectories = await readdir(packageRoot);
const errors = [];
for (const required of ['README.md', 'AGENTS.md', 'llms.txt', 'docs/getting-started.md', 'docs/chikn-assets.md', 'docs/public/llms.txt']) {
  try { const contents = await readFile(resolve(required), 'utf8'); if (contents.trim().length < 200) errors.push(`${required}: integration documentation is unexpectedly short`); }
  catch { errors.push(`Missing integration documentation: ${required}`); }
}
for (const directory of packageDirectories) {
  const root = resolve(packageRoot, directory);
  if (!(await stat(root)).isDirectory()) continue;
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const readme = await readFile(resolve(root, 'README.md'), 'utf8').catch(() => '');
  if (readme.length < 350 || !readme.includes('npm install')) errors.push(`${manifest.name}: npm README must contain useful install/usage guidance`);
  if (manifest.repository?.url !== 'git+https://github.com/Roost2D/roost2d.git') errors.push(`${manifest.name}: repository.url must match the trusted-publisher repository`);
  if (manifest.license !== 'Apache-2.0') errors.push(`${manifest.name}: generic Roost2D packages must remain Apache-2.0`);
  const dependencies = { ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies };
  if (Object.keys(dependencies).some((name) => name.startsWith('@chikn-game-assets/'))) errors.push(`${manifest.name}: generic engine packages must not require the Chikn content pack`);
  const entry = resolve(root, manifest.exports['.'].import);
  try { await stat(entry); } catch { errors.push(`${manifest.name}: missing ${manifest.exports['.'].import}`); }
}
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Verified ${packageDirectories.length} package artifacts.`);
