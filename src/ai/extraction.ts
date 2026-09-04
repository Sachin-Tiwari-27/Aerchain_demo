import { z } from "zod";

import { generateStructured, type DocumentKind, type UseCase } from "@/ai/provider";

export const vendorQuoteExtractionSchema = z.object({
  vendor: z.string().min(1),
  quotes: z.array(
    z.object({
      sku_reference: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      price: z.number().nullable().optional(),
      unit: z.string().nullable().optional(),
      currency: z.string().nullable().optional(),
      moq: z.number().nullable().optional(),
      moq_unit: z.string().nullable().optional(),
      conditions: z.string().nullable().optional(),
      confidence: z.number().min(0).max(1).nullable().optional(),
      source_reference: z.string().nullable().optional(),
      price_type: z.enum(["explicit", "derived", "ambiguous", "missing"]).optional(),
    }),
  ),
  questionnaire_answers: z.array(z.any()).default([]),
  commercial_terms: z.array(z.any()).default([]),
  exceptions: z.array(z.any()).default([]),
});

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
2. QUOTES ARRAY: Extract each quote/line item with these fields:
   - sku_reference: The SKU code or part number from the quote (e.g., "CP-001", "SKU-123"). Required.
   - description: The product description from the quote (e.g., "Small D2C Shipping Box"). Required.
   - price: The unit price as a number (e.g., 8.50). Use null if missing.
   - unit: The unit of measurement (e.g., "piece", "kg", "meter"). Required.
   - currency: The currency code (e.g., "INR", "USD", "EUR"). Required.
   - moq: Minimum order quantity as a number (e.g., 5000). Use null if not stated.

Rules for extraction:
- Return a single JSON object at the top level. Do not return an array.
- The object must contain exactly these keys: vendor, quotes, questionnaire_answers, commercial_terms, exceptions.
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
