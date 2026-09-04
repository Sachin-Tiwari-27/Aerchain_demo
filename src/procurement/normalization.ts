export type CurrencyCode = "USD" | "EUR" | "GBP" | "INR" | "CAD" | "JPY";
export type UnitCode = "pcs" | "kg" | "lb" | "mm" | "in" | "m" | "cm" | "g";

const FX_RATES_TO_USD: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.4,
  CAD: 1.36,
  JPY: 157.5,
};

export function isSupportedCurrency(value: string): value is CurrencyCode {
  return value in FX_RATES_TO_USD;
}

export function normalizeCurrency(price: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return Number(price.toFixed(2));

  const usdValue = price / FX_RATES_TO_USD[from];
  return Number((usdValue * FX_RATES_TO_USD[to]).toFixed(2));
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
  conversionMethod?: string;
  conversionRate?: number;
  conversionBasis?: string;
  reason?: string;
} {
  const targetCurrency = (input.targetCurrency ?? input.currency ?? "INR").toUpperCase();
  const targetUnit = canonicalUnit(input.targetUnit ?? input.unit ?? "pcs");
  const sourceUnitFactor = input.unitFactor && Number.isFinite(input.unitFactor) && input.unitFactor > 0 ? input.unitFactor : 1;

  if (input.price === null || input.price === undefined) {
    return { status: "missing", reason: "No price supplied" };
  }

  const numericPrice = typeof input.price === "string" ? Number(input.price.trim()) : Number(input.price);
  if (typeof input.price === "string") {
    const trimmed = input.price.trim();
    if (!trimmed || /same as last year|approx|estimate|n\/a|about/i.test(trimmed)) {
      return { status: "ambiguous", reason: "Price is ambiguous or non-committal" };
    }

    if (!Number.isFinite(numericPrice)) {
      return { status: "ambiguous", reason: "Price is not a valid numeric value" };
    }
  }

  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return { status: "failed", reason: "Price is invalid" };
  }

  const sourceCurrency = (input.currency ?? "INR").toUpperCase();
  if (!isSupportedCurrency(sourceCurrency) || !isSupportedCurrency(targetCurrency)) {
    return {
      status: "ambiguous",
      reason: `Currency conversion is unavailable for ${!isSupportedCurrency(sourceCurrency) ? sourceCurrency : targetCurrency}`,
    };
  }
  const sourceUnit = canonicalUnit(input.unit ?? "pcs");
  const isMassToPiece = ["kg", "g", "lb"].includes(sourceUnit) && targetUnit === "pcs";
  if (isMassToPiece) {
    if (typeof input.pieceMassKg !== "number" || !Number.isFinite(input.pieceMassKg) || input.pieceMassKg <= 0) {
      return {
        status: "ambiguous",
        reason: `${sourceUnit} price requires an explicit mass-per-piece conversion basis to normalize to pcs`,
      };
    }

    const massPerPieceInSourceUnit = normalizeUnit(input.pieceMassKg, "kg", sourceUnit as UnitCode);
    const piecePrice = (numericPrice / sourceUnitFactor) * massPerPieceInSourceUnit;
    const converted = normalizeCurrency(
      piecePrice,
      sourceCurrency,
      targetCurrency,
    );
    return {
      status: "valid",
      normalizedPrice: Number(converted.toFixed(2)),
      normalizedCurrency: targetCurrency,
      normalizedUnit: targetUnit,
      conversionMethod: sourceCurrency === targetCurrency ? "MASS_PER_PIECE" : "MASS_PER_PIECE_AND_CURRENCY_FX",
      conversionRate: Number((converted / numericPrice).toFixed(8)),
      conversionBasis: `${input.pieceMassKg} kg per piece; price quoted per ${sourceUnitFactor} ${sourceUnit}; converted to ${targetCurrency} per ${targetUnit}`,
    };
  }

  const converted = normalizeCurrency(
    numericPrice,
    sourceCurrency,
    targetCurrency,
  );

  const pricePerBase = sourceUnitFactor !== 1 ? converted / sourceUnitFactor : converted;
  const conversionDetails = [
    sourceCurrency !== targetCurrency ? `${sourceCurrency} to ${targetCurrency} FX` : null,
    sourceUnitFactor !== 1 ? `price quoted per ${sourceUnitFactor} ${sourceUnit}` : null,
  ].filter(Boolean);

  return {
    status: "valid",
    normalizedPrice: Number(pricePerBase.toFixed(2)),
    normalizedCurrency: targetCurrency,
    normalizedUnit: targetUnit,
    conversionMethod: conversionDetails.length === 0
      ? "NONE"
      : sourceCurrency !== targetCurrency && sourceUnitFactor !== 1
        ? "CURRENCY_FX_AND_UNIT_FACTOR"
        : sourceCurrency !== targetCurrency ? "CURRENCY_FX" : "UNIT_FACTOR",
    conversionRate: Number((pricePerBase / numericPrice).toFixed(8)),
    conversionBasis: conversionDetails.length === 0
      ? `Quoted directly in ${targetCurrency} per ${targetUnit}`
      : conversionDetails.join("; "),
  };
}
