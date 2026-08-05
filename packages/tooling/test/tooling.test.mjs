import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  readJsonFile, validateAnimationFile, validateAtlasFiles, validateRigFile,
  sourceSha256Hex, verifyManifestFiles, verifyRightsFiles, verifyToolingBoundary, verifyToolingPackageGraph
} from '../dist/index.js';

const sri = 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

async function scratch(files) {
  const root = await mkdtemp(join(tmpdir(), 'roost2d-tooling-'));
  for (const [name, contents] of Object.entries(files)) {
    const target = join(root, name);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, typeof contents === 'string' ? contents : JSON.stringify(contents));
  }
  return root;
}

test('tooling source remains detached from browser runtime imports', async () => {
  assert.deepEqual(await verifyToolingBoundary(resolve('src')), []);
});

test('tooling package graph only permits contracts', async () => {
  assert.deepEqual(await verifyToolingPackageGraph(resolve('package.json')), []);
});

// S3 — a crafted atlas.json used to make the CLI read any file on disk and feed it to Sharp.
test('atlas validation never reads an image outside the atlas directory', async (t) => {
  const root = await scratch({});
  t.after(() => rm(root, { recursive: true, force: true }));
  const secret = join(root, 'secret.txt');
  await writeFile(secret, 'classified');

  for (const image of ['../secret.txt', '/etc/passwd', 'a/../../secret.txt', 'HTTPS://evil.example.com/x.png']) {
    const atlasFile = join(root, 'pack', 'atlas.json');
    await mkdir(join(root, 'pack'), { recursive: true });
    await writeFile(atlasFile, JSON.stringify({ schema: 'roost2d.atlas/v1', profile: 'default', image, integrity: { algorithm: 'sha256', value: sri }, width: 8, height: 8, frames: {} }));
    const errors = await validateAtlasFiles(atlasFile);
    assert.ok(errors.length, `${image} must be rejected`);
    assert.ok(!errors.some((error) => /integrity mismatch|dimensions mismatch/.test(error)), `${image} must not reach the filesystem: ${errors.join('; ')}`);
  }
});

test('atlas validation rejects a symlink that escapes the atlas directory', async (t) => {
  const root = await scratch({});
  t.after(() => rm(root, { recursive: true, force: true }));
  const outside = join(root, 'outside');
  const pack = join(root, 'pack');
  await mkdir(outside, { recursive: true });
  await mkdir(pack, { recursive: true });
  await writeFile(join(outside, 'secret.png'), 'classified');
  try { await symlink(outside, join(pack, 'link'), 'junction'); } catch { t.skip('symlink creation is not permitted here'); return; }

  const atlasFile = join(pack, 'atlas.json');
  await writeFile(atlasFile, JSON.stringify({ schema: 'roost2d.atlas/v1', profile: 'default', image: 'link/secret.png', integrity: { algorithm: 'sha256', value: sri }, width: 8, height: 8, frames: {} }));
  const errors = await validateAtlasFiles(atlasFile);
  assert.match(errors.join('\n'), /escapes the atlas directory/);
});

test('manifest verification rejects a final-file symlink that escapes the asset root', async (t) => {
  const root = await scratch({});
  const outside = await scratch({ 'secret.png': 'classified' });
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  try { await symlink(join(outside, 'secret.png'), join(root, 'linked.png'), 'file'); } catch { t.skip('symlink creation is not permitted here'); return; }
  const manifest = {
    schema: 'roost2d.assets/v1', version: '0.1.0', generatedAt: '1970-01-01T00:00:00.000Z', rightsDocumentSha256: 'a'.repeat(64),
    profiles: { default: { maxAtlasSize: 2048, scale: 1, gpuBudgetBytes: 64 } },
    files: [{ id: 'linked', mediaType: 'image/png', variants: [{ profile: 'default', path: 'linked.png', bytes: 10, integrity: { algorithm: 'sha256', value: sri }, scale: 1 }] }],
    bundles: []
  };
  assert.match((await verifyManifestFiles(manifest, root)).join('\n'), /path escapes asset root/);
});

test('rights exclusions use the same source-relative namespace as inventory entries', async (t) => {
  const root = await scratch({ 'legacy/unused.png': 'excluded' });
  t.after(() => rm(root, { recursive: true, force: true }));
  const rights = {
    schema: 'chikn-game-assets.rights/v1', version: '0.1.0', generatedAt: '1970-01-01T00:00:00.000Z',
    assets: [], excludedPaths: ['sources/legacy/unused.png']
  };
  assert.deepEqual(await verifyRightsFiles(rights, root), []);
});

test('rights hashes canonicalize text line endings but preserve binary bytes', () => {
  assert.equal(sourceSha256Hex(Buffer.from('{\r\n  "ok": true\r\n}\r\n'), 'sources/a.json'), sourceSha256Hex(Buffer.from('{\n  "ok": true\n}\n'), 'sources/a.json'));
  assert.notEqual(sourceSha256Hex(Buffer.from('a\r\n'), 'sources/a.png'), sourceSha256Hex(Buffer.from('a\n'), 'sources/a.png'));
});

test('manifest verification stops before touching the filesystem on structural errors', async (t) => {
  const root = await scratch({});
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = {
    schema: 'roost2d.assets/v1', version: '0.1.0', generatedAt: '1970-01-01T00:00:00.000Z', rightsDocumentSha256: 'a'.repeat(64),
    profiles: { default: { maxAtlasSize: 2048, scale: 1, gpuBudgetBytes: 64 } },
    files: [{ id: 'a', mediaType: 'image/png', variants: [{ profile: 'default', path: '../escape.png', bytes: 1, integrity: { algorithm: 'sha256', value: sri }, scale: 1 }] }],
    bundles: []
  };
  const errors = await verifyManifestFiles(manifest, root);
  assert.match(errors.join('\n'), /relative/);
  assert.ok(!errors.some((error) => /missing/.test(error)), 'must not have attempted a read');
  for (const value of [null, 3, 'text', [], undefined]) assert.ok((await verifyManifestFiles(value, root)).length, `${JSON.stringify(value) ?? 'undefined'} must be reported`);
});

// S6 consumer half — the CLI entry points used to JSON.parse and iterate whatever came back.
test('file validators report malformed JSON instead of throwing', async (t) => {
  const root = await scratch({
    'broken.json': '{ not json',
    'primitive.json': '3',
    'animations-primitive.json': '{"animations": 3}',
    'rig-null.json': 'null',
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.match((await validateRigFile(join(root, 'broken.json'))).join('\n'), /invalid JSON/);
  assert.match((await validateRigFile(join(root, 'rig-null.json'))).join('\n'), /must be an object/);
  assert.match((await validateRigFile(join(root, 'missing.json'))).join('\n'), /missing or unreadable/);
  assert.match((await validateAnimationFile(join(root, 'primitive.json'))).join('\n'), /expected a clip/);
  assert.match((await validateAnimationFile(join(root, 'animations-primitive.json'))).join('\n'), /expected a clip/);
  assert.match((await validateAtlasFiles(join(root, 'broken.json'))).join('\n'), /invalid JSON/);
  assert.match((await validateAtlasFiles(join(root, 'primitive.json'))).join('\n'), /must be an object/);

  const parsed = await readJsonFile(join(root, 'broken.json'));
  assert.equal(parsed.ok, false);
});
