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
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">RFx drafts</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Start a new sourcing conversation, or reopen an event to collect responses and compare suppliers.</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-500">{drafts.length} event{drafts.length !== 1 ? 's' : ''}</span>
            <button onClick={() => void createDraft()} disabled={creating} className="shrink-0 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{creating ? "Creating..." : "New RFx"}</button>
          </div>
        </div>

        {error && <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}

        <div className="mt-8 border-t border-slate-100 pt-8">
          {loading ? <p className="text-sm text-slate-500">Loading RFx drafts...</p> : drafts.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No RFx drafts yet. Create one to start a Copilot conversation.</p> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{drafts.map((draft) => <button key={draft.id} onClick={() => openDraft(draft.id)} className="text-left rounded-xl border border-slate-200 p-5 transition hover:border-sky-400 hover:bg-sky-50"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{draft.name || "Untitled RFx"}</p><p className="mt-1 text-sm text-slate-500">{draft.category || "Category pending"}</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{draft.status}</span></div><p className="mt-5 text-sm font-semibold text-sky-700">Open RFx -&gt;</p></button>)}</div>}
        </div>
      </section>
    </div>
  );
}
