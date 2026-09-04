import assert from "node:assert/strict";
import test from "node:test";

import { vendorExtractionRepairPrompt } from "./provider";

test("vendor repair prompt requires the quote extraction JSON contract", () => {
  const repairPrompt = vendorExtractionRepairPrompt("Extract vendor quotes.");

  assert.match(repairPrompt, /`quotes` must be an array/);
  assert.match(repairPrompt, /`price` must be a JSON number or `null`/);
  assert.match(repairPrompt, /never return an object, string, range, or currency-formatted value/);
  assert.match(repairPrompt, /`commercial_terms`, `questionnaire_answers`, and `exceptions` must each be arrays/);
  assert.match(repairPrompt, /`price_type` to `"ambiguous"`/);
  assert.match(repairPrompt, /`conditions` or in `exceptions`/);
});
