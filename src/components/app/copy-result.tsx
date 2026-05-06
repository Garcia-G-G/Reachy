'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { type CopyFormat, type CopyPayload, renderCopyAsText } from '@/lib/copy-formats';

interface CopyResultProps {
  format: CopyFormat;
  payload: { es: CopyPayload['value']; en: CopyPayload['value'] };
  tCommon: (key: 'save' | 'errorGeneric') => string;
}

export function CopyResult({ format, payload, tCommon }: CopyResultProps) {
  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
      <Column
        format={format}
        language="ES"
        payload={{ format, value: payload.es } as CopyPayload}
        tCommon={tCommon}
      />
      <Column
        format={format}
        language="EN"
        payload={{ format, value: payload.en } as CopyPayload}
        tCommon={tCommon}
      />
    </div>
  );
}

function Column({
  format,
  language,
  payload,
  tCommon,
}: {
  format: CopyFormat;
  language: 'ES' | 'EN';
  payload: CopyPayload;
  tCommon: (key: 'save' | 'errorGeneric') => string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      const text = renderCopyAsText(payload);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(tCommon('errorGeneric'));
    }
  }

  return (
    <article className="space-y-4">
      <header className="flex items-baseline justify-between border-b border-rule pb-2">
        <span className="mono-eyebrow text-ink-3">{language}</span>
        <button
          type="button"
          onClick={onCopy}
          className="mono-eyebrow text-ink-3 transition-colors hover:text-accent"
        >
          {copied ? '✓ Copied' : '⧉ Copy'}
        </button>
      </header>
      <div>
        <PayloadRenderer payload={payload} format={format} />
      </div>
    </article>
  );
}

function PayloadRenderer({ payload, format }: { payload: CopyPayload; format: CopyFormat }) {
  switch (format) {
    case 'tweet':
    case 'linkedin':
    case 'email-body':
      return <ParagraphBlock text={payload.value as string} />;

    case 'thread': {
      const tweets = payload.value as string[];
      return (
        <ol className="space-y-6">
          {tweets.map((tweet, i) => (
            <li key={`tweet-${tweet.slice(0, 24)}`} className="grid grid-cols-[44px_1fr] gap-3">
              <span
                className="display text-ink-3"
                style={{
                  fontFamily: 'var(--font-fraunces), Georgia, serif',
                  fontSize: 28,
                  lineHeight: 1,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="serif-body">{tweet}</p>
            </li>
          ))}
        </ol>
      );
    }

    case 'ig-caption': {
      const v = payload.value as { caption: string; hashtags: string[] };
      return (
        <div className="space-y-4">
          <ParagraphBlock text={v.caption} />
          <p className="font-mono text-sm text-ink-2">
            {v.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join('  ')}
          </p>
        </div>
      );
    }

    case 'email-subject': {
      const v = payload.value as { subject: string; preview: string };
      return (
        <div className="space-y-4">
          <p
            className="display"
            style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontSize: 'clamp(22px, 2.4vw, 30px)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            {v.subject}
          </p>
          <p className="serif-body text-ink-2 italic">{v.preview}</p>
        </div>
      );
    }

    case 'headline': {
      const v = payload.value as { headline: string; sub: string };
      return (
        <div className="space-y-4">
          <h3
            className="display"
            style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontSize: 'clamp(28px, 3.6vw, 44px)',
              lineHeight: 1.0,
              letterSpacing: '-0.025em',
              fontWeight: 500,
            }}
          >
            {v.headline}
          </h3>
          <p className="serif-body text-ink-2">{v.sub}</p>
        </div>
      );
    }

    case 'features': {
      const v = payload.value as Array<{ title: string; body: string }>;
      return (
        <ul className="space-y-6">
          {v.map((f, i) => (
            <li key={`feature-${f.title.slice(0, 24)}`} className="grid grid-cols-[36px_1fr] gap-3">
              <span
                className="display text-accent"
                style={{
                  fontFamily: 'var(--font-fraunces), Georgia, serif',
                  fontSize: 24,
                  lineHeight: 1,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="space-y-1">
                <p
                  className="display"
                  style={{
                    fontFamily: 'var(--font-fraunces), Georgia, serif',
                    fontSize: 18,
                    fontWeight: 500,
                    lineHeight: 1.2,
                  }}
                >
                  {f.title}
                </p>
                <p className="serif-body text-ink-2">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
      );
    }

    case 'how-it-works': {
      const v = payload.value as Array<{ step: number; title: string; body: string }>;
      return (
        <ol className="space-y-6">
          {v.map((s) => (
            <li
              key={`step-${s.step}-${s.title.slice(0, 24)}`}
              className="grid grid-cols-[36px_1fr] gap-3"
            >
              <span
                className="display text-accent"
                style={{
                  fontFamily: 'var(--font-fraunces), Georgia, serif',
                  fontSize: 24,
                  lineHeight: 1,
                }}
              >
                {String(s.step).padStart(2, '0')}
              </span>
              <div className="space-y-1">
                <p
                  className="display"
                  style={{
                    fontFamily: 'var(--font-fraunces), Georgia, serif',
                    fontSize: 18,
                    fontWeight: 500,
                    lineHeight: 1.2,
                  }}
                >
                  {s.title}
                </p>
                <p className="serif-body text-ink-2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      );
    }
  }
}

function ParagraphBlock({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="space-y-4">
      {paragraphs.map((p) => (
        <p key={`p-${p.slice(0, 32)}`} className="serif-body whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}
