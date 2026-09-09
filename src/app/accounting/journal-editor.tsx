"use client";

import { useState } from "react";
import FormSelect from "@/components/form-select";
import { api } from "@/lib/api";
import {
  Account,
  Period,
  FormDialog,
  Field,
  input,
  button,
  cents,
  decimal,
  money,
  today,
} from "./accounting-ui";

export default function JournalEditor({
  accounts,
  periods,
  close,
  saved,
}: {
  accounts: Account[];
  periods: Period[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState([
    { key: 0, account_id: "", debit: "", credit: "" },
    { key: 1, account_id: "", debit: "", credit: "" },
  ]);
  const eligible = accounts.filter((a) => a.active && a.allow_manual_posting);
  const period = periods.find(
    (p) => p.status === "open" && p.starts_on <= date && p.ends_on >= date,
  );
  const debit = lines.reduce((sum, line) => sum + cents(line.debit), BigInt(0));
  const credit = lines.reduce(
    (sum, line) => sum + cents(line.credit),
    BigInt(0),
  );
  const update = (
    key: number,
    field: "account_id" | "debit" | "credit",
    value: string,
  ) =>
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, [field]: value } : line,
      ),
    );
  return (
    <FormDialog
      title="New manual journal"
      description="Enter a balanced adjustment. A different authorised user must review and approve it before it reaches the ledger. Use the source workflow for stock, tax, sales and supplier transactions."
      close={close}
      label="Submit for approval"
      submit={async (form) => {
        if (!period)
          throw new Error(
            "Create an open fiscal period covering the journal date first.",
          );
        if (debit <= 0 || debit !== credit)
          throw new Error(
            "Debits and credits must match and be greater than zero.",
          );
        if (
          lines.some(
            (l) =>
              !l.account_id ||
              cents(l.debit) > 0 === cents(l.credit) > 0 ||
              cents(l.debit) < 0 ||
              cents(l.credit) < 0,
          )
        )
          throw new Error(
            "Each line needs one account and either a positive debit or a positive credit.",
          );
        await api.post("/api/v1/accounting/journals", {
          reference_type: "manual",
          description: String(form.get("description")),
          entry_date: date,
          period_id: period.id,
          requires_approval: true,
          lines: lines.map(({ account_id, debit, credit }) => ({
            account_id,
            debit: debit || "0",
            credit: credit || "0",
          })),
        });
        close();
        await saved();
      }}
    >
      <Field
        name="description"
        label="Journal description / supporting reference"
      />
      <label className="block text-sm font-medium text-slate-700">
        Accounting date
        <input
          required
          className={input}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <p
        className={
          "rounded-xl p-3 text-sm " +
          (period ? "bg-teal-50 text-teal-900" : "bg-amber-50 text-amber-900")
        }
      >
        {period
          ? "Open period: " + period.name
          : "No open fiscal period covers this date."}
      </p>
      <div className="space-y-3">
        {lines.map((line, index) => (
          <fieldset
            key={line.key}
            className="rounded-xl border border-slate-200 p-3"
          >
            <legend className="px-1 text-xs font-semibold text-slate-600">
              Line {index + 1}
            </legend>
            <label className="block text-sm font-medium">
              Account
              <FormSelect
                required
                className={input}
                value={line.account_id}
                onChange={(e) => update(line.key, "account_id", e.target.value)}
              >
                <option value="">Select posting account</option>
                {eligible.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </FormSelect>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(["debit", "credit"] as const).map((side) => (
                <label key={side} className="text-sm font-medium capitalize">
                  {side}
                  <input
                    className={input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={line[side]}
                    onChange={(e) => update(line.key, side, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-rose-700 disabled:opacity-40"
              disabled={lines.length <= 2}
              onClick={() =>
                setLines((current) => current.filter((l) => l.key !== line.key))
              }
            >
              Remove line {index + 1}
            </button>
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        className={button}
        onClick={() =>
          setLines((current) => [
            ...current,
            {
              key: Math.max(...current.map((l) => l.key)) + 1,
              account_id: "",
              debit: "",
              credit: "",
            },
          ])
        }
      >
        Add journal line
      </button>
      <dl
        aria-live="polite"
        className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-sm"
      >
        <div>
          <dt>Debits</dt>
          <dd className="mt-1 font-bold tabular-nums">
            {money(decimal(debit))}
          </dd>
        </div>
        <div>
          <dt>Credits</dt>
          <dd className="mt-1 font-bold tabular-nums">
            {money(decimal(credit))}
          </dd>
        </div>
        <div>
          <dt>Difference</dt>
          <dd
            className={
              "mt-1 font-bold tabular-nums " +
              (debit === credit && debit > 0
                ? "text-emerald-700"
                : "text-rose-700")
            }
          >
            {money(decimal(debit - credit))}
          </dd>
        </div>
      </dl>
    </FormDialog>
  );
}
