# @roost2d/core

Renderer-neutral deterministic runtime primitives: scenes, fixed updates, events, services, scheduling, object pools, and seeded random.

```sh
npm install @roost2d/core
```

```ts
import { GameRuntime } from '@roost2d/core';
const runtime = new GameRuntime({ stepMs: 1000 / 60, seed: 42 });
runtime.registerScene('play', () => ({ id: 'play', fixedUpdate() {}, render() {} }));
await runtime.switchScene('play');
runtime.start();
```

Call `runtime.dispose()` when its application owner is removed. [Complete quick start](https://github.com/Roost2D/roost2d/blob/main/docs/getting-started.md).
