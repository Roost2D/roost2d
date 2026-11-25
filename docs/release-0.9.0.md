# Roost2D 0.9.0: headwear coverage

Covering Chikn and Roostr hats now conceal the underlying comb. All 108 ordinary
head groups have an explicit coverage policy; 64 groups carry a curved keep
mask. The remaining accessories preserve their appropriate head visibility.
The Chikn V2 build1 and Roostr V2 build3 visuals guide placement; the owner's
coverage rule determines comb concealment. No source artwork or asset ID changes.

`RigClipPolygonV1`, `RigAttachmentGroupV1.slotClipPolygons` and
`RigDisplayNode.clipPolygon` are optional additions. Polygon coordinates are
normalized to the original untrimmed attachment image. A polygon takes
precedence over a rectangle for the same slot. Rig2D copies the active mask to
the base sprite and restores visibility on removal, skin changes and pose
resets. Pixi owns each sprite-local mask and destroys it without changing
shared textures. Rectangular clipping remains supported.

Install all `@roost2d/*` packages at exactly 0.9.0. The companion asset helper
is 0.6.3; immutable 0.6.1 media remains compatible. Rebuild any baked character
or pilot sprites that previously ignored masks: updating the live renderer
alone cannot correct an already flattened image.

The owner authorized this implementation and release in the 6 November 2026
plan. Corrected before/after previews are delivered before publication and the
authorization is bound to the exact corrected source fingerprint in
`config/trait-assembly-review.json`. This records the explicit release
instruction; it does not claim a later owner visual sign-off occurred.

The separate asset checkout provides an offline gallery for every head trait,
both facings and V2 comparisons, plus a 19-skin / two-profile / five-pose renderer
matrix. The Bokstrike patch also regenerates affected baked pilot heads and
corrects its two game-owned caps. That patch is prepared on a separate branch;
adoption requires completion and review of the current qualification and
validation against its exact accepted source. Process exit does not authorize
adoption. Roost Rift adoption remains a later task.
