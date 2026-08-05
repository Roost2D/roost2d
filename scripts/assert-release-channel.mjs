import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const tag = process.argv[2];
if (tag !== 'next' && tag !== 'latest') throw new Error('Expected npm tag next or latest');
const { version } = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
const prerelease = version.includes('-');
if (tag === 'next' && !prerelease) throw new Error(`next releases require a prerelease version; got ${version}`);
if (tag === 'latest' && prerelease) throw new Error(`latest releases require a stable version; got ${version}`);
console.log(`${version} is valid for npm dist-tag ${tag}.`);
