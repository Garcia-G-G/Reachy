'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrandKit } from '@/server/actions/brandKits';
import { deleteThreadHistory } from '@/server/actions/chat';
import type { ChatAttachment, ChatMessage } from '@/server/db/schema/chatMessages';
import { ChatMessageView, PreFirstTokenShimmer } from './chat-message';
import { EmmaBrandStrip } from './emma-brand-strip';
import { EmmaCostTicker } from './emma-cost-ticker';
import { EmmaEmptyState } from './emma-empty-state';
import { EmmaSizeToggle, useEmmaSize } from './emma-size-toggle';

/**
 * EmmaChat — Phase 07b v4 minimal markup.
 *
 * Single-canvas editorial layout: navy + amber on warm cream paper,
 * spine rule on the left, `Emma.` headline as the visual anchor,
 * a short sub-line, a brand strip, a greeting, and the input.
 *
 * REMOVED in 07b (do NOT re-introduce):
 *   - "Vol 01 · No 04" framing
 *   - Eyebrow labels above blocks (BRAND, etc.)
 *   - Captions under starter cards
 *   - Footer with keyboard shortcuts
 *   - Avatar circle / E sigil
 *   - Long subtitles
 *
 * Size toggle: S/M/L lives top-right. CSS vars on .emma-canvas
 * crossfade width/padding/font-size. Persisted in localStorage.
 */

interface EmmaChatProps {
  projectName: string;
  projectSlug: string;
  threadId: string;
  welcomeLine: string;
  initialMessages: ChatMessage[];
  initialCostCents: number;
  brandKit: BrandKit;
  language: 'en' | 'es';
  userDisplayName: string;
  /** Optional first-name for the greeting. Falls back to displayName. */
  firstName?: string;
  /** Phase 07h compact mode — mounted inside the EmmaWidget panel.
   *  Drops the big Emma. headline, brand strip, greeting, and size
   *  toggle so the panel renders only the message list + input. */
  compact?: boolean;
  /** Phase 07h — current client route + focused asset, embedded in
   *  every POST to the stream API so concierge tools can read them. */
  clientContext?: {
    currentRoute?: string;
    focusedGenerationId?: string;
  };
}

interface PendingAttachment extends ChatAttachment {
  previewUrl?: string;
}

function persistedToUIMessage(row: ChatMessage) {
  const parts = Array.isArray(row.content)
    ? (row.content as Array<{ type: string; [k: string]: unknown }>)
    : [];
  return {
    id: row.id,
    role: row.role as 'user' | 'assistant' | 'system',
    parts: parts as never,
  };
}

export function EmmaChat(props: EmmaChatProps) {
  // All UI chrome flows through next-intl so the chat tracks the app
  // locale (ES / EN). props.language still informs the SERVER-SIDE
  // system prompt (handler.ts derives it from the brand kit) but
  // doesn't drive client labels anymore — that's why the chat used to
  // feel mixed when locale and brand kit disagreed.
  const t = useTranslations('Emma');
  const [size, setSize] = useEmmaSize();
  const [costCents, setCostCents] = useState(props.initialCostCents);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [inputDraft, setInputDraft] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/chat/${props.threadId}/stream`,
        prepareSendMessagesRequest: ({ messages, body }) => {
          const last = messages[messages.length - 1];
          const text =
            last?.parts?.find((p) => p.type === 'text')?.text ??
            (typeof body === 'object' && body && 'text' in body
              ? (body as { text: string }).text
              : '');
          const atts =
            body && typeof body === 'object' && 'attachments' in body
              ? (body as { attachments: ChatAttachment[] }).attachments
              : [];
          // Phase 07h — embed the current route + focused asset so
          // the server-side concierge tools can return them.
          const clientCtx =
            body && typeof body === 'object' && 'clientContext' in body
              ? (body as { clientContext: unknown }).clientContext
              : props.clientContext;
          return { body: { text, attachments: atts, clientContext: clientCtx } };
        },
      }),
    [props.threadId, props.clientContext],
  );

  const router = useRouter();
  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    transport,
    messages: props.initialMessages.map(persistedToUIMessage) as never,
    onFinish: () => {
      // Approximate cost bump — see Phase 07's commit notes for the
      // refinement plan (a /cost endpoint that reads the just-
      // persisted chat_message.costCents).
      setCostCents((c) => c + 5);
    },
  });

  // Clear-chat affordance — inline confirm pattern. The action wipes
  // chat_message rows server-side; saved assets (campaign_asset rows
  // created via `guardar`) live in a separate table and survive. Cost
  // also resets to 0 because the ticker reads from chat_message.
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClear = useCallback(async () => {
    if (clearing) return;
    setClearing(true);
    try {
      const res = await deleteThreadHistory(props.threadId);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      setMessages([]);
      setCostCents(0);
      setConfirmingClear(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'failed');
    } finally {
      setClearing(false);
    }
  }, [clearing, props.threadId, setMessages]);

  const isStreaming = status === 'streaming';
  const isSubmitted = status === 'submitted';

  // Phase 07h — concierge tool actions. When Emma calls
  // navigateTo / highlightElement, the server-side tool returns the
  // action payload as the output. The client watches the latest
  // assistant message for those outputs and applies the side effect.
  // We track which toolCallIds have already been handled so a
  // re-render doesn't navigate twice.
  const handledToolCallIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return;
    type ToolPart = {
      type: string;
      toolCallId?: string;
      state?: string;
      output?: { action?: string; path?: string; selector?: string; durationMs?: number };
    };
    const toolParts = lastAssistant.parts.filter((p) => p.type.startsWith('tool-')) as ToolPart[];
    for (const part of toolParts) {
      if (part.state !== 'output-available') continue;
      const id = part.toolCallId;
      if (!id || handledToolCallIdsRef.current.has(id)) continue;
      const output = part.output;
      if (!output) continue;
      if (output.action === 'navigate' && typeof output.path === 'string') {
        handledToolCallIdsRef.current.add(id);
        router.push(output.path);
        continue;
      }
      if (output.action === 'highlight' && typeof output.selector === 'string') {
        handledToolCallIdsRef.current.add(id);
        const selector = output.selector;
        const duration = output.durationMs ?? 3000;
        try {
          const el = document.querySelector(selector) as HTMLElement | null;
          if (el) {
            el.classList.add('emma-pulse-highlight');
            window.setTimeout(() => el.classList.remove('emma-pulse-highlight'), duration);
          }
        } catch {
          // Bad selector — fail silently; the assistant text already
          // told the user what to look at.
        }
      }
    }
  }, [messages, router]);
  // Pre-first-token shimmer fires when the user message was just sent
  // and Emma hasn't started streaming yet.
  const showPreFirstToken = isSubmitted && messages[messages.length - 1]?.role === 'user';

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      const previewUrls = files
        .filter((f) => f.type.startsWith('image/'))
        .map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
      try {
        const form = new FormData();
        for (const f of files) form.append('files', f);
        const res = await fetch(`/api/chat/${props.threadId}/upload`, {
          method: 'POST',
          body: form,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'upload failed' }));
          alert(body.error ?? 'upload failed');
          return;
        }
        const data = (await res.json()) as { attachments: ChatAttachment[] };
        const enriched = data.attachments.map<PendingAttachment>((a) => ({
          ...a,
          previewUrl: previewUrls.find((p) => p.name === a.originalName)?.url,
        }));
        setAttachments((prev) => [...prev, ...enriched]);
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading(false);
      }
    },
    [props.threadId],
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        await handleUploadFiles(files);
      }
    },
    [handleUploadFiles],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) await handleUploadFiles(files);
    },
    [handleUploadFiles],
  );

  const sendText = useCallback(
    async (text: string, atts: ChatAttachment[]) => {
      if (isStreaming || isSubmitted) return;
      const trimmed = text.trim();
      if (trimmed.length === 0 && atts.length === 0) return;
      await sendMessage({ text: trimmed }, { body: { text: trimmed, attachments: atts } });
    },
    [isStreaming, isSubmitted, sendMessage],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      // Capture + clear UI BEFORE await sendMessage. The AI SDK v6
      // sendMessage promise resolves when the stream finishes — if we
      // wait, the input stays populated for the entire reply.
      // Phase 07c bug fix: clear synchronously so the textarea is
      // empty by the time the next paint runs.
      const text = inputDraft;
      const atts = attachments.map<ChatAttachment>((a) => ({
        r2Key: a.r2Key,
        mime: a.mime,
        originalName: a.originalName,
        sizeBytes: a.sizeBytes,
      }));
      setInputDraft('');
      setAttachments([]);
      await sendText(text, atts);
    },
    [attachments, inputDraft, sendText],
  );

  const handleStarterPick = useCallback(
    (prompt: string) => {
      void sendText(prompt, []);
    },
    [sendText],
  );

  const placeholder = t('inputPlaceholder', { project: props.projectName });
  const subline = t('subline', { project: props.projectName });

  // `||` not `??` so empty strings fall through. Last resort 'amigo'
  // matches the server-side fallback in chatSystemPrompts so the
  // persona stays consistent across prompt + UI (07c).
  const greetingName =
    props.firstName?.trim() ||
    props.userDisplayName?.split(' ')[0]?.trim() ||
    props.userDisplayName?.trim() ||
    'amigo';

  // Eyebrow role label above each user message (07e). 'TÚ' / 'YOU'
  // fallback comes from the Emma namespace so it matches the locale.
  const userRoleLabel =
    props.firstName?.trim().toUpperCase() ||
    props.userDisplayName?.split(' ')[0]?.trim().toUpperCase() ||
    t('userFallback');

  // Greeting weaves the brand voice tone into a one-line sentence.
  // ICU-style `<em>` placeholder gives next-intl the markup it needs
  // to style the tone in italic amber inline.
  const tone = props.brandKit.voice?.tone ?? null;
  const greetingBody = tone
    ? t.rich('greetingWithTone', {
        name: greetingName,
        tone: tone.toLowerCase(),
        em: (chunks) => <em>{chunks}</em>,
      })
    : t('greetingPlain', { name: greetingName });

  const audience = props.brandKit.keywords?.slice(0, 4).join(' · ') ?? null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-drop zone — the textarea inside owns interaction
    <div
      className={`emma-canvas size-${size} ${isDragging ? 'is-dragging' : ''}`}
      style={{ marginInline: 'auto', minHeight: 'calc(100vh - 200px)', position: 'relative' }}
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        // Only un-flag when we leave the canvas itself, not internal moves.
        if (e.currentTarget === e.target) setIsDragging(false);
      }}
    >
      {/* Header — full chrome in page mode, compact bar in widget mode. */}
      {props.compact ? (
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 8 }}>
          <EmmaClearButton
            confirming={confirmingClear}
            clearing={clearing}
            messageCount={messages.length}
            onAskConfirm={() => setConfirmingClear(true)}
            onCancel={() => setConfirmingClear(false)}
            onConfirm={handleClear}
          />
          <EmmaCostTicker cents={costCents} />
        </div>
      ) : (
        <>
          {/* ── Header row: clear · size toggle · cost ticker ─────────── */}
          <div
            className="flex items-center justify-between gap-3"
            style={{ marginBottom: 'var(--emma-gap-block)' }}
          >
            <EmmaClearButton
              confirming={confirmingClear}
              clearing={clearing}
              messageCount={messages.length}
              onAskConfirm={() => setConfirmingClear(true)}
              onCancel={() => setConfirmingClear(false)}
              onConfirm={handleClear}
            />
            <div className="flex items-center gap-3">
              <EmmaSizeToggle value={size} onChange={setSize} />
              <EmmaCostTicker cents={costCents} />
            </div>
          </div>

          {/* ── Emma. headline ─────────────────────────────────── */}
          <h1 className="emma-name">
            Emma<span className="emma-name-period">.</span>
          </h1>
          <p className="emma-subline" style={{ marginTop: 4 }}>
            {subline}
          </p>

          {/* ── Brand strip ────────────────────────────────────── */}
          <div style={{ marginTop: 'var(--emma-gap-block)' }}>
            <EmmaBrandStrip brandKit={props.brandKit} audience={audience} />
          </div>

          {/* ── Greeting block ─────────────────────────────────── */}
          <div className="emma-greeting" style={{ marginTop: 'var(--emma-gap-block)' }}>
            {greetingBody}
          </div>
        </>
      )}

      {/* ── Body: empty state OR message list ─────────────── */}
      <div style={{ marginTop: 'var(--emma-gap-block)' }}>
        {messages.length === 0 ? (
          <EmmaEmptyState onSelect={handleStarterPick} />
        ) : (
          <div>
            {messages.map((m, i) => (
              <ChatMessageView
                key={m.id}
                message={m as never}
                isStreaming={isStreaming && i === messages.length - 1}
                userRoleLabel={userRoleLabel}
              />
            ))}
            {showPreFirstToken ? <PreFirstTokenShimmer /> : null}
          </div>
        )}
        {error ? (
          <div
            style={{
              marginTop: 12,
              fontSize: 'var(--emma-body-size)',
              color: 'var(--emma-amber)',
              borderLeft: '1.5px solid var(--emma-amber)',
              paddingLeft: 14,
            }}
          >
            {error.message}
          </div>
        ) : null}
      </div>

      {/* ── Pending attachments preview ───────────────────── */}
      {attachments.length > 0 ? (
        <div
          style={{ marginTop: 'var(--emma-gap-block)', display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          {attachments.map((a) => (
            <div
              key={a.r2Key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                border: '0.5px solid var(--emma-ink-12)',
                background: 'var(--emma-paper-2)',
                fontFamily: 'var(--emma-font-mono)',
                fontSize: 10,
              }}
            >
              {a.previewUrl ? (
                /* biome-ignore lint/a11y/useAltText: thumbnail preview */
                <img
                  src={a.previewUrl}
                  alt=""
                  style={{ width: 24, height: 24, objectFit: 'cover' }}
                />
              ) : (
                <span style={{ color: 'var(--emma-ink-65)' }}>
                  {a.mime.split('/')[1] ?? 'file'}
                </span>
              )}
              <span
                style={{
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--emma-ink)',
                }}
              >
                {a.originalName}
              </span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((x) => x.r2Key !== a.r2Key))}
                aria-label={t('removeAttachment', { name: a.originalName })}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--emma-ink-65)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Input ─────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="emma-input"
        style={{ marginTop: 'var(--emma-gap-block)' }}
      >
        <button
          type="button"
          className="emma-attach"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t('attach')}
          disabled={uploading}
        >
          {uploading ? '…' : '+'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) {
              void handleUploadFiles(files);
              e.target.value = '';
            }
          }}
        />
        <textarea
          value={inputDraft}
          onChange={(e) => setInputDraft(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !isStreaming && !isSubmitted) {
              e.preventDefault();
              void handleSubmit(e);
            }
          }}
          placeholder={placeholder}
          rows={1}
          disabled={isStreaming || isSubmitted}
        />
        {isStreaming || isSubmitted ? (
          <button type="button" className="emma-send" onClick={() => stop()}>
            {t('stop')}
          </button>
        ) : (
          <button
            type="submit"
            className="emma-send"
            disabled={inputDraft.trim().length === 0 && attachments.length === 0}
          >
            {t('send')}
          </button>
        )}
      </form>
    </div>
  );
}

/**
 * Clear-chat button — inline confirm pattern.
 *
 * Idle state: small mono link-style "borrar conversación" (ES) or
 * "clear chat" (EN). Click → morphs into a 1-line confirm strip:
 *   `borrar? los guardados se quedan · [cancelar] [sí, borrar]`
 *
 * Editorial-light: no modal, no destructive-red color. The amber
 * confirm button is the only chromatic emphasis. When the chat has
 * 0 messages we hide the affordance entirely (nothing to clear).
 */
interface EmmaClearButtonProps {
  confirming: boolean;
  clearing: boolean;
  messageCount: number;
  onAskConfirm: () => void;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

function EmmaClearButton(props: EmmaClearButtonProps) {
  const t = useTranslations('Emma');
  if (props.messageCount === 0) return null;
  const confirmLabel = props.clearing ? t('clearBusy') : t('clearConfirm');

  if (!props.confirming) {
    return (
      <button type="button" className="emma-clear-link" onClick={props.onAskConfirm}>
        {t('clearIdle')}
      </button>
    );
  }

  return (
    <span className="emma-clear-confirm">
      <span className="emma-clear-reassure">{t('clearReassure')}</span>
      <button
        type="button"
        className="emma-clear-cancel"
        onClick={props.onCancel}
        disabled={props.clearing}
      >
        {t('clearCancel')}
      </button>
      <button
        type="button"
        className="emma-clear-confirm-go"
        onClick={() => void props.onConfirm()}
        disabled={props.clearing}
      >
        {confirmLabel}
      </button>
    </span>
  );
}
