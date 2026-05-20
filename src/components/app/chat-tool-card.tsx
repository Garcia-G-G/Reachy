'use client';

import { useTranslations } from 'next-intl';
import { ChatToolActionChips } from './chat-tool-action-chips';

/**
 * ChatToolCard — Phase 07g compact layout.
 *
 *   thinking   (input-streaming) → 40px row · ◐ + label
 *   running    (input-available) → 40px row · ✦|◐ + label (amber for image-gen)
 *   error      (output-error)    → 40px row · label · message
 *   denied     (output-denied)   → 40px row · label
 *   done       (output-available)→ expanded · per-tool body + chips
 *
 * Pre-result heights live in --emma-tool-card-compact-h (40px) so a
 * row of pending calls doesn't dominate the chat surface. The done
 * state expands naturally to the image / copy block.
 */

interface ToolPart {
  type: string;
  toolCallId: string;
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
  return IMAGE_GEN_TOOLS.has(name);
}

function useShortLabel() {
  const t = useTranslations('Emma');
  return (name: string, state: ToolPart['state']): string => {
    if (state === 'input-streaming') {
      if (IMAGE_GEN_TOOLS.has(name)) return t('toolPreparingImage');
      if (name === 'writeCopy') return t('toolPreparingCopy');
      return t('toolPreparingOther', { name });
    }
    if (state === 'input-available') {
      if (IMAGE_GEN_TOOLS.has(name)) return t('toolGeneratingImage');
      if (name === 'writeCopy') return t('toolWritingCopy');
      if (name === 'ingestUploadedFile') return t('toolReadingFile');
      if (name === 'describeImage') return t('toolLookingImage');
      return t('toolRunningOther', { name });
    }
    if (state === 'output-error') return t('toolError', { name });
    if (state === 'output-denied') return t('toolDenied', { name });
    return name;
  };
}

function renderCompactRow(args: {
  glyph: '◐' | '✦' | '×' | '!' | '✓';
  glyphIs: 'thinking' | 'critic' | 'static';
  label: string;
  tone: 'ink' | 'amber';
  detail?: string;
}) {
  const glyphClass =
    args.glyphIs === 'thinking'
      ? 'emma-tool-glyph is-thinking'
      : args.glyphIs === 'critic'
        ? 'emma-tool-glyph is-critic'
        : 'emma-tool-glyph';
  return (
    <div
      className="emma-tool-card-compact"
      style={{ color: args.tone === 'amber' ? 'var(--emma-amber)' : 'var(--emma-ink-65)' }}
    >
      <span className={glyphClass} aria-hidden="true">
        {args.glyph}
      </span>
      <span className="emma-tool-card-compact-label">{args.label}</span>
      {args.detail ? <span className="emma-tool-card-compact-detail">{args.detail}</span> : null}
    </div>
  );
}

function useStateRenderers() {
  const shortLabel = useShortLabel();
  return {
    inputStreaming(name: string) {
      return renderCompactRow({
        glyph: '◐',
        glyphIs: 'thinking',
        label: shortLabel(name, 'input-streaming'),
        tone: 'ink',
      });
    },
    inputAvailable(name: string) {
      if (isCritiqueablePending(name)) {
        return renderCompactRow({
          glyph: '✦',
          glyphIs: 'critic',
          label: shortLabel(name, 'input-available'),
          tone: 'amber',
        });
      }
      return renderCompactRow({
        glyph: '◐',
        glyphIs: 'thinking',
        label: shortLabel(name, 'input-available'),
        tone: 'ink',
      });
    },
    outputError(name: string, error?: string) {
      return renderCompactRow({
        glyph: '!',
        glyphIs: 'static',
        label: shortLabel(name, 'output-error'),
        tone: 'amber',
        detail: error?.slice(0, 80),
      });
    },
    outputDenied(name: string) {
      return renderCompactRow({
        glyph: '×',
        glyphIs: 'static',
        label: shortLabel(name, 'output-denied'),
        tone: 'ink',
      });
    },
    unknown(name: string) {
      return renderCompactRow({
        glyph: '◐',
        glyphIs: 'thinking',
        label: shortLabel(name, 'input-streaming'),
        tone: 'ink',
      });
    },
  };
}

/** Per-tool DONE-state body. The card no longer enforces compact
 *  height once we're in output-available — the body sets its own
 *  natural height. */
function useRenderOutput() {
  const renderers = useStateRenderers();
  return function renderOutput(name: string, output: unknown) {
    if (!output || typeof output !== 'object') return null;
    const o = output as Record<string, unknown>;

    if (name === 'generateImage' || name === 'regenerateAsset') {
      const urls = (o.assetUrls as string[] | undefined) ?? [];
      const generationId = typeof o.generationId === 'string' ? o.generationId : null;
      if (urls.length === 0 && o.error) {
        return renderers.outputError(name, String(o.error));
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
        <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(output, null, 2)}
        </pre>
      </details>
    );
  };
}

export function ChatToolCard({ part }: ChatToolCardProps) {
  const name = toolName(part.type);
  const isCompact = part.state !== 'output-available';
  const renderers = useStateRenderers();
  const renderOutput = useRenderOutput();
  let body: React.ReactNode;
  switch (part.state) {
    case 'input-streaming':
      body = renderers.inputStreaming(name);
      break;
    case 'input-available':
      body = renderers.inputAvailable(name);
      break;
    case 'output-error':
      body = renderers.outputError(name, part.errorText);
      break;
    case 'output-denied':
      body = renderers.outputDenied(name);
      break;
    case 'output-available':
      body = renderOutput(name, part.output);
      if (body === null || body === undefined) body = renderers.unknown(name);
      break;
    default:
      body = renderers.unknown(name);
  }

  return (
    <div
      className={`emma-tool-card ${isCompact ? 'emma-tool-card-compact-wrap' : ''}`}
      data-tool-cell
      data-tool-name={name}
      data-tool-state={part.state}
    >
      {body}
    </div>
  );
}
