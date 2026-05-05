import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Masthead, MonoEyebrow } from '@/components/editorial';
import { isGoogleEnabled } from '@/server/auth';
import { getSession } from '@/server/getSession';
import { LoginForm } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Login');
  return {
    title: t('metaTitle'),
    description: t('title'),
  };
}

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

function sanitizeNext(raw: string | undefined): string {
  if (!raw) return '/app';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/app';
  return raw;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();
  const params = await searchParams;
  const next = sanitizeNext(params.next);

  if (session) redirect(next);

  return <LoginPageContent next={next} />;
}

function LoginPageContent({ next }: { next: string }) {
  const t = useTranslations('Login');
  const tMast = useTranslations('Masthead');

  return (
    <>
      <Masthead links={[{ href: '/', label: tMast('back') }]} />

      <main className="mx-auto grid min-h-[calc(100vh-72px)] max-w-[1200px] grid-cols-1 px-6 py-20 md:grid-cols-[5fr_7fr] md:gap-16 md:px-10 md:py-[120px]">
        <section className="hidden border-r border-rule pr-12 md:block">
          <MonoEyebrow as="div">{t('eyebrow')}</MonoEyebrow>
          <h2
            className="display mt-10"
            style={{ fontSize: 'clamp(40px, 4.6vw, 64px)', lineHeight: 1.0 }}
          >
            {t.rich('title', {
              em: (chunks) => <em className="it text-accent">{chunks}</em>,
            })}
          </h2>
          <p
            className="mt-8 max-w-[28ch] text-ink-2"
            style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontSize: 19,
              fontWeight: 300,
              lineHeight: 1.45,
            }}
          >
            {t('subtitle')}
          </p>
          <hr className="rule-thin mt-12" />
          <p className="mono-eyebrow mt-8 text-ink-3">{t('magicLinkNote')}</p>
        </section>

        <section className="mx-auto w-full max-w-[420px] md:max-w-[440px]">
          <div className="md:hidden">
            <MonoEyebrow as="div">{t('eyebrow')}</MonoEyebrow>
            <h2
              className="display mt-6"
              style={{ fontSize: 'clamp(36px, 9vw, 48px)', lineHeight: 1.0 }}
            >
              {t.rich('title', {
                em: (chunks) => <em className="it text-accent">{chunks}</em>,
              })}
            </h2>
            <hr className="rule-thin my-10" />
          </div>

          <LoginForm googleEnabled={isGoogleEnabled} next={next} />
        </section>
      </main>
    </>
  );
}
