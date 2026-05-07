import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { type Locale, routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

interface LocaleLayoutProps {
  children: ReactNode;
  // Next 16 generates `params` as `Promise<{ locale: string }>` from the
  // route segment — narrow to the supported set inside the function.
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(routing.locales, rawLocale)) notFound();
  const locale = rawLocale as Locale;

  // setRequestLocale is required so Server Components inside this segment can
  // use useTranslations() / getTranslations() with the right messages without
  // re-running locale detection. Wrap in NextIntlClientProvider so client
  // components inside the tree still receive the messages.
  setRequestLocale(locale);

  return <NextIntlClientProvider locale={locale}>{children}</NextIntlClientProvider>;
}
