# Extraction & Normalization Robustness

## Schema fallbacks (src/ai/extraction.ts)
`vendorQuoteExtractionSchema` must remain tolerant of model output variations.
Accept (in order): `vendor`, `vendor_name`, `supplier` (string or object). Always
flatten supplier objects via `flattenSupplier` which prefers `name`.

Lead time is read from `lead_time_days` (number) first, then `lead_time` (string
e.g. "12 days") via `parseLeadTimeString`, then conditions/lead_time text.
Always coerce to a number before persistence.

## Unit factor normalization (src/procurement/normalization.ts)
`parseUnitFactor(rawUnit)` recognises compound units like `1000 units`,
`per 100 pcs`, `100 kgs`, `per piece`, etc. Returns `{ baseUnit, factor }`
where the supplier price must be divided by `factor` to obtain a per-base
price. The extraction pipeline (`extraction-pipeline.ts`) calls it and
divides `extracted.price` by `factor` before passing to
`normalizeExtractedQuote`. `canonicalUnit` maps `piece`, `pcs`, `unit`,
`box` -> `pcs`; `kg`/`kilogram` -> `kg`; `m`/`meter` -> `m`, etc.

## Tests
`src/procurement/normalization.test.ts` includes a `parseUnitFactor` test
that locks in the `1000 units` -> `{ baseUnit: "pcs", factor: 1000 }` case.
Run with `npm test` (tsx --test).

## Pipeline call order
1. `mapQuotesToLineItems` (SKU or 10-char description fuzzy match)
2. `validateQuote` (mandatory spec, currency, lead-time limit)
3. `parseUnitFactor` to derive per-base price
4. `normalizeExtractedQuote` (currency + unit conversion)
5. `validateMoq` against annual quantity
6. Persist via `saveProcessedQuotes`
