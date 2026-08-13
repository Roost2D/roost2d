# Changelog

## 0.2.0 - 2026-08-13

- Add portable Chikn/Roostr character recipes for multi-trait builders and animation exports.
- Let attachment groups declare the base slots they replace, so tail and feet traits do not retain default feathers underneath while head traits remain overlays.
- Add deterministic animation seeking for previews and sprite-sheet capture.
- Add a deterministic trait hierarchy: tail above body torso, torso below the foreground wing, neck above torso, head above neck/base head, and feet above their base branches.
- Correct single-image feet placement before replacing both feet.
- Add repeat and ping-pong loop semantics, including a closed symmetric two-step walk, while keeping actions as one-shots.

## 0.1.0

First stable-channel release of the 13 lockstep Roost2D packages.

- Framework-neutral runtime, assets, rigging, input, audio, effects, isometric, networking, diagnostics, and tooling packages.
- PixiJS v8 adapter with integrity-checked atlas loading and deterministic resource teardown.
- Chikn and Roostr rig conversion with skin-aware trait following, portable layout scale, bone-owned depth, and unique-skin support.
- Reproducible package verification, npm trusted-publisher provenance, public API snapshots, and consumer smoke coverage.

See [Stability and compatibility](docs/stability.md) for the `0.1.x` support policy.
