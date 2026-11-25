# Native animation release 0.10.0

The owner explicitly requested publication of all new libraries, merge, and public
site updates on 25 November 2026, then selected stable releases, both starters and
all related sites and requested implementation of that release plan.

This records release authorization for the completed source, not a claim of a new
owner visual sign-off. The exact portable source fingerprint is
`0d698055f15b8a22b3e87775cc0cca66b93f653f453bdcb8a459f32fcf3b617b`.
The previous 0.9.0 approval remains in the historical record.

The implementation preserves authored V1 rigs/actions and adds explicit V2 native
rig/animation contracts, cubic/stepped sampling, attachment-name/null channels,
slot RGBA and global Pixi slot order. Official source-derived data stays in the
separately licensed asset pack. No Spine runtime is bundled.

Before release, the library gate and CI passed, 14,952 independently sampled source
axis assertions matched, and desktop/mobile previews were inspected. Selected-clip
framing covers Headbutt, RifleShot and Death/replay. The benchmark documents its
CPU-only limitations in native-animation-benchmark.md.

Publish release candidates to `next`, verify the registry consumer, then publish
stable 0.10.0 with companion asset runtime 0.7.0 to `latest`. Recheck the exact
registry tarballs and the isolated production Character adapter before tags and
site publication. Do not reuse local rehearsal tarballs under registry identities.
