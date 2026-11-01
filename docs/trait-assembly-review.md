# Chikn and Roostr assembly candidate

The owner authorized release on 1 November 2026 with the final general coat-leg correction. See [release evidence and integration notes](./release-0.8.0.md). The approval gate binds that decision to the exact rig/rendering source.

The companion `chikn-game-assets` review worktree provides `/review.html`. It uses the same `RigRuntime`, `PixiRigFactory`, manifest resolver, integrity checks, and layout-scaled textures as game consumers. Set `ROOST2D_REVIEW_ROOT` to this worktree to preview its built packages without modifying any game's dependencies.

## Corrections

- Four coloured Chikn feet now contain both toes and both matching shins, attached to the four animated limb slots. Existing logical aliases resolve the deduplicated images; no image is copied or added.
- Roostr greaves, golden greaves, spurs, Ball'n Chain, and IronClaw retain the underlying feet. They are ankle/leg overlays, not whole-foot replacements.
- Roostr composite feet replace both shins as well as both toes, eliminating the yellow legs behind coloured legs.
- Eggs, exhausts, Nyan, LED, flames and perched Roostr riders preserve the NFT's underlying tail feathers; replacement plumage still hides the original tail. Overlay tails retain the base branch depth instead of lifting the entire tail above the body.
- Trait metadata can explicitly select `follow_slot` and `render_order`. Category defaults no longer overwrite a deliberately authored rear panel or body attachment.
- The owner's 44 held torso props stay behind the front wing. All 13 coat-like garments, including both breastplates, cover that wing: their groups lower Wing A to depth 8, below the garment at 9 and head at 10. Both upper-leg branches are lowered below the torso sprite (front -0.5, rear -1.5), so all descendant shins, toes and footwear stay behind the garment. Removing a garment restores Wing A to 11 and both original leg depths. Display-hierarchy tests cover both rules on all base skins. Muscles, tentacles and claws use matching front/rear wing followers, with rear arms behind the torso. Shorts replace upper-leg feather panels while preserving animated leg bones.
- Chikn Super Saiyan and long hair have revised positions; long tresses sit behind the face with a cropped fringe above it. Necklaces move slightly right, eggs render behind tail feathers, and exhaust/second-head positions are corrected. Cutlass keeps its original V2 right-pointing texture without a local mirror; Broadsword uses its opposite-facing source art with a horizontal flip. Both grips follow the front wing. Samurai's helmet offsets the base head's authored tilt, its rear flap renders behind the head, and a reversible head clip conceals the comb while retaining the face.
- Roostr All Stars, Blue Timbs, Sneaker Head and Buckaroo soles align with the base feet. Ball'n Chain retains both feet and aligns its cuff to the ankle. The jockey follows the back upright; shoulder armour and breastplates follow the torso.
- The 1 November correction calibrates Super Saiyan and PermaBull against V2 facial anchors, compensating for the rig's base head tilt. PermaBull's near horn renders in front and its far horn behind the head, without local mirroring. Sneaker Head has independently aligned shoes. Chikn Jockey is smaller and seated on the back; its `anchored` secondary-motion profile adds no independent offset, rotation or scale during actions.
- Missing Roostr chains reuse cropped chain textures from the existing official Chikn art. `TextureRef.region` specifies original-image coordinates before `layoutScale`; Pixi supports these regions on trimmed, unrotated or clockwise atlas frames. No source artwork is changed or duplicated. Segmented necklaces/fringes remain rigid relative to their follower during action reactions.
- Both species' rear Boxhead panels render behind the base head. Roostr rear party-hat, Sesh Hat, Bucket, Panic Buy and Rosebud pieces preserve the face; loose hat backs no longer float at neck height. Roostr horns, helmet, Rosebud and multipart shoulder armour have calibrated placements. Shoulder armour follows the body rather than moving with every head tilt.
- Polygon necklaces, Beard, the second PermaBull horn, and IronClaw have authored transforms rather than an origin fallback.
- `resolveChiknTraitGroup(definition, category, name)` resolves canonical names and documented NFT aliases within a category. Roostr `Hairy Old Man` resolves to `head/beard`; `Ropians Hat` resolves to `head/grandpa`. Unknown names remain unresolved so games can report them.

## Review coverage and limits

The gallery exposes all 276 groups, 19 base skins, setup/walk/fly/attack/hit poses, both facings, both atlas profiles, complete outfits covering every group, and 107 V2 visual comparisons. It uses the Chikn V2 build1 and Roostr V2 build3 images used in Roost Rift. References cover 273 groups and all base skins. Chikn Polygon Bling/Polygon Degen and Roostr MFD have no matching live label and retain ordinary previews.

The feedback view covers 95 reported traits, with 93 complete V2 outfits and two unmatched Polygon necklaces. Separate modes show the latest six corrections and all 13 coat-like outfits. The current owner policy puts held props behind the front wing and garments above it, using V2 placement references. The reference helper rejects legacy image paths and uses a separate cache. Reused chain textures remain an adaptation requiring visual review. Unique skins are outside the ordinary-trait matrix; retain their existing tests and review game-specific use separately.

Tests cover replacement visibility on every base skin, matching coloured limb followers, all curated animation profiles, and explicit transforms for every equipped trait piece. Rendering checks supplement these tests; they do not replace the owner's visual review.

`RigAttachmentGroupV1.slotClipRects` clips a selected base sprite in attachment-local layout units while a group is equipped. Runtime reapplies the clip after skin changes and pose resets, then clears it when the group is removed. Pixi owns the sprite-local mask and its teardown; shared atlas textures remain unchanged. Samurai uses this to hide only the top of the base head under its helmet. Other traits retain the full head.

## Publication gate

`npm run assembly:approval` is required by the npm publish workflow and passes only for the exact source approved by the owner. After explicit owner approval, record the reviewer and evidence in `config/trait-assembly-review.json`, then bind it to `node scripts/verify-assembly-approval.mjs --fingerprint`. The checksum covers contracts, Pixi rendering, Rig2D clipping/lifecycle, rig JSON, animation JSON, conversion/resolver, action and trait-profile source, with normalized checkout line endings. A later layout, rendering or motion edit invalidates the approval.

Run the full release gate after choosing the next lockstep package version. Publish only on a separate explicit release decision. The Chikn image corpus and rights manifest are unchanged by this metadata correction.
