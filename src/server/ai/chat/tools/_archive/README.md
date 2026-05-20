# Archived worker tools (Phase 07h)

These tools were Emma's "do-the-work" set when she was the asset
generator. Phase 07h pivoted her to a concierge — she now points to
the right Reachy surface instead of generating directly.

The tools still compile (they import from existing pipelines), but
they're not registered in `../index.ts` so the runtime model can't
call them. Keep here in case the role changes back, or to lift
specific logic into the new surfaces.

Contents:
- generateImage.ts — was Emma's "make an image" tool. Logic moved to the regular Generate → Image page.
- writeCopy.ts — channelCopy wrapper.
- regenerateAsset.ts — iterate-with-hint. Equivalent action exists as `regenerateChatAsset` server action.
- iterateImageCopy.ts — typography-only iteration (delegate).
- saveAsCampaignAsset.ts — promote to library. Equivalent server action: `saveChatAssetToLibrary`.
- listLayouts / listChannels / listVisualStyles — discoverability lists. Now in the static knowledge base when needed.

If reviving, drop the `_archive/` prefix and re-register in `../index.ts`.
