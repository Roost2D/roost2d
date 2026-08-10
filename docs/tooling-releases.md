# Tooling and releases

The `roost2d` CLI is Node-only:

```sh
roost2d assets scan ./art
roost2d assets validate ./runtime/manifest.json
roost2d atlas build ./atlas.config.json
roost2d rig validate ./rig.json
roost2d animation validate ./idle.json --rig ./rig.json
roost2d licenses validate ./rights-manifest.json
roost2d project create ./my-game
```

Atlas builds are deterministic and support profiles, padding, extrusion, power-of-two pages, and dry runs. CI also enforces the package boundary that keeps tooling out of browser runtime graphs.

Release candidates publish all lockstep packages under npm's `next` tag. A consumer smoke workspace imports all 13 package entry points before stable promotion to `latest`.

## Release operator runbook

Publishing is a separate, explicit operation. Never publish from an ordinary development or
verification task.

### One-time registry bootstrap

The first `0.1.0-rc.0` release needs one local authenticated publish because npm only allows a
trusted publisher to be configured for a package that already exists. Confirm that the npm account
has 2FA and publish rights for the `@roost2d` scope, then run:

```sh
npm login
npm whoami
npm run release:verify
node scripts/publish-packages.mjs next --bootstrap
```

`--bootstrap` is intentionally restricted to `next` and omits provenance because it runs outside
GitHub's OIDC environment. It is only for creating the 13 package records. Afterward, configure the
trusted publisher on **each** package:

- GitHub owner/repository: `Roost2D/roost2d`
- workflow filename: `publish.yml`
- GitHub environment: `npm-publish`
- allowed action: `npm publish`

The workflow uses npm 11.5.2, GitHub-hosted runners, and `id-token: write`; it does not need an
`NPM_TOKEN` or a maintainer's local npm login. The OIDC permission exists only in the final publish
job. Dependency installation, builds, tests, and tarball creation happen in a separate job without
an npm publishing credential. npm trusted publishing adds provenance automatically. A retry after a
partial 13-package publish skips only versions whose registry integrity exactly matches the verified
tarball and whose requested dist-tag is already correct, then checks every package/version/tag before
succeeding. Dist-tag repair remains an explicit operator action rather than expanding the OIDC job's
authority beyond publishing.

The npm-side trusted publisher must be configured separately for all 13 `@roost2d/*` packages.
Configuring only one package does not grant the workflow access to the other package records.

### Release candidate

1. Update the root and all 13 public package versions to the same `X.Y.Z-rc.N` value.
2. Commit and push to `main`; wait for CI and `npm run release:verify` to pass.
3. Dispatch **Publish packages** with `tag=next`, then inspect the npm package pages and dist-tags.
4. Publish `@chikn-game-assets/runtime` to `next` from its repository.
5. Dispatch that repository's **Cross-repository verification** with both tags set to `next`.

### Stable release

1. Replace the prerelease versions with a new lockstep stable `X.Y.Z` version and pass CI again.
2. Dispatch **Publish packages** with `tag=latest`.
3. Publish the stable Chikn runtime to `latest`, then run its cross-repository verification with
   both tags set to `latest`.
4. Create the matching annotated `vX.Y.Z` tag and GitHub release notes from `CHANGELOG.md` only after
   both registries and the Roost Rift consumer canary pass.

An npm name/version pair is immutable. Never try to reuse an RC version for stable; publish a new
version without the prerelease suffix.
