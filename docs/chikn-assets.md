# Integrate Chikn assets

Roost2D and Chikn content are deliberately separate releases:

- npm `@roost2d/*` packages contain engine code;
- npm `@chikn-game-assets/runtime` contains types, catalog IDs, and manifest URL helpers, but no images;
- a versioned Chikn runtime ZIP contains `runtime/manifest.json` plus generated `default` and `high` atlas pages;
- a versioned Chikn sources ZIP contains classified original images and metadata for editors, audits, and custom pipelines.

> Roost2D does not include, license, or sublicense Chikn, Roostr, or FarmLand visual assets. The separate asset repository hosts those assets with Chikn's permission for community non-commercial use. Commercial use requires a separate Chikn agreement.

Read the asset repository's [community asset notice](https://github.com/Roost2D/chikn-game-assets/blob/main/CHIKN-COMMUNITY-ASSET-NOTICE.md), [attribution guidance](https://github.com/Roost2D/chikn-game-assets/blob/main/ATTRIBUTION.md), and [commercial-use boundary](https://github.com/Roost2D/chikn-game-assets/blob/main/COMMERCIAL_USE.md).

This separation keeps npm installs small, makes the content-use boundary explicit, and lets each game pin, mirror, cache, or replace an immutable content release without changing engine code.

## 1. Install the browser packages

```sh
npm install pixi.js @roost2d/assets @roost2d/pixi @chikn-game-assets/runtime
```

For animated characters also install:

```sh
npm install @roost2d/contracts @roost2d/rig2d @roost2d/chikn-rigs
```

Keep all `@roost2d/*` packages on the same exact version.

## 2. Host one immutable runtime archive

Download `chikn-game-assets-vX.Y.Z-runtime.zip` from the matching GitHub Release, extract it under your static files or CDN, and preserve its directories. If extracted at `/vendor/chikn-vX.Y.Z/`, this URL must exist:

```text
/vendor/chikn-vX.Y.Z/runtime/manifest.json
```

Do not edit atlas pages or the manifest after release; integrity hashes intentionally make changes fail closed.

## 3. Load and display an asset

```ts
import { Sprite } from 'pixi.js';
import { loadChiknPack } from '@chikn-game-assets/runtime';
import { AssetManifestResolver, LazyAssetLoader } from '@roost2d/assets';
import { PixiApplicationHost, PixiAssetLoader } from '@roost2d/pixi';

const baseUrl = new URL('/vendor/chikn-vX.Y.Z/', window.location.origin);
const pack = await loadChiknPack({
  baseUrl,
  profile: matchMedia('(min-resolution: 2dppx)').matches ? 'high' : 'default',
});

const resolver = new AssetManifestResolver(pack.manifest, {
  baseUrl,
  profile: pack.profile,
});
const integrityLoader = new LazyAssetLoader(resolver);
const textures = new PixiAssetLoader(resolver, integrityLoader);
const host = await PixiApplicationHost.create({
  mount: document.querySelector<HTMLDivElement>('#app')!,
  resizeTo: window,
});

const sprite = new Sprite(await textures.load('chikn-flat/admiral'));
sprite.anchor.set(0.5);
sprite.position.set(240, 220);
host.app.stage.addChild(sprite);

window.addEventListener('beforeunload', () => {
  void textures.clear();
  host.dispose();
});
```

Never calculate atlas rectangles yourself. The resolver chooses the requested profile, and `PixiAssetLoader` creates a cropped texture backed by the shared atlas page.

## 4. Add a Chikn rig

`@roost2d/chikn-rigs` contains Apache-2.0 rig and animation metadata, not Chikn images. Load its portable definitions, preload each referenced texture through the content manifest, then create a `RigRuntime` with `PixiRigFactory`.

The Chikn/Roostr/FarmLand artwork remains owned and controlled by the Chikn rights-holder under Chikn's existing community terms. Rig structure, transforms, and animation timing are separate Apache-2.0 project metadata.

```ts
import { loadChiknPack } from '@chikn-game-assets/runtime';
import { AssetManifestResolver, LazyAssetLoader } from '@roost2d/assets';
import {
  loadChiknAnimations,
  loadChiknRig,
  mergeUniqueSkin,
  resolveUniqueSkin,
  uniqueAssetPrefix,
} from '@roost2d/chikn-rigs';
import { PixiApplicationHost, PixiAssetLoader, PixiRigFactory } from '@roost2d/pixi';
import { RigRuntime } from '@roost2d/rig2d';

const baseUrl = new URL('/vendor/chikn-vX.Y.Z/', window.location.origin);
const pack = await loadChiknPack({ baseUrl, profile: 'default' });
const resolver = new AssetManifestResolver(pack.manifest, { baseUrl, profile: pack.profile });
const textureLoader = new PixiAssetLoader(resolver, new LazyAssetLoader(resolver));
const host = await PixiApplicationHost.create({
  mount: document.querySelector<HTMLDivElement>('#app')!,
  resizeTo: window,
});

let definition = await loadChiknRig();
const clips = await loadChiknAnimations();

// Optional: merge one assembled unique skin. Its asset IDs come from the manifest.
const unique = resolveUniqueSkin('chikn', 1231)!;
definition = mergeUniqueSkin(
  definition,
  unique,
  pack.assetIds.filter((id) => id.startsWith(uniqueAssetPrefix(unique))),
);

const textureEntries = await Promise.all(
  [...new Map(definition.attachments.map(({ texture }) => [
    texture.frameId ? `${texture.assetId}#${texture.frameId}` : texture.assetId,
    texture,
  ])).entries()].map(async ([key, texture]) => [key, await textureLoader.load(texture.assetId)] as const),
);
const factory = new PixiRigFactory(new Map(textureEntries));
const rig = new RigRuntime(definition, factory, clips);
host.app.stage.addChild(factory.root);
factory.root.position.set(320, 360);

rig.applySkin(unique.skinId); // Or use definition.defaultSkinId for a normal skin.
rig.attachGroup('head/daft-punk');
rig.play('chikn.idle', { layer: 'base' });

window.addEventListener('beforeunload', () => {
  rig.dispose();
  factory.destroyRoot();
  void textureLoader.clear();
  host.dispose();
});
```

Application code does not apply Chikn/Roostr scale constants, move trait bones, or rewrite z-order. `@roost2d/chikn-rigs` records those adapter details in the portable rig definition, while `RigRuntime` and `PixiRigFactory` enforce them.

## 5. Replace the content pack

The engine does not require Chikn content. To use different or commercially cleared artwork, publish a `roost2d.assets/v1` manifest whose logical files point to your independently licensed images, then supply that manifest's base URL to the same `AssetManifestResolver` and `PixiAssetLoader` flow.

Your replacement pack may keep your game's preferred logical IDs; only the optional `@roost2d/chikn-rigs` metadata expects the `chikn.rig.*` aliases. Generic scenes, rendering, asset integrity, atlases, input, and simulation packages work without that adapter or the Chikn repository.

## Troubleshooting

- `404 runtime/manifest.json`: the supplied base URL points inside `runtime/` instead of to the directory above it, or the ZIP structure was flattened.
- whole atlas is visible: use `PixiAssetLoader.load(assetId)`, not `Assets.load(variant.path)` directly.
- SHA-256 failure: the hosted artifact changed or a proxy transformed it; redeploy the untouched release files.
- missing asset ID: inspect `@chikn-game-assets/runtime/catalog` or the release manifest rather than guessing filenames.
