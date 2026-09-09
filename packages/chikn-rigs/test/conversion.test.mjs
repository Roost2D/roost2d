import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAnimationClip, validateRigDefinition } from '@roost2d/contracts';
import { readFile } from 'node:fs/promises';
import { applyCharacterRecipe, CHARACTER_RECIPE_SCHEMA, CHIKN_RIG_ART_SCALE, convertLegacyAnimations, convertLegacyRig, createChiknActionClips, createChiknTraitAnimationProfiles, listChiknSpecials, loadChiknRig, mergeUniqueSkin, resolveChiknAction, UNIQUE_SKINS, uniqueAssetId, uniqueAssetPrefix, validateCharacterRecipe, validateChiknTraitAnimationProfiles } from '../dist/index.js';
import { RigActionController, RigRuntime } from '@roost2d/rig2d';

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

test('trait follower slots preserve paired limbs and head/neck behavior', () => {
  const parts = ['Trait_Head_Hat', 'Trait_Neck_Scarf', 'Trait_Feet_Boot_A', 'Trait_Feet_Boot_B', 'Trait_Wings_Cape_A', 'Trait_Wings_Cape_B'];
  const rig = convertLegacyRig({ rig: parts.map((name) => ({ name })) }, 'chikn', 'Chikn');
  const follow = Object.fromEntries(rig.bones.filter(({ followSlotId }) => followSlotId).map(({ id, followSlotId }) => [id, followSlotId]));
  assert.equal(follow['bone:Trait_Head_Hat'], 'Head');
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

test('trait depth hierarchy and replacement ownership match character composition', async () => {
  for (const species of ['chikn', 'roostr']) {
    const source = JSON.parse(await readFile(new URL(`../data/${species}-rig.json`, import.meta.url), 'utf8'));
    const rig = convertLegacyRig(source, species, species);
    const groups = Object.values(rig.attachmentGroups);
    const tails = groups.filter(({ metadata }) => metadata.category === 'Tail');
    const feet = groups.filter(({ metadata }) => metadata.category === 'Feet');
    const heads = groups.filter(({ metadata }) => metadata.category === 'Head');
    assert.ok(Object.values(source.traits?.Head ?? {}).every(({ replaces }) => replaces === undefined), `${species} source head traits remain overlays`);
    assert.ok(tails.length > 0 && tails.every(({ replacesSlotIds }) => replacesSlotIds?.join('|') === 'Tail'));
    assert.ok(tails.every(({ slotZIndexOverrides }) => slotZIndexOverrides?.Tail === 6));
    for (const trait of Object.values(source.traits?.Tail ?? {})) for (const part of trait.attachments) {
      const sourcePart = source.rig.find(({ name }) => name === part.name) ?? part;
      const bone = rig.bones.find(({ id }) => id === `bone:${part.name}`);
      assert.equal(bone.followSlotId, 'Tail', `${species} ${part.name} follows the animated base tail`);
      assert.equal(bone.x, (sourcePart.x ?? 0) + 12, `${species} ${part.name} is inset toward the torso`);
    }
    assert.ok(feet.length > 0 && feet.every(({ replacesSlotIds }) => replacesSlotIds?.join('|') === 'LegFoot A|LegFoot B'));
    assert.ok(heads.length > 0 && heads.every(({ replacesSlotIds }) => replacesSlotIds === undefined), 'head traits never hide the base head');

    for (const [category, zIndex] of [['Torso', 9], ['Neck', 20], ['Head', 30], ['Feet', 20]]) {
      const attachmentIds = new Set(groups.filter(({ metadata }) => metadata.category === category).flatMap(({ attachmentIds }) => attachmentIds));
      assert.ok(attachmentIds.size > 0 && rig.attachments.filter(({ id }) => attachmentIds.has(id)).every((attachment) => attachment.zIndex === zIndex), `${species} ${category} depth`);
    }

    for (const trait of Object.values(source.traits?.Feet ?? {}).filter(({ attachments }) => attachments.length === 1)) {
      const sourcePart = source.rig.find(({ name }) => name === trait.attachments[0].name);
      const bone = rig.bones.find(({ id }) => id === `bone:${trait.attachments[0].name}`);
      assert.equal(bone.x, (sourcePart?.x ?? 0) + 8, `${species} ${trait.attachments[0].name} right offset`);
      assert.equal(bone.followSlotId, 'LegFoot A');
    }
  }
});

test('every Chikn and Roostr trait has one valid animation profile', async () => {
  const expected = { chikn: 114, roostr: 162 };
  for (const species of ['chikn', 'roostr']) {
    const source = JSON.parse(await readFile(new URL(`../data/${species}-rig.json`, import.meta.url), 'utf8'));
    const definition = convertLegacyRig(source, species, species);
    const profiles = createChiknTraitAnimationProfiles(definition);
    assert.equal(profiles.length, expected[species]);
    assert.deepEqual(validateChiknTraitAnimationProfiles(definition, profiles), []);
    assert.equal(new Set(profiles.map(({ traitGroupId }) => traitGroupId)).size, profiles.length);
    assert.ok(createChiknActionClips(definition).every((clip) => validateAnimationClip(clip, definition).length === 0));
  }
});

test('action resolution chooses Katana, selectable Laser Eye and egg specials, and combined feet', async () => {
  const sources = {
    chikn: JSON.parse(await readFile(new URL('../data/chikn-rig.json', import.meta.url), 'utf8')),
    roostr: JSON.parse(await readFile(new URL('../data/roostr-rig.json', import.meta.url), 'utf8')),
  };
  const roostr = convertLegacyRig(sources.roostr, 'roostr', 'Roostr');
  const katana = resolveChiknAction({ species: 'roostr', traitGroupIds: ['torso/katana'] }, roostr, 'punch');
  assert.equal(katana.motionFamily, 'blade');
  assert.equal(katana.clip.id, 'roostr.action.punch.blade');
  assert.equal(katana.effects[0].kind, 'slash');
  assert.ok(katana.clip.tracks.some(({ target, targetId }) => target === 'attachment' && targetId === 'Trait_Torso_Katana'), 'the selected weapon gets its explicit follow-through track');
  assert.notEqual(katana.clip.durationMs, createChiknActionClips(roostr).find(({ id }) => id === katana.clip.id).durationMs, 'the trait speed adjustment tailors the action timeline');
  const laserRecipe = { species: 'roostr', traitGroupIds: ['head/laser-eye'] };
  const laser = listChiknSpecials(laserRecipe, roostr)[0];
  const laserEffect = resolveChiknAction(laserRecipe, roostr, laser.id).effects[0];
  assert.equal(laserEffect.socketId, 'eyes');
  assert.deepEqual(laserEffect.origin, { target: 'attachment', targetId: 'Trait_Head_LaserEye', x: 0, y: 0 });
  assert.deepEqual(listChiknSpecials({ species: 'roostr', traitGroupIds: ['head/beard'] }, roostr), []);
  assert.equal(resolveChiknAction({ species: 'roostr', traitGroupIds: ['feet/golden-feet'] }, roostr, 'kick').motionFamily, 'combined');
  const tailRecipe = { species: 'roostr', traitGroupIds: ['tail/sword-tail'] };
  const tail = listChiknSpecials(tailRecipe, roostr)[0];
  assert.equal(resolveChiknAction(tailRecipe, roostr, tail.id).clip.id, 'roostr.action.special.tail');
  const chikn = convertLegacyRig(sources.chikn, 'chikn', 'Chikn');
  const cosmetic = resolveChiknAction({ species: 'chikn', traitGroupIds: ['head/black-sweatband'] }, chikn, 'punch');
  assert.ok(cosmetic.clip.tracks.some(({ target, targetId }) => target === 'attachment' && targetId === 'Trait_Head_BlackSweatband'), 'cosmetic traits get recoil without gaining a special');
  const eggRecipe = { species: 'chikn', traitGroupIds: ['tail/golden-egg'] };
  const egg = listChiknSpecials(eggRecipe, chikn)[0];
  assert.equal(resolveChiknAction(eggRecipe, chikn, egg.id).effects[0].kind, 'projectile');
});

test('curated actions aim exact trait artwork and keep cosmetic lookalikes cosmetic', async () => {
  const sources = {
    chikn: JSON.parse(await readFile(new URL('../data/chikn-rig.json', import.meta.url), 'utf8')),
    roostr: JSON.parse(await readFile(new URL('../data/roostr-rig.json', import.meta.url), 'utf8')),
  };
  const chikn = convertLegacyRig(sources.chikn, 'chikn', 'Chikn');
  const roostr = convertLegacyRig(sources.roostr, 'roostr', 'Roostr');
  for (const traitGroupId of ['tail/golden-egg', 'tail/very-fresh-egg']) {
    const recipe = { species: 'chikn', traitGroupIds: [traitGroupId], mirrored: true };
    const special = listChiknSpecials(recipe, chikn)[0];
    const targetOffset = { x: 236, y: -41 };
    const action = resolveChiknAction(recipe, chikn, special.id, { targetOffset });
    assert.equal(action.clip.id, 'chikn.action.special.egg');
    assert.equal(action.clip.durationMs, 1000);
    assert.deepEqual(action.clip.cues.map(({ id, timeMs }) => [id, timeMs]), [['anticipation', 0], ['turn-away', 160], ['release', 400], ['contact', 800], ['recovery', 800], ['turn-back', 920], ['complete', 1000]]);
    assert.deepEqual(action.targetOffset, targetOffset);
    assert.notEqual(action.targetOffset, targetOffset, 'the supplied target is captured by value');
    const effect = action.effects[0];
    const exactAttachment = chikn.attachmentGroups[traitGroupId].attachmentIds[0];
    assert.deepEqual(effect.visual, { kind: 'attachment-clone', attachmentId: exactAttachment });
    assert.deepEqual(effect.origin, { target: 'attachment', targetId: exactAttachment, x: 0, y: 0 });
    assert.deepEqual(effect.trajectory, { kind: 'arc', targetOffset, arcHeight: 28, rotationTurns: 1 });
    assert.equal(effect.space, 'detached');
    assert.equal(effect.durationMs, 400);
    const attachmentTrack = action.clip.tracks.find(({ target, targetId }) => target === 'attachment' && targetId === exactAttachment);
    assert.equal(attachmentTrack.keyframes.find(({ timeMs }) => timeMs === 400).visible, false);
    assert.equal(attachmentTrack.keyframes.find(({ timeMs }) => timeMs === 800).visible, true);
    const poseTrack = action.clip.tracks.find(({ target, targetId }) => target === 'bone' && targetId === 'pose');
    assert.equal(poseTrack.keyframes.find(({ timeMs }) => timeMs === 160).scaleX, -1);
    assert.equal(poseTrack.keyframes.at(-1).scaleX, 1);
  }

  for (const traitGroupId of ['head/admiral', 'head/maverick', 'tail/golden-plumage', 'tail/orange-plumage', 'tail/red-plumage']) {
    if (chikn.attachmentGroups[traitGroupId]) assert.deepEqual(listChiknSpecials({ species: 'chikn', traitGroupIds: [traitGroupId] }, chikn), [], traitGroupId);
  }
  for (const traitGroupId of ['head/batter-up', 'neck/bone-necklace']) {
    if (!roostr.attachmentGroups[traitGroupId]) continue;
    assert.deepEqual(listChiknSpecials({ species: 'roostr', traitGroupIds: [traitGroupId] }, roostr), [], traitGroupId);
    assert.equal(resolveChiknAction({ species: 'roostr', traitGroupIds: [traitGroupId] }, roostr, 'punch').sourceTraitGroupId, undefined);
  }
  const omeletteRecipe = { species: 'roostr', traitGroupIds: ['torso/omelette'] };
  const omelette = resolveChiknAction(omeletteRecipe, roostr, listChiknSpecials(omeletteRecipe, roostr)[0].id);
  assert.equal(omelette.motionFamily, 'projectile');
  assert.deepEqual(omelette.effects[0].visual, { kind: 'attachment-clone', attachmentId: 'Trait_Torso_Omelette' });
  assert.notEqual(omelette.clip.id, 'roostr.action.special.egg');
});

test('every curated weapon, tail and footwear subtype resolves without regex classification', async () => {
  for (const species of ['chikn', 'roostr']) {
    const source = JSON.parse(await readFile(new URL(`../data/${species}-rig.json`, import.meta.url), 'utf8'));
    const definition = convertLegacyRig(source, species, species);
    const profiles = createChiknTraitAnimationProfiles(definition);
    for (const profile of profiles.filter(({ punchPreset }) => punchPreset)) {
      const action = resolveChiknAction({ species, traitGroupIds: [profile.traitGroupId] }, definition, 'punch', { targetOffset: { x: 140, y: 25 } });
      assert.equal(action.sourceTraitGroupId, profile.traitGroupId);
      assert.ok(action.clip.tracks.some(({ target, targetId }) => target === 'attachment' && profile.attachmentTargets.includes(targetId)), profile.traitGroupId);
    }
    for (const profile of profiles.filter(({ kickPreset }) => kickPreset)) {
      const action = resolveChiknAction({ species, traitGroupIds: [profile.traitGroupId] }, definition, 'kick');
      assert.equal(action.sourceTraitGroupId, profile.traitGroupId);
      assert.ok(['paired', 'combined'].includes(action.motionFamily));
    }
    for (const profile of profiles.filter(({ special }) => special)) {
      const action = resolveChiknAction({ species, traitGroupIds: [profile.traitGroupId] }, definition, profile.special.id);
      assert.ok(action.effects.length > 0, profile.traitGroupId);
    }
  }
});

test('action targets reject non-finite values and default to fixed forward compatibility', async () => {
  const source = JSON.parse(await readFile(new URL('../data/chikn-rig.json', import.meta.url), 'utf8'));
  const chikn = convertLegacyRig(source, 'chikn', 'Chikn');
  assert.deepEqual(resolveChiknAction({ species: 'chikn', traitGroupIds: [] }, chikn, 'punch').targetOffset, { x: 180, y: 0 });
  assert.throws(() => resolveChiknAction({ species: 'chikn', traitGroupIds: [] }, chikn, 'punch', { targetOffset: { x: Infinity, y: 0 } }), /finite/);
});

test('egg playback restores its internal turn, texture visibility, and external facing after completion or cancellation', async () => {
  const source = JSON.parse(await readFile(new URL('../data/chikn-rig.json', import.meta.url), 'utf8'));
  const definition = convertLegacyRig(source, 'chikn', 'Chikn');
  const nodes = new Map();
  const makeNode = (id) => {
    const node = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, alpha: 1, visible: true, zIndex: 0, tint: 0xffffff, anchorX: 0, anchorY: 0 };
    nodes.set(id, node); return node;
  };
  const factory = { createBone: makeNode, createAttachment: makeNode, attach() {}, destroy() {} };
  const rig = new RigRuntime(definition, factory, createChiknActionClips(definition));
  rig.attachGroup('tail/golden-egg');
  rig.setMirrored(true);
  const recipe = { species: 'chikn', traitGroupIds: ['tail/golden-egg'], mirrored: true };
  const special = listChiknSpecials(recipe, definition)[0];
  const action = resolveChiknAction(recipe, definition, special.id);
  const controller = new RigActionController(rig);

  let playback = controller.play(action.clip, { controlled: true });
  playback.sample(160);
  assert.equal(rig.node('bone', 'pose').scaleX, -1);
  assert.equal(rig.node('bone', 'root').scaleX, -1, 'internal turn does not rewrite external facing');
  playback.sample(400);
  assert.equal(rig.node('attachment', 'Trait_Tail_GoldenEgg').visible, false);
  controller.cancel();
  assert.equal(rig.node('bone', 'pose').scaleX, 1);
  assert.equal(rig.node('bone', 'root').scaleX, -1);
  assert.equal(rig.node('attachment', 'Trait_Tail_GoldenEgg').visible, true);

  let releasePose;
  playback = controller.play(action.clip, { controlled: true, onCue: ({ cue }) => {
    if (cue.id === 'release') releasePose = {
      poseScaleX: rig.node('bone', 'pose').scaleX,
      eggVisible: rig.node('attachment', 'Trait_Tail_GoldenEgg').visible,
    };
  } });
  playback.advance(650);
  assert.deepEqual(releasePose, { poseScaleX: -1, eggVisible: false }, 'a skipped frame emits release from the exact 400 ms pose');
  controller.cancel();

  playback = controller.play(action.clip, { controlled: true });
  playback.sample(1000);
  assert.equal(rig.node('bone', 'pose').scaleX, 1);
  assert.equal(rig.node('bone', 'root').scaleX, -1);
  assert.equal(rig.node('attachment', 'Trait_Tail_GoldenEgg').visible, true);
  controller.dispose(); rig.dispose();
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

test('ships the complete animation catalog for both species with valid loop semantics', async () => {
  const expectedNames = [
    'walk', 'slowed', 'hit', 'fly', 'attack', 'peck', 'attack_peck', 'attack_heavy', 'stagger', 'death_burst',
    'spawn_drop', 'extraction_bow', 'draft_cheer', 'idle_breathe', 'idle_alert', 'run', 'sneak', 'crouch',
    'jump', 'fall', 'land', 'dodge', 'block', 'parry', 'kick', 'wing_slap', 'headbutt', 'charge', 'knockback',
    'knockdown', 'get_up', 'victory', 'wave', 'dance', 'sleep', 'eat', 'look_around', 'panic', 'cast', 'swim',
  ];
  const loopModes = new Map([
    ['walk', 'repeat'], ['slowed', 'ping-pong'], ['fly', 'ping-pong'], ['idle_breathe', 'ping-pong'],
    ['idle_alert', 'ping-pong'], ['run', 'repeat'], ['sneak', 'repeat'], ['crouch', 'ping-pong'],
    ['fall', 'ping-pong'], ['block', 'ping-pong'], ['charge', 'repeat'], ['victory', 'ping-pong'],
    ['dance', 'repeat'], ['sleep', 'ping-pong'], ['look_around', 'repeat'], ['panic', 'repeat'], ['swim', 'ping-pong'],
  ]);
  for (const species of ['chikn', 'roostr']) {
    const source = JSON.parse(await readFile(new URL(`../data/${species}-anims.json`, import.meta.url), 'utf8'));
    const rigSource = JSON.parse(await readFile(new URL(`../data/${species}-rig.json`, import.meta.url), 'utf8'));
    const rig = convertLegacyRig(rigSource, species, species);
    const clips = convertLegacyAnimations(source, species);
    const actionClips = createChiknActionClips(rig);
    assert.deepEqual(clips.map(({ id }) => id.replace(`${species}.`, '')), expectedNames);
    assert.equal(clips.length, 40);
    assert.equal(new Set([...clips, ...actionClips].map(({ id }) => id)).size, clips.length + actionClips.length, 'trait-aware additions must retain every released catalog clip without duplicate IDs');
    for (const clip of clips) assert.deepEqual(validateAnimationClip(clip, rig), [], clip.id);
    const walk = clips.find(({ id }) => id.endsWith('.walk'));
    assert.equal(walk.loop, true);
    assert.equal(walk.loopMode, 'repeat');
    assert.equal(walk.durationMs, 500);
    const rotations = (targetId) => walk.tracks.find((track) => track.targetId === targetId).keyframes.map(({ rotation }) => Math.round(rotation * 180 / Math.PI));
    assert.deepEqual(rotations('LegUpper A'), [30, 0, -30, 0]);
    assert.deepEqual(rotations('LegUpper B'), [-30, 0, 30, 0]);
    assert.ok(walk.tracks.every(({ keyframes }) => keyframes.at(-1).rotation === 0), `${species} walk must return every rotation to neutral`);
    assert.equal(walk.tracks.find(({ targetId }) => targetId === 'Torso').keyframes.at(-1).y, 0);
    for (const clip of clips) {
      const name = clip.id.replace(`${species}.`, '');
      const expectedLoopMode = loopModes.get(name);
      assert.equal(clip.loop, expectedLoopMode !== undefined, clip.id);
      assert.equal(clip.loopMode, expectedLoopMode, clip.id);
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
