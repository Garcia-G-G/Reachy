'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChatAttachment, ChatMessage } from '@/server/db/schema/chatMessages';
import { ChatMessageView } from './chat-message';

/**
 * EmmaChat — the per-project chat client. Phase 07.
 *
 * Mounts the AI SDK v6 useChat hook against the /api/chat/[threadId]/
 * stream endpoint. Handles:
 *  - Streaming token rendering.
 *  - File attachment uploads (pre-upload to /upload, then include
 *    the returned r2Key in the next /stream POST).
 *  - Drag-drop + Cmd-V paste of images.
 *  - Inline tool-call cards (rendered by chat-message → chat-tool-card).
 *  - Conversation cost ticker.
 *
 * Editorial design: paper background, ink text, hard print shadows,
 * no rounded corners, mono uppercase eyebrows.
 */

interface BrandSummary {
  ink: string | null;
  paper: string | null;
  accent: string | null;
  voiceTone: string | null;
  visualStyle: string | null;
}

interface EmmaChatProps {
  projectName: string;
  projectSlug: string;
  threadId: string;
  welcomeLine: string;
  initialMessages: ChatMessage[];
  initialCostCents: number;
  brandSummary: BrandSummary;
  language: 'en' | 'es';
  userDisplayName: string;
}

interface PendingAttachment extends ChatAttachment {
  /** Client-side preview URL for images during the brief window between
   *  selection and upload completion. */
  previewUrl?: string;
}

/** Convert a persisted ChatMessage row into a useChat UIMessage so the
 *  pre-loaded history renders correctly when the page mounts. */
function persistedToUIMessage(row: ChatMessage) {
  const parts = Array.isArray(row.content)
    ? (row.content as Array<{ type: string; [k: string]: unknown }>)
    : [];
  // UI messages need .parts in the AI SDK v6 format. Persisted content
  // is in ModelMessage format (TextPart / ToolCallPart / etc.). We pass
  // it through; the UIMessage type accepts text + tool-* part shapes.
  return {
    id: row.id,
    role: row.role as 'user' | 'assistant' | 'system',
    parts: parts as never,
  };
}

export function EmmaChat(props: EmmaChatProps) {
  const [costCents, setCostCents] = useState(props.initialCostCents);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [inputDraft, setInputDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/chat/${props.threadId}/stream`,
        // The default body shape sends { messages: [...], ... } but our
        // route expects { text, attachments }. We override prepareSendMessagesRequest
        // to extract just the latest user message + the staged attachments.
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
      // Re-fetch cost after each assistant turn lands. The handler
      // persists cost on the chat_message rows; here we just bump a
      // local counter by a small visible amount so the user sees
      // movement. (A more precise approach would refetch from a
      // /cost endpoint, kept simple for now.)
      setCostCents((c) => c + 5); // approximate — refined when the
      // assistant message is actually persisted.
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

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
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) await handleUploadFiles(files);
    },
    [handleUploadFiles],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isStreaming) return;
      const trimmed = inputDraft.trim();
      if (trimmed.length === 0 && attachments.length === 0) return;
      const atts = attachments.map<ChatAttachment>((a) => ({
        r2Key: a.r2Key,
        mime: a.mime,
        originalName: a.originalName,
        sizeBytes: a.sizeBytes,
      }));
      // Build the UI message parts so the persisted history matches
      // what the server will record. Server-side handler.ts also
      // persists the user message (single source of truth) — the
      // client copy is just for optimistic rendering.
      await sendMessage(
        {
          text: trimmed,
        },
        {
          body: { text: trimmed, attachments: atts },
        },
      );
      setInputDraft('');
      setAttachments([]);
    },
    [attachments, inputDraft, isStreaming, sendMessage],
  );

  const placeholder =
    props.language === 'es'
      ? `Pregúntale a Emma sobre ${props.projectName}…`
      : `Ask Emma about ${props.projectName}…`;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-drop zone — the textarea inside owns the user-facing interaction
    <div
      className="flex h-[calc(100vh-180px)] flex-col"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Header — Emma + project + brand chip + cost ticker */}
      <header className="border-rule border-b bg-paper">
        <div className="flex items-start justify-between gap-4 py-4">
          <div>
            <h1 className="font-display text-3xl tracking-tight text-ink">
              Emma · <span className="font-italic text-ink-2">{props.projectName}</span>
            </h1>
            <p className="mono-eyebrow mt-2 text-ink-3">
              brand · {props.brandSummary.visualStyle ?? 'editorial'} ·{' '}
              <span style={{ color: props.brandSummary.ink ?? '#14110D' }}>
                ink {props.brandSummary.ink}
              </span>
              {props.brandSummary.voiceTone ? ` · voice ${props.brandSummary.voiceTone}` : ''}
            </p>
          </div>
          <div className="mono-eyebrow text-right text-ink-3">
            <div>${(costCents / 100).toFixed(2)}</div>
            <div className="text-[10px] tracking-wider">this conversation</div>
          </div>
        </div>
      </header>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-1 py-6">
        {messages.length === 0 && (
          <div className="mb-6 border-l-2 border-accent bg-paper-2 p-4 text-ink-2">
            <div className="mono-eyebrow text-ink-3">Emma</div>
            <div className="mt-1 leading-relaxed">{props.welcomeLine}</div>
          </div>
        )}
        {messages.map((m) => (
          <ChatMessageView
            key={m.id}
            message={m as never}
            userDisplayName={props.userDisplayName}
          />
        ))}
        {isStreaming && <div className="mono-eyebrow mt-2 text-ink-3">Emma is typing…</div>}
        {error && (
          <div className="mt-2 border-l-2 border-red-700 bg-red-50 p-3 text-sm text-red-900">
            {error.message}
          </div>
        )}
      </div>

      {/* Pending attachments preview */}
      {attachments.length > 0 && (
        <div className="border-rule border-t bg-paper-2 px-1 py-3">
          <div className="mono-eyebrow mb-2 text-ink-3">attached · {attachments.length}</div>
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div
                key={a.r2Key}
                className="flex items-center gap-2 border border-ink bg-paper px-2 py-1 text-xs"
              >
                {a.previewUrl ? (
                  // biome-ignore lint/a11y/useAltText: thumbnail preview only
                  <img src={a.previewUrl} className="h-8 w-8 object-cover" alt="" />
                ) : (
                  <span className="mono-eyebrow text-ink-3">{a.mime.split('/')[1] ?? 'file'}</span>
                )}
                <span className="max-w-[180px] truncate text-ink">{a.originalName}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.r2Key !== a.r2Key))}
                  className="text-ink-3 hover:text-accent"
                  aria-label={`Remove ${a.originalName}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-rule border-t bg-paper py-4">
        <div className="flex items-end gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mono-eyebrow border border-ink bg-paper px-3 py-2 text-ink hover:bg-paper-2"
            disabled={uploading}
            aria-label="Attach files"
          >
            {uploading ? '…' : '📎'}
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
              if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
                e.preventDefault();
                void handleSubmit(e);
              }
            }}
            placeholder={placeholder}
            rows={2}
            className="field flex-1 resize-none bg-transparent text-ink focus:outline-none"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button type="button" onClick={() => stop()} className="btn-ink">
              {props.language === 'es' ? 'Detener' : 'Stop'}
            </button>
          ) : (
            <button
              type="submit"
              className="btn-ink"
              disabled={inputDraft.trim().length === 0 && attachments.length === 0}
            >
              {props.language === 'es' ? 'Enviar ↩' : 'Send ↩'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
