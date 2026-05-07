import type { Metadata, ResolvingMetadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { LandingMasthead } from '@/components/marketing/landing-masthead';
import { LandingPage } from '@/components/marketing/landing-page';
import { type Locale, routing } from '@/i18n/routing';

export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

interface LocaleParams {
  params: Promise<{ locale: string }>;
}

function asLocale(raw: string): Locale {
  return (routing.locales as readonly string[]).includes(raw)
    ? (raw as Locale)
    : routing.defaultLocale;
}

export async function generateMetadata(
  { params }: LocaleParams,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = asLocale(rawLocale);
  // Load just the Landing namespace synchronously to avoid pulling the whole
  // tree twice (once in metadata, once in the page).
  const messages = (await import(`../../../messages/${locale}.json`)).default as {
    Landing: { metaTitle: string; metaDescription: string; ogTagline: string };
  };
  return {
    title: messages.Landing.metaTitle,
    description: messages.Landing.metaDescription,
    openGraph: {
      title: messages.Landing.metaTitle,
      description: messages.Landing.metaDescription,
      images: [{ url: `/${locale}/og`, width: 1200, height: 630 }],
      locale: locale === 'es' ? 'es_ES' : 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: messages.Landing.metaTitle,
      description: messages.Landing.metaDescription,
    },
    alternates: {
      canonical: locale === routing.defaultLocale ? '/' : `/${locale}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, l === routing.defaultLocale ? '/' : `/${l}`]),
      ),
    },
  };
}

export default async function HomePage({ params }: LocaleParams) {
  const { locale: rawLocale } = await params;
  const locale = asLocale(rawLocale);
  // Required when using next-intl middleware-routed [locale] segments so
  // useTranslations works in nested Server Components without re-detecting.
  // https://next-intl.dev/docs/getting-started/app-router-with-i18n-routing
  setRequestLocale(locale);

  return (
    <>
      <LandingMasthead />
      <LandingPage />
    </>
  );
}
