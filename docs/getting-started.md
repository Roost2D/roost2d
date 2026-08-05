# Getting started

## 1. Create a project

```sh
npm create vite@latest tiny-roost -- --template vanilla-ts
cd tiny-roost
npm install pixi.js @roost2d/core @roost2d/pixi
```

Release candidates are installed with `@next`, for example `@roost2d/core@next`. Pin all Roost2D packages to the same exact resolved version in your application.

## 2. Mount Pixi and start a deterministic scene

Use this complete `src/main.ts`:

```ts
import { Graphics } from 'pixi.js';
import { GameRuntime } from '@roost2d/core';
import { PixiApplicationHost } from '@roost2d/pixi';

const host = await PixiApplicationHost.create({
  mount: document.querySelector<HTMLDivElement>('#app')!,
  resizeTo: window,
  background: '#101827',
});

const player = new Graphics().circle(0, 0, 18).fill(0xf6b73c);
player.y = 120;
host.app.stage.addChild(player);

let previousX = 80;
let currentX = 80;
const runtime = new GameRuntime({ stepMs: 1000 / 60, seed: 42 });
runtime.registerScene('play', () => ({
  id: 'play',
  fixedUpdate({ deltaMs }) {
    previousX = currentX;
    currentX = (currentX + deltaMs * 0.12) % Math.max(240, host.app.renderer.width);
  },
  render(_deltaMs, alpha) {
    player.x = previousX + (currentX - previousX) * alpha;
  },
}));

await runtime.switchScene('play');
runtime.start();

window.addEventListener('beforeunload', () => {
  void runtime.dispose();
  host.dispose();
});
```

`fixedUpdate` is where authoritative simulation belongs. `render` receives interpolation alpha and should update display state without changing gameplay outcomes.

## 3. Add systems incrementally

- [Input](/input): named keyboard, pointer/touch, and gamepad actions.
- [Assets](/assets): explicit-host manifests, integrity, and lazy bundles.
- [Rig2D](/rig2d): skins, traits, and layered animation.
- [Isometric worlds](/isometric): projection, picking, and depth.
- [Effects and audio](/effects-audio): feedback with explicit lifecycle.
- [Networking](/networking): transport-neutral messages and interpolation.
- [Chikn assets](/chikn-assets): consume the separate image release safely.

The compiled [`apps/showcase`](https://github.com/Roost2D/roost2d/tree/main/apps/showcase) demonstrates these systems together.

## 4. Production lifecycle

Own resources at the scene or application level. Dispose input listeners, rigs, loaded textures, the runtime, and the Pixi host when their owner is removed. Build-time tooling stays in Node/CI and never enters the browser dependency graph.
