-- Retain the documented evidence used to normalize a vendor quote so buyers
-- can audit price comparisons, especially mass-to-piece conversions.
ALTER TABLE vendor_quotes
  ADD COLUMN IF NOT EXISTS conversion_basis TEXT;
