import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const paths = ['packages/contracts/src/index.ts', 'packages/pixi/src/index.ts', 'packages/rig2d/src/index.ts', 'packages/chikn-rigs/src/index.ts', 'packages/chikn-rigs/src/actions.ts', 'packages/chikn-rigs/src/trait-profiles.ts', 'packages/chikn-rigs/data/chikn-rig.json', 'packages/chikn-rigs/data/roostr-rig.json', 'packages/chikn-rigs/data/chikn-anims.json', 'packages/chikn-rigs/data/roostr-anims.json'];
const hash = createHash('sha256');
for (const path of paths) {
  // Normalize checkout line endings so approval is portable between Windows and Linux.
  hash.update(path + '\0').update((await readFile(resolve(path), 'utf8')).replaceAll('\r\n', '\n')).update('\0');
}
const sourceSha256 = hash.digest('hex');
if (process.argv.includes('--fingerprint')) {
  console.log(sourceSha256);
} else {
  const review = JSON.parse(await readFile(resolve('config/trait-assembly-review.json'), 'utf8'));
  if (review.schema !== 'roost2d.trait-assembly-review/v1' || review.status !== 'approved' || !review.approvedBy?.trim() || !review.evidence?.trim()) throw new Error('Trait assembly review is pending. Show the complete preview gallery to the owner and record their explicit approval before publishing.');
  if (review.sourceSha256 !== sourceSha256) throw new Error('Trait layout changed after visual approval. Rebuild and review previews before publishing.');
  console.log(`Owner-approved trait assembly: ${sourceSha256}`);
}
