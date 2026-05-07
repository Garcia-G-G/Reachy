'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { type BriefSummary, clearProjectBrief, setProjectBrief } from '@/server/ai/briefs';

interface ProjectBriefSectionProps {
  projectId: string;
  initial: BriefSummary | null;
}

const ACCEPT =
  '.pdf,.docx,.md,.txt,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown',
  txt: 'text/plain',
};

function bytesLabel(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] as number);
  return btoa(binary);
}

export function ProjectBriefSection({ projectId, initial }: ProjectBriefSectionProps) {
  const t = useTranslations('Identity');
  const [summary, setSummary] = useState<BriefSummary | null>(initial);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setError(null);
  }

  function onPick() {
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    reset();
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
      setError(t('briefErrorMime'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t('briefErrorSize'));
      return;
    }

    startTransition(async () => {
      try {
        const base64 = await fileToBase64(file);
        const result = await setProjectBrief({
          kind: 'upload',
          projectId,
          filename: file.name,
          // biome-ignore lint/suspicious/noExplicitAny: the union narrows on the server.
          mime: mime as any,
          base64,
        });
        if (!result.ok) {
          setError(translateError(t, result.error, mime));
          return;
        }
        setSummary({
          hasText: true,
          filename: result.data.briefFilename,
          mime: result.data.briefMime,
          bytes: result.data.briefBytes,
          updatedAt: result.data.briefUpdatedAt,
          textLength: result.data.briefTextLength,
          preview: '',
        });
        if (result.data.truncated) {
          toast.warning(t('briefTruncatedNote', { chars: result.data.briefTextLength.toString() }));
        }
      } catch (_err) {
        setError(t('briefErrorGeneric'));
      }
    });
  }

  function onSavePasted() {
    reset();
    if (pasted.trim().length === 0) return;
    startTransition(async () => {
      const result = await setProjectBrief({
        kind: 'paste',
        projectId,
        text: pasted,
      });
      if (!result.ok) {
        setError(translateError(t, result.error));
        return;
      }
      setSummary({
        hasText: true,
        filename: null,
        mime: null,
        bytes: null,
        updatedAt: result.data.briefUpdatedAt,
        textLength: result.data.briefTextLength,
        preview: pasted.slice(0, 600),
      });
      setPasted('');
      setPasteOpen(false);
      if (result.data.truncated) {
        toast.warning(t('briefTruncatedNote', { chars: result.data.briefTextLength.toString() }));
      }
    });
  }

  function onRemove() {
    reset();
    startTransition(async () => {
      const result = await clearProjectBrief(projectId);
      if (!result.ok) {
        setError(t('briefErrorGeneric'));
        return;
      }
      setSummary(null);
    });
  }

  return (
    <section className="space-y-4 border-t border-rule pt-10">
      <header className="flex items-baseline justify-between border-b border-rule pb-2">
        <h2 className="font-fraunces text-2xl">{t('briefHeading')}</h2>
        <span className="mono-eyebrow text-ink-3">{t('briefOptional')}</span>
      </header>
      <p className="text-sm text-ink-2">{t('briefIntro')}</p>

      {summary?.hasText ? (
        <div className="space-y-4 border border-ink p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-fraunces text-xl">
              {summary.filename ?? t('briefMetaPasted')}
            </span>
            {summary.bytes !== null && (
              <span className="mono-eyebrow text-ink-3">{bytesLabel(summary.bytes)}</span>
            )}
            {summary.updatedAt && (
              <span className="mono-eyebrow text-ink-3">
                {t('briefMetaUpdated', {
                  date: new Date(summary.updatedAt).toLocaleDateString(),
                })}
              </span>
            )}
          </div>
          {summary.preview.length > 0 && (
            <div className="border-t border-rule pt-3">
              <span className="mono-eyebrow text-ink-3">{t('briefPreviewLabel')}</span>
              <p className="mt-2 whitespace-pre-wrap font-fraunces text-ink-3">
                {summary.preview}
                {summary.textLength > summary.preview.length ? '…' : ''}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onPick} disabled={pending} className="btn-ghost">
              {t('briefReplace')}
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              className="btn-ghost text-accent"
            >
              {t('briefRemove')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={onPick}
            disabled={pending}
            className="block w-full border border-dashed border-ink p-10 text-center font-fraunces text-ink-3 hover:bg-paper-2 disabled:opacity-50"
          >
            {pending ? t('briefSaving') : t('briefDropzone')}
          </button>
          <button
            type="button"
            onClick={() => setPasteOpen((v) => !v)}
            className="mono-eyebrow text-ink-3 underline"
          >
            {pasteOpen ? t('briefPasteCollapse') : t('briefPasteToggle')}
          </button>
          {pasteOpen && (
            <div className="space-y-2">
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={10}
                placeholder={t('briefPastePlaceholder')}
                className="field resize-y placeholder:text-ink-3"
                disabled={pending}
              />
              <button
                type="button"
                onClick={onSavePasted}
                disabled={pending || pasted.trim().length === 0}
                className="btn-ink disabled:opacity-50"
              >
                {pending ? t('briefSaving') : t('briefSave')}
              </button>
            </div>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept={ACCEPT} onChange={onFile} className="hidden" />

      {error && (
        <p role="alert" className="mono-eyebrow text-accent">
          {error}
        </p>
      )}
    </section>
  );
}

function translateError(
  t: ReturnType<typeof useTranslations<'Identity'>>,
  raw: string,
  mime?: string,
): string {
  switch (raw) {
    case 'unsupported-mime':
      return t('briefErrorMime');
    case 'too-large':
      return t('briefErrorSize');
    case 'parse-failed':
      return mime?.includes('wordprocessingml')
        ? t('briefErrorParseDocx')
        : t('briefErrorParsePdf');
    case 'empty-extraction':
      return t('briefErrorEmpty');
    case 'r2-not-configured':
      return t('briefErrorR2');
    default:
      return t('briefErrorGeneric');
  }
}
