import { and, asc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  type EditorAsset,
  type EditorComposeState,
  GenerationEditor,
} from '@/components/app/generation-editor';
import type { VisualStyleKey } from '@/lib/visual-styles-meta';
import { getBrandKitForProject } from '@/server/actions/brandKits';
import { getProjectBySlug } from '@/server/actions/projects';
import { db } from '@/server/db/client';
import { asset } from '@/server/db/schema/assets';
import { generation } from '@/server/db/schema/generations';
import { getSession } from '@/server/getSession';

interface EditorPageProps {
  params: Promise<{ slug: string; generationId: string }>;
}

export async function generateMetadata({ params }: EditorPageProps): Promise<Metadata> {
  const { generationId } = await params;
  return { title: `Editor — Generation ${generationId.slice(0, 8)}` };
}

export default async function GenerationEditorPage({ params }: EditorPageProps) {
  const session = await getSession();
  if (!session) notFound();

  const { slug, generationId } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  // Load the generation — ownership enforced via the project join above
  // (getProjectBySlug filters by session user).
  const [gen] = await db
    .select()
    .from(generation)
    .where(and(eq(generation.id, generationId), eq(generation.projectId, project.id)))
    .limit(1);
  if (!gen) notFound();

  const assets = await db
    .select()
    .from(asset)
    .where(eq(asset.generationId, gen.id))
    .orderBy(asc(asset.createdAt));

  const params2 = (gen.params ?? {}) as {
    composeState?: EditorComposeState;
    costBreakdown?: { cents: number; parts?: Record<string, number | undefined> };
  };

  const bundle = await getBrandKitForProject(project.id);

  return (
    <GenerationEditor
      slug={slug}
      generationId={gen.id}
      projectId={project.id}
      projectName={project.name}
      status={gen.status as 'queued' | 'running' | 'done' | 'failed'}
      errorMessage={gen.errorMessage}
      costCents={gen.costCents}
      costBreakdown={params2.costBreakdown ?? null}
      format={gen.format}
      model={gen.model}
      composeState={params2.composeState ?? null}
      brandVisualStyle={(bundle?.brandKit?.visualStyle ?? null) as VisualStyleKey | null}
      assets={assets.map<EditorAsset>((a) => ({
        id: a.id,
        publicUrl: a.publicUrl,
        width: a.width,
        height: a.height,
      }))}
    />
  );
}
