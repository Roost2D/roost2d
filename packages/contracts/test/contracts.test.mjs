import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isContainedRelativePath, isSha256SRI, pickAnimationKeyframeValues, validateAnimationClip,
  validateAssetManifest, validateAtlasManifest, validateRigDefinition, validateRightsManifest
} from '../dist/index.js';

const sri = 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const manifest = {
  schema: 'roost2d.assets/v1', version: '0.1.0', generatedAt: '1970-01-01T00:00:00.000Z', rightsDocumentSha256: 'a'.repeat(64),
  profiles: { default: { maxAtlasSize: 2048, scale: .5, gpuBudgetBytes: 64 } },
  files: [{ id: 'atlas.one', mediaType: 'image/png', aliases: ['one'], variants: [{ profile: 'default', path: 'runtime/atlas.png', bytes: 1, integrity: { algorithm: 'sha256', value: sri }, scale: .5 }] }],
  bundles: [{ id: 'core', lazy: false, items: [{ assetId: 'one', required: true }] }]
};
const withPath = (path) => ({ ...manifest, files: [{ ...manifest.files[0], variants: [{ ...manifest.files[0].variants[0], path }] }] });

const atlas = { schema: 'roost2d.atlas/v1', profile: 'default', image: 'atlas.png', integrity: { algorithm: 'sha256', value: sri }, width: 64, height: 64, frames: { a: { x: 0, y: 0, width: 8, height: 8, sourceWidth: 8, sourceHeight: 8 } } };

const rig = {
  schema: 'roost2d.rig/v1', id: 'r', displayName: 'R',
  bones: [{ id: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }],
  slots: [{ id: 'body', zIndex: 0 }],
  attachments: [{ id: 'body.a', slotId: 'body', texture: { assetId: 'one' }, zIndex: 0 }]
};
const clip = { schema: 'roost2d.animation/v1', id: 'walk', durationMs: 100, tracks: [{ target: 'slot', targetId: 'body', keyframes: [{ timeMs: 0, x: 1 }] }] };

test('accepts exactly SHA-256 SRI values', () => {
  assert.equal(isSha256SRI(sri), true);
  assert.equal(isSha256SRI('sha256-short'), false);
});

test('validates aliases and relative asset paths', () => {
  assert.deepEqual(validateAssetManifest(manifest), []);
  assert.deepEqual(validateAssetManifest({ ...manifest, files: [{ ...manifest.files[0], license: 'PROPRIETARY-REPLACEMENT-PACK' }] }), []);
  assert.match(validateAssetManifest(withPath('https://bad.example/a.png')).join('\n'), /relative/);
});

test('validates simple Chikn community terms without a repository sublicense', () => {
  const rights = {
    schema: 'chikn-game-assets.rights/v1',
    version: '0.1.0-rc.0',
    generatedAt: '1970-01-01T00:00:00.000Z',
    assets: [{ id: 'rights/chikn/a', sourcePath: 'sources/chikn/a.png', category: 'character', license: 'CHIKN-COMMUNITY-NONCOMMERCIAL', ownership: 'third-party-chikn-rights-holder', commercialUse: 'separate-agreement-required', attribution: 'Chikn community assets', hostingAuthorized: true, communityUseAuthorized: true, sublicenseGrantedByRepository: false, sha256: 'a'.repeat(64) }],
    excludedPaths: [],
  };
  assert.deepEqual(validateRightsManifest(rights), []);
  assert.match(validateRightsManifest({ ...rights, assets: [{ ...rights.assets[0], sublicenseGrantedByRepository: true }] }).join('\n'), /sublicense/);
});

// S1 — a case-sensitive `^(?:https?:)?//` test let `HTTPS:`, `ftp:`, `data:`, and `../` through.
const escapingPaths = [
  ['uppercase scheme', 'HTTPS://evil.example.com/x.png'],
  ['lowercase scheme', 'https://evil.example.com/x.png'],
  ['non-http scheme', 'ftp://evil.example.com/x.png'],
  ['data url', 'data:image/png;base64,AAAA'],
  ['protocol relative', '//evil.example.com/x.png'],
  ['parent traversal', '../../../secret.png'],
  ['absolute path', '/etc/passwd'],
  ['backslash authority', '\\\\evil.example.com\\x.png'],
  ['backslash traversal', 'sub\\..\\..\\x.png'],
  ['encoded traversal', '%2e%2e/%2e%2e/secret.png'],
  ['encoded separator', '..%2f..%2fsecret.png'],
  ['encoded slash', 'a%2fb.png'],
  ['query only', '?x=1'],
  ['fragment only', '#frag'],
  ['single dot', '.'],
  ['empty', ''],
  ['trailing slash', 'runtime/'],
  ['double slash', 'runtime//a.png'],
  ['control character', 'runtime/a\tb.png'],
  ['leading whitespace', ' ../x.png'],
  ['non-string', 42],
];

test('isContainedRelativePath rejects every escape shape', () => {
  for (const [name, path] of escapingPaths) assert.equal(isContainedRelativePath(path), false, `${name}: ${JSON.stringify(path)} must be rejected`);
  for (const path of ['a.png', 'runtime/atlas.png', 'deep/nested/dir/file.png', 'file.name.with.dots.png']) assert.equal(isContainedRelativePath(path), true, `${path} must be accepted`);
});

test('asset manifest rejects every escaping variant path', () => {
  for (const [name, path] of escapingPaths) assert.match(validateAssetManifest(withPath(path)).join('\n'), /relative/, `${name} must be rejected`);
});

test('atlas manifest rejects every escaping image path', () => {
  assert.deepEqual(validateAtlasManifest(atlas), []);
  for (const [name, image] of escapingPaths) assert.match(validateAtlasManifest({ ...atlas, image }).join('\n'), /relative/, `${name} must be rejected`);
});

// S6 — validators are the trust boundary for untrusted JSON and must never throw.
const malformed = [null, undefined, 3, 'text', true, [], [{}], () => undefined];

test('validators return errors instead of throwing on malformed input', () => {
  for (const validate of [validateAssetManifest, validateAtlasManifest, validateRigDefinition, validateAnimationClip, validateRightsManifest]) {
    for (const value of malformed) {
      const errors = validate(value);
      assert.ok(Array.isArray(errors) && errors.length, `${validate.name} must report ${JSON.stringify(value) ?? 'undefined'}`);
    }
  }
});

test('rig validation survives missing and malformed collections', () => {
  assert.deepEqual(validateRigDefinition(rig), []);
  for (const patch of [{ bones: undefined }, { bones: 'nope' }, { bones: [null] }, { bones: [3] }, { slots: undefined }, { attachments: undefined }, { skins: 7 }, { attachmentGroups: 7 }]) {
    const errors = validateRigDefinition({ ...rig, ...patch });
    assert.ok(errors.length, `${JSON.stringify(patch)} must report an error`);
  }
  assert.match(validateRigDefinition({ ...rig, bones: [{ id: 'a', parentId: 'b', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, { id: 'b', parentId: 'a', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }] }).join('\n'), /cycle/);
});

test('a defaultSkinId cannot resolve through the prototype chain', () => {
  assert.match(validateRigDefinition({ ...rig, skins: {}, defaultSkinId: 'toString' }).join('\n'), /unknown default skin/);
});

test('rig texture layout scale and depth targets are validated', () => {
  const attachment = rig.attachments[0];
  assert.deepEqual(validateRigDefinition({
    ...rig,
    attachments: [{ ...attachment, boneId: 'root', texture: { ...attachment.texture, layoutScale: 0.5 }, depthTarget: 'bone' }],
  }), []);
  for (const layoutScale of [0, -1, Number.POSITIVE_INFINITY, Number.NaN, 'small']) {
    assert.match(validateRigDefinition({ ...rig, attachments: [{ ...attachment, texture: { ...attachment.texture, layoutScale } }] }).join('\n'), /layoutScale/);
  }
  assert.match(validateRigDefinition({ ...rig, attachments: [{ ...attachment, depthTarget: 'slot' }] }).join('\n'), /depthTarget/);
  assert.match(validateRigDefinition({ ...rig, attachments: [{ ...attachment, depthTarget: 'bone' }] }).join('\n'), /requires boneId/);
});

test('attachment group replacement slots are validated', () => {
  const attachmentGroups = { body: { id: 'body', slotId: 'body', attachmentIds: ['body.a'], replacesSlotIds: ['body'], slotZIndexOverrides: { body: 6 } } };
  assert.deepEqual(validateRigDefinition({ ...rig, attachmentGroups }), []);
  assert.match(validateRigDefinition({ ...rig, attachmentGroups: { body: { ...attachmentGroups.body, replacesSlotIds: 'body' } } }).join('\n'), /replacesSlotIds must be an array/);
  assert.match(validateRigDefinition({ ...rig, attachmentGroups: { body: { ...attachmentGroups.body, replacesSlotIds: ['missing'] } } }).join('\n'), /unknown replacement slot/);
  assert.match(validateRigDefinition({ ...rig, attachmentGroups: { body: { ...attachmentGroups.body, slotZIndexOverrides: [] } } }).join('\n'), /slotZIndexOverrides must be an object/);
  assert.match(validateRigDefinition({ ...rig, attachmentGroups: { body: { ...attachmentGroups.body, slotZIndexOverrides: { missing: 6 } } } }).join('\n'), /unknown depth override slot/);
  assert.match(validateRigDefinition({ ...rig, attachmentGroups: { body: { ...attachmentGroups.body, slotZIndexOverrides: { body: Infinity } } } }).join('\n'), /must be finite/);
});

test('animation validation rejects unknown targets and missing keyframes without throwing', () => {
  assert.deepEqual(validateAnimationClip(clip), []);
  assert.deepEqual(validateAnimationClip(clip, rig), []);
  assert.match(validateAnimationClip({ ...clip, tracks: [{ target: 'bones', targetId: 'body', keyframes: [] }] }).join('\n'), /unknown track target/);
  assert.match(validateAnimationClip({ ...clip, tracks: [{ target: 'slot', targetId: 'body' }] }).join('\n'), /keyframes must be an array/);
  assert.match(validateAnimationClip({ ...clip, tracks: undefined }).join('\n'), /tracks must be an array/);
  assert.match(validateAnimationClip({ ...clip, tracks: [null] }).join('\n'), /must be an object/);
  assert.match(validateAnimationClip({ ...clip, durationMs: 0 }).join('\n'), /durationMs/);
  assert.deepEqual(validateAnimationClip({ ...clip, loop: true, loopMode: 'ping-pong' }), []);
  assert.match(validateAnimationClip({ ...clip, loop: false, loopMode: 'ping-pong' }).join('\n'), /requires loop/);
  assert.match(validateAnimationClip({ ...clip, loop: true, loopMode: 'bounce' }).join('\n'), /repeat or ping-pong/);
});

test('rig sockets and animation cues validate as presentation-only metadata', () => {
  const socketRig = { ...rig, sockets: [{ id: 'muzzle', target: 'slot', targetId: 'body', x: 4, y: -2 }] };
  assert.deepEqual(validateRigDefinition(socketRig), []);
  assert.match(validateRigDefinition({ ...socketRig, sockets: [{ id: 'bad', target: 'slot', targetId: 'missing' }] }).join('\n'), /unknown slot/);
  const cued = { ...clip, cues: [{ id: 'windup', timeMs: 0, phase: 'anticipation' }, { id: 'fire', timeMs: 60, phase: 'release', data: { effect: 'beam', strength: 1 } }] };
  assert.deepEqual(validateAnimationClip(cued, socketRig), []);
  assert.match(validateAnimationClip({ ...cued, cues: [{ id: 'late', timeMs: 101 }] }).join('\n'), /invalid cue time/);
  assert.match(validateAnimationClip({ ...cued, cues: [{ id: 'bad-data', timeMs: 20, data: { nested: {} } }] }).join('\n'), /cue data/);
});

// S5 — every extra keyframe property used to be spread straight into the tween vars.
test('animation keyframes accept only contract properties with correct types', () => {
  // JSON.parse is the real vector: unlike an object literal, it makes `__proto__` an own property.
  const rejectedKeyframes = ['{"timeMs":0,"onComplete":"x"}', '{"timeMs":0,"__proto__":{"polluted":true}}', '{"timeMs":0,"callbackScope":{}}', '{"timeMs":0,"duration":5}', '{"timeMs":0,"unknownKey":1}'];
  for (const source of rejectedKeyframes) {
    const keyframes = [JSON.parse(source)];
    assert.match(validateAnimationClip({ ...clip, tracks: [{ ...clip.tracks[0], keyframes }] }).join('\n'), /unsupported keyframe property/, `${source} must be rejected`);
  }
  const badTypes = [{ x: 'far' }, { x: Infinity }, { visible: 'yes' }, { tint: -1 }, { tint: 1.5 }, { tint: 0x1000000 }, { alpha: NaN }, { ease: 7 }];
  for (const patch of badTypes) {
    const keyframes = [Object.assign({ timeMs: 0 }, patch)];
    assert.ok(validateAnimationClip({ ...clip, tracks: [{ ...clip.tracks[0], keyframes }] }).length, `${JSON.stringify(patch)} must be rejected`);
  }
});

test('pickAnimationKeyframeValues copies only contract properties', () => {
  const values = pickAnimationKeyframeValues({ timeMs: 0, durationMs: 10, ease: 'none', x: 1, visible: true, tint: 0xff0000, onComplete: 'boom', __proto__: { polluted: true } });
  assert.deepEqual(values, { x: 1, visible: true, tint: 0xff0000 });
  assert.equal('onComplete' in values, false);
  assert.equal(Object.getPrototypeOf(values), Object.prototype);
  assert.equal(pickAnimationKeyframeValues({ timeMs: 0, x: 'far', visible: 'yes', tint: -1 }).x, undefined);
});

test('asset manifest validates profiles and bundle item shapes', () => {
  for (const profiles of [undefined, {}, 3, { default: 3 }, { default: { maxAtlasSize: 0, scale: 1, gpuBudgetBytes: 1 } }, { default: { maxAtlasSize: 1, scale: 'x', gpuBudgetBytes: 1 } }]) {
    assert.ok(validateAssetManifest({ ...manifest, profiles }).length, `${JSON.stringify(profiles)} must be rejected`);
  }
  assert.ok(validateAssetManifest({ ...manifest, bundles: [{ id: 'core', lazy: false, items: [{ assetId: 'missing', required: true }] }] }).length);
  assert.ok(validateAssetManifest({ ...manifest, bundles: [{ id: 'core', lazy: false, items: 'nope' }] }).length);
  assert.ok(validateAssetManifest({ ...manifest, files: [{ ...manifest.files[0], variants: [] }] }).length);
});
