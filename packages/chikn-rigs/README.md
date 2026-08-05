# @roost2d/chikn-rigs

Apache-2.0 Chikn/Roostr rig definitions and animation metadata for Roost2D. This package contains no Chikn images and grants no rights to the separately licensed artwork.

```sh
npm install @roost2d/contracts @roost2d/rig2d @roost2d/chikn-rigs
```

```ts
import { loadChiknAnimations, loadChiknRig } from '@roost2d/chikn-rigs';
const [definition, clips] = await Promise.all([loadChiknRig(), loadChiknAnimations()]);
```

Resolve each `definition.attachments[].texture.assetId` through a separately hosted Chikn runtime manifest before creating the display factory. [Chikn integration tutorial](https://github.com/Roost2D/roost2d/blob/main/docs/chikn-assets.md).
