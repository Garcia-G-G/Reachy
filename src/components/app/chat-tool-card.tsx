'use client';

import { ChatToolActionChips } from './chat-tool-action-chips';

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
  // Phase 07e — the AI SDK v6 ToolUIPart actually emits FIVE states.
  // The Phase 07b component was only handling four, so when the
  // model produced 'output-denied' (or any unfamiliar value while
  // streaming) the card body collapsed to null and the user saw an
  // empty cream rectangle. The default fallback below also catches
  // any future state name we haven't taught the renderer about yet.
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error'
    | 'output-denied';
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
    const generationId = typeof o.generationId === 'string' ? o.generationId : null;
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
        {generationId ? <ChatToolActionChips generationId={generationId} /> : null}
      </div>
    );
  }

  if (name === 'writeCopy') {
    const text = (o.text as string | undefined) ?? '';
    // writeCopy does not return a generationId today — the chip row
    // requires one for the server actions to load the row. We omit
    // the chips on copy outputs to avoid showing dead buttons; a
    // future refactor could thread a copyGenerationId through.
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

function renderOutputDenied(name: string) {
  return (
    <div style={{ color: 'var(--emma-ink-65)' }}>
      <div style={{ fontFamily: 'var(--emma-font-mono)', fontSize: 10, letterSpacing: '0.08em' }}>
        {name} · declinado
      </div>
    </div>
  );
}

/** Phase 07e fallback — empty cards are the worst UX failure mode
 *  because they read as a broken render. ALWAYS render visible
 *  content; if state is unknown, show a thinking marker. */
function renderUnknown() {
  return (
    <div className="flex items-center gap-2" style={{ color: 'var(--emma-ink-65)' }}>
      <span className="emma-tool-glyph is-thinking">◐</span>
      <span style={{ fontFamily: 'var(--emma-font-mono)', fontSize: 10, letterSpacing: '0.08em' }}>
        pensando…
      </span>
    </div>
  );
}

export function ChatToolCard({ part }: ChatToolCardProps) {
  const name = toolName(part.type);
  let body: React.ReactNode;
  switch (part.state) {
    case 'input-streaming':
      body = renderInputStreaming();
      break;
    case 'input-available':
      body = renderInputAvailable(name);
      break;
    case 'output-error':
      body = renderOutputError(name, part.errorText);
      break;
    case 'output-denied':
      body = renderOutputDenied(name);
      break;
    case 'output-available':
      body = renderOutput(name, part.output);
      // Even the "happy path" output renderer can return null when
      // the result shape didn't match any known tool. Fall through
      // to the thinking glyph so the card is never empty.
      if (body === null || body === undefined) body = renderUnknown();
      break;
    default:
      body = renderUnknown();
  }

  return <div className="emma-tool-card">{body}</div>;
}
