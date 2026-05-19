'use client';

/**
 * InlineAssetPreview — Phase 07e.
 *
 * Renders a raw image URL emitted inline in Emma's reply as a real
 * asset card with caption + quick-action chips. Used by the
 * ReactMarkdown overrides in chat-message.tsx when Emma writes
 * something like:
 *
 *   Here's your hero:
 *   https://pub-xxx.r2.dev/.../1.png
 *
 * The card mirrors the tool-card "reveal" state from 07b — same
 * editorial typography, same chip row, same image fade-in.
 *
 * The chips ([mejorar] [variante] [guardar]) are presentational
 * for now; wiring them to regenerateAsset / saveAsCampaignAsset
 * is a follow-up (currently they're rendered as <button> stubs so
 * the affordance is visible).
 */

interface InlineAssetPreviewProps {
  url: string;
  caption?: string;
}

/** Strip query strings + extract the basename from a URL to use as a
 *  fallback caption when the assistant didn't write one. */
function inferCaptionFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.split('/').filter(Boolean);
    return path[path.length - 1] ?? '';
  } catch {
    return '';
  }
}

export function InlineAssetPreview({ url, caption }: InlineAssetPreviewProps) {
  const label = caption?.trim() || inferCaptionFromUrl(url);

  return (
    <figure className="emma-inline-asset">
      {label ? <figcaption className="emma-inline-asset-caption">{label}</figcaption> : null}
      <a href={url} target="_blank" rel="noreferrer" className="emma-inline-asset-link">
        {/* biome-ignore lint/a11y/useAltText: inline conversational preview — caption above + link below */}
        <img src={url} alt="" className="emma-inline-asset-image" />
      </a>
      <div className="emma-tool-chips emma-inline-asset-chips">
        <button type="button">mejorar</button>
        <button type="button">variante</button>
        <button type="button">guardar</button>
      </div>
    </figure>
  );
}
