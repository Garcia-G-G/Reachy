import 'server-only';

/**
 * Tool descriptions for Emma's chat tools. Phase 07.
 *
 * The Anthropic Messages API treats `tool.description` as part of
 * the model context — long descriptions affect tool selection and
 * argument shaping. We centralize them here so any tightening to
 * how Emma picks between tools is a single-file edit.
 *
 * Cannot be derived: these strings are deliberate guidance to the
 * model about when to call which tool and what shape of input to
 * pass.
 */

export const TOOL_DESCRIPTIONS = {
  generateImage:
    'Generate a single marketing image via the Reachy pipeline. The image is composed by gpt-image-2 with brand-faithful typography rendered inline. Uses the loaded brand kit + product brief automatically. Returns asset URLs + critic score.',

  writeCopy:
    'Generate a single piece of channel copy (LinkedIn post, X thread, IG caption, cold/warm email, blog outline, press release). Returns text the user can copy verbatim. Uses the brand voice + product brief loaded in context.',

  regenerateAsset:
    'Re-run an existing image generation with a tweak hint. Use when the user says "make it warmer", "shorter headline", "drop the subheadline", etc. Returns a fresh asset URL.',

  iterateImageCopy:
    'Change a single typography slot (eyebrow/headline/subheadline/cta) on an existing image. NOTE: this currently re-renders the full image — there is no cheap typography-only path. Prefer regenerateAsset if you want to change more than one slot at once.',

  searchAssets:
    "Search the project's prior generations for assets matching a keyword query. Returns the most recent matches with their generation_id + asset URL + brief.",

  searchBrandKit:
    'Read fields from the active project brand kit (palette, tone, voice, audience, logo). Use when the user asks about the brand or before proposing something that needs to honor it.',

  saveAsCampaignAsset:
    "Promote a chat-generated asset to the project's permanent library. Use when the user says 'save this' / 'guárdalo' / 'add it to my library'.",

  listLayouts:
    'List every available image layout (hero-centered, editorial-collage, etc.) with its label and the typography slots it supports.',

  listChannels:
    'List every copy channel (LinkedIn long/short, X thread, IG caption, cold/warm email, blog outline, press release) with target word counts and tone hints.',

  listVisualStyles:
    'List every visual style available (editorial-photo, typographic-poster, collage-zine, brutalist-grid, illustrated-vector, memphis-pattern, editorial-collage) with a one-line description.',

  ingestUploadedFile:
    'Parse a file the user uploaded earlier (doc/sheet/pdf/markdown/code/csv/etc.). Returns extracted text blocks, headings, tables, and code symbols. Call this BEFORE replying when the user attached a non-image file.',

  describeImage:
    'Look at an image the user uploaded and describe it (style, palette, composition, any text visible). Call this when the user attached an image without explaining its role. Returns structured analysis useful for brand reference or style transfer.',

  extendBrandKit:
    "Mutate a field on the project brand kit AFTER the user confirmed in chat. Use for 'add this logo to the kit', 'change accent to #B6481A', etc. Requires user yes/no — do NOT call this on your own initiative.",

  /** Sub-description for extendBrandKit's `value` field — its meaning
   *  changes by `field` so we explain inline. */
  extendBrandKitValueHelp:
    "For 'logoKey': an R2 key the user uploaded. For 'palette': JSON {ink,paper,accent}. For 'visualStyle': a style key. For 'voiceTone': a 1-line tone. For 'allowsHumans': 'true'|'false'.",
} as const;
