export type QuoteStatus = "valid" | "missing" | "ambiguous" | "failed";

export function validateQuote(input: {
  price: number | string | null;
  currency?: string;
  unit?: string;
  quantity?: number;
  leadTimeDays?: number;
  mandatorySpecPass?: boolean;
}) {
  const { price, quantity = 0, leadTimeDays = 0, mandatorySpecPass = true } = input;

  if (price === null || price === undefined) {
    return { status: "missing" as const, reason: "No price supplied" };
  }

  if (typeof price === "string" && /same as last year|approx|estimate|n\/a/i.test(price)) {
    return { status: "ambiguous" as const, reason: "Price is ambiguous or non-committal" };
  }

  if (typeof price === "string" && Number.isNaN(Number(price))) {
    return { status: "ambiguous" as const, reason: "Price is not a valid numeric value" };
  }

  if (typeof price === "number" && (!Number.isFinite(price) || price < 0)) {
    return { status: "failed" as const, reason: "Price is invalid" };
  }

  if (quantity <= 0) {
    return { status: "failed" as const, reason: "Quantity must be positive" };
  }

  if (leadTimeDays > 30) {
    return { status: "failed" as const, reason: "Lead time exceeds policy" };
  }

  if (!mandatorySpecPass) {
    return { status: "failed" as const, reason: "Mandatory spec failed" };
  }

  return {
    status: "valid" as const,
    normalizedPrice: Number(Number(price).toFixed(2)),
    currency: input.currency ?? "USD",
    unit: input.unit ?? "pcs",
    quantity,
  };
}

export function validateMoq(input: {
  annualQuantity: number;
  quoteMoq?: number | null;
  moqUnit?: string | null;
}) {
  const annualQuantity = Number(input.annualQuantity ?? 0);

  if (input.quoteMoq === null || input.quoteMoq === undefined || Number.isNaN(Number(input.quoteMoq))) {
    return {
      status: "not-stated" as const,
      reason: "MOQ not stated for this quote; this is neutral and does not fail the vendor",
      normalizedMoq: null,
      normalizedMoqUnit: input.moqUnit ?? null,
    };
  }

  const moqValue = Number(input.quoteMoq);

  if (!Number.isFinite(moqValue) || moqValue <= 0) {
    return {
      status: "not-stated" as const,
      reason: "MOQ was provided in an invalid format; treat as unconfirmed instead of failing the vendor",
      normalizedMoq: null,
      normalizedMoqUnit: input.moqUnit ?? null,
    };
  }

  if (moqValue > annualQuantity) {
    return {
      status: "violates" as const,
      reason: `MOQ ${moqValue} ${input.moqUnit ?? "pcs"} exceeds the annual quantity ${annualQuantity} ${input.moqUnit ?? "pcs"}`,
      normalizedMoq: moqValue,
      normalizedMoqUnit: input.moqUnit ?? "pcs",
    };
  }

  return {
    status: "valid" as const,
    reason: "MOQ is compatible with the requested annual quantity",
    normalizedMoq: moqValue,
    normalizedMoqUnit: input.moqUnit ?? "pcs",
  };
}
