import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { AssetManifestResolver, LazyAssetLoader } from '../dist/index.js';

const content = new TextEncoder().encode('atlas');
const sri = `sha256-${createHash('sha256').update(content).digest('base64')}`;
const manifest = {
  schema: 'roost2d.assets/v1', version: '0.1.0', generatedAt: '1970-01-01T00:00:00.000Z', rightsDocumentSha256: 'a'.repeat(64),
  profiles: { default: { maxAtlasSize: 2048, scale: .5, gpuBudgetBytes: 64 } },
  files: [{ id: 'atlas.one', mediaType: 'image/png', aliases: ['attachment-one'], variants: [{ profile: 'default', path: 'runtime/atlas.png', bytes: content.byteLength, integrity: { algorithm: 'sha256', value: sri }, scale: .5, frameId: 'atlas.one', frame: { x: 0, y: 0, width: 1, height: 1, sourceWidth: 2, sourceHeight: 2 } }] }],
  bundles: [{ id: 'core', lazy: false, items: [{ assetId: 'attachment-one', required: true }] }]
};

test('resolves aliases and verifies fetched atlas bytes', async () => {
  let fetches = 0;
  const resolver = new AssetManifestResolver(manifest, { baseUrl: 'https://assets.example/' });
  const loader = new LazyAssetLoader(resolver, async () => { fetches += 1; return new Response(content, { status: 200 }); });
  const [loaded] = await loader.loadBundle('core');
  assert.equal(loaded.asset.variant.frameId, 'atlas.one');
  assert.equal(fetches, 1);
});
