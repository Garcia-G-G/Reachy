import 'server-only';
import type { ToolSet } from 'ai';
import type { EmmaToolContext } from '../context';
import { createDescribeImageTool } from './describeImage';
import { createExtendBrandKitTool } from './extendBrandKit';
import { createGenerateImageTool } from './generateImage';
import { createIngestUploadedFileTool } from './ingestUploadedFile';
import { createIterateImageCopyTool } from './iterateImageCopy';
import { createListChannelsTool } from './listChannels';
import { createListLayoutsTool } from './listLayouts';
import { createListVisualStylesTool } from './listVisualStyles';
import { createRegenerateAssetTool } from './regenerateAsset';
import { createSaveAsCampaignAssetTool } from './saveAsCampaignAsset';
import { createSearchAssetsTool } from './searchAssets';
import { createSearchBrandKitTool } from './searchBrandKit';
import { createWriteCopyTool } from './writeCopy';

/**
 * Build the Emma tool set for a given turn. Each factory is bound
 * to the per-turn context (project + brand kit + brief), so tool
 * executions never have to re-query the database for facts the
 * handler already loaded.
 */
export function buildEmmaTools(ctx: EmmaToolContext): ToolSet {
  return {
    generateImage: createGenerateImageTool(ctx),
    writeCopy: createWriteCopyTool(ctx),
    regenerateAsset: createRegenerateAssetTool(ctx),
    iterateImageCopy: createIterateImageCopyTool(ctx),
    searchAssets: createSearchAssetsTool(ctx),
    searchBrandKit: createSearchBrandKitTool(ctx),
    saveAsCampaignAsset: createSaveAsCampaignAssetTool(ctx),
    listLayouts: createListLayoutsTool(ctx),
    listChannels: createListChannelsTool(ctx),
    listVisualStyles: createListVisualStylesTool(ctx),
    ingestUploadedFile: createIngestUploadedFileTool(ctx),
    describeImage: createDescribeImageTool(ctx),
    extendBrandKit: createExtendBrandKitTool(ctx),
  };
}
