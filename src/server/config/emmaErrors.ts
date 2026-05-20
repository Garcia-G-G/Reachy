/**
 * Emma error templates — Phase 07i.
 *
 * Locale-aware copy for the chat error surface (the card we now
 * persist when an upstream stream error fires) and the Sonner
 * toast. Centralized so a tone change is a single-file edit.
 *
 * NO `server-only` marker — the chat client renders both the toast
 * and the card from these constants.
 */

export interface ErrorSurfacePayload {
  /** Friendly summary line that becomes the card title. */
  title: string;
  /** Optional small detail line (e.g. OpenAI request_id). */
  subtitle: string | null;
  /** Persistent text body — written into chat_message.content so
   *  reloads show the same card with the same detail. */
  bodyText: string;
}

const REQUEST_ID_RE = /req_[a-zA-Z0-9]+/;

/** Extract `req_xxxxx` from the raw error string. Returns null when
 *  the upstream didn't include one. */
export function extractOpenAIRequestId(rawError: string | null | undefined): string | null {
  if (!rawError) return null;
  const m = REQUEST_ID_RE.exec(rawError);
  return m ? m[0] : null;
}

export function buildStreamErrorSurface(
  locale: 'en' | 'es',
  requestId: string | null,
): ErrorSurfacePayload {
  const titleEs = 'Emma se trabó por un error transitorio.';
  const titleEn = 'Emma hit a transient stream error.';
  const title = locale === 'es' ? titleEs : titleEn;
  const subtitle = requestId ? `OpenAI request_id: ${requestId}` : null;
  // bodyText is what gets persisted as chat_message.content. The
  // client renders the card visually but we still keep a readable
  // body so a fallback render (e.g. plain text export) makes sense.
  const bodyText = [title, subtitle].filter((l): l is string => l !== null).join('\n');
  return { title, subtitle, bodyText };
}

/** Sonner toast strings — short, action-oriented. */
export const EMMA_ERROR_TOAST = {
  retryEs: 'Emma se trabó — revisa el chat para reintentar.',
  retryEn: 'Emma hit an error — check the chat to retry.',
} as const;

export function toastRetry(locale: 'en' | 'es'): string {
  return locale === 'es' ? EMMA_ERROR_TOAST.retryEs : EMMA_ERROR_TOAST.retryEn;
}

/** Action chip labels for the error card. */
export const EMMA_ERROR_CHIPS = {
  retryEs: 'reintentar',
  retryEn: 'retry',
  copyEs: 'copiar detalle',
  copyEn: 'copy detail',
} as const;
