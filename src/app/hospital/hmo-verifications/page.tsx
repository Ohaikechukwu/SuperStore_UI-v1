"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import DashboardShell from "@/components/dashboard-shell";
import FormSelect from "@/components/form-select";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Provider = { name: string; requires_pre_auth: boolean; active: boolean };
type HmoSettings = { enabled: boolean; providers: Provider[]; verification_methods: Array<"manual" | "phone" | "hmo_portal"> };
type Authorization = { id: string; service_type: string; description: string; patient_name: string; patient_number: string | null; amount: string; currency: string };

export default function Page() {
  const [settings, setSettings] = useState<HmoSettings | null>(null);
  const [items, setItems] = useState<Authorization[]>([]);
  const [selected, setSelected] = useState<Authorization | null>(null);
  const [providerName, setProviderName] = useState("");
  const [method, setMethod] = useState<"manual" | "phone" | "hmo_portal">("manual");
  const [copay, setCopay] = useState("0");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const activeProviders = useMemo(() => settings?.providers.filter((provider) => provider.active) || [], [settings]);
  const selectedProvider = activeProviders.find((provider) => provider.name === providerName);
  const coveredAmount = selected ? Math.max(0, Number(selected.amount) - (Number(copay) || 0)).toFixed(2) : "0.00";

  async function load() {
    setError("");
    try {
      const [hmo, worklist] = await Promise.all([api.get<HmoSettings>("/api/v1/hospital/billing/hmo-settings"), api.get<{ authorizations: Authorization[] }>("/api/v1/hospital/service-authorizations/hmo-worklist")]);
      setSettings(hmo); setItems(worklist.authorizations);
      setProviderName((current) => current || hmo.providers.find((provider) => provider.active)?.name || "");
      setMethod((current) => hmo.verification_methods.includes(current) ? current : (hmo.verification_methods[0] || "manual"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load HMO verification worklist.");
    }
  }

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);

  function begin(item: Authorization) {
    setSelected(item); setCopay("0"); setNotice("");
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !settings) return;
    const form = new FormData(event.currentTarget);
    const copayAmount = Number(copay);
    if (!Number.isFinite(copayAmount) || copayAmount < 0 || copayAmount > Number(selected.amount)) {
      setError("The patient co-pay must be between zero and the full service amount.");
      return;
    }
    setError("");
    try {
      await api.put(`/api/v1/hospital/service-authorizations/${selected.id}/hmo-coverage`, {
        provider_name: providerName, hmo_member_id: String(form.get("hmo_member_id")),
        enrollee_verified: form.get("enrollee_verified") === "on", service_covered: form.get("service_covered") === "on",
        pre_auth_required: Boolean(selectedProvider?.requires_pre_auth), pre_auth_code: form.get("pre_auth_code") || null,
        patient_copay_amount: copayAmount.toFixed(2), hmo_covered_amount: coveredAmount,
        verification_method: method, expires_at: form.get("expires_at") || null, notes: form.get("notes") || null,
      });
      setSelected(null); setNotice("HMO coverage recorded. The service is released only when the cover, co-pay, and pre-authorization checks all pass."); await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to verify HMO cover.");
    }
  }

  return <DashboardShell title="HMO verification" subtitle="Verify per-service HMO cover before releasing clinical care">
    <PermissionGate permission="hospital.billing.approve" module="hospital">
      <main className="mx-auto max-w-5xl space-y-6"><header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Clinical billing</p><h1 className="mt-2 text-3xl font-bold">HMO coverage worklist</h1><p className="mt-2 text-sm text-slate-500">Coverage is verified per patient and service. A registered HMO number alone does not release care.</p></div><a href="/settings/hmo" className="rounded-xl border border-teal-200 px-4 py-2.5 text-sm font-bold text-teal-700">Configure HMO providers</a></header>{notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{settings && !settings.enabled && <p className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-900">HMO cover is disabled for this tenant. Configure and enable it before recording coverage.</p>}<section className="space-y-3">{items.map((item) => <article key={item.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center"><div><p className="font-bold">{item.description}</p><p className="mt-1 text-sm text-slate-600">{item.patient_name}{item.patient_number ? ` · ${item.patient_number}` : ""}</p><p className="mt-1 text-sm text-slate-500">{item.service_type.replaceAll("_", " ")} · {item.currency} {Number(item.amount).toLocaleString()}</p></div><button disabled={!settings?.enabled || !activeProviders.length} onClick={() => begin(item)} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Verify cover</button></article>)}{!items.length && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No pending clinical services need HMO verification.</p>}</section>{selected && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={verify} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div><p className="text-xs font-bold uppercase tracking-wider text-teal-600">{selected.service_type.replaceAll("_", " ")}</p><h2 className="mt-1 text-xl font-bold">Verify HMO cover</h2><p className="mt-1 text-sm text-slate-500">{selected.patient_name} · {selected.currency} {Number(selected.amount).toLocaleString()}</p></div><div className="mt-5 space-y-4"><label className="block text-sm font-semibold">Provider<FormSelect value={providerName} onChange={(event) => setProviderName(event.target.value)} required className="mt-1 w-full rounded-xl border border-slate-200 p-3"><option value="">Select provider</option>{activeProviders.map((provider) => <option key={provider.name} value={provider.name}>{provider.name}{provider.requires_pre_auth ? " · Pre-auth required" : ""}</option>)}</FormSelect></label><label className="block text-sm font-semibold">HMO member ID<input name="hmo_member_id" required className="mt-1 w-full rounded-xl border border-slate-200 p-3" /></label><label className="block text-sm font-semibold">Verification evidence<FormSelect value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className="mt-1 w-full rounded-xl border border-slate-200 p-3">{settings?.verification_methods.map((item) => <option key={item} value={item}>{item === "hmo_portal" ? "HMO portal" : item[0].toUpperCase() + item.slice(1)}</option>)}</FormSelect></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-semibold">Patient co-pay<input value={copay} onChange={(event) => setCopay(event.target.value)} type="number" min="0" max={selected.amount} step="0.01" required className="mt-1 w-full rounded-xl border border-slate-200 p-3" /></label><label className="block text-sm font-semibold">HMO cover<input value={coveredAmount} readOnly className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3" /></label></div>{selectedProvider?.requires_pre_auth && <label className="block text-sm font-semibold">Pre-authorization code<input name="pre_auth_code" required className="mt-1 w-full rounded-xl border border-slate-200 p-3" /></label>}<label className="block text-sm font-semibold">Cover expiry (optional)<input name="expires_at" type="datetime-local" className="mt-1 w-full rounded-xl border border-slate-200 p-3" /></label><label className="block text-sm font-semibold">Notes (optional)<textarea name="notes" rows={3} className="mt-1 w-full rounded-xl border border-slate-200 p-3" /></label><label className="flex items-center gap-2 text-sm font-semibold"><input name="enrollee_verified" type="checkbox" defaultChecked /> Enrollee verified</label><label className="flex items-center gap-2 text-sm font-semibold"><input name="service_covered" type="checkbox" defaultChecked /> Service is covered</label></div><div className="mt-6 flex gap-3"><button type="button" onClick={() => setSelected(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold">Cancel</button><button className="flex-1 rounded-xl bg-teal-600 py-3 text-sm font-bold text-white">Record verification</button></div></form></div>}</main>
    </PermissionGate>
  </DashboardShell>;
}
