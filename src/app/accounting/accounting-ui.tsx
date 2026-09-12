"use client";

import { type FormEvent, type ReactNode, useRef, useState } from "react";
import Dialog from "@/components/dialog";
import FormSelect from "@/components/form-select";
import { ApiError } from "@/lib/api";

export type Account = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  active: boolean;
  is_system: boolean;
  allow_manual_posting: boolean;
  settlement_allowed: boolean;
};
export type Period = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: string;
};
export type Journal = {
  id: string;
  reference_type: string;
  reference_id: string;
  description: string;
  posted: boolean;
  approval_status: string;
  reversed_by_id: string | null;
  reversal_of_id: string | null;
  created_by_user_id: string | null;
  entry_date: string | null;
  created_at: string;
};
export const panel =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
export const button =
  "rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50";
export const primary =
  "rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
export const input =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900";
export const money = (value: string | number | null | undefined) =>
  value == null
    ? "Unavailable"
    : new Intl.NumberFormat("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value));
export function cents(value: string): bigint {
  if (!/^-?\d+(\.\d{0,2})?$/.test(value)) return BigInt(0);
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  return (
    (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))) *
    (value.startsWith("-") ? BigInt(-1) : BigInt(1))
  );
}
export function decimal(value: bigint) {
  const absolute = value < 0 ? -value : value;
  return (
    (value < 0 ? "-" : "") +
    String(absolute / BigInt(100)) +
    "." +
    String(absolute % BigInt(100)).padStart(2, "0")
  );
}
export function today() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
export function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Unable to complete this action. Please try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
export function Alert({ error }: { error: string }) {
  return error ? (
    <p
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
    >
      {error}
    </p>
  ) : null;
}
export function Field({
  name,
  label,
  type = "text",
  required = true,
  defaultValue,
  min,
  max,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  min?: string;
  max?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        className={input}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={type === "number" ? "0.01" : undefined}
      />
    </label>
  );
}
export function AccountSelect({
  accounts,
  name = "account_id",
  label = "Account",
}: {
  accounts: Account[];
  name?: string;
  label?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <FormSelect name={name} required className={input}>
        <option value="">Select account</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.code} · {a.name}
          </option>
        ))}
      </FormSelect>
    </label>
  );
}
export function FormDialog({
  title,
  description,
  close,
  submit,
  children,
  label = "Save",
}: {
  title: string;
  description?: string;
  close: () => void;
  submit: (form: FormData) => Promise<void>;
  children: ReactNode;
  label?: string;
}) {
  const action = useAction();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action.run(() => submit(form));
  }
  return (
    <Dialog title={title} onClose={close} busy={action.busy}>
      <form onSubmit={onSubmit} className="space-y-5 p-6">
        <header>
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          {description && (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {description}
            </p>
          )}
        </header>
        <Alert error={action.error} />
        <fieldset disabled={action.busy} className="space-y-4">
          {children}
        </fieldset>
        <footer className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            className={button}
            disabled={action.busy}
            onClick={close}
          >
            Cancel
          </button>
          <button className={primary} disabled={action.busy}>
            {action.busy ? "Saving…" : label}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
        (["approved", "paid", "reconciled"].includes(value)
          ? "bg-emerald-50 text-emerald-800"
          : ["pending", "draft", "open", "partially_paid"].includes(value)
            ? "bg-amber-50 text-amber-800"
            : "bg-slate-100 text-slate-700")
      }
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
