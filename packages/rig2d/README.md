# @roost2d/rig2d

Renderer-neutral skins, exclusive attachment groups, mirroring, tinting, and layered GSAP-backed animation.

```sh
npm install @roost2d/contracts @roost2d/rig2d gsap
```

```ts
import { RigRuntime } from '@roost2d/rig2d';
const rig = new RigRuntime(definition, displayFactory, clips);
rig.applySkin('default');
rig.play('idle', { layer: 'base' });
```

For realtime actions, pass `controlled: true` and call `advance(deltaMs)` from the game clock. `sample(timeMs)` supports silent scrubbing and export, while animation cues report presentation timing without applying gameplay effects. `RigActionController` owns interruption and pose restoration.

The display factory owns renderer objects; dispose the rig and its factory together. [Rig2D guide](https://github.com/Roost2D/roost2d/blob/main/docs/rig2d.md).

Attachment groups can set `slotClipRects` on active base sprites. Rectangles use attachment-local layout coordinates; they follow animation/mirroring and are cleared when the group is removed. Renderer adapters supporting these groups must honor `RigDisplayNode.clipRect`. `PixiRigFactory` supplies the owned mask implementation.

Native `roost2d.rig/v2` definitions and `roost2d.animation/v2` sampled clips use the same constructor and playback handles:

```ts
const rig = new RigRuntime(nativeDefinition, displayFactory, nativeClips);
const playback = rig.play(nativeClips[0], { controlled: true, repeat: 0 });
playback.advance(frameMs);
playback.sample(250); // silent, deterministic scrubbing in milliseconds
```

V2 rigs require the display factory's `setDrawOrder(attachments)` capability; unsupported factories fail before creating display objects. V1 factories and authored clips continue to work. The native sampler preserves independent axes, signed scales, cubic/stepped curves, skin-relative attachment swaps and slot RGBA. Slot color multiplies original attachment color/opacity and game tint. Use an unanimated outer bone for game-owned position/facing and animate source poses beneath it. `resetPose()` restores setup color and attachment selection while preserving equipped appearance and facing; `RigActionController` also restores these after an action is cancelled or completes.
