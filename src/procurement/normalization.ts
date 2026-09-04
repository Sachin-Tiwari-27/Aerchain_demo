export type CurrencyCode = "USD" | "EUR" | "GBP" | "INR" | "CAD" | "JPY";
export type UnitCode = "pcs" | "kg" | "lb" | "mm" | "in" | "m" | "cm" | "g";

export function normalizeCurrency(price: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return Number(price.toFixed(2));

  const fx: Record<CurrencyCode, number> = {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    INR: 83.4,
    CAD: 1.36,
    JPY: 157.5,
  };

  const usdValue = price / fx[from];
  return Number((usdValue * fx[to]).toFixed(2));
}

export function normalizeUnit(value: number, from: UnitCode, to: UnitCode): number {
  const toBase: Record<UnitCode, number> = {
    pcs: 1,
    kg: 1,
    lb: 0.453592,
    mm: 1,
    in: 25.4,
    m: 1000,
    cm: 10,
    g: 0.001,
  };

  const fromBase = value * toBase[from];
  return Number((fromBase / toBase[to]).toFixed(4));
}

export function convertUnitToBase(value: number, from: UnitCode, to: UnitCode): number {
  return normalizeUnit(value, from, to);
}

export function normalizeExtractedQuote(input: {
  price: number | string | null;
  currency?: string;
  unit?: string;
  targetCurrency?: string;
  targetUnit?: string;
  pieceMassKg?: number;
}): {
  status: "valid" | "ambiguous" | "missing" | "failed";
  normalizedPrice?: number;
  normalizedCurrency?: string;
  normalizedUnit?: string;
  reason?: string;
} {
  const normalizedCurrency = (input.targetCurrency ?? input.currency ?? "INR").toUpperCase();
  const normalizedUnit = (input.targetUnit ?? input.unit ?? "pcs").toLowerCase();

  if (input.price === null || input.price === undefined) {
    return { status: "missing", reason: "No price supplied" };
  }

  if (typeof input.price === "string") {
    const trimmed = input.price.trim();
    if (!trimmed || /same as last year|approx|estimate|n\/a|about/i.test(trimmed)) {
      return { status: "ambiguous", reason: "Price is ambiguous or non-committal" };
    }

    const numericValue = Number(trimmed);
    if (!Number.isFinite(numericValue)) {
      return { status: "ambiguous", reason: "Price is not a valid numeric value" };
    }

    return {
      status: "valid",
      normalizedPrice: Number(normalizeCurrency(numericValue, (input.currency ?? "INR").toUpperCase() as CurrencyCode, normalizedCurrency as CurrencyCode).toFixed(2)),
      normalizedCurrency,
      normalizedUnit,
    };
  }

  if (typeof input.unit === "string" && input.unit.toLowerCase() === "kg" && normalizedUnit === "pcs") {
    if (typeof input.pieceMassKg !== "number" || !Number.isFinite(input.pieceMassKg) || input.pieceMassKg <= 0) {
      return {
        status: "ambiguous",
        reason: "kg price requires explicit piece mass or conversion basis to normalize to pcs",
      };
    }

    const piecePrice = Number(input.price) * input.pieceMassKg;
    const converted = normalizeCurrency(
      piecePrice,
      (input.currency ?? "INR").toUpperCase() as CurrencyCode,
      normalizedCurrency as CurrencyCode,
    );
    return {
      status: "valid",
      normalizedPrice: Number(converted.toFixed(2)),
      normalizedCurrency,
      normalizedUnit,
    };
  }

  const numericPrice = Number(input.price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return { status: "failed", reason: "Price is invalid" };
  }

  const converted = normalizeCurrency(
    numericPrice,
    (input.currency ?? "INR").toUpperCase() as CurrencyCode,
    normalizedCurrency as CurrencyCode,
  );

  return {
    status: "valid",
    normalizedPrice: Number(converted.toFixed(2)),
    normalizedCurrency,
    normalizedUnit,
  };
}
