"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

interface VendorDocument {
  id: string;
  vendor_id: string;
  filename: string;
  file_type: string;
  processing_status: "UPLOADED" | "EXTRACTED" | "ERROR";
  processed_at: string | null;
  extracted_text?: string | null;
  metadata?: Record<string, unknown>;
}

interface Vendor {
  id: string;
  name: string;
  contact_name?: string;
}

interface ExtractionResult {
  success: boolean;
  vendorResponseId?: string;
  error?: string;
  metadata?: {
    provider: string;
    model: string;
    fallbackAttempts: number;
  };
}

export default function ResponsesPage() {
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [vendors, setVendors] = useState<Record<string, Vendor>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [rfxId, setRfxId] = useState<string>("");
  const [extracting, setExtracting] = useState<Record<string, boolean>>({});
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

        console.log("Supabase config check:", { supabaseUrl, hasKey: !!supabaseKey });

        if (!supabaseUrl || !supabaseKey) {
          throw new Error("Supabase environment variables not configured");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        console.log("Supabase client created");

        // Fetch RFx
        const { data: rfxData, error: rfxError } = await supabase
          .from("rfxs")
          .select("id")
          .limit(1)
          .single();

        if (rfxError) {
          throw new Error(`Failed to fetch RFx: ${rfxError.message}`);
        }

        if (!rfxData) {
          throw new Error("No RFx found. Please run seed script first.");
        }

        console.log("RFx loaded:", rfxData.id);
        setRfxId(rfxData.id);

        // Fetch vendor documents for this RFx
        const { data: docsData, error: docsError } = await supabase
          .from("vendor_documents")
          .select("*")
          .eq("rfx_id", rfxData.id);

        if (docsError) {
          throw new Error(`Failed to fetch documents: ${docsError.message}`);
        }

        console.log("Vendor documents loaded:", docsData?.length);
        setDocuments(docsData || []);

        // Fetch vendors
        const { data: vendorsData, error: vendorsError } = await supabase.from("vendors").select("*");

        if (vendorsError) {
          throw new Error(`Failed to fetch vendors: ${vendorsError.message}`);
        }

        console.log("Vendors loaded:", vendorsData?.length);
        const vendorMap: Record<string, Vendor> = {};
        vendorsData?.forEach((v) => {
          vendorMap[v.id] = v;
        });
        setVendors(vendorMap);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Error fetching data:", message, err);
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleExtract = async (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;

    setExtracting((prev) => ({ ...prev, [docId]: true }));

    try {
      const vendor = vendors[doc.vendor_id];
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfxId,
          vendorId: doc.vendor_id,
          documentId: doc.id,
          contentText: doc.extracted_text || "",
          mediaBase64: typeof doc.metadata?.mediaBase64 === "string" ? doc.metadata.mediaBase64 : undefined,
          mediaType: doc.file_type,
          documentKind: doc.file_type === "application/pdf" ? "pdf" : doc.file_type?.startsWith("image/") ? "image" : "text-derived",
          fileName: doc.filename,
        }),
      });

      const result: ExtractionResult = await response.json();

      if (result.success) {
        // Refresh documents list
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? { ...d, processing_status: "EXTRACTED", processed_at: new Date().toISOString() }
              : d,
          ),
        );
      } else {
        setDocuments((prev) =>
          prev.map((d) => (d.id === docId ? { ...d, processing_status: "ERROR" } : d)),
        );
        console.error("Extraction failed:", result.error);
      }
    } catch (error) {
      console.error("Extraction request error:", error);
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, processing_status: "ERROR" } : d)),
      );
    } finally {
      setExtracting((prev) => ({ ...prev, [docId]: false }));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedVendorId || !rfxId) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("rfxId", rfxId);
      formData.append("vendorId", selectedVendorId);
      formData.append("file", selectedFile);
      const response = await fetch("/api/responses/upload", { method: "POST", body: formData });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Upload failed");
      setDocuments((current) => [...current, result.document]);
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Responses</p>
        <h2 className="mt-3 text-2xl font-semibold">Loading...</h2>
        <p className="mt-2 text-sm text-slate-500">Fetching vendor documents from Supabase...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-red-700">Error</p>
        <h2 className="mt-3 text-2xl font-semibold text-red-900">Failed to load responses</h2>
        <p className="mt-2 text-red-700">{error}</p>
        <div className="mt-4 text-sm text-red-600">
          <p className="font-semibold">Troubleshooting:</p>
          <ul className="mt-2 ml-4 list-disc space-y-1">
            <li>Environment variables NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local</li>
            <li>Supabase project is accessible and online</li>
            <li>Run <code className="rounded bg-red-100 px-2 py-1">npm run seed</code> to populate the database</li>
          </ul>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "EXTRACTED":
        return "bg-green-50 text-green-700";
      case "UPLOADING":
        return "bg-blue-50 text-blue-700";
      case "ERROR":
        return "bg-red-50 text-red-700";
      default:
        return "bg-amber-50 text-amber-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Responses</p>
        <h2 className="mt-3 text-2xl font-semibold">Supplier response intake</h2>
        <p className="mt-2 text-slate-600">
          Upload vendor documents and run AI extraction to normalize pricing data.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Add supplier response</h3>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select value={selectedVendorId} onChange={(event) => setSelectedVendorId(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select vendor</option>
            {Object.values(vendors).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.txt,.csv,.json,.md,.docx,.xlsx,.xls,.xlsm" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} className="max-w-full text-sm" />
          <button onClick={() => void handleUpload()} disabled={uploading || !selectedFile || !selectedVendorId} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:bg-slate-300">{uploading ? "Uploading..." : "Upload response"}</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Text and CSV responses are retained for extraction; seeded documents remain available below.</p>
      </section>

      {documents.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <p className="text-slate-600">No vendor documents found. Run seed script to populate demo data.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">Vendor</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">Filename</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">Type</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">Status</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">Archetype</th>
                  <th className="px-6 py-3 text-center font-semibold text-slate-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <span className="font-medium">{vendors[doc.vendor_id]?.name || "Unknown"}</span>
                    </td>
                    <td className="px-6 py-3 text-slate-600">{doc.filename}</td>
                    <td className="px-6 py-3 text-slate-500 text-xs">{doc.file_type}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-block rounded px-2.5 py-1 text-xs font-medium ${getStatusColor(doc.processing_status)}`}>
                        {doc.processing_status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-600">
                      {typeof doc.metadata?.archetype === "string" ? doc.metadata.archetype : "—"}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {doc.processing_status === "UPLOADED" && (
                        <button
                          onClick={() => handleExtract(doc.id)}
                          disabled={extracting[doc.id]}
                          className="inline-flex items-center justify-center rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
                        >
                          {extracting[doc.id] ? "Extracting..." : "Extract"}
                        </button>
                      )}
                      {doc.processing_status === "EXTRACTED" && (
                        <span className="text-xs font-medium text-green-600">✓ Extracted</span>
                      )}
                      {doc.processing_status === "ERROR" && (
                        <button
                          onClick={() => handleExtract(doc.id)}
                          className="inline-flex items-center justify-center rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-600">
        <p className="font-medium mb-2">Legend:</p>
        <ul className="space-y-1">
          <li>
            <strong>Vendor A:</strong> Clean Excel, complete quote – Qualified
          </li>
          <li>
            <strong>Vendor B:</strong> Partial quote (24/30 SKUs), CP-012 substitution issue – Qualified overall
          </li>
          <li>
            <strong>Vendor C:</strong> Word/PDF, narrative, conditional 3% rebate, ambiguous SLA – Review/conditional
          </li>
          <li>
            <strong>Vendor D:</strong> Mixed units/currencies (₹42/kg, $0.28/unit, ₹1,850/100 pcs) – Review/fail
          </li>
          <li>
            <strong>Vendor E:</strong> Image/photo quote, 30-day lead time – Fails qualification
          </li>
        </ul>
      </div>
    </div>
  );
}

