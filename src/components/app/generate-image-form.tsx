'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  IMAGE_FORMATS,
  IMAGE_PROVIDERS,
  type ImageFormat,
  type ImageProvider,
} from '@/lib/image-formats';
import { enqueueImageGeneration } from '@/server/actions/images';

interface GenerateImageFormProps {
  projectId: string;
  providerAvailability: { openai: boolean; fal: boolean };
  r2Configured: boolean;
}

interface AssetSummary {
  id: string;
  width: number | null;
  height: number | null;
  publicUrl: string | null;
  storageKey: string | null;
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'queueing' }
  | { kind: 'running'; generationId: string; status: 'queued' | 'running'; assets: AssetSummary[] }
  | { kind: 'done'; generationId: string; assets: AssetSummary[]; costCents: number | null }
  | { kind: 'failed'; message: string };

const FORMAT_KEYS = Object.keys(IMAGE_FORMATS) as ImageFormat[];

const flatModels = IMAGE_PROVIDERS.flatMap((g) =>
  g.models.map((m) => ({ provider: g.provider, ...m })),
);

export function GenerateImageForm({
  projectId,
  providerAvailability,
  r2Configured,
}: GenerateImageFormProps) {
  const t = useTranslations('Generate');
  const tCommon = useTranslations('common');

  const availableModels = flatModels.filter((m) => providerAvailability[m.provider]);
  const initialModel = availableModels[0];

  const [idea, setIdea] = useState('');
  const [format, setFormat] = useState<ImageFormat>('square');
  const [combo, setCombo] = useState<string>(
    initialModel ? `${initialModel.provider}::${initialModel.id}` : '',
  );
  const [n, setN] = useState<1 | 2 | 4>(1);
  const [run, setRun] = useState<RunState>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling(generationId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/generations/${generationId}/status`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          if (res.status === 404) {
            stopPolling();
            setRun({ kind: 'failed', message: t('errorPoll') });
          }
          return;
        }
        const json: {
          status: 'queued' | 'running' | 'done' | 'failed';
          errorMessage: string | null;
          costCents: number | null;
          assets: AssetSummary[];
        } = await res.json();

        if (json.status === 'done') {
          stopPolling();
          setRun({
            kind: 'done',
            generationId,
            assets: json.assets,
            costCents: json.costCents,
          });
        } else if (json.status === 'failed') {
          stopPolling();
          setRun({ kind: 'failed', message: json.errorMessage ?? t('failedCaption') });
        } else {
          setRun({
            kind: 'running',
            generationId,
            status: json.status,
            assets: json.assets,
          });
        }
      } catch {
        // ignore transient network blips; the next tick will retry
      }
    }, 2_000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!combo) {
      toast.error(tCommon('errorGeneric'));
      return;
    }

    const [provider, ...rest] = combo.split('::');
    const model = rest.join('::');
    if (!provider || !model) {
      toast.error(tCommon('errorGeneric'));
      return;
    }

    setRun({ kind: 'queueing' });
    startTransition(async () => {
      const result = await enqueueImageGeneration({
        projectId,
        idea: idea.trim(),
        format,
        provider: provider as ImageProvider,
        model,
        n,
        language: 'en',
      });

      if (!result.ok) {
        const msg = t('errorEnqueue');
        setRun({ kind: 'failed', message: msg });
        toast.error(msg);
        return;
      }

      setRun({
        kind: 'running',
        generationId: result.data.generationId,
        status: 'queued',
        assets: [],
      });
      startPolling(result.data.generationId);
    });
  }

  const formDisabled = pending || run.kind === 'queueing' || run.kind === 'running';
  const noProvider = availableModels.length === 0;

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[7fr_5fr]">
      <form onSubmit={onSubmit} className="space-y-10" noValidate>
        <div>
          <label htmlFor="gen-idea" className="mono-eyebrow mb-3 block">
            {t('fieldIdea')}
          </label>
          <textarea
            id="gen-idea"
            rows={4}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={formDisabled}
            placeholder={t('fieldIdeaPlaceholder')}
            className="field resize-y placeholder:text-ink-3"
            maxLength={600}
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <label htmlFor="gen-format" className="mono-eyebrow mb-3 block">
              {t('fieldFormat')}
            </label>
            <select
              id="gen-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ImageFormat)}
              disabled={formDisabled}
              className="field cursor-pointer"
            >
              {FORMAT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {IMAGE_FORMATS[key].label} — {IMAGE_FORMATS[key].w}×{IMAGE_FORMATS[key].h}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="gen-engine" className="mono-eyebrow mb-3 block">
              {t('fieldEngine')}
            </label>
            <select
              id="gen-engine"
              value={combo}
              onChange={(e) => setCombo(e.target.value)}
              disabled={formDisabled || noProvider}
              className="field cursor-pointer"
            >
              {IMAGE_PROVIDERS.map((g) => (
                <optgroup
                  key={g.provider}
                  label={g.provider === 'openai' ? 'OpenAI' : 'fal.ai'}
                  disabled={!providerAvailability[g.provider]}
                >
                  {g.models.map((m) => (
                    <option key={m.id} value={`${g.provider}::${m.id}`}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="mono-eyebrow mb-3 block">{t('fieldVariants')}</legend>
          <div className="flex gap-6">
            {[1, 2, 4].map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="n"
                  value={value}
                  checked={n === value}
                  onChange={() => setN(value as 1 | 2 | 4)}
                  disabled={formDisabled}
                  className="accent-ink"
                />
                <span style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 16 }}>
                  {value}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          {!r2Configured && (
            <p className="mono-eyebrow text-accent">
              R2 storage is not configured — uploads will fail.
            </p>
          )}
          {noProvider && (
            <p className="mono-eyebrow text-accent">
              No image provider configured. Set OPENAI_API_KEY or FAL_KEY.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={formDisabled || noProvider || idea.trim().length < 3}
          className="btn-ink w-full disabled:opacity-50 sm:w-auto"
        >
          {formDisabled ? t('submitting') : t('submit')}
        </button>
      </form>

      <aside className="space-y-4">
        <ResultPanel run={run} t={t} />
      </aside>
    </div>
  );
}

function ResultPanel({
  run,
  t,
}: {
  run: RunState;
  t: ReturnType<typeof useTranslations<'Generate'>>;
}) {
  if (run.kind === 'idle') return null;

  if (run.kind === 'queueing' || (run.kind === 'running' && run.assets.length === 0)) {
    const caption =
      run.kind === 'queueing' || (run.kind === 'running' && run.status === 'queued')
        ? t('queuedCaption')
        : t('runningCaption');
    return (
      <div className="border border-ink p-8 text-center">
        <span className="mx-auto mb-4 block h-2 w-2 animate-pulse bg-accent" aria-hidden />
        <span className="mono-eyebrow text-ink-3">{caption}</span>
      </div>
    );
  }

  if (run.kind === 'failed') {
    return (
      <div role="alert" className="border border-accent p-6 text-sm text-accent">
        {t('failedCaption')} — {run.message}
      </div>
    );
  }

  const assets = run.assets;
  const grid = assets.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${grid}`}>
        {assets.map((a) => (
          <figure key={a.id} className="space-y-2">
            <div className="relative aspect-square border border-ink">
              {a.publicUrl ? (
                <Image
                  src={a.publicUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-paper-2 mono-eyebrow text-ink-3">
                  no public url
                </div>
              )}
            </div>
            <figcaption className="mono-eyebrow text-ink-3">
              {a.width ?? '?'} × {a.height ?? '?'}
            </figcaption>
          </figure>
        ))}
      </div>
      {run.kind === 'done' && (
        <p className="mono-eyebrow text-ink-3">
          {t('doneCaption')}
          {typeof run.costCents === 'number' && ` · ${t('costNote', { cents: run.costCents })}`}
        </p>
      )}
    </div>
  );
}
