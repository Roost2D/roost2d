import { gsap } from 'gsap';
import type { AnimationClip, AnimationChannelV2, AnimationNumberKeyframeV2, AnimationCueV1, AnimationTrackV1, RigAttachmentGroupV1, RigClipPolygonV1, RigClipRectV1, RigDefinition, RigDefinitionV1, RigSlotColorV2, RigSocketV1, TextureRef } from '@roost2d/contracts';
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
  anchorX?: number;
  anchorY?: number;
  clipRect?: RigClipRectV1;
  clipPolygon?: RigClipPolygonV1;
}

export interface RigDisplayFactory {
  createBone(id: string): RigDisplayNode;
  createAttachment(id: string, texture: TextureRef): RigDisplayNode;
  attach(parent: RigDisplayNode | undefined, child: RigDisplayNode): void;
  destroy(node: RigDisplayNode): void;
  /** Optional V2 capability: draw these attachments in the supplied global order. */
  setDrawOrder?(attachments: readonly RigDisplayNode[]): void;
}

export interface RigPlayOptions {
  layer?: string;
  repeat?: number;
  speed?: number;
  mask?: readonly string[];
  /** Leaves the timeline paused so the caller can drive it with sample() or advance(). */
  controlled?: boolean;
  onCue?: (event: RigCueEvent) => void;
  onComplete?: () => void;
}

export interface RigCueEvent {
  clipId: string;
  cue: AnimationCueV1;
  elapsedMs: number;
}

/** Renderer-neutral animation control. GSAP remains an implementation detail. */
export interface RigAnimationHandle {
  kill(): void;
  pause(): unknown;
  play(): unknown;
  progress(value?: number): number | unknown;
  yoyo(): boolean;
  /** Samples an absolute elapsed time. Sampling is silent unless emitCues is explicitly true. */
  sample(timeMs: number, emitCues?: boolean): void;
  /** Advances from the last sampled time and emits every crossed cue once. */
  advance(deltaMs: number): void;
  readonly elapsedMs: number;
  readonly completed: boolean;
}

interface NativeRigPose { channels: readonly AnimationChannelV2[]; timeMs: number; active: boolean; }

export class RigRuntime<D extends RigDefinition = RigDefinitionV1> {
  private readonly bones = new Map<string, RigDisplayNode>();
  private readonly attachments = new Map<string, RigDisplayNode>();
  private readonly sockets = new Map<string, RigDisplayNode>();
  private readonly slotAttachments = new Map<string, RigDisplayNode[]>();
  private readonly clips = new Map<string, AnimationClip>();
  private readonly playbacks = new Map<string, RigAnimationPlayback>();
  private readonly baseBoneZIndexes = new Map<string, number | undefined>();
  private readonly activeGroups = new Map<string, RigAttachmentGroupV1>();
  private readonly manualAttachments = new Map<string, string>();
  private readonly visibilityOverrides = new Map<string, boolean>();
  private readonly layerSpeeds = new Map<string, number>();
  private readonly nativePoses = new Map<string, NativeRigPose>();
  private readonly nativeAttachmentNames = new Map<string, string | null>();
  private readonly slotColors = new Map<string, RigSlotColorV2>();
  private readonly gameTints = new Map<string, number>();
  private readonly boneDefinitions = new Map<string, RigDefinition['bones'][number]>();
  private readonly setupSlotColors = new Map<string, RigSlotColorV2>();
  private runtimeSpeed = 1;
  private mirrored = false;
  private skinId?: string;
  private disposed = false;

  constructor(readonly definition: D, private readonly factory: RigDisplayFactory, clips: readonly AnimationClip[] = []) {
    const errors = validateRigDefinition(definition); if (errors.length) throw new Error(`Invalid rig definition:\n${errors.join('\n')}`);
    if (definition.schema === 'roost2d.rig/v2' && !factory.setDrawOrder) throw new Error('V2 rigs require a display factory with global slot draw-order support');
    if (definition.schema === 'roost2d.rig/v2') for (const slot of definition.slots) this.setupSlotColors.set(slot.id, { red: 1, green: 1, blue: 1, alpha: 1, ...slot.color });
    for (const bone of definition.bones) {
      this.boneDefinitions.set(bone.id, bone);
      const node = factory.createBone(bone.id); this.applyTransform(node, bone); this.bones.set(bone.id, node);
    }
    for (const bone of definition.bones) if (!bone.followSlotId) factory.attach(bone.parentId ? this.bones.get(bone.parentId) : undefined, this.bones.get(bone.id)!);
    for (const attachment of definition.attachments) {
      const node = factory.createAttachment(attachment.id, attachment.texture); this.applyTransform(node, attachment);
      const depthTarget = attachment.depthTarget ?? 'attachment';
      node.zIndex = depthTarget === 'attachment' ? attachment.zIndex : 0;
      if (depthTarget === 'bone') this.bones.get(attachment.boneId!)!.zIndex = attachment.zIndex;
      node.tint = attachment.tint; node.anchorX = attachment.anchorX ?? 0; node.anchorY = attachment.anchorY ?? 0; node.visible = false;
      this.attachments.set(attachment.id, node);
      const slot = this.slotAttachments.get(attachment.slotId) ?? []; slot.push(node); this.slotAttachments.set(attachment.slotId, slot);
      const slotDefinition = definition.slots.find(({ id }) => id === attachment.slotId);
      factory.attach(attachment.boneId ? this.bones.get(attachment.boneId) : slotDefinition?.boneId ? this.bones.get(slotDefinition.boneId) : undefined, node);
    }
    if (definition.schema === 'roost2d.rig/v2') {
      for (const slot of definition.slots) if (!this.slotAttachments.has(slot.id)) this.slotAttachments.set(slot.id, []);
      const order = new Map(definition.slots.map((slot, index) => [slot.id, index]));
      const attachments = [...definition.attachments].sort((left, right) => order.get(left.slotId)! - order.get(right.slotId)!);
      factory.setDrawOrder!(attachments.map(attachment => this.attachments.get(attachment.id)!));
    }
    for (const socket of definition.sockets ?? []) {
      const node = factory.createBone(`socket:${socket.id}`); this.applyTransform(node, socket); this.sockets.set(socket.id, node);
      factory.attach(this.socketParent(socket), node);
    }
    for (const [id, node] of this.bones) this.baseBoneZIndexes.set(id, node.zIndex);
    for (const clip of clips) this.registerClip(clip);
    const initialSkin = definition.defaultSkinId ?? Object.keys(definition.skins ?? {})[0];
    if (initialSkin) this.applySkin(initialSkin); else this.applyVisibility();
  }

  registerClip(clip: AnimationClip): this {
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

  play(clip: AnimationClip, options?: RigPlayOptions): RigAnimationHandle;
  play(clipId: string, options?: RigPlayOptions): RigAnimationHandle;
  play(clipOrId: AnimationClip | string, options?: RigPlayOptions): RigAnimationHandle;
  play(clipOrId: AnimationClip | string, options: RigPlayOptions = {}): RigAnimationHandle {
    const clip = typeof clipOrId === 'string' ? this.resolveClip(clipOrId) : this.useClip(clipOrId);
    const layer = options.layer ?? clip.defaultLayer ?? 'base'; this.stop(layer);
    const timeline = gsap.timeline({ paused: true,
      repeat: clip.loop ? (options.repeat ?? -1) : (options.repeat ?? 0),
      yoyo: clip.loop === true && clip.loopMode === 'ping-pong',
    });
    const mask = new Set(options.mask ?? clip.mask ?? []);
    let samplePose: ((timeMs: number) => void) | undefined;
    let nativePose: NativeRigPose | undefined;
    this.clearNativeLayer(layer);
    if (clip.schema === 'roost2d.animation/v1') {
      for (const track of clip.tracks) if (!mask.size || mask.has(track.targetId)) this.addTrack(timeline, track);
    } else {
      const pose = { channels: clip.channels.filter(channel => !mask.size || mask.has(channel.targetId)), timeMs: 0, active: true };
      nativePose = pose;
      this.nativePoses.set(layer, pose);
      samplePose = timeMs => { pose.timeMs = timeMs; this.applyNativePoses(pose); };
      // One clock tween per clip. Native channels are sampled directly, not expanded into GSAP tweens.
      timeline.to({ time: 0 }, { time: 1, duration: clip.durationMs / 1000, ease: 'none' }, 0);
    }
    // Keep cue-only clips and authored recovery time addressable even when their last tween ends early.
    timeline.to({}, { duration: 0 }, clip.durationMs / 1000);
    const playback = new RigAnimationPlayback(timeline, clip, options, () => {
      if (nativePose) nativePose.active = false;
      if (this.playbacks.get(layer) === playback) this.playbacks.delete(layer);
    }, samplePose);
    playback.setSpeed(this.normaliseSpeed(options.speed ?? this.layerSpeeds.get(layer) ?? this.runtimeSpeed));
    this.playbacks.set(layer, playback);
    samplePose?.(0);
    if (!options.controlled) playback.play();
    return playback;
  }

  playOneShot(clipOrId: AnimationClip | string, layer = 'reaction', onComplete?: () => void): RigAnimationHandle {
    return this.play(clipOrId, { layer, repeat: 0, onComplete });
  }

  stop(layer?: string): void {
    if (layer !== undefined) { this.playbacks.get(layer)?.kill(); this.playbacks.delete(layer); return; }
    for (const playback of [...this.playbacks.values()]) playback.kill(); this.playbacks.clear();
  }

  /** Pauses and seeks a live animation layer to an exact clip time for previews or frame export. */
  seek(timeMs: number, layer = 'base'): void {
    if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error('Rig seek time must be a finite non-negative number');
    const playback = this.playbacks.get(layer);
    if (!playback) throw new Error(`Animation layer is not playing: ${layer}`);
    playback.sample(timeMs);
  }

  /** Sets the default speed for future clips and updates every matching live timeline. */
  setSpeed(speed: number, layer?: string): void {
    const value = this.normaliseSpeed(speed);
    if (layer === undefined) {
      this.runtimeSpeed = value;
      for (const playback of this.playbacks.values()) playback.setSpeed(value);
      return;
    }
    this.layerSpeeds.set(layer, value);
    this.playbacks.get(layer)?.setSpeed(value);
  }

  /** Overrides visibility without changing the selected skin, trait group, or manual attachment. */
  setAttachmentVisible(attachmentId: string, visible?: boolean): void {
    if (!this.attachments.has(attachmentId)) throw new Error(`Unknown attachment: ${attachmentId}`);
    if (visible === undefined) this.visibilityOverrides.delete(attachmentId);
    else this.visibilityOverrides.set(attachmentId, visible);
    this.applyVisibility();
  }

  activeAttachmentId(slotId: string): string | undefined {
    if (!this.slotAttachments.has(slotId)) throw new Error(`Unknown slot: ${slotId}`);
    return this.selectedAttachmentId(slotId);
  }

  activeAttachmentIds(): readonly string[] { return [...this.selectedAttachmentIds()]; }

  /** Current game-owned facing. Authored actions never change this value. */
  get isMirrored(): boolean { return this.mirrored; }

  setMirrored(mirrored: boolean): void {
    this.mirrored = mirrored;
    const root = this.definition.bones.find(({ parentId }) => !parentId); if (!root) return;
    const node = this.bones.get(root.id)!; node.scaleX = Math.abs(root.scaleX) * (mirrored ? -1 : 1);
  }

  setTint(tint?: number, attachmentIds?: readonly string[]): void {
    const ids = attachmentIds ? new Set(attachmentIds) : undefined;
    for (const [id, node] of this.attachments) if (!ids || ids.has(id)) {
      if (this.definition.schema === 'roost2d.rig/v2') this.gameTints.set(id, tint ?? 0xffffff);
      else node.tint = tint ?? 0xffffff;
    }
    if (this.definition.schema === 'roost2d.rig/v2') this.applyNativeColors();
  }

  resetPose(): void {
    this.stop();
    this.nativePoses.clear(); this.nativeAttachmentNames.clear(); this.slotColors.clear();
    for (const bone of this.definition.bones) this.applyTransform(this.bones.get(bone.id)!, bone);
    for (const attachment of this.definition.attachments) this.applyTransform(this.attachments.get(attachment.id)!, attachment);
    for (const socket of this.definition.sockets ?? []) this.applyTransform(this.sockets.get(socket.id)!, socket);
    this.applyVisibility();
    this.setMirrored(this.mirrored);
  }

  node(target: 'bone' | 'attachment' | 'socket', id: string): RigDisplayNode | undefined { return target === 'bone' ? this.bones.get(id) : target === 'attachment' ? this.attachments.get(id) : this.sockets.get(id); }

  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.stop();
    for (const node of [...this.sockets.values(), ...this.attachments.values(), ...this.bones.values()]) this.factory.destroy(node);
    this.sockets.clear(); this.attachments.clear(); this.slotAttachments.clear(); this.bones.clear(); this.clips.clear(); this.activeGroups.clear(); this.manualAttachments.clear(); this.visibilityOverrides.clear(); this.layerSpeeds.clear();
    this.nativePoses.clear(); this.nativeAttachmentNames.clear(); this.slotColors.clear(); this.gameTints.clear();
    this.boneDefinitions.clear(); this.setupSlotColors.clear();
  }

  /** Clips handed straight to `play` skip `registerClip`, so they are validated here instead. */
  private useClip(clip: AnimationClip): AnimationClip {
    if (clip && this.clips.get(clip.id) === clip) return clip;
    const errors = validateAnimationClip(clip, this.definition);
    if (errors.length) throw new Error(`Invalid animation clip:\n${errors.join('\n')}`);
    return clip;
  }

  private resolveClip(id: string): AnimationClip {
    let clip = this.clips.get(id); const visited = new Set<string>();
    while (clip?.fallbackClipId && !(clip.schema === 'roost2d.animation/v1' ? clip.tracks : clip.channels).length) {
      if (visited.has(clip.id)) throw new Error(`Animation fallback cycle: ${id}`); visited.add(clip.id); clip = this.clips.get(clip.fallbackClipId);
    }
    if (!clip) throw new Error(`Unknown animation clip: ${id}`); return clip;
  }

  private applyVisibility(): void {
    const selected = this.selectedAttachmentIds();
    for (const attachment of this.definition.attachments) {
      const visible = this.visibilityOverrides.get(attachment.id) ?? selected.has(attachment.id);
      this.attachments.get(attachment.id)!.visible = visible;
    }
    this.applyGroupDepthOverrides();
    for (const node of this.attachments.values()) {
      if (node.clipRect !== undefined) node.clipRect = undefined;
      if (node.clipPolygon !== undefined) node.clipPolygon = undefined;
    }
    for (const group of this.activeGroups.values()) for (const [slotId, rect] of Object.entries(group.slotClipRects ?? {})) {
      const attachmentId = this.slotTransformAttachmentId(slotId);
      if (attachmentId) this.attachments.get(attachmentId)!.clipRect = { ...rect };
    }
    for (const group of this.activeGroups.values()) for (const [slotId, polygon] of Object.entries(group.slotClipPolygons ?? {})) {
      const attachmentId = this.slotTransformAttachmentId(slotId);
      if (attachmentId) this.attachments.get(attachmentId)!.clipPolygon = { points: polygon.points.map(point => [...point] as [number, number]) };
    }
    this.resolveFollowerParents();
    this.resolveSocketParents();
    if (this.definition.schema === 'roost2d.rig/v2') this.applyNativeColors();
  }

  private applyGroupDepthOverrides(): void {
    for (const [boneId, zIndex] of this.baseBoneZIndexes) this.bones.get(boneId)!.zIndex = zIndex;
    for (const group of this.activeGroups.values()) for (const [slotId, zIndex] of Object.entries(group.slotZIndexOverrides ?? {})) {
      const attachmentId = this.slotTransformAttachmentId(slotId);
      const attachment = attachmentId ? this.definition.attachments.find(({ id }) => id === attachmentId) : undefined;
      if (attachment?.boneId) this.bones.get(attachment.boneId)!.zIndex = zIndex;
    }
  }

  private addTrack(timeline: gsap.core.Timeline, track: AnimationTrackV1): void {
    const targets = track.target === 'bone'
      ? [this.bones.get(track.targetId)]
      : track.target === 'attachment'
        ? [this.attachments.get(track.targetId)]
        : [this.slotAnimationTarget(track.targetId)];
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

  private selectedAttachmentIds(): Set<string> {
    const selected = new Set<string>();
    const skin = this.skinId ? this.definition.skins?.[this.skinId] : undefined;
    if (this.definition.schema === 'roost2d.rig/v2') {
      for (const slot of this.definition.slots) {
        const name = this.nativeAttachmentNames.has(slot.id) ? this.nativeAttachmentNames.get(slot.id) : slot.defaultAttachmentName;
        const id = name === undefined ? skin?.[slot.id] ?? slot.defaultAttachmentId : name === null ? undefined : this.lookupAttachmentName(slot.id, name);
        if (id) selected.add(id);
      }
    } else if (skin) {
      for (const attachmentId of Object.values(skin)) if (attachmentId) selected.add(attachmentId);
    } else {
      for (const slot of this.definition.slots) {
        const id = this.manualAttachments.get(slot.id) ?? slot.defaultAttachmentId;
        if (id) selected.add(id);
      }
    }
    for (const [slotId, id] of this.manualAttachments) {
      for (const attachment of this.definition.attachments) if (attachment.slotId === slotId) selected.delete(attachment.id);
      selected.add(id);
    }
    const replacedSlotIds = new Set([...this.activeGroups.values()].flatMap(({ replacesSlotIds }) => replacesSlotIds ?? []));
    for (const attachment of this.definition.attachments) if (replacedSlotIds.has(attachment.slotId)) selected.delete(attachment.id);
    for (const group of this.activeGroups.values()) for (const id of group.attachmentIds) selected.add(id);
    return selected;
  }

  private selectedAttachmentId(slotId: string): string | undefined {
    if (this.definition.schema === 'roost2d.rig/v2') {
      const selected = this.selectedAttachmentIds();
      return this.definition.attachments.find(attachment => attachment.slotId === slotId && selected.has(attachment.id))?.id;
    }
    const manual = this.manualAttachments.get(slotId); if (manual) return manual;
    const group = this.activeGroups.get(slotId); if (group) return group.attachmentIds[0];
    const skin = this.skinId ? this.definition.skins?.[this.skinId] : undefined;
    const skinned = skin?.[slotId]; if (skinned) return skinned;
    return this.definition.slots.find((slot) => slot.id === slotId)?.defaultAttachmentId;
  }

  /** Resolves the base transform for a slot without letting a visible overlay redefine the slot. */
  private slotTransformAttachmentId(slotId: string): string | undefined {
    const manual = this.manualAttachments.get(slotId); if (manual) return manual;
    const skin = this.skinId ? this.definition.skins?.[this.skinId] : undefined;
    const skinned = skin?.[slotId]; if (skinned) return skinned;
    const fallback = this.definition.slots.find((slot) => slot.id === slotId)?.defaultAttachmentId;
    if (fallback) return fallback;
    return this.activeGroups.get(slotId)?.attachmentIds[0];
  }

  private slotAnimationTarget(slotId: string): RigDisplayNode | undefined {
    const attachmentId = this.slotTransformAttachmentId(slotId);
    const attachment = attachmentId ? this.definition.attachments.find(({ id }) => id === attachmentId) : undefined;
    return attachment?.boneId ? this.bones.get(attachment.boneId) : attachment ? this.attachments.get(attachment.id) : this.definition.slots.find(({ id }) => id === slotId)?.boneId ? this.bones.get(this.definition.slots.find(({ id }) => id === slotId)!.boneId!) : undefined;
  }

  private resolveFollowerParents(): void {
    for (const bone of this.definition.bones) {
      if (!bone.followSlotId) continue;
      const attachmentId = this.slotTransformAttachmentId(bone.followSlotId);
      const attachment = attachmentId ? this.definition.attachments.find(({ id }) => id === attachmentId) : undefined;
      this.factory.attach(attachment?.boneId ? this.bones.get(attachment.boneId) : undefined, this.bones.get(bone.id)!);
    }
  }

  private resolveSocketParents(): void {
    for (const socket of this.definition.sockets ?? []) this.factory.attach(this.socketParent(socket), this.sockets.get(socket.id)!);
  }

  private socketParent(socket: RigSocketV1): RigDisplayNode | undefined {
    if (socket.target === 'bone') return this.bones.get(socket.targetId);
    if (socket.target === 'attachment') return this.attachments.get(socket.targetId);
    return this.slotAnimationTarget(socket.targetId);
  }

  private lookupAttachmentName(slotId: string, name: string): string | undefined {
    const definition = this.definition;
    if (definition.schema !== 'roost2d.rig/v2') return undefined;
    const lookup = (skinId: string | undefined) => {
      if (!skinId || !Object.hasOwn(definition.attachmentNames, skinId)) return undefined;
      const skin = definition.attachmentNames[skinId]!;
      if (!Object.hasOwn(skin, slotId)) return undefined;
      const names = skin[slotId]!;
      return Object.hasOwn(names, name) ? names[name] : undefined;
    };
    return lookup(this.skinId) ?? lookup('default');
  }

  private clearNativeLayer(layer: string): void {
    const previous = this.nativePoses.get(layer);
    if (!previous) return;
    for (const channel of previous.channels) if (channel.kind === 'number' && channel.target === 'bone') this.restoreNativeBone(channel.targetId, channel.property);
    this.nativePoses.delete(layer);
    this.applyNativePoses();
  }

  private restoreNativeBone(id: string, property: string): void {
    const bone = this.boneDefinitions.get(id);
    if (!bone) return;
    switch (property) {
      case 'x': case 'y': case 'rotation': case 'scaleX': case 'scaleY':
        this.writeNativeBone(id, property, bone[property]);
    }
  }

  private writeNativeBone(id: string, property: string, value: number): void {
    const node = this.bones.get(id);
    if (!node) return;
    // Explicit allowlist even after validation: retained JSON objects must not become arbitrary setters.
    switch (property) {
      case 'x': node.x = value; break;
      case 'y': node.y = value; break;
      case 'rotation': node.rotation = value; break;
      case 'scaleX': node.scaleX = value; break;
      case 'scaleY': node.scaleY = value; break;
    }
  }

  private applyNativePoses(requestedPose?: NativeRigPose): void {
    this.nativeAttachmentNames.clear(); this.slotColors.clear();
    const poses = [...this.nativePoses.values()].filter(pose => pose.active || pose === requestedPose);
    // Restoring driven properties first makes backward scrubbing and delayed first keys deterministic.
    for (const pose of poses) for (const channel of pose.channels) {
      if (channel.kind === 'number' && channel.target === 'bone') this.restoreNativeBone(channel.targetId, channel.property);
    }
    for (const pose of poses) for (const channel of pose.channels) {
      if (channel.kind === 'attachment') {
        const index = keyframeIndex(channel.keyframes, pose.timeMs);
        if (index >= 0) this.nativeAttachmentNames.set(channel.targetId, channel.keyframes[index]!.name);
        continue;
      }
      const value = sampleNativeNumber(channel.keyframes, pose.timeMs);
      if (value === undefined) continue;
      if (channel.target === 'bone') this.writeNativeBone(channel.targetId, channel.property, value);
      else {
        const color = this.nativeSlotColor(channel.targetId);
        switch (channel.property) {
          case 'red': color.red = value; break;
          case 'green': color.green = value; break;
          case 'blue': color.blue = value; break;
          case 'alpha': color.alpha = value; break;
        }
      }
    }
    this.applyVisibility();
  }

  private nativeSlotColor(slotId: string): RigSlotColorV2 {
    let color = this.slotColors.get(slotId);
    if (!color) {
      color = { red: 1, green: 1, blue: 1, alpha: 1, ...this.setupSlotColors.get(slotId) };
      this.slotColors.set(slotId, color);
    }
    return color;
  }

  private applyNativeColors(): void {
    for (const attachment of this.definition.attachments) {
      const node = this.attachments.get(attachment.id)!;
      const color = this.nativeSlotColor(attachment.slotId);
      const original = attachment.tint ?? 0xffffff;
      const tint = this.gameTints.get(attachment.id) ?? 0xffffff;
      const red = Math.round(((original >> 16) & 255) * ((tint >> 16) & 255) / 255 * clampUnit(color.red));
      const green = Math.round(((original >> 8) & 255) * ((tint >> 8) & 255) / 255 * clampUnit(color.green));
      const blue = Math.round((original & 255) * (tint & 255) / 255 * clampUnit(color.blue));
      node.tint = (red << 16) | (green << 8) | blue;
      node.alpha = (attachment.alpha ?? 1) * clampUnit(color.alpha);
    }
  }

  private normaliseSpeed(speed: number): number {
    if (!Number.isFinite(speed) || speed < 0) throw new Error('Rig speed must be a finite non-negative number');
    return speed;
  }
}

function clampUnit(value: number): number { return Math.max(0, Math.min(1, value)); }

function keyframeIndex(frames: readonly { timeMs: number }[], timeMs: number): number {
  let low = 0; let high = frames.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (frames[middle]!.timeMs <= timeMs) low = middle + 1;
    else high = middle - 1;
  }
  return high;
}

function sampleNativeNumber(frames: readonly AnimationNumberKeyframeV2[], timeMs: number): number | undefined {
  const index = keyframeIndex(frames, timeMs);
  if (index < 0) return undefined;
  const left = frames[index]!; const right = frames[index + 1];
  if (!right || timeMs === left.timeMs || left.curve === 'stepped') return left.value;
  if (!left.curve || left.curve === 'linear') return left.value + (right.value - left.value) * (timeMs - left.timeMs) / (right.timeMs - left.timeMs);
  const [x1, y1, x2, y2] = left.curve.controlPoints;
  const cubic = (start: number, first: number, second: number, end: number, t: number) => {
    const inverse = 1 - t;
    return inverse * inverse * inverse * start + 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t * end;
  };
  // Monotonic time inversion via bounded bisection preserves flat value segments and overshoot.
  let low = 0; let high = 1;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const middle = (low + high) / 2;
    if (cubic(left.timeMs, x1, x2, right.timeMs, middle) < timeMs) low = middle;
    else high = middle;
  }
  return cubic(left.value, y1, y2, right.value, (low + high) / 2);
}

/** Playback wrapper shared by realtime rendering, previews, and deterministic export. */
class RigAnimationPlayback implements RigAnimationHandle {
  #elapsedMs = 0;
  #completed = false;
  #killed = false;
  readonly #emittedCues = new Set<string>();

  constructor(
    private readonly timeline: gsap.core.Timeline,
    private readonly clip: AnimationClip,
    private readonly options: RigPlayOptions,
    private readonly finalize: () => void,
    private readonly samplePose?: (timeMs: number) => void,
  ) {
    timeline.eventCallback('onUpdate', () => this.observeAutomaticTime());
    timeline.eventCallback('onComplete', () => this.finish());
  }

  get elapsedMs(): number { return this.#elapsedMs; }
  get completed(): boolean { return this.#completed; }
  pause(): unknown { return this.timeline.pause(); }
  play(): unknown { if (!this.#killed && !this.#completed) return this.timeline.play(); }
  progress(value?: number): number | unknown { return value === undefined ? this.timeline.progress() : this.timeline.progress(value); }
  yoyo(): boolean { return this.timeline.yoyo(); }
  setSpeed(speed: number): void { this.timeline.timeScale(speed); }

  kill(): void {
    if (this.#killed) return;
    this.#killed = true;
    this.timeline.kill();
    this.finalize();
  }

  sample(timeMs: number, emitCues = false): void {
    if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error('Rig sample time must be a finite non-negative number');
    if (this.#killed) return;
    const next = Math.min(timeMs, this.totalDurationMs());
    // Controlled callers can skip many render frames. Visit each crossed cue pose before its
    // callback so a projectile snapshots the authored release socket instead of the later pose.
    if (emitCues && next >= this.#elapsedMs) this.emitCrossedCues(this.#elapsedMs, next, true);
    this.timeline.pause().totalTime(next / 1000, true);
    this.samplePose?.(this.timeline.time() * 1000);
    this.#elapsedMs = next;
    if (next >= this.totalDurationMs()) this.finish();
  }

  advance(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error('Rig advance delta must be a finite non-negative number');
    this.sample(this.#elapsedMs + deltaMs, true);
  }

  private observeAutomaticTime(): void {
    this.samplePose?.(this.timeline.time() * 1000);
    if (this.#killed || this.options.controlled) return;
    const next = this.timeline.totalTime() * 1000;
    if (next >= this.#elapsedMs) this.emitCrossedCues(this.#elapsedMs, next);
    this.#elapsedMs = next;
  }

  private emitCrossedCues(previousMs: number, nextMs: number, sampleCuePose = false): void {
    for (const cue of this.clip.cues ?? []) {
      if (this.#emittedCues.has(cue.id)) continue;
      if ((cue.timeMs > previousMs || (previousMs === 0 && cue.timeMs === 0)) && cue.timeMs <= nextMs) {
        this.#emittedCues.add(cue.id);
        if (sampleCuePose) {
          this.timeline.pause().totalTime(cue.timeMs / 1000, true);
          this.samplePose?.(this.timeline.time() * 1000);
        }
        this.options.onCue?.({ clipId: this.clip.id, cue, elapsedMs: cue.timeMs });
      }
    }
  }

  private totalDurationMs(): number {
    const duration = this.timeline.totalDuration() * 1000;
    return Number.isFinite(duration) ? duration : this.clip.durationMs;
  }

  private finish(): void {
    if (this.#completed || this.#killed) return;
    this.#completed = true;
    this.#elapsedMs = this.totalDurationMs();
    this.options.onComplete?.();
    this.finalize();
  }
}

export interface RigActionPlayOptions extends RigPlayOptions {
  /** Full-body actions suspend the configured locomotion layer. Defaults to true. */
  fullBody?: boolean;
}

/** Owns one interruptible action and restores a stable rig pose when it ends. */
export class RigActionController {
  private active?: RigAnimationHandle;
  private disposed = false;

  constructor(
    private readonly rig: RigRuntime<RigDefinition>,
    private readonly options: { actionLayer?: string; locomotionLayer?: string; resumeLocomotion?: () => void } = {},
  ) {}

  play(clipOrId: AnimationClip | string, options: RigActionPlayOptions = {}): RigAnimationHandle {
    if (this.disposed) throw new Error('Rig action controller is disposed');
    this.cancel();
    if (options.fullBody ?? true) this.rig.stop(this.options.locomotionLayer ?? 'base');
    const callerComplete = options.onComplete;
    const handle = this.rig.play(clipOrId, {
      ...options,
      layer: options.layer ?? this.options.actionLayer ?? 'action',
      onComplete: () => {
        if (this.active !== handle) return;
        this.active = undefined;
        this.restore();
        callerComplete?.();
      },
    });
    this.active = handle;
    return handle;
  }

  cancel(): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    active.kill();
    this.restore();
  }

  dispose(): void { if (this.disposed) return; this.cancel(); this.disposed = true; }

  private restore(): void {
    this.rig.resetPose();
    this.options.resumeLocomotion?.();
  }
}
