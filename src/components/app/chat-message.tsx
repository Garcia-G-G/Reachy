'use client';

import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { Children, isValidElement } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatToolCard } from './chat-tool-card';
import { ChatToolCardGroup } from './chat-tool-card-group';
import { InlineAssetPreview } from './inline-asset-preview';

/**
 * Renders one chat message — Phase 07g restructured.
 *
 *   - DEDUPES tool parts by (toolType, toolCallId), keeping the
 *     LAST occurrence in part order so the latest state wins. This
 *     fixes the "8 cards for 4 calls" bug where the SDK's streaming
 *     evolution and the onStepFinish persistence created stale
 *     duplicate entries.
 *   - GROUPS consecutive tool parts of the same tool name into a
 *     single ChatToolCardGroup. Solo tool parts use the compact
 *     ChatToolCard.
 *   - Spacing between sibling blocks within an assistant message
 *     uses --emma-gap-within-turn (smaller). The OUTER gap between
 *     messages uses --emma-gap-between-turns and lives on .emma-msg.
 */

interface ChatMessageProps {
  message: UIMessage;
  /** Set true on the LAST message when the AI SDK status is
   *  'streaming' — drives the cursor on the last text part. */
  isStreaming?: boolean;
  /** User role label. */
  userRoleLabel?: string;
}

/** Image-URL detectors for inline preview promotion. */
const IMAGE_URL_RE = /^https?:\/\/[^\s]+\.(png|jpg|jpeg|webp|gif|svg)(\?[^\s]*)?$/i;
const R2_PUB_RE = /^https?:\/\/pub-[a-z0-9]+\.r2\.dev\/[^\s]+/i;

function isImageUrl(href: string): boolean {
  return IMAGE_URL_RE.test(href.trim()) || R2_PUB_RE.test(href.trim());
}

function extractStringChild(children: React.ReactNode): string | null {
  const arr = Children.toArray(children);
  if (arr.length === 0) return null;
  if (arr.length === 1 && typeof arr[0] === 'string') return arr[0];
  const single = arr.length === 1 ? arr[0] : null;
  if (
    single &&
    isValidElement<{ href?: string; children?: React.ReactNode }>(single) &&
    single.props.href
  ) {
    return single.props.href;
  }
  return null;
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => {
    if (href && isImageUrl(href)) {
      const caption = typeof children === 'string' ? children : undefined;
      return <InlineAssetPreview url={href} caption={caption} />;
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" className="emma-link">
        {children}
      </a>
    );
  },
  p: ({ children }) => {
    const bare = extractStringChild(children);
    if (bare && isImageUrl(bare)) {
      return <InlineAssetPreview url={bare.trim()} />;
    }
    return <p className="emma-p">{children}</p>;
  },
  ul: ({ children }) => <ul className="emma-list">{children}</ul>,
  ol: ({ children }) => <ol className="emma-list-ordered">{children}</ol>,
  strong: ({ children }) => <strong className="emma-strong">{children}</strong>,
  em: ({ children }) => <em className="emma-em">{children}</em>,
  code: ({ children }) => <code className="emma-code">{children}</code>,
  pre: ({ children }) => <pre className="emma-pre">{children}</pre>,
};

/** A single message part — either as it came from the AI SDK or as a
 *  synthesized "tool group" we built during the walk. */
type AnyMessagePart = UIMessage['parts'][number] & {
  toolCallId?: string;
};

interface ToolGroupRenderable {
  type: 'tool-group';
  groupId: string;
  toolName: string;
  parts: AnyMessagePart[];
}

type Renderable = AnyMessagePart | ToolGroupRenderable;

/** Walk parts, dedupe tool entries by (type + toolCallId) keeping the
 *  latest, then group runs of consecutive tool parts of the same type
 *  into ToolGroupRenderable entries. */
function buildRenderables(parts: readonly AnyMessagePart[]): Renderable[] {
  // Step 1 — dedupe. For tool parts, key on (type + toolCallId). For
  // everything else, key on a unique ordinal so they pass through.
  // Map.set with the same key replaces, so the LAST occurrence wins —
  // exactly the behavior we want when the SDK streams stale states
  // followed by the fresh ones.
  const dedupedMap = new Map<string, AnyMessagePart>();
  parts.forEach((part, idx) => {
    if (part.type.startsWith('tool-') && part.toolCallId) {
      dedupedMap.set(`${part.type}::${part.toolCallId}`, part);
    } else {
      dedupedMap.set(`__nontool_${idx}`, part);
    }
  });
  const deduped = Array.from(dedupedMap.values());

  // Step 2 — group consecutive tool parts of the same type. Two
  // siblings of `tool-generateImage` become one group; a single one
  // stays alone.
  const out: Renderable[] = [];
  let i = 0;
  while (i < deduped.length) {
    const part = deduped[i];
    if (!part) {
      i++;
      continue;
    }
    if (part.type.startsWith('tool-')) {
      const toolName = part.type;
      const groupParts: AnyMessagePart[] = [part];
      let j = i + 1;
      while (j < deduped.length && deduped[j]?.type === toolName) {
        const next = deduped[j];
        if (next) groupParts.push(next);
        j++;
      }
      if (groupParts.length >= 2) {
        out.push({
          type: 'tool-group',
          groupId: `${toolName}-${groupParts[0]?.toolCallId ?? i}`,
          toolName,
          parts: groupParts,
        });
      } else {
        out.push(part);
      }
      i = j;
    } else {
      out.push(part);
      i++;
    }
  }
  return out;
}

export function ChatMessageView({ message, isStreaming, userRoleLabel }: ChatMessageProps) {
  const t = useTranslations('Emma');
  const isUser = message.role === 'user';
  const roleClass = isUser ? 'emma-msg-user' : 'emma-msg-assistant';
  // userFallback is locale-aware ('TÚ' for ES, 'YOU' for EN). The
  // assistant role is always literally "EMMA" — that's her name, not
  // a translatable label.
  const roleLabel = isUser ? userRoleLabel?.trim() || t('userFallback') : 'EMMA';

  const parts = (message.parts ?? []) as readonly AnyMessagePart[];
  const renderables = buildRenderables(parts);

  // Locate the last text part for the streaming cursor. We compute
  // this from the ORIGINAL parts (not renderables) so the cursor
  // targets the right text block.
  const lastTextIdx = (() => {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i]?.type === 'text') return i;
    }
    return -1;
  })();
  const lastTextKey = lastTextIdx >= 0 ? `${message.id}-${lastTextIdx}` : null;

  return (
    <article className={`emma-msg ${roleClass}`}>
      <header className="emma-msg-role">{roleLabel}</header>
      <div className="emma-msg-body">
        {renderables.map((r, idx) => {
          if (r.type === 'tool-group') {
            const group = r as ToolGroupRenderable;
            return (
              <ChatToolCardGroup
                key={group.groupId}
                parts={group.parts as never}
                toolName={group.toolName.replace(/^tool-/, '')}
              />
            );
          }
          const part = r as AnyMessagePart;
          const key = `${message.id}-${idx}`;
          if (part.type === 'text') {
            const isLastText = key === lastTextKey;
            return (
              <div key={key} className="emma-msg-text">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                  {part.text}
                </ReactMarkdown>
                {isStreaming && isLastText && !isUser ? (
                  <span className="emma-stream-cursor" aria-hidden="true" />
                ) : null}
              </div>
            );
          }
          if (part.type === 'reasoning') {
            return (
              <details key={key} className="emma-reasoning">
                <summary className="emma-reasoning-summary">{t('reasoning')}</summary>
                <div className="emma-reasoning-body">{part.text}</div>
              </details>
            );
          }
          if (part.type.startsWith('tool-')) {
            return <ChatToolCard key={key} part={part as never} />;
          }
          if (part.type === 'step-start') {
            return null;
          }
          return (
            <pre key={key} style={{ fontSize: 11, color: 'var(--emma-ink-55)' }}>
              {JSON.stringify(part, null, 2)}
            </pre>
          );
        })}
      </div>
    </article>
  );
}

export function PreFirstTokenShimmer() {
  const t = useTranslations('Emma');
  return (
    <div className="emma-msg emma-msg-assistant" role="status" aria-label={t('preThinkingAria')}>
      <div className="emma-pre-dots">
        <span>·</span>
        <span>·</span>
        <span>·</span>
      </div>
    </div>
  );
}
