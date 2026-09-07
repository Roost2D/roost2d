# @roost2d/blueprint

Portable game design, capability validation and deterministic sessions for authored game foundations. This renderer-neutral package contains no game artwork, game-specific simulation, network client or Node dependencies. Applications supply their own foundation implementations and statically imported extensions.

```sh
npm install @roost2d/blueprint@0.4.0 @roost2d/core@0.4.0
```

```ts
import { gameBlueprintSchema, BlueprintSession } from '@roost2d/blueprint';
const blueprint = gameBlueprintSchema.parse(savedDesign);
const session = new BlueprintSession(blueprint, foundationFactory, extensions);
session.advance(deltaMs, { x: 1, y: 0, primary: false, secondary: false });
```

`gameBlueprintSchema` is the shared runtime and structured-generation boundary. `blueprintJsonSchema` is its generated JSON Schema. Capability validation rejects incompatible movement, projection, goals, actions and unresolved extension references. IDs remain stable across edits. `BlueprintSession` resets the seeded random stream, fixed-step clock and registered extensions on restart. Input is sampled at fixed simulation steps; display size never enters simulation. See the Studio repository for the independently licensed reference games and art kits.

Extensions are ordinary compiled game code, not a security sandbox. Hosts must execute untrusted extensions only within their existing isolated game environment, never in a trusted control plane. Validation cannot prove arbitrary code safe or a game fun.

Extension `create(context)` receives the seeded random stream, event emitter, current snapshot and a `command()` function. Foundations explicitly accept or reject named commands. Update and event hooks execute on fixed simulation ticks, so consuming render events cannot change gameplay timing. Restart recreates extension instances and resets the simulation seed; hosts control pause independently.

Each art role has at most one active project-local override. Extension module paths and IDs are unique, and every declared extension must appear exactly once in the compiled registry.
