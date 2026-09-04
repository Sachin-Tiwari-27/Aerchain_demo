ALTER TABLE vendor_responses
  ADD COLUMN IF NOT EXISTS qualification_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;