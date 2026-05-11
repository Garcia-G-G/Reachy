import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const r2PublicHostname = (() => {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return undefined;
  try {
    return new URL(raw).hostname;
  } catch {
    return undefined;
  }
})();

// Content-Security-Policy — ships as Report-Only first so violations are
// logged but never block rendering. Promote to enforced CSP after a few days
// of clean prod traffic by renaming the header key below.
const cspDirectives: Array<[string, string[]]> = [
  ['default-src', ["'self'"]],
  // Next.js + next-intl + better-auth all inject inline scripts during hydration
  // and rich-text formatting. 'unsafe-inline' until we wire a nonce middleware.
  ['script-src', ["'self'", "'unsafe-inline'", "'unsafe-eval'"]],
  // Tailwind 4 + Base UI emit inline style attributes; keep 'unsafe-inline'.
  ['style-src', ["'self'", "'unsafe-inline'"]],
  [
    'img-src',
    ["'self'", 'data:', 'blob:', ...(r2PublicHostname ? [`https://${r2PublicHostname}`] : [])],
  ],
  ['font-src', ["'self'", 'data:']],
  [
    'connect-src',
    [
      "'self'",
      'https://api.openai.com',
      'https://accounts.google.com',
      'https://oauth2.googleapis.com',
      'https://fal.run',
      'https://*.fal.ai',
      ...(r2PublicHostname ? [`https://${r2PublicHostname}`] : []),
    ],
  ],
  ['frame-src', ["'self'", 'https://accounts.google.com']],
  ['frame-ancestors', ["'none'"]],
  ['form-action', ["'self'"]],
  ['base-uri', ["'self'"]],
  ['object-src', ["'none'"]],
];

const cspValue = cspDirectives.map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // 'same-origin-allow-popups' is required so the Google OAuth popup can
  // close itself and notify the opener (better-auth's social sign-in flow).
  // 'same-origin' would break Google sign-in. See:
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
  { key: 'Content-Security-Policy-Report-Only', value: cspValue },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: r2PublicHostname ? [{ protocol: 'https', hostname: r2PublicHostname }] : [],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
