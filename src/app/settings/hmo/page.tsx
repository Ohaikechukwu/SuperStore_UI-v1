"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Provider = { name: string; requires_pre_auth: boolean; active: boolean };
type HmoSettings = { enabled: boolean; providers: Provider[]; verification_methods: Array<"manual" | "phone" | "hmo_portal"> };

const defaults: HmoSettings = { enabled: false, providers: [], verification_methods: ["manual", "phone"] };

export default function Page() {
  const [value, setValue] = useState<HmoSettings>(defaults);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void api.get<HmoSettings>("/api/v1/hospital/billing/hmo-settings")
        .then((settings) => setValue({ ...defaults, ...settings }))
        .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to load HMO settings."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function changeProvider(index: number, patch: Partial<Provider>) {
    setValue((current) => ({ ...current, providers: current.providers.map((provider, position) => position === index ? { ...provider, ...patch } : provider) }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    const providers = value.providers.map((provider) => ({ ...provider, name: provider.name.trim() })).filter((provider) => provider.name);
    if (value.enabled && !providers.some((provider) => provider.active)) {
      setError("Add at least one active HMO provider before enabling HMO cover.");
      return;
    }
    if (value.enabled && !value.verification_methods.length) {
      setError("Select at least one HMO verification method.");
      return;
    }
    try {
      const saved = await api.put<HmoSettings>("/api/v1/hospital/billing/hmo-settings", { ...value, providers });
      setValue(saved); setNotice("HMO settings saved for this tenant.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to save HMO settings.");
    }
  }

  function toggleMethod(method: HmoSettings["verification_methods"][number]) {
    setValue((current) => ({ ...current, verification_methods: current.verification_methods.includes(method)
      ? current.verification_methods.filter((item) => item !== method)
      : [...current.verification_methods, method] }));
  }

  return <DashboardShell title="Tenant HMO setup" subtitle="Configure accepted HMO providers and coverage verification rules">
    <PermissionGate permission="hospital.billing.approve" module="hospital">
      <main className="mx-auto max-w-3xl space-y-6">
        <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Tenant configuration</p><h1 className="mt-2 text-3xl font-bold">HMO coverage</h1><p className="mt-2 text-sm text-slate-500">Each service still needs its own enrollee check, cover amount, co-pay, and pre-authorization evidence before it is released.</p></header>
        {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <form onSubmit={save} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="flex items-start gap-3 rounded-2xl bg-teal-50 p-4 text-sm"><input type="checkbox" checked={value.enabled} onChange={(event) => setValue({ ...value, enabled: event.target.checked })} className="mt-1" /><span><strong className="block">Accept HMO cover for this tenant</strong><span className="mt-1 block text-teal-900">When disabled, billing cannot release a service with HMO cover.</span></span></label>
          <section><div className="flex items-center justify-between"><div><h2 className="font-bold">Accepted providers</h2><p className="mt-1 text-xs text-slate-500">Only active providers in this list can be used during verification.</p></div><button type="button" onClick={() => setValue({ ...value, providers: [...value.providers, { name: "", requires_pre_auth: false, active: true }] })} className="inline-flex items-center gap-2 rounded-xl border border-teal-200 px-3 py-2 text-xs font-bold text-teal-700"><Plus size={15} /> Add provider</button></div><div className="mt-4 space-y-3">{value.providers.map((provider, index) => <div key={index} className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[1fr_auto_auto_auto]"><input value={provider.name} onChange={(event) => changeProvider(index, { name: event.target.value })} placeholder="HMO provider name" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" /><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={provider.requires_pre_auth} onChange={(event) => changeProvider(index, { requires_pre_auth: event.target.checked })} /> Pre-auth required</label><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={provider.active} onChange={(event) => changeProvider(index, { active: event.target.checked })} /> Active</label><button type="button" aria-label="Remove provider" onClick={() => setValue({ ...value, providers: value.providers.filter((_, position) => position !== index) })} className="justify-self-start rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16} /></button></div>)}{!value.providers.length && <p className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No providers are configured. Add the HMO organisations this tenant accepts.</p>}</div></section>
          <section><h2 className="font-bold">Allowed verification evidence</h2><p className="mt-1 text-xs text-slate-500">These are recorded as audit evidence; they do not connect to an HMO API.</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{(["manual", "phone", "hmo_portal"] as const).map((method) => <label key={method} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-semibold"><input type="checkbox" checked={value.verification_methods.includes(method)} onChange={() => toggleMethod(method)} />{method === "hmo_portal" ? "HMO portal" : method[0].toUpperCase() + method.slice(1)}</label>)}</div></section>
          <button className="w-full rounded-xl bg-teal-600 p-3 text-sm font-bold text-white">Save HMO setup</button>
        </form>
      </main>
    </PermissionGate>
  </DashboardShell>;
}
