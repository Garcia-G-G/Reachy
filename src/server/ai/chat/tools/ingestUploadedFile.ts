import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import { TOOL_DESCRIPTIONS } from '@/server/config/chatToolDescriptions';
import { aggregate } from '@/server/ingest/aggregate';
import { routeAndParse } from '@/server/ingest/dispatch';
import type { ParseCtx } from '@/server/ingest/types';
import { getR2Object } from '@/server/storage/r2';
import type { EmmaToolContext } from '../context';

/**
 * ingestUploadedFile — reuse the Step-1 autopilot parsers on a file
 * the user dropped into the chat. Returns a summarized view so Emma
 * can read it as additional context this turn.
 *
 * Path: tool receives the r2Key + mime + originalName from the prior
 * /upload round-trip. We fetch bytes from R2, route through
 * dispatch.routeAndParse, aggregate into an IngestedBundle (single-
 * file bundle is fine — aggregate dedups within), and return a tight
 * summary: heading list, first N text blocks, first table rows,
 * symbol list for code files.
 *
 * Large outputs are clipped — Emma doesn't need the full bundle in
 * the tool_result, she needs enough to know what was uploaded and
 * the gist.
 */
export function createIngestUploadedFileTool(ctx: EmmaToolContext) {
  return tool({
    description: TOOL_DESCRIPTIONS.ingestUploadedFile,
    inputSchema: z
      .object({
        r2Key: z.string().min(1),
        mime: z.string().nullable(),
        originalName: z.string().min(1),
      })
      .strict(),
    execute: async (input) => {
      try {
        const buf = await getR2Object(input.r2Key);
        // The parsers need an extracted-media prefix scoped to the
        // chat thread so any embedded images we extract land under
        // uploads/{userId}/chat/{threadId}/extracted/.
        const extractedPrefix = `uploads/${ctx.userId}/chat/${ctx.threadId}/extracted`;
        // Build a ParseCtx with self-recursive routeAndParse so the
        // zip parser (and any other recursive-dispatch parsers) work
        // identically to how ingestionWorker wires them.
        const parseCtx: ParseCtx = {
          userId: ctx.userId,
          ingestionId: ctx.threadId,
          extractedPrefix,
          routeAndParse: async (nested) => {
            try {
              return await routeAndParse({
                filename: nested.filename,
                mime: nested.mime,
                buffer: nested.buffer,
                ctx: parseCtx,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.warn(`[reachy:emma] nested parse failed: ${msg}`);
              return null;
            }
          },
        };
        const parsed = await routeAndParse({
          filename: input.originalName,
          mime: input.mime,
          buffer: buf,
          ctx: parseCtx,
        });
        if (!parsed) {
          return { error: `no parser registered for ${input.originalName} (mime=${input.mime})` };
        }
        const bundle = aggregate({
          ingestionId: ctx.threadId,
          parsedFiles: [parsed],
        });

        // Tight summary — clip aggressively. Emma reads this as
        // additional context, not as raw data dumps.
        const headings = bundle.headings.slice(0, 30).map((h) => ({
          level: h.level,
          text: h.text.slice(0, 160),
        }));
        const textBlocks = bundle.textBlocks.slice(0, 20).map((b) => ({
          source: b.source,
          heading: b.heading ?? null,
          excerpt: b.content.slice(0, 400),
        }));
        const tables = bundle.tables.slice(0, 5).map((t) => ({
          source: t.source,
          rowCount: t.rows.length,
          previewRows: t.rows.slice(0, 4).map((row) => row.slice(0, 10)),
        }));
        const codeContext = bundle.codeContext.slice(0, 8).map((c) => ({
          filename: c.filename,
          language: c.language,
          symbols: c.symbols.slice(0, 16),
          topComments: c.topComments.slice(0, 4),
        }));
        const summary = [
          `${headings.length} headings`,
          `${textBlocks.length} text blocks`,
          `${tables.length} tables`,
          `${codeContext.length} code files`,
          `${bundle.images.length} image refs`,
        ].join(', ');

        return {
          originalName: input.originalName,
          mime: input.mime,
          summary,
          headings,
          textBlocks,
          tables,
          codeContext,
          imagesFound: bundle.images.length,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `parsing failed: ${msg}` };
      }
    },
  });
}
