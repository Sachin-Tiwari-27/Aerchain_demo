import assert from "node:assert/strict";
import test from "node:test";

import { runAwardScenario } from "@/procurement/analyst-tools";

function queryResult(data: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    not: () => query,
    maybeSingle: async () => ({ data }),
    then: (resolve: (value: { data: unknown }) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data }).then(resolve, reject),
  };

  return query;
}

test("returns an unawardable scenario when qualified quotes are not VALID on the RFx comparison basis", async () => {
  const dataByTable: Record<string, unknown> = {
    vendor_responses: [{ vendor_id: "vendor-1", status: "QUALIFIED" }],
    vendor_quotes: [{
      vendor_id: "vendor-1",
      line_item_id: "line-1",
      validation_status: "VALID",
      normalized_price: 12,
      normalized_currency: "USD",
      normalized_unit: "pcs",
    }],
    rfx_line_items: [
      { id: "line-1", sku: "SKU-001", description: "First SKU", annual_quantity: 10, unit: "pcs" },
      { id: "line-2", sku: "SKU-002", description: "Second SKU", annual_quantity: 20, unit: "pcs" },
    ],
    rfxs: { currency: "INR" },
    vendors: [{ id: "vendor-1", name: "Qualified Vendor" }],
    current_contract_prices: [],
  };
  const supabase = { from: (table: string) => queryResult(dataByTable[table]) };

  const result = await runAwardScenario(supabase, "rfx-1");
  const scenario = result.data as {
    award: Record<string, unknown>;
    excludedSkus: Array<{ sku: string; reason: string }>;
    summary: {
      vendorsUsed: number;
      concentrationPercent: string;
      constraintsSatisfied: { minVendorsMet: boolean; concentrationMet: boolean; message: string };
    };
  };

  assert.equal(result.success, true);
  assert.deepEqual(scenario.award, {});
  assert.equal(scenario.summary.vendorsUsed, 0);
  assert.equal(scenario.summary.concentrationPercent, "0");
  assert.deepEqual(scenario.excludedSkus.map(({ sku }) => sku), ["First SKU", "Second SKU"]);
  assert.equal(scenario.excludedSkus.every(({ reason }) => reason === "No quotes from qualified vendors"), true);
  assert.equal(scenario.summary.constraintsSatisfied.minVendorsMet, false);
  assert.equal(scenario.summary.constraintsSatisfied.concentrationMet, false);
  assert.match(scenario.summary.constraintsSatisfied.message, /comparison basis/);
});
