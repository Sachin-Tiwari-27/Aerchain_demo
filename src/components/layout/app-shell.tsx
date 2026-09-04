"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { activityLogEventName, clearActivityLog, readActivityLog, type ActivityEntry } from "@/lib/activity-log";

const navItems = [
  { href: "/", label: "1. Choose RFx" },
  { href: "/responses", label: "2. Collect responses" },
  { href: "/compare", label: "3. Compare" },
  { href: "/ask", label: "4. Decide" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [selectedRfxId, setSelectedRfxId] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    setSelectedRfxId(window.localStorage.getItem("aerchain:selected-rfx-id"));
  }, [pathname]);

  useEffect(() => {
    const refreshLog = () => setActivityLog(readActivityLog());
    refreshLog();
    window.addEventListener(activityLogEventName, refreshLog);
    window.addEventListener("storage", refreshLog);
    return () => {
      window.removeEventListener(activityLogEventName, refreshLog);
      window.removeEventListener("storage", refreshLog);
    };
  }, []);

  const getHref = (href: string) => href === "/" || !selectedRfxId ? href : `${href}?rfxId=${selectedRfxId}`;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
              Aerchain demo
            </p>
            <h1 className="text-lg font-semibold">India corrugated packaging procurement</h1>
          </div>
          <div className="flex items-center gap-3"><nav aria-label="RFx lifecycle" className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href === "/" ? item.href : item.href.includes("/build") ? (selectedRfxId ? `/rfx/${selectedRfxId}/build` : "/") : getHref(item.href)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${pathname === item.href || (item.href.includes("/build") && pathname.includes("/build")) ? "bg-white text-sky-700 shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav><button type="button" onClick={() => setLogOpen(true)} className="relative whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-700">System log{activityLog.length > 0 && <span className="ml-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">{activityLog.length}</span>}</button></div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      {logOpen && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" role="presentation" onClick={() => setLogOpen(false)}><aside className="h-full w-full max-w-lg overflow-y-auto bg-slate-950 p-5 text-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="system-log-title" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Observability</p><h2 id="system-log-title" className="mt-2 text-xl font-semibold">System activity log</h2><p className="mt-1 text-sm text-slate-400">AI requests, tool calls, uploads, extraction, and workflow events.</p></div><button type="button" onClick={() => setLogOpen(false)} className="text-sm text-slate-400 hover:text-white">Close</button></div><div className="mt-5 flex justify-end"><button type="button" onClick={clearActivityLog} className="text-xs font-semibold text-slate-400 hover:text-white">Clear log</button></div><div className="mt-3 space-y-2">{activityLog.length === 0 ? <p className="rounded-lg border border-slate-800 p-4 text-sm text-slate-400">No activity recorded yet.</p> : activityLog.map((entry) => <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">{entry.area}</span><span className={`text-[10px] font-bold uppercase ${entry.status === "error" ? "text-rose-300" : entry.status === "success" ? "text-emerald-300" : "text-amber-300"}`}>{entry.status}</span></div><p className="mt-1 text-sm font-semibold text-slate-100">{entry.event}</p><p className="mt-1 wrap-break-word text-xs leading-5 text-slate-400">{entry.detail}</p><time className="mt-2 block text-[10px] text-slate-600">{entry.time}</time></div>)}</div></aside></div>}
    </div>
  );
}
