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

Dispose the runtime and destroy the factory root when the character leaves its owning scene.
