import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';
import { MonoEyebrow } from '@/components/editorial';

/**
 * Editorial landing — replicates docs/design-editorial.html.
 * Five sections: cover (hero), index (3 capability columns), spread (workshop
 * preview mock), and the colophon footer.
 */
export function LandingPage() {
  const t = useTranslations('Landing');

  return (
    <>
      {/* ────── COVER ────── */}
      <section className="mx-auto max-w-[1200px] px-6 pt-20 pb-24 text-center md:px-10 md:pt-[140px] md:pb-[160px]">
        <p className="mb-14 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
          {t.rich('cover.eyebrow', {
            accent: (chunks) => <span className="mx-[6px] text-accent">{chunks}</span>,
          })}
        </p>

        <h1
          className="display mx-auto"
          style={{
            fontSize: 'clamp(56px, 9vw, 128px)',
            letterSpacing: '-0.035em',
            lineHeight: 0.95,
            maxWidth: '14ch',
          }}
        >
          {t.rich('cover.headline', {
            em: (chunks) => <em className="it text-accent">{chunks}</em>,
          })}
        </h1>

        <p
          className="mx-auto mt-14 text-ink-2"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontWeight: 300,
            fontSize: 21,
            lineHeight: 1.45,
            maxWidth: '44ch',
            fontVariationSettings: "'opsz' 36",
          }}
        >
          {t.rich('cover.lede', { em: (chunks) => <em className="it">{chunks}</em> })}
        </p>

        <div className="mt-16 inline-flex flex-col items-center gap-[18px]">
          <Link href="/login" className="btn-ink">
            {t('cover.cta')}
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
            {t('cover.meta')}
          </span>
        </div>
      </section>

      {/* ────── INDEX ────── */}
      <section id="index" className="border-y border-ink">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-start gap-6 px-6 py-14 md:grid-cols-[200px_1fr] md:gap-14 md:px-10">
          <MonoEyebrow as="div" className="border-t border-ink pt-3">
            {t.rich('index.label', { br: () => <br /> })}
          </MonoEyebrow>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <IndexItem
              num={t('index.imagesNum')}
              title={t.rich('index.imagesTitle', {
                em: (chunks) => <span className="it">{chunks}</span>,
              })}
              body={t('index.imagesBody')}
            />
            <IndexItem
              num={t('index.copyNum')}
              title={t.rich('index.copyTitle', {
                em: (chunks) => <span className="it">{chunks}</span>,
              })}
              body={t('index.copyBody')}
            />
            <IndexItem
              num={t('index.reelsNum')}
              title={t.rich('index.reelsTitle', {
                em: (chunks) => <span className="it">{chunks}</span>,
              })}
              body={t('index.reelsBody')}
            />
          </div>
        </div>
      </section>

      {/* ────── SPREAD — workshop preview ────── */}
      <section id="spread" className="bg-paper-2">
        <div className="mx-auto max-w-[1200px] px-6 pt-20 pb-24 md:px-10 md:pt-24 md:pb-28">
          <div className="mb-14 flex flex-col items-baseline justify-between gap-2 border-b border-rule pb-[18px] md:flex-row">
            <h2 className="display text-[32px] leading-none md:text-[44px]">
              {t.rich('spread.h2', { em: (chunks) => <span className="it">{chunks}</span> })}
            </h2>
            <MonoEyebrow>{t('spread.meta')}</MonoEyebrow>
          </div>

          <EditorMock />
        </div>
      </section>

      {/* ────── COLOPHON ────── */}
      <footer className="border-t border-ink px-6 py-9 md:px-10">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 md:flex-row md:gap-6 md:text-left">
          <span>{t('colophon.copy')}</span>
          <span>{t('colophon.made')}</span>
          <span>
            <a href="mailto:hello@reachy.app" className="transition-colors hover:text-accent">
              {t('colophon.linkContact')}
            </a>{' '}
            ·{' '}
            <a href="/docs" className="transition-colors hover:text-accent">
              {t('colophon.linkSelfHosting')}
            </a>
          </span>
        </div>
      </footer>
    </>
  );
}

function IndexItem({ num, title, body }: { num: string; title: ReactNode; body: string }) {
  return (
    <article className="border-t border-ink pt-3">
      <div className="mb-[14px] font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
        {num}
      </div>
      <h3 className="display mb-[10px] text-[28px] font-medium leading-[1.05]">{title}</h3>
      <p className="max-w-[28ch] text-[14px] leading-[1.55] text-ink-2">{body}</p>
    </article>
  );
}

const HEADERS = [
  { n: '01', t: 'SaaS Tracker', active: true },
  { n: '02', t: 'HabitForge', active: false },
  { n: '03', t: 'NoteSync', active: false },
] as const;

function EditorMock() {
  const t = useTranslations('Landing.spread');
  const pieces = [
    {
      key: 'cover',
      title: t('pieceCover'),
      sub: t('pieceCoverSub'),
      px: '1920×1080',
      gradient: 'linear-gradient(135deg, #d8cfbb, var(--accent))',
    },
    {
      key: 'carousel',
      title: t('pieceCarousel'),
      sub: t('pieceCarouselSub'),
      px: '1080×1350',
      gradient: 'linear-gradient(150deg, #c8c2b1, var(--ink))',
    },
    {
      key: 'reel',
      title: t('pieceReel'),
      sub: t('pieceReelSub'),
      px: '1080×1920',
      gradient: 'linear-gradient(160deg, #1f3a2f, var(--accent))',
    },
  ];
  const piecesInEdition = ['cover', 'carousel', 'thread', 'reel', 'email'] as const;
  const piecesInEditionLabels: Record<(typeof piecesInEdition)[number], string> = {
    cover: t('pieceCover'),
    carousel: t('pieceCarousel'),
    thread: 'Thread',
    reel: t('pieceReel'),
    email: 'Email',
  };

  return (
    <div className="card-paper card-hard">
      <div className="flex flex-wrap items-center gap-[14px] border-b border-ink px-[18px] py-3 font-mono text-[10px] uppercase tracking-[0.14em]">
        <span className="text-accent">№ 12</span>
        <span>{t('editorBarTitle')}</span>
        <span className="ml-auto text-ink-3">{t('editorBarStat')}</span>
      </div>

      <div className="grid min-h-[460px] grid-cols-1 md:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-ink p-[22px_20px] md:block">
          <div className="mono-eyebrow mb-3 text-[9px]!">{t('sidebarHeaders')}</div>
          {HEADERS.map((h) => (
            <div
              key={h.n}
              className="flex items-baseline gap-[10px] border-b border-dotted border-rule py-[7px] last:border-b-0"
            >
              <span
                className={`display w-[26px] text-[18px] ${
                  h.active ? 'font-medium text-accent' : 'text-ink-3'
                }`}
              >
                {h.n}
              </span>
              <span
                className={`display text-[15px] leading-[1.15] ${
                  h.active ? 'font-medium text-accent' : ''
                }`}
              >
                {h.t}
              </span>
            </div>
          ))}

          <div className="mono-eyebrow mt-7 mb-3 text-[9px]!">{t('sidebarThisEdition')}</div>
          {piecesInEdition.map((p) => (
            <Fragment key={p}>
              <div className="display py-[6px] text-[15px] text-ink-2 transition-colors hover:text-accent">
                › {piecesInEditionLabels[p]}
              </div>
            </Fragment>
          ))}
        </aside>

        <div className="p-7">
          <div className="mb-[22px] flex items-baseline justify-between border-b border-ink pb-3">
            <h4 className="display text-[22px] font-medium tracking-tight">{t('canvasEdition')}</h4>
            <MonoEyebrow>{t('canvasDate')}</MonoEyebrow>
          </div>

          <div className="grid grid-cols-1 gap-[18px] md:grid-cols-[1.3fr_1fr_1fr]">
            {pieces.map((p) => (
              <article key={p.key} className="flex flex-col border border-ink">
                <div
                  className="aspect-[4/5]"
                  style={{ background: p.gradient }}
                  aria-hidden="true"
                />
                <div className="flex items-baseline justify-between border-t border-ink px-[14px] py-3">
                  <div className="display text-[14px] font-medium">
                    {p.title}
                    <small className="mt-[2px] block text-[10px] font-normal not-italic tracking-[0.03em] text-ink-3">
                      {p.sub}
                    </small>
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">
                    {p.px}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
