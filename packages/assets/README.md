# @roost2d/assets

Explicit-host, manifest-first asset loading with aliases, profiles, lazy bundles, byte preflight, and SHA-256 integrity checks.

```sh
npm install @roost2d/contracts @roost2d/assets
```

```ts
import { AssetManifestResolver, LazyAssetLoader } from '@roost2d/assets';
const resolver = new AssetManifestResolver(manifest, { baseUrl: 'https://cdn.example/game/v1/', profile: 'default' });
const assets = new LazyAssetLoader(resolver);
await assets.loadBundle('level-one');
```

The caller always chooses the host. Use `@roost2d/pixi` for cropped atlas textures. [Asset guide](https://github.com/Roost2D/roost2d/blob/main/docs/assets.md).
