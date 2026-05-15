import { redirect } from 'next/navigation';
import { NewFromUploadForm } from '@/components/app/new-from-upload-form';
import {
  MAX_BYTES_PER_FILE,
  MAX_BYTES_PER_INGESTION,
  MAX_FILES_PER_INGESTION,
} from '@/server/config/parserLimits';
import { getSession } from '@/server/getSession';

export default async function NewFromUploadPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-12 space-y-3">
        <p className="mono-eyebrow text-ink-3">Autopilot · Step 1</p>
        <h1
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontSize: 'clamp(48px, 7vw, 96px)',
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          Ingest
        </h1>
        <p className="text-ink-2">
          Drop everything you've got — a brand brief, a deck, a notes doc, even a repo. We'll read
          what's inside before asking you a single question.
        </p>
      </header>

      <NewFromUploadForm
        caps={{
          maxBytesPerFile: MAX_BYTES_PER_FILE,
          maxBytesPerIngestion: MAX_BYTES_PER_INGESTION,
          maxFiles: MAX_FILES_PER_INGESTION,
        }}
      />
    </main>
  );
}
