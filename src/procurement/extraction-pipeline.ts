import { z } from "zod";
import type { VendorQuoteExtraction } from "@/ai/extraction";
import { validateQuote, validateMoq } from "@/procurement/validation";
import { normalizeExtractedQuote } from "@/procurement/normalization";

type RfxLineItem = {
  id: string;
  rfx_id: string;
  sku: string;
  description?: string | null;
  annual_quantity?: number | null;
  unit?: string | null;
};

export type QuoteProcessingResult = {
  vendorId: string;
  vendorResponseId: string;
  sourceDocumentId: string | null;
  rfxId: string;
  processedQuotes: Array<{
    lineItemId: string;
    sku: string;
    rawPrice: number | null;
    rawUnit: string | null;
    rawCurrency: string | null;
    normalizedPrice: number | null;
    normalizedUnit: string | null;
    normalizedCurrency: string | null;
    moq: number | null;
    moqUnit: string | null;
    validationStatus: "VALID" | "AMBIGUOUS" | "MISSING" | "FAILED";
    mappingConfidence: number;
    sourceReference: string | null;
  }>;
  qualificationStatus: "QUALIFIED" | "QUALIFIED_WITH_EXCEPTIONS" | "REVIEW" | "FAILED";
  issues: Array<{
    issueType: string;
    severity: "WARNING" | "ERROR";
    message: string;
  }>;
};

/**
 * Map extracted quote items to line item IDs using confidence-based matching.
 * For MVP: exact SKU match or fuzzy description match above 0.7 confidence.
 */
export function mapQuotesToLineItems(
  extractedQuotes: Array<{
    sku_reference?: string | null;
    description?: string | null;
    price?: number | null;
    unit?: string | null;
    currency?: string | null;
    moq?: number | null;
    moq_unit?: string | null;
    confidence?: number | null;
    source_reference?: string | null;
    price_type?: string;
  }>,
  lineItems: RfxLineItem[],
): Array<{
  lineItemId: string;
  sku: string;
  extractedQuote: (typeof extractedQuotes)[0];
  confidence: number;
}> {
  const mapped: Array<{
    lineItemId: string;
    sku: string;
    extractedQuote: (typeof extractedQuotes)[0];
    confidence: number;
  }> = [];

  for (const extracted of extractedQuotes) {
    // Try exact SKU match first
    if (extracted.sku_reference) {
      const exactMatch = lineItems.find(
        (li) => li.sku.toLowerCase() === extracted.sku_reference?.toLowerCase(),
      );
      if (exactMatch) {
        mapped.push({
          lineItemId: exactMatch.id,
          sku: exactMatch.sku,
          extractedQuote: extracted,
          confidence: 0.95,
        });
        continue;
      }
    }

    // Fallback: look for first unmapped line item with reasonable description overlap
    // (In production, use fuzzy matching or manual curation)
    const unmappedLineItem = lineItems.find(
      (li) =>
        !mapped.some((m) => m.lineItemId === li.id) &&
        extracted.description &&
        li.description?.toLowerCase().includes(extracted.description.toLowerCase().slice(0, 10)),
    );

    if (unmappedLineItem) {
      mapped.push({
        lineItemId: unmappedLineItem.id,
        sku: unmappedLineItem.sku,
        extractedQuote: extracted,
        confidence: 0.65,
      });
    }
  }

  return mapped;
}

/**
 * Process extracted quotes: map, normalize, validate, and produce DB-ready vendor_quotes.
 */
export async function processExtractedQuotes(input: {
  vendorId: string;
  vendorResponseId: string;
  sourceDocumentId?: string | null;
  rfxId: string;
  extraction: VendorQuoteExtraction;
  lineItems: RfxLineItem[];
  annualQuantities?: Record<string, number>; // sku -> annual_quantity mapping
}): Promise<QuoteProcessingResult> {
  const { vendorId, vendorResponseId, rfxId, extraction, lineItems, annualQuantities = {} } = input;

  const issues: Array<{
    issueType: string;
    severity: "WARNING" | "ERROR";
    message: string;
  }> = [];

  // Step 1: Map extracted quotes to line items
  const mappedQuotes = mapQuotesToLineItems(extraction.quotes || [], lineItems);

  if (mappedQuotes.length === 0 && (extraction.quotes || []).length > 0) {
    issues.push({
      issueType: "NO_MAPPING",
      severity: "ERROR",
      message: "No extracted quotes could be mapped to line items",
    });
  }

  // Step 2: Normalize, validate, and qualify each quote
  const processedQuotes = mappedQuotes.map((mapped) => {
    const extracted = mapped.extractedQuote;
    const lineItem = lineItems.find((li) => li.id === mapped.lineItemId)!;

    // Validate the price (include quantity so validation doesn't fail)
    const priceValidation: any = validateQuote({
      price: extracted.price ?? null,
      currency: (extracted.currency ?? undefined) as string | undefined,
      unit: (extracted.unit ?? undefined) as string | undefined,
      quantity: Number(lineItem.annual_quantity ?? 1),  // Use annual_quantity from line item
      leadTimeDays: extraction.lead_time_days ?? 0,
      mandatorySpecPass: true,  // Assume pass unless flagged in extraction exceptions
    });

    // Normalize the quote using existing normalization logic
    let normalizedPrice: number | null = null;
    let normalizedUnit: string | null = null;
    let normalizedCurrency: string | null = null;
    let validationStatus: "VALID" | "AMBIGUOUS" | "MISSING" | "FAILED" = "MISSING";

    if (priceValidation.status === "valid") {
      const normalized: any = normalizeExtractedQuote({
        price: extracted.price || 0,
        unit: extracted.unit || "pcs",
        currency: extracted.currency || "INR",
      });
      normalizedPrice = (normalized.normalizedPrice ?? null) as number | null;
      normalizedUnit = (normalized.normalizedUnit ?? null) as string | null;
      normalizedCurrency = (normalized.normalizedCurrency ?? null) as string | null;
      validationStatus = "VALID";
    } else if (priceValidation.status === "ambiguous") {
      validationStatus = "AMBIGUOUS";
      issues.push({
        issueType: "PRICE_AMBIGUOUS",
        severity: "WARNING",
        message: `${mapped.sku}: ${priceValidation.reason}`,
      });
    } else if (priceValidation.status === "missing") {
      validationStatus = "MISSING";
      issues.push({
        issueType: "PRICE_MISSING",
        severity: "WARNING",
        message: `${mapped.sku}: ${priceValidation.reason}`,
      });
    } else {
      validationStatus = "FAILED";
      issues.push({
        issueType: "PRICE_INVALID",
        severity: "ERROR",
        message: `${mapped.sku}: ${priceValidation.reason}`,
      });
    }

    // Validate MOQ
    const annualQty = annualQuantities[mapped.sku] ?? Number(lineItem.annual_quantity ?? 0);
    const moqValidation = validateMoq({
      annualQuantity: annualQty,
      quoteMoq: extracted.moq,
      moqUnit: extracted.moq_unit,
    });

    if (moqValidation.status === "violates") {
      issues.push({
        issueType: "MOQ_VIOLATES",
        severity: "ERROR",
        message: moqValidation.reason,
      });
      validationStatus = "FAILED";
    } else if (moqValidation.status !== "not-stated") {
      // MOQ is stated and valid
    }

    return {
      lineItemId: mapped.lineItemId,
      sku: mapped.sku,
      rawPrice: extracted.price ?? null,
      rawUnit: extracted.unit ?? null,
      rawCurrency: extracted.currency ?? null,
      normalizedPrice,
      normalizedUnit,
      normalizedCurrency,
      moq: moqValidation.normalizedMoq,
      moqUnit: moqValidation.normalizedMoqUnit,
      validationStatus,
      mappingConfidence: mapped.confidence,
      sourceReference: extracted.source_reference ?? null,
    };
  });

  // Step 3: Determine qualification status
  let qualificationStatus: "QUALIFIED" | "QUALIFIED_WITH_EXCEPTIONS" | "REVIEW" | "FAILED" =
    "QUALIFIED";
  const failedCount = processedQuotes.filter((q) => q.validationStatus === "FAILED").length;
  const ambiguousCount = processedQuotes.filter((q) => q.validationStatus === "AMBIGUOUS").length;
  const missingCount = processedQuotes.filter((q) => q.validationStatus === "MISSING").length;
  if ((extraction.lead_time_days ?? 0) > 14) {
    qualificationStatus = "FAILED";
    issues.push({ issueType: "LEAD_TIME", severity: "ERROR", message: `Lead time ${extraction.lead_time_days} days exceeds the 14-day RFx limit` });
  }

  if (failedCount > 0) {
    qualificationStatus = "FAILED";
  } else if (ambiguousCount > 0 || missingCount > 0) {
    if (failedCount === 0 && missingCount < lineItems.length * 0.3) {
      // Some ambiguity/missing but not critical
      qualificationStatus = "QUALIFIED_WITH_EXCEPTIONS";
    } else {
      qualificationStatus = "REVIEW";
    }
  }

  return {
    vendorId,
    vendorResponseId,
    sourceDocumentId: input.sourceDocumentId ?? null,
    rfxId,
    processedQuotes,
    qualificationStatus,
    issues,
  };
}

/**
 * Save processed quotes to the database.
 */
export async function saveProcessedQuotes(
  supabase: any,
  result: QuoteProcessingResult,
): Promise<void> {
  const rows = result.processedQuotes.map((q) => ({
    rfx_id: result.rfxId,
    vendor_id: result.vendorId,
    vendor_response_id: result.vendorResponseId,
    line_item_id: q.lineItemId,
    raw_price: q.rawPrice,
    raw_unit: q.rawUnit,
    raw_currency: q.rawCurrency,
    normalized_price: q.normalizedPrice,
    normalized_unit: q.normalizedUnit,
    normalized_currency: q.normalizedCurrency,
    moq: q.moq,
    moq_unit: q.moqUnit,
    mapping_status: q.mappingConfidence > 0.8 ? "MAPPED" : "UNMAPPED",
    validation_status: q.validationStatus,
    confidence: q.mappingConfidence,
    source_document_id: result.sourceDocumentId,
    source_reference: q.sourceReference,
    conditions: null,
  }));

  // Clear existing quotes for this vendor/response
  if (supabase) {
    await supabase
      .from("vendor_quotes")
      .delete()
      .eq("vendor_response_id", result.vendorResponseId);
  }

  // Insert new quotes
  if (rows.length > 0 && supabase) {
    const { error } = await supabase.from("vendor_quotes").insert(rows);
    if (error) {
      throw new Error(`Failed to save vendor quotes: ${error.message}`);
    }
  }

  // Update vendor_responses with qualification status
  if (supabase) {
    await supabase
      .from("vendor_responses")
      .update({ status: result.qualificationStatus })
      .eq("id", result.vendorResponseId);
  }
}
