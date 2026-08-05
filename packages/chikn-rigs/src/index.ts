import type { AnimationClipV1, AttachmentDefinitionV1, RigAttachmentGroupV1, RigDefinitionV1 } from '@roost2d/contracts';

interface LegacyPart { name: string; texture?: string; parent?: string | null; x?: number; y?: number; rotation?: number; scale?: number; z_index?: number; }
interface LegacyRig { skins?: Record<string, Record<string, LegacyPart>>; traits?: Record<string, Record<string, { slot: string; attachments: LegacyPart[] }>>; rig: LegacyPart[]; }
interface LegacyTween { target: string; at: number; properties: { x?: number; y?: number; rotation?: number; scale?: number; alpha?: number; duration?: number; ease?: string }; }
interface LegacyAnimations { animations: Record<string, { duration?: number; loop?: boolean; tweens?: LegacyTween[] }>; }

export const chiknRigMetadataUrl = new URL('./data/chikn-rig.json', import.meta.url);
export const roostrRigMetadataUrl = new URL('./data/roostr-rig.json', import.meta.url);
export const chiknAnimationMetadataUrl = new URL('./data/chikn-anims.json', import.meta.url);
export const roostrAnimationMetadataUrl = new URL('./data/roostr-anims.json', import.meta.url);

export async function loadChiknRig(fetcher: typeof fetch = fetch): Promise<RigDefinitionV1> { return convertLegacyRig(await loadJson<LegacyRig>(chiknRigMetadataUrl, fetcher), 'chikn', 'Chikn'); }
export async function loadRoostrRig(fetcher: typeof fetch = fetch): Promise<RigDefinitionV1> { return convertLegacyRig(await loadJson<LegacyRig>(roostrRigMetadataUrl, fetcher), 'roostr', 'Roostr'); }
export async function loadChiknAnimations(fetcher: typeof fetch = fetch): Promise<AnimationClipV1[]> { return convertLegacyAnimations(await loadJson<LegacyAnimations>(chiknAnimationMetadataUrl, fetcher), 'chikn'); }
export async function loadRoostrAnimations(fetcher: typeof fetch = fetch): Promise<AnimationClipV1[]> { return convertLegacyAnimations(await loadJson<LegacyAnimations>(roostrAnimationMetadataUrl, fetcher), 'roostr'); }

export function convertLegacyRig(source: LegacyRig, id: string, displayName: string): RigDefinitionV1 {
  if (!source || !Array.isArray(source.rig)) throw new Error('Legacy rig source must provide a rig array');
  const textureByAttachment = new Map<string, string>();
  const slotByAttachment = new Map<string, string>();
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
    for (const part of trait.attachments) { textureByAttachment.set(part.name, part.texture ?? part.name); slotByAttachment.set(part.name, trait.slot); }
    const groupId = `${slug(traitGroupId)}/${slug(traitId)}`;
    attachmentGroups[groupId] = { id: groupId, slotId: trait.slot, attachmentIds: trait.attachments.map(({ name }) => name), exclusive: true, metadata: { category: traitGroupId, name: traitId } };
  }
  const partNames = new Set(source.rig.map((part) => part.name));
  const attachments: AttachmentDefinitionV1[] = source.rig.map((part, index) => ({
    id: part.name,
    slotId: slotByAttachment.get(part.name) ?? slotName(part.name),
    texture: { assetId: `${id}.rig.${assetToken(textureByAttachment.get(part.name) ?? part.name)}` },
    boneId: `bone:${part.name}`,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex: part.z_index ?? index,
    visible: false
  }));
  return {
    schema: 'roost2d.rig/v1', id, displayName,
    bones: [
      { id: 'root', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      ...source.rig.map((part) => ({ id: `bone:${part.name}`, parentId: part.parent && partNames.has(part.parent) ? `bone:${part.parent}` : 'root', x: part.x ?? 0, y: part.y ?? 0, rotation: part.rotation ?? 0, scaleX: part.scale ?? 1, scaleY: part.scale ?? 1 }))
    ],
    slots: [...new Map(attachments.map(({ id: attachmentId, slotId, zIndex }) => [slotId, { id: slotId, zIndex, defaultAttachmentId: attachmentId }])).values()],
    attachments,
    skins,
    defaultSkinId: Object.keys(skins)[0],
    attachmentGroups,
    metadata: { sourceFormat: 'roostrift-rig-json', species: id }
  };
}

export function convertLegacyAnimations(source: LegacyAnimations, species: string): AnimationClipV1[] {
  if (!source || typeof source.animations !== 'object' || source.animations === null) throw new Error('Legacy animation source must provide an animations object');
  return Object.entries(source.animations).map(([id, animation]) => ({
    schema: 'roost2d.animation/v1', id: `${species}.${id}`, durationMs: (animation.duration ?? 1) * 1000, loop: animation.loop ?? true,
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
        ...defined({ ease: tween.properties.ease, x: tween.properties.x, y: tween.properties.y, rotation: tween.properties.rotation, scaleX: tween.properties.scale, scaleY: tween.properties.scale, alpha: tween.properties.alpha })
      }))
    }))
  }));
}

function defined<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function assetToken(value: string): string { return value.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(); }
function slug(value: string): string { return value.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(); }
function slotName(value: string): string { return value.replace(/^[^_]+_/, '').replace(/([a-z])([AB])$/, '$1 $2'); }
async function loadJson<T>(url: URL, fetcher: typeof fetch): Promise<T> { const response = await fetcher(url); if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`); return response.json() as Promise<T>; }
