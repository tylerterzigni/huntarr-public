ALTER TABLE "watch_history_cache" ADD COLUMN IF NOT EXISTS "fully_watched" boolean DEFAULT false NOT NULL;
