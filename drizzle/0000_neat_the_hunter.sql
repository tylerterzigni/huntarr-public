CREATE TYPE "public"."ai_provider" AS ENUM('openrouter', 'openai', 'anthropic', 'ollama');--> statement-breakpoint
CREATE TYPE "public"."hide_scope" AS ENUM('global', 'user');--> statement-breakpoint
CREATE TYPE "public"."integration_type" AS ENUM('radarr', 'sonarr', 'plex', 'tautulli');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('movie', 'tv');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "ai_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"name" text NOT NULL,
	"encrypted_api_key" text,
	"base_url" text,
	"model" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arr_requests_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" "media_type" NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"external_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"criteria_snapshot" jsonb DEFAULT '{}'::jsonb,
	"messages" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"encrypted_value" text,
	"plain_value" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "hide_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" "media_type" NOT NULL,
	"scope" "hide_scope" NOT NULL,
	"user_id" uuid,
	"title" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "integration_type" NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plex_library_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" "media_type" NOT NULL,
	"title" text NOT NULL,
	"in_library" boolean DEFAULT true NOT NULL,
	"availability_state" text DEFAULT 'available',
	"plex_guid" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cache_key" text NOT NULL,
	"data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"genres" jsonb DEFAULT '{}'::jsonb,
	"actors" jsonb DEFAULT '{}'::jsonb,
	"directors" jsonb DEFAULT '{}'::jsonb,
	"decades" jsonb DEFAULT '{}'::jsonb,
	"avg_rating" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "tmdb_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" text NOT NULL,
	"data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tmdb_cache_cache_key_unique" UNIQUE("cache_key")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tautulli_usernames" jsonb DEFAULT '[]'::jsonb,
	"recommendation_weights" jsonb DEFAULT '{}'::jsonb,
	"chat_criteria" jsonb DEFAULT '{}'::jsonb,
	"filter_defaults" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "watch_history_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tautulli_username" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" "media_type" NOT NULL,
	"title" text NOT NULL,
	"watched_at" timestamp with time zone,
	"play_count" integer DEFAULT 1 NOT NULL,
	"rating_key" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arr_requests_log" ADD CONSTRAINT "arr_requests_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arr_requests_log" ADD CONSTRAINT "arr_requests_log_instance_id_integration_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."integration_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hide_list_items" ADD CONSTRAINT "hide_list_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_cache" ADD CONSTRAINT "recommendation_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_profiles" ADD CONSTRAINT "recommendation_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hide_list_unique_idx" ON "hide_list_items" USING btree ("tmdb_id","media_type","scope","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_type_name_idx" ON "integration_instances" USING btree ("type","name");--> statement-breakpoint
CREATE UNIQUE INDEX "plex_library_unique_idx" ON "plex_library_cache" USING btree ("tmdb_id","media_type");--> statement-breakpoint
CREATE UNIQUE INDEX "watch_history_unique_idx" ON "watch_history_cache" USING btree ("tautulli_username","tmdb_id","media_type");