"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Stethoscope } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Provider = { id: string; name: string; job_title: string | null; department: string | null; branch_id: string | null };

export default function Page() {
  const [providers, setProviders] = useState<Provider[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(true);
  async function load() { setBusy(true); try { setProviders(await api.get<Provider[]>("/api/v1/hospital/providers")); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load providers."); } finally { setBusy(false); } }
  useEffect(() => { void load(); }, []);
  return <DashboardShell title="Hospital providers" subtitle="Clinicians available for appointments and care hand-offs"><PermissionGate permission="hospital.appointments.read" module="hospital"><main className="mx-auto max-w-[1100px] space-y-6"><header className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Care team</p><h1 className="mt-2 text-3xl font-bold">Provider directory</h1></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold"><RefreshCw size={16} /> Refresh</button></header>{error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{busy ? <p className="text-sm text-slate-500">Loading providers…</p> : providers.map((provider) => <article key={provider.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700"><Stethoscope size={19} /></span><div><p className="font-bold">{provider.name}</p><p className="text-xs text-slate-500">{provider.job_title || "Clinical provider"}</p></div></div><p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">{provider.department || "General practice"}</p></article>)}{!busy && !providers.length && <p className="text-sm text-slate-500">No active clinicians are configured yet. Add staff with a doctor, physician, clinician, or nurse job title.</p>}</section></main></PermissionGate></DashboardShell>;
}
