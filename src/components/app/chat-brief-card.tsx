'use client';

import { useState } from 'react';

/**
 * ChatBriefCard — Phase 07i.
 *
 * Renders the output of Emma's composeBrief tool as a copy-paste-
 * ready block. The brief text sits in a monospace-leaning code
 * surface so Garcia sees it as a discrete artifact (not just
 * Emma's prose), and the chip row gives him the two actions he
 * needs: copy to clipboard + open the right Generate page.
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ BRIEF · imagen LinkedIn                        │
 *   │ Pegalo en Generate → Image, campo Idea         │
 *   │ ────────────────────────────────────────────── │
 *   │ {composed brief, multi-line, human voice}      │
 *   │ ────────────────────────────────────────────── │
 *   │ [copiar]  [ir a Generate]                      │
 *   └────────────────────────────────────────────────┘
 */

interface ChatBriefCardProps {
  brief: string;
  channel: string;
  path: string;
  field: string;
  pageLabel: string;
  language: 'en' | 'es';
  /** Optional — when set, clicking [ir a Generate] calls this with
   *  the resolved path. Defaults to a Next router push via the
   *  consumer's wrapper. */
  onNavigate?: (path: string) => void;
}

export function ChatBriefCard(props: ChatBriefCardProps) {
  const [copied, setCopied] = useState(false);
  const isEs = props.language === 'es';

  const labels = {
    eyebrow: isEs ? `Brief · ${props.channel}` : `Brief · ${props.channel}`,
    pasteHint: isEs
      ? `Pegalo en ${props.pageLabel}, campo ${props.field}.`
      : `Paste it into ${props.pageLabel}, field ${props.field}.`,
    copyIdle: isEs ? 'copiar' : 'copy',
    copyDone: isEs ? 'copiado ✓' : 'copied ✓',
    navigate: isEs ? `ir a ${props.pageLabel}` : `go to ${props.pageLabel}`,
  };

  const handleCopy = () => {
    try {
      void navigator.clipboard.writeText(props.brief);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — text is on screen
    }
  };

  const handleNavigate = () => {
    if (props.onNavigate) {
      props.onNavigate(props.path);
      return;
    }
    window.location.href = props.path;
  };

  return (
    <div className="emma-brief-card">
      <div className="emma-brief-card-eyebrow">{labels.eyebrow}</div>
      <div className="emma-brief-card-hint">{labels.pasteHint}</div>
      <pre className="emma-brief-card-body">{props.brief}</pre>
      <div className="emma-brief-card-chips">
        <button type="button" onClick={handleCopy}>
          {copied ? labels.copyDone : labels.copyIdle}
        </button>
        <button type="button" onClick={handleNavigate}>
          {labels.navigate}
        </button>
      </div>
    </div>
  );
}
