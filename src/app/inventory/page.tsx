"use client";

import FormSelect from "@/components/form-select";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  Boxes,
  ClipboardCheck,
  Download,
  FileUp,
  RefreshCw,
  Search,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import AppSelect from "@/components/app-select";
import PermissionGate from "@/components/permission-gate";
import { enqueue, readOfflineSnapshot, saveOfflineSnapshot } from "@/offlineQueue";
import { api, ApiError } from "@/lib/api";
import { useApiConnectivity } from "@/lib/connectivity";
import { matchesProductSearch } from "@/lib/product-search";

type Branch = { id: string; name: string; code: string; active: boolean };
type Balance = {
  product_id: string;
  stock_code: string;
  barcode?: string | null;
  name: string;
  manufacturer?: string | null;
  quantity: string;
  reorder_level: number;
};
type BulkStockItem = {
  stock_code: string;
  quantity: string;
  unit_cost: string;
  batch_number: string | null;
  expiry_date: string | null;
};

function commandId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `web-${Date.now()}`;
}

const stockTemplate =
  "stock_code,quantity,unit_cost,batch_number,expiry_date\nPARA999,100,900,BATCH-001,2028-12-31\nSTORE001,50,500,,\n";

function parseStockCsv(text: string): BulkStockItem[] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2)
    throw new Error("The CSV needs a header row and at least one stock line.");
  const headers = rows[0].map((header) =>
    header
      .trim()
      .toLowerCase()
      .replaceAll(" ", "_")
      .replace("sku", "stock_code"),
  );
  const at = (line: string[], name: string) =>
    line[headers.indexOf(name)]?.trim() || "";
  if (
    ["stock_code", "quantity", "unit_cost"].some(
      (name) => !headers.includes(name),
    )
  )
    throw new Error(
      "CSV must include stock_code, quantity, and unit_cost columns.",
    );
  return rows.slice(1).map((line, position) => {
    const stockCode = at(line, "stock_code"),
      quantity = Number(at(line, "quantity")),
      unitCost = Number(at(line, "unit_cost"));
    if (
      !stockCode ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(unitCost) ||
      unitCost < 0
    )
      throw new Error(
        `Row ${position + 2} has an invalid stock code, quantity, or unit cost.`,
      );
    const batch = at(line, "batch_number") || null,
      expiry = at(line, "expiry_date") || null;
    if (expiry && !batch)
      throw new Error(
        `Row ${position + 2} needs a batch number when expiry date is supplied.`,
      );
    return {
      stock_code: stockCode,
      quantity: String(quantity),
      unit_cost: String(unitCost),
      batch_number: batch,
      expiry_date: expiry,
    };
  });
}

export default function Page() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [branchId, setBranchId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const { online } = useApiConnectivity();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [stockImportOpen, setStockImportOpen] = useState(false);
  const [importBranchId, setImportBranchId] = useState("");
  const [importSourceReference, setImportSourceReference] = useState("");
  const [importReason, setImportReason] = useState("");
  const [importing, setImporting] = useState(false);

  async function load(branch = branchId) {
    setBusy(true);
    setError("");
    try {
      const branchData = await api.get<Branch[]>("/api/v1/catalog/branches");
      setBranches(branchData);
      const selected = branch || branchData[0]?.id || "";
      setBranchId(selected);
      const nextBalances = selected
        ? await api.get<Balance[]>(`/api/v1/inventory/balances/${selected}`)
        : [];
      setBalances(nextBalances);
      await saveOfflineSnapshot("inventory:overview", { branches: branchData, branchId: selected, balances: nextBalances });
    } catch (caught) {
      const cached = await readOfflineSnapshot<{ branches: Branch[]; branchId: string; balances: Balance[] }>("inventory:overview");
      if (cached) {
        setBranches(cached.branches);
        setBranchId(cached.branchId);
        setBalances(cached.balances);
        setNotice("Showing the last saved inventory view. New work will remain queued until reconnection.");
      } else setError(caught instanceof ApiError ? caught.message : "Unable to load inventory data. Open this page once while connected before using it offline.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  useEffect(() => {
    if (!branchId || !online) return;
    const refreshLiveBalances = () => {
      void api.get<Balance[]>(`/api/v1/inventory/balances/${branchId}`)
        .then((items) => {
          setBalances(items);
          void saveOfflineSnapshot("inventory:overview", { branches, branchId, balances: items });
        }).catch(() => undefined);
    };
    const timer = window.setInterval(refreshLiveBalances, 30_000);
    window.addEventListener("superstore:sync-complete", refreshLiveBalances);
    window.addEventListener("superstore:live-change", refreshLiveBalances);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("superstore:sync-complete", refreshLiveBalances);
      window.removeEventListener("superstore:live-change", refreshLiveBalances);
    };
  }, [branchId, branches, online]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return balances.filter((row) => matchesProductSearch(row, term));
  }, [balances, query]);

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      branch_id: String(form.get("branch_id")),
      product_id: String(form.get("product_id")),
      quantity: String(form.get("quantity")),
      batch_number: String(form.get("batch_number") || "") || null,
      expiry_date: String(form.get("expiry_date") || "") || null,
      unit_cost: String(form.get("unit_cost") || "") || null,
      source_reference: String(form.get("source_reference") || ""),
      reason: String(form.get("reason") || ""),
      receipt_type: String(form.get("receipt_type") || "adjustment"),
    };
    try {
      if (!online) {
        await enqueue({
          commandId: commandId(),
          commandType: "inventory.receive",
          payload,
        });
        setNotice(
          "Receipt saved offline and will sync when connection returns.",
        );
      } else {
        await api.post("/api/v1/inventory/receive", payload);
        setNotice("Stock receipt posted successfully.");
        await load(payload.branch_id);
      }
      setReceiveOpen(false);
      event.currentTarget.reset();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to post stock receipt.",
      );
    }
  }

  function downloadStockTemplate() {
    const url = URL.createObjectURL(
      new Blob([stockTemplate], { type: "text/csv" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "opening-stock-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importStock(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !importBranchId || !importSourceReference.trim() || !importReason.trim()) return;
    setImporting(true);
    setError("");
    try {
      const items = parseStockCsv(await file.text());
      const result = await api.post<{ received: number }>(
        "/api/v1/inventory/bulk-receive",
        {
          branch_id: importBranchId,
          items,
          source_reference: importSourceReference.trim(),
          reason: importReason.trim(),
        },
      );
      setNotice(
        `${result.received} stock lines received into the selected branch.`,
      );
      setStockImportOpen(false);
      setImportSourceReference("");
      setImportReason("");
      await load(importBranchId);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Unable to import opening stock.",
      );
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  return (
    <DashboardShell
      title="Inventory control"
      subtitle="Stock balances, receipts, batches, transfers, and counts"
    >
      <PermissionGate permission="inventory.read">
        <div className="mx-auto max-w-[1280px] space-y-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">
                Live stock ledger
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Inventory
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void load()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600"
              >
                <RefreshCw size={16} /> Refresh
              </button>
              <button
                onClick={() => {
                  setImportBranchId(branchId);
                  setImportSourceReference("");
                  setImportReason("");
                  setStockImportOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-bold text-teal-700"
              >
                <FileUp size={16} /> Bulk opening stock
              </button>
              <button
                onClick={() => setReceiveOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700"
              >
                <ArrowDownToLine size={16} /> Receive one item
              </button>
            </div>
          </div>
          {error && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold text-slate-400">
                Active products
              </p>
              <p className="mt-2 text-2xl font-bold">
                {balances.length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold text-slate-400">
                Visible balances
              </p>
              <p className="mt-2 text-2xl font-bold">{balances.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold text-slate-400">
                Reorder attention
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-600">
                {
                  balances.filter((row) => Number(row.quantity) <= row.reorder_level).length
                }
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row">
              <FormSelect
                value={branchId}
                onChange={(event) => {
                  setBranchId(event.target.value);
                  void load(event.target.value);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </FormSelect>
              <label className="relative flex-1">
                <Search
                  size={16}
                  className="absolute left-3 top-3 text-slate-400"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search stock code or product"
                  className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500"
                />
              </label>
            </div>
            {busy ? (
              <div className="p-8 text-sm text-slate-500">
                Loading stock balances…
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center">
                <Boxes className="mx-auto text-slate-300" size={32} />
                <p className="mt-3 text-sm font-semibold text-slate-600">
                  No stock balances found
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Select a branch or receive your first stock item.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3">Stock code</th>
                      <th className="px-5 py-3">Quantity</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => {
                      const outOfStock = Number(row.quantity) <= 0;
                      const low = Number(row.quantity) <= row.reorder_level;
                      return (
                        <tr key={row.product_id}>
                          <td className="px-5 py-4 font-semibold text-slate-800">
                            <p>{row.name}</p>
                            {row.manufacturer && <p className="mt-0.5 text-xs font-normal text-slate-500">{row.manufacturer}</p>}
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-slate-600">
                            {row.stock_code}
                          </td>
                          <td className={`px-5 py-4 font-bold ${outOfStock ? "text-rose-700" : ""}`}>
                            {row.quantity}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={
                                outOfStock
                                  ? "rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700"
                                  : low
                                  ? "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
                                  : "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                              }
                            >
                              {outOfStock ? "Out of stock" : low ? "Reorder" : "Healthy"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {receiveOpen && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
              <form
                onSubmit={receive}
                className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold">Receive stock</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Creates an auditable inventory receipt.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReceiveOpen(false)}
                    className="text-sm text-slate-400"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">
                    Branch
                    <FormSelect
                      name="branch_id"
                      required
                      defaultValue={branchId}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Select branch</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </FormSelect>
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Product
                    <FormSelect
                      name="product_id"
                      required
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Select product</option>
                      {balances
                        .map((product) => (
                          <option key={product.product_id} value={product.product_id}>
                            {product.name} ({product.stock_code})
                          </option>
                        ))}
                    </FormSelect>
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Quantity
                    <input
                      name="quantity"
                      type="number"
                      min="0.001"
                      step="0.001"
                      required
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Unit cost
                    <input
                      name="unit_cost"
                      type="number"
                      min="0"
                      step="0.01"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Receipt type
                    <FormSelect name="receipt_type" defaultValue="adjustment" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                      <option value="adjustment">Verified adjustment</option>
                      <option value="opening_balance">Opening balance</option>
                      <option value="donation">Donation / free issue</option>
                    </FormSelect>
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Batch number
                    <input
                      name="batch_number"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Expiry date
                    <input
                      name="expiry_date"
                      type="date"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600 sm:col-span-2">
                    Source reference
                    <input name="source_reference" required minLength={2} placeholder="Count sheet, donor note, or adjustment reference" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs font-bold text-slate-600 sm:col-span-2">
                    Reason / approval note
                    <input name="reason" required minLength={2} placeholder="Why this stock is being received" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                </div>
                <button className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-700">
                  <ArrowDownToLine size={16} />{" "}
                  {online ? (
                    "Post receipt"
                  ) : (
                    <>
                      <WifiOff size={16} /> Save offline
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
          {stockImportOpen && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
              <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-teal-600">
                      Bulk opening stock
                    </p>
                    <h2 className="mt-1 text-xl font-bold">
                      Receive many items at once
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Choose the branch once, then upload stock code, quantity,
                      cost, batch, and expiry for up to 12,000 items.
                    </p>
                  </div>
                  <button
                    onClick={() => setStockImportOpen(false)}
                    className="p-2 text-slate-400"
                  >
                    <X size={18} />
                  </button>
                </div>
                <label className="mt-5 block text-xs font-bold text-slate-600">
                  Branch
                  <FormSelect
                    value={importBranchId}
                    onChange={(event) => setImportBranchId(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  >
                    <option value="">Select branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </option>
                    ))}
                  </FormSelect>
                </label>
                <label className="mt-4 block text-xs font-bold text-slate-600">
                  Source reference
                  <input value={importSourceReference} onChange={(event) => setImportSourceReference(event.target.value)} minLength={2} required placeholder="Opening stock count reference" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
                <label className="mt-4 block text-xs font-bold text-slate-600">
                  Reason / approval note
                  <input value={importReason} onChange={(event) => setImportReason(event.target.value)} minLength={2} required placeholder="Why this opening stock is being loaded" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
                <button
                  onClick={downloadStockTemplate}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
                >
                  <Download size={16} /> Download stock CSV template
                </button>
                <label className="mt-4 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 p-7 text-center hover:border-teal-400">
                  <Upload size={28} className="text-teal-600" />
                  <span className="mt-3 text-sm font-bold text-slate-700">
                    {importing ? "Receiving stock…" : "Choose stock CSV"}
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    stock code, quantity, unit cost, batch, expiry
                  </span>
                  <input
                    disabled={!importBranchId || !importSourceReference.trim() || !importReason.trim() || importing}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={importStock}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
          )}
          <InventoryTransferPanel />
          <InventoryCountPanel />
          <InventoryWriteOffPanel />
          <InventoryHealthPanel />
        </div>
      </PermissionGate>
    </DashboardShell>
  );
}

type WriteOffBatch = { product_id: string; stock_code: string; name: string; batch_number: string; quantity: string; unit_cost: string; expiry_date: string | null };
type WriteOff = { id: string; name: string; stock_code: string; batch_number: string; quantity: string; amount: string; reason: string; condition: string; created_at: string };

function InventoryTransferPanel() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [balances, setBalances] = useState<Balance[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void api.get<Branch[]>("/api/v1/catalog/branches").then((items) => { setBranches(items); setSourceBranchId(items[0]?.id || ""); }).catch(() => undefined); }, []);
  useEffect(() => {
    if (!sourceBranchId) return;
    void api.get<Balance[]>(`/api/v1/inventory/balances/${sourceBranchId}`).then((items) => {
      setBalances(items); setProductId(""); setBatchNumber("");
    }).catch(() => setBalances([]));
  }, [sourceBranchId]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await api.post("/api/v1/inventory/transfers", {
        source_branch_id: sourceBranchId, destination_branch_id: destinationBranchId,
        reference: reference.trim() || null,
        lines: [{ product_id: productId, quantity, batch_number: batchNumber.trim() || null }],
      });
      setNotice("Transfer posted. The source batch and cost were preserved at the destination.");
      setProductId(""); setQuantity(""); setBatchNumber(""); setReference("");
      setBalances(await api.get<Balance[]>(`/api/v1/inventory/balances/${sourceBranchId}`));
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to post stock transfer."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-sky-700">Inter-branch stock</p><h2 className="mt-1 text-xl font-bold">Transfer inventory</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Move stock between branches. Choose an exact batch when required; otherwise stock is allocated by earliest usable expiry first.</p></div><ArrowRightLeft className="text-sky-600" /></div>{error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}{notice && <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}<form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><AppSelect value={sourceBranchId} onChange={setSourceBranchId} options={[{ value: "", label: "From branch" }, ...branches.map((branch) => ({ value: branch.id, label: `From: ${branch.name}` }))]} placeholder="From branch" /><AppSelect value={destinationBranchId} onChange={setDestinationBranchId} options={[{ value: "", label: "To branch" }, ...branches.filter((branch) => branch.id !== sourceBranchId).map((branch) => ({ value: branch.id, label: `To: ${branch.name}` }))]} placeholder="To branch" /><AppSelect value={productId} onChange={setProductId} options={[{ value: "", label: "Select product" }, ...balances.filter((item) => Number(item.quantity) > 0).map((item) => ({ value: item.product_id, label: `${item.name} · ${item.quantity} available` }))]} placeholder="Select product" /><input required value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="0.001" step="0.001" placeholder="Quantity" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" /><input value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} placeholder="Batch number (optional — otherwise FEFO)" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm md:col-span-2 xl:col-span-3" /><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Transfer note / dispatch reference" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" /><button disabled={busy || !sourceBranchId || !destinationBranchId || !productId} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-40">{busy ? "Posting transfer…" : "Post transfer"}</button></form></section>;
}

function InventoryCountPanel() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [balances, setBalances] = useState<Balance[]>([]);
  const [productId, setProductId] = useState("");
  const [countedQuantity, setCountedQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const selected = balances.find((item) => item.product_id === productId);
  useEffect(() => { void api.get<Branch[]>("/api/v1/catalog/branches").then((items) => { setBranches(items); setBranchId(items[0]?.id || ""); }).catch(() => undefined); }, []);
  useEffect(() => {
    if (!branchId) return;
    void api.get<Balance[]>(`/api/v1/inventory/balances/${branchId}`).then((items) => { setBalances(items); setProductId(""); }).catch(() => setBalances([]));
  }, [branchId]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await api.post("/api/v1/inventory/counts", { branch_id: branchId, notes: notes.trim() || null, lines: [{ product_id: productId, counted_quantity: countedQuantity }] });
      setNotice("Stock count posted. Any shortage was removed from its real FEFO batches; any surplus is marked unbatched for follow-up.");
      setCountedQuantity(""); setNotes(""); setProductId("");
      setBalances(await api.get<Balance[]>(`/api/v1/inventory/balances/${branchId}`));
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to post stock count."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-700">Physical verification</p><h2 className="mt-1 text-xl font-bold">Post a stock count</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Record a verified physical count. Each posting keeps an audit trail and automatically creates the required inventory variance movement.</p></div><ClipboardCheck className="text-violet-600" /></div>{error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}{notice && <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}<form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><AppSelect value={branchId} onChange={setBranchId} options={[{ value: "", label: "Select branch" }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]} placeholder="Select branch" /><AppSelect value={productId} onChange={setProductId} options={[{ value: "", label: "Select product" }, ...balances.map((item) => ({ value: item.product_id, label: `${item.name} · book ${item.quantity}` }))]} placeholder="Select product" /><input required value={countedQuantity} onChange={(event) => setCountedQuantity(event.target.value)} type="number" min="0" step="0.001" placeholder="Physical quantity" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" /><button disabled={busy || !branchId || !productId} className="min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-40">{busy ? "Posting count…" : "Post count"}</button><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Count sheet or investigation note (recommended)" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm md:col-span-2 xl:col-span-4" /></form>{selected && countedQuantity !== "" && <p className="mt-3 text-xs text-slate-500">Book quantity: <strong>{selected.quantity}</strong> · Variance: <strong>{Number(countedQuantity) - Number(selected.quantity)}</strong></p>}</section>;
}

function InventoryWriteOffPanel() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [batches, setBatches] = useState<WriteOffBatch[]>([]);
  const [batchKey, setBatchKey] = useState("");
  const [quantity, setQuantity] = useState("");
  const [condition, setCondition] = useState("expired");
  const [reason, setReason] = useState("");
  const [records, setRecords] = useState<WriteOff[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const selectedBatch = batches.find((item) => `${item.product_id}:${item.batch_number}` === batchKey);
  const money = (value: string) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(value) || 0);
  useEffect(() => { void api.get<Branch[]>("/api/v1/catalog/branches").then((items) => { setBranches(items); setBranchId(items[0]?.id || ""); }).catch(() => undefined); }, []);
  useEffect(() => {
    if (!branchId) return;
    void Promise.all([api.get<WriteOffBatch[]>(`/api/v1/inventory/batches/${branchId}`), api.get<WriteOff[]>(`/api/v1/inventory/write-offs/${branchId}`)])
      .then(([batchData, recordData]) => { setBatches(batchData); setRecords(recordData); setBatchKey(""); })
      .catch(() => { setBatches([]); setRecords([]); });
  }, [branchId]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedBatch) { setError("Choose the exact product batch to write off."); return; }
    setBusy(true); setError("");
    try {
      const result = await api.post<{ amount: string }>("/api/v1/inventory/write-offs", { branch_id: branchId, product_id: selectedBatch.product_id, batch_number: selectedBatch.batch_number, quantity, condition, reason });
      setNotice(`${selectedBatch.name} written off for ${money(result.amount)}. Inventory and accounting have been updated.`);
      setQuantity(""); setReason(""); setBatchKey("");
      const [batchData, recordData] = await Promise.all([api.get<WriteOffBatch[]>(`/api/v1/inventory/batches/${branchId}`), api.get<WriteOff[]>(`/api/v1/inventory/write-offs/${branchId}`)]);
      setBatches(batchData); setRecords(recordData);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to post inventory write-off."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border border-rose-100 bg-white p-6 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-rose-600">Expired & damaged goods</p><h2 className="mt-1 text-xl font-bold">Inventory write-off</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Use this only for stock already in the store. It removes the selected batch, records the reason, and posts: debit expired/damaged stock expense; credit inventory asset.</p></div><span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">Accounting linked</span></div>
    {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}{notice && <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
    <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><AppSelect value={branchId} onChange={setBranchId} options={branches.map((branch) => ({ value: branch.id, label: `${branch.name} (${branch.code})` }))} placeholder="Select branch" /><AppSelect value={batchKey} onChange={setBatchKey} options={[{ value: "", label: "Select product batch" }, ...batches.map((batch) => ({ value: `${batch.product_id}:${batch.batch_number}`, label: `${batch.name} · ${batch.batch_number} · ${batch.quantity} left${batch.expiry_date ? ` · exp ${batch.expiry_date}` : ""}` }))]} placeholder="Select product batch" /><input required value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="0.001" max={selectedBatch?.quantity} step="0.001" placeholder="Quantity to write off" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100" /><AppSelect value={condition} onChange={setCondition} options={[{ value: "expired", label: "Expired goods" }, { value: "damaged", label: "Damaged goods" }, { value: "lost", label: "Lost / destroyed stock" }]} />
      <input required minLength={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason / disposal reference" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100 md:col-span-2 xl:col-span-3" /><button disabled={busy || !selectedBatch} className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-40">{busy ? "Posting write-off…" : "Post write-off"}</button></form>
    {selectedBatch && <p className="mt-3 text-xs text-slate-500">Available in selected batch: <strong>{selectedBatch.quantity}</strong> · Cost impact: <strong>{money(String(Number(quantity || 0) * Number(selectedBatch.unit_cost)))}</strong></p>}
    <div className="mt-6 overflow-x-auto"><table className="min-w-[700px] w-full text-left text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2.5">Item / batch</th><th className="px-3 py-2.5">Condition</th><th className="px-3 py-2.5">Quantity</th><th className="px-3 py-2.5">Expense</th><th className="px-3 py-2.5">Reason</th><th className="px-3 py-2.5">Date</th></tr></thead><tbody className="divide-y divide-slate-100">{records.slice(0, 8).map((item) => <tr key={item.id}><td className="px-3 py-3"><p className="font-bold">{item.name}</p><p className="font-mono text-xs text-slate-400">{item.stock_code} · {item.batch_number}</p></td><td className="px-3 py-3 capitalize text-rose-700">{item.condition}</td><td className="px-3 py-3 font-bold">{item.quantity}</td><td className="px-3 py-3 font-bold">{money(item.amount)}</td><td className="px-3 py-3 text-slate-600">{item.reason}</td><td className="px-3 py-3 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</td></tr>)}</tbody></table>{!records.length && <p className="py-6 text-center text-sm text-slate-500">No stock write-offs recorded for this branch.</p>}</div>
  </section>;
}

function InventoryHealthPanel() {
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [health, setHealth] = useState<{
    low_stock: Array<{
      stock_code: string;
      name: string;
      quantity: string;
      reorder_level: number;
    }>;
    expiry_alerts: Array<{
      stock_code: string;
      name: string;
      batch_number: string;
      expiry_date: string;
      expired: boolean;
    }>;
    expired_count: number;
  } | null>(null);
  useEffect(() => {
    void api
      .get<Branch[]>("/api/v1/catalog/branches")
      .then((items) => {
        setBranches(items);
        setBranchId(items[0]?.id || "");
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (branchId)
      void api
        .get<typeof health>(`/api/v1/inventory/health/${branchId}`)
        .then(setHealth)
        .catch(() => setHealth(null));
  }, [branchId]);
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-teal-600">
            Stock health
          </p>
          <h2 className="mt-1 text-xl font-bold">
            Reorder and expiry watchlist
          </h2>
        </div>
        <AppSelect
          value={branchId}
          onChange={setBranchId}
          aria-label="Choose branch for stock health"
          className="sm:w-60"
          options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
        />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-sm font-bold text-amber-700">
            {health?.low_stock.length || 0} products need replenishment
          </p>
          <div className="mt-3 space-y-2">
            {health?.low_stock.slice(0, 6).map((item) => (
              <div
                key={item.stock_code}
                className="flex justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm"
              >
                <span className="font-semibold">{item.name}</span>
                <span>
                  {item.quantity} / {item.reorder_level}
                </span>
              </div>
            ))}
            {!health?.low_stock.length && (
              <p className="text-sm text-slate-500">No reorder alerts.</p>
            )}
          </div>
        </div>
        <div>
          <p
            className={`text-sm font-bold ${health?.expired_count ? "text-rose-700" : "text-teal-700"}`}
          >
            {health?.expiry_alerts.length || 0} expiry alerts ·{" "}
            {health?.expired_count || 0} expired
          </p>
          <div className="mt-3 space-y-2">
            {health?.expiry_alerts.slice(0, 6).map((item) => (
              <div
                key={`${item.stock_code}-${item.batch_number}`}
                className={`flex justify-between rounded-xl px-3 py-2 text-sm ${item.expired ? "bg-rose-50" : "bg-slate-50"}`}
              >
                <span className="font-semibold">
                  {item.name} · {item.batch_number}
                </span>
                <span>{item.expiry_date}</span>
              </div>
            ))}
            {!health?.expiry_alerts.length && (
              <p className="text-sm text-slate-500">
                No expiring batches in the next 90 days.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
