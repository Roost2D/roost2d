/** A reference to a complete image asset or a named frame in an atlas. */
export interface TextureRef {
  assetId: string;
  frameId?: string;
  /** Display size in rig/layout coordinates without changing the sampled source pixels. */
  layoutScale?: number;
}

export interface TransformV1 {
  x?: number;
  y?: number;
  /** Rotation in radians. */
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  alpha?: number;
}

export interface RigBoneV1 {
  id: string;
  parentId?: string;
  /**
   * Reparents this bone to the active attachment transform in a slot. A follower cannot also
   * declare a static parent: its parent is resolved whenever the active skin changes.
   */
  followSlotId?: string;
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
  /** Whether legacy depth belongs to the attachment display or its transform bone. */
  depthTarget?: 'attachment' | 'bone';
  visible?: boolean;
  tint?: number;
  /** Normalized texture anchor, where 0 is left/top and 1 is right/bottom. */
  anchorX?: number;
  anchorY?: number;
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
  /** Base slots hidden while this group is active. The hidden bones remain animation targets. */
  replacesSlotIds?: string[];
  /** Temporary base-slot transform depths used while this group is active. */
  slotZIndexOverrides?: Record<string, number>;
  exclusive?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

/** A named presentation origin which follows a rig target. */
export interface RigSocketV1 extends TransformV1 {
  id: string;
  target: 'bone' | 'attachment' | 'slot';
  targetId: string;
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
  /** Optional origins for projectiles, beams, trails, and other presentation effects. */
  sockets?: RigSocketV1[];
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

export type AnimationCuePhase = 'anticipation' | 'contact' | 'release' | 'recovery' | 'complete';

/** A presentation-only event on an animation timeline. It never implies a gameplay hit. */
export interface AnimationCueV1 {
  id: string;
  timeMs: number;
  phase?: AnimationCuePhase;
  data?: Record<string, string | number | boolean>;
}

export interface AnimationClipV1 {
  schema: 'roost2d.animation/v1';
  id: string;
  durationMs: number;
  loop?: boolean;
  loopMode?: 'repeat' | 'ping-pong';
  fallbackClipId?: string;
  defaultLayer?: string;
  mask?: string[];
  cues?: AnimationCueV1[];
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
/** Percent-encoded `.`, `/`, and `\`, which a decoding origin server can turn back into separators. */
const ENCODED_SEPARATOR = /%(?:2e|2f|5c)/i;
const CONTAINMENT_BASE = 'https://roost2d.invalid/root/';

/** The only properties an animation keyframe may carry besides `timeMs`, `durationMs`, and `ease`. */
export const ANIMATION_KEYFRAME_KEYS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'alpha', 'visible', 'tint'] as const;
export type AnimationKeyframeKey = (typeof ANIMATION_KEYFRAME_KEYS)[number];
/** Exactly the animatable properties of `AnimationKeyframeV1`, each already type-checked. */
export interface AnimationKeyframeValues { x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number; alpha?: number; visible?: boolean; tint?: number; }

const KEYFRAME_VALUE_KEYS: ReadonlySet<string> = new Set<string>(ANIMATION_KEYFRAME_KEYS);
const KEYFRAME_TIMING_KEYS: ReadonlySet<string> = new Set(['timeMs', 'durationMs', 'ease']);
const TRANSFORM_KEYS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'alpha'] as const;

export function isSha256SRI(value: unknown): boolean { return typeof value === 'string' && SRI_SHA256.test(value); }

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function isNonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function isTint(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffffff; }

/** C0 controls, DEL, and backslash. The URL parser silently strips the first group and rewrites the last. */
function hasDisallowedCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

/**
 * True when `path` is a relative, normalized, single-origin path that cannot escape the directory it
 * resolves against. Rejects schemes (including `HTTPS:` and `data:`), authorities, dot and empty
 * segments, percent-encoded separators, control characters, and query/fragment-only values. A plain
 * containment test on `href` is not sufficient: `?x=1`, `#frag`, `.`, and `..%2f..%2f` all pass one.
 */
export function isContainedRelativePath(path: unknown): boolean {
  if (!isNonEmptyString(path) || path !== path.trim()) return false;
  if (hasDisallowedCharacter(path) || ENCODED_SEPARATOR.test(path)) return false;
  if (path.startsWith('?') || path.startsWith('#') || path.includes(':')) return false;
  if (path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return false;
  const base = new URL(CONTAINMENT_BASE);
  let resolved: URL;
  try { resolved = new URL(path, base); } catch { return false; }
  return resolved.origin === base.origin
    && resolved.pathname.startsWith(base.pathname)
    && resolved.pathname.length > base.pathname.length
    && !resolved.search && !resolved.hash;
}

/** Returns the entries when `value` is an array of objects, or `undefined` so callers stop early. */
function readEntries(value: unknown, label: string, errors: string[]): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) { errors.push(`${label} must be an array`); return undefined; }
  const entries: Record<string, unknown>[] = [];
  let malformed = false;
  for (let index = 0; index < value.length; index += 1) {
    const entry: unknown = value[index];
    if (!isRecord(entry)) { errors.push(`${label}[${index}] must be an object`); malformed = true; continue; }
    entries.push(entry);
  }
  return malformed ? undefined : entries;
}

/** Returns the record when `value` is an absent or plain object, or `undefined` so callers stop early. */
function readRecord(value: unknown, label: string, errors: string[]): Record<string, unknown> | undefined {
  if (value === undefined) return {};
  if (!isRecord(value)) { errors.push(`${label} must be an object`); return undefined; }
  return value;
}

function transformErrors(value: Record<string, unknown>, label: string): string[] {
  const errors: string[] = [];
  for (const key of TRANSFORM_KEYS) if (value[key] !== undefined && !isFiniteNumber(value[key])) errors.push(`${label}: ${key} must be a finite number`);
  return errors;
}

function uniqueIds(values: readonly Record<string, unknown>[], label: string, errors: string[]): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (!isNonEmptyString(value.id) || ids.has(value.id)) errors.push(`duplicate or empty ${label} id: ${String(value.id)}`);
    else ids.add(value.id);
  }
  return ids;
}

function validateAssetProfiles(profiles: unknown): string[] {
  if (!isRecord(profiles)) return ['profiles must be an object'];
  const entries = Object.entries(profiles);
  if (!entries.length) return ['profiles must declare at least one profile'];
  const errors: string[] = [];
  for (const [id, profile] of entries) {
    if (!isRecord(profile)) { errors.push(`${id}: profile must be an object`); continue; }
    for (const key of ['maxAtlasSize', 'scale', 'gpuBudgetBytes'] as const) {
      const value = profile[key];
      if (!isFiniteNumber(value) || value <= 0) errors.push(`${id}: profile ${key} must be a positive number`);
    }
  }
  return errors;
}

function protectedRightsErrors(value: Record<string, unknown>, label: string): string[] {
  const errors: string[] = [];
  if (value.ownership !== 'third-party-chikn-rights-holder') errors.push(`${label}: protected ownership is required`);
  if (value.hostingAuthorized !== true || value.communityUseAuthorized !== true) errors.push(`${label}: protected hosting/community permission is required`);
  if (value.sublicenseGrantedByRepository !== false) errors.push(`${label}: repository sublicense must be false`);
  return errors;
}

export function validateAssetManifest(manifest: unknown): string[] {
  if (!isRecord(manifest)) return ['asset manifest must be an object'];
  const errors: string[] = [];
  if (manifest.schema !== 'roost2d.assets/v1') errors.push('schema must be roost2d.assets/v1');
  if (typeof manifest.rightsDocumentSha256 !== 'string' || !HEX_SHA256.test(manifest.rightsDocumentSha256)) errors.push('rightsDocumentSha256 must be a SHA-256 hex digest');
  if (!isNonEmptyString(manifest.version)) errors.push('version is required');
  errors.push(...validateAssetProfiles(manifest.profiles));

  const files = readEntries(manifest.files, 'files', errors);
  const ids = new Set<string>();
  for (const [index, file] of (files ?? []).entries()) {
    const label = isNonEmptyString(file.id) ? file.id : `files[${index}]`;
    if (!isNonEmptyString(file.id) || ids.has(file.id)) errors.push(`duplicate or empty asset id: ${String(file.id)}`);
    else ids.add(file.id);
    if (!isNonEmptyString(file.mediaType)) errors.push(`${label}: mediaType is required`);
    if (file.aliases !== undefined) {
      if (!Array.isArray(file.aliases)) errors.push(`${label}: aliases must be an array`);
      else for (const alias of file.aliases as unknown[]) {
        if (!isNonEmptyString(alias) || ids.has(alias)) errors.push(`duplicate or empty asset alias: ${String(alias)}`);
        else ids.add(alias);
      }
    }
    if (file.license === 'CHIKN-COMMUNITY-NONCOMMERCIAL') {
      errors.push(...protectedRightsErrors(file, label));
      if (file.commercialUse !== 'separate-agreement-required') errors.push(`${label}: protected commercial boundary is required`);
    }
    const variants = readEntries(file.variants, `${label}.variants`, errors);
    if (variants && !variants.length) errors.push(`${label}: requires one or more variants`);
    for (const variant of variants ?? []) {
      const integrity = variant.integrity;
      if (!isRecord(integrity) || integrity.algorithm !== 'sha256' || !isSha256SRI(integrity.value)) errors.push(`${label}: invalid SHA-256 SRI value`);
      if (!Number.isInteger(variant.bytes) || (variant.bytes as number) < 0) errors.push(`${label}: invalid byte count`);
      if (!isContainedRelativePath(variant.path)) errors.push(`${label}: paths must be relative, normalized, and contained`);
      if (!isNonEmptyString(variant.profile)) errors.push(`${label}: variant profile is required`);
      if (!isFiniteNumber(variant.scale) || !(variant.scale > 0)) errors.push(`${label}: variant scale must be positive`);
      if (variant.frameId !== undefined && !isNonEmptyString(variant.frameId)) errors.push(`${label}: variant frameId must be a string`);
      if (variant.frame !== undefined) {
        const frame = variant.frame;
        if (!isRecord(frame) || [frame.x, frame.y, frame.width, frame.height].some((value) => !Number.isInteger(value) || (value as number) < 0)) errors.push(`${label}: invalid frame rectangle`);
      }
    }
  }

  const bundles = readEntries(manifest.bundles, 'bundles', errors);
  const bundleIds = new Set<string>();
  for (const [index, bundle] of (bundles ?? []).entries()) {
    const label = isNonEmptyString(bundle.id) ? bundle.id : `bundles[${index}]`;
    if (!isNonEmptyString(bundle.id) || bundleIds.has(bundle.id)) errors.push(`duplicate or empty bundle id: ${String(bundle.id)}`);
    else bundleIds.add(bundle.id);
    if (typeof bundle.lazy !== 'boolean') errors.push(`${label}: lazy must be a boolean`);
    const items = readEntries(bundle.items, `${label}.items`, errors);
    for (const item of items ?? []) {
      if (typeof item.required !== 'boolean') errors.push(`${label}: item required must be a boolean`);
      if (!isNonEmptyString(item.assetId)) { errors.push(`${label}: item assetId is required`); continue; }
      // Cross-checking ids is only meaningful when the file list itself parsed.
      if (files && !ids.has(item.assetId)) errors.push(`${label}: unknown asset ${item.assetId}`);
      if (item.fallbackAssetId === undefined) continue;
      if (!isNonEmptyString(item.fallbackAssetId)) errors.push(`${label}: fallbackAssetId must be a string`);
      else if (files && !ids.has(item.fallbackAssetId)) errors.push(`${label}: unknown fallback ${item.fallbackAssetId}`);
    }
  }
  return errors;
}

export function validateAtlasManifest(atlas: unknown): string[] {
  if (!isRecord(atlas)) return ['atlas manifest must be an object'];
  const errors: string[] = [];
  if (atlas.schema !== 'roost2d.atlas/v1') errors.push('schema must be roost2d.atlas/v1');
  if (!isNonEmptyString(atlas.profile)) errors.push('atlas profile is required');
  if (!isContainedRelativePath(atlas.image)) errors.push('atlas image must be a relative path');
  const integrity = atlas.integrity;
  if (!isRecord(integrity) || integrity.algorithm !== 'sha256' || !isSha256SRI(integrity.value)) errors.push('atlas integrity must be SHA-256 SRI');

  const width = isFiniteNumber(atlas.width) && atlas.width > 0 ? atlas.width : undefined;
  const height = isFiniteNumber(atlas.height) && atlas.height > 0 ? atlas.height : undefined;
  if (width === undefined || height === undefined) errors.push('atlas dimensions must be positive');

  const frames = readRecord(atlas.frames, 'atlas frames', errors);
  for (const [id, frame] of Object.entries(frames ?? {})) {
    if (!id) { errors.push('atlas frame id cannot be empty'); continue; }
    if (!isRecord(frame)) { errors.push(`${id}: frame must be an object`); continue; }
    const { x, y, width: frameWidth, height: frameHeight } = frame;
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(frameWidth) || !isFiniteNumber(frameHeight)) { errors.push(`${id}: frame rectangle must be numeric`); continue; }
    if (width === undefined || height === undefined) continue;
    if (x < 0 || y < 0 || frameWidth <= 0 || frameHeight <= 0 || x + frameWidth > width || y + frameHeight > height) errors.push(`${id}: frame is outside atlas bounds`);
  }
  return errors;
}

export function validateRigDefinition(rig: unknown): string[] {
  if (!isRecord(rig)) return ['rig definition must be an object'];
  const errors: string[] = [];
  if (rig.schema !== 'roost2d.rig/v1') errors.push('schema must be roost2d.rig/v1');
  if (!isNonEmptyString(rig.id)) errors.push('rig id is required');

  const boneEntries = readEntries(rig.bones, 'bones', errors);
  const slotEntries = readEntries(rig.slots, 'slots', errors);
  const attachmentEntries = readEntries(rig.attachments, 'attachments', errors);
  if (!boneEntries || !slotEntries || !attachmentEntries) return errors;

  const bones = uniqueIds(boneEntries, 'bone', errors);
  const slots = uniqueIds(slotEntries, 'slot', errors);
  const attachments = uniqueIds(attachmentEntries, 'attachment', errors);

  const parentById = new Map<string, string | undefined>();
  for (const bone of boneEntries) {
    const label = isNonEmptyString(bone.id) ? bone.id : 'bone';
    for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY'] as const) if (!isFiniteNumber(bone[key])) errors.push(`${label}: bone ${key} must be a finite number`);
    if (bone.parentId !== undefined && !isNonEmptyString(bone.parentId)) { errors.push(`${label}: parentId must be a string`); continue; }
    if (bone.followSlotId !== undefined && !isNonEmptyString(bone.followSlotId)) errors.push(`${label}: followSlotId must be a string`);
    if (bone.parentId !== undefined && bone.followSlotId !== undefined) errors.push(`${label}: parentId and followSlotId are mutually exclusive`);
    if (isNonEmptyString(bone.parentId) && !bones.has(bone.parentId)) errors.push(`${label}: unknown parent bone ${bone.parentId}`);
    if (isNonEmptyString(bone.id)) parentById.set(bone.id, isNonEmptyString(bone.parentId) ? bone.parentId : undefined);
  }
  for (const [id, parent] of parentById) {
    const visited = new Set([id]);
    let current = parent;
    while (current) { if (visited.has(current)) { errors.push(`${id}: parent cycle`); break; } visited.add(current); current = parentById.get(current); }
  }

  for (const slot of slotEntries) {
    const label = isNonEmptyString(slot.id) ? slot.id : 'slot';
    if (!isFiniteNumber(slot.zIndex)) errors.push(`${label}: slot zIndex must be a finite number`);
    if (slot.boneId !== undefined && (!isNonEmptyString(slot.boneId) || !bones.has(slot.boneId))) errors.push(`${label}: unknown bone ${String(slot.boneId)}`);
    if (slot.defaultAttachmentId !== undefined && (!isNonEmptyString(slot.defaultAttachmentId) || !attachments.has(slot.defaultAttachmentId))) errors.push(`${label}: unknown default attachment ${String(slot.defaultAttachmentId)}`);
  }

  for (const bone of boneEntries) {
    const label = isNonEmptyString(bone.id) ? bone.id : 'bone';
    if (bone.followSlotId !== undefined && (!isNonEmptyString(bone.followSlotId) || !slots.has(bone.followSlotId))) errors.push(`${label}: unknown follow slot ${String(bone.followSlotId)}`);
  }

  for (const attachment of attachmentEntries) {
    const label = isNonEmptyString(attachment.id) ? attachment.id : 'attachment';
    if (!isNonEmptyString(attachment.slotId) || !slots.has(attachment.slotId)) errors.push(`${label}: unknown slot ${String(attachment.slotId)}`);
    if (attachment.boneId !== undefined && (!isNonEmptyString(attachment.boneId) || !bones.has(attachment.boneId))) errors.push(`${label}: unknown bone ${String(attachment.boneId)}`);
    const texture = attachment.texture;
    if (!isRecord(texture) || !isNonEmptyString(texture.assetId)) errors.push(`${label}: texture assetId is required`);
    else {
      if (texture.frameId !== undefined && !isNonEmptyString(texture.frameId)) errors.push(`${label}: texture frameId must be a string`);
      if (texture.layoutScale !== undefined && (!isFiniteNumber(texture.layoutScale) || texture.layoutScale <= 0)) errors.push(`${label}: texture layoutScale must be a positive finite number`);
    }
    if (!isFiniteNumber(attachment.zIndex)) errors.push(`${label}: attachment zIndex must be a finite number`);
    if (attachment.depthTarget !== undefined && attachment.depthTarget !== 'attachment' && attachment.depthTarget !== 'bone') errors.push(`${label}: depthTarget must be attachment or bone`);
    if (attachment.depthTarget === 'bone' && !isNonEmptyString(attachment.boneId)) errors.push(`${label}: bone depthTarget requires boneId`);
    if (attachment.visible !== undefined && typeof attachment.visible !== 'boolean') errors.push(`${label}: visible must be a boolean`);
    if (attachment.tint !== undefined && !isTint(attachment.tint)) errors.push(`${label}: tint must be an integer colour`);
    for (const key of ['anchorX', 'anchorY'] as const) if (attachment[key] !== undefined && (!isFiniteNumber(attachment[key]) || attachment[key] < 0 || attachment[key] > 1)) errors.push(`${label}: ${key} must be a number in [0, 1]`);
    errors.push(...transformErrors(attachment, label));
  }

  const skins = readRecord(rig.skins, 'skins', errors);
  for (const [skinId, skin] of Object.entries(skins ?? {})) {
    if (!isRecord(skin)) { errors.push(`${skinId}: skin must be an object`); continue; }
    for (const [slotId, attachmentId] of Object.entries(skin)) {
      if (!slots.has(slotId)) errors.push(`${skinId}: unknown slot ${slotId}`);
      if (attachmentId !== undefined && (!isNonEmptyString(attachmentId) || !attachments.has(attachmentId))) errors.push(`${skinId}: unknown attachment ${String(attachmentId)}`);
    }
  }
  // `Object.hasOwn` so a `defaultSkinId` of `toString` cannot resolve through the prototype.
  if (rig.defaultSkinId !== undefined && (!isNonEmptyString(rig.defaultSkinId) || !skins || !Object.hasOwn(skins, rig.defaultSkinId))) errors.push(`unknown default skin ${String(rig.defaultSkinId)}`);

  const groups = readRecord(rig.attachmentGroups, 'attachmentGroups', errors);
  for (const [groupId, group] of Object.entries(groups ?? {})) {
    if (!isRecord(group)) { errors.push(`${groupId}: attachment group must be an object`); continue; }
    if (group.id !== groupId) errors.push(`${groupId}: attachment group key/id mismatch`);
    if (!isNonEmptyString(group.slotId) || !slots.has(group.slotId)) errors.push(`${groupId}: unknown slot ${String(group.slotId)}`);
    if (!Array.isArray(group.attachmentIds)) { errors.push(`${groupId}: attachmentIds must be an array`); continue; }
    for (const attachmentId of group.attachmentIds as unknown[]) if (!isNonEmptyString(attachmentId) || !attachments.has(attachmentId)) errors.push(`${groupId}: unknown attachment ${String(attachmentId)}`);
    if (group.replacesSlotIds !== undefined) {
      if (!Array.isArray(group.replacesSlotIds)) errors.push(`${groupId}: replacesSlotIds must be an array`);
      else for (const slotId of group.replacesSlotIds as unknown[]) if (!isNonEmptyString(slotId) || !slots.has(slotId)) errors.push(`${groupId}: unknown replacement slot ${String(slotId)}`);
    }
    if (group.slotZIndexOverrides !== undefined) {
      if (!isRecord(group.slotZIndexOverrides)) errors.push(`${groupId}: slotZIndexOverrides must be an object`);
      else for (const [slotId, zIndex] of Object.entries(group.slotZIndexOverrides)) {
        if (!slots.has(slotId)) errors.push(`${groupId}: unknown depth override slot ${slotId}`);
        if (!isFiniteNumber(zIndex)) errors.push(`${groupId}: depth override for ${slotId} must be finite`);
      }
    }
  }

  const socketEntries = rig.sockets === undefined ? [] : readEntries(rig.sockets, 'sockets', errors);
  const socketIds = new Set<string>();
  for (const socket of socketEntries ?? []) {
    const label = isNonEmptyString(socket.id) ? socket.id : 'socket';
    if (!isNonEmptyString(socket.id) || socketIds.has(socket.id)) errors.push(`duplicate or empty socket id: ${String(socket.id)}`);
    else socketIds.add(socket.id);
    if (socket.target !== 'bone' && socket.target !== 'attachment' && socket.target !== 'slot') errors.push(`${label}: unknown socket target ${String(socket.target)}`);
    if (!isNonEmptyString(socket.targetId)) errors.push(`${label}: socket targetId is required`);
    else if (socket.target === 'bone' && !bones.has(socket.targetId)) errors.push(`${label}: unknown bone ${socket.targetId}`);
    else if (socket.target === 'attachment' && !attachments.has(socket.targetId)) errors.push(`${label}: unknown attachment ${socket.targetId}`);
    else if (socket.target === 'slot' && !slots.has(socket.targetId)) errors.push(`${label}: unknown slot ${socket.targetId}`);
    errors.push(...transformErrors(socket, label));
  }
  return errors;
}

function rigTargetIds(rig: unknown): Record<'bone' | 'slot' | 'attachment', Set<string>> | undefined {
  if (!isRecord(rig)) return undefined;
  const collect = (value: unknown): Set<string> => {
    const ids = new Set<string>();
    if (Array.isArray(value)) for (const entry of value as unknown[]) if (isRecord(entry) && isNonEmptyString(entry.id)) ids.add(entry.id);
    return ids;
  };
  return { bone: collect(rig.bones), slot: collect(rig.slots), attachment: collect(rig.attachments) };
}

function keyframeValueErrors(keyframe: Record<string, unknown>, label: string): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(keyframe)) {
    if (KEYFRAME_TIMING_KEYS.has(key)) continue;
    if (!KEYFRAME_VALUE_KEYS.has(key)) { errors.push(`${label}: unsupported keyframe property ${key}`); continue; }
    const value = keyframe[key];
    if (value === undefined) continue; // Every value key is optional; an explicit `undefined` is absence.
    if (key === 'visible') { if (typeof value !== 'boolean') errors.push(`${label}: visible must be a boolean`); continue; }
    if (key === 'tint') { if (!isTint(value)) errors.push(`${label}: tint must be an integer colour`); continue; }
    if (!isFiniteNumber(value)) errors.push(`${label}: ${key} must be a finite number`);
  }
  return errors;
}

/**
 * Copies only the contract's animation properties out of a keyframe. Consumers must build tween
 * targets from this rather than spreading the keyframe, so an unvalidated clip cannot reach
 * animation-library internals or write `__proto__` on a display node.
 */
export function pickAnimationKeyframeValues(keyframe: AnimationKeyframeV1): AnimationKeyframeValues {
  const source = keyframe as unknown as Record<string, unknown>;
  const values: AnimationKeyframeValues = {};
  for (const key of TRANSFORM_KEYS) { const value = source[key]; if (isFiniteNumber(value)) values[key] = value; }
  if (typeof source.visible === 'boolean') values.visible = source.visible;
  if (isTint(source.tint)) values.tint = source.tint;
  return values;
}

export function validateAnimationClip(clip: unknown, rig?: unknown): string[] {
  if (!isRecord(clip)) return ['animation clip must be an object'];
  const errors: string[] = [];
  const label = isNonEmptyString(clip.id) ? clip.id : 'animation clip';
  if (clip.schema !== 'roost2d.animation/v1') errors.push('schema must be roost2d.animation/v1');
  if (!isNonEmptyString(clip.id)) errors.push('animation clip id is required');
  const durationMs = isFiniteNumber(clip.durationMs) && clip.durationMs > 0 ? clip.durationMs : undefined;
  if (durationMs === undefined) errors.push(`${label}: durationMs must be positive`);
  if (clip.loop !== undefined && typeof clip.loop !== 'boolean') errors.push(`${label}: loop must be a boolean`);
  if (clip.loopMode !== undefined && clip.loopMode !== 'repeat' && clip.loopMode !== 'ping-pong') errors.push(`${label}: loopMode must be repeat or ping-pong`);
  if (clip.loopMode !== undefined && clip.loop !== true) errors.push(`${label}: loopMode requires loop: true`);
  if (clip.fallbackClipId !== undefined && !isNonEmptyString(clip.fallbackClipId)) errors.push(`${label}: fallbackClipId must be a string`);
  if (clip.defaultLayer !== undefined && !isNonEmptyString(clip.defaultLayer)) errors.push(`${label}: defaultLayer must be a string`);
  if (clip.mask !== undefined && (!Array.isArray(clip.mask) || !(clip.mask as unknown[]).every(isNonEmptyString))) errors.push(`${label}: mask must be an array of ids`);

  const cues = clip.cues === undefined ? [] : readEntries(clip.cues, `${label}.cues`, errors);
  const cueIds = new Set<string>();
  let previousCueTime = -1;
  for (const cue of cues ?? []) {
    if (!isNonEmptyString(cue.id) || cueIds.has(cue.id)) errors.push(`${label}: duplicate or empty cue id ${String(cue.id)}`);
    else cueIds.add(cue.id);
    if (!isFiniteNumber(cue.timeMs) || cue.timeMs < previousCueTime || cue.timeMs < 0 || (durationMs !== undefined && cue.timeMs > durationMs)) errors.push(`${label}: invalid cue time ${String(cue.timeMs)}`);
    else previousCueTime = cue.timeMs;
    if (cue.phase !== undefined && !['anticipation', 'contact', 'release', 'recovery', 'complete'].includes(String(cue.phase))) errors.push(`${label}: invalid cue phase ${String(cue.phase)}`);
    if (cue.data !== undefined && (!isRecord(cue.data) || Object.values(cue.data).some((value) => !['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))))) errors.push(`${label}: cue data values must be finite primitive values`);
  }

  const tracks = readEntries(clip.tracks, `${label}.tracks`, errors);
  if (!tracks) return errors;
  const targetIds = rigTargetIds(rig);
  for (const track of tracks) {
    const target = track.target;
    if (target !== 'bone' && target !== 'attachment' && target !== 'slot') { errors.push(`${label}: unknown track target ${String(target)}`); continue; }
    if (!isNonEmptyString(track.targetId)) { errors.push(`${label}: track targetId is required`); continue; }
    if (targetIds && !targetIds[target].has(track.targetId)) errors.push(`${label}: unknown ${target} ${track.targetId}`);
    const trackLabel = `${label}:${track.targetId}`;
    const keyframes = readEntries(track.keyframes, `${trackLabel}.keyframes`, errors);
    if (!keyframes) continue;
    let previous = -1;
    for (const keyframe of keyframes) {
      const timeMs = keyframe.timeMs;
      if (!isFiniteNumber(timeMs) || timeMs < previous || timeMs < 0 || (durationMs !== undefined && timeMs > durationMs)) errors.push(`${trackLabel}: invalid keyframe time ${String(timeMs)}`);
      else previous = timeMs;
      if (keyframe.durationMs !== undefined && (!isFiniteNumber(keyframe.durationMs) || keyframe.durationMs < 0)) errors.push(`${trackLabel}: negative duration`);
      if (keyframe.ease !== undefined && typeof keyframe.ease !== 'string') errors.push(`${trackLabel}: ease must be a string`);
      errors.push(...keyframeValueErrors(keyframe, trackLabel));
    }
  }
  return errors;
}

export function validateRightsManifest(manifest: unknown): string[] {
  if (!isRecord(manifest)) return ['rights manifest must be an object'];
  const errors: string[] = [];
  if (manifest.schema !== 'chikn-game-assets.rights/v1') errors.push('schema must be chikn-game-assets.rights/v1');
  if (manifest.excludedPaths !== undefined && (!Array.isArray(manifest.excludedPaths) || !(manifest.excludedPaths as unknown[]).every(isNonEmptyString))) errors.push('excludedPaths must be an array of paths');
  const assets = readEntries(manifest.assets, 'assets', errors);
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const asset of assets ?? []) {
    const label = isNonEmptyString(asset.id) ? asset.id : 'rights asset';
    if (!isNonEmptyString(asset.id) || ids.has(asset.id)) errors.push(`duplicate or empty rights id: ${String(asset.id)}`);
    else ids.add(asset.id);
    if (!isNonEmptyString(asset.sourcePath) || paths.has(asset.sourcePath)) errors.push(`duplicate or empty source path: ${String(asset.sourcePath)}`);
    else { paths.add(asset.sourcePath); if (!isContainedRelativePath(asset.sourcePath)) errors.push(`${label}: sourcePath must be relative, normalized, and contained`); }
    if (!isNonEmptyString(asset.license) || !isNonEmptyString(asset.attribution)) errors.push(`${label}: incomplete rights classification`);
    if (asset.license === 'Apache-2.0' && !asset.approved) errors.push(`${label}: Apache project material is not approved`);
    if (asset.license === 'CHIKN-COMMUNITY-NONCOMMERCIAL') {
      errors.push(...protectedRightsErrors(asset, label));
      if (asset.commercialUse !== 'separate-agreement-required') errors.push(`${label}: separate commercial agreement is required`);
    }
    if (typeof asset.sha256 !== 'string' || !HEX_SHA256.test(asset.sha256)) errors.push(`${label}: invalid source SHA-256`);
  }
  return errors;
}
