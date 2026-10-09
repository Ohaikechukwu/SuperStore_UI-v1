"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  ChevronDown,
  ChevronRight,
  Clock,
  HandCoins,
  History,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import FormSelect from "@/components/form-select";
import { useToast } from "@/components/toast-provider";
import { api, ApiError } from "@/lib/api";

type CreditPayment = {
  date: string;
  amount: string;
  method: string;
  reference: string;
  recorded_by: string | null;
};

type CreditDocument = {
  receivable_id: string;
  reference: string;
  date: string;
  amount: string;
  received_amount: string;
  outstanding: string;
  status: "open" | "partially_paid" | string;
  age_days: number;
  payments: CreditPayment[];
  last_payment: string | null;
};

type CreditAccount = {
  customer_id: string;
  customer_name: string;
  is_walkin: boolean;
  total_owed: string;
  oldest_date: string;
  lifetime_credited: string;
  lifetime_repaid: string;
  last_payment: string | null;
  documents: CreditDocument[];
};

type CreditTotals = {
  outstanding: string;
  credited: string;
  repaid: string;
  creditors: number;
  documents: number;
};

type RecentPayment = {
  receivable_id: string;
  settled_on: string;
  customer_id: string;
  customer_name: string;
  document_reference: string;
  amount: string;
  method: string;
  reference: string;
  recorded_by: string | null;
  document_status: string;
};

type CreditOverview = {
  totals: CreditTotals;
  accounts: CreditAccount[];
  recent_payments: RecentPayment[];
};

type PaymentMethod = "cash" | "card" | "bank_transfer" | "mobile_money";

const money = (value: string | number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(value) || 0);

const shortDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  open: { label: "Unpaid", className: "bg-rose-50 text-rose-700" },
  partially_paid: { label: "Part paid", className: "bg-amber-50 text-amber-700" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700" },
};

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGES[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.className}`}>{badge.label}</span>;
}

function ageClass(days: number) {
  if (days >= 60) return "text-rose-700";
  if (days >= 30) return "text-amber-700";
  return "text-slate-500";
}

function commandId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `web-${Date.now()}`;
}

export default function CreditorsPage() {
  const toast = useToast();
  const [overview, setOverview] = useState<CreditOverview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openPayments, setOpenPayments] = useState<Set<string>>(new Set());
  const [settleDoc, setSettleDoc] = useState<{ doc: CreditDocument; creditor: CreditAccount } | null>(null);
  const [fullDoc, setFullDoc] = useState<{ doc: CreditDocument; creditor: CreditAccount } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setOverview(await api.get<CreditOverview>("/api/v1/pos/credit/accounts"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load creditors.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Initial fetch: busy starts true, so no synchronous state churn in the effect.
  useEffect(() => {
    let cancelled = false;
    api.get<CreditOverview>("/api/v1/pos/credit/accounts")
      .then((data) => { if (!cancelled) setOverview(data); })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : "Unable to load creditors.");
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);

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

  const accounts = overview?.accounts ?? [];
  const totals = overview?.totals;
  const recentPayments = overview?.recent_payments ?? [];
  const filtered = accounts.filter((account) =>
    account.customer_name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <DashboardShell title="Creditors" subtitle="Customer credit from the till — who owes, since when, repayment history, and collecting what's due">
      <PermissionGate permission="sales.create">
        <div className="mx-auto max-w-[1100px] space-y-5">
          {totals && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-3xl border border-rose-100 bg-rose-50/60 p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-rose-600">
                  <HandCoins size={15} /> Total owed
                </div>
                <p className="mt-2 text-2xl font-bold text-rose-700">{money(totals.outstanding)}</p>
                <p className="mt-1 text-xs text-rose-500">
                  across {totals.creditors} creditor{totals.creditors === 1 ? "" : "s"} · {totals.documents} unpaid document{totals.documents === 1 ? "" : "s"}
                </p>
              </div>
              <div className="rounded-3xl border border-teal-100 bg-teal-50/60 p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-teal-600">
                  <TrendingUp size={15} /> Credit given
                </div>
                <p className="mt-2 text-2xl font-bold text-teal-700">{money(totals.credited)}</p>
                <p className="mt-1 text-xs text-teal-600">all credit sales, including settled ones</p>
              </div>
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-emerald-600">
                  <BadgeCheck size={15} /> Total repaid
                </div>
                <p className="mt-2 text-2xl font-bold text-emerald-700">{money(totals.repaid)}</p>
                <p className="mt-1 text-xs text-emerald-600">collected from all creditors so far</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-slate-500">
                  <Users size={15} /> Collection rate
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {Number(totals.credited) > 0
                    ? `${Math.round((Number(totals.repaid) / Number(totals.credited)) * 100)}%`
                    : "—"}
                </p>
                <p className="mt-1 text-xs text-slate-400">repaid ÷ credit given</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="relative flex-1 sm:max-w-xs">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search creditors…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-600"
              />
            </label>
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

          {search.trim() && !busy && (
            <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
              {filtered.length} of {accounts.length} creditor{accounts.length === 1 ? "" : "s"} match “{search.trim()}”
            </p>
          )}

          {filtered.map((account) => (
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
                  <p className="text-xs text-slate-400">oldest debt {shortDate(account.oldest_date)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                <span>Credited to date: <strong className="text-slate-700">{money(account.lifetime_credited)}</strong></span>
                <span>Repaid to date: <strong className="text-emerald-700">{money(account.lifetime_repaid)}</strong></span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} className="text-slate-400" />
                  Last payment: {shortDate(account.last_payment)}
                </span>
              </div>
              {expanded.has(account.customer_id) && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="p-3">Document</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Age</th>
                        <th className="p-3 text-right">Total</th>
                        <th className="p-3 text-right">Paid</th>
                        <th className="p-3 text-right">Outstanding</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {account.documents.map((doc) => (
                        <DocumentRow
                          key={doc.receivable_id}
                          doc={doc}
                          paymentsOpen={openPayments.has(doc.receivable_id)}
                          togglePayments={() => setOpenPayments((current) => {
                            const next = new Set(current);
                            if (next.has(doc.receivable_id)) next.delete(doc.receivable_id);
                            else next.add(doc.receivable_id);
                            return next;
                          })}
                          onPart={() => setSettleDoc({ doc, creditor: account })}
                          onFull={() => setFullDoc({ doc, creditor: account })}
                        />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50/70 text-sm font-bold text-slate-700">
                        <td className="p-3" colSpan={3}>Total · {account.documents.length} document{account.documents.length === 1 ? "" : "s"}</td>
                        <td className="p-3 text-right">{money(account.documents.reduce((sum, doc) => sum + Number(doc.amount), 0))}</td>
                        <td className="p-3 text-right text-emerald-700">{money(account.documents.reduce((sum, doc) => sum + Number(doc.received_amount), 0))}</td>
                        <td className="p-3 text-right text-rose-700">{money(account.total_owed)}</td>
                        <td className="p-3" colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          ))}

          {recentPayments.length > 0 && (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <History size={18} className="text-teal-600" />
                <h2 className="text-sm font-bold uppercase tracking-[.16em] text-slate-500">Repayment history</h2>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Every till repayment recorded against a credit sale — most recent first.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Document</th>
                      <th className="p-3">Method</th>
                      <th className="p-3">Receipt</th>
                      <th className="p-3">Recorded by</th>
                      <th className="p-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentPayments.map((payment) => (
                      <tr key={`${payment.receivable_id}-${payment.reference}`} className="hover:bg-slate-50/60">
                        <td className="p-3 text-slate-600">{shortDate(payment.settled_on)}</td>
                        <td className="p-3 font-semibold text-slate-800">{payment.customer_name}</td>
                        <td className="p-3 font-mono text-xs text-slate-500">{payment.document_reference}</td>
                        <td className="p-3 text-slate-600">{payment.method}</td>
                        <td className="p-3 font-mono text-xs text-slate-500">{payment.reference}</td>
                        <td className="p-3 text-slate-600">{payment.recorded_by ?? "—"}</td>
                        <td className="p-3 text-right font-bold text-emerald-700">+{money(payment.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {recentPayments.length >= 100 && (
                <p className="mt-2 text-xs text-slate-400">Showing the most recent 100 repayments.</p>
              )}
            </section>
          )}
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

function DocumentRow({ doc, paymentsOpen, togglePayments, onPart, onFull }: {
  doc: CreditDocument;
  paymentsOpen: boolean;
  togglePayments: () => void;
  onPart: () => void;
  onFull: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-slate-50/60">
        <td className="p-3">
          <p className="font-mono text-xs text-slate-600">{doc.reference}</p>
          {doc.payments.length > 0 && (
            <button onClick={togglePayments}
              className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-800">
              {paymentsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {doc.payments.length} repayment{doc.payments.length === 1 ? "" : "s"}
            </button>
          )}
        </td>
        <td className="p-3 text-slate-600">{shortDate(doc.date)}</td>
        <td className={`p-3 font-bold ${ageClass(doc.age_days)}`}>
          {doc.age_days} day{doc.age_days === 1 ? "" : "s"}
        </td>
        <td className="p-3 text-right text-slate-700">{money(doc.amount)}</td>
        <td className="p-3 text-right text-emerald-700">{Number(doc.received_amount) > 0 ? money(doc.received_amount) : "—"}</td>
        <td className="p-3 text-right font-bold text-rose-700">{money(doc.outstanding)}</td>
        <td className="p-3"><StatusBadge status={doc.status} /></td>
        <td className="p-3">
          <div className="flex items-center justify-end gap-2">
            <button onClick={onPart}
              className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100">
              Paid part
            </button>
            <button onClick={onFull}
              className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700">
              Paid full
            </button>
          </div>
        </td>
      </tr>
      {paymentsOpen && doc.payments.length > 0 && (
        <tr className="bg-teal-50/40">
          <td className="p-0" colSpan={8}>
            <div className="px-6 py-3">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-1.5 pr-3">Paid on</th>
                    <th className="py-1.5 pr-3">Method</th>
                    <th className="py-1.5 pr-3">Receipt</th>
                    <th className="py-1.5 pr-3">Recorded by</th>
                    <th className="py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-100/70">
                  {doc.payments.map((payment) => (
                    <tr key={payment.reference}>
                      <td className="py-1.5 pr-3 text-slate-600">{shortDate(payment.date)}</td>
                      <td className="py-1.5 pr-3">
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <Banknote size={12} className="text-slate-400" /> {payment.method}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-slate-500">{payment.reference}</td>
                      <td className="py-1.5 pr-3 text-slate-500">{payment.recorded_by ?? "—"}</td>
                      <td className="py-1.5 text-right font-bold text-emerald-700">+{money(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
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
