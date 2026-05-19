'use client';

/**
 * ChatToolCard — renders an inline tool invocation inside an
 * assistant message. The AI SDK v6 UI message format emits one part
 * per tool with a state field cycling through:
 *
 *   input-streaming    → tool input is still being generated
 *   input-available    → input ready, tool executing
 *   output-available   → tool returned, render the result
 *   output-error       → tool threw, render the error
 *
 * We render distinctly per tool name so generateImage shows a thumb,
 * writeCopy shows a code-block, searchAssets shows a result list,
 * etc.
 */

interface ToolPart {
  type: string; // 'tool-generateImage', 'tool-writeCopy', etc.
  toolCallId: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

interface ChatToolCardProps {
  part: ToolPart;
}

function toolName(type: string): string {
  return type.startsWith('tool-') ? type.slice('tool-'.length) : type;
}

function renderInputStreaming(name: string): React.ReactNode {
  return <div className="mono-eyebrow text-ink-3">{name} · preparing…</div>;
}

function renderInputAvailable(name: string): React.ReactNode {
  return <div className="mono-eyebrow text-ink-3">{name} · running…</div>;
}

function renderOutputError(name: string, error?: string): React.ReactNode {
  return (
    <div className="border border-red-700 bg-red-50 p-3 text-sm text-red-900">
      <div className="mono-eyebrow mb-1 text-red-900">{name} · error</div>
      <div>{error ?? 'unknown error'}</div>
    </div>
  );
}

/** Per-tool output renderer. Falls back to a JSON pre block. */
function renderOutput(name: string, output: unknown): React.ReactNode {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;

  if (name === 'generateImage' || name === 'regenerateAsset') {
    const urls = (o.assetUrls as string[] | undefined) ?? [];
    const cost = o.costCents as number | undefined;
    if (urls.length === 0 && o.error) {
      return <div className="text-sm text-red-900">{String(o.error)}</div>;
    }
    return (
      <div className="space-y-2">
        {urls.map((u) => (
          <a key={u} href={u} target="_blank" rel="noreferrer" className="block border border-ink">
            {/* biome-ignore lint/a11y/useAltText: in-conversation preview */}
            <img src={u} className="max-h-[420px] w-full object-contain bg-paper-2" alt="" />
          </a>
        ))}
        <div className="mono-eyebrow text-ink-3">
          {urls.length > 0 ? `${urls.length} variant${urls.length > 1 ? 's' : ''}` : ''}
          {cost !== undefined ? ` · cost $${(cost / 100).toFixed(2)}` : ''}
        </div>
      </div>
    );
  }

  if (name === 'writeCopy') {
    const text = (o.text as string | undefined) ?? '';
    return (
      <div className="border border-ink bg-paper-2 p-4">
        <pre className="whitespace-pre-wrap font-sans leading-relaxed text-ink">{text}</pre>
        <div className="mono-eyebrow mt-3 text-ink-3">
          channel {String(o.channel ?? '')} · {String(o.wordCount ?? 0)} words ·{' '}
          {o.costCents !== undefined ? `$${(Number(o.costCents) / 100).toFixed(2)}` : ''}
        </div>
      </div>
    );
  }

  if (name === 'searchAssets') {
    const results = (o.results as Array<Record<string, unknown>> | undefined) ?? [];
    if (results.length === 0) {
      return <div className="text-sm text-ink-3">no matches</div>;
    }
    return (
      <ul className="space-y-1">
        {results.map((r, i) => (
          <li key={String(r.generationId ?? i)} className="border-rule border-b py-2 text-sm">
            <span className="mono-eyebrow text-ink-3">{String(r.kind ?? 'asset')}</span>{' '}
            {String(r.idea ?? '')}
          </li>
        ))}
      </ul>
    );
  }

  if (
    name === 'searchBrandKit' ||
    name === 'listLayouts' ||
    name === 'listChannels' ||
    name === 'listVisualStyles'
  ) {
    // For these informational tools the assistant's next text usually
    // re-states the relevant bit; we keep the raw output compact and
    // collapsible so the chat doesn't get noisy.
    return (
      <details className="text-xs text-ink-3">
        <summary className="mono-eyebrow cursor-pointer">{name} result</summary>
        <pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(output, null, 2)}</pre>
      </details>
    );
  }

  if (name === 'saveAsCampaignAsset') {
    if (o.error) return <div className="text-sm text-red-900">{String(o.error)}</div>;
    return (
      <div className="mono-eyebrow text-ink-3">
        saved · campaign_asset {String(o.campaignAssetId ?? '')}
      </div>
    );
  }

  if (name === 'ingestUploadedFile') {
    return (
      <div className="text-sm text-ink-2">
        <div className="mono-eyebrow text-ink-3">parsed · {String(o.originalName ?? '')}</div>
        <div className="mt-1">{String(o.summary ?? '')}</div>
      </div>
    );
  }

  if (name === 'describeImage') {
    return (
      <div className="text-sm text-ink-2">
        <div className="mono-eyebrow text-ink-3">vision · {String(o.styleDescriptor ?? '')}</div>
        <div className="mt-1">{String(o.description ?? '')}</div>
      </div>
    );
  }

  // Generic fallback.
  return (
    <details className="text-xs text-ink-3">
      <summary className="mono-eyebrow cursor-pointer">{name} result</summary>
      <pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(output, null, 2)}</pre>
    </details>
  );
}

export function ChatToolCard({ part }: ChatToolCardProps) {
  const name = toolName(part.type);
  let body: React.ReactNode = null;
  if (part.state === 'input-streaming') body = renderInputStreaming(name);
  else if (part.state === 'input-available') body = renderInputAvailable(name);
  else if (part.state === 'output-error') body = renderOutputError(name, part.errorText);
  else if (part.state === 'output-available') body = renderOutput(name, part.output);

  return (
    <div className="border-rule border bg-paper p-3">
      <div className="mono-eyebrow mb-2 text-ink-3">tool · {name}</div>
      {body}
    </div>
  );
}
