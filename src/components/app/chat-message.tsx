'use client';

import type { UIMessage } from 'ai';
import { Children, isValidElement } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatToolCard } from './chat-tool-card';
import { InlineAssetPreview } from './inline-asset-preview';

/**
 * Renders one chat message in the v4 minimal editorial layout +
 * Phase 07e role differentiation + markdown.
 *
 * Single-column — no avatars, no left/right split. Differentiation
 * via a mono eyebrow with the role name (EMMA in amber / GARCIA in
 * navy 65%) and a 1.5px left rule in the matching color.
 *
 * Assistant text parts render through ReactMarkdown so bold / lists
 * / italics / code formatting lands as styled output, not literal
 * asterisks. Inline image URLs (PNG/JPG/WEBP/GIF or R2 pub.r2.dev)
 * are detected and replaced with the InlineAssetPreview card.
 *
 * User text parts also go through ReactMarkdown — they're rare to
 * contain markup but if Garcia pastes a URL, it lands as a link not
 * raw text.
 */

interface ChatMessageProps {
  message: UIMessage;
  /** Set true on the LAST message when the AI SDK status is
   *  'streaming' — drives the cursor on the last text part. */
  isStreaming?: boolean;
  /** User role label (typically derived from session.user.name
   *  first-word uppercase, or "TÚ" as fallback). Defaults to "TÚ"
   *  if not provided. */
  userRoleLabel?: string;
}

/** Image-URL detectors. Any URL ending in a common image extension
 *  OR matching the R2 pub.r2.dev host (where our generated assets
 *  land) is treated as a previewable asset. */
const IMAGE_URL_RE = /^https?:\/\/[^\s]+\.(png|jpg|jpeg|webp|gif|svg)(\?[^\s]*)?$/i;
const R2_PUB_RE = /^https?:\/\/pub-[a-z0-9]+\.r2\.dev\/[^\s]+/i;

function isImageUrl(href: string): boolean {
  return IMAGE_URL_RE.test(href.trim()) || R2_PUB_RE.test(href.trim());
}

/** Extract a string-y representation of a React children prop. Used to
 *  catch the "a paragraph that is JUST a URL" pattern that emerges
 *  when the model writes an image URL on its own line. */
function extractStringChild(children: React.ReactNode): string | null {
  const arr = Children.toArray(children);
  if (arr.length === 0) return null;
  // A single text child — just return it.
  if (arr.length === 1 && typeof arr[0] === 'string') return arr[0];
  // Children may be: [text, <a>url</a>, text] when remark auto-links a
  // bare URL. We unwrap an inner <a> whose href matches its body.
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

/** ReactMarkdown component overrides — editorial typography. */
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
    // Catch a paragraph that contains ONLY an image URL (whether as a
    // bare string or auto-linked <a>). Promote it to an InlineAssetPreview
    // so the URL doesn't appear as text alongside the preview.
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

export function ChatMessageView({ message, isStreaming, userRoleLabel }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const roleClass = isUser ? 'emma-msg-user' : 'emma-msg-assistant';
  const roleLabel = isUser ? userRoleLabel?.trim() || 'TÚ' : 'EMMA';

  const lastTextIdx = (() => {
    for (let i = message.parts.length - 1; i >= 0; i--) {
      if (message.parts[i]?.type === 'text') return i;
    }
    return -1;
  })();

  return (
    <article className={`emma-msg ${roleClass}`}>
      <header className="emma-msg-role">{roleLabel}</header>
      <div className="emma-msg-body">
        {message.parts.map((part, idx) => {
          const key = `${message.id}-${idx}`;
          if (part.type === 'text') {
            const isLastText = idx === lastTextIdx;
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
              <details key={key} style={{ fontSize: 11, color: 'var(--emma-ink-55)' }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    fontFamily: 'var(--emma-font-mono)',
                    fontSize: 9,
                    letterSpacing: '0.08em',
                  }}
                >
                  reasoning
                </summary>
                <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', paddingLeft: 8 }}>
                  {part.text}
                </div>
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

/** Pre-first-token shimmer — three dots that pulse with the cursor-
 *  pulse motion duration, staggered 200ms each. Rendered by the
 *  parent when status==='submitted' and no assistant message exists
 *  yet for this turn. */
export function PreFirstTokenShimmer() {
  return (
    <div className="emma-msg emma-msg-assistant" role="status" aria-label="Emma is thinking">
      <div className="emma-pre-dots">
        <span>·</span>
        <span>·</span>
        <span>·</span>
      </div>
    </div>
  );
}
