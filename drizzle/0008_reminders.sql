CREATE TABLE IF NOT EXISTS "reminder_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" "media_type" NOT NULL,
	"title" text NOT NULL,
	"year" integer,
	"poster_path" text,
	"trailer_url" text,
	"instance_id" uuid,
	"added_to_arr" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminder_items" ADD CONSTRAINT "reminder_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_items" ADD CONSTRAINT "reminder_items_instance_id_integration_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."integration_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reminder_unique_idx" ON "reminder_items" USING btree ("user_id","tmdb_id","media_type");
