ALTER TABLE "brand_kit" ADD COLUMN "reference_asset_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_kit" ADD COLUMN "allows_humans" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_kit" ADD COLUMN "quality_gate_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion" ADD COLUMN "cost_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "source_ingestion_id" uuid;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_source_ingestion_id_ingestion_id_fk" FOREIGN KEY ("source_ingestion_id") REFERENCES "public"."ingestion"("id") ON DELETE set null ON UPDATE no action;