# Controlled actions and presentation cues

Roost2D keeps animation presentation separate from gameplay authority. A clip can mark anticipation, contact, release, recovery, and completion, but those cues never apply damage or confirm a hit.

```ts
const attack = rig.play(clip, {
  controlled: true,
  onCue({ cue, elapsedMs }) {
    if (cue.phase === 'release') showProjectileAt(rig.node('socket', 'muzzle'), elapsedMs);
  },
});

// Drive this from the game's render clock or from an authoritative action timestamp.
attack.advance(renderDeltaMs);

// Previews and exporters can sample silently in either direction.
attack.sample(240);
attack.sample(80);
```

`advance()` emits every cue crossed since the previous time, even when a slow frame skips over several. Each cue fires once per playback. `sample()` is silent by default, which makes backward scrubbing and deterministic frame export safe.

Use `RigActionController` for full-body, interruptible actions. It suspends the base locomotion layer, owns one action at a time, and restores the setup pose and mirrored facing after cancellation or completion. Supply `resumeLocomotion` when the character should return to an idle or run clip.

Named `RigSocketV1` records follow a bone, attachment, or resolved base slot. `rig.node('socket', id)` exposes the renderer-neutral socket node. `@roost2d/effects` supplies deterministic beam, slash, projectile, burst, and trail descriptors; `PixiProceduralEffect` renders those shapes under a Pixi rig socket.

The game still owns movement, hitboxes, damage, cooldowns, and network validation. Visual root displacement inside an action clip must not be copied into authoritative character position.
