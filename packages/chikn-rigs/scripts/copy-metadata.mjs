import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const from = resolve('data');
const to = resolve('dist/data');
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
