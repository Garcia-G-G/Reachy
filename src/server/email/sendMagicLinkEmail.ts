import { Resend } from 'resend';
import { env } from '@/env';

type SendArgs = { to: string; url: string };

const SUBJECT = 'Sign in to Reachy';

function plainText(url: string) {
  return [
    'Sign in to Reachy.',
    '',
    'Click the link below to access your editor’s desk. The link expires in 15 minutes.',
    '',
    url,
    '',
    'If you did not request this email, you can ignore it.',
  ].join('\n');
}

function html(url: string) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:48px 24px;background:#f1ebdf;color:#14110d;font-family:'Inter',system-ui,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;">
      <tr><td>
        <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8b8170;margin:0 0 24px;">Reachy &mdash; Editorial</p>
        <h1 style="font-family:'Fraunces',Georgia,serif;font-size:40px;line-height:1.05;letter-spacing:-.02em;margin:0 0 24px;">Step into your editor&rsquo;s desk.</h1>
        <p style="font-size:15px;line-height:1.55;margin:0 0 32px;">Click the button below to sign in. The link expires in 15 minutes.</p>
        <p style="margin:0 0 32px;">
          <a href="${url}" style="display:inline-block;background:#14110d;color:#f1ebdf;padding:16px 32px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;text-decoration:none;">Sign in to Reachy</a>
        </p>
        <p style="font-size:13px;color:#4a4338;margin:0 0 8px;">Or copy and paste this URL:</p>
        <p style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;word-break:break-all;color:#4a4338;margin:0 0 32px;">${url}</p>
        <hr style="border:0;border-top:1px solid #c9bfa9;margin:32px 0;" />
        <p style="font-size:12px;color:#8b8170;margin:0;">If you did not request this email, you can ignore it.</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendMagicLinkEmail({ to, url }: SendArgs): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.log('\n[reachy:auth] Magic link (dev fallback — RESEND_API_KEY or EMAIL_FROM missing)');
    console.log(`[reachy:auth] to:  ${to}`);
    console.log(`[reachy:auth] url: ${url}\n`);
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: SUBJECT,
    text: plainText(url),
    html: html(url),
  });

  if (error) {
    console.error('[reachy:auth] Resend send failed:', error);
    console.log(`[reachy:auth] Dev fallback URL for ${to}: ${url}`);
    throw new Error(`Failed to send magic link: ${error.message ?? 'unknown error'}`);
  }
}
