import assert from 'node:assert/strict';
import test from 'node:test';
import { RigActionController, RigRuntime } from '../dist/index.js';

const definition = {
  schema: 'roost2d.rig/v2', id: 'sampled', displayName: 'Sampled', renderOrder: 'slots', defaultSkinId: 'white',
  bones: [
    { id: '$root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    { id: 'pose', parentId: '$root', x: 5, y: 10, rotation: 0, scaleX: 1, scaleY: 1 },
  ],
  slots: [{ id: 'body', boneId: 'pose', zIndex: 0, defaultAttachmentName: 'body' }, { id: 'empty', boneId: '$root', zIndex: 1 }],
  attachments: ['white', 'red', 'swap'].map(id => ({ id, slotId: 'body', boneId: 'pose', texture: { assetId: id }, zIndex: 0 })),
  skins: { white: { body: 'white' }, red: { body: 'red' } },
  attachmentNames: { white: { body: { body: 'white' } }, red: { body: { body: 'red' } }, default: { body: { swap: 'swap' } } },
};

function runtime(source = definition) {
  const nodes = new Map(); const orders = [];
  const make = id => { const node = { id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }; nodes.set(id, node); return node; };
  const rig = new RigRuntime(structuredClone(source), { createBone: make, createAttachment: make, attach() {}, destroy() {}, setDrawOrder(nodes) { orders.push(nodes.map(node => node.id)); } });
  return { rig, nodes, orders };
}
const number = (targetId, property, keyframes, target = 'bone') => ({ kind: 'number', target, targetId, property, keyframes });
const clip = channels => ({ schema: 'roost2d.animation/v2', id: 'native', durationMs: 100, channels });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} should equal ${expected}`);

test('native rigs require global ordering before creating renderer objects', () => {
  let created = 0;
  assert.throws(() => new RigRuntime(definition, { createBone() { created++; }, createAttachment() { created++; }, attach() {}, destroy() {} }), /global slot draw-order/);
  assert.equal(created, 0);
  const { rig, orders } = runtime();
  assert.deepEqual(orders, [['white', 'red', 'swap']]);
  assert.equal(rig.activeAttachmentId('empty'), undefined);
  rig.dispose();
});

test('native cubic sampling preserves overshoot even when both endpoint values are equal', () => {
  const { rig, nodes } = runtime();
  const playback = rig.play(clip([number('pose', 'x', [{ timeMs: 0, value: 5, curve: { type: 'bezier', controlPoints: [100 / 3, 15, 200 / 3, 15] } }, { timeMs: 100, value: 5 }])]), { controlled: true });
  playback.sample(50); near(nodes.get('pose').x, 12.5);
  playback.sample(0); near(nodes.get('pose').x, 5);
  playback.sample(100); near(nodes.get('pose').x, 5);
  rig.dispose();
});

test('native axis channels preserve steps, duplicate-time last values, delayed keys and negative scales', () => {
  const { rig, nodes } = runtime(); rig.setMirrored(true);
  const playback = rig.play(clip([
    number('pose', 'scaleX', [{ timeMs: 0, value: 1, curve: 'stepped' }, { timeMs: 50, value: 2 }, { timeMs: 50, value: -1 }, { timeMs: 100, value: -1 }]),
    number('pose', 'y', [{ timeMs: 25, value: 20 }, { timeMs: 100, value: 50 }]),
  ]), { controlled: true });
  playback.sample(49); near(nodes.get('pose').scaleX, 1);
  playback.sample(50); near(nodes.get('pose').scaleX, -1); near(nodes.get('pose').y, 30);
  playback.sample(0); near(nodes.get('pose').y, 10);
  assert.equal(nodes.get('$root').scaleX, -1, 'source scale channels leave game-owned facing intact');
  rig.dispose();
});

test('native attachment names hide, swap through the default skin and resolve against the current body', () => {
  const { rig, nodes } = runtime();
  const playback = rig.play(clip([{ kind: 'attachment', target: 'slot', targetId: 'body', keyframes: [{ timeMs: 25, name: null }, { timeMs: 50, name: 'swap' }, { timeMs: 75, name: 'body' }] }]), { controlled: true });
  assert.equal(rig.activeAttachmentId('body'), 'white');
  playback.sample(25); assert.deepEqual(rig.activeAttachmentIds(), []); assert.equal(nodes.get('white').visible, false);
  playback.sample(50); assert.equal(rig.activeAttachmentId('body'), 'swap');
  rig.applySkin('red'); assert.equal(rig.activeAttachmentId('body'), 'swap');
  playback.sample(75); assert.equal(rig.activeAttachmentId('body'), 'red');
  playback.sample(0); assert.equal(rig.activeAttachmentId('body'), 'red', 'scrubbing before the first event restores setup');
  rig.resetPose(); assert.equal(rig.activeAttachmentId('body'), 'red');
  rig.dispose();
});

test('slot RGBA multiplies attachment color, opacity and game tint and restores after reset', () => {
  const source = structuredClone(definition);
  source.slots[0].color = { red: 1, green: 1, blue: 1, alpha: 0.8 };
  source.attachments[0].tint = 0x80ff80; source.attachments[0].alpha = 0.5;
  const { rig, nodes } = runtime(source); rig.setTint(0xff80ff);
  const playback = rig.play(clip([
    number('body', 'red', [{ timeMs: 0, value: 1 }, { timeMs: 100, value: 0 }], 'slot'),
    number('body', 'alpha', [{ timeMs: 0, value: 0.8 }, { timeMs: 100, value: 0 }], 'slot'),
  ]), { controlled: true });
  playback.sample(50); assert.equal(nodes.get('white').tint, 0x408080); near(nodes.get('white').alpha, 0.2);
  rig.resetPose(); assert.equal(nodes.get('white').tint, 0x808080); near(nodes.get('white').alpha, 0.4);
  rig.setTint(); assert.equal(nodes.get('white').tint, 0x80ff80);
  rig.dispose();
});

test('native cues observe exact poses and action cancellation restores facing, slots and setup', () => {
  const { rig, nodes } = runtime(); rig.setMirrored(true);
  const controller = new RigActionController(rig);
  const seen = [];
  const action = { ...clip([
    number('pose', 'x', [{ timeMs: 0, value: 0 }, { timeMs: 100, value: 100 }]),
    { kind: 'attachment', target: 'slot', targetId: 'body', keyframes: [{ timeMs: 10, name: null }] },
  ]), cues: [{ id: 'release', timeMs: 30 }, { id: 'contact', timeMs: 60 }] };
  const playback = controller.play(action, { controlled: true, onCue: event => seen.push([event.cue.id, nodes.get('pose').x]) });
  playback.advance(80); assert.deepEqual(seen, [['release', 30], ['contact', 60]]);
  controller.cancel(); near(nodes.get('pose').x, 5); assert.equal(rig.activeAttachmentId('body'), 'white'); assert.equal(nodes.get('$root').scaleX, -1);
  const complete = controller.play(action, { controlled: true }); complete.advance(100); near(nodes.get('pose').x, 5); assert.equal(complete.completed, true);
  controller.dispose(); rig.dispose();
});

test('native layers retain their sampled values while another layer updates and restore replaced channels', () => {
  const { rig, nodes } = runtime();
  const base = rig.play(clip([number('pose', 'x', [{ timeMs: 0, value: 0 }, { timeMs: 100, value: 100 }])]), { controlled: true, layer: 'base' });
  base.sample(40);
  const overlay = rig.play({ ...clip([number('pose', 'y', [{ timeMs: 0, value: 0 }, { timeMs: 100, value: 100 }])]), id: 'overlay' }, { controlled: true, layer: 'overlay' });
  overlay.sample(75); near(nodes.get('pose').x, 40); near(nodes.get('pose').y, 75);
  rig.play({ ...clip([]), id: 'empty' }, { controlled: true, layer: 'overlay' });
  near(nodes.get('pose').x, 40); near(nodes.get('pose').y, 10);
  rig.dispose();
});

test('native loop sampling and direct progress share the same pose sampler', () => {
  const { rig, nodes } = runtime();
  const playback = rig.play({ ...clip([number('pose', 'x', [{ timeMs: 0, value: 0 }, { timeMs: 100, value: 100 }])]), loop: true }, { controlled: true });
  playback.sample(150); near(nodes.get('pose').x, 50);
  playback.progress(0.25); near(nodes.get('pose').x, 25);
  rig.dispose();
});

test('stopped and completed native overlays no longer override a running base layer', () => {
  const { rig, nodes } = runtime();
  const moving = clip([number('pose', 'x', [{ timeMs: 0, value: 0 }, { timeMs: 100, value: 100 }])]);
  const base = rig.play({ ...moving, id: 'base', loop: true }, { controlled: true, layer: 'base' });
  const overlay = rig.play({ ...moving, id: 'overlay' }, { controlled: true, layer: 'overlay' });
  base.sample(20); overlay.sample(75); near(nodes.get('pose').x, 75);
  rig.stop('overlay'); base.sample(40); near(nodes.get('pose').x, 40);
  const next = rig.play({ ...moving, id: 'complete' }, { controlled: true, layer: 'overlay' });
  next.sample(100); near(nodes.get('pose').x, 100);
  base.sample(50); near(nodes.get('pose').x, 50);
  next.sample(30); near(nodes.get('pose').x, 30, 'a completed handle still supports silent export scrubbing');
  rig.dispose();
});
