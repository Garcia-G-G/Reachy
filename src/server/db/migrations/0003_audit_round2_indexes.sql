DROP INDEX "generation_status_idx";--> statement-breakpoint
CREATE INDEX "asset_project_created_at_idx" ON "asset" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "generation_project_created_at_idx" ON "generation" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "generation_inflight_idx" ON "generation" USING btree ("status") WHERE "generation"."status" IN ('queued', 'running');