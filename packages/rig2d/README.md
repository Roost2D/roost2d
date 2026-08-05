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

The display factory owns renderer objects; dispose the rig and its factory together. [Rig2D guide](https://github.com/Roost2D/roost2d/blob/main/docs/rig2d.md).
