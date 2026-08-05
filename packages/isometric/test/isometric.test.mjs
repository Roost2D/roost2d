import assert from 'node:assert/strict';
import test from 'node:test';
import { depthFor, gridToScreen, pickTile, screenToGrid } from '../dist/index.js';

test('projection round-trips logical coordinates', () => {
  const projection = { tileWidth: 128, tileHeight: 64, origin: { x: 200, y: 50 } }; const point = { x: 3.25, y: 1.5 };
  const result = screenToGrid(gridToScreen(point, projection), projection); assert.ok(Math.abs(result.x - point.x) < 1e-9); assert.ok(Math.abs(result.y - point.y) < 1e-9);
});

test('tile picking and depth are deterministic', () => {
  const projection = { tileWidth: 100, tileHeight: 50 }; assert.deepEqual(pickTile(gridToScreen({ x: 2, y: 1 }, projection), projection, { minX: 0, minY: 0, width: 5, height: 5 }), { x: 2, y: 1 }); assert.ok(depthFor({ x: 2, y: 2 }) > depthFor({ x: 1, y: 1 }));
});
