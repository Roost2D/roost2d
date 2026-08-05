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

Clips are validated whether you `registerClip` them or hand one straight to `play`. A keyframe may carry only `timeMs`, `durationMs`, `ease`, and the contract's animatable properties — `x`, `y`, `rotation`, `scaleX`, `scaleY`, `alpha`, `visible`, `tint` — each of the declared type. Any other property is rejected rather than forwarded, so clip data loaded from JSON cannot reach the animation library's own options or write arbitrary properties onto a display node.

Dispose the runtime and destroy the factory root when the character leaves its owning scene.
