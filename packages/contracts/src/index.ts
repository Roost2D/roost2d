/** A reference to a complete image asset or a named frame in an atlas. */
export interface TextureRef { assetId: string; frameId?: string; }

export interface TransformV1 {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  alpha?: number;
}

export interface RigBoneV1 {
  id: string;
  parentId?: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface AttachmentDefinitionV1 extends TransformV1 {
  id: string;
  slotId: string;
  texture: TextureRef;
  boneId?: string;
  zIndex: number;
  visible?: boolean;
  tint?: number;
}

export interface RigSlotV1 {
  id: string;
  boneId?: string;
  zIndex: number;
  defaultAttachmentId?: string;
}

export interface RigAttachmentGroupV1 {
  id: string;
  slotId: string;
  attachmentIds: string[];
  exclusive?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

export interface RigDefinitionV1 {
  schema: 'roost2d.rig/v1';
  id: string;
  displayName: string;
  bones: RigBoneV1[];
  slots: RigSlotV1[];
  attachments: AttachmentDefinitionV1[];
  skins?: Record<string, Record<string, string | undefined>>;
  defaultSkinId?: string;
  attachmentGroups?: Record<string, RigAttachmentGroupV1>;
  metadata?: Record<string, string | number | boolean>;
}

export interface AnimationKeyframeV1 extends TransformV1 {
  timeMs: number;
  durationMs?: number;
  ease?: string;
  visible?: boolean;
  tint?: number;
}

export interface AnimationTrackV1 {
  target: 'bone' | 'attachment' | 'slot';
  targetId: string;
  keyframes: AnimationKeyframeV1[];
}

export interface AnimationClipV1 {
  schema: 'roost2d.animation/v1';
  id: string;
  durationMs: number;
  loop?: boolean;
  fallbackClipId?: string;
  defaultLayer?: string;
  mask?: string[];
  tracks: AnimationTrackV1[];
}

export interface AtlasFrameV1 {
  x: number;
  y: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  offsetX?: number;
  offsetY?: number;
  rotated?: boolean;
  trimmed?: boolean;
}

export interface AtlasManifestV1 {
  schema: 'roost2d.atlas/v1';
  profile: string;
  image: string;
  integrity: AssetIntegrityV1;
  width: number;
  height: number;
  frames: Record<string, AtlasFrameV1>;
}

export type AssetProfileId = 'default' | 'high' | (string & {});
export type AssetKind = 'image' | 'atlas-frame' | 'json' | 'audio' | 'font' | (string & {});

export interface AssetIntegrityV1 {
  algorithm: 'sha256';
  /** SRI-compatible digest, exactly `sha256-` followed by a 32-byte Base64 digest. */
  value: string;
}

export interface AssetVariantV1 {
  profile: AssetProfileId;
  path: string;
  bytes: number;
  integrity: AssetIntegrityV1;
  width?: number;
  height?: number;
  scale: number;
  /** Present when this asset resolves to a rectangle inside an atlas image. */
  frameId?: string;
  frame?: AtlasFrameV1;
}

export type AssetLicense =
  | 'CHIKN-COMMUNITY-NONCOMMERCIAL'
  | 'Apache-2.0';

export interface ProtectedAssetRights {
  ownership: 'third-party-chikn-rights-holder';
  hostingAuthorized: boolean;
  communityUseAuthorized: boolean;
  sublicenseGrantedByRepository: false;
  commercialUse: 'separate-agreement-required';
}

export interface AssetFileV1 {
  id: string;
  kind?: AssetKind;
  mediaType: string;
  variants: AssetVariantV1[];
  aliases?: string[];
  attribution?: string;
  /** Generic packs may declare independently licensed replacement content. */
  license?: AssetLicense | (string & {});
  ownership?: ProtectedAssetRights['ownership'];
  hostingAuthorized?: boolean;
  communityUseAuthorized?: boolean;
  sublicenseGrantedByRepository?: false;
  commercialUse?: 'allowed' | 'separate-agreement-required' | 'prohibited' | (string & {});
  rightsIds?: string[];
}

export interface AssetBundleItemV1 {
  assetId: string;
  required: boolean;
  /** Optional items may fail independently without failing the bundle. */
  fallbackAssetId?: string;
}

export interface AssetBundleV1 {
  id: string;
  items: AssetBundleItemV1[];
  lazy: boolean;
  preload?: boolean;
  estimatedGpuBytes?: number;
}

export interface AssetManifestV1 {
  schema: 'roost2d.assets/v1';
  version: string;
  generatedAt: string;
  rightsDocumentSha256: string;
  profiles: Record<AssetProfileId, { maxAtlasSize: number; scale: number; gpuBudgetBytes: number }>;
  files: AssetFileV1[];
  bundles: AssetBundleV1[];
}

export interface RightsAssetV1 {
  id: string;
  sourcePath: string;
  category: string;
  series?: string;
  license: AssetLicense;
  commercialUse: 'allowed' | 'separate-agreement-required' | 'prohibited';
  attribution: string;
  approved?: boolean;
  sha256: string;
  ownership?: ProtectedAssetRights['ownership'];
  hostingAuthorized?: boolean;
  communityUseAuthorized?: boolean;
  sublicenseGrantedByRepository?: false;
  thirdPartyNotice?: string;
}

export interface RightsManifestV1 {
  schema: 'chikn-game-assets.rights/v1';
  version: string;
  generatedAt: string;
  assets: RightsAssetV1[];
  excludedPaths: string[];
}

const SRI_SHA256 = /^sha256-[A-Za-z0-9+/]{43}=$/;
const HEX_SHA256 = /^[a-f0-9]{64}$/i;

export function isSha256SRI(value: string): boolean { return SRI_SHA256.test(value); }

export function validateAssetManifest(manifest: AssetManifestV1): string[] {
  const errors: string[] = [];
  if (manifest.schema !== 'roost2d.assets/v1') errors.push('schema must be roost2d.assets/v1');
  if (!HEX_SHA256.test(manifest.rightsDocumentSha256)) errors.push('rightsDocumentSha256 must be a SHA-256 hex digest');
  if (!manifest.version) errors.push('version is required');
  const ids = new Set<string>();
  for (const file of manifest.files ?? []) {
    if (!file.id || ids.has(file.id)) errors.push(`duplicate or empty asset id: ${file.id}`);
    ids.add(file.id);
    for (const alias of file.aliases ?? []) {
      if (!alias || ids.has(alias)) errors.push(`duplicate or empty asset alias: ${alias}`);
      ids.add(alias);
    }
    if (!file.variants?.length) errors.push(`${file.id}: requires one or more variants`);
    if (file.license === 'CHIKN-COMMUNITY-NONCOMMERCIAL') {
      if (file.ownership !== 'third-party-chikn-rights-holder') errors.push(`${file.id}: protected ownership is required`);
      if (file.hostingAuthorized !== true || file.communityUseAuthorized !== true) errors.push(`${file.id}: protected hosting/community permission is required`);
      if (file.sublicenseGrantedByRepository !== false) errors.push(`${file.id}: repository sublicense must be false`);
      if (file.commercialUse !== 'separate-agreement-required') errors.push(`${file.id}: protected commercial boundary is required`);
    }
    for (const variant of file.variants ?? []) {
      if (variant.integrity?.algorithm !== 'sha256' || !isSha256SRI(variant.integrity.value)) errors.push(`${file.id}: invalid SHA-256 SRI value`);
      if (!Number.isInteger(variant.bytes) || variant.bytes < 0) errors.push(`${file.id}: invalid byte count`);
      if (!variant.path || /^(?:https?:)?\/\//.test(variant.path) || variant.path.startsWith('/')) errors.push(`${file.id}: paths must be relative`);
      if (!(variant.scale > 0)) errors.push(`${file.id}: variant scale must be positive`);
      if (variant.frame && [variant.frame.x, variant.frame.y, variant.frame.width, variant.frame.height].some((value) => !Number.isInteger(value) || value < 0)) errors.push(`${file.id}: invalid frame rectangle`);
    }
  }
  const bundleIds = new Set<string>();
  for (const bundle of manifest.bundles ?? []) {
    if (!bundle.id || bundleIds.has(bundle.id)) errors.push(`duplicate or empty bundle id: ${bundle.id}`);
    bundleIds.add(bundle.id);
    for (const item of bundle.items ?? []) {
      if (!ids.has(item.assetId)) errors.push(`${bundle.id}: unknown asset ${item.assetId}`);
      if (item.fallbackAssetId && !ids.has(item.fallbackAssetId)) errors.push(`${bundle.id}: unknown fallback ${item.fallbackAssetId}`);
    }
  }
  return errors;
}

export function validateAtlasManifest(atlas: AtlasManifestV1): string[] {
  const errors: string[] = [];
  if (atlas.schema !== 'roost2d.atlas/v1') errors.push('schema must be roost2d.atlas/v1');
  if (!atlas.image || /^(?:https?:)?\/\//.test(atlas.image)) errors.push('atlas image must be a relative path');
  if (!isSha256SRI(atlas.integrity?.value ?? '')) errors.push('atlas integrity must be SHA-256 SRI');
  if (!(atlas.width > 0 && atlas.height > 0)) errors.push('atlas dimensions must be positive');
  for (const [id, frame] of Object.entries(atlas.frames ?? {})) {
    if (!id) errors.push('atlas frame id cannot be empty');
    if (frame.x < 0 || frame.y < 0 || frame.width <= 0 || frame.height <= 0 || frame.x + frame.width > atlas.width || frame.y + frame.height > atlas.height) errors.push(`${id}: frame is outside atlas bounds`);
  }
  return errors;
}

export function validateRigDefinition(rig: RigDefinitionV1): string[] {
  const errors: string[] = [];
  if (rig.schema !== 'roost2d.rig/v1') errors.push('schema must be roost2d.rig/v1');
  const bones = uniqueIds(rig.bones, 'bone', errors);
  const slots = uniqueIds(rig.slots, 'slot', errors);
  const attachments = uniqueIds(rig.attachments, 'attachment', errors);
  for (const bone of rig.bones) if (bone.parentId && !bones.has(bone.parentId)) errors.push(`${bone.id}: unknown parent bone ${bone.parentId}`);
  for (const bone of rig.bones) {
    const visited = new Set([bone.id]); let parent = bone.parentId;
    while (parent) { if (visited.has(parent)) { errors.push(`${bone.id}: parent cycle`); break; } visited.add(parent); parent = rig.bones.find((item) => item.id === parent)?.parentId; }
  }
  for (const slot of rig.slots) {
    if (slot.boneId && !bones.has(slot.boneId)) errors.push(`${slot.id}: unknown bone ${slot.boneId}`);
    if (slot.defaultAttachmentId && !attachments.has(slot.defaultAttachmentId)) errors.push(`${slot.id}: unknown default attachment ${slot.defaultAttachmentId}`);
  }
  for (const attachment of rig.attachments) {
    if (!slots.has(attachment.slotId)) errors.push(`${attachment.id}: unknown slot ${attachment.slotId}`);
    if (attachment.boneId && !bones.has(attachment.boneId)) errors.push(`${attachment.id}: unknown bone ${attachment.boneId}`);
    if (!attachment.texture?.assetId) errors.push(`${attachment.id}: texture assetId is required`);
  }
  for (const [skinId, skin] of Object.entries(rig.skins ?? {})) for (const [slotId, attachmentId] of Object.entries(skin)) {
    if (!slots.has(slotId)) errors.push(`${skinId}: unknown slot ${slotId}`);
    if (attachmentId && !attachments.has(attachmentId)) errors.push(`${skinId}: unknown attachment ${attachmentId}`);
  }
  if (rig.defaultSkinId && !rig.skins?.[rig.defaultSkinId]) errors.push(`unknown default skin ${rig.defaultSkinId}`);
  for (const [groupId, group] of Object.entries(rig.attachmentGroups ?? {})) {
    if (group.id !== groupId) errors.push(`${groupId}: attachment group key/id mismatch`);
    if (!slots.has(group.slotId)) errors.push(`${groupId}: unknown slot ${group.slotId}`);
    for (const attachmentId of group.attachmentIds) if (!attachments.has(attachmentId)) errors.push(`${groupId}: unknown attachment ${attachmentId}`);
  }
  return errors;
}

export function validateAnimationClip(clip: AnimationClipV1, rig?: RigDefinitionV1): string[] {
  const errors: string[] = [];
  if (clip.schema !== 'roost2d.animation/v1') errors.push('schema must be roost2d.animation/v1');
  if (!(clip.durationMs > 0)) errors.push(`${clip.id}: durationMs must be positive`);
  const targetIds = rig ? {
    bone: new Set(rig.bones.map(({ id }) => id)),
    slot: new Set(rig.slots.map(({ id }) => id)),
    attachment: new Set(rig.attachments.map(({ id }) => id))
  } : undefined;
  for (const track of clip.tracks ?? []) {
    if (targetIds && !targetIds[track.target].has(track.targetId)) errors.push(`${clip.id}: unknown ${track.target} ${track.targetId}`);
    let previous = -1;
    for (const keyframe of track.keyframes) {
      if (keyframe.timeMs < previous || keyframe.timeMs < 0 || keyframe.timeMs > clip.durationMs) errors.push(`${clip.id}:${track.targetId}: invalid keyframe time ${keyframe.timeMs}`);
      if ((keyframe.durationMs ?? 0) < 0) errors.push(`${clip.id}:${track.targetId}: negative duration`);
      previous = keyframe.timeMs;
    }
  }
  return errors;
}

export function validateRightsManifest(manifest: RightsManifestV1): string[] {
  const errors: string[] = [];
  if (manifest.schema !== 'chikn-game-assets.rights/v1') errors.push('schema must be chikn-game-assets.rights/v1');
  const ids = new Set<string>(); const paths = new Set<string>();
  for (const asset of manifest.assets ?? []) {
    if (!asset.id || ids.has(asset.id)) errors.push(`duplicate or empty rights id: ${asset.id}`); ids.add(asset.id);
    if (!asset.sourcePath || paths.has(asset.sourcePath)) errors.push(`duplicate or empty source path: ${asset.sourcePath}`); paths.add(asset.sourcePath);
    if (!asset.license || !asset.attribution) errors.push(`${asset.id}: incomplete rights classification`);
    if (asset.license === 'Apache-2.0' && !asset.approved) errors.push(`${asset.id}: Apache project material is not approved`);
    if (asset.license === 'CHIKN-COMMUNITY-NONCOMMERCIAL') {
      if (asset.ownership !== 'third-party-chikn-rights-holder') errors.push(`${asset.id}: protected ownership is required`);
      if (asset.hostingAuthorized !== true || asset.communityUseAuthorized !== true) errors.push(`${asset.id}: protected hosting/community permission is required`);
      if (asset.sublicenseGrantedByRepository !== false) errors.push(`${asset.id}: repository sublicense must be false`);
      if (asset.commercialUse !== 'separate-agreement-required') errors.push(`${asset.id}: separate commercial agreement is required`);
    }
    if (!HEX_SHA256.test(asset.sha256)) errors.push(`${asset.id}: invalid source SHA-256`);
  }
  return errors;
}

function uniqueIds(values: Array<{ id: string }>, label: string, errors: string[]): Set<string> {
  const ids = new Set<string>();
  for (const value of values ?? []) { if (!value.id || ids.has(value.id)) errors.push(`duplicate or empty ${label} id: ${value.id}`); ids.add(value.id); }
  return ids;
}
