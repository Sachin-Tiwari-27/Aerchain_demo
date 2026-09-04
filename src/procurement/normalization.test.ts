import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCurrency,
  normalizeUnit,
  convertUnitToBase,
  compareQuotes,
  qualifySupplier,
  validateQuote,
  calculateSavings,
  awardAllocation,
  normalizeExtractedQuote,
  validateMoq,
  runKillerScenario,
  parseUnitFactor,
} from "@/procurement/engine";
import { processExtractedQuotes } from "@/procurement/extraction-pipeline";
import { vendorQuoteExtractionSchema } from "@/ai/extraction";

test("normalizes safe raw extraction variants without making ambiguous prices spendable", () => {
  const result = vendorQuoteExtractionSchema.parse({
    vendor: "Variant Supplier",
    quotes: [
      { sku_reference: "FIRM", price: "12.50" },
      { sku_reference: "RANGE", price: { min: "10", max: 15, raw_text: "$10-$15", reason: "volume range" } },
      { sku_reference: "REBATE", price: { amount: 9, raw_text: "$9 after rebate", rebate: "annual volume" } },
      { sku_reference: "CONVERT", price: { amount: 10, converted_from: "EUR", exchange_rate: 1.1 } },
    ],
    questionnaire_answers: { quality: "approved", packaging: "recyclable" },
    commercial_terms: { payment_terms: "Net 30", freight: { included: true } },
    exceptions: { price: "Confirm range" },
  });

  assert.equal(result.quotes[0].price, 12.5);
  assert.equal(result.quotes[0].price_status, "explicit");
  assert.equal(result.quotes[1].price, null);
  assert.equal(result.quotes[1].price_range_min, 10);
  assert.equal(result.quotes[1].price_range_max, 15);
  assert.equal(result.quotes[1].raw_price_text, "$10-$15");
  assert.equal(result.quotes[2].price_status, "ambiguous");
  assert.equal(result.quotes[2].price_is_conditional, true);
  assert.equal(result.quotes[3].price, null);
  assert.deepEqual(result.commercial_terms.map((term) => term.key), ["freight", "payment_terms"]);
  assert.deepEqual(result.questionnaire_answers.map((answer) => answer.key), ["packaging", "quality"]);
});

test("converts currency and units deterministically", () => {
  assert.equal(normalizeCurrency(100, "USD", "EUR"), 92);
  assert.equal(normalizeCurrency(100, "USD", "USD"), 100);
  assert.equal(normalizeUnit(12, "in", "mm"), 304.8);
  assert.equal(convertUnitToBase(2, "kg", "lb"), 4.4092);
});

test("flags missing, ambiguous, and invalid quote states", () => {
  const invalid = validateQuote({ price: null, currency: "USD", unit: "pcs", quantity: 100, leadTimeDays: 30, mandatorySpecPass: false });
  assert.equal(invalid.status, "missing");

  const ambiguous = validateQuote({ price: "same as last year", currency: "USD", unit: "pcs", quantity: 100, leadTimeDays: 30, mandatorySpecPass: true });
  assert.equal(ambiguous.status, "ambiguous");

  const ok = validateQuote({ price: 4.5, currency: "USD", unit: "pcs", quantity: 100, leadTimeDays: 12, mandatorySpecPass: true });
  assert.equal(ok.status, "valid");
});

test("puts suppliers with no extracted quote rows into review", async () => {
  const result = await processExtractedQuotes({
    vendorId: "vendor-1",
    vendorResponseId: "response-1",
    sourceDocumentId: "document-1",
    rfxId: "rfx-1",
    extraction: {
      vendor: "Bharat Carton Group",
      lead_time: null,
      lead_time_days: null,
      quotes: [],
      questionnaire_answers: [],
      commercial_terms: [],
      exceptions: [],
    },
    lineItems: [{ id: "line-1", rfx_id: "rfx-1", sku: "CP-001", description: "Shipping box" }],
  });

  assert.equal(result.qualificationStatus, "REVIEW");
  assert.equal(result.processedQuotes.length, 0);
  assert.equal(result.issues.some((issue) => issue.issueType === "NO_QUOTES"), true);
});

test("qualifies vendors according to quality and commercial rules", () => {
  const qualified = qualifySupplier({
    isQualityPass: true,
    leadTimeDays: 12,
    moqOk: true,
    mandatorySpecPass: true,
    minRequiredVendors: 2,
    sharePercent: 50,
  });

  assert.equal(qualified.status, "qualified");

  const overLeadTime = qualifySupplier({
    isQualityPass: true,
    leadTimeDays: 15,
    moqOk: true,
    mandatorySpecPass: true,
    minRequiredVendors: 2,
    sharePercent: 20,
  });
  assert.equal(overLeadTime.status, "fails");
  assert.match(overLeadTime.reasons[0], /14-day/);

  const failed = qualifySupplier({
    isQualityPass: false,
    leadTimeDays: 40,
    moqOk: false,
    mandatorySpecPass: false,
    minRequiredVendors: 2,
    sharePercent: 90,
  });

  assert.equal(failed.status, "fails");
});

test("compares quotes and calculates savings versus current contract", () => {
  const comparison = compareQuotes([
    { supplier: "A", price: 10, currency: "USD" },
    { supplier: "B", price: 12, currency: "USD" },
    { supplier: "C", price: 9, currency: "USD" },
  ]);

  assert.equal(comparison.winner, "C");
  assert.equal(comparison.savingsVsHighest, 3);

  const savings = calculateSavings(100, 10, 8);
  assert.equal(savings.totalSavings, 200);
});

test("awards only across eligible vendors with concentration and minimum-vendor safeguards", () => {
  const award = awardAllocation([
    { supplier: "A", qualified: true, share: 35, totalCost: 1000 },
    { supplier: "B", qualified: true, share: 30, totalCost: 900 },
    { supplier: "C", qualified: false, share: 40, totalCost: 800 },
  ], {
    maxVendorShare: 0.7,
    minVendors: 2,
  });

  assert.equal(award.eligibleSuppliers.length, 2);
  assert.equal(award.isValid, true);
});

test("normalizes extracted quotes and flags missing unit-to-piece conversion evidence", () => {
  const direct = normalizeExtractedQuote({
    price: 8.5,
    currency: "INR",
    unit: "pcs",
    targetCurrency: "INR",
    targetUnit: "pcs",
  });

  assert.equal(direct.status, "valid");
  assert.equal(direct.normalizedPrice, 8.5);

  const converted = normalizeExtractedQuote({
    price: 42,
    currency: "INR",
    unit: "kg",
    targetCurrency: "INR",
    targetUnit: "pcs",
    pieceMassKg: 0.25,
  });

  assert.equal(converted.status, "valid");
  assert.equal(converted.normalizedPrice, 10.5);

  const ambiguous = normalizeExtractedQuote({
    price: 42,
    currency: "INR",
    unit: "kg",
    targetCurrency: "INR",
    targetUnit: "pcs",
  });

  assert.equal(ambiguous.status, "ambiguous");
});

test("treats missing MOQ as neutral and only fails when stated MOQ violates the order quantity", () => {
  assert.equal(
    validateMoq({ annualQuantity: 120000, quoteMoq: null, moqUnit: "pcs" }).status,
    "not-stated",
  );

  assert.equal(
    validateMoq({ annualQuantity: 120000, quoteMoq: 150000, moqUnit: "pcs" }).status,
    "violates",
  );

  assert.equal(
    validateMoq({ annualQuantity: 120000, quoteMoq: 100000, moqUnit: "pcs" }).status,
    "valid",
  );
});

test("killer scenario output is deterministic across repeated runs", () => {
  const lineItems = [
    { id: "L1", sku: "CP-001", annualQuantity: 1000, currentContractPrice: 11 },
    { id: "L2", sku: "CP-002", annualQuantity: 1500, currentContractPrice: 9 },
  ];

  const quotes = [
    { lineItemId: "L1", vendorId: "V1", vendorName: "Alpha", price: 10, validationStatus: "valid", qualificationStatus: "QUALIFIED", moq: null },
    { lineItemId: "L1", vendorId: "V2", vendorName: "Bravo", price: 12, validationStatus: "valid", qualificationStatus: "QUALIFIED", moq: null },
    { lineItemId: "L2", vendorId: "V1", vendorName: "Alpha", price: 9, validationStatus: "valid", qualificationStatus: "QUALIFIED", moq: 500 },
    { lineItemId: "L2", vendorId: "V2", vendorName: "Bravo", price: 8, validationStatus: "valid", qualificationStatus: "QUALIFIED", moq: null },
  ];

  const first = runKillerScenario({
    lineItems,
    quotes,
    minVendorCount: 2,
    maxVendorConcentration: 0.7,
  });

  const second = runKillerScenario({
    lineItems,
    quotes,
    minVendorCount: 2,
    maxVendorConcentration: 0.7,
  });

  assert.deepEqual(first, second);
  assert.equal(first.totalSpend, 22000);
  assert.equal(first.totalSavings, 2500);
  assert.equal(first.vendorsUsed, 2);
});

test("parseUnitFactor resolves compound units into base unit + factor", () => {
  assert.deepEqual(parseUnitFactor("1000 units"), { baseUnit: "pcs", factor: 1000 });
  assert.deepEqual(parseUnitFactor("per piece"), { baseUnit: "pcs", factor: 1 });
  assert.deepEqual(parseUnitFactor("per 100 pcs"), { baseUnit: "pcs", factor: 100 });
  assert.deepEqual(parseUnitFactor("kg"), { baseUnit: "kg", factor: 1 });
  assert.deepEqual(parseUnitFactor("100 kgs"), { baseUnit: "kg", factor: 100 });
  assert.equal(parseUnitFactor(""), null);
  assert.equal(parseUnitFactor(null), null);
});
