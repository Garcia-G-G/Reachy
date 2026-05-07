import { ImageResponse } from 'next/og';
import { type Locale, routing } from '@/i18n/routing';

export const runtime = 'edge';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

interface RouteContext {
  params: Promise<{ locale: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { locale: rawLocale } = await params;
  const locale: Locale = (routing.locales as readonly string[]).includes(rawLocale)
    ? (rawLocale as Locale)
    : routing.defaultLocale;
  const messages = (await import(`../../../../messages/${locale}.json`)).default as {
    Landing: { ogTagline: string; cover: { meta: string }; masthead: { volume: string } };
  };

  const PAPER = '#f1ebdf';
  const INK = '#14110d';
  const INK_3 = '#8b8170';
  const ACCENT = '#b6481a';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: PAPER,
        color: INK,
        display: 'flex',
        flexDirection: 'column',
        padding: 64,
        fontFamily: 'serif',
      }}
    >
      {/* masthead row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${INK}`,
          paddingBottom: 16,
        }}
      >
        <span
          style={{
            fontSize: 14,
            color: INK_3,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
          }}
        >
          {messages.Landing.masthead.volume}
        </span>
        <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.02em' }}>Reachy</span>
      </div>

      {/* tagline */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingTop: 32,
        }}
      >
        <span
          style={{
            fontSize: 14,
            color: INK_3,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            marginBottom: 24,
          }}
        >
          № 01<span style={{ color: ACCENT, margin: '0 8px' }}>—</span>
          {locale === 'es' ? 'Edición de bienvenida' : 'Welcome edition'}
        </span>
        <span
          style={{
            fontSize: 76,
            fontWeight: 400,
            letterSpacing: '-0.035em',
            lineHeight: 0.95,
            maxWidth: '14ch',
          }}
        >
          {messages.Landing.ogTagline}
        </span>
      </div>

      {/* meta */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: `1px solid ${INK}`,
          paddingTop: 16,
          fontSize: 14,
          color: INK_3,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
        }}
      >
        <span>{messages.Landing.cover.meta}</span>
        <span>reachy.app</span>
      </div>
    </div>,
    { ...size },
  );
}
