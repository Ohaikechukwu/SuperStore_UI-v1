"use client";

import FormSelect from "@/components/form-select";
import Dialog from "@/components/dialog";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileUp, History, PackagePlus, Pencil, Plus, Search, Upload, X } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";
import { can, type AuthorizationContext } from "@/lib/authorization";

type Product = { id: string; stock_code: string; barcode?: string | null; name: string; manufacturer?: string | null; generic_name?: string | null; strength?: string | null; dosage_form?: string | null; pack_description?: string | null; category: string; service_area?: string | null; unit: string; purchase_unit?: string | null; purchase_unit_quantity?: string | null; selling_price: string; cost_price: string; reorder_level: number; reorder_max?: number | null; controlled: boolean; active: boolean; pos_enabled: boolean };
type ProductCategory = { id: string; name: string; description?: string | null; active: boolean };
type ProductPage = { items: Product[]; total: number; limit: number; offset: number; has_more: boolean };
type CsvProduct = { stock_code?: string; barcode?: string; name: string; manufacturer?: string; generic_name?: string; strength?: string; dosage_form?: string; pack_description?: string; category?: string; unit?: string; purchase_unit?: string; purchase_unit_quantity?: number; reorder_level?: number; reorder_max?: number; controlled?: boolean };
type ImportState = { items: CsvProduct[]; nextIndex: number; created: number; skipped: number };
type ServiceAreaSummary = { counts: Record<string, number>; total: number; needs_review: number };
type PriceHistory = { id: string; selling_price: string; cost_price: string; reason: string; source_type: string; created_at: string | null };

const PAGE_SIZE = 10;
const IMPORT_BATCH_SIZE = 500;
const csvTemplate = "name,manufacturer,generic_name,strength,dosage_form,stock_code,barcode,category,unit,purchase_unit,purchase_unit_quantity,reorder_level,reorder_max,controlled\nParacetamol 500mg Tablets,Emzor,Paracetamol,500mg,Tablet,,1234567890123,pharmacy,tablet,carton,100,10,200,false\nAmoxicillin 500mg Capsules,Juhel,Amoxicillin,500mg,Capsule,,1234567890124,pharmacy,capsule,box,100,10,200,false\n";

function errorMessage(error: unknown, fallback: string) { return error instanceof ApiError ? error.message : fallback; }
function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) { const character = text[index];
    if (character === '"') { if (quoted && text[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted; }
    else if (character === "," && !quoted) { row.push(value.trim()); value = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && text[index + 1] === "\n") index += 1; row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ""; }
    else value += character;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}
function parseImportRows(rows: string[][]): CsvProduct[] {
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one product name.");
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase().replaceAll(" ", "_").replace("sku", "stock_code"));
  if (!headers.includes("name")) throw new Error("CSV must include a name column.");
  const at = (row: string[], name: string) => row[headers.indexOf(name)]?.trim() || "";
  return rows.slice(1).map((row, position) => {
    const name = at(row, "name"), reorderLevel = Number(at(row, "reorder_level") || 0), reorderMax = at(row, "reorder_max") ? Number(at(row, "reorder_max")) : undefined, purchaseUnitQuantity = at(row, "purchase_unit_quantity") ? Number(at(row, "purchase_unit_quantity")) : undefined;
    if (!name) throw new Error("Row " + String(position + 2) + " needs a product name.");
    if (!Number.isInteger(reorderLevel) || reorderLevel < 0 || (reorderMax !== undefined && (!Number.isInteger(reorderMax) || reorderMax < reorderLevel)) || (purchaseUnitQuantity !== undefined && (!Number.isFinite(purchaseUnitQuantity) || purchaseUnitQuantity <= 0))) throw new Error("Row " + String(position + 2) + " has invalid reorder or purchase-unit values.");
    return { name, manufacturer: at(row, "manufacturer") || undefined, generic_name: at(row, "generic_name") || undefined, strength: at(row, "strength") || undefined, dosage_form: at(row, "dosage_form") || undefined, pack_description: at(row, "pack_description") || undefined, stock_code: at(row, "stock_code") || undefined, barcode: at(row, "barcode") || undefined, category: at(row, "category") || "pharmacy", unit: at(row, "unit") || "unit", purchase_unit: at(row, "purchase_unit") || undefined, purchase_unit_quantity: purchaseUnitQuantity, reorder_level: reorderLevel, reorder_max: reorderMax, controlled: ["true", "yes", "1"].includes(at(row, "controlled").toLowerCase()) };
  });
}
function parseImport(text: string): CsvProduct[] { return parseImportRows(parseCsv(text)); }

export default function ProductsPage() {
  const [tenantId, setTenantId] = useState(""), [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState(""), [category, setCategory] = useState("all");
  const [page, setPage] = useState<ProductPage>({ items: [], total: 0, limit: PAGE_SIZE, offset: 0, has_more: false });
  const [editor, setEditor] = useState<Product | null | "new">(null), [importOpen, setImportOpen] = useState(false);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [busy, setBusy] = useState(true), [saving, setSaving] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const [serviceSummary, setServiceSummary] = useState<ServiceAreaSummary | null>(null), [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [priceHistory, setPriceHistory] = useState<{ product: Product; records: PriceHistory[]; loading: boolean; error: string } | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [authorization, setAuthorization] = useState<AuthorizationContext | null>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [managedCategories, setManagedCategories] = useState<ProductCategory[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);

  async function loadCategories(includeInactive = false) {
    const result = await api.get<ProductCategory[]>(`/api/v1/catalog/product-categories${includeInactive ? "?include_inactive=true" : ""}`);
    setCategories(result.filter((record) => record.active));
    if (includeInactive) setManagedCategories(result);
  }

  useEffect(() => { void loadCategories().catch(() => undefined); }, []);

  async function load(offset = 0, quiet = false) {
    if (!quiet) setBusy(true);
    try { const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), include_inactive: "true" });
      if (query.trim()) params.set("query", query.trim()); if (category !== "all") params.set("category", category);
      const [result, summary] = await Promise.all([api.get<ProductPage>("/api/v1/catalog/products?" + params.toString()), api.get<ServiceAreaSummary>("/api/v1/catalog/products/service-area-summary")]); setPage(result); setProducts(result.items); setServiceSummary(summary); setSelectedIds([]);
    } catch (caught) { setError(errorMessage(caught, "Unable to load the product catalogue.")); } finally { if (!quiet) setBusy(false); }
  }
  useEffect(() => { void api.get<AuthorizationContext>("/api/v1/auth/me/authorization").then((result) => { setTenantId(result.tenant_id); setAuthorization(result); }).catch((caught) => setError(errorMessage(caught, "Unable to identify this workspace."))); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(0); }, query ? 180 : 0); return () => window.clearTimeout(timer); }, [query, category]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!tenantId) return;
    const form = new FormData(event.currentTarget);
    const stockCode = String(form.get("stock_code") || "").trim(); const payload: Record<string, unknown> = { tenant_id: tenantId, name: String(form.get("name") || "").trim(), manufacturer: String(form.get("manufacturer") || "").trim() || null, barcode: String(form.get("barcode") || "").trim() || null, generic_name: String(form.get("generic_name") || "").trim() || null, strength: String(form.get("strength") || "").trim() || null, dosage_form: String(form.get("dosage_form") || "").trim() || null, pack_description: String(form.get("pack_description") || "").trim() || null, category: String(form.get("category") || "pharmacy"), service_area: String(form.get("service_area") || "store"), unit: String(form.get("unit") || "unit"), purchase_unit: String(form.get("purchase_unit") || "").trim() || null, purchase_unit_quantity: String(form.get("purchase_unit_quantity") || "").trim() || null, selling_price: Number(form.get("selling_price") || 0), cost_price: Number(form.get("cost_price") || 0), reorder_level: Number(form.get("reorder_level") || 0), reorder_max: String(form.get("reorder_max") || "").trim() || null, price_change_reason: String(form.get("price_change_reason") || "").trim() || null, controlled: form.get("controlled") === "on", active: form.get("active") === "on" }; if (editor === "new" || stockCode) payload.stock_code = stockCode || null;
    setSaving(true); setError("");
    try { if (editor && editor !== "new") await api.put("/api/v1/catalog/products/" + editor.id, payload); else await api.post("/api/v1/catalog/products", payload);
      setNotice(editor && editor !== "new" ? "Product details updated." : "Product reference added. It becomes sellable after PO receipt."); setEditor(null); await load(0);
    } catch (caught) { setError(errorMessage(caught, "Unable to save this product.")); } finally { setSaving(false); }
  }
  async function runImport(state: ImportState) {
    setSaving(true); setError(""); let created = state.created, skipped = state.skipped;
    try { for (let start = state.nextIndex; start < state.items.length; start += IMPORT_BATCH_SIZE) {
        const end = Math.min(start + IMPORT_BATCH_SIZE, state.items.length);
        const result = await api.post<{ created: number; skipped: number }>("/api/v1/catalog/products/import", { tenant_id: tenantId, items: state.items.slice(start, end) });
        created += result.created; skipped += result.skipped; setImportState({ items: state.items, nextIndex: end, created, skipped });
      }
      setNotice(String(created) + " product references imported. Use a PO receipt to make a product visible in POS."); setImportState(null); setImportOpen(false); await load(0);
    } catch (caught) { setImportState((current) => current ? { ...current, created, skipped } : state); setError(errorMessage(caught, "Import paused. Retry from the last completed batch.")); } finally { setSaving(false); }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file || !tenantId) return;
    try { const items = parseImport(await file.text()); await runImport({ items, nextIndex: 0, created: 0, skipped: 0 }); } catch (caught) { setError(errorMessage(caught, "Unable to read this CSV file.")); } finally { event.target.value = ""; }
  }
  function template() { const url = URL.createObjectURL(new Blob([csvTemplate], { type: "text/csv" })); const link = document.createElement("a"); link.href = url; link.download = "product-reference-template.csv"; link.click(); URL.revokeObjectURL(url); }
  function toggleProduct(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  async function classify(serviceArea: "store" | "pharmacy" | "laboratory") { if (!selectedIds.length) return; try { const result = await api.post<{ updated: number }>("/api/v1/catalog/products/service-area", { product_ids: selectedIds, service_area: serviceArea }); setNotice(`${result.updated} product${result.updated === 1 ? "" : "s"} classified as ${serviceArea}.`); await load(page.offset, true); } catch (caught) { setError(errorMessage(caught, "Unable to update product service area.")); } }
  async function classifyOne(product: Product, serviceArea: "store" | "pharmacy" | "laboratory") { try { await api.post("/api/v1/catalog/products/service-area", { product_ids: [product.id], service_area: serviceArea }); setNotice(`${product.name} is now assigned to ${serviceArea}.`); await load(page.offset, true); } catch (caught) { setError(errorMessage(caught, "Unable to update product service area.")); } }
  async function showPriceHistory(product: Product) {
    setPriceHistory({ product, records: [], loading: true, error: "" });
    try {
      const records = await api.get<PriceHistory[]>(`/api/v1/catalog/products/${product.id}/price-history`);
      setPriceHistory((current) => current?.product.id === product.id ? { product, records, loading: false, error: "" } : current);
    } catch (caught) {
      setPriceHistory((current) => current?.product.id === product.id ? { ...current, loading: false, error: errorMessage(caught, "Unable to load product price history.") } : current);
    }
  }
  async function openCategoryManager() {
    setError("");
    setCategoryManagerOpen(true); setCategoryLoading(true); setNotice("");
    try { await loadCategories(true); } catch (caught) { setError(errorMessage(caught, "Unable to load product categories.")); } finally { setCategoryLoading(false); }
  }
  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    setCategorySaving(true); setError("");
    try {
      await api.post("/api/v1/catalog/product-categories", { name, description: categoryDescription.trim() || null });
      setCategoryName(""); setCategoryDescription("");
      await loadCategories(true);
      setNotice(`Category “${name}” is ready to use.`);
    } catch (caught) { setError(errorMessage(caught, "Unable to create product category.")); } finally { setCategorySaving(false); }
  }
  async function setCategoryActive(record: ProductCategory, active: boolean) {
    setCategorySaving(true); setError("");
    try {
      await api.put(`/api/v1/catalog/product-categories/${record.id}`, { active });
      await loadCategories(true);
      setNotice(`${record.name} is now ${active ? "active" : "inactive"}.`);
    } catch (caught) { setError(errorMessage(caught, "Unable to update product category.")); } finally { setCategorySaving(false); }
  }
  const start = page.total ? page.offset + 1 : 0, end = Math.min(page.offset + products.length, page.total);

  return <DashboardShell title="Product catalogue" subtitle="A scalable procurement catalogue; POS availability begins with a received PO."><PermissionGate permission="catalog.product.read"><div className="mx-auto max-w-[1280px] space-y-6">
    <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Product master</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Products</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Manage product details, categories, and operational areas. Received purchase orders activate stock and prices for POS.</p></div><div className="flex shrink-0 flex-wrap gap-2">{can(authorization, "catalog.category.manage") && <button onClick={() => void openCategoryManager()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">Manage categories</button>}<button onClick={() => { setError(""); setImportOpen(true); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"><FileUp size={16} /> Import CSV</button><button onClick={() => { setError(""); setEditor("new"); }} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} /> Add product</button></div></section>
    {error && <div role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}{notice && <div role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
    <section className="rounded-3xl border border-teal-100 bg-teal-50/60 p-5 text-sm text-teal-950"><strong>Controlled flow:</strong> product reference → supplier PO → received stock and price → POS. <Link className="font-bold underline" href="/purchasing">Open Purchasing</Link>.</section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-600">Service areas</p><h2 className="mt-1 text-xl font-bold">Route products to the right operational workspace</h2><p className="mt-1 text-sm text-slate-500">Choose an area on a product row, or select several rows to update them together. Product category never changes a workspace automatically.</p></div><div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-slate-100 px-3 py-2">Store {serviceSummary?.counts.store || 0}</span><span className="rounded-full bg-teal-50 px-3 py-2 text-teal-700">Pharmacy {serviceSummary?.counts.pharmacy || 0}</span><span className="rounded-full bg-violet-50 px-3 py-2 text-violet-700">Laboratory {serviceSummary?.counts.laboratory || 0}</span></div></div>{selectedIds.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm"><strong>{selectedIds.length} selected</strong><button onClick={() => void classify("store")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Set store</button><button onClick={() => void classify("pharmacy")} className="rounded-xl border border-teal-200 px-3 py-2 text-xs font-bold text-teal-700">Set pharmacy</button><button onClick={() => void classify("laboratory")} className="rounded-xl border border-violet-200 px-3 py-2 text-xs font-bold text-violet-700">Set laboratory</button></div>}</section>
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row"><label className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search products" placeholder="Search name, stock code, or barcode" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500" /></label><FormSelect aria-label="Filter by product type" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><option value="all">All product types</option>{categories.length > 0 ? categories.map((record) => <option key={record.id} value={record.name}>{record.name}</option>) : <><option value="pharmacy">Pharmacy / drugs</option><option value="store">Store items</option></>}</FormSelect></div>
      {busy ? <div className="p-10 text-sm text-slate-500">Loading product catalogue…</div> : products.length === 0 ? <div className="p-12 text-center"><PackagePlus className="mx-auto text-slate-300" size={32} /><p className="mt-3 text-sm font-bold text-slate-700">No products found</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-3"><input type="checkbox" aria-label="Select all products on this page" checked={products.length > 0 && selectedIds.length === products.length} onChange={(event) => setSelectedIds(event.target.checked ? products.map((product) => product.id) : [])} /></th><th className="px-5 py-3">Product</th><th className="px-5 py-3">Manufacturer</th><th className="px-5 py-3">Area</th><th className="px-5 py-3">Code / barcode</th><th className="px-5 py-3">POS status</th><th className="px-5 py-3 text-right">Price</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{products.map((product) => <tr key={product.id}><td className="px-3 py-4"><input type="checkbox" aria-label={`Select ${product.name}`} checked={selectedIds.includes(product.id)} onChange={() => toggleProduct(product.id)} /></td><td className="px-5 py-4"><p className="font-bold text-slate-800">{product.name}</p><p className="mt-0.5 text-xs text-slate-400">{[product.generic_name, product.strength, product.dosage_form].filter(Boolean).join(" · ") || product.unit}{product.controlled ? " · Controlled" : ""}</p></td><td className="px-5 py-4 text-slate-600">{product.manufacturer || "—"}</td><td className="px-5 py-4">{can(authorization, "catalog.product.update") ? <FormSelect aria-label={`Service area for ${product.name}`} value={product.service_area || "store"} onChange={(event) => void classifyOne(product, event.target.value as "store" | "pharmacy" | "laboratory")} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold capitalize text-slate-700"><option value="store">Store</option><option value="pharmacy">Pharmacy</option><option value="laboratory">Laboratory</option></FormSelect> : <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold capitalize text-slate-600">{product.service_area || "unclassified"}</span>}</td><td className="px-5 py-4 font-mono text-xs font-semibold"><p>{product.stock_code}</p>{product.barcode && <p className="mt-1 text-slate-400">{product.barcode}</p>}</td><td className="px-5 py-4"><span className={"rounded-full px-2.5 py-1 text-xs font-bold " + (product.pos_enabled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>{product.pos_enabled ? "POS ready" : "Awaiting PO receipt"}</span></td><td className="whitespace-nowrap px-5 py-4 text-right font-bold tabular-nums">{product.pos_enabled ? formatPrice(product.selling_price) : "Set by PO"}</td><td className="px-5 py-4 text-right"><div className="flex justify-end gap-2"><button onClick={() => void showPriceHistory(product)} className="rounded-lg border border-slate-200 p-2 text-slate-600" title="Price history"><History size={14} /></button><button onClick={() => { setError(""); setEditor(product); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-teal-700"><Pencil size={14} /> Edit</button></div></td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500"><span>{start}–{end} of {page.total.toLocaleString()} products</span><div className="flex gap-2"><button aria-label="Previous page" disabled={page.offset === 0 || busy} onClick={() => void load(Math.max(0, page.offset - PAGE_SIZE))} className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"><ChevronLeft size={17} /></button><button aria-label="Next page" disabled={!page.has_more || busy} onClick={() => void load(page.offset + PAGE_SIZE)} className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"><ChevronRight size={17} /></button></div></div>
    </section>
    {editor && <ProductEditor error={error} product={editor === "new" ? null : editor} categories={categories} close={() => !saving && setEditor(null)} save={save} saving={saving} />}
    {importOpen && <ImportModal error={error} close={() => !saving && setImportOpen(false)} template={template} importFile={importFile} saving={saving} state={importState} retry={() => importState && void runImport(importState)} />}
    {priceHistory && <PriceHistoryModal loading={priceHistory.loading} error={priceHistory.error} retry={() => void showPriceHistory(priceHistory.product)} product={priceHistory.product} records={priceHistory.records} close={() => setPriceHistory(null)} />}
    {categoryManagerOpen && <CategoryManagerModal error={error} notice={notice} loading={categoryLoading} retry={() => void openCategoryManager()} categories={managedCategories} name={categoryName} description={categoryDescription} saving={categorySaving} close={() => !categorySaving && setCategoryManagerOpen(false)} setName={setCategoryName} setDescription={setCategoryDescription} create={createCategory} setActive={setCategoryActive} />}
  </div></PermissionGate></DashboardShell>;
}

function ProductEditor({ product, categories, close, save, saving, error }: { error: string; product: Product | null; categories: ProductCategory[]; close: () => void; save: (event: FormEvent<HTMLFormElement>) => void; saving: boolean }) {
  return <Dialog title={product ? `Update ${product.name}` : "Add product"} onClose={close} busy={saving} className="max-w-3xl"><div className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">{product ? "Update product" : "New product"}</p><h2 className="mt-2 text-2xl font-bold">{product ? product.name : "Add procurement reference"}</h2><p className="mt-1 text-sm text-slate-500">Keep the pack barcode and medicine identity on the product master. PO receipts remain the auditable route to POS stock and price activation.</p></div><button onClick={close} disabled={saving} type="button" aria-label="Close product editor" className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={19} /></button></div><form key={product?.id || "new"} onSubmit={save} className="mt-6 space-y-5">{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<div className="grid gap-4 sm:grid-cols-2"><Field name="name" label="Product name" defaultValue={product?.name} required className="sm:col-span-2" /><Field name="generic_name" label="Generic name" defaultValue={product?.generic_name || ""} placeholder="e.g. Paracetamol" /><Field name="manufacturer" label="Manufacturer" defaultValue={product?.manufacturer || ""} placeholder="e.g. Emzor" /><Field name="strength" label="Strength" defaultValue={product?.strength || ""} placeholder="e.g. 500 mg" /><Field name="dosage_form" label="Dosage form" defaultValue={product?.dosage_form || ""} placeholder="Tablet, syrup, vial…" /><Field name="barcode" label="Pack barcode" defaultValue={product?.barcode || ""} placeholder="Scan or type barcode" /><Field name="stock_code" label="Internal stock code" defaultValue={product?.stock_code?.startsWith("REF-") ? "" : product?.stock_code} placeholder="Leave blank to keep generated code" /><label className="text-xs font-bold text-slate-600">Product type<FormSelect name="category" defaultValue={product?.category || categories[0]?.name || "pharmacy"} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{product?.category && !categories.some((record) => record.name === product.category) && (categories.length > 0 || !["pharmacy", "store"].includes(product.category)) && <option value={product.category}>{product.category} (current)</option>}{categories.length > 0 ? categories.map((record) => <option key={record.id} value={record.name}>{record.name}</option>) : <><option value="pharmacy">Pharmacy / drug</option><option value="store">Store item</option></>}</FormSelect></label><label className="text-xs font-bold text-slate-600">Operational area<FormSelect name="service_area" defaultValue={product?.service_area || "store"} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="store">Store</option><option value="pharmacy">Pharmacy</option><option value="laboratory">Laboratory</option><option value="hospital">Hospital</option></FormSelect></label><Field name="unit" label="Sales unit" defaultValue={product?.unit || "unit"} required /><Field name="purchase_unit" label="Purchase unit" defaultValue={product?.purchase_unit || ""} placeholder="carton, box…" /><Field name="purchase_unit_quantity" label="Units per purchase unit" defaultValue={product?.purchase_unit_quantity || ""} type="number" min="0.001" step="0.001" /><Field name="pack_description" label="Pack description" defaultValue={product?.pack_description || ""} placeholder="10 × 10 tablets" /><Field name="reorder_level" label="Reorder minimum" defaultValue={String(product?.reorder_level || 0)} type="number" min="0" step="1" required /><Field name="reorder_max" label="Reorder maximum" defaultValue={product?.reorder_max == null ? "" : String(product.reorder_max)} type="number" min="0" step="1" /><Field name="cost_price" label="Current cost price" defaultValue={product?.cost_price || "0"} type="number" min="0" step="0.01" /><Field name="selling_price" label="Current POS price" defaultValue={product?.selling_price || "0"} type="number" min="0" step="0.01" /><Field name="price_change_reason" label="Price-change reason" defaultValue="" placeholder="Required operational context" className="sm:col-span-2" /></div><div className="flex flex-wrap gap-5 rounded-2xl bg-slate-50 p-4"><label className="flex items-center gap-2 text-sm font-semibold"><input name="controlled" type="checkbox" defaultChecked={product?.controlled} /> Controlled medicine</label><label className="flex items-center gap-2 text-sm font-semibold"><input name="active" type="checkbox" defaultChecked={product?.active ?? true} /> Active for purchasing</label></div><div className="flex justify-end gap-3"><button type="button" onClick={close} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold">Cancel</button><button disabled={saving} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save product"}</button></div></form></div></Dialog>;
}
function CategoryManagerModal({ error, notice, loading, retry, categories, name, description, saving, close, setName, setDescription, create, setActive }: { error: string; notice: string; loading: boolean; retry: () => void; categories: ProductCategory[]; name: string; description: string; saving: boolean; close: () => void; setName: (value: string) => void; setDescription: (value: string) => void; create: (event: FormEvent<HTMLFormElement>) => void; setActive: (record: ProductCategory, active: boolean) => void }) {
  return <Dialog title="Manage product categories" onClose={close} busy={saving}><div className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Catalogue setup</p><h2 className="mt-2 text-2xl font-bold">Manage product categories</h2><p className="mt-1 text-sm text-slate-500">Active categories are available when creating products and receiving supplier invoices.</p></div><button onClick={close} disabled={saving} type="button" aria-label="Close category manager" className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={19} /></button></div>{error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}<button type="button" disabled={saving || loading} onClick={retry} className="ml-2 font-semibold underline">Reload categories</button></div>}{notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}<form onSubmit={create} className="mt-6 rounded-2xl bg-slate-50 p-4"><p className="text-sm font-bold text-slate-800">Add category</p><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]"><input aria-label="Category name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Personal care" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /><input aria-label="Category description" maxLength={240} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional description" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /><button disabled={saving} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">Add</button></div></form><div className="mt-6 overflow-hidden rounded-2xl border border-slate-200"><div className="grid grid-cols-[1fr_auto] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500"><span>Category</span><span>Status</span></div><div className="divide-y divide-slate-100">{categories.map((record) => <div key={record.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3"><div><p className="font-semibold text-slate-800">{record.name}</p>{record.description && <p className="mt-1 text-xs text-slate-500">{record.description}</p>}</div><button disabled={saving} onClick={() => setActive(record, !record.active)} className={"rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-60 " + (record.active ? "border border-amber-200 text-amber-800" : "bg-teal-600 text-white")}>{record.active ? "Deactivate" : "Reactivate"}</button></div>)}{loading && <p role="status" className="px-4 py-8 text-center text-sm text-slate-500">Loading categories…</p>}{!loading && !error && !categories.length && <p className="px-4 py-8 text-center text-sm text-slate-500">No categories yet. Add the first one above.</p>}</div></div></div></Dialog>;
}
function formatPrice(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value;
}
function formatPriceSource(source: string) {
  return source.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function PriceHistoryModal({ product, records, close, loading, error, retry }: {
  product: Product; records: PriceHistory[]; close: () => void; loading: boolean; error: string; retry: () => void;
}) {
  return <Dialog title={`Price audit trail: ${product.name}`} onClose={close}>
    <header className="border-b border-slate-200 bg-slate-50 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Price audit trail</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">{product.name}</h2>
          <p className="mt-2 text-sm text-slate-600"><span className="font-mono">{product.stock_code}</span> · Read-only history</p>
        </div>
        <button onClick={close} type="button" aria-label="Close price audit trail" className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-200"><X size={20} /></button>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
          <dt className="text-xs font-semibold text-teal-800">Current selling price</dt>
          <dd className="mt-1 text-xl font-bold tabular-nums text-teal-950 sm:text-2xl">{formatPrice(product.selling_price)}</dd>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <dt className="text-xs font-semibold text-slate-600">Current cost price</dt>
          <dd className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{formatPrice(product.cost_price)}</dd>
        </div>
      </dl>
    </header>
    <div className="p-5 sm:p-6">
      <h3 className="font-bold">Change history</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">Catalogue and purchase-price changes. Historical entries may differ from the current active price.</p>
      {loading ? <p role="status" className="py-10 text-center text-sm text-slate-600">Loading price history…</p>
        : error ? <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}<button onClick={retry} className="mt-3 block rounded-lg border border-rose-300 bg-white px-4 py-2 font-semibold">Try again</button></div>
        : records.length ? <>
          <p className="my-5 text-xs font-semibold text-slate-500">Newest first · {records.length} {records.length === 1 ? "entry" : "entries"}</p>
          <ol className="space-y-4">{records.map((record) => {
            const date = record.created_at ? new Date(record.created_at) : null;
            const validDate = date && !Number.isNaN(date.getTime());
            return <li key={record.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{formatPriceSource(record.source_type) || "Catalogue update"}</span>
                <time dateTime={validDate ? date.toISOString() : undefined} className="text-xs text-slate-500">{validDate ? date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Date unavailable"}</time>
              </div>
              <p className="mt-3 text-sm font-semibold leading-6">{record.reason || "No reason recorded"}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                <div><dt className="text-xs text-slate-500">Selling price</dt><dd className="mt-1 font-semibold tabular-nums">{formatPrice(record.selling_price)}</dd></div>
                <div><dt className="text-xs text-slate-500">Cost price</dt><dd className="mt-1 font-semibold tabular-nums">{formatPrice(record.cost_price)}</dd></div>
              </dl>
            </li>;
          })}</ol>
        </> : <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-8 text-center">
          <History aria-hidden="true" className="mx-auto text-slate-400" size={28} />
          <p className="mt-3 text-sm font-semibold">No price changes recorded</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">Future catalogue and purchase-price changes will appear here.</p>
        </div>}
    </div>
  </Dialog>;
}

function Field({ label, className = "", ...props }: { label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) { return <label className={"text-xs font-bold text-slate-600 " + className}>{label}<input {...props} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>; }
function ImportModal({ error, close, template, importFile, saving, state, retry }: { error: string; close: () => void; template: () => void; importFile: (event: ChangeEvent<HTMLInputElement>) => void; saving: boolean; state: ImportState | null; retry: () => void }) {
  const total = state?.items.length || 0, percent = total ? Math.round((state!.nextIndex / total) * 100) : 0;
  return <Dialog title="Import procurement catalogue" onClose={close} busy={saving} className="max-w-lg"><div className="p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Bulk product import</p><h2 className="mt-2 text-2xl font-bold">Import procurement catalogue</h2></div><button onClick={close} disabled={saving} aria-label="Close import" className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={19} /></button></div>{error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<p className="mt-4 text-sm leading-6 text-slate-500">Only <strong>name</strong> is required. Upload a CSV file; there is no catalogue-size limit. Files are sent in safe batches of {IMPORT_BATCH_SIZE} rows, and retries skip existing products. Include barcode, generic name, strength, form, and pack conversion where known. Imported products stay out of POS until received through a PO.</p><button onClick={template} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold"><Download size={16} /> Download CSV template</button>{state && <div className="mt-5 rounded-2xl bg-teal-50 p-4 text-sm"><div className="flex justify-between font-bold"><span>{saving ? "Importing…" : "Import paused"}</span><span>{percent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-teal-100"><div className="h-full bg-teal-600" style={{ width: String(percent) + "%" }} /></div><p className="mt-2 text-xs">{state.nextIndex.toLocaleString()} of {total.toLocaleString()} processed · {state.created.toLocaleString()} created · {state.skipped.toLocaleString()} skipped</p>{!saving && <button onClick={retry} className="mt-3 rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs font-bold">Retry from last completed batch</button>}</div>}<label className="mt-5 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center focus-within:border-teal-700 focus-within:ring-2 focus-within:ring-teal-700"><Upload className="text-teal-600" size={28} /><span className="mt-3 text-sm font-bold">{saving ? "Importing product references…" : "Choose CSV file"}</span><span className="mt-1 text-xs text-slate-500">Required: name. Optional: barcode, medicine identity, stock code, units, and reorder range.</span><input disabled={saving} accept=".csv,text/csv" type="file" onChange={importFile} className="sr-only" /></label></div></Dialog>;
}
