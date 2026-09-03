"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, ApiError } from "@/lib/api";

const licensedModules = ["store", "inventory", "stock", "accounting", "hospital", "pharmacy", "laboratory"] as const;
type LicensedModule = typeof licensedModules[number];

type PlatformLicensePlan = {
  id: string;
  name: string;
  description: string;
  company_limit: number;
  cash_point_limit: number;
  modules: LicensedModule[];
  amount: number;
  currency: string;
  branding_available: boolean;
  branding_addon_amount: number;
  active: boolean;
  sort_order: number;
};

function Field({ name, label, type = "text", defaultValue = "", required = false, min }: {
  name: string; label: string; type?: string; defaultValue?: string; required?: boolean; min?: number;
}) {
  return <label className="text-xs font-bold text-slate-600">{label}
    <input name={name} type={type} min={min} defaultValue={defaultValue} required={required} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
  </label>;
}

function formatPlanPrice(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount / 100);
}

/** Platform-super-admin editor for the annual licensing and pricing catalogue. */
export default function PricingPlanEditor() {
  const [plans, setPlans] = useState<PlatformLicensePlan[]>([]);
  const [editing, setEditing] = useState<PlatformLicensePlan | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadPlans() {
    try {
      setError("");
      setPlans(await api.get<PlatformLicensePlan[]>("/api/v1/platform/license-plans"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load pricing plans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadPlans(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function closeEditor() {
    if (saving) return;
    setOpen(false);
    setEditing(null);
    setFormError("");
  }

  function openCreate() {
    setEditing(null);
    setFormError("");
    setOpen(true);
  }

  function openEdit(plan: PlatformLicensePlan) {
    setEditing(plan);
    setFormError("");
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || "").trim(),
      description: String(form.get("description") || "").trim(),
      company_limit: Number(form.get("company_limit") || 0),
      cash_point_limit: Number(form.get("cash_point_limit") || 1),
      modules: licensedModules.filter((module) => form.get(`module_${module}`) === "on"),
      amount: Number(form.get("amount") || 0),
      currency: String(form.get("currency") || "NGN").trim().toUpperCase(),
      branding_available: form.get("branding_available") === "on",
      branding_addon_amount: Number(form.get("branding_addon_amount") || 0),
      active: form.get("active") === "on",
      sort_order: Number(form.get("sort_order") || 0),
    };

    if (payload.branding_available && payload.branding_addon_amount <= 0) {
      setFormError("Enter a positive yearly branding price before offering the add-on. For NGN, ₦25,000 is 2500000 kobo.");
      return;
    }

    setSaving(true);
    setError("");
    setFormError("");
    try {
      const saved = editing
        ? await api.put<PlatformLicensePlan>(`/api/v1/platform/license-plans/${editing.id}`, payload)
        : await api.post<PlatformLicensePlan>("/api/v1/platform/license-plans", payload);
      setPlans((current) => editing
        ? current.map((plan) => plan.id === saved.id ? saved : plan)
        : [...current, saved].sort((left, right) => left.sort_order - right.sort_order || left.amount - right.amount || left.name.localeCompare(right.name)));
      setNotice(`${saved.name} was ${editing ? "updated" : "created"}.`);
      setOpen(false);
      setEditing(null);
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : "Unable to save pricing plan.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-wider text-teal-600">Billing catalog</p><h2 className="mt-1 text-xl font-bold">Annual pricing plans</h2><p className="mt-1 text-sm text-slate-500">Set the price, POS-terminal allowance, modules, and branding add-on for each plan.</p></div><button type="button" onClick={openCreate} className="self-start rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">New plan</button></div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
    <div className="mt-5 grid gap-4 md:grid-cols-2">{plans.map((plan) => <article key={plan.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{plan.name}</p><p className="mt-1 text-xs text-slate-500">{plan.company_limit ? `${plan.company_limit} companies` : "Module add-on"} · {plan.cash_point_limit} POS terminal{plan.cash_point_limit === 1 ? "" : "s"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${plan.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{plan.active ? "Active" : "Inactive"}</span></div><p className="mt-3 text-xs font-semibold capitalize text-teal-700">{plan.modules.length ? plan.modules.join(" · ") : "No modules included"}</p><p className="mt-5 text-lg font-bold">{formatPlanPrice(plan.amount, plan.currency)}</p>{plan.branding_available && <p className="mt-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">+ {formatPlanPrice(plan.branding_addon_amount, plan.currency)}/year when custom branding is selected</p>}<button type="button" onClick={() => openEdit(plan)} className="mt-4 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-teal-700">Edit plan</button></article>)}{!loading && !plans.length && <p className="text-sm text-slate-500">No pricing plans yet.</p>}{loading && <p className="text-sm text-slate-500">Loading pricing plans…</p>}</div>
    {open && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4"><form key={editing?.id || "new"} onSubmit={(event) => void save(event)} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">{editing ? "Edit annual pricing plan" : "New annual pricing plan"}</h2><p className="mt-1 text-xs text-slate-400">For NGN, enter the amount in kobo: ₦1,500,000 is 150000000.</p></div><button type="button" disabled={saving} onClick={closeEditor} aria-label="Close pricing plan editor"><X size={18} /></button></div>{formError && <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</p>}<div className="mt-5 grid gap-4 sm:grid-cols-2"><Field name="name" label="Plan name" defaultValue={editing?.name || ""} required /><Field name="amount" label="Base plan price (smallest unit)" type="number" min={1} defaultValue={String(editing?.amount || "")} required /><Field name="currency" label="Currency" defaultValue={editing?.currency || "NGN"} required /><Field name="company_limit" label="Company capacity (0 for add-on)" type="number" min={0} defaultValue={String(editing?.company_limit || 0)} /><Field name="cash_point_limit" label="POS-terminal capacity" type="number" min={1} defaultValue={String(editing?.cash_point_limit || 1)} required /><Field name="sort_order" label="Display order" type="number" min={0} defaultValue={String(editing?.sort_order || 0)} /><Field name="branding_addon_amount" label="Branding add-on price/year (smallest unit)" type="number" min={0} defaultValue={String(editing?.branding_addon_amount || 0)} /></div><label className="mt-4 block text-xs font-bold text-slate-600">Description<textarea name="description" defaultValue={editing?.description || ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Included modules</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{licensedModules.map((module) => <label key={module} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-semibold capitalize"><input name={`module_${module}`} type="checkbox" defaultChecked={editing?.modules.includes(module)} />{module}</label>)}</div><label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input name="branding_available" type="checkbox" defaultChecked={editing?.branding_available ?? false} />Offer custom tenant branding as a paid annual add-on</label><label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true} />Make this plan available for purchase</label><button type="submit" disabled={saving} className="mt-6 flex w-full items-center justify-center rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{saving ? "Saving pricing plan…" : editing ? "Update pricing plan" : "Create pricing plan"}</button></form></div>}
  </section>;
}
