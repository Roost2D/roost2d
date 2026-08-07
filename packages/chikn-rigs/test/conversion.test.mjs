import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAnimationClip, validateRigDefinition } from '@roost2d/contracts';
import { convertLegacyAnimations, convertLegacyRig, loadChiknRig } from '../dist/index.js';

test('converts attachment texture metadata into a manifest alias', () => {
  const rig = convertLegacyRig({ skins: { Gold: { Torso: { name: 'Gold_Torso', texture: 'Gold Torso' } } }, rig: [{ name: 'Gold_Torso', x: 2, y: 3, z_index: 4 }] }, 'chikn', 'Chikn');
  assert.equal(rig.attachments[0].texture.assetId, 'chikn.rig.gold-torso');
  assert.equal(rig.skins.Gold.Torso, 'Gold_Torso');
  assert.equal(rig.attachments[0].boneId, 'bone:Gold_Torso');
  assert.equal(rig.slots[0].id, 'Torso');
  assert.equal(rig.defaultSkinId, 'Gold');
  assert.equal(rig.attachments[0].visible, false);
});

test('browser fetch implementations retain the global invocation context', async () => {
  function browserFetch() {
    assert.equal(this, globalThis);
    return Promise.resolve(new Response(JSON.stringify({ rig: [] }), { status: 200 }));
  }
  assert.equal((await loadChiknRig(browserFetch)).id, 'chikn');
});

test('converts legacy traits into exclusive attachment groups', () => {
  const rig = convertLegacyRig({ rig: [{ name: 'Trait_Head_Hat' }], traits: { Head: { Hat: { slot: 'Head', attachments: [{ name: 'Trait_Head_Hat' }] } } } }, 'chikn', 'Chikn');
  assert.equal(rig.attachments[0].slotId, 'Head');
  assert.deepEqual(rig.attachmentGroups['head/hat'].attachmentIds, ['Trait_Head_Hat']);
});

test('converts legacy GSAP tween timings into slot tracks', () => {
  const [clip] = convertLegacyAnimations({ animations: { walk: { duration: .5, tweens: [{ target: 'Wing A', at: .25, properties: { rotation: 10, duration: .1 } }] } } }, 'chikn');
  assert.equal(clip.tracks[0].target, 'slot');
  assert.equal(clip.tracks[0].keyframes[0].durationMs, 100);
});

// B6 — plain-object accumulators keyed by source strings: `__proto__` reparented the container,
// and `(tracks['__proto__'] ??= []).push(...)` threw `tracks.__proto__.push is not a function`.
test('a __proto__ skin id becomes an ordinary entry instead of reparenting the container', () => {
  const rig = convertLegacyRig(JSON.parse('{"skins":{"__proto__":{"Torso":{"name":"T"}}},"rig":[{"name":"T"}]}'), 'chikn', 'Chikn');
  assert.equal(Object.prototype.polluted, undefined);
  assert.ok(Object.hasOwn(rig.skins, '__proto__'), 'the skin must be an own property');
  assert.equal(rig.skins['__proto__'].Torso, 'T');
});

test('a __proto__ tween target converts instead of throwing', () => {
  const [clip] = convertLegacyAnimations({ animations: { walk: { duration: 1, tweens: [{ target: '__proto__', at: 0, properties: { rotation: 1 } }] } } }, 'chikn');
  assert.equal(clip.tracks[0].targetId, '__proto__');
  assert.equal(clip.tracks[0].keyframes.length, 1);
});

test('converted rigs and clips satisfy the contract validators', () => {
  const rig = convertLegacyRig({ skins: { Gold: { Torso: { name: 'Gold_Torso' } } }, rig: [{ name: 'Gold_Torso', x: 2, y: 3, z_index: 4 }] }, 'chikn', 'Chikn');
  assert.deepEqual(validateRigDefinition(rig), []);
  // Out-of-order tweens must still produce non-decreasing keyframe times.
  const [clip] = convertLegacyAnimations({ animations: { walk: { duration: 1, tweens: [{ target: 'Torso', at: .8, properties: { rotation: 2 } }, { target: 'Torso', at: .2, properties: {} }] } } }, 'chikn');
  assert.deepEqual(clip.tracks[0].keyframes.map(({ timeMs }) => timeMs), [200, 800]);
  assert.deepEqual(validateAnimationClip(clip), []);
  assert.equal('x' in clip.tracks[0].keyframes[0], false, 'absent properties must stay absent');
});

test('malformed legacy sources are rejected', () => {
  for (const source of [null, {}, { rig: 3 }, 'text']) assert.throws(() => convertLegacyRig(source, 'chikn', 'Chikn'), /rig array/);
  for (const source of [null, {}, { animations: 3 }, 'text']) assert.throws(() => convertLegacyAnimations(source, 'chikn'), /animations object/);
});
