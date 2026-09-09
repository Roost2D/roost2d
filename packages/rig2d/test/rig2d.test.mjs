import assert from 'node:assert/strict';
import test from 'node:test';
import { RigActionController, RigRuntime } from '../dist/index.js';

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

test('a replacement trait hides its owned base slot and restores it when removed', () => {
  const replacement = structuredClone(definition);
  replacement.attachmentGroups['head/hat'].replacesSlotIds = ['body'];
  const nodes = new Map();
  const factory = { createBone: (id) => ({ id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }), createAttachment: (id) => { const node = { id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }; nodes.set(id, node); return node; }, attach() {}, destroy() {} };
  const rig = new RigRuntime(replacement, factory);
  rig.attachGroup('head/hat');
  assert.equal(nodes.get('body-white').visible, false);
  assert.equal(nodes.get('hat').visible, true);
  rig.applySkin('red');
  assert.equal(nodes.get('body-red').visible, false, 'replacement ownership survives a skin change');
  rig.removeGroup('head/hat');
  assert.equal(nodes.get('body-red').visible, true);
  rig.dispose();
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
    createBone: (id) => { const node = { id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }; nodes.set(id, node); return node; },
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

test('seek pauses a live layer at a deterministic clip time', () => {
  const { rig, nodes } = runtime();
  rig.play(clip([{ timeMs: 0, durationMs: 100, x: 10 }]), { layer: 'preview', repeat: 0 });
  rig.seek(50, 'preview');
  assert.ok(nodes.get('root').x > 0 && nodes.get('root').x < 10);
  assert.throws(() => rig.seek(-1, 'preview'), /finite non-negative/);
  assert.throws(() => rig.seek(0, 'missing'), /not playing/);
  rig.dispose();
});

test('controlled playback emits every crossed cue once while silent sampling can scrub backward', () => {
  const { rig, nodes } = runtime();
  const events = [];
  const cuePoses = [];
  const controlled = rig.play({ ...clip([{ timeMs: 0, durationMs: 100, x: 10 }]), cues: [{ id: 'a', timeMs: 20 }, { id: 'b', timeMs: 70 }, { id: 'done', timeMs: 100 }] }, { controlled: true, onCue: ({ cue }) => { events.push(cue.id); cuePoses.push(Number(nodes.get('root').x.toFixed(3))); } });
  controlled.advance(80);
  assert.deepEqual(events, ['a', 'b'], 'a skipped render frame still emits every crossed cue');
  assert.deepEqual(cuePoses, [2, 7], 'callbacks observe each exact authored cue pose');
  controlled.sample(10);
  controlled.sample(100);
  assert.deepEqual(events, ['a', 'b'], 'scrubbing never emits callbacks');
  rig.dispose();
});

test('action interruption and completion restore the rig and preserve mirroring', () => {
  const { rig, nodes } = runtime();
  rig.setMirrored(true);
  const controller = new RigActionController(rig);
  const first = controller.play(clip([{ timeMs: 0, durationMs: 100, x: 10 }]), { controlled: true });
  first.advance(50);
  assert.notEqual(nodes.get('root').x, 0);
  const second = controller.play(clip([{ timeMs: 0, durationMs: 100, x: 6 }]), { controlled: true });
  assert.equal(nodes.get('root').x, 0, 'interrupting restores the setup pose');
  second.advance(100);
  assert.equal(nodes.get('root').x, 0, 'exact completion restores the setup pose');
  assert.equal(nodes.get('root').scaleX, -1, 'facing survives action restoration');
  controller.dispose();
  rig.dispose();
});

test('ping-pong loops return through the pose instead of snapping to the beginning', () => {
  const { rig } = runtime();
  const handle = rig.play({ ...clip([{ timeMs: 0, durationMs: 100, x: 10 }]), loop: true, loopMode: 'ping-pong' });
  assert.equal(handle.yoyo(), true);
  rig.dispose();
});

test('playOneShot accepts a clip id without a cast', () => {
  const { rig } = runtime();
  rig.registerClip(clip([{ timeMs: 0, x: 1 }]));
  const handle = rig.playOneShot('walk');
  assert.equal(typeof handle.kill, 'function');
  rig.dispose();
});

function hierarchyRuntime(definition, clips = []) {
  const nodes = new Map();
  const parents = new Map();
  const makeNode = (id) => {
    const node = { id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    nodes.set(id, node);
    return node;
  };
  const factory = {
    createBone: makeNode,
    createAttachment: makeNode,
    attach(parent, child) { parents.set(child.id, parent?.id); },
    destroy() {},
  };
  return { rig: new RigRuntime(definition, factory, clips), nodes, parents };
}

const traitRigDefinition = {
  schema: 'roost2d.rig/v1', id: 'trait-bird', displayName: 'Trait bird', defaultSkinId: 'white',
  bones: [
    { id: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    { id: 'bone:head-white', parentId: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    { id: 'bone:head-red', parentId: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    { id: 'bone:hat', followSlotId: 'Head', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    { id: 'bone:feet-a', followSlotId: 'LegFoot A', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    { id: 'bone:feet-b', followSlotId: 'LegFoot B', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    { id: 'bone:wings-a', followSlotId: 'Wing A', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    { id: 'bone:wings-b', followSlotId: 'Wing B', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    { id: 'bone:wing-a', parentId: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    { id: 'bone:wing-b', parentId: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    { id: 'bone:leg-a', parentId: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    { id: 'bone:leg-b', parentId: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
  ],
  slots: [
    { id: 'Head', zIndex: 0, defaultAttachmentId: 'head-white' },
    { id: 'LegFoot A', zIndex: 1, defaultAttachmentId: 'leg-a' },
    { id: 'LegFoot B', zIndex: 2, defaultAttachmentId: 'leg-b' },
    { id: 'Wing A', zIndex: 3, defaultAttachmentId: 'wing-a' },
    { id: 'Wing B', zIndex: 4, defaultAttachmentId: 'wing-b' },
  ],
  attachments: [
    { id: 'head-white', slotId: 'Head', boneId: 'bone:head-white', texture: { assetId: 'head-white' }, zIndex: 0 },
    { id: 'head-red', slotId: 'Head', boneId: 'bone:head-red', texture: { assetId: 'head-red' }, zIndex: 0 },
    { id: 'hat', slotId: 'Head', boneId: 'bone:hat', texture: { assetId: 'hat' }, zIndex: 1 },
    { id: 'leg-a', slotId: 'LegFoot A', boneId: 'bone:leg-a', texture: { assetId: 'leg-a' }, zIndex: 1 },
    { id: 'leg-b', slotId: 'LegFoot B', boneId: 'bone:leg-b', texture: { assetId: 'leg-b' }, zIndex: 2 },
    { id: 'feet-a', slotId: 'LegFoot A', boneId: 'bone:feet-a', texture: { assetId: 'feet-a' }, zIndex: 1 },
    { id: 'feet-b', slotId: 'LegFoot B', boneId: 'bone:feet-b', texture: { assetId: 'feet-b' }, zIndex: 2 },
    { id: 'wing-a', slotId: 'Wing A', boneId: 'bone:wing-a', texture: { assetId: 'wing-a' }, zIndex: 3 },
    { id: 'wing-b', slotId: 'Wing B', boneId: 'bone:wing-b', texture: { assetId: 'wing-b' }, zIndex: 4 },
    { id: 'wings-a', slotId: 'Wing A', boneId: 'bone:wings-a', texture: { assetId: 'wings-a' }, zIndex: 3 },
    { id: 'wings-b', slotId: 'Wing B', boneId: 'bone:wings-b', texture: { assetId: 'wings-b' }, zIndex: 4 },
  ],
  skins: {
    white: { Head: 'head-white', 'LegFoot A': 'leg-a', 'LegFoot B': 'leg-b', 'Wing A': 'wing-a', 'Wing B': 'wing-b' },
    red: { Head: 'head-red', 'LegFoot A': 'leg-a', 'LegFoot B': 'leg-b', 'Wing A': 'wing-a', 'Wing B': 'wing-b' },
  },
  attachmentGroups: {
    'head/hat': { id: 'head/hat', slotId: 'Head', attachmentIds: ['hat'], exclusive: true },
    'feet/a': { id: 'feet/a', slotId: 'LegFoot A', attachmentIds: ['feet-a'], exclusive: true },
    'feet/b': { id: 'feet/b', slotId: 'LegFoot B', attachmentIds: ['feet-b'], exclusive: true },
    'wings/a': { id: 'wings/a', slotId: 'Wing A', attachmentIds: ['wings-a'], exclusive: true },
    'wings/b': { id: 'wings/b', slotId: 'Wing B', attachmentIds: ['wings-b'], exclusive: true },
  },
};

test('active trait groups do not hijack base slot transforms or follower parents', () => {
  const headClip = { schema: 'roost2d.animation/v1', id: 'head-move', durationMs: 100, loop: false, tracks: [{ target: 'slot', targetId: 'Head', keyframes: [{ timeMs: 0, durationMs: 0, x: 42 }] }] };
  const { rig, nodes, parents } = hierarchyRuntime(traitRigDefinition, [headClip]);

  rig.attachGroup('head/hat');
  assert.equal(rig.activeAttachmentId('Head'), 'hat', 'selection APIs continue to report the active overlay');
  assert.equal(parents.get('bone:hat'), 'bone:head-white', 'the trait follows the active skin body');
  const animation = rig.play('head-move');
  animation.progress(1);
  assert.equal(nodes.get('bone:head-white').x, 42, 'slot animation targets the body transform');
  assert.equal(nodes.get('bone:hat').x, 0, 'the follower keeps its local transform');

  rig.applySkin('red');
  assert.equal(parents.get('bone:hat'), 'bone:head-red', 'skin changes reparent an active trait');
  rig.resetPose();
  assert.equal(parents.get('bone:hat'), 'bone:head-red', 'pose reset preserves the resolved hierarchy');
  assert.equal(rig.removeGroup('head/hat'), true);
  assert.equal(nodes.get('hat').visible, false);
  rig.attachGroup('head/hat');
  assert.equal(parents.get('bone:hat'), 'bone:head-red', 'remove and re-add is deterministic');
  rig.dispose();
});

test('paired feet and wings groups resolve independently against matching base slots', () => {
  const { rig, nodes, parents } = hierarchyRuntime(traitRigDefinition);
  rig.attachGroup('feet/a');
  assert.equal(nodes.get('feet-a').visible, true);
  assert.equal(nodes.get('feet-b').visible, false);
  assert.equal(parents.get('bone:feet-a'), 'bone:leg-a');
  assert.equal(parents.get('bone:feet-b'), 'bone:leg-b');
  rig.attachGroup('feet/b');
  assert.equal(nodes.get('feet-a').visible, true);
  assert.equal(nodes.get('feet-b').visible, true);
  rig.removeGroup('LegFoot A');
  assert.equal(nodes.get('feet-a').visible, false);
  assert.equal(nodes.get('feet-b').visible, true);
  rig.attachGroup('wings/a');
  assert.equal(nodes.get('wings-a').visible, true);
  assert.equal(nodes.get('wings-b').visible, false);
  assert.equal(parents.get('bone:wings-a'), 'bone:wing-a');
  assert.equal(parents.get('bone:wings-b'), 'bone:wing-b');
  rig.attachGroup('wings/b');
  rig.removeGroup('Wing A');
  assert.equal(nodes.get('wings-a').visible, false);
  assert.equal(nodes.get('wings-b').visible, true);
  rig.dispose();
});

test('bone-targeted legacy depth keeps attachment sprites at zero across trait toggles', () => {
  const ids = ['tail', 'torso', 'head', 'head-trait', 'wings', 'feet'];
  const depths = [-10, 0, 10, 11, 20, 30];
  const depthDefinition = {
    schema: 'roost2d.rig/v1', id: 'depth', displayName: 'Depth',
    bones: [{ id: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, ...ids.map((id) => ({ id: `bone:${id}`, parentId: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }))],
    slots: ids.map((id, index) => ({ id, zIndex: depths[index], defaultAttachmentId: id })),
    attachments: ids.map((id, index) => ({ id, slotId: id, boneId: `bone:${id}`, texture: { assetId: id }, zIndex: depths[index], depthTarget: 'bone' })),
    attachmentGroups: {
      trait: { id: 'trait', slotId: 'head-trait', attachmentIds: ['head-trait'], exclusive: true },
      'tail/replacement': { id: 'tail/replacement', slotId: 'tail', attachmentIds: ['tail'], replacesSlotIds: ['tail'], slotZIndexOverrides: { tail: 6 }, exclusive: true },
    },
  };
  const { rig, nodes } = hierarchyRuntime(depthDefinition);
  assert.deepEqual(ids.map((id) => nodes.get(`bone:${id}`).zIndex), depths);
  assert.deepEqual(ids.map((id) => nodes.get(id).zIndex), ids.map(() => 0));
  rig.attachGroup('trait');
  rig.removeGroup('trait');
  assert.deepEqual(ids.map((id) => nodes.get(`bone:${id}`).zIndex), depths);
  rig.attachGroup('tail/replacement');
  assert.equal(nodes.get('bone:tail').zIndex, 6, 'replacement branch rises above the body while active');
  rig.removeGroup('tail/replacement');
  assert.equal(nodes.get('bone:tail').zIndex, -10, 'base depth is restored with the replacement removed');
  rig.dispose();
});
