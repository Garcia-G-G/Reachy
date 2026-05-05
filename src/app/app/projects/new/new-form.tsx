'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createProject } from '@/server/actions/projects';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export function NewProjectForm() {
  const t = useTranslations('Projects');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);
  const [description, setDescription] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugDirty ? slug : slugify(name);

  function onNameChange(value: string) {
    setName(value);
    if (!slugDirty) setSlug(slugify(value));
  }

  function onSlugChange(value: string) {
    setSlug(value);
    setSlugDirty(true);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createProject({
        name: name.trim(),
        slug: effectiveSlug,
        description: description.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        audience: audience.trim() || undefined,
        tone: tone.trim() || undefined,
      });

      if (!result.ok) {
        const msg =
          result.error === 'slug-taken'
            ? t('errorSlugTaken')
            : result.error === 'unauthenticated'
              ? tCommon('errorGeneric')
              : t('errorValidation');
        setError(msg);
        toast.error(msg);
        return;
      }

      toast.success(t('createdToast'));
      router.push(`/app/projects/${result.data.slug}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-10" noValidate>
      <Field label={t('fieldName')} htmlFor="proj-name">
        <input
          id="proj-name"
          type="text"
          required
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          disabled={pending}
          placeholder={t('fieldNamePlaceholder')}
          className="field placeholder:text-ink-3"
          autoComplete="off"
          maxLength={60}
        />
      </Field>

      <Field label={t('fieldSlug')} htmlFor="proj-slug" hint={t('fieldSlugHint')}>
        <input
          id="proj-slug"
          type="text"
          required
          value={effectiveSlug}
          onChange={(e) => onSlugChange(e.target.value)}
          disabled={pending}
          className="field font-mono text-[13px] placeholder:text-ink-3"
          autoComplete="off"
          maxLength={60}
          spellCheck={false}
        />
      </Field>

      <Field label={t('fieldDescription')} htmlFor="proj-description">
        <textarea
          id="proj-description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={pending}
          placeholder={t('fieldDescriptionPlaceholder')}
          className="field resize-none placeholder:text-ink-3"
          maxLength={280}
        />
      </Field>

      <Field label={t('fieldWebsite')} htmlFor="proj-url">
        <input
          id="proj-url"
          type="url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          disabled={pending}
          placeholder={t('fieldWebsitePlaceholder')}
          className="field placeholder:text-ink-3"
          autoComplete="off"
          inputMode="url"
        />
      </Field>

      <Field label={t('fieldAudience')} htmlFor="proj-audience">
        <input
          id="proj-audience"
          type="text"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          disabled={pending}
          placeholder={t('fieldAudiencePlaceholder')}
          className="field placeholder:text-ink-3"
          maxLength={200}
        />
      </Field>

      <Field label={t('fieldTone')} htmlFor="proj-tone">
        <input
          id="proj-tone"
          type="text"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          disabled={pending}
          placeholder={t('fieldTonePlaceholder')}
          className="field placeholder:text-ink-3"
          maxLength={200}
        />
      </Field>

      {error && (
        <p role="alert" className="border-t border-accent pt-6 text-sm text-accent">
          {error}
        </p>
      )}

      <div className="pt-4">
        <button
          type="submit"
          disabled={pending || name.trim().length < 2 || effectiveSlug.length < 2}
          className="btn-ink w-full disabled:opacity-50 sm:w-auto"
        >
          {pending ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mono-eyebrow mb-3 block">
        {label}
      </label>
      {children}
      {hint && <p className="mono-eyebrow mt-2 text-ink-3 normal-case tracking-normal">{hint}</p>}
    </div>
  );
}
