# Roost2D

Roost2D is a modular TypeScript 2D game engine with deterministic simulation, optional PixiJS v8 rendering, portable asset/rig contracts, and Node-only build tooling. Install only the packages your game needs; all public `@roost2d/*` packages use one exact lockstep version and are Apache-2.0 licensed.

## Five-minute browser game

Create a Vanilla TypeScript project:

```sh
npm create vite@latest tiny-roost -- --template vanilla-ts
cd tiny-roost
npm install pixi.js @roost2d/core @roost2d/pixi
```

Replace `src/main.ts`:

```ts
import { Graphics } from 'pixi.js';
import { GameRuntime } from '@roost2d/core';
import { PixiApplicationHost } from '@roost2d/pixi';

const mount = document.querySelector<HTMLDivElement>('#app')!;
const host = await PixiApplicationHost.create({
  mount,
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

Run `npm run dev`. The simulation advances at a fixed 60 Hz while Pixi renders an interpolated position.

## Pick the packages you need

| Package | Use it for |
| --- | --- |
| `@roost2d/core` | scenes, fixed updates, events, services, scheduling, deterministic random |
| `@roost2d/blueprint` | validated game designs, deterministic foundation sessions, compiled extension lifecycle |
| `@roost2d/pixi` | Pixi application host, layers, camera, atlas textures, rig display adapter |
| `@roost2d/input` | keyboard, pointer/touch, gestures, gamepad, rebinding, input contexts |
| `@roost2d/assets` | explicit-host manifests, lazy bundles, aliases, integrity verification |
| `@roost2d/rig2d` | renderer-neutral skins, attachments, layered animation, tint/mirroring |
| `@roost2d/isometric` | grid projection, tile picking, bounds, depth ordering |
| `@roost2d/effects`, `audio`, `net`, `diagnostics` | optional production subsystems |
| `@roost2d/contracts` | portable manifest, atlas, rig, animation, and rights types |
| `@roost2d/tooling` | Node-only scanning, validation, deterministic atlases, and CLI |

Keep every installed `@roost2d/*` dependency on the same exact version. Browser code must not import `@roost2d/tooling`.

## Chikn content pack

Roost2D does not include or license Chikn, Roostr or FarmLand visual assets.

The separate [`Roost2D/chikn-game-assets`](https://github.com/Roost2D/chikn-game-assets) repository hosts Chikn assets with permission for community non-commercial use. It publishes content notices and technical integrity metadata independently from this Apache-2.0 engine.

Commercial use of those assets requires a separate Chikn agreement. Roost2D may be used commercially with independently licensed replacement assets under Apache-2.0. See [Integrate Chikn assets](docs/chikn-assets.md) for the loader, content notices, and replacement-pack instructions.

## Documentation and coding agents

- [Getting started](docs/getting-started.md)
- [Architecture and package boundaries](docs/architecture.md)
- [Package map](docs/packages.md)
- [Chikn asset integration](docs/chikn-assets.md)
- [Release operator runbook](docs/tooling-releases.md#release-operator-runbook)
- [Stability and compatibility](docs/stability.md)
- [Changelog](CHANGELOG.md)
- [Agent guide](AGENTS.md) and [compact model context](llms.txt)
- Compiled reference application: [`apps/showcase`](apps/showcase)

## Repository checks

```sh
npm ci
npm run release:verify
```

`release:verify` builds, type-checks, tests, compiles the showcase/docs, validates package boundaries, and dry-runs all 14 npm package tarballs. Publishing remains a separate trusted-publisher workflow.
