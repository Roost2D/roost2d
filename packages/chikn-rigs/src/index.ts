import type { AnimationClipV1, AttachmentDefinitionV1, RigAttachmentGroupV1, RigDefinitionV1 } from '@roost2d/contracts';

interface LegacyPart { name: string; texture?: string; parent?: string | null; x?: number; y?: number; rotation?: number; scale?: number; z_index?: number; pivot_x?: number; pivot_y?: number; }
interface LegacyTrait { slot: string; attachments: LegacyPart[]; replaces?: string[]; slot_z_index_overrides?: Record<string, number>; }
interface LegacyRig { skins?: Record<string, Record<string, LegacyPart>>; traits?: Record<string, Record<string, LegacyTrait>>; rig: LegacyPart[]; }
interface LegacyTween { target: string; at: number; properties: { x?: number; y?: number; rotation?: number; scale?: number; alpha?: number; duration?: number; ease?: string }; }
interface LegacyAnimations { animations: Record<string, { duration?: number; loop?: boolean; loopMode?: 'repeat' | 'ping-pong'; tweens?: LegacyTween[] }>; }

export const chiknRigMetadataUrl = new URL('./data/chikn-rig.json', import.meta.url);
export const roostrRigMetadataUrl = new URL('./data/roostr-rig.json', import.meta.url);
export const chiknAnimationMetadataUrl = new URL('./data/chikn-anims.json', import.meta.url);
export const roostrAnimationMetadataUrl = new URL('./data/roostr-anims.json', import.meta.url);

export type ChiknSpecies = 'chikn' | 'roostr';
export interface UniqueSkinDefinition { species: ChiknSpecies; token: number; skinId: string; bundleId: string; }

export const CHARACTER_RECIPE_SCHEMA = 'roost2d.chikn-character/v1' as const;
export interface CharacterRecipeV1 {
  schema: typeof CHARACTER_RECIPE_SCHEMA;
  species: ChiknSpecies;
  skinId: string;
  traitGroupIds: string[];
  animationId?: string;
  mirrored?: boolean;
  tint?: number;
  renderScale?: number;
}

export interface CharacterRecipeRuntime {
  applySkin(skinId: string): void;
  attachGroup(groupId: string): void;
  removeGroup(groupOrSlotId: string): boolean;
  setMirrored?(mirrored: boolean): void;
  setTint?(tint?: number): void;
  resetPose?(): void;
  stop?(layer?: string): void;
  play?(clipId: string, options?: { layer?: string }): unknown;
}

/** Source artwork to legacy rig-coordinate scale. Unique assembled skins are already rig-sized. */
export const CHIKN_RIG_ART_SCALE = { chikn: 0.1219, roostr: 0.0929 } as const;

/** Apache metadata only. Artwork remains resolved from the separately governed asset manifest. */
export const UNIQUE_SKINS: readonly UniqueSkinDefinition[] = [
  ['chikn', 1231, 'UniqueChiknCryptopunk1231'], ['chikn', 2138, 'UniqueChiknDirtybird2138'], ['chikn', 2757, 'UniqueChiknPepe2757'], ['chikn', 3604, 'UniqueChiknBayc3604'], ['chikn', 4386, 'UniqueChiknElon4386'], ['chikn', 6969, 'UniqueChiknDegen6969'], ['chikn', 8312, 'UniqueChiknSpace8312'], ['chikn', 9117, 'UniqueChiknSweatymeatchikn9117'], ['chikn', 10000, 'UniqueChiknKernel10000'],
  ['roostr', 1, 'UniqueRoostrLava1'], ['roostr', 2, 'UniqueRoostrGumball2'], ['roostr', 3, 'UniqueRoostrMutantblue3'], ['roostr', 4433, 'UniqueRoostrGunslinger4433'], ['roostr', 5524, 'UniqueRoostrRobot5524'], ['roostr', 5845, 'UniqueRoostrSplit5845'], ['roostr', 6282, 'UniqueRoostrHypnocoq6282'], ['roostr', 7467, 'UniqueRoostrCaptain7467'], ['roostr', 8375, 'UniqueRoostrMutantgreen8375'], ['roostr', 9130, 'UniqueRoostrBeast9130'], ['roostr', 10160, 'UniqueRoostrHypnocoq10160'], ['roostr', 11811, 'UniqueRoostrCutegravy11811']
].map(([species, token, skinId]) => ({ species: species as ChiknSpecies, token: token as number, skinId: skinId as string, bundleId: `${species}-unique` }));

export function resolveUniqueSkin(species: ChiknSpecies, token: number | string): UniqueSkinDefinition | undefined {
  const numericToken = typeof token === 'string' ? Number(token) : token;
  return UNIQUE_SKINS.find((entry) => entry.species === species && entry.token === numericToken);
}

export function uniqueAssetPrefix(unique: UniqueSkinDefinition): string { return `assembled-unique/${unique.species}/${assetToken(unique.skinId)}/`; }
export function uniqueAssetId(unique: UniqueSkinDefinition, slotId: string): string { return `${uniqueAssetPrefix(unique)}${assetToken(slotId)}`; }

/** Validates the portable recipe emitted by character builders before it mutates a live rig. */
export function validateCharacterRecipe(recipe: unknown, definition: RigDefinitionV1, clips: readonly AnimationClipV1[] = []): string[] {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return ['character recipe must be an object'];
  const value = recipe as Partial<CharacterRecipeV1>;
  const errors: string[] = [];
  if (value.schema !== CHARACTER_RECIPE_SCHEMA) errors.push(`schema must be ${CHARACTER_RECIPE_SCHEMA}`);
  if (value.species !== 'chikn' && value.species !== 'roostr') errors.push('species must be chikn or roostr');
  if (value.species && definition.id !== value.species) errors.push(`recipe species ${value.species} does not match rig ${definition.id}`);
  if (typeof value.skinId !== 'string' || !value.skinId || !definition.skins || !Object.hasOwn(definition.skins, value.skinId)) errors.push(`unknown skin ${String(value.skinId)}`);
  if (!Array.isArray(value.traitGroupIds)) errors.push('traitGroupIds must be an array');
  else {
    const occupiedSlots = new Set<string>();
    for (const groupId of value.traitGroupIds) {
      const group = typeof groupId === 'string' && definition.attachmentGroups && Object.hasOwn(definition.attachmentGroups, groupId)
        ? definition.attachmentGroups[groupId]
        : undefined;
      if (!group) { errors.push(`unknown trait group ${String(groupId)}`); continue; }
      if (occupiedSlots.has(group.slotId)) errors.push(`multiple trait groups target ${group.slotId}`);
      occupiedSlots.add(group.slotId);
    }
  }
  if (value.animationId !== undefined && (typeof value.animationId !== 'string' || !clips.some(({ id }) => id === value.animationId))) errors.push(`unknown animation ${String(value.animationId)}`);
  if (value.mirrored !== undefined && typeof value.mirrored !== 'boolean') errors.push('mirrored must be a boolean');
  if (value.tint !== undefined && (!Number.isInteger(value.tint) || value.tint < 0 || value.tint > 0xffffff)) errors.push('tint must be an integer colour');
  if (value.renderScale !== undefined && (!Number.isFinite(value.renderScale) || value.renderScale <= 0)) errors.push('renderScale must be a positive finite number');
  return errors;
}

/** Applies a validated recipe while clearing every previously selected trait category. */
export function applyCharacterRecipe(runtime: CharacterRecipeRuntime, recipe: CharacterRecipeV1, definition: RigDefinitionV1, clips: readonly AnimationClipV1[] = []): void {
  const errors = validateCharacterRecipe(recipe, definition, clips);
  if (errors.length) throw new Error(`Invalid character recipe:\n${errors.join('\n')}`);
  if (runtime.resetPose) runtime.resetPose();
  else runtime.stop?.('base');
  const traitSlots = new Set(Object.values(definition.attachmentGroups ?? {}).map((group) => group.slotId));
  for (const slotId of traitSlots) runtime.removeGroup(slotId);
  runtime.applySkin(recipe.skinId);
  for (const groupId of recipe.traitGroupIds) runtime.attachGroup(groupId);
  runtime.setMirrored?.(recipe.mirrored ?? false);
  runtime.setTint?.(recipe.tint);
  if (recipe.animationId && runtime.play) {
    runtime.play(recipe.animationId, { layer: 'base' });
  }
}

/**
 * Adds a unique skin to a converted base rig. The caller supplies the pack's logical asset IDs,
 * so this metadata package never embeds or guesses artwork paths. Standard slots replace their
 * base attachment; surplus atlas parts receive an auxiliary slot on the closest base transform.
 */
export function mergeUniqueSkin(base: RigDefinitionV1, unique: UniqueSkinDefinition, availableAssetIds: Iterable<string>): RigDefinitionV1 {
  const prefix = uniqueAssetPrefix(unique); const assetIds = [...availableAssetIds].filter((id) => id.startsWith(prefix)).sort();
  if (!assetIds.length) throw new Error(`No manifest assets found for ${unique.species} token ${unique.token}`);
  const attachments = [...base.attachments]; const slots = [...base.slots]; const skins = Object.fromEntries(Object.entries(base.skins ?? {}).map(([id, skin]) => [id, { ...skin }]));
  if (Object.hasOwn(skins, unique.skinId)) throw new Error(`Unique skin already merged: ${unique.skinId}`);
  const templateByToken = new Map(base.slots.map((slot) => [assetToken(slot.id), slot]));
  const compactTemplates = [...templateByToken.entries()]
    .map(([token, slot]) => [compactAssetToken(token), slot] as const)
    .sort(([left], [right]) => right.length - left.length);
  const templateAttachment = (slotId: string) => {
    const slot = base.slots.find((candidate) => candidate.id === slotId);
    const skinAttachmentId = base.defaultSkinId ? base.skins?.[base.defaultSkinId]?.[slotId] : undefined;
    return base.attachments.find(({ id }) => id === skinAttachmentId) ?? base.attachments.find(({ id }) => id === slot?.defaultAttachmentId) ?? base.attachments.find(({ slotId: candidate }) => candidate === slotId);
  };
  const skin: Record<string, string> = Object.create(null);
  for (const assetId of assetIds) {
    const token = assetId.slice(prefix.length);
    const compactToken = compactAssetToken(token);
    const standard = templateByToken.get(token) ?? compactTemplates.find(([candidate]) => compactToken.startsWith(candidate))?.[1];
    if (!standard) throw new Error(`Cannot map unique part ${assetId} to a base rig slot`);
    const template = templateAttachment(standard.id);
    if (!template) throw new Error(`Base rig has no attachment template for ${standard.id}`);
    const auxiliary = assetToken(standard.id) !== token;
    const slotId = auxiliary ? `unique:${unique.skinId}:${token}` : standard.id;
    if (auxiliary) slots.push({ id: slotId, boneId: template.boneId ?? standard.boneId, zIndex: template.zIndex });
    const attachmentId = `unique:${unique.species}:${unique.token}:${token}`;
    attachments.push({ ...template, id: attachmentId, slotId, texture: { assetId }, visible: false });
    skin[slotId] = attachmentId;
  }
  skins[unique.skinId] = skin;
  return { ...base, slots, attachments, skins, metadata: { ...base.metadata, uniqueSkinCount: UNIQUE_SKINS.length } };
}

export async function loadChiknRig(fetcher: typeof fetch = fetch): Promise<RigDefinitionV1> { return convertLegacyRig(await loadJson<LegacyRig>(chiknRigMetadataUrl, fetcher), 'chikn', 'Chikn'); }
export async function loadRoostrRig(fetcher: typeof fetch = fetch): Promise<RigDefinitionV1> { return convertLegacyRig(await loadJson<LegacyRig>(roostrRigMetadataUrl, fetcher), 'roostr', 'Roostr'); }
export async function loadChiknAnimations(fetcher: typeof fetch = fetch): Promise<AnimationClipV1[]> { return convertLegacyAnimations(await loadJson<LegacyAnimations>(chiknAnimationMetadataUrl, fetcher), 'chikn'); }
export async function loadRoostrAnimations(fetcher: typeof fetch = fetch): Promise<AnimationClipV1[]> { return convertLegacyAnimations(await loadJson<LegacyAnimations>(roostrAnimationMetadataUrl, fetcher), 'roostr'); }

export function convertLegacyRig(source: LegacyRig, id: string, displayName: string): RigDefinitionV1 {
  if (!source || !Array.isArray(source.rig)) throw new Error('Legacy rig source must provide a rig array');
  const layoutScale = id === 'chikn' || id === 'roostr' ? CHIKN_RIG_ART_SCALE[id] : undefined;
  const textureByAttachment = new Map<string, string>();
  const slotByAttachment = new Map<string, string>();
  const traitCategoryByAttachment = new Map<string, string>();
  // Null-prototype accumulators: source ids are untrusted strings, and `__proto__` as a plain-object
  // key reparents the container instead of adding an entry.
  const skins: Record<string, Record<string, string | undefined>> = Object.create(null);
  for (const [skinId, slots] of Object.entries(source.skins ?? {})) {
    const skin: Record<string, string | undefined> = Object.create(null);
    for (const [slotId, part] of Object.entries(slots)) {
      textureByAttachment.set(part.name, part.texture ?? part.name);
      slotByAttachment.set(part.name, slotId);
      skin[slotId] = part.name;
    }
    skins[skinId] = skin;
  }
  const attachmentGroups: Record<string, RigAttachmentGroupV1> = Object.create(null);
  for (const [traitGroupId, traitGroup] of Object.entries(source.traits ?? {})) for (const [traitId, trait] of Object.entries(traitGroup)) {
    for (const part of trait.attachments) {
      textureByAttachment.set(part.name, part.texture ?? part.name);
      slotByAttachment.set(part.name, trait.slot);
      traitCategoryByAttachment.set(part.name, traitGroupId);
    }
    const groupId = `${slug(traitGroupId)}/${slug(traitId)}`;
    const replacesSlotIds = trait.replaces ?? defaultReplacementSlots(traitGroupId);
    const slotZIndexOverrides = trait.slot_z_index_overrides ?? defaultSlotZIndexOverrides(traitGroupId);
    attachmentGroups[groupId] = {
      id: groupId,
      slotId: trait.slot,
      attachmentIds: trait.attachments.map(({ name }) => name),
      ...(replacesSlotIds?.length ? { replacesSlotIds } : {}),
      ...(slotZIndexOverrides ? { slotZIndexOverrides } : {}),
      exclusive: true,
      metadata: { category: traitGroupId, name: traitId }
    };
  }
  const partNames = new Set(source.rig.map((part) => part.name));
  const attachments: AttachmentDefinitionV1[] = source.rig.map((part, index) => ({
    id: part.name,
    slotId: slotByAttachment.get(part.name) ?? slotName(part.name),
    texture: { assetId: `${id}.rig.${assetToken(textureByAttachment.get(part.name) ?? part.name)}`, ...(layoutScale ? { layoutScale } : {}) },
    boneId: `bone:${part.name}`,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex: normalizedTraitZIndex(traitCategoryByAttachment.get(part.name), part.z_index ?? index),
    depthTarget: 'bone',
    visible: false,
    anchorX: part.pivot_x ?? 0.5,
    anchorY: part.pivot_y ?? 0.5
  }));
  const slots = [...new Map(attachments.map(({ id: attachmentId, slotId, zIndex }) => [slotId, { id: slotId, zIndex, defaultAttachmentId: attachmentId }])).values()];
  const slotIds = new Set(slots.map(({ id: slotId }) => slotId));
  const normalizedAttachmentGroups = Object.fromEntries(Object.entries(attachmentGroups).map(([groupId, group]) => {
    const replacesSlotIds = group.replacesSlotIds?.filter((slotId) => slotIds.has(slotId));
    return [groupId, { ...group, ...(replacesSlotIds?.length ? { replacesSlotIds } : { replacesSlotIds: undefined }) }];
  }));
  return {
    schema: 'roost2d.rig/v1', id, displayName,
    bones: [
      { id: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      ...source.rig.map((part) => {
        const followSlotId = traitFollowSlot(part.name);
        return {
          id: `bone:${part.name}`,
          ...(followSlotId ? { followSlotId } : { parentId: part.parent && partNames.has(part.parent) ? `bone:${part.parent}` : 'root' }),
          x: part.x ?? 0,
          y: part.y ?? 0,
          rotation: radians(part.rotation ?? 0),
          scaleX: part.scale ?? 1,
          scaleY: part.scale ?? 1
        };
      })
    ],
    slots,
    attachments,
    skins,
    defaultSkinId: Object.keys(skins)[0],
    attachmentGroups: normalizedAttachmentGroups,
    metadata: { sourceFormat: 'roostrift-rig-json', species: id }
  };
}

export function convertLegacyAnimations(source: LegacyAnimations, species: string): AnimationClipV1[] {
  if (!source || typeof source.animations !== 'object' || source.animations === null) throw new Error('Legacy animation source must provide an animations object');
  return Object.entries(source.animations).map(([id, animation]) => ({
    schema: 'roost2d.animation/v1', id: `${species}.${id}`, durationMs: (animation.duration ?? 1) * 1000,
    loop: animation.loop ?? false,
    ...(animation.loop === true && animation.loopMode ? { loopMode: animation.loopMode } : {}),
    // A Map, not a plain object: `slotName('__proto__')` as a key would otherwise hit Object.prototype.
    tracks: [...(animation.tweens ?? []).reduce((tracks, tween) => {
      const targetId = slotName(tween.target);
      const existing = tracks.get(targetId);
      if (existing) existing.push(tween); else tracks.set(targetId, [tween]);
      return tracks;
    }, new Map<string, LegacyTween[]>())].map(([targetId, tweens]) => ({
      target: 'slot' as const,
      targetId,
      // Keyframe times must be non-decreasing, and absent properties must stay absent.
      keyframes: [...tweens].sort((a, b) => a.at - b.at).map((tween) => ({
        timeMs: tween.at * 1000,
        durationMs: (tween.properties.duration ?? 0) * 1000,
        ...defined({ ease: tween.properties.ease, x: tween.properties.x, y: tween.properties.y, rotation: tween.properties.rotation === undefined ? undefined : radians(tween.properties.rotation), scaleX: tween.properties.scale, scaleY: tween.properties.scale, alpha: tween.properties.alpha })
      }))
    }))
  }));
}

function defined<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function assetToken(value: string): string { return value.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(); }
function compactAssetToken(value: string): string { return assetToken(value).replaceAll('-', ''); }
function slug(value: string): string { return value.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(); }
function slotName(value: string): string { return value.replace(/^[^_]+_/, '').replace(/([a-z])([AB])$/, '$1 $2'); }
function radians(degrees: number): number { return degrees * Math.PI / 180; }
function defaultReplacementSlots(category: string): string[] | undefined {
  if (slug(category) === 'tail') return ['Tail'];
  if (slug(category) === 'feet') return ['LegFoot A', 'LegFoot B'];
  return undefined;
}
function defaultSlotZIndexOverrides(category: string): Record<string, number> | undefined {
  return slug(category) === 'tail' ? { Tail: 6 } : undefined;
}
function normalizedTraitZIndex(category: string | undefined, zIndex: number): number {
  return category && slug(category) === 'torso' ? 10 : zIndex;
}
function traitFollowSlot(name: string): string | undefined {
  if (!name.startsWith('Trait_')) return undefined;
  const [, category, ...rest] = name.split('_');
  const suffix = rest.at(-1);
  if (category === 'Head' || category === 'Neck') return 'Head';
  if (category === 'Torso') return 'Torso';
  if (category === 'Tail') return 'Tail';
  if (category === 'Feet') return suffix === 'A' || suffix === 'B' ? `LegFoot ${suffix}` : 'LegFoot A';
  if (category === 'Wings') return suffix === 'A' || suffix === 'B' ? `Wing ${suffix}` : 'Wing A';
  return undefined;
}
async function loadJson<T>(url: URL, fetcher: typeof fetch): Promise<T> { const response = await fetcher.call(globalThis, url); if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`); return response.json() as Promise<T>; }
