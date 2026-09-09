# @roost2d/pixi

PixiJS v8 application, camera, layer, atlas-texture, and Rig2D display adapters.

```sh
npm install pixi.js @roost2d/pixi
```

```ts
import { PixiApplicationHost } from '@roost2d/pixi';
const host = await PixiApplicationHost.create({ mount: document.querySelector('#app')!, resizeTo: window });
```

Use `PixiAssetLoader` with `@roost2d/assets` to turn a logical atlas-frame ID into a cropped Pixi texture:

```ts
import { AssetManifestResolver, LazyAssetLoader } from '@roost2d/assets';
import { PixiAssetLoader } from '@roost2d/pixi';

const resolver = new AssetManifestResolver(manifest, { baseUrl });
const textures = new PixiAssetLoader(resolver, new LazyAssetLoader(resolver));
const texture = await textures.load('chikn-flat/admiral');
```

Use `PixiProceduralEffect.fromRig(descriptor, rig, factory.root)` for trait actions. It resolves socket or exact-attachment origins, clones an equipped attachment's current texture and presentation properties when requested, and snapshots detached projectiles under the stable rig root. Following effects keep tracking their origin during recovery.

The `LazyAssetLoader` is required: every texture is decoded from bytes it has already integrity-checked, and the URL is never fetched a second time. Because these sources stay outside Pixi's `Assets` cache, `unload(assetId)` and `clear()` own their teardown — call one of them, plus `host.dispose()`, during teardown. [Complete quick start](https://github.com/Roost2D/roost2d/blob/main/docs/getting-started.md).
