/**
 * API endpoint for analyst tools.
 * LLM calls these tools via natural language, we execute and return results.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/ai/provider";
import { supabase } from "@/lib/supabase";
import {
  getComparison,
  getVendorQualification,
  runAwardScenario,
  calculateSavingsView,
  getRiskSummary,
} from "@/procurement/analyst-tools";
import { updateRfx } from "@/procurement/rfx-builder";

const ANALYST_TOOLS = ["get_comparison", "get_vendor_qualification", "run_award_scenario", "calculate_savings", "get_risk_summary", "get_source_evidence", "recommend_award"] as const;
type AnalystToolName = (typeof ANALYST_TOOLS)[number];

function fallbackAnalystTool(question: string): AnalystToolName {
  const text = question.toLowerCase();
  if (/recommend|should|award|who.*award/.test(text)) return "recommend_award";
  if (/risk|issue|exception|concern/.test(text)) return "get_risk_summary";
  if (/save|savings|spend|cost/.test(text)) return "calculate_savings";
  if (/qualif|clear|questionnaire/.test(text)) return "get_vendor_qualification";
  if (/verify|evidence|source|extract/.test(text)) return "get_source_evidence";
  if (/split|cheapest|allocate|award scenario/.test(text)) return "run_award_scenario";
  return "get_comparison";
}

function resolveAnalystTool(value: string, question: string): AnalystToolName {
  const normalized = value.toLowerCase().replace(/[- ]/g, "_");
  if (ANALYST_TOOLS.includes(normalized as AnalystToolName)) return normalized as AnalystToolName;
  if (/compare|comparison|price/.test(normalized)) return "get_comparison";
  if (/qualif/.test(normalized)) return "get_vendor_qualification";
  if (/scenario|cheapest|split/.test(normalized)) return "run_award_scenario";
  if (/saving|cost/.test(normalized)) return "calculate_savings";
  if (/risk/.test(normalized)) return "get_risk_summary";
  if (/evidence|source/.test(normalized)) return "get_source_evidence";
  if (/recommend|award/.test(normalized)) return "recommend_award";
  return fallbackAnalystTool(question);
}

function narrativeContext(toolName: string, data: unknown) {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  if (toolName === "run_award_scenario") {
    const summary = record.summary as Record<string, unknown> | undefined;
    return {
      summary,
      excludedSkus: record.excludedSkus,
      awardedVendors: Array.from(
        new Set(
          Object.values((record.award ?? {}) as Record<string, { vendorName?: string }>)
            .map((award) => award.vendorName)
            .filter(Boolean),
        ),
      ),
    };
  }
  return record;
}

function fallbackNarrative(question: string, toolName: string, data: unknown) {
  const normalizedQuestion = question.toLowerCase();
  const context = narrativeContext(toolName, data) as Record<string, unknown> | undefined;
  const summary = context?.summary as Record<string, unknown> | undefined;
  const vendorsUsed = summary?.vendorsUsed;
  if (/single[- ]source|single vendor|one vendor/.test(normalizedQuestion) && typeof vendorsUsed === "number") {
    return vendorsUsed === 1
      ? "Yes. The current award scenario uses a single vendor across the awarded items."
      : `No. The current award scenario uses ${vendorsUsed} vendors, so it is not a single-source award.`;
  }
  return `I ran ${toolName.replace(/_/g, " ")} for this RFx. The structured result is available below with the supporting details.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rfxId, toolName, question } = body;

    let resolvedToolName = toolName;
    let aiReply = null;
    let provenance = null;
    let model = null;
    if (!resolvedToolName && typeof question === "string" && question.trim()) {
      const interpretation = await generateStructured({
        schema: z.object({
          toolName: z.string().optional(),
          tool: z.string().optional(),
          reply: z.string().optional().default(""),
        }).transform((value) => ({
          toolName: value.toolName || value.tool || "",
          reply: value.reply,
        })),
        prompt: `Select exactly one deterministic procurement tool for this buyer question. Never calculate or invent numbers. Use recommend_award for whether to recommend an award, run_award_scenario for split/cheapest/award questions, calculate_savings for spend/savings, get_vendor_qualification for vendor clearance, get_risk_summary for risks, get_source_evidence for values that need verification or provenance, and get_comparison for price comparisons. Question: ${question}`,
        useCase: "analyst-intent",
        documentKind: "text-derived",
      });
      resolvedToolName = resolveAnalystTool(interpretation.data.toolName, question);
      aiReply = interpretation.data.reply;
      provenance = interpretation.provenance;
      model = interpretation.model;
    }

    if (!rfxId || !resolvedToolName) {
      return NextResponse.json(
        { error: "Missing rfxId or toolName" },
        { status: 400 },
      );
    }

    let result;

    switch (resolvedToolName) {
      case "get_comparison":
        result = await getComparison(supabase!, rfxId);
        break;
      case "get_vendor_qualification":
        result = await getVendorQualification(supabase!, rfxId);
        break;
      case "run_award_scenario":
        result = await runAwardScenario(supabase!, rfxId);
        break;
      case "finalize_award": {
          const scenario = await runAwardScenario(supabase!, rfxId);
        const scenarioData = scenario.data as { summary?: { constraintsSatisfied?: { minVendorsMet?: boolean; concentrationMet?: boolean } }; [key: string]: unknown } | undefined;
        const summary = scenarioData?.summary;
        if (!scenario.success || !summary?.constraintsSatisfied?.minVendorsMet || !summary?.constraintsSatisfied?.concentrationMet) {
          return NextResponse.json({ success: false, error: "Award cannot be finalized until all award constraints are satisfied.", data: scenarioData }, { status: 422 });
        }
        const { error: analysisError } = await supabase!.from("analysis_runs").insert({
          rfx_id: rfxId,
          analysis_type: "award_finalized",
          inputs: { scenario: "cheapest_per_line_qualified_vendors" },
          result: scenarioData,
        });
        if (analysisError) throw new Error(analysisError.message);
        const updated = await updateRfx(supabase!, rfxId, { status: "COMPLETED" });
        result = { toolName: "finalize_award", success: true, data: { ...scenarioData, rfx: updated.data, message: "Award finalized for the selected RFx." } };
        break;
      }
      case "recommend_award": {
        const scenario = await runAwardScenario(supabase!, rfxId);
        if (!scenario.success) {
          result = scenario;
          break;
        }
        const scenarioData = scenario.data as { summary?: { constraintsSatisfied?: { minVendorsMet?: boolean; concentrationMet?: boolean }; totalSavings?: number; vendorsUsed?: number }; excludedSkus?: Array<{ sku: string; reason: string }> };
        const constraintsMet = Boolean(scenarioData.summary?.constraintsSatisfied?.minVendorsMet && scenarioData.summary?.constraintsSatisfied?.concentrationMet);
        const fallbackRecommendation = {
          recommend: constraintsMet && (scenarioData.excludedSkus?.length ?? 0) === 0,
          summary: constraintsMet ? "The deterministic award scenario meets the supplier-count and concentration constraints. Review the listed evidence before approval." : "Do not finalize this award yet because one or more deterministic award constraints remain unresolved.",
          risks: scenarioData.excludedSkus?.map((item) => `${item.sku}: ${item.reason}`) ?? [],
        };
        let recommendationData = fallbackRecommendation;

        let recommendationProvenance = null;
        let recommendationModel = null;
        try {
          const recommendation = await generateStructured({
            schema: z.object({
              recommend: z.boolean().optional().default(fallbackRecommendation.recommend),
              summary: z.string().optional().default(fallbackRecommendation.summary),
              risks: z.array(z.string()).optional().default(fallbackRecommendation.risks),
            }),
            prompt: `Review this deterministic procurement award scenario. Decide whether to recommend it based only on the provided constraints, exclusions, and risks. Do not recalculate, change, or invent any numbers. Return a concise buyer-facing summary and list concrete risks. Scenario JSON: ${JSON.stringify(scenario.data)}`,
            useCase: "analyst-recommendation",
            documentKind: "text-derived",
          });
          const [{ data: vendors }, { data: lineItems }] = await Promise.all([
            supabase!.from("vendors").select("id, name"),
            supabase!.from("rfx_line_items").select("id, sku, description").eq("rfx_id", rfxId),
          ]);
          const vendorNames = Object.fromEntries((vendors ?? []).map((vendor) => [vendor.id, vendor.name]));
          const itemNames = Object.fromEntries((lineItems ?? []).map((item) => [item.id, item.description || item.sku]));
          const readableRecommendation = (value: string) => value.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, (id) => vendorNames[id] || itemNames[id] || "the selected supplier");
          recommendationData = {
            ...recommendation.data,
            summary: readableRecommendation(recommendation.data.summary),
            risks: recommendation.data.risks.map(readableRecommendation),
          };
          recommendationProvenance = recommendation.provenance;
          recommendationModel = recommendation.model;
        } catch {
          recommendationData = fallbackRecommendation;
        }
        result = {
          toolName: "recommend_award",
          success: true,
          data: { scenario: scenario.data, recommendation: recommendationData },
        };
        provenance = recommendationProvenance;
        model = recommendationModel;
        break;
      }
      case "calculate_savings":
        result = await calculateSavingsView(
          supabase!,
          rfxId,
          body.scenario || "best_price",
        );
        break;
      case "get_risk_summary":
        result = await getRiskSummary(supabase!, rfxId);
        break;
      case "get_source_evidence": {
        const { data: quotes, error: quoteError } = await supabase!
          .from("vendor_quotes")
          .select("id, vendor_id, line_item_id, raw_price, raw_unit, raw_currency, normalized_price, normalized_unit, normalized_currency, confidence, validation_status, source_reference, conditions, source_document_id")
          .eq("rfx_id", rfxId)
          .in("validation_status", ["AMBIGUOUS", "FAILED", "MISSING"])
          .limit(50);
        if (quoteError) throw new Error(quoteError.message);
        const vendorIds = [...new Set((quotes ?? []).map((quote) => quote.vendor_id))];
        const lineItemIds = [...new Set((quotes ?? []).map((quote) => quote.line_item_id))];
        const documentIds = [...new Set(
          (quotes ?? [])
            .map((quote) => quote.source_document_id)
            .filter((documentId): documentId is string => Boolean(documentId)),
        )];
        const [{ data: vendors }, { data: lineItems }, { data: documents }] = await Promise.all([
          vendorIds.length
            ? supabase!.from("vendors").select("id, name").in("id", vendorIds)
            : Promise.resolve({ data: [] }),
          lineItemIds.length
            ? supabase!.from("rfx_line_items").select("id, sku").eq("rfx_id", rfxId).in("id", lineItemIds)
            : Promise.resolve({ data: [] }),
          documentIds.length
            ? supabase!.from("vendor_documents").select("id, filename").eq("rfx_id", rfxId).in("id", documentIds)
            : Promise.resolve({ data: [] }),
        ]);
        const vendorNames = Object.fromEntries((vendors ?? []).map((vendor) => [vendor.id, vendor.name]));
        const skuNames = Object.fromEntries((lineItems ?? []).map((lineItem) => [lineItem.id, lineItem.sku]));
        const documentNames = Object.fromEntries((documents ?? []).map((document) => [document.id, document.filename]));
        result = {
          toolName: "get_source_evidence",
          success: true,
          data: (quotes ?? []).map((quote) => ({
            ...quote,
            vendor_name: vendorNames[quote.vendor_id] || "Unknown vendor",
            sku: skuNames[quote.line_item_id] || "Unknown SKU",
            document_name: quote.source_document_id ? documentNames[quote.source_document_id] || "Unknown document" : null,
          })),
        };
        break;
      }
      default:
        return NextResponse.json(
          { error: `Unknown tool: ${toolName}` },
          { status: 400 },
        );
    }

    const completedResult = result as unknown as { success?: boolean; data?: unknown };
    if (typeof question === "string" && question.trim() && completedResult.success) {
      try {
        const response = await generateStructured({
          schema: z.object({ reply: z.string().min(1) }),
          prompt: `You are the procurement analyst answering the buyer directly. Use only the deterministic facts below. Start with the direct answer to the buyer's question. If the question asks whether something is feasible, answer Yes or No explicitly and explain why in one or two sentences. Mention the relevant vendors, constraints, exclusions, or missing baseline. Do not say that the result is "below" as your answer, do not ask the buyer to inspect a card, and do not invent or recalculate any numbers. Buyer question: ${question}\n\nTool used: ${resolvedToolName}\n\nDeterministic facts: ${JSON.stringify(narrativeContext(resolvedToolName, completedResult.data))}`,
          useCase: "analyst-recommendation",
          documentKind: "text-derived",
        });
        aiReply = response.data.reply;
        provenance = response.provenance;
        model = response.model;
      } catch (error) {
        console.warn("Analyst narrative generation failed; using deterministic fallback", error);
        aiReply = fallbackNarrative(question, resolvedToolName, completedResult.data);
      }
    }

    return NextResponse.json({ ...result, question, selectedTool: resolvedToolName, aiReply, provenance, model });
  } catch (error) {
    console.error("Tool execution error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Tool execution failed",
      },
      { status: 500 },
    );
  }
}
