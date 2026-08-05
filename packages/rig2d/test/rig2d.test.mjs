import assert from 'node:assert/strict';
import test from 'node:test';
import { RigRuntime } from '../dist/index.js';

const definition = {
  schema: 'roost2d.rig/v1', id: 'bird', displayName: 'Bird', defaultSkinId: 'white',
  bones: [{ id: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }],
  slots: [{ id: 'body', boneId: 'root', zIndex: 0 }, { id: 'head', boneId: 'root', zIndex: 1 }],
  attachments: [
    { id: 'body-white', slotId: 'body', boneId: 'root', texture: { assetId: 'body-white' }, zIndex: 0 },
    { id: 'body-red', slotId: 'body', boneId: 'root', texture: { assetId: 'body-red' }, zIndex: 0 },
    { id: 'hat', slotId: 'head', boneId: 'root', texture: { assetId: 'hat' }, zIndex: 1 }
  ],
  skins: { white: { body: 'body-white' }, red: { body: 'body-red' } },
  attachmentGroups: { 'head/hat': { id: 'head/hat', slotId: 'head', attachmentIds: ['hat'], exclusive: true } }
};

test('skins and trait groups expose only selected attachments', () => {
  const nodes = new Map(); const factory = { createBone: (id) => ({ id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }), createAttachment: (id) => { const node = { id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }; nodes.set(id, node); return node; }, attach() {}, destroy() {} };
  const rig = new RigRuntime(definition, factory); assert.equal(nodes.get('body-white').visible, true); assert.equal(nodes.get('body-red').visible, false); assert.equal(nodes.get('hat').visible, false);
  rig.applySkin('red'); rig.attachGroup('head/hat'); assert.equal(nodes.get('body-white').visible, false); assert.equal(nodes.get('body-red').visible, true); assert.equal(nodes.get('hat').visible, true);
  rig.removeGroup('head'); assert.equal(nodes.get('hat').visible, false); rig.dispose();
});

test('inherited object keys are not accepted as skin or attachment group ids', () => {
  const { rig } = runtime();
  assert.throws(() => rig.applySkin('toString'), /Unknown skin/);
  assert.throws(() => rig.attachGroup('constructor'), /Unknown attachment group/);
  assert.equal(rig.removeGroup('toString'), false);
  rig.dispose();
});

function runtime() {
  const nodes = new Map();
  const factory = {
    createBone: (id) => ({ id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }),
    createAttachment: (id) => { const node = { id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }; nodes.set(id, node); return node; },
    attach() {}, destroy() {}
  };
  return { rig: new RigRuntime(definition, factory), nodes };
}

const clip = (keyframes) => ({ schema: 'roost2d.animation/v1', id: 'walk', durationMs: 100, tracks: [{ target: 'slot', targetId: 'body', keyframes }] });

// S5 — `play(clipObject)` bypasses registerClip, so it used to skip validation entirely.
test('play validates a clip supplied directly, not only registered ones', () => {
  const { rig } = runtime();
  assert.throws(() => rig.play(clip([JSON.parse('{"timeMs":0,"onComplete":"boom"}')])), /unsupported keyframe property/);
  assert.throws(() => rig.play(clip([{ timeMs: 0, x: 'far' }])), /must be a finite number/);
  assert.throws(() => rig.play({ ...clip([{ timeMs: 0 }]), tracks: undefined }), /tracks must be an array/);
  assert.throws(() => rig.registerClip(clip([JSON.parse('{"timeMs":0,"__proto__":{"p":1}}')])), /unsupported keyframe property/);
  rig.dispose();
});

test('a valid clip still plays and only touches contract properties', () => {
  const { rig, nodes } = runtime();
  const handle = rig.play(clip([{ timeMs: 0, x: 5, alpha: 0.5, visible: true }]));
  assert.equal(typeof handle.kill, 'function');
  const node = nodes.get('body-white');
  assert.equal('onComplete' in node, false);
  assert.equal(Object.getPrototypeOf(node), Object.prototype, 'the display node prototype must be intact');
  rig.stop();
  rig.dispose();
});

test('playOneShot accepts a clip id without a cast', () => {
  const { rig } = runtime();
  rig.registerClip(clip([{ timeMs: 0, x: 1 }]));
  const handle = rig.playOneShot('walk');
  assert.equal(typeof handle.kill, 'function');
  rig.dispose();
});
