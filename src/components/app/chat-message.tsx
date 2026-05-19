'use client';

import type { UIMessage } from 'ai';
import { ChatToolCard } from './chat-tool-card';

interface ChatMessageProps {
  message: UIMessage;
  userDisplayName: string;
}

/**
 * Renders one chat message — user or assistant. Iterates the message's
 * `parts` and dispatches each:
 *   - text → paragraph
 *   - tool-* → ChatToolCard (inline preview that fills in when the
 *              tool result lands)
 *   - reasoning → muted block (collapsed by default)
 */
export function ChatMessageView({ message, userDisplayName }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const speaker = isUser ? userDisplayName : 'Emma';

  return (
    <article className={`mb-6 ${isUser ? '' : 'border-l-2 border-accent pl-4'}`}>
      <div className="mono-eyebrow mb-1 text-ink-3">{speaker}</div>
      <div className="space-y-3">
        {message.parts.map((part, idx) => {
          const key = `${message.id}-${idx}`;
          if (part.type === 'text') {
            return (
              <div key={key} className="whitespace-pre-wrap leading-relaxed text-ink">
                {part.text}
              </div>
            );
          }
          if (part.type === 'reasoning') {
            // Collapsible reasoning block — Anthropic doesn't expose
            // reasoning by default but if it ever does, we render it
            // muted so the user can read but not be distracted.
            return (
              <details key={key} className="text-sm text-ink-3">
                <summary className="mono-eyebrow cursor-pointer">reasoning</summary>
                <div className="mt-2 whitespace-pre-wrap pl-2">{part.text}</div>
              </details>
            );
          }
          if (part.type.startsWith('tool-')) {
            // Tool invocation part. The AI SDK v6 UI message format has
            // tool-{toolName} parts with state machine: input-streaming
            // → input-available → output-available | output-error.
            return <ChatToolCard key={key} part={part as never} />;
          }
          if (part.type === 'step-start') {
            return null; // visual delimiter, no render needed
          }
          // Files and dynamic parts — fall through to a minimal render.
          return (
            <pre key={key} className="text-xs text-ink-3">
              {JSON.stringify(part, null, 2)}
            </pre>
          );
        })}
      </div>
    </article>
  );
}
