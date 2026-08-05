# @roost2d/contracts

Portable TypeScript contracts and validators for Roost2D asset manifests, atlases, rights records, rigs, and animation clips.

```sh
npm install @roost2d/contracts
```

```ts
import { validateAssetManifest, type AssetManifestV1 } from '@roost2d/contracts';
const errors = validateAssetManifest(manifest as AssetManifestV1);
```

This package has no browser, renderer, or Node tooling dependency. Keep its version identical to every other installed `@roost2d/*` package. [Contracts and architecture](https://github.com/Roost2D/roost2d/blob/main/docs/architecture.md).
