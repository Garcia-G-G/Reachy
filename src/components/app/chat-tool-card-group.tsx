'use client';

import { useTranslations } from 'next-intl';
import { ChatImageGrid, type ChatImageGridItem } from './chat-image-grid';

/**
 * ChatToolCardGroup — Phase 07g.
 *
 * When Emma calls the same tool N times in parallel (e.g.
 * `generateImage` × 4), render ONE grouped card with a compact
 * header + mini-grid of cells instead of N stacked full-width
 * cards. Compact pre-result height; expands to a 2×2 thumb grid
 * once any results land.
 *
 * For the image-gen path we extract per-call assetUrls +
 * generationIds and feed them into ChatImageGrid. Other tools
 * group identically but render a per-cell status pill — those
 * rarely fire in parallel so the rendering is generic.
 */

interface ToolPart {
  type: string;
  toolCallId: string;
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error'
    | 'output-denied';
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

interface ChatToolCardGroupProps {
  parts: ToolPart[];
  toolName: string;
}

function isImageTool(name: string): boolean {
  return name === 'generateImage' || name === 'regenerateAsset';
}

function statusForPart(p: ToolPart): 'pending' | 'done' | 'error' {
  if (p.state === 'output-available') return 'done';
  if (p.state === 'output-error' || p.state === 'output-denied') return 'error';
  return 'pending';
}

function useGroupHeaderText() {
  const t = useTranslations('Emma');
  return (toolName: string, total: number, doneCount: number): string => {
    const label = isImageTool(toolName) ? t('groupLabelImages') : toolName;
    if (doneCount === total) return t('groupReady', { total, label });
    return t('groupGenerating', { total, label });
  };
}

export function ChatToolCardGroup({ parts, toolName }: ChatToolCardGroupProps) {
  const t = useTranslations('Emma');
  const groupHeaderText = useGroupHeaderText();
  const total = parts.length;
  const doneCount = parts.filter((p) => statusForPart(p) === 'done').length;
  const allDone = doneCount === total;

  // For image-gen groups: extract URL + generationId from each part's
  // output so the grid can render thumbs and the lightbox chips can
  // act on the right row.
  const imageItems: ChatImageGridItem[] = [];
  if (isImageTool(toolName) && allDone) {
    for (const p of parts) {
      if (statusForPart(p) !== 'done' || !p.output || typeof p.output !== 'object') continue;
      const o = p.output as Record<string, unknown>;
      const urls = (o.assetUrls as string[] | undefined) ?? [];
      const generationId = typeof o.generationId === 'string' ? o.generationId : undefined;
      for (const url of urls) {
        imageItems.push({ url, generationId });
      }
    }
  }

  return (
    <div className="emma-tool-card emma-tool-card-group" data-all-done={allDone ? 'true' : 'false'}>
      {/* Header — compact 1-line summary, always visible. */}
      <div className="emma-tool-card-group-header">
        <span className={`emma-tool-glyph ${allDone ? '' : 'is-thinking'}`} aria-hidden="true">
          {allDone ? '✓' : '◐'}
        </span>
        <span className="emma-tool-card-group-title">
          {groupHeaderText(toolName, total, doneCount)}
        </span>
        <span className="emma-tool-card-group-progress">
          {doneCount}/{total}
        </span>
      </div>

      {/* Body — mini-grid of cells (skeleton OR thumb) until all done,
          then a real 2×2 image grid. */}
      {!allDone ? (
        <div className="emma-tool-card-group-mini-grid" data-count={total}>
          {parts.map((p) => {
            const status = statusForPart(p);
            return (
              <div
                key={p.toolCallId}
                className={`emma-tool-card-group-cell emma-tool-cell-${status}`}
                data-tool-cell
              >
                {status === 'pending' ? (
                  <span className="emma-tool-skeleton" />
                ) : status === 'error' ? (
                  <span className="emma-tool-card-group-cell-x" role="img" aria-label="failed">
                    ×
                  </span>
                ) : (
                  <span className="emma-tool-card-group-cell-check" role="img" aria-label="done">
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : isImageTool(toolName) && imageItems.length > 0 ? (
        <ChatImageGrid items={imageItems} />
      ) : (
        // Non-image tools that all completed — render a simple done
        // indicator. Per-tool result rendering can be added later if
        // multi-call non-image tools become common.
        <div className="emma-tool-card-group-done-misc">{t('groupDoneMisc', { total })}</div>
      )}
    </div>
  );
}
