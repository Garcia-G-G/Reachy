'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  type PlannedScene,
  REEL_ENGINES,
  REEL_TEMPLATE_KEYS,
  REEL_TEMPLATES,
  type ReelEngine,
  type ReelPlan,
  type ReelTemplateKey,
} from '@/lib/reel-templates';
import { composeReelAction, planReelAction } from '@/server/actions/reels';

interface GenerateReelFormProps {
  projectId: string;
  openaiConfigured: boolean;
  falConfigured: boolean;
  r2Configured: boolean;
}

interface AssetSummary {
  id: string;
  width: number | null;
  height: number | null;
  publicUrl: string | null;
  storageKey: string | null;
  format: string | null;
}

interface PollResponse {
  status: 'queued' | 'running' | 'done' | 'failed';
  errorMessage: string | null;
  costCents: number | null;
  finishedAt: string | null;
  assets: AssetSummary[];
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'planning' }
  | { kind: 'planned'; plan: ReelPlan; planCostCents: number }
  | {
      kind: 'composing';
      generationId: string;
      status: 'queued' | 'running';
      engine: ReelEngine;
    }
  | {
      kind: 'done';
      videoUrl: string | null;
      costCents: number | null;
      engine: ReelEngine;
    }
  | { kind: 'failed'; message: string };

export function GenerateReelForm({
  projectId,
  openaiConfigured,
  falConfigured,
  r2Configured,
}: GenerateReelFormProps) {
  const t = useTranslations('Reels');

  const [template, setTemplate] = useState<ReelTemplateKey>('pitch-30s');
  const [idea, setIdea] = useState('');
  const [language, setLanguage] = useState<'en' | 'es'>('en');
  const [engine, setEngine] = useState<ReelEngine>('ffmpeg');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup is intentionally mount-once: pollRef is a ref, the cleanup closes
  // over only the ref, so no stale-closure risk.
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(generationId: string, eng: ReelEngine) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/generations/${generationId}/status`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          if (res.status === 404) {
            stopPolling();
            setPhase({ kind: 'failed', message: t('errorPoll') });
          }
          return;
        }
        const json = (await res.json()) as PollResponse;
        if (json.status === 'done') {
          stopPolling();
          setPhase({
            kind: 'done',
            videoUrl: json.assets[0]?.publicUrl ?? null,
            costCents: json.costCents,
            engine: eng,
          });
        } else if (json.status === 'failed') {
          stopPolling();
          setPhase({ kind: 'failed', message: json.errorMessage ?? t('failedCaption') });
        } else {
          setPhase({ kind: 'composing', generationId, status: json.status, engine: eng });
        }
      } catch {
        // transient — next tick will retry
      }
    }, 6_000);
  }

  function onPlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!openaiConfigured) {
      toast.error(t('errorNoOpenAI'));
      return;
    }
    setPhase({ kind: 'planning' });
    startTransition(async () => {
      const result = await planReelAction({
        projectId,
        template,
        idea: idea.trim(),
        language,
      });
      if (!result.ok) {
        setPhase({ kind: 'failed', message: result.error });
        toast.error(t('errorPlan'));
        return;
      }
      setPhase({ kind: 'planned', plan: result.data.plan, planCostCents: result.data.costCents });
    });
  }

  function onCompose(plan: ReelPlan, sceneImageUrls: Array<string | null>) {
    if (engine === 'veo' && !falConfigured) {
      toast.error(t('errorNoFal'));
      return;
    }
    if (!r2Configured) {
      toast.error(t('errorNoR2'));
      return;
    }
    setPhase({ kind: 'composing', generationId: '', status: 'queued', engine });
    startTransition(async () => {
      const result = await composeReelAction({
        projectId,
        engine,
        plan,
        sceneImageUrls: engine === 'ffmpeg' ? sceneImageUrls : undefined,
      });
      if (!result.ok) {
        setPhase({ kind: 'failed', message: result.error });
        toast.error(t('errorCompose'));
        return;
      }
      setPhase({
        kind: 'composing',
        generationId: result.data.generationId,
        status: 'queued',
        engine,
      });
      startPolling(result.data.generationId, engine);
    });
  }

  function onReset() {
    stopPolling();
    setPhase({ kind: 'idle' });
  }

  const planningDisabled = pending || phase.kind === 'planning' || phase.kind === 'composing';
  const submitDisabled = planningDisabled || !openaiConfigured || idea.trim().length < 3;

  return (
    <div className="space-y-12">
      {(phase.kind === 'idle' || phase.kind === 'planning' || phase.kind === 'failed') && (
        <form onSubmit={onPlan} className="space-y-10" noValidate>
          <div>
            <label htmlFor="reel-template" className="mono-eyebrow mb-3 block">
              {t('fieldTemplate')}
            </label>
            <select
              id="reel-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value as ReelTemplateKey)}
              disabled={planningDisabled}
              className="field cursor-pointer"
            >
              {REEL_TEMPLATE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {REEL_TEMPLATES[k].label}
                </option>
              ))}
            </select>
            <p className="mono-eyebrow mt-2 text-ink-3">{REEL_TEMPLATES[template].description}</p>
          </div>

          <div>
            <label htmlFor="reel-idea" className="mono-eyebrow mb-3 block">
              {t('fieldIdea')}
            </label>
            <textarea
              id="reel-idea"
              rows={4}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              disabled={planningDisabled}
              placeholder={t('fieldIdeaPlaceholder')}
              className="field resize-y placeholder:text-ink-3"
              maxLength={600}
              required
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="mono-eyebrow mb-3 block">{t('fieldLanguage')}</legend>
            <div className="flex gap-6">
              {(['en', 'es'] as const).map((value) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="reelLanguage"
                    value={value}
                    checked={language === value}
                    onChange={() => setLanguage(value)}
                    disabled={planningDisabled}
                    className="accent-ink"
                  />
                  <span
                    style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 16 }}
                  >
                    {value === 'en' ? t('languageEn') : t('languageEs')}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mono-eyebrow mb-3 block">{t('fieldEngine')}</legend>
            <div className="space-y-3">
              {REEL_ENGINES.map((e) => {
                const disabled = e.id === 'veo' && !falConfigured;
                return (
                  <label
                    key={e.id}
                    className={`flex cursor-pointer gap-3 border border-rule p-4 ${disabled ? 'opacity-50' : ''}`}
                  >
                    <input
                      type="radio"
                      name="reelEngine"
                      value={e.id}
                      checked={engine === e.id}
                      onChange={() => setEngine(e.id)}
                      disabled={planningDisabled || disabled}
                      className="mt-1 accent-ink"
                    />
                    <span>
                      <span
                        className="block"
                        style={{
                          fontFamily: 'var(--font-fraunces), Georgia, serif',
                          fontSize: 18,
                        }}
                      >
                        {e.label}
                      </span>
                      <span className="mono-eyebrow text-ink-3">{e.tagline}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {!openaiConfigured && <p className="mono-eyebrow text-accent">{t('errorNoOpenAI')}</p>}
          {engine === 'veo' && !falConfigured && (
            <p className="mono-eyebrow text-accent">{t('errorNoFal')}</p>
          )}
          {!r2Configured && <p className="mono-eyebrow text-accent">{t('errorNoR2')}</p>}

          <button
            type="submit"
            disabled={submitDisabled}
            className="btn-ink w-full disabled:opacity-50 sm:w-auto"
          >
            {phase.kind === 'planning' ? t('planning') : t('plan')}
          </button>

          {phase.kind === 'failed' && (
            <div role="alert" className="border border-accent p-4 text-sm text-accent">
              {t('failedCaption')} — {phase.message}
            </div>
          )}
        </form>
      )}

      {phase.kind === 'planned' && (
        <PlanEditor
          plan={phase.plan}
          planCostCents={phase.planCostCents}
          engine={engine}
          onCompose={onCompose}
          onCancel={onReset}
          composing={pending}
        />
      )}

      {phase.kind === 'composing' && <ComposingPanel engine={phase.engine} status={phase.status} />}

      {phase.kind === 'done' && (
        <DonePanel
          videoUrl={phase.videoUrl}
          costCents={phase.costCents}
          engine={phase.engine}
          onReset={onReset}
        />
      )}
    </div>
  );
}

function PlanEditor({
  plan,
  planCostCents,
  engine,
  onCompose,
  onCancel,
  composing,
}: {
  plan: ReelPlan;
  planCostCents: number;
  engine: ReelEngine;
  onCompose: (plan: ReelPlan, sceneImageUrls: Array<string | null>) => void;
  onCancel: () => void;
  composing: boolean;
}) {
  const t = useTranslations('Reels');
  const [scenes, setScenes] = useState<PlannedScene[]>(plan.scenes);
  const [imageUrls, setImageUrls] = useState<Array<string | null>>(plan.scenes.map(() => null));

  function updateScene(index: number, patch: Partial<PlannedScene>) {
    setScenes((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function updateUrl(index: number, url: string) {
    setImageUrls((prev) => prev.map((u, i) => (i === index ? url.trim() || null : u)));
  }

  const allImagesProvided =
    engine !== 'ffmpeg' ||
    scenes.every((s, i) => s.background === 'brand' || Boolean(imageUrls[i]));

  return (
    <div className="space-y-8">
      <header className="flex items-baseline justify-between border-b border-rule pb-4">
        <span
          className="display"
          style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 24 }}
        >
          {plan.tagline}
        </span>
        <span className="mono-eyebrow text-ink-3">
          {t('planCostNote', { cents: planCostCents })}
        </span>
      </header>

      <div className="space-y-6">
        {scenes.map((scene, i) => (
          <article
            // biome-ignore lint/suspicious/noArrayIndexKey: scenes array length is template-locked; index is the natural stable id
            key={`${scene.slot}-${i}`}
            className="grid grid-cols-1 gap-4 border border-rule p-6 md:grid-cols-[180px_1fr]"
          >
            <div className="space-y-2">
              <span className="mono-eyebrow text-ink-3">№ {String(i + 1).padStart(2, '0')}</span>
              <span
                className="block"
                style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 18 }}
              >
                {scene.slot}
              </span>
              <span className="mono-eyebrow text-ink-3">
                {scene.durationSec}s · {scene.textPosition} · {scene.background}
              </span>
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor={`scene-text-${i}`} className="mono-eyebrow mb-2 block">
                  {t('sceneText')}
                </label>
                <textarea
                  id={`scene-text-${i}`}
                  rows={2}
                  value={scene.text}
                  onChange={(e) => updateScene(i, { text: e.target.value })}
                  className="field resize-y"
                  maxLength={160}
                />
              </div>
              {scene.background === 'image' && (
                <div>
                  <label htmlFor={`scene-prompt-${i}`} className="mono-eyebrow mb-2 block">
                    {t('sceneImagePrompt')}
                  </label>
                  <textarea
                    id={`scene-prompt-${i}`}
                    rows={2}
                    value={scene.imagePrompt}
                    onChange={(e) => updateScene(i, { imagePrompt: e.target.value })}
                    className="field resize-y"
                    maxLength={600}
                  />
                </div>
              )}
              {engine === 'ffmpeg' && scene.background === 'image' && (
                <div>
                  <label htmlFor={`scene-url-${i}`} className="mono-eyebrow mb-2 block">
                    {t('sceneImageUrl')}
                  </label>
                  <input
                    id={`scene-url-${i}`}
                    type="url"
                    value={imageUrls[i] ?? ''}
                    onChange={(e) => updateUrl(i, e.target.value)}
                    placeholder={t('sceneImageUrlPlaceholder')}
                    className="field"
                  />
                  <p className="mono-eyebrow mt-1 text-ink-3">{t('sceneImageUrlHint')}</p>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {!allImagesProvided && <p className="mono-eyebrow text-accent">{t('errorMissingImages')}</p>}

      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => onCompose({ ...plan, scenes }, imageUrls)}
          disabled={composing || !allImagesProvided}
          className="btn-ink disabled:opacity-50"
        >
          {composing ? t('composing') : t('compose')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={composing}
          className="btn-ghost disabled:opacity-50"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

function ComposingPanel({ engine, status }: { engine: ReelEngine; status: 'queued' | 'running' }) {
  const t = useTranslations('Reels');
  const caption =
    engine === 'veo'
      ? t('composingVeo')
      : status === 'queued'
        ? t('queuedCaption')
        : t('composingFfmpeg');
  return (
    <div className="border border-ink p-8 text-center">
      <span className="mx-auto mb-4 block h-2 w-2 animate-pulse bg-accent" aria-hidden />
      <span className="mono-eyebrow text-ink-3">{caption}</span>
    </div>
  );
}

function DonePanel({
  videoUrl,
  costCents,
  engine,
  onReset,
}: {
  videoUrl: string | null;
  costCents: number | null;
  engine: ReelEngine;
  onReset: () => void;
}) {
  const t = useTranslations('Reels');
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between border-b border-rule pb-2">
        <span className="mono-eyebrow text-ink-3">
          {t('doneCaption')} — {engine === 'veo' ? 'Veo 3.1' : 'FFmpeg'}
        </span>
        {typeof costCents === 'number' && (
          <span className="mono-eyebrow text-ink-3">{t('costNote', { cents: costCents })}</span>
        )}
      </header>
      <div className="border border-ink">
        {videoUrl ? (
          // biome-ignore lint/a11y/useMediaCaption: brand reels have no spoken track yet
          <video
            controls
            playsInline
            src={videoUrl}
            className="block h-auto w-full"
            style={{ aspectRatio: '9 / 16', maxHeight: '70vh' }}
          />
        ) : (
          <div className="aspect-[9/16] bg-paper-2 p-8 text-center mono-eyebrow text-ink-3">
            {t('noVideoUrl')}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-4">
        {videoUrl && (
          <a href={videoUrl} download className="btn-ink">
            {t('download')}
          </a>
        )}
        <button type="button" onClick={onReset} className="btn-ghost">
          {t('newReel')}
        </button>
      </div>
    </div>
  );
}
