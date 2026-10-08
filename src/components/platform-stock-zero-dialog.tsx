"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Dialog from "@/components/dialog";
import { api, ApiError } from "@/lib/api";

type StockSummaryItem = {
  product_id: string;
  sku: string;
  name: string;
  branch_id: string;
  branch_name: string;
  quantity: string;
};

type ZeroResult = {
  stock_reset_id: string;
  products_affected: number;
  total_value: string;
  journal_entry_id: string | null;
};

const money = (value: string) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(value) || 0);

/** Super-admin-only stock zeroing for one tenant. Mount conditionally.
 * Callers inside a tenant workspace only know the id; the summary endpoint
 * supplies the name and slug needed for the typed confirmation. */
export default function PlatformStockZeroDialog({ tenant, onClose }: {
  tenant: { id: string; name?: string | null; slug?: string | null };
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"all" | "select">("all");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [tenantName, setTenantName] = useState(tenant.name ?? "");
  const [tenantSlug, setTenantSlug] = useState(tenant.slug ?? "");
  const [items, setItems] = useState<StockSummaryItem[] | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ZeroResult | null>(null);

  useEffect(() => {
    // Always loaded: zero-all shows how many balances will be cleared, and
    // workspace callers need the slug for the confirmation.
    setLoading(true);
    api
      .get<{ tenant: { name: string; slug: string }; items: StockSummaryItem[] }>(
        `/api/v1/platform/tenants/${tenant.id}/stock/summary`,
      )
      .then((data) => {
        setItems(data.items);
        setTenantName(data.tenant.name);
        setTenantSlug(data.tenant.slug);
      })
      .catch((caught) =>
        setError(caught instanceof ApiError ? caught.message : "Unable to load stock balances."),
      )
      .finally(() => setLoading(false));
  }, [tenant.id]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      `${item.name} ${item.sku} ${item.branch_name}`.toLowerCase().includes(query),
    );
  }, [items, search]);

  const selectedProducts = useMemo(() => {
    const picked = new Set<string>();
    selected.forEach((key) => picked.add(key.split(":")[1]));
    return [...picked];
  }, [selected]);

  const zeroAllReady =
    reason.trim().length >= 4 && tenantSlug !== "" && confirmation.trim() === tenantSlug;
  const zeroSelectedReady =
    mode === "select" && reason.trim().length >= 4 && selectedProducts.length > 0;

  async function zeroStock() {
    setBusy(true);
    setError("");
    try {
      const payload =
        mode === "all"
          ? { reason: reason.trim() }
          : { reason: reason.trim(), product_ids: selectedProducts };
      setResult(
        await api.post<ZeroResult>(`/api/v1/platform/tenants/${tenant.id}/stock/zero`, payload),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to zero stock.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Dialog title="Stock zeroed" onClose={onClose} className="max-w-lg">
        <div className="p-6">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 size={20} />
            <h3 className="text-lg font-bold">Stock reset posted</h3>
          </div>
          <dl className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Products affected</dt><dd className="font-bold">{result.products_affected}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Value written off</dt><dd className="font-bold">{money(result.total_value)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Journal entry</dt><dd className="max-w-[16rem] truncate font-mono text-xs">{result.journal_entry_id || "no value to post"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Reset record</dt><dd className="max-w-[16rem] truncate font-mono text-xs">{result.stock_reset_id}</dd></div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Every movement was written through the stock ledger and the full before-state was
            snapshotted to the audit trail — nothing was deleted. See Platform activity for the
            record.
          </p>
          <button onClick={onClose} className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-700">
            Done
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={`Stock · ${tenantName || tenant.id}`} onClose={onClose} busy={busy} className="max-w-2xl">
      <div className="p-6">
        <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p className="text-xs leading-5">
            Zeroing writes negative stock movements through the ledger and records the full
            before-state in the audit trail. It cannot be undone by the system — reload correct
            stock afterwards with a stock upload. Supplier bills from purchase receipts are{" "}
            <strong>not</strong> touched.
          </p>
        </div>

        <div className="mt-4 flex gap-2">
          {(["all", "select"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setMode(value)}
              className={`rounded-xl px-4 py-2 text-xs font-bold ${mode === value ? "bg-teal-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
              {value === "all" ? "Zero all stock" : "Zero selected products"}
            </button>
          ))}
        </div>

        {mode === "select" && (
          <div className="mt-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, SKU, or branch"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
            />
            <div className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-100">
              {loading && <p className="p-4 text-sm text-slate-500">Loading balances…</p>}
              {!loading && !filtered.length && (
                <p className="p-4 text-sm text-slate-500">No non-zero balances found.</p>
              )}
              {filtered.map((item) => {
                const key = `${item.branch_id}:${item.product_id}`;
                const checked = selected.has(key);
                return (
                  <label key={key} className="flex items-center justify-between gap-3 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0">
                    <span className="flex min-w-0 items-center gap-3">
                      <input type="checkbox" checked={checked}
                        onChange={() => setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{item.name}</span>
                        <span className="block truncate text-xs text-slate-400">{item.sku} · {item.branch_name}</span>
                      </span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">{item.quantity}</span>
                  </label>
                );
              })}
            </div>
            {!!selectedProducts.length && (
              <p className="mt-2 text-xs text-slate-500">{selectedProducts.length} product(s) selected.</p>
            )}
          </div>
        )}

        <label className="mt-4 block text-xs font-bold text-slate-600">
          Reason (required, stored in the audit trail)
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="e.g. Goods received note covered a delivery that never arrived"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-teal-600"
          />
        </label>

        {mode === "all" && (
          <label className="mt-3 block text-xs font-bold text-slate-600">
            Type “{tenantSlug || "…"}” to confirm zeroing <em>every</em> balance
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-rose-600"
            />
          </label>
        )}

        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <button
          onClick={() => void zeroStock()}
          disabled={busy || !(mode === "all" ? zeroAllReady : zeroSelectedReady)}
          className="mt-5 w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Zeroing stock…" : mode === "all" ? "Zero all stock for this tenant" : "Zero selected products"}
        </button>
      </div>
    </Dialog>
  );
}
