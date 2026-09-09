"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  isRecord,
  isAmount,
  accountingCompatibilityMessage,
  accountingRequestError,
} from "./response-contract";
import { Alert, button, money, panel, useAction, cents } from "./accounting-ui";

type Controls = {
  basis: string;
  reconciliations: {
    name: string;
    account_code: string;
    control_balance: string;
    document_balance: string;
    difference: string;
  }[];
  unlinked_open_documents: number;
  unbalanced_posted_journals: number;
  undated_legacy_journals: number;
  cross_tenant_lines: number;
};
function isControls(value: unknown): value is Controls {
  return (
    isRecord(value) &&
    typeof value.basis === "string" &&
    Array.isArray(value.reconciliations) &&
    value.reconciliations.every(
      (row) =>
        isRecord(row) &&
        typeof row.name === "string" &&
        typeof row.account_code === "string" &&
        ["control_balance", "document_balance", "difference"].every((key) =>
          isAmount(row[key]),
        ),
    ) &&
    [
      "unlinked_open_documents",
      "unbalanced_posted_journals",
      "undated_legacy_journals",
      "cross_tenant_lines",
    ].every(
      (key) =>
        typeof value[key] === "number" &&
        Number.isSafeInteger(value[key]) &&
        value[key] >= 0,
    )
  );
}
export default function LedgerControls() {
  const [controls, setControls] = useState<Controls | null>(null);
  const action = useAction();
  async function load() {
    await action.run(async () => {
      setControls(null);
      const response = await api
        .get<unknown>("/api/v1/accounting/controls")
        .catch((error) => {
          throw accountingRequestError(error, "Ledger integrity checks");
        });
      if (!isControls(response))
        throw new Error(
          accountingCompatibilityMessage("Ledger integrity checks"),
        );
      setControls(response);
    });
  }
  useEffect(() => {
    void load();
    // Initial read only. Explicit refresh updates the current reconciliation snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className={panel}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">
            Ledger integrity & subledger checks
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Review exceptions before period close. These checks do not change
            historical records.
          </p>
        </div>
        <button
          className={button}
          disabled={action.busy}
          onClick={() => void load()}
        >
          {action.busy ? "Checking…" : "Refresh checks"}
        </button>
      </header>
      <div className="mt-4">
        <Alert error={action.error} />
      </div>
      {controls && (
        <>
          <p className="text-xs text-slate-600">{controls.basis}.</p>
          <div
            tabIndex={0}
            role="region"
            aria-label="Scrollable accounting table"
            className="mt-4 overflow-x-auto"
          >
            <table className="w-full min-w-[550px] text-left text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th scope="col" className="p-3">
                    Subledger
                  </th>
                  <th scope="col" className="p-3 text-right">
                    GL control
                  </th>
                  <th scope="col" className="p-3 text-right">
                    Documents
                  </th>
                  <th scope="col" className="p-3 text-right">
                    Difference
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {controls.reconciliations.map((r) => (
                  <tr key={r.account_code}>
                    <th scope="row" className="p-3 font-medium">
                      {r.name} · {r.account_code}
                    </th>
                    <td className="p-3 text-right tabular-nums">
                      {money(r.control_balance)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {money(r.document_balance)}
                    </td>
                    <td
                      className={
                        "p-3 text-right font-semibold tabular-nums " +
                        (cents(r.difference) === BigInt(0)
                          ? "text-emerald-800"
                          : "text-rose-800")
                      }
                    >
                      {money(r.difference)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Unbalanced posted journals",
                controls.unbalanced_posted_journals,
              ],
              ["Unlinked open documents", controls.unlinked_open_documents],
              [
                "Legacy journals without dates",
                controls.undated_legacy_journals,
              ],
              ["Cross-workspace journal lines", controls.cross_tenant_lines],
            ].map(([label, count]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-600">{label}</dt>
                <dd
                  className={
                    "mt-2 text-xl font-bold " +
                    (Number(count) > 0 ? "text-amber-800" : "text-slate-900")
                  }
                >
                  {count}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs leading-5 text-slate-600">
            A balanced ledger is not a statutory-compliance certification.
            Differences or legacy exceptions need accountant review; do not
            create plug entries merely to force agreement.
          </p>
        </>
      )}
    </section>
  );
}
