# Architecture

```text
@roost2d/contracts ─── @roost2d/assets ─── @roost2d/pixi
         │                     │                  │
         ├── @roost2d/rig2d ───┴──────────────────┘
         ├── @roost2d/chikn-rigs
         └── @roost2d/tooling (Node-only)

@roost2d/core        @roost2d/input       @roost2d/audio
@roost2d/effects     @roost2d/isometric   @roost2d/net
@roost2d/diagnostics
```

`@roost2d/contracts` owns serializable boundaries. Runtime packages never import tooling. `@roost2d/tooling` can import contracts, Sharp, and Node built-ins, but never the Pixi or Rig2D browser runtime.

Game-specific rules and art remain outside the engine. `@roost2d/chikn-rigs` is an optional Apache-2.0 metadata adapter and does not bundle, license, or require the separate Chikn image corpus.
