'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { BriefSummary } from '@/server/ai/briefs';

export type BriefMode =
  | { kind: 'project' }
  | { kind: 'one-shot'; text: string; filename: string }
  | { kind: 'skip' };

interface CopyFormBriefIndicatorProps {
  summary: BriefSummary | null;
  mode: BriefMode;
  onChange: (mode: BriefMode) => void;
  disabled: boolean;
}

const ACCEPT = '.pdf,.docx,.md,.txt';

function bytesLabel(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToText(file: File): Promise<string> {
  // For one-shot the easiest path is client-side text extraction for txt/md
  // and round-trip through the upload-style server action for pdf/docx.
  // We keep this MVP path text-only: txt/md support inline; pdf/docx route
  // through the project brief flow if the user wants those formats.
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext !== 'txt' && ext !== 'md') {
    throw new Error('one-shot-format-limited');
  }
  return await file.text();
}

export function CopyFormBriefIndicator({
  summary,
  mode,
  onChange,
  disabled,
}: CopyFormBriefIndicatorProps) {
  const t = useTranslations('Copy');
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usingProject = mode.kind === 'project' && summary?.hasText;
  const usingOneShot = mode.kind === 'one-shot';
  const skipped = mode.kind === 'skip' || (mode.kind === 'project' && !summary?.hasText);

  const projectLabel = summary?.filename
    ? t('briefUsingProject', {
        filename: summary.filename,
        bytes: bytesLabel(summary.bytes),
      })
    : t('briefUsingPasted');

  function pickFile() {
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await fileToText(file);
      onChange({ kind: 'one-shot', text, filename: file.name });
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error';
      setError(msg);
    }
  }

  return (
    <div className="space-y-2">
      <span className="mono-eyebrow text-ink-3">{t('briefLabel')}</span>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-fraunces text-ink">
          {usingProject && projectLabel}
          {usingOneShot && t('briefOneShotApplied')}
          {skipped && t('briefNone')}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="mono-eyebrow text-accent underline"
        >
          [{t('briefChange')}]
        </button>
      </div>

      {open && (
        <div className="space-y-2 border border-ink p-4">
          <button
            type="button"
            disabled={disabled || !summary?.hasText}
            onClick={() => {
              onChange({ kind: 'project' });
              setOpen(false);
            }}
            className="block text-left text-sm hover:underline disabled:opacity-50"
          >
            {t('briefOptionUseProject')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={pickFile}
            className="block text-left text-sm hover:underline"
          >
            {t('briefOptionUploadOneShot')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange({ kind: 'skip' });
              setOpen(false);
            }}
            className="block text-left text-sm hover:underline"
          >
            {t('briefOptionSkip')}
          </button>
          {error && (
            <p className="mono-eyebrow text-accent" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {usingOneShot && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ kind: 'project' })}
          className="mono-eyebrow text-ink-3 underline"
        >
          {t('briefOneShotClear')}
        </button>
      )}

      <input ref={fileRef} type="file" accept={ACCEPT} onChange={onFile} className="hidden" />
    </div>
  );
}
