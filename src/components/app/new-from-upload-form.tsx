'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { acceptAttributeClient as acceptAttribute } from '@/lib/accepted-file-types-client';
import { enqueueIngestion } from '@/server/actions/ingest';

interface FileEntry {
  originalName: string;
  mime: string | null;
  bytes: number;
  base64: string;
}

async function fileToEntry(file: File): Promise<FileEntry> {
  const buffer = await file.arrayBuffer();
  // Convert ArrayBuffer → base64 in chunks so we don't blow the stack
  // on big files. ~24KB per chunk keeps it well under the 65k arg cap.
  const bytes = new Uint8Array(buffer);
  const chunkSize = 24 * 1024;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return {
    originalName: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    mime: file.type || null,
    bytes: file.size,
    base64: btoa(binary),
  };
}

interface FormProps {
  /** Sanity figures for the "what can I upload?" caption. Drawn from
   *  parserLimits to keep the limit copy in sync with the worker. */
  caps: {
    maxBytesPerFile: number;
    maxBytesPerIngestion: number;
    maxFiles: number;
  };
}

const KNOWN_TYPE_GROUPS: ReadonlyArray<{ label: string; parsers: ReadonlyArray<string> }> = [
  { label: 'Docs', parsers: ['docx', 'pdf', 'markdown', 'html', 'text'] },
  { label: 'Office', parsers: ['pptx', 'xlsx', 'csv'] },
  { label: 'Data', parsers: ['json', 'yaml'] },
  { label: 'Media', parsers: ['image', 'mp4'] },
  { label: 'Code', parsers: ['code', 'zip'] },
];

export function NewFromUploadForm({ caps }: FormProps) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = [...files];
    let blocked = 0;
    for (const f of Array.from(incoming)) {
      if (f.size > caps.maxBytesPerFile) {
        blocked += 1;
        continue;
      }
      next.push(f);
    }
    if (next.length > caps.maxFiles) {
      toast.error(`Max ${caps.maxFiles} files per ingestion`);
      return;
    }
    if (blocked > 0) {
      toast.error(`${blocked} file(s) exceed ${Math.round(caps.maxBytesPerFile / 1024 / 1024)} MB`);
    }
    setFiles(next);
  };

  const removeAt = (idx: number) => setFiles(files.filter((_, i) => i !== idx));

  const submit = () => {
    if (files.length === 0 && pastedText.trim().length === 0) {
      toast.error('Drop a file or paste some text');
      return;
    }
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    if (totalBytes > caps.maxBytesPerIngestion) {
      toast.error(`Total upload exceeds ${Math.round(caps.maxBytesPerIngestion / 1024 / 1024)} MB`);
      return;
    }
    startTransition(async () => {
      try {
        const entries = await Promise.all(files.map(fileToEntry));
        const res = await enqueueIngestion({
          files: entries,
          pastedText: pastedText.trim() || undefined,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        router.push(`/app/projects/new-from-upload/${res.data.ingestionId}/parsing`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'upload failed');
      }
    });
  };

  return (
    <div className="space-y-8">
      <button
        type="button"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => document.getElementById('upload-file-input')?.click()}
        className="block w-full border border-ink py-20 px-8 text-center transition-colors"
        style={{
          background: dragOver ? 'var(--color-paper-2, #e8e0cf)' : 'transparent',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontSize: 'clamp(28px, 4vw, 48px)',
            lineHeight: 1.05,
          }}
        >
          Drop your brand stuff
        </h2>
        <p className="mono-eyebrow mt-3 text-ink-3">
          Docs · decks · sheets · code · images · videos · zip — we'll figure it out
        </p>
        <p className="mono-eyebrow mt-6 text-ink-3 text-[10px]">
          Up to {Math.round(caps.maxBytesPerIngestion / 1024 / 1024)} MB total ·{' '}
          {Math.round(caps.maxBytesPerFile / 1024 / 1024)} MB per file · {caps.maxFiles} files max
        </p>
        <input
          id="upload-file-input"
          type="file"
          multiple
          accept={acceptAttribute()}
          className="sr-only"
          onChange={(e) => handleFiles(e.currentTarget.files)}
        />
      </button>

      <div className="flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => document.getElementById('upload-file-input')?.click()}
          className="mono-eyebrow border border-ink px-4 py-2 hover:bg-ink hover:text-paper"
        >
          Pick files
        </button>
        <label className="mono-eyebrow inline-block border border-ink px-4 py-2 cursor-pointer hover:bg-ink hover:text-paper">
          Pick folder
          <input
            type="file"
            className="sr-only"
            onChange={(e) => handleFiles(e.currentTarget.files)}
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          />
        </label>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="mono-eyebrow">Queued · {files.length}</h3>
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li
                // File identity in a queued list is best-effort —
                // (name + size + lastModified) is enough to disambiguate
                // for any realistic upload set; the trailing index
                // covers exact-duplicate uploads (same file picked twice).
                // biome-ignore lint/suspicious/noArrayIndexKey: index is the tiebreaker, not the identity
                key={`${f.name}-${f.size}-${f.lastModified}-${i}`}
                className="flex items-center justify-between border-b border-rule py-2 text-sm"
              >
                <span className="truncate" title={f.name}>
                  {(f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name}
                  <span className="ml-2 text-ink-3">{prettyBytes(f.size)}</span>
                </span>
                <button
                  type="button"
                  className="mono-eyebrow text-ink-3 hover:text-ink"
                  onClick={() => removeAt(i)}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="paste" className="mono-eyebrow">
          Or paste text
        </label>
        <textarea
          id="paste"
          rows={6}
          value={pastedText}
          onChange={(e) => setPastedText(e.currentTarget.value)}
          placeholder="Notes, a positioning doc, a brief — anything that describes the brand."
          className="field w-full resize-y placeholder:text-ink-3"
        />
      </div>

      <div className="flex items-center justify-between gap-6">
        <p className="mono-eyebrow text-ink-3 text-[10px]">
          Accepted: {KNOWN_TYPE_GROUPS.map((g) => g.label).join(' · ')}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="btn-ink disabled:opacity-50"
        >
          {pending ? 'Uploading…' : 'Start ingest'}
        </button>
      </div>
    </div>
  );
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
