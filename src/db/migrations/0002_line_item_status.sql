-- Adds AI_SUGGESTED / BUYER_CONFIRMED tracking to line items, matching the
-- pattern already used on rfx_requirements. Required for the "talk, don't
-- click" RFx builder flow: items the AI matches from the catalog start as
-- AI_SUGGESTED and only become part of the confirmed scope once the buyer
-- explicitly confirms them.

ALTER TABLE rfx_line_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'AI_SUGGESTED';

-- Backfill: any line items that already exist (e.g. from the seeded demo
-- RFx) are treated as buyer-confirmed since they predate this flow.
UPDATE rfx_line_items SET status = 'BUYER_CONFIRMED' WHERE status = 'AI_SUGGESTED';

CREATE INDEX IF NOT EXISTS idx_rfx_line_items_status ON rfx_line_items(status);