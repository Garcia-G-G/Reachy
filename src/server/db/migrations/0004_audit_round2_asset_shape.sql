-- Audit round 2 — enforce asset shape at the DB level.
-- Drizzle-kit doesn't generate CHECK constraints from schema yet
-- (https://github.com/drizzle-team/drizzle-orm/issues/3520), so this is
-- hand-authored. Mirror in src/server/db/schema/assets.ts as a comment.

ALTER TABLE "asset"
  ADD CONSTRAINT "asset_kind_shape" CHECK (
    (kind = 'image' AND storage_key IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL)
    OR (kind = 'video' AND storage_key IS NOT NULL AND duration_sec IS NOT NULL)
    OR (kind = 'copy'  AND text       IS NOT NULL AND language    IS NOT NULL)
  );
