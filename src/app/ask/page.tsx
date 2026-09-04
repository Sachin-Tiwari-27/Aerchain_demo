"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUGGESTED_QUESTIONS = [
  {
    id: "killer",
    title: "What if we split it, cheapest per line, but only among vendors who cleared the quality questionnaire?",
    tool: "run_award_scenario",
    description: "Run the killer scenario: least-cost award among qualified vendors",
  },
  {
    id: "comparison",
    title: "Show me the best price for each SKU",
    tool: "get_comparison",
    description: "Compare all vendors and identify the cheapest quote per line item",
  },
  {
    id: "qualification",
    title: "Which vendors are qualified?",
    tool: "get_vendor_qualification",
    description: "Get qualification status for all vendors",
  },
  {
    id: "risks",
    title: "What are the main risks in this RFx?",
    tool: "get_risk_summary",
    description: "Identify failed vendors, missing quotes, and risk level",
  },
  {
    id: "savings",
    title: "How much can we save with the best-price award?",
    tool: "calculate_savings",
    description: "Calculate spend and savings vs current contract",
  },
  {
    id: "recommendation",
    title: "Would you actually recommend that award?",
    tool: "recommend_award",
    description: "Review the deterministic award scenario and its risks",
  },
];

export default function AskPage() {
  const [rfxId, setRfxId] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");

  useEffect(() => {
    const loadRfx = async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error("Supabase env vars not configured");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data } = await supabase.from("rfxs").select("*").limit(1);

        if (data && data.length > 0) {
          setRfxId(data[0].id);
        }
      } catch (err) {
        console.error("Error loading RFx:", err);
      }
    };

    loadRfx();
  }, []);

  const runQuestion = async (toolName: string) => {
    if (!rfxId) {
      setError("No RFx loaded");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyst-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfxId, toolName }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Tool execution failed");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const askQuestion = async () => {
    if (!question.trim() || !rfxId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyst-tool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rfxId, question: question.trim() }) });
      const data = await res.json();
      if (!data.success) setError(data.error || "Question failed"); else setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Ask the analyst</h3>
        <div className="mt-4 flex gap-2">
          <input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void askQuestion(); }} placeholder="Ask about savings, risks, vendors, or an award" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" disabled={loading || !rfxId} />
          <button onClick={() => void askQuestion()} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:bg-slate-300" disabled={loading || !rfxId || !question.trim()}>Ask</button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Ask</p>
        <h2 className="mt-3 text-2xl font-semibold">Analyst assistant</h2>
        <p className="mt-2 max-w-2xl text-slate-600">
          Ask questions about the current RFx. The system will analyze extracted vendor data and
          provide deterministic, repeatable answers.
        </p>
      </section>

      {/* Suggested Questions */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Suggested Questions</h3>
        <div className="mt-4 space-y-3">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q.id}
              onClick={() => {
                setSelectedQuestion(q.id);
                runQuestion(q.tool);
              }}
              disabled={loading || !rfxId}
              className={`w-full text-left rounded-lg border-2 p-4 transition-all ${
                selectedQuestion === q.id
                  ? "border-sky-500 bg-sky-50"
                  : "border-slate-200 hover:border-sky-300 hover:bg-slate-50"
              } disabled:opacity-50 ${q.id === "killer" ? "border-l-4 border-l-rose-500" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {q.id === "killer" && (
                    <span className="mb-2 inline-block rounded bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
                      🔥 KILLER SCENARIO
                    </span>
                  )}
                  <p className="font-medium text-slate-900">{q.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{q.description}</p>
                </div>
                {selectedQuestion === q.id && loading && (
                  <div className="ml-4 text-sky-600">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-300 border-r-sky-600" />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Result Display */}
      {error && (
        <section className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-6">
          <p className="font-medium text-rose-900">Error</p>
          <p className="mt-2 text-rose-800">{error}</p>
        </section>
      )}

      {result && result.toolName === "run_award_scenario" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Killer Scenario Results</h3>
          {result.aiReply && <p className="mt-2 text-sm text-slate-600">{result.aiReply}</p>}
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-600">Award Cost</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                ₹{(result.data?.summary?.totalAwardCost || 0).toLocaleString("en-IN")}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-600">Current Cost</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                ₹{(result.data?.summary?.totalCurrentCost || 0).toLocaleString("en-IN")}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-4">
              <p className="text-xs font-medium uppercase text-emerald-600">Savings</p>
              <p className="mt-2 text-2xl font-bold text-emerald-900">
                ₹{(result.data?.summary?.totalSavings || 0).toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-sm text-emerald-700">{result.data?.summary?.savingsPercent}%</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-600">Vendors Used</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {result.data?.summary?.vendorsUsed}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {result.data?.summary?.concentrationPercent}% max
              </p>
            </div>
          </div>

          {/* Constraints */}
          <div className="mt-6">
            <h4 className="font-semibold text-slate-900">Constraint Satisfaction</h4>
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-700">
                <span
                  className={
                    result.data?.summary?.constraintsSatisfied?.minVendorsMet
                      ? "text-emerald-700"
                      : "text-rose-700"
                  }
                >
                  {result.data?.summary?.constraintsSatisfied?.minVendorsMet ? "✓" : "✗"}
                </span>
                {" Minimum 2 vendors"}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                <span
                  className={
                    result.data?.summary?.constraintsSatisfied?.concentrationMet
                      ? "text-emerald-700"
                      : "text-rose-700"
                  }
                >
                  {result.data?.summary?.constraintsSatisfied?.concentrationMet ? "✓" : "✗"}
                </span>
                {" Concentration ≤ 70%"}
              </p>
              {result.data?.summary?.constraintsSatisfied?.message && (
                <p className="mt-2 text-sm font-medium">
                  {result.data.summary.constraintsSatisfied.message}
                </p>
              )}
            </div>
          </div>

          {/* Excluded SKUs */}
          {result.data?.excludedSkus && result.data.excludedSkus.length > 0 && (
            <div className="mt-6">
              <h4 className="font-semibold text-slate-900">
                Excluded SKUs ({result.data.excludedSkus.length})
              </h4>
              <div className="mt-2 space-y-2">
                {result.data.excludedSkus.slice(0, 5).map((excluded: any, i: number) => (
                  <div key={i} className="rounded border border-amber-200 bg-amber-50 p-2">
                    <p className="text-sm font-medium text-amber-900">{excluded.sku}</p>
                    <p className="text-xs text-amber-800">{excluded.reason}</p>
                  </div>
                ))}
                {result.data.excludedSkus.length > 5 && (
                  <p className="text-sm text-slate-600">
                    +{result.data.excludedSkus.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {result && result.toolName === "recommend_award" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Award Recommendation</h3>
          <div className={`mt-4 rounded-xl border p-4 ${result.data?.recommendation?.recommend ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <p className="text-sm font-semibold uppercase tracking-[0.14em]">{result.data?.recommendation?.recommend ? "Recommend" : "Do not recommend yet"}</p>
            <p className="mt-2 text-sm text-slate-800">{result.data?.recommendation?.summary}</p>
          </div>
          {result.data?.recommendation?.risks?.length > 0 && <div className="mt-4"><h4 className="font-semibold">Risks to resolve</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{result.data.recommendation.risks.map((risk: string) => <li key={risk}>{risk}</li>)}</ul></div>}
        </section>
      )}

      {result && result.toolName === "get_vendor_qualification" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Vendor Qualification Status</h3>
          {result.aiReply && <p className="mt-2 text-sm text-slate-600">{result.aiReply}</p>}
          <div className="mt-4 space-y-2">
            {(result.data || []).map((v: any, i: number) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-lg border-l-4 p-3 ${
                  v.qualificationStatus === "QUALIFIED"
                    ? "border-l-emerald-500 bg-emerald-50"
                    : v.qualificationStatus === "REVIEW"
                      ? "border-l-amber-500 bg-amber-50"
                      : "border-l-rose-500 bg-rose-50"
                }`}
              >
                <span className="font-medium">{v.vendorName}</span>
                <span
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    v.qualificationStatus === "QUALIFIED"
                      ? "bg-emerald-200 text-emerald-900"
                      : v.qualificationStatus === "REVIEW"
                        ? "bg-amber-200 text-amber-900"
                        : "bg-rose-200 text-rose-900"
                  }`}
                >
                  {v.qualificationStatus}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {result && result.toolName === "get_risk_summary" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Risk Summary</h3>
          {result.aiReply && <p className="mt-2 text-sm text-slate-600">{result.aiReply}</p>}
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-600">Failed Vendors</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{result.data?.failedVendors}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-600">In Review</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{result.data?.reviewVendors}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-600">Missing Quotes</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {result.data?.missingQuotes}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-600">Ambiguous Quotes</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {result.data?.ambiguousQuotes}
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-lg border-l-4 border-l-amber-500 bg-amber-50 p-4">
            <p className="text-sm">
              <span className="font-semibold text-amber-900">Risk Level:</span>
              <span
                className={`ml-2 ${
                  result.data?.riskLevel === "HIGH"
                    ? "text-rose-700"
                    : result.data?.riskLevel === "MEDIUM"
                      ? "text-amber-700"
                      : "text-emerald-700"
                }`}
              >
                {result.data?.riskLevel}
              </span>
            </p>
          </div>
        </section>
      )}

      {result && result.toolName === "calculate_savings" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Savings Analysis</h3>
          {result.aiReply && <p className="mt-2 text-sm text-slate-600">{result.aiReply}</p>}
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-600">Current Spend</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                ₹{(result.data?.currentSpend || 0).toLocaleString("en-IN")}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-600">Proposed Spend</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                ₹{(result.data?.proposedSpend || 0).toLocaleString("en-IN")}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-4">
              <p className="text-xs font-medium uppercase text-emerald-600">Savings</p>
              <p className="mt-2 text-2xl font-bold text-emerald-900">
                ₹{(result.data?.savings || 0).toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-sm text-emerald-700">{result.data?.savingsPercent}%</p>
            </div>
          </div>
        </section>
      )}

      {result && result.toolName === "get_comparison" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Price Comparison</h3>
          {result.aiReply && <p className="mt-2 text-sm text-slate-600">{result.aiReply}</p>}
          <p className="mt-2 text-sm text-slate-600">
            Showing cheapest quote per SKU across all vendors
          </p>
          <div className="mt-4 max-h-96 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-900">SKU</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-900">Best Price</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-900">Vendors</th>
                </tr>
              </thead>
              <tbody>
                {(result.data || []).slice(0, 10).map((row: any, i: number) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-4 py-2">{row.lineItemId.slice(0, 8)}...</td>
                    <td className="px-4 py-2 font-semibold">
                      ₹{(row.bestPrice || 0).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{row.allVendors.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
