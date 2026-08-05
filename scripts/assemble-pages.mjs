import { cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = resolve('docs/.vitepress/dist/showcase');
await rm(target, { recursive: true, force: true });
await cp(resolve('apps/showcase/dist'), target, { recursive: true });
