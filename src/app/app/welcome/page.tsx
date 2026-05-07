import type { Metadata } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { MonoEyebrow } from '@/components/editorial';
import { listProjectsForCurrentUser } from '@/server/actions/projects';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Welcome');
  return { title: t('metaTitle') };
}

export default async function WelcomePage() {
  // If the user already has projects, the welcome dance isn't useful — send
  // them to their first project's overview.
  const projects = await listProjectsForCurrentUser();
  const firstSlug = projects[0]?.slug;

  return <Content firstSlug={firstSlug} />;
}

function Content({ firstSlug }: { firstSlug: string | undefined }) {
  const t = useTranslations('Welcome');

  return (
    <div className="mx-auto max-w-[820px] space-y-12 px-6 py-16 md:px-10">
      <div>
        <MonoEyebrow as="div">{t('eyebrow')}</MonoEyebrow>
        <h1
          className="display mt-6"
          style={{ fontSize: 'clamp(48px, 6vw, 84px)', lineHeight: 0.96 }}
        >
          {t.rich('title', { em: (chunks) => <em className="it text-accent">{chunks}</em> })}
        </h1>
        <p
          className="mt-6 max-w-[60ch] text-ink-2"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontSize: 18,
            fontWeight: 300,
            lineHeight: 1.5,
          }}
        >
          {t('lede')}
        </p>
      </div>

      <ol className="space-y-6">
        <Step
          n="01"
          done={Boolean(firstSlug)}
          title={t('stepProject')}
          body={t('stepProjectBody')}
          ctaHref="/app/projects/new"
          ctaLabel={t('stepProjectCta')}
        />
        <Step
          n="02"
          done={false}
          title={t('stepIdentity')}
          body={t('stepIdentityBody')}
          ctaHref={firstSlug ? `/app/projects/${firstSlug}/identity` : '/app/projects/new'}
          ctaLabel={t('stepIdentityCta')}
        />
        <Step
          n="03"
          done={false}
          title={t('stepGenerate')}
          body={t('stepGenerateBody')}
          ctaHref={firstSlug ? `/app/projects/${firstSlug}/generate/image` : '/app/projects/new'}
          ctaLabel={t('stepGenerateImage')}
          extras={
            firstSlug
              ? [
                  {
                    href: `/app/projects/${firstSlug}/generate/copy`,
                    label: t('stepGenerateCopy'),
                  },
                  {
                    href: `/app/projects/${firstSlug}/generate/reel`,
                    label: t('stepGenerateReel'),
                  },
                ]
              : []
          }
        />
      </ol>
    </div>
  );
}

interface StepProps {
  n: string;
  done: boolean;
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
  extras?: Array<{ href: string; label: string }>;
}

function Step({ n, done, title, body, ctaHref, ctaLabel, extras }: StepProps) {
  return (
    <li className="grid grid-cols-[80px_1fr] gap-6 border-t border-ink pt-6">
      <span
        className={`display ${done ? 'text-accent' : 'text-ink-3'}`}
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          fontSize: 56,
          lineHeight: 1,
        }}
      >
        {n}
      </span>
      <div className="space-y-3">
        <h2 className="display text-[24px] font-medium leading-tight">{title}</h2>
        <p className="text-ink-2" style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}>
          {body}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href={ctaHref} className="btn-ink">
            {ctaLabel}
          </Link>
          {extras?.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="mono-eyebrow text-ink-3 transition-colors hover:text-accent"
            >
              {e.label}
            </Link>
          ))}
        </div>
      </div>
    </li>
  );
}
