import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioManager, AudioMixer } from '../dist/index.js';

class Gain {
  gain = { value: 1 }; connections = [];
  connect(target) { this.connections.push(target); }
  disconnect() { this.connections.length = 0; }
}
class Source {
  playbackRate = { value: 1 }; buffer = null; loop = false; started = 0; stopped = 0; connections = []; endedListener = undefined;
  connect(target) { this.connections.push(target); }
  disconnect() { this.connections.length = 0; }
  addEventListener(event, listener) { if (event === 'ended') this.endedListener = listener; }
  start() { this.started += 1; }
  stop() { this.stopped += 1; this.finish(); }
  finish() { const listener = this.endedListener; this.endedListener = undefined; listener?.(); }
}
class Context {
  destination = {}; state = 'running'; sources = [];
  createGain() { return new Gain(); }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  async decodeAudioData() { return { duration: 1 }; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

async function waitFor(predicate, message = 'condition', timeoutMs = 500) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) assert.fail(`Timed out waiting for ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

test('audio mixer controls named channels and mute state', async () => {
  const context = new Context(); const mixer = new AudioMixer(context);
  mixer.setVolume('music', 0.35); assert.equal(mixer.getVolume('music'), 0.35);
  mixer.setMasterVolume(0.7); mixer.setMuted(true); assert.equal(mixer.master.gain.value, 0);
  mixer.setMuted(false); assert.equal(mixer.master.gain.value, 0.7);
  await mixer.dispose(); assert.equal(context.state, 'closed');
});

test('browser fetch implementations retain the global invocation context', async () => {
  const context = new Context();
  function browserFetch() {
    assert.equal(this, globalThis);
    return Promise.resolve(new Response(new Uint8Array(4), { status: 200 }));
  }
  const manager = new AudioManager(context, browserFetch);
  manager.register({ id: 'beep', url: 'https://assets.example/beep.wav' });
  await manager.load('beep');
  await manager.dispose();
});

// B3 — the maxConcurrent check and the active-set write straddled `await this.load(id)`, so
// concurrent plays exceeded the cap and the second call's Set orphaned the first source.
test('concurrent plays respect maxConcurrent and stay stoppable', async () => {
  const context = new Context();
  const manager = new AudioManager(context, async () => new Response(new Uint8Array(4), { status: 200 }));
  manager.register({ id: 'shot', url: 'https://assets.example/shot.wav', maxConcurrent: 2 });

  const played = (await Promise.all([manager.play('shot'), manager.play('shot'), manager.play('shot'), manager.play('shot')])).filter(Boolean);
  assert.equal(played.length, 2, 'maxConcurrent must hold across concurrent calls');
  assert.equal(context.sources.length, 2, 'no extra source may be created and orphaned');

  manager.stop('shot');
  assert.deepEqual(context.sources.map((source) => source.stopped), [1, 1], 'every started source must be reachable by stop()');
  await manager.dispose();
});

test('a cooldown is enforced against concurrent calls', async () => {
  const context = new Context();
  const manager = new AudioManager(context, async () => new Response(new Uint8Array(4), { status: 200 }));
  manager.register({ id: 'beep', url: 'https://assets.example/beep.wav', cooldownMs: 10_000 });
  const played = (await Promise.all([manager.play('beep'), manager.play('beep')])).filter(Boolean);
  assert.equal(played.length, 1);
  await manager.dispose();
});

test('managed playlists play in order without overlap and stay on the selected bus', async () => {
  const context = new Context(); const fetched = [];
  const manager = new AudioManager(context, async (url) => { fetched.push(String(url)); return new Response(new Uint8Array(4), { status: 200 }); });
  manager.registerMany([
    { id: 'one', url: 'https://assets.example/one.wav', channel: 'sfx', loop: true },
    { id: 'two', url: 'https://assets.example/two.wav', channel: 'sfx' },
  ]);
  manager.definePlaylist('score', ['one', 'two']);
  manager.mixer.setVolume('ambience', 0.4); manager.mixer.setMuted(true); manager.mixer.setMuted(false);
  const playback = manager.startPlaylist('score', { channel: 'ambience' });
  assert.equal(manager.startPlaylist('score'), playback, 'starting an active playlist is idempotent');
  await waitFor(() => context.sources.length === 1, 'first track');
  assert.equal(context.sources[0].loop, false, 'playlist sequencing overrides per-track looping');
  assert.deepEqual(fetched, ['https://assets.example/one.wav']);
  assert.equal(context.sources[0].connections[0].connections[0], manager.mixer.group('ambience'));
  assert.equal(manager.mixer.getVolume('ambience'), 0.4);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(context.sources.length, 1, 'the next track waits for actual completion');
  context.sources[0].finish();
  await waitFor(() => context.sources.length === 2, 'second track');
  assert.deepEqual(fetched, ['https://assets.example/one.wav', 'https://assets.example/two.wav']);
  context.sources[1].finish();
  await waitFor(() => context.sources.length === 3, 'looped first track');
  assert.equal(context.sources[2].buffer, context.sources[0].buffer);
  playback.stop(); await playback.ended;
  assert.equal(context.sources[2].stopped, 1);
  await manager.dispose();
});

test('managed playlists skip failed tracks and stop after a non-looping pass', async () => {
  const context = new Context(); const fetched = [];
  const manager = new AudioManager(context, async (url) => {
    fetched.push(String(url));
    if (String(url).endsWith('/bad.wav')) throw new Error('offline');
    return new Response(new Uint8Array(4), { status: 200 });
  });
  manager.registerMany([
    { id: 'bad', url: 'https://assets.example/bad.wav' },
    { id: 'good', url: 'https://assets.example/good.wav' },
  ]);
  manager.definePlaylist('score', ['bad', 'good']);
  const playback = manager.startPlaylist('score', { loop: false });
  await waitFor(() => context.sources.length === 1, 'playable track');
  assert.deepEqual(fetched, ['https://assets.example/bad.wav', 'https://assets.example/good.wav']);
  assert.equal(playback.currentTrackId, 'good');
  context.sources[0].finish(); await playback.ended;
  assert.equal(playback.running, false);
  await manager.dispose();
});

test('a completely failed playlist cycle backs off before retrying', async () => {
  const context = new Context(); let attempts = 0;
  const manager = new AudioManager(context, async () => { attempts += 1; throw new Error('offline'); });
  manager.registerMany([{ id: 'one', url: '/one.wav' }, { id: 'two', url: '/two.wav' }]);
  manager.definePlaylist('score', ['one', 'two']);
  const playback = manager.startPlaylist('score', { retryDelayMs: 25 });
  await waitFor(() => attempts === 2, 'initial failed cycle');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(attempts, 2, 'the failed cycle must not spin');
  await waitFor(() => attempts >= 4, 'retry after backoff');
  playback.stop(); await playback.ended;
  await manager.dispose();
});

test('stopping during loading cancels late audio and disposal stops playlists', async () => {
  const context = new Context(); let resolveFetch;
  const manager = new AudioManager(context, (url) => String(url) === '/slow.wav'
    ? new Promise((resolve) => { resolveFetch = resolve; })
    : Promise.resolve(new Response(new Uint8Array(4), { status: 200 })));
  manager.register({ id: 'slow', url: '/slow.wav' }); manager.definePlaylist('score', ['slow']);
  const playback = manager.startPlaylist('score');
  await waitFor(() => resolveFetch !== undefined, 'pending fetch');
  manager.stopPlaylist('score'); await playback.ended;
  resolveFetch(new Response(new Uint8Array(4), { status: 200 }));
  await waitFor(() => context.sources.length === 1, 'late source cleanup');
  assert.equal(context.sources[0].stopped, 1);

  manager.register({ id: 'ready', url: '/ready.wav' }); manager.definePlaylist('ready-score', ['ready']);
  const active = manager.startPlaylist('ready-score');
  await waitFor(() => context.sources.length === 2, 'active playlist');
  await manager.dispose();
  assert.equal(active.running, false);
  assert.equal(context.sources[1].stopped, 1);
  assert.equal(context.state, 'closed');

  const lateContext = new Context(); let resolveLateFetch;
  const lateManager = new AudioManager(lateContext, () => new Promise((resolve) => { resolveLateFetch = resolve; }));
  lateManager.register({ id: 'late', url: '/late.wav' }); lateManager.definePlaylist('late-score', ['late']);
  const latePlayback = lateManager.startPlaylist('late-score');
  await waitFor(() => resolveLateFetch !== undefined, 'dispose-time pending fetch');
  await lateManager.dispose();
  resolveLateFetch(new Response(new Uint8Array(4), { status: 200 }));
  await waitFor(() => lateContext.sources.length === 1, 'dispose-time late source cleanup');
  assert.equal(latePlayback.running, false);
  assert.equal(lateContext.sources[0].stopped, 1);
});
