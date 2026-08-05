# Roost2D coding-agent guide

## Read first

1. Read `llms.txt`.
2. Read `docs/architecture.md` and the README for the package being changed.
3. Inspect only the target package source/tests plus directly affected consumers.

## Architecture rules

- Public packages are TypeScript ESM and release in lockstep.
- `@roost2d/contracts` owns serialized asset, atlas, rig, animation, and rights boundaries.
- `@roost2d/tooling` is Node-only. Browser packages must never import it, Sharp, or Node built-ins.
- `@roost2d/rig2d` is renderer-neutral. Pixi display objects belong in `@roost2d/pixi`.
- Game-specific rules and image content stay outside the engine.
- `@roost2d/chikn-rigs` contains Apache-2.0 rig/animation metadata only; it does not grant rights to, bundle, or require Chikn artwork.
- Roost2D does not license or sublicense Chikn/Roostr/FarmLand visual content. The separate asset repository documents Chikn's community non-commercial boundary.

## Source and generated files

- Edit `packages/*/src`, tests, docs, and app source.
- Do not hand-edit `dist`, VitePress output, or package tarballs.
- Keep internal `@roost2d/*` dependencies on the exact root version.
- Add public exports only through the owning package's `src/index.ts`.

## Validation

Use the smallest relevant package build/test while iterating. Before a release-ready change run:

```sh
npm ci
npm run release:verify
```

The release gate compiles all packages, tests all public entry points, builds the showcase/docs, checks boundaries, and inspects all 13 npm tarballs.

## Releases

- Do not publish from a development task unless the user explicitly authorizes a release.
- RC versions contain a prerelease suffix and publish to `next`; stable versions publish to `latest`.
- Publish Roost2D before the separately versioned Chikn asset runtime, then run cross-repository verification.

## Integration references

- Engine quick start: `docs/getting-started.md`
- Chikn artifact integration: `docs/chikn-assets.md`
- Complete compiled reference: `apps/showcase`
