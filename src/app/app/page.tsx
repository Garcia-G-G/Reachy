import type { Metadata } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { MonoEyebrow } from '@/components/editorial';
import { listProjectsForCurrentUser } from '@/server/actions/projects';
import { requireSession } from '@/server/getSession';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AppHome');
  return { title: t('metaTitle') };
}

export default async function AppHomePage() {
  const session = await requireSession();
  const projects = await listProjectsForCurrentUser();
  const email = session.user.email;
  const name = session.user.name?.trim();
  const greetingName = name && name.length > 0 ? name : email;

  if (projects.length === 0) {
    return <EmptyState />;
  }

  return (
    <DashboardContent email={email} greetingName={greetingName} projectCount={projects.length} />
  );
}

function EmptyState() {
  const t = useTranslations('AppHome');

  return (
    <div className="mx-auto max-w-[640px] py-12">
      <MonoEyebrow as="div">{t('eyebrow')}</MonoEyebrow>
      <h1
        className="display mt-10"
        style={{ fontSize: 'clamp(40px, 5vw, 72px)', lineHeight: 0.98 }}
      >
        {t('emptyTitle')}
      </h1>
      <p
        className="mt-8 max-w-[44ch] text-ink-2"
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          fontSize: 19,
          fontWeight: 300,
          lineHeight: 1.5,
        }}
      >
        {t('emptyBody')}
      </p>
      <hr className="rule-double mt-12" />
      <div className="mt-12">
        <Link href="/app/projects/new" className="btn-ink inline-block">
          {t('emptyCta')}
        </Link>
      </div>
    </div>
  );
}

function DashboardContent({
  email,
  greetingName,
  projectCount,
}: {
  email: string;
  greetingName: string;
  projectCount: number;
}) {
  const t = useTranslations('AppHome');

  return (
    <div className="mx-auto max-w-[860px]">
      <MonoEyebrow as="div">{t('eyebrow')}</MonoEyebrow>
      <h1
        className="display mt-10"
        style={{ fontSize: 'clamp(48px, 7vw, 96px)', lineHeight: 0.96 }}
      >
        {t('welcome')}, <em className="it text-accent">{greetingName}</em>.
      </h1>
      <p
        className="mt-10 max-w-[44ch] text-ink-2"
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          fontSize: 21,
          fontWeight: 300,
          lineHeight: 1.45,
        }}
      >
        {t('subtitle')}
      </p>
      <hr className="rule-thin mt-16" />
      <dl className="mt-10 grid grid-cols-1 gap-8 text-sm leading-relaxed md:grid-cols-3">
        <div>
          <dt className="mono-eyebrow text-ink-3">{t('statEmail')}</dt>
          <dd className="mt-2 font-mono text-ink">{email}</dd>
        </div>
        <div>
          <dt className="mono-eyebrow text-ink-3">{t('statHeaders')}</dt>
          <dd className="mt-2 text-ink-2">
            {projectCount === 0 ? t('statHeadersValueZero') : `${projectCount} active`}
          </dd>
        </div>
        <div>
          <dt className="mono-eyebrow text-ink-3">{t('statEditions')}</dt>
          <dd className="mt-2 text-ink-2">{t('statEditionsValueZero')}</dd>
        </div>
      </dl>
    </div>
  );
}
