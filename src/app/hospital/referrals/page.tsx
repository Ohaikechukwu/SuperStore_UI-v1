"use client";

import FormSelect from "@/components/form-select";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Referral = { id: string; patient_name: string; referred_to: string; reason: string; urgency: string; status: string; notes: string | null };

export default function Page() {
  const [items, setItems] = useState<Referral[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  async function load() { setBusy(true); setError(""); try { setItems(await api.get<Referral[]>("/api/v1/hospital/clinical/referrals")); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load referrals."); } finally { setBusy(false); } }
  useEffect(() => { void load(); }, []);
  async function update(item: Referral, status: string) { try { await api.post(`/api/v1/hospital/clinical/referrals/${item.id}/status`, { status }); await load(); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update referral."); } }
  return <DashboardShell title="Hospital referrals" subtitle="Track hand-offs between clinicians and services"><PermissionGate permission="hospital.encounters.read" module="hospital"><main className="mx-auto max-w-[1100px] space-y-6"><header className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Care coordination</p><h1 className="mt-2 text-3xl font-bold">Referral register</h1></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold"><RefreshCw size={16} /> Refresh</button></header>{error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}<section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">{busy ? <p className="p-8 text-sm text-slate-500">Loading referrals…</p> : !items.length ? <p className="p-10 text-center text-sm text-slate-500">No referrals recorded.</p> : <div className="divide-y divide-slate-100">{items.map((item) => <article key={item.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-center"><div><p className="font-bold">{item.patient_name}</p><p className="mt-1 text-sm text-slate-600">{item.reason}</p>{item.notes && <p className="mt-1 text-xs text-slate-400">{item.notes}</p>}</div><div><p className="text-sm font-semibold">{item.referred_to}</p><p className="mt-1 text-xs uppercase text-slate-400">{item.urgency} priority · {item.status}</p></div><FormSelect value={item.status} onChange={(event) => void update(item, event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><option value="open">Open</option><option value="accepted">Accepted</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></FormSelect></article>)}</div>}</section></main></PermissionGate></DashboardShell>;
}
