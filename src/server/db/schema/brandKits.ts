import { relations } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { project } from './projects';

export type BrandVoice = {
  tone: string;
  doSay: string[];
  dontSay: string[];
};

export type BrandLanguage = 'en' | 'es';

/**
 * Visual style keys must match VISUAL_STYLE_KEYS in src/server/ai/visualStyles.ts.
 * We don't use a Drizzle pgEnum here so the enum can be extended without a
 * migration that touches every brand_kit row.
 */
export type BrandVisualStyle =
  | 'editorial'
  | 'paper-cutout'
  | 'flat-2d'
  | 'infographic'
  | 'isometric'
  | 'abstract';

export const brandKit = pgTable(
  'brand_kit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    primaryColor: text('primary_color'),
    secondaryColor: text('secondary_color'),
    accentColor: text('accent_color'),
    bgColor: text('bg_color'),
    fontHeading: text('font_heading'),
    fontBody: text('font_body'),
    logoUrl: text('logo_url'),
    voice: jsonb('voice').$type<BrandVoice>(),
    keywords: jsonb('keywords').$type<string[]>().default([]),
    languages: jsonb('languages').$type<BrandLanguage[]>().default(['en']).notNull(),
    /**
     * Drives reel and image generation aesthetic. Defaults to 'editorial'
     * (matches the Reachy landing). See src/server/ai/visualStyles.ts for the
     * prompt fragment each value injects.
     */
    visualStyle: text('visual_style').$type<BrandVisualStyle>().default('editorial').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex('brand_kit_project_id_uniq').on(table.projectId)],
);

export const brandKitRelations = relations(brandKit, ({ one }) => ({
  project: one(project, { fields: [brandKit.projectId], references: [project.id] }),
}));
