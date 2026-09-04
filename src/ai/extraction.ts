import { z } from "zod";

import { generateStructured, type DocumentKind, type UseCase } from "@/ai/provider";

const priceStatusSchema = z.enum(["explicit", "derived", "ambiguous", "missing"]);
const scalarValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const supplierShape = z.union([
  z.string(),
  z.object({ name: z.string().optional(), contact: z.string().nullable().optional(), address: z.string().nullable().optional() }).passthrough(),
  z.null(),
]);
const conditionsShape = z.union([z.string(), z.array(z.string()), z.record(z.string(), scalarValueSchema), z.null()]);

/** The permissive boundary contract for values returned by an AI provider. */
export const rawVendorQuoteExtractionSchema = z.object({
  vendor: z.string().min(1).optional(),
  vendor_name: z.string().min(1).optional(),
  supplier: supplierShape.optional(),
  lead_time: z.string().nullable().optional(),
  lead_time_days: z.number().nullable().optional(),
  quotes: z.array(z.object({
    sku_reference: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    price: z.union([
      z.number(),
      z.string(),
      z.null(),
      z.object({
        amount: z.union([z.number(), z.string(), z.null()]).optional(),
        value: z.union([z.number(), z.string(), z.null()]).optional(),
        min: z.union([z.number(), z.string(), z.null()]).optional(),
        max: z.union([z.number(), z.string(), z.null()]).optional(),
        currency: z.string().nullable().optional(),
        unit: z.string().nullable().optional(),
        raw_text: z.string().nullable().optional(),
        reason: z.string().nullable().optional(),
      }).passthrough(),
    ]).optional(),
    unit: z.string().nullable().optional(),
    currency: z.string().nullable().optional(),
    moq: z.number().nullable().optional(),
    moq_unit: z.string().nullable().optional(),
    conditions: conditionsShape.optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    confidence_score: z.number().min(0).max(1).nullable().optional(),
    source_reference: z.string().nullable().optional(),
    price_type: priceStatusSchema.optional(),
    price_status: priceStatusSchema.optional(),
  }).passthrough()),
  questionnaire_answers: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional().default([]),
  commercial_terms: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional().default([]),
  exceptions: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional().default([]),
}).passthrough();

const canonicalEntrySchema = z.object({ key: z.string().min(1), value: z.unknown() }).strict();
const canonicalCommercialTermSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  raw_value: z.unknown(),
}).strict();

/** The application contract. It is intentionally strict after normalization. */
export const canonicalVendorQuoteExtractionSchema = z.object({
  vendor: z.string().min(1),
  lead_time: z.string().nullable(),
  lead_time_days: z.number().finite().nullable(),
  quotes: z.array(z.object({
    sku_reference: z.string().nullable(),
    description: z.string().nullable(),
    price: z.number().finite().nullable(),
    raw_price_text: z.string().nullable(),
    price_range_min: z.number().finite().nullable(),
    price_range_max: z.number().finite().nullable(),
    price_is_approximate: z.boolean(),
    price_is_conditional: z.boolean(),
    price_reason: z.string().nullable(),
    price_status: priceStatusSchema,
    unit: z.string().nullable(),
    currency: z.string().nullable(),
    moq: z.number().finite().nullable(),
    moq_unit: z.string().nullable(),
    conditions: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    source_reference: z.string().nullable(),
  }).strict()),
  questionnaire_answers: z.array(canonicalEntrySchema),
  commercial_terms: z.array(canonicalCommercialTermSchema),
  exceptions: z.array(canonicalEntrySchema),
}).strict();

function flattenConditions(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === "string").join(" | ") || null;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry != null && entry !== "").map(([key, entry]) => `${key}: ${typeof entry === "string" ? entry : JSON.stringify(entry)}`);
    return entries.length ? entries.join(" | ") : null;
  }
  return null;
}

function flattenSupplier(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as Record<string, unknown>).name === "string") return (value as Record<string, string>).name;
  return "Unknown Vendor";
}

function finiteNumericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^[-+]?\d+(?:\.\d+)?$/.test(value.trim())) {
    const number = Number(value.trim());
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function stringifyEvidence(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

/** Converts price variants without ever calculating or guessing a spendable value. */
export function normalizeRawPrice(rawPrice: unknown, statedStatus?: z.infer<typeof priceStatusSchema>) {
  const base = { raw_price_text: stringifyEvidence(rawPrice), price_range_min: null as number | null, price_range_max: null as number | null, price_is_approximate: false, price_is_conditional: false, price_reason: null as string | null };
  if (rawPrice === null || rawPrice === undefined) return { ...base, price: null, price_status: "missing" as const };

  if (typeof rawPrice === "number" || typeof rawPrice === "string") {
    const price = finiteNumericValue(rawPrice);
    if (price === null) return { ...base, price: null, price_status: "ambiguous" as const, price_reason: "Price is not a firm numeric value." };
    if (statedStatus === "derived" || statedStatus === "ambiguous" || statedStatus === "missing") return { ...base, price: null, price_status: statedStatus === "missing" ? "missing" as const : "ambiguous" as const, price_reason: `Model marked this price as ${statedStatus}.` };
    return { ...base, price, price_status: "explicit" as const };
  }

  const record = rawPrice as Record<string, unknown>;
  const min = finiteNumericValue(record.min);
  const max = finiteNumericValue(record.max);
  const amount = finiteNumericValue(record.amount);
  const value = finiteNumericValue(record.value);
  const rawText = typeof record.raw_text === "string" ? record.raw_text : JSON.stringify(record);
  const reason = typeof record.reason === "string" ? record.reason : null;
  const evidence = [rawText, reason, JSON.stringify(record)].filter(Boolean).join(" ").toLowerCase();
  const approximate = record.approximate === true || record.is_approximate === true || /\b(?:approx(?:imately)?|about|around|estimate(?:d)?|~)\b/.test(evidence);
  const conditional = record.conditional === true || record.is_conditional === true || record.rebate != null || record.discount != null || /\b(?:conditional|rebate|discount|if\s)\b/.test(evidence);
  const conversion = record.converted_from != null || record.exchange_rate != null || record.conversion != null;
  const common = { ...base, raw_price_text: rawText, price_range_min: min, price_range_max: max, price_is_approximate: approximate, price_is_conditional: conditional, price_reason: reason };
  if (min !== null || max !== null) return { ...common, price: null, price_status: "ambiguous" as const, price_reason: reason ?? "Price is a range." };
  if (approximate || conditional || conversion) return { ...common, price: null, price_status: "ambiguous" as const, price_reason: reason ?? (conversion ? "Price requires an unsupported conversion." : approximate ? "Price is approximate." : "Price is conditional.") };
  if (amount !== null && value !== null && amount !== value) return { ...common, price: null, price_status: "ambiguous" as const, price_reason: reason ?? "Price object contains conflicting values." };
  const price = amount ?? value;
  if (price === null || statedStatus === "derived" || statedStatus === "ambiguous" || statedStatus === "missing") return { ...common, price: null, price_status: statedStatus === "missing" ? "missing" as const : "ambiguous" as const, price_reason: reason ?? (statedStatus ? `Model marked this price as ${statedStatus}.` : "No firm numeric price was supplied.") };
  return { ...common, price, price_status: "explicit" as const };
}

function normalizeKeyedEntries(value: unknown): Array<{ key: string; value: unknown }> {
  if (Array.isArray(value)) return value.map((entry, index) => ({ key: `item_${index + 1}`, value: entry }));
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).sort().map((key) => ({ key, value: (value as Record<string, unknown>)[key] }));
  return [];
}

/** Converts equivalent keyed term representations into deterministic structured terms. */
export function normalizeCommercialTerms(value: unknown) {
  return normalizeKeyedEntries(value).map((entry) => ({ key: entry.key, value: entry.value, raw_value: entry.value }));
}

function parseLeadTimeString(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function extractLeadTimeFromConditions(conditions: unknown): number | null {
  if (typeof conditions === "string") return parseLeadTimeString(conditions);
  if (Array.isArray(conditions)) return conditions.map(extractLeadTimeFromConditions).find((value): value is number => value !== null) ?? null;
  if (conditions && typeof conditions === "object") return parseLeadTimeString((conditions as Record<string, unknown>).lead_time ?? (conditions as Record<string, unknown>).leadTime);
  return null;
}

export function normalizeVendorQuoteExtraction(value: z.output<typeof rawVendorQuoteExtractionSchema>) {
  return {
    vendor: value.vendor || value.vendor_name || flattenSupplier(value.supplier),
    lead_time: value.lead_time ?? null,
    lead_time_days: value.lead_time_days ?? parseLeadTimeString(value.lead_time) ?? extractLeadTimeFromConditions(value.quotes[0]?.conditions),
    quotes: value.quotes.map((quote) => ({
      sku_reference: quote.sku_reference ?? null, description: quote.description ?? null,
      ...normalizeRawPrice(quote.price, quote.price_status ?? quote.price_type),
      unit: quote.unit ?? null, currency: quote.currency ?? null, moq: quote.moq ?? null, moq_unit: quote.moq_unit ?? null,
      conditions: flattenConditions(quote.conditions), confidence: quote.confidence ?? quote.confidence_score ?? null,
      source_reference: quote.source_reference ?? null,
    })),
    questionnaire_answers: normalizeKeyedEntries(value.questionnaire_answers),
    commercial_terms: normalizeCommercialTerms(value.commercial_terms),
    exceptions: normalizeKeyedEntries(value.exceptions),
  };
}

export const vendorQuoteExtractionSchema = rawVendorQuoteExtractionSchema.transform((value) =>
  canonicalVendorQuoteExtractionSchema.parse(normalizeVendorQuoteExtraction(value)),
);
export type VendorQuoteExtraction = z.infer<typeof vendorQuoteExtractionSchema>;

export type ExtractVendorDocumentInput = { documentKind: DocumentKind; fileName: string; mediaType?: string; contentText?: string; imageBase64?: string; prompt?: string; };

export async function extractVendorDocument(input: ExtractVendorDocumentInput) {
  const useCase: UseCase = input.documentKind === "text-derived" ? "rfx-json" : "image-parse";
  const prompt = input.prompt ?? `Extract structured supplier pricing information from the provided document. Return one JSON object with vendor, lead_time_days, quotes, questionnaire_answers, commercial_terms, and exceptions. For each quote retain seller evidence: use price as a number, numeric string, null, or an object with amount/value/min/max/currency/unit/raw_text/reason. Do not calculate conversions; identify ranges, approximate values, rebates, and conditional prices in the price object.\n\nDOCUMENT CONTENT:\n${input.contentText || (input.imageBase64 ? "The document is attached as binary media. Inspect it directly." : "(no content provided)")}`;
  const result = await generateStructured({ schema: vendorQuoteExtractionSchema, prompt, documentKind: input.documentKind, useCase, media: input.imageBase64 && input.mediaType ? { mimeType: input.mediaType, data: input.imageBase64 } : undefined });
  if (!result.data.vendor && input.contentText) result.data.vendor = flattenSupplier(input.contentText.match(/(?:vendor|supplier|company)[\s:]+([A-Za-z0-9\s\-&]+)/i)?.[1]?.trim() ?? null);
  return { ...result, rawExtraction: result.data };
}
