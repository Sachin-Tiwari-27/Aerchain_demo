"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ApproveTimelineVendor {
  id: string;
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
}

export interface ApproveTimelineProps {
  vendors: ApproveTimelineVendor[];
  onComplete: () => void;
}

type Phase = "composing" | "sending" | "done";
type VendorStatus = "pending" | "sending" | "sent" | "failed";

const COMPOSE_MS = 800;
const PER_VENDOR_MS = 800;
const DONE_PAUSE_MS = 600;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

const statusStyles: Record<VendorStatus, { pill: string; dot: string; label: string }> = {
  pending: { pill: "bg-slate-100 text-slate-500", dot: "bg-slate-300", label: "Pending" },
  sending: { pill: "bg-sky-100 text-sky-700", dot: "bg-sky-500 animate-pulse", label: "Sending" },
  sent: { pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", label: "Sent" },
  failed: { pill: "bg-rose-100 text-rose-700", dot: "bg-rose-500", label: "Failed" },
};

export function ApproveTimeline({ vendors, onComplete }: ApproveTimelineProps) {
  const [phase, setPhase] = useState<Phase>("composing");
  const [statuses, setStatuses] = useState<Record<string, VendorStatus>>(() =>
    Object.fromEntries(vendors.map((v) => [v.id, "pending" as VendorStatus])),
  );
  const completedRef = useRef(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(
      setTimeout(() => {
        setPhase("sending");
        vendors.forEach((vendor, index) => {
          const sendAt = index * PER_VENDOR_MS;
          timers.push(
            setTimeout(() => {
              setStatuses((current) => ({ ...current, [vendor.id]: "sending" }));
            }, sendAt),
          );
          timers.push(
            setTimeout(() => {
              setStatuses((current) => ({ ...current, [vendor.id]: "sent" }));
              if (index === vendors.length - 1) {
                timers.push(
                  setTimeout(() => {
                    setPhase("done");
                    if (!completedRef.current) {
                      completedRef.current = true;
                      onComplete();
                    }
                  }, DONE_PAUSE_MS),
                );
              }
            }, sendAt + PER_VENDOR_MS / 2),
          );
        });
      }, COMPOSE_MS),
    );

    return () => timers.forEach(clearTimeout);
  }, [vendors, onComplete]);

  const sentCount = Object.values(statuses).filter((s) => s === "sent").length;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-sky-50 via-white to-emerald-50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">RFx approved</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Invitations in flight</h2>
          <p className="mt-1 text-sm text-slate-600">
            {phase === "composing" && "Composing personalised invitations for each supplier…"}
            {phase === "sending" && `${sentCount} of ${vendors.length} invitations sent`}
            {phase === "done" && `All ${vendors.length} invitations are on their way. Vendors have 7 days to respond.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0">
            <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke="rgb(226 232 240)"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke={phase === "done" ? "rgb(16 185 129)" : "rgb(14 165 233)"}
                strokeWidth="3"
                strokeDasharray={`${vendors.length > 0 ? (sentCount / vendors.length) * 100 : 0} 100`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 400ms ease" }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">
              {vendors.length > 0 ? `${Math.round((sentCount / vendors.length) * 100)}%` : ""}
            </span>
          </div>
        </div>
      </header>

      <ol className="divide-y divide-slate-100">
        {vendors.map((vendor) => {
          const status = statuses[vendor.id] ?? "pending";
          const styles = statusStyles[status];
          return (
            <li key={vendor.id} className="flex items-center gap-4 px-6 py-4">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  status === "sent"
                    ? "bg-emerald-100 text-emerald-700"
                    : status === "sending"
                    ? "bg-sky-100 text-sky-700"
                    : "bg-slate-100 text-slate-500",
                )}
              >
                {initials(vendor.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{vendor.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {vendor.contact_name ? `${vendor.contact_name} · ` : ""}
                  {vendor.contact_email ?? "—"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", styles.dot)} aria-hidden="true" />
                <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]", styles.pill)}>
                  {styles.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Suppliers will receive a personalised email with the RFx scope, questionnaire, and your response deadline.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={phase !== "done"}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-700 disabled:opacity-50"
          >
            View outbox
          </button>
          <button
            type="button"
            disabled={phase !== "done"}
            onClick={onComplete}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {phase === "done" ? "Continue to responses →" : "Sending…"}
          </button>
        </div>
      </footer>
    </section>
  );
}