CREATE UNIQUE INDEX "account_provider_account_uniq" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_identifier_value_uniq" ON "verification" USING btree ("identifier","value");