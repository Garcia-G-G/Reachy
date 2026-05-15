import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { ParsingStatus } from '@/components/app/parsing-status';
import { db } from '@/server/db/client';
import { ingestion } from '@/server/db/schema/ingestion';
import { getSession } from '@/server/getSession';

interface PageProps {
  params: Promise<{ ingestionId: string }>;
}

export default async function ParsingPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { ingestionId } = await params;

  const [row] = await db.select().from(ingestion).where(eq(ingestion.id, ingestionId)).limit(1);
  if (!row) notFound();
  if (row.userId !== session.user.id) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-12 space-y-3">
        <p className="mono-eyebrow text-ink-3">Autopilot · Step 1 · Parsing</p>
        <h1
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontSize: 'clamp(40px, 6vw, 80px)',
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          Reading what you sent
        </h1>
        <p className="text-ink-2">
          We're routing each file through the right parser. This usually finishes in seconds.
        </p>
      </header>

      <ParsingStatus ingestionId={row.id} />
    </main>
  );
}
