"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, RefreshCw, Search, ShieldCheck } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Payment = {
  id: string; reference: string; provider: string; status: string; license_kind: string; amount: number; currency: string;
  plan_name: string | null; branding_enabled: boolean; tenant_id: string | null; tenant_public_id: string | null;
  tenant_name: string | null; tenant_slug: string | null; payer_name: string | null; payer_email: string | null;
  provider_transaction_id: string | null; provider_paid_at: string | null; provider_channel: string | null;
  created_at: string; updated_at: string;
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(amount / 100);
}

function Status({ status }: { status: string }) {
  const styles = status === "completed" ? "bg-emerald-50 text-emerald-700" : status === "pending" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${styles}`}>{status}</span>;
}

export default function PlatformPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try { setPayments(await api.get<Payment[]>("/api/v1/platform/license-payments")); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load subscription payments."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void api.get<Payment[]>("/api/v1/platform/license-payments")
      .then((rows) => { if (active) setPayments(rows); })
      .catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : "Unable to load subscription payments."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => payments.filter((payment) => {
    const matchStatus = status === "all" || payment.status === status;
    const haystack = [payment.reference, payment.tenant_name, payment.tenant_slug, payment.payer_name, payment.payer_email, payment.plan_name, payment.provider_transaction_id].filter(Boolean).join(" ").toLowerCase();
    return matchStatus && haystack.includes(query.toLowerCase().trim());
  }), [payments, query, status]);
  const completed = payments.filter((payment) => payment.status === "completed").length;
  const pending = payments.filter((payment) => payment.status === "pending").length;

  async function verify(payment: Payment) {
    setVerifying(payment.reference); setError(""); setNotice("");
    try {
      const updated = await api.post<Payment>(`/api/v1/billing/payments/${encodeURIComponent(payment.reference)}/verify`, {});
      setPayments((current) => current.map((item) => item.reference === updated.reference ? { ...item, ...updated } : item));
      setNotice(`${payment.reference} was verified with Paystack and its subscription is now active.`);
      await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to verify this payment with Paystack."); }
    finally { setVerifying(null); }
  }

  async function copy(reference: string) {
    await navigator.clipboard.writeText(reference);
    setNotice("Payment reference copied.");
  }

  return <DashboardShell title="Subscription payments" subtitle="Cross-tenant payment references, confirmation status, and subscription reconciliation.">
    <PermissionGate allowedRoles={["platform_super_admin"]}>
      <main className="mx-auto max-w-[1280px] space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Platform finance</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Subscription payments</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Each checkout is retained here with its tenant, plan, provider reference, confirmation state, and non-sensitive provider receipt details.</p></div><button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"><RefreshCw size={16} /> Refresh</button></div>
        <section className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">All checkouts</p><p className="mt-2 text-2xl font-bold">{payments.length}</p></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Confirmed</p><p className="mt-2 text-2xl font-bold text-emerald-900">{completed}</p></div><div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-amber-800">Needs confirmation</p><p className="mt-2 text-2xl font-bold text-amber-950">{pending}</p></div></section>
        {error && <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}{notice && <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, tenant, payer, or plan" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">All statuses</option><option value="pending">Pending</option><option value="completed">Completed</option></select></div>
          <div className="mt-5 space-y-3">{visible.map((payment) => <article key={payment.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Status status={payment.status} /><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">{payment.provider}</span>{payment.branding_enabled && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">Branding add-on</span>}</div><p className="mt-3 text-lg font-bold text-slate-950">{money(payment.amount, payment.currency)} <span className="text-sm font-medium text-slate-400">{payment.plan_name || "Subscription plan"}</span></p><div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><code className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{payment.reference}</code><button onClick={() => void copy(payment.reference)} aria-label="Copy payment reference" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Copy size={15} /></button></div></div><div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:min-w-[390px]"><p><span className="text-slate-400">Tenant:</span> {payment.tenant_public_id ? <Link href={`/t/${payment.tenant_public_id}/`} className="font-bold text-teal-700 hover:underline">{payment.tenant_name || payment.tenant_slug} <ExternalLink className="inline" size={13} /></Link> : "Not linked"}</p><p><span className="text-slate-400">Payer:</span> {payment.payer_name || payment.payer_email || "Unknown"}</p><p><span className="text-slate-400">Created:</span> {new Date(payment.created_at).toLocaleString()}</p><p><span className="text-slate-400">Provider receipt:</span> {payment.provider_transaction_id || "Awaiting confirmation"}</p>{payment.provider_paid_at && <p><span className="text-slate-400">Paid:</span> {new Date(payment.provider_paid_at).toLocaleString()}</p>}{payment.provider_channel && <p><span className="text-slate-400">Channel:</span> {payment.provider_channel}</p>}</div></div>{payment.status === "pending" && payment.provider === "paystack" && <div className="mt-4 border-t border-slate-100 pt-4"><button disabled={verifying === payment.reference} onClick={() => void verify(payment)} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50">{verifying === payment.reference ? <RefreshCw className="animate-spin" size={15} /> : <ShieldCheck size={15} />}{verifying === payment.reference ? "Checking Paystack…" : "Verify with Paystack"}</button><span className="ml-3 text-xs text-slate-500">Use this only to recover a pending checkout; it validates the provider amount and currency before activating the subscription.</span></div>}</article>)}{!visible.length && <p className="py-10 text-center text-sm text-slate-500">{loading ? "Loading payment ledger…" : "No subscription payments match this filter."}</p>}</div>
        </section>
      </main>
    </PermissionGate>
  </DashboardShell>;
}
