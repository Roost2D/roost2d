# Asset loading

```ts
import { AssetManifestResolver, LazyAssetLoader } from '@roost2d/assets';

const manifest = await fetch('https://your-host.example/runtime/manifest.json').then((r) => r.json());
const resolver = new AssetManifestResolver(manifest, {
  baseUrl: 'https://your-host.example/',
  profile: 'default'
});
const loader = new LazyAssetLoader(resolver, { maxAssetBytes: 32 * 1024 * 1024 });
const result = await loader.loadBundle('scene-one');
if (result.failures.some(({ optional }) => !optional)) throw new Error('Required scene assets failed');
```

The loader validates the generated manifest, caps and streams each transfer, verifies the byte count and a SHA-256 SRI digest, deduplicates atlas downloads, and honors optional bundle entries.

Manifest paths must be relative and normalized. A variant path carrying a scheme, an authority, a leading `/`, a `..` segment, or a percent-encoded separator is rejected by `@roost2d/contracts` before any request is made, so a tampered manifest cannot redirect the loader to another origin.

A transfer is abandoned as soon as it exceeds the smaller of `variant.bytes` and `maxAssetBytes` (64 MB by default). Because `variant.bytes` comes from the manifest itself, set `maxAssetBytes` to something your game can actually afford.

Pass the resolver **and this loader** to `PixiAssetLoader`. Textures are decoded from the bytes verified here — the URL is never fetched a second time — and atlas-frame assets become cropped textures sharing one page source, so consumers never render the whole atlas by accident.
