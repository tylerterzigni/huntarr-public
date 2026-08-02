ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "recommendation_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;
