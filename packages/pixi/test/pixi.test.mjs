import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { AssetManifestResolver, LazyAssetLoader } from '@roost2d/assets';
import { Rectangle, Texture } from 'pixi.js';
import { Camera2D, LayerStack, PixiAssetLoader, PixiRigFactory } from '../dist/index.js';

const verified = new TextEncoder().encode('verified-atlas-bytes');
const sri = `sha256-${createHash('sha256').update(verified).digest('base64')}`;
const frame = (x) => ({ x, y: 0, width: 8, height: 8, sourceWidth: 8, sourceHeight: 8 });
const variant = (frameId, x) => ({ profile: 'default', path: 'runtime/atlas.png', bytes: verified.byteLength, integrity: { algorithm: 'sha256', value: sri }, scale: 1, frameId, frame: frame(x) });
const manifest = {
  schema: 'roost2d.assets/v1', version: '0.1.0', generatedAt: '1970-01-01T00:00:00.000Z', rightsDocumentSha256: 'a'.repeat(64),
  profiles: { default: { maxAtlasSize: 2048, scale: 1, gpuBudgetBytes: 64 } },
  files: [
    { id: 'atlas.head', mediaType: 'image/png', variants: [variant('head', 0)] },
    { id: 'atlas.body', mediaType: 'image/png', variants: [variant('body', 8)] }
  ],
  bundles: []
};

/** Counts decodes and closes so page sharing and teardown are observable. */
function stubImageBitmaps() {
  const state = { decodes: 0, closed: 0 };
  const original = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => { state.decodes += 1; return { width: 16, height: 8, close() { state.closed += 1; } }; };
  return { state, restore: () => { globalThis.createImageBitmap = original; } };
}

function loaderFor(fetchImpl) {
  const resolver = new AssetManifestResolver(manifest, { baseUrl: 'https://assets.example/' });
  return new PixiAssetLoader(resolver, new LazyAssetLoader(resolver, fetchImpl));
}

test('layer definitions remain game supplied', () => { const layers = new LayerStack([{ id: 'background', order: 0 }, { id: 'actors', order: 10 }]); assert.equal(layers.get('actors').zIndex, 10); assert.throws(() => layers.get('towers')); layers.destroy(); });
test('camera clamps zoom and supports coordinate transforms', () => { const camera = new Camera2D(); camera.setViewport(800, 600); camera.setPosition(200, 100); camera.setZoom(100); assert.equal(camera.container.scale.x, 8); const screen = camera.worldToScreen({ x: 200, y: 100 }); assert.deepEqual({ x: screen.x, y: screen.y }, { x: 400, y: 300 }); camera.container.destroy(); });

test('PixiAssetLoader requires an integrity loader', () => {
  const resolver = new AssetManifestResolver(manifest, { baseUrl: 'https://assets.example/' });
  assert.throws(() => new PixiAssetLoader(resolver), /integrity-checked bytes/);
});

// S2 — the loader used to verify one response and then render a second, unverified one. A host that
// serves clean bytes first and hostile bytes second must never get a second chance to be asked.
test('a texture is built from the verified response and the URL is fetched exactly once', async (t) => {
  const bitmaps = stubImageBitmaps();
  t.after(bitmaps.restore);
  let fetches = 0;
  const loader = loaderFor(async () => {
    fetches += 1;
    // Anything after the first response is hostile; reaching it at all is the bug.
    return new Response(fetches === 1 ? verified : new TextEncoder().encode('hostile-substituted!'), { status: 200 });
  });

  const texture = await loader.load('atlas.head');
  assert.equal(fetches, 1, 'the verified bytes must be the ones decoded');
  assert.equal(bitmaps.state.decodes, 1);
  assert.equal(texture.label, 'head');
  assert.equal(texture.frame.width, 8);
});

test('frames of one atlas page share a single decode and one page source', async (t) => {
  const bitmaps = stubImageBitmaps();
  t.after(bitmaps.restore);
  let fetches = 0;
  const loader = loaderFor(async () => { fetches += 1; return new Response(verified, { status: 200 }); });

  const [head, body] = await Promise.all([loader.load('atlas.head'), loader.load('atlas.body')]);
  assert.equal(fetches, 1, 'one page, one transfer');
  assert.equal(bitmaps.state.decodes, 1, 'one page, one decode');
  assert.equal(head.source, body.source, 'both frames must share the page source');
  assert.notEqual(head.frame.x, body.frame.x);
});

test('the page source is destroyed and the bitmap closed exactly once', async (t) => {
  const bitmaps = stubImageBitmaps();
  t.after(bitmaps.restore);
  const loader = loaderFor(async () => new Response(verified, { status: 200 }));

  const head = await loader.load('atlas.head');
  await loader.load('atlas.body');
  loader.unload('atlas.head');
  assert.equal(head.destroyed, true, 'the frame texture is destroyed');
  assert.equal(bitmaps.state.closed, 0, 'the shared page survives while another frame references it');

  loader.unload('atlas.body');
  assert.equal(bitmaps.state.closed, 1, 'the last reference closes the page');

  await loader.clear();
  assert.equal(bitmaps.state.closed, 1, 'clear must not double-close an already released page');
});

test('clear releases pages that are still referenced', async (t) => {
  const bitmaps = stubImageBitmaps();
  t.after(bitmaps.restore);
  const loader = loaderFor(async () => new Response(verified, { status: 200 }));
  await loader.load('atlas.head');
  await loader.clear();
  assert.equal(bitmaps.state.closed, 1);
  assert.equal(loader.unload('atlas.head'), undefined, 'unloading after clear is a no-op');
});

test('a failed decode does not poison the page cache', async (t) => {
  const bitmaps = stubImageBitmaps();
  t.after(bitmaps.restore);
  let fetches = 0;
  const loader = loaderFor(async () => { fetches += 1; return fetches === 1 ? new Response('nope', { status: 500 }) : new Response(verified, { status: 200 }); });
  await assert.rejects(loader.load('atlas.head'), /Failed to load/);
  const texture = await loader.load('atlas.head');
  assert.equal(texture.label, 'head');
  assert.equal(fetches, 2);
});

test('rig layoutScale changes logical bounds without changing sampled pixels or shared source', () => {
  const shared = Texture.WHITE;
  const source = new Texture({
    source: shared.source,
    frame: new Rectangle(1, 2, 8, 6),
    orig: new Rectangle(0, 0, 20, 16),
    trim: new Rectangle(4, 2, 8, 6),
    rotate: 2,
  });
  const factory = new PixiRigFactory(new Map([['part', source]]));
  const node = factory.createAttachment('scaled', { assetId: 'part', layoutScale: 0.25 });
  const derived = node.display.texture;

  assert.notEqual(derived, source);
  assert.equal(derived.source, source.source);
  assert.deepEqual([derived.frame.x, derived.frame.y, derived.frame.width, derived.frame.height], [1, 2, 8, 6]);
  assert.deepEqual([derived.orig.x, derived.orig.y, derived.orig.width, derived.orig.height], [0, 0, 5, 4]);
  assert.deepEqual([derived.trim.x, derived.trim.y, derived.trim.width, derived.trim.height], [1, 0.5, 2, 1.5]);
  assert.equal(derived.rotate, source.rotate);

  factory.destroy(node);
  assert.equal(derived.destroyed, true);
  assert.equal(source.destroyed, false, 'destroying a rig-derived texture must preserve the shared atlas texture');
  source.destroy(false);
  factory.destroyRoot();
});

test('rig layoutScale 1 reuses the preloaded texture', () => {
  const source = new Texture({ source: Texture.WHITE.source });
  const factory = new PixiRigFactory(new Map([['part', source]]));
  const implicit = factory.createAttachment('implicit', { assetId: 'part' });
  const explicit = factory.createAttachment('explicit', { assetId: 'part', layoutScale: 1 });
  assert.equal(implicit.display.texture, source);
  assert.equal(explicit.display.texture, source);
  factory.destroy(implicit);
  factory.destroy(explicit);
  assert.equal(source.destroyed, false);
  source.destroy(false);
  factory.destroyRoot();
});
