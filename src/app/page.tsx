import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Milestone 1</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">India RFx workspace shell</h2>
        <p className="mt-3 max-w-2xl text-slate-600">
          Structured procurement state, seeded catalog, and placeholder navigation for the
          Indian corrugated packaging sourcing flow.
        </p>
        <div className="mt-6 flex gap-3">
          <Button>Review RFx</Button>
          <Button variant="secondary">View responses</Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">RFx</p>
          <p className="mt-2 text-2xl font-semibold">1</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">SKUs</p>
          <p className="mt-2 text-2xl font-semibold">30</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Vendors</p>
          <p className="mt-2 text-2xl font-semibold">5</p>
        </div>
      </div>
    </div>
  );
}
