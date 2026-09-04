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
  assert.equal(result.processedQuotes.length, 1);
  assert.equal(result.processedQuotes[0].validationStatus, "MISSING");
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

test("converts dollar-per-kilogram quotes to INR per piece when mass evidence is supplied", () => {
  const converted = normalizeExtractedQuote({
    price: 42,
    currency: "USD",
    unit: "kg",
    targetCurrency: "INR",
    targetUnit: "piece",
    pieceMassKg: 0.25,
  });

  assert.equal(converted.status, "valid");
  assert.equal(converted.normalizedPrice, 875.7);
  assert.equal(converted.normalizedCurrency, "INR");
  assert.equal(converted.normalizedUnit, "pcs");
  assert.equal(converted.conversionMethod, "MASS_PER_PIECE_AND_CURRENCY_FX");
});

test("does not produce a numeric comparison price for unsupported currencies", () => {
  const converted = normalizeExtractedQuote({
    price: 42,
    currency: "AUD",
    unit: "pcs",
    targetCurrency: "INR",
    targetUnit: "pcs",
  });

  assert.equal(converted.status, "ambiguous");
  assert.match(converted.reason ?? "", /AUD/);
});

test("keeps mass-priced piece quotes raw when no mass-per-piece basis is documented", async () => {
  const result = await processExtractedQuotes({
    vendorId: "vendor-1",
    vendorResponseId: "response-1",
    rfxId: "rfx-1",
    rfxCurrency: "USD",
    extraction: {
      vendor: "Mass supplier",
      lead_time: null,
      lead_time_days: null,
      quotes: [{ sku_reference: "CP-001", price: 42, unit: "kg", currency: "USD", conditions: null, confidence: 0.9 }],
      questionnaire_answers: [],
      commercial_terms: [],
      exceptions: [],
    },
    lineItems: [{ id: "line-1", rfx_id: "rfx-1", sku: "CP-001", unit: "pcs" }],
  });

  const [quote] = result.processedQuotes;
  assert.equal(quote.rawPrice, 42);
  assert.equal(quote.normalizedPrice, null);
  assert.equal(quote.validationStatus, "AMBIGUOUS");
  assert.equal(result.issues.some((issue) => issue.issueType === "UNIT_CONVERSION_MISSING_BASIS"), true);
});

test("uses the RFx line item and currency as explicit normalized quote targets", async () => {
  const result = await processExtractedQuotes({
    vendorId: "vendor-1",
    vendorResponseId: "response-1",
    rfxId: "rfx-1",
    rfxCurrency: "INR",
    extraction: {
      vendor: "Supplier",
      lead_time: null,
      lead_time_days: null,
      quotes: [{ sku_reference: "CP-001", price: 100, unit: "per 100 pcs", currency: "USD", conditions: null, confidence: 0.9 }],
      questionnaire_answers: [],
      commercial_terms: [],
      exceptions: [],
    },
    lineItems: [{ id: "line-1", rfx_id: "rfx-1", sku: "CP-001", unit: "pcs" }],
  });

  const [quote] = result.processedQuotes;
  assert.equal(quote.normalizedPrice, 83.4);
  assert.equal(quote.normalizedUnit, "pcs");
  assert.equal(quote.normalizedCurrency, "INR");
  assert.equal(quote.conversionMethod, "CURRENCY_FX_AND_UNIT_FACTOR");
  assert.match(quote.conversionBasis ?? "", /USD to INR FX/);
});

test("uses documented extracted mass evidence for kg-to-piece normalization", async () => {
  const result = await processExtractedQuotes({
    vendorId: "vendor-1",
    vendorResponseId: "response-1",
    rfxId: "rfx-1",
    rfxCurrency: "INR",
    extraction: {
      vendor: "Supplier",
      lead_time_days: 7,
      quotes: [{ sku_reference: "CP-001", price: 42, unit: "kg", currency: "USD", piece_mass_kg: 0.25, conditions: null, confidence: 0.9 }],
      questionnaire_answers: [],
      commercial_terms: [],
      exceptions: [],
    },
    lineItems: [{ id: "line-1", rfx_id: "rfx-1", sku: "CP-001", unit: "pcs" }],
  });

  const [quote] = result.processedQuotes;
  assert.equal(quote.normalizedPrice, 875.7);
  assert.equal(quote.normalizedCurrency, "INR");
  assert.equal(quote.normalizedUnit, "pcs");
  assert.equal(quote.validationStatus, "VALID");
  assert.match(quote.conversionBasis ?? "", /0.25 kg per piece/);
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

test("fails only mismatched specification lines and retains the vendor's eligible lines", async () => {
  const result = await processExtractedQuotes({
    vendorId: "vendor-1",
    vendorResponseId: "response-1",
    rfxId: "rfx-1",
    extraction: {
      vendor: "Spec Vendor",
      lead_time_days: 7,
      quotes: [
        { sku_reference: "CP-011", price: 10, unit: "pcs", currency: "INR", ply: 3, gsm: 180, length_mm: 200, width_mm: 150, height_mm: 100, conditions: null, confidence: null },
        { sku_reference: "CP-012", price: 11, unit: "pcs", currency: "INR", ply: 5, gsm: 200, conditions: null, confidence: null },
      ],
      questionnaire_answers: [],
      commercial_terms: [],
      exceptions: [],
    },
    lineItems: [
      { id: "line-11", rfx_id: "rfx-1", sku: "CP-011", annual_quantity: 100, ply: 5, gsm: 180, length_mm: 200, width_mm: 150, height_mm: 100 },
      { id: "line-12", rfx_id: "rfx-1", sku: "CP-012", annual_quantity: 100, ply: 5, gsm: 200 },
    ],
  });

  assert.equal(result.processedQuotes[0].validationStatus, "FAILED");
  assert.equal(result.processedQuotes[0].normalizedPrice, null);
  assert.equal(result.processedQuotes[0].failureReason, "CP-011: ply: required 5-ply, quoted 3-ply");
  assert.equal(result.processedQuotes[1].validationStatus, "VALID");
  assert.equal(result.qualificationStatus, "QUALIFIED_WITH_EXCEPTIONS");
  assert.equal(result.issues.some((issue) => issue.issueType === "MANDATORY_SPEC_MISMATCH"), true);
});

test("handles complete, partial, vague, mixed-unit, and late vendor response fixtures conservatively", async () => {
  const lines = [
    { id: "1", rfx_id: "rfx", sku: "CP-001", description: "3-ply mailer box", unit: "pcs", annual_quantity: 15000, ply: 3 },
    { id: "2", rfx_id: "rfx", sku: "CP-002", description: "3-ply shipping carton", unit: "pcs", annual_quantity: 15325, ply: 3 },
    { id: "3", rfx_id: "rfx", sku: "CP-003", description: "5-ply export box", unit: "pcs", annual_quantity: 15650, ply: 5 },
    { id: "11", rfx_id: "rfx", sku: "CP-011", description: "5-ply bottle shipper", unit: "pcs", annual_quantity: 18250, ply: 5 },
  ];
  const base = { vendorId: "vendor", vendorResponseId: "response", rfxId: "rfx", rfxCurrency: "INR", lineItems: lines };
  const emptyAnswers = { questionnaire_answers: [], commercial_terms: [], exceptions: [] };

  const clean = await processExtractedQuotes({ ...base, extraction: {
    vendor: "A", lead_time_days: 10, ...emptyAnswers,
    quotes: lines.map((line) => ({ sku_reference: line.sku, description: line.description, price: 10, unit: "per piece", currency: "INR", ply: line.ply, conditions: null, confidence: null })),
  } });
  assert.equal(clean.qualificationStatus, "QUALIFIED");
  assert.equal(clean.processedQuotes.every((quote) => quote.validationStatus === "VALID"), true);

  const partialWithWrongPly = await processExtractedQuotes({ ...base, extraction: {
    vendor: "B", lead_time_days: 12, ...emptyAnswers,
    quotes: [
      { sku_reference: "CP-001", price: 12.9, unit: "pc", currency: "INR", ply: 3, conditions: null, confidence: null },
      { sku_reference: "CP-011", price: 14.9, unit: "pc", currency: "INR", ply: 3, conditions: null, confidence: null },
    ],
  } });
  assert.equal(partialWithWrongPly.processedQuotes.find((quote) => quote.sku === "CP-011")?.validationStatus, "FAILED");
  assert.equal(partialWithWrongPly.processedQuotes.filter((quote) => quote.validationStatus === "MISSING").length, 2);
  assert.equal(partialWithWrongPly.qualificationStatus, "QUALIFIED_WITH_EXCEPTIONS");

  const mixedUnits = await processExtractedQuotes({ ...base, extraction: {
    vendor: "D", lead_time_days: null, ...emptyAnswers,
    quotes: [
      { sku_reference: "CP-001", price: 42, unit: "kg", currency: "INR", ply: 3, conditions: null, confidence: null },
      { sku_reference: "CP-002", price: 0.28, unit: "unit", currency: "USD", ply: 3, conditions: null, confidence: null },
      { sku_reference: "CP-003", price: 1850, unit: "100 pcs", currency: "INR", ply: 5, conditions: null, confidence: null },
      { description: "standard box medium", price: 15.5, unit: "each", currency: "INR", conditions: null, confidence: null },
    ],
  } });
  assert.equal(mixedUnits.processedQuotes.find((quote) => quote.sku === "CP-001")?.validationStatus, "AMBIGUOUS");
  assert.equal(mixedUnits.processedQuotes.find((quote) => quote.sku === "CP-003")?.normalizedPrice, 18.5);
  assert.equal(mixedUnits.issues.some((issue) => issue.issueType === "SKU_MAPPING_AMBIGUOUS"), true);
  assert.equal(mixedUnits.qualificationStatus, "REVIEW");

  const narrativeRange = await processExtractedQuotes({ ...base, extraction: {
    vendor: "C", lead_time_days: null, ...emptyAnswers,
    quotes: [{ sku_reference: "CP-001", price: 13, unit: "pc", currency: "INR", ply: 3, price_type: "ambiguous", conditions: null, confidence: null }],
  } });
  assert.equal(narrativeRange.processedQuotes.find((quote) => quote.sku === "CP-001")?.normalizedPrice, null);
  assert.equal(narrativeRange.processedQuotes.find((quote) => quote.sku === "CP-001")?.validationStatus, "AMBIGUOUS");
  assert.equal(narrativeRange.qualificationStatus, "REVIEW");

  const lateRateCard = await processExtractedQuotes({ ...base, extraction: {
    vendor: "E", lead_time_days: 30, ...emptyAnswers,
    quotes: [{ sku_reference: "CP-001", price: 11.8, unit: "pc", currency: "INR", ply: 3, conditions: null, confidence: null }],
  } });
  assert.equal(lateRateCard.qualificationStatus, "FAILED");
  assert.equal(lateRateCard.issues.some((issue) => issue.issueType === "LEAD_TIME"), true);
});
