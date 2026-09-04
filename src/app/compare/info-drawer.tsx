import type { ReactNode } from "react";

export type CompareInfoKey = "validation-status" | "share-cap" | "filters";

export const compareInfoContent: Record<CompareInfoKey, { eyebrow: string; title: string; subtitle: string; body: ReactNode }> = {
  "validation-status": {
    eyebrow: "Quote status",
    title: "Validation status",
    subtitle: "What the marker under each quote means.",
    body: (
      <div className="space-y-4 text-sm leading-6 text-slate-600">
        <p><strong className="text-emerald-700">VALID</strong> means the quote was matched to this SKU and converted into the comparison currency and unit.</p>
        <p><strong className="text-rose-700">MISSING</strong> means the supplier did not provide a comparable quote for this SKU. A <strong className="text-amber-700">?</strong> means the value needs review before it should be used for a decision.</p>
        <p>Click the price itself to open the source evidence, original value, normalization details, and extraction confidence.</p>
      </div>
    ),
  },
  "share-cap": {
    eyebrow: "Award guardrail",
    title: "Supplier share cap",
    subtitle: "Why concentration matters in the award scenario.",
    body: (
      <div className="space-y-4 text-sm leading-6 text-slate-600">
        <p>The share cap limits how much of the total award can go to one supplier. The current policy allows a supplier to receive at most <strong className="text-slate-900">70%</strong>.</p>
        <p>This reduces dependency on one supplier and leaves room for a more resilient award across qualified vendors.</p>
        <p>The current comparison view shows the cap policy. Final allocation shares are calculated during the award decision.</p>
      </div>
    ),
  },
  filters: {
    eyebrow: "Comparison controls",
    title: "Filter definitions",
    subtitle: "How each view changes the comparison matrix.",
    body: (
      <div className="space-y-4 text-sm leading-6 text-slate-600">
        <p><strong className="text-slate-900">Qualified</strong> keeps suppliers whose qualification checks passed.</p>
        <p><strong className="text-slate-900">Comparable only</strong> keeps SKUs with at least one valid supplier quote. <strong className="text-slate-900">Include review</strong> includes suppliers that need review or have exceptions.</p>
        <p><strong className="text-slate-900">Show failed</strong> includes suppliers that failed qualification. <strong className="text-slate-900">Confidence scores</strong> displays the extraction model&apos;s confidence beside each quote.</p>
      </div>
    ),
  },
};