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

Native sampled data uses the explicit `RigDefinitionV2` and `AnimationClipV2` schemas. `RigDefinition` and `AnimationClip` are the corresponding V1/V2 unions, and the existing validators dispatch by schema. V1 rig definitions and GSAP-style clips retain their behavior.

V2 rig slots define the global back-to-front order through their array position. Skin attachment-name tables resolve logical names against the selected skin and then `default`; a null attachment key hides its slot. Native numeric channels contain absolute y-down/radian engine values, with linear, stepped or outgoing cubic curves. Cubic control points are absolute `[timeMs, value, timeMs, value]` tuples, preserving value overshoot. At equal timestamps the final key wins. Slot RGBA channels use normalized components.
