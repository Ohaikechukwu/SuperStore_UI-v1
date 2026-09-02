"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type InvoiceDetail = {
  invoice: { id: string; number: string; description: string; issued_at: string; status: string; amount: string; paid_amount: string; outstanding_amount: string; currency: string };
  hospital: { name: string; branch_name?: string | null };
  patient: { name: string; patient_number: string };
  service: { type: string; title: string; test_code?: string | null; specimen_type?: string | null; modality?: string | null; priority?: string | null; status?: string | null; scheduled_for?: string | null };
  booking?: { scheduled_for: string; duration_minutes: number; status: string; reason?: string | null; branch_name?: string | null; clinician_name?: string | null } | null;
};

function money(value: string, currency: string) {
  return Number(value).toLocaleString(undefined, { style: "currency", currency });
}

function label(value?: string | null) {
  return value ? value.replaceAll("_", " ") : "—";
}

export default function Page() {
  const params = useParams<{ invoiceId: string }>();
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.invoiceId) return;
    void api.get<InvoiceDetail>(`/api/v1/hospital/patient-portal/invoices/${params.invoiceId}`)
      .then(setDetail)
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to load this invoice."));
  }, [params.invoiceId]);

  return <DashboardShell title="Invoice details" subtitle="A detailed record of your hospital service and payment status">
    <PermissionGate permission="patient.portal.access" module="hospital">
      <main className="mx-auto max-w-3xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden"><Link href="/patient-portal/invoices" className="text-sm font-bold text-teal-700">← Back to invoices</Link>{detail && <button onClick={() => window.print()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Print invoice</button>}</div>
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {!detail && !error && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading invoice…</p>}
        {detail && <article className="space-y-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <header className="flex flex-wrap justify-between gap-5 border-b border-slate-200 pb-6"><div><p className="text-sm font-semibold uppercase tracking-wide text-teal-700">{detail.hospital.name}</p><h1 className="mt-1 text-3xl font-bold">Invoice</h1>{detail.hospital.branch_name && <p className="mt-1 text-sm text-slate-500">{detail.hospital.branch_name}</p>}</div><div className="text-left sm:text-right"><p className="font-mono text-sm font-bold text-slate-700">{detail.invoice.number}</p><p className="mt-1 text-sm text-slate-500">Issued {new Date(detail.invoice.issued_at).toLocaleString()}</p><p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-700">{label(detail.invoice.status)}</p></div></header>
          <section className="grid gap-5 sm:grid-cols-2"><div><h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Bill to</h2><p className="mt-2 font-bold text-slate-900">{detail.patient.name}</p><p className="text-sm text-slate-600">Patient no. {detail.patient.patient_number}</p></div><div><h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Service</h2><p className="mt-2 font-bold text-slate-900">{detail.service.title}</p><p className="text-sm capitalize text-slate-600">{label(detail.service.type)} · {label(detail.service.status)}</p></div></section>
          {detail.booking && <section className="rounded-xl bg-slate-50 p-5"><h2 className="font-bold text-slate-900">Booking details</h2><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Date and time</dt><dd className="font-medium">{new Date(detail.booking.scheduled_for).toLocaleString()}</dd></div><div><dt className="text-slate-500">Appointment status</dt><dd className="font-medium capitalize">{label(detail.booking.status)}</dd></div><div><dt className="text-slate-500">Clinician</dt><dd className="font-medium">{detail.booking.clinician_name || "To be assigned after payment"}</dd></div><div><dt className="text-slate-500">Duration</dt><dd className="font-medium">{detail.booking.duration_minutes} minutes</dd></div>{detail.booking.reason && <div className="sm:col-span-2"><dt className="text-slate-500">Reason for visit</dt><dd className="font-medium">{detail.booking.reason}</dd></div>}</dl></section>}
          {!detail.booking && <section className="rounded-xl bg-slate-50 p-5"><h2 className="font-bold text-slate-900">Service details</h2><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{detail.service.test_code && <div><dt className="text-slate-500">Test code</dt><dd className="font-medium">{detail.service.test_code}</dd></div>}{detail.service.specimen_type && <div><dt className="text-slate-500">Specimen</dt><dd className="font-medium">{detail.service.specimen_type}</dd></div>}{detail.service.modality && <div><dt className="text-slate-500">Modality</dt><dd className="font-medium">{detail.service.modality}</dd></div>}{detail.service.scheduled_for && <div><dt className="text-slate-500">Scheduled for</dt><dd className="font-medium">{new Date(detail.service.scheduled_for).toLocaleString()}</dd></div>}</dl></section>}
          <section className="border-t border-slate-200 pt-5"><div className="ml-auto max-w-sm space-y-2 text-sm"><div className="flex justify-between"><span className="text-slate-600">Invoice total</span><span className="font-medium">{money(detail.invoice.amount, detail.invoice.currency)}</span></div><div className="flex justify-between"><span className="text-slate-600">Paid</span><span className="font-medium text-emerald-700">{money(detail.invoice.paid_amount, detail.invoice.currency)}</span></div><div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold"><span>Outstanding</span><span>{money(detail.invoice.outstanding_amount, detail.invoice.currency)}</span></div></div></section>
        </article>}
      </main>
    </PermissionGate>
  </DashboardShell>;
}
