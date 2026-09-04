import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/ai/provider";
import { supabase } from "@/lib/supabase";
import {
  addRfxLineItem,
  draftRfxFromSeed,
  getRfxState,
  updateQuestionnaire,
  updateRequirement,
  updateRfx,
  validateRfx,
} from "@/procurement/rfx-builder";

export async function GET(req: NextRequest) {
  const rfxId = req.nextUrl.searchParams.get("rfxId");

  try {
    const result = await getRfxState(supabase!, rfxId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, rfxId } = body;

    switch (action) {
      case "get_rfx_state": {
        const result = await getRfxState(supabase!, rfxId ?? null);
        return NextResponse.json(result);
      }
      case "update_rfx": {
        const result = await updateRfx(supabase!, rfxId, body.updates ?? {});
        return NextResponse.json({ success: true, data: result.data });
      }
      case "add_rfx_line_item": {
        const result = await addRfxLineItem(supabase!, rfxId, body.item ?? {});
        return NextResponse.json({ success: true, data: result.data });
      }
      case "update_requirement": {
        const result = await updateRequirement(supabase!, body.requirementId, body.updates ?? {});
        return NextResponse.json({ success: true, data: result.data });
      }
      case "update_questionnaire": {
        const result = await updateQuestionnaire(supabase!, body.questionnaireId, body.updates ?? {});
        return NextResponse.json({ success: true, data: result.data });
      }
      case "validate_rfx": {
        const result = await validateRfx(supabase!, rfxId);
        return NextResponse.json(result);
      }
      case "draft_rfx_from_seed": {
        const result = await draftRfxFromSeed(supabase!, rfxId ?? null);
        return NextResponse.json(result);
      }
      case "build_from_message": {
        const message = String(body.message ?? "").trim();
        if (!message) {
          return NextResponse.json({ success: false, error: "Message is required" }, { status: 400 });
        }
        const interpretation = await generateStructured({
          schema: z.object({
            name: z.string().nullable(),
            category: z.string().nullable(),
            clarification: z.string().nullable(),
            reply: z.string(),
          }),
          prompt: `Interpret this buyer request for an RFx builder. Extract only what the buyer said; do not invent suppliers, SKUs, prices, or quantities. Use null when a field is not stated. Return a concise reply. Buyer request: ${message}`,
          useCase: "rfx-draft",
          documentKind: "text-derived",
        });
        const draft = await draftRfxFromSeed(supabase!, rfxId ?? null);
        const updated = await updateRfx(supabase!, draft.data.rfx.id, {
          description: message,
          ...(interpretation.data.name ? { name: interpretation.data.name } : {}),
          ...(interpretation.data.category ? { category: interpretation.data.category } : {}),
          status: "DRAFT",
        });
        const state = await getRfxState(supabase!, draft.data.rfx.id);
        return NextResponse.json({ success: true, data: { ...state.data, rfx: updated.data, message: interpretation.data.reply, clarification: interpretation.data.clarification, provenance: interpretation.provenance } });
      }
      case "approve_rfx": {
        const result = await validateRfx(supabase!, rfxId);
        if (!result.valid) return NextResponse.json(result);
        const updated = await updateRfx(supabase!, rfxId, { status: "SENT" });
        return NextResponse.json({ success: true, data: { ...result.data, rfx: updated.data, message: "RFx approved and marked ready to send" } });
      }
      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown server error" }, { status: 500 });
  }
}
