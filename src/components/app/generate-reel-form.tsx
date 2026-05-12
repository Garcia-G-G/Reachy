'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  type PlannedScene,
  REEL_TEMPLATE_KEYS,
  type ReelEngine,
  type ReelPlan,
  type ReelTemplateKey,
  TYPE_DEFAULT_ENGINE,
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
  // Engine is auto-derived from the chosen type — the user no longer picks
  // it. Visual maps to Veo (single cinematic shot); everything multi-scene
  // maps to FFmpeg composition.
  const engine: ReelEngine = TYPE_DEFAULT_ENGINE[template];
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

  function onCompose(plan: ReelPlan) {
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
          <fieldset className="space-y-3">
            <legend className="mono-eyebrow mb-3 block">{t('fieldTemplate')}</legend>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {REEL_TEMPLATE_KEYS.map((k) => {
                const checked = template === k;
                return (
                  <label
                    key={k}
                    className={`flex cursor-pointer gap-3 border p-4 transition-colors ${
                      checked ? 'border-ink bg-paper-2' : 'border-rule hover:border-ink'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reelTemplate"
                      value={k}
                      checked={checked}
                      onChange={() => setTemplate(k)}
                      disabled={planningDisabled}
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
                        {t(`types.${k}.label`)}
                      </span>
                      <span className="mono-eyebrow text-ink-3">{t(`types.${k}.description`)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mono-eyebrow mt-2 text-ink-3">
              {t('engineHint', {
                engine: t(`engines.${engine}.label`),
                cost: engine === 'veo' ? t('engineCostVeo') : t('engineCostFfmpeg'),
              })}
            </p>
          </fieldset>

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
  onCompose,
  onCancel,
  composing,
}: {
  plan: ReelPlan;
  planCostCents: number;
  onCompose: (plan: ReelPlan) => void;
  onCancel: () => void;
  composing: boolean;
}) {
  const t = useTranslations('Reels');
  const [scenes, setScenes] = useState<PlannedScene[]>(plan.scenes);

  function updateScene(index: number, patch: Partial<PlannedScene>) {
    setScenes((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

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
            </div>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => onCompose({ ...plan, scenes })}
          disabled={composing}
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
