"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { recordActivity } from "@/lib/activity-log";
import { ApproveTimeline, type ApproveTimelineVendor } from "@/components/rfx/approve-timeline";

type LineItem = {
  id: string;
  sku: string;
  description?: string | null;
  annual_quantity?: number | null;
  unit?: string | null;
  status?: "AI_SUGGESTED" | "BUYER_CONFIRMED" | null;
};

type RfxState = {
  rfx?: { id: string; name?: string | null; category?: string | null; description?: string | null; status?: string | null; currency?: string | null; max_lead_time_days?: number | null; minimum_awarded_vendors?: number | null } | null;
  lineItems?: LineItem[];
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
  const [draftName, setDraftName] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [hasExplicitDraftSelection, setHasExplicitDraftSelection] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "copilot", text: "What are you sourcing? Describe it in your own words and I'll match it against our packaging catalog." },
  ]);
  const [feed, setFeed] = useState<FeedEvent[]>([
    { time: now(), label: "Workspace ready", detail: "Copilot is connected and waiting for your sourcing brief.", tone: "green" },
  ]);
  const [approving, setApproving] = useState(false);
  const [vendorsForInvite, setVendorsForInvite] = useState<ApproveTimelineVendor[]>([]);
  const router = useRouter();

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
          setDraftName(data.data.rfx.name || "");
          setFeed((current) => [{ time: now(), label: "Draft loaded", detail: "The latest RFx state is ready for review.", tone: "blue" }, ...current]);
        } else setError("No RFx draft found. Create a new RFx to begin.");
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
      setDraftName(data.data.rfx.name || "");
      setMessages([{ role: "copilot", text: "This draft is selected. Add or clarify items and I will update only this RFx." }]);
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
      setDraftName(data.draft.name || "");
      setDrafts((current) => [data.draft, ...current]);
      setMessages([{ role: "copilot", text: "New RFx started, empty for now. Tell me what you want to source and I'll match it to our catalog." }]);
      setFeed((current) => [{ time: now(), label: "New draft created", detail: "This conversation is isolated to the new RFx.", tone: "green" }, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create RFx");
    } finally {
      setLoading(false);
    }
  };

  const saveDraftName = async () => {
    if (!rfxId) return;
    const name = draftName.trim();
    if (!name || name === state?.rfx?.name) return;
    const response = await runAction("update_rfx", { updates: { name } });
    if (response?.name) {
      setDraftName(response.name);
      setState((current) => current ? { ...current, rfx: current.rfx ? { ...current.rfx, name: response.name } : current.rfx } : current);
      setDrafts((current) => current.map((draft) => draft.id === rfxId ? { ...draft, name: response.name } : draft));
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
    setFeed((current) => [{ time: now(), label: "Brief received", detail: "Matching your request against the fixed catalog.", tone: "blue" }, ...current]);
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
    if (response?.newlySuggestedSkus?.length > 0) {
      setMessages((current) => [...current, { role: "notice", text: `Matched: ${response.newlySuggestedSkus.join(", ")}. Confirm or remove each in the review panel before sending.` }]);
    }
    if (response?.clarification) {
      setMessages((current) => [...current, { role: "notice", text: `Before I can match that: ${response.clarification}` }]);
    }
    if (response?.droppedHallucinations?.length > 0) {
      setFeed((current) => [{ time: now(), label: "Non-catalog SKU discarded", detail: `Model referenced ${response.droppedHallucinations.join(", ")}, not in our catalog. Discarded automatically.`, tone: "amber" }, ...current]);
    }
    if (response) setFeed((current) => [{ time: now(), label: "RFx draft updated", detail: "The preview reflects the latest copilot response.", tone: "green" }, ...current]);
  };

  const loadDemoCatalog = async () => {
    const response = await runAction("load_full_catalog_demo");
    if (response) {
      setMessages((current) => [...current, { role: "notice", text: "Loaded the full 30-item demo catalog directly (bypassing the conversation) for demo purposes." }]);
      setFeed((current) => [{ time: now(), label: "Demo catalog loaded", detail: "All 30 seeded packaging line items are available to review.", tone: "blue" }, ...current]);
    }
  };

  const refreshState = async (targetRfxId: string) => {
    const response = await fetch(`/api/rfx-builder?rfxId=${targetRfxId}`);
    const data = await response.json();
    if (data?.success && data?.data?.rfx) setState(data.data);
  };

  const confirmItem = async (lineItemId: string) => {
    if (!rfxId) return;
    setLoading(true);
    recordActivity("Build RFx", "API request", "confirm_line_item", "running");
    try {
      const response = await fetch("/api/rfx-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm_line_item", lineItemId }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Confirm failed");
      recordActivity("Build RFx", "API completed", "confirm_line_item", "success");
      await refreshState(rfxId);
      setFeed((current) => [{ time: now(), label: "Item confirmed", detail: "Catalog item added to RFx scope.", tone: "green" }, ...current]);
    } catch (err) {
      recordActivity("Build RFx", "API failed", err instanceof Error ? err.message : "Confirm failed", "error");
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (lineItemId: string) => {
    if (!rfxId) return;
    setLoading(true);
    recordActivity("Build RFx", "API request", "delete_rfx_line_item", "running");
    try {
      const response = await fetch("/api/rfx-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_rfx_line_item", lineItemId }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Remove failed");
      recordActivity("Build RFx", "API completed", "delete_rfx_line_item", "success");
      await refreshState(rfxId);
      setFeed((current) => [{ time: now(), label: "Item removed", detail: "Catalog item dropped from the RFx.", tone: "amber" }, ...current]);
    } catch (err) {
      recordActivity("Build RFx", "API failed", err instanceof Error ? err.message : "Remove failed", "error");
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleItemSelection = (lineItemId: string) => {
    setSelectedItemIds((current) => current.includes(lineItemId)
      ? current.filter((id) => id !== lineItemId)
      : [...current, lineItemId]);
  };

  const toggleAllPendingItems = () => {
    setSelectedItemIds((current) => current.length === pendingItems.length ? [] : pendingItems.map((item) => item.id));
  };

  const confirmSelectedItems = async () => {
    const ids = selectedItemIds.filter((id) => pendingItems.some((item) => item.id === id));
    for (const id of ids) await confirmItem(id);
    setSelectedItemIds([]);
  };

  const removeSelectedItems = async () => {
    const ids = selectedItemIds.filter((id) => pendingItems.some((item) => item.id === id));
    for (const id of ids) await removeItem(id);
    setSelectedItemIds([]);
  };

  const approve = async () => {
    if (!rfxId) return;

    // Fetch vendors for the invite timeline. Falls back to the seed set if
    // the table is empty so the timeline always has something to show.
    let vendors: ApproveTimelineVendor[] = [];
    try {
      const res = await fetch(`/api/vendors?rfxId=${rfxId}`);
      if (res.ok) {
        const payload = await res.json();
        if (Array.isArray(payload?.vendors)) {
          vendors = payload.vendors;
        }
      }
    } catch (err) {
      console.warn("Failed to load vendors for invite timeline", err);
    }

    if (vendors.length === 0) {
      vendors = [
        { id: "karnavati", name: "Karnavati Packaging", contact_name: "Aisha Mehta", contact_email: "aisha@karnavatipackaging.in" },
        { id: "apex", name: "Apex Corrugates", contact_name: "Rohit Nair", contact_email: "rohit@apexcorrugates.in" },
        { id: "maharashtra", name: "Maharashtra BoxWorks", contact_name: "Neha Shah", contact_email: "neha@maharashtraboxworks.in" },
        { id: "bharat", name: "Bharat Carton Group", contact_name: "Vikram Iyer", contact_email: "vikram@bharatcarton.in" },
        { id: "punjab", name: "Punjab Fibre Solutions", contact_name: "Simran Kaur", contact_email: "simran@punjabfibre.in" },
      ];
    }

    setVendorsForInvite(vendors);
    setApproving(true);
    setFeed((current) => [{ time: now(), label: "RFx approved", detail: `Sending invitations to ${vendors.length} suppliers.`, tone: "green" }, ...current]);
    recordActivity("Build RFx", "RFx approved", `Sending invitations to ${vendors.length} suppliers`, "success");

    // Fire the API in the background so the UI doesn't block on it.
    void runAction("approve_rfx");
  };

  const completeApprove = () => {
    if (rfxId) window.sessionStorage.setItem("aerchain:just-approved", rfxId);
    router.push("/responses");
  };

  const rfx = state?.rfx;
  const lineItems = state?.lineItems ?? [];
  const confirmedItems = lineItems.filter((item) => item.status === "BUYER_CONFIRMED");
  const pendingItems = lineItems.filter((item) => item.status !== "BUYER_CONFIRMED");
  const isApproved = rfx?.status === "SENT";
  const activeStep = isApproved ? 2 : confirmedItems.length > 0 ? 1 : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0"><label htmlFor="rfx-name" className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">RFx name</label><input id="rfx-name" value={draftName} onChange={(event) => setDraftName(event.target.value)} onBlur={() => void saveDraftName()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} placeholder="Name this sourcing event" className="mt-1 block w-full max-w-md border-0 border-b border-slate-300 bg-transparent px-0 py-1 text-2xl font-semibold tracking-tight text-slate-950 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-0" /></div>
        <div className="flex flex-wrap items-center justify-end gap-2"><select value={rfxId ?? ""} onChange={(event) => void selectDraft(event.target.value)} disabled={loading || drafts.length === 0} aria-label="Select RFx draft" className="max-w-55 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"><option value="">Select draft</option>{drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.name || "Untitled RFx"}</option>)}</select><button onClick={() => void createNewRfx()} disabled={loading} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">New RFx</button><button onClick={() => void loadDemoCatalog()} disabled={loading || !rfxId} title="Bypasses the conversation. For demo purposes only." className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-500 hover:border-amber-400 hover:text-amber-700 disabled:opacity-50">Load full demo catalog</button></div>
      </header>


      <main className={approving ? "block" : "grid gap-6 xl:h-[calc(100vh-16rem)] xl:min-h-135 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"}>
        {approving ? (
          <ApproveTimeline vendors={vendorsForInvite} onComplete={completeApprove} />
        ) : null}
        {!approving && (<>
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Copilot</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Build the brief</h2></div><span className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Live</span></div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-5">{messages.map((item, index) => <div key={`${item.role}-${index}`} className={`flex ${item.role === "buyer" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${item.role === "buyer" ? "rounded-br-sm bg-sky-600 text-white" : item.role === "notice" ? "border border-amber-200 bg-amber-50 text-amber-900" : "rounded-bl-sm border border-slate-200 bg-white text-slate-700 shadow-sm"}`}>{item.role !== "buyer" && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{item.role === "notice" ? "Review point" : "RFx copilot"}</p>}{item.text}</div></div>)}{loading && <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" /> Matching against the catalog...</div>}</div>
          <div className="border-t border-slate-200 p-4"><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitMessage(); } }} disabled={loading} rows={3} placeholder="Example: We need 3-ply mailer boxes and 5-ply export boxes, around 120,000 a year, delivered within 14 days." className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none ring-sky-500 placeholder:text-slate-400 focus:ring-2" /><div className="mt-2 flex items-center justify-between"><span className="text-xs text-slate-400">Enter to send · Shift + Enter for a new line</span><button onClick={() => void submitMessage()} disabled={loading || !message.trim()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-slate-300">Send</button></div></div>
        </section>

        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Live preview</p><h2 className="mt-1 text-lg font-semibold text-slate-950">RFx review</h2></div><div className="flex gap-2"><button onClick={() => void runAction("validate_rfx")} disabled={loading || !rfxId} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-700 disabled:opacity-50">Validate</button><button onClick={() => void approve()} disabled={loading || !rfxId || isApproved} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{isApproved ? "Approved" : "Approve & send"}</button></div></div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <div className="border-b border-slate-100 pb-5"><h3 className="text-2xl font-semibold text-slate-950">{rfx?.category || "Category pending"}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{rfx?.description || "Send a message to start populating the RFx summary here."}</p><div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600"><span className="rounded-full bg-slate-100 px-3 py-1.5">{rfx?.currency || "INR"}</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{rfx?.max_lead_time_days ? `${rfx.max_lead_time_days} day lead time` : "Lead time open"}</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{rfx?.minimum_awarded_vendors || "No"} minimum suppliers</span></div></div>

            {pendingItems.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><input type="checkbox" checked={selectedItemIds.length === pendingItems.length} onChange={toggleAllPendingItems} aria-label="Select all pending items" className="h-4 w-4 accent-amber-600" /><h3 className="font-semibold text-amber-900">Needs your confirmation</h3><span className="text-xs font-semibold text-amber-700">{pendingItems.length} item(s)</span></div><div className="flex gap-2"><button onClick={() => void confirmSelectedItems()} disabled={loading || selectedItemIds.length === 0} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Confirm selected</button><button onClick={() => void removeSelectedItems()} disabled={loading || selectedItemIds.length === 0} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50">Remove selected</button></div></div>
                <p className="mt-1 text-xs text-amber-800">The copilot matched these from the catalog. Nothing here is part of the RFx until you confirm it.</p>
                <div className="mt-3 space-y-2">
                  {pendingItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2">
                      <input type="checkbox" checked={selectedItemIds.includes(item.id)} onChange={() => toggleItemSelection(item.id)} aria-label={`Select ${item.sku}`} className="h-4 w-4 shrink-0 accent-amber-600" />
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-sky-700">{item.sku}</p>
                        <p className="truncate text-sm text-slate-700">{item.description}</p>
                        <p className="text-xs text-slate-500">{item.annual_quantity?.toLocaleString("en-IN")} {item.unit}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button onClick={() => void confirmItem(item.id)} disabled={loading} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Confirm</button>
                        <button onClick={() => void removeItem(item.id)} disabled={loading} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div><div className="flex items-center justify-between"><h3 className="font-semibold text-slate-950">Confirmed scope</h3><span className="text-xs text-slate-500">{confirmedItems.length} line items</span></div><div className="mt-3 overflow-hidden rounded-xl border border-slate-200">{confirmedItems.length === 0 ? <p className="p-4 text-sm text-slate-500">No confirmed items yet. Describe your need above, then confirm the matches.</p> : confirmedItems.slice(0, 8).map((item) => <div key={item.id} className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-0"><div className="min-w-0"><p className="font-mono text-xs font-bold text-sky-700">{item.sku}</p><p className="truncate text-sm text-slate-700">{item.description || "Description pending"}</p></div><span className="shrink-0 text-xs text-slate-500">{item.annual_quantity?.toLocaleString("en-IN") || "-"} {item.unit || "pcs"}</span></div>)}{confirmedItems.length > 8 && <p className="border-t border-slate-100 px-4 py-3 text-xs font-semibold text-sky-700">+ {confirmedItems.length - 8} more items</p>}</div></div>

            <div><div className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between"><h3 className="font-semibold text-slate-950">Fixed questionnaire</h3><span className="text-xs text-slate-500">{state?.questionnaire?.length ?? 0}</span></div><div className="mt-3 space-y-2">{(state?.questionnaire ?? []).map((question, index) => <div key={question.id} className="border-t border-slate-100 pt-2 text-xs leading-5 text-slate-600"><span className="mr-1 font-semibold text-slate-400">{index + 1}.</span>{question.question}</div>)}</div></div></div>
          </div>
        </section>
        </>)}
      </main>


    </div>
  );
}