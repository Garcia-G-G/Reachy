CREATE TABLE "ingestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"bundle" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "brand_kit" ALTER COLUMN "visual_style" SET DEFAULT 'editorial-collage';--> statement-breakpoint
ALTER TABLE "ingestion" ADD CONSTRAINT "ingestion_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;