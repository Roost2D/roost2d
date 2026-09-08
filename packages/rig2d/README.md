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
