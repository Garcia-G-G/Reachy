ALTER TABLE "campaign_asset" ADD COLUMN "critic_score" numeric(3, 1);--> statement-breakpoint
ALTER TABLE "campaign_asset" ADD COLUMN "critic_issues" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_asset" ADD COLUMN "retries_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_asset" ADD COLUMN "critic_cost_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_asset" ADD COLUMN "status_detail" text;