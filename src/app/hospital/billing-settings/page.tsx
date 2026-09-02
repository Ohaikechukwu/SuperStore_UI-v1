"use client";

import { FormEvent, useEffect, useState } from "react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Fee = { configured: boolean; amount?: string; currency?: string; effective_from?: string };

export default function Page() {
  const [fee, setFee] = useState<Fee | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const load = async () => { try { setFee(await api.get<Fee>("/api/v1/hospital/billing/consultation-fee")); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load consultation fee."); } };
  useEffect(() => { void load(); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    try { await api.put("/api/v1/hospital/billing/consultation-fee", { amount: data.get("amount"), currency: data.get("currency") }); setNotice("Consultation fee saved. New bookings now use this fee; existing invoices are unchanged."); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to save consultation fee."); }
  }
  return <DashboardShell title="Clinical billing settings" subtitle="Set the tenant consultation fee without changing historical invoices"><PermissionGate permission="hospital.billing.approve" module="hospital"><main className="mx-auto max-w-2xl space-y-6"><header><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Tenant administrator</p><h1 className="mt-2 text-3xl font-bold">Consultation fee</h1><p className="mt-2 text-sm text-slate-500">A new appointment remains pending until this fee is paid, HMO-cleared, or released for a documented emergency.</p></header>{notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<form onSubmit={save} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6"><label className="block text-sm font-semibold">Fee amount<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={fee?.amount || ""} className="mt-1 w-full rounded-xl border border-slate-200 p-3"/></label><label className="block text-sm font-semibold">Currency<input name="currency" defaultValue={fee?.currency || "NGN"} minLength={3} maxLength={3} required className="mt-1 w-full rounded-xl border border-slate-200 p-3 uppercase"/></label>{fee?.configured && <p className="text-xs text-slate-500">Current fee became effective {fee.effective_from ? new Date(fee.effective_from).toLocaleString() : "now"}.</p>}<button className="w-full rounded-xl bg-teal-600 p-3 font-bold text-white">Save consultation fee</button></form></main></PermissionGate></DashboardShell>;
}
