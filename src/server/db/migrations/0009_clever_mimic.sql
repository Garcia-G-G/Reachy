CREATE TABLE "campaign_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"channel" text,
	"generation_id" uuid,
	"copy_output" text,
	"status" text NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"brief_snapshot" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "campaign_asset" ADD CONSTRAINT "campaign_asset_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_asset" ADD CONSTRAINT "campaign_asset_generation_id_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation"("id") ON DELETE set null ON UPDATE no action;