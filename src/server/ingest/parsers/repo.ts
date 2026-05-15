import 'server-only';
import { MAX_REPO_SOURCE_FILES } from '@/server/config/parserLimits';
import type { ParseCtx, ParsedFile } from '../types';

/**
 * Repo parser. Activated when the worker detects a folder upload that
 * contains one of: package.json / Gemfile / pyproject.toml / Cargo.toml.
 *
 * Strategy: ingest README + manifest + the top N source files by
 * import frequency (heuristic — count how many other source files
 * reference each one). This is a thin orchestrator over the `code`
 * and `markdown` parsers via routeAndParse.
 *
 * Inputs:
 *   - `buffer` is unused (folders aren't buffer-shaped); the worker
 *     supplies a synthetic empty buffer and packs file metadata into
 *     the routeAndParse calls via the worker layer. This parser is
 *     designed to receive its inputs through `ctx`.
 *
 * In Step 1 the worker handles folder traversal at the action layer
 * (the FileList carries all the files); the repo parser is invoked
 * with the ALREADY-collected file list via the routeAndParse hook
 * once we know we have a manifest. This file is a placeholder that
 * surfaces the convention so Step 2's planner can rely on a stable
 * codeContext block.
 */
export async function parse(buffer: Buffer, filename: string, _ctx: ParseCtx): Promise<ParsedFile> {
  void MAX_REPO_SOURCE_FILES;
  // The repo-shape detection happens at the action layer (it has the
  // full FileList) and dispatches each file through code/markdown/json
  // parsers individually. This parser entry exists for routing
  // completeness; uploads of literal `repo.zip` go through the `zip`
  // parser instead.
  return {
    filename,
    bytes: buffer.byteLength,
    textBlocks: [],
    images: [],
  };
}
