import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/ai/provider";
import { supabase } from "@/lib/supabase";
import {
  addRfxLineItem,
  createRfxDraft,
  deleteRfxLineItem,
  draftRfxFromSeed,
  getRfxState,
  updateQuestionnaire,
  updateRequirement,
  updateRfxLineItem,
  updateRfx,
  validateRfx,
} from "@/procurement/rfx-builder";

function extractBuyerItems(message: string) {
  const itemPattern = /(?:(\d+)\s*[- ]?ply\s+)?([a-z][a-z0-9 -]*?(?:carton|box|mailer|insert|crate|divider|packaging))(?:\s+(\d[\d,]*)\s*(?:pcs?|pieces?|units?))?(?:\s+(\d+)\s*(?:x|by|×)\s*(\d+)\s*(?:x|by|×)\s*(\d+))?/gi;
  const items: Array<Record<string, unknown>> = [];
  for (const match of message.matchAll(itemPattern)) {
    const description = match[2]?.trim();
    if (!description) continue;
    const dimensions = match[4] ? { length_mm: Number(match[4]), width_mm: Number(match[5]), height_mm: Number(match[6]) } : {};
    const quantityMatch = message.slice(match.index ?? 0).match(/^(?:[^.!?]*?)(\d[\d,]*)\s*(?:pcs?|pieces?|units?)/i);
    const ply = match[1] ? Number(match[1]) : undefined;
    items.push({
      sku: `REQ-${Date.now().toString().slice(-6)}-${items.length + 1}`,
      description: `${ply ? `${ply}-ply ` : ""}${description}`,
      annual_quantity: quantityMatch ? Number(quantityMatch[1].replace(/,/g, "")) : 0,
      unit: "pcs",
      ...(ply ? { ply } : {}),
      ...dimensions,
    });
  }

  return items;
}

function extractReferencedSkus(message: string) {
  const explicit = [...message.matchAll(/\bCP[- ]?(\d{1,3})\b/gi)].map((match) => `CP-${match[1].padStart(3, "0")}`);
  const shorthand = message.match(/\b(\d{1,3})\s*(?:and|&)\s*(\d{1,3})\s+items?\b/i);
  if (shorthand) {
    explicit.push(`CP-${shorthand[1].padStart(3, "0")}`, `CP-${shorthand[2].padStart(3, "0")}`);
  }
  return [...new Set(explicit)];
}

function missingSchemaFields(items: Array<Record<string, unknown>>, message: string) {
  const missing: string[] = [];
  if (items.some((item) => !item.ply) && !/\d+\s*[- ]?ply/i.test(message)) missing.push("ply or board construction");
  if (items.some((item) => !item.annual_quantity)) missing.push("quantity for each line item");
  if (items.some((item) => !item.gsm)) missing.push("GSM or board grade");
  if (items.some((item) => !item.length_mm || !item.width_mm || !item.height_mm) && !/(\d+)\s*(?:x|by|×)\s*(\d+)\s*(?:x|by|×)\s*(\d+)/i.test(message)) missing.push("dimensions for each line item");
  if (!/(?:delivery location|deliver to|ship to|plant|warehouse)/i.test(message)) missing.push("delivery location");
  if (!/(?:lead time|delivery within|deliver in|days?)/i.test(message)) missing.push("lead-time limit");
  return missing.slice(0, 2);
}

function extractFollowUpFields(message: string, itemCount: number) {
  const quantities = [...message.matchAll(/(\d[\d,]*)\s*(?:pcs?|pieces?|units?)/gi)].map((match) => Number(match[1].replace(/,/g, "")));
  const dimensions = [...message.matchAll(/(\d+)\s*(?:x|by|×)\s*(\d+)\s*(?:x|by|×)\s*(\d+)/gi)].map((match) => ({ length_mm: Number(match[1]), width_mm: Number(match[2]), height_mm: Number(match[3]) }));
  const gsm = message.match(/(\d+)\s*gsm/i)?.[1];
  const updates: Array<Record<string, unknown>> = [];
  for (let index = 0; index < itemCount; index += 1) {
    updates.push({
      ...(quantities[index] ? { annual_quantity: quantities[index] } : {}),
      ...(dimensions[index] ?? {}),
      ...(gsm ? { gsm: Number(gsm) } : {}),
    });
  }
  return updates;
}

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
      case "add_rfx_line_item": {
        const result = await addRfxLineItem(supabase!, rfxId, body.item ?? {});
        return NextResponse.json({ success: true, data: result.data });
      }
      case "update_rfx_line_item": {
        const result = await updateRfxLineItem(supabase!, body.lineItemId, body.updates ?? {});
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
      case "draft_rfx_from_seed": {
        const result = await draftRfxFromSeed(supabase!, rfxId ?? null);
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
        const interpretation = await generateStructured({
          schema: z.object({
            name: z.string().nullable().default(null),
            category: z.string().nullable().default(null),
            lineItems: z.array(z.object({
              sku: z.string().nullable().default(null),
              description: z.string().nullable().default(null),
              ply: z.number().nullable().default(null),
              gsm: z.number().nullable().default(null),
              length_mm: z.number().nullable().default(null),
              width_mm: z.number().nullable().default(null),
              height_mm: z.number().nullable().default(null),
              annual_quantity: z.number().nullable().default(null),
              unit: z.string().nullable().default(null),
            })).default([]),
            reply: z.string().default("I updated the RFx draft from your request."),
          }),
          prompt: `You are updating an RFx from an ongoing buyer conversation. Extract only fields explicitly present in the latest message and map them to this schema: lineItems [{sku, description, ply, gsm, length_mm, width_mm, height_mm, annual_quantity, unit}], plus name, category, reply. Use null for unknown fields and an empty array when no line-item field is present. Do not ask generic supplier questions. Existing RFx state: ${JSON.stringify(currentState.data)} Latest buyer message: ${message}`,
          useCase: "rfx-draft",
          documentKind: "text-derived",
        });
        const inferredItems = extractBuyerItems(message);
        const referencedSkus = extractReferencedSkus(message);
        const existingItems = currentState.data?.lineItems ?? [];
        for (const inferredItem of referencedSkus.length > 0 ? [] : inferredItems) {
          const itemAlreadyAdded = existingItems.some(
            (item: any) => String(item.description ?? "").toLowerCase() === String(inferredItem.description ?? "").toLowerCase()
              && Number(item.annual_quantity) === inferredItem.annual_quantity,
          );
          if (!itemAlreadyAdded) await addRfxLineItem(supabase!, selectedRfxId, inferredItem);
        }
        const refreshedState = await getRfxState(supabase!, selectedRfxId);
        const requestItems = refreshedState.data?.lineItems?.filter((item: any) => String(item.sku).startsWith("REQ-")) ?? [];
        if (referencedSkus.length > 0 && requestItems.length > 0) {
          for (const requestItem of requestItems) {
            await deleteRfxLineItem(supabase!, requestItem.id);
          }
        }
        const followUpUpdates = extractFollowUpFields(message, requestItems.length);
        for (const [index, updates] of followUpUpdates.entries()) {
          if (Object.keys(updates).length > 0 && requestItems[index]) {
            await updateRfxLineItem(supabase!, requestItems[index].id, updates);
          }
        }
        for (const item of interpretation.data.lineItems) {
          const target = requestItems.find((existing: any) => item.sku && existing.sku === item.sku)
            ?? requestItems.find((existing: any) => item.description && existing.description?.toLowerCase().includes(item.description.toLowerCase()));
          if (target) {
            const updates = Object.fromEntries(Object.entries(item).filter(([, value]) => value !== null));
            delete updates.sku;
            if (Object.keys(updates).length > 0) await updateRfxLineItem(supabase!, target.id, updates);
          }
        }
        const updated = await updateRfx(supabase!, selectedRfxId, {
          description: message,
          ...(interpretation.data.name ? { name: interpretation.data.name } : {}),
          ...(interpretation.data.category ? { category: interpretation.data.category } : {}),
          status: "DRAFT",
        });
        const finalState = await getRfxState(supabase!, selectedRfxId);
        const unresolvedItems = finalState.data?.lineItems?.filter((item: any) => String(item.sku).startsWith("REQ-")) ?? [];
        const missing = missingSchemaFields(unresolvedItems, message);
        const mappingReply = referencedSkus.length > 0 ? `Mapped the request to ${referencedSkus.join(" and ")} from the existing RFx catalog.` : interpretation.data.reply;
        return NextResponse.json({ success: true, data: { ...finalState.data, rfx: updated.data, message: mappingReply, clarification: missing.length > 0 ? `Still needed from the RFx schema: ${missing.join(" and ")}.` : null, provenance: interpretation.provenance }, rfxId: selectedRfxId });
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
