"use client";

import { useEffect, useRef, useState } from "react";
import FormSelect from "@/components/form-select";
import { api, ApiError } from "@/lib/api";
import {
  Account,
  Journal,
  AccountSelect,
  Alert,
  Field,
  FormDialog,
  Status,
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

export type BankStatement = {
  id: string;
  account_id: string;
  statement_date: string;
  opening_balance: string;
  closing_balance: string;
  status: string;
};
type BankLine = {
  id: string;
  transaction_date: string;
  reference: string;
  description: string;
  amount: string;
  matched_journal_id: string | null;
};
export type Budget = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: string;
  lines?: { account_id: string; department: string | null; amount: string }[];
};
type Variance = {
  name: string;
  lines: {
    account_id: string;
    department: string | null;
    budget: string;
    actual: string | null;
    variance: string | null;
    note: string | null;
  }[];
};

export function BankPanel({
  statements,
  accounts,
  journals,
  manage,
  changed,
}: {
  statements: BankStatement[];
  accounts: Account[];
  journals: Journal[];
  manage: boolean;
  changed: (message?: string) => Promise<void>;
}) {
  const [id, setId] = useState(statements[0]?.id || "");
  const [lines, setLines] = useState<BankLine[] | null>(null);
  const [lineError, setLineError] = useState("");
  const generation = useRef(0);
  const [modal, setModal] = useState<"statement" | "line" | "finalize" | null>(
    null,
  );
  const [matching, setMatching] = useState<BankLine | null>(null);
  const action = useAction();
  const selected = statements.find((s) => s.id === id);
  const writable = manage && selected?.status === "open";
  async function loadLines(statementId: string) {
    const request = ++generation.current;
    setLines(null);
    setLineError("");
    if (!statementId) return;
    try {
      const items = await api.get<BankLine[]>(
        "/api/v1/accounting/bank-statements/" + statementId + "/lines",
      );
      if (request === generation.current) setLines(items);
    } catch (error) {
      if (request === generation.current)
        setLineError(
          error instanceof ApiError
            ? error.message
            : "Unable to load statement lines.",
        );
    }
  }
  useEffect(() => {
    // Loading state belongs to this asynchronous fetch; retain the stale-response guard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLines(id);
    return () => {
      // This ref is a request counter, not a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [id]);
  const difference =
    selected && lines
      ? cents(selected.opening_balance) +
        lines.reduce((sum, l) => sum + cents(l.amount), BigInt(0)) -
        cents(selected.closing_balance)
      : null;
  return (
    <section className={panel}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Bank reconciliation</h2>
          <p className="mt-2 text-sm text-slate-600">
            Match exact cash movements, review exceptions, then finalise the
            statement.
          </p>
        </div>
        {manage && (
          <button className={primary} onClick={() => setModal("statement")}>
            New statement
          </button>
        )}
      </header>
      <div className="mt-4">
        <Alert error={action.error} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {statements.map((s) => (
            <button
              key={s.id}
              disabled={action.busy}
              aria-pressed={id === s.id}
              className={
                "w-full rounded-xl border p-4 text-left " +
                (id === s.id
                  ? "border-teal-300 bg-teal-50"
                  : "border-slate-200")
              }
              onClick={() => setId(s.id)}
            >
              <p className="font-semibold">
                {accounts.find((a) => a.id === s.account_id)?.name ||
                  "Settlement account"}
              </p>
              <p className="mt-1 text-sm text-slate-600">{s.statement_date}</p>
              <p className="my-2 text-sm tabular-nums">
                Closing {money(s.closing_balance)}
              </p>
              <Status value={s.status} />
            </button>
          ))}
          {!statements.length && (
            <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
              No statements yet. Create a statement using the bank’s opening and
              closing balances.
            </p>
          )}
        </aside>
        <div className="min-w-0">
          {selected && (
            <>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    Statement ending {selected.statement_date}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {lines
                      ? lines.filter((l) => l.matched_journal_id).length +
                        " of " +
                        lines.length +
                        " lines matched"
                      : "Loading lines…"}
                  </p>
                </div>
                {writable && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={action.busy || !lines}
                      className={button}
                      onClick={() => setModal("line")}
                    >
                      Add transaction
                    </button>
                    <button
                      className={button}
                      disabled={action.busy || !lines?.length}
                      onClick={() =>
                        void action.run(async () => {
                          const r = await api.post<{
                            matched: number;
                            ambiguous: number;
                            unmatched: number;
                          }>(
                            "/api/v1/accounting/bank-statements/" +
                              id +
                              "/auto-match",
                            {},
                          );
                          await loadLines(id);
                          await changed(
                            "Matched " +
                              r.matched +
                              "; " +
                              r.ambiguous +
                              " ambiguous; " +
                              r.unmatched +
                              " unmatched.",
                          );
                        })
                      }
                    >
                      Auto-match
                    </button>
                    <button
                      className={primary}
                      disabled={
                        action.busy ||
                        !lines ||
                        difference !== BigInt(0) ||
                        lines.some((l) => !l.matched_journal_id)
                      }
                      onClick={() => setModal("finalize")}
                    >
                      Finalise
                    </button>
                  </div>
                )}
              </div>
              <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
                {[
                  ["Opening", money(selected.opening_balance)],
                  ["Closing", money(selected.closing_balance)],
                  [
                    "Unexplained difference",
                    difference === null
                      ? "Loading…"
                      : money(decimal(difference)),
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-slate-600">{label}</dt>
                    <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3">
                <Alert error={lineError} />
                {lineError && (
                  <button
                    className={button + " mt-2"}
                    onClick={() => void loadLines(id)}
                  >
                    Retry statement lines
                  </button>
                )}
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {lines?.map((l) => (
                  <article
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{l.reference}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {l.transaction_date} · {l.description}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">
                      {money(l.amount)}
                    </span>
                    <Status
                      value={l.matched_journal_id ? "reconciled" : "unmatched"}
                    />
                    {!l.matched_journal_id && writable && (
                      <button
                        className={button}
                        disabled={action.busy}
                        onClick={() => setMatching(l)}
                      >
                        Match journal
                      </button>
                    )}
                  </article>
                ))}
              </div>
              {lines?.length === 0 && (
                <p className="py-6 text-sm text-slate-600">
                  No transactions entered. A statement with no movements can
                  only be finalised when its opening and closing balances agree.
                </p>
              )}
              <p className="mt-4 text-xs leading-5 text-slate-600">
                Amounts are from the cash ledger’s perspective: money received
                is positive; money paid out is negative. Auto-match requires an
                exact amount and a date within three days. Ambiguous matches
                need review. Each journal can be used only once per account.
              </p>
            </>
          )}
        </div>
      </div>
      {modal === "statement" && (
        <FormDialog
          title="New bank statement"
          close={() => setModal(null)}
          label="Create statement"
          submit={async (form) => {
            const r = await api.post<{ id: string }>(
              "/api/v1/accounting/bank-statements",
              Object.fromEntries(form.entries()),
            );
            setModal(null);
            await changed("Bank statement created.");
            setId(r.id);
          }}
        >
          <AccountSelect
            accounts={accounts.filter((a) => a.settlement_allowed)}
            label="Cash / settlement account"
          />
          <Field
            name="statement_date"
            label="Statement end date"
            type="date"
            defaultValue={today()}
          />
          <Field name="opening_balance" label="Opening balance" type="number" />
          <Field name="closing_balance" label="Closing balance" type="number" />
        </FormDialog>
      )}
      {modal === "line" && selected && (
        <FormDialog
          title="Add statement transaction"
          description="Money received is positive; payments are negative."
          close={() => setModal(null)}
          label="Add transaction"
          submit={async (form) => {
            if (cents(String(form.get("amount"))) === BigInt(0))
              throw new Error("Enter a nonzero amount.");
            await api.post(
              "/api/v1/accounting/bank-statements/" + id + "/lines",
              Object.fromEntries(form.entries()),
            );
            setModal(null);
            await loadLines(id);
          }}
        >
          <Field
            name="transaction_date"
            label="Transaction date"
            type="date"
            max={selected.statement_date}
          />
          <Field name="reference" label="Bank reference" />
          <Field name="description" label="Description" />
          <Field name="amount" label="Signed amount" type="number" />
        </FormDialog>
      )}
      {matching && (
        <FormDialog
          title="Confirm bank match"
          description={
            matching.reference +
            " · " +
            money(matching.amount) +
            ". The server will verify the account, exact amount and whether this journal has already been used."
          }
          close={() => setMatching(null)}
          label="Confirm match"
          submit={async (form) => {
            await api.post(
              "/api/v1/accounting/bank-statements/" +
                id +
                "/lines/" +
                matching.id +
                "/confirm?journal_id=" +
                encodeURIComponent(String(form.get("journal_id"))),
              {},
            );
            setMatching(null);
            await loadLines(id);
          }}
        >
          <label className="block text-sm font-medium">
            Posted journal
            <FormSelect name="journal_id" required className={input}>
              <option value="">Select journal</option>
              {journals
                .filter(
                  (j) =>
                    j.posted &&
                    j.approval_status === "approved" &&
                    !lines?.some((l) => l.matched_journal_id === j.id),
                )
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.entry_date || j.created_at.slice(0, 10)} ·{" "}
                    {j.description}
                  </option>
                ))}
            </FormSelect>
          </label>
        </FormDialog>
      )}
      {modal === "finalize" && (
        <FormDialog
          title="Finalise reconciled statement?"
          description="All lines must be matched and the opening balance plus transactions must equal the closing balance. Finalising locks this statement against further edits."
          label="Finalise statement"
          close={() => setModal(null)}
          submit={async () => {
            await api.post(
              "/api/v1/accounting/bank-statements/" + id + "/reconcile",
              {},
            );
            setModal(null);
            await changed("Bank statement reconciled and locked.");
          }}
        >
          <p className="text-sm font-semibold">
            Statement: {selected?.statement_date}
          </p>
        </FormDialog>
      )}
    </section>
  );
}

export function BudgetPanel({
  budgets,
  accounts,
  manage,
  canApprove,
  reports,
  changed,
}: {
  budgets: Budget[];
  accounts: Account[];
  manage: boolean;
  canApprove: boolean;
  reports: boolean;
  changed: (message?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [approving, setApproving] = useState<Budget | null>(null);
  const [lines, setLines] = useState([{ key: 0, account_id: "", amount: "" }]);
  const [variance, setVariance] = useState<Variance | null>(null);
  const action = useAction();
  return (
    <section className={panel}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Budgets & variance</h2>
          <p className="mt-2 text-sm text-slate-600">
            Account-level budgets compared with approved ledger movements.
          </p>
        </div>
        {manage && (
          <button className={primary} onClick={() => setOpen(true)}>
            New budget
          </button>
        )}
      </header>
      <div className="mt-4">
        <Alert error={action.error} />
      </div>
      <div className="mt-4 divide-y divide-slate-100">
        {budgets.map((b) => (
          <article
            key={b.id}
            className="flex flex-wrap items-center gap-3 py-4"
          >
            <div className="flex-1">
              <h3 className="font-semibold">{b.name}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {b.starts_on} to {b.ends_on}
              </p>
            </div>
            <Status value={b.status} />
            {reports && (
              <button
                className={button}
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    setVariance(null);
                    setVariance(
                      await api.get<Variance>(
                        "/api/v1/accounting/budgets/" + b.id + "/variance",
                      ),
                    );
                  })
                }
              >
                View variance
              </button>
            )}
            {canApprove && b.status === "draft" && (
              <button className={button} onClick={() => setApproving(b)}>
                Approve budget
              </button>
            )}
          </article>
        ))}
      </div>
      {!budgets.length && (
        <p className="py-8 text-center text-sm text-slate-600">
          No budgets created.
        </p>
      )}
      {variance && (
        <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold">{variance.name} · variance</h3>
          <p className="mt-2 text-sm text-slate-600">
            Variance = budget less actual. For expenses, a positive figure means
            under budget; for income, it means below target. Departmental
            actuals are unavailable until journal dimensions are implemented.
          </p>
          <div
            tabIndex={0}
            role="region"
            aria-label="Scrollable accounting table"
            className="mt-4 overflow-x-auto"
          >
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  {["Account", "Budget", "Actual", "Variance"].map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={"p-3 " + (i ? "text-right" : "")}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {variance.lines.map((l, index) => (
                  <tr key={l.account_id + "-" + index}>
                    <td className="p-3">
                      {accounts.find((a) => a.id === l.account_id)?.name ||
                        l.account_id}
                      {l.department && (
                        <p className="text-xs text-amber-800">
                          {l.department} · {l.note}
                        </p>
                      )}
                    </td>
                    {[l.budget, l.actual, l.variance].map((v, i) => (
                      <td key={i} className="p-3 text-right tabular-nums">
                        {money(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {open && (
        <FormDialog
          title="New account budget"
          description="Each account can appear once. Department budgets are unavailable because journal lines do not yet carry department allocations."
          close={() => setOpen(false)}
          label="Save draft budget"
          submit={async (form) => {
            if (new Set(lines.map((l) => l.account_id)).size !== lines.length)
              throw new Error("Use each account only once.");
            await api.post("/api/v1/accounting/budgets", {
              ...Object.fromEntries(form.entries()),
              lines: lines.map(({ account_id, amount }) => ({
                account_id,
                amount,
              })),
            });
            setOpen(false);
            setLines([{ key: 0, account_id: "", amount: "" }]);
            await changed("Budget saved as a draft.");
          }}
        >
          <Field name="name" label="Budget name" />
          <Field name="starts_on" label="Start date" type="date" />
          <Field name="ends_on" label="End date" type="date" />
          <div className="space-y-3">
            {lines.map((l, index) => (
              <fieldset
                key={l.key}
                className="rounded-xl border border-slate-200 p-3"
              >
                <legend className="px-1 text-xs font-semibold">
                  Budget line {index + 1}
                </legend>
                <label className="text-sm font-medium">
                  Account
                  <FormSelect
                    required
                    className={input}
                    value={l.account_id}
                    onChange={(e) =>
                      setLines((current) =>
                        current.map((r) =>
                          r.key === l.key
                            ? { ...r, account_id: e.target.value }
                            : r,
                        ),
                      )
                    }
                  >
                    <option value="">Select account</option>
                    {accounts
                      .filter((a) => a.active)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                  </FormSelect>
                </label>
                <label className="mt-3 block text-sm font-medium">
                  Budget amount
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    className={input}
                    value={l.amount}
                    onChange={(e) =>
                      setLines((current) =>
                        current.map((r) =>
                          r.key === l.key
                            ? { ...r, amount: e.target.value }
                            : r,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="mt-2 text-sm text-rose-700 disabled:opacity-40"
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((r) => r.key !== l.key),
                    )
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
                  amount: "",
                },
              ])
            }
          >
            Add account line
          </button>
        </FormDialog>
      )}
      {approving && (
        <FormDialog
          title="Approve budget?"
          description={
            approving.name +
            " · " +
            approving.starts_on +
            " to " +
            approving.ends_on
          }
          close={() => setApproving(null)}
          label="Approve budget"
          submit={async () => {
            if (!approving.lines?.length)
              throw new Error(
                "Budget allocations are unavailable. Refresh the workspace before approving.",
              );
            await api.post(
              "/api/v1/accounting/budgets/" + approving.id + "/approve",
              {},
            );
            setApproving(null);
            await changed("Budget approved.");
          }}
        >
          <div className="space-y-3">
            {approving.lines?.map((line, index) => (
              <div
                key={index}
                className="flex justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"
              >
                <span>
                  {accounts.find((a) => a.id === line.account_id)?.name ||
                    line.account_id}
                  {line.department ? " · " + line.department : ""}
                </span>
                <strong className="tabular-nums">{money(line.amount)}</strong>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-600">
            Confirm that you have reviewed the account allocations and reporting
            period.
          </p>
        </FormDialog>
      )}
    </section>
  );
}
