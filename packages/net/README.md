# @roost2d/net

Transport-neutral envelopes, message channels, WebSocket/worker adapters, snapshot buffers, interpolation, and clock synchronization.

```sh
npm install @roost2d/net
```

```ts
import { decodeEnvelope, encodeEnvelope } from '@roost2d/net';
const message = encodeEnvelope('move', crypto.randomUUID(), { x: 2, y: 3 });
decodeEnvelope(message);
```

Authoritative simulation rules belong outside transports. [Networking guide](https://github.com/Roost2D/roost2d/blob/main/docs/networking.md).
