# @roost2d/audio

Web Audio channel mixing and lazy sound management with cooldown, concurrency, and playlist primitives.

```sh
npm install @roost2d/audio
```

```ts
import { AudioManager } from '@roost2d/audio';
const audio = new AudioManager(new AudioContext());
const mixer = audio.mixer;
```

Managed playlists wait for each source to finish, skip unavailable tracks, and retry a fully failed loop after a bounded backoff:

```ts
audio.registerMany([
  { id: 'opening', url: '/audio/opening.ogg' },
  { id: 'battle', url: '/audio/battle.ogg' },
]);
audio.definePlaylist('score', ['opening', 'battle']);
const score = audio.startPlaylist('score', { channel: 'music' });
score.stop();
```

Create/resume audio only after user interaction and dispose the owning manager with its scene or application. [Effects and audio guide](https://github.com/Roost2D/roost2d/blob/main/docs/effects-audio.md).
