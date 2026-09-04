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
} from "@/procurement/engine";

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
