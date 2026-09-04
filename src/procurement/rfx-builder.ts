export const RFX_TEMPLATE_ITEMS = [
  { sku: "CP-001", description: "3-ply mailer box 600x400x300", annual_quantity: 15000, unit: "pcs" },
  { sku: "CP-002", description: "3-ply shipping carton 500x350x250", annual_quantity: 18000, unit: "pcs" },
  { sku: "CP-003", description: "5-ply export box 800x600x450", annual_quantity: 22000, unit: "pcs" },
  { sku: "CP-004", description: "5-ply corrugated pad 1200x800x20", annual_quantity: 21000, unit: "pcs" },
  { sku: "CP-005", description: "2-ply tray insert 400x300x150", annual_quantity: 16000, unit: "pcs" },
  { sku: "CP-006", description: "3-ply FEFCO-style die box 650x450x320", annual_quantity: 17000, unit: "pcs" },
];

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
    value: { maxLeadTimeDays: 21 },
    status: "AI_SUGGESTED",
    source: "seed-template",
    confidence: 0.95,
  },
];

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
      description: "Draft RFx created from the seeded template.",
      status: "DRAFT",
      currency: "INR",
      max_lead_time_days: 21,
      max_vendor_share: 0.7,
      minimum_awarded_vendors: 2,
    })
    .select();

  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
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

export async function addRfxLineItem(supabase: any, rfxId: string, item: Record<string, unknown>) {
  if (!item.sku || !String(item.sku).trim()) {
    throw new Error("SKU is required");
  }

  const payload = {
    rfx_id: rfxId,
    sku: String(item.sku),
    description: String(item.description ?? ""),
    annual_quantity: Number(item.annual_quantity ?? 0),
    unit: String(item.unit ?? "pcs"),
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("rfx_line_items").insert(payload).select();
  if (error) throw new Error(error.message);
  return { success: true, data: data?.[0] ?? null };
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

  if (!state.data?.rfx?.name) issues.push("RFx name is missing");
  if (!state.data?.rfx?.category) issues.push("RFx category is missing");
  if ((state.data?.lineItems?.length ?? 0) <= 0) issues.push("Add at least one line item");
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

export async function draftRfxFromSeed(supabase: any, rfxId?: string | null) {
  const baseRfx = rfxId ? await getRfxState(supabase, rfxId) : await getRfxState(supabase, null);
  const resolvedId = baseRfx.data?.rfx?.id ?? (await ensureRfxDraft(supabase))?.id;

  if (!resolvedId) {
    throw new Error("Unable to resolve RFx ID");
  }

  const state = await getRfxState(supabase, resolvedId);
  const existingLineItems = state.data?.lineItems ?? [];

  if (existingLineItems.length > 0) {
    return { success: true, data: { lineItems: existingLineItems, rfx: state.data?.rfx, message: "Template already loaded" } };
  }

  const insertedItems = [] as any[];
  for (const item of RFX_TEMPLATE_ITEMS) {
    const result = await addRfxLineItem(supabase, resolvedId, item);
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
    name: "RFx Draft from template",
    category: "Corrugated Packaging",
  });

  return {
    success: true,
    data: {
      lineItems: insertedItems.filter(Boolean),
      rfx: updatedRfx.data,
      message: "Seeded RFx template loaded",
    },
  };
}
