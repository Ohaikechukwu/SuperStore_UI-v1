"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";

type LicensePlan = {
  id: string; name: string; description: string; company_limit: number;
  cash_point_limit: number; modules: string[]; amount: number; currency: string;
  branding_available: boolean; branding_addon_amount: number; billing_period_days: number;
};
type Authorization = { role: string };
type PaymentProvider = { id: "paystack" | "stripe"; available: boolean };

function formatPrice(plan: LicensePlan) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: plan.currency, maximumFractionDigits: 2 }).format(plan.amount / 100);
}
function subscriptionUrl(planId: string) { return `/subscribe?plan=${encodeURIComponent(planId)}`; }

export default function SubscriptionFlow({ selectedPlanId }: { selectedPlanId: string }) {
  const [plans, setPlans] = useState<LicensePlan[]>([]);
  const [planId, setPlanId] = useState(selectedPlanId);
  const [includeBranding, setIncludeBranding] = useState(false);
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [provider, setProvider] = useState<PaymentProvider["id"]>("paystack");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void api.get<LicensePlan[]>("/api/v1/billing/plans")
      .then((items) => { setPlans(items); setPlanId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id || ""); })
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to load available pricing plans."))
      .finally(() => setLoading(false));
    void api.get<Authorization>("/api/v1/auth/me/authorization")
      .then(setAuthorization).catch(() => setAuthorization(null)).finally(() => setCheckingSession(false));
    void api.get<PaymentProvider[]>("/api/v1/billing/providers")
      .then((items) => {
        setProviders(items);
        setProvider((current) => items.some((item) => item.available && item.id === current)
          ? current
          : items.find((item) => item.available)?.id || "paystack");
      })
      .catch(() => setError("Online payment is temporarily unavailable. Please contact the platform administrator."))
      .finally(() => setProvidersLoading(false));
  }, []);

  const plan = useMemo(() => plans.find((item) => item.id === planId) || null, [planId, plans]);
  const continuation = plan ? subscriptionUrl(plan.id) : "/subscribe";
  const total = plan ? plan.amount + (includeBranding ? plan.branding_addon_amount : 0) : 0;
  const availableProviders = providers.filter((item) => item.available);

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan) return;
    if (!availableProviders.some((item) => item.id === provider)) {
      setError("Online payment is not configured yet. Please contact the platform administrator.");
      return;
    }
    setSubmitting(true); setError("");
    try {
      const result = await api.post<{ checkout_url: string }>("/api/v1/billing/checkout", { provider, plan_id: plan.id, branding_enabled: includeBranding });
      window.location.assign(result.checkout_url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to start secure checkout.");
      setSubmitting(false);
    }
  }

  const canPurchase = authorization?.role === "owner" || authorization?.role === "admin" || authorization?.role === "platform_admin" || authorization?.role === "platform_super_admin";
  return <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 sm:px-8 sm:py-16"><div className="mx-auto max-w-5xl">
    <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-bold text-teal-700 hover:text-teal-900"><ArrowLeft size={17} /> Back to pricing</Link>
    <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_380px] lg:items-start"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-teal-700"><ShieldCheck size={16} /> Annual subscription</p><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Choose your plan and continue securely.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Your plan sets the tenant&apos;s licensed modules, company capacity, and POS-terminal allowance for 365 days after payment is confirmed.</p>{error && <p role="alert" className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}{loading ? <div className="mt-7 space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}</div> : !plans.length ? <div className="mt-7 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">No plans are available for purchase yet. Please contact the platform administrator.</div> : <div className="mt-7 space-y-3">{plans.map((item) => <label key={item.id} className={`block cursor-pointer rounded-2xl border p-4 transition ${item.id === planId ? "border-teal-500 bg-teal-50 shadow-sm" : "border-slate-200 hover:border-teal-300"}`}><div className="flex gap-3"><input type="radio" name="plan" checked={item.id === planId} onChange={() => setPlanId(item.id)} className="mt-1 accent-teal-600" /><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row"><p className="font-bold">{item.name}</p><p className="font-bold text-teal-700">{formatPrice(item)}</p></div><p className="mt-1 text-sm text-slate-600">{item.description || "Annual subscription plan"}</p><p className="mt-3 text-xs font-semibold text-slate-500">{item.company_limit} {item.company_limit === 1 ? "company" : "companies"} · {item.cash_point_limit} POS terminal{item.cash_point_limit === 1 ? "" : "s"} · {item.modules.length ? item.modules.join(", ") : "No modules included"}</p></div></div></label>)}</div>}</section>
      <aside className="rounded-3xl border border-teal-100 bg-teal-50 p-6 shadow-sm"><CreditCard className="text-teal-700" size={23} /><h2 className="mt-4 text-xl font-bold">{plan ? plan.name : "Select a plan"}</h2>{plan && <><p className="mt-2 text-3xl font-bold">{new Intl.NumberFormat(undefined, { style: "currency", currency: plan.currency, maximumFractionDigits: 2 }).format(total / 100)}</p><p className="mt-1 text-xs font-bold uppercase tracking-wider text-teal-700">One annual payment</p></>}{checkingSession ? <p className="mt-6 text-sm text-teal-800">Checking your secure session…</p> : authorization ? canPurchase ? <form onSubmit={(event) => void checkout(event)} className="mt-6">{providersLoading ? <p className="text-sm text-teal-800">Checking payment availability…</p> : !availableProviders.length ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Online payment is not configured yet. Set a Paystack or Stripe secret on the API, then try again.</p> : <label className="block text-xs font-bold text-slate-700">Payment provider<select value={provider} onChange={(event) => setProvider(event.target.value as PaymentProvider["id"])} className="mt-1 w-full rounded-xl border border-teal-200 bg-white px-3 py-3 text-sm">{availableProviders.map((item) => <option key={item.id} value={item.id}>{item.id === "paystack" ? "Paystack" : "Stripe"}</option>)}</select></label>}{plan?.branding_available && <label className="mt-4 flex cursor-pointer gap-3 rounded-2xl border border-teal-200 bg-white p-3 text-sm text-slate-700"><input type="checkbox" checked={includeBranding} onChange={(event) => setIncludeBranding(event.target.checked)} className="mt-1 accent-teal-600" /><span><strong className="block">Custom tenant branding</strong><span className="mt-1 block text-xs text-slate-500">Logo, colours, and tenant login-page content for {new Intl.NumberFormat(undefined, { style: "currency", currency: plan.currency, maximumFractionDigits: 2 }).format(plan.branding_addon_amount / 100)} per year.</span></span></label>}<button disabled={!plan || submitting || providersLoading || !availableProviders.length} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "Opening secure checkout…" : "Continue to payment"}<ArrowRight size={16} /></button><p className="mt-3 text-xs leading-5 text-teal-900">You will be redirected to the selected provider. Access is activated only after payment confirmation.</p></form> : <p className="mt-6 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Only a workspace owner or administrator can purchase a subscription.</p> : <div className="mt-6 space-y-3"><p className="text-sm leading-6 text-teal-900">Sign in to an existing workspace, or create a new one. Your selected plan will be kept.</p><Link href={`/login?next=${encodeURIComponent(continuation)}`} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-700"><LockKeyhole size={16} /> Sign in to continue</Link><Link href={`/signup?plan=${encodeURIComponent(planId)}`} className="flex w-full items-center justify-center rounded-xl border border-teal-200 bg-white px-4 py-3 text-sm font-bold text-teal-800 hover:bg-teal-100">Create a new workspace</Link></div>}</aside></div>
    <p className="mx-auto mt-7 max-w-3xl text-center text-xs leading-5 text-slate-500"><CheckCircle2 className="mr-1 inline text-teal-600" size={14} /> Payment confirmation renews the selected plan for 365 days. Selecting a new plan replaces the tenant&apos;s current plan modules with the modules in that plan.</p>
  </div></main>;
}
