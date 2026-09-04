"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { recordActivity } from "@/lib/activity-log";

type RfxState = {
  rfx?: { id: string; name?: string | null; category?: string | null; description?: string | null; status?: string | null; currency?: string | null; max_lead_time_days?: number | null; minimum_awarded_vendors?: number | null } | null;
  lineItems?: Array<{ id: string; sku: string; description?: string | null; annual_quantity?: number | null; unit?: string | null }>;
  requirements?: Array<{ id: string; name: string }>;
  questionnaire?: Array<{ id: string; question: string; required?: boolean | null }>;
};

type ChatMessage = { role: "buyer" | "copilot" | "notice"; text: string };
type FeedEvent = { time: string; label: string; detail: string; tone: "blue" | "green" | "amber" };
type DraftSummary = { id: string; name: string; category: string; status: string };

const steps = ["Brief", "Review", "Invite", "Compare", "Award"];
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function BuildPage() {
  const [rfxId, setRfxId] = useState<string | null>(null);
  const [state, setState] = useState<RfxState | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [message, setMessage] = useState("");
  const [hasExplicitDraftSelection, setHasExplicitDraftSelection] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "copilot", text: "What are you sourcing? Share the rough brief and I will turn it into an RFx draft." },
  ]);
  const [feed, setFeed] = useState<FeedEvent[]>([
    { time: now(), label: "Workspace ready", detail: "Copilot is connected and waiting for your sourcing brief.", tone: "green" },
  ]);

  useEffect(() => {
    const load = async () => {
      try {
        const selectedId = window.localStorage.getItem("aerchain:selected-rfx-id");
        const response = await fetch(selectedId ? `/api/rfx-builder?rfxId=${selectedId}` : "/api/rfx-builder");
        const data = await response.json();
        if (data?.success && data?.drafts) setDrafts(data.drafts);
        if (data?.success && data?.data?.rfx) {
          setRfxId(data.data.rfx.id);
          setHasExplicitDraftSelection(Boolean(selectedId));
          window.localStorage.setItem("aerchain:selected-rfx-id", data.data.rfx.id);
          setState(data.data);
          setFeed((current) => [{ time: now(), label: "Draft loaded", detail: "The latest RFx state is ready for review.", tone: "blue" }, ...current]);
        } else setError("No RFx draft found. Load the sample RFx to begin.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load RFx state");
      }
    };
    void load();
  }, []);

  const selectDraft = async (selectedId: string) => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/rfx-builder?rfxId=${selectedId}`);
      const data = await response.json();
      if (!data.success || !data.data?.rfx) throw new Error(data.error || "Could not load RFx");
      setRfxId(selectedId);
      setHasExplicitDraftSelection(true);
      window.localStorage.setItem("aerchain:selected-rfx-id", selectedId);
      setState(data.data);
      setMessages([{ role: "copilot", text: "This draft is selected. Add or clarify details and I will update only this RFx." }]);
      setFeed((current) => [{ time: now(), label: "Draft selected", detail: `Working on ${data.data.rfx.name || "Untitled RFx"}.`, tone: "blue" }, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load RFx");
    } finally {
      setLoading(false);
    }
  };

  const createNewRfx = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rfx-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_rfx" }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Could not create RFx");
      setRfxId(data.draft.id);
      setHasExplicitDraftSelection(true);
      window.localStorage.setItem("aerchain:selected-rfx-id", data.draft.id);
      setState(data.data);
      setDrafts((current) => [data.draft, ...current]);
      setMessages([{ role: "copilot", text: "New RFx draft created. Tell me what you want to source." }]);
      setFeed((current) => [{ time: now(), label: "New draft created", detail: "This conversation is isolated to the new RFx.", tone: "green" }, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create RFx");
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (action: string, payload: Record<string, unknown> = {}) => {
    setLoading(true);
    setError(null);
    recordActivity("Build RFx", "API request", `RFx action: ${action}`, "running");
    try {
      const response = await fetch("/api/rfx-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, rfxId, ...payload }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "RFx action failed");
      recordActivity("Build RFx", "API completed", `RFx action: ${action}`, "success");
      if (data?.data?.rfx?.id) setRfxId(data.data.rfx.id);
      setState((current) => ({ ...(current ?? {}), ...(data.data ?? {}) }));
      return data.data;
    } catch (err) {
      recordActivity("Build RFx", "API failed", err instanceof Error ? err.message : "RFx action failed", "error");
      setError(err instanceof Error ? err.message : "Request failed");
      setFeed((current) => [{ time: now(), label: "Action needs attention", detail: err instanceof Error ? err.message : "Request failed", tone: "amber" }, ...current]);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const submitMessage = async () => {
    const text = message.trim();
    if (!text) return;
    setMessages((current) => [...current, { role: "buyer", text }]);
    setFeed((current) => [{ time: now(), label: "Brief received", detail: "Sending your request to the RFx copilot.", tone: "blue" }, ...current]);
    setMessage("");
    const response = await runAction("build_from_message", { message: text, newRfx: !hasExplicitDraftSelection });
    setHasExplicitDraftSelection(true);
    if (response?.rfx?.id) {
      window.localStorage.setItem("aerchain:selected-rfx-id", response.rfx.id);
      setDrafts((current) => {
        const nextDraft = { id: response.rfx.id, name: response.rfx.name || "Untitled RFx", category: response.rfx.category || "", status: response.rfx.status || "DRAFT" };
        return current.some((draft) => draft.id === nextDraft.id)
          ? current.map((draft) => draft.id === nextDraft.id ? { ...draft, ...nextDraft } : draft)
          : [nextDraft, ...current];
      });
    }
    if (response?.message) setMessages((current) => [...current, { role: "copilot", text: response.message }]);
    if (response?.clarification) setMessages((current) => [...current, { role: "notice", text: `Clarification needed: ${response.clarification}` }]);
    if (response) setFeed((current) => [{ time: now(), label: "RFx draft updated", detail: "The preview reflects the latest copilot response.", tone: "green" }, ...current]);
  };

  const loadSample = async () => {
    const response = await runAction("draft_rfx_from_seed");
    if (response) setFeed((current) => [{ time: now(), label: "Sample scope loaded", detail: "30 seeded packaging line items are available to review.", tone: "blue" }, ...current]);
  };

  const approve = async () => {
    const response = await runAction("approve_rfx");
    if (response) setFeed((current) => [{ time: now(), label: "RFx approved", detail: "Supplier invitation is ready to simulate.", tone: "green" }, ...current]);
  };

  const rfx = state?.rfx;
  const items = [...(state?.lineItems ?? [])].sort((left, right) => {
    const leftIsRequest = left.sku.startsWith("REQ-") ? 0 : 1;
    const rightIsRequest = right.sku.startsWith("REQ-") ? 0 : 1;
    return leftIsRequest - rightIsRequest;
  });
  const isApproved = rfx?.status === "SENT";
  const activeStep = isApproved ? 2 : rfx?.name ? 1 : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">RFx workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Create and launch a sourcing event</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Start with a conversation, review the structured request, then move suppliers into response and award analysis.</p></div>
        <div className="flex flex-wrap items-center justify-end gap-2"><select value={rfxId ?? ""} onChange={(event) => void selectDraft(event.target.value)} disabled={loading || drafts.length === 0} aria-label="Select RFx draft" className="max-w-55 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"><option value="">Select draft</option>{drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.name || "Untitled RFx"}</option>)}</select><button onClick={() => void createNewRfx()} disabled={loading} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">New RFx</button><button onClick={() => void loadSample()} disabled={loading || !rfxId} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-700 disabled:opacity-50">Use sample scope</button></div>
      </header>

      <nav aria-label="RFx progress" className="flex flex-wrap items-center gap-2 sm:gap-0">{steps.map((step, index) => <div key={step} className="flex items-center"><div className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${index <= activeStep ? "bg-sky-50 text-sky-800" : "text-slate-400"}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${index <= activeStep ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span>{step}</div>{index < steps.length - 1 && <span className={`mx-1 hidden h-px w-8 sm:block ${index < activeStep ? "bg-sky-300" : "bg-slate-200"}`} />}</div>)}</nav>

      <main className="grid gap-6 xl:h-[calc(100vh-16rem)] xl:min-h-135 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Copilot</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Build the brief</h2></div><span className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Live</span></div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-5">{messages.map((item, index) => <div key={`${item.role}-${index}`} className={`flex ${item.role === "buyer" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${item.role === "buyer" ? "rounded-br-sm bg-sky-600 text-white" : item.role === "notice" ? "border border-amber-200 bg-amber-50 text-amber-900" : "rounded-bl-sm border border-slate-200 bg-white text-slate-700 shadow-sm"}`}>{item.role !== "buyer" && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{item.role === "notice" ? "Review point" : "RFx copilot"}</p>}{item.text}</div></div>)}{loading && <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" /> Working on the RFx draft...</div>}</div>
          <div className="border-t border-slate-200 p-4"><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitMessage(); } }} disabled={loading || !rfxId} rows={3} placeholder="Example: Source corrugated cartons for India fulfillment centers, with annual volumes and a 21-day lead time." className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none ring-sky-500 placeholder:text-slate-400 focus:ring-2" /><div className="mt-2 flex items-center justify-between"><span className="text-xs text-slate-400">Enter to send · Shift + Enter for a new line</span><button onClick={() => void submitMessage()} disabled={loading || !rfxId || !message.trim()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-slate-300">Send brief</button></div></div>
        </section>

        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Live preview</p><h2 className="mt-1 text-lg font-semibold text-slate-950">RFx review</h2></div><div className="flex gap-2"><button onClick={() => void runAction("validate_rfx")} disabled={loading || !rfxId} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-700 disabled:opacity-50">Validate</button><button onClick={() => void approve()} disabled={loading || !rfxId || isApproved} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{isApproved ? "Approved" : "Approve & send"}</button></div></div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"><div className="border-b border-slate-100 pb-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">{rfx?.category || "Category pending"}</p><h3 className="mt-2 text-2xl font-semibold text-slate-950">{rfx?.name || "Untitled sourcing event"}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{rfx?.description || "Send a brief to create the RFx summary here."}</p><div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600"><span className="rounded-full bg-slate-100 px-3 py-1.5">{rfx?.currency || "INR"}</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{rfx?.max_lead_time_days ? `${rfx.max_lead_time_days} day lead time` : "Lead time open"}</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{rfx?.minimum_awarded_vendors || "No"} minimum suppliers</span></div></div>
            <div><div className="flex items-center justify-between"><h3 className="font-semibold text-slate-950">Scope</h3><span className="text-xs text-slate-500">{items.length} line items</span></div><div className="mt-3 overflow-hidden rounded-xl border border-slate-200">{items.length === 0 ? <p className="p-4 text-sm text-slate-500">No line items yet. Load the sample scope or describe a need.</p> : items.slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-0"><div className="min-w-0"><p className="font-mono text-xs font-bold text-sky-700">{item.sku}</p><p className="truncate text-sm text-slate-700">{item.description || "Description pending"}</p></div><span className="shrink-0 text-xs text-slate-500">{item.annual_quantity?.toLocaleString("en-IN") || "-"} {item.unit || "pcs"}</span></div>)}{items.length > 6 && <p className="border-t border-slate-100 px-4 py-3 text-xs font-semibold text-sky-700">+ {items.length - 6} more items</p>}</div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between"><h3 className="font-semibold text-slate-950">Requirements</h3><span className="text-xs text-slate-500">{state?.requirements?.length ?? 0}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">Rules applied during supplier qualification.</p></div><div className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between"><h3 className="font-semibold text-slate-950">Fixed questionnaire</h3><span className="text-xs text-slate-500">{state?.questionnaire?.length ?? 0}</span></div><div className="mt-3 space-y-2">{(state?.questionnaire ?? []).map((question, index) => <div key={question.id} className="border-t border-slate-100 pt-2 text-xs leading-5 text-slate-600"><span className="mr-1 font-semibold text-slate-400">{index + 1}.</span>{question.question}</div>)}</div></div></div></div>
        </section>
      </main>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Activity</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Live processing feed</h2></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{feed.length} events</span></div><div className="mt-4 space-y-3">{feed.slice(0, 5).map((event, index) => <div key={`${event.time}-${index}`} className="flex gap-3"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${event.tone === "green" ? "bg-emerald-500" : event.tone === "amber" ? "bg-amber-500" : "bg-sky-500"}`} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="text-sm font-semibold text-slate-800">{event.label}</p><time className="text-xs text-slate-400">{event.time}</time></div><p className="mt-1 text-xs leading-5 text-slate-500">{event.detail}</p></div></div>)}</div>{error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}</div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Continue the workflow</p><div className="mt-4 space-y-3"><Link href="/responses" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 hover:border-sky-300"><span><span className="block text-sm font-semibold text-slate-900">Collect responses</span><span className="mt-1 block text-xs text-slate-500">Upload supplier documents for extraction.</span></span><span className="text-sky-700">-&gt;</span></Link><Link href="/compare" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 hover:border-sky-300"><span><span className="block text-sm font-semibold text-slate-900">Compare quotes</span><span className="mt-1 block text-xs text-slate-500">Inspect normalized prices and evidence.</span></span><span className="text-sky-700">-&gt;</span></Link><Link href="/ask" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 hover:border-sky-300"><span><span className="block text-sm font-semibold text-slate-900">Ask the analyst</span><span className="mt-1 block text-xs text-slate-500">Run award scenarios and recommendations.</span></span><span className="text-sky-700">-&gt;</span></Link></div></div>
      </section>
    </div>
  );
}
