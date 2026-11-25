import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('publishing requires explicit owner approval of the exact portable source fingerprint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'roost2d-assembly-approval-'));
  const script = fileURLToPath(new URL('../verify-assembly-approval.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
  try {
    for (const path of ['config','packages/contracts/src','packages/pixi/src','packages/rig2d/src','packages/chikn-rigs/src','packages/chikn-rigs/data']) await mkdir(join(root,path), { recursive: true });
    for (const path of ['contracts','pixi','rig2d']) await writeFile(join(root, 'packages', path, 'src/index.ts'), '{}\r\n');
    for (const path of ['src/index.ts','src/actions.ts','src/trait-profiles.ts','data/chikn-rig.json','data/roostr-rig.json','data/chikn-anims.json','data/roostr-anims.json']) await writeFile(join(root,'packages/chikn-rigs',path), '{}\r\n');
    const sourceSha256 = run('--fingerprint').stdout.trim();
    assert.match(sourceSha256, /^[a-f0-9]{64}$/);
    const review = { schema: 'roost2d.trait-assembly-review/v1', status: 'pending', sourceSha256 };
    const save = () => writeFile(join(root,'config/trait-assembly-review.json'), JSON.stringify(review));
    await save(); assert.notEqual(run().status, 0);
    Object.assign(review, { status: 'approved', approvedBy: 'owner', evidence: 'reviewed complete gallery' });
    await save(); assert.equal(run().status, 0);
    await writeFile(join(root,'packages/chikn-rigs/data/chikn-rig.json'), '{}\n');
    assert.equal(run().status, 0, 'checkout line endings do not invalidate approval');
    await writeFile(join(root,'packages/pixi/src/index.ts'), '{"changed":true}\n');
    assert.notEqual(run().status, 0, 'renderer changes invalidate visual approval');
    await writeFile(join(root,'packages/pixi/src/index.ts'), '{}\n');
    await writeFile(join(root,'packages/chikn-rigs/data/chikn-rig.json'), '{"changed":true}\n');
    assert.notEqual(run().status, 0, 'a subsequent layout change invalidates visual approval');
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), 'roost2d-assembly-approval-')), 'cleanup remains inside the task-owned temporary directory');
    await rm(root, { recursive: true, force: true });
  }
});
