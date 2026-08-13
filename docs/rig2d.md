# Rig2D

`RigRuntime` consumes portable rig definitions and a renderer adapter. The Pixi adapter requires preloaded cropped textures:

```ts
const factory = new PixiRigFactory(texturesByAssetId);
const rig = new RigRuntime(definition, factory, clips);
stage.addChild(factory.root);

rig.applySkin('default');
rig.attachGroup('headwear/cap');
rig.play('idle', { layer: 'base', speed: 1 });
rig.playOneShot('blink', 'face');
```

Attachments begin hidden. A default skin chooses base parts; exclusive attachment groups add traits without exposing every available layer. Animation handles deliberately hide GSAP types so the public engine contract stays implementation-neutral.

Groups may declare `replacesSlotIds`. Those base sprites become hidden while the group is active, but their bones remain in the hierarchy as animation and follower targets. This distinction is what lets a tail, pair of shoes, or complete robot head replace default feathers without breaking the pose, while a hat or necklace remains an overlay.

Groups may also declare `slotZIndexOverrides`. The runtime temporarily applies these depths to the resolved base-slot bone and restores the original depth when the group is removed or its skin changes. This lets a replacement child follow the hidden base transform while moving its whole render branch above or below siblings.

Slot tracks and follower bones resolve against the slot's base transform: manual replacement, active skin, slot default, then an active group only when no base exists. An overlay can therefore share the `Head` slot with the body head without becoming the target of `Head` animation or parenting itself. Selection APIs still report the active group when callers need the visible overlay choice.

Portable attachment metadata also controls legacy rendering semantics:

- `texture.layoutScale` changes logical texture bounds while retaining the original sampled pixels and atlas frame.
- `depthTarget: 'bone'` places `zIndex` on the attachment's bone and keeps the sprite depth at zero.
- Both fields are optional; ordinary rigs retain scale `1` and attachment-targeted depth.

For deterministic previews and sprite-sheet export, start a clip and seek its layer in milliseconds:

```ts
rig.play('walk', { layer: 'export', repeat: 0 });
rig.seek(250, 'export');
```

Loop clips can use `loopMode: 'ping-pong'`. The runtime plays forward and then backward before repeating, so the loop returns continuously to its first pose instead of snapping. Use ordinary `repeat` for clips whose authored last pose already matches their first pose; actions that should finish must set `loop: false`.

Clips are validated whether you `registerClip` them or hand one straight to `play`. A keyframe may carry only `timeMs`, `durationMs`, `ease`, and the contract's animatable properties — `x`, `y`, `rotation`, `scaleX`, `scaleY`, `alpha`, `visible`, `tint` — each of the declared type. Any other property is rejected rather than forwarded, so clip data loaded from JSON cannot reach the animation library's own options or write arbitrary properties onto a display node.

Dispose the runtime and destroy the factory root when the character leaves its owning scene.
