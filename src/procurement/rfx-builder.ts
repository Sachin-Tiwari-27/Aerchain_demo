import { z } from "zod";
import { generateStructured } from "@/ai/provider";
import { SKU_CATALOG, CATALOG_SKU_SET, getCatalogItem, renderCatalogForPrompt } from "@/procurement/catalog";

export const RFX_TEMPLATE_REQUIREMENTS = [
  {
    type: "spec",
    name: "Annual requirement volume",
    value: { target: "Full-year demand" },
    status: "AI_SUGGESTED",
    source: "seed-template",
    confidence: 0.98,
  },
  {
    type: "commercial",
    name: "Lead time cap",
    value: { maxLeadTimeDays: 14 },
    status: "AI_SUGGESTED",
    source: "seed-template",
    confidence: 0.95,
  },
];

export const RFX_TEMPLATE_QUESTIONNAIRE = [
  { question_number: 1, question: "Do you have ISO 9001 certification on the production line?", required: true, category: "QUALITY" },
  { question_number: 2, question: "What is your typical lead time for repeat carton orders?", required: true, category: "DELIVERY" },
  { question_number: 3, question: "Can you support MOQ flexibility for seasonal spikes?", required: false, category: "COMMERCIAL" },
  { question_number: 4, question: "Do you offer printed branding for corrugated cartons?", required: false, category: "TECHNICAL" },
  { question_number: 5, question: "What quality control checks are performed before dispatch (e.g. batch testing, sampling)?", required: true, category: "QUALITY" },
  { question_number: 6, question: "What is your general MOQ policy? (e.g. flat minimum, tiered by order value, varies by product line)", required: true, category: "COMMERCIAL" },
  { question_number: 7, question: "How do you handle damaged/rejected shipments - replacement, credit, or deduction?", required: false, category: "LOGISTICS" },
  { question_number: 8, question: "Are there any conditions under which your quoted pricing would change during the contract period?", required: false, category: "COMMERCIAL" },
];

async function ensureRfxQuestionnaire(supabase: any, rfxId: string) {
  const { data: existing, error: existingError } = await supabase
    .from("rfx_questionnaire")
    .select("id")
    .eq("rfx_id", rfxId)
    .limit(1);
  if (existingError) throw new Error(existingError.message);
  if (existing && existing.length > 0) return;

  const { error } = await supabase.from("rfx_questionnaire").insert(
    RFX_TEMPLATE_QUESTIONNAIRE.map((question) => ({ ...question, rfx_id: rfxId })),
  );
  if (error) throw new Error(error.message);
}

export async function ensureRfxDraft(supabase: any) {
  const { data: existing, error: listError } = await supabase
    .from("rfxs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (listError) throw new Error(listError.message);
  if (existing && existing.length > 0) {
    return existing[0];
  }

  const { data, error } = await supabase
    .from("rfxs")
    .insert({
      name: "India corrugated packaging procurement",
      category: "Corrugated Packaging",
      description: "Draft RFx created from a buyer conversation.",
      status: "DRAFT",
      currency: "INR",
      max_lead_time_days: 14,
      max_vendor_share: 0.7,
      minimum_awarded_vendors: 2,
    })
    .select();

  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

/**
 * Creates a brand-new, EMPTY RFx draft. Line items are added only through
 * the conversational catalog-matching flow (matchCatalogItems + addCatalogItemToRfx),
 * never pre-populated. This is the core scope constraint: a buyer talks
 * their way to a subset of the fixed catalog, they don't inherit the whole thing.
 */
export async function createRfxDraft(supabase: any) {
  const { data, error } = await supabase
    .from("rfxs")
    .insert({
      name: "Untitled RFx",
      category: "Corrugated Packaging",
      description: null,
      status: "DRAFT",
      currency: "INR",
      max_lead_time_days: null,
      max_vendor_share: 0.7,
      minimum_awarded_vendors: 2,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  await ensureRfxQuestionnaire(supabase, data.id);
  return data;
}

export async function getRfxState(supabase: any, rfxId?: string | null) {
  const resolvedId = rfxId || (await ensureRfxDraft(supabase))?.id;
  if (!resolvedId) {
    return { success: true, data: { rfx: null, lineItems: [], requirements: [], questionnaire: [] }, error: null };
  }

  const [rfxRes, lineItemsRes, requirementRes, questionnaireRes] = await Promise.all([
    supabase.from("rfxs").select("*").eq("id", resolvedId).maybeSingle(),
    supabase.from("rfx_line_items").select("*").eq("rfx_id", resolvedId).order("created_at", { ascending: true }),
    supabase.from("rfx_requirements").select("*").eq("rfx_id", resolvedId).order("created_at", { ascending: true }),
    supabase.from("rfx_questionnaire").select("*").eq("rfx_id", resolvedId).order("question_number", { ascending: true }),
  ]);

  const state = {
    rfx: rfxRes.data,
    lineItems: lineItemsRes.data ?? [],
    requirements: requirementRes.data ?? [],
    questionnaire: questionnaireRes.data ?? [],
  };

  return { success: !rfxRes.error, data: state, error: rfxRes.error?.message ?? null };
}

export async function updateRfx(supabase: any, rfxId: string, updates: Record<string, unknown>) {
  const allowed = [
    "name",
    "category",
    "description",
    "status",
    "currency",
    "max_lead_time_days",
    "max_vendor_share",
    "minimum_awarded_vendors",
  ];

  const disallowed = Object.keys(updates).filter((key) => !allowed.includes(key));
  if (disallowed.length > 0) {
    throw new Error(`Unsupported RFx field update: ${disallowed.join(", ")}`);
  }

  const { data, error } = await supabase
    .from("rfxs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", rfxId)
    .select();

  if (error) throw new Error(error.message);
  return { success: true, data: data?.[0] ?? null };
}

/**
 * Adds ONE catalog item to an RFx by SKU. Refuses any SKU not present in
 * SKU_CATALOG — this is the deterministic backstop behind the AI matching
 * step, so a hallucinated SKU can never reach the database.
 */
export async function addCatalogItemToRfx(
  supabase: any,
  rfxId: string,
  sku: string,
  overrides: { annual_quantity?: number | null } = {},
  status: "AI_SUGGESTED" | "BUYER_CONFIRMED" = "AI_SUGGESTED",
) {
  const catalogItem = getCatalogItem(sku);
  if (!catalogItem) {
    throw new Error(`SKU ${sku} is not part of the fixed catalog and cannot be added`);
  }

  const { data: existing } = await supabase
    .from("rfx_line_items")
    .select("id")
    .eq("rfx_id", rfxId)
    .eq("sku", sku)
    .maybeSingle();
  if (existing) {
    return { success: true, data: existing, alreadyPresent: true };
  }

  const payload = {
    rfx_id: rfxId,
    sku: catalogItem.sku,
    description: catalogItem.description,
    ply: catalogItem.ply,
    gsm: catalogItem.gsm,
    bursting_strength: catalogItem.burstingStrength,
    annual_quantity: overrides.annual_quantity ?? catalogItem.defaultAnnualQuantity,
    unit: catalogItem.unit,
    status,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("rfx_line_items").insert(payload).select();
  if (error) throw new Error(error.message);
  return { success: true, data: data?.[0] ?? null, alreadyPresent: false };
}

export async function updateRfxLineItem(supabase: any, lineItemId: string, updates: Record<string, unknown>) {
  const allowed = ["annual_quantity", "unit", "status"];
  const disallowed = Object.keys(updates).filter((key) => !allowed.includes(key));
  if (disallowed.length > 0) throw new Error(`Unsupported line-item field update: ${disallowed.join(", ")}. SKU, description, ply, and gsm come from the fixed catalog and cannot be edited.`);
  if (updates.status && !["AI_SUGGESTED", "BUYER_CONFIRMED"].includes(String(updates.status))) {
    throw new Error("Line item status must be AI_SUGGESTED or BUYER_CONFIRMED");
  }

  const { data, error } = await supabase
    .from("rfx_line_items")
    .update(updates)
    .eq("id", lineItemId)
    .select();
  if (error) throw new Error(error.message);
  return { success: true, data: data?.[0] ?? null };
}

export async function confirmLineItem(supabase: any, lineItemId: string) {
  return updateRfxLineItem(supabase, lineItemId, { status: "BUYER_CONFIRMED" });
}

export async function deleteRfxLineItem(supabase: any, lineItemId: string) {
  const { error } = await supabase.from("rfx_line_items").delete().eq("id", lineItemId);
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function updateRequirement(supabase: any, requirementId: string, updates: Record<string, unknown>) {
  if (updates.status && !["AI_SUGGESTED", "BUYER_CONFIRMED"].includes(String(updates.status))) {
    throw new Error("Requirement status must be AI_SUGGESTED or BUYER_CONFIRMED");
  }

  const { data, error } = await supabase
    .from("rfx_requirements")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", requirementId)
    .select();

  if (error) throw new Error(error.message);
  return { success: true, data: data?.[0] ?? null };
}

export async function updateQuestionnaire(supabase: any, questionnaireId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("rfx_questionnaire")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", questionnaireId)
    .select();

  if (error) throw new Error(error.message);
  return { success: true, data: data?.[0] ?? null };
}

export async function validateRfx(supabase: any, rfxId: string) {
  const state = await getRfxState(supabase, rfxId);
  const issues: string[] = [];

  if (!state.data?.rfx?.name || state.data.rfx.name === "Untitled RFx") issues.push("RFx needs a name");
  if (!state.data?.rfx?.category) issues.push("RFx category is missing");
  if ((state.data?.lineItems?.length ?? 0) <= 0) issues.push("Talk through at least one line item before sending");

  const unconfirmedItems = (state.data?.lineItems ?? []).filter((item: any) => item.status !== "BUYER_CONFIRMED");
  if (unconfirmedItems.length > 0) {
    issues.push(`${unconfirmedItems.length} line item(s) are still AI-suggested and need your confirmation`);
  }

  if ((state.data?.questionnaire?.length ?? 0) <= 0) issues.push("Questionnaire is empty");

  const invalidRequirements = (state.data?.requirements ?? []).filter(
    (req: any) => req.status !== "AI_SUGGESTED" && req.status !== "BUYER_CONFIRMED",
  );
  if (invalidRequirements.length > 0) issues.push("Requirement statuses must be AI_SUGGESTED or BUYER_CONFIRMED");

  return {
    success: issues.length === 0,
    valid: issues.length === 0,
    issues,
    data: state.data,
  };
}

/**
 * Demo-only escape hatch: loads the FULL 30-SKU catalog into an RFx in one
 * shot. This intentionally bypasses the conversational flow and is used
 * only to seed the fixture RFx that the 5 archetype vendor documents quote
 * against. It is not part of the buyer-facing conversational path.
 */
export async function loadFullCatalogForDemo(supabase: any, rfxId?: string | null) {
  const baseRfx = rfxId ? await getRfxState(supabase, rfxId) : await getRfxState(supabase, null);
  const resolvedId = baseRfx.data?.rfx?.id ?? (await ensureRfxDraft(supabase))?.id;

  if (!resolvedId) {
    throw new Error("Unable to resolve RFx ID");
  }

  const state = await getRfxState(supabase, resolvedId);
  await ensureRfxQuestionnaire(supabase, resolvedId);
  const existingItems = state.data?.lineItems ?? [];

  if (existingItems.length > 0) {
    return { success: true, data: { lineItems: existingItems, rfx: state.data?.rfx, message: "Catalog already loaded" } };
  }

  const insertedItems = [] as any[];
  for (const item of SKU_CATALOG) {
    const result = await addCatalogItemToRfx(supabase, resolvedId, item.sku, {}, "BUYER_CONFIRMED");
    insertedItems.push(result.data);
  }

  const existingRequirements = state.data?.requirements ?? [];
  if (existingRequirements.length === 0) {
    for (const requirement of RFX_TEMPLATE_REQUIREMENTS) {
      const { data } = await supabase
        .from("rfx_requirements")
        .insert({
          rfx_id: resolvedId,
          type: requirement.type,
          name: requirement.name,
          value: requirement.value,
          status: requirement.status,
          source: requirement.source,
          confidence: requirement.confidence,
        })
        .select();
      insertedItems.push(data?.[0] ?? null);
    }
  }

  const updatedRfx = await updateRfx(supabase, resolvedId, {
    status: "DRAFT",
    name: "RFx Draft (full demo catalog)",
    category: "Corrugated Packaging",
  });

  return {
    success: true,
    data: {
      lineItems: insertedItems.filter(Boolean),
      rfx: updatedRfx.data,
      message: "Full demo catalog loaded",
    },
  };
}

const catalogMatchSchema = z.object({
  matched_skus: z
    .array(
      z.object({
        sku: z.string(),
        annual_quantity: z.number().nullable().optional().default(null),
      }),
    )
    .default([]),
  reply: z.string().default(""),
  clarification_needed: z.string().nullable().default(null),
});

export type CatalogMatchResult = {
  matches: Array<{ sku: string; annual_quantity: number | null }>;
  reply: string;
  clarification: string | null;
  droppedHallucinations: string[];
};

/**
 * The core "talk, don't click" mapping step.
 *
 * 1. The full catalog (SKU + description + defaults) is embedded in the
 *    prompt every call, so the model never relies on memory.
 * 2. The model may ONLY return SKUs; it is instructed never to invent one.
 * 3. If the request is ambiguous (multiple catalog items could match, or
 *    key details like ply/size are missing), the model must ask a
 *    clarifying question instead of guessing.
 * 4. Deterministic backstop: after the model responds, every returned SKU
 *    is checked against CATALOG_SKU_SET. Anything not in the real catalog
 *    is dropped before it ever reaches addCatalogItemToRfx, and reported
 *    back so this can be logged/observed.
 */
export async function matchCatalogItems(input: {
  message: string;
  existingSkus: string[];
}): Promise<CatalogMatchResult> {
  const result = await generateStructured({
    schema: catalogMatchSchema,
    prompt: `You are mapping a buyer's natural-language sourcing request onto our FIXED catalog of corrugated packaging SKUs for an RFx. You may ONLY select SKUs that appear verbatim in the catalog below. Never invent a new SKU, code, or description — if nothing in the catalog matches, return an empty matched_skus array.

CATALOG (the only valid SKUs, one per line as "SKU: description (ply, GSM, default annual qty)"):
${renderCatalogForPrompt()}

Line items already in this RFx (do not repeat these): ${input.existingSkus.length > 0 ? input.existingSkus.join(", ") : "none yet"}

Buyer message: "${input.message}"

Rules:
1. Only return SKUs copied exactly from the catalog above.
2. If the buyer's request could match more than one catalog item and you cannot tell which they mean (e.g. they said "3-ply boxes" but several 3-ply SKUs exist), do NOT guess among them. Set clarification_needed to a specific, short question listing the candidate SKUs and what distinguishes them, and leave those particular items out of matched_skus. You may still return other SKUs from the same message that ARE unambiguous.
3. If the buyer states or clearly implies an annual quantity for a specific item, include it as annual_quantity. Otherwise use null and the catalog default will apply.
4. reply is one short, natural sentence confirming what you understood, written for the buyer to read in a chat.
5. Never repeat SKUs already listed as existing.`,
    useCase: "rfx-draft",
    documentKind: "text-derived",
  });

  const validMatches: Array<{ sku: string; annual_quantity: number | null }> = [];
  const droppedHallucinations: string[] = [];

  for (const match of result.data.matched_skus) {
    if (CATALOG_SKU_SET.has(match.sku)) {
      validMatches.push({ sku: match.sku, annual_quantity: match.annual_quantity ?? null });
    } else {
      droppedHallucinations.push(match.sku);
    }
  }

  return {
    matches: validMatches,
    reply: result.data.reply || "I've matched what I could to our catalog.",
    clarification: result.data.clarification_needed,
    droppedHallucinations,
  };
}