import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { supabase } from "@/lib/supabase";
import { vendorDocuments } from "@/seed/vendorDocuments";

const skuCatalog = [
  { sku: "CP-001", description: "3-ply mailer box 600x400x300", ply: 3, gsm: 300, burst: 5.2, unit: "pcs" },
  { sku: "CP-002", description: "3-ply shipping carton 500x350x250", ply: 3, gsm: 320, burst: 5.4, unit: "pcs" },
  { sku: "CP-003", description: "5-ply export box 800x600x450", ply: 5, gsm: 420, burst: 9.8, unit: "pcs" },
  { sku: "CP-004", description: "5-ply corrugated pad 1200x800x20", ply: 5, gsm: 460, burst: 11.2, unit: "pcs" },
  { sku: "CP-005", description: "2-ply tray insert 400x300x150", ply: 2, gsm: 220, burst: 3.6, unit: "pcs" },
  { sku: "CP-006", description: "3-ply FEFCO-style die box 650x450x320", ply: 3, gsm: 310, burst: 5.8, unit: "pcs" },
  { sku: "CP-007", description: "4-ply heavy carton 750x550x420", ply: 4, gsm: 390, burst: 8.6, unit: "pcs" },
  { sku: "CP-008", description: "7-ply display shipper 900x700x500", ply: 7, gsm: 500, burst: 14.2, unit: "pcs" },
  { sku: "CP-009", description: "3-ply inner pack 320x220x120", ply: 3, gsm: 280, burst: 4.4, unit: "pcs" },
  { sku: "CP-010", description: "2-ply brochure mailer 270x190x40", ply: 2, gsm: 200, burst: 3.2, unit: "pcs" },
  { sku: "CP-011", description: "5-ply bottle shipper 520x400x300", ply: 5, gsm: 440, burst: 10.6, unit: "pcs" },
  { sku: "CP-012", description: "4-ply telescopic carton 620x420x220", ply: 4, gsm: 360, burst: 7.8, unit: "pcs" },
  { sku: "CP-013", description: "3-ply e-commerce box 430x300x180", ply: 3, gsm: 290, burst: 4.7, unit: "pcs" },
  { sku: "CP-014", description: "5-ply appliance carton 980x680x540", ply: 5, gsm: 480, burst: 12.5, unit: "pcs" },
  { sku: "CP-015", description: "3-ply food tray box 350x260x180", ply: 3, gsm: 270, burst: 4.1, unit: "pcs" },
  { sku: "CP-016", description: "4-ply protective sleeve 1100x450x12", ply: 4, gsm: 350, burst: 7.2, unit: "pcs" },
  { sku: "CP-017", description: "2-ply folding carton 240x180x90", ply: 2, gsm: 190, burst: 2.8, unit: "pcs" },
  { sku: "CP-018", description: "6-ply crate liner 1250x850x30", ply: 6, gsm: 520, burst: 15.1, unit: "pcs" },
  { sku: "CP-019", description: "5-ply multi-pack carton 760x520x360", ply: 5, gsm: 430, burst: 10.1, unit: "pcs" },
  { sku: "CP-020", description: "3-ply dashboard carton 610x410x210", ply: 3, gsm: 300, burst: 5.3, unit: "pcs" },
  { sku: "CP-021", description: "4-ply promotional shipper 680x480x260", ply: 4, gsm: 370, burst: 8.1, unit: "pcs" },
  { sku: "CP-022", description: "2-ply retail mailer 400x260x120", ply: 2, gsm: 210, burst: 3.4, unit: "pcs" },
  { sku: "CP-023", description: "6-ply pallet wrap box 1300x900x400", ply: 6, gsm: 540, burst: 15.8, unit: "pcs" },
  { sku: "CP-024", description: "3-ply shoe carton 440x310x220", ply: 3, gsm: 295, burst: 4.9, unit: "pcs" },
  { sku: "CP-025", description: "4-ply art print mailer 520x360x80", ply: 4, gsm: 340, burst: 6.7, unit: "pcs" },
  { sku: "CP-026", description: "5-ply fruit tray carton 450x320x230", ply: 5, gsm: 410, burst: 9.2, unit: "pcs" },
  { sku: "CP-027", description: "3-ply static-safe box 500x350x260", ply: 3, gsm: 330, burst: 6.3, unit: "pcs" },
  { sku: "CP-028", description: "4-ply bakery carton 280x220x160", ply: 4, gsm: 360, burst: 7.3, unit: "pcs" },
  { sku: "CP-029", description: "5-ply industrial parts box 860x620x410", ply: 5, gsm: 470, burst: 11.9, unit: "pcs" },
  { sku: "CP-030", description: "3-ply medical kit carton 330x220x150", ply: 3, gsm: 315, burst: 5.7, unit: "pcs" },
];

const vendorCatalog = [
  { name: "Karnavati Packaging", contact_name: "Aisha Mehta", contact_email: "aisha@karnavatipackaging.in" },
  { name: "Apex Corrugates", contact_name: "Rohit Nair", contact_email: "rohit@apexcorrugates.in" },
  { name: "Maharashtra BoxWorks", contact_name: "Neha Shah", contact_email: "neha@maharashtraboxworks.in" },
  { name: "Bharat Carton Group", contact_name: "Vikram Iyer", contact_email: "vikram@bharatcarton.in" },
  { name: "Punjab Fibre Solutions", contact_name: "Simran Kaur", contact_email: "simran@punjabfibre.in" },
];

const questionnaire = [
  { question_number: 1, question: "Do you have ISO 9001 certification on the production line?", required: true, category: "QUALITY" },
  { question_number: 2, question: "What is your typical lead time for repeat carton orders?", required: true, category: "DELIVERY" },
  { question_number: 3, question: "Can you support MOQ flexibility for seasonal spikes?", required: false, category: "COMMERCIAL" },
  { question_number: 4, question: "Do you offer printed branding for corrugated cartons?", required: false, category: "TECHNICAL" },
  { question_number: 5, question: "What quality control checks are performed before dispatch (e.g. batch testing, sampling)?", required: true, category: "QUALITY" },
  { question_number: 6, question: "What is your general MOQ policy? (e.g. flat minimum, tiered by order value, varies by product line)", required: true, category: "COMMERCIAL" },
  { question_number: 7, question: "How do you handle damaged/rejected shipments — replacement, credit, or deduction?", required: false, category: "LOGISTICS" },
  { question_number: 8, question: "Are there any conditions under which your quoted pricing would change during the contract period?", required: false, category: "COMMERCIAL" },
];

function buildSeed() {
  const rfxId = randomUUID();
  const lineItems = skuCatalog.map((item, index) => ({
    id: randomUUID(),
    rfx_id: rfxId,
    sku: item.sku,
    description: item.description,
    ply: item.ply,
    gsm: item.gsm,
    bursting_strength: item.burst,
    bursting_strength_unit: "kPa",
    length_mm: 400 + index * 18,
    width_mm: 300 + index * 13,
    height_mm: 200 + index * 16,
    annual_quantity: 15000 + index * 325,
    unit: item.unit,
  }));

  const vendors = vendorCatalog.map((vendor) => ({
    id: randomUUID(),
    ...vendor,
    status: "ACTIVE",
  }));

  const questionnaireRows = questionnaire.map((q) => ({
    id: randomUUID(),
    rfx_id: rfxId,
    question_number: q.question_number,
    question: q.question,
    required: q.required,
    category: q.category,
  }));

  const currentContractPrices = lineItems.map((lineItem, index) => ({
    id: randomUUID(),
    rfx_id: rfxId,
    line_item_id: lineItem.id,
    price: Number((32 + (index % 8) * 6 + index * 0.7).toFixed(2)),
    unit: "pcs",
    currency: "INR",
  }));

  // Map vendors to a lookup by name (lowercase)
  const vendorLookup: Record<string, string> = {};
  vendors.forEach((vendor) => {
    const key = vendor.name.toLowerCase().replace(/\s+/g, "");
    vendorLookup[key] = vendor.id;
  });

  // Create vendor documents for each archetype
  const vendorDocumentsList = [
    {
      id: randomUUID(),
      rfx_id: rfxId,
      vendor_id: vendorLookup["karnavatipackaging"],
      filename: vendorDocuments.vendorA.filename,
      file_type: vendorDocuments.vendorA.fileType,
      storage_path: `vendor_docs/${rfxId}/vendor-a.txt`,
      processing_status: "UPLOADED",
      metadata: { archetype: "clean", vendor: "Vendor A" },
    },
    {
      id: randomUUID(),
      rfx_id: rfxId,
      vendor_id: vendorLookup["apexcorrugates"],
      filename: vendorDocuments.vendorB.filename,
      file_type: vendorDocuments.vendorB.fileType,
      storage_path: `vendor_docs/${rfxId}/vendor-b.txt`,
      processing_status: "UPLOADED",
      metadata: { archetype: "qualified-with-exception", vendor: "Vendor B" },
    },
    {
      id: randomUUID(),
      rfx_id: rfxId,
      vendor_id: vendorLookup["maharashtraboxworks"],
      filename: vendorDocuments.vendorC.filename,
      file_type: vendorDocuments.vendorC.fileType,
      storage_path: `vendor_docs/${rfxId}/vendor-c.txt`,
      processing_status: "UPLOADED",
      metadata: { archetype: "conditional", vendor: "Vendor C" },
    },
    {
      id: randomUUID(),
      rfx_id: rfxId,
      vendor_id: vendorLookup["bharatcartongroup"],
      filename: vendorDocuments.vendorD.filename,
      file_type: vendorDocuments.vendorD.fileType,
      storage_path: `vendor_docs/${rfxId}/vendor-d.txt`,
      processing_status: "UPLOADED",
      metadata: { archetype: "mixed-units-currencies", vendor: "Vendor D" },
    },
    {
      id: randomUUID(),
      rfx_id: rfxId,
      vendor_id: vendorLookup["punjabfibresolutions"],
      filename: vendorDocuments.vendorE.filename,
      file_type: vendorDocuments.vendorE.fileType,
      storage_path: `vendor_docs/${rfxId}/vendor-e.png`,
      processing_status: "UPLOADED",
      metadata: { archetype: "image-messy-lead-time", vendor: "Vendor E" },
    },
  ];

  return {
    rfx: {
      id: rfxId,
      name: "2026 India Corrugated Packaging Rate Contract",
      category: "Corrugated Packaging",
      description: "Annual corrugated packaging rate contract for e-commerce and industrial shipping needs across India.",
      status: "DRAFT",
      currency: "INR",
      max_lead_time_days: 21,
      max_vendor_share: 0.7,
      minimum_awarded_vendors: 2,
    },
    lineItems,
    vendors,
    questionnaires: questionnaireRows,
    currentContractPrices,
    vendorDocuments: vendorDocumentsList,
  };
}

async function resetTables() {
  if (!supabase) {
    console.log("Supabase client not configured. Database reset skipped in dry-run mode.");
    return false;
  }

  const tables = [
    "questionnaire_answers",
    "vendor_quotes",
    "vendor_responses",
    "vendor_documents",
    "analysis_runs",
    "current_contract_prices",
    "rfx_questionnaire",
    "rfx_requirements",
    "rfx_line_items",
    "vendors",
    "rfxs",
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      throw new Error(`Failed to delete ${table}: ${error.message}`);
    }
  }

  return true;
}

async function insertSeed() {
  if (!supabase) {
    return;
  }

  const seed = buildSeed();

  const { error: rfxError } = await supabase.from("rfxs").insert(seed.rfx);
  if (rfxError) throw new Error(`RFx insert failed: ${rfxError.message}`);

  const { error: lineError } = await supabase.from("rfx_line_items").insert(seed.lineItems);
  if (lineError) throw new Error(`Line item insert failed: ${lineError.message}`);

  const { error: vendorError } = await supabase.from("vendors").insert(seed.vendors);
  if (vendorError) throw new Error(`Vendor insert failed: ${vendorError.message}`);

  const { error: questionError } = await supabase.from("rfx_questionnaire").insert(seed.questionnaires);
  if (questionError) throw new Error(`Questionnaire insert failed: ${questionError.message}`);

  const { error: contractError } = await supabase.from("current_contract_prices").insert(seed.currentContractPrices);
  if (contractError) throw new Error(`Current contract insert failed: ${contractError.message}`);

  const { error: docError } = await supabase.from("vendor_documents").insert(seed.vendorDocuments);
  if (docError) throw new Error(`Vendor documents insert failed: ${docError.message}`);
}

async function main() {
  console.log("Starting Milestone 1 seed run with Milestone 4 vendor documents...");
  const seed = buildSeed();

  const outputPath = path.resolve(process.cwd(), "src/seed/seed-output.json");
  const output = {
    generatedAt: new Date().toISOString(),
    rfx: seed.rfx,
    skuCount: seed.lineItems.length,
    vendorCount: seed.vendors.length,
    questionnaireCount: seed.questionnaires.length,
    currentContractPriceCount: seed.currentContractPrices.length,
    vendorDocumentCount: seed.vendorDocuments.length,
    summary: "Seed data generated for one RFx and a corrugated packaging catalog with 5 vendor documents (Milestone 4).",
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2));

  if (supabase) {
    await resetTables();
    await insertSeed();
    console.log("Supabase seed applied successfully.");
  } else {
    console.log("Supabase not configured. Running in dry-run mode without database writes.");
  }

  console.log("Seed output written to:", outputPath);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("Seed script failed:", error);
  process.exitCode = 1;
});
