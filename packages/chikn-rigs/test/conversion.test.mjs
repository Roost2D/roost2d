import assert from 'node:assert/strict';
import test from 'node:test';
import { convertLegacyAnimations, convertLegacyRig } from '../dist/index.js';

test('converts attachment texture metadata into a manifest alias', () => {
  const rig = convertLegacyRig({ skins: { Gold: { Torso: { name: 'Gold_Torso', texture: 'Gold Torso' } } }, rig: [{ name: 'Gold_Torso', x: 2, y: 3, z_index: 4 }] }, 'chikn', 'Chikn');
  assert.equal(rig.attachments[0].texture.assetId, 'chikn.rig.gold-torso');
  assert.equal(rig.skins.Gold.Torso, 'Gold_Torso');
  assert.equal(rig.attachments[0].boneId, 'bone:Gold_Torso');
  assert.equal(rig.slots[0].id, 'Torso');
  assert.equal(rig.defaultSkinId, 'Gold');
  assert.equal(rig.attachments[0].visible, false);
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
