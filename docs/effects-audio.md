# Effects and audio

Effects update with an explicit delta, making them suitable for fixed simulation or a caller-owned render clock:

```ts
const effect = scalePop(displayState, 0.25, 180);
effect.reset();
if (effect.update(deltaMs)) effects.release(effect);
```

Audio definitions are registered independently from decoded buffers. `AudioManager` lazy-loads sources, respects per-sound cooldown and concurrency, routes through mixer channels, and can resume on the first user interaction.

For ordered music, define tracks once and let the manager own completion and cancellation:

```ts
audio.definePlaylist('score', ['opening', 'battle']);
const score = audio.startPlaylist('score', { channel: 'music' });

// Stops the active source, pending retry timer, or a source that finishes loading late.
score.stop();
```

The next track starts only after the current source actually ends. Failed tracks are skipped; when every track in a looping cycle fails, playback retries after 30 seconds by default. `retryDelayMs` can override that policy. `stopPlaylist()` and manager disposal cancel all managed work. The lower-level `playNext()` API remains available for caller-owned sequencing.

Keep gameplay outcomes separate from audiovisual feedback. Muting a channel or dropping a particle must never alter deterministic state.
