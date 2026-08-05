import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

for (const directory of ['dist', 'coverage', 'docs/.vitepress/dist', 'apps/showcase/dist']) {
  await rm(resolve(directory), { recursive: true, force: true });
}
for (const directory of await readdir(resolve('packages'))) await rm(resolve('packages', directory, 'dist'), { recursive: true, force: true });
