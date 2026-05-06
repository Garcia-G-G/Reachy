'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  COPY_FORMATS,
  type CopyFormat,
  type CopyPayload,
  copySnippet,
  renderCopyAsText,
} from '@/lib/copy-formats';
import { CopyResult } from './copy-result';

export interface CopyArchiveRow {
  generationId: string;
  format: CopyFormat;
  createdAt: string;
  costCents: number | null;
  status: 'queued' | 'running' | 'done' | 'failed';
  errorMessage: string | null;
  esPayload: CopyPayload['value'] | null;
  enPayload: CopyPayload['value'] | null;
}

export function CopyArchive({ editions }: { editions: CopyArchiveRow[] }) {
  const t = useTranslations('Library');
  const tCommon = useTranslations('common');
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="grid grid-cols-[120px_1fr_60px_1fr_120px] gap-4 border-b border-ink pb-3">
        <span className="mono-eyebrow text-ink-3">{t('colDate')}</span>
        <span className="mono-eyebrow text-ink-3">{t('colFormat')}</span>
        <span className="mono-eyebrow text-ink-3">{t('colLanguage')}</span>
        <span className="mono-eyebrow text-ink-3">{t('colSnippet')}</span>
        <span className="mono-eyebrow text-ink-3 text-right">{t('colActions')}</span>
      </div>

      {editions.map((edition) => {
        const isOpen = openId === edition.generationId;
        const isFailed = edition.status === 'failed' || (!edition.esPayload && !edition.enPayload);

        return (
          <div key={edition.generationId} className="border-b border-rule">
            {/* ES row */}
            <Row
              date={edition.createdAt}
              format={edition.format}
              language="ES"
              payload={edition.esPayload}
              isFailed={isFailed}
              errorMessage={edition.errorMessage}
              isOpen={isOpen}
              onToggle={() => setOpenId(isOpen ? null : edition.generationId)}
              viewLabel={t('view')}
              viewingLabel={t('viewing')}
            />
            {/* EN row */}
            {edition.enPayload && (
              <Row
                date={null}
                format={edition.format}
                language="EN"
                payload={edition.enPayload}
                isFailed={false}
                errorMessage={null}
                isOpen={isOpen}
                onToggle={() => setOpenId(isOpen ? null : edition.generationId)}
                viewLabel={t('view')}
                viewingLabel={t('viewing')}
              />
            )}

            {isOpen && edition.esPayload && edition.enPayload && (
              <div className="my-6 border border-ink p-6">
                <CopyResult
                  format={edition.format}
                  payload={{
                    es: edition.esPayload,
                    en: edition.enPayload,
                  }}
                  tCommon={tCommon}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({
  date,
  format,
  language,
  payload,
  isFailed,
  errorMessage,
  isOpen,
  onToggle,
  viewLabel,
  viewingLabel,
}: {
  date: string | null;
  format: CopyFormat;
  language: 'ES' | 'EN';
  payload: CopyPayload['value'] | null;
  isFailed: boolean;
  errorMessage: string | null;
  isOpen: boolean;
  onToggle: () => void;
  viewLabel: string;
  viewingLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!payload) return;
    const text = renderCopyAsText({ format, value: payload } as CopyPayload);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Clipboard blocked.');
    }
  }

  const dateStr = date ? formatDate(date) : '';
  const snippet = payload
    ? copySnippet({ format, value: payload } as CopyPayload, 80)
    : isFailed
      ? `Failed${errorMessage ? ` — ${errorMessage}` : ''}`
      : '—';

  return (
    <div className="grid grid-cols-[120px_1fr_60px_1fr_120px] items-center gap-4 py-3">
      <span className="mono-eyebrow text-ink-3">{dateStr}</span>
      <span
        className="truncate text-[15px]"
        style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}
      >
        {COPY_FORMATS[format]?.label ?? format}
      </span>
      <span className="mono-eyebrow text-ink-3">{language}</span>
      <span
        className={`truncate text-[15px] ${isFailed ? 'text-accent italic' : ''}`}
        style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}
      >
        {snippet}
      </span>
      <div className="flex items-center justify-end gap-3">
        {payload && (
          <button
            type="button"
            onClick={copy}
            className="mono-eyebrow text-ink-3 transition-colors hover:text-accent"
          >
            {copied ? '✓' : '⧉'}
          </button>
        )}
        {payload && (
          <button
            type="button"
            onClick={onToggle}
            className="mono-eyebrow text-ink-3 transition-colors hover:text-accent"
          >
            {isOpen ? viewingLabel : viewLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  // Magazine-style date: "06 MAY 26"
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const year = String(d.getFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}
