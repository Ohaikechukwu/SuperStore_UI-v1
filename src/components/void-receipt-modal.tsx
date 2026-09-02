"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

type VoidReceiptModalProps = {
  receiptNumber: string;
  receiptType: "sale" | "return";
  close: () => void;
  confirm: (reason: string) => Promise<void>;
};

export default function VoidReceiptModal({ receiptNumber, receiptType, close, confirm }: VoidReceiptModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 2) {
      setError("Enter a reason of at least two characters.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await confirm(reason.trim());
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to void this receipt.");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4">
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="void-receipt-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-rose-600">Administrator action</p><h2 id="void-receipt-title" className="mt-2 text-xl font-bold text-slate-900">Void {receiptType} receipt</h2></div>
        <button type="button" disabled={submitting} onClick={close} aria-label="Close void receipt dialog" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X size={18} /></button>
      </div>
      <p className="mt-3 font-mono text-xs font-bold text-teal-700">{receiptNumber}</p>
      <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm leading-6 text-rose-900"><AlertTriangle className="mr-1 inline text-rose-600" size={16} /> This reverses the receipt&apos;s active stock and accounting effect. The receipt remains in the audit history as voided.</div>
      <label className="mt-5 block text-xs font-bold text-slate-700">Reason for voiding<textarea autoFocus required minLength={2} maxLength={240} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Example: Duplicate receipt entered by mistake" className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100" /></label>
      {error && <p role="alert" className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={submitting} onClick={close} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Cancel</button><button disabled={submitting || reason.trim().length < 2} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-40">{submitting ? "Voiding…" : "Void receipt"}</button></div>
    </form>
  </div>;
}
