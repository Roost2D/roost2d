# Asset loading

```ts
import { AssetManifestResolver, LazyAssetLoader } from '@roost2d/assets';

const manifest = await fetch('https://your-host.example/runtime/manifest.json').then((r) => r.json());
const resolver = new AssetManifestResolver(manifest, {
  baseUrl: 'https://your-host.example/',
  profile: 'default'
});
const loader = new LazyAssetLoader(resolver);
const result = await loader.loadBundle('scene-one');
if (result.failures.some(({ optional }) => !optional)) throw new Error('Required scene assets failed');
```

The loader validates the generated manifest, preflights bytes, verifies a SHA-256 SRI digest, deduplicates atlas downloads, and honors optional bundle entries.

Pass the same resolver to `PixiAssetLoader`. Atlas-frame assets become cropped Pixi textures sharing one page source; consumers never render the whole atlas by accident.
