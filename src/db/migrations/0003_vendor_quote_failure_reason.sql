-- Captures the deterministic reason a quote line cannot be used in eligibility
-- checks, comparison, savings, or award calculations.
ALTER TABLE vendor_quotes
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;
