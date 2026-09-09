# @roost2d/chikn-rigs

Apache-2.0 Chikn/Roostr rig definitions and animation metadata for Roost2D. This package contains no Chikn images and grants no rights to the separately licensed artwork.

```sh
npm install @roost2d/contracts @roost2d/rig2d @roost2d/chikn-rigs
```

```ts
import {
  applyCharacterRecipe,
  CHARACTER_RECIPE_SCHEMA,
  loadChiknAnimations,
  loadChiknRig,
} from '@roost2d/chikn-rigs';
const [definition, clips] = await Promise.all([loadChiknRig(), loadChiknAnimations()]);

const recipe = {
  schema: CHARACTER_RECIPE_SCHEMA,
  species: 'chikn',
  skinId: 'Celestial',
  traitGroupIds: ['head/admiral', 'tail/golden-plumage'],
  animationId: 'chikn.walk',
};

applyCharacterRecipe(rig, recipe, definition, clips);
```

Both species ship the same 40 animation names, prefixed with `chikn.` or `roostr.`:

- Movement: `walk`, `slowed`, `fly`, `run`, `sneak`, `crouch`, `jump`, `fall`, `land`, `dodge`, `charge`, `swim`, `spawn_drop`
- Combat: `attack`, `peck`, `attack_peck`, `attack_heavy`, `block`, `parry`, `kick`, `wing_slap`, `headbutt`, `cast`
- Reactions: `hit`, `stagger`, `knockback`, `knockdown`, `get_up`, `death_burst`
- Emotes: `extraction_bow`, `draft_cheer`, `victory`, `wave`, `dance`, `panic`
- Ambient: `idle_breathe`, `idle_alert`, `sleep`, `eat`, `look_around`

Loop and loop-mode metadata travels with every clip. One-shots preserve their authored end pose, so call `resetPose()` before switching independently previewed actions; persistent states such as `knockdown` can instead flow directly into `get_up`.

Trait-aware brawler actions are resolved from the same recipe:

```ts
const choices = listAvailableChiknActions(recipe, definition);
const action = resolveChiknAction(recipe, definition, choices[0].id, {
  targetOffset: { x: 210, y: -24 }, // fighter-local; positive X is current forward
});
const playback = new RigActionController(rig).play(action.clip, { controlled: true });
playback.advance(frameMs);
```

Every attachment group receives one checked-in immutable profile with its supported actions, driver attachments, calibrated offsets and timing, functional preset, and explicit rigid/soft/dangling/cloth/feather/bulky/elastic secondary motion. Weapons replace Punch with their own draw, slash, thrust, golf, pickaxe, shot, swing, or casting motion. Feet select tailored paired or combined kicks, and `listChiknSpecials` returns only specials granted by equipped traits.

Golden Egg and Very Fresh Egg use a dedicated 1,000 ms action: the inner `pose` bone turns away while game-owned root facing stays untouched, the bird bends, the displayed egg releases at 400 ms, and a texture-identical detached clone follows an aimed arc until presentation contact at 800 ms. The equipped egg regrows and the setup pose returns at 1,000 ms. Floppy Disk and Omelette also launch exact equipped art; Omelette uses its pan motion and is never classified as an egg.

Resolve each `definition.attachments[].texture.assetId` through a separately hosted Chikn runtime manifest before creating the display factory. [Chikn integration tutorial](https://github.com/Roost2D/roost2d/blob/main/docs/chikn-assets.md).
