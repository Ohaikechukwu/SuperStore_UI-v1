"use client";

import { useEffect, useState } from "react";
import FormSelect from "@/components/form-select";
import { api } from "@/lib/api";
import {
  isRecord,
  isAmount,
  accountingCompatibilityMessage,
  accountingRequestError,
} from "./response-contract";
import {
  Account,
  Alert,
  button,
  primary,
  panel,
  input,
  money,
  cents,
  decimal,
  today,
  useAction,
} from "./accounting-ui";

type Balance = {
  account_id: string;
  code: string;
  name: string;
  balance: string;
  debit: string;
  credit: string;
};
type Ledger = {
  line_id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  entry_date: string;
  date_basis: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
};
type Statements = {
  profit_and_loss: {
    income: Balance[];
    expenses: Balance[];
    total_income: string;
    total_expenses: string;
    net_profit: string;
  };
  balance_sheet: {
    assets: Balance[];
    liabilities: Balance[];
    equity: Balance[];
    total_assets: string;
    total_liabilities: string;
    total_equity: string;
    unclosed_earnings: string;
    difference: string;
    balanced: boolean;
  };
  cash_movement: {
    opening: string;
    net_change: string;
    closing: string;
    basis: string;
  };
};
type LedgerResponse = {
  items: Ledger[];
  opening_balances: Record<string, string>;
};
type TrialResponse = { items: Balance[] };
function isStatementRow(value: unknown) {
  return (
    isRecord(value) &&
    ["account_id", "code", "name"].every(
      (key) => typeof value[key] === "string",
    ) &&
    isAmount(value.balance)
  );
}
function isLedgerResponse(value: unknown): value is LedgerResponse {
  return (
    isRecord(value) &&
    isRecord(value.opening_balances) &&
    Object.values(value.opening_balances).every(isAmount) &&
    Array.isArray(value.items) &&
    value.items.every(
      (row) =>
        isRecord(row) &&
        [
          "line_id",
          "account_id",
          "account_code",
          "account_name",
          "entry_date",
          "date_basis",
          "description",
        ].every((key) => typeof row[key] === "string") &&
        ["debit", "credit", "balance"].every((key) => isAmount(row[key])),
    )
  );
}
function isTrialResponse(value: unknown): value is TrialResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(
      (row) =>
        isStatementRow(row) &&
        isRecord(row) &&
        isAmount(row.debit) &&
        isAmount(row.credit),
    )
  );
}
function isStatements(value: unknown): value is Statements {
  if (
    !isRecord(value) ||
    !isRecord(value.profit_and_loss) ||
    !isRecord(value.balance_sheet) ||
    !isRecord(value.cash_movement)
  )
    return false;
  const pnl = value.profit_and_loss,
    balance = value.balance_sheet,
    cash = value.cash_movement;
  return (
    ["income", "expenses"].every(
      (key) => Array.isArray(pnl[key]) && pnl[key].every(isStatementRow),
    ) &&
    ["total_income", "total_expenses", "net_profit"].every((key) =>
      isAmount(pnl[key]),
    ) &&
    ["assets", "liabilities", "equity"].every(
      (key) =>
        Array.isArray(balance[key]) && balance[key].every(isStatementRow),
    ) &&
    [
      "total_assets",
      "total_liabilities",
      "total_equity",
      "unclosed_earnings",
      "difference",
    ].every((key) => isAmount(balance[key])) &&
    typeof balance.balanced === "boolean" &&
    typeof cash.basis === "string" &&
    ["opening", "net_change", "closing"].every((key) => isAmount(cash[key]))
  );
}
function exportCsv(name: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map(
          (cell) =>
            '"' +
            (/^[=+@\t\r]/.test(cell) ||
            (/^-/.test(cell) && !/^-?\d+(\.\d+)?$/.test(cell))
              ? "'"
              : "") +
            cell.replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
export default function FinancialReports({
  accounts,
}: {
  accounts: Account[];
}) {
  const [account, setAccount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today());
  const [result, setResult] = useState<{
    ledger: Ledger[];
    opening: Record<string, string>;
    trial: Balance[];
    fs: Statements;
    from: string;
    to: string;
    account: string;
  } | null>(null);
  const action = useAction();
  async function load() {
    await action.run(async () => {
      if (!to || (from && from > to))
        throw new Error("Choose an end date on or after the start date.");
      setResult(null);
      const dates = new URLSearchParams({ to_date: to });
      if (from) dates.set("from_date", from);
      const ledgerParams = new URLSearchParams(dates);
      if (account) ledgerParams.set("account_id", account);
      const [gl, tb, fs] = await Promise.all([
        api.get<unknown>("/api/v1/accounting/general-ledger?" + ledgerParams),
        api.get<unknown>("/api/v1/accounting/reports/trial-balance?" + dates),
        api.get<unknown>(
          "/api/v1/accounting/reports/financial-statements?" + dates,
        ),
      ]).catch((error) => {
        throw accountingRequestError(error, "Financial reports");
      });
      if (!isLedgerResponse(gl) || !isTrialResponse(tb) || !isStatements(fs)) {
        throw new Error(accountingCompatibilityMessage("Financial reports"));
      }
      setResult({
        ledger: gl.items,
        opening: gl.opening_balances,
        trial: tb.items,
        fs,
        from,
        to,
        account,
      });
    });
  }
  useEffect(() => {
    void load();
    // Subsequent filter edits are applied together with the Apply button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Explicit Apply keeps all reports on one snapshot.
  const total = (key: "debit" | "credit") =>
    decimal(
      (result?.trial || []).reduce(
        (sum, row) => sum + cents(row[key]),
        BigInt(0),
      ),
    );
  const rows = (items: Balance[]) =>
    items.length ? (
      items.map((item) => (
        <div
          key={item.account_id}
          className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm"
        >
          <span>
            {item.code} · {item.name}
          </span>
          <span className="font-medium tabular-nums">
            {money(item.balance)}
          </span>
        </div>
      ))
    ) : (
      <p className="py-3 text-sm text-slate-500">No posted balances.</p>
    );
  const metric = (label: string, value: string) => (
    <div className="flex justify-between gap-4 py-3 font-semibold">
      <span>{label}</span>
      <span className="tabular-nums">{money(value)}</span>
    </div>
  );
  return (
    <div className="space-y-5">
      <section className={panel}>
        <h2 className="text-xl font-bold">Ledger & financial reports</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Only posted, approved entries are included. The date range applies to
          every report; balance sheet and trial balance include opening history
          through the end date.
        </p>
        <form
          className="mt-5 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <label className="text-sm font-medium">
            Ledger account
            <FormSelect
              className={input}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </FormSelect>
          </label>
          <label className="text-sm font-medium">
            Activity from (optional)
            <input
              type="date"
              className={input}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Through
            <input
              required
              type="date"
              className={input}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button disabled={action.busy} className={primary}>
            {action.busy ? "Loading…" : "Apply filters"}
          </button>
        </form>
        <div className="mt-4">
          <Alert error={action.error} />
        </div>
      </section>
      {action.busy && (
        <p role="status" className="p-5 text-sm text-slate-600">
          Preparing ledger and statements…
        </p>
      )}
      {result && (
        <>
          <p className="text-sm text-slate-600">
            Report snapshot: {result.from || "All recorded history"} through{" "}
            {result.to}. Amounts use the ledger’s base currency.
          </p>
          <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">General ledger</h2>
              <button
                className={button}
                onClick={() => {
                  // Opening balances are as at the day before the activity
                  // start; label the export rows with that date honestly.
                  const openingDate = result.from
                    ? new Date(
                        new Date(result.from + "T00:00:00Z").getTime() - 86400000,
                      )
                        .toISOString()
                        .slice(0, 10)
                    : "beginning";
                  exportCsv("general-ledger-" + result.to + ".csv", [
                    [
                      "Account",
                      "Date",
                      "Description",
                      "Debit",
                      "Credit",
                      "Balance (debit positive)",
                    ],
                    ...Object.entries(result.opening).map(([id, amount]) => [
                      accounts.find((a) => a.id === id)?.name || id,
                      openingDate,
                      "Opening balance",
                      "",
                      "",
                      amount,
                    ]),
                    ...result.ledger.map((l) => [
                      l.account_code + " " + l.account_name,
                      l.entry_date,
                      l.description,
                      l.debit,
                      l.credit,
                      l.balance,
                    ]),
                  ]);
                }}
              >
                Export ledger CSV
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Running balances are per account, including opening balances.
              Debit balances are positive; credit balances are negative.
            </p>
            {result.account && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold">
                Opening balance: {money(result.opening[result.account] || "0")}
              </p>
            )}
            <div
              tabIndex={0}
              role="region"
              aria-label="Scrollable accounting table"
              className="mt-4 overflow-x-auto"
            >
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">
                  Posted general ledger activity
                </caption>
                <thead className="border-b bg-slate-50 text-xs text-slate-600">
                  <tr>
                    {[
                      "Date",
                      "Account / description",
                      "Debit",
                      "Credit",
                      "Running balance",
                    ].map((h, i) => (
                      <th
                        key={h}
                        scope="col"
                        className={"px-3 py-3 " + (i > 1 ? "text-right" : "")}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.ledger.map((l) => (
                    <tr key={l.line_id}>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {l.entry_date}
                        {l.date_basis === "legacy_creation_date" && (
                          <span className="block text-xs text-amber-700">
                            Legacy creation date
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold">
                          {l.account_code} · {l.account_name}
                        </p>
                        <p className="mt-1 text-slate-600">{l.description}</p>
                      </td>
                      {[l.debit, l.credit, l.balance].map((v, i) => (
                        <td
                          key={i}
                          className="px-3 py-3 text-right tabular-nums"
                        >
                          {money(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!result.ledger.length && (
              <p className="py-6 text-center text-sm text-slate-600">
                No posted activity in this range. Opening balances are retained.
              </p>
            )}
          </section>
          <section className={panel}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Trial balance</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Closing account balances as at {result.to} · all accounts
                </p>
              </div>
              <button
                className={button}
                onClick={() =>
                  exportCsv("trial-balance-" + result.to + ".csv", [
                    ["Code", "Account", "Debit", "Credit"],
                    ...result.trial.map((r) => [
                      r.code,
                      r.name,
                      r.debit,
                      r.credit,
                    ]),
                    ["", "Total", total("debit"), total("credit")],
                  ])
                }
              >
                Export trial balance CSV
              </button>
            </div>
            <div
              tabIndex={0}
              role="region"
              aria-label="Scrollable accounting table"
              className="mt-4 overflow-x-auto"
            >
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th scope="col" className="p-3">
                      Account
                    </th>
                    <th scope="col" className="p-3 text-right">
                      Debit
                    </th>
                    <th scope="col" className="p-3 text-right">
                      Credit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.trial.map((r) => (
                    <tr key={r.account_id}>
                      <td className="p-3">
                        {r.code} · {r.name}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {money(r.debit)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {money(r.credit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t font-bold">
                  <tr>
                    <th scope="row" className="p-3">
                      Total
                    </th>
                    <td className="p-3 text-right tabular-nums">
                      {money(total("debit"))}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {money(total("credit"))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {total("debit") !== total("credit") && (
              <Alert error="Trial balance is out of balance. Review posting integrity before relying on these reports." />
            )}
          </section>
          <div className="grid gap-5 xl:grid-cols-2">
            <section className={panel}>
              <h2 className="text-lg font-bold">Profit & loss</h2>
              <p className="mt-1 text-sm text-slate-600">
                {result.from || "All history"} through {result.to}
              </p>
              <h3 className="mt-5 font-semibold">Income</h3>
              {rows(result.fs.profit_and_loss.income)}
              {metric("Total income", result.fs.profit_and_loss.total_income)}
              <h3 className="mt-4 font-semibold">Expenses</h3>
              {rows(result.fs.profit_and_loss.expenses)}
              {metric(
                "Total expenses",
                result.fs.profit_and_loss.total_expenses,
              )}
              <div className="mt-3 border-t border-slate-300 text-teal-800">
                {metric(
                  "Net profit / (loss)",
                  result.fs.profit_and_loss.net_profit,
                )}
              </div>
            </section>
            <section className={panel}>
              <h2 className="text-lg font-bold">Balance sheet</h2>
              <p className="mt-1 text-sm text-slate-600">As at {result.to}</p>
              <h3 className="mt-5 font-semibold">Assets</h3>
              {rows(result.fs.balance_sheet.assets)}
              {metric("Total assets", result.fs.balance_sheet.total_assets)}
              <h3 className="mt-4 font-semibold">Liabilities</h3>
              {rows(result.fs.balance_sheet.liabilities)}
              {metric(
                "Total liabilities",
                result.fs.balance_sheet.total_liabilities,
              )}
              <h3 className="mt-4 font-semibold">Equity</h3>
              {rows(result.fs.balance_sheet.equity)}
              {metric(
                "Unclosed earnings",
                result.fs.balance_sheet.unclosed_earnings,
              )}
              {metric("Total equity", result.fs.balance_sheet.total_equity)}
              <p
                className={
                  "mt-3 rounded-xl p-3 text-sm font-semibold " +
                  (result.fs.balance_sheet.balanced
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-rose-50 text-rose-800")
                }
              >
                {result.fs.balance_sheet.balanced
                  ? "Assets equal liabilities plus equity."
                  : "Out of balance by " +
                    money(result.fs.balance_sheet.difference)}
              </p>
            </section>
          </div>
          <section className={panel}>
            <h2 className="text-lg font-bold">
              Cash & settlement account movements
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {result.fs.cash_movement.basis}.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              {metric("Opening", result.fs.cash_movement.opening)}
              {metric("Net movement", result.fs.cash_movement.net_change)}
              {metric("Closing", result.fs.cash_movement.closing)}
            </div>
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              A classified cash-flow statement is not yet available. Cash
              equivalents and operating, investing and financing transactions
              need reviewed mappings.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
