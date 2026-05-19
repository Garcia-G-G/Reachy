import { notFound, redirect } from 'next/navigation';
import { EmmaChat } from '@/components/app/emma-chat';
import { getBrandKitForProject } from '@/server/actions/brandKits';
import { createOrGetThread, getThreadCostCents, getThreadMessages } from '@/server/actions/chat';
import { getProjectBySlug } from '@/server/actions/projects';
import { buildEmmaWelcomeLine } from '@/server/config/chatSystemPrompts';
import { getSession } from '@/server/getSession';

/**
 * Emma chat page — per-project content co-pilot. Phase 07.
 *
 * Server component: loads the project, ensures the user owns it,
 * lazy-creates the thread, fetches history + cost, and hands the
 * client component everything it needs to mount without a flash.
 */
export default async function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const kitLoad = await getBrandKitForProject(project.id);
  if (!kitLoad?.brandKit) {
    // Project has no brand kit yet — Emma needs the kit loaded as
    // context, so we redirect to the identity page first.
    redirect(`/app/projects/${slug}/identity`);
  }
  const brandKit = kitLoad.brandKit;

  const threadResult = await createOrGetThread(project.id);
  if (!threadResult.ok) notFound();
  const thread = threadResult.data;

  const [messagesResult, costResult] = await Promise.all([
    getThreadMessages(thread.id),
    getThreadCostCents(thread.id),
  ]);
  const initialMessages = messagesResult.ok ? messagesResult.data : [];
  const initialCostCents = costResult.ok ? costResult.data : 0;

  const language = (brandKit.languages?.[0] ?? 'en') as 'en' | 'es';
  const welcomeLine = buildEmmaWelcomeLine({
    project,
    brandKit,
    recentAssetCount: 0, // counted server-side later if we want
    language,
  });

  return (
    <EmmaChat
      projectName={project.name}
      projectSlug={project.slug}
      threadId={thread.id}
      welcomeLine={welcomeLine}
      initialMessages={initialMessages}
      initialCostCents={initialCostCents}
      brandSummary={{
        ink: brandKit.primaryColor,
        paper: brandKit.bgColor,
        accent: brandKit.accentColor,
        voiceTone: brandKit.voice?.tone ?? null,
        visualStyle: brandKit.visualStyle ?? null,
      }}
      language={language}
      userDisplayName={session.user.name ?? session.user.email?.split('@')[0] ?? 'there'}
    />
  );
}
