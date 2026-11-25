import type { AnimationChannelV2, AnimationClipV2, AnimationNumberChannelV2, RigDefinitionV2, TextureRef } from '@roost2d/contracts';
import { validateAnimationClip, validateRigDefinition } from '@roost2d/contracts';

type ObjectValue = Record<string, unknown>;
export interface Spine42TextureContext { skinId: string; slotId: string; attachmentName: string; width: number; height: number; }
export interface Spine42ImportOptions {
  id: string;
  resolveTexture(path: string, context: Spine42TextureContext): TextureRef;
  /** Prefix includes any desired separator; upstream animation names remain exact. */
  animationIdPrefix?: string;
  /** Application playback defaults, independent of upstream game-script metadata. */
  loopAnimations?: readonly string[];
}
export interface Spine42ImportResult {
  definition: RigDefinitionV2;
  clips: AnimationClipV2[];
  metadata: { sourceVersion: string; animationNames: string[]; bodySkinIds: string[]; traitSkinIds: string[] };
}

/**
 * A bounded, independently authored importer for region-only Spine 4.2 JSON.
 * Produces setup-resolved y-down/radian native data at build time, without a Spine runtime.
 * Complex/unrecognised features fail explicitly instead of producing plausible but wrong art.
 */
export function importSpine42(input: unknown, options: Spine42ImportOptions): Spine42ImportResult {
  const source = object(input, 'skeleton');
  const skeleton = object(source.skeleton, 'skeleton metadata');
  const version = string(skeleton.spine, 'Spine version');
  if (!/^4\.2(?:\.|$)/.test(version)) throw new Error(`Unsupported Spine version: ${version}`);
  if (!options.id) throw new Error('A rig id is required');
  for (const key of ['ik', 'transform', 'path', 'physics', 'events']) rejectPopulated(source[key], key);
  const rawBones = array(source.bones, 'bones').map((item) => object(item, 'bone'));
  const boneIds = uniqueNames(rawBones, 'bone');
  let presentationRootId = '$root';
  while (boneIds.has(presentationRootId)) presentationRootId += '_';
  const bones = rawBones.map((raw, index) => {
    const id = string(raw.name, 'bone.name');
    if ((raw.transform !== undefined && raw.transform !== 'normal') || (raw.inherit !== undefined && raw.inherit !== 'normal')) throw new Error(`${id}: unsupported transform inheritance`);
    if (raw.skin === true || number(raw.shearX, 0) !== 0 || number(raw.shearY, 0) !== 0) throw new Error(`${id}: unsupported skin bone or shear`);
    const parentId = optionalString(raw.parent);
    if (parentId && (!boneIds.has(parentId) || !rawBones.slice(0, index).some((bone) => bone.name === parentId))) throw new Error(`${id}: parent must precede child`);
    return { id, parentId: parentId ?? presentationRootId, x: number(raw.x, 0), y: -number(raw.y, 0), rotation: -number(raw.rotation, 0) * Math.PI / 180, scaleX: number(raw.scaleX, 1), scaleY: number(raw.scaleY, 1) };
  });
  const rawSlots = array(source.slots, 'slots').map((item) => object(item, 'slot'));
  const slotIds = uniqueNames(rawSlots, 'slot');
  const slots = rawSlots.map((raw, index) => {
    const id = string(raw.name, 'slot.name'); const boneId = string(raw.bone, `${id}.bone`);
    if (!boneIds.has(boneId)) throw new Error(`${id}: unknown bone ${boneId}`);
    if (raw.blend !== undefined && raw.blend !== 'normal') throw new Error(`${id}: unsupported blend mode`);
    if (raw.dark !== undefined) throw new Error(`${id}: unsupported two-color tint`);
    return { id, boneId, zIndex: index, defaultAttachmentName: optionalString(raw.attachment) ?? null, ...(raw.color === undefined ? {} : { color: color(raw.color) }) };
  });
  const attachmentNames: RigDefinitionV2['attachmentNames'] = {};
  const attachments: RigDefinitionV2['attachments'] = [];
  const rawSkins = array(source.skins, 'skins').map((item) => object(item, 'skin'));
  uniqueNames(rawSkins, 'skin');
  for (const skin of rawSkins) {
    const skinId = string(skin.name, 'skin.name');
    for (const key of ['bones', 'ik', 'transform', 'path', 'physics']) rejectPopulated(skin[key], `skin ${skinId}.${key}`);
    const table: Record<string, Record<string, string>> = {};
    for (const [slotId, entries] of Object.entries(object(skin.attachments ?? {}, `${skinId}.attachments`))) {
      if (!slotIds.has(slotId)) throw new Error(`${skinId}: unknown slot ${slotId}`);
      const names: Record<string, string> = {};
      for (const [name, value] of Object.entries(object(entries, `${skinId}.${slotId}`))) {
        const raw = object(value, `${skinId}.${slotId}.${name}`);
        if (raw.type !== undefined && raw.type !== 'region') throw new Error(`${name}: unsupported attachment type ${String(raw.type)}`);
        if (raw.sequence !== undefined) throw new Error(`${name}: unsupported attachment sequence`);
        const path = raw.path === undefined ? name : string(raw.path, `${name}.path`);
        const width = number(raw.width); const height = number(raw.height);
        if (width <= 0 || height <= 0) throw new Error(`${name}: attachment dimensions must be positive`);
        const id = `${options.id}/${[skinId, slotId, name].map(encodeURIComponent).join('/')}`;
        names[name] = id;
        const tint = color(raw.color ?? 'ffffffff');
        attachments.push({ id, slotId, texture: options.resolveTexture(path, { skinId, slotId, attachmentName: name, width, height }), x: number(raw.x, 0), y: -number(raw.y, 0), rotation: -number(raw.rotation, 0) * Math.PI / 180, scaleX: number(raw.scaleX, 1), scaleY: number(raw.scaleY, 1), anchorX: 0.5, anchorY: 0.5, zIndex: slots.find((slot) => slot.id === slotId)!.zIndex, depthTarget: 'attachment', tint: rgb(tint), alpha: tint.alpha });
      }
      table[slotId] = names;
    }
    attachmentNames[skinId] = table;
  }
  const bodySkinIds = rawSkins.map((skin) => string(skin.name, 'skin.name')).filter((name) => name !== 'default' && !name.startsWith('trait/'));
  const traitSkinIds = rawSkins.map((skin) => string(skin.name, 'skin.name')).filter((name) => name.startsWith('trait/'));
  const skins: NonNullable<RigDefinitionV2['skins']> = {};
  for (const skinId of Object.keys(attachmentNames)) {
    const skin: Record<string, string | undefined> = {};
    for (const slot of slots) if (slot.defaultAttachmentName) skin[slot.id] = attachmentNames[skinId]?.[slot.id]?.[slot.defaultAttachmentName] ?? attachmentNames.default?.[slot.id]?.[slot.defaultAttachmentName];
    skins[skinId] = skin;
  }
  const definition: RigDefinitionV2 = { schema: 'roost2d.rig/v2', id: options.id, displayName: options.id, bones: [{ id: presentationRootId, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, ...bones], slots, attachments, skins, defaultSkinId: bodySkinIds[0] ?? 'default', renderOrder: 'slots', attachmentNames, metadata: { sourceFormat: 'spine-json', sourceVersion: version, units: 'pixels', coordinateSystem: 'y-down', presentationRootId } };
  const animations = object(source.animations ?? {}, 'animations');
  const clips = Object.entries(animations).map(([name, value]): AnimationClipV2 => {
    const animation = object(value, `animation ${name}`);
    for (const [key, data] of Object.entries(animation)) if (key !== 'bones' && key !== 'slots') rejectPopulated(data, `${name}.${key}`);
    const channels: AnimationChannelV2[] = [];
    let durationMs = 0;
    for (const [boneId, timelines] of Object.entries(object(animation.bones ?? {}, `${name}.bones`))) {
      const setup = bones.find((bone) => bone.id === boneId);
      if (!setup) throw new Error(`${name}: unknown bone ${boneId}`);
      for (const [type, data] of Object.entries(object(timelines, `${name}.${boneId}`))) {
        const frames = array(data, `${name}.${boneId}.${type}`).map((frame) => object(frame, 'keyframe'));
        if (type === 'shear' || type === 'shearx' || type === 'sheary') {
          for (const frame of frames) {
            if (number(frame.x, 0) !== 0 || number(frame.y, 0) !== 0 || number(frame.value, 0) !== 0) throw new Error(`${name}: nonzero shear is unsupported`);
            durationMs = Math.max(durationMs, time(frame));
          }
          continue;
        }
        const properties = boneProperties(type);
        if (!properties) throw new Error(`${name}: unsupported bone timeline ${type}`);
        for (let axis = 0; axis < properties.length; axis++) {
          const { property, field, fallback } = properties[axis]!;
          const convert = (value: number): number => property === 'rotation' ? setup.rotation - value * Math.PI / 180 : property === 'x' ? setup.x + value : property === 'y' ? setup.y - value : property === 'scaleX' ? setup.scaleX * value : setup.scaleY * value;
          const keyframes = frames.map((frame) => {
            const timeMs = time(frame); durationMs = Math.max(durationMs, timeMs);
            return { timeMs, value: convert(number(frame[field], fallback)), ...curve(frame.curve, axis, properties.length, convert) };
          });
          if (keyframes.length) channels.push({ kind: 'number', target: 'bone', targetId: boneId, property, keyframes });
        }
      }
    }
    for (const [slotId, timelines] of Object.entries(object(animation.slots ?? {}, `${name}.slots`))) {
      if (!slotIds.has(slotId)) throw new Error(`${name}: unknown slot ${slotId}`);
      for (const [type, data] of Object.entries(object(timelines, `${name}.${slotId}`))) {
        const frames = array(data, `${name}.${slotId}.${type}`).map((frame) => object(frame, 'slot keyframe'));
        if (type === 'attachment') {
          const keyframes = frames.map((frame) => {
            const timeMs = time(frame); durationMs = Math.max(durationMs, timeMs);
            const attachmentName = frame.name == null ? null : string(frame.name, 'attachment name');
            // A valid animation can name an attachment absent from every installed
            // skin. Missing lookup means hidden, not an invalid clip.
            return { timeMs, name: attachmentName };
          });
          if (keyframes.length) channels.push({ kind: 'attachment', target: 'slot', targetId: slotId, keyframes });
        } else if (type === 'rgba') {
          const properties = ['red', 'green', 'blue', 'alpha'] as const;
          for (let axis = 0; axis < properties.length; axis++) {
            const property = properties[axis]!;
            const keyframes = frames.map((frame) => {
              const timeMs = time(frame); durationMs = Math.max(durationMs, timeMs);
              return { timeMs, value: color(frame.color)[property], ...curve(frame.curve, axis, 4, (value) => value) };
            });
            if (keyframes.length) channels.push({ kind: 'number', target: 'slot', targetId: slotId, property, keyframes });
          }
        } else throw new Error(`${name}: unsupported slot timeline ${type}`);
      }
    }
    return { schema: 'roost2d.animation/v2', id: `${options.animationIdPrefix ?? `${options.id}.`}${name}`, durationMs: Math.max(1, durationMs), loop: (options.loopAnimations ?? ['Idle', 'IdleHurt']).includes(name), channels };
  });
  const errors = [...validateRigDefinition(definition), ...clips.flatMap((clip) => validateAnimationClip(clip, definition))];
  if (errors.length) throw new Error(`Invalid native import:\n${errors.join('\n')}`);
  return { definition, clips, metadata: { sourceVersion: version, animationNames: Object.keys(animations), bodySkinIds, traitSkinIds } };
}

function boneProperties(type: string): Array<{ property: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'; field: string; fallback: number }> | undefined {
  switch (type) {
    case 'rotate': return [{ property: 'rotation', field: 'value', fallback: 0 }];
    case 'translate': return [{ property: 'x', field: 'x', fallback: 0 }, { property: 'y', field: 'y', fallback: 0 }];
    case 'translatex': return [{ property: 'x', field: 'value', fallback: 0 }];
    case 'translatey': return [{ property: 'y', field: 'value', fallback: 0 }];
    case 'scale': return [{ property: 'scaleX', field: 'x', fallback: 1 }, { property: 'scaleY', field: 'y', fallback: 1 }];
    case 'scalex': return [{ property: 'scaleX', field: 'value', fallback: 1 }];
    case 'scaley': return [{ property: 'scaleY', field: 'value', fallback: 1 }];
    default: return undefined;
  }
}
function curve(raw: unknown, axis: number, axes: number, convert: (value: number) => number): { curve?: AnimationNumberChannelV2['keyframes'][number]['curve'] } {
  if (raw === undefined || raw === 'linear') return {};
  if (raw === 'stepped') return { curve: 'stepped' };
  const values = array(raw, 'curve');
  if (values.length !== axes * 4) throw new Error(`Expected ${axes * 4} cubic control values`);
  const index = axis * 4;
  return { curve: { type: 'bezier', controlPoints: [number(values[index]) * 1000, convert(number(values[index + 1])), number(values[index + 2]) * 1000, convert(number(values[index + 3]))] } };
}
function color(raw: unknown): { red: number; green: number; blue: number; alpha: number } {
  if (typeof raw !== 'string' || !/^[a-f\d]{8}$/i.test(raw)) throw new Error('Expected 8-digit RGBA color');
  return { red: parseInt(raw.slice(0, 2), 16) / 255, green: parseInt(raw.slice(2, 4), 16) / 255, blue: parseInt(raw.slice(4, 6), 16) / 255, alpha: parseInt(raw.slice(6, 8), 16) / 255 };
}
function rgb(value: { red: number; green: number; blue: number }): number { return (Math.round(value.red * 255) << 16) | (Math.round(value.green * 255) << 8) | Math.round(value.blue * 255); }
function time(frame: ObjectValue): number { const value = number(frame.time, 0); if (value < 0) throw new Error('Negative keyframe time'); return value * 1000; }
function object(value: unknown, label: string): ObjectValue { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as ObjectValue; }
function array(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array`); return value; }
function string(value: unknown, label: string): string { if (typeof value !== 'string' || !value) throw new Error(`${label} must be a nonempty string`); return value; }
function optionalString(value: unknown): string | undefined { return value == null ? undefined : string(value, 'name'); }
function number(value: unknown, fallback?: number): number { if (value === undefined && fallback !== undefined) return fallback; if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Expected a finite number'); return value; }
function rejectPopulated(value: unknown, label: string): void { if (value !== undefined && value !== null && (typeof value !== 'object' || Object.keys(value).length > 0)) throw new Error(`Unsupported Spine feature: ${label}`); }
function uniqueNames(values: ObjectValue[], label: string): Set<string> { const result = new Set<string>(); for (const value of values) { const name = string(value.name, `${label}.name`); if (result.has(name)) throw new Error(`Duplicate ${label} ${name}`); result.add(name); } return result; }
