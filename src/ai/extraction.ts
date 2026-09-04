import { z } from "zod";

import { generateStructured, type DocumentKind, type UseCase } from "@/ai/provider";

const supplierShape = z.union([
  z.string(),
  z.object({
    name: z.string().optional(),
    contact: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
  }).passthrough(),
  z.null(),
]);

const conditionsShape = z.union([
  z.string(),
  z.array(z.string()),
  z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  z.null(),
]);

function flattenConditions(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === "string").join(" | ") || null;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== null && entry !== undefined && entry !== "")
      .map(([key, entry]) => `${key}: ${typeof entry === "string" ? entry : JSON.stringify(entry)}`);
    return entries.length > 0 ? entries.join(" | ") : null;
  }
  return null;
}

function flattenSupplier(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string" && record.name.length > 0) return record.name;
  }
  return "Unknown Vendor";
}

export const vendorQuoteExtractionSchema = z.object({
  vendor: z.string().min(1).optional(),
  vendor_name: z.string().min(1).optional(),
  supplier: supplierShape.optional(),
  lead_time: z.string().nullable().optional(),
  lead_time_days: z.number().nullable().optional(),
  quotes: z.array(
    z.object({
      sku_reference: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      price: z.number().nullable().optional(),
      unit: z.string().nullable().optional(),
      currency: z.string().nullable().optional(),
      moq: z.number().nullable().optional(),
      moq_unit: z.string().nullable().optional(),
      // Specifications explicitly stated by the vendor for this quoted line.
      // Keep these separate from the requested RFx requirements so eligibility
      // can be determined from supplier-provided evidence only.
      ply: z.number().nullable().optional(),
      gsm: z.number().nullable().optional(),
      bursting_strength: z.number().nullable().optional(),
      bursting_strength_unit: z.string().nullable().optional(),
      length_mm: z.number().nullable().optional(),
      width_mm: z.number().nullable().optional(),
      height_mm: z.number().nullable().optional(),
      conditions: conditionsShape.optional(),
      confidence: z.number().min(0).max(1).nullable().optional(),
      confidence_score: z.number().min(0).max(1).nullable().optional(),
      source_reference: z.string().nullable().optional(),
      price_type: z.enum(["explicit", "derived", "ambiguous", "missing"]).optional(),
      price_status: z.enum(["explicit", "derived", "ambiguous", "missing"]).optional(),
    }).passthrough(),
  ),
  questionnaire_answers: z.array(z.any()).default([]),
  commercial_terms: z.array(z.any()).default([]),
  exceptions: z.array(z.any()).default([]),
}).transform((value) => ({
  ...value,
  vendor:
    (value.vendor && value.vendor.length > 0 && value.vendor) ||
    (value.vendor_name && value.vendor_name.length > 0 && value.vendor_name) ||
    flattenSupplier(value.supplier),
  lead_time_days:
    typeof value.lead_time_days === "number"
      ? value.lead_time_days
      : parseLeadTimeString(value.lead_time) ??
        extractLeadTimeFromConditions(value.quotes?.[0]?.conditions) ??
        null,
  quotes: value.quotes.map((quote) => ({
    ...quote,
    conditions: flattenConditions(quote.conditions),
    confidence: quote.confidence ?? quote.confidence_score ?? null,
  })),
}));

function parseLeadTimeString(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function extractLeadTimeFromConditions(conditions: unknown): number | null {
  if (!conditions) return null;
  if (typeof conditions === "string") {
    const match = conditions.match(/(\d+)\s*(?:day|days|weeks?|months?)/i);
    return match ? Number(match[1]) : null;
  }
  if (Array.isArray(conditions)) {
    for (const entry of conditions) {
      const value = extractLeadTimeFromConditions(entry);
      if (value !== null) return value;
    }
    return null;
  }
  if (typeof conditions === "object") {
    const record = conditions as Record<string, unknown>;
    const leadTime = record.lead_time ?? record.leadTime;
    if (typeof leadTime === "string") {
      const match = leadTime.match(/(\d+)/);
      if (match) return Number(match[1]);
    }
    if (typeof leadTime === "number") return leadTime;
  }
  return null;
}

export type VendorQuoteExtraction = z.infer<typeof vendorQuoteExtractionSchema>;

export type ExtractVendorDocumentInput = {
  documentKind: DocumentKind;
  fileName: string;
  mediaType?: string;
  contentText?: string;
  imageBase64?: string;
  prompt?: string;
};

export async function extractVendorDocument(input: ExtractVendorDocumentInput) {
  const useCase: UseCase = input.documentKind === "text-derived" ? "rfx-json" : "image-parse";
  
  const prompt = input.prompt ?? `Extract structured supplier pricing information from the provided document.

CRITICAL REQUIREMENTS:
1. VENDOR NAME: Extract the supplier/vendor name. Must be a non-empty string (e.g., "VENDOR A", "Apex Corrugates").
2. LEAD TIME: Extract the supplier's stated standard lead time in days as lead_time_days. Use null if not stated.
3. QUOTES ARRAY: Extract each quote/line item with these fields:
   - sku_reference: The SKU code or part number from the quote (e.g., "CP-001", "SKU-123"). Required.
   - description: The product description from the quote (e.g., "Small D2C Shipping Box"). Required.
   - price: The unit price as a number (e.g., 8.50). Use null if missing.
   - unit: The unit of measurement (e.g., "piece", "kg", "meter"). Required.
   - currency: The currency code (e.g., "INR", "USD", "EUR"). Required.
   - moq: Minimum order quantity as a number (e.g., 5000). Use null if not stated.
   - ply: The vendor-stated board ply count as a number (e.g., 5). Use null if not stated.
   - gsm: The vendor-stated grammage in GSM as a number (e.g., 180). Use null if not stated.
   - bursting_strength: The vendor-stated bursting strength as a number. Use null if not stated.
   - bursting_strength_unit: The unit accompanying bursting_strength (e.g., "kg/cm2"). Use null if not stated.
   - length_mm, width_mm, height_mm: Vendor-stated dimensions converted to millimetres. Use null for each dimension not stated.

Rules for extraction:
- Return a single JSON object at the top level. Do not return an array.
- The object must contain exactly these keys: vendor, lead_time_days, quotes, questionnaire_answers, commercial_terms, exceptions.
- Distinguish explicit, derived, ambiguous, and missing prices.
- Keep only seller-supplied values; do not invent SKU codes or descriptions.
- If any required field is missing, use null and record the reason in exceptions.
- For SKU references, keep the supplier's exact wording (do not normalize or abbreviate).
- Use empty arrays for missing questionnaire/commercial terms, not null.

DOCUMENT CONTENT:
${input.contentText || (input.imageBase64 ? "The document is attached as binary media. Inspect it directly." : "(no content provided)")}`;

  const result = await generateStructured({
    schema: vendorQuoteExtractionSchema,
    prompt,
    documentKind: input.documentKind,
    useCase,
    media: input.imageBase64 && input.mediaType
      ? { mimeType: input.mediaType, data: input.imageBase64 }
      : undefined,
  });

  // Fallback: if vendor is null or empty, try to extract from document content
  if (!result.data.vendor && input.contentText) {
    const vendorMatch = input.contentText.match(/(?:vendor|supplier|company)[\s:]+([A-Za-z0-9\s\-&]+)/i)
      || input.contentText.match(/^([A-Za-z][A-Za-z0-9\s\-&]{2,})/);
    if (vendorMatch?.[1]) {
      result.data.vendor = vendorMatch[1].trim();
    } else {
      result.data.vendor = "Unknown Vendor";
    }
  }

  return {
    ...result,
    rawExtraction: result.data,
  };
}
