"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Attempt = { id: string; amount: string; provider: string; bank_reference: string | null; proof_url: string | null; submitted_at: string; invoice_description: string; patient_number: string | null; patient_name: string | null };

export default function Page() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try { setAttempts((await api.get<{ attempts: Attempt[] }>("/api/v1/hospital/billing/payment-attempts")).attempts); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load payment submissions."); }
  }
  useEffect(() => { void load(); }, []);

  async function verify(item: Attempt, accepted: boolean) {
    const note = window.prompt(accepted ? "Verification note" : "Reason for rejection");
    if (!note?.trim()) return;
    setBusy(item.id); setError("");
    try {
      await api.post(`/api/v1/hospital/billing/payment-attempts/${item.id}/verify`, { accepted, verification_note: note.trim() });
      await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to verify payment submission."); }
    finally { setBusy(null); }
  }

  return <DashboardShell title="Verify clinical payments" subtitle="Independently verify bank-transfer submissions before releasing care">
    <PermissionGate permission="hospital.billing.post" module="hospital">
      <main className="mx-auto max-w-5xl space-y-6"><div><h1 className="text-3xl font-bold">Pending payment verification</h1><p className="mt-1 text-sm text-slate-500">Accept only after checking the tenant’s bank or payment-provider record. This action releases the linked clinical service.</p></div>{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<section className="space-y-3">{attempts.length ? attempts.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="space-y-1"><p className="font-bold">{item.invoice_description}</p><p className="text-sm text-slate-600">{item.patient_name || "Patient"}{item.patient_number ? ` · ${item.patient_number}` : ""}</p><p className="text-sm text-slate-500">{item.provider} · Reference: <span className="font-mono">{item.bank_reference || "—"}</span> · ₦{Number(item.amount).toLocaleString()}</p><p className="text-xs text-slate-400">Submitted {new Date(item.submitted_at).toLocaleString()}</p>{item.proof_url && <a href={item.proof_url} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-teal-700 underline">View submitted proof</a>}</div><div className="flex gap-2"><button disabled={busy === item.id} onClick={() => void verify(item, false)} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700 disabled:opacity-60">Reject</button><button disabled={busy === item.id} onClick={() => void verify(item, true)} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{busy === item.id ? "Saving…" : "Verify & release"}</button></div></div></article>) : <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No payment submissions are waiting for verification.</p>}</section></main>
    </PermissionGate>
  </DashboardShell>;
}
