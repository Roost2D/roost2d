# Roost2D 0.8.0: Chikn/Roostr trait assembly

The repository owner reviewed the complete V2 assembly gallery and authorized release on 1 November 2026 with a final requirement: legs must sit behind coats generally. That correction is implemented for all 13 coat-like outfits, all 19 base skins and every footwear group. The existing wing rule remains in force. The exact reviewed rig/rendering source hash is recorded in `config/trait-assembly-review.json`; further source changes invalidate it.

Coat groups lower the two upper-leg branches below the torso sprite (front -0.5, rear -1.5). Their shins, toes and equipped footwear stay in those animated branches. Wing A is at 8, garment at 9, head at 10. Removing the garment restores all original depths. No limb is deleted or hidden globally, and games need no local ordering patches.

The release also includes all earlier V2 placement/orientation corrections, original-image texture regions for chains/fringes, reversible Samurai head clipping, category-aware NFT label resolution, and anchored action motion for the seated Chikn Jockey. All installed `@roost2d/*` packages must move together to the exact same version. The companion asset helper is 0.6.2; existing immutable 0.6.1 media remains compatible because no source artwork or asset ID changed.

The asset repository provides separate [Bokstrike](https://github.com/Roost2D/chikn-game-assets/blob/codex/trait-layout-review/docs/handoff-bokstrike-trait-assembly.md) and [Roost Rift](https://github.com/Roost2D/chikn-game-assets/blob/codex/trait-layout-review/docs/handoff-roost-rift-trait-assembly.md) integration handoffs. Neither game was changed by this release task.
