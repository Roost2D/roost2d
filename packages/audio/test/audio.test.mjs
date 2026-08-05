import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioMixer } from '../dist/index.js';

class Gain { gain = { value: 1 }; connect() {} disconnect() {} }
class Context { destination = {}; state = 'running'; createGain() { return new Gain(); } async resume() { this.state = 'running'; } async close() { this.state = 'closed'; } }

test('audio mixer controls named channels and mute state', async () => {
  const context = new Context(); const mixer = new AudioMixer(context);
  mixer.setVolume('music', 0.35); assert.equal(mixer.getVolume('music'), 0.35);
  mixer.setMasterVolume(0.7); mixer.setMuted(true); assert.equal(mixer.master.gain.value, 0);
  mixer.setMuted(false); assert.equal(mixer.master.gain.value, 0.7);
  await mixer.dispose(); assert.equal(context.state, 'closed');
});
