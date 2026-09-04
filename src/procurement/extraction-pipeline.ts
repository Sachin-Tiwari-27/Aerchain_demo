import { z } from "zod";
import type { VendorQuoteExtraction } from "@/ai/extraction";
import { validateQuote, validateMoq } from "@/procurement/validation";
import { normalizeExtractedQuote, parseUnitFactor } from "@/procurement/normalization";

/** Supported currency codes for normalization. */
const KNOWN_CURRENCIES = new Set(["USD", "EUR", "GBP", "INR", "CAD", "JPY"]);

/**
 * Tokenize a string into lowercase words, stripping punctuation.
 * Used for description-based fallback mapping.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

/**
 * Jaccard-style token overlap score between two strings.
 * Returns a value in [0, 1].
 */
function tokenOverlap(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

type RfxLineItem = {
  id: string;
  rfx_id: string;
  sku: string;
  description?: string | null;
  annual_quantity?: number | null;
  unit?: string | null;
  ply?: number | null;
  gsm?: number | null;
  bursting_strength?: number | null;
  bursting_strength_unit?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
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
    conversionMethod: string | null;
    conversionRate: number | null;
    conversionBasis: string | null;
    moq: number | null;
    moqUnit: string | null;
    validationStatus: "VALID" | "AMBIGUOUS" | "MISSING" | "FAILED";
    mappingConfidence: number;
    sourceReference: string | null;
    failureReason: string | null;
  }>;
  qualificationStatus: "QUALIFIED" | "QUALIFIED_WITH_EXCEPTIONS" | "REVIEW" | "FAILED";
  issues: Array<{
    issueType: string;
    severity: "WARNING" | "ERROR";
    message: string;
  }>;
};

type SpecificationValue = number | null | undefined;

type SpecificationValidation = {
  pass: boolean;
  reason: string | null;
};

function formatSpecification(value: number | null | undefined, unit = ""): string {
  return value === null || value === undefined ? "not stated" : `${value}${unit}`;
}

/** Compare only RFx requirements that are populated against vendor-stated quote values. */
function validateMandatorySpecifications(
  sku: string,
  lineItem: RfxLineItem,
  quote: { ply?: SpecificationValue; gsm?: SpecificationValue; bursting_strength?: SpecificationValue; bursting_strength_unit?: string | null; length_mm?: SpecificationValue; width_mm?: SpecificationValue; height_mm?: SpecificationValue },
): SpecificationValidation {
  const mismatches: string[] = [];
  const compareNumber = (label: string, required: SpecificationValue, quoted: SpecificationValue, unit = "") => {
    if (required !== null && required !== undefined && Number(required) !== Number(quoted)) {
      mismatches.push(`${label}: required ${formatSpecification(required, unit)}, quoted ${formatSpecification(quoted, unit)}`);
    }
  };

  compareNumber("ply", lineItem.ply, quote.ply, "-ply");
  compareNumber("GSM", lineItem.gsm, quote.gsm, " GSM");
  const burstingUnit = lineItem.bursting_strength_unit ? ` ${lineItem.bursting_strength_unit}` : "";
  compareNumber("bursting strength", lineItem.bursting_strength, quote.bursting_strength, burstingUnit);
  if (
    lineItem.bursting_strength !== null && lineItem.bursting_strength !== undefined &&
    lineItem.bursting_strength_unit &&
    quote.bursting_strength_unit?.trim().toLowerCase() !== lineItem.bursting_strength_unit.trim().toLowerCase()
  ) {
    mismatches.push(`required bursting strength unit ${lineItem.bursting_strength_unit}, quoted ${quote.bursting_strength_unit ?? "not stated"}`);
  }
  compareNumber("length", lineItem.length_mm, quote.length_mm, " mm");
  compareNumber("width", lineItem.width_mm, quote.width_mm, " mm");
  compareNumber("height", lineItem.height_mm, quote.height_mm, " mm");

  return mismatches.length > 0
    ? { pass: false, reason: `${sku}: ${mismatches.join("; ")}` }
    : { pass: true, reason: null };
}

/**
 * Map extracted quote items to line item IDs using confidence-based matching.
 *
 * Strategy (in priority order):
 * 1. Exact SKU match (case-insensitive)                 → confidence 0.95
 * 2. Token-overlap description match (Jaccard ≥ 0.40)   → confidence 0.60–0.80
 * 3. Single-item RFx auto-assign (last resort)           → confidence 0.50
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
    ply?: number | null;
    gsm?: number | null;
    bursting_strength?: number | null;
    bursting_strength_unit?: string | null;
    length_mm?: number | null;
    width_mm?: number | null;
    height_mm?: number | null;
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
    // 1. Exact SKU match (highest confidence)
    if (extracted.sku_reference) {
      const exactMatch = lineItems.find(
        (li) => li.sku.toLowerCase() === extracted.sku_reference!.toLowerCase(),
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

    // 2. Token-overlap description match
    const unmappedCandidates = lineItems.filter(
      (li) => !mapped.some((m) => m.lineItemId === li.id),
    );

    let bestMatch: RfxLineItem | null = null;
    let bestScore = 0;

    if (extracted.description) {
      for (const li of unmappedCandidates) {
        const liText = [li.description ?? "", li.sku].join(" ");
        const score = tokenOverlap(extracted.description, liText);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = li;
        }
      }
    }

    // Accept description match if Jaccard overlap ≥ 0.40
    if (bestMatch && bestScore >= 0.40) {
      mapped.push({
        lineItemId: bestMatch.id,
        sku: bestMatch.sku,
        extractedQuote: extracted,
        // Scale confidence with overlap score (0.60 at threshold → 0.80 at full match)
        confidence: Math.min(0.80, 0.60 + (bestScore - 0.40) * 1.0),
      });
      continue;
    }

    // 3. Last resort: auto-assign when the RFx has exactly one line item
    //    (vendor sent a single-SKU quote without explicit SKU code)
    if (unmappedCandidates.length === 1) {
      mapped.push({
        lineItemId: unmappedCandidates[0].id,
        sku: unmappedCandidates[0].sku,
        extractedQuote: extracted,
        confidence: 0.50,
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
  rfxCurrency?: string; // Expected currency for the RFx (e.g. "INR")
}): Promise<QuoteProcessingResult> {
  const { vendorId, vendorResponseId, rfxId, extraction, lineItems, annualQuantities = {}, rfxCurrency } = input;

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
    // Guard: annual_quantity may be null/0; fall back to a safe positive minimum
    // so validateQuote never fails with "Quantity must be positive" on metadata gaps.
    const safeQuantity = Math.max(1, Number(lineItem.annual_quantity ?? 1));
    const specificationValidation = validateMandatorySpecifications(mapped.sku, lineItem, extracted);
    const priceValidation: any = validateQuote({
      price: extracted.price ?? null,
      currency: (extracted.currency ?? undefined) as string | undefined,
      unit: (extracted.unit ?? undefined) as string | undefined,
      quantity: safeQuantity,
      leadTimeDays: extraction.lead_time_days ?? 0,
      mandatorySpecPass: specificationValidation.pass,
    });

    // Normalize the quote using existing normalization logic
    let normalizedPrice: number | null = null;
    let normalizedUnit: string | null = null;
    let normalizedCurrency: string | null = null;
    let conversionMethod: string | null = null;
    let conversionRate: number | null = null;
    let conversionBasis: string | null = null;
    let validationStatus: "VALID" | "AMBIGUOUS" | "MISSING" | "FAILED" = "MISSING";
    let failureReason: string | null = null;

    if (priceValidation.status === "valid") {
      // Resolve compound units like "1000 units" or "per kg" into a
      // base unit + factor so the normalized price represents the
      // per-base quantity (e.g. per piece, per kg).
      const unitInfo = parseUnitFactor(extracted.unit);
      const adjustedUnit = unitInfo ? unitInfo.baseUnit : (extracted.unit ?? "pcs");

      const requestedUnitInfo = parseUnitFactor(lineItem.unit);
      const targetUnit = requestedUnitInfo?.baseUnit ?? (lineItem.unit?.trim().toLowerCase() || "pcs");
      const targetCurrency = rfxCurrency?.toUpperCase() || "INR";
      const normalized: any = normalizeExtractedQuote({
        price: extracted.price ?? null,
        unit: adjustedUnit,
        currency: extracted.currency || "INR",
        targetUnit,
        targetCurrency,
        unitFactor: unitInfo?.factor,
      });
      normalizedPrice = (normalized.normalizedPrice ?? null) as number | null;
      normalizedUnit = (normalized.normalizedUnit ?? null) as string | null;
      normalizedCurrency = (normalized.normalizedCurrency ?? null) as string | null;
      conversionMethod = (normalized.conversionMethod ?? null) as string | null;
      conversionRate = (normalized.conversionRate ?? null) as number | null;
      conversionBasis = (normalized.conversionBasis ?? null) as string | null;
      validationStatus = normalized.status === "valid" ? "VALID" : "AMBIGUOUS";
      if (normalized.status !== "valid") {
        issues.push({
          issueType: "UNIT_CONVERSION_MISSING_BASIS",
          severity: "WARNING",
          message: `${mapped.sku}: ${normalized.reason ?? "Unable to normalize quote to the RFx comparison basis"}`,
        });
      }
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
      failureReason = specificationValidation.reason ?? `${mapped.sku}: ${priceValidation.reason}`;
      issues.push({
        issueType: specificationValidation.pass ? "PRICE_INVALID" : "MANDATORY_SPEC_MISMATCH",
        severity: "ERROR",
        message: failureReason,
      });
    }

    // A missing or ambiguous price must not mask a specification mismatch.
    // validateQuote receives the mandatory-spec result, but price state is
    // intentionally evaluated first there for its generic callers.
    if (!specificationValidation.pass && priceValidation.status !== "failed") {
      validationStatus = "FAILED";
      failureReason = specificationValidation.reason ?? `${mapped.sku}: Mandatory specification failed`;
      issues.push({
        issueType: "MANDATORY_SPEC_MISMATCH",
        severity: "ERROR",
        message: failureReason,
      });
    }

    // Validate MOQ
    const annualQty = Math.max(1, annualQuantities[mapped.sku] ?? Number(lineItem.annual_quantity ?? 1));
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
      failureReason ??= `${mapped.sku}: ${moqValidation.reason}`;
    } else if (moqValidation.status !== "not-stated") {
      // MOQ is stated and valid
    }

    // ── Edge-case checks ──────────────────────────────────────────────────────

    // Check 1: SKU was not provided by vendor (matched by description/auto-assign)
    if (mapped.confidence < 0.80 && !extracted.sku_reference) {
      issues.push({
        issueType: "SKU_MISSING",
        severity: "WARNING",
        message: `${mapped.sku}: Vendor did not supply an explicit SKU reference; matched by ${mapped.confidence >= 0.50 ? "description overlap" : "single-item auto-assign"} (confidence ${(mapped.confidence * 100).toFixed(0)}%)`,
      });
    }

    // Check 2: Currency not recognised by the normalization layer
    const rawCurrency = (extracted.currency ?? "").toUpperCase();
    if (rawCurrency && !KNOWN_CURRENCIES.has(rawCurrency)) {
      issues.push({
        issueType: "CURRENCY_UNKNOWN",
        severity: "ERROR",
        message: `${mapped.sku}: Extracted currency "${rawCurrency}" is not supported. Supported: ${[...KNOWN_CURRENCIES].join(", ")}`,
      });
      if (validationStatus === "VALID") validationStatus = "AMBIGUOUS";
    }

    // Check 3: Currency does not match the RFx's requested currency
    if (rfxCurrency && rawCurrency && KNOWN_CURRENCIES.has(rawCurrency) && rawCurrency !== rfxCurrency.toUpperCase()) {
      issues.push({
        issueType: "CURRENCY_MISMATCH",
        severity: "WARNING",
        message: `${mapped.sku}: Vendor quoted in ${rawCurrency} but RFx expects ${rfxCurrency.toUpperCase()}. Price has been converted.`,
      });
    }

    // Check 4: Unit string could not be parsed into a known base unit
    const unitInfo = extracted.unit ? parseUnitFactor(extracted.unit) : null;
    if (extracted.unit && !unitInfo) {
      issues.push({
        issueType: "UNIT_UNRECOGNIZED",
        severity: "WARNING",
        message: `${mapped.sku}: Unit "${extracted.unit}" could not be mapped to a standard unit. Manual review required.`,
      });
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
      conversionMethod,
      conversionRate,
      conversionBasis,
      moq: moqValidation.normalizedMoq,
      moqUnit: moqValidation.normalizedMoqUnit,
      validationStatus,
      mappingConfidence: mapped.confidence,
      sourceReference: extracted.source_reference ?? null,
      failureReason,
    };
  });

  // Step 3: Determine qualification status
  let qualificationStatus: "QUALIFIED" | "QUALIFIED_WITH_EXCEPTIONS" | "REVIEW" | "FAILED" =
    "QUALIFIED";
  const failedCount = processedQuotes.filter((q) => q.validationStatus === "FAILED").length;
  const ambiguousCount = processedQuotes.filter((q) => q.validationStatus === "AMBIGUOUS").length;
  const missingCount = processedQuotes.filter((q) => q.validationStatus === "MISSING").length;
  if (processedQuotes.length === 0) {
    qualificationStatus = "REVIEW";
    issues.push({
      issueType: "NO_QUOTES",
      severity: "ERROR",
      message: "No extracted quote rows were detected for this supplier",
    });
  }
  if ((extraction.lead_time_days ?? 0) > 14) {
    qualificationStatus = "FAILED";
    issues.push({ issueType: "LEAD_TIME", severity: "ERROR", message: `Lead time ${extraction.lead_time_days} days exceeds the 14-day RFx limit` });
  }

  if (failedCount > 0) {
    // Eligibility is line-specific: retain a vendor's valid lines when another
    // line fails a mandatory specification.
    qualificationStatus = processedQuotes.some((quote) => quote.validationStatus === "VALID")
      ? "QUALIFIED_WITH_EXCEPTIONS"
      : "FAILED";
  } else if (ambiguousCount > 0 || missingCount > 0) {
    if (failedCount === 0 && missingCount < lineItems.length * 0.3) {
      // Some ambiguity/missing but not critical
      qualificationStatus = "QUALIFIED_WITH_EXCEPTIONS";
    } else {
      qualificationStatus = "REVIEW";
    }
  }

  // Lead time is a response-wide policy, unlike per-line specifications.
  if ((extraction.lead_time_days ?? 0) > 14) {
    qualificationStatus = "FAILED";
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
    conversion_method: q.conversionMethod,
    conversion_rate: q.conversionRate,
    conversion_basis: q.conversionBasis,
    moq: q.moq,
    moq_unit: q.moqUnit,
    mapping_status: q.mappingConfidence > 0.8 ? "MAPPED" : "UNMAPPED",
    validation_status: q.validationStatus,
    confidence: q.mappingConfidence,
    source_document_id: result.sourceDocumentId,
    source_reference: q.sourceReference,
    conditions: null,
    failure_reason: q.failureReason,
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
