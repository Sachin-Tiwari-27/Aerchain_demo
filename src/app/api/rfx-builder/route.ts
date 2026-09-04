import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  addCatalogItemToRfx,
  confirmLineItem,
  createRfxDraft,
  deleteRfxLineItem,
  getRfxState,
  loadFullCatalogForDemo,
  matchCatalogItems,
  updateQuestionnaire,
  updateRequirement,
  updateRfxLineItem,
  updateRfx,
  validateRfx,
} from "@/procurement/rfx-builder";

export async function GET(req: NextRequest) {
  const rfxId = req.nextUrl.searchParams.get("rfxId");

  try {
    if (!rfxId) {
      const { data: drafts, error } = await supabase!
        .from("rfxs")
        .select("id, name, category, status, updated_at, created_at")
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      const latest = drafts?.[0];
      const state = latest ? await getRfxState(supabase!, latest.id) : { data: null };
      return NextResponse.json({ success: true, data: state.data, drafts: drafts ?? [] });
    }
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
      case "create_rfx": {
        // Starts EMPTY. Line items only arrive through build_from_message.
        const draft = await createRfxDraft(supabase!);
        const state = await getRfxState(supabase!, draft.id);
        return NextResponse.json({ success: true, data: state.data, draft });
      }
      case "get_rfx_state": {
        const result = await getRfxState(supabase!, rfxId ?? null);
        return NextResponse.json(result);
      }
      case "update_rfx": {
        const result = await updateRfx(supabase!, rfxId, body.updates ?? {});
        return NextResponse.json({ success: true, data: result.data });
      }
      case "update_rfx_line_item": {
        const result = await updateRfxLineItem(supabase!, body.lineItemId, body.updates ?? {});
        return NextResponse.json({ success: true, data: result.data });
      }
      case "confirm_line_item": {
        const result = await confirmLineItem(supabase!, body.lineItemId);
        return NextResponse.json({ success: true, data: result.data });
      }
      case "delete_rfx_line_item": {
        const result = await deleteRfxLineItem(supabase!, body.lineItemId);
        return NextResponse.json(result);
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
      case "load_full_catalog_demo": {
        // Explicit demo shortcut only. Not part of the conversational path.
        const result = await loadFullCatalogForDemo(supabase!, rfxId ?? null);
        return NextResponse.json(result);
      }
      case "build_from_message": {
        const message = String(body.message ?? "").trim();
        if (!message) {
          return NextResponse.json({ success: false, error: "Message is required" }, { status: 400 });
        }

        const selectedRfxId = body.newRfx
          ? (await createRfxDraft(supabase!)).id
          : rfxId || (await createRfxDraft(supabase!)).id;

        const currentState = await getRfxState(supabase!, selectedRfxId);
        const existingSkus = (currentState.data?.lineItems ?? []).map((item: any) => item.sku);

        // Talk-driven mapping: buyer message -> subset of the fixed catalog,
        // with the deterministic post-filter inside matchCatalogItems
        // guaranteeing no hallucinated SKU reaches the database.
        const matchResult = await matchCatalogItems({ message, existingSkus });

        const addedItems: any[] = [];
        for (const match of matchResult.matches) {
          const added = await addCatalogItemToRfx(
            supabase!,
            selectedRfxId,
            match.sku,
            { annual_quantity: match.annual_quantity ?? undefined },
            "AI_SUGGESTED",
          );
          if (!added.alreadyPresent) addedItems.push(added.data);
        }

        const updated = await updateRfx(supabase!, selectedRfxId, {
          description: message,
          status: "DRAFT",
          ...((!currentState.data?.rfx?.name || currentState.data.rfx.name === "Untitled RFx") && addedItems.length > 0
            ? { name: `RFx: ${addedItems.map((item) => item.sku).join(", ")}` }
            : {}),
        });

        const finalState = await getRfxState(supabase!, selectedRfxId);

        return NextResponse.json({
          success: true,
          data: {
            ...finalState.data,
            rfx: updated.data,
            message: matchResult.reply,
            clarification: matchResult.clarification,
            newlySuggestedSkus: addedItems.map((item) => item.sku),
            droppedHallucinations: matchResult.droppedHallucinations,
          },
          rfxId: selectedRfxId,
        });
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