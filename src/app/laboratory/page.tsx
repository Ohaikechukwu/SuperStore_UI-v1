"use client";

import FormSelect from "@/components/form-select";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, CircleDollarSign, FlaskConical, Plus, RefreshCw, Stethoscope, X } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";
import { can, type AuthorizationContext } from "@/lib/authorization";

type Patient = { id: string; patient_number: string; full_name: string };
type Encounter = { id: string; patient_id: string; patient_name: string; encounter_type: string; status: string };
type Invoice = { id: string; amount: string; paid_amount: string; status: string };
type TestCatalog = { id: string; code: string; name: string; specimen_type: string | null; standard_price: string; turnaround_hours: number | null; result_template: string | null };
type LabOrder = { id: string; patient_id: string; patient_name: string; test_name: string; priority: string; status: string; result: string | null; resulted_at: string | null; reviewed_at: string | null; reviewed_by: string | null; charge_amount: string; invoice_id: string | null };
type Tab = "queue" | "billing";
type LaboratoryWorkspace = { orders: LabOrder[]; patients: Patient[]; encounters: Encounter[]; invoices: Invoice[]; auth: AuthorizationContext | null };
const emptyWorkspace: LaboratoryWorkspace = { orders: [], patients: [], encounters: [], invoices: [], auth: null };
const maxVisibleOrders = 100;

export default function Page() {
  const [workspace, setWorkspace] = useState<LaboratoryWorkspace>(emptyWorkspace);
  const { orders, patients, encounters, invoices, auth } = workspace;
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<LabOrder | null>(null);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("queue");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setBusy(true); setError("");
    const [orderResult, patientResult, encounterResult, invoiceResult, authResult] = await Promise.allSettled([
      api.get<LabOrder[]>("/api/v1/hospital/lab/orders"),
      api.get<Patient[]>("/api/v1/clinical/patients"),
      api.get<Encounter[]>("/api/v1/hospital/encounters"),
      api.get<Invoice[]>("/api/v1/hospital/billing/invoices"),
      api.get<AuthorizationContext>("/api/v1/auth/me/authorization"),
    ]);
    startTransition(() => {
      setWorkspace((current) => ({
        orders: orderResult.status === "fulfilled" ? orderResult.value : current.orders,
        patients: patientResult.status === "fulfilled" ? patientResult.value : current.patients,
        encounters: encounterResult.status === "fulfilled" ? encounterResult.value : current.encounters,
        invoices: invoiceResult.status === "fulfilled" ? invoiceResult.value : current.invoices,
        auth: authResult.status === "fulfilled" ? authResult.value : current.auth,
      }));
      if (orderResult.status === "rejected") setError(orderResult.reason instanceof ApiError ? orderResult.reason.message : "Unable to load laboratory orders.");
      setBusy(false);
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const invoiceById = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice])), [invoices]);
  const visibleOrders = useMemo(() => orders.slice(0, maxVisibleOrders), [orders]);
  const pending = orders.filter((order) => !["validated", "reviewed"].includes(order.status));
  const openInvoiceCount = orders.filter((order) => {
    const invoice = order.invoice_id ? invoiceById.get(order.invoice_id) : null;
    return invoice && invoice.status !== "paid";
  }).length;
  const availableEncounters = encounters.filter((encounter) => encounter.status === "open" && (!selectedPatient || encounter.patient_id === selectedPatient));
  const mayOrder = can(auth, "hospital.lab.order");
  const mayPerform = can(auth, "hospital.lab.perform");
  const mayManageCatalog = can(auth, "hospital.lab.catalog.manage");
  const mayValidate = can(auth, "hospital.lab.result.validate");
  const mayReview = can(auth, "hospital.lab.review");
  const mayBill = can(auth, "hospital.billing.post");

  async function saveResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    try {
      const result = String(new FormData(event.currentTarget).get("result"));
      await api.post(`/api/v1/hospital/lab/orders/${selected.id}/result`, { result });
      setSelected(null); setNotice("Laboratory result entered and awaiting validation."); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to record laboratory result."); }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const testCatalogIds = form.getAll("test_catalog_ids").map(String).filter(Boolean);
      await api.post("/api/v1/hospital/lab/orders", {
        patient_id: String(form.get("patient_id")), encounter_id: String(form.get("encounter_id")),
        test_catalog_ids: testCatalogIds, provisional_diagnosis: String(form.get("provisional_diagnosis")) || null,
        priority: String(form.get("priority")),
      });
      setOrderOpen(false); setSelectedPatient("");
      setNotice(`${testCatalogIds.length} laboratory order${testCatalogIds.length === 1 ? "" : "s"} created with linked invoices and ledger entries.`); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to create laboratory order."); }
  }

  async function createCatalogTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.post("/api/v1/hospital/lab/catalog", {
        code: String(form.get("code")), name: String(form.get("name")),
        specimen_type: String(form.get("specimen_type")) || null,
        standard_price: String(form.get("standard_price")),
        turnaround_hours: String(form.get("turnaround_hours")) ? Number(form.get("turnaround_hours")) : null,
        result_template: String(form.get("result_template")) || null,
      });
      setCatalogOpen(false); setNotice("Catalog test created. Clinicians can now order it at the configured system price."); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to create the catalog test."); }
  }

  async function reviewResult(order: LabOrder) {
    try {
      await api.post(`/api/v1/hospital/lab/orders/${order.id}/review`, {});
      setSelected(null); setNotice("Result marked as reviewed by the treating clinician."); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to mark result as reviewed."); }
  }

  async function updateStatus(order: LabOrder, status: "sample_collected" | "in_progress") {
    try { await api.post(`/api/v1/hospital/lab/orders/${order.id}/status`, { status }); setSelected(null); setNotice(status === "sample_collected" ? "Sample collected." : "Laboratory processing started."); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update the laboratory workflow."); }
  }

  async function validateResult(order: LabOrder) {
    try { await api.post(`/api/v1/hospital/lab/orders/${order.id}/validate`, {}); setSelected(null); setNotice("Result validated; the ordering clinician has been notified."); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to validate the laboratory result."); }
  }

  async function payInvoice(invoice: Invoice) {
    const remaining = Number(invoice.amount) - Number(invoice.paid_amount);
    if (remaining <= 0) return;
    try {
      await api.post(`/api/v1/hospital/billing/invoices/${invoice.id}/pay`, { amount: remaining.toFixed(2), payment_method: "cash" });
      setNotice("Laboratory invoice payment posted to receivables and cash."); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to post laboratory payment."); }
  }

  return <DashboardShell title="Laboratory" subtitle="Orders, result validation, patient billing, and ledger-connected diagnostics"><PermissionGate permission="hospital.lab.read" module="laboratory"><div className="mx-auto max-w-[1280px] space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Laboratory module</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Diagnostic worklist</h1><p className="mt-2 text-sm text-slate-500">Every test request is linked to its patient encounter, invoice, receivable, and General Ledger entry.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"><RefreshCw size={16} /> Refresh</button><button onClick={() => setCatalogOpen(true)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">Test catalog</button>{mayOrder && <button onClick={() => setOrderOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} /> New test order</button>}</div></header>
    {error && <Notice tone="rose" text={error} />}{notice && <Notice tone="emerald" text={notice} />}
    <div className="grid gap-4 sm:grid-cols-4"><Metric label="Total orders" value={orders.length} /><Metric label="In laboratory" value={pending.length} tone="amber" /><Metric label="Validated" value={orders.length - pending.length} tone="emerald" /><Metric label="Outstanding invoices" value={openInvoiceCount} tone="rose" /></div>
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2"><Tab active={tab === "queue"} label="Test queue" click={() => setTab("queue")} /><Tab active={tab === "billing"} label="Billing & receivables" click={() => setTab("billing")} /></nav>
    {tab === "queue" && <div className="grid gap-6 xl:grid-cols-[1fr_360px]"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><FlaskConical className="text-teal-600" size={21} /><div><h2 className="text-xl font-bold">Test queue</h2><p className="mt-1 text-xs text-slate-400">Open a request to review its patient, charge, and result status.</p></div></div>{orders.length > visibleOrders.length && <p className="mt-4 text-xs text-slate-500">Showing the first {visibleOrders.length} orders. Use a more focused queue view for older requests.</p>}{busy ? <p className="py-10 text-sm text-slate-500">Loading laboratory orders…</p> : <div className="mt-5 divide-y divide-slate-100">{visibleOrders.map((order) => <OrderRow key={order.id} order={order} invoice={order.invoice_id ? invoiceById.get(order.invoice_id) : undefined} select={setSelected} />)}{!orders.length && <EmptyQueue mayOrder={mayOrder} create={() => setOrderOpen(true)} />}</div>}</section><FlowCard /></div>}
    {tab === "billing" && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-teal-600">Tenant receivables</p><h2 className="mt-1 text-xl font-bold">Laboratory billing register</h2><p className="mt-1 text-sm text-slate-500">Payments automatically post against the same tenant’s patient receivables account.</p></div><CircleDollarSign className="text-teal-600" size={24} /></div>{orders.length > visibleOrders.length && <p className="mt-4 text-xs text-slate-500">Showing the first {visibleOrders.length} orders.</p>}<div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="py-3">Patient / test</th><th className="py-3">Charge</th><th className="py-3">Invoice</th><th className="py-3">Status</th><th /></tr></thead><tbody className="divide-y divide-slate-100">{visibleOrders.map((order) => <BillingRow key={order.id} order={order} invoice={order.invoice_id ? invoiceById.get(order.invoice_id) : undefined} mayBill={mayBill} pay={payInvoice} />)}</tbody></table>{!orders.length && <p className="py-10 text-center text-sm text-slate-500">Create a laboratory order to start the billing register.</p>}</div></section>}
    {selected && <ResultModal order={selected} canPerform={mayPerform} canValidate={mayValidate} canReview={mayReview} close={() => setSelected(null)} save={saveResult} updateStatus={updateStatus} validate={validateResult} review={reviewResult} />}
    {orderOpen && <OrderModal patients={patients} encounters={availableEncounters} selectPatient={setSelectedPatient} close={() => setOrderOpen(false)} submit={createOrder} />}
    {catalogOpen && <CatalogModal canManage={mayManageCatalog} close={() => setCatalogOpen(false)} submit={createCatalogTest} />}
  </div></PermissionGate></DashboardShell>;
}

function OrderRow({ order, invoice, select }: { order: LabOrder; invoice?: Invoice; select: (order: LabOrder) => void }) { return <button onClick={() => select(order)} className="flex w-full items-center justify-between gap-4 py-4 text-left transition hover:bg-slate-50"><div><p className="font-bold">{order.test_name}</p><p className="mt-1 text-xs text-slate-400">{order.patient_name} · {order.priority} · Charge {order.charge_amount}</p><p className="mt-1 text-xs text-teal-700">Invoice {invoice ? invoice.status.replaceAll("_", " ") : "linked"}{order.reviewed_at ? " · Clinician reviewed" : order.status === "validated" ? " · Clinician notified" : ""}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${["validated", "reviewed"].includes(order.status) ? "bg-emerald-50 text-emerald-700" : order.status === "result_entered" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"}`}>{order.status.replaceAll("_", " ")}</span></button>; }
function BillingRow({ order, invoice, mayBill, pay }: { order: LabOrder; invoice?: Invoice; mayBill: boolean; pay: (invoice: Invoice) => Promise<void> }) { return <tr><td className="py-4"><p className="font-semibold">{order.patient_name}</p><p className="text-xs text-slate-400">{order.test_name}</p></td><td className="py-4 font-bold">{order.charge_amount}</td><td className="py-4 text-xs text-slate-500">{invoice ? `${invoice.paid_amount} / ${invoice.amount}` : "Linked invoice"}</td><td className="py-4 capitalize">{invoice?.status || "unavailable"}</td><td className="py-4 text-right">{invoice && invoice.status !== "paid" && mayBill && <button onClick={() => void pay(invoice)} className="text-xs font-bold text-teal-700">Pay balance</button>}</td></tr>; }
function FlowCard() { return <section className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm"><Stethoscope className="text-teal-300" size={24} /><h2 className="mt-5 text-xl font-bold">Connected care flow</h2><ol className="mt-5 space-y-4 text-sm text-slate-300"><li><strong className="text-white">1. Doctor</strong><br />Orders a configured catalog test from the patient encounter; the system snapshots the price.</li><li><strong className="text-white">2. Laboratory</strong><br />Collects the specimen, processes it, enters the result, then validates it.</li><li><strong className="text-white">3. Clinician</strong><br />Validation notifies the ordering clinician, who reviews the result in the care flow.</li><li><strong className="text-white">4. Billing</strong><br />The order creates its receivable and laboratory revenue journal independently of the clinical result.</li></ol></section>; }
function ResultModal({ order, canPerform, canValidate, canReview, close, save, updateStatus, validate, review }: { order: LabOrder; canPerform: boolean; canValidate: boolean; canReview: boolean; close: () => void; save: (event: FormEvent<HTMLFormElement>) => Promise<void>; updateStatus: (order: LabOrder, status: "sample_collected" | "in_progress") => Promise<void>; validate: (order: LabOrder) => Promise<void>; review: (order: LabOrder) => Promise<void> }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-teal-600">Laboratory request</p><h2 className="mt-2 text-xl font-bold">{order.test_name}</h2><p className="mt-1 text-sm text-slate-500">{order.patient_name} · Charge {order.charge_amount}</p></div><button type="button" onClick={close}><X size={18} /></button></div><div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm"><strong>Workflow status:</strong> <span className="capitalize">{order.status.replaceAll("_", " ")}</span></div>{order.status === "ordered" && (canPerform ? <button type="button" onClick={() => void updateStatus(order, "sample_collected")} className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Mark sample collected</button> : <p className="mt-5 text-sm text-slate-500">Awaiting specimen collection by Laboratory.</p>)}{order.status === "sample_collected" && (canPerform ? <button type="button" onClick={() => void updateStatus(order, "in_progress")} className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Start processing</button> : <p className="mt-5 text-sm text-slate-500">Sample collected; awaiting Laboratory processing.</p>)}{order.status === "in_progress" && (canPerform ? <form onSubmit={(event) => void save(event)}><textarea name="result" required rows={6} className="mt-5 w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Enter result values and interpretation" /><button className="mt-4 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Submit result for validation</button></form> : <p className="mt-5 text-sm text-slate-500">Laboratory processing is in progress.</p>)}{order.status === "result_entered" && <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">Result entered; pending validation</p><p className="mt-2 whitespace-pre-wrap">{order.result}</p>{canValidate && <button type="button" onClick={() => void validate(order)} className="mt-4 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white">Validate result and notify doctor</button>}</div>}{["validated", "reviewed"].includes(order.status) && <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900"><div className="flex items-center gap-2 font-bold"><CheckCircle2 size={16} /> Validated result</div><p className="mt-2 whitespace-pre-wrap">{order.result}</p>{order.reviewed_at ? <p className="mt-3 text-xs font-bold text-emerald-700">Reviewed by treating clinician</p> : canReview ? <button type="button" onClick={() => void review(order)} className="mt-4 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white">Mark result reviewed</button> : <p className="mt-3 text-xs text-emerald-700">Ordering clinician has been notified.</p>}</div>}</div></div>; }
function OrderModal({ patients, encounters, selectPatient, close, submit }: { patients: Patient[]; encounters: Encounter[]; selectPatient: (id: string) => void; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  const [catalog, setCatalog] = useState<TestCatalog[]>([]);
  const [testIds, setTestIds] = useState<string[]>([]);
  useEffect(() => { void api.get<TestCatalog[]>("/api/v1/hospital/lab/catalog").then(setCatalog).catch(() => setCatalog([])); }, []);
  const toggleTest = (id: string) => setTestIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const selectedTests = catalog.filter((test) => testIds.includes(test.id));
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void submit(event)} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Order laboratory tests</h2><p className="mt-1 text-sm text-slate-500">Select as many configured tests as needed. Each test receives its own protected order, invoice, and ledger entry.</p></div><button type="button" onClick={close}><X size={18} /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><SelectField label="Patient" name="patient_id" required options={patients.map((patient) => [patient.id, `${patient.full_name} (${patient.patient_number})`])} onChange={selectPatient} wide /><SelectField label="Open encounter" name="encounter_id" required options={encounters.map((encounter) => [encounter.id, `${encounter.patient_name} · ${encounter.encounter_type}`])} wide /><fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-slate-600">Catalog tests</legend><div className="mt-2 grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-2">{catalog.map((test) => <label key={test.id} className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 text-sm ${testIds.includes(test.id) ? "bg-teal-50 text-teal-950" : "hover:bg-slate-50"}`}><input name="test_catalog_ids" type="checkbox" value={test.id} checked={testIds.includes(test.id)} onChange={() => toggleTest(test.id)} className="mt-1 h-4 w-4 accent-teal-600" /><span><strong>{test.code} · {test.name}</strong><span className="mt-1 block text-xs text-slate-500">{test.standard_price} · {test.specimen_type || "Specimen not specified"}{test.turnaround_hours ? ` · ${test.turnaround_hours}h turnaround` : ""}</span></span></label>)}{!catalog.length && <p className="p-3 text-sm text-slate-500">No active catalog tests are configured.</p>}</div></fieldset>{selectedTests.length ? <div className="sm:col-span-2 rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-900"><strong>{selectedTests.length} test{selectedTests.length === 1 ? "" : "s"} selected.</strong> Each will be billed and processed separately.</div> : null}<label className="text-xs font-bold text-slate-600 sm:col-span-2">Provisional diagnosis<textarea name="provisional_diagnosis" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Clinical indication or provisional diagnosis" /></label><SelectField label="Priority" name="priority" options={[["routine", "ROUTINE"], ["urgent", "URGENT"], ["stat", "STAT"]]} /></div><button disabled={!testIds.length} className="mt-6 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Create {testIds.length || ""} test order{testIds.length === 1 ? "" : "s"}</button></form></div>;
}
function CatalogModal({ canManage, close, submit }: { canManage: boolean; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) { const [catalog, setCatalog] = useState<TestCatalog[]>([]); useEffect(() => { void api.get<TestCatalog[]>("/api/v1/hospital/lab/catalog").then(setCatalog).catch(() => setCatalog([])); }, []); return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="scrollbar-hidden max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Laboratory test catalog</h2><p className="mt-1 text-sm text-slate-500">Only configured catalog prices can be charged on clinical orders.</p></div><button type="button" onClick={close}><X size={18} /></button></div><div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="py-2">Code</th><th className="py-2">Test</th><th className="py-2">Specimen</th><th className="py-2">Price</th><th className="py-2">TAT</th></tr></thead><tbody className="divide-y divide-slate-100">{catalog.map((test) => <tr key={test.id}><td className="py-3 font-semibold">{test.code}</td><td className="py-3">{test.name}</td><td className="py-3 text-slate-500">{test.specimen_type || "—"}</td><td className="py-3 font-bold">{test.standard_price}</td><td className="py-3 text-slate-500">{test.turnaround_hours ? `${test.turnaround_hours}h` : "—"}</td></tr>)}</tbody></table>{!catalog.length && <p className="py-5 text-sm text-slate-500">No active laboratory tests have been configured yet.</p>}</div>{canManage ? <form onSubmit={(event) => void submit(event)} className="mt-7 border-t border-slate-100 pt-6"><h3 className="text-base font-bold">Add catalog test</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><InputField label="Test code" name="code" required /><InputField label="Test name" name="name" required /><InputField label="Specimen type" name="specimen_type" /><InputField label="Standard price" name="standard_price" type="number" required /><InputField label="Turnaround (hours)" name="turnaround_hours" type="number" /><label className="text-xs font-bold text-slate-600 sm:col-span-2">Result template (optional)<textarea name="result_template" rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Structured result guidance or reference ranges" /></label></div><button className="mt-5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">Add catalog test</button></form> : <p className="mt-7 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">You can view the catalog, but need the <strong>Manage laboratory test catalog and prices</strong> permission to add or change tests.</p>}</div></div>; }
function Metric({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "amber" | "emerald" | "rose" }) { const colors = { slate: "text-slate-900", amber: "text-amber-600", emerald: "text-emerald-600", rose: "text-rose-600" }; return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold text-slate-400">{label}</p><p className={`mt-2 text-2xl font-bold ${colors[tone]}`}>{value}</p></div>; }
function Notice({ tone, text }: { tone: "rose" | "emerald"; text: string }) { return <div className={`rounded-2xl border px-4 py-3 text-sm ${tone === "rose" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>{text}</div>; }
function Tab({ active, label, click }: { active: boolean; label: string; click: () => void }) { return <button onClick={click} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${active ? "bg-teal-50 text-teal-700" : "text-slate-500"}`}>{label}</button>; }
function EmptyQueue({ mayOrder, create }: { mayOrder: boolean; create: () => void }) { return <div className="py-14 text-center"><FlaskConical className="mx-auto text-slate-300" size={36} /><p className="mt-4 text-base font-bold text-slate-700">No laboratory requests yet</p><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Start with a patient encounter, then create a test order here. The system will create its invoice, receivable, and laboratory revenue journal in the same tenant.</p>{mayOrder && <button onClick={create} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} /> Create first test order</button>}</div>; }
function SelectField({ label, name, required = false, options, onChange, wide = false }: { label: string; name: string; required?: boolean; options: string[][]; onChange?: (value: string) => void; wide?: boolean }) { return <label className={`text-xs font-bold text-slate-600 ${wide ? "sm:col-span-2" : ""}`}>{label}<FormSelect name={name} required={required} onChange={(event) => onChange?.(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Select {label.toLowerCase()}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</FormSelect></label>; }
function InputField({ label, name, type = "text", required = false }: { label: string; name: string; type?: "text" | "number"; required?: boolean }) { return <label className="text-xs font-bold text-slate-600">{label}<input name={name} type={type} required={required} min={type === "number" ? "0.01" : undefined} step={type === "number" ? "0.01" : undefined} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>; }
