# Networking

`@roost2d/net` provides transport and presentation primitives, not authoritative gameplay rules.

```ts
const wire = encodeEnvelope('input', crypto.randomUUID(), command);
transport.send(wire);

snapshots.push({ timeMs: serverTime, value: state });
const visible = interpolator.sample(performance.now(), clock.offsetMs);
```

`LocalWorkerTransport` and `SocketTransport` share one lifecycle interface. The snapshot buffer maintains time order, the interpolator renders behind server time, and clock synchronization uses a bounded median offset to limit outliers.

Validate application payloads at your own protocol boundary.
