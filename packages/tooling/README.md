# @roost2d/tooling

Node-only CLI and APIs for asset inspection, deterministic atlas building, schema/rights validation, budgets, and project scaffolding.

```sh
npm install --save-dev @roost2d/tooling
npx roost2d assets validate ./runtime/manifest.json
```

Never import this package from browser code. Its only Roost2D runtime dependency is `@roost2d/contracts`. [Tooling and release guide](https://github.com/Roost2D/roost2d/blob/main/docs/tooling-releases.md).

## Native region animation import

`importSpine42(json, { id, resolveTexture })` converts the supported subset of Spine 4.2
JSON into `roost2d.rig/v2` and `roost2d.animation/v2` data at build time. The callback
maps each upstream image path to a caller-owned `TextureRef`; no media or source
animation data is bundled with this package. The result contains `definition`,
`clips`, and the exact upstream body, trait, and animation names in `metadata`.

The importer preserves setup-relative transforms, separate-axis and cubic curves,
negative scales, named attachment swaps, null visibility, and RGBA channels. It
converts pixels/y-up/degrees to pixels/y-down/radians and adds an unanimated
presentation root so application mirroring cannot be overwritten by a source clip.
Texture display dimensions must match the callback's source `width`/`height`
context, using `TextureRef.layoutScale` when needed.

Meshes, constraints, nonzero shear, non-normal inheritance, blend modes, events,
animated draw order, and sequences are rejected explicitly. This is a bounded
native-data importer, not a general Spine runtime. Original source rights remain
applicable to converted data. The independently authored importer code is Apache-2.0.
