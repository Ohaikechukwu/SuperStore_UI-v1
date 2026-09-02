"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";

type Payment = { reference: string; provider: string; status: string; amount: number; currency: string; created_at?: string };
export default function BillingStatusPage() {
  const [payment, setPayment] = useState<Payment | null>(null); const [error, setError] = useState(""); const initial = typeof window === "undefined" ? "" : (() => { const params = new URLSearchParams(window.location.search); return params.get("reference") || params.get("license_payment") || ""; })();
  async function lookup(reference: string) { setError(""); try { setPayment(await api.get<Payment>(`/api/v1/billing/payments/${encodeURIComponent(reference)}`)); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to find that payment."); } }
  useEffect(() => { if (initial) void lookup(initial); }, [initial]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await lookup(String(new FormData(event.currentTarget).get("reference"))); }
  const completed = payment?.status === "completed";
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Billing</p><h1 className="mt-2 text-3xl font-bold">Payment status</h1><p className="mt-2 text-sm text-slate-500">We automatically check the payment when the provider returns you here.</p><form onSubmit={(event) => void submit(event)} className="mt-5 flex gap-2"><input name="reference" defaultValue={initial} required placeholder="lic-…" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm" /><button className="rounded-xl bg-teal-600 px-4 text-white"><Search size={18} /></button></form>{error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{payment && <div className="mt-5 rounded-2xl bg-slate-50 p-5"><div className="flex items-center gap-3"><div className={`grid h-10 w-10 place-items-center rounded-full ${completed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{completed ? <CheckCircle2 size={20} /> : <Clock3 size={20} />}</div><div><p className="font-bold capitalize">{completed ? "Activated" : payment.status}</p><p className="text-xs text-slate-500">{payment.provider} · {payment.reference}</p></div></div><p className="mt-4 text-2xl font-bold">{payment.currency} {payment.amount}</p>{completed && <p className="mt-3 text-sm text-emerald-700">Your annual subscription is active. You can now enable its licensed modules from Settings.</p>}</div>}<Link href="/settings" className="mt-6 block text-center text-sm font-bold text-teal-700">Back to settings</Link></div></main>;
}
