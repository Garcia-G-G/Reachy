import 'server-only';
import type { BrandKit } from '@/server/actions/brandKits';
import type { Project } from '@/server/actions/projects';
import type { ProductBrief } from '@/server/ingest/extractBrief';

/**
 * Per-turn execution context passed into every Emma tool's `execute`
 * function. The orchestrator (handler.ts) builds this once per turn
 * and binds it into each tool.
 *
 * Cannot be derived: which fields to expose is a deliberate scope
 * decision — tools see the project + brand kit + brief but NOT the
 * full conversation history (that lives in the model's input
 * messages, not the tool surface).
 */

export interface EmmaToolContext {
  userId: string;
  projectId: string;
  threadId: string;
  project: Project;
  brandKit: BrandKit;
  productBrief: ProductBrief | null;
  /** Language for assets Emma generates this turn. Default comes from
   *  the brand kit's languages[0]; the handler can override (e.g. when
   *  the user explicitly switched). */
  language: 'en' | 'es';
}
