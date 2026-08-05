import { gsap } from 'gsap';
import type { AnimationClipV1, AnimationTrackV1, RigAttachmentGroupV1, RigDefinitionV1, TextureRef } from '@roost2d/contracts';
import { pickAnimationKeyframeValues, validateAnimationClip, validateRigDefinition } from '@roost2d/contracts';

export interface RigDisplayNode {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  alpha?: number;
  visible?: boolean;
  zIndex?: number;
  tint?: number;
}

export interface RigDisplayFactory {
  createBone(id: string): RigDisplayNode;
  createAttachment(id: string, texture: TextureRef): RigDisplayNode;
  attach(parent: RigDisplayNode | undefined, child: RigDisplayNode): void;
  destroy(node: RigDisplayNode): void;
}

export interface RigPlayOptions {
  layer?: string;
  repeat?: number;
  speed?: number;
  mask?: readonly string[];
  onComplete?: () => void;
}

/** Renderer-neutral animation control. GSAP remains an implementation detail. */
export interface RigAnimationHandle {
  kill(): void;
  pause(): unknown;
  play(): unknown;
}

export class RigRuntime {
  private readonly bones = new Map<string, RigDisplayNode>();
  private readonly attachments = new Map<string, RigDisplayNode>();
  private readonly slotAttachments = new Map<string, RigDisplayNode[]>();
  private readonly clips = new Map<string, AnimationClipV1>();
  private readonly timelines = new Map<string, gsap.core.Timeline>();
  private readonly activeGroups = new Map<string, RigAttachmentGroupV1>();
  private readonly manualAttachments = new Map<string, string>();
  private skinId?: string;
  private disposed = false;

  constructor(readonly definition: RigDefinitionV1, private readonly factory: RigDisplayFactory, clips: readonly AnimationClipV1[] = []) {
    const errors = validateRigDefinition(definition); if (errors.length) throw new Error(`Invalid rig definition:\n${errors.join('\n')}`);
    for (const bone of definition.bones) {
      const node = factory.createBone(bone.id); this.applyTransform(node, bone); this.bones.set(bone.id, node);
    }
    for (const bone of definition.bones) factory.attach(bone.parentId ? this.bones.get(bone.parentId) : undefined, this.bones.get(bone.id)!);
    for (const attachment of definition.attachments) {
      const node = factory.createAttachment(attachment.id, attachment.texture); this.applyTransform(node, attachment);
      node.zIndex = attachment.zIndex; node.tint = attachment.tint; node.visible = false;
      this.attachments.set(attachment.id, node);
      const slot = this.slotAttachments.get(attachment.slotId) ?? []; slot.push(node); this.slotAttachments.set(attachment.slotId, slot);
      const slotDefinition = definition.slots.find(({ id }) => id === attachment.slotId);
      factory.attach(attachment.boneId ? this.bones.get(attachment.boneId) : slotDefinition?.boneId ? this.bones.get(slotDefinition.boneId) : undefined, node);
    }
    for (const clip of clips) this.registerClip(clip);
    const initialSkin = definition.defaultSkinId ?? Object.keys(definition.skins ?? {})[0];
    if (initialSkin) this.applySkin(initialSkin); else this.applyVisibility();
  }

  registerClip(clip: AnimationClipV1): this {
    const errors = validateAnimationClip(clip, this.definition); if (errors.length) throw new Error(`Invalid animation clip:\n${errors.join('\n')}`);
    this.clips.set(clip.id, clip); return this;
  }

  applySkin(skinId: string): void {
    if (!this.definition.skins || !Object.hasOwn(this.definition.skins, skinId)) throw new Error(`Unknown skin: ${skinId}`);
    this.skinId = skinId; this.applyVisibility();
  }

  get activeSkinId(): string | undefined { return this.skinId; }

  attachGroup(groupId: string): void {
    const groups = this.definition.attachmentGroups;
    const group = groups && Object.hasOwn(groups, groupId) ? groups[groupId] : undefined;
    if (!group) throw new Error(`Unknown attachment group: ${groupId}`);
    this.activeGroups.set(group.slotId, group); this.manualAttachments.delete(group.slotId); this.applyVisibility();
  }

  removeGroup(groupOrSlotId: string): boolean {
    const groups = this.definition.attachmentGroups;
    const group = groups && Object.hasOwn(groups, groupOrSlotId) ? groups[groupOrSlotId] : undefined;
    const removed = this.activeGroups.delete(group?.slotId ?? groupOrSlotId); if (removed) this.applyVisibility(); return removed;
  }

  setAttachment(slotId: string, attachmentId?: string): void {
    if (!this.slotAttachments.has(slotId)) throw new Error(`Unknown slot: ${slotId}`);
    if (attachmentId) {
      const definition = this.definition.attachments.find(({ id }) => id === attachmentId);
      if (!definition || definition.slotId !== slotId) throw new Error(`Attachment ${attachmentId} does not belong to ${slotId}`);
      this.manualAttachments.set(slotId, attachmentId);
    } else this.manualAttachments.delete(slotId);
    this.activeGroups.delete(slotId); this.applyVisibility();
  }

  play(clip: AnimationClipV1, options?: RigPlayOptions): RigAnimationHandle;
  play(clipId: string, options?: RigPlayOptions): RigAnimationHandle;
  play(clipOrId: AnimationClipV1 | string, options?: RigPlayOptions): RigAnimationHandle;
  play(clipOrId: AnimationClipV1 | string, options: RigPlayOptions = {}): RigAnimationHandle {
    const clip = typeof clipOrId === 'string' ? this.resolveClip(clipOrId) : this.useClip(clipOrId);
    const layer = options.layer ?? clip.defaultLayer ?? 'base'; this.stop(layer);
    const timeline = gsap.timeline({ repeat: clip.loop ? (options.repeat ?? -1) : (options.repeat ?? 0), onComplete: () => { this.timelines.delete(layer); options.onComplete?.(); } });
    const mask = new Set(options.mask ?? clip.mask ?? []);
    for (const track of clip.tracks) if (!mask.size || mask.has(track.targetId)) this.addTrack(timeline, track);
    timeline.timeScale(Math.max(0.01, options.speed ?? 1)); this.timelines.set(layer, timeline); return timeline;
  }

  playOneShot(clipOrId: AnimationClipV1 | string, layer = 'reaction', onComplete?: () => void): RigAnimationHandle {
    return this.play(clipOrId, { layer, repeat: 0, onComplete });
  }

  stop(layer?: string): void {
    if (layer !== undefined) { this.timelines.get(layer)?.kill(); this.timelines.delete(layer); return; }
    for (const timeline of this.timelines.values()) timeline.kill(); this.timelines.clear();
  }

  setMirrored(mirrored: boolean): void {
    const root = this.definition.bones.find(({ parentId }) => !parentId); if (!root) return;
    const node = this.bones.get(root.id)!; node.scaleX = Math.abs(root.scaleX) * (mirrored ? -1 : 1);
  }

  setTint(tint?: number, attachmentIds?: readonly string[]): void {
    const ids = attachmentIds ? new Set(attachmentIds) : undefined;
    for (const [id, node] of this.attachments) if (!ids || ids.has(id)) node.tint = tint ?? 0xffffff;
  }

  resetPose(): void {
    this.stop();
    for (const bone of this.definition.bones) this.applyTransform(this.bones.get(bone.id)!, bone);
    for (const attachment of this.definition.attachments) this.applyTransform(this.attachments.get(attachment.id)!, attachment);
    this.applyVisibility();
  }

  node(target: 'bone' | 'attachment', id: string): RigDisplayNode | undefined { return target === 'bone' ? this.bones.get(id) : this.attachments.get(id); }

  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.stop();
    for (const node of [...this.attachments.values(), ...this.bones.values()]) this.factory.destroy(node);
    this.attachments.clear(); this.slotAttachments.clear(); this.bones.clear(); this.clips.clear(); this.activeGroups.clear(); this.manualAttachments.clear();
  }

  /** Clips handed straight to `play` skip `registerClip`, so they are validated here instead. */
  private useClip(clip: AnimationClipV1): AnimationClipV1 {
    if (clip && this.clips.get(clip.id) === clip) return clip;
    const errors = validateAnimationClip(clip, this.definition);
    if (errors.length) throw new Error(`Invalid animation clip:\n${errors.join('\n')}`);
    return clip;
  }

  private resolveClip(id: string): AnimationClipV1 {
    let clip = this.clips.get(id); const visited = new Set<string>();
    while (clip?.fallbackClipId && !clip.tracks.length) {
      if (visited.has(clip.id)) throw new Error(`Animation fallback cycle: ${id}`); visited.add(clip.id); clip = this.clips.get(clip.fallbackClipId);
    }
    if (!clip) throw new Error(`Unknown animation clip: ${id}`); return clip;
  }

  private applyVisibility(): void {
    const selected = new Set<string>();
    const skin = this.skinId ? this.definition.skins?.[this.skinId] : undefined;
    for (const attachmentId of Object.values(skin ?? {})) if (attachmentId) selected.add(attachmentId);
    if (!skin) for (const slot of this.definition.slots) {
      const id = this.manualAttachments.get(slot.id) ?? slot.defaultAttachmentId; if (id) selected.add(id);
    }
    for (const group of this.activeGroups.values()) for (const id of group.attachmentIds) selected.add(id);
    for (const [slotId, id] of this.manualAttachments) { for (const attachment of this.definition.attachments) if (attachment.slotId === slotId) selected.delete(attachment.id); selected.add(id); }
    for (const attachment of this.definition.attachments) this.attachments.get(attachment.id)!.visible = selected.has(attachment.id);
  }

  private addTrack(timeline: gsap.core.Timeline, track: AnimationTrackV1): void {
    const targets = track.target === 'bone' ? [this.bones.get(track.targetId)] : track.target === 'attachment' ? [this.attachments.get(track.targetId)] : this.slotAttachments.get(track.targetId);
    if (!targets?.length || targets.some((target) => !target)) throw new Error(`Animation target not found: ${track.target}:${track.targetId}`);
    for (const keyframe of track.keyframes) for (const target of targets) {
      // Explicit pick, never a spread of the keyframe: clip data must not be able to reach GSAP's
      // reserved vars or write arbitrary properties — `__proto__` included — onto a display node.
      const values = pickAnimationKeyframeValues(keyframe);
      timeline.to(target!, { ...values, duration: (keyframe.durationMs ?? 0) / 1000, ease: keyframe.ease ?? 'none' }, keyframe.timeMs / 1000);
    }
  }

  private applyTransform(node: RigDisplayNode, transform: { x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number; alpha?: number }): void {
    node.x = transform.x ?? 0; node.y = transform.y ?? 0; node.rotation = transform.rotation ?? 0;
    node.scaleX = transform.scaleX ?? 1; node.scaleY = transform.scaleY ?? 1; node.alpha = transform.alpha ?? 1;
  }
}
