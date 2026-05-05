'use client';

import { useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';

interface LoginFormProps {
  googleEnabled: boolean;
  next: string;
}

type FormState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ERROR_ID = 'login-form-error';

export function LoginForm({ googleEnabled, next }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.kind === 'error') inputRef.current?.focus();
  }, [state.kind]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setState({ kind: 'error', message: 'Enter a valid email address.' });
      return;
    }

    setState({ kind: 'sending' });
    const { error } = await authClient.signIn.magicLink({
      email: trimmed,
      callbackURL: next,
    });

    if (error) {
      setState({
        kind: 'error',
        message: error.message ?? 'Could not send magic link. Try again in a moment.',
      });
      return;
    }
    setState({ kind: 'sent', email: trimmed });
  }

  async function onGoogle() {
    setState({ kind: 'sending' });
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: next,
    });
    if (error) {
      setState({
        kind: 'error',
        message: error.message ?? 'Google sign-in failed.',
      });
      return;
    }
    // social() redirects on success; if we're still here, reset.
    setState({ kind: 'idle' });
  }

  const sending = state.kind === 'sending';
  const hasError = state.kind === 'error';

  return (
    <div className="space-y-10">
      <form onSubmit={onSubmit} className="space-y-8" noValidate>
        <div>
          <label htmlFor="email" className="mono-eyebrow mb-3 block">
            Email
          </label>
          <input
            ref={inputRef}
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sending}
            placeholder="you@studio.app"
            className="field placeholder:text-ink-3"
            aria-invalid={hasError}
            aria-describedby={hasError ? ERROR_ID : undefined}
          />
        </div>

        <button
          type="submit"
          disabled={sending || !email.trim()}
          className="btn-ink w-full disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send magic link'}
        </button>
      </form>

      <div className="flex items-center gap-4">
        <span className="h-px flex-1 bg-rule" aria-hidden />
        <span className="mono-eyebrow">or</span>
        <span className="h-px flex-1 bg-rule" aria-hidden />
      </div>

      <button
        type="button"
        onClick={onGoogle}
        disabled={!googleEnabled || sending}
        className="btn-ghost w-full disabled:opacity-40"
        aria-disabled={!googleEnabled}
        title={googleEnabled ? undefined : 'Google sign-in is not configured in this environment.'}
      >
        Continue with Google
      </button>

      {state.kind === 'sent' && (
        <div
          role="status"
          aria-live="polite"
          className="border-t border-ink pt-6 text-sm leading-relaxed text-ink-2"
        >
          <p>
            Magic link on its way to <span className="font-mono text-ink">{state.email}</span>.
            Check your inbox — the link expires in 15 minutes.
          </p>
          <p className="mono-eyebrow mt-3 text-ink-3">
            If the email is unset locally, check the dev server terminal for the URL.
          </p>
        </div>
      )}

      {hasError && (
        <p id={ERROR_ID} role="alert" className="border-t border-accent pt-6 text-sm text-accent">
          {state.message}
        </p>
      )}
    </div>
  );
}
