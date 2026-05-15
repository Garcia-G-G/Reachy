CREATE TABLE "campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"ingestion_id" uuid,
	"status" text NOT NULL,
	"brief" jsonb,
	"plan" jsonb,
	"cost_cents_estimated" integer DEFAULT 0 NOT NULL,
	"cost_cents_actual" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_ingestion_id_ingestion_id_fk" FOREIGN KEY ("ingestion_id") REFERENCES "public"."ingestion"("id") ON DELETE set null ON UPDATE no action;