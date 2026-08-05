# Isometric worlds

Projection functions are stateless and testable:

```ts
const projection = { tileWidth: 128, tileHeight: 64, origin: { x: 640, y: 80 } };
const screen = gridToScreen({ x: 4, y: 2 }, projection);
const cell = pickTile(pointerWorld, projection, bounds);
sprite.zIndex = depthFor({ x: 4, y: 2 }, elevation, bias);
```

Use `tileDiamond` for overlays, `subTilePosition` for smooth movers, and `worldBounds` to configure a clamped `Camera2D`. Projection does not own pathfinding, collision, or terrain rules; those remain game systems.
