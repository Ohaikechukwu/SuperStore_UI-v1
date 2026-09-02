"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Invoice = { id: string; description: string; amount: string; paid_amount: string; status: string };
type PaymentMethod = { id: string; name: string; provider: "manual_bank_transfer" | "in_person" | "paystack"; merchant_name?: string | null; bank_name?: string | null; account_number?: string | null; payment_note?: string | null };
type PaymentInstructions = { methods: PaymentMethod[]; currency?: string };
type Wallet = { balance: string; currency: string; active: boolean; pin_configured: boolean };

const money = (value: number, currency = "NGN") => new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(value);

export default function PatientInvoicesPage() {
  const [items, setItems] = useState<Invoice[]>([]);
  const [instructions, setInstructions] = useState<PaymentInstructions | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [walletPayment, setWalletPayment] = useState<Invoice | null>(null);
  const [walletPassword, setWalletPassword] = useState("");
  const [walletPin, setWalletPin] = useState("");
  const [reference, setReference] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const [portal, payment, walletData] = await Promise.all([
        api.get<{ invoices: Invoice[] }>("/api/v1/hospital/patient-portal/me"),
        api.get<PaymentInstructions>("/api/v1/hospital/patient-portal/payment-instructions"),
        api.get<Wallet>("/api/v1/hospital/patient-portal/wallet"),
      ]);
      setItems(portal.invoices);
      setInstructions(payment);
      setWallet(walletData);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load invoices.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function closeWalletPayment() {
    if (submitting) return;
    setWalletPayment(null);
    setWalletPassword("");
    setWalletPin("");
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !selectedMethod || !reference.trim()) return;
    const outstanding = Math.max(0, Number(selected.amount) - Number(selected.paid_amount));
    if (!outstanding) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/api/v1/hospital/patient-portal/invoices/${selected.id}/payment-submissions`, {
        amount: outstanding,
        bank_reference: reference.trim(),
        proof_url: proofUrl.trim() || undefined,
        payment_method_id: selectedMethod.id,
      });
      setNotice(`Your ${selectedMethod.name} transfer reference was sent to billing for verification.`);
      setSelected(null);
      setSelectedMethod(null);
      setReference("");
      setProofUrl("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to submit the payment reference.");
    } finally {
      setSubmitting(false);
    }
  }

  async function checkout(item: Invoice, method: PaymentMethod) {
    setSubmitting(true);
    setError("");
    try {
      const result = await api.post<{ checkout_url: string }>(`/api/v1/hospital/patient-portal/invoices/${item.id}/checkout`, { payment_method_id: method.id });
      window.location.assign(result.checkout_url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to start secure checkout.");
      setSubmitting(false);
    }
  }

  async function payWithWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!walletPayment) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await api.post<{ wallet_balance: string }>(`/api/v1/hospital/patient-portal/wallet/invoices/${walletPayment.id}/pay`, {
        password: walletPassword,
        pin: walletPin,
      });
      setNotice(`Payment applied from your wallet. New wallet balance: ${money(Number(result.wallet_balance), wallet?.currency)}.`);
      setWalletPayment(null);
      setWalletPassword("");
      setWalletPin("");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to pay from your wallet.");
    } finally {
      setSubmitting(false);
    }
  }

  const methods = instructions?.methods || [];
  const transferMethods = methods.filter((method) => method.provider === "manual_bank_transfer");
  const paystackMethods = methods.filter((method) => method.provider === "paystack");
  const facilityMethods = methods.filter((method) => method.provider === "in_person");

  return (
    <DashboardShell title="Patient invoices" subtitle="Review balances and choose how to make payment">
      <PermissionGate permission="patient.portal.access" module="hospital">
        <main className="mx-auto max-w-3xl space-y-6">
          <header><h1 className="text-3xl font-bold">Invoices</h1><p className="mt-1 text-sm text-slate-500">Payments are released only after independent billing verification.</p></header>

          {instructions && <section className="space-y-3 rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm text-teal-950">
            <p className="font-bold">Available payment methods</p>
            {methods.length ? methods.map((method) => <div key={method.id} className="rounded-xl bg-white/70 p-3"><p className="font-bold">{method.name}</p>
              {method.provider === "manual_bank_transfer" && <><p className="mt-1">Transfer and submit the bank reference for verification.</p>{method.merchant_name && <p className="mt-2">Account name: {method.merchant_name}</p>}{method.bank_name && <p>Bank: {method.bank_name}</p>}{method.account_number && <p>Account number: {method.account_number}</p>}</>}
              {method.provider === "paystack" && <p className="mt-1">Secure online checkout. Your service is released after signed payment confirmation.</p>}
              {method.provider === "in_person" && <p className="mt-1">Pay at the facility cashier or billing desk.</p>}
              {method.payment_note && <p className="mt-2 text-xs">{method.payment_note}</p>}
            </div>) : <p>No online payment method is configured yet. Please contact billing.</p>}
            <p className="text-xs">Do not send card details through this portal.</p>
          </section>}

          {wallet && <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <div><p className="font-bold">Patient wallet</p><p className="mt-1 text-slate-600">Available: {money(Number(wallet.balance), wallet.currency)}</p></div>
            <Link href="/patient-portal/wallet" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-teal-700">{wallet.pin_configured ? "View wallet activity" : "Create wallet PIN"}</Link>
          </section>}

          {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
          {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

          <section className="space-y-3">
            {items.length ? items.map((item) => {
              const outstanding = Math.max(0, Number(item.amount) - Number(item.paid_amount));
              const canUseWallet = Boolean(wallet?.active && Number(wallet.balance) > 0);
              return <article key={item.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="font-bold">{item.description}</p><p className="text-sm text-slate-500">Paid {item.paid_amount} of {item.amount} · {item.status}</p></div><Link href={`/patient-portal/invoices/${item.id}`} className="self-start rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700">View invoice</Link></div>
                {outstanding > 0 && <div className="flex flex-wrap gap-2">
                  {canUseWallet && <button disabled={submitting} onClick={() => { setError(""); setWalletPayment(item); }} className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-xs font-bold text-teal-800 disabled:opacity-60">Use wallet</button>}
                  {transferMethods.map((method) => <button key={method.id} onClick={() => { setSelected(item); setSelectedMethod(method); }} className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white">Pay by {method.name}</button>)}
                  {paystackMethods.map((method) => <button key={method.id} disabled={submitting} onClick={() => void checkout(item, method)} className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">Pay with {method.name}</button>)}
                  {facilityMethods.map((method) => <span key={method.id} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">{method.name}: pay at facility</span>)}
                </div>}
              </article>;
            }) : <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No invoices found.</p>}
          </section>

          {selected && selectedMethod && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
            <form onSubmit={submitTransfer} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
              <div><h2 className="text-lg font-bold">Submit transfer reference</h2><p className="mt-1 text-sm text-slate-500">{selectedMethod.name} · Amount: {money(Math.max(0, Number(selected.amount) - Number(selected.paid_amount)), instructions?.currency)}</p></div>
              <label className="block text-sm font-medium">Bank reference<input required minLength={4} maxLength={160} value={reference} onChange={(event) => setReference(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <label className="block text-sm font-medium">Proof URL (optional)<input type="url" maxLength={500} value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <div className="flex justify-end gap-3"><button type="button" onClick={() => { setSelected(null); setSelectedMethod(null); }} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button disabled={submitting} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{submitting ? "Submitting…" : "Submit"}</button></div>
            </form>
          </div>}

          {walletPayment && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="wallet-payment-title">
            <form onSubmit={payWithWallet} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4"><div><h2 id="wallet-payment-title" className="text-lg font-bold">Pay with wallet</h2><p className="mt-1 text-sm text-slate-500">Confirm {money(Math.max(0, Number(walletPayment.amount) - Number(walletPayment.paid_amount)), wallet?.currency)} for {walletPayment.description}.</p></div><button type="button" onClick={closeWalletPayment} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={20} /></button></div>
              {!wallet?.pin_configured && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">You need to create a wallet PIN first. <Link href="/patient-portal/wallet" className="font-bold underline">Open wallet security</Link></p>}
              <label className="block text-sm font-medium">Account password<input required type="password" autoComplete="current-password" value={walletPassword} onChange={(event) => setWalletPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <label className="block text-sm font-medium">Wallet PIN<input required type="password" inputMode="numeric" pattern="[0-9]{4,12}" minLength={4} maxLength={12} autoComplete="current-password" value={walletPin} onChange={(event) => setWalletPin(event.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <div className="flex justify-end gap-3"><button type="button" onClick={closeWalletPayment} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button disabled={submitting || !wallet?.pin_configured} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{submitting ? "Paying…" : "Confirm payment"}</button></div>
            </form>
          </div>}
        </main>
      </PermissionGate>
    </DashboardShell>
  );
}
