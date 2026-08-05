# @roost2d/tooling

Node-only CLI and APIs for asset inspection, deterministic atlas building, schema/rights validation, budgets, and project scaffolding.

```sh
npm install --save-dev @roost2d/tooling
npx roost2d assets validate ./runtime/manifest.json
```

Never import this package from browser code. Its only Roost2D runtime dependency is `@roost2d/contracts`. [Tooling and release guide](https://github.com/Roost2D/roost2d/blob/main/docs/tooling-releases.md).
