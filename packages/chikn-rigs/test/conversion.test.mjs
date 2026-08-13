import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAnimationClip, validateRigDefinition } from '@roost2d/contracts';
import { readFile } from 'node:fs/promises';
import { applyCharacterRecipe, CHARACTER_RECIPE_SCHEMA, CHIKN_RIG_ART_SCALE, convertLegacyAnimations, convertLegacyRig, loadChiknRig, mergeUniqueSkin, UNIQUE_SKINS, uniqueAssetId, uniqueAssetPrefix, validateCharacterRecipe } from '../dist/index.js';

test('converts attachment texture metadata into a manifest alias', () => {
  const rig = convertLegacyRig({ skins: { Gold: { Torso: { name: 'Gold_Torso', texture: 'Gold Torso' } } }, rig: [{ name: 'Gold_Torso', x: 2, y: 3, z_index: 4 }] }, 'chikn', 'Chikn');
  assert.equal(rig.attachments[0].texture.assetId, 'chikn.rig.gold-torso');
  assert.equal(rig.skins.Gold.Torso, 'Gold_Torso');
  assert.equal(rig.attachments[0].boneId, 'bone:Gold_Torso');
  assert.equal(rig.slots[0].id, 'Torso');
  assert.equal(rig.defaultSkinId, 'Gold');
  assert.equal(rig.attachments[0].visible, false);
  assert.equal(rig.attachments[0].texture.layoutScale, CHIKN_RIG_ART_SCALE.chikn);
  assert.equal(rig.attachments[0].depthTarget, 'bone');
});

test('browser fetch implementations retain the global invocation context', async () => {
  function browserFetch() {
    assert.equal(this, globalThis);
    return Promise.resolve(new Response(JSON.stringify({ rig: [] }), { status: 200 }));
  }
  assert.equal((await loadChiknRig(browserFetch)).id, 'chikn');
});

test('all unique skins merge, including compactly named auxiliary limb parts', async () => {
  const sources = {
    chikn: JSON.parse(await readFile(new URL('../data/chikn-rig.json', import.meta.url), 'utf8')),
    roostr: JSON.parse(await readFile(new URL('../data/roostr-rig.json', import.meta.url), 'utf8')),
  };
  const auxiliaryParts = new Map([
    ['chikn:8312', 'legupperaextra1'],
    ['roostr:4433', 'wingaextra1'],
    ['roostr:7467', 'wingaextra1'],
  ]);
  for (const species of ['chikn', 'roostr']) {
    let rig = convertLegacyRig(sources[species], species, species === 'chikn' ? 'Chikn' : 'Roostr');
    for (const unique of UNIQUE_SKINS.filter((entry) => entry.species === species)) {
      const assets = rig.slots
        .filter(({ id }) => !id.startsWith('unique:'))
        .map(({ id }) => uniqueAssetId(unique, id));
      const auxiliary = auxiliaryParts.get(`${species}:${unique.token}`);
      if (auxiliary) assets.push(`${uniqueAssetPrefix(unique)}${auxiliary}`);
      rig = mergeUniqueSkin(rig, unique, assets);
      const merged = rig.attachments.filter(({ id }) => id.startsWith(`unique:${species}:${unique.token}:`));
      assert.ok(merged.length, `${species} ${unique.token} must add attachments`);
      assert.ok(merged.every(({ texture }) => texture.layoutScale === undefined), 'unique artwork is already authored at rig scale');
    }
    assert.deepEqual(validateRigDefinition(rig), []);
  }
});

test('every converted rig attachment carries the species layout scale and legacy bone depth', async () => {
  for (const species of ['chikn', 'roostr']) {
    const source = JSON.parse(await readFile(new URL(`../data/${species}-rig.json`, import.meta.url), 'utf8'));
    const rig = convertLegacyRig(source, species, species === 'chikn' ? 'Chikn' : 'Roostr');
    assert.ok(rig.attachments.length > 0);
    assert.ok(rig.attachments.every(({ texture }) => texture.layoutScale === CHIKN_RIG_ART_SCALE[species]));
    assert.ok(rig.attachments.every(({ depthTarget }) => depthTarget === 'bone'));
  }
});

test('trait follower slots preserve paired limbs and neck-to-head behavior', () => {
  const parts = ['Trait_Neck_Scarf', 'Trait_Feet_Boot_A', 'Trait_Feet_Boot_B', 'Trait_Wings_Cape_A', 'Trait_Wings_Cape_B'];
  const rig = convertLegacyRig({ rig: parts.map((name) => ({ name })) }, 'chikn', 'Chikn');
  const follow = Object.fromEntries(rig.bones.filter(({ followSlotId }) => followSlotId).map(({ id, followSlotId }) => [id, followSlotId]));
  assert.equal(follow['bone:Trait_Neck_Scarf'], 'Head');
  assert.equal(follow['bone:Trait_Feet_Boot_A'], 'LegFoot A');
  assert.equal(follow['bone:Trait_Feet_Boot_B'], 'LegFoot B');
  assert.equal(follow['bone:Trait_Wings_Cape_A'], 'Wing A');
  assert.equal(follow['bone:Trait_Wings_Cape_B'], 'Wing B');
});

test('converts legacy traits into exclusive attachment groups', () => {
  const rig = convertLegacyRig({ rig: [{ name: 'Trait_Head_Hat' }], traits: { Head: { Hat: { slot: 'Head', attachments: [{ name: 'Trait_Head_Hat' }] } } } }, 'chikn', 'Chikn');
  assert.equal(rig.attachments[0].slotId, 'Head');
  assert.deepEqual(rig.attachmentGroups['head/hat'].attachmentIds, ['Trait_Head_Hat']);
});

test('replacement traits declare the base feather slots they own', async () => {
  for (const species of ['chikn', 'roostr']) {
    const source = JSON.parse(await readFile(new URL(`../data/${species}-rig.json`, import.meta.url), 'utf8'));
    const rig = convertLegacyRig(source, species, species);
    const groups = Object.values(rig.attachmentGroups);
    const tails = groups.filter(({ metadata }) => metadata.category === 'Tail');
    const feet = groups.filter(({ metadata }) => metadata.category === 'Feet');
    assert.ok(tails.length > 0 && tails.every(({ replacesSlotIds }) => replacesSlotIds?.join('|') === 'Tail'));
    assert.ok(tails.every(({ slotZIndexOverrides }) => slotZIndexOverrides?.Tail === 6));
    assert.ok(feet.length > 0 && feet.every(({ replacesSlotIds }) => replacesSlotIds?.join('|') === 'LegFoot A|LegFoot B'));
    const torsoAttachmentIds = new Set(groups.filter(({ metadata }) => metadata.category === 'Torso').flatMap(({ attachmentIds }) => attachmentIds));
    assert.ok(torsoAttachmentIds.size > 0 && rig.attachments.filter(({ id }) => torsoAttachmentIds.has(id)).every(({ zIndex }) => zIndex === 10));
  }
  const chiknSource = JSON.parse(await readFile(new URL('../data/chikn-rig.json', import.meta.url), 'utf8'));
  const chikn = convertLegacyRig(chiknSource, 'chikn', 'Chikn');
  for (const groupId of ['head/daft-punk', 'head/tungsten-cube', 'head/golden-bone-daddy', 'head/boxhead', 'head/hamlet', 'head/pineapple', 'head/golden-crusader', 'head/mfd', 'head/crusader']) {
    assert.deepEqual(chikn.attachmentGroups[groupId].replacesSlotIds, ['Head'], groupId);
  }
  assert.equal(chikn.attachmentGroups['head/goose'].replacesSlotIds, undefined, 'glasses remain an overlay on the base head');

  const roostrSource = JSON.parse(await readFile(new URL('../data/roostr-rig.json', import.meta.url), 'utf8'));
  const roostr = convertLegacyRig(roostrSource, 'roostr', 'Roostr');
  for (const groupId of ['head/boxhead', 'head/hole-in-one', 'head/panic-buy', 'head/smol-brain-in-jar', 'head/robocoq', 'head/quarter-pounder', 'head/feed-bag', 'head/crt', 'head/golden-templar', 'head/plague-doctor', 'head/jell-o', 'head/golden-bone-daddy', 'head/templar', 'head/mfd', 'head/supervillain']) {
    assert.deepEqual(roostr.attachmentGroups[groupId].replacesSlotIds, ['Head'], groupId);
  }
  assert.equal(roostr.attachmentGroups['head/golden-comb'].replacesSlotIds, undefined, 'comb colour remains an overlay on the base head');
  assert.equal(roostr.attachmentGroups['head/beaker'].replacesSlotIds, undefined, 'transparent beaker keeps the selected base head visible');
});

test('character recipes validate and apply one trait per category', () => {
  const definition = convertLegacyRig({
    skins: { Gold: { Head: { name: 'Gold_Head' }, Tail: { name: 'Gold_Tail' } } },
    traits: {
      Head: { Hat: { slot: 'Head', attachments: [{ name: 'Trait_Head_Hat' }] } },
      Tail: { Leaves: { slot: 'Tail', attachments: [{ name: 'Trait_Tail_Leaves' }] } },
    },
    rig: [{ name: 'Gold_Head' }, { name: 'Gold_Tail' }, { name: 'Trait_Head_Hat' }, { name: 'Trait_Tail_Leaves' }],
  }, 'chikn', 'Chikn');
  const clips = [{ schema: 'roost2d.animation/v1', id: 'chikn.walk', durationMs: 100, tracks: [] }];
  const recipe = { schema: CHARACTER_RECIPE_SCHEMA, species: 'chikn', skinId: 'Gold', traitGroupIds: ['head/hat', 'tail/leaves'], animationId: 'chikn.walk', mirrored: true, tint: 0xffffff, renderScale: 1 };
  assert.deepEqual(validateCharacterRecipe(recipe, definition, clips), []);

  const calls = [];
  const runtime = {
    applySkin: (id) => calls.push(`skin:${id}`),
    attachGroup: (id) => calls.push(`attach:${id}`),
    removeGroup: (id) => { calls.push(`remove:${id}`); return true; },
    resetPose: () => calls.push('reset'),
    setMirrored: (value) => calls.push(`mirror:${value}`),
    setTint: (value) => calls.push(`tint:${value}`),
    stop: (layer) => calls.push(`stop:${layer}`),
    play: (id, options) => calls.push(`play:${id}:${options.layer}`),
  };
  applyCharacterRecipe(runtime, recipe, definition, clips);
  assert.deepEqual(calls, [
    'reset', 'remove:Head', 'remove:Tail', 'skin:Gold', 'attach:head/hat', 'attach:tail/leaves',
    'mirror:true', 'tint:16777215', 'play:chikn.walk:base',
  ]);
  assert.match(validateCharacterRecipe({ ...recipe, traitGroupIds: ['head/hat', 'head/hat'] }, definition, clips).join('\n'), /multiple trait groups/);
  assert.match(validateCharacterRecipe({ ...recipe, skinId: 'missing' }, definition, clips).join('\n'), /unknown skin/);
});

test('converts legacy GSAP tween timings into slot tracks', () => {
  const [clip] = convertLegacyAnimations({ animations: { walk: { duration: .5, tweens: [{ target: 'Wing A', at: .25, properties: { rotation: 10, duration: .1 } }] } } }, 'chikn');
  assert.equal(clip.tracks[0].target, 'slot');
  assert.equal(clip.tracks[0].keyframes[0].durationMs, 100);
  assert.equal(clip.loop, false, 'legacy one-shots do not silently repeat');
});

test('shipped locomotion clips are seamless ping-pong loops and action clips are one-shots', async () => {
  for (const species of ['chikn', 'roostr']) {
    const source = JSON.parse(await readFile(new URL(`../data/${species}-anims.json`, import.meta.url), 'utf8'));
    const clips = convertLegacyAnimations(source, species);
    for (const name of ['walk', 'slowed', 'fly']) {
      const clip = clips.find(({ id }) => id.endsWith(`.${name}`));
      assert.equal(clip.loop, true, name);
      assert.equal(clip.loopMode, 'ping-pong', name);
    }
    for (const clip of clips.filter(({ id }) => !['walk', 'slowed', 'fly'].some((name) => id.endsWith(`.${name}`)))) {
      assert.equal(clip.loop, false, clip.id);
      assert.equal(clip.loopMode, undefined, clip.id);
    }
  }
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
