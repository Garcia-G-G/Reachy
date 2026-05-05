import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { MonoEyebrow } from '@/components/editorial';
import { NewProjectForm } from './new-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Projects');
  return { title: t('newMetaTitle') };
}

export default function NewProjectPage() {
  return <NewProjectPageContent />;
}

function NewProjectPageContent() {
  const t = useTranslations('Projects');

  return (
    <div className="mx-auto max-w-[640px]">
      <MonoEyebrow as="div">{t('newEyebrow')}</MonoEyebrow>
      <h1 className="display mt-10" style={{ fontSize: 'clamp(40px, 5vw, 64px)', lineHeight: 1.0 }}>
        {t('newTitle')}
      </h1>
      <p
        className="mt-6 max-w-[40ch] text-ink-2"
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          fontSize: 19,
          fontWeight: 300,
          lineHeight: 1.45,
        }}
      >
        {t('newSubtitle')}
      </p>

      <hr className="rule-thin mt-12 mb-12" />

      <NewProjectForm />
    </div>
  );
}
