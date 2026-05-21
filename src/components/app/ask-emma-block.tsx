'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getEditCopilotChips } from '@/server/actions/editCopilot';
import { getEmmaWidgetContext } from '@/server/actions/emmaWidgetContext';
import type { EditChip } from '@/server/ai/editCopilotChips';

/**
 * AskEmmaBlock — Phase 08c.
 *
 * Editor-sidebar Emma copilot. Mounts as the 5th block in
 * generation-editor.tsx and pins Emma to the focused generation via
 * `clientContext.focusedGenerationId`. The handler picks that up and
 * unlocks edit-mode tools (changeHeadline / changeLayout / etc.) +
 * the [EDIT MODE] system-prompt block so Emma knows what's on screen.
 *
 * Why a dedicated component instead of reusing EmmaChat:
 *   - The sidebar wants minimal chrome (no big "Emma." display, no
 *     greeting block) and a chips row above the input.
 *   - We need an `onNewGeneration` callback to drive the editor's
 *     navigation when a tool call enqueues a new render.
 *   - Floating widget vs. inline copilot are two distinct surfaces;
 *     conflating them would bloat both.
 *
 * The component bootstraps its own thread/brandKit via
 * getEmmaWidgetContext on mount, then renders a compact chat surface.
 * The global EmmaWidget reads `data-emma-inline-mounted` on body and
 * auto-hides while we're alive — Garcia gets one Emma, not two.
 */

interface AskEmmaBlockProps {
  generationId: string;
  projectSlug: string;
  currentRoute: string;
  /** Called when an edit tool returned an output of shape
   *  `{ action: 'navigate-to-generation', newGenerationId }`. The
   *  parent navigates so the user sees the rendered result. */
  onNewGeneration: (newGenerationId: string) => void;
}

export function AskEmmaBlock(props: AskEmmaBlockProps) {
  const t = useTranslations('Emma');
  const [bootstrapping, setBootstrapping] = useState(true);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [chips, setChips] = useState<EditChip[]>([]);
  const [inputDraft, setInputDraft] = useState('');
  const handledToolCallIdsRef = useRef<Set<string>>(new Set());

  // Mark the document body so the floating EmmaWidget can hide
  // itself while we own the conversation surface. Cleared on
  // unmount so navigating away brings the bubble back.
  useEffect(() => {
    document.body.setAttribute('data-emma-inline-mounted', 'true');
    return () => {
      document.body.removeAttribute('data-emma-inline-mounted');
    };
  }, []);

  // Bootstrap: load the project's Emma thread + the suggestion chips
  // for the focused generation in parallel.
  useEffect(() => {
    let cancelled = false;
    setBootstrapping(true);
    void Promise.all([
      getEmmaWidgetContext(props.projectSlug),
      getEditCopilotChips(props.generationId),
    ]).then(([ctx, chipResult]) => {
      if (cancelled) return;
      if (ctx.kind === 'ready') {
        setThreadId(ctx.threadId);
      } else {
        setThreadId(null);
      }
      setChips(chipResult);
      setBootstrapping(false);
    });
    return () => {
      cancelled = true;
    };
  }, [props.projectSlug, props.generationId]);

  const transport = useMemo(() => {
    if (!threadId) return null;
    return new DefaultChatTransport({
      api: `/api/chat/${threadId}/stream`,
      prepareSendMessagesRequest: ({ messages, body }) => {
        const last = messages[messages.length - 1];
        const text =
          last?.parts?.find((p) => p.type === 'text')?.text ??
          (typeof body === 'object' && body && 'text' in body
            ? (body as { text: string }).text
            : '');
        return {
          body: {
            text,
            attachments: [],
            clientContext: {
              currentRoute: props.currentRoute,
              focusedGenerationId: props.generationId,
            },
          },
        };
      },
    });
  }, [threadId, props.currentRoute, props.generationId]);

  // useChat hook MUST be called unconditionally. We pass a stub
  // transport when bootstrapping; sendMessage won't fire because the
  // submit handler is gated on threadId + isStreaming.
  const { messages, sendMessage, status } = useChat({
    transport: transport ?? new DefaultChatTransport({ api: '/api/chat/__pending__/stream' }),
  });

  const isStreaming = status === 'streaming';
  const isSubmitted = status === 'submitted';

  // Watch assistant messages for edit-tool outputs of shape
  // `{ action: 'navigate-to-generation', newGenerationId }` and fire
  // the callback. Tracked-id set prevents firing twice on re-render.
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return;
    type ToolPart = {
      type: string;
      toolCallId?: string;
      state?: string;
      output?: { action?: string; newGenerationId?: string };
    };
    const toolParts = lastAssistant.parts.filter((p) => p.type.startsWith('tool-')) as ToolPart[];
    for (const part of toolParts) {
      if (part.state !== 'output-available') continue;
      const id = part.toolCallId;
      if (!id || handledToolCallIdsRef.current.has(id)) continue;
      const out = part.output;
      if (out?.action === 'navigate-to-generation' && typeof out.newGenerationId === 'string') {
        handledToolCallIdsRef.current.add(id);
        toast.success('Edit en curso · ~$0.21');
        props.onNewGeneration(out.newGenerationId);
      }
    }
  }, [messages, props]);

  const submit = useCallback(
    async (text: string) => {
      if (!threadId || !transport) return;
      if (isStreaming || isSubmitted) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      setInputDraft('');
      await sendMessage({ text: trimmed }, { body: { text: trimmed, attachments: [] } });
    },
    [threadId, transport, isStreaming, isSubmitted, sendMessage],
  );

  if (bootstrapping) {
    return (
      <section className="space-y-3">
        <h3 className="mono-eyebrow">✦ Ask Emma</h3>
        <p className="mono-eyebrow text-ink-3 italic">{t('typing')}</p>
      </section>
    );
  }

  if (!threadId) {
    return (
      <section className="space-y-3">
        <h3 className="mono-eyebrow">✦ Ask Emma</h3>
        <p className="text-sm text-ink-3">
          Couldn&apos;t bootstrap Emma — open the brand identity page and try again.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="mono-eyebrow">✦ Ask Emma</h3>
        <span className="mono-eyebrow text-ink-3">edit copilot</span>
      </div>
      <p className="text-xs text-ink-3 leading-snug">
        Está viendo esta pieza. Decile qué cambiar — headline, layout, palette, variante.
      </p>

      {/* Chat thread — compact. Only renders messages from this turn
          onwards (the persisted history would crowd the sidebar). */}
      {messages.length > 0 ? (
        <div className="max-h-[260px] overflow-y-auto space-y-2 border border-ink/15 p-3">
          {messages.map((m) => {
            const text = m.parts
              .filter((p) => p.type === 'text')
              .map((p) => (p as { type: 'text'; text: string }).text)
              .join('\n');
            if (!text) return null;
            return (
              <div key={m.id} className="text-sm leading-snug">
                <span className="mono-eyebrow text-ink-3 text-[10px] mr-2 uppercase">
                  {m.role === 'user' ? 'tú' : 'emma'}
                </span>
                <span style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}>{text}</span>
              </div>
            );
          })}
          {(isStreaming || isSubmitted) && messages[messages.length - 1]?.role === 'user' ? (
            <div className="mono-eyebrow text-ink-3 italic text-xs">…</div>
          ) : null}
        </div>
      ) : null}

      {/* Suggestion chips. Clicking pre-fills + sends in one go so
          Garcia doesn't have to confirm a chip he already chose. */}
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => submit(chip.prompt)}
              disabled={isStreaming || isSubmitted}
              className="ctrl-picker-see-all border border-ink/20 px-2 py-1 hover:border-accent hover:text-accent disabled:opacity-40"
              title={chip.prompt}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Free-form input. Single-line; Enter submits, Shift+Enter
          would normally add a newline but for the sidebar this stays
          single-line because the model can ignore breaks. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(inputDraft);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={inputDraft}
          onChange={(e) => setInputDraft(e.target.value)}
          placeholder="Decile a Emma…"
          disabled={isStreaming || isSubmitted}
          className="field flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={isStreaming || isSubmitted || inputDraft.trim().length === 0}
          className="btn-ink px-3 text-sm disabled:opacity-50"
        >
          ↵
        </button>
      </form>
    </section>
  );
}
