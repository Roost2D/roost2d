# @roost2d/effects

Renderer-neutral timed effects, easing, shake, particles, trails, and pooling.

```sh
npm install @roost2d/effects
```

```ts
import { scalePop } from '@roost2d/effects';
const effect = scalePop(target, 0.2, 180);
effect.update(deltaMs);
```

Effects mutate small structural targets rather than importing a renderer. [Effects guide](https://github.com/Roost2D/roost2d/blob/main/docs/effects-audio.md).
