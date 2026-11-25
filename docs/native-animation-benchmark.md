# Native animation CPU benchmark

Measured on 25 November 2026 while preparing the unpublished Roost2D
`0.10.0-rc.1` and Chikn helper `0.7.0-rc.1` candidates.

This measures animation sampling and Pixi property updates in Node. It does
**not** measure browser frame rate, GPU rendering, texture uploads, media
decode, network transfer, battery use or mobile performance. Other work was
running on the machine; these are indicative single-run measurements, not a
controlled hardware comparison or a production frame-rate guarantee.

## Environment and inputs

- AMD Ryzen 7 2700X, 8 cores / 16 logical processors.
- 34,304,925,696 bytes physical RAM (about 31.95 GiB).
- Windows 11 Pro, version 10.0.26200; Node.js 24.20.0; PixiJS 8.19.0.
- Candidate working-tree Rig2D and Pixi implementations, including the native
  overlay lifetime correction. The published-source comparison uses Rig2D
  `v0.9.0` (`c39262ab95b102dddd7a8c423661bcad5f3c5b09`).
- Pinned Chikn Coqfight source from the companion asset worktree, captured on
  25 November at 06:17:53 UTC. Chikn skeleton SHA-256:
  `455053a552e8670a8aacaf77c7265a05cc63acf5f749030860deb7c3bba52f28`.
- Official recipe: `chikn.coqfight-character/v1`, set `coqfight-v1`, species
  `chikn`, body `Bullion`, `traitSkinIds: []`, animation `Idle` or `Punch`.
  The source is converted with `importSpine42`, then pruned with the companion
  helper's `composeCoqfightDefinition`. All 41 source clips are registered.
- Authored recipe: species `chikn`, skin `Bullion`, no traits, animation
  `chikn.idle_breathe` or `chikn.attack`. The existing `convertLegacyRig` and
  `convertLegacyAnimations` load the released authored data; all 40 legacy
  clips are registered. Procedural trait actions are not part of this workload.

## Procedure

Run an ESM Node harness with `--expose-gc` from the engine checkout:

1. Parse input metadata before measuring scene allocation. Convert the official
   data and compose the selected body, including required default attachments.
2. Create one placeholder Pixi `TextureSource` and `Texture` with 16,384-square
   logical bounds. Map every required asset ID to this texture. There are no
   decoded image bytes and no renderer/GPU allocation; the large logical bounds
   allow existing authored texture-region crops to validate.
3. Call `global.gc()`, record `heapUsed`, then construct 20 independent
   `PixiRigFactory` / `RigRuntime` pairs. Register the whole clip catalog, select
   Bullion, and play the chosen clip with `{ controlled: true }`. Record total
   construction time; collect garbage again and record the retained JS heap
   increase. This heap number excludes already parsed source metadata.
4. Run 500 frames. On frame `f`, sample rig `i` at
   `(f * 16.6667 + i * 2.1) % (clip.durationMs - 0.001)` milliseconds. Measure
   the duration of all 20 `handle.sample(...)` calls with `performance.now()`.
   Discard the first 100 frames; sort the remaining 400 values and use indices
   200 and 380 for p50 and p95. Different offsets avoid sampling every actor at
   the same point in its curve.
5. Dispose every rig and factory, then destroy the placeholder texture/source.
   Repeat for the next workload.

## Candidate authored/native comparison

Times are milliseconds **per group of 20 characters**, not per character.

| Workload | p50 | p95 | Maximum | Construction, 20 rigs | Retained JS heap |
| --- | ---: | ---: | ---: | ---: | ---: |
| Authored idle | 0.061 | 0.098 | 0.382 | 114.4 | 19.84 MiB |
| Native Idle | 1.068 | 1.851 | 6.805 | 202.4 | 2.45 MiB |
| Authored attack | 0.077 | 0.195 | 3.673 | 143.7 | 19.28 MiB |
| Native Punch | 0.750 | 1.289 | 7.976 | 177.2 | 2.50 MiB |

The sampled native Idle/Punch clips contain 112/86 channels, respectively.
The corresponding authored clips have three legacy tracks. These moves have
different detail and duration, so the numbers are not a like-for-like measure
of mathematical sampler efficiency.

The selected native recipe allocates 13 attachment sprites per character
(260 total). The current authored loader retains 263 attachment sprites per
character (5,260 total), including hidden body/trait variants. Much of the
scene-heap difference comes from selected-only construction; it must not be
described as lower GPU texture memory or a smaller complete asset corpus.

## Authored runtime regression check

A second, paired run used the same procedure and candidate Pixi factory for
both runtimes, changing only released `v0.9.0` versus candidate Rig2D. This
isolates the authored runtime path from renderer-version differences.

| Authored workload | Released 0.9.0 p50 / p95 | Candidate p50 / p95 |
| --- | ---: | ---: |
| Idle | 0.040 / 0.073 | 0.038 / 0.067 |
| Attack | 0.038 / 0.059 | 0.035 / 0.057 |

No authored sampling regression was observable in this small workload. The
differences are within the scope of timing noise and are not evidence of a
speed improvement. Native sampling remained below 2 ms at p95 for this
20-character CPU workload; browser rendering and target-device qualification
remain separate checks.

## Source key validation

An independent harness also checked both pinned species and all 41 clips. For
each non-shear source bone timeline, it sampled the native runtime at the
first and last raw key times and compared each local axis with the source
setup value plus the raw keyed offset (or multiplied scale), applying only
the documented y-axis and degree/radian conversion. Duplicate first-time
keys used the last value. All 14,952 assertions passed, with maximum absolute
error zero. This checks setup/key conversion and sampling boundaries; it is
not a browser image comparison or proof of intermediate-curve visual parity.
No Spine runtime or runtime implementation code was used in that harness.
