import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioManager, AudioMixer } from '../dist/index.js';

class Gain { gain = { value: 1 }; connect() {} disconnect() {} }
class Source {
  playbackRate = { value: 1 }; buffer = null; loop = false; started = 0; stopped = 0;
  connect() {} disconnect() {} addEventListener() {} start() { this.started += 1; } stop() { this.stopped += 1; }
}
class Context {
  destination = {}; state = 'running'; sources = [];
  createGain() { return new Gain(); }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  async decodeAudioData() { return { duration: 1 }; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
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
