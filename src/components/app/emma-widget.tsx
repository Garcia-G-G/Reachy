'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  type EmmaWidgetContextResult,
  getEmmaWidgetContext,
} from '@/server/actions/emmaWidgetContext';
import { isEmmaExcludedRoute, projectSlugFromPath } from '@/server/config/emmaWidget';
import { EmmaBubble } from './emma-bubble';
import { EmmaChat } from './emma-chat';
import { EmmaPanel } from './emma-panel';
import { useEmmaPosition } from './use-emma-position';

/**
 * EmmaWidget — Phase 07h global floating concierge.
 *
 * Mounts at the authenticated app layout. Renders a 56px bubble
 * bottom-right; clicking opens a panel that contains EmmaChat in
 * compact mode loaded against the CURRENT project's chat thread.
 *
 * Skipped on excluded routes (/login, /, /public, /api).
 * Resolves project context from pathname; on non-project routes
 * the panel shows "pick a project to chat".
 *
 * Position + size persist via useEmmaPosition. Esc closes the
 * panel. The bubble + panel can both be dragged.
 */

export function EmmaWidget() {
  const pathname = usePathname() ?? '/';
  const t = useTranslations('Emma');
  const pos = useEmmaPosition();

  const projectSlug = projectSlugFromPath(pathname);
  const skip = isEmmaExcludedRoute(pathname);

  // Load context from the server action whenever the project slug
  // changes. Bubble can show even before context is loaded — only
  // the panel needs the data.
  const [ctx, setCtx] = useState<EmmaWidgetContextResult | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    setLoading(true);
    void getEmmaWidgetContext(projectSlug).then((result) => {
      if (!cancelled) {
        setCtx(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [skip, projectSlug]);

  if (skip || !pos.hydrated) return null;

  // Bubble — collapsed state.
  if (!pos.open) {
    return (
      <EmmaBubble position={pos.bubble} onMove={pos.setBubble} onOpen={() => pos.setOpen(true)} />
    );
  }

  // Expanded panel — needs the loaded context to mount EmmaChat.
  const projectChip =
    ctx?.kind === 'ready' ? (
      <span aria-label={`proyecto activo: ${ctx.projectName}`}>{ctx.projectName}</span>
    ) : null;

  return (
    <EmmaPanel
      position={pos.panelPos}
      size={pos.panelSize}
      onMove={pos.setPanelPos}
      onResize={pos.setPanelSize}
      onClose={() => pos.setOpen(false)}
      contextChip={projectChip}
    >
      {loading || !ctx ? (
        <div className="emma-panel-loading">{t('typing')}</div>
      ) : ctx.kind === 'no-project' ? (
        <div className="emma-panel-message">
          {t('subline', { project: '—' })}
          <div className="emma-panel-message-hint">
            {t('reasoning' /* placeholder copy — see follow-ups */)}
          </div>
        </div>
      ) : ctx.kind === 'no-brand-kit' ? (
        <div className="emma-panel-message">
          <a href={`/app/projects/${ctx.projectSlug}/identity`} className="emma-link">
            → identity
          </a>
        </div>
      ) : ctx.kind === 'unauthenticated' || ctx.kind === 'not-found' ? (
        <div className="emma-panel-message">{t('uploadFailed')}</div>
      ) : (
        <EmmaChat
          projectName={ctx.projectName}
          projectSlug={ctx.projectSlug}
          threadId={ctx.threadId}
          welcomeLine=""
          initialMessages={ctx.initialMessages}
          initialCostCents={0}
          brandKit={ctx.brandKit}
          language={(ctx.brandKit.languages?.[0] ?? 'es') as 'en' | 'es'}
          userDisplayName={ctx.userDisplayName}
          firstName={ctx.firstName}
          compact
          clientContext={{ currentRoute: pathname }}
        />
      )}
    </EmmaPanel>
  );
}
