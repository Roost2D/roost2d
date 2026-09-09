import type { AnimationClipV1, AnimationCueV1, AnimationKeyframeV1, AnimationTrackV1, RigDefinitionV1 } from '@roost2d/contracts';
import type { EffectOrigin, EffectPoint, EffectTrajectory, ProceduralEffectDescriptor, ProceduralEffectKind } from '@roost2d/effects';
import {
  CURATED_TRAIT_PROFILES,
  curatedTraitProfile,
  type ChiknKickPreset,
  type ChiknPunchPreset,
  type ChiknSecondaryMotion,
  type ChiknSpecialPreset,
} from './trait-profiles.js';

export type ChiknMotionFamily = 'accent' | 'footwear' | 'blade' | 'blunt' | 'ranged' | 'casting' | 'tail';
export type ChiknActionInput = 'punch' | 'kick' | 'special';

export interface ChiknTraitAnimationProfile {
  species: 'chikn' | 'roostr';
  traitGroupId: string;
  category: string;
  motionFamily: ChiknMotionFamily;
  readonly attachmentTargets: readonly string[];
  readonly supportedActions: readonly ChiknActionInput[];
  secondaryMotion: ChiknSecondaryMotion;
  amplitude: number;
  speed: number;
  gripOffset: EffectPoint;
  tipOffset: EffectPoint;
  originOffset: EffectPoint;
  timing: { anticipationMs: number; releaseMs: number; recoveryMs: number };
  punchPreset?: ChiknPunchPreset;
  kickPreset?: ChiknKickPreset;
  special?: {
    id: string;
    label: string;
    family: 'beam' | 'projectile' | 'cast' | 'burst' | 'tail';
    preset: ChiknSpecialPreset;
    origin: EffectOrigin;
  };
}

export interface ChiknActionChoice {
  id: string;
  input: ChiknActionInput;
  label: string;
  sourceTraitGroupId?: string;
}

export interface ChiknActionContext { targetOffset?: EffectPoint }

export interface ResolvedChiknEffect extends ProceduralEffectDescriptor {
  cueId: string;
  /** @deprecated Prefer origin. Kept for v0.5 consumers. */
  socketId: string;
}

export interface ResolvedChiknAction extends ChiknActionChoice {
  motionFamily: string;
  clip: AnimationClipV1;
  effects: ResolvedChiknEffect[];
  targetOffset: EffectPoint;
}

export interface ChiknActionRecipe {
  species: 'chikn' | 'roostr';
  traitGroupIds: readonly string[];
  /** Informational only. Facing remains owned by the consuming game. */
  mirrored?: boolean;
}

const DEFAULT_TARGET = Object.freeze({ x: 180, y: 0 });
const profileCache = new WeakMap<RigDefinitionV1, readonly ChiknTraitAnimationProfile[]>();
const clipCache = new WeakMap<RigDefinitionV1, readonly AnimationClipV1[]>();

const MOTION_ADJUSTMENTS: Record<ChiknSecondaryMotion, { amplitude: number; speed: number }> = {
  rigid: { amplitude: .72, speed: 1.08 },
  soft: { amplitude: 1, speed: .96 },
  dangling: { amplitude: 1.16, speed: .92 },
  cloth: { amplitude: 1.12, speed: .9 },
  feather: { amplitude: 1.06, speed: 1 },
  bulky: { amplitude: .82, speed: .88 },
  elastic: { amplitude: 1.22, speed: .94 },
};

const PRESET_CALIBRATION: Partial<Record<ChiknPunchPreset | ChiknKickPreset | ChiknSpecialPreset, {
  grip: EffectPoint;
  tip: EffectPoint;
  origin: EffectPoint;
  timing: { anticipationMs: number; releaseMs: number; recoveryMs: number };
}>> = {
  katana: { grip: { x: -8, y: 4 }, tip: { x: 38, y: -2 }, origin: { x: 30, y: -4 }, timing: { anticipationMs: 90, releaseMs: 185, recoveryMs: 290 } },
  sword: { grip: { x: -7, y: 5 }, tip: { x: 34, y: -4 }, origin: { x: 28, y: -3 }, timing: { anticipationMs: 135, releaseMs: 255, recoveryMs: 390 } },
  snips: { grip: { x: -5, y: 2 }, tip: { x: 25, y: 0 }, origin: { x: 22, y: 0 }, timing: { anticipationMs: 120, releaseMs: 240, recoveryMs: 360 } },
  thrust: { grip: { x: -8, y: 5 }, tip: { x: 36, y: 0 }, origin: { x: 32, y: 0 }, timing: { anticipationMs: 150, releaseMs: 275, recoveryMs: 390 } },
  golf: { grip: { x: -8, y: 6 }, tip: { x: 42, y: 8 }, origin: { x: 38, y: 8 }, timing: { anticipationMs: 190, releaseMs: 350, recoveryMs: 470 } },
  pickaxe: { grip: { x: -7, y: 5 }, tip: { x: 34, y: 10 }, origin: { x: 30, y: 8 }, timing: { anticipationMs: 180, releaseMs: 330, recoveryMs: 470 } },
  gun: { grip: { x: -8, y: 7 }, tip: { x: 34, y: -3 }, origin: { x: 31, y: -3 }, timing: { anticipationMs: 120, releaseMs: 220, recoveryMs: 330 } },
  egg: { grip: { x: 0, y: 0 }, tip: { x: 0, y: 0 }, origin: { x: 0, y: 3 }, timing: { anticipationMs: 160, releaseMs: 400, recoveryMs: 800 } },
  laser: { grip: { x: 0, y: 0 }, tip: { x: 14, y: -3 }, origin: { x: 13, y: -3 }, timing: { anticipationMs: 170, releaseMs: 280, recoveryMs: 440 } },
  disk: { grip: { x: -5, y: 2 }, tip: { x: 18, y: 0 }, origin: { x: 10, y: -2 }, timing: { anticipationMs: 180, releaseMs: 320, recoveryMs: 590 } },
  pan: { grip: { x: -7, y: 4 }, tip: { x: 22, y: 2 }, origin: { x: 13, y: -1 }, timing: { anticipationMs: 190, releaseMs: 330, recoveryMs: 600 } },
  sonic: { grip: { x: -4, y: 4 }, tip: { x: 24, y: 0 }, origin: { x: 19, y: -2 }, timing: { anticipationMs: 170, releaseMs: 300, recoveryMs: 500 } },
  flame: { grip: { x: -4, y: 4 }, tip: { x: 22, y: 0 }, origin: { x: 18, y: 0 }, timing: { anticipationMs: 160, releaseMs: 290, recoveryMs: 490 } },
  exhaust: { grip: { x: 0, y: 0 }, tip: { x: -18, y: 2 }, origin: { x: -16, y: 2 }, timing: { anticipationMs: 120, releaseMs: 260, recoveryMs: 430 } },
};

/** Returns one checked-in, immutable motion profile for every attachment group in a rig. */
export function createChiknTraitAnimationProfiles(definition: RigDefinitionV1): readonly ChiknTraitAnimationProfile[] {
  const cached = profileCache.get(definition);
  if (cached) return cached;
  const species = speciesOf(definition);
  const profiles = Object.freeze(Object.values(definition.attachmentGroups ?? {}).map((group) => {
    const curated = curatedTraitProfile(species, group.id);
    if (!curated) throw new Error(`Trait group has no curated animation profile: ${species}:${group.id}`);
    const category = String(group.metadata?.category ?? group.slotId);
    const adjustment = MOTION_ADJUSTMENTS[curated.secondaryMotion];
    const preset = curated.specialPreset ?? curated.punchPreset ?? curated.kickPreset;
    const calibration = preset ? PRESET_CALIBRATION[preset] : undefined;
    const special = curated.specialPreset
      ? specialFor(curated.specialPreset, group.id, group.attachmentIds[0]!, category, calibration?.origin ?? { x: 0, y: 0 })
      : undefined;
    return Object.freeze({
      species,
      traitGroupId: group.id,
      category,
      motionFamily: curated.motionFamily,
      attachmentTargets: Object.freeze([...group.attachmentIds]),
      supportedActions: Object.freeze<ChiknActionInput[]>(['punch', 'kick', ...(special ? ['special' as const] : [])]),
      secondaryMotion: curated.secondaryMotion,
      amplitude: adjustment.amplitude,
      speed: adjustment.speed,
      gripOffset: calibration?.grip ?? { x: 0, y: 0 },
      tipOffset: calibration?.tip ?? { x: 0, y: 0 },
      originOffset: calibration?.origin ?? { x: 0, y: 0 },
      timing: calibration?.timing ?? { anticipationMs: 140, releaseMs: 260, recoveryMs: 420 },
      ...(curated.punchPreset ? { punchPreset: curated.punchPreset } : {}),
      ...(curated.kickPreset ? { kickPreset: curated.kickPreset } : {}),
      ...(special ? { special } : {}),
    });
  }));
  profileCache.set(definition, profiles);
  return profiles;
}

export function validateChiknTraitAnimationProfiles(definition: RigDefinitionV1, profiles: readonly ChiknTraitAnimationProfile[]): string[] {
  const errors: string[] = [];
  const species = definition.id === 'chikn' || definition.id === 'roostr' ? definition.id : undefined;
  const groups = definition.attachmentGroups ?? {};
  const seen = new Set<string>();
  const attachmentIds = new Set(definition.attachments.map(({ id }) => id));
  const socketIds = new Set((definition.sockets ?? []).map(({ id }) => id));
  for (const profile of profiles) {
    if (seen.has(profile.traitGroupId)) errors.push(`duplicate trait animation profile ${profile.traitGroupId}`);
    seen.add(profile.traitGroupId);
    const group = groups[profile.traitGroupId];
    if (!group) { errors.push(`profile references unknown trait group ${profile.traitGroupId}`); continue; }
    if (profile.species !== definition.id) errors.push(`${profile.traitGroupId}: species does not match ${definition.id}`);
    if (profile.attachmentTargets.join('|') !== group.attachmentIds.join('|')) errors.push(`${profile.traitGroupId}: attachment targets do not match the rig group`);
    if (profile.attachmentTargets.some((id) => !attachmentIds.has(id))) errors.push(`${profile.traitGroupId}: unknown driver attachment`);
    if (!profile.supportedActions.includes('punch') || !profile.supportedActions.includes('kick') || profile.supportedActions.includes('special') !== Boolean(profile.special)) errors.push(`${profile.traitGroupId}: supported actions do not match its capabilities`);
    if (!(profile.amplitude > 0) || !(profile.speed > 0)) errors.push(`${profile.traitGroupId}: adjustments must be positive`);
    const numbers = [profile.gripOffset.x, profile.gripOffset.y, profile.tipOffset.x, profile.tipOffset.y, profile.originOffset.x, profile.originOffset.y, profile.timing.anticipationMs, profile.timing.releaseMs, profile.timing.recoveryMs];
    if (numbers.some((value) => !Number.isFinite(value))) errors.push(`${profile.traitGroupId}: calibration values must be finite`);
    if (profile.special?.origin.target === 'attachment' && !attachmentIds.has(profile.special.origin.targetId)) errors.push(`${profile.traitGroupId}: unknown special attachment ${profile.special.origin.targetId}`);
    if (profile.special?.origin.target === 'socket' && !socketIds.has(profile.special.origin.targetId)) errors.push(`${profile.traitGroupId}: unknown special socket ${profile.special.origin.targetId}`);
  }
  for (const groupId of Object.keys(groups)) if (!seen.has(groupId)) errors.push(`trait group has no animation profile ${groupId}`);
  if (species) for (const curated of CURATED_TRAIT_PROFILES.values()) {
    if (curated.species === species && !Object.hasOwn(groups, curated.traitGroupId)) errors.push(`curated profile references unknown ${species} trait group ${curated.traitGroupId}`);
  }
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

export function resolveChiknAction(recipe: ChiknActionRecipe, definition: RigDefinitionV1, actionId: string, context: ChiknActionContext = {}): ResolvedChiknAction {
  assertRecipe(recipe, definition);
  const targetOffset = normaliseTarget(context.targetOffset);
  const clips = new Map(createChiknActionClips(definition).map((clip) => [clip.id, clip]));
  const profiles = profileMap(definition);
  const selected = recipe.traitGroupIds.map((id) => profiles.get(id)!).filter(Boolean);
  if (actionId === 'punch') {
    const weapon = selected.find(({ punchPreset }) => punchPreset !== undefined);
    const family = weapon?.motionFamily ?? 'unarmed';
    const base = requiredClip(clips, `${definition.id}.action.punch.${family}`);
    const clip = tailorActionClip(definition, base, selected, weapon);
    return {
      id: actionId,
      input: 'punch',
      label: weapon ? `${displayName(weapon.traitGroupId)} attack` : 'Wing punch',
      ...(weapon ? { sourceTraitGroupId: weapon.traitGroupId } : {}),
      motionFamily: family,
      clip,
      effects: weapon ? punchEffects(weapon, targetOffset) : [],
      targetOffset,
    };
  }
  if (actionId === 'kick') {
    const feet = selected.find(({ kickPreset }) => kickPreset !== undefined);
    const combined = feet ? (definition.attachmentGroups?.[feet.traitGroupId]?.attachmentIds.length ?? 0) === 1 : false;
    const family = combined ? 'combined' : 'paired';
    const clip = tailorActionClip(definition, requiredClip(clips, `${definition.id}.action.kick.${family}`), selected, feet);
    return {
      id: actionId,
      input: 'kick',
      label: feet ? `${displayName(feet.traitGroupId)} kick` : 'Flying spin kick',
      ...(feet ? { sourceTraitGroupId: feet.traitGroupId } : {}),
      motionFamily: family,
      clip,
      effects: [proceduralEffect('trail', 'contact', socketOrigin('foot-front'), `kick:${feet?.kickPreset ?? family}`, targetOffset, 'follow')],
      targetOffset,
    };
  }
  const specialChoice = listChiknSpecials(recipe, definition).find(({ id }) => id === actionId);
  if (!specialChoice?.sourceTraitGroupId) throw new Error(`Special is not available for this recipe: ${actionId}`);
  const profile = profiles.get(specialChoice.sourceTraitGroupId)!;
  const special = profile.special!;
  const clipId = special.preset === 'egg' ? `${definition.id}.action.special.egg` : `${definition.id}.action.special.${special.family}`;
  const clip = tailorActionClip(definition, requiredClip(clips, clipId), selected, profile, special.preset === 'egg');
  return {
    ...specialChoice,
    motionFamily: special.family,
    clip,
    effects: specialEffects(profile, targetOffset),
    targetOffset,
  };
}

/** Species-specific brawler and attack foundations generated from the rig setup pose. */
export function createChiknActionClips(definition: RigDefinitionV1): readonly AnimationClipV1[] {
  const cached = clipCache.get(definition);
  if (cached) return cached;
  const species = speciesOf(definition);
  const make = (id: string, durationMs: number, tracks: AnimationTrackV1[], cues: AnimationCueV1[] = [], loop = false): AnimationClipV1 => ({ schema: 'roost2d.animation/v1', id: `${species}.${id}`, durationMs, loop, ...(loop ? { loopMode: 'repeat' as const } : {}), defaultLayer: id.includes('action.') ? 'action' : 'base', cues, tracks });
  const track = (target: 'bone' | 'slot', id: string, frames: Array<[number, Partial<AnimationKeyframeV1>, number?]>): AnimationTrackV1 => {
    const neutral = target === 'bone' ? neutralBoneTransform(definition, id) : neutralTransform(definition, id);
    return { target, targetId: id, keyframes: frames.map(([timeMs, delta, durationMs]) => ({ timeMs: durationMs === undefined ? timeMs : Math.max(0, timeMs - durationMs), ...(durationMs === undefined ? {} : { durationMs }), x: neutral.x + (delta.x ?? 0), y: neutral.y + (delta.y ?? 0), rotation: neutral.rotation + (delta.rotation ?? 0), scaleX: neutral.scaleX * (delta.scaleX ?? 1), scaleY: neutral.scaleY * (delta.scaleY ?? 1), ease: 'power2.out' })) };
  };
  const slot = (id: string, frames: Array<[number, Partial<AnimationKeyframeV1>, number?]>) => track('slot', id, frames);
  const cues = (contact: number, duration: number, release = contact): AnimationCueV1[] => [
    { id: 'anticipation', timeMs: 0, phase: 'anticipation' },
    ...(release === contact ? [{ id: 'contact', timeMs: contact, phase: 'contact' as const }] : [{ id: 'release', timeMs: release, phase: 'release' as const }, { id: 'contact', timeMs: contact, phase: 'contact' as const }]),
    { id: 'recovery', timeMs: Math.min(duration - 1, Math.max(contact, release) + Math.round((duration - Math.max(contact, release)) * .35)), phase: 'recovery' },
    { id: 'complete', timeMs: duration, phase: 'complete' },
  ];
  const clips: AnimationClipV1[] = [
    make('combat_idle', 800, [slot('Torso', [[0, {}], [400, { y: -1, rotation: -.025 }, 400], [800, {}, 400]]), slot('Wing A', [[0, { rotation: .18 }], [400, { rotation: .25 }, 400], [800, { rotation: .18 }, 400]])], [], true),
    make('dash', 260, [slot('Torso', [[0, { x: -3, rotation: -.12 }], [90, { x: 12, rotation: -.18 }, 90], [260, {}, 170]]), slot('Tail', [[0, { rotation: .25 }], [260, {}, 260]])], cues(90, 260)),
    make('guard', 420, [slot('Wing A', [[0, {}], [120, { x: 7, y: -4, rotation: -1.05 }, 120], [420, {}, 180]]), slot('Head', [[0, {}], [120, { y: 3, rotation: .08 }, 120], [420, {}, 180]])], cues(120, 420)),
  ];
  const punch = (family: string, rotation: number, duration: number) => make(`action.punch.${family}`, duration, [
    slot('Torso', [[0, {}], [duration * .3, { x: -3, rotation: -.18 }, duration * .3], [duration * .52, { x: 5, rotation: .12 }, duration * .22], [duration, {}, duration * .48]]),
    slot('Wing A', [[0, {}], [duration * .3, { rotation: -.55 }, duration * .3], [duration * .52, { x: 10, rotation }, duration * .22], [duration, {}, duration * .48]]),
    slot('Head', [[0, {}], [duration * .52, { rotation: .08 }, duration * .52], [duration, {}, duration * .48]]),
  ], cues(Math.round(duration * .52), duration));
  clips.push(punch('unarmed', -1.35, 420), punch('blade', -2.15, 500), punch('blunt', -1.65, 560), punch('ranged', -1.05, 480), punch('casting', -1.25, 560));
  const kick = (family: 'paired' | 'combined') => make(`action.kick.${family}`, 760, [
    slot('Torso', [[0, { y: 3, rotation: -.12 }], [170, { y: -10, rotation: -.45 }, 170], [390, { y: -15, rotation: 2.7 }, 220], [560, { y: -7, rotation: 5.7 }, 170], [760, {}, 200]]),
    slot('LegUpper A', [[0, { rotation: -.2 }], [170, { rotation: -.75 }, 170], [390, { rotation: family === 'paired' ? 1.45 : .85 }, 220], [560, { rotation: .3 }, 170], [760, {}, 200]]),
    slot('LegUpper B', [[0, { rotation: .2 }], [170, { rotation: .65 }, 170], [390, { rotation: family === 'paired' ? -.85 : .35 }, 220], [760, {}, 370]]),
    slot('Wing A', [[0, {}], [390, { rotation: -1.2 }, 390], [760, {}, 370]]),
  ], cues(390, 760));
  clips.push(kick('paired'), kick('combined'));
  const special = (family: 'beam' | 'projectile' | 'cast' | 'burst' | 'tail', release: number, duration: number) => make(`action.special.${family}`, duration, [
    slot('Torso', [[0, {}], [release - 80, { x: -3, rotation: -.12 }, release - 80], [release, { x: 3, rotation: .08 }, 80], [duration, {}, duration - release]]),
    slot(family === 'beam' ? 'Head' : family === 'projectile' || family === 'tail' ? 'Tail' : 'Wing A', [[0, {}], [release, { rotation: family === 'beam' ? -.16 : family === 'tail' ? 1.65 : -1.25, scaleX: 1.08, scaleY: 1.08 }, release], [duration, {}, duration - release]]),
  ], cues(release + 20, duration, release));
  clips.push(special('beam', 280, 640), special('projectile', 320, 740), special('cast', 340, 760), special('burst', 300, 700), special('tail', 260, 640));
  clips.push(make('action.special.egg', 1000, [
    track('bone', 'pose', [[0, {}], [160, { scaleX: -1 }, 160], [800, { scaleX: -1 }, 640], [1000, {}, 200]]),
    slot('Torso', [[0, {}], [160, { y: 1, rotation: .12 }, 160], [360, { y: 8, rotation: .34, scaleY: .9 }, 200], [800, { y: 5, rotation: .22, scaleY: .94 }, 440], [1000, {}, 200]]),
    slot('Head', [[0, {}], [360, { x: -3, y: 7, rotation: .28 }, 360], [800, { x: -1, y: 3, rotation: .12 }, 440], [1000, {}, 200]]),
    slot('Tail', [[0, {}], [360, { x: -3, y: -3, rotation: -.42 }, 360], [400, { x: -1, y: -5, rotation: -.6 }, 40], [800, { rotation: -.2 }, 400], [1000, {}, 200]]),
    slot('LegUpper A', [[0, {}], [360, { rotation: -.38, scaleY: .92 }, 360], [800, { rotation: -.18 }, 440], [1000, {}, 200]]),
    slot('LegUpper B', [[0, {}], [360, { rotation: .3, scaleY: .92 }, 360], [800, { rotation: .12 }, 440], [1000, {}, 200]]),
  ], [
    { id: 'anticipation', timeMs: 0, phase: 'anticipation' },
    { id: 'turn-away', timeMs: 160, phase: 'anticipation' },
    { id: 'release', timeMs: 400, phase: 'release' },
    { id: 'contact', timeMs: 800, phase: 'contact' },
    { id: 'recovery', timeMs: 800, phase: 'recovery' },
    { id: 'turn-back', timeMs: 920, phase: 'recovery' },
    { id: 'complete', timeMs: 1000, phase: 'complete' },
  ]));
  const frozen = Object.freeze(clips.map(freezeClip));
  clipCache.set(definition, frozen);
  return frozen;
}

function tailorActionClip(definition: RigDefinitionV1, base: AnimationClipV1, profiles: readonly ChiknTraitAnimationProfile[], driver?: ChiknTraitAnimationProfile, preserveTiming = false): AnimationClipV1 {
  const timeScale = preserveTiming ? 1 : 1 / (driver?.speed ?? 1);
  const durationMs = preserveTiming ? base.durationMs : Math.max(1, Math.round(base.durationMs * timeScale));
  const scaleTime = (timeMs: number) => Math.min(durationMs, Math.round(timeMs * timeScale));
  const accentAt = base.cues?.find(({ phase }) => phase === 'contact' || phase === 'release')?.timeMs ?? base.durationMs * .5;
  const recoverAt = base.cues?.find(({ phase }) => phase === 'recovery')?.timeMs ?? base.durationMs * .72;
  const traitTracks: AnimationTrackV1[] = [];
  for (const profile of profiles) {
    const isDriver = profile === driver;
    for (const [index, targetId] of profile.attachmentTargets.entries()) {
      const neutral = neutralAttachmentTransform(definition, targetId);
      const motion = attachmentMotion(profile, isDriver, index);
      let keyframes: AnimationKeyframeV1[] = [
        { timeMs: 0, durationMs: 0, ...neutral },
        { timeMs: 0, durationMs: Math.max(1, scaleTime(accentAt)), x: neutral.x + motion.x, y: neutral.y + motion.y, rotation: neutral.rotation + motion.rotation, scaleX: neutral.scaleX * motion.scaleX, scaleY: neutral.scaleY * motion.scaleY, ease: 'power2.out' },
        { timeMs: scaleTime(accentAt), durationMs: Math.max(1, scaleTime(recoverAt - accentAt)), x: neutral.x, y: neutral.y + motion.y * .25, rotation: neutral.rotation - motion.rotation * .2, scaleX: neutral.scaleX, scaleY: neutral.scaleY, ease: 'power2.out' },
        { timeMs: scaleTime(recoverAt), durationMs: Math.max(1, durationMs - scaleTime(recoverAt)), ...neutral, ease: 'power2.out' },
      ];
      if (isDriver && profile.special?.preset === 'egg') {
        keyframes = [
          { timeMs: 0, durationMs: 0, ...neutral, visible: true },
          { timeMs: 0, durationMs: 360, ...neutral, y: neutral.y + 2, rotation: neutral.rotation -.18, visible: true, ease: 'power2.out' },
          { timeMs: 360, durationMs: 40, ...neutral, y: neutral.y - 2, rotation: neutral.rotation -.28, scaleX: neutral.scaleX * .82, scaleY: neutral.scaleY * .82, visible: true, ease: 'power2.out' },
          { timeMs: 400, durationMs: 0, ...neutral, y: neutral.y - 2, rotation: neutral.rotation -.28, scaleX: neutral.scaleX * .82, scaleY: neutral.scaleY * .82, visible: false, ease: 'none' },
          { timeMs: 800, durationMs: 0, ...neutral, scaleX: neutral.scaleX * .2, scaleY: neutral.scaleY * .2, visible: true, ease: 'none' },
          { timeMs: 800, durationMs: 80, ...neutral, scaleX: neutral.scaleX * 1.14, scaleY: neutral.scaleY * 1.14, visible: true, ease: 'back.out(2)' },
          { timeMs: 880, durationMs: 120, ...neutral, visible: true, ease: 'power2.out' },
        ];
      } else if (isDriver && (profile.special?.preset === 'disk' || profile.special?.preset === 'pan')) {
        const release = scaleTime(accentAt); const recovery = scaleTime(recoverAt);
        keyframes = [
          { timeMs: 0, durationMs: 0, ...neutral, visible: true },
          { timeMs: 0, durationMs: Math.max(1, release), x: neutral.x + motion.x, y: neutral.y + motion.y, rotation: neutral.rotation + motion.rotation, scaleX: neutral.scaleX * motion.scaleX, scaleY: neutral.scaleY * motion.scaleY, visible: true, ease: 'power2.out' },
          { timeMs: release, durationMs: 0, x: neutral.x + motion.x, y: neutral.y + motion.y, rotation: neutral.rotation + motion.rotation, scaleX: neutral.scaleX * motion.scaleX, scaleY: neutral.scaleY * motion.scaleY, visible: false, ease: 'none' },
          { timeMs: recovery, durationMs: 0, ...neutral, scaleX: neutral.scaleX * .2, scaleY: neutral.scaleY * .2, visible: true, ease: 'none' },
          { timeMs: recovery, durationMs: Math.max(1, durationMs - recovery), ...neutral, visible: true, ease: 'back.out(2)' },
        ];
      }
      traitTracks.push({ target: 'attachment', targetId, keyframes });
    }
  }
  return {
    ...base,
    durationMs,
    cues: base.cues?.map((cue) => ({ ...cue, timeMs: scaleTime(cue.timeMs) })),
    tracks: [
      ...base.tracks.map((entry) => ({ ...entry, keyframes: entry.keyframes.map((keyframe) => ({ ...keyframe, timeMs: scaleTime(keyframe.timeMs), ...(keyframe.durationMs === undefined ? {} : { durationMs: Math.max(0, scaleTime(keyframe.durationMs)) }) })) })),
      ...traitTracks,
    ],
  };
}

function attachmentMotion(profile: ChiknTraitAnimationProfile, driver: boolean, index: number) {
  const paired = index % 2 === 0 ? 1 : -1;
  if (driver && profile.punchPreset) {
    const values: Record<ChiknPunchPreset, [number, number, number, number, number]> = {
      katana: [14, -5, -2.65, 1.04, .98], sword: [12, -7, -2.2, 1.04, .98], snips: [11, paired * 3, paired * .82, 1.08, 1.02], thrust: [20, -2, -.25, 1.02, 1], golf: [8, -9, -2.8, 1.04, .98], pickaxe: [7, -11, -2.45, 1.04, .98], 'heavy-swing': [8, -7, -1.9, 1.04, 1.02], 'light-swing': [12, -5, -2.25, 1.05, .98], gun: [5, 1, -.18, 1.02, 1], wand: [9, -6, -1.35, 1.05, 1],
    };
    const [x, y, rotation, scaleX, scaleY] = values[profile.punchPreset];
    return { x, y, rotation, scaleX, scaleY };
  }
  if (driver && profile.kickPreset) {
    const values: Record<ChiknKickPreset, [number, number, number, number, number]> = {
      natural: [12 * paired, -5, 1.15 * paired, 1.08, 1.04], fast: [18 * paired, -8, 1.7 * paired, 1.08, 1.02], heavy: [15 * paired, -3, 1.15 * paired, 1.12, 1.08], roller: [17 * paired, -7, 2.5 * paired, 1.08, 1.04], stiletto: [21 * paired, -2, .85 * paired, 1.1, .98], spur: [20 * paired, -5, 1.35 * paired, 1.1, 1], pendulum: [13 * paired, 5, 2.2 * paired, 1.12, 1.08], ironclaw: [19 * paired, -4, 1.65 * paired, 1.1, 1],
    };
    const [x, y, rotation, scaleX, scaleY] = values[profile.kickPreset];
    return { x, y, rotation, scaleX, scaleY };
  }
  if (driver && profile.special?.preset?.startsWith('tail-')) return { x: -11, y: -4, rotation: 1.65, scaleX: 1.1, scaleY: 1.04 };
  const categoryDirection = profile.category === 'Tail' ? -1 : profile.category === 'Feet' ? paired : 1;
  const rotations: Record<ChiknSecondaryMotion, number> = { rigid: .04, soft: .1, dangling: .16, cloth: .2, feather: .14, bulky: .06, elastic: .22 };
  return { x: 0, y: -1.5 * profile.amplitude, rotation: rotations[profile.secondaryMotion] * categoryDirection, scaleX: 1 + .025 * profile.amplitude, scaleY: 1 + .025 * profile.amplitude };
}

function punchEffects(profile: ChiknTraitAnimationProfile, target: EffectPoint): ResolvedChiknEffect[] {
  const origin = attachmentOrigin(profile);
  if (profile.punchPreset === 'gun') return [
    proceduralEffect('projectile', 'contact', origin, `${profile.traitGroupId}:round`, target, 'detached', { kind: 'linear', targetOffset: target, rotationTurns: 0 }, { color: 0xffd36b, radius: 4, durationMs: 360 }),
    proceduralEffect('burst', 'contact', origin, `${profile.traitGroupId}:muzzle`, target, 'follow', undefined, { color: 0xffa726, secondaryColor: 0xffffdc, radius: 12, durationMs: 150 }),
  ];
  if (profile.motionFamily === 'blade') return [proceduralEffect('slash', 'contact', origin, `${profile.traitGroupId}:slash`, target, 'follow', undefined, { color: 0xffe79a, length: 100, width: profile.punchPreset === 'katana' ? 5 : 8 })];
  if (profile.motionFamily === 'casting') return [proceduralEffect('burst', 'contact', origin, `${profile.traitGroupId}:cast`, target, 'follow')];
  if (profile.motionFamily === 'blunt') return [proceduralEffect('trail', 'contact', origin, `${profile.traitGroupId}:swing`, target, 'follow', undefined, { width: profile.punchPreset === 'heavy-swing' ? 11 : 7 })];
  return [];
}

function specialEffects(profile: ChiknTraitAnimationProfile, target: EffectPoint): ResolvedChiknEffect[] {
  const special = profile.special!;
  const origin = special.origin;
  const preset = special.preset;
  if (preset === 'egg') return [cloneEffect(profile.attachmentTargets[0]!, 'release', origin, special.id, target, 400, 28, 1)];
  if (preset === 'disk') return [cloneEffect(profile.attachmentTargets[0]!, 'release', origin, special.id, target, 470, 36, 2)];
  if (preset === 'pan') return [cloneEffect(profile.attachmentTargets[0]!, 'release', origin, special.id, target, 500, 42, 1)];
  if (preset === 'laser') return [proceduralEffect('beam', 'release', origin, special.id, target, 'detached', undefined, { color: 0xff335a, secondaryColor: 0xffffff, length: Math.hypot(target.x, target.y), width: 9, durationMs: 260 })];
  if (preset === 'sonic') return [proceduralEffect('burst', 'release', origin, special.id, target, 'follow', undefined, { color: 0x73dcff, secondaryColor: 0xffffff, radius: 24, durationMs: 360 })];
  if (preset === 'flame') return [proceduralEffect('trail', 'release', origin, special.id, target, 'follow', { kind: 'linear', targetOffset: { x: target.x * .55, y: target.y * .55 } }, { color: 0xff7a24, secondaryColor: 0xffed6a, width: 18, durationMs: 390 })];
  if (preset === 'exhaust') return [proceduralEffect('trail', 'release', origin, special.id, { x: -Math.max(90, Math.abs(target.x) * .55), y: -target.y * .2 }, 'follow', undefined, { color: 0x7b8194, secondaryColor: 0xd9deeb, width: 18, durationMs: 360 })];
  if (preset === 'tail-stab' || preset === 'tail-sweep' || preset === 'tail-snap') return [proceduralEffect('slash', 'release', origin, special.id, target, 'follow', undefined, { color: 0xb8f26a, width: preset === 'tail-stab' ? 5 : 10, radius: 30, durationMs: 300 })];
  if (preset === 'tail-slam') return [proceduralEffect('burst', 'contact', origin, special.id, target, 'follow', undefined, { color: 0x67c9ff, radius: 34, width: 12, durationMs: 360 })];
  const colors: Partial<Record<ChiknSpecialPreset, number>> = { wand: 0x9d71ff, energy: 0xffd84f, liquid: 0x5ddcff };
  const kind: ProceduralEffectKind = special.family === 'cast' ? 'burst' : special.family === 'tail' ? 'slash' : special.family;
  return [proceduralEffect(kind, 'release', origin, special.id, target, 'follow', undefined, { color: colors[preset] ?? 0x9d71ff })];
}

function cloneEffect(attachmentId: string, cueId: string, origin: EffectOrigin, id: string, target: EffectPoint, durationMs: number, arcHeight: number, rotationTurns: number): ResolvedChiknEffect {
  return proceduralEffect('projectile', cueId, origin, id, target, 'detached', { kind: 'arc', targetOffset: target, arcHeight, rotationTurns }, { durationMs, radius: 10, color: 0xffffff, visual: { kind: 'attachment-clone', attachmentId } });
}

function proceduralEffect(kind: ProceduralEffectKind, cueId: string, origin: EffectOrigin, id: string, target: EffectPoint, space: 'follow' | 'detached', trajectory?: EffectTrajectory, values: Partial<ProceduralEffectDescriptor> = {}): ResolvedChiknEffect {
  const colors: Record<ProceduralEffectKind, number> = { beam: 0xff355e, slash: 0xffdf70, projectile: 0xfff2b2, burst: 0x9d71ff, trail: 0x74d7ff };
  const actualTrajectory = trajectory ?? ((kind === 'projectile' || kind === 'trail' || kind === 'beam') ? { kind: 'linear' as const, targetOffset: target } : undefined);
  return {
    id,
    kind,
    cueId,
    socketId: origin.target === 'socket' ? origin.targetId : 'weapon',
    origin,
    space,
    ...(actualTrajectory ? { trajectory: actualTrajectory } : {}),
    visual: values.visual ?? { kind: 'procedural' },
    durationMs: values.durationMs ?? (kind === 'beam' ? 260 : kind === 'projectile' ? 480 : 300),
    color: values.color ?? colors[kind],
    secondaryColor: values.secondaryColor ?? 0xffffff,
    length: values.length ?? (kind === 'beam' ? Math.hypot(target.x, target.y) : 90),
    width: values.width ?? (kind === 'beam' ? 9 : 7),
    radius: values.radius ?? (kind === 'projectile' ? 10 : 18),
    distance: values.distance ?? Math.hypot(target.x, target.y),
  };
}

function specialFor(preset: ChiknSpecialPreset, groupId: string, attachmentId: string, category: string, offset: EffectPoint): NonNullable<ChiknTraitAnimationProfile['special']> {
  const names: Record<ChiknSpecialPreset, { suffix: string; label: string; family: 'beam' | 'projectile' | 'cast' | 'burst' | 'tail' }> = {
    egg: { suffix: 'egg', label: 'lay and launch', family: 'projectile' },
    laser: { suffix: 'laser', label: 'beam', family: 'beam' },
    flame: { suffix: 'flame', label: 'flame', family: 'burst' },
    sonic: { suffix: 'sonic', label: 'sonic pulse', family: 'burst' },
    disk: { suffix: 'disk', label: 'disk throw', family: 'projectile' },
    pan: { suffix: 'pan', label: 'pan throw', family: 'projectile' },
    wand: { suffix: 'cast', label: 'wand cast', family: 'cast' },
    energy: { suffix: 'energy', label: 'energy burst', family: 'cast' },
    liquid: { suffix: 'liquid', label: 'beaker splash', family: 'projectile' },
    exhaust: { suffix: 'exhaust', label: 'exhaust burst', family: 'burst' },
    'tail-stab': { suffix: 'tail', label: 'tail stab', family: 'tail' },
    'tail-sweep': { suffix: 'tail', label: 'tail sweep', family: 'tail' },
    'tail-snap': { suffix: 'tail', label: 'hydra snap', family: 'tail' },
    'tail-slam': { suffix: 'tail', label: 'tail slam', family: 'tail' },
  };
  const named = names[preset];
  const useAttachment = preset === 'egg' || preset === 'disk' || preset === 'pan' || preset === 'sonic' || preset === 'flame' || preset === 'wand' || preset === 'tail-stab' || preset === 'tail-sweep' || preset === 'tail-snap' || preset === 'tail-slam';
  const socketId = preset === 'laser' || (preset === 'energy' && category === 'Head') ? 'eyes' : preset === 'exhaust' ? 'tail' : category === 'Tail' ? 'tail' : 'weapon';
  return {
    id: `${groupId}:${named.suffix}`,
    label: `${displayName(groupId)} ${named.label}`,
    family: named.family,
    preset,
    origin: useAttachment ? { target: 'attachment', targetId: attachmentId, x: offset.x, y: offset.y } : socketOrigin(socketId, offset),
  };
}

function socketOrigin(targetId: string, offset: EffectPoint = { x: 0, y: 0 }): EffectOrigin { return { target: 'socket', targetId, x: offset.x, y: offset.y }; }
function attachmentOrigin(profile: ChiknTraitAnimationProfile): EffectOrigin { return { target: 'attachment', targetId: profile.attachmentTargets[0]!, x: profile.originOffset.x, y: profile.originOffset.y }; }

function normaliseTarget(value?: EffectPoint): EffectPoint {
  const target = value ?? DEFAULT_TARGET;
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) throw new Error('targetOffset must contain finite x and y values');
  return Object.freeze({ x: target.x, y: target.y });
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

function neutralTransform(definition: RigDefinitionV1, slotId: string) {
  const attachmentId = definition.defaultSkinId ? definition.skins?.[definition.defaultSkinId]?.[slotId] : undefined;
  const attachment = definition.attachments.find(({ id }) => id === attachmentId) ?? definition.attachments.find(({ slotId: candidate }) => candidate === slotId);
  const bone = definition.bones.find(({ id }) => id === attachment?.boneId);
  return { x: bone?.x ?? attachment?.x ?? 0, y: bone?.y ?? attachment?.y ?? 0, rotation: bone?.rotation ?? attachment?.rotation ?? 0, scaleX: bone?.scaleX ?? attachment?.scaleX ?? 1, scaleY: bone?.scaleY ?? attachment?.scaleY ?? 1 };
}

function neutralBoneTransform(definition: RigDefinitionV1, boneId: string) {
  const bone = definition.bones.find(({ id }) => id === boneId);
  if (!bone) throw new Error(`Unknown action bone: ${boneId}`);
  return { x: bone.x, y: bone.y, rotation: bone.rotation, scaleX: bone.scaleX, scaleY: bone.scaleY };
}

function neutralAttachmentTransform(definition: RigDefinitionV1, attachmentId: string) {
  const attachment = definition.attachments.find(({ id }) => id === attachmentId);
  if (!attachment) throw new Error(`Unknown profile attachment target: ${attachmentId}`);
  return { x: attachment.x ?? 0, y: attachment.y ?? 0, rotation: attachment.rotation ?? 0, scaleX: attachment.scaleX ?? 1, scaleY: attachment.scaleY ?? 1 };
}

function requiredClip(clips: ReadonlyMap<string, AnimationClipV1>, id: string): AnimationClipV1 {
  const clip = clips.get(id);
  if (!clip) throw new Error(`Unknown Chikn action clip: ${id}`);
  return clip;
}

function speciesOf(definition: RigDefinitionV1): 'chikn' | 'roostr' {
  if (definition.id !== 'chikn' && definition.id !== 'roostr') throw new Error(`Unsupported Chikn rig species: ${definition.id}`);
  return definition.id;
}

function displayName(groupId: string): string { return groupId.split('/').at(-1)!.split('-').map((word) => word ? word[0]!.toUpperCase() + word.slice(1) : '').join(' '); }
