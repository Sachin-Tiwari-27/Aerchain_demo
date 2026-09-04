/**
 * Analyst tools: deterministic functions that answer procurement questions.
 * LLM calls these, never recalculates numbers — LLM explains the results only.
 */
import { parseUnitFactor } from "@/procurement/normalization";

export type AnalystToolResult = {
  toolName: string;
  success: boolean;
  data?: unknown;
  error?: string;
};

/** Keep financial calculations on the exact unit and currency requested by the RFx. */
function quotesMatchingComparisonBasis(
  quotes: any[],
  lineItems: any[],
  rfxCurrency: string | null | undefined,
): any[] {
  const targetCurrency = rfxCurrency?.toUpperCase() || "INR";
  const targetUnitByLineItem = new Map(
    lineItems.map((lineItem) => [
      lineItem.id,
      parseUnitFactor(lineItem.unit)?.baseUnit ?? (lineItem.unit?.trim().toLowerCase() || "pcs"),
    ]),
  );

  return quotes.filter((quote) =>
    quote.normalized_currency?.toUpperCase() === targetCurrency
    && quote.normalized_unit?.toLowerCase() === targetUnitByLineItem.get(quote.line_item_id),
  );
}

/**
 * Tool: Get vendor comparison matrix (best price per SKU)
 */
export async function getComparison(
  supabase: any,
  rfxId: string,
): Promise<AnalystToolResult> {
  try {
    const { data: quotes } = await supabase
      .from("vendor_quotes")
      .select("line_item_id, vendor_id, normalized_price, normalized_currency, validation_status")
      .eq("rfx_id", rfxId)
      .eq("validation_status", "VALID")
      .not("normalized_price", "is", null);

    if (!quotes || quotes.length === 0) {
      return { toolName: "get_comparison", success: false, error: "No quotes found" };
    }

    const [{ data: lineItems }, { data: vendors }] = await Promise.all([
      supabase.from("rfx_line_items").select("id, sku").eq("rfx_id", rfxId),
      supabase.from("vendors").select("id, name"),
    ]);
    const skuById = Object.fromEntries((lineItems || []).map((item: any) => [item.id, item.sku]));
    const vendorById = Object.fromEntries((vendors || []).map((vendor: any) => [vendor.id, vendor.name]));

    // Group by line item and return human-readable identifiers.
    const comparison: Record<
      string,
      { lineItemId: string; sku: string; bestVendor: string; bestVendorName: string; bestPrice: number; allVendors: string[]; vendorNames: string[] }
    > = {};

    (quotes as any[]).forEach((q) => {
      if (!comparison[q.line_item_id]) {
        comparison[q.line_item_id] = {
          lineItemId: q.line_item_id,
          sku: skuById[q.line_item_id] || "Unknown SKU",
          bestVendor: q.vendor_id,
          bestVendorName: vendorById[q.vendor_id] || "Unknown vendor",
          bestPrice: q.normalized_price,
          allVendors: [q.vendor_id],
          vendorNames: [vendorById[q.vendor_id] || "Unknown vendor"],
        };
      } else {
        if (q.normalized_price < comparison[q.line_item_id].bestPrice) {
          comparison[q.line_item_id].bestVendor = q.vendor_id;
          comparison[q.line_item_id].bestVendorName = vendorById[q.vendor_id] || "Unknown vendor";
          comparison[q.line_item_id].bestPrice = q.normalized_price;
        }
        if (!comparison[q.line_item_id].allVendors.includes(q.vendor_id)) {
          comparison[q.line_item_id].allVendors.push(q.vendor_id);
          comparison[q.line_item_id].vendorNames.push(vendorById[q.vendor_id] || "Unknown vendor");
        }
      }
    });

    return {
      toolName: "get_comparison",
      success: true,
      data: Object.values(comparison),
    };
  } catch (err) {
    return {
      toolName: "get_comparison",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Tool: Get vendor qualification summary
 */
export async function getVendorQualification(
  supabase: any,
  rfxId: string,
): Promise<AnalystToolResult> {
  try {
    const { data: responses } = await supabase
      .from("vendor_responses")
      .select("vendor_id, status")
      .eq("rfx_id", rfxId);

    const { data: vendors } = await supabase.from("vendors").select("id, name");

    const result = (responses || []).map((r: any) => {
      const vendor = (vendors || []).find((v: any) => v.id === r.vendor_id);
      return {
        vendorId: r.vendor_id,
        vendorName: vendor?.name || "Unknown",
        qualificationStatus: r.status || "UNKNOWN",
      };
    });

    return { toolName: "get_vendor_qualification", success: true, data: result };
  } catch (err) {
    return {
      toolName: "get_vendor_qualification",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Tool: Run the "killer scenario" award allocation
 * Input: rfxId
 * Output: Award split (cheapest per line among qualified vendors), spend vs contract, excluded SKUs
 * 
 * Logic:
 * 1. Filter to QUALIFIED vendors only
 * 2. For each SKU, pick the cheapest quote from qualified vendors
 * 3. Enforce MOQ constraints
 * 4. Enforce minimum 2 vendors
 * 5. Enforce ≤70% concentration
 * 6. Calculate total spend and savings vs current contract
 * 7. List excluded SKUs and reasons
 */
export async function runAwardScenario(
  supabase: any,
  rfxId: string,
): Promise<AnalystToolResult> {
  try {
    // Get all vendors and their qualification status
    const { data: responses } = await supabase
      .from("vendor_responses")
      .select("vendor_id, status")
      .eq("rfx_id", rfxId);

    const qualifiedVendorIds = new Set(
      (responses || [])
        .filter((r: any) => r.status === "QUALIFIED" || r.status === "QUALIFIED_WITH_EXCEPTIONS")
        .map((r: any) => r.vendor_id),
    );

    if (qualifiedVendorIds.size === 0) {
      return {
        toolName: "run_award_scenario",
        success: false,
        error: "No qualified vendors available",
      };
    }

    // Get all quotes from qualified vendors
    const { data: quotes } = await supabase
      .from("vendor_quotes")
      .select("*")
      .eq("rfx_id", rfxId)
      .eq("validation_status", "VALID")
      .not("normalized_price", "is", null);

    let qualifiedQuotes: any[] = [];

    // Get line items for reference
    const { data: lineItems } = await supabase
      .from("rfx_line_items")
      .select("id, sku, description, annual_quantity, unit")
      .eq("rfx_id", rfxId);

    const { data: rfx } = await supabase
      .from("rfxs")
      .select("currency")
      .eq("id", rfxId)
      .maybeSingle();

    const comparableQuotes = quotesMatchingComparisonBasis(quotes || [], lineItems || [], rfx?.currency);
    qualifiedQuotes = comparableQuotes.filter((q: any) => qualifiedVendorIds.has(q.vendor_id));

    // Get vendors for names
    const { data: vendors } = await supabase.from("vendors").select("id, name");
    const vendorMap: Record<string, string> = {};
    (vendors || []).forEach((v: any) => {
      vendorMap[v.id] = v.name;
    });

    // Get current contract prices
    const { data: contractPrices } = await supabase
      .from("current_contract_prices")
      .select("*")
      .eq("rfx_id", rfxId);

    const contractPriceMap: Record<string, number> = {};
    (contractPrices || []).forEach((cp: any) => {
      contractPriceMap[cp.line_item_id] = cp.price;
    });

    // Build award allocation: cheapest per SKU
    const awardByLineItem: Record<string, any> = {};
    const excludedSkus: Array<{ sku: string; reason: string }> = [];

    (lineItems || []).forEach((li: any) => {
      const skuQuotes = qualifiedQuotes.filter((q: any) => q.line_item_id === li.id);

      if (skuQuotes.length === 0) {
        excludedSkus.push({ sku: li.description || li.sku, reason: "No quotes from qualified vendors" });
        return;
      }

      // Sort by price, pick cheapest
      const cheapest = skuQuotes.reduce((prev: any, curr: any) =>
        curr.normalized_price < prev.normalized_price ? curr : prev,
      );

      // Check MOQ constraint
      if (
        cheapest.moq !== null &&
        cheapest.moq > 0 &&
        cheapest.moq > (li.annual_quantity || 0)
      ) {
        excludedSkus.push({
          sku: li.description || li.sku,
          reason: `MOQ ${cheapest.moq} exceeds annual quantity ${li.annual_quantity}`,
        });
        return;
      }

      awardByLineItem[li.id] = {
        vendorId: cheapest.vendor_id,
        vendorName: vendorMap[cheapest.vendor_id] || "Unknown",
        awardedPrice: cheapest.normalized_price,
        currentPrice: contractPriceMap[li.id] || null,
        quantity: li.annual_quantity,
        totalCost: (cheapest.normalized_price || 0) * (li.annual_quantity || 1),
        totalCurrentCost: (contractPriceMap[li.id] || 0) * (li.annual_quantity || 1),
      };
    });

    // Calculate totals
    let totalAwardCost = 0;
    let totalCurrentCost = 0;
    (Object.values(awardByLineItem) as any[]).forEach((award) => {
      totalAwardCost += award.totalCost;
      totalCurrentCost += award.totalCurrentCost;
    });

    const totalSavings = totalCurrentCost - totalAwardCost;
    const baselineAvailable =
      Object.keys(awardByLineItem).length > 0 &&
      Object.values(awardByLineItem).every((award: any) => award.currentPrice !== null);
    const savingsPercent =
      baselineAvailable && totalCurrentCost > 0
        ? ((totalSavings / totalCurrentCost) * 100).toFixed(1)
        : null;

    // Check vendor concentration
    const vendorCounts: Record<string, number> = {};
    const vendorCosts: Record<string, number> = {};
    (Object.values(awardByLineItem) as any[]).forEach((award) => {
      vendorCounts[award.vendorId] = (vendorCounts[award.vendorId] || 0) + 1;
      vendorCosts[award.vendorId] = (vendorCosts[award.vendorId] || 0) + award.totalCost;
    });

    const vendorsUsed = Object.keys(vendorCounts).length;
    const concentrationVendor = Object.entries(vendorCosts).reduce((a, b) =>
      b[1] > a[1] ? b : a,
    );
    const concentrationPercent =
      totalAwardCost > 0
        ? ((concentrationVendor[1] / totalAwardCost) * 100).toFixed(1)
        : "0";

    const constraints = {
      minVendorsMet: vendorsUsed >= 2,
      concentrationMet: parseFloat(concentrationPercent as string) <= 70,
      message:
        vendorsUsed < 2
          ? `Only ${vendorsUsed} vendor(s) used; minimum 2 required`
          : parseFloat(concentrationPercent as string) > 70
            ? `${vendorMap[concentrationVendor[0]] || "A supplier"} has ${concentrationPercent}% share; max 70% allowed`
            : "✅ All constraints met",
    };

    return {
      toolName: "run_award_scenario",
      success: true,
      data: {
        scenario: "cheapest_per_line_qualified_vendors",
        award: awardByLineItem,
        summary: {
          totalAwardCost: Math.round(totalAwardCost),
          totalCurrentCost: baselineAvailable ? Math.round(totalCurrentCost) : null,
          totalSavings: baselineAvailable ? Math.round(totalSavings) : null,
          savingsPercent,
          baselineAvailable,
          baselineMessage: baselineAvailable
            ? null
            : "Current contract baseline is unavailable for all awarded SKUs",
          vendorsUsed,
          concentrationPercent,
          constraintsSatisfied: constraints,
        },
        excludedSkus,
        risks: excludedSkus.length > 0 ? `${excludedSkus.length} SKUs cannot be sourced` : null,
      },
    };
  } catch (err) {
    return {
      toolName: "run_award_scenario",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Tool: Calculate savings for a given scenario
 */
export async function calculateSavingsView(
  supabase: any,
  rfxId: string,
  scenario: "best_price" | "best_quality" | "balanced",
): Promise<AnalystToolResult> {
  try {
    const { data: quotes } = await supabase
      .from("vendor_quotes")
      .select("*")
      .eq("rfx_id", rfxId)
      .eq("validation_status", "VALID")
      .not("normalized_price", "is", null);

    const { data: lineItems } = await supabase
      .from("rfx_line_items")
      .select("id, annual_quantity, unit")
      .eq("rfx_id", rfxId);

    const { data: rfx } = await supabase
      .from("rfxs")
      .select("currency")
      .eq("id", rfxId)
      .maybeSingle();

    const comparableQuotes = quotesMatchingComparisonBasis(quotes || [], lineItems || [], rfx?.currency);

    const { data: contractPrices } = await supabase
      .from("current_contract_prices")
      .select("*")
      .eq("rfx_id", rfxId);

    const contractMap: Record<string, number> = {};
    (contractPrices || []).forEach((cp: any) => {
      contractMap[cp.line_item_id] = cp.price;
    });

    let totalAwardCost = 0;
    let totalCurrentCost = 0;

    (lineItems || []).forEach((li: any) => {
      const skuQuotes = comparableQuotes.filter((q: any) => q.line_item_id === li.id);
      if (skuQuotes.length === 0) return;

      const cheapest = skuQuotes.reduce((a: any, b: any) =>
        b.normalized_price < a.normalized_price ? b : a,
      );
      const quantity = li.annual_quantity || 1;

      totalAwardCost += (cheapest.normalized_price || 0) * quantity;
      totalCurrentCost += (contractMap[li.id] || 0) * quantity;
    });

    const baselineAvailable =
      (lineItems || []).some((li: any) => comparableQuotes.some((q: any) => q.line_item_id === li.id)) &&
      (lineItems || [])
        .filter((li: any) => comparableQuotes.some((q: any) => q.line_item_id === li.id))
        .every((li: any) => contractMap[li.id] !== undefined);
    const savings = baselineAvailable ? totalCurrentCost - totalAwardCost : null;

    return {
      toolName: "calculate_savings",
      success: true,
      data: {
        scenario,
        currentSpend: baselineAvailable ? Math.round(totalCurrentCost) : null,
        proposedSpend: Math.round(totalAwardCost),
        savings: savings === null ? null : Math.round(savings),
        savingsPercent: savings === null || totalCurrentCost <= 0
          ? null
          : ((savings / totalCurrentCost) * 100).toFixed(1),
        baselineAvailable,
        baselineMessage: baselineAvailable
          ? null
          : "Current contract baseline is unavailable for the comparable SKUs",
      },
    };
  } catch (err) {
    return {
      toolName: "calculate_savings",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Tool: Get risk summary (failed vendors, missing quotes, etc.)
 */
export async function getRiskSummary(
  supabase: any,
  rfxId: string,
): Promise<AnalystToolResult> {
  try {
    const { data: responses } = await supabase
      .from("vendor_responses")
      .select("vendor_id, status")
      .eq("rfx_id", rfxId);

    const { data: quotes } = await supabase
      .from("vendor_quotes")
      .select("line_item_id, validation_status")
      .eq("rfx_id", rfxId);

    const failedVendors = (responses || []).filter((r: any) => r.status === "FAILED");
    const reviewVendors = (responses || []).filter((r: any) => r.status === "REVIEW");
    const missingQuotes = (quotes || []).filter((q: any) => q.validation_status === "MISSING");
    const ambiguousQuotes = (quotes || []).filter((q: any) => q.validation_status === "AMBIGUOUS");

    return {
      toolName: "get_risk_summary",
      success: true,
      data: {
        failedVendors: failedVendors.length,
        reviewVendors: reviewVendors.length,
        missingQuotes: missingQuotes.length,
        ambiguousQuotes: ambiguousQuotes.length,
        riskLevel:
          failedVendors.length > 0 || missingQuotes.length > 10
            ? "HIGH"
            : ambiguousQuotes.length > 5
              ? "MEDIUM"
              : "LOW",
      },
    };
  } catch (err) {
    return {
      toolName: "get_risk_summary",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
