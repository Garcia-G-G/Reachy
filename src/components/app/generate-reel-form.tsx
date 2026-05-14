'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { estimateReelCost, MAX_REEL_COST_CENTS, type ReelCostBreakdown } from '@/lib/reel-cost';
import {
  type PlannedScene,
  REEL_ENGINES,
  REEL_TEMPLATE_KEYS,
  REEL_TEMPLATES,
  type ReelEngine,
  type ReelPlan,
  type ReelTemplateKey,
  TYPE_DEFAULT_ENGINE,
} from '@/lib/reel-templates';
import { composeReelAction, planReelAction } from '@/server/actions/reels';

type ReelMode = 'ai' | 'script';

const MODE_OPTIONS: ReadonlyArray<{
  value: ReelMode;
  labelKey: 'modeAi' | 'modeScript';
  bodyKey: 'modeAiBody' | 'modeScriptBody';
}> = [
  { value: 'ai', labelKey: 'modeAi', bodyKey: 'modeAiBody' },
  { value: 'script', labelKey: 'modeScript', bodyKey: 'modeScriptBody' },
];

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
  costBreakdown: ReelCostBreakdown | null;
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
      costBreakdown: ReelCostBreakdown | null;
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

  const [template, setTemplate] = useState<ReelTemplateKey>('informative-25s');
  const [idea, setIdea] = useState('');
  const [language, setLanguage] = useState<'en' | 'es'>('en');
  const [mode, setMode] = useState<ReelMode>('ai');
  // One textarea per template scene. Resized on template change so the array
  // length always matches REEL_TEMPLATES[template].scenes.length — the server
  // action validates that invariant strictly.
  const [customScript, setCustomScript] = useState<string[]>(() =>
    new Array(REEL_TEMPLATES['informative-25s'].scenes.length).fill(''),
  );

  useEffect(() => {
    const count = REEL_TEMPLATES[template].scenes.length;
    setCustomScript((prev) => {
      if (prev.length === count) return prev;
      const next = new Array<string>(count).fill('');
      for (let i = 0; i < Math.min(prev.length, count); i++) next[i] = prev[i] ?? '';
      return next;
    });
  }, [template]);

  // Engine is user-selectable; default flips when template changes (some
  // templates default to Sora 2 Pro 720p for flagship demos; cheaper shapes
  // default to FFmpeg).
  const [engine, setEngine] = useState<ReelEngine>(TYPE_DEFAULT_ENGINE['informative-25s']);
  useEffect(() => {
    setEngine(TYPE_DEFAULT_ENGINE[template]);
  }, [template]);
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
            costBreakdown: json.costBreakdown,
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

    const sceneCount = REEL_TEMPLATES[template].scenes.length;
    if (mode === 'script') {
      if (customScript.length !== sceneCount) {
        toast.error(t('scriptLengthError', { got: customScript.length, need: sceneCount }));
        return;
      }
      if (customScript.some((line) => line.trim().length === 0)) {
        toast.error(t('scriptEmpty'));
        return;
      }
    }

    setPhase({ kind: 'planning' });
    startTransition(async () => {
      const result = await planReelAction({
        projectId,
        template,
        language,
        engine,
        ...(mode === 'script'
          ? { customScript: customScript.map((line) => line.trim()) }
          : { idea: idea.trim() }),
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
    // Sora uses the same OPENAI_API_KEY — falConfigured is no longer
    // wired to anything except the deprecated fal video engine.
    void falConfigured;
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
  const scriptReady =
    mode !== 'script' ||
    (customScript.length === REEL_TEMPLATES[template].scenes.length &&
      customScript.every((line) => line.trim().length > 0));
  const ideaReady = mode !== 'ai' || idea.trim().length >= 3;
  const submitDisabled = planningDisabled || !openaiConfigured || !ideaReady || !scriptReady;

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
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mono-eyebrow mb-3 block">{t('fieldEngine')}</legend>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {REEL_ENGINES.map((eng) => {
                const checked = engine === eng.id;
                const previewScenes = REEL_TEMPLATES[template].scenes.map((s, i) => ({
                  durationSec: s.durationSec,
                  background: s.background ?? 'image',
                  // In script mode use the user's typed line; in AI mode
                  // assume an average 50-char caption per scene so the
                  // estimate isn't 0 before the planner runs.
                  text: mode === 'script' ? (customScript[i] ?? '') : 'x'.repeat(50),
                }));
                const cost = estimateReelCost(eng.id, previewScenes);
                const overBudget = cost.cents > MAX_REEL_COST_CENTS;
                const dollars = (cost.cents / 100).toFixed(2);
                return (
                  <label
                    key={eng.id}
                    className={`flex cursor-pointer gap-3 border p-4 transition-colors ${
                      overBudget
                        ? 'cursor-not-allowed border-rule opacity-50'
                        : checked
                          ? 'border-ink bg-paper-2'
                          : 'border-rule hover:border-ink'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reelEngine"
                      value={eng.id}
                      checked={checked}
                      onChange={() => setEngine(eng.id)}
                      disabled={planningDisabled || overBudget}
                      className="mt-1 accent-ink"
                    />
                    <span className="block">
                      <span
                        className="block"
                        style={{
                          fontFamily: 'var(--font-fraunces), Georgia, serif',
                          fontSize: 16,
                        }}
                      >
                        {eng.label}
                      </span>
                      <span className="mono-eyebrow text-ink-3 mt-1 block">{eng.tagline}</span>
                      <span className="mono-eyebrow mt-2 block">≈ ${dollars}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mono-eyebrow mb-3 block">{t('fieldMode')}</legend>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {MODE_OPTIONS.map((opt) => {
                const checked = mode === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer gap-3 border p-4 transition-colors ${
                      checked ? 'border-ink bg-paper-2' : 'border-rule hover:border-ink'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reelMode"
                      value={opt.value}
                      checked={checked}
                      onChange={() => setMode(opt.value)}
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
                        {t(opt.labelKey)}
                      </span>
                      <span className="mono-eyebrow text-ink-3">{t(opt.bodyKey)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {mode === 'ai' ? (
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
          ) : (
            <fieldset className="space-y-4">
              <legend className="mono-eyebrow mb-3 block">{t('fieldIdea')}</legend>
              <div className="space-y-4">
                {REEL_TEMPLATES[template].scenes.map((scene, i) => {
                  const inputId = `reel-script-${i}`;
                  const num = String(i + 1).padStart(2, '0');
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: scene count is template-locked; index is the natural stable id
                    <div key={`${scene.slot}-${i}`} className="space-y-2">
                      <label htmlFor={inputId} className="mono-eyebrow block text-ink-3">
                        {t('scriptScenePrefix', { n: num, slot: scene.slot.toUpperCase() })}
                        {' · '}
                        {t('scriptSceneHint', { seconds: scene.durationSec })}
                      </label>
                      <textarea
                        id={inputId}
                        rows={2}
                        value={customScript[i] ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setCustomScript((prev) => prev.map((v, j) => (j === i ? value : v)));
                        }}
                        disabled={planningDisabled}
                        className="field resize-y placeholder:text-ink-3"
                        maxLength={160}
                        required
                      />
                    </div>
                  );
                })}
              </div>
            </fieldset>
          )}

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
          {!r2Configured && <p className="mono-eyebrow text-accent">{t('errorNoR2')}</p>}

          <p
            className="text-ink-3"
            style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 16 }}
          >
            {t('estimateNote', {
              dollars: (
                estimateReelCost(
                  engine,
                  REEL_TEMPLATES[template].scenes.map((s, i) => ({
                    durationSec: s.durationSec,
                    background: s.background ?? 'image',
                    text: mode === 'script' ? (customScript[i] ?? '') : 'x'.repeat(50),
                  })),
                ).cents / 100
              ).toFixed(2),
            })}
          </p>

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
          costBreakdown={phase.costBreakdown}
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
          {t('planCostNote', { dollars: (planCostCents / 100).toFixed(2) })}
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
                    maxLength={2000}
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
  const isSora = engine === 'sora-base' || engine === 'sora-pro-720p';
  const caption = isSora
    ? t('composingSora')
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
  costBreakdown,
  engine,
  onReset,
}: {
  videoUrl: string | null;
  costCents: number | null;
  costBreakdown: ReelCostBreakdown | null;
  engine: ReelEngine;
  onReset: () => void;
}) {
  const t = useTranslations('Reels');
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule pb-2">
        <span className="mono-eyebrow text-ink-3">
          {t('doneCaption')} —{' '}
          {engine === 'sora-pro-720p' ? 'Sora 2 Pro' : engine === 'sora-base' ? 'Sora 2' : 'FFmpeg'}
        </span>
        {typeof costCents === 'number' && (
          <span className="mono-eyebrow text-ink-3">
            {t('costNote', { dollars: (costCents / 100).toFixed(2) })}
            {costBreakdown && (
              <span className="text-ink-3"> · {formatCostBreakdown(costBreakdown, engine)}</span>
            )}
          </span>
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

/** "Sora $6.00 · TTS $0.04 · compose $0.01" — same display the library uses. */
function formatCostBreakdown(breakdown: ReelCostBreakdown, engine: ReelEngine): string {
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const parts: string[] = [];
  if (typeof breakdown.parts.video === 'number' && breakdown.parts.video > 0) {
    const videoLabel =
      engine === 'sora-pro-720p' ? 'Sora Pro' : engine === 'sora-base' ? 'Sora' : 'video';
    parts.push(`${videoLabel} ${fmt(breakdown.parts.video)}`);
  }
  if (typeof breakdown.parts.images === 'number' && breakdown.parts.images > 0) {
    parts.push(`images ${fmt(breakdown.parts.images)}`);
  }
  if (breakdown.parts.tts > 0) parts.push(`TTS ${fmt(breakdown.parts.tts)}`);
  if (breakdown.parts.compose > 0) parts.push(`compose ${fmt(breakdown.parts.compose)}`);
  return parts.join(' · ');
}
