"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileImage, RefreshCw } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Study = { id: string; patient_name: string; study_name: string; priority: string; status: string; report: string | null; approved_at?: string | null };

export default function Page() {
  const [items, setItems] = useState<Study[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    setBusy(true); setError("");
    try { setItems(await api.get<Study[]>("/api/v1/hospital/radiology/orders")); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load radiology reports."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function approve(id: string) {
    try { await api.post(`/api/v1/hospital/radiology/orders/${id}/approve`, {}); setNotice("Report approved and released to the clinical team."); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to approve report."); }
  }
  const pending = items.filter((item) => item.report && !item.approved_at);
  return <DashboardShell title="Radiology approvals" subtitle="Review and release completed imaging reports"><PermissionGate permission="hospital.radiology.perform" module="hospital"><main className="mx-auto max-w-[1100px] space-y-6"><header className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Diagnostics governance</p><h1 className="mt-2 text-3xl font-bold">Report approval</h1><p className="mt-2 text-sm text-slate-500">{pending.length} report{pending.length === 1 ? "" : "s"} awaiting approval</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold"><RefreshCw size={16} /> Refresh</button></header>{error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}{notice && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}<section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">{busy ? <p className="p-8 text-sm text-slate-500">Loading reports…</p> : !items.length ? <p className="p-10 text-center text-sm text-slate-500">No radiology reports found.</p> : <div className="divide-y divide-slate-100">{items.map((item) => <article key={item.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><FileImage size={19} /></span><div className="min-w-0 flex-1"><p className="font-bold">{item.study_name}</p><p className="mt-1 text-sm text-slate-500">{item.patient_name} · {item.priority} priority</p>{item.report ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{item.report}</p> : <p className="mt-3 text-sm text-slate-400">Report not entered yet.</p>}</div><div className="flex shrink-0 flex-col items-end gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-600">{item.approved_at ? "approved" : item.status}</span>{item.report && !item.approved_at && <button onClick={() => void approve(item.id)} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white"><CheckCircle2 size={15} /> Approve report</button>}</div></article>)}</div>}</section></main></PermissionGate></DashboardShell>;
}
