import type { Metadata } from 'next';
import { Fraunces, Instrument_Serif, Inter, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { Toaster } from '@/components/ui/sonner';
import { env } from '@/env';
import './globals.css';

// `latin-ext` covers Spanish accents (á é í ó ú ñ ¿ ¡) and other Latin
// scripts. Reachy's primary audience is Latin American indie hackers, so we
// pay the small extra subset weight to render Spanish correctly without
// fallback glyphs. See: https://nextjs.org/docs/app/getting-started/fonts
const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT'],
  display: 'swap',
});

const instrument = Instrument_Serif({
  subsets: ['latin', 'latin-ext'],
  weight: '400',
  style: ['italic', 'normal'],
  variable: '--font-instrument',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(env.BETTER_AUTH_URL),
  title: {
    default: 'Reachy — Welcome edition',
    template: '%s · Reachy',
  },
  description:
    'Reachy turns every indie SaaS launch into a small edition — images, copy, reels, OG cards, all coherent with your brand.',
  applicationName: 'Reachy',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      // Browser auto-translation (Chrome's "translate this page" for Spanish
      // users browsing the EN UI) mutates text nodes mid-render and triggers
      // React 19 hydration NotFoundError. Garcia's audience overlaps EN/ES,
      // so we explicitly opt out — the in-app locale switcher is the path.
      // Refs: https://github.com/facebook/react/issues/11538
      //       https://github.com/vercel/next.js/discussions/66313
      translate="no"
      className={`notranslate ${fraunces.variable} ${instrument.variable} ${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
