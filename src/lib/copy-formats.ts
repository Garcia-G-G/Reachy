// Client-safe constants for copy generation. Mirrors image-formats.ts. No
// 'server-only' here so the values can flow into client components.

export type CopyFormat =
  | 'tweet'
  | 'thread'
  | 'linkedin'
  | 'ig-caption'
  | 'email-subject'
  | 'email-body'
  | 'headline'
  | 'features'
  | 'how-it-works';

export interface CopyFormatSpec {
  /** i18n key under the Copy.formats namespace; falls back to `label` if missing. */
  labelKey: string;
  /** English fallback label if no i18n string is available. */
  label: string;
  /** "Long" indicates the result is multi-paragraph or list-shaped, used for layout. */
  shape: 'short' | 'long' | 'list';
  /** Soft hint shown in the form to set expectations for the user. */
  hint: string;
}

export const COPY_FORMATS: Record<CopyFormat, CopyFormatSpec> = {
  tweet: {
    labelKey: 'tweet',
    label: 'Tweet / X (≤280)',
    shape: 'short',
    hint: 'One tight tweet under 280 chars.',
  },
  thread: {
    labelKey: 'thread',
    label: 'X thread (5–7 tweets)',
    shape: 'list',
    hint: 'A 5–7 tweet thread, each tweet under 280 chars.',
  },
  linkedin: {
    labelKey: 'linkedin',
    label: 'LinkedIn post (≤1500)',
    shape: 'long',
    hint: 'A LinkedIn-shaped post under 1500 chars.',
  },
  'ig-caption': {
    labelKey: 'igCaption',
    label: 'Instagram caption + hashtags',
    shape: 'long',
    hint: 'Caption plus exactly 5 hashtags.',
  },
  'email-subject': {
    labelKey: 'emailSubject',
    label: 'Email subject + preview',
    shape: 'short',
    hint: 'Subject ≤60 chars and a 1-line preview.',
  },
  'email-body': {
    labelKey: 'emailBody',
    label: 'Email body (campaign)',
    shape: 'long',
    hint: 'A full campaign email body under 1500 chars.',
  },
  headline: {
    labelKey: 'headline',
    label: 'Landing headline + subheadline',
    shape: 'short',
    hint: 'Hero headline plus a short subheadline.',
  },
  features: {
    labelKey: 'features',
    label: '3 feature bullets',
    shape: 'list',
    hint: 'Exactly 3 feature bullets (title + 1-line body).',
  },
  'how-it-works': {
    labelKey: 'howItWorks',
    label: '3 "How it works" steps',
    shape: 'list',
    hint: 'Exactly 3 numbered steps (title + 1-line body).',
  },
};

export const COPY_FORMAT_KEYS = Object.keys(COPY_FORMATS) as CopyFormat[];

export type CopyLanguage = 'es' | 'en';
export const COPY_LANGUAGES: readonly CopyLanguage[] = ['es', 'en'] as const;

/**
 * The shape of a parsed copy payload (one half — either ES or EN).
 * Mirrors the JSON schemas in src/server/ai/copySchemas.ts. Discriminated
 * by `format` so client renderers can switch safely.
 */
export type CopyPayload =
  | { format: 'tweet'; value: string }
  | { format: 'thread'; value: string[] }
  | { format: 'linkedin'; value: string }
  | { format: 'ig-caption'; value: { caption: string; hashtags: string[] } }
  | { format: 'email-subject'; value: { subject: string; preview: string } }
  | { format: 'email-body'; value: string }
  | { format: 'headline'; value: { headline: string; sub: string } }
  | { format: 'features'; value: Array<{ title: string; body: string }> }
  | { format: 'how-it-works'; value: Array<{ step: number; title: string; body: string }> };

/** Render a payload as plain text (for the "Copy" button, archive snippet, etc.). */
export function renderCopyAsText(payload: CopyPayload): string {
  switch (payload.format) {
    case 'tweet':
    case 'linkedin':
    case 'email-body':
      return payload.value;
    case 'thread':
      return payload.value.map((t, i) => `${i + 1}/${payload.value.length} ${t}`).join('\n\n');
    case 'ig-caption':
      return `${payload.value.caption}\n\n${payload.value.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`;
    case 'email-subject':
      return `Subject: ${payload.value.subject}\nPreview: ${payload.value.preview}`;
    case 'headline':
      return `${payload.value.headline}\n${payload.value.sub}`;
    case 'features':
      return payload.value.map((f) => `• ${f.title} — ${f.body}`).join('\n');
    case 'how-it-works':
      return payload.value.map((s) => `${s.step}. ${s.title} — ${s.body}`).join('\n');
  }
}

/** Quick snippet (~50 chars, single line) for the archive table. */
export function copySnippet(payload: CopyPayload, max = 60): string {
  const text = renderCopyAsText(payload).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
