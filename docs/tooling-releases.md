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
