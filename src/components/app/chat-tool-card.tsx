'use client';

/**
 * ChatToolCard — Phase 07b 4-state editorial lifecycle.
 *
 *   thinking (input-streaming)  → ◐ glyph rotates 360° over 1.4s
 *   skeleton (input-available)  → shimmer sweep across the panel
 *   critic   (still pending,
 *             named via input-
 *             available + a
 *             critic-hint)      → amber ✦ pulse 1.2s
 *   reveal   (output-available) → image fades in + scales 0.97→1,
 *                                  chips stagger-enter 60ms each
 *
 * Card height transitions over the slow motion duration between
 * states so the panel doesn't jump.
 *
 * NOTE: the AI SDK v6 state machine has 3 active states
 * (input-streaming / input-available / output-available). We map
 * input-available → skeleton OR critic by checking whether the
 * tool name corresponds to an image-gen path (longer wait, critic
 * grades) vs a fast inline call (short wait, no grade). This is a
 * UX heuristic, not a state semantics change.
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

const IMAGE_GEN_TOOLS = new Set(['generateImage', 'regenerateAsset', 'iterateImageCopy']);

function isCritiqueablePending(name: string): boolean {
  // Image gen tools spend most of their pending time on critic + retry
  // loops, so we render the amber critic glyph instead of generic
  // skeleton shimmer.
  return IMAGE_GEN_TOOLS.has(name);
}

function renderInputStreaming() {
  return (
    <div className="flex items-center gap-2" style={{ color: 'var(--emma-ink-65)' }}>
      <span className="emma-tool-glyph is-thinking">◐</span>
      <span style={{ fontFamily: 'var(--emma-font-mono)', fontSize: 10, letterSpacing: '0.08em' }}>
        thinking…
      </span>
    </div>
  );
}

function renderInputAvailable(name: string) {
  if (isCritiqueablePending(name)) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--emma-amber)' }}>
          <span className="emma-tool-glyph is-critic">✦</span>
          <span
            style={{ fontFamily: 'var(--emma-font-mono)', fontSize: 10, letterSpacing: '0.08em' }}
          >
            critic running
          </span>
        </div>
        <div className="emma-tool-skeleton" />
      </div>
    );
  }
  return <div className="emma-tool-skeleton" />;
}

function renderOutputError(name: string, error?: string) {
  return (
    <div style={{ color: 'var(--emma-amber)' }}>
      <div style={{ fontFamily: 'var(--emma-font-mono)', fontSize: 10, letterSpacing: '0.08em' }}>
        {name} · error
      </div>
      <div style={{ marginTop: 4, color: 'var(--emma-ink)' }}>{error ?? 'unknown error'}</div>
    </div>
  );
}

function renderOutput(name: string, output: unknown) {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;

  if (name === 'generateImage' || name === 'regenerateAsset') {
    const urls = (o.assetUrls as string[] | undefined) ?? [];
    if (urls.length === 0 && o.error) {
      return <div style={{ color: 'var(--emma-amber)' }}>{String(o.error)}</div>;
    }
    return (
      <div className="emma-tool-reveal">
        {urls.map((u) => (
          <a key={u} href={u} target="_blank" rel="noreferrer" className="block">
            {/* biome-ignore lint/a11y/useAltText: inline conversational preview */}
            <img src={u} alt="" />
          </a>
        ))}
        <div className="emma-tool-chips" style={{ marginTop: 12 }}>
          <button type="button">mejorar</button>
          <button type="button">variante</button>
          <button type="button">guardar</button>
        </div>
      </div>
    );
  }

  if (name === 'writeCopy') {
    const text = (o.text as string | undefined) ?? '';
    return (
      <div>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--emma-font-body)',
            fontSize: 'var(--emma-body-size)',
            color: 'var(--emma-ink)',
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          {text}
        </pre>
        <div className="emma-tool-chips" style={{ marginTop: 12 }}>
          <button type="button">mejorar</button>
          <button type="button">variante</button>
          <button type="button">guardar</button>
        </div>
      </div>
    );
  }

  if (name === 'searchAssets') {
    const results = (o.results as Array<Record<string, unknown>> | undefined) ?? [];
    if (results.length === 0) {
      return <div style={{ color: 'var(--emma-ink-65)' }}>no matches</div>;
    }
    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {results.map((r, i) => (
          <li
            key={String(r.generationId ?? i)}
            style={{
              borderBottom: '0.5px solid var(--emma-ink-12)',
              padding: '8px 0',
              fontSize: 'var(--emma-body-size)',
              color: 'var(--emma-ink)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--emma-font-mono)',
                fontSize: 9,
                letterSpacing: '0.08em',
                color: 'var(--emma-ink-65)',
                marginRight: 6,
              }}
            >
              {String(r.kind ?? 'asset')}
            </span>
            {String(r.idea ?? '')}
          </li>
        ))}
      </ul>
    );
  }

  if (name === 'ingestUploadedFile') {
    return (
      <div style={{ color: 'var(--emma-ink)', fontSize: 'var(--emma-body-size)' }}>
        {String(o.summary ?? '')}
      </div>
    );
  }

  if (name === 'describeImage') {
    return (
      <div style={{ color: 'var(--emma-ink)', fontSize: 'var(--emma-body-size)' }}>
        {String(o.description ?? '')}
      </div>
    );
  }

  if (name === 'saveAsCampaignAsset') {
    if (o.error) return <div style={{ color: 'var(--emma-amber)' }}>{String(o.error)}</div>;
    return (
      <div
        style={{
          fontFamily: 'var(--emma-font-mono)',
          fontSize: 9,
          letterSpacing: '0.08em',
          color: 'var(--emma-ink-65)',
        }}
      >
        saved
      </div>
    );
  }

  // Generic fallback — informational tools (listLayouts, searchBrandKit, etc.)
  // render as a collapsible details block.
  return (
    <details style={{ fontSize: 10, color: 'var(--emma-ink-65)' }}>
      <summary
        style={{
          cursor: 'pointer',
          fontFamily: 'var(--emma-font-mono)',
          letterSpacing: '0.08em',
        }}
      >
        {name}
      </summary>
      <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{JSON.stringify(output, null, 2)}</pre>
    </details>
  );
}

export function ChatToolCard({ part }: ChatToolCardProps) {
  const name = toolName(part.type);
  let body: React.ReactNode = null;
  if (part.state === 'input-streaming') body = renderInputStreaming();
  else if (part.state === 'input-available') body = renderInputAvailable(name);
  else if (part.state === 'output-error') body = renderOutputError(name, part.errorText);
  else if (part.state === 'output-available') body = renderOutput(name, part.output);

  return <div className="emma-tool-card">{body}</div>;
}
