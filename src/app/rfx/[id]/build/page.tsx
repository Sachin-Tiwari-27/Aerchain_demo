"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RfxState = {
  rfx?: { id: string; name?: string | null; category?: string | null; description?: string | null; status?: string | null; currency?: string | null; max_lead_time_days?: number | null; minimum_awarded_vendors?: number | null } | null;
  lineItems?: Array<{ id: string; sku: string; description?: string | null; annual_quantity?: number | null; unit?: string | null }>;
  requirements?: Array<{ id: string; name: string; status?: string | null }>;
  questionnaire?: Array<{ id: string; question: string; required?: boolean | null }>;
};

type ConversationEntry = { role: "buyer" | "assistant" | "system"; text: string };
const workflowSteps = ["Describe need", "Review RFx", "Invite suppliers", "Compare", "Award"];

export default function BuildPage() {
  const [rfxId, setRfxId] = useState<string | null>(null);
  const [state, setState] = useState<RfxState | null>(null);
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<ConversationEntry[]>([
    { role: "assistant", text: "Tell me what you need to source. I will shape the RFx, ask for missing details, and keep the draft on the right up to date." },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/rfx-builder");
        const data = await response.json();
        if (data?.success && data?.data?.rfx) {
          setRfxId(data.data.rfx.id);
          setState(data.data);
        } else setError("No RFx draft found. Use the seed action to create one.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load RFx state");
      }
    };
    void load();
  }, []);

  const runAction = async (action: string, payload: Record<string, unknown> = {}) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/rfx-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, rfxId, ...payload }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "RFx action failed");
      if (data?.data?.rfx?.id) setRfxId(data.data.rfx.id);
      setState((current) => ({ ...(current ?? {}), ...(data.data ?? {}) }));
      return data.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const submitMessage = async () => {
    const nextMessage = message.trim();
    if (!nextMessage) return;
    setConversation((current) => [...current, { role: "buyer", text: nextMessage }]);
    setMessage("");
    const response = await runAction("build_from_message", { message: nextMessage });
    if (response?.message) setConversation((current) => [...current, { role: "assistant", text: response.message }]);
    if (response?.clarification) setConversation((current) => [...current, { role: "system", text: `One detail to confirm: ${response.clarification}` }]);
  };

  const approve = async () => {
    const response = await runAction("approve_rfx");
    if (response) setNotice("RFx approved. Supplier invitation is ready to simulate.");
  };

  const rfx = state?.rfx;
  const lineItems = state?.lineItems ?? [];
  const requirements = state?.requirements ?? [];
  const questionnaire = state?.questionnaire ?? [];
  const isApproved = rfx?.status === "SENT";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700"><span>RFx workspace</span><span className="h-1 w-1 rounded-full bg-slate-300" /><span className="text-slate-400">Draft {rfxId ? rfxId.slice(0, 8) : "loading"}</span></div>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950">Turn a sourcing brief into a supplier-ready RFx.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Use the conversation to clarify the brief. The structured RFx stays visible, editable, and ready for the next procurement step.</p>
        </div>
        <div className="flex items-center gap-3"><span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">{rfx?.status ?? "Loading"}</span><button onClick={() => void runAction("draft_rfx_from_seed")} disabled={loading || !rfxId} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50">Load sample RFx</button></div>
      </header>

      <nav aria-label="RFx workflow" className="grid grid-cols-2 gap-2 sm:grid-cols-5">{workflowSteps.map((step, index) => { const complete = index === 0 || (index === 1 && Boolean(rfx?.name)); return <div key={step} className={`flex items-center gap-3 border-b-2 px-1 pb-3 text-sm ${complete ? "border-sky-500 text-slate-950" : "border-slate-200 text-slate-400"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${complete ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span><span className="font-medium">{step}</span></div>; })}</nav>

      <main className="grid gap-6 xl:grid-cols-[minmax(0,0.86fr)_minmax(520px,1.14fr)]">
        <section className="flex min-h-[680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#102b3f] shadow-xl shadow-slate-200/60">
          <div className="border-b border-white/10 px-6 py-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">AI copilot</p><h3 className="mt-1 text-xl font-semibold text-white">Shape the brief</h3></div><span className="flex items-center gap-2 text-xs text-slate-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Ready</span></div><div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-300">The copilot extracts only what you say. Missing prices, vendors, and quantities stay open for review.</div></div>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">{conversation.map((entry, index) => <div key={`${entry.role}-${index}`} className={`flex ${entry.role === "buyer" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${entry.role === "buyer" ? "rounded-br-sm bg-cyan-300 text-slate-950" : entry.role === "system" ? "rounded-bl-sm border border-amber-300/20 bg-amber-300/10 text-amber-100" : "rounded-bl-sm bg-white/10 text-slate-200"}`}>{entry.role !== "buyer" && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">{entry.role === "system" ? "Review point" : "Copilot"}</p>}{entry.text}</div></div>)}{loading && <div className="text-xs text-slate-400">Copilot is shaping the next draft...</div>}</div>
          <div className="border-t border-white/10 p-4"><div className="rounded-2xl bg-white p-2 shadow-lg"><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitMessage(); } }} placeholder="e.g. Source 3-ply corrugated cartons for our India plants" rows={3} disabled={loading || !rfxId} className="w-full resize-none border-0 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400" /><div className="flex items-center justify-between border-t border-slate-100 px-3 pt-2"><span className="text-xs text-slate-400">Enter to send · Shift + Enter for a new line</span><button onClick={() => void submitMessage()} disabled={loading || !rfxId || !message.trim()} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300">Send brief</button></div></div></div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Live document</p><h3 className="mt-1 text-xl font-semibold text-slate-950">RFx preview</h3></div><div className="flex gap-2"><button onClick={() => void runAction("validate_rfx")} disabled={loading || !rfxId} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-700 disabled:opacity-50">Validate</button><button onClick={() => void approve()} disabled={loading || !rfxId || isApproved} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{isApproved ? "Sent to suppliers" : "Approve & send"}</button></div></div>
          <div className="space-y-6 p-6">
            <div className="rounded-2xl bg-slate-950 p-5 text-white"><p className="text-xs uppercase tracking-[0.16em] text-cyan-300">{rfx?.category || "Category pending"}</p><h4 className="mt-2 text-2xl font-semibold">{rfx?.name || "Untitled sourcing event"}</h4><p className="mt-3 text-sm leading-6 text-slate-300">{rfx?.description || "Describe the sourcing need in the copilot to create the RFx summary."}</p><div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-xs"><div><p className="text-slate-400">Currency</p><p className="mt-1 font-semibold">{rfx?.currency || "INR"}</p></div><div><p className="text-slate-400">Lead time</p><p className="mt-1 font-semibold">{rfx?.max_lead_time_days ? `${rfx.max_lead_time_days} days` : "Not set"}</p></div><div><p className="text-slate-400">Suppliers</p><p className="mt-1 font-semibold">{rfx?.minimum_awarded_vendors || "Any"} minimum</p></div></div></div>
            <div><div className="flex items-center justify-between"><h4 className="font-semibold text-slate-950">Scope & line items</h4><span className="text-xs font-medium text-slate-500">{lineItems.length} items</span></div><div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">{lineItems.length === 0 ? <p className="p-4 text-sm text-slate-500">Line items will appear here after the RFx is drafted.</p> : lineItems.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3"><div className="min-w-0"><p className="font-mono text-xs font-semibold text-sky-700">{item.sku}</p><p className="truncate text-sm text-slate-700">{item.description || "Description pending"}</p></div><p className="shrink-0 text-xs text-slate-500">{item.annual_quantity?.toLocaleString("en-IN") || "-"} {item.unit || "pcs"}</p></div>)}{lineItems.length > 5 && <p className="border-t border-slate-100 px-4 py-3 text-xs font-medium text-sky-700">+ {lineItems.length - 5} more line items</p>}</div></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><h4 className="font-semibold text-slate-950">Requirements</h4><span className="text-xs text-slate-500">{requirements.length}</span></div><p className="mt-2 text-sm text-slate-500">Commercial and technical guardrails for supplier quotes.</p></div><div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><h4 className="font-semibold text-slate-950">Questionnaire</h4><span className="text-xs text-slate-500">{questionnaire.length} questions</span></div><p className="mt-2 text-sm text-slate-500">Quality and delivery checks used for qualification.</p></div></div>
            {isApproved && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold text-emerald-900">Supplier round is open</p><p className="mt-1 text-sm text-emerald-800">Responses can now be uploaded and normalized for comparison.</p><div className="mt-3 flex flex-wrap gap-2"><Link href="/responses" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Open response intake</Link><Link href="/compare" className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800">View comparison</Link></div></div>}
          </div>
        </section>
      </main>

      {(error || notice) && <div className={`rounded-xl border p-4 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || notice}</div>}
      <section className="grid gap-4 md:grid-cols-3"><Link href="/responses" className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Next step</p><h3 className="mt-2 font-semibold text-slate-950">Collect responses</h3><p className="mt-1 text-sm leading-6 text-slate-600">Upload supplier documents and run structured extraction.</p><span className="mt-4 inline-block text-sm font-semibold text-sky-700">Open intake -&gt;</span></Link><Link href="/compare" className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Decision</p><h3 className="mt-2 font-semibold text-slate-950">Compare supplier quotes</h3><p className="mt-1 text-sm leading-6 text-slate-600">Inspect normalized prices, confidence, and source evidence.</p><span className="mt-4 inline-block text-sm font-semibold text-sky-700">Open comparison -&gt;</span></Link><Link href="/ask" className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Recommendation</p><h3 className="mt-2 font-semibold text-slate-950">Ask about the award</h3><p className="mt-1 text-sm leading-6 text-slate-600">Run deterministic scenarios and ask the analyst about risks.</p><span className="mt-4 inline-block text-sm font-semibold text-sky-700">Open analyst -&gt;</span></Link></section>
    </div>
  );
}
