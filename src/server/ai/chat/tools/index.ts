import 'server-only';
import type { ToolSet } from 'ai';
import type { EmmaToolContext } from '../context';
import { createComposeBriefTool } from './composeBrief';
import { createDescribeImageTool } from './describeImage';
import { createAddVariantTool } from './edit/addVariant';
import { createChangeHeadlineTool } from './edit/changeHeadline';
import { createChangeLayoutTool } from './edit/changeLayout';
import { createChangePaletteTool } from './edit/changePalette';
import { createRegenerateAssetTool } from './edit/regenerateAsset';
import { createExplainFeatureTool } from './explainFeature';
import { createExtendBrandKitTool } from './extendBrandKit';
import { createGetCurrentPageContextTool } from './getCurrentPageContext';
import { createHighlightElementTool } from './highlightElement';
import { createIngestUploadedFileTool } from './ingestUploadedFile';
import { createNavigateToTool } from './navigateTo';
import { createRecommendNextStepTool } from './recommendNextStep';
import { createSearchAssetsTool } from './searchAssets';
import { createSearchBrandKitTool } from './searchBrandKit';

/**
 * Build the Emma concierge tool set for a given turn. Phase 07h
 * — the worker tools (generateImage / writeCopy / regenerateAsset
 * / iterateImageCopy / saveAsCampaignAsset / list*) have moved to
 * tools/_archive/ since Emma now POINTS to the right Reachy surface
 * instead of doing the work herself.
 *
 * Tools kept from the worker era because they're still useful for
 * GUIDANCE (reading state, looking at uploads, suggesting):
 *   - searchAssets       — "show me the LinkedIn post from last week"
 *   - searchBrandKit     — "what palette are we using"
 *   - describeImage      — "what's this competitor screenshot like"
 *   - ingestUploadedFile — Garcia drops a doc, Emma reads it
 *   - extendBrandKit     — Garcia confirms, Emma updates a single field
 *
 * New concierge tools:
 *   - getCurrentPageContext — where is the user right now
 *   - navigateTo            — take the user to a path (with confirm)
 *   - highlightElement      — pulse a UI control to point at it
 *   - explainFeature        — quote the feature catalog verbatim
 *   - recommendNextStep     — read project state, surface 2-4 actions
 *   - composeBrief          — Phase 07i. Writes a paste-ready brief
 *                             when the user says "creame X". Without
 *                             this in the registry the HARD_RULES in
 *                             emmaConcierge cite a tool the model
 *                             can't call, which destabilizes gpt-5.5.
 */
export function buildEmmaTools(ctx: EmmaToolContext): ToolSet {
  const base: ToolSet = {
    // Concierge core
    getCurrentPageContext: createGetCurrentPageContextTool(ctx),
    navigateTo: createNavigateToTool(ctx),
    highlightElement: createHighlightElementTool(ctx),
    explainFeature: createExplainFeatureTool(ctx),
    recommendNextStep: createRecommendNextStepTool(ctx),
    composeBrief: createComposeBriefTool(ctx),
    // State readers kept from worker era
    searchAssets: createSearchAssetsTool(ctx),
    searchBrandKit: createSearchBrandKitTool(ctx),
    describeImage: createDescribeImageTool(ctx),
    ingestUploadedFile: createIngestUploadedFileTool(ctx),
    extendBrandKit: createExtendBrandKitTool(ctx),
  };
  // Phase 08c — edit copilot. Only register edit tools when Emma is
  // bound to a focused generation (the AskEmmaBlock embeds in the
  // editor sidebar with focusedGenerationId set). Outside the editor
  // these would either error on every call (no focused asset) or
  // worse, encourage the model to invent a generationId.
  if (ctx.focusedGenerationId) {
    return {
      ...base,
      changeHeadline: createChangeHeadlineTool(ctx),
      changeLayout: createChangeLayoutTool(ctx),
      changePalette: createChangePaletteTool(ctx),
      addVariant: createAddVariantTool(ctx),
      regenerateAsset: createRegenerateAssetTool(ctx),
    };
  }
  return base;
}
