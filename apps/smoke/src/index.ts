import assert from 'node:assert/strict';
import { AssetManifestResolver } from '@roost2d/assets';
import { AudioMixer } from '@roost2d/audio';
import { BlueprintSession, gameBlueprintSchema } from '@roost2d/blueprint';
import { chiknRigMetadataUrl } from '@roost2d/chikn-rigs';
import { validateAssetManifest } from '@roost2d/contracts';
import { FixedStepClock, SeededRandom } from '@roost2d/core';
import { Diagnostics } from '@roost2d/diagnostics';
import { scalePop } from '@roost2d/effects';
import { InputManager } from '@roost2d/input';
import { gridToScreen, screenToGrid } from '@roost2d/isometric';
import { decodeEnvelope, encodeEnvelope, SnapshotBuffer } from '@roost2d/net';
import { Camera2D } from '@roost2d/pixi';
import { RigRuntime } from '@roost2d/rig2d';
import { sha256Hex } from '@roost2d/tooling';

const manifest = {
  schema: 'roost2d.assets/v1' as const,
  version: 'smoke', generatedAt: new Date(0).toISOString(), rightsDocumentSha256: '0'.repeat(64),
  profiles: { default: { maxAtlasSize: 2048, scale: 1, gpuBudgetBytes: 1024 }, high: { maxAtlasSize: 4096, scale: 2, gpuBudgetBytes: 4096 } },
  files: [{ id: 'neutral/dot', mediaType: 'image/png', variants: [{ profile: 'default', path: 'dot.png', bytes: 1, integrity: { algorithm: 'sha256' as const, value: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }, scale: 1 }] }],
  bundles: [{ id: 'boot', lazy: false, items: [{ assetId: 'neutral/dot', required: true }] }],
};
assert.deepEqual(validateAssetManifest(manifest), []);
assert.equal(new AssetManifestResolver(manifest, { baseUrl: 'https://example.test/release/' }).resolve('neutral/dot').url.href, 'https://example.test/release/dot.png');
let ticks = 0; new FixedStepClock(10).advance(35, () => ticks += 1); assert.equal(ticks, 3);
assert.equal(new SeededRandom(7).integer(0, 10), new SeededRandom(7).integer(0, 10));
const projection = { tileWidth: 64, tileHeight: 32, origin: { x: 0, y: 0 } }; const screen = gridToScreen({ x: 2, y: 1 }, projection); const grid = screenToGrid(screen, projection);
assert.ok(Math.abs(grid.x - 2) < 1e-9 && Math.abs(grid.y - 1) < 1e-9);
const envelope = decodeEnvelope(encodeEnvelope('ready', '1', { ok: true }, 1)); assert.equal(envelope.type, 'ready');
const snapshots = new SnapshotBuffer<number>(); snapshots.push({ timeMs: 1, value: 2 }); assert.equal(snapshots.sample(1, (from) => from), 2);
const target = { x: 0, y: 0, scaleX: 1, scaleY: 1 }; const effect = scalePop(target); effect.reset(); effect.update(90); assert.ok(target.scaleX > 1);
const diagnostics = new Diagnostics(3, () => 1); diagnostics.increment('imports', 13); assert.equal(diagnostics.snapshot().counters.imports, 13);
assert.equal(sha256Hex(new TextEncoder().encode('roost2d')).length, 64); assert.ok(chiknRigMetadataUrl.href.endsWith('chikn-rig.json'));
assert.equal(typeof AudioMixer, 'function'); assert.equal(typeof InputManager, 'function'); assert.equal(typeof Camera2D, 'function'); assert.equal(typeof RigRuntime, 'function');
assert.equal(typeof BlueprintSession, 'function'); assert.equal(gameBlueprintSchema.safeParse({}).success, false);
console.log('Roost2D public package smoke test passed for all 14 packages.');
