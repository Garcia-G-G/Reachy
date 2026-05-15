'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BODY_FONTS, HEADING_FONTS } from '@/lib/google-fonts';
import {
  VISUAL_STYLE_KEYS,
  VISUAL_STYLE_META,
  type VisualStyleKey,
} from '@/lib/visual-styles-meta';
import { upsertBrandKit } from '@/server/actions/brandKits';
import type { BrandLanguage, BrandVisualStyle, BrandVoice } from '@/server/db/schema/brandKits';
import { BrandPreview } from './brand-preview';

interface IdentityFormProps {
  projectId: string;
  projectName: string;
  initial: {
    primaryColor: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
    bgColor: string | null;
    fontHeading: string | null;
    fontBody: string | null;
    voice: BrandVoice | null;
    keywords: string[];
    languages: BrandLanguage[];
    visualStyle: BrandVisualStyle;
    allowsHumans: boolean;
    qualityGateEnabled: boolean;
  };
}

// Visual-style options derived from the canonical meta — May 2026
// diversity rewrite replaced the 6 legacy keys with 7 distinct styles.
// Labels here come from the meta (English-only); when we add full ES
// translations for these the indirection through `t(labelKey)` can
// come back. Until then, the meta labels render in both locales.
const VISUAL_STYLE_OPTIONS: ReadonlyArray<{
  value: VisualStyleKey;
  label: string;
  tagline: string;
}> = VISUAL_STYLE_KEYS.map((key) => ({
  value: key,
  label: VISUAL_STYLE_META[key].label,
  tagline: VISUAL_STYLE_META[key].tagline,
}));

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; message: string };

const DEBOUNCE_MS = 600;

const COLOR_DEFAULTS = {
  primary: '#14110d',
  secondary: '#4a4338',
  accent: '#b6481a',
  bg: '#f1ebdf',
};

function arraysEqual<T>(a: T[], b: T[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function IdentityForm({ projectId, projectName, initial }: IdentityFormProps) {
  const t = useTranslations('Identity');
  const tCommon = useTranslations('common');

  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor ?? COLOR_DEFAULTS.primary);
  const [secondaryColor, setSecondaryColor] = useState(
    initial.secondaryColor ?? COLOR_DEFAULTS.secondary,
  );
  const [accentColor, setAccentColor] = useState(initial.accentColor ?? COLOR_DEFAULTS.accent);
  const [bgColor, setBgColor] = useState(initial.bgColor ?? COLOR_DEFAULTS.bg);
  const [fontHeading, setFontHeading] = useState(initial.fontHeading ?? HEADING_FONTS[0]);
  const [fontBody, setFontBody] = useState(initial.fontBody ?? BODY_FONTS[0]);
  const [tone, setTone] = useState(initial.voice?.tone ?? '');
  const [doSay, setDoSay] = useState((initial.voice?.doSay ?? []).join('\n'));
  const [dontSay, setDontSay] = useState((initial.voice?.dontSay ?? []).join('\n'));
  const [keywordsRaw, setKeywordsRaw] = useState(initial.keywords.join(', '));
  const [languages, setLanguages] = useState<BrandLanguage[]>(
    initial.languages.length > 0 ? initial.languages : ['en'],
  );
  const [visualStyle, setVisualStyle] = useState<BrandVisualStyle>(initial.visualStyle);
  const [allowsHumans, setAllowsHumans] = useState<boolean>(initial.allowsHumans);
  const [qualityGateEnabled, setQualityGateEnabled] = useState<boolean>(initial.qualityGateEnabled);

  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const isFirstRun = useRef(true);
  const inFlight = useRef<AbortController | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => {});

  // Keep saveRef in sync with the latest closure on every commit.
  useEffect(() => {
    saveRef.current = save;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps drive the debounce; save is read via ref.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const handle = setTimeout(() => {
      void saveRef.current();
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [
    primaryColor,
    secondaryColor,
    accentColor,
    bgColor,
    fontHeading,
    fontBody,
    tone,
    doSay,
    dontSay,
    keywordsRaw,
    languages,
    visualStyle,
    allowsHumans,
    qualityGateEnabled,
  ]);

  async function save() {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;

    setSaveState({ kind: 'saving' });
    const trimmedTone = tone.trim();
    const doSayLines = doSay
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    const dontSayLines = dontSay
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    const hasVoice = trimmedTone.length > 0 || doSayLines.length > 0 || dontSayLines.length > 0;
    const voice: BrandVoice | undefined = hasVoice
      ? { tone: trimmedTone, doSay: doSayLines, dontSay: dontSayLines }
      : undefined;
    const keywords = keywordsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40);

    const result = await upsertBrandKit({
      projectId,
      primaryColor,
      secondaryColor,
      accentColor,
      bgColor,
      fontHeading,
      fontBody,
      voice,
      keywords,
      languages,
      visualStyle,
      allowsHumans,
      qualityGateEnabled,
    });

    if (ctrl.signal.aborted) return;

    if (!result.ok) {
      const message = result.error === 'unauthenticated' ? tCommon('errorGeneric') : result.error;
      setSaveState({ kind: 'error', message });
      toast.error(message);
      return;
    }
    setSaveState({ kind: 'saved', at: new Date() });
  }

  function toggleLanguage(lang: BrandLanguage, on: boolean) {
    setLanguages((prev) => {
      let next = on ? [...prev, lang] : prev.filter((l) => l !== lang);
      if (next.length === 0) next = ['en'];
      const sorted: BrandLanguage[] = (['en', 'es'] as BrandLanguage[]).filter((l) =>
        next.includes(l),
      );
      return arraysEqual(prev, sorted) ? prev : sorted;
    });
  }

  return (
    <div className="grid grid-cols-1 gap-16 lg:grid-cols-[7fr_5fr]">
      <div className="space-y-12">
        <SaveStatus state={saveState} t={t} />

        {/* Colors */}
        <Section title={t('sectionColors')}>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <ColorField
              label={t('colorPrimary')}
              id="c-primary"
              value={primaryColor}
              onChange={setPrimaryColor}
            />
            <ColorField
              label={t('colorSecondary')}
              id="c-secondary"
              value={secondaryColor}
              onChange={setSecondaryColor}
            />
            <ColorField
              label={t('colorAccent')}
              id="c-accent"
              value={accentColor}
              onChange={setAccentColor}
            />
            <ColorField label={t('colorBg')} id="c-bg" value={bgColor} onChange={setBgColor} />
          </div>
        </Section>

        {/* Fonts */}
        <Section title={t('sectionFonts')}>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            <FontSelect
              label={t('fontHeading')}
              id="f-heading"
              value={fontHeading}
              onChange={setFontHeading}
              options={HEADING_FONTS}
            />
            <FontSelect
              label={t('fontBody')}
              id="f-body"
              value={fontBody}
              onChange={setFontBody}
              options={BODY_FONTS}
            />
          </div>
        </Section>

        {/* Logo (Phase 04) */}
        <Section title={t('sectionLogo')}>
          <p className="text-sm text-ink-3 italic">{t('logoPending')}</p>
        </Section>

        {/* Voice */}
        <Section title={t('sectionVoice')}>
          <div className="space-y-8">
            <Field label={t('voiceTone')} htmlFor="v-tone">
              <input
                id="v-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder={t('voiceTonePlaceholder')}
                className="field placeholder:text-ink-3"
                maxLength={280}
              />
            </Field>
            <Field label={t('voiceDoSay')} htmlFor="v-do">
              <textarea
                id="v-do"
                rows={4}
                value={doSay}
                onChange={(e) => setDoSay(e.target.value)}
                placeholder={t('voiceDoSayPlaceholder')}
                className="field resize-y placeholder:text-ink-3"
              />
            </Field>
            <Field label={t('voiceDontSay')} htmlFor="v-dont">
              <textarea
                id="v-dont"
                rows={4}
                value={dontSay}
                onChange={(e) => setDontSay(e.target.value)}
                placeholder={t('voiceDontSayPlaceholder')}
                className="field resize-y placeholder:text-ink-3"
              />
            </Field>
            <Field label={t('voiceKeywords')} htmlFor="v-kw">
              <input
                id="v-kw"
                value={keywordsRaw}
                onChange={(e) => setKeywordsRaw(e.target.value)}
                placeholder={t('voiceKeywordsPlaceholder')}
                className="field placeholder:text-ink-3"
              />
            </Field>
          </div>
        </Section>

        {/* Languages */}
        <Section title={t('sectionLanguages')}>
          <div className="flex flex-wrap gap-8">
            <LanguageCheckbox
              id="lang-en"
              label={t('languageEnglish')}
              checked={languages.includes('en')}
              onChange={(on) => toggleLanguage('en', on)}
            />
            <LanguageCheckbox
              id="lang-es"
              label={t('languageSpanish')}
              checked={languages.includes('es')}
              onChange={(on) => toggleLanguage('es', on)}
            />
          </div>
        </Section>

        {/* Visual style */}
        <Section title={t('sectionVisualStyle')}>
          <p className="mono-eyebrow mb-6 text-ink-3">{t('visualStyleHint')}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {VISUAL_STYLE_OPTIONS.map((opt) => {
              const checked = visualStyle === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer gap-3 border p-4 transition-colors ${
                    checked ? 'border-ink bg-paper-2' : 'border-rule hover:border-ink'
                  }`}
                >
                  <input
                    type="radio"
                    name="visualStyle"
                    value={opt.value}
                    checked={checked}
                    onChange={() => setVisualStyle(opt.value)}
                    className="mt-1 accent-ink"
                  />
                  <span className="block">
                    <span
                      className="block"
                      style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 18 }}
                    >
                      {opt.label}
                    </span>
                    <span className="mono-eyebrow mt-1 block text-ink-3">{opt.tagline}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </Section>

        {/* Reel policy toggles — added 2026-05 (Step 4 autopilot). */}
        <Section title="Reel policy">
          <p className="mono-eyebrow mb-6 text-ink-3">
            Controls the directives the reel + image pipelines inject into Sora and gpt-image-2
            prompts.
          </p>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allowsHumans}
                onChange={(e) => setAllowsHumans(e.currentTarget.checked)}
                className="mt-1 accent-ink"
              />
              <span className="block">
                <span
                  className="block"
                  style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 18 }}
                >
                  Allow humans in reels
                </span>
                <span className="mono-eyebrow mt-1 block text-ink-3">
                  When on, Sora may render stylized human animations (PMs at desks, customers giving
                  feedback). When off, the pipeline injects a strict "no real people, no faces"
                  directive into every prompt.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={qualityGateEnabled}
                onChange={(e) => setQualityGateEnabled(e.currentTarget.checked)}
                className="mt-1 accent-ink"
              />
              <span className="block">
                <span
                  className="block"
                  style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 18 }}
                >
                  Quality gate
                </span>
                <span className="mono-eyebrow mt-1 block text-ink-3">
                  When on, image generations route through the best-of-K vision critic
                  (effort=high). Higher cost per asset, fewer dud renders.
                </span>
              </span>
            </label>
          </div>
        </Section>
      </div>

      <aside className="lg:sticky lg:top-12 lg:self-start">
        <BrandPreview
          projectName={projectName}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          accentColor={accentColor}
          bgColor={bgColor}
          fontHeading={fontHeading}
          fontBody={fontBody}
        />
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mono-eyebrow border-b border-ink pb-3">{title}</h2>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mono-eyebrow mb-3 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mono-eyebrow mb-3 block">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-12 cursor-pointer border border-ink"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field flex-1 font-mono text-[12px]"
          maxLength={7}
          spellCheck={false}
          aria-label={`${label} hex value`}
        />
      </div>
    </div>
  );
}

function FontSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <div>
      <label htmlFor={id} className="mono-eyebrow mb-3 block">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field cursor-pointer"
      >
        {options.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
    </div>
  );
}

function LanguageCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 text-sm text-ink">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-ink"
      />
      <span style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 16 }}>
        {label}
      </span>
    </label>
  );
}

function SaveStatus({
  state,
  t,
}: {
  state: SaveState;
  t: ReturnType<typeof useTranslations<'Identity'>>;
}) {
  const baseProps = { role: 'status' as const, 'aria-live': 'polite' as const };
  if (state.kind === 'idle')
    return (
      <div {...baseProps} className="mono-eyebrow text-ink-3">
        &nbsp;
      </div>
    );
  if (state.kind === 'saving')
    return (
      <div {...baseProps} className="mono-eyebrow text-ink-3">
        {t('saving')}
      </div>
    );
  if (state.kind === 'error')
    return (
      <div role="alert" aria-live="assertive" className="mono-eyebrow text-accent">
        {state.message}
      </div>
    );
  const time = state.at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return (
    <div {...baseProps} className="mono-eyebrow text-ink-3">
      {t('savedAt', { time })}
    </div>
  );
}
