import test from 'node:test';
import assert from 'node:assert/strict';
import { importSpine42 } from '../dist/index.js';
import { validateAnimationClip, validateRigDefinition } from '@roost2d/contracts';

const fixture = () => ({
  skeleton: { spine: '4.2.00' },
  bones: [{ name: 'root', x: 10, y: 20, rotation: 30, scaleX: 2, scaleY: 3 }],
  slots: [{ name: 'hand', bone: 'root', attachment: 'hand' }],
  skins: [
    { name: 'default', attachments: { hand: { swap: { width: 20, height: 10, path: 'shared/hand' } } } },
    { name: 'Body', attachments: { hand: { hand: { width: 20, height: 10, x: 2, y: 3, scaleX: -1 } } } },
  ],
  animations: { Idle: { bones: { root: {
    rotate: [{ value: 0, curve: [0.2, 10, 0.8, 170] }, { time: 1, value: 180 }],
    translate: [{ x: 5, y: 7, curve: [0.2, 6, 0.8, 9, 0.1, 8, 0.9, 15] }, { time: 1, x: 10, y: 20 }],
    scale: [{ x: -1, y: 2, curve: 'stepped' }, { time: 1, x: 1, y: 1 }],
  } }, slots: { hand: { attachment: [{ name: 'swap' }, { time: 0.5 }], rgba: [{ color: 'ffffffff' }, { time: 1, color: 'ff000000' }] } } } },
});
const options = { id: 'example', resolveTexture: (path) => ({ assetId: `image/${path}` }) };

test('imports setup-relative axes, absolute per-axis cubic controls, flips and colors', () => {
  const result = importSpine42(fixture(), options);
  assert.deepEqual(validateRigDefinition(result.definition), []);
  assert.deepEqual(validateAnimationClip(result.clips[0], result.definition), []);
  assert.equal(result.definition.bones[1].y, -20);
  assert.equal(result.definition.attachments[1].scaleX, -1);
  assert.equal(result.definition.attachments[1].anchorX, 0.5);
  const channels = result.clips[0].channels;
  const x = channels.find((channel) => channel.property === 'x');
  const y = channels.find((channel) => channel.property === 'y');
  assert.deepEqual(x.keyframes[0], { timeMs: 0, value: 15, curve: { type: 'bezier', controlPoints: [200, 16, 800, 19] } });
  assert.deepEqual(y.keyframes[0], { timeMs: 0, value: -27, curve: { type: 'bezier', controlPoints: [100, -28, 900, -35] } });
  assert.equal(channels.find((channel) => channel.property === 'scaleX').keyframes[0].value, -2);
  const rotation = channels.find((channel) => channel.property === 'rotation');
  assert.equal(rotation.keyframes[1].value, -30 * Math.PI / 180 - Math.PI);
  assert.deepEqual(channels.find((channel) => channel.kind === 'attachment').keyframes, [{ timeMs: 0, name: 'swap' }, { timeMs: 500, name: null }]);
  assert.equal(channels.find((channel) => channel.property === 'alpha').keyframes[1].value, 0);
  assert.equal(result.clips[0].loop, true);
  assert.equal(result.clips[0].durationMs, 1000);
});

test('retains all named attachments/default lookup and adds an unanimated presentation root', () => {
  const { definition, clips } = importSpine42(fixture(), options);
  assert.equal(definition.bones[0].id, '$root');
  assert.equal(definition.bones[1].parentId, '$root');
  assert.ok(clips[0].channels.every((channel) => channel.targetId !== '$root'));
  assert.equal(definition.attachmentNames.default.hand.swap, definition.attachments[0].id);
  assert.equal(definition.skins.Body.hand, definition.attachments[1].id);
  assert.equal(definition.renderOrder, 'slots');
});

test('retains logical attachment keys missing from installed skins', () => {
  const source = fixture();
  source.animations.Idle.slots.hand.attachment[0].name = 'not-in-this-pack';
  const { clips } = importSpine42(source, options);
  assert.equal(clips[0].channels.find((channel) => channel.kind === 'attachment').keyframes[0].name, 'not-in-this-pack');
});

test('single-axis timelines, zero shear, exact names and one-shot policy', () => {
  const source = fixture();
  source.animations = { Attack_Unique: { bones: { root: { translatex: [{ value: 2 }], translatey: [{ value: 4 }], scalex: [{ value: -2 }], scaley: [{ value: 0.5 }], shear: [{ time: 1, x: 0, y: 0 }] } } } };
  const result = importSpine42(source, { ...options, animationIdPrefix: 'official.' });
  assert.equal(result.clips[0].id, 'official.Attack_Unique');
  assert.equal(result.clips[0].loop, false);
  assert.deepEqual(result.clips[0].channels.map((channel) => channel.keyframes[0].value), [12, -24, -4, 1.5]);
  assert.equal(result.clips[0].durationMs, 1000);
});

test('rejects unsupported data instead of silently dropping required semantics', () => {
  for (const mutate of [
    (source) => { source.skeleton.spine = '4.3.0'; },
    (source) => { source.ik = [{ name: 'constraint' }]; },
    (source) => { source.bones[0].transform = 'noScale'; },
    (source) => { source.bones[0].shearY = 2; },
    (source) => { source.skins[1].attachments.hand.hand.type = 'mesh'; },
    (source) => { source.animations.Idle.drawOrder = [{ time: 1 }]; },
    (source) => { source.animations.Idle.bones.root.shear = [{ y: 2 }]; },
    (source) => { source.animations.Idle.bones.root.rotate[0].curve = [0.1, 0.2]; },
    (source) => { source.animations.Idle.slots.hand.attachment[0].name = 42; },
  ]) {
    const source = fixture(); mutate(source);
    assert.throws(() => importSpine42(source, options));
  }
});
