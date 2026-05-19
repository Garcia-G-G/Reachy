'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { BrandKit } from '@/server/actions/brandKits';
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
          return { body: { text, attachments: atts } };
        },
      }),
    [props.threadId],
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
    messages: props.initialMessages.map(persistedToUIMessage) as never,
    onFinish: () => {
      // Approximate cost bump — see Phase 07's commit notes for the
      // refinement plan (a /cost endpoint that reads the just-
      // persisted chat_message.costCents).
      setCostCents((c) => c + 5);
    },
  });

  const isStreaming = status === 'streaming';
  const isSubmitted = status === 'submitted';
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

  const placeholder =
    props.language === 'es'
      ? `Pregúntale a Emma sobre ${props.projectName}…`
      : `Ask Emma about ${props.projectName}…`;

  const subline =
    props.language === 'es' ? `para ${props.projectName}` : `for ${props.projectName}`;

  // Phase 07c — `||` not `??` so empty strings fall through to the
  // next fallback. Last resort 'amigo' matches the server-side fallback
  // so the persona stays consistent in the prompt and the UI.
  const greetingName =
    props.firstName?.trim() ||
    props.userDisplayName?.split(' ')[0]?.trim() ||
    props.userDisplayName?.trim() ||
    'amigo';
  // Greeting uses the brand voice tone (italic amber) as a small flourish
  // inside an otherwise plain body sentence — sells the persona without
  // a full eyebrow label.
  const tone = props.brandKit.voice?.tone ?? null;
  const greetingBody =
    props.language === 'es' ? (
      tone ? (
        <>
          {`Hola ${greetingName}. Tu marca es `}
          <em>{tone.toLowerCase()}</em>
          {`. ¿Por dónde empezamos?`}
        </>
      ) : (
        <>{`Hola ${greetingName}. ¿Por dónde empezamos?`}</>
      )
    ) : tone ? (
      <>
        {`Hi ${greetingName}. Your brand reads `}
        <em>{tone.toLowerCase()}</em>
        {`. Where do you want to start?`}
      </>
    ) : (
      <>{`Hi ${greetingName}. Where do you want to start?`}</>
    );

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
      {/* ── Header row: cost ticker + size toggle ─────────── */}
      <div
        className="flex items-start justify-end gap-3"
        style={{ marginBottom: 'var(--emma-gap-block)' }}
      >
        <EmmaSizeToggle value={size} onChange={setSize} />
        <EmmaCostTicker cents={costCents} language={props.language} />
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

      {/* ── Body: empty state OR message list ─────────────── */}
      <div style={{ marginTop: 'var(--emma-gap-block)' }}>
        {messages.length === 0 ? (
          <EmmaEmptyState language={props.language} onSelect={handleStarterPick} />
        ) : (
          <div>
            {messages.map((m, i) => (
              <ChatMessageView
                key={m.id}
                message={m as never}
                isStreaming={isStreaming && i === messages.length - 1}
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
                aria-label={`Remove ${a.originalName}`}
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
          aria-label="Attach files"
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
            {props.language === 'es' ? 'detener' : 'stop'}
          </button>
        ) : (
          <button
            type="submit"
            className="emma-send"
            disabled={inputDraft.trim().length === 0 && attachments.length === 0}
          >
            {props.language === 'es' ? 'enviar ↩' : 'send ↩'}
          </button>
        )}
      </form>
    </div>
  );
}
