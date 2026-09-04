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

/**
 * Parse a supplier unit string into a base unit and a count factor so we
 * can normalize "per 1000 units" style prices into per-piece or per-base
 * values. Returns null when the unit cannot be confidently parsed.
 */
export function parseUnitFactor(rawUnit: string | null | undefined): {
  baseUnit: string;
  factor: number;
} | null {
  if (!rawUnit) return null;
  const normalized = rawUnit.toLowerCase().trim();
  if (!normalized) return null;

  // "per X unit" or "X / unit" or "/ X unit" — match common phrasings
  const perMatch = normalized.match(
    /(?:per|\/)\s*(\d+(?:[\.,]\d+)?)?\s*(pieces?|pcs?|units?|kg|kilograms?|lb|lbs?|pounds?|g|grams?|m|meters?|cm|mm|in|inches?|ft|feet|truckloads?|boxes?)/i,
  );
  if (perMatch) {
    const count = perMatch[1] ? Number(perMatch[1].replace(",", ".")) : 1;
    const base = (perMatch[2] || "pcs").toLowerCase();
    const canonical = canonicalUnit(base);
    if (Number.isFinite(count) && count > 0) {
      return { baseUnit: canonical, factor: count };
    }
  }

  // "X unit" or "X units" or "X pcs" — quantity first
  const countFirst = normalized.match(
    /^(\d+(?:[\.,]\d+)?)\s*(pieces?|pcs?|units?|kg|kilograms?|lb|lbs?|pounds?|g|grams?|m|meters?|cm|mm|in|inches?|ft|feet|truckloads?|boxes?)/i,
  );
  if (countFirst) {
    const count = Number(countFirst[1].replace(",", "."));
    const base = canonicalUnit(countFirst[2]);
    if (Number.isFinite(count) && count > 0) {
      return { baseUnit: base, factor: count };
    }
  }

  // Plain unit
  const plain = canonicalUnit(normalized);
  if (["pcs", "kg", "lb", "g", "m", "cm", "mm", "in"].includes(plain)) {
    return { baseUnit: plain, factor: 1 };
  }

  return null;
}

function canonicalUnit(value: string): string {
  const lower = value.toLowerCase();
  if (["piece", "pieces", "pcs", "pc", "unit", "units", "box", "boxes"].includes(lower)) return "pcs";
  if (["kg", "kilogram", "kilograms"].includes(lower)) return "kg";
  if (["g", "gram", "grams"].includes(lower)) return "g";
  if (["lb", "lbs", "pound", "pounds"].includes(lower)) return "lb";
  if (["m", "meter", "meters", "metre", "metres"].includes(lower)) return "m";
  if (["cm"].includes(lower)) return "cm";
  if (["mm"].includes(lower)) return "mm";
  if (["in", "inch", "inches"].includes(lower)) return "in";
  if (["ft", "foot", "feet"].includes(lower)) return "ft";
  if (["truckload", "truckloads"].includes(lower)) return "truckload";
  return lower;
}

export function normalizeExtractedQuote(input: {
  price: number | string | null;
  currency?: string;
  unit?: string;
  targetCurrency?: string;
  targetUnit?: string;
  pieceMassKg?: number;
  unitFactor?: number;
}): {
  status: "valid" | "ambiguous" | "missing" | "failed";
  normalizedPrice?: number;
  normalizedCurrency?: string;
  normalizedUnit?: string;
  reason?: string;
} {
  const targetCurrency = (input.targetCurrency ?? input.currency ?? "INR").toUpperCase() as CurrencyCode;
  const targetUnit = (input.targetUnit ?? input.unit ?? "pcs").toLowerCase();
  const sourceUnitFactor = input.unitFactor && Number.isFinite(input.unitFactor) && input.unitFactor > 0 ? input.unitFactor : 1;

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

    const converted = normalizeCurrency(
      numericValue,
      (input.currency ?? "INR").toUpperCase() as CurrencyCode,
      targetCurrency,
    );
    const pricePerBase = sourceUnitFactor !== 1 ? converted / sourceUnitFactor : converted;
    return {
      status: "valid",
      normalizedPrice: Number(pricePerBase.toFixed(2)),
      normalizedCurrency: targetCurrency,
      normalizedUnit: targetUnit,
    };
  }

  if (typeof input.unit === "string" && input.unit.toLowerCase() === "kg" && targetUnit === "pcs") {
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
      targetCurrency,
    );
    return {
      status: "valid",
      normalizedPrice: Number(converted.toFixed(2)),
      normalizedCurrency: targetCurrency,
      normalizedUnit: targetUnit,
    };
  }

  const numericPrice = Number(input.price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return { status: "failed", reason: "Price is invalid" };
  }

  const converted = normalizeCurrency(
    numericPrice,
    (input.currency ?? "INR").toUpperCase() as CurrencyCode,
    targetCurrency,
  );

  const pricePerBase = sourceUnitFactor !== 1 ? converted / sourceUnitFactor : converted;

  return {
    status: "valid",
    normalizedPrice: Number(pricePerBase.toFixed(2)),
    normalizedCurrency: targetCurrency,
    normalizedUnit: targetUnit,
  };
}
