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
