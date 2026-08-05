import assert from 'node:assert/strict';
import test from 'node:test';
import { ClockSynchronizer, SnapshotBuffer, SocketTransport, decodeEnvelope, encodeEnvelope } from '../dist/index.js';

class SocketMock extends EventTarget {
  readyState = 0; closes = 0;
  send() {}
  close() { this.closes += 1; }
}

class MessageEventMock extends Event { constructor(data) { super('message'); this.data = data; } }

test('protocol envelopes round-trip', () => { const encoded = encodeEnvelope('move', '1', { x: 2 }, 10); assert.deepEqual(decodeEnvelope(encoded), { version: 1, type: 'move', id: '1', sentAt: 10, payload: { x: 2 } }); });
test('snapshot buffer interpolates and clock uses median offset', () => {
  const buffer = new SnapshotBuffer(); buffer.push({ timeMs: 0, value: 0 }); buffer.push({ timeMs: 100, value: 10 }); assert.equal(buffer.sample(25, (a, b, alpha) => a + (b - a) * alpha), 2.5);
  const clock = new ClockSynchronizer(); clock.record(0, 20, 110); clock.record(20, 40, 130); assert.equal(clock.offsetMs, 100);
});

// B5 — connect() only guarded the 'open' state, so a second call orphaned the in-flight socket.
test('a second connect while connecting reuses the in-flight attempt', async () => {
  const sockets = [];
  const transport = new SocketTransport('wss://example.test', () => { const socket = new SocketMock(); sockets.push(socket); return socket; });
  const first = transport.connect();
  const second = transport.connect();
  assert.equal(sockets.length, 1, 'only one socket may be created');
  assert.equal(first, second, 'the in-flight promise is shared');
  sockets[0].dispatchEvent(new Event('open'));
  await first; await second;
  assert.equal(transport.state, 'open');
  transport.close();
});

test('close during connect settles the pending promise instead of hanging', async () => {
  const sockets = [];
  const transport = new SocketTransport('wss://example.test', () => { const socket = new SocketMock(); sockets.push(socket); return socket; });
  const connecting = transport.connect();
  transport.close();
  await assert.rejects(connecting, /closed before opening/);
  assert.equal(transport.state, 'closed');
  assert.equal(sockets[0].closes, 1);
  // The transport must still be usable afterwards.
  const reconnect = transport.connect();
  assert.equal(sockets.length, 2);
  sockets[1].dispatchEvent(new Event('open'));
  await reconnect;
  assert.equal(transport.state, 'open');
  transport.close();
});

test('events from a replaced socket cannot corrupt or feed a new connection', async () => {
  const sockets = []; const messages = [];
  const transport = new SocketTransport('wss://example.test', () => { const socket = new SocketMock(); sockets.push(socket); return socket; });
  transport.subscribe((message) => messages.push(message));
  const first = transport.connect(); sockets[0].dispatchEvent(new Event('open')); await first;
  transport.close();
  const second = transport.connect(); sockets[1].dispatchEvent(new Event('open')); await second;
  sockets[0].dispatchEvent(new MessageEventMock('stale'));
  sockets[0].dispatchEvent(new Event('error'));
  sockets[0].dispatchEvent(new Event('close'));
  assert.equal(transport.state, 'open');
  assert.deepEqual(messages, []);
  sockets[1].dispatchEvent(new MessageEventMock('current'));
  assert.deepEqual(messages, ['current']);
  transport.close();
});

test('socket creation and connection errors settle cleanly and permit retry', async () => {
  const sockets = []; let throws = true;
  const transport = new SocketTransport('wss://example.test', () => {
    if (throws) { throws = false; throw new Error('factory failed'); }
    const socket = new SocketMock(); sockets.push(socket); return socket;
  });
  await assert.rejects(transport.connect(), /factory failed/);
  assert.equal(transport.state, 'error');
  const failed = transport.connect(); sockets[0].dispatchEvent(new Event('error'));
  await assert.rejects(failed, /connection failed/);
  assert.equal(sockets[0].closes, 1);
  const retry = transport.connect(); sockets[1].dispatchEvent(new Event('open')); await retry;
  assert.equal(transport.state, 'open');
  transport.close();
});
