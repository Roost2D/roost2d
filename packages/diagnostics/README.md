# @roost2d/diagnostics

Opt-in frame samples, counters, timings, memory readings, overlays, and JSON snapshots.

```sh
npm install @roost2d/diagnostics
```

```ts
import { Diagnostics } from '@roost2d/diagnostics';
const diagnostics = new Diagnostics();
diagnostics.increment('spawned');
```

Keep diagnostics optional and out of authoritative gameplay decisions. [Package map](https://github.com/Roost2D/roost2d/blob/main/docs/packages.md).
