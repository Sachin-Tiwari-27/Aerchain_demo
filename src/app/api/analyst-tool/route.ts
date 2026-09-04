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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rfxId, toolName, question } = body;

    let resolvedToolName = toolName;
    let aiReply = null;
    let provenance = null;
    if (!resolvedToolName && typeof question === "string" && question.trim()) {
      const interpretation = await generateStructured({
        schema: z.object({
          toolName: z.enum(["get_comparison", "get_vendor_qualification", "run_award_scenario", "calculate_savings", "get_risk_summary", "recommend_award"]),
          reply: z.string(),
        }),
        prompt: `Select exactly one deterministic procurement tool for this buyer question. Never calculate or invent numbers. Use recommend_award for whether to recommend an award, run_award_scenario for split/cheapest/award questions, calculate_savings for spend/savings, get_vendor_qualification for vendor clearance, get_risk_summary for risks, and get_comparison for price comparisons. Question: ${question}`,
        useCase: "analyst-intent",
        documentKind: "text-derived",
      });
      resolvedToolName = interpretation.data.toolName;
      aiReply = interpretation.data.reply;
      provenance = interpretation.provenance;
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
      case "recommend_award": {
        const scenario = await runAwardScenario(supabase!, rfxId);
        if (!scenario.success) {
          result = scenario;
          break;
        }
        const recommendation = await generateStructured({
          schema: z.object({
            recommend: z.boolean(),
            summary: z.string(),
            risks: z.array(z.string()),
          }),
          prompt: `Review this deterministic procurement award scenario. Decide whether to recommend it based only on the provided constraints, exclusions, and risks. Do not recalculate, change, or invent any numbers. Return a concise buyer-facing summary and list concrete risks. Scenario JSON: ${JSON.stringify(scenario.data)}`,
          useCase: "analyst-recommendation",
          documentKind: "text-derived",
        });
        result = {
          toolName: "recommend_award",
          success: true,
          data: { scenario: scenario.data, recommendation: recommendation.data },
        };
        provenance = recommendation.provenance;
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
      default:
        return NextResponse.json(
          { error: `Unknown tool: ${toolName}` },
          { status: 400 },
        );
    }

    return NextResponse.json({ ...result, question, selectedTool: resolvedToolName, aiReply, provenance });
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
