import type { AnimationClipV1, AnimationCueV1, AnimationTrackV1, RigDefinitionV1 } from '@roost2d/contracts';
import type { ProceduralEffectDescriptor, ProceduralEffectKind } from '@roost2d/effects';

export type ChiknMotionFamily = 'accent' | 'footwear' | 'blade' | 'blunt' | 'ranged' | 'casting' | 'tail';
export type ChiknActionInput = 'punch' | 'kick' | 'special';

export interface ChiknTraitAnimationProfile {
  species: 'chikn' | 'roostr';
  traitGroupId: string;
  category: string;
  motionFamily: ChiknMotionFamily;
  readonly attachmentTargets: readonly string[];
  readonly supportedActions: readonly ChiknActionInput[];
  amplitude: number;
  speed: number;
  special?: { id: string; label: string; family: 'beam' | 'projectile' | 'cast' | 'burst' | 'tail'; socketId: string };
}

export interface ChiknActionChoice {
  id: string;
  input: ChiknActionInput;
  label: string;
  sourceTraitGroupId?: string;
}

export interface ResolvedChiknEffect extends ProceduralEffectDescriptor {
  cueId: string;
  socketId: string;
}

export interface ResolvedChiknAction extends ChiknActionChoice {
  motionFamily: string;
  clip: AnimationClipV1;
  effects: ResolvedChiknEffect[];
}

export interface ChiknActionRecipe {
  species: 'chikn' | 'roostr';
  traitGroupIds: readonly string[];
}

const BLADE = /(?:katana|sword|cutlass|broadsword|snip|spork|shovel|9-iron|the-key|scorpion-king)/;
const BLUNT = /(?:stick|corn|baguette|batter-up|home-run|banjo|bone|fish|popsicle|nugget|rubber-chikn|whalegod)/;
const RANGED = /(?:peacemaker|banger|zippo|boombox|floppy-disk|maverick|admiral)/;
const CASTING = /(?:wand|mage|all-seeing-eye|super-saiyan|saint|hypno|jell-o|beaker)/;
const TAIL_ATTACK = /(?:scorpion-king|sword-tail|hydra)/;
const profileCache = new WeakMap<RigDefinitionV1, readonly ChiknTraitAnimationProfile[]>();
const clipCache = new WeakMap<RigDefinitionV1, readonly AnimationClipV1[]>();

/** Returns one immutable motion profile for every attachment group in a rig. */
export function createChiknTraitAnimationProfiles(definition: RigDefinitionV1): readonly ChiknTraitAnimationProfile[] {
  const cached = profileCache.get(definition);
  if (cached) return cached;
  const species = definition.id;
  if (species !== 'chikn' && species !== 'roostr') throw new Error(`Unsupported Chikn rig species: ${species}`);
  const profiles = Object.freeze(Object.values(definition.attachmentGroups ?? {}).map((group) => {
    const category = String(group.metadata?.category ?? group.slotId);
    const token = group.id.toLowerCase();
    const motionFamily: ChiknMotionFamily = category.toLowerCase() === 'feet' ? 'footwear'
      : category.toLowerCase() === 'tail' && TAIL_ATTACK.test(token) ? 'tail'
      : BLADE.test(token) ? 'blade'
        : RANGED.test(token) ? 'ranged'
          : CASTING.test(token) ? 'casting'
            : BLUNT.test(token) ? 'blunt'
              : 'accent';
    const variation = stableVariation(group.id);
    const special = specialFor(group.id);
    return Object.freeze({
      species,
      traitGroupId: group.id,
      category,
      motionFamily,
      attachmentTargets: Object.freeze([...group.attachmentIds]),
      supportedActions: Object.freeze<ChiknActionInput[]>(['punch', 'kick', ...(special ? ['special' as const] : [])]),
      amplitude: Number((0.88 + variation * 0.24).toFixed(3)),
      speed: Number((0.92 + (1 - variation) * 0.16).toFixed(3)),
      ...(special ? { special } : {}),
    });
  }));
  profileCache.set(definition, profiles);
  return profiles;
}

export function validateChiknTraitAnimationProfiles(definition: RigDefinitionV1, profiles: readonly ChiknTraitAnimationProfile[]): string[] {
  const errors: string[] = [];
  const groups = definition.attachmentGroups ?? {};
  const seen = new Set<string>();
  const socketIds = new Set((definition.sockets ?? []).map(({ id }) => id));
  for (const profile of profiles) {
    if (seen.has(profile.traitGroupId)) errors.push(`duplicate trait animation profile ${profile.traitGroupId}`);
    seen.add(profile.traitGroupId);
    const group = groups[profile.traitGroupId];
    if (!group) { errors.push(`profile references unknown trait group ${profile.traitGroupId}`); continue; }
    if (profile.species !== definition.id) errors.push(`${profile.traitGroupId}: species does not match ${definition.id}`);
    if (profile.attachmentTargets.join('|') !== group.attachmentIds.join('|')) errors.push(`${profile.traitGroupId}: attachment targets do not match the rig group`);
    if (!profile.supportedActions.includes('punch') || !profile.supportedActions.includes('kick') || profile.supportedActions.includes('special') !== Boolean(profile.special)) errors.push(`${profile.traitGroupId}: supported actions do not match its capabilities`);
    if (!(profile.amplitude > 0) || !(profile.speed > 0)) errors.push(`${profile.traitGroupId}: adjustments must be positive`);
    if (profile.special && !socketIds.has(profile.special.socketId)) errors.push(`${profile.traitGroupId}: unknown special socket ${profile.special.socketId}`);
  }
  for (const groupId of Object.keys(groups)) if (!seen.has(groupId)) errors.push(`trait group has no animation profile ${groupId}`);
  return errors;
}

export function listChiknSpecials(recipe: ChiknActionRecipe, definition: RigDefinitionV1): ChiknActionChoice[] {
  assertRecipe(recipe, definition);
  const profiles = profileMap(definition);
  return recipe.traitGroupIds.flatMap((traitGroupId) => {
    const special = profiles.get(traitGroupId)?.special;
    return special ? [{ id: special.id, input: 'special' as const, label: special.label, sourceTraitGroupId: traitGroupId }] : [];
  });
}

export function listAvailableChiknActions(recipe: ChiknActionRecipe, definition: RigDefinitionV1): ChiknActionChoice[] {
  return [
    { id: 'punch', input: 'punch', label: 'Punch' },
    { id: 'kick', input: 'kick', label: 'Flying spin kick' },
    ...listChiknSpecials(recipe, definition),
  ];
}

export function resolveChiknAction(recipe: ChiknActionRecipe, definition: RigDefinitionV1, actionId: string): ResolvedChiknAction {
  assertRecipe(recipe, definition);
  const clips = new Map(createChiknActionClips(definition).map((clip) => [clip.id, clip]));
  const profiles = profileMap(definition);
  const selected = recipe.traitGroupIds.map((id) => profiles.get(id)!).filter(Boolean);
  if (actionId === 'punch') {
    const weapon = selected.find(({ motionFamily }) => ['blade', 'ranged', 'casting', 'blunt'].includes(motionFamily));
    const family = weapon?.motionFamily ?? 'unarmed';
    const clip = tailorActionClip(definition, requiredClip(clips, `${definition.id}.action.punch.${family}`), selected, weapon);
    const effectKind: ProceduralEffectKind | undefined = family === 'blade' ? 'slash' : family === 'ranged' ? 'projectile' : family === 'casting' ? 'burst' : undefined;
    return {
      id: actionId, input: 'punch', label: weapon ? `${displayName(weapon.traitGroupId)} attack` : 'Wing punch',
      ...(weapon ? { sourceTraitGroupId: weapon.traitGroupId } : {}), motionFamily: family, clip,
      effects: effectKind ? [effectFor(effectKind, 'contact', family === 'ranged' ? 'wing-front' : 'weapon', `${actionId}:${family}`)] : [],
    };
  }
  if (actionId === 'kick') {
    const feet = selected.find(({ category }) => category.toLowerCase() === 'feet');
    const combined = feet ? (definition.attachmentGroups?.[feet.traitGroupId]?.attachmentIds.length ?? 0) === 1 : false;
    const family = combined ? 'combined' : 'paired';
    return { id: actionId, input: 'kick', label: feet ? `${displayName(feet.traitGroupId)} spin kick` : 'Flying spin kick', ...(feet ? { sourceTraitGroupId: feet.traitGroupId } : {}), motionFamily: family, clip: tailorActionClip(definition, requiredClip(clips, `${definition.id}.action.kick.${family}`), selected, feet), effects: [effectFor('trail', 'contact', 'foot-front', `${actionId}:${family}`)] };
  }
  const specialChoice = listChiknSpecials(recipe, definition).find(({ id }) => id === actionId);
  if (!specialChoice?.sourceTraitGroupId) throw new Error(`Special is not available for this recipe: ${actionId}`);
  const profile = profiles.get(specialChoice.sourceTraitGroupId)!;
  const special = profile.special!;
  return {
    ...specialChoice,
    motionFamily: special.family,
    clip: tailorActionClip(definition, requiredClip(clips, `${definition.id}.action.special.${special.family}`), selected, profile),
    effects: [effectFor(special.family === 'cast' ? 'burst' : special.family === 'tail' ? 'slash' : special.family, 'release', special.socketId, special.id)],
  };
}

/** Species-specific brawler and attack foundations generated from the rig setup pose. */
export function createChiknActionClips(definition: RigDefinitionV1): readonly AnimationClipV1[] {
  const cached = clipCache.get(definition);
  if (cached) return cached;
  const species = definition.id;
  if (species !== 'chikn' && species !== 'roostr') throw new Error(`Unsupported Chikn rig species: ${species}`);
  const make = (id: string, durationMs: number, tracks: AnimationTrackV1[], cues: AnimationCueV1[] = [], loop = false): AnimationClipV1 => ({ schema: 'roost2d.animation/v1', id: `${species}.${id}`, durationMs, loop, ...(loop ? { loopMode: 'repeat' as const } : {}), defaultLayer: id.includes('action.') ? 'action' : 'base', cues, tracks });
  const track = (slot: string, frames: Array<[number, Partial<{ x: number; y: number; rotation: number; scaleX: number; scaleY: number }>, number?]>): AnimationTrackV1 => {
    const neutral = neutralTransform(definition, slot);
    return { target: 'slot', targetId: slot, keyframes: frames.map(([timeMs, delta, durationMs]) => ({ timeMs, ...(durationMs === undefined ? {} : { durationMs }), x: neutral.x + (delta.x ?? 0), y: neutral.y + (delta.y ?? 0), rotation: neutral.rotation + (delta.rotation ?? 0), scaleX: neutral.scaleX * (delta.scaleX ?? 1), scaleY: neutral.scaleY * (delta.scaleY ?? 1), ease: 'power2.out' })) };
  };
  const phaseCues = (contact: number, duration: number, release = contact): AnimationCueV1[] => {
    const cues: AnimationCueV1[] = [
      { id: 'anticipation', timeMs: 0, phase: 'anticipation' },
      { id: release === contact ? 'contact' : 'release', timeMs: release, phase: release === contact ? 'contact' : 'release' },
      ...(release === contact ? [] : [{ id: 'contact', timeMs: contact, phase: 'contact' as const }]),
      { id: 'recovery', timeMs: Math.min(duration - 1, Math.max(contact, release) + Math.round((duration - Math.max(contact, release)) * 0.35)), phase: 'recovery' },
      { id: 'complete', timeMs: duration, phase: 'complete' },
    ];
    return cues.sort((a, b) => a.timeMs - b.timeMs);
  };
  const clips: AnimationClipV1[] = [
    make('combat_idle', 800, [track('Torso', [[0, { y: 0 }], [400, { y: -1, rotation: -0.025 }, 400], [800, {}, 400]]), track('Wing A', [[0, { rotation: 0.18 }], [400, { rotation: 0.25 }, 400], [800, { rotation: 0.18 }, 400]])], [], true),
    make('dash', 260, [track('Torso', [[0, { x: -3, rotation: -.12 }], [90, { x: 12, rotation: -.18 }, 90], [260, {}, 170]]), track('Tail', [[0, { rotation: .25 }], [260, {}, 260]])], phaseCues(90, 260)),
    make('guard', 420, [track('Wing A', [[0, { x: 0, rotation: 0 }], [120, { x: 7, y: -4, rotation: -1.05 }, 120], [420, {}, 180]]), track('Head', [[0, {}], [120, { y: 3, rotation: .08 }, 120], [420, {}, 180]])], phaseCues(120, 420)),
  ];
  const punch = (family: string, wingRotation: number, duration = 420) => make(`action.punch.${family}`, duration, [track('Torso', [[0, { rotation: -.08 }], [130, { x: -2, rotation: -.16 }, 130], [230, { x: 5, rotation: .12 }, 100], [duration, {}, duration - 230]]), track('Wing A', [[0, {}], [130, { rotation: -.55 }, 130], [230, { x: 10, rotation: wingRotation }, 100], [duration, {}, duration - 230]]), track('Head', [[0, {}], [230, { rotation: .08 }, 230], [duration, {}, duration - 230]])], phaseCues(230, duration));
  clips.push(punch('unarmed', -1.35), punch('blade', -2.15, 500), punch('blunt', -1.65, 540), punch('ranged', -1.05, 480), punch('casting', -1.25, 560));
  const kick = (family: 'paired' | 'combined') => make(`action.kick.${family}`, 760, [track('Torso', [[0, { y: 3, rotation: -.12 }], [170, { y: -10, rotation: -.45 }, 170], [390, { y: -15, rotation: 2.7 }, 220], [560, { y: -7, rotation: 5.7 }, 170], [760, {}, 200]]), track('LegUpper A', [[0, { rotation: -.2 }], [170, { rotation: -.75 }, 170], [390, { rotation: family === 'paired' ? 1.45 : .85 }, 220], [560, { rotation: .3 }, 170], [760, {}, 200]]), track('LegUpper B', [[0, { rotation: .2 }], [170, { rotation: .65 }, 170], [390, { rotation: family === 'paired' ? -.85 : .35 }, 220], [760, {}, 370]]), track('Wing A', [[0, {}], [390, { rotation: -1.2 }, 390], [760, {}, 370]])], phaseCues(390, 760));
  clips.push(kick('paired'), kick('combined'));
  const special = (family: 'beam' | 'projectile' | 'cast' | 'burst' | 'tail', release: number, duration: number) => make(`action.special.${family}`, duration, [track('Torso', [[0, {}], [release - 80, { x: -3, rotation: -.12 }, release - 80], [release, { x: 3, rotation: .08 }, 80], [duration, {}, duration - release]]), track(family === 'beam' ? 'Head' : family === 'projectile' || family === 'tail' ? 'Tail' : 'Wing A', [[0, {}], [release, { rotation: family === 'beam' ? -.16 : family === 'tail' ? 1.65 : -1.25, scaleX: 1.08, scaleY: 1.08 }, release], [duration, {}, duration - release]])], phaseCues(release + 20, duration, release));
  clips.push(special('beam', 260, 620), special('projectile', 300, 720), special('cast', 340, 760), special('burst', 280, 680), special('tail', 250, 610));
  const frozen = Object.freeze(clips.map(freezeClip));
  clipCache.set(definition, frozen);
  return frozen;
}

/** Adds deterministic per-trait recoil, sway and follow-through without changing gameplay movement. */
function tailorActionClip(definition: RigDefinitionV1, base: AnimationClipV1, profiles: readonly ChiknTraitAnimationProfile[], driver?: ChiknTraitAnimationProfile): AnimationClipV1 {
  const timeScale = 1 / (driver?.speed ?? 1);
  const durationMs = Math.max(1, Math.round(base.durationMs * timeScale));
  const scaleTime = (timeMs: number) => Math.min(durationMs, Math.round(timeMs * timeScale));
  const accentAt = base.cues?.find(({ phase }) => phase === 'contact' || phase === 'release')?.timeMs ?? base.durationMs * .5;
  const recoverAt = base.cues?.find(({ phase }) => phase === 'recovery')?.timeMs ?? base.durationMs * .72;
  const traitTracks: AnimationTrackV1[] = [];
  for (const profile of profiles) {
    const direction = stableVariation(profile.traitGroupId) >= .5 ? 1 : -1;
    const category = profile.category.toLowerCase();
    const rotation = profile.amplitude * direction * (category === 'tail' ? .16 : category === 'neck' || category === 'head' ? .1 : .065);
    const lift = profile.amplitude * (category === 'feet' ? -2.8 : -1.5);
    for (const targetId of profile.attachmentTargets) {
      const neutral = neutralAttachmentTransform(definition, targetId);
      traitTracks.push({
        target: 'attachment',
        targetId,
        keyframes: [
          { timeMs: 0, durationMs: 0, ...neutral },
          { timeMs: scaleTime(accentAt), durationMs: Math.max(1, scaleTime(accentAt)), x: neutral.x, y: neutral.y + lift, rotation: neutral.rotation + rotation, scaleX: neutral.scaleX * (1 + .025 * profile.amplitude), scaleY: neutral.scaleY * (1 + .025 * profile.amplitude), ease: 'power2.out' },
          { timeMs: scaleTime(recoverAt), durationMs: Math.max(1, scaleTime(recoverAt - accentAt)), x: neutral.x, y: neutral.y + lift * .3, rotation: neutral.rotation - rotation * .25, scaleX: neutral.scaleX, scaleY: neutral.scaleY, ease: 'power2.out' },
          { timeMs: durationMs, durationMs: Math.max(1, durationMs - scaleTime(recoverAt)), ...neutral, ease: 'power2.out' },
        ],
      });
    }
  }
  return {
    ...base,
    durationMs,
    cues: base.cues?.map((cue) => ({ ...cue, timeMs: scaleTime(cue.timeMs) })),
    tracks: [
      ...base.tracks.map((track) => ({ ...track, keyframes: track.keyframes.map((keyframe) => ({ ...keyframe, timeMs: scaleTime(keyframe.timeMs), ...(keyframe.durationMs === undefined ? {} : { durationMs: Math.max(0, scaleTime(keyframe.durationMs)) }) })) })),
      ...traitTracks,
    ],
  };
}

function freezeClip(clip: AnimationClipV1): AnimationClipV1 {
  for (const track of clip.tracks) { for (const keyframe of track.keyframes) Object.freeze(keyframe); Object.freeze(track.keyframes); Object.freeze(track); }
  for (const cue of clip.cues ?? []) Object.freeze(cue);
  if (clip.cues) Object.freeze(clip.cues);
  Object.freeze(clip.tracks);
  return Object.freeze(clip);
}

function profileMap(definition: RigDefinitionV1): Map<string, ChiknTraitAnimationProfile> {
  const profiles = createChiknTraitAnimationProfiles(definition);
  const errors = validateChiknTraitAnimationProfiles(definition, profiles);
  if (errors.length) throw new Error(`Invalid Chikn trait animation profiles:\n${errors.join('\n')}`);
  return new Map(profiles.map((profile) => [profile.traitGroupId, profile]));
}

function assertRecipe(recipe: ChiknActionRecipe, definition: RigDefinitionV1): void {
  if (recipe.species !== definition.id) throw new Error(`Recipe species ${recipe.species} does not match rig ${definition.id}`);
  for (const id of recipe.traitGroupIds) if (!definition.attachmentGroups?.[id]) throw new Error(`Unknown trait group ${id}`);
}

function specialFor(groupId: string): ChiknTraitAnimationProfile['special'] {
  const id = groupId.toLowerCase();
  if (id.includes('laser-eye')) return { id: `${groupId}:laser`, label: `${displayName(groupId)} beam`, family: 'beam', socketId: 'eyes' };
  if (TAIL_ATTACK.test(id)) return { id: `${groupId}:tail`, label: `${displayName(groupId)} strike`, family: 'tail', socketId: 'tail' };
  if (/(?:golden-egg|very-fresh-egg|omelette)/.test(id)) return { id: `${groupId}:egg`, label: `${displayName(groupId)} throw`, family: 'projectile', socketId: id.startsWith('tail/') ? 'tail' : 'wing-front' };
  if (CASTING.test(id)) return { id: `${groupId}:cast`, label: `${displayName(groupId)} special`, family: 'cast', socketId: id.startsWith('head/') ? 'eyes' : 'weapon' };
  if (RANGED.test(id)) return { id: `${groupId}:shot`, label: `${displayName(groupId)} shot`, family: 'projectile', socketId: 'weapon' };
  if (/(?:gas-guzzler|fat-pipes|smokestack|hothead|toot-toot)/.test(id)) return { id: `${groupId}:burst`, label: `${displayName(groupId)} burst`, family: 'burst', socketId: id.startsWith('tail/') ? 'tail' : 'weapon' };
  return undefined;
}

function effectFor(kind: ProceduralEffectKind, cueId: string, socketId: string, id: string): ResolvedChiknEffect {
  const colors: Record<ProceduralEffectKind, number> = { beam: 0xff355e, slash: 0xffdf70, projectile: 0xfff2b2, burst: 0x9d71ff, trail: 0x74d7ff };
  return { id, kind, cueId, socketId, durationMs: kind === 'beam' ? 260 : kind === 'projectile' ? 480 : 300, color: colors[kind], secondaryColor: 0xffffff, length: kind === 'beam' ? 180 : 90, width: kind === 'beam' ? 9 : 7, radius: kind === 'projectile' ? 10 : 18, distance: kind === 'projectile' ? 170 : 80 };
}

function neutralTransform(definition: RigDefinitionV1, slotId: string): { x: number; y: number; rotation: number; scaleX: number; scaleY: number } {
  const attachmentId = definition.defaultSkinId ? definition.skins?.[definition.defaultSkinId]?.[slotId] : undefined;
  const attachment = definition.attachments.find(({ id }) => id === attachmentId) ?? definition.attachments.find(({ slotId: candidate }) => candidate === slotId);
  const bone = definition.bones.find(({ id }) => id === attachment?.boneId);
  return { x: bone?.x ?? attachment?.x ?? 0, y: bone?.y ?? attachment?.y ?? 0, rotation: bone?.rotation ?? attachment?.rotation ?? 0, scaleX: bone?.scaleX ?? attachment?.scaleX ?? 1, scaleY: bone?.scaleY ?? attachment?.scaleY ?? 1 };
}

function neutralAttachmentTransform(definition: RigDefinitionV1, attachmentId: string): { x: number; y: number; rotation: number; scaleX: number; scaleY: number } {
  const attachment = definition.attachments.find(({ id }) => id === attachmentId);
  if (!attachment) throw new Error(`Unknown profile attachment target: ${attachmentId}`);
  return { x: attachment.x ?? 0, y: attachment.y ?? 0, rotation: attachment.rotation ?? 0, scaleX: attachment.scaleX ?? 1, scaleY: attachment.scaleY ?? 1 };
}

function requiredClip(clips: ReadonlyMap<string, AnimationClipV1>, id: string): AnimationClipV1 {
  const clip = clips.get(id); if (!clip) throw new Error(`Unknown Chikn action clip: ${id}`); return clip;
}
function displayName(groupId: string): string { return groupId.split('/').at(-1)!.split('-').map((word) => word ? word[0]!.toUpperCase() + word.slice(1) : '').join(' '); }
function stableVariation(value: string): number { let hash = 2166136261; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0) / 0xffffffff; }
