'use client';

import type { UIMessage } from 'ai';
import { ChatToolCard } from './chat-tool-card';

/**
 * Renders one chat message in the v4 minimal editorial layout.
 *
 * Single-column — no left/right drift, no avatars, no eyebrows.
 * The speaker is implicit: user messages read like prompts, Emma's
 * replies carry the editorial weight of the body text. If the
 * surface ever needs to distinguish, it's via subtle copy choice,
 * not a labelled bubble.
 *
 * Streaming: the LATEST assistant text part gets a 2×14px navy
 * cursor appended, pulsing per the motion-token cursor-pulse
 * duration. Pre-first-token: 3 dots cycle (handled by the parent
 * when status==='submitted' and no assistant message yet).
 */

interface ChatMessageProps {
  message: UIMessage;
  /** Set true on the LAST message when the AI SDK status is
   *  'streaming' — drives the cursor on the last text part. */
  isStreaming?: boolean;
}

export function ChatMessageView({ message, isStreaming }: ChatMessageProps) {
  const lastTextIdx = (() => {
    for (let i = message.parts.length - 1; i >= 0; i--) {
      if (message.parts[i]?.type === 'text') return i;
    }
    return -1;
  })();

  return (
    <article className="emma-msg" style={{ marginBottom: 'var(--emma-gap-block)' }}>
      <div className="space-y-3">
        {message.parts.map((part, idx) => {
          const key = `${message.id}-${idx}`;
          if (part.type === 'text') {
            const isLastText = idx === lastTextIdx;
            return (
              <div
                key={key}
                style={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.55,
                  color: 'var(--emma-ink)',
                  fontSize: 'var(--emma-body-size)',
                }}
              >
                {part.text}
                {isStreaming && isLastText && message.role === 'assistant' ? (
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

/** Pre-first-token shimmer — three dots that pulse with the same
 *  cursor-pulse duration but staggered 200ms each. Rendered by the
 *  parent when status==='submitted' and no assistant message exists
 *  yet for this turn. */
export function PreFirstTokenShimmer() {
  return (
    <div className="emma-msg" role="status" aria-label="Emma is thinking">
      <div className="emma-pre-dots">
        <span>·</span>
        <span>·</span>
        <span>·</span>
      </div>
    </div>
  );
}
