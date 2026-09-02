"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Family = { guardian: { name: string }; dependents: Array<{ access_id: string; id: string; name: string; patient_number: string; relationship: string; date_of_birth: string | null }> };

export default function Page() {
  const [data, setData] = useState<Family | null>(null);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState("");

  async function load() {
    try {
      setData(await api.get<Family>("/api/v1/hospital/patient-portal/family"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load family access.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function revoke(dependent: Family["dependents"][number]) {
    if (!window.confirm(`Remove your portal access to ${dependent.name}'s information? You can ask the hospital to approve it again later.`)) return;
    setError("");
    setRevoking(dependent.id);
    try {
      await api.delete(`/api/v1/hospital/patient-portal/family/${dependent.id}`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to remove dependent access.");
    } finally {
      setRevoking("");
    }
  }

  return <DashboardShell title="Family access" subtitle="Hospital-approved access for children and dependents"><PermissionGate permission="patient.portal.access" module="hospital"><main className="mx-auto max-w-[1280px] space-y-6"><header><h1 className="text-3xl font-bold">Family & dependents</h1><p className="mt-2 text-sm text-slate-500">For privacy, dependents are added only after the hospital verifies the relationship and gives approval. Dependent access is read-only and excludes messages, documents, billing, and account changes.</p></header>{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{!data ? !error && <p className="text-sm text-slate-500">Loading family access…</p> : <section className="rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-6"><h2 className="font-bold">Approved dependents for {data.guardian.name}</h2></div>{data.dependents.length ? <div className="divide-y divide-slate-100">{data.dependents.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 p-6"><div><p className="font-bold">{item.name}</p><p className="mt-1 text-sm text-slate-500">{item.relationship} · {item.patient_number}{item.date_of_birth ? ` · Born ${item.date_of_birth}` : ""}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Approved</span><Link href={`/patient-portal/family/${item.id}`} className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">View care</Link><button disabled={revoking === item.id} onClick={() => void revoke(item)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-60">{revoking === item.id ? "Removing…" : "Remove access"}</button></div></article>)}</div> : <p className="p-10 text-center text-sm text-slate-500">No dependent access is approved yet. Ask reception to verify and add a relationship.</p>}</section>}</main></PermissionGate></DashboardShell>;
}
