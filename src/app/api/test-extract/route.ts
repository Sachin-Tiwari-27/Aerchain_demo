/**
 * Test extraction endpoint: processes seeded vendor documents through the extraction and normalization pipeline.
 * Used for testing Milestone 5 without requiring real file uploads.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { vendorDocuments } from "@/seed/vendorDocuments";
import { extractVendorDocument } from "@/ai/extraction";
import { processExtractedQuotes, saveProcessedQuotes } from "@/procurement/extraction-pipeline";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rfxId, vendorName } = body;

    if (!rfxId || !vendorName) {
      return NextResponse.json(
        { error: "Missing rfxId or vendorName" },
        { status: 400 },
      );
    }

    // Find the seeded vendor
    const vendorsResult = await supabase
      ?.from("vendors")
      .select("*")
      .eq("name", vendorName);
    
    const vendors = vendorsResult?.data;
    const vendorError = vendorsResult?.error;

    if (vendorError || !vendors || vendors.length === 0) {
      return NextResponse.json(
        { error: `Vendor ${vendorName} not found` },
        { status: 404 },
      );
    }

    const vendor = vendors[0];

    // Get the RFx and line items
    const rfxResult = await supabase?.from("rfxs").select("*").eq("id", rfxId);
    const rfx = rfxResult?.data;
    
    const lineItemsResult = await supabase
      ?.from("rfx_line_items")
      .select("*")
      .eq("rfx_id", rfxId);
    const lineItems = lineItemsResult?.data;

    if (!rfx || rfx.length === 0 || !lineItems || lineItems.length === 0) {
      return NextResponse.json(
        { error: "RFx or line items not found" },
        { status: 404 },
      );
    }

    // Get the vendor document from seeded collection
    const vendorDocKey = vendorName.toLowerCase().replace(/\s+/g, "");
    const docMap: Record<string, keyof typeof vendorDocuments> = {
      "karnavatipackaging": "vendorA",
      "apexcorrugates": "vendorB",
      "maharashtraboxworks": "vendorC",
      "bharatcartongroup": "vendorD",
      "punjabfibresolutions": "vendorE",
    };

    const docKey = docMap[vendorDocKey];
    if (!docKey) {
      return NextResponse.json(
        { error: `No test document for vendor ${vendorName}` },
        { status: 404 },
      );
    }

    const testDoc = vendorDocuments[docKey];

    const { data: sourceDocuments } = await supabase
      ?.from("vendor_documents")
      .select("id")
      .eq("rfx_id", rfxId)
      .eq("vendor_id", vendor.id)
      .limit(1) || {};
    const sourceDocumentId = sourceDocuments?.[0]?.id ?? null;

    // Extract using the AI provider
    const extractionResult = await extractVendorDocument({
      documentKind: "text-derived",
      fileName: testDoc.filename,
      contentText: testDoc.content,
    });

    // Create a vendor_responses record
    const { data: vendorResponse, error: responseError } = await supabase
      ?.from("vendor_responses")
      .insert({
        rfx_id: rfxId,
        vendor_id: vendor.id,
        document_id: sourceDocumentId,
        status: "EXTRACTED",
        raw_extraction: extractionResult.data,
        extraction_confidence: extractionResult.rawExtraction.quotes?.[0]?.confidence ?? 0.8,
      })
      .select() || {};

    if (responseError || !vendorResponse || vendorResponse.length === 0) {
      return NextResponse.json(
        { error: `Failed to create vendor response: ${responseError?.message}` },
        { status: 500 },
      );
    }

    const response = vendorResponse[0];

    // Process extracted quotes through the pipeline
    const pipelineResult = await processExtractedQuotes({
      vendorId: vendor.id,
      vendorResponseId: response.id,
      sourceDocumentId,
      rfxId,
      extraction: extractionResult.data,
      lineItems,
    });

    // Save processed quotes to database
    if (supabase) {
      await saveProcessedQuotes(supabase, pipelineResult);
    }

    return NextResponse.json({
      success: true,
      vendor: vendor.name,
      vendorResponseId: response.id,
      extraction: extractionResult,
      pipeline: pipelineResult,
      message: `Extracted and processed ${pipelineResult.processedQuotes.length} quotes for ${vendor.name}`,
    });
  } catch (error: any) {
    console.error("Test extraction error:", error);
    return NextResponse.json(
      { error: error.message || "Extraction failed" },
      { status: 500 },
    );
  }
}
