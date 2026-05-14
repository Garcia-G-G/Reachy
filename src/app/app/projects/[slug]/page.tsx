import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getProjectBySlug, getProjectOverviewStats } from '@/server/actions/projects';

interface OverviewPageProps {
  params: Promise<{ slug: string }>;
}

export default async function OverviewPage({ params }: OverviewPageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  // Pre-2026-05-14 this page rendered hardcoded zeros — the bug Garcia spotted
  // on the dashboard. Now we actually count.
  const stats = await getProjectOverviewStats(project.id);

  return (
    <OverviewContent
      description={project.description ?? null}
      piecesDone={stats?.piecesDone ?? 0}
      inFlight={stats?.inFlight ?? 0}
      monthSpendCents={stats?.monthSpendCents ?? 0}
    />
  );
}

function OverviewContent({
  description,
  piecesDone,
  inFlight,
  monthSpendCents,
}: {
  description: string | null;
  piecesDone: number;
  inFlight: number;
  monthSpendCents: number;
}) {
  const t = useTranslations('Projects');
  const spendDollars = (monthSpendCents / 100).toFixed(2);

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
        <Stat label={t('overviewPieces')} value={String(piecesDone)} />
        <Stat label={t('overviewQueued')} value={String(inFlight)} />
        <Stat label={t('overviewSpend')} value={`$${spendDollars}`} />
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
