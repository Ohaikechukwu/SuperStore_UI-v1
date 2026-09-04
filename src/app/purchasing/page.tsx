"use client";

import FormSelect from "@/components/form-select";

import {
  Children,
  cloneElement,
  FormEvent,
  isValidElement,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import AppSelect from "@/components/app-select";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";
import { hasExactProductCode } from "@/lib/product-search";
import { can, type AuthorizationContext } from "@/lib/authorization";

type Branch = { id: string; name: string; code: string };
type Supplier = {
  id: string;
  name: string;
  code: string;
  payment_terms_days: number;
  active: boolean;
};
type Product = {
  id: string;
  name: string;
  manufacturer?: string | null;
  stock_code: string;
  barcode?: string | null;
  category: string;
  unit: string;
  selling_price: string;
  cost_price: string;
  pricing_method?: "manual" | "multiplier" | "markup_rate";
  markup_value?: string | null;
  reorder_level: number;
  controlled: boolean;
  active: boolean;
};
type ProductSearchPage = { items: Product[]; total: number; limit: number; offset: number; has_more: boolean };
type OrderLine = {
  id: string;
  product_id: string;
  product_name: string;
  manufacturer?: string | null;
  stock_code: string;
  ordered_quantity: string;
  received_quantity: string;
  unit_cost: string;
  batch_number: string | null;
  expiry_date: string | null;
};
type Order = {
  id: string;
  order_number: string;
  branch_id: string;
  supplier_id: string;
  status: string;
  subtotal: string;
  supplier_invoice_number: string | null;
  delivery_note_number: string | null;
  supplier_invoice_total: string | null;
  lines: OrderLine[];
};
type QueueOrder = {
  id: string;
  order_number: string;
  supplier_name: string;
  status: string;
  subtotal: string;
  supplier_invoice_number: string | null;
  delivery_note_number: string | null;
  supplier_invoice_total: string | null;
  created_at: string;
};
type Confirmation = { title: string; message: string; confirmLabel: string; tone?: "danger" | "primary"; onConfirm: () => void };

const money = (value: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(
    value || 0,
  );

function failure(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function purchaseStatusLabel(status: string) {
  return status === "approved" ? "awaiting receipt" : status.replaceAll("_", " ");
}

export default function PurchasingPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState("");
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [itemName, setItemName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [stockCode, setStockCode] = useState("");
  const [stockCodeFocused, setStockCodeFocused] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [pricingMethod, setPricingMethod] = useState<"multiplier" | "markup_rate">("multiplier");
  const [markupValue, setMarkupValue] = useState("");
  const [category, setCategory] = useState("general");
  const [unit, setUnit] = useState("unit");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [controlled, setControlled] = useState(false);
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [queueVersion, setQueueVersion] = useState(0);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [canManagePostedOrders, setCanManagePostedOrders] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.get<Branch[]>("/api/v1/catalog/branches"),
      api.get<Supplier[]>("/api/v1/purchasing/suppliers?include_inactive=true"),
      api.get<AuthorizationContext>("/api/v1/auth/me/authorization"),
    ])
      .then(([branchData, supplierData, authorization]) => {
        if (!active) return;
        setBranches(branchData);
        setSuppliers(supplierData);
        setProducts([]);
        setBranchId(branchData[0]?.id || "");
        setSupplierId(supplierData.find((supplier) => supplier.active)?.id || "");
        setCanManagePostedOrders(can(authorization, "purchasing.orders.rollback"));
      })
      .catch(
        (caught) =>
          active &&
          setError(failure(caught, "Unable to load purchasing data.")),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const computedTotal = useMemo(
    () =>
      order?.lines.reduce(
        (total, line) =>
          total + Number(line.ordered_quantity) * Number(line.unit_cost),
        0,
      ) || 0,
    [order],
  );
  const invoiceAmount = Number(order?.supplier_invoice_total || 0);
  const difference = invoiceAmount - computedTotal;
  const matching =
    order && Math.abs(difference) < 0.005 && order.lines.length > 0;
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) || null;
  const productLookup = search.trim() || stockCode.trim();
  const visibleProducts = useMemo(
    () => products.slice(0, 8),
    [products],
  );
  useEffect(() => {
    const term = productLookup.trim();
    if (!term || selectedProduct) {
      const clear = window.setTimeout(() => setProducts([]), 0);
      return () => window.clearTimeout(clear);
    }
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ query: term, limit: "8", include_inactive: "false" });
      void api.get<ProductSearchPage>("/api/v1/catalog/products?" + params.toString())
        .then((result) => active && setProducts(result.items))
        .catch(() => active && setProducts([]));
    }, 140);
    return () => { active = false; window.clearTimeout(timer); };
  }, [productLookup, selectedProduct]);
  const calculatedSellingPrice = useMemo(() => {
    const cost = Number(unitCost);
    const markup = Number(markupValue);
    if (!unitCost || markupValue === "" || Number.isNaN(cost) || Number.isNaN(markup)) return "";
    const selling = pricingMethod === "multiplier" ? cost * markup : cost * (1 + markup);
    return selling >= 0 ? selling.toFixed(2) : "";
  }, [unitCost, markupValue, pricingMethod]);

  function resetItem() {
    setSearch("");
    setSelectedProduct(null);
    setItemName("");
    setManufacturer("");
    setStockCode("");
    setStockCodeFocused(false);
    setQuantity("1");
    setUnitCost("");
    setPricingMethod("multiplier");
    setMarkupValue("");
    setCategory("general");
    setUnit("unit");
    setReorderLevel("0");
    setControlled(false);
    setBatchNumber("");
    setExpiryDate("");
    setItemOpen(false);
  }

  function chooseProduct(product: Product) {
    setSelectedProduct(product);
    setSearch(`${product.name} · ${product.stock_code}`);
    setItemName(product.name);
    setManufacturer(product.manufacturer || "");
    setStockCode(product.stock_code);
    setUnitCost(product.cost_price);
    setPricingMethod(product.pricing_method === "markup_rate" ? "markup_rate" : "multiplier");
    setMarkupValue(product.markup_value || "");
    setCategory(product.category);
    setUnit(product.unit);
    setReorderLevel(String(product.reorder_level));
    setControlled(product.controlled);
  }
  async function chooseExactProduct(stockCodeValue: string) {
    const code = stockCodeValue.trim();
    if (!code) return;
    try {
      const result = await api.get<ProductSearchPage>("/api/v1/catalog/products?query=" + encodeURIComponent(code) + "&limit=8&include_inactive=false");
      const match = result.items.find((product) => product.active && hasExactProductCode(product, code));
      if (match) chooseProduct(match);
      else setError("No active product has that stock code. Continue to create it on this PO.");
    } catch (caught) { setError(failure(caught, "Unable to find that stock code.")); }
  }

  async function startInvoice(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!selectedSupplier) {
      setError("Select a supplier before starting invoice entry.");
      return;
    }
    if (!selectedSupplier.active) {
      setError(`${selectedSupplier.name} is an inactive supplier. Contact an administrator for clarification.`);
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<{
        purchase_order_id: string;
        order_number: string;
      }>("/api/v1/purchasing/orders/invoice-draft", {
        branch_id: branchId,
        supplier_id: supplierId,
        supplier_invoice_number: supplierInvoiceNumber.trim() || null,
        delivery_note_number: deliveryNoteNumber.trim() || null,
        supplier_invoice_total: invoiceTotal,
        notes: notes || null,
      });
      const detail = await api.get<Order>(
        `/api/v1/purchasing/orders/${result.purchase_order_id}`,
      );
      setOrder(detail);
      setSupplierInvoiceNumber(detail.supplier_invoice_number || "");
      setDeliveryNoteNumber(detail.delivery_note_number || "");
      setQueueVersion((value) => value + 1);
      setNotice(
        `${result.order_number} is open. Check and enter each invoice item.`,
      );
    } catch (caught) {
      setError(failure(caught, "Unable to start the supplier invoice."));
    } finally {
      setBusy(false);
    }
  }

  function continueToDetails(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (
      !itemName.trim() ||
      !quantity ||
      Number(quantity) <= 0 ||
      !unitCost ||
      Number(unitCost) < 0
    ) {
      setError(
        "Enter the item name, quantity, and unit cost from the supplier invoice.",
      );
      return;
    }
    setItemOpen(true);
  }

  async function saveInvoiceItem(event: FormEvent) {
    event.preventDefault();
    if (!order) return;
    setError("");
    setBusy(true);
    try {
      const detail = await api.post<Order>(
        `/api/v1/purchasing/orders/${order.id}/invoice-lines`,
        {
          product_id: selectedProduct?.id || null,
          stock_code: stockCode.trim() || null,
          name: itemName.trim(),
          manufacturer: manufacturer.trim() || null,
          quantity,
          unit_cost: unitCost,
          selling_price: calculatedSellingPrice,
          pricing_method: pricingMethod,
          markup_value: markupValue,
          category,
          unit,
          reorder_level: Number(reorderLevel || 0),
          controlled,
          batch_number: batchNumber.trim() || null,
          expiry_date: expiryDate || null,
        },
      );
      setOrder(detail);
      setProducts([]);
      setNotice(
        "Item saved to the invoice. It is not in available stock until this invoice balances and is posted.",
      );
      resetItem();
    } catch (caught) {
      setError(failure(caught, "Unable to save this invoice item."));
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(lineId: string) {
    if (!order) return;
    setError("");
    setBusy(true);
    try {
      setOrder(
        await api.delete<Order>(
          `/api/v1/purchasing/orders/${order.id}/invoice-lines/${lineId}`,
        ),
      );
      setNotice("Invoice item removed.");
    } catch (caught) {
      setError(failure(caught, "Unable to remove this invoice item."));
    } finally {
      setBusy(false);
    }
  }

  async function saveInvoiceHeader(event: FormEvent) {
    event.preventDefault();
    if (!order) return;
    setError("");
    setBusy(true);
    try {
      await api.patch(`/api/v1/purchasing/orders/${order.id}/invoice`, {
        supplier_invoice_number: supplierInvoiceNumber.trim() || order.supplier_invoice_number,
        delivery_note_number: deliveryNoteNumber.trim() || null,
        supplier_invoice_total: invoiceTotal,
        notes: notes || null,
      });
      setOrder(await api.get<Order>(`/api/v1/purchasing/orders/${order.id}`));
      setNotice("Supplier invoice figures updated.");
    } catch (caught) {
      setError(failure(caught, "Unable to update the supplier invoice."));
    } finally {
      setBusy(false);
    }
  }

  async function receiveAllInvoiceStock() {
    if (!order || !matching) return;
    setError("");
    setBusy(true);
    try {
      const result = await api.post<{ status: string; received_total: string }>(
        `/api/v1/purchasing/orders/${order.id}/post-invoice`,
        {},
      );
      setOrder((current) =>
        current
          ? {
              ...current,
              status: result.status,
              lines: current.lines.map((line) => ({
                ...line,
                received_quantity: line.ordered_quantity,
              })),
            }
          : current,
      );
      setQueueVersion((value) => value + 1);
      setNotice(
        `${order.order_number} received in full. ${money(Number(result.received_total))} is now in inventory.`,
      );
    } catch (caught) {
      setError(failure(caught, "Unable to receive this supplier invoice."));
    } finally {
      setBusy(false);
    }
  }

  async function postInvoiceForLaterReceipt() {
    if (!order || !matching) return;
    setError("");
    setBusy(true);
    try {
      const result = await api.post<{ status: string }>(
        `/api/v1/purchasing/orders/${order.id}/post-for-receipt`, {},
      );
      setOrder((current) => current ? { ...current, status: result.status } : current);
      setQueueVersion((value) => value + 1);
      setNotice(`${order.order_number} is posted and awaiting stock receipt. Inventory has not changed.`);
    } catch (caught) {
      setError(failure(caught, "Unable to post this supplier invoice for later receipt."));
    } finally {
      setBusy(false);
    }
  }

  async function receiveOrder(lines: Array<{ line_id: string; quantity: string; batch_number: string | null; expiry_date: string | null }>) {
    if (!order) return;
    setError("");
    setBusy(true);
    try {
      const result = await api.post<{ status: string; received_total: string }>(
        `/api/v1/purchasing/orders/${order.id}/receive`, { lines },
      );
      if (result.status === "received") {
        setOrder((current) =>
          current
            ? {
                ...current,
                status: result.status,
                lines: current.lines.map((line) => {
                  const receipt = lines.find((item) => item.line_id === line.id);
                  return receipt
                    ? {
                        ...line,
                        received_quantity: String(
                          Number(line.received_quantity) + Number(receipt.quantity),
                        ),
                      }
                    : line;
                }),
              }
            : current,
        );
      } else {
        setOrder(await api.get<Order>(`/api/v1/purchasing/orders/${order.id}`));
      }
      setQueueVersion((value) => value + 1);
      setReceiveOpen(false);
      setNotice(`${order.order_number} ${result.status === "received" ? "is fully received" : "is partially received"}. ${money(Number(result.received_total))} was added to inventory.`);
    } catch (caught) {
      setError(failure(caught, "Unable to receive this stock."));
    } finally {
      setBusy(false);
    }
  }

  async function rollbackToDraft() {
    if (!order) return;
    setError("");
    setBusy(true);
    try {
      await api.post(`/api/v1/purchasing/orders/${order.id}/rollback-to-draft`, { reason: "Invoice needs correction before stock receipt" });
      setOrder(await api.get<Order>(`/api/v1/purchasing/orders/${order.id}`));
      setQueueVersion((value) => value + 1);
      setNotice(`${order.order_number} was returned to Draft. Update it, then post it again when ready.`);
    } catch (caught) {
      setError(failure(caught, "Unable to roll this purchase order back to Draft."));
    } finally {
      setBusy(false);
    }
  }

  function requestRemoveLine(lineId: string) {
    setConfirmation({
      title: "Remove invoice item?",
      message: "This removes the item from the draft supplier invoice. You can add it again if needed.",
      confirmLabel: "Remove item",
      tone: "danger",
      onConfirm: () => { setConfirmation(null); void removeLine(lineId); },
    });
  }

  function requestPostInvoice() {
    if (!order || !matching) return;
    setConfirmation({
      title: "Post invoice for later receipt?",
      message: "This locks the balanced invoice for inventory receiving, but does not add stock or post a supplier payable yet.",
      confirmLabel: "Post and await receipt",
      onConfirm: () => { setConfirmation(null); void postInvoiceForLaterReceipt(); },
    });
  }

  function requestReceiveAllInvoiceStock() {
    if (!order || !matching) return;
    setConfirmation({
      title: "Receive all stock now?",
      message: "This will receive every invoice line into inventory, create the supplier payable, and lock the completed invoice.",
      confirmLabel: "Receive all stock",
      onConfirm: () => { setConfirmation(null); void receiveAllInvoiceStock(); },
    });
  }

  function requestRollbackToDraft() {
    if (!order) return;
    setConfirmation({
      title: "Return this invoice to Draft?",
      message: "No stock has been received, so this administrator correction is safe. The reason and status change will be recorded in the audit log.",
      confirmLabel: "Return to Draft",
      tone: "danger",
      onConfirm: () => { setConfirmation(null); void rollbackToDraft(); },
    });
  }

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      const supplier = await api.post<Supplier>(
        "/api/v1/purchasing/suppliers",
        {
          name: String(form.get("name")),
          contact_name: String(form.get("contact_name") || "") || null,
          phone: String(form.get("phone") || "") || null,
          email: String(form.get("email") || "") || null,
          payment_terms_days: Number(form.get("payment_terms_days") || 0),
        },
      );
      setSuppliers((items) => items.concat(supplier));
      setSupplierId(supplier.id);
      setSupplierOpen(false);
      setNotice(`Supplier ${supplier.name} created.`);
    } catch (caught) {
      setError(failure(caught, "Unable to create supplier."));
    } finally {
      setBusy(false);
    }
  }

  async function openOrder(id: string) {
    try {
      const detail = await api.get<Order>(`/api/v1/purchasing/orders/${id}`);
      setOrder(detail);
      setSupplierInvoiceNumber(detail.supplier_invoice_number || "");
      setDeliveryNoteNumber(detail.delivery_note_number || "");
      setInvoiceTotal(detail.supplier_invoice_total || "");
      setNotice("");
      setError("");
    } catch (caught) {
      setError(failure(caught, "Unable to open this purchase order."));
    }
  }

  function startAnother() {
    setOrder(null);
    setSupplierInvoiceNumber("");
    setDeliveryNoteNumber("");
    setInvoiceTotal("");
    setNotes("");
    resetItem();
    setNotice("");
    setError("");
  }

  return (
    <DashboardShell
      title="Purchasing"
      subtitle="Invoice-checked receiving, inventory details, and supplier reconciliation"
    >
      <PermissionGate permission="purchasing.read">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">
                Invoice receiving
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Purchase orders that match the supplier invoice
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Start one PO for one supplier invoice. Check items one at a
                time, complete their inventory details, then post only when the
                invoice total and entered total agree.
              </p>
            </div>
            {order && (
              <button
                onClick={startAnother}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"
              >
                <Plus size={16} /> Start another invoice
              </button>
            )}
          </div>
          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {notice}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-6">
          {!order ? (
              <form
                onSubmit={startInvoice}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-teal-700">
                    <FileText size={22} />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold">
                      1. Start from the supplier invoice
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Nothing enters stock yet. This creates the invoice&apos;s
                      draft PO.
                    </p>
                  </div>
                </div>
                <div className="mt-7 grid gap-5 sm:grid-cols-2">
                  <Field label="Receiving branch">
                    <FormSelect
                      required
                      value={branchId}
                      onChange={(event) => setBranchId(event.target.value)}
                    >
                      <option value="">Select branch</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name} ({branch.code})
                        </option>
                      ))}
                    </FormSelect>
                  </Field>
                  <Field label="Supplier">
                    <div className="flex gap-2">
                      <FormSelect
                        required
                        value={supplierId}
                        onChange={(event) => {
                          const supplier = suppliers.find((item) => item.id === event.target.value);
                          if (supplier && !supplier.active) {
                            setSupplierId("");
                            setError(`${supplier.name} is an inactive supplier. Contact an administrator for clarification.`);
                            return;
                          }
                          setSupplierId(event.target.value);
                        }}
                      >
                        <option value="">Select supplier</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name} ({supplier.code}){supplier.active ? "" : " — Inactive; contact administrator"}
                          </option>
                        ))}
                      </FormSelect>
                      <button
                        type="button"
                        title="New supplier"
                        onClick={() => setSupplierOpen(true)}
                        className="rounded-xl border border-slate-200 px-3 text-teal-700"
                      >
                        <Plus size={17} />
                      </button>
                    </div>
                  </Field>
                  <Field label="Supplier invoice number">
                    <input value={supplierInvoiceNumber} onChange={(event) => setSupplierInvoiceNumber(event.target.value)} placeholder="Supplier's actual invoice number (optional)" />
                  </Field>
                  <Field label="Delivery note / GRN reference">
                    <input value={deliveryNoteNumber} onChange={(event) => setDeliveryNoteNumber(event.target.value)} placeholder="Supplier delivery note number" />
                  </Field>
                  <Field label="Invoice total">
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={invoiceTotal}
                      onChange={(event) => setInvoiceTotal(event.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Notes (optional)">
                    <input
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Delivery note or invoice remarks"
                    />
                  </Field>
                </div>
                <button
                  disabled={
                    loading || busy || !branches.length || !suppliers.some((supplier) => supplier.active)
                  }
                  className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  <ClipboardList size={17} /> Start invoice entry
                </button>
              </form>
          ) : (
            <>
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-600">
                      Open supplier invoice
                    </p>
                    <h2 className="mt-1 text-2xl font-bold">
                      {order.order_number}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Invoice {order.supplier_invoice_number || "not recorded"}{" "}
                      · {purchaseStatusLabel(order.status)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Summary
                      label="Invoice total"
                      value={money(invoiceAmount)}
                    />
                    <Summary
                      label="Entered items"
                      value={money(computedTotal)}
                    />
                    <Summary
                      label="Difference"
                      value={money(difference)}
                      bad={!matching}
                    />
                    <Summary
                      label="Items checked"
                      value={String(order.lines.length)}
                    />
                  </div>
                </div>
                {order.status === "draft" ? (
                  <form
                    onSubmit={saveInvoiceHeader}
                    className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2"
                  >
                    <input
                      required
                      value={supplierInvoiceNumber}
                      onChange={(event) => setSupplierInvoiceNumber(event.target.value)}
                      placeholder="Supplier invoice number"
                    />
                    <input
                      value={deliveryNoteNumber}
                      onChange={(event) => setDeliveryNoteNumber(event.target.value)}
                      placeholder="Delivery note / GRN reference"
                    />
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={invoiceTotal}
                      onChange={(event) => setInvoiceTotal(event.target.value)}
                      placeholder="Invoice total"
                    />
                    <button
                      disabled={busy}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-40 sm:col-span-2"
                    >
                      Update invoice figures
                    </button>
                  </form>
                ) : (
                  <p className="mt-5 border-t border-slate-100 pt-5 text-sm text-slate-500">
                    This invoice is posted and its figures are locked. An administrator can return an unreceived invoice to Draft for correction.
                  </p>
                )}
              </section>
              {order.status === "draft" && (
                <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
                  <form
                    onSubmit={continueToDetails}
                    className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
                        <PackagePlus size={22} />
                      </span>
                      <div>
                        <h2 className="text-xl font-bold">
                          2. Check and enter one invoice item
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Enter the name, cost price, and quantity exactly as
                          printed on the supplier invoice.
                        </p>
                      </div>
                    </div>
                    <div className="relative mt-6">
                      <label className="block text-xs font-bold text-slate-600">
                        Find an existing product (optional)
                      </label>
                      <Search
                        size={15}
                        className="absolute left-3 top-8 text-slate-400"
                      />
                      <input
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          if (selectedProduct) setSelectedProduct(null);
                        }}
                        className="mt-1 pl-9"
                        placeholder="Search by item name or stock code"
                      />
                      {search && !selectedProduct && (
                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                          {visibleProducts.map((product) => (
                            <button
                              type="button"
                              onClick={() => chooseProduct(product)}
                              key={product.id}
                              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-teal-50"
                            >
                              <span className="font-bold">{product.name}</span>
                              <span className="ml-2 font-mono text-xs text-slate-500">
                                {product.stock_code}
                              </span>
                            </button>
                          ))}
                          {!visibleProducts.length && (
                            <p className="px-3 py-2 text-sm text-slate-500">
                              No existing product found. Enter it as a new item
                              below.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <Field label="Item name">
                        <input
                          required
                          value={itemName}
                          readOnly={Boolean(selectedProduct)}
                          onChange={(event) => setItemName(event.target.value)}
                          placeholder="Item name from invoice"
                        />
                      </Field>
                      <div className="relative">
                        <Field label={selectedProduct ? "Stock code" : "Stock code (optional for a new item)"}>
                          <input
                            value={stockCode}
                            readOnly={Boolean(selectedProduct)}
                            onFocus={() => setStockCodeFocused(true)}
                            onBlur={() => setStockCodeFocused(false)}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              event.preventDefault();
                              void chooseExactProduct(event.currentTarget.value);
                            }}
                            onChange={(event) => {
                              setStockCode(event.target.value);
                              setSearch("");
                              if (selectedProduct) setSelectedProduct(null);
                            }}
                            placeholder="Scan or enter a pack/manual code"
                          />
                          <p className="mt-1 text-[11px] font-normal text-slate-400">
                            Type or scan to find an existing product. If blank, the system creates a reference code from the product name.
                          </p>
                        </Field>
                        {stockCode && !selectedProduct && stockCodeFocused && (
                          <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                            {visibleProducts.map((product) => (
                              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseProduct(product)} key={product.id} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-teal-50">
                                <span className="font-bold">{product.name}</span><span className="ml-2 font-mono text-xs text-slate-500">{product.stock_code}</span>
                              </button>
                            ))}
                            {!visibleProducts.length && <p className="px-3 py-2 text-sm text-slate-500">No matching stock code. Continue to create a new PO item.</p>}
                          </div>
                        )}
                      </div>
                      <Field label="Quantity">
                        <input
                          required
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={quantity}
                          onChange={(event) => setQuantity(event.target.value)}
                        />
                      </Field>
                      <Field label="Unit cost">
                        <input
                          required
                          type="number"
                          min="0"
                          step="0.01"
                          value={unitCost}
                          onChange={(event) => setUnitCost(event.target.value)}
                          placeholder="Cost on supplier invoice"
                        />
                      </Field>
                    </div>
                    <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <span className="text-sm font-semibold text-slate-500">
                        This line total
                      </span>
                      <span className="text-lg font-bold">
                        {money(Number(quantity || 0) * Number(unitCost || 0))}
                      </span>
                    </div>
                    <button
                      disabled={busy}
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
                    >
                      <PackagePlus size={17} /> Enter item and complete
                      inventory details
                    </button>
                  </form>
                  <ReconciliationCard
                    difference={difference}
                    matching={Boolean(matching)}
                    lines={order.lines.length}
                    canPost={canManagePostedOrders}
                    onPostForReceipt={requestPostInvoice}
                    onReceiveAll={requestReceiveAllInvoiceStock}
                    busy={busy}
                  />
                </section>
              )}
              {["approved", "partially_received"].includes(order.status) && (
                <section className="rounded-3xl border border-teal-200 bg-teal-50 p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">
                        {order.status === "approved" ? "Awaiting receipt" : "Partially received"}
                      </p>
                      <h2 className="mt-1 text-xl font-bold text-slate-900">
                        {order.status === "approved"
                          ? "The invoice is posted; stock has not been added."
                          : "Receive the remaining delivered quantities."}
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Only a stock receipt changes inventory and records the supplier payable. Each receipt is recorded in the audit trail.
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        disabled={busy}
                        onClick={() => setReceiveOpen(true)}
                        className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      >
                        Receive stock
                      </button>
                      {canManagePostedOrders && order.status === "approved" && (
                        <button
                          disabled={busy}
                          onClick={requestRollbackToDraft}
                          className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 disabled:opacity-50"
                        >
                          Return to Draft
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              )}
              <InvoiceLines
                order={order}
                busy={busy}
                onRemove={requestRemoveLine}
              />
            </>
          )}
            </div>
            <aside className="space-y-6">
              <PurchaseOrderQueue
                refreshKey={queueVersion}
                onSelect={(id) => void openOrder(id)}
              />
              {!order && <FlowCard />}
            </aside>
          </div>
        </div>
      </PermissionGate>
      {supplierOpen && (
        <SupplierModal
          close={() => setSupplierOpen(false)}
          onSubmit={createSupplier}
          busy={busy}
        />
      )}
      {itemOpen && order && (
        <InventoryDetailsModal
          close={() => setItemOpen(false)}
          onSubmit={saveInvoiceItem}
          busy={busy}
          selected={selectedProduct}
          stockCode={stockCode}
          setStockCode={setStockCode}
          unitCost={unitCost}
          pricingMethod={pricingMethod}
          setPricingMethod={setPricingMethod}
          markupValue={markupValue}
          setMarkupValue={setMarkupValue}
          sellingPrice={calculatedSellingPrice}
          category={category}
          setCategory={setCategory}
          unit={unit}
          setUnit={setUnit}
          reorderLevel={reorderLevel}
          setReorderLevel={setReorderLevel}
          controlled={controlled}
          setControlled={setControlled}
          batchNumber={batchNumber}
          setBatchNumber={setBatchNumber}
          expiryDate={expiryDate}
          setExpiryDate={setExpiryDate}
          itemName={itemName}
          manufacturer={manufacturer}
          setManufacturer={setManufacturer}
        />
      )}
      {receiveOpen && order && (
        <ReceivePurchaseOrderModal
          order={order}
          close={() => setReceiveOpen(false)}
          onReceive={receiveOrder}
          busy={busy}
        />
      )}
      {confirmation && <ConfirmModal confirmation={confirmation} close={() => setConfirmation(null)} />}
    </DashboardShell>
  );
}

function ConfirmModal({ confirmation, close }: { confirmation: Confirmation; close: () => void }) {
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="confirmation-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-600">Please confirm</p><h2 id="confirmation-title" className="mt-2 text-xl font-bold text-slate-900">{confirmation.title}</h2></div><button onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="Close confirmation"><X size={18} /></button></div>
      <p className="mt-3 text-sm leading-6 text-slate-500">{confirmation.message}</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button onClick={close} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button onClick={confirmation.onConfirm} className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white ${confirmation.tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-teal-600 hover:bg-teal-700"}`}>{confirmation.confirmLabel}</button></div>
    </div>
  </div>;
}

type ReceiptInputLine = {
  line_id: string;
  quantity: string;
  batch_number: string | null;
  expiry_date: string | null;
};

function ReceivePurchaseOrderModal({
  order,
  close,
  onReceive,
  busy,
}: {
  order: Order;
  close: () => void;
  onReceive: (lines: ReceiptInputLine[]) => Promise<void>;
  busy: boolean;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      order.lines.map((line) => [
        line.id,
        String(Math.max(0, Number(line.ordered_quantity) - Number(line.received_quantity))),
      ]),
    ),
  );
  const [batchNumbers, setBatchNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries(order.lines.map((line) => [line.id, line.batch_number || ""])),
  );
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(order.lines.map((line) => [line.id, line.expiry_date || ""])),
  );
  const [localError, setLocalError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const lines = order.lines
      .map((line) => ({
        line_id: line.id,
        quantity: quantities[line.id] || "0",
        batch_number: batchNumbers[line.id]?.trim() || null,
        expiry_date: expiryDates[line.id] || null,
      }))
      .filter((line) => Number(line.quantity) > 0);
    if (!lines.length) {
      setLocalError("Enter a positive quantity for at least one delivered item.");
      return;
    }
    if (lines.some((line) => line.expiry_date && !line.batch_number)) {
      setLocalError("Enter a batch number for every receipt line with an expiry date.");
      return;
    }
    setLocalError("");
    void onReceive(lines);
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/45 p-4">
      <form
        onSubmit={submit}
        className="mx-auto my-6 w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-600">
              Receive stock
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              {order.order_number}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter only the quantities physically delivered now. The balance remains available for a later receipt.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close stock receipt"
          >
            <X size={19} />
          </button>
        </div>
        {localError && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {localError}
          </p>
        )}
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Ordered</th>
                <th className="px-4 py-3">Already received</th>
                <th className="px-4 py-3">Outstanding</th>
                <th className="px-4 py-3">Receive now</th>
                <th className="px-4 py-3">Actual batch / expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.lines.map((line) => {
                const outstanding = Math.max(
                  0,
                  Number(line.ordered_quantity) - Number(line.received_quantity),
                );
                return (
                  <tr key={line.id}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{line.product_name}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{line.stock_code}</p>
                    </td>
                    <td className="px-4 py-3">{line.ordered_quantity}</td>
                    <td className="px-4 py-3">{line.received_quantity}</td>
                    <td className="px-4 py-3 font-bold">{outstanding}</td>
                    <td className="px-4 py-3">
                      <input
                        aria-label={`Receive quantity for ${line.product_name}`}
                        type="number"
                        min="0"
                        max={outstanding}
                        step="0.001"
                        disabled={busy || outstanding === 0}
                        value={quantities[line.id] || ""}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [line.id]: event.target.value,
                          }))
                        }
                        className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-4 py-3"><div className="grid gap-2 sm:grid-cols-2"><input aria-label={`Batch number for ${line.product_name}`} value={batchNumbers[line.id] || ""} disabled={busy || outstanding === 0} onChange={(event) => setBatchNumbers((current) => ({ ...current, [line.id]: event.target.value }))} placeholder="Batch" className="min-w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" /><input aria-label={`Expiry date for ${line.product_name}`} type="date" value={expiryDates[line.id] || ""} disabled={busy || outstanding === 0} onChange={(event) => setExpiryDates((current) => ({ ...current, [line.id]: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Enter the batch and expiry printed on the goods actually delivered. Receiving stock increases branch inventory and records the matching supplier payable amount.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Receiving…" : "Confirm stock receipt"}
          </button>
        </div>
      </form>
    </div>
  );
}

type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

function DropdownFromNative({
  control,
}: {
  control: ReactElement<NativeSelectProps>;
}) {
  const props = control.props;
  const options = Children.toArray(props.children).flatMap((item) => {
    if (!isValidElement(item) || item.type !== "option") return [];
    const option = item.props as {
      value?: string | number;
      children?: ReactNode;
      disabled?: boolean;
    };
    return [
      {
        value: String(option.value ?? ""),
        label: String(option.children ?? ""),
        disabled: option.disabled,
      },
    ];
  });
  return (
    <AppSelect
      value={String(props.value ?? props.defaultValue ?? "")}
      onChange={(value) =>
        props.onChange?.({
          target: { value },
        } as ChangeEvent<HTMLSelectElement>)
      }
      options={options}
      disabled={Boolean(props.disabled)}
      className={props.className}
      aria-label={props["aria-label"]}
    />
  );
}

function upgradeDropdowns(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node;
  if (node.type === "select") {
    const props = node.props as NativeSelectProps;
    if (!props.multiple && !props.size)
      return (
        <DropdownFromNative control={node as ReactElement<NativeSelectProps>} />
      );
  }
  const props = node.props as { children?: ReactNode };
  if (!props.children) return node;
  return cloneElement(
    node as ReactElement<{ children?: ReactNode }>,
    {},
    Children.map(props.children, upgradeDropdowns),
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-bold text-slate-600">
      {label}
      <div className="mt-1 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-sm [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-slate-200 [&_select]:px-3 [&_select]:py-2.5 [&_select]:text-sm">
        {upgradeDropdowns(children)}
      </div>
    </label>
  );
}
function Summary({
  label,
  value,
  bad,
}: {
  label: string;
  value: string;
  bad?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-bold ${bad ? "text-rose-600" : "text-slate-800"}`}
      >
        {value}
      </p>
    </div>
  );
}
function FlowCard() {
  return (
    <aside className="rounded-3xl bg-slate-900 p-6 text-white shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">
        How this works
      </p>
      <ol className="mt-6 space-y-5 text-sm">
        <li className="flex gap-3">
          <b className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-500 text-xs">
            1
          </b>
          <span>
            Enter the supplier, branch, invoice number, and printed invoice
            total.
          </span>
        </li>
        <li className="flex gap-3">
          <b className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-500 text-xs">
            2
          </b>
          <span>
            Check each delivered item and enter its name, cost price, and
            quantity.
          </span>
        </li>
        <li className="flex gap-3">
          <b className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-500 text-xs">
            3
          </b>
          <span>
            Complete stock code, selling price, batch, expiry, and other
            inventory details.
          </span>
        </li>
        <li className="flex gap-3">
          <b className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-500 text-xs">
            4
          </b>
          <span>
            When the invoice balances, an administrator can post it to await
            physical receipt, or receive all delivered stock immediately.
          </span>
        </li>
      </ol>
    </aside>
  );
}
function ReconciliationCard({
  difference,
  matching,
  lines,
  canPost,
  onPostForReceipt,
  onReceiveAll,
  busy,
}: {
  difference: number;
  matching: boolean;
  lines: number;
  canPost: boolean;
  onPostForReceipt: () => void;
  onReceiveAll: () => void;
  busy: boolean;
}) {
  return (
    <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-600">
        3. Invoice balance
      </p>
      <h2 className="mt-2 text-xl font-bold">Reconcile before posting</h2>
      <div
        className={`mt-5 rounded-2xl p-4 ${matching ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
      >
        <div className="flex items-center gap-2 font-bold">
          {matching ? <CheckCircle2 size={18} /> : <FileText size={18} />}
          {matching ? "Invoice balances" : "Still reconciling"}
        </div>
        <p className="mt-2 text-sm">
          {lines
            ? `Difference: ${money(difference)}.`
            : "No checked items have been entered yet."}
        </p>
      </div>
      {canPost ? (
        <>
          <p className="mt-5 text-sm text-slate-500">
            Posting for later locks the invoice without adding stock. A stock
            receipt can then be partial or full. Receiving all now records the
            stock, supplier payable, and audit trail in one action.
          </p>
          <button
            disabled={!matching || busy}
            onClick={onPostForReceipt}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCircle2 size={17} /> Post invoice — await receipt
          </button>
          <button
            disabled={!matching || busy}
            onClick={onReceiveAll}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-3 text-sm font-bold text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Receive all stock now
          </button>
        </>
      ) : (
        <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          An administrator must post this balanced invoice. Once posted, you can record a partial or full stock receipt.
        </p>
      )}
    </aside>
  );
}
function InvoiceLines({
  order,
  busy,
  onRemove,
}: {
  order: Order;
  busy: boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-600">
            Checked invoice items
          </p>
          <h2 className="mt-1 text-xl font-bold">
            {order.lines.length} item{order.lines.length === 1 ? "" : "s"}
          </h2>
        </div>
        <span className="font-bold text-slate-900">
          {money(Number(order.subtotal))}
        </span>
      </div>
      {!order.lines.length ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">
          Enter the first item from the supplier invoice above.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Item / stock code</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Unit cost</th>
                <th className="px-4 py-3">Batch / expiry</th>
                <th className="px-4 py-3 text-right">Line total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">
                      {line.product_name}
                    </p>
                    {line.manufacturer && <p className="mt-0.5 text-xs text-slate-500">{line.manufacturer}</p>}
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {line.stock_code}
                    </p>
                  </td>
                  <td className="px-4 py-4">{line.ordered_quantity}</td>
                  <td className="px-4 py-4">{money(Number(line.unit_cost))}</td>
                  <td className="px-4 py-4 text-xs text-slate-500">
                    {line.batch_number || "—"}
                    {line.expiry_date ? ` · ${line.expiry_date}` : ""}
                  </td>
                  <td className="px-4 py-4 text-right font-bold">
                    {money(
                      Number(line.ordered_quantity) * Number(line.unit_cost),
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {order.status === "draft" && (
                      <button
                        disabled={busy}
                        onClick={() => onRemove(line.id)}
                        title="Remove invoice item"
                        className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function SupplierModal({
  close,
  onSubmit,
  busy,
}: {
  close: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">New supplier</h2>
          <button type="button" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Supplier name">
            <input name="name" required />
          </Field>
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 sm:col-span-2">
            Supplier code will be generated automatically when this supplier is created.
          </p>
          <Field label="Contact name">
            <input name="contact_name" />
          </Field>
          <Field label="Phone">
            <input name="phone" />
          </Field>
          <Field label="Email">
            <input name="email" type="email" />
          </Field>
          <Field label="Payment terms (days)">
            <input
              name="payment_terms_days"
              type="number"
              min="0"
              defaultValue="0"
            />
          </Field>
        </div>
        <button
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white"
        >
          Create supplier
        </button>
      </form>
    </div>
  );
}
function InventoryDetailsModal(props: {
  close: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
  busy: boolean;
  selected: Product | null;
  stockCode: string;
  setStockCode: (value: string) => void;
  unitCost: string;
  pricingMethod: "multiplier" | "markup_rate";
  setPricingMethod: (value: "multiplier" | "markup_rate") => void;
  markupValue: string;
  setMarkupValue: (value: string) => void;
  sellingPrice: string;
  category: string;
  setCategory: (value: string) => void;
  unit: string;
  setUnit: (value: string) => void;
  reorderLevel: string;
  setReorderLevel: (value: string) => void;
  controlled: boolean;
  setControlled: (value: boolean) => void;
  batchNumber: string;
  setBatchNumber: (value: string) => void;
  expiryDate: string;
  setExpiryDate: (value: string) => void;
  itemName: string;
  manufacturer: string;
  setManufacturer: (value: string) => void;
}) {
  const { close, onSubmit, busy, selected } = props;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4">
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="mx-auto my-6 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-600">
              Inventory details
            </p>
            <h2 className="mt-1 text-2xl font-bold">
              Complete {props.itemName}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Saving returns you to this supplier invoice. Stock remains pending
              until the invoice balances.
            </p>
          </div>
          <button type="button" onClick={close}>
            <X size={19} />
          </button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Stock code">
            {" "}
            <input
              value={props.stockCode}
              readOnly={Boolean(selected)}
              onChange={(event) => props.setStockCode(event.target.value)}
              placeholder="Pack or manual code"
            />
          </Field>
          <Field label="Manufacturer (optional)">
            <input
              value={props.manufacturer}
              readOnly={Boolean(selected)}
              onChange={(event) => props.setManufacturer(event.target.value)}
              placeholder="e.g. Swipha"
            />
          </Field>
          <Field label="Pricing method">
            <AppSelect
              value={props.pricingMethod}
              onChange={(value) => props.setPricingMethod(value as "multiplier" | "markup_rate")}
              options={[
                { value: "multiplier", label: "Cost multiplier (e.g. 1.20)" },
                { value: "markup_rate", label: "Markup rate (e.g. 0.50 = 50%)" },
              ]}
            />
          </Field>
          <Field label={props.pricingMethod === "multiplier" ? "Price multiplier" : "Markup rate"}>
            <input
              required
              type="number"
              min={props.pricingMethod === "multiplier" ? "0.0001" : "0"}
              step="0.0001"
              value={props.markupValue}
              onChange={(event) => props.setMarkupValue(event.target.value)}
              placeholder={props.pricingMethod === "multiplier" ? "1.20" : "0.50"}
            />
          </Field>
          <div className="sm:col-span-2 rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-900"><div className="flex items-center justify-between gap-4"><span className="font-semibold">Calculated selling price</span><span className="text-lg font-bold">{props.sellingPrice ? money(Number(props.sellingPrice)) : "Enter a markup"}</span></div><p className="mt-1 text-xs text-teal-700">Cost: {money(Number(props.unitCost || 0))} · {props.pricingMethod === "multiplier" ? "Cost × multiplier" : "Cost + (cost × markup rate)"}. This price is saved with the product.</p></div>
          <Field label="Category">
            <input
              required
              value={props.category}
              readOnly={Boolean(selected)}
              onChange={(event) => props.setCategory(event.target.value)}
            />
          </Field>
          <Field label="Unit / pack">
            <input
              required
              value={props.unit}
              readOnly={Boolean(selected)}
              onChange={(event) => props.setUnit(event.target.value)}
            />
          </Field>
          <Field label="Reorder level">
            <input
              required
              type="number"
              min="0"
              value={props.reorderLevel}
              onChange={(event) => props.setReorderLevel(event.target.value)}
            />
          </Field>
          <Field label="Batch number">
            <input
              value={props.batchNumber}
              onChange={(event) => props.setBatchNumber(event.target.value)}
              placeholder="Required if entering expiry"
            />
          </Field>
          <Field label="Expiry date">
            <input
              type="date"
              value={props.expiryDate}
              onChange={(event) => props.setExpiryDate(event.target.value)}
            />
          </Field>
          <label className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={props.controlled}
              disabled={Boolean(selected)}
              onChange={(event) => props.setControlled(event.target.checked)}
            />{" "}
            Controlled medicine
          </label>
        </div>
        <button
          disabled={busy}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white"
        >
          <CheckCircle2 size={17} /> Save item and return to invoice
        </button>
      </form>
    </div>
  );
}
function PurchaseOrderQueue({
  onSelect,
  refreshKey,
}: {
  onSelect: (id: string) => void;
  refreshKey: number;
}) {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    void api
      .get<QueueOrder[]>(
        `/api/v1/purchasing/orders${filter ? `?status=${encodeURIComponent(filter)}` : ""}`,
      )
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [filter, refreshKey]);
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-600">
            Purchase order queue
          </p>
          <h2 className="mt-1 text-xl font-bold">Open an existing invoice</h2>
        </div>
        <AppSelect
          value={filter}
          onChange={setFilter}
          aria-label="Filter purchase orders"
          className="sm:w-52"
          options={[
            { value: "", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "approved", label: "Awaiting receipt" },
            { value: "received", label: "Received" },
            { value: "partially_received", label: "Partially received" },
          ]}
        />
      </div>
      <div className="mt-5 divide-y divide-slate-100">
        {orders.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className="flex w-full items-center gap-4 py-4 text-left hover:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <p className="font-bold">{item.order_number}</p>
              <p className="mt-1 text-xs text-slate-500">
                {item.supplier_name} · Invoice{" "}
                {item.supplier_invoice_number || "—"}
              </p>
            </div>
            <span className="hidden text-sm font-bold sm:block">
              {money(Number(item.subtotal))}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-600">
              {purchaseStatusLabel(item.status)}
            </span>
          </button>
        ))}
        {!orders.length && (
          <p className="py-7 text-center text-sm text-slate-500">
            No purchase orders found.
          </p>
        )}
      </div>
    </section>
  );
}
