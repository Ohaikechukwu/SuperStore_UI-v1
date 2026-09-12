"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, RefreshCw } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import FormSelect from "@/components/form-select";
import { api } from "@/lib/api";
import {
  can,
  loadAuthorizationContext,
  type AuthorizationContext,
} from "@/lib/authorization";
import {
  Account,
  Period,
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
import JournalEditor from "./journal-editor";
import LedgerControls from "./ledger-controls";
import FinancialReports from "./financial-reports";
import {
  BankPanel,
  BudgetPanel,
  type BankStatement,
  type Budget,
} from "./reconciliation-budgets";

type Document = {
  id: string;
  reference: string;
  description: string;
  amount: string;
  paid_amount?: string;
  received_amount?: string;
  status: string;
  due_date: string | null;
  can_settle: boolean;
};
type Contact = { id: string; name: string };
type JournalDetail = {
  id: string;
  entry_date: string;
  description: string;
  lines: {
    id: string;
    account_code: string;
    account_name: string;
    debit: string;
    credit: string;
  }[];
};
const tabs = [
  ["accounts", "Chart & periods"],
  ["journals", "Journals"],
  ["documents", "Payables & receivables"],
  ["bank", "Bank reconciliation"],
  ["budgets", "Budgets"],
  ["reports", "Ledger & reports"],
] as const;

export default function Page() {
  return (
    <DashboardShell
      title="Accounting"
      subtitle="Financial records, controls and reporting"
    >
      <PermissionGate permission="accounting.read">
        <AccountingWorkspace />
      </PermissionGate>
    </DashboardShell>
  );
}
function AccountingWorkspace() {
  const [context, setContext] = useState<AuthorizationContext | null>(null);
  const [tab, setTab] = useState<string>("accounts");
  const [data, setData] = useState<{
    accounts: Account[];
    periods: Period[];
    journals: Journal[];
    payables: Document[];
    receivables: Document[];
    statements: BankStatement[];
    budgets: Budget[];
  } | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [review, setReview] = useState<{
    journal: Journal;
    detail: JournalDetail;
  } | null>(null);
  const [closing, setClosing] = useState<Period | null>(null);
  const [reversing, setReversing] = useState<Journal | null>(null);
  const [rejecting, setRejecting] = useState<Journal | null>(null);
  const [settling, setSettling] = useState<{
    kind: "payables" | "receivables";
    document: Document;
  } | null>(null);
  const loadAction = useAction();
  const action = useAction();
  const accountAction = useAction();
  const allowed = (permission: string) => can(context, permission);
  async function load() {
    await loadAction.run(async () => {
      const [
        auth,
        accounts,
        periods,
        journals,
        payables,
        receivables,
        statements,
        budgets,
      ] = await Promise.all([
        loadAuthorizationContext(),
        api.get<Account[]>("/api/v1/accounting/accounts"),
        api.get<Period[]>("/api/v1/accounting/periods"),
        api.get<Journal[]>("/api/v1/accounting/journals"),
        api.get<Document[]>("/api/v1/accounting/payables"),
        api.get<Document[]>("/api/v1/accounting/receivables"),
        api.get<BankStatement[]>("/api/v1/accounting/bank-statements"),
        api.get<Budget[]>("/api/v1/accounting/budgets"),
      ]);
      setContext(auth);
      setData({
        accounts,
        periods,
        journals,
        payables,
        receivables,
        statements,
        budgets,
      });
    });
  }
  useEffect(() => {
    void load();
    // Initial fetch only; refresh and completed mutations explicitly reload this snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function saved(message = "Accounting record saved.") {
    setNotice(message);
    await load();
  }
  function toggleAccount(account: Account) {
    const activating = !account.active;
    void accountAction.run(async () => {
      await api.post(
        "/api/v1/accounting/accounts/" + account.id + "/" + (activating ? "activate" : "deactivate"),
        {},
      );
      await saved(activating ? "Account reactivated." : "Account deactivated; it can no longer receive postings.");
    });
  }
  const outstanding = (kind: "payables" | "receivables") =>
    decimal(
      (data?.[kind] || [])
        .filter((d) => !["paid", "voided", "cancelled"].includes(d.status))
        .reduce(
          (sum, d) =>
            sum +
            cents(d.amount) -
            cents(
              (kind === "payables" ? d.paid_amount : d.received_amount) || "0",
            ),
          BigInt(0),
        ),
    );
  const matches = (text: string) =>
    text.toLowerCase().includes(search.trim().toLowerCase());
  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">
            Finance workspace
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Accounting
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Review, reconcile and report with a traceable ledger.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={button}
            disabled={loadAction.busy}
            onClick={() => void load()}
          >
            <RefreshCw size={15} className="mr-2 inline" />
            Refresh
          </button>
          {allowed("accounting.period.manage") && (
            <button className={button} onClick={() => setModal("period")}>
              New period
            </button>
          )}
          {allowed("accounting.post") && (
            <button className={primary} onClick={() => setModal("journal")}>
              <Plus size={16} className="mr-1 inline" />
              New journal
            </button>
          )}
        </div>
      </header>
      <Alert error={loadAction.error} />
      <Alert error={action.error} />
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {loadAction.busy && (
        <p role="status" className="text-sm text-slate-600">
          Refreshing accounting records…
        </p>
      )}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Outstanding payables", money(outstanding("payables"))],
              ["Outstanding receivables", money(outstanding("receivables"))],
              [
                "Awaiting journal approval",
                String(
                  data.journals.filter((j) => j.approval_status === "pending")
                    .length,
                ),
              ],
              [
                "Open fiscal periods",
                String(data.periods.filter((p) => p.status === "open").length),
              ],
            ].map(([label, value]) => (
              <div key={label} className={panel}>
                <p className="text-sm text-slate-600">{label}</p>
                <p className="mt-2 break-words text-2xl font-bold tabular-nums text-slate-950">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <nav
            aria-label="Accounting sections"
            className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-2"
          >
            {tabs
              .filter(([key]) => key !== "reports" || allowed("reports.read"))
              .map(([key, label]) => (
                <button
                  key={key}
                  aria-current={tab === key ? "page" : undefined}
                  className={
                    "rounded-xl px-4 py-2.5 text-sm font-semibold " +
                    (tab === key
                      ? "bg-teal-700 text-white"
                      : "text-slate-600 hover:bg-slate-50")
                  }
                  onClick={() => {
                    setTab(key);
                    setSearch("");
                    // A success banner belongs to the view that produced it.
                    setNotice("");
                  }}
                >
                  {label}
                </button>
              ))}
          </nav>
          {["accounts", "journals"].includes(tab) && (
            <label className="block max-w-md text-sm font-medium text-slate-700">
              Search {tab === "accounts" ? "accounts" : "journals"}
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={input}
                placeholder={
                  tab === "accounts"
                    ? "Account code or name"
                    : "Description or source"
                }
              />
            </label>
          )}
          {tab === "accounts" && (
            <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
              <section className={panel}>
                <header className="flex justify-between gap-3">
                  <h2 className="text-lg font-bold">Chart of accounts</h2>
                  {allowed("accounting.manage") && (
                    <button
                      className={button}
                      onClick={() => setModal("account")}
                    >
                      New account
                    </button>
                  )}
                </header>
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Scrollable accounting table"
                  className="mt-4 overflow-x-auto"
                >
                  <table className="w-full min-w-[540px] text-left text-sm">
                    <thead className="border-b bg-slate-50 text-xs text-slate-600">
                      <tr>
                        {["Code", "Account", "Type", "Posting control", ""].map(
                          (h) => (
                            <th key={h} scope="col" className="p-3">
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.accounts
                        .filter((a) => matches(a.code + " " + a.name))
                        .map((a) => (
                          <tr key={a.id}>
                            <td className="p-3 font-mono">{a.code}</td>
                            <td className="p-3 font-semibold">{a.name}</td>
                            <td className="p-3 capitalize">{a.account_type}</td>
                            <td className="p-3 text-slate-600">
                              {!a.active
                                ? "Inactive"
                                : a.allow_manual_posting
                                  ? "Manual journals allowed"
                                  : "Source workflow only"}
                            </td>
                            <td className="p-3 text-right">
                              {allowed("accounting.manage") && !a.is_system && (
                                <button
                                  className={
                                    "text-xs font-bold " +
                                    (a.active ? "text-rose-700" : "text-teal-700")
                                  }
                                  disabled={accountAction.busy}
                                  onClick={() => toggleAccount(a)}
                                >
                                  {a.active ? "Deactivate" : "Activate"}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!data.accounts.filter((a) => matches(a.code + " " + a.name))
                  .length && (
                  <p className="py-8 text-center text-sm text-slate-600">
                    No matching accounts.
                  </p>
                )}
              </section>
              <section className={panel}>
                <h2 className="text-lg font-bold">Fiscal periods</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Once periods are configured, every new journal—including
                  operational postings—must fall within an open period.
                </p>
                <div className="mt-4 space-y-3">
                  {data.periods.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex justify-between gap-2">
                        <h3 className="font-semibold">{p.name}</h3>
                        <Status value={p.status} />
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        {p.starts_on} to {p.ends_on}
                      </p>
                      {p.status === "open" &&
                        allowed("accounting.period.manage") && (
                          <button
                            className="mt-3 text-sm font-semibold text-rose-700"
                            onClick={() => setClosing(p)}
                          >
                            Review & close period
                          </button>
                        )}
                    </div>
                  ))}
                  {!data.periods.length && (
                    <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                      No fiscal periods configured. Create an open period before
                      entering manual journals or settlements.
                    </p>
                  )}
                </div>
              </section>
            </div>
          )}
          {tab === "journals" && (
            <section className={panel}>
              <h2 className="text-lg font-bold">Journal register</h2>
              <p className="mt-2 text-sm text-slate-600">
                Review the full entry before approval. Correct sales, stock and
                clinical postings in their source workflow.
              </p>
              <div className="mt-4 divide-y divide-slate-100">
                {data.journals
                  .filter((j) =>
                    matches(j.description + " " + j.reference_type),
                  )
                  .map((j) => (
                    <div
                      key={j.id}
                      className="flex flex-wrap items-center gap-3 py-4"
                    >
                      <BookOpen size={20} className="text-teal-700" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{j.description}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {j.entry_date || j.created_at.slice(0, 10)} ·{" "}
                          {j.reference_type.replaceAll("_", " ")}
                          {j.reversed_by_id ? " · Reversed" : ""}
                        </p>
                      </div>
                      <Status value={j.approval_status} />
                      <button
                        className={button}
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(async () =>
                            setReview({
                              journal: j,
                              detail: await api.get<JournalDetail>(
                                "/api/v1/accounting/journals/" + j.id,
                              ),
                            }),
                          )
                        }
                      >
                        Review entry
                      </button>
                      {j.posted &&
                        !j.reversed_by_id &&
                        !j.reversal_of_id &&
                        j.reference_type === "manual" &&
                        allowed("accounting.post") &&
                        allowed("accounting.approve") && (
                          <button
                            className="px-2 py-2 text-sm font-semibold text-rose-700"
                            onClick={() => setReversing(j)}
                          >
                            Reverse
                          </button>
                        )}
                    </div>
                  ))}
              </div>
              {!data.journals.filter((j) =>
                matches(j.description + " " + j.reference_type),
              ).length && (
                <p className="py-8 text-center text-sm text-slate-600">
                  No matching journals.
                </p>
              )}
            </section>
          )}
          {tab === "documents" && (
            <div className="grid gap-5 xl:grid-cols-2">
              {(["payables", "receivables"] as const).map((kind) => (
                <section key={kind} className={panel}>
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-bold capitalize">{kind}</h2>
                    {allowed("accounting." + kind + ".manage") && (
                      <button className={button} onClick={() => setModal(kind)}>
                        New manual {kind === "payables" ? "bill" : "invoice"}
                      </button>
                    )}
                  </header>
                  <p className="mt-2 text-sm text-slate-600">
                    Manual documents recognise a matching ledger entry.
                    Operational documents retain their original source.
                  </p>
                  <div className="mt-4 space-y-3">
                    {data[kind].map((d) => {
                      const remaining =
                        cents(d.amount) -
                        cents(
                          (kind === "payables"
                            ? d.paid_amount
                            : d.received_amount) || "0",
                        );
                      const open =
                        !["paid", "voided", "cancelled"].includes(d.status) &&
                        remaining > 0;
                      return (
                        <article
                          key={d.id}
                          className="rounded-xl border border-slate-200 p-4"
                        >
                          <div className="flex justify-between gap-3">
                            <h3 className="font-semibold">{d.reference}</h3>
                            <Status value={d.status} />
                          </div>
                          <p className="mt-2 text-sm text-slate-600">
                            {d.description}
                          </p>
                          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <dt className="text-slate-500">
                                Original amount
                              </dt>
                              <dd className="mt-1 font-semibold tabular-nums">
                                {money(d.amount)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">Outstanding</dt>
                              <dd className="mt-1 font-semibold tabular-nums">
                                {money(decimal(remaining))}
                              </dd>
                            </div>
                          </dl>
                          <p className="mt-2 text-xs text-slate-600">
                            Due: {d.due_date || "Not specified"}
                          </p>
                          {open &&
                            d.can_settle &&
                            allowed("accounting." + kind + ".manage") && (
                              <button
                                className={button + " mt-3"}
                                onClick={() =>
                                  setSettling({ kind, document: d })
                                }
                              >
                                {kind === "payables"
                                  ? "Record payment"
                                  : "Record collection"}
                              </button>
                            )}
                          {open && !d.can_settle && (
                            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                              Use the source workflow to settle this document.
                              Unlinked historical documents require accounting
                              review.
                            </p>
                          )}
                        </article>
                      );
                    })}
                    {!data[kind].length && (
                      <p className="py-8 text-center text-sm text-slate-600">
                        No {kind} recorded.
                      </p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
          {tab === "bank" && (
            <BankPanel
              statements={data.statements}
              accounts={data.accounts}
              journals={data.journals}
              manage={allowed("accounting.manage")}
              changed={saved}
            />
          )}
          {tab === "budgets" && (
            <BudgetPanel
              budgets={data.budgets}
              accounts={data.accounts}
              manage={allowed("accounting.manage")}
              canApprove={allowed("accounting.approve")}
              reports={allowed("reports.read")}
              changed={saved}
            />
          )}
          {tab === "reports" && allowed("reports.read") && (
            <FinancialReports accounts={data.accounts} />
          )}
          {tab === "accounts" && (
            <LedgerControls
              key={
                data.journals.length +
                "-" +
                data.journals.filter((j) => !j.posted || j.approval_status !== "approved")
                  .length +
                "-" +
                data.payables.length +
                "-" +
                outstanding("payables") +
                "-" +
                outstanding("receivables")
              }
            />
          )}
          {modal === "journal" && (
            <JournalEditor
              accounts={data.accounts}
              periods={data.periods}
              close={() => setModal(null)}
              saved={() => saved("Journal submitted for independent approval.")}
            />
          )}
          {(modal === "account" || modal === "period") && (
            <FormDialog
              title={modal === "account" ? "New account" : "New fiscal period"}
              close={() => setModal(null)}
              submit={async (form) => {
                const payload = Object.fromEntries(form.entries());
                if (
                  modal === "period" &&
                  String(payload.starts_on) > String(payload.ends_on)
                )
                  throw new Error("End date must not precede start date.");
                await api.post(
                  "/api/v1/accounting/" +
                    (modal === "account" ? "accounts" : "periods"),
                  payload,
                );
                setModal(null);
                await saved();
              }}
            >
              {modal === "account" ? (
                <>
                  <Field name="code" label="Account code" />
                  <Field name="name" label="Account name" />
                  <label className="block text-sm font-medium">
                    Account type
                    <FormSelect name="account_type" className={input}>
                      {[
                        "asset",
                        "liability",
                        "equity",
                        "income",
                        "expense",
                      ].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </FormSelect>
                  </label>
                </>
              ) : (
                <>
                  <Field name="name" label="Period name" />
                  <Field name="starts_on" label="Start date" type="date" />
                  <Field name="ends_on" label="End date" type="date" />
                </>
              )}
            </FormDialog>
          )}
          {closing && (
            <FormDialog
              title={"Close " + closing.name + "?"}
              description="This locks new postings in the period, including purchasing, POS and clinical journals. Review the trial balance, reconcile subledgers and resolve pending journals first. Closing does not transfer annual earnings."
              close={() => setClosing(null)}
              label="Close fiscal period"
              submit={async (form) => {
                await api.post(
                  "/api/v1/accounting/periods/" + closing.id + "/close",
                  { closing_note: String(form.get("reason")) },
                );
                setClosing(null);
                await saved("Fiscal period closed.");
              }}
            >
              <Field
                name="reason"
                label="Closing review and supporting reference"
              />
            </FormDialog>
          )}
          {reversing && (
            <FormDialog
              title="Reverse manual journal?"
              description="An equal-and-opposite entry will be posted in the current open period. The original entry and the reason are retained."
              close={() => setReversing(null)}
              label="Post reversal"
              submit={async (form) => {
                await api.post(
                  "/api/v1/accounting/journals/" + reversing.id + "/reverse",
                  {
                    reason: String(form.get("reason")),
                    entry_date: String(form.get("entry_date")),
                  },
                );
                setReversing(null);
                await saved(
                  "Reversal posted; the original journal remains intact.",
                );
              }}
            >
              <p className="text-sm font-semibold">{reversing.description}</p>
              <p className="mt-1 text-xs text-slate-600">
                {reversing.created_by_user_id === context?.user_id
                  ? "You raised this journal."
                  : "Raised by " + (reversing.created_by_user_id || "an unknown user") + "."}
              </p>
              <Field
                name="entry_date"
                label="Reversal date (open period)"
                type="date"
                defaultValue={today()}
                min={reversing.entry_date || undefined}
              />
              <Field name="reason" label="Reason for reversal" />
            </FormDialog>
          )}
          {review && (
            <FormDialog
              title="Review journal entry"
              description={
                review.detail.entry_date + " · " + review.detail.description
              }
              close={() => setReview(null)}
              label={
                review.journal.approval_status === "pending" &&
                allowed("accounting.approve") &&
                review.journal.created_by_user_id !== context?.user_id
                  ? "Approve & post"
                  : "Done"
              }
              submit={async () => {
                if (
                  review.journal.approval_status === "pending" &&
                  allowed("accounting.approve") &&
                  review.journal.created_by_user_id !== context?.user_id
                ) {
                  await api.post(
                    "/api/v1/accounting/journals/" +
                      review.journal.id +
                      "/approve",
                    {},
                  );
                  setReview(null);
                  await saved("Journal approved and posted.");
                } else setReview(null);
              }}
            >
              <Status value={review.journal.approval_status} />
              {review.journal.approval_status === "pending" &&
                allowed("accounting.approve") &&
                review.journal.created_by_user_id !== context?.user_id && (
                  <button
                    type="button"
                    className={button}
                    onClick={() => {
                      setRejecting(review.journal);
                      setReview(null);
                    }}
                  >
                    Reject journal with reason
                  </button>
                )}
              <div
                tabIndex={0}
                role="region"
                aria-label="Scrollable accounting table"
                className="overflow-x-auto"
              >
                <table className="w-full min-w-[400px] text-left text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className="py-3">
                        Account
                      </th>
                      <th scope="col" className="text-right">
                        Debit
                      </th>
                      <th scope="col" className="text-right">
                        Credit
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {review.detail.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-3">
                          {l.account_code} · {l.account_name}
                        </td>
                        <td className="text-right tabular-nums">
                          {money(l.debit)}
                        </td>
                        <td className="text-right tabular-nums">
                          {money(l.credit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t font-bold">
                    <tr>
                      <th scope="row" className="py-3">
                        Total
                      </th>
                      {(["debit", "credit"] as const).map((key) => (
                        <td key={key} className="text-right tabular-nums">
                          {money(
                            decimal(
                              review.detail.lines.reduce(
                                (sum, l) => sum + cents(l[key]),
                                BigInt(0),
                              ),
                            ),
                          )}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              {review.journal.approval_status === "pending" &&
                review.journal.created_by_user_id === context?.user_id && (
                  <p className="text-sm text-amber-800">
                    You created this journal. A different authorised user must
                    approve it.
                  </p>
                )}
            </FormDialog>
          )}
          {rejecting && (
            <FormDialog
              title="Reject pending journal?"
              description="The entry will remain in the register as rejected and will not affect the ledger. Submit a new journal for any corrected entry."
              close={() => setRejecting(null)}
              label="Reject journal"
              submit={async (form) => {
                await api.post(
                  "/api/v1/accounting/journals/" + rejecting.id + "/reject",
                  { reason: String(form.get("reason")) },
                );
                setRejecting(null);
                await saved("Journal rejected without posting.");
              }}
            >
              <Field name="reason" label="Reason for rejection" />
            </FormDialog>
          )}
          {settling && (
            <FormDialog
              title={
                settling.kind === "payables"
                  ? "Record supplier payment"
                  : "Record customer collection"
              }
              description={
                settling.document.reference +
                " · Only cash and settlement accounts can be used."
              }
              close={() => setSettling(null)}
              label="Record settlement"
              submit={async (form) => {
                await api.post(
                  "/api/v1/accounting/" +
                    settling.kind +
                    "/" +
                    settling.document.id +
                    "/settlements",
                  Object.fromEntries(form.entries()),
                );
                setSettling(null);
                await saved("Settlement recorded with a linked journal.");
              }}
            >
              <Field
                name="amount"
                label="Amount"
                type="number"
                min="0.01"
                max={decimal(
                  cents(settling.document.amount) -
                    cents(
                      (settling.kind === "payables"
                        ? settling.document.paid_amount
                        : settling.document.received_amount) || "0",
                    ),
                )}
              />
              <Field
                name="settled_on"
                label="Settlement date"
                type="date"
                defaultValue={today()}
              />
              <AccountSelect
                accounts={data.accounts.filter((a) => a.settlement_allowed)}
                name="payment_account_id"
                label="Cash / settlement account"
              />
              <Field
                name="reference"
                label="Unique payment or receipt reference"
              />
            </FormDialog>
          )}
          {(modal === "payables" || modal === "receivables") && (
            <ManualDocument
              kind={modal}
              accounts={data.accounts}
              close={() => setModal(null)}
              saved={saved}
            />
          )}
        </>
      )}
      {!data && !loadAction.busy && !loadAction.error && (
        <p role="status" className="p-5 text-slate-600">
          Loading accounting workspace…
        </p>
      )}
    </div>
  );
}
function ManualDocument({
  kind,
  accounts,
  close,
  saved,
}: {
  kind: "payables" | "receivables";
  accounts: Account[];
  close: () => void;
  saved: (message?: string) => Promise<void>;
}) {
  const [contacts, setContacts] = useState<{
    suppliers: Contact[];
    customers: Contact[];
  } | null>(null);
  const action = useAction();
  useEffect(() => {
    void action.run(async () =>
      setContacts(await api.get("/api/v1/accounting/contacts")),
    );
    // Contacts are a mount-time lookup, not coupled to mutation busy/error state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <FormDialog
      title={
        kind === "payables"
          ? "New manual supplier bill"
          : "New manual customer invoice"
      }
      description="Use this for non-stock documents not already recorded in purchasing, POS or clinical billing. This creates a balanced recognition journal; payment is recorded separately. Tax-specific documents belong in their source workflow."
      close={close}
      label="Create document & journal"
      submit={async (form) => {
        const payload = Object.fromEntries(form.entries());
        await api.post("/api/v1/accounting/" + kind, {
          ...payload,
          due_date: payload.due_date || null,
        });
        close();
        await saved("Document and recognition journal created.");
      }}
    >
      <Alert error={action.error} />
      {action.busy && (
        <p role="status" className="text-sm">
          Loading contacts…
        </p>
      )}
      <label className="block text-sm font-medium">
        {kind === "payables" ? "Supplier" : "Customer"}
        <FormSelect
          name={kind === "payables" ? "supplier_id" : "customer_id"}
          required
          className={input}
        >
          <option value="">Select contact</option>
          {(
            contacts?.[kind === "payables" ? "suppliers" : "customers"] || []
          ).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FormSelect>
      </label>
      <Field name="reference" label="Document reference" />
      <Field name="description" label="Description" />
      <Field name="amount" label="Amount" type="number" min="0.01" />
      <AccountSelect
        name="offset_account_id"
        label={
          kind === "payables"
            ? "Debit account (expense or other non-stock account)"
            : "Credit account (income or other non-control account)"
        }
        accounts={accounts.filter((a) => a.active && a.allow_manual_posting)}
      />
      <Field
        name="entry_date"
        label="Recognition date"
        type="date"
        defaultValue={today()}
      />
      <Field
        name="due_date"
        label="Due date (optional)"
        type="date"
        required={false}
      />
    </FormDialog>
  );
}
