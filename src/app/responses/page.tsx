"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { RfxContextBar } from "@/components/layout/rfx-context-bar";
import { BulkUploader, type UploadedDocument } from "@/components/responses/bulk-uploader";
import { aiLogDetail, recordActivity } from "@/lib/activity-log";

interface VendorDocument {
  id: string;
  vendor_id: string;
  filename: string;
  file_type: string;
  storage_path?: string | null;
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
  diagnostics?: Array<{
    provider: string;
    model: string;
    attempt: number;
    promptVariant: "primary" | "strict-retry";
    failureType: "provider-unavailable" | "invalid-json" | "schema-incompatible";
    message: string;
  }>;
  metadata?: {
    provider: string;
    model: string;
    fallbackAttempts: number;
    diagnostics: ExtractionResult["diagnostics"];
  };
}

export default function ResponsesPage() {
  const EXTRACTION_CONCURRENCY = 2;
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [vendors, setVendors] = useState<Record<string, Vendor>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [rfxId, setRfxId] = useState<string>("");
  const [rfxName, setRfxName] = useState("Selected RFx");
  const [extracting, setExtracting] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [extractionRun, setExtractionRun] = useState<{ total: number; completed: number; failed: number } | null>(null);
  const [approvedNotice, setApprovedNotice] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.sessionStorage.getItem("aerchain:just-approved"),
  );

  useEffect(() => {
    const flag = window.sessionStorage.getItem("aerchain:just-approved");
    if (!flag) return;
    window.sessionStorage.removeItem("aerchain:just-approved");
    const timer = window.setTimeout(() => setApprovedNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, []);

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
        const selectedRfxId = window.localStorage.getItem("aerchain:selected-rfx-id");
        const rfxQuery = supabase.from("rfxs").select("id, name, category");
        const { data: rfxData, error: rfxError } = selectedRfxId
          ? await rfxQuery.eq("id", selectedRfxId).maybeSingle()
          : await rfxQuery.limit(1).maybeSingle();

        if (rfxError) {
          throw new Error(`Failed to fetch RFx: ${rfxError.message}`);
        }

        if (!rfxData) {
          throw new Error("No RFx found. Please run seed script first.");
        }

        console.log("RFx loaded:", rfxData.id);
        setRfxId(rfxData.id);
        setRfxName(rfxData.name || "Untitled RFx");

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

  const handleExtract = async (docId: string, documentOverride?: VendorDocument) => {
    const doc = documentOverride ?? documents.find((d) => d.id === docId);
    if (!doc) return false;

    setExtracting((prev) => ({ ...prev, [docId]: true }));
    recordActivity("Responses", "Extraction requested", doc.filename, "running");

    try {
      const vendor = vendors[doc.vendor_id];
      const storedDocumentKind = doc.metadata?.documentKind;
      const documentKind = storedDocumentKind === "image" || storedDocumentKind === "pdf" || storedDocumentKind === "text-derived"
        ? storedDocumentKind
        : doc.file_type === "application/pdf" || doc.filename.toLowerCase().endsWith(".pdf")
          ? "pdf"
          : doc.file_type?.startsWith("image/")
            ? "image"
            : "text-derived";
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
          documentKind,
          fileName: doc.filename,
        }),
      });

      const result: ExtractionResult = await response.json();

      if (result.success) {
        const modelDetail = result.metadata
          ? aiLogDetail(result.metadata.model, result.metadata.provider, doc.filename)
          : doc.filename;
        recordActivity("Responses", "Extraction completed", modelDetail, "success");
        // Refresh documents list
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? { ...d, processing_status: "EXTRACTED", processed_at: new Date().toISOString() }
              : d,
          ),
        );
        return true;
      } else {
        const schemaFailure = result.diagnostics?.some(
          (diagnostic) => diagnostic.failureType === "schema-incompatible",
        );
        const providerUnavailable = result.diagnostics?.some(
          (diagnostic) => diagnostic.failureType === "provider-unavailable",
        );
        const failureDetail = schemaFailure
          ? `Incompatible vendor JSON: ${result.error || doc.filename}`
          : providerUnavailable
            ? `Provider unavailable: ${result.error || doc.filename}`
            : result.error || doc.filename;
        recordActivity("Responses", "Extraction failed", failureDetail, "error");
        setDocuments((prev) =>
          prev.map((d) => (d.id === docId ? { ...d, processing_status: "ERROR" } : d)),
        );
        console.error("Extraction failed:", { error: result.error, diagnostics: result.diagnostics });
        return false;
      }
    } catch (error) {
      recordActivity("Responses", "Extraction failed", error instanceof Error ? error.message : "Extraction request failed", "error");
      console.error("Extraction request error:", error);
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, processing_status: "ERROR" } : d)),
      );
      return false;
    } finally {
      setExtracting((prev) => ({ ...prev, [docId]: false }));
    }
  };

  const extractUploadedDocuments = async (uploadedDocs: UploadedDocument[]) => {
    const queue = [...uploadedDocs];
    let completed = 0;
    let failed = 0;
    setExtractionRun({ total: queue.length, completed: 0, failed: 0 });

    const worker = async () => {
      while (queue.length > 0) {
        const document = queue.shift();
        if (!document) return;
        const succeeded = await handleExtract(document.id, document);
        completed += 1;
        if (!succeeded) failed += 1;
        setExtractionRun({ total: uploadedDocs.length, completed, failed });
      }
    };

    await Promise.all(Array.from({ length: Math.min(EXTRACTION_CONCURRENCY, queue.length) }, () => worker()));
    window.setTimeout(() => setExtractionRun(null), 2500);
  };

  const viewOriginal = async (documentId: string, storagePath: string | null) => {
    if (!storagePath) return;
    recordActivity("Responses", "Original document requested", storagePath, "running");
    const response = await fetch(`/api/responses/upload?documentId=${encodeURIComponent(documentId)}&path=${encodeURIComponent(storagePath)}`);
    const result = await response.json();
    if (!response.ok || !result.success || !result.signedUrl) {
      recordActivity("Responses", "Original document failed", result.error || "Could not open document", "error");
      setError(result.error || "Could not open original document");
      return;
    }
    window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    recordActivity("Responses", "Original document opened", "Signed URL created", "success");
  };

  const handleDelete = async (documentId: string) => {
    const doc = documents.find((document) => document.id === documentId);
    if (!doc || !window.confirm(`Delete ${doc.filename} and its extracted response?`)) return;

    setDeleting((prev) => ({ ...prev, [documentId]: true }));
    recordActivity("Responses", "Response deletion requested", doc.filename, "running");

    try {
      const response = await fetch(`/api/responses/upload?documentId=${encodeURIComponent(documentId)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not delete response");

      setDocuments((prev) => prev.filter((document) => document.id !== documentId));
      recordActivity("Responses", "Response deleted", doc.filename, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete response";
      recordActivity("Responses", "Response deletion failed", message, "error");
      setError(message);
    } finally {
      setDeleting((prev) => ({ ...prev, [documentId]: false }));
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
      <RfxContextBar stage="Upload" />

      {approvedNotice && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p><span className="mr-2 font-bold">✓</span>RFx sent to suppliers. Their responses can be collected here.</p>
          <button type="button" onClick={() => setApprovedNotice(null)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-900">Dismiss</button>
        </div>
      )}

      <BulkUploader
        rfxId={rfxId}
        vendors={Object.values(vendors)}
        onUploaded={(newDocuments: UploadedDocument[]) => {
          setDocuments((current) => [...current, ...newDocuments]);
          void extractUploadedDocuments(newDocuments);
        }}
      />

      {extractionRun && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <div className="flex items-center justify-between gap-4">
            <p className="font-semibold">Extracting responses</p>
            <span>{extractionRun.completed} of {extractionRun.total} complete{extractionRun.failed > 0 ? ` · ${extractionRun.failed} failed` : ""}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${(extractionRun.completed / extractionRun.total) * 100}%` }} /></div>
          <p className="mt-2 text-xs text-sky-700">Two documents are processed at a time to avoid overloading the model provider.</p>
        </div>
      )}

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
                  <th className="px-6 py-3 text-center font-semibold text-slate-900">View original</th>
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
                        {extracting[doc.id] ? "EXTRACTING" : doc.processing_status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      {doc.storage_path ? (
                        <button
                          type="button"
                          onClick={() => void viewOriginal(doc.id, doc.storage_path ?? null)}
                          className="text-xs font-semibold text-sky-700 hover:text-sky-900"
                        >
                          View original
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-center gap-2 whitespace-nowrap">
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
                      <button
                        type="button"
                        onClick={() => void handleDelete(doc.id)}
                        disabled={deleting[doc.id] || extracting[doc.id]}
                        className="ml-2 inline-flex items-center justify-center rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:bg-slate-300"
                      >
                        {deleting[doc.id] ? "Deleting..." : "Delete"}
                      </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


    </div>
  );
}
