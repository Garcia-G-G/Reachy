'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

interface SignOutButtonProps {
  className?: string;
}

export function SignOutButton({ className = '' }: SignOutButtonProps) {
  const t = useTranslations('AppShell');
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await authClient.signOut();
      router.replace('/login');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`mono-eyebrow text-ink-3 transition-colors hover:text-accent disabled:opacity-50 ${className}`.trim()}
    >
      {pending ? t('signingOut') : t('signOut')}
    </button>
  );
}
