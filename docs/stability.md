# Stability and compatibility

`0.1.0` is Roost2D's first stable npm-channel release. The major version remains zero while the
engine is still establishing its broader ecosystem, but the following project policy is stricter
than bare SemVer permits for `0.x` packages:

- all 13 public `@roost2d/*` packages ship in lockstep and consumers should pin one exact version;
- public exports captured in `reports/public-api.json` are preserved throughout `0.1.x` unless a
  security or correctness defect makes that impossible;
- removals require a documented deprecation path and a release note;
- asset manifest, rig, animation, and rights schemas remain backward-compatible throughout `0.1.x`;
- Node.js `>=22.14.0`, PixiJS v8, and GSAP 3 are the supported baseline for this line.

Release candidates remain on npm's `next` tag. Versions without a prerelease suffix are published
only to `latest` after package, showcase, documentation, and cross-repository verification pass.
