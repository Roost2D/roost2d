import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { AssetManifestResolver, LazyAssetLoader, fetchAssetManifest, selectAssetProfile } from '../dist/index.js';

const content = new TextEncoder().encode('atlas');
const sri = `sha256-${createHash('sha256').update(content).digest('base64')}`;
const manifest = {
  schema: 'roost2d.assets/v1', version: '0.1.0', generatedAt: '1970-01-01T00:00:00.000Z', rightsDocumentSha256: 'a'.repeat(64),
  profiles: { default: { maxAtlasSize: 2048, scale: .5, gpuBudgetBytes: 64 } },
  files: [{ id: 'atlas.one', mediaType: 'image/png', aliases: ['attachment-one'], variants: [{ profile: 'default', path: 'runtime/atlas.png', bytes: content.byteLength, integrity: { algorithm: 'sha256', value: sri }, scale: .5, frameId: 'atlas.one', frame: { x: 0, y: 0, width: 1, height: 1, sourceWidth: 2, sourceHeight: 2 } }] }],
  bundles: [{ id: 'core', lazy: false, items: [{ assetId: 'attachment-one', required: true }] }]
};

const resolverFor = (value = manifest) => new AssetManifestResolver(value, { baseUrl: 'https://assets.example/' });

/** A body that yields `chunkCount` chunks; `pulled` reports how many were actually read. */
function endlessResponse(chunkSize = 1024, chunkCount = 4096) {
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream({
    pull(controller) {
      if (state.pulled >= chunkCount) { controller.close(); return; }
      state.pulled += 1;
      controller.enqueue(new Uint8Array(chunkSize));
    },
    cancel() { state.cancelled = true; }
  });
  return { state, response: new Response(stream, { status: 200 }) };
}

test('resolves aliases and verifies fetched atlas bytes', async () => {
  let fetches = 0;
  const loader = new LazyAssetLoader(resolverFor(), async () => { fetches += 1; return new Response(content, { status: 200 }); });
  const [loaded] = await loader.loadBundle('core');
  assert.equal(loaded.asset.variant.frameId, 'atlas.one');
  assert.equal(fetches, 1);
});

test('browser fetch implementations retain the global invocation context', async () => {
  function assetFetch() {
    assert.equal(this, globalThis);
    return Promise.resolve(new Response(content, { status: 200 }));
  }
  const loader = new LazyAssetLoader(resolverFor(), assetFetch);
  await loader.load('atlas.one');

  function manifestFetch() {
    assert.equal(this, globalThis);
    return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }));
  }
  assert.equal((await fetchAssetManifest('https://assets.example/manifest.json', manifestFetch)).version, manifest.version);
});

// S4 — the loader used to buffer the entire body and only then compare it to `variant.bytes`.
test('an oversized body is cancelled instead of buffered', async () => {
  const { state, response } = endlessResponse();
  const loader = new LazyAssetLoader(resolverFor(), async () => response);
  await assert.rejects(loader.load('atlas.one'), /transfer limit/);
  assert.ok(state.pulled < 64, `must abandon the transfer early, pulled ${state.pulled} chunks`);
  assert.equal(state.cancelled, true);
});

test('maxAssetBytes caps a manifest that declares an absurd size', async () => {
  const huge = { ...manifest, files: [{ ...manifest.files[0], variants: [{ ...manifest.files[0].variants[0], bytes: 8 * 1024 * 1024 * 1024 }] }] };
  const { state, response } = endlessResponse();
  const loader = new LazyAssetLoader(resolverFor(huge), { fetch: async () => response, maxAssetBytes: 4096 });
  await assert.rejects(loader.load('atlas.one'), /4096 byte transfer limit/);
  assert.ok(state.pulled < 32, `must stop at the absolute cap, not the declared 8 GiB; pulled ${state.pulled} chunks`);
  assert.throws(() => new LazyAssetLoader(resolverFor(), { maxAssetBytes: 0, fetch: async () => new Response(content) }), /maxAssetBytes/);
});

test('an overstated Content-Length cannot reject a valid decoded body', async () => {
  const loader = new LazyAssetLoader(resolverFor(), async () => new Response(content, { status: 200, headers: { 'content-length': '999999' } }));
  const loaded = await loader.load('atlas.one');
  assert.equal(loaded.bytes.byteLength, content.byteLength);
});

// Content-Length is the *encoded* length, so a compressed response legitimately understates it.
test('a compressed response whose Content-Length understates the decoded size still loads', async () => {
  const loader = new LazyAssetLoader(resolverFor(), async () => new Response(content, { status: 200, headers: { 'content-length': '2' } }));
  const loaded = await loader.load('atlas.one');
  assert.equal(loaded.bytes.byteLength, content.byteLength);
});

// B7 — unknown ids threw, and `unload` left the whole ArrayBuffer in the URL-keyed cache.
test('isLoaded and unload report unknown assets instead of throwing', async () => {
  const loader = new LazyAssetLoader(resolverFor(), async () => new Response(content, { status: 200 }));
  assert.equal(loader.isLoaded('nope'), false);
  assert.equal(loader.unload('nope'), false);
  assert.equal(loader.unload('atlas.one'), false, 'a never-loaded asset is not unloaded');
});

test('unload releases the buffered bytes so the next load refetches', async () => {
  let fetches = 0;
  const loader = new LazyAssetLoader(resolverFor(), async () => { fetches += 1; return new Response(content, { status: 200 }); });
  await loader.load('atlas.one');
  assert.equal(loader.isLoaded('attachment-one'), true, 'aliases resolve to the canonical id');
  assert.equal(loader.unload('atlas.one'), true);
  assert.equal(loader.isLoaded('atlas.one'), false);
  await loader.load('atlas.one');
  assert.equal(fetches, 2, 'the URL-level byte cache must be released with the asset');
});

test('selectAssetProfile rejects a manifest with no profiles', () => {
  assert.equal(selectAssetProfile(manifest, 4096, 'default'), 'default');
  for (const profiles of [undefined, null, 3, []]) assert.throws(() => selectAssetProfile({ ...manifest, profiles }, 4096), /profiles/);
});
