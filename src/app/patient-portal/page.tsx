"use client";

import Link from "next/link";
import { CalendarDays, CreditCard, FileText, HeartPulse, MessageCircle, ReceiptText, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Portal = {
  patient: { name: string; patient_number: string };
  wallet: { balance: string; currency: string };
  total_spent: string;
  unread_messages: number;
  appointments: Array<{ id: string; scheduled_for: string; status: string; reason: string | null }>;
  laboratory: Array<{ test_name: string; result_available: boolean }>;
  radiology: Array<{ approved: boolean }>;
  prescriptions: Array<{ status: string }>;
  invoices: Array<{ amount: string; paid_amount: string; status: string }>;
};

const money = (value: string | undefined | null, currency = "NGN") => {
  const amount = Number(value);
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
};

export default function PatientPortalPage() {
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api.get<Portal>("/api/v1/hospital/patient-portal/me")
      .then(setData)
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to load patient portal."));
  }, []);

  const outstanding = data?.invoices.reduce((sum, item) => sum + Math.max(0, Number(item.amount) - Number(item.paid_amount)), 0) || 0;
  const next = data?.appointments
    .filter((item) => !["cancelled", "completed", "no_show"].includes(item.status))
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0];
  const reviewedResults = (data?.laboratory.filter((item) => item.result_available).length || 0) + (data?.radiology.filter((item) => item.approved).length || 0);
  const activePrescriptions = data?.prescriptions.filter((item) => item.status === "active").length || 0;

  return (
    <DashboardShell title="Patient portal" subtitle="Your care, appointments, messages, and payments in one secure place">
      <PermissionGate permission="patient.portal.access" module="hospital">
        <main className="mx-auto max-w-[1280px] space-y-6">
          {error ? <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">{error}. Ask your hospital to link your account.</p>
            : !data ? <p className="text-sm text-slate-500">Loading your care portal…</p>
              : <>
                <header className="rounded-3xl bg-gradient-to-br from-teal-700 to-cyan-700 p-6 text-white shadow-sm sm:p-8">
                  <p className="text-sm text-teal-100">Welcome back</p>
                  <h1 className="mt-1 text-3xl font-bold">{data.patient.name}</h1>
                  <p className="mt-2 text-sm text-teal-100">Patient number: {data.patient.patient_number}</p>
                  <div className="mt-6 flex flex-wrap gap-3"><Quick href="/patient-portal/appointments" label="Book appointment" /><Quick href="/patient-portal/messages" label="Message care team" ghost /></div>
                </header>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  <Metric icon={<CalendarDays size={19} />} label="Next appointment" value={next ? new Date(next.scheduled_for).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "None booked"} href="/patient-portal/appointments/manage" />
                  <Metric icon={<WalletCards size={19} />} label="Wallet balance" value={money(data.wallet.balance, data.wallet.currency)} href="/patient-portal/wallet" />
                  <Metric icon={<ReceiptText size={19} />} label="Total spent" value={money(data.total_spent || "0", data.wallet.currency)} href="/patient-portal/invoices" />
                  <Metric icon={<CreditCard size={19} />} label="Outstanding balance" value={money(String(outstanding), data.wallet.currency)} href="/patient-portal/invoices" />
                  <Metric icon={<MessageCircle size={19} />} label="Care team messages" value={data.unread_messages ? `${data.unread_messages} unread` : "All caught up"} href="/patient-portal/messages" />
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
                  <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Your next visit</h2><p className="mt-1 text-sm text-slate-500">Manage appointment timing before you arrive.</p></div><CalendarDays className="text-teal-600" /></div>
                    {next ? <div className="mt-5 rounded-2xl bg-teal-50 p-4"><p className="font-bold text-teal-950">{new Date(next.scheduled_for).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}</p><p className="mt-1 text-sm text-teal-800">{next.reason || "Hospital appointment"} · {next.status.replaceAll("_", " ")}</p></div> : <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">You have no upcoming appointment. Book a visit when you are ready.</p>}
                    <Link href="/patient-portal/appointments/manage" className="mt-5 inline-flex text-sm font-bold text-teal-700">Manage appointments →</Link>
                  </article>
                  <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><HeartPulse className="text-teal-600" /><h2 className="mt-4 text-xl font-bold">Care updates</h2><p className="mt-2 text-sm text-slate-600">{reviewedResults} reviewed result{reviewedResults === 1 ? "" : "s"} and {activePrescriptions} active prescription{activePrescriptions === 1 ? "" : "s"}.</p><Link href="/patient-portal/care" className="mt-5 inline-flex text-sm font-bold text-teal-700">View my care summary →</Link></article>
                </section>

                <section className="grid gap-4 md:grid-cols-3"><Action href="/patient-portal/care" icon={<HeartPulse size={19} />} title="My care" text="Reviewed results, medicines, plans, and visit summaries." /><Action href="/patient-portal/documents" icon={<FileText size={19} />} title="Documents" text="Open secure reports, statements, and discharge documents." /><Action href="/patient-portal/profile" icon={<MessageCircle size={19} />} title="Profile & privacy" text="Keep contact details, next of kin, and preferences current." /></section>
              </>}
        </main>
      </PermissionGate>
    </DashboardShell>
  );
}

function Metric({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href: string }) {
  return <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300"><span className="text-teal-600">{icon}</span><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p></Link>;
}
function Action({ icon, title, text, href }: { icon: React.ReactNode; title: string; text: string; href: string }) {
  return <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300"><span className="text-teal-600">{icon}</span><h2 className="mt-3 font-bold">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-600">{text}</p></Link>;
}
function Quick({ href, label, ghost = false }: { href: string; label: string; ghost?: boolean }) {
  return <Link href={href} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${ghost ? "border border-white/40 bg-white/10 hover:bg-white/20" : "bg-white text-teal-800 hover:bg-teal-50"}`}>{label}</Link>;
}
