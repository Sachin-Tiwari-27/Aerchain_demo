"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

interface Vendor {
  id: string;
  name: string;
  status: "QUALIFIED" | "QUALIFIED_WITH_EXCEPTIONS" | "REVIEW" | "FAILED";
  share: string;
}

interface SKU {
  id: string;
  sku: string;
  description: string;
}

interface PriceCell {
  quoteId: string;
  price: number | null;
  unit: string | null;
  currency: string | null;
  rawPrice: number | null;
  rawUnit: string | null;
  rawCurrency: string | null;
  conversionMethod: string | null;
  conversionRate: number | null;
  confidence: number | null;
  sourceDocumentId: string | null;
  sourceReference: string | null;
  conditions: string | null;
  status: string;
}

interface EvidenceDocument {
  filename: string;
  file_type: string | null;
  storage_path: string | null;
}

interface EvidenceQuote extends PriceCell {
  document: EvidenceDocument | null;
}

const formatPrice = (value: number | null) => {
  if (value === null) return "—";
  return `₹${value.toLocaleString("en-IN")}`;
};

const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case "QUALIFIED":
      return "bg-emerald-100 text-emerald-700";
    case "QUALIFIED_WITH_EXCEPTIONS":
      return "bg-blue-100 text-blue-700";
    case "REVIEW":
      return "bg-amber-100 text-amber-700";
    case "FAILED":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

const getStatusDot = (status: string) => {
  switch (status) {
    case "QUALIFIED":
      return "bg-emerald-500";
    case "QUALIFIED_WITH_EXCEPTIONS":
      return "bg-blue-500";
    case "REVIEW":
      return "bg-amber-500";
    case "FAILED":
      return "bg-rose-500";
    default:
      return "bg-slate-500";
  }
};

export default function ComparePage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [priceMatrix, setPriceMatrix] = useState<Record<string, Record<string, PriceCell>>>({});
  const [documentsById, setDocumentsById] = useState<Record<string, EvidenceDocument>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceQuote | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error("Supabase environment variables not configured");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Fetch the first RFx
        const { data: rfxData } = await supabase.from("rfxs").select("*").limit(1);
        if (!rfxData || rfxData.length === 0) {
          setError("No RFx found");
          return;
        }
        const rfxId = rfxData[0].id;

        // Fetch vendors with their responses status
        const { data: vendorData } = await supabase.from("vendors").select("*");
        const { data: responseData } = await supabase
          .from("vendor_responses")
          .select("vendor_id, status")
          .eq("rfx_id", rfxId);

        const responseByVendor: Record<string, string> = {};
        responseData?.forEach((r) => {
          responseByVendor[r.vendor_id] = r.status || "REVIEW";
        });

        const vendorList: Vendor[] = (vendorData || []).map((v) => ({
          id: v.id,
          name: v.name,
          status: (responseByVendor[v.id] || "REVIEW") as "QUALIFIED" | "QUALIFIED_WITH_EXCEPTIONS" | "REVIEW" | "FAILED",
          share: "—", // TODO: calculate from award allocation
        }));
        setVendors(vendorList);

        // Fetch line items (SKUs)
        const { data: lineItems } = await supabase
          .from("rfx_line_items")
          .select("*")
          .eq("rfx_id", rfxId)
          .order("sku");

        setSkus(
          (lineItems || []).map((li) => ({
            id: li.id,
            sku: li.sku,
            description: li.description || "—",
          })),
        );

        // Fetch vendor quotes
        const { data: quotes } = await supabase
          .from("vendor_quotes")
          .select("*")
          .eq("rfx_id", rfxId);
        const { data: documents } = await supabase
          .from("vendor_documents")
          .select("id, filename, file_type, storage_path")
          .eq("rfx_id", rfxId);
        const documentById: Record<string, EvidenceDocument> = {};
        documents?.forEach((document) => {
          documentById[document.id] = document;
        });
        setDocumentsById(documentById);

        // Build price matrix: { lineItemId: { vendorId: { price, unit, currency, status } } }
        const matrix: Record<string, Record<string, PriceCell>> = {};
        (quotes || []).forEach((q) => {
          if (!matrix[q.line_item_id]) {
            matrix[q.line_item_id] = {};
          }
          matrix[q.line_item_id][q.vendor_id] = {
            quoteId: q.id,
            price: q.normalized_price,
            unit: q.normalized_unit,
            currency: q.normalized_currency,
            rawPrice: q.raw_price,
            rawUnit: q.raw_unit,
            rawCurrency: q.raw_currency,
            conversionMethod: q.conversion_method,
            conversionRate: q.conversion_rate,
            confidence: q.confidence,
            sourceDocumentId: q.source_document_id,
            sourceReference: q.source_reference,
            conditions: q.conditions,
            status: q.validation_status || "UNKNOWN",
          };
        });

        setPriceMatrix(matrix);
      } catch (err: any) {
        console.error("Error loading comparison data:", err);
        setError(err.message || "Failed to load comparison data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);
  if (loading) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Compare</p>
          <h2 className="mt-3 text-2xl font-semibold">Vendor comparison</h2>
          <p className="mt-4 text-slate-600">Loading comparison data...</p>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Compare</p>
          <h2 className="mt-3 text-2xl font-semibold">Vendor comparison</h2>
          <p className="mt-4 text-rose-600">{error}</p>
          <p className="mt-2 text-sm text-slate-600">
            Run the test extraction first: POST /api/test-extract with rfxId and vendorName
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Compare</p>
        <h2 className="mt-3 text-2xl font-semibold">Vendor comparison</h2>
        <p className="mt-2 max-w-2xl text-slate-600">
          Real extracted and normalized vendor quotes. Qualification badges reflect extracted data
          processing results.
        </p>
      </section>

      {vendors.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-slate-600">
            No vendor data yet. Run test extractions to populate this view.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-5">
            {vendors.map((vendor) => (
              <div
                key={vendor.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-600">{vendor.name}</p>
                  <span className={["rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", getStatusBadgeColor(vendor.status)].join(" ")}>
                    {vendor.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-semibold">{vendor.share}</p>
                <p className="mt-1 text-xs text-slate-500">share cap</p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">SKU</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    {vendors.map((vendor) => (
                      <th key={vendor.id} className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs">{vendor.name}</span>
                          <span className={["inline-flex h-2.5 w-2.5 rounded-full", getStatusDot(vendor.status)].join(" ")} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {skus.map((sku) => (
                    <tr key={sku.id} className="border-t border-slate-200">
                      <td className="px-4 py-3 font-medium text-slate-900">{sku.sku}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{sku.description}</td>
                      {vendors.map((vendor) => {
                        const cell = priceMatrix[sku.id]?.[vendor.id];
                        return (
                          <td
                            key={`${sku.id}-${vendor.id}`}
                            className="px-4 py-3 text-slate-700 text-sm"
                          >
                            {cell ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedEvidence({
                                    ...cell,
                                    document: cell.sourceDocumentId
                                      ? documentsById[cell.sourceDocumentId] ?? null
                                      : null,
                                  })
                                }
                                className="flex w-full flex-col gap-0.5 text-left transition hover:text-sky-700"
                                title="View quote evidence"
                              >
                                <span className="font-semibold">{formatPrice(cell.price)}</span>
                                <span className="text-xs text-slate-500">
                                  {cell.status === "VALID" ? "✓" : cell.status === "MISSING" ? "✗" : "?"}
                                </span>
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {selectedEvidence ? (
        <div className="fixed inset-0 z-20 flex justify-end bg-slate-900/30" role="presentation" onClick={() => setSelectedEvidence(null)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="evidence-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Evidence</p>
                <h2 id="evidence-title" className="mt-2 text-xl font-semibold text-slate-900">Quote provenance</h2>
              </div>
              <button type="button" onClick={() => setSelectedEvidence(null)} className="text-sm font-medium text-slate-500 hover:text-slate-900">
                Close
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Original value</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {selectedEvidence.rawPrice === null ? "Not stated" : `${selectedEvidence.rawCurrency ?? ""} ${selectedEvidence.rawPrice.toLocaleString("en-IN")} / ${selectedEvidence.rawUnit ?? "unit"}`}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Normalized value</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {selectedEvidence.price === null ? "Unavailable" : `${selectedEvidence.currency ?? "INR"} ${selectedEvidence.price.toLocaleString("en-IN")} / ${selectedEvidence.unit ?? "unit"}`}
                </p>
              </div>
              <dl className="grid gap-4 text-sm">
                <div><dt className="text-slate-500">Validation</dt><dd className="mt-1 font-medium text-slate-900">{selectedEvidence.status}</dd></div>
                <div><dt className="text-slate-500">Mapping confidence</dt><dd className="mt-1 font-medium text-slate-900">{selectedEvidence.confidence === null ? "Not recorded" : `${Math.round(selectedEvidence.confidence * 100)}%`}</dd></div>
                <div><dt className="text-slate-500">Normalization</dt><dd className="mt-1 font-medium text-slate-900">{selectedEvidence.conversionMethod ?? "No conversion method recorded"}{selectedEvidence.conversionRate === null ? "" : ` (${selectedEvidence.conversionRate})`}</dd></div>
                <div><dt className="text-slate-500">Source document</dt><dd className="mt-1 font-medium text-slate-900">{selectedEvidence.document?.filename ?? (selectedEvidence.sourceDocumentId ?? "Not linked")}</dd></div>
                <div><dt className="text-slate-500">Source reference</dt><dd className="mt-1 font-medium text-slate-900">{selectedEvidence.sourceReference ?? "Not recorded"}</dd></div>
                {selectedEvidence.conditions ? <div><dt className="text-slate-500">Conditions</dt><dd className="mt-1 font-medium text-slate-900">{selectedEvidence.conditions}</dd></div> : null}
              </dl>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
