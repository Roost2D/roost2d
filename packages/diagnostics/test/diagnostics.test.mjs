import assert from 'node:assert/strict';
import test from 'node:test';
import { Diagnostics } from '../dist/index.js';

test('diagnostics capture bounded frame and counter data', () => {
  let now = 0; const diagnostics = new Diagnostics(4, () => now, () => 1234); diagnostics.increment('draws', 2); diagnostics.beginFrame(); now = 20; diagnostics.endFrame();
  const snapshot = diagnostics.snapshot(); assert.equal(snapshot.counters.draws, 2); assert.equal(snapshot.frameTimeMs, 20); assert.equal(snapshot.fps, 50); assert.equal(snapshot.memoryBytes, 1234);
});
