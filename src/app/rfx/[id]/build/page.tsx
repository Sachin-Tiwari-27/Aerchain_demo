"use client";

import { useEffect, useState } from "react";

export default function BuildPage() {
  const [rfxId, setRfxId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/rfx-builder");
        const data = await res.json();
        if (data?.success && data?.data?.rfx) {
          setRfxId(data.data.rfx.id);
          setState(data.data);
        } else if (data?.data?.rfx === null && !data?.error) {
          setError("No RFx draft exists yet. Use Draft from seed to create one.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load RFx state");
      }
    };

    load();
  }, []);

  const runAction = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!rfxId) {
      setError("No RFx loaded");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = { action, ...payload };
      if (rfxId) {
        body.rfxId = rfxId;
      }

      const res = await fetch("/api/rfx-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || "RFx action failed");
        return null;
      }

      if (data?.data?.rfx?.id) {
        setRfxId(data.data.rfx.id);
      }

      setState((prev: any) => ({
        ...(prev ?? {}),
        ...(data.data ?? {}),
      }));
      return data.data ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const submitMessage = async () => {
    if (!message.trim()) return;
    const nextMessage = message.trim();
    setConversation((current) => [...current, `You: ${nextMessage}`]);
    setMessage("");
    const response = await runAction("build_from_message", { message: nextMessage });
    if (response?.message) setConversation((current) => [...current, `Assistant: ${response.message}`]);
    if (response?.clarification) setConversation((current) => [...current, `Clarification: ${response.clarification}`]);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">RFx</p>
        <h2 className="mt-3 text-2xl font-semibold">Build workspace</h2>
        <p className="mt-2 max-w-2xl text-slate-600">
          Minimal builder flow: load state, draft from template, validate, and confirm the RFx.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Build with the assistant</h3>
        <p className="mt-1 text-sm text-slate-600">Describe what you want to source, then review the seeded line-item draft.</p>
        <div className="mt-4 space-y-2">
          {conversation.map((entry, index) => <p key={`${entry}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{entry}</p>)}
        </div>
        <div className="mt-4 flex gap-2">
          <input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitMessage(); }} placeholder="e.g. Source corrugated boxes for our India plants" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" disabled={loading || !rfxId} />
          <button onClick={() => void submitMessage()} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:bg-slate-300" disabled={loading || !rfxId || !message.trim()}>Send</button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => runAction("draft_rfx_from_seed")}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            disabled={loading || !rfxId}
          >
            Draft from seed
          </button>
          <button
            onClick={() => runAction("validate_rfx")}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={loading || !rfxId}
          >
            Validate RFx
          </button>
          <button onClick={() => runAction("approve_rfx")} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-slate-300" disabled={loading || !rfxId}>Approve &amp; Send</button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}
      </section>

      {state && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Current RFx</h3>
          <dl className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs uppercase tracking-[0.15em] text-slate-500">Name</dt>
              <dd className="mt-1 font-medium text-slate-900">{state.rfx?.name || "—"}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs uppercase tracking-[0.15em] text-slate-500">Category</dt>
              <dd className="mt-1 font-medium text-slate-900">{state.rfx?.category || "—"}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs uppercase tracking-[0.15em] text-slate-500">Status</dt>
              <dd className="mt-1 font-medium text-slate-900">{state.rfx?.status || "—"}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs uppercase tracking-[0.15em] text-slate-500">Line Items</dt>
              <dd className="mt-1 font-medium text-slate-900">{state.lineItems?.length ?? 0}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
