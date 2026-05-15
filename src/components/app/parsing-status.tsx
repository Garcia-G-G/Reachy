'use client';

import { useEffect, useRef, useState } from 'react';

interface StatusResponse {
  id: string;
  status: 'parsing' | 'ready' | 'failed';
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  summary: {
    textBlockCount: number;
    imageCount: number;
    tableCount: number;
    codeFileCount: number;
    unparsedCount: number;
    fileTypeMix: Record<string, number>;
    totalSizeBytes: number;
  } | null;
}

export function ParsingStatus({ ingestionId }: { ingestionId: string }) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<'parsing' | 'ready' | 'failed' | null>(null);

  useEffect(() => {
    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/ingestions/${ingestionId}/status`, { cache: 'no-store' });
        if (!res.ok) {
          setNetworkError(`status ${res.status}`);
          return;
        }
        const json = (await res.json()) as StatusResponse;
        setData(json);
        setNetworkError(null);
        statusRef.current = json.status;
      } catch (err) {
        setNetworkError(err instanceof Error ? err.message : 'network error');
      }
    };
    fetchOnce();
    pollRef.current = setInterval(() => {
      if (statusRef.current === 'ready' || statusRef.current === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        return;
      }
      fetchOnce();
    }, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [ingestionId]);

  if (!data) {
    return (
      <div className="mono-eyebrow text-ink-3">
        {networkError ? `Network: ${networkError}` : 'Loading…'}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-3 w-3 border border-ink"
          style={{
            background:
              data.status === 'ready'
                ? 'var(--color-ink, #14110D)'
                : data.status === 'failed'
                  ? 'var(--color-accent, #B6481A)'
                  : 'transparent',
          }}
        />
        <span className="mono-eyebrow">
          {data.status === 'parsing' && 'Parsing…'}
          {data.status === 'ready' && 'Ready'}
          {data.status === 'failed' && 'Failed'}
        </span>
      </div>

      {data.status === 'failed' && data.errorMessage && (
        <p className="text-sm text-accent">{data.errorMessage}</p>
      )}

      {data.summary && (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Text blocks" value={data.summary.textBlockCount} />
          <Stat label="Images" value={data.summary.imageCount} />
          <Stat label="Tables" value={data.summary.tableCount} />
          <Stat label="Code files" value={data.summary.codeFileCount} />
          <Stat label="Total size" value={prettyBytes(data.summary.totalSizeBytes)} mono={false} />
          {data.summary.unparsedCount > 0 && (
            <Stat label="Unparsed" value={data.summary.unparsedCount} />
          )}
        </dl>
      )}

      {data.summary && Object.keys(data.summary.fileTypeMix).length > 0 && (
        <div className="space-y-2">
          <h3 className="mono-eyebrow">File-type mix</h3>
          <ul className="flex flex-wrap gap-2 text-sm">
            {Object.entries(data.summary.fileTypeMix).map(([ext, n]) => (
              <li key={ext} className="border border-rule px-3 py-1">
                <span className="mono-eyebrow text-ink-3">{ext}</span>
                <span className="ml-2">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.status === 'ready' && (
        <p className="mono-eyebrow text-ink-3">
          Bundle ready. Next step (brief extraction) lives in Step 2 of the autopilot rebuild.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: number | string;
  mono?: boolean;
}) {
  return (
    <div className="border-t border-rule pt-2">
      <dt className="mono-eyebrow text-ink-3">{label}</dt>
      <dd
        className={mono ? 'mt-1 text-2xl' : 'mt-1 text-2xl'}
        style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}
      >
        {value}
      </dd>
    </div>
  );
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
