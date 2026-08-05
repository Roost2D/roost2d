import assert from 'node:assert/strict';
import test from 'node:test';
import { ClockSynchronizer, SnapshotBuffer, decodeEnvelope, encodeEnvelope } from '../dist/index.js';

test('protocol envelopes round-trip', () => { const encoded = encodeEnvelope('move', '1', { x: 2 }, 10); assert.deepEqual(decodeEnvelope(encoded), { version: 1, type: 'move', id: '1', sentAt: 10, payload: { x: 2 } }); });
test('snapshot buffer interpolates and clock uses median offset', () => {
  const buffer = new SnapshotBuffer(); buffer.push({ timeMs: 0, value: 0 }); buffer.push({ timeMs: 100, value: 10 }); assert.equal(buffer.sample(25, (a, b, alpha) => a + (b - a) * alpha), 2.5);
  const clock = new ClockSynchronizer(); clock.record(0, 20, 110); clock.record(20, 40, 130); assert.equal(clock.offsetMs, 100);
});
