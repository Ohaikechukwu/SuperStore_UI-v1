"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, Printer, ReceiptText, RotateCcw, Search, ShieldCheck, Trash2, X } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import AppSelect from "@/components/app-select";
import PermissionGate from "@/components/permission-gate";
import VoidReceiptModal from "@/components/void-receipt-modal";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast-provider";

type ReturnLine = {
  product_id: string; name: string; stock_code: string; unit: string;
  quantity_sold: string; quantity_returned: string; quantity_available: string; unit_price: string;
};
type Sale = {
  id: string; receipt_number: string; branch_id: string; status: string;
  total: string; returned_total: string; customer_name: string; lines: ReturnLine[];
};
type CashSession = {
  cash_session_id: string; session_number: string; opening_cash: string;
  cash_point_id: string | null; cash_point_number: number | null;
};
type ReturnSearchMatch = {
  id: string; receipt_number: string; branch_id: string; customer_name: string;
  customer_number: string | null; total: string; status: string; created_at: string;
};
type ReturnReceipt = {
  id: string; return_number: string; original_receipt_number: string; branch_id: string;
  status: string; can_void: boolean; reason: string; refund_method: string; item_condition: string; cash_session_number: string | null;
  refunded_by_name: string; customer_name: string; total: string; created_at: string;
  lines: Array<{ product_id: string; name: string; stock_code: string; unit: string; quantity: string; unit_price: string; line_total: string }>;
};

const fractionalUnits = new Set(["g", "gram", "grams", "kg", "kilogram", "kilograms", "l", "litre", "litres", "liter", "liters", "ml", "millilitre", "millilitres", "milliliter", "milliliters", "m", "metre", "metres", "meter", "meters"]);
const allowsFraction = (unit: string) => fractionalUnits.has(unit.trim().toLowerCase());
const money = (value: string | number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(value) || 0);
const label = (value: string) => value.replaceAll("_", " ");

export default function ReturnsPage() {
  const toast = useToast();
  const [receiptNumber, setReceiptNumber] = useState("");
  const [matches, setMatches] = useState<ReturnSearchMatch[]>([]);
  const [showMatches, setShowMatches] = useState(false);
  const [sale, setSale] = useState<Sale | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [cashSessionId, setCashSessionId] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [condition, setCondition] = useState("resellable");
  const [reason, setReason] = useState("");
  const [recentReturns, setRecentReturns] = useState<ReturnReceipt[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<ReturnReceipt | null>(null);
  const [returnToVoid, setReturnToVoid] = useState<ReturnReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const returnTotal = useMemo(() => sale?.lines.reduce((total, line) => total + Number(quantities[line.product_id] || 0) * Number(line.unit_price), 0) || 0, [sale, quantities]);

  async function loadRecentReturns() {
    try { setRecentReturns(await api.get<ReturnReceipt[]>("/api/v1/pos/returns?limit=25")); }
    catch { setRecentReturns([]); }
  }

  useEffect(() => { void loadRecentReturns(); }, []);

  useEffect(() => {
    const term = receiptNumber.trim();
    if (!showMatches || term.length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void api.get<ReturnSearchMatch[]>(`/api/v1/pos/sales/return-search?query=${encodeURIComponent(term)}`)
        .then((items) => { if (active) setMatches(items); })
        .catch(() => { if (active) setMatches([]); });
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [receiptNumber, showMatches]);

  async function lookupReceipt(value: string) {
    if (!value.trim()) return;
    setBusy(true); setError(""); setNotice(""); setShowMatches(false);
    try {
      const found = await api.get<Sale>(`/api/v1/pos/sales/lookup?receipt_number=${encodeURIComponent(value.trim())}`);
      setSale(found); setQuantities({}); setCashSessionId("");
      setSessions(await api.get<CashSession[]>(`/api/v1/pos/sessions/open?branch_id=${found.branch_id}`));
      setMatches([]);
    } catch (caught) {
      setSale(null); setSessions([]);
      setError(caught instanceof ApiError ? caught.message : "Unable to find this receipt.");
    } finally { setBusy(false); }
  }

  async function lookup(event: FormEvent) {
    event.preventDefault();
    await lookupReceipt(receiptNumber);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sale) return;
    const lines = sale.lines
      .filter((line) => Number(quantities[line.product_id] || 0) > 0)
      .map((line) => ({ product_id: line.product_id, quantity: quantities[line.product_id] }));
    if (!lines.length) { setError("Enter a return quantity for at least one item."); return; }
    if (refundMethod === "cash" && !cashSessionId) { setError("Select an open cash session before completing a cash refund."); return; }
    setBusy(true); setError("");
    try {
      const result = await api.post<{ total: string; sale_return_id: string }>(`/api/v1/pos/sales/${sale.id}/refund`, {
        lines, reason, refund_method: refundMethod, item_condition: condition, cash_session_id: cashSessionId || null,
      });
      const posted = await api.get<ReturnReceipt>(`/api/v1/pos/returns/${result.sale_return_id}`);
      const stockNote = condition === "resellable" ? "The items were returned to stock." : "The items were kept out of sellable stock.";
      setNotice(`Return ${posted.return_number} posted for ${money(result.total)}. ${stockNote}`);
      setSelectedReceipt(posted);
      setRecentReturns((current) => [posted, ...current.filter((item) => item.id !== posted.id)]);
      toast.success("Return posted", stockNote);
      setSale(null); setReceiptNumber(""); setQuantities({}); setReason(""); setCashSessionId("");
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to post this return."); }
    finally { setBusy(false); }
  }

  async function openReceipt(returnId: string) {
    try { setSelectedReceipt(await api.get<ReturnReceipt>(`/api/v1/pos/returns/${returnId}`)); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to open this return receipt."); }
  }

  async function voidReceipt(receipt: ReturnReceipt, voidReason: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await api.delete(`/api/v1/pos/returns/${receipt.id}`, { reason: voidReason.trim() });
      setSelectedReceipt((current) => current?.id === receipt.id ? { ...current, status: "voided", can_void: false } : current);
      setNotice(`Return receipt ${receipt.return_number} was voided and its effects were reversed.`);
      toast.success("Return receipt voided", "The receipt remains available in the audit history.");
      await loadRecentReturns();
    } catch (caught) { throw new Error(caught instanceof ApiError ? caught.message : "Unable to void this return receipt."); }
    finally { setBusy(false); }
  }

  return <DashboardShell title="Sales returns" subtitle="Traceable refunds, stock decisions, and till reconciliation">
    <PermissionGate permission="sales.refund"><div className="mx-auto max-w-[1120px] space-y-6">
      <header><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Controlled return desk</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Return a sale</h1><p className="mt-2 text-sm text-slate-500">Only users granted <span className="font-mono font-semibold">sales.refund</span> can complete a return.</p></header>
      {error && <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      <form onSubmit={(event) => void lookup(event)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Original receipt number or customer</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-3 text-slate-400" /><input value={receiptNumber} onFocus={() => setShowMatches(true)} onChange={(event) => { setReceiptNumber(event.target.value.toUpperCase()); setMatches([]); setShowMatches(true); }} placeholder="Start typing a receipt, name, or phone" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 font-mono text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" />{showMatches && receiptNumber.trim().length >= 2 && matches.length > 0 && <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">{matches.map((match) => <button key={match.id} type="button" onClick={() => { setReceiptNumber(match.receipt_number); setShowMatches(false); void lookupReceipt(match.receipt_number); }} className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left hover:bg-teal-50"><span><span className="block font-mono text-xs font-bold text-teal-700">{match.receipt_number}</span><span className="mt-1 block text-xs text-slate-500">{match.customer_name}{match.customer_number ? ` · ${match.customer_number}` : ""}</span></span><span className="text-right"><span className="block text-sm font-bold">{money(match.total)}</span><span className="mt-1 block text-[11px] capitalize text-slate-400">{label(match.status)} · {new Date(match.created_at).toLocaleDateString()}</span></span></button>)}</div>}</div><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"><ReceiptText size={17} /> Find receipt</button></div><p className="mt-2 text-xs text-slate-500">Matching receipts appear as you type. Choose one to open it.</p></form>

      {sale && <form onSubmit={submit} className="space-y-6"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-xs font-bold text-teal-700">{sale.receipt_number}</p><h2 className="mt-1 text-xl font-bold">{sale.customer_name}</h2><p className="mt-1 text-sm text-slate-500">Original sale {money(sale.total)} · Previously returned {money(sale.returned_total)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${sale.status === "refunded" || sale.status === "voided" ? "bg-rose-50 text-rose-700" : "bg-teal-50 text-teal-700"}`}>{label(sale.status)}</span></div><div className="mt-6 overflow-x-auto"><table className="min-w-[720px] w-full text-left text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Sold</th><th className="px-4 py-3">Already returned</th><th className="px-4 py-3">Eligible</th><th className="px-4 py-3">Return now</th><th className="px-4 py-3 text-right">Value</th></tr></thead><tbody className="divide-y divide-slate-100">{sale.lines.map((line) => { const fractional = allowsFraction(line.unit); return <tr key={line.product_id}><td className="px-4 py-3"><p className="font-bold">{line.name}</p><p className="mt-0.5 font-mono text-xs text-slate-400">{line.stock_code} · {line.unit}</p></td><td className="px-4 py-3">{line.quantity_sold}</td><td className="px-4 py-3">{line.quantity_returned}</td><td className="px-4 py-3 font-bold text-teal-700">{line.quantity_available}</td><td className="px-4 py-3"><input disabled={sale.status === "refunded" || sale.status === "voided" || Number(line.quantity_available) <= 0} value={quantities[line.product_id] || ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.product_id]: event.target.value }))} type="number" min={fractional ? "0.001" : "1"} max={line.quantity_available} step={fractional ? "0.001" : "1"} aria-label={`Return quantity for ${line.name}`} className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600" /></td><td className="px-4 py-3 text-right font-bold">{money(Number(quantities[line.product_id] || 0) * Number(line.unit_price))}</td></tr>; })}</tbody></table></div><p className="mt-3 text-xs text-slate-500">Counted items must be returned in whole units. Decimal quantities are available only for products measured by weight, volume, or length.</p></section>
        <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wide text-teal-600">Refund handling</p><h2 className="mt-1 text-xl font-bold">Where does the item go?</h2><div className="mt-5 space-y-4"><AppSelect value={condition} onChange={setCondition} options={[{ value: "resellable", label: "Resellable — return to stock" }, { value: "damaged", label: "Damaged — do not return to stock" }, { value: "expired", label: "Expired — do not return to stock" }]} /><p className="rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><AlertTriangle className="mr-1 inline text-amber-600" size={15} /> {condition === "resellable" ? "Only choose this after staff inspect the item. It will increase stock in the original branch." : "Non-resellable customer returns stay out of sellable inventory. Use Inventory write-offs for stock already held in the store that has expired or been damaged."}</p></div></div><div><p className="text-xs font-bold uppercase tracking-wide text-teal-600">Money and evidence</p><h2 className="mt-1 text-xl font-bold">Complete the refund</h2><div className="mt-5 space-y-4"><AppSelect value={refundMethod} onChange={(value) => { setRefundMethod(value); if (value !== "cash") setCashSessionId(""); }} options={[{ value: "cash", label: "Cash refund" }, { value: "card", label: "Card reversal" }, { value: "bank_transfer", label: "Bank transfer" }, { value: "credit_note", label: "Store credit note" }]} />{refundMethod === "cash" && <AppSelect value={cashSessionId} onChange={setCashSessionId} options={[{ value: "", label: sessions.length ? "Select your open cash point" : "No open cash point" }, ...sessions.map((item) => ({ value: item.cash_session_id, label: item.cash_point_number ? `Cash point ${item.cash_point_number} · ${item.session_number}` : item.session_number }))]} />}<textarea required minLength={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for return" className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" /></div></div></section>
        <div className="flex flex-col gap-3 rounded-3xl bg-slate-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-teal-300">Refund total</p><p className="mt-1 text-2xl font-bold">{money(returnTotal)}</p></div><button disabled={busy || sale.status === "refunded" || sale.status === "voided" || returnTotal <= 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-sm font-bold text-white hover:bg-teal-400 disabled:opacity-40"><RotateCcw size={17} /> Post return</button></div>
      </form>}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-teal-600">Return receipt history</p><h2 className="mt-1 text-xl font-bold">Recent returns</h2><p className="mt-1 text-sm text-slate-500">Open any return to review or print its receipt. Only admins can void one.</p></div><button onClick={() => void loadRecentReturns()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-teal-300 hover:text-teal-700">Refresh</button></div><div className="mt-5 overflow-x-auto"><table className="min-w-[840px] w-full text-left text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2.5">Return receipt</th><th className="px-3 py-2.5">Original receipt</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Method / condition</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5 text-right">Total</th><th className="px-3 py-2.5"></th></tr></thead><tbody className="divide-y divide-slate-100">{recentReturns.map((item) => <tr key={item.id}><td className="px-3 py-3 font-mono text-xs font-bold text-teal-700">{item.return_number}</td><td className="px-3 py-3 font-mono text-xs text-slate-600">{item.original_receipt_number}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${item.status === "voided" ? "bg-rose-50 text-rose-700" : "bg-teal-50 text-teal-700"}`}>{label(item.status)}</span></td><td className="px-3 py-3 capitalize text-slate-600">{label(item.refund_method)} · {item.item_condition}</td><td className="px-3 py-3 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</td><td className="px-3 py-3 text-right font-bold">{money(item.total)}</td><td className="px-3 py-3 text-right"><div className="flex justify-end gap-2"><button onClick={() => void openReceipt(item.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-teal-300 hover:text-teal-700"><Eye size={14} /> View</button>{item.can_void && <button onClick={() => setReturnToVoid(item)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 size={14} /> Void</button>}</div></td></tr>)}</tbody></table>{!recentReturns.length && <p className="py-8 text-center text-sm text-slate-500">No return receipts have been posted yet.</p>}</div></section>
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><ShieldCheck className="shrink-0 text-teal-600" size={19} /> Every return creates return lines, stock movement where applicable, a revenue reversal journal, cash-session impact for cash refunds, and an audit event.</div>
      {selectedReceipt && <ReturnReceiptModal receipt={selectedReceipt} close={() => setSelectedReceipt(null)} requestVoid={setReturnToVoid} />}
      {returnToVoid && <VoidReceiptModal receiptNumber={returnToVoid.return_number} receiptType="return" close={() => setReturnToVoid(null)} confirm={(reason) => voidReceipt(returnToVoid, reason)} />}
    </div></PermissionGate>
  </DashboardShell>;
}

function ReturnReceiptModal({ receipt, close, requestVoid }: { receipt: ReturnReceipt; close: () => void; requestVoid: (receipt: ReturnReceipt) => void }) {
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4"><section className="mx-auto my-8 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Return receipt</p><h2 className="mt-2 font-mono text-2xl font-bold">{receipt.return_number}</h2><p className="mt-1 text-sm text-slate-500">Original sale: {receipt.original_receipt_number}</p></div><button type="button" onClick={close} aria-label="Close return receipt" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={19} /></button></div><div className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><p><span className="text-slate-500">Customer</span><br /><strong>{receipt.customer_name}</strong></p><p><span className="text-slate-500">Refunded by</span><br /><strong>{receipt.refunded_by_name}</strong></p><p><span className="text-slate-500">Status</span><br /><strong className="capitalize">{label(receipt.status)}</strong></p><p><span className="text-slate-500">Method</span><br /><strong className="capitalize">{label(receipt.refund_method)}</strong>{receipt.cash_session_number && ` · ${receipt.cash_session_number}`}</p><p><span className="text-slate-500">Item condition</span><br /><strong className="capitalize">{receipt.item_condition}</strong></p><p className="sm:col-span-2"><span className="text-slate-500">Reason</span><br /><strong>{receipt.reason}</strong></p></div><div className="mt-6 overflow-x-auto"><table className="min-w-[600px] w-full text-left text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5">Quantity</th><th className="px-3 py-2.5">Unit price</th><th className="px-3 py-2.5 text-right">Refund</th></tr></thead><tbody className="divide-y divide-slate-100">{receipt.lines.map((line) => <tr key={line.product_id}><td className="px-3 py-3"><p className="font-bold">{line.name}</p><p className="font-mono text-xs text-slate-400">{line.stock_code} · {line.unit}</p></td><td className="px-3 py-3 font-bold">{line.quantity}</td><td className="px-3 py-3">{money(line.unit_price)}</td><td className="px-3 py-3 text-right font-bold">{money(line.line_total)}</td></tr>)}</tbody></table></div><div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs text-slate-500">Posted {new Date(receipt.created_at).toLocaleString()}</p><p className="mt-1 text-2xl font-bold">{money(receipt.total)}</p></div><div className="flex flex-wrap gap-2">{receipt.can_void && <button type="button" onClick={() => requestVoid(receipt)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50"><Trash2 size={16} /> Void receipt</button>}<button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-teal-300 hover:text-teal-700"><Printer size={16} /> Print</button><button type="button" onClick={close} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Done</button></div></div></section></div>;
}
