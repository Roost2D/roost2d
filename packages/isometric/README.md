# @roost2d/isometric

Pure isometric grid projection, picking, bounds, subtiles, anchors, and deterministic depth keys.

```sh
npm install @roost2d/isometric
```

```ts
import { depthFor, gridToScreen, screenToCell } from '@roost2d/isometric';
const projection = { tileWidth: 128, tileHeight: 64, origin: { x: 400, y: 80 } };
const screen = gridToScreen({ x: 2, y: 3 }, projection);
```

The package has no renderer dependency. [Isometric guide](https://github.com/Roost2D/roost2d/blob/main/docs/isometric.md).
