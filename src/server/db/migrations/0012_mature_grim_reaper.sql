ALTER TABLE "chat_message" ADD COLUMN "is_error_surface" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "openai_request_id" text;