ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "home_row_hidden" jsonb DEFAULT '[]'::jsonb;
