"use client";

import FormSelect from "@/components/form-select";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, Pencil, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import { useToast } from "@/components/toast-provider";
import { api, ApiError } from "@/lib/api";
import { can, type AuthorizationContext } from "@/lib/authorization";

type Supplier = { id: string; name: string; code: string; contact_name: string | null; phone: string | null; email: string | null; payment_terms_days: number; active: boolean };
type Customer = { id: string; customer_number: string; name: string; phone: string | null; email: string | null; address: string | null; active: boolean };
type Tab = "suppliers" | "customers";
type StatusChange = { type: "supplier"; record: Supplier } | { type: "customer"; record: Customer } | null;
type Removal = { type: "supplier"; record: Supplier } | { type: "customer"; record: Customer } | null;

function problem(error: unknown, fallback: string) { return error instanceof ApiError ? error.message : fallback; }
function optional(value: FormDataEntryValue | null) { const text = String(value || "").trim(); return text || null; }

export default function ContactsPage() {
  const toast = useToast();
  const [authorization, setAuthorization] = useState<AuthorizationContext | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tab, setTab] = useState<Tab>("suppliers");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [supplierEditor, setSupplierEditor] = useState<Supplier | "new" | null>(null);
  const [customerEditor, setCustomerEditor] = useState<Customer | "new" | null>(null);
  const [statusChange, setStatusChange] = useState<StatusChange>(null);
  const [removal, setRemoval] = useState<Removal>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canReadSuppliers = can(authorization, "purchasing.read");
  const canManageSuppliers = can(authorization, "purchasing.supplier.manage");
  const canReadCustomers = can(authorization, "customers.read");
  const canManageCustomers = can(authorization, "customers.manage");

  useEffect(() => {
    let active = true;
    void api.get<AuthorizationContext>("/api/v1/auth/me/authorization")
      .then(async (context) => {
        const [supplierData, customerData] = await Promise.all([
          can(context, "purchasing.read") ? api.get<Supplier[]>("/api/v1/purchasing/suppliers?include_inactive=true") : Promise.resolve<Supplier[]>([]),
          can(context, "customers.read") ? api.get<Customer[]>("/api/v1/store/customers?include_inactive=true") : Promise.resolve<Customer[]>([]),
        ]);
        if (!active) return;
        setAuthorization(context); setSuppliers(supplierData); setCustomers(customerData);
        setTab(can(context, "purchasing.read") ? "suppliers" : "customers");
      })
      .catch((error) => active && toast.error("Unable to load contacts", problem(error, "Please try again.")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [toast]);

  const visibleSuppliers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return suppliers.filter((supplier) => (status === "all" || (status === "active" ? supplier.active : !supplier.active)) && (!term || [supplier.name, supplier.code, supplier.contact_name, supplier.phone, supplier.email].some((value) => value?.toLowerCase().includes(term))));
  }, [suppliers, query, status]);
  const visibleCustomers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return customers.filter((customer) => (status === "all" || (status === "active" ? customer.active : !customer.active)) && (!term || [customer.name, customer.customer_number, customer.phone, customer.email, customer.address].some((value) => value?.toLowerCase().includes(term))));
  }, [customers, query, status]);

  function switchTab(next: Tab) { setTab(next); setQuery(""); setStatus("all"); }
  async function saveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const payload = { name: String(form.get("name") || "").trim(), ...(supplierEditor !== "new" && form.get("code") ? { code: String(form.get("code")).trim() } : {}), contact_name: optional(form.get("contact_name")), phone: optional(form.get("phone")), email: optional(form.get("email")), payment_terms_days: Number(form.get("payment_terms_days") || 0) };
    setSaving(true);
    try {
      const record = supplierEditor === "new" ? await api.post<Supplier>("/api/v1/purchasing/suppliers", payload) : await api.patch<Supplier>(`/api/v1/purchasing/suppliers/${supplierEditor?.id}`, payload);
      setSuppliers((current) => [...current.filter((item) => item.id !== record.id), record].sort((left, right) => left.name.localeCompare(right.name)));
      const created = supplierEditor === "new"; setSupplierEditor(null); toast.success(created ? "Supplier created" : "Supplier updated", record.name);
    } catch (error) { toast.error("Unable to save supplier", problem(error, "Please review the details and try again.")); }
    finally { setSaving(false); }
  }
  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const payload = { name: String(form.get("name") || "").trim(), phone: optional(form.get("phone")), email: optional(form.get("email")), address: optional(form.get("address")) };
    setSaving(true);
    try {
      const record = customerEditor === "new" ? await api.post<Customer>("/api/v1/store/customers", payload) : await api.patch<Customer>(`/api/v1/store/customers/${customerEditor?.id}`, payload);
      setCustomers((current) => [...current.filter((item) => item.id !== record.id), record].sort((left, right) => left.name.localeCompare(right.name)));
      const created = customerEditor === "new"; setCustomerEditor(null); toast.success(created ? "Customer created" : "Customer updated", record.name);
    } catch (error) { toast.error("Unable to save customer", problem(error, "Please review the details and try again.")); }
    finally { setSaving(false); }
  }
  async function changeStatus() {
    if (!statusChange) return; setSaving(true);
    try {
      if (statusChange.type === "supplier") {
        const record = await api.patch<Supplier>(`/api/v1/purchasing/suppliers/${statusChange.record.id}`, { active: !statusChange.record.active });
        setSuppliers((current) => current.map((item) => item.id === record.id ? record : item)); toast.success(record.active ? "Supplier activated" : "Supplier deactivated", record.name);
      } else {
        const record = await api.patch<Customer>(`/api/v1/store/customers/${statusChange.record.id}`, { active: !statusChange.record.active });
        setCustomers((current) => current.map((item) => item.id === record.id ? record : item)); toast.success(record.active ? "Customer activated" : "Customer deactivated", record.name);
      }
      setStatusChange(null);
    } catch (error) { toast.error("Unable to update status", problem(error, "Please try again.")); }
    finally { setSaving(false); }
  }
  async function removeContact() {
    if (!removal) return; setSaving(true);
    try {
      if (removal.type === "supplier") {
        await api.delete(`/api/v1/purchasing/suppliers/${removal.record.id}`);
        setSuppliers((current) => current.filter((item) => item.id !== removal.record.id));
        toast.success("Supplier removed", removal.record.name);
      } else {
        await api.delete(`/api/v1/store/customers/${removal.record.id}`);
        setCustomers((current) => current.filter((item) => item.id !== removal.record.id));
        toast.success("Customer removed", removal.record.name);
      }
      setRemoval(null);
    } catch (error) { toast.error("Unable to remove contact", problem(error, "Deactivate this contact instead if it has transaction history.")); }
    finally { setSaving(false); }
  }

  const isSupplierTab = tab === "suppliers";
  return <DashboardShell title="Customers & suppliers" subtitle="Manage the people and companies you buy from and sell to"><div className="mx-auto max-w-7xl space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Contact directories</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Customers & suppliers</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Keep contact details, reference codes, and account status in one place. Deactivation preserves all transaction history and keeps the contact listed.</p></div>{(isSupplierTab ? canManageSuppliers : canManageCustomers) && <button onClick={() => isSupplierTab ? setSupplierEditor("new") : setCustomerEditor("new")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700"><Plus size={17} /> {isSupplierTab ? "New supplier" : "New customer"}</button>}</div>{(canReadSuppliers || canReadCustomers) ? <><div className="flex gap-2 border-b border-slate-200">{canReadSuppliers && <TabButton active={isSupplierTab} icon={<Building2 size={16} />} label="Suppliers" onClick={() => switchTab("suppliers")} />}{canReadCustomers && <TabButton active={!isSupplierTab} icon={<UserRound size={16} />} label="Customers" onClick={() => switchTab("customers")} />}</div><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-md"><Search size={17} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isSupplierTab ? "Search name, supplier code, contact, phone or email" : "Search name, customer number, phone or email"} className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" /></div><FormSelect value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></FormSelect></div>{loading ? <p className="py-16 text-center text-sm text-slate-500">Loading directory…</p> : isSupplierTab ? <SuppliersTable items={visibleSuppliers} canManage={canManageSuppliers} edit={setSupplierEditor} changeStatus={(record) => setStatusChange({ type: "supplier", record })} remove={(record) => setRemoval({ type: "supplier", record })} /> : <CustomersTable items={visibleCustomers} canManage={canManageCustomers} edit={setCustomerEditor} changeStatus={(record) => setStatusChange({ type: "customer", record })} remove={(record) => setRemoval({ type: "customer", record })} />}</section></> : <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">Your current role does not have access to either contact directory.</div>}</div>{supplierEditor && <SupplierModal record={supplierEditor === "new" ? null : supplierEditor} close={() => setSupplierEditor(null)} save={saveSupplier} saving={saving} />}{customerEditor && <CustomerModal record={customerEditor === "new" ? null : customerEditor} close={() => setCustomerEditor(null)} save={saveCustomer} saving={saving} />}{statusChange && <StatusModal record={statusChange.record} kind={statusChange.type} close={() => setStatusChange(null)} confirm={() => void changeStatus()} saving={saving} />}{removal && <RemovalModal record={removal.record} kind={removal.type} close={() => setRemoval(null)} confirm={() => void removeContact()} saving={saving} />}</DashboardShell>;
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) { return <button onClick={onClick} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold ${active ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{icon}{label}</button>; }
function Badge({ active }: { active: boolean }) { return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{active ? "Active" : "Inactive"}</span>; }
function ActionButtons({ active, edit, changeStatus, remove }: { active: boolean; edit: () => void; changeStatus: () => void; remove: () => void }) { return <div className="flex justify-end gap-2"><button onClick={edit} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-teal-300 hover:text-teal-700" title="Edit"><Pencil size={15} /></button><button onClick={changeStatus} className={`rounded-lg border px-2 py-1.5 text-xs font-bold ${active ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>{active ? "Deactivate" : "Activate"}</button><button onClick={remove} className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50" title="Remove permanently"><Trash2 size={15} /></button></div>; }
function SuppliersTable({ items, canManage, edit, changeStatus, remove }: { items: Supplier[]; canManage: boolean; edit: (item: Supplier) => void; changeStatus: (item: Supplier) => void; remove: (item: Supplier) => void }) { if (!items.length) return <Empty label="suppliers" />; return <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Terms</th><th className="px-4 py-3">Status</th>{canManage && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.id}><td className="px-4 py-4"><p className="font-bold text-slate-900">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.email || "No email"}</p></td><td className="px-4 py-4 font-mono text-xs font-bold text-slate-700">{item.code}</td><td className="px-4 py-4"><p>{item.contact_name || "—"}</p><p className="mt-1 text-xs text-slate-500">{item.phone || "No phone"}</p></td><td className="px-4 py-4">{item.payment_terms_days} day{item.payment_terms_days === 1 ? "" : "s"}</td><td className="px-4 py-4"><Badge active={item.active} /></td>{canManage && <td className="px-4 py-4"><ActionButtons active={item.active} edit={() => edit(item)} changeStatus={() => changeStatus(item)} remove={() => remove(item)} /></td>}</tr>)}</tbody></table></div>; }
function CustomersTable({ items, canManage, edit, changeStatus, remove }: { items: Customer[]; canManage: boolean; edit: (item: Customer) => void; changeStatus: (item: Customer) => void; remove: (item: Customer) => void }) { if (!items.length) return <Empty label="customers" />; return <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Customer no.</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Address</th><th className="px-4 py-3">Status</th>{canManage && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.id}><td className="px-4 py-4"><p className="font-bold text-slate-900">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.email || "No email"}</p></td><td className="px-4 py-4 font-mono text-xs font-bold text-slate-700">{item.customer_number}</td><td className="px-4 py-4">{item.phone || "—"}</td><td className="max-w-xs truncate px-4 py-4 text-slate-600">{item.address || "—"}</td><td className="px-4 py-4"><Badge active={item.active} /></td>{canManage && <td className="px-4 py-4"><ActionButtons active={item.active} edit={() => edit(item)} changeStatus={() => changeStatus(item)} remove={() => remove(item)} /></td>}</tr>)}</tbody></table></div>; }
function Empty({ label }: { label: string }) { return <p className="py-16 text-center text-sm text-slate-500">No {label} match the current search and status filter.</p>; }
function ModalShell({ children }: { children: React.ReactNode }) { return <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/45 p-4"><div className="mx-auto my-6 w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">{children}</div></div>; }
function SupplierModal({ record, close, save, saving }: { record: Supplier | null; close: () => void; save: (event: FormEvent<HTMLFormElement>) => Promise<void>; saving: boolean }) { return <ModalShell><form onSubmit={(event) => void save(event)}><ModalTitle eyebrow="Supplier directory" title={record ? "Edit supplier" : "New supplier"} close={close} /><div className="mt-6 grid gap-4 sm:grid-cols-2"><Input label="Supplier name *" name="name" defaultValue={record?.name} required className="sm:col-span-2" />{record ? <Input label="Supplier code" name="code" defaultValue={record.code} readOnly /> : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 sm:col-span-2">Supplier code will be generated automatically.</p>}<Input label="Payment terms (days)" name="payment_terms_days" type="number" min="0" max="365" defaultValue={record?.payment_terms_days ?? 0} /><Input label="Contact person" name="contact_name" defaultValue={record?.contact_name || ""} /><Input label="Phone" name="phone" type="tel" defaultValue={record?.phone || ""} /><Input label="Email" name="email" type="email" defaultValue={record?.email || ""} /></div><ModalActions close={close} saving={saving} label={record ? "Save supplier" : "Create supplier"} /></form></ModalShell>; }
function CustomerModal({ record, close, save, saving }: { record: Customer | null; close: () => void; save: (event: FormEvent<HTMLFormElement>) => Promise<void>; saving: boolean }) { return <ModalShell><form onSubmit={(event) => void save(event)}><ModalTitle eyebrow="Customer directory" title={record ? "Edit customer" : "New customer"} close={close} />{record && <p className="mt-2 text-sm text-slate-500">Customer number: <span className="font-mono font-bold text-slate-700">{record.customer_number}</span></p>}<div className="mt-6 grid gap-4 sm:grid-cols-2"><Input label="Customer name *" name="name" defaultValue={record?.name} required className="sm:col-span-2" /><Input label="Phone" name="phone" type="tel" defaultValue={record?.phone || ""} /><Input label="Email" name="email" type="email" defaultValue={record?.email || ""} /><Input label="Address" name="address" defaultValue={record?.address || ""} className="sm:col-span-2" /></div><ModalActions close={close} saving={saving} label={record ? "Save customer" : "Create customer"} /></form></ModalShell>; }
function StatusModal({ record, kind, close, confirm, saving }: { record: Supplier | Customer; kind: "supplier" | "customer"; close: () => void; confirm: () => void; saving: boolean }) { const activating = !record.active; return <ModalShell><ModalTitle eyebrow="Confirm status change" title={`${activating ? "Activate" : "Deactivate"} ${kind}`} close={close} /><p className="mt-4 text-sm leading-6 text-slate-600">{activating ? `${record.name} will be available for new transactions again.` : `${record.name} will no longer be available for new transactions. Existing sales and purchase history will remain intact.`}</p><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={close} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Cancel</button><button type="button" onClick={confirm} disabled={saving} className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${activating ? "bg-teal-600" : "bg-rose-600"}`}>{saving ? "Saving…" : activating ? "Activate" : "Deactivate"}</button></div></ModalShell>; }
function RemovalModal({ record, kind, close, confirm, saving }: { record: Supplier | Customer; kind: "supplier" | "customer"; close: () => void; confirm: () => void; saving: boolean }) { return <ModalShell><ModalTitle eyebrow="Remove contact" title={`Remove ${kind}?`} close={close} /><p className="mt-4 text-sm leading-6 text-slate-600"><strong>{record.name}</strong> will be permanently removed only if it has never been used on a sale, held basket, purchase order, receivable, or payable. If it has history, deactivate it instead.</p><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={close} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Cancel</button><button type="button" onClick={confirm} disabled={saving} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Removing…" : "Remove permanently"}</button></div></ModalShell>; }
function ModalTitle({ eyebrow, title, close }: { eyebrow: string; title: string; close: () => void }) { return <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-teal-600">{eyebrow}</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{title}</h2></div><button type="button" onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>; }
function Input({ label, className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className={`block text-xs font-bold text-slate-600 ${className}`}>{label}<input {...props} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100" /></label>; }
function ModalActions({ close, saving, label }: { close: () => void; saving: boolean; label: string }) { return <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={close} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Cancel</button><button disabled={saving} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : label}</button></div>; }
