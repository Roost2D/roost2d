# Security policy

## Supported versions

Roost2D publishes all `@roost2d/*` packages in lockstep at a single version. Security fixes land on
the most recent released line only.

| Version | Supported |
| --- | --- |
| 0.1.x (including `-rc` prereleases) | Yes |
| Older prereleases | No |

## Reporting a vulnerability

Report privately through GitHub's **[private vulnerability reporting](https://github.com/Roost2D/roost2d/security/advisories/new)**
— Security → Report a vulnerability on this repository. Please do not open a public issue for
anything exploitable.

Include the affected package and version, what an attacker gains, and a reproduction (a manifest,
rig, animation, or atlas file is usually enough). We aim to acknowledge within three working days
and to ship a fix or a mitigation plan within 30 days, crediting you in the advisory unless you
prefer otherwise.

## Threat model

The engine treats these inputs as untrusted and validates them before use:

- **Asset, atlas, rig, and animation JSON.** `@roost2d/contracts` validators accept `unknown`,
  return error arrays rather than throwing, and confine every declared path to the directory it
  resolves against — no schemes, authorities, dot segments, or encoded separators.
- **Asset bytes.** `@roost2d/assets` enforces a streamed transfer cap before buffering, then checks
  the declared length and a SHA-256 digest. `@roost2d/pixi` decodes textures **only** from those
  verified bytes, never from a second fetch of the same URL.
- **Animation keyframes.** Only the contract's own properties reach the animation library; a clip
  cannot set arbitrary properties on a display node.
- **Network envelopes.** `@roost2d/net` validates envelope shape before delivery. Payload contents
  are the application's responsibility.

Out of scope: `@roost2d/tooling` runs as a trusted local developer CLI, so its build configuration
(atlas source and output directories) is treated as trusted input, though manifest and atlas *data*
it reads is not. The engine provides no sandbox for game code, and `SeededRandom` is explicitly a
gameplay PRNG, not a cryptographic one.

## Development dependencies

`npm audit` reports advisories reachable only through VitePress, which builds the documentation
site. They do not ship in any published tarball; `npm audit --omit=dev` is clean. Dependabot tracks
them weekly.
