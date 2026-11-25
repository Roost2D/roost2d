import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAnimationClip, validateRigDefinition } from '../dist/index.js';

const rig = {
  schema: 'roost2d.rig/v2', id: 'native', displayName: 'Native', renderOrder: 'slots', defaultSkinId: 'selected',
  bones: [{ id: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }],
  slots: [{ id: 'body', boneId: 'root', zIndex: 0, defaultAttachmentName: 'body' }, { id: 'empty', boneId: 'root', zIndex: 1 }],
  attachments: [{ id: 'body', slotId: 'body', boneId: 'root', texture: { assetId: 'body' }, zIndex: 0 }],
  skins: { selected: { body: 'body' } }, attachmentNames: { selected: { body: { body: 'body' } }, default: {} },
};
const clip = {
  schema: 'roost2d.animation/v2', id: 'native', durationMs: 100,
  channels: [{ kind: 'number', target: 'bone', targetId: 'root', property: 'rotation', keyframes: [{ timeMs: 0, value: 0, curve: { type: 'bezier', controlPoints: [25, -2, 75, 5] } }, { timeMs: 100, value: Math.PI }] }],
};

test('native rig and clips validate selected-only skins and default name tables', () => {
  assert.deepEqual(validateRigDefinition(rig), []);
  assert.deepEqual(validateAnimationClip(clip, rig), []);
  assert.deepEqual(validateAnimationClip({ ...clip, channels: [{ kind: 'attachment', target: 'slot', targetId: 'empty', keyframes: [{ timeMs: 0, name: null }, { timeMs: 50, name: 'absent-in-selected-skin' }] }] }, rig), []);
});

test('native schema guards prevent accepting channels under v1 or native clips on v1 rigs', () => {
  assert.match(validateAnimationClip({ ...clip, schema: 'roost2d.animation/v1', tracks: [] }, rig).join('\n'), /channels require/);
  assert.match(validateAnimationClip(clip, { ...rig, schema: 'roost2d.rig/v1' }).join('\n'), /v2 clips require a v2 rig/);
  assert.match(validateRigDefinition({ ...rig, renderOrder: undefined }).join('\n'), /renderOrder/);
  assert.match(validateRigDefinition({ ...rig, attachmentNames: undefined }).join('\n'), /attachmentNames is required/);
});

test('native name tables cannot select an attachment from another slot', () => {
  const source = structuredClone(rig); source.attachmentNames.selected.empty = { wrong: 'body' };
  assert.match(validateRigDefinition(source).join('\n'), /belongs to another slot/);
  source.attachmentNames.selected.empty.wrong = 'unknown';
  assert.match(validateRigDefinition(source).join('\n'), /unknown named attachment/);
});

test('native validation rejects unsafe setters, non-finite data, wrong target properties and duplicate channels', () => {
  const source = structuredClone(clip); source.channels[0].property = '__proto__';
  assert.match(validateAnimationClip(source, rig).join('\n'), /unsupported native property/);
  source.channels[0].property = 'red';
  assert.match(validateAnimationClip(source, rig).join('\n'), /unsupported native property/);
  source.channels[0].property = 'x'; source.channels[0].keyframes[0].value = Infinity;
  assert.match(validateAnimationClip(source, rig).join('\n'), /value must be finite/);
  source.channels[0].keyframes[0].value = 1; source.channels[0].keyframes[0].onUpdate = 'bad';
  assert.match(validateAnimationClip(source, rig).join('\n'), /unsupported native keyframe property/);
  delete source.channels[0].keyframes[0].onUpdate; source.channels.push(structuredClone(source.channels[0]));
  assert.match(validateAnimationClip(source, rig).join('\n'), /duplicate native channel/);
});

test('native curves bound time controls while allowing value overshoot and equal-time final keys', () => {
  const source = structuredClone(clip); source.channels[0].keyframes[0].curve.controlPoints[0] = -1;
  assert.match(validateAnimationClip(source, rig).join('\n'), /control times/);
  source.channels[0].keyframes[0].curve.controlPoints = [75, -100, 25, 100];
  assert.deepEqual(validateAnimationClip(source, rig), [], 'crossed time handles and value overshoot are supported');
  source.channels[0].keyframes.push({ timeMs: 100, value: -Math.PI });
  assert.deepEqual(validateAnimationClip(source, rig), [], 'last same-time key wins');
});

test('malformed native payloads return diagnostics without throwing', () => {
  for (const channels of [null, [null], [{ kind: 'number', target: 'bone', targetId: 'root', property: 'x', keyframes: null }]]) {
    assert.ok(validateAnimationClip({ ...clip, channels }, rig).length);
  }
  for (const attachmentNames of [null, { selected: null }, { selected: { body: [] } }]) assert.ok(validateRigDefinition({ ...rig, attachmentNames }).length);
  assert.ok(validateRigDefinition({ ...rig, slots: [{ ...rig.slots[0], color: { red: 1 } }] }).length);
});
