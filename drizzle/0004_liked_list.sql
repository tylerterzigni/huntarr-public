CREATE TYPE "public"."liked_kind" AS ENUM('movie', 'tv', 'person');--> statement-breakpoint
CREATE TABLE "liked_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tmdb_id" integer NOT NULL,
	"kind" "liked_kind" NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "liked_list_items" ADD CONSTRAINT "liked_list_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "liked_list_unique_idx" ON "liked_list_items" USING btree ("user_id","tmdb_id","kind");
