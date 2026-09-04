import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { prepareDocument } from "@/procurement/document-preparation";

const BULK_EXTRACTION_DELAY_MS = Number(process.env.BULK_EXTRACTION_DELAY_MS ?? 2500);

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for private document access");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: NextRequest) {
  try {
    const documentId = request.nextUrl.searchParams.get("documentId");
    const storagePath = request.nextUrl.searchParams.get("path");
    const adminClient = getAdminClient();
    let resolvedPath = storagePath;

    if (documentId) {
      const { data: document, error: documentError } = await adminClient
        .from("vendor_documents")
        .select("rfx_id, vendor_id, storage_path, filename")
        .eq("id", documentId)
        .maybeSingle();
      if (documentError) throw new Error(documentError.message);
      if (!document) return NextResponse.json({ success: false, error: "Document record not found" }, { status: 404 });
      resolvedPath = document.storage_path;

      // Seeded rows may reference paths from before Storage uploads existed.
      if (resolvedPath?.startsWith("vendor_docs/")) {
        const { data: files } = await adminClient.storage
          .from("Vendor Response")
          .list(`${document.rfx_id}/${document.vendor_id}`, { limit: 100 });
        const matchingFile = files?.find((file) => file.name.endsWith(`-${document.filename}`) || file.name === document.filename);
        if (matchingFile) resolvedPath = `${document.rfx_id}/${document.vendor_id}/${matchingFile.name}`;
      }
    }

    if (!resolvedPath) return NextResponse.json({ success: false, error: "Document path is required" }, { status: 400 });
    const { data, error } = await adminClient.storage.from("Vendor Response").createSignedUrl(resolvedPath, 300);
    if (error || !data?.signedUrl) throw new Error(error?.message || "Could not create signed document URL");
    return NextResponse.json({ success: true, signedUrl: data.signedUrl, storagePath: resolvedPath });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not open document" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const documentId = request.nextUrl.searchParams.get("documentId");
    if (!documentId) {
      return NextResponse.json({ success: false, error: "Document ID is required" }, { status: 400 });
    }

    const adminClient = getAdminClient();
    const { data: document, error: documentLookupError } = await adminClient
      .from("vendor_documents")
      .select("id, storage_path")
      .eq("id", documentId)
      .maybeSingle();

    if (documentLookupError) throw new Error(documentLookupError.message);
    if (!document) {
      return NextResponse.json({ success: false, error: "Document record not found" }, { status: 404 });
    }

    const { data: responses, error: responsesLookupError } = await adminClient
      .from("vendor_responses")
      .select("id")
      .eq("document_id", documentId);
    if (responsesLookupError) throw new Error(responsesLookupError.message);

    const responseIds = (responses ?? []).map((response) => response.id);
    if (responseIds.length > 0) {
      const { error: quotesByResponseError } = await adminClient
        .from("vendor_quotes")
        .delete()
        .in("vendor_response_id", responseIds);
      if (quotesByResponseError) throw new Error(quotesByResponseError.message);
    }

    const { error: quotesByDocumentError } = await adminClient
      .from("vendor_quotes")
      .delete()
      .eq("source_document_id", documentId);
    if (quotesByDocumentError) throw new Error(quotesByDocumentError.message);

    const { error: responsesDeleteError } = await adminClient
      .from("vendor_responses")
      .delete()
      .eq("document_id", documentId);
    if (responsesDeleteError) throw new Error(responsesDeleteError.message);

    const { error: documentDeleteError } = await adminClient
      .from("vendor_documents")
      .delete()
      .eq("id", documentId);
    if (documentDeleteError) throw new Error(documentDeleteError.message);

    if (document.storage_path) {
      const { error: storageError } = await adminClient.storage
        .from("Vendor Response")
        .remove([document.storage_path]);
      if (storageError) console.warn("Could not remove original response file:", storageError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Delete failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const rfxId = String(formData.get("rfxId") ?? "");
    const processAfterUpload = String(formData.get("processAfterUpload") ?? "false") !== "false";
    const files = formData.getAll("files");
    const vendorIds = formData.getAll("vendorIds").map((value) => String(value));

    // Backwards-compat: if only a single file + vendorId are posted (old UI),
    // accept them too. The new BulkUploader always sends parallel arrays.
    const legacyFile = formData.get("file");
    const legacyVendor = String(formData.get("vendorId") ?? "");

    let resolvedFiles: File[] = [];
    let resolvedVendorIds: string[] = [];

    if (files.length > 0 && files.every((f) => f instanceof File)) {
      resolvedFiles = files as File[];
      resolvedVendorIds = vendorIds;
    } else if (legacyFile instanceof File && legacyVendor) {
      resolvedFiles = [legacyFile];
      resolvedVendorIds = [legacyVendor];
    }

    if (!rfxId || resolvedFiles.length === 0 || resolvedVendorIds.length !== resolvedFiles.length || resolvedVendorIds.some((v) => !v)) {
      return NextResponse.json(
        { success: false, error: "RFx, file(s), and a vendor per file are required" },
        { status: 400 },
      );
    }

    if (!supabase) throw new Error("Supabase client not configured");
    const adminClient = getAdminClient();

    // Verify every vendorId exists in one query (cheap, indexed).
    const uniqueVendors = Array.from(new Set(resolvedVendorIds));
    const { data: vendorRows, error: vendorError } = await supabase
      .from("vendors")
      .select("id")
      .in("id", uniqueVendors);
    if (vendorError) throw new Error(vendorError.message);
    const validVendorIds = new Set((vendorRows ?? []).map((row) => row.id));
    for (const vendorId of uniqueVendors) {
      if (!validVendorIds.has(vendorId)) {
        throw new Error(`Unknown vendor '${vendorId}'`);
      }
    }

    const isBulk = resolvedFiles.length > 1;
    const uploaded = await Promise.allSettled(
      resolvedFiles.map((file, index) =>
        uploadSingle({ file, vendorId: resolvedVendorIds[index], rfxId, adminClient, uploadedVia: isBulk ? "responses-ui-bulk" : "responses-ui" }),
      ),
    );

    const extractionResults: Array<{ filename: string; success: boolean; model?: string; provider?: string; error?: string }> = [];
    if (processAfterUpload) {
      await sleep(BULK_EXTRACTION_DELAY_MS);
      for (let index = 0; index < uploaded.length; index += 1) {
        const outcome = uploaded[index];
        const filename = resolvedFiles[index].name;
        if (outcome.status === "rejected") {
          extractionResults.push({ filename, success: false, error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) });
          continue;
        }
        const document = outcome.value;
        try {
          const extraction = await runExtraction({ document, vendorId: resolvedVendorIds[index], rfxId });
          extractionResults.push({ filename, success: true, model: extraction.model, provider: extraction.provider });
        } catch (error) {
          extractionResults.push({ filename, success: false, error: error instanceof Error ? error.message : "Extraction failed" });
        }
        if (index < uploaded.length - 1) {
          await sleep(BULK_EXTRACTION_DELAY_MS);
        }
      }
    }

    const payload = uploaded.map((result, index) => {
      const filename = resolvedFiles[index].name;
      if (result.status === "fulfilled") {
        return { filename, success: true, document: result.value, extraction: extractionResults[index] };
      }
      return {
        filename,
        success: false,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    });

    const anySuccess = payload.some((p) => p.success);
    return NextResponse.json(
      {
        success: anySuccess,
        results: payload,
        message: anySuccess ? `${payload.filter((p) => p.success).length} of ${payload.length} uploaded` : "All uploads failed",
      },
      { status: anySuccess ? 200 : 500 },
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Upload failed" }, { status: 500 });
  }
}

async function uploadSingle({
  file,
  vendorId,
  rfxId,
  adminClient,
  uploadedVia,
}: {
  file: File;
  vendorId: string;
  rfxId: string;
  adminClient: ReturnType<typeof getAdminClient>;
  uploadedVia: string;
}) {
  const prepared = await prepareDocument(file);
  const storagePath = `${rfxId}/${vendorId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: storageError } = await adminClient.storage
    .from("Vendor Response")
    .upload(storagePath, file, { contentType: prepared.mediaType, upsert: false });
  if (storageError) throw new Error(`Original document storage failed: ${storageError.message}`);

  const { data, error } = await adminClient
    .from("vendor_documents")
    .insert({
      rfx_id: rfxId,
      vendor_id: vendorId,
      filename: file.name,
      file_type: prepared.mediaType,
      storage_path: storagePath,
      processing_status: "UPLOADED",
      extracted_text: prepared.contentText || null,
      metadata: {
        uploadedVia,
        size: prepared.originalSize,
        documentKind: prepared.documentKind,
        mediaBase64: prepared.mediaBase64,
      },
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function runExtraction({
  document,
  vendorId,
  rfxId,
}: {
  document: { id: string; filename: string; file_type: string; extracted_text?: string | null; metadata?: Record<string, unknown> | null };
  vendorId: string;
  rfxId: string;
}) {
  if (!document?.id) throw new Error("Cannot extract: missing document id");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const response = await fetch(`${origin}/api/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rfxId,
      vendorId,
      documentId: document.id,
      contentText: document.extracted_text ?? "",
      mediaBase64: typeof document.metadata?.mediaBase64 === "string" ? document.metadata.mediaBase64 : undefined,
      mediaType: document.file_type,
      documentKind: document.file_type === "application/pdf" ? "pdf" : document.file_type?.startsWith("image/") ? "image" : "text-derived",
      fileName: document.filename,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Extraction failed (${response.status})`);
  }
  return { model: payload?.metadata?.model, provider: payload?.metadata?.provider };
}
