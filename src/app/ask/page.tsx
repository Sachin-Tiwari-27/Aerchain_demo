"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { RfxContextBar } from "@/components/layout/rfx-context-bar";
import { aiLogDetail, recordActivity } from "@/lib/activity-log";

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
  { id: "coverage", title: "Which SKUs do not have comparable quotes?", tool: "get_comparison", description: "Find gaps in comparable supplier coverage" },
  { id: "verify", title: "Which extracted values should I verify?", tool: "get_source_evidence", description: "Surface ambiguous, failed, and missing quote evidence" },
  { id: "move", title: "Why did you move these SKUs between vendors?", tool: "get_comparison", description: "Inspect the evidence behind price differences" },
  { id: "prepare", title: "Prepare an award recommendation", tool: "recommend_award", description: "Summarize the deterministic scenario for approval" },
];

export default function AskPage() {
  type ChatMessage = { role: "buyer" | "analyst"; text: string };
  const [rfxId, setRfxId] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [awardFinalized, setAwardFinalized] = useState(false);
  const [rfxName, setRfxName] = useState("Selected RFx");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "analyst", text: "I can compare suppliers, test award scenarios, explain risks, and prepare a recommendation from this RFx." },
  ]);

  const addLog = (event: string, detail: string, status: "running" | "success" | "error") => {
    recordActivity("Decide", event, detail, status);
  };

  useEffect(() => {
    const loadRfx = async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error("Supabase env vars not configured");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const selectedRfxId = window.localStorage.getItem("aerchain:selected-rfx-id");
        const { data } = selectedRfxId
          ? await supabase.from("rfxs").select("*").eq("id", selectedRfxId).maybeSingle()
          : await supabase.from("rfxs").select("*").limit(1).maybeSingle();

        if (data) {
          setRfxId(data.id);
          setRfxName(data.name || "Untitled RFx");
        }
      } catch (err) {
        console.error("Error loading RFx:", err);
      }
    };

    loadRfx();
  }, []);

  const runQuestion = async (toolName: string, promptText?: string) => {
    if (!rfxId) {
      setError("No RFx loaded");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    if (promptText) setChatMessages((current) => [...current, { role: "buyer", text: promptText }]);
    addLog("Analyst API requested", `Tool request: ${toolName}`, "running");

    try {
      const res = await fetch("/api/analyst-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfxId, toolName }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Tool execution failed");
        addLog("Tool failed", data.error || "The analyst tool returned an error.", "error");
        setChatMessages((current) => [...current, { role: "analyst", text: "I couldn't complete that analysis. Open the System log in the top navigation for technical details." }]);
      } else {
        setResult(data);
        const detail = data.provenance?.usedProvider
          ? aiLogDetail(data.model, data.provenance.usedProvider, data.selectedTool || toolName)
          : data.selectedTool || toolName;
        addLog("Tool completed", detail, "success");
        setChatMessages((current) => [...current, { role: "analyst", text: data.aiReply || `Analysis complete: ${toolName.replace(/_/g, " ")}. Review the evidence below.` }]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setError(message);
      addLog("Analyst API failed", message, "error");
      setChatMessages((current) => [...current, { role: "analyst", text: "I couldn't connect to the analyst service. Open the System log in the top navigation for technical details." }]);
    } finally {
      setLoading(false);
    }
  };

  const askQuestion = async () => {
    if (!question.trim() || !rfxId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const promptText = question.trim();
    setChatMessages((current) => [...current, { role: "buyer", text: promptText }]);
    addLog("AI analyst API requested", `Question: ${promptText}`, "running");
    try {
      const res = await fetch("/api/analyst-tool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rfxId, question: promptText }) });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Question failed"); addLog("AI analyst API failed", data.error || "The analyst API returned an error.", "error"); setChatMessages((current) => [...current, { role: "analyst", text: "I couldn't answer that. Open the System log in the top navigation for technical details." }]); }
      else { setResult(data); addLog("AI analyst API completed", `${data.selectedTool?.replace(/_/g, " ") || "analysis"}${data.provenance?.usedProvider ? ` via ${data.provenance.usedProvider}` : ""}`, "success"); setChatMessages((current) => [...current, { role: "analyst", text: data.aiReply || `I ran ${data.selectedTool?.replace(/_/g, " ") || "the analysis"}. Review the structured result below.` }]); }
    } catch (err) { const message = err instanceof Error ? err.message : "Request failed"; setError(message); addLog("AI analyst API failed", message, "error"); setChatMessages((current) => [...current, { role: "analyst", text: "I couldn't connect to the analyst service. Open the System log in the top navigation for technical details." }]); }
    finally { setLoading(false); }
  };

  const finalizeAward = async () => {
    if (!rfxId) return;
    setLoading(true);
    setError(null);
    addLog("Award finalization requested", "Running the deterministic award validation.", "running");
    try {
      const res = await fetch("/api/analyst-tool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rfxId, toolName: "finalize_award" }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Award could not be finalized");
      setAwardFinalized(true);
      setResult(data);
      addLog("Award finalized", "The selected RFx was marked completed.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Award could not be finalized";
      setError(message);
      addLog("Award finalization failed", message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="grid gap-6 lg:h-[calc(100vh-16rem)] lg:min-h-135 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-5">{chatMessages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === "buyer" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "buyer" ? "rounded-br-sm bg-slate-900 text-white" : "rounded-bl-sm border border-slate-200 bg-white text-slate-700 shadow-sm"}`}><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{message.role === "buyer" ? "You" : "Analyst"}</p>{message.text}</div></div>)}{loading && <p className="text-xs font-medium text-slate-500">Analyst is checking the RFx data...</p>}</div>
          <div className="border-t border-slate-200 p-4"><div className="flex gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void askQuestion(); }} placeholder="Ask about savings, risks, vendors, or an award" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" disabled={loading || !rfxId} /><button onClick={() => void askQuestion()} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300" disabled={loading || !rfxId || !question.trim()}>Ask</button></div><p className="mt-2 text-xs text-slate-400">Answers are grounded in deterministic procurement calculations.</p></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Decision desk</p><h3 className="mt-2 text-xl font-semibold text-slate-900">Move from evidence to award</h3><p className="mt-2 text-sm leading-6 text-slate-600">Run the scenario first, review exceptions, then ask for a recommendation before finalizing.</p><div className="mt-6 space-y-2">{SUGGESTED_QUESTIONS.slice(0, 4).map((q) => <button key={q.id} onClick={() => { setSelectedQuestion(q.id); void runQuestion(q.tool, q.title); }} disabled={loading || !rfxId} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm text-slate-700 hover:border-sky-400 disabled:opacity-50"><span className="block font-semibold">{q.title}</span><span className="mt-1 block text-xs text-slate-500">{q.description}</span></button>)}</div><div className="mt-5 border-t border-slate-200 pt-4"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Award status</p><p className="mt-2 text-sm font-semibold text-amber-600">{awardFinalized ? "Finalized" : "Awaiting buyer decision"}</p></div></div>
      </section>

      {/* Result Display */}
      {error && (
        <section className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-6">
          <p className="font-medium text-rose-900">Error</p>
          <p className="mt-2 text-rose-800">The analysis could not be completed. Open the System log in the top navigation for technical details.</p>
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
          <button onClick={() => void finalizeAward()} disabled={loading || awardFinalized || !result.data?.recommendation?.recommend} className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300">{awardFinalized ? "Award finalized" : "Finalize award"}</button>
        </section>
      )}

      {result && result.toolName === "finalize_award" && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Award complete</p><h3 className="mt-2 text-lg font-semibold text-emerald-950">Selected RFx awarded to eligible vendors</h3><p className="mt-2 text-sm text-emerald-900">{result.data?.message}</p></section>}

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
                    <td className="px-4 py-2 font-medium">{row.sku || "Unknown SKU"}</td>
                    <td className="px-4 py-2 font-semibold">
                      ₹{(row.bestPrice || 0).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2 text-slate-600"><span className="font-medium text-slate-900">{row.bestVendorName || "Unknown vendor"}</span><span className="block text-xs text-slate-500">{row.vendorNames?.join(", ") || `${row.allVendors?.length || 0} vendors`}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result && result.toolName === "get_source_evidence" && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><h3 className="text-lg font-semibold text-amber-950">Values to verify</h3><p className="mt-2 text-sm text-amber-900">These records need buyer attention before relying on them in an award.</p><div className="mt-4 space-y-2">{(result.data || []).slice(0, 10).map((item: any) => <div key={item.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-semibold text-slate-900">{item.vendor_name} · {item.sku}</span><span className="text-xs font-semibold text-amber-700">{item.validation_status}</span></div><p className="mt-1 text-slate-700">{item.raw_currency || ""} {item.raw_price ?? "No price"} / {item.raw_unit || "unit"}</p><p className="mt-1 text-xs text-slate-500">{item.document_name || "No source document"} · {item.source_reference || "Source reference not recorded"}</p></div>)}</div></section>}
    </div>
  );
}
