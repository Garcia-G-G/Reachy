import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getProjectBySlug } from '@/server/actions/projects';

interface OverviewPageProps {
  params: Promise<{ slug: string }>;
}

export default async function OverviewPage({ params }: OverviewPageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  return <OverviewContent description={project.description ?? null} />;
}

function OverviewContent({ description }: { description: string | null }) {
  const t = useTranslations('Projects');

  return (
    <div className="space-y-12">
      {description && (
        <p
          className="max-w-[60ch] text-ink-2"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontSize: 19,
            fontWeight: 300,
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}

      <dl className="grid grid-cols-1 gap-12 md:grid-cols-3">
        <Stat label={t('overviewPieces')} value="0" />
        <Stat label={t('overviewQueued')} value="0" />
        <Stat label={t('overviewSpend')} value="$0.00" />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mono-eyebrow text-ink-3">{label}</dt>
      <dd
        className="display mt-3 text-ink"
        style={{ fontSize: 'clamp(40px, 5vw, 64px)', lineHeight: 1 }}
      >
        {value}
      </dd>
    </div>
  );
}
