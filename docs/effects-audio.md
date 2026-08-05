# Effects and audio

Effects update with an explicit delta, making them suitable for fixed simulation or a caller-owned render clock:

```ts
const effect = scalePop(displayState, 0.25, 180);
effect.reset();
if (effect.update(deltaMs)) effects.release(effect);
```

Audio definitions are registered independently from decoded buffers. `AudioManager` lazy-loads sources, respects per-sound cooldown and concurrency, routes through mixer channels, and can resume on the first user interaction.

Keep gameplay outcomes separate from audiovisual feedback. Muting a channel or dropping a particle must never alter deterministic state.
