"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Draft = { id: string; name: string; category: string; status: string; updated_at: string };

export default function Home() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDrafts = async () => {
      try {
        const response = await fetch("/api/rfx-builder");
        const data = await response.json();
        if (!data.success) throw new Error(data.error || "Could not load RFx drafts");
        setDrafts(data.drafts ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load RFx drafts");
      } finally {
        setLoading(false);
      }
    };
    void loadDrafts();
  }, []);

  const openDraft = (id: string) => {
    window.localStorage.setItem("aerchain:selected-rfx-id", id);
    router.push(`/rfx/${id}/build`);
  };

  const createDraft = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/rfx-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_rfx" }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Could not create RFx");
      window.localStorage.setItem("aerchain:selected-rfx-id", data.draft.id);
      router.push(`/rfx/${data.draft.id}/build`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create RFx");
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Procurement workspace</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Choose an RFx to continue</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Start a new sourcing conversation with a live preview, or reopen an event to collect responses, compare suppliers, and make an award recommendation.</p>
          </div>
          <button onClick={() => void createDraft()} disabled={creating} className="shrink-0 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{creating ? "Creating..." : "New RFx"}</button>
        </div>
      </section>

      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Your workspace</p><h3 className="mt-1 text-xl font-semibold text-slate-950">RFx drafts</h3></div><span className="text-sm text-slate-500">{drafts.length} events</span></div>
        {loading ? <p className="mt-6 text-sm text-slate-500">Loading RFx drafts...</p> : drafts.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No RFx drafts yet. Create one to start a Copilot conversation.</p> : <div className="mt-5 grid gap-3 md:grid-cols-2">{drafts.map((draft) => <button key={draft.id} onClick={() => openDraft(draft.id)} className="text-left rounded-xl border border-slate-200 p-5 transition hover:border-sky-400 hover:bg-sky-50"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{draft.name || "Untitled RFx"}</p><p className="mt-1 text-sm text-slate-500">{draft.category || "Category pending"}</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{draft.status}</span></div><p className="mt-5 text-sm font-semibold text-sky-700">Open RFx -&gt;</p></button>)}</div>}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">New draft</p><p className="mt-2 text-sm leading-6 text-slate-700">Talk through the requirement and watch the RFx take shape beside the conversation.</p></div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Existing RFx</p><p className="mt-2 text-sm leading-6 text-slate-700">Upload vendor response documents against the event you opened.</p></div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Decision</p><p className="mt-2 text-sm leading-6 text-slate-700">Compare evidence, ask questions, and award suppliers from the same RFx.</p></div>
      </div>
    </div>
  );
}
