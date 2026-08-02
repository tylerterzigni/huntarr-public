ALTER TABLE "ai_provider_configs" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "ai_provider_configs" SET "user_id" = (
  SELECT "id" FROM "users"
  ORDER BY CASE WHEN "role" = 'admin' THEN 0 ELSE 1 END, "created_at" ASC
  LIMIT 1
) WHERE "user_id" IS NULL;--> statement-breakpoint
DELETE FROM "ai_provider_configs" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "ai_provider_configs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_provider_configs_user_id_idx" ON "ai_provider_configs" USING btree ("user_id");
