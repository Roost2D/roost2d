# @roost2d/pixi

PixiJS v8 application, camera, layer, atlas-texture, and Rig2D display adapters.

```sh
npm install pixi.js @roost2d/pixi
```

```ts
import { PixiApplicationHost } from '@roost2d/pixi';
const host = await PixiApplicationHost.create({ mount: document.querySelector('#app')!, resizeTo: window });
```

Use `PixiAssetLoader` with `@roost2d/assets` to turn a logical atlas-frame ID into a cropped Pixi texture. Destroy the host and clear owned texture loaders during teardown. [Complete quick start](https://github.com/Roost2D/roost2d/blob/main/docs/getting-started.md).
