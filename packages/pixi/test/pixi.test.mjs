import assert from 'node:assert/strict';
import test from 'node:test';
import { Camera2D, LayerStack } from '../dist/index.js';

test('layer definitions remain game supplied', () => { const layers = new LayerStack([{ id: 'background', order: 0 }, { id: 'actors', order: 10 }]); assert.equal(layers.get('actors').zIndex, 10); assert.throws(() => layers.get('towers')); layers.destroy(); });
test('camera clamps zoom and supports coordinate transforms', () => { const camera = new Camera2D(); camera.setViewport(800, 600); camera.setPosition(200, 100); camera.setZoom(100); assert.equal(camera.container.scale.x, 8); const screen = camera.worldToScreen({ x: 200, y: 100 }); assert.deepEqual({ x: screen.x, y: screen.y }, { x: 400, y: 300 }); camera.container.destroy(); });
