import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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

    const content = await file.text();
    const { data, error } = await supabase
      .from("vendor_documents")
      .insert({
        rfx_id: rfxId,
        vendor_id: vendorId,
        filename: file.name,
        file_type: file.type || "text/plain",
        processing_status: "UPLOADED",
        extracted_text: content,
        metadata: { uploadedVia: "responses-ui", size: file.size },
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, document: data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Upload failed" }, { status: 500 });
  }
}
