import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { prepareDocument } from "@/procurement/document-preparation";

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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const rfxId = String(formData.get("rfxId") ?? "");
    const vendorId = String(formData.get("vendorId") ?? "");
    const file = formData.get("file");

    if (!rfxId || !vendorId || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "RFx, vendor, and file are required" }, { status: 400 });
    }

    if (!supabase) throw new Error("Supabase client not configured");
    const adminClient = getAdminClient();

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
          uploadedVia: "responses-ui",
          size: prepared.originalSize,
          documentKind: prepared.documentKind,
          mediaBase64: prepared.mediaBase64,
        },
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, document: data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Upload failed" }, { status: 500 });
  }
}
