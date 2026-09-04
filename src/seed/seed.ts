import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { supabase } from "@/lib/supabase";
import { vendorDocuments } from "@/seed/vendorDocuments";
import { SKU_CATALOG } from "@/procurement/catalog";

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

  // The seeded fixture RFx uses the full fixed catalog, marked as
  // BUYER_CONFIRMED because it represents an already-approved demo scope,
  // not a live buyer conversation. New RFx created through the UI start
  // empty and reach this state only via the conversational matching flow.
  const lineItems = SKU_CATALOG.map((item, index) => ({
    id: randomUUID(),
    rfx_id: rfxId,
    sku: item.sku,
    description: item.description,
    ply: item.ply,
    gsm: item.gsm,
    bursting_strength: item.burstingStrength,
    bursting_strength_unit: "kPa",
    length_mm: 400 + index * 18,
    width_mm: 300 + index * 13,
    height_mm: 200 + index * 16,
    annual_quantity: item.defaultAnnualQuantity,
    unit: item.unit,
    status: "BUYER_CONFIRMED",
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

  const vendorLookup: Record<string, string> = {};
  vendors.forEach((vendor) => {
    const key = vendor.name.toLowerCase().replace(/\s+/g, "");
    vendorLookup[key] = vendor.id;
  });

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
  console.log("Starting seed run (catalog-sourced line items, buyer-confirmed fixture RFx)...");
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
    summary: "Seed data generated from the shared 30-SKU catalog, all line items marked BUYER_CONFIRMED as a pre-approved demo fixture.",
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