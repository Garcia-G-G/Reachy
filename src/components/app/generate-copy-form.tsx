'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  COPY_FORMAT_KEYS,
  COPY_FORMATS,
  type CopyFormat,
  type CopyPayload,
} from '@/lib/copy-formats';
import { generateCopyAction, regenerateCopyVariant } from '@/server/actions/copy';
import { CopyResult } from './copy-result';

interface GenerateCopyFormProps {
  projectId: string;
  openaiConfigured: boolean;
}

interface VariantState {
  generationId: string;
  format: CopyFormat;
  payload: { es: CopyPayload['value']; en: CopyPayload['value'] };
  costCents: number;
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; variants: VariantState[] };

export function GenerateCopyForm({ projectId, openaiConfigured }: GenerateCopyFormProps) {
  const t = useTranslations('Copy');
  const tCommon = useTranslations('common');

  const [format, setFormat] = useState<CopyFormat>('tweet');
  const [idea, setIdea] = useState('');
  const [promptLanguage, setPromptLanguage] = useState<'en' | 'es'>('en');
  const [run, setRun] = useState<RunState>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!openaiConfigured) {
      toast.error(t('errorNoOpenAI'));
      return;
    }
    setRun({ kind: 'running' });
    startTransition(async () => {
      const result = await generateCopyAction({
        projectId,
        format,
        idea: idea.trim(),
        promptLanguage,
      });
      if (!result.ok) {
        setRun({ kind: 'failed', message: result.error });
        toast.error(t('errorEnqueue'));
        return;
      }
      setRun({
        kind: 'done',
        variants: [
          {
            generationId: result.data.generationId,
            format: result.data.format,
            payload: result.data.payload as VariantState['payload'],
            costCents: result.data.costCents,
          },
        ],
      });
    });
  }

  function onVariant() {
    if (run.kind !== 'done') return;
    const last = run.variants[run.variants.length - 1];
    if (!last) return;
    const previous = run.variants;
    setRun({ kind: 'running' });
    startTransition(async () => {
      const result = await regenerateCopyVariant({ generationId: last.generationId });
      if (!result.ok) {
        setRun({ kind: 'done', variants: previous });
        toast.error(t('errorVariant'));
        return;
      }
      setRun({
        kind: 'done',
        variants: [
          ...previous,
          {
            generationId: result.data.generationId,
            format: result.data.format,
            payload: result.data.payload as VariantState['payload'],
            costCents: result.data.costCents,
          },
        ],
      });
    });
  }

  const formDisabled = pending || run.kind === 'running';
  const submitDisabled = formDisabled || !openaiConfigured || idea.trim().length < 3;

  return (
    <div className="space-y-12">
      <form onSubmit={onSubmit} className="space-y-10" noValidate>
        <div>
          <label htmlFor="copy-format" className="mono-eyebrow mb-3 block">
            {t('fieldFormat')}
          </label>
          <select
            id="copy-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as CopyFormat)}
            disabled={formDisabled}
            className="field cursor-pointer"
          >
            {COPY_FORMAT_KEYS.map((key) => (
              <option key={key} value={key}>
                {COPY_FORMATS[key].label}
              </option>
            ))}
          </select>
          <p className="mono-eyebrow mt-2 text-ink-3">{COPY_FORMATS[format].hint}</p>
        </div>

        <div>
          <label htmlFor="copy-idea" className="mono-eyebrow mb-3 block">
            {t('fieldIdea')}
          </label>
          <textarea
            id="copy-idea"
            rows={5}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={formDisabled}
            placeholder={t('fieldIdeaPlaceholder')}
            className="field resize-y placeholder:text-ink-3"
            maxLength={600}
            required
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="mono-eyebrow mb-3 block">{t('fieldPromptLanguage')}</legend>
          <div className="flex gap-6">
            {(['en', 'es'] as const).map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="promptLanguage"
                  value={value}
                  checked={promptLanguage === value}
                  onChange={() => setPromptLanguage(value)}
                  disabled={formDisabled}
                  className="accent-ink"
                />
                <span style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 16 }}>
                  {value === 'en' ? t('promptLanguageEn') : t('promptLanguageEs')}
                </span>
              </label>
            ))}
          </div>
          <p className="mono-eyebrow text-ink-3">{t('fieldPromptLanguageNote')}</p>
        </fieldset>

        {!openaiConfigured && <p className="mono-eyebrow text-accent">{t('errorNoOpenAI')}</p>}

        <button
          type="submit"
          disabled={submitDisabled}
          className="btn-ink w-full disabled:opacity-50 sm:w-auto"
        >
          {formDisabled ? t('submitting') : t('submit')}
        </button>
      </form>

      {run.kind === 'running' && <RunningPanel caption={t('runningCaption')} />}
      {run.kind === 'failed' && (
        <div role="alert" className="border border-accent p-6 text-sm text-accent">
          {t('failedCaption')} — {run.message}
        </div>
      )}
      {run.kind === 'done' && (
        <ResultsBlock
          variants={run.variants}
          onVariant={onVariant}
          variantDisabled={formDisabled}
          variantLabel={t('variant')}
          variantingLabel={t('varianting')}
          costLabel={(c) => t('costNote', { cents: c })}
          variantNumberLabel={(i) => t('variantNumber', { n: i })}
          tCommon={tCommon}
        />
      )}
    </div>
  );
}

function RunningPanel({ caption }: { caption: string }) {
  return (
    <div className="border border-ink p-8 text-center">
      <span className="mx-auto mb-4 block h-2 w-2 animate-pulse bg-accent" aria-hidden />
      <span className="mono-eyebrow text-ink-3">{caption}</span>
    </div>
  );
}

function ResultsBlock({
  variants,
  onVariant,
  variantDisabled,
  variantLabel,
  variantingLabel,
  costLabel,
  variantNumberLabel,
  tCommon,
}: {
  variants: VariantState[];
  onVariant: () => void;
  variantDisabled: boolean;
  variantLabel: string;
  variantingLabel: string;
  costLabel: (cents: number) => string;
  variantNumberLabel: (n: number) => string;
  tCommon: ReturnType<typeof useTranslations<'common'>>;
}) {
  return (
    <div className="space-y-12">
      {variants.map((v, i) => (
        <section key={v.generationId} className="space-y-4">
          <header className="flex items-baseline justify-between border-b border-rule pb-2">
            <span className="mono-eyebrow text-ink-3">{variantNumberLabel(i + 1)}</span>
            <span className="mono-eyebrow text-ink-3">{costLabel(v.costCents)}</span>
          </header>
          <CopyResult format={v.format} payload={v.payload} tCommon={tCommon} />
        </section>
      ))}
      <div>
        <button
          type="button"
          onClick={onVariant}
          disabled={variantDisabled}
          className="btn-ghost disabled:opacity-50"
        >
          {variantDisabled ? variantingLabel : `+ ${variantLabel}`}
        </button>
      </div>
    </div>
  );
}
