"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, KeyRound, WalletCards, X } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Wallet = {
  balance: string;
  currency: string;
  active: boolean;
  pin_configured: boolean;
  transactions: Array<{ id: string; amount: string; balance_after: string; transaction_type: string; description: string; created_at: string }>;
};

const money = (value: string, currency: string) => new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(Number(value));

export default function PatientWalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [accountPassword, setAccountPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  async function load() {
    try {
      setWallet(await api.get<Wallet>("/api/v1/hospital/patient-portal/wallet"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load your wallet.");
    }
  }

  useEffect(() => { void load(); }, []);

  function closePinModal() {
    if (busy) return;
    setPinModalOpen(false);
    setAccountPassword("");
    setPin("");
    setConfirmPin("");
  }

  async function fund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.post<{ checkout_url: string }>("/api/v1/hospital/patient-portal/wallet/checkout", { amount });
      window.location.assign(result.checkout_url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to start wallet funding.");
      setBusy(false);
    }
  }

  async function savePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin !== confirmPin) {
      setError("The wallet PIN entries do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post("/api/v1/hospital/patient-portal/wallet/pin", { password: accountPassword, pin });
      setNotice(wallet?.pin_configured ? "Your wallet PIN has been updated." : "Your wallet PIN is ready to use.");
      setPinModalOpen(false);
      setAccountPassword("");
      setPin("");
      setConfirmPin("");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to save your wallet PIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell title="Patient wallet" subtitle="Prepaid funds available only for your care at this tenant">
      <PermissionGate permission="patient.portal.access" module="hospital">
        <main className="mx-auto max-w-[1000px] space-y-6">
          <header>
            <h1 className="text-3xl font-bold">My wallet</h1>
            <p className="mt-2 text-sm text-slate-500">Your wallet is tenant-specific and can only be used for your own clinical invoices.</p>
          </header>

          {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
          {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

          {!wallet ? (!error && <p className="text-sm text-slate-500">Loading wallet…</p>) : <>
            <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
              <form onSubmit={fund} className="rounded-3xl border border-teal-100 bg-teal-50 p-5">
                <h2 className="font-bold text-teal-950">Fund wallet with Paystack</h2>
                <p className="mt-1 text-sm text-teal-800">Add prepaid funds securely for future care.</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="100" step="0.01" required placeholder="Amount (NGN)" className="min-w-0 flex-1 rounded-xl border border-teal-200 bg-white px-3 py-2.5 text-sm" />
                  <button disabled={busy || !wallet.active} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{busy ? "Opening…" : "Fund wallet"}</button>
                </div>
              </form>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold">Wallet security</h2>
                    <p className="mt-1 text-sm text-slate-500">{wallet.pin_configured ? "Your wallet PIN is configured." : "Set a PIN before paying invoices from your wallet."}</p>
                  </div>
                  <KeyRound size={20} className="text-teal-700" />
                </div>
                <button type="button" onClick={() => { setError(""); setPinModalOpen(true); }} className="mt-4 rounded-xl border border-teal-200 px-4 py-2 text-sm font-bold text-teal-800">
                  {wallet.pin_configured ? "Change wallet PIN" : "Create wallet PIN"}
                </button>
              </section>
            </section>

            <section className="rounded-3xl bg-gradient-to-br from-slate-900 to-teal-800 p-7 text-white shadow-sm">
              <WalletCards size={26} className="text-teal-200" />
              <p className="mt-7 text-sm text-teal-100">Available balance</p>
              <p className="mt-1 text-4xl font-bold">{money(wallet.balance, wallet.currency)}</p>
              <p className="mt-3 text-sm text-teal-100">{wallet.active ? "Ready to use for eligible clinical invoices." : "This wallet is currently inactive. Please contact billing."}</p>
              <Link href="/patient-portal/invoices" className="mt-6 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-teal-800">Use wallet to pay an invoice</Link>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5">
                <h2 className="font-bold">Wallet activity</h2>
                <p className="mt-1 text-sm text-slate-500">Every credit and payment is recorded here.</p>
              </div>
              {wallet.transactions.length ? <div className="divide-y divide-slate-100">{wallet.transactions.map((item) => <article key={item.id} className="flex items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${Number(item.amount) >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{Number(item.amount) >= 0 ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
                  <div><p className="font-bold capitalize">{item.transaction_type.replaceAll("_", " ")}</p><p className="text-sm text-slate-500">{item.description}</p></div>
                </div>
                <div className="text-right"><p className={`font-bold ${Number(item.amount) >= 0 ? "text-emerald-700" : "text-slate-800"}`}>{Number(item.amount) >= 0 ? "+" : ""}{money(item.amount, wallet.currency)}</p><p className="text-xs text-slate-500">Balance {money(item.balance_after, wallet.currency)}</p></div>
              </article>)}</div> : <p className="p-10 text-center text-sm text-slate-500">No wallet activity yet.</p>}
            </section>
          </>}

          {pinModalOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="wallet-pin-title">
            <form onSubmit={savePin} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div><h2 id="wallet-pin-title" className="text-lg font-bold">{wallet?.pin_configured ? "Change wallet PIN" : "Create wallet PIN"}</h2><p className="mt-1 text-sm text-slate-500">Use a 4–12 digit PIN to approve wallet payments.</p></div>
                <button type="button" onClick={closePinModal} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
              </div>
              <label className="block text-sm font-medium">Account password<input required type="password" autoComplete="current-password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <label className="block text-sm font-medium">New wallet PIN<input required type="password" inputMode="numeric" pattern="[0-9]{4,12}" minLength={4} maxLength={12} autoComplete="new-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <label className="block text-sm font-medium">Confirm wallet PIN<input required type="password" inputMode="numeric" pattern="[0-9]{4,12}" minLength={4} maxLength={12} autoComplete="new-password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={closePinModal} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button disabled={busy} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? "Saving…" : "Save PIN"}</button></div>
            </form>
          </div>}
        </main>
      </PermissionGate>
    </DashboardShell>
  );
}
