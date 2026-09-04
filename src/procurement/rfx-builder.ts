export const RFX_TEMPLATE_ITEMS = [
  { sku: "CP-001", description: "3-ply mailer box 600x400x300", annual_quantity: 15000, unit: "pcs" },
  { sku: "CP-002", description: "3-ply shipping carton 500x350x250", annual_quantity: 18000, unit: "pcs" },
  { sku: "CP-003", description: "5-ply export box 800x600x450", annual_quantity: 22000, unit: "pcs" },
  { sku: "CP-004", description: "5-ply corrugated pad 1200x800x20", annual_quantity: 21000, unit: "pcs" },
  { sku: "CP-005", description: "2-ply tray insert 400x300x150", annual_quantity: 16000, unit: "pcs" },
  { sku: "CP-006", description: "3-ply FEFCO-style die box 650x450x320", annual_quantity: 17000, unit: "pcs" },
  { sku: "CP-007", description: "4-ply heavy carton 750x550x420", annual_quantity: 19000, unit: "pcs" },
  { sku: "CP-008", description: "7-ply display shipper 900x700x500", annual_quantity: 12000, unit: "pcs" },
  { sku: "CP-009", description: "3-ply inner pack 320x220x120", annual_quantity: 26000, unit: "pcs" },
  { sku: "CP-010", description: "2-ply brochure mailer 270x190x40", annual_quantity: 30000, unit: "pcs" },
  { sku: "CP-011", description: "5-ply bottle shipper 520x400x300", annual_quantity: 14000, unit: "pcs" },
  { sku: "CP-012", description: "4-ply telescopic carton 620x420x220", annual_quantity: 16000, unit: "pcs" },
  { sku: "CP-013", description: "3-ply e-commerce box 430x300x180", annual_quantity: 28000, unit: "pcs" },
  { sku: "CP-014", description: "5-ply appliance carton 980x680x540", annual_quantity: 9000, unit: "pcs" },
  { sku: "CP-015", description: "3-ply food tray box 350x260x180", annual_quantity: 24000, unit: "pcs" },
  { sku: "CP-016", description: "4-ply protective sleeve 1100x450x12", annual_quantity: 11000, unit: "pcs" },
  { sku: "CP-017", description: "2-ply folding carton 240x180x90", annual_quantity: 32000, unit: "pcs" },
  { sku: "CP-018", description: "6-ply crate liner 1250x850x30", annual_quantity: 8000, unit: "pcs" },
  { sku: "CP-019", description: "5-ply multi-pack carton 760x520x360", annual_quantity: 15000, unit: "pcs" },
  { sku: "CP-020", description: "3-ply dashboard carton 610x410x210", annual_quantity: 18000, unit: "pcs" },
  { sku: "CP-021", description: "4-ply promotional shipper 680x480x260", annual_quantity: 13000, unit: "pcs" },
  { sku: "CP-022", description: "2-ply retail mailer 400x260x120", annual_quantity: 27000, unit: "pcs" },
  { sku: "CP-023", description: "6-ply pallet wrap box 1300x900x400", annual_quantity: 7000, unit: "pcs" },
  { sku: "CP-024", description: "3-ply shoe carton 440x310x220", annual_quantity: 22000, unit: "pcs" },
  { sku: "CP-025", description: "4-ply art print mailer 520x360x80", annual_quantity: 10000, unit: "pcs" },
  { sku: "CP-026", description: "5-ply fruit tray carton 450x320x230", annual_quantity: 17000, unit: "pcs" },
  { sku: "CP-027", description: "3-ply static-safe box 500x350x260", annual_quantity: 12000, unit: "pcs" },
  { sku: "CP-028", description: "4-ply bakery carton 280x220x160", annual_quantity: 21000, unit: "pcs" },
  { sku: "CP-029", description: "5-ply industrial parts box 860x620x410", annual_quantity: 8500, unit: "pcs" },
  { sku: "CP-030", description: "3-ply medical kit carton 330x220x150", annual_quantity: 12500, unit: "pcs" },
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
      description: "Draft RFx created from the seeded template.",
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
  for (const [index, item] of RFX_TEMPLATE_ITEMS.entries()) {
    const { error: lineItemError } = await supabase.from("rfx_line_items").insert({
      rfx_id: data.id,
      ...item,
      ply: Number(item.description.match(/^(\d+)-ply/)?.[1] ?? 0) || null,
      gsm: null,
      bursting_strength: null,
      length_mm: null,
      width_mm: null,
      height_mm: null,
    });
    if (lineItemError) throw new Error(lineItemError.message);
    const { data: lineItem } = await supabase.from("rfx_line_items").select("id").eq("rfx_id", data.id).eq("sku", item.sku).single();
    const { error: baselineError } = await supabase.from("current_contract_prices").insert({
      rfx_id: data.id,
      line_item_id: lineItem?.id,
      price: Number((32 + (index % 8) * 6 + index * 0.7).toFixed(2)),
      unit: "pcs",
      currency: "INR",
    });
    if (baselineError) throw new Error(baselineError.message);
  }
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
    ply: item.ply == null ? null : Number(item.ply),
    gsm: item.gsm == null ? null : Number(item.gsm),
    length_mm: item.length_mm == null ? null : Number(item.length_mm),
    width_mm: item.width_mm == null ? null : Number(item.width_mm),
    height_mm: item.height_mm == null ? null : Number(item.height_mm),
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("rfx_line_items").insert(payload).select();
  if (error) throw new Error(error.message);
  return { success: true, data: data?.[0] ?? null };
}

export async function updateRfxLineItem(supabase: any, lineItemId: string, updates: Record<string, unknown>) {
  const allowed = ["sku", "description", "ply", "gsm", "length_mm", "width_mm", "height_mm", "annual_quantity", "unit"];
  const disallowed = Object.keys(updates).filter((key) => !allowed.includes(key));
  if (disallowed.length > 0) throw new Error(`Unsupported line-item field update: ${disallowed.join(", ")}`);

  const { data, error } = await supabase
    .from("rfx_line_items")
    .update(updates)
    .eq("id", lineItemId)
    .select();
  if (error) throw new Error(error.message);
  return { success: true, data: data?.[0] ?? null };
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
  await ensureRfxQuestionnaire(supabase, resolvedId);
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
