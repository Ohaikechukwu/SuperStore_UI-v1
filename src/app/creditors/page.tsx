"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, HandCoins, RefreshCw, Users } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import FormSelect from "@/components/form-select";
import { useToast } from "@/components/toast-provider";
import { api, ApiError } from "@/lib/api";

type CreditDocument = {
  receivable_id: string;
  reference: string;
  date: string;
  amount: string;
  received_amount: string;
  outstanding: string;
};

type CreditAccount = {
  customer_id: string;
  customer_name: string;
  is_walkin: boolean;
  total_owed: string;
  oldest_date: string;
  documents: CreditDocument[];
};

type PaymentMethod = "cash" | "card" | "bank_transfer" | "mobile_money";

const money = (value: string | number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(value) || 0);

function commandId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `web-${Date.now()}`;
}

export default function CreditorsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [settleDoc, setSettleDoc] = useState<{ doc: CreditDocument; creditor: CreditAccount } | null>(null);
  const [fullDoc, setFullDoc] = useState<{ doc: CreditDocument; creditor: CreditAccount } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setAccounts(await api.get<CreditAccount[]>("/api/v1/pos/credit/accounts"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load creditors.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function settle(doc: CreditDocument, amount: string | null, method: PaymentMethod) {
    if (!settleDoc && !fullDoc) return;
    setBusy(true);
    try {
      const result = await api.post<{ status: string; outstanding: string }>(
        "/api/v1/pos/credit/settle",
        {
          receivable_id: doc.receivable_id,
          amount,
          method,
          reference: `TILL-${commandId()}`,
        },
      );
      toast.success(
        "Payment recorded",
        result.status === "paid"
          ? `${doc.reference} is fully settled.`
          : `${money(result.outstanding)} still outstanding on ${doc.reference}.`,
      );
      setSettleDoc(null);
      setFullDoc(null);
      await load();
    } catch (caught) {
      toast.error("Unable to record payment",
        caught instanceof ApiError ? caught.message : "Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell title="Creditors" subtitle="Customer credit from the till — who owes, since when, and collecting repayments">
      <PermissionGate permission="sales.create">
        <div className="mx-auto max-w-[1100px] space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">
              Outstanding credit
            </p>
            <button onClick={() => void load()} disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600">
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
          {error && <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          {busy && !accounts.length && <p className="py-8 text-sm text-slate-500">Loading creditors…</p>}
          {!busy && !accounts.length && !error && (
            <p className="rounded-2xl bg-emerald-50 px-4 py-8 text-center text-sm text-emerald-800">
              Nobody owes anything — every credit sale is settled.
            </p>
          )}
          {accounts.map((account) => (
            <section key={account.customer_id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  onClick={() => setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(account.customer_id)) next.delete(account.customer_id);
                    else next.add(account.customer_id);
                    return next;
                  })}
                  className="flex items-center gap-2 text-left"
                >
                  {expanded.has(account.customer_id) ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                  <span className={`flex items-center gap-2 font-bold ${account.is_walkin ? "text-slate-500" : "text-slate-900"}`}>
                    <Users size={17} className={account.is_walkin ? "text-slate-400" : "text-teal-600"} />
                    {account.customer_name}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                    {account.documents.length} credit sale{account.documents.length === 1 ? "" : "s"}
                  </span>
                </button>
                <div className="text-right">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Owes</p>
                  <p className="text-xl font-bold text-rose-700">{money(account.total_owed)}</p>
                  <p className="text-xs text-slate-400">since {account.oldest_date}</p>
                </div>
              </div>
              {expanded.has(account.customer_id) && (
                <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                  {account.documents.map((doc) => (
                    <div key={doc.receivable_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-slate-500">{doc.reference}</p>
                        <p className="text-xs text-slate-400">
                          {doc.date} · {money(doc.amount)} total
                          {Number(doc.received_amount) > 0 && ` · ${money(doc.received_amount)} paid`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="mr-2 text-sm font-bold text-slate-800">{money(doc.outstanding)}</span>
                        <button
                          onClick={() => setSettleDoc({ doc, creditor: account })}
                          className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100"
                        >
                          Paid part
                        </button>
                        <button
                          onClick={() => setFullDoc({ doc, creditor: account })}
                          className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700"
                        >
                          Paid full
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </PermissionGate>
      {(settleDoc || fullDoc) && (
        <SettleDialog
          doc={(settleDoc || fullDoc)!.doc}
          full={Boolean(fullDoc)}
          busy={busy}
          close={() => { setSettleDoc(null); setFullDoc(null); }}
          confirm={(amount, method) => void settle((settleDoc || fullDoc)!.doc, amount, method)}
        />
      )}
    </DashboardShell>
  );
}

function SettleDialog({ doc, full, busy, close, confirm }: {
  doc: CreditDocument;
  full: boolean;
  busy: boolean;
  close: () => void;
  confirm: (amount: string | null, method: PaymentMethod) => void;
}) {
  const [amount, setAmount] = useState(full ? doc.outstanding : "");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= Number(doc.outstanding) + 0.005;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-teal-600">
              {full ? "Paid full" : "Paid part"}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{money(doc.outstanding)} outstanding</h2>
            <p className="mt-1 font-mono text-xs text-slate-400">{doc.reference}</p>
          </div>
          <button onClick={close} disabled={busy} aria-label="Close" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <HandCoins size={18} />
          </button>
        </div>
        <label className="mt-5 block text-xs font-bold text-slate-600">
          Amount received
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={busy || full}
            type="number" min="0.01" step="0.01" max={doc.outstanding}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-teal-600"
          />
        </label>
        <label className="mt-4 block text-xs font-bold text-slate-600">
          Paid into
          <FormSelect value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)} disabled={busy}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">
            <option value="cash">Cash drawer</option>
            <option value="card">Card settlement</option>
            <option value="bank_transfer">Bank account</option>
            <option value="mobile_money">Mobile money</option>
          </FormSelect>
        </label>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          The payment posts straight to the ledger (Dr {method === "cash" ? "cash" : method === "card" ? "card clearing" : method === "bank_transfer" ? "bank" : "mobile money"} / Cr accounts receivable). A part payment keeps this creditor listed for the rest.
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={close} disabled={busy} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600">
            Cancel
          </button>
          <button
            onClick={() => confirm(full ? null : String(parsed), method)}
            disabled={busy || !valid}
            className="flex-1 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-40"
          >
            {busy ? "Recording…" : `Record ${full ? "full " : ""}payment`}
          </button>
        </div>
      </div>
    </div>
  );
}
