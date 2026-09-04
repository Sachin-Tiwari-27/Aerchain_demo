export function awardAllocation(
  vendors: Array<{ supplier: string; qualified: boolean; share: number; totalCost: number }>,
  constraints: { maxVendorShare: number; minVendors: number },
) {
  const eligibleSuppliers = vendors.filter(
    (vendor) => vendor.qualified && vendor.share <= constraints.maxVendorShare * 100,
  );

  const isValid =
    eligibleSuppliers.length >= constraints.minVendors &&
    eligibleSuppliers.every((vendor) => vendor.share <= constraints.maxVendorShare * 100);

  return {
    eligibleSuppliers: eligibleSuppliers.map(({ supplier }) => supplier),
    isValid,
  };
}

export function runKillerScenario(input: {
  lineItems: Array<{ id: string; sku: string; annualQuantity: number; currentContractPrice: number }>; 
  quotes: Array<{
    lineItemId: string;
    vendorId: string;
    vendorName: string;
    price: number;
    validationStatus?: string;
    qualificationStatus?: string;
    moq?: number | null;
  }>;
  minVendorCount: number;
  maxVendorConcentration: number;
}) {
  const qualifiedVendorNames = new Set(
    input.quotes
      .filter((quote) => quote.qualificationStatus === "QUALIFIED" || quote.qualificationStatus === "QUALIFIED_WITH_EXCEPTIONS")
      .map((quote) => quote.vendorName),
  );

  const winners = input.lineItems
    .map((lineItem) => {
      const eligible = input.quotes.filter((quote) => {
        const matchesLine = quote.lineItemId === lineItem.id;
        const usable = quote.validationStatus !== "FAILED" && quote.validationStatus !== "MISSING";
        const qualified = qualifiedVendorNames.has(quote.vendorName);
        const moqOk = quote.moq == null || quote.moq <= 0 || quote.moq <= lineItem.annualQuantity;
        return matchesLine && usable && qualified && moqOk;
      });

      if (eligible.length === 0) {
        return {
          sku: lineItem.sku,
          lineItemId: lineItem.id,
          excluded: true,
          reason: "No usable qualified quote",
        };
      }

      const winner = eligible.reduce((best, current) =>
        current.price < best.price ? current : best,
      );

      const spend = winner.price * lineItem.annualQuantity;
      const currentSpend = lineItem.currentContractPrice * lineItem.annualQuantity;

      return {
        sku: lineItem.sku,
        lineItemId: lineItem.id,
        excluded: false,
        vendorName: winner.vendorName,
        price: Number(winner.price.toFixed(4)),
        quantity: lineItem.annualQuantity,
        spend: Number(spend.toFixed(4)),
        currentSpend: Number(currentSpend.toFixed(4)),
        savings: Number((currentSpend - spend).toFixed(4)),
      };
    })
    .filter((entry) => !entry.excluded) as Array<{
      sku: string;
      lineItemId: string;
      excluded: false;
      vendorName: string;
      price: number;
      quantity: number;
      spend: number;
      currentSpend: number;
      savings: number;
    }>;

  const vendorSpend = new Map<string, number>();
  for (const winner of winners) {
    const key = winner.vendorName;
    vendorSpend.set(key, (vendorSpend.get(key) ?? 0) + winner.spend);
  }

  const totalSpend = winners.reduce((sum, item) => sum + item.spend, 0);
  const totalCurrentSpend = winners.reduce((sum, item) => sum + item.currentSpend, 0);
  const totalSavings = totalCurrentSpend - totalSpend;
  const maxShare = totalSpend > 0 ? Math.max(...Array.from(vendorSpend.values()).map((value) => (value / totalSpend) * 100), 0) : 0;

  return {
    scenario: "cheapest_per_line_qualified_vendors",
    winners,
    totalSpend: Number(totalSpend.toFixed(4)),
    totalCurrentSpend: Number(totalCurrentSpend.toFixed(4)),
    totalSavings: Number(totalSavings.toFixed(4)),
    vendorsUsed: vendorSpend.size,
    minVendorsMet: vendorSpend.size >= input.minVendorCount,
    concentrationMet: maxShare <= input.maxVendorConcentration * 100,
    maxVendorConcentrationPercent: Number(maxShare.toFixed(2)),
    excludedCount: input.lineItems.length - winners.length,
  };
}
