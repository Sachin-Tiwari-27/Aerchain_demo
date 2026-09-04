import { z } from "zod";

import { generateStructured } from "@/ai/provider";
import { vendorQuoteExtractionSchema } from "@/ai/extraction";
import { supabase } from "@/lib/supabase";
import { processExtractedQuotes, saveProcessedQuotes } from "@/procurement/extraction-pipeline";

const extractRequestSchema = z.object({
  rfxId: z.string().uuid(),
  vendorId: z.string().uuid(),
  documentId: z.string().uuid(),
  contentText: z.string().optional().default(""),
  mediaBase64: z.string().optional(),
  mediaType: z.string().optional(),
  documentKind: z.enum(["image", "pdf", "text-derived"]).default("text-derived"),
  fileName: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = extractRequestSchema.parse(body);

    const prompt = `Extract structured supplier pricing information from the following document.\n\nRules:\n1. Distinguish explicit (directly stated), derived (calculated/inferred), ambiguous (unclear), and missing prices.\n2. Keep only seller-supplied values; do not invent values.\n3. For each quote, record: SKU reference, description, price, unit, currency, conditions, confidence score, and source reference.\n4. If a price is not directly stated, use null and record the reason in exceptions.\n5. Return JSON matching the vendor extraction schema.\n\nDocument content:\n${input.contentText || (input.mediaBase64 ? "Inspect the attached binary document directly." : "(empty document)")}`;

    // Call the provider abstraction
    const result = await generateStructured({
      schema: vendorQuoteExtractionSchema,
      prompt,
      documentKind: input.documentKind,
      useCase: input.documentKind === "text-derived" ? "rfx-json" : "image-parse",
      media: input.mediaBase64 && input.mediaType
        ? { mimeType: input.mediaType, data: input.mediaBase64 }
        : undefined,
    });

    // Store the extraction in vendor_responses
    if (!supabase) {
      throw new Error("Supabase client not configured");
    }

    const { data: vendorResponse, error: vendorResponseError } = await supabase
      .from("vendor_responses")
      .insert({
        rfx_id: input.rfxId,
        vendor_id: input.vendorId,
        document_id: input.documentId,
        status: "EXTRACTED",
        raw_extraction: result.data,
        extraction_confidence: result.fallbackAttempts === 0 ? 0.95 : 0.75,
      })
      .select()
      .single();

    if (vendorResponseError) {
      throw vendorResponseError;
    }

    const { data: lineItems, error: lineItemsError } = await supabase
      .from("rfx_line_items")
      .select("*")
      .eq("rfx_id", input.rfxId);

    if (lineItemsError) {
      throw lineItemsError;
    }

    // Fetch the RFx record to get the expected currency
    const { data: rfxData } = await supabase
      .from("rfxs")
      .select("currency")
      .eq("id", input.rfxId)
      .maybeSingle();

    // Build annual quantities map for MOQ validation
    const annualQuantities: Record<string, number> = {};
    for (const li of lineItems ?? []) {
      if (li.sku && li.annual_quantity != null) {
        annualQuantities[li.sku] = Number(li.annual_quantity);
      }
    }

    const pipeline = await processExtractedQuotes({
      vendorId: input.vendorId,
      vendorResponseId: vendorResponse.id,
      sourceDocumentId: input.documentId,
      rfxId: input.rfxId,
      extraction: result.data,
      lineItems: lineItems || [],
      annualQuantities,
      rfxCurrency: rfxData?.currency ?? undefined,
    });
    await saveProcessedQuotes(supabase, pipeline);

    // Mark document as processed
    const { error: docError } = await supabase
      .from("vendor_documents")
      .update({
        processing_status: "EXTRACTED",
        processed_at: new Date().toISOString(),
      })
      .eq("id", input.documentId);

    if (docError) {
      throw docError;
    }

    return Response.json({
      success: true,
      vendorResponseId: vendorResponse.id,
      extraction: result.data,
      pipeline,
      provenance: result.provenance,
      metadata: {
        provider: result.provider,
        model: result.model,
        fallbackAttempts: result.fallbackAttempts,
      },
    });
  } catch (error) {
    console.error("Extraction error:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Extraction failed",
      },
      { status: 500 },
    );
  }
}
