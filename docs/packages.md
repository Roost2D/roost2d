# Packages

All `@roost2d/*` packages use the same exact version. `@roost2d/contracts` is the foundation; `@roost2d/tooling` is Node-only. Rendering, animation, audio, input, effects, isometric projection, networking, and diagnostics stay modular.

`@roost2d/chikn-rigs` contains Apache-2.0 rig and animation metadata only. It resolves textures through a separate Chikn asset manifest and grants no rights to the artwork.

| Package | Purpose |
| --- | --- |
| `core` | runtime, scenes, fixed clock, events, services, scheduler, pools, seeded random |
| `contracts` | versioned assets, atlases, rights, rigs, and animation schemas |
| `assets` | profiles, aliases, bundles, integrity, cache, and explicit-host resolution |
| `pixi` | application host, layers, camera, cropped atlas textures, rig display adapter |
| `rig2d` | skins, exclusive trait groups, layered animation, mirroring, tint, lifecycle |
| `input` | actions, contexts, keyboard, pointer/touch gestures, and gamepad polling |
| `audio` | lazy sound definitions, buses, playlists, cooldowns, and concurrency |
| `effects` | deterministic tweens, shake, particles, trails, and pools |
| `isometric` | projection, depth, picking, bounds, anchors, and subtiles |
| `net` | transports, envelopes, snapshots, interpolation, and clock sync |
| `diagnostics` | counters, timings, frame samples, memory, overlay, and JSON export |
| `tooling` | scanning, validation, atlases, rights, scaffolding, and CLI |
| `chikn-rigs` | optional Apache-2.0 Chikn/Roostr metadata |
