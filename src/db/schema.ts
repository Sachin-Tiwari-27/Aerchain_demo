export const schemaSql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS rfxs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  currency TEXT NOT NULL DEFAULT 'INR',
  max_lead_time_days INTEGER,
  max_vendor_share NUMERIC,
  minimum_awarded_vendors INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfx_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES rfxs(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  description TEXT,
  ply INTEGER,
  gsm INTEGER,
  bursting_strength NUMERIC,
  bursting_strength_unit TEXT,
  length_mm INTEGER,
  width_mm INTEGER,
  height_mm INTEGER,
  annual_quantity NUMERIC,
  unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfx_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES rfxs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  value JSONB,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  source TEXT,
  confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfx_questionnaire (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES rfxs(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  question TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT false,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES rfxs(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT,
  storage_path TEXT,
  processing_status TEXT NOT NULL DEFAULT 'UPLOADED',
  extracted_text TEXT,
  metadata JSONB,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vendor_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES rfxs(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  document_id UUID REFERENCES vendor_documents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'UPLOADED',
  raw_extraction JSONB,
  extraction_confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES rfxs(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  vendor_response_id UUID REFERENCES vendor_responses(id) ON DELETE SET NULL,
  line_item_id UUID NOT NULL REFERENCES rfx_line_items(id) ON DELETE CASCADE,
  raw_price NUMERIC,
  raw_unit TEXT,
  raw_currency TEXT,
  normalized_price NUMERIC,
  normalized_unit TEXT,
  normalized_currency TEXT,
  moq NUMERIC,
  moq_unit TEXT,
  conversion_method TEXT,
  conversion_rate NUMERIC,
  conversion_basis TEXT,
  mapping_status TEXT NOT NULL DEFAULT 'UNMAPPED',
  validation_status TEXT NOT NULL DEFAULT 'REVIEW',
  failure_reason TEXT,
  confidence NUMERIC,
  source_document_id UUID REFERENCES vendor_documents(id) ON DELETE SET NULL,
  source_reference TEXT,
  conditions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questionnaire_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES rfxs(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES rfx_questionnaire(id) ON DELETE CASCADE,
  answer TEXT,
  status TEXT NOT NULL DEFAULT 'ANSWERED',
  confidence NUMERIC,
  source_document_id UUID REFERENCES vendor_documents(id) ON DELETE SET NULL,
  source_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES rfxs(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL,
  inputs JSONB,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS current_contract_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES rfxs(id) ON DELETE CASCADE,
  line_item_id UUID NOT NULL REFERENCES rfx_line_items(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rfx_line_items_rfx_id ON rfx_line_items(rfx_id);
CREATE INDEX IF NOT EXISTS idx_rfx_questionnaire_rfx_id ON rfx_questionnaire(rfx_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor_id ON vendor_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_responses_vendor_id ON vendor_responses(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_quotes_line_item_id ON vendor_quotes(line_item_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_answers_vendor_id ON questionnaire_answers(vendor_id);
CREATE INDEX IF NOT EXISTS idx_current_contract_prices_line_item_id ON current_contract_prices(line_item_id);
`;
