"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Draft = { id: string; name: string; status: string };

const selectedKey = "aerchain:selected-rfx-id";

export function RfxContextBar({ stage }: { stage: string }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    const loadDrafts = async () => {
      const response = await fetch("/api/rfx-builder");
      const data = await response.json();
      if (!data.success) return;
      const storedId = window.localStorage.getItem(selectedKey) || data.drafts?.[0]?.id || "";
      setDrafts(data.drafts ?? []);
      setSelectedId(storedId);
      if (storedId) window.localStorage.setItem(selectedKey, storedId);
    };
    void loadDrafts();
  }, []);

  const selectDraft = (id: string) => {
    setSelectedId(id);
    window.localStorage.setItem(selectedKey, id);
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Active RFx · {stage}</p><p className="text-sm font-semibold text-slate-900">{drafts.find((draft) => draft.id === selectedId)?.name || "Loading selected RFx..."}</p></div>
      </div>
      <div className="flex items-center gap-2"><label className="sr-only" htmlFor={`rfx-select-${stage}`}>Select RFx</label><select id={`rfx-select-${stage}`} value={selectedId} onChange={(event) => selectDraft(event.target.value)} disabled={drafts.length === 0} className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"><option value="">Select RFx</option>{drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.name || "Untitled RFx"} · {draft.status}</option>)}</select><Link href={selectedId ? `/rfx/${selectedId}/build` : "/"} className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-700">Review RFx</Link></div>
    </div>
  );
}
