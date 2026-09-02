"use client";

import FormSelect from "@/components/form-select";

import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { CalendarCheck2, CheckCircle2, Clock3, Plus, RefreshCw, Stethoscope, X } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";
import { can, type AuthorizationContext } from "@/lib/authorization";
import BookingModalWithProviders from "./booking-modal";

type Branch = { id: string; name: string; code: string };
type Provider = { id: string; name: string; job_title: string | null; department: string | null; branch_id: string | null };
type Patient = { id: string; patient_number: string; full_name: string };
type Appointment = { id: string; patient_id: string; patient_name: string | null; branch_id: string; clinician_id: string | null; preferred_clinician_id: string | null; clinician_name?: string | null; encounter_id: string | null; scheduled_for: string; duration_minutes: number; reason: string | null; status: string; cancellation_reason: string | null; checked_in_at: string | null; consultation_invoice_id: string | null; service_authorization_id: string | null; authorization_status: string; locked: boolean };

export default function Page() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]); const [providers, setProviders] = useState<Provider[]>([]);
  const [auth, setAuth] = useState<AuthorizationContext | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [assigning, setAssigning] = useState<Appointment | null>(null);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setBusy(true); setError("");
    const [appointmentResult, patientResult, branchResult, providerResult, authResult] = await Promise.allSettled([
      api.get<Appointment[]>("/api/v1/hospital/appointments"),
      api.get<Patient[]>("/api/v1/clinical/patients"),
      api.get<Branch[]>("/api/v1/catalog/branches"),
      api.get<Provider[]>("/api/v1/hospital/providers"),
      api.get<AuthorizationContext>("/api/v1/auth/me/authorization"),
    ]);
    if (appointmentResult.status === "fulfilled") setAppointments(appointmentResult.value);
    if (patientResult.status === "fulfilled") setPatients(patientResult.value);
    if (branchResult.status === "fulfilled") setBranches(branchResult.value);
    if (providerResult.status === "fulfilled") setProviders(providerResult.value);
    if (authResult.status === "fulfilled") setAuth(authResult.value);
    if (appointmentResult.status === "rejected") setError(appointmentResult.reason instanceof ApiError ? appointmentResult.reason.message : "Unable to load appointments.");
    setBusy(false);
  }

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);

  const mayManage = can(auth, "hospital.appointments.manage");
  const active = useMemo(() => appointments.filter((item) => ["pending_payment", "booked", "confirmed", "assigned"].includes(item.status)), [appointments]);
  const today = useMemo(() => { const date = new Date().toDateString(); return active.filter((item) => new Date(item.scheduled_for).toDateString() === date); }, [active]);
  const checkedIn = useMemo(() => appointments.filter((item) => item.status === "checked_in").length, [appointments]);

  async function book(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.post("/api/v1/hospital/appointments", {
        patient_id: String(form.get("patient_id")), branch_id: String(form.get("branch_id")),
        clinician_id: String(form.get("clinician_id") || "") || null,
        scheduled_for: new Date(String(form.get("scheduled_for"))).toISOString(),
        duration_minutes: Number(form.get("duration_minutes")), reason: String(form.get("reason") || "") || null,
      });
      setBookingOpen(false); setNotice("Appointment created and is awaiting consultation payment, HMO clearance, or emergency authorization."); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to book appointment."); }
  }

  async function status(appointment: Appointment, next: "confirmed" | "cancelled" | "no_show" | "completed") {
    const cancellation_reason = next === "cancelled" ? window.prompt("Cancellation reason") : null;
    if (next === "cancelled" && !cancellation_reason) return;
    try {
      await api.post(`/api/v1/hospital/appointments/${appointment.id}/status`, { status: next, cancellation_reason });
      setNotice(`Appointment ${next.replaceAll("_", " ")}.`); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to update appointment."); }
  }

  async function checkIn(appointment: Appointment) {
    try {
      const updated = await api.post<Appointment>(`/api/v1/hospital/appointments/${appointment.id}/check-in`, {});
      setNotice(`Patient checked in. Doctor encounter ${updated.encounter_id?.slice(0, 8) || "created"} is open.`); await load();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to check in patient."); }
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!assigning) return;
    const clinician_id = String(new FormData(event.currentTarget).get("clinician_id") || "");
    if (!clinician_id) return;
    try { await api.post(`/api/v1/hospital/appointments/${assigning.id}/assign`, { clinician_id }); setAssigning(null); setNotice("Clinician assigned. The patient can now be checked in."); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to assign clinician."); }
  }

  async function emergencyRelease(appointment: Appointment) {
    const reason = window.prompt("Emergency reason (this creates a billing reconciliation record)");
    if (!reason) return;
    try { await api.post("/api/v1/hospital/service-authorizations/emergency-override", { service_type: "appointment", service_id: appointment.id, reason }); setNotice("Emergency authorization recorded. Assign a clinician immediately."); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to record emergency override."); }
  }

  return <DashboardShell title="Appointments & check-in" subtitle="Book visits, manage cancellations, and open doctor encounters"><PermissionGate permission="hospital.appointments.read" module="hospital"><main className="mx-auto max-w-[1280px] space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Hospital care path</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Appointments & patient arrival</h1><p className="mt-2 text-sm text-slate-500">Booking stays branch-scoped. Check-in creates the encounter used by doctors, laboratory orders, prescriptions, and billing.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"><RefreshCw size={16} /> Refresh</button>{mayManage && <button onClick={() => setBookingOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} /> Book appointment</button>}</div></header>
    {error && <Notice tone="rose" text={error} />}{notice && <Notice tone="emerald" text={notice} />}
    <section className="grid gap-4 sm:grid-cols-4"><Metric label="Scheduled today" value={today.length} tone="teal" /><Metric label="Upcoming bookings" value={active.length} /><Metric label="Checked in" value={checkedIn} tone="emerald" /><Metric label="Cancelled / no-show" value={appointments.filter((item) => ["cancelled", "no_show"].includes(item.status)).length} tone="rose" /></section>
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><CalendarCheck2 className="text-teal-600" size={22} /><div><h2 className="text-xl font-bold">Visit board</h2><p className="mt-1 text-sm text-slate-500">Financial clearance is checked before a clinician can be assigned. Emergency care remains available with an audited override.</p></div></div>{busy ? <p className="py-12 text-sm text-slate-500">Loading appointments…</p> : <div className="mt-5 divide-y divide-slate-100">{appointments.map((appointment) => <AppointmentRow key={appointment.id} item={appointment} branch={branches.find((branch) => branch.id === appointment.branch_id)} manage={mayManage} confirm={() => void status(appointment, "confirmed")} cancel={() => void status(appointment, "cancelled")} noShow={() => void status(appointment, "no_show")} complete={() => void status(appointment, "completed")} checkIn={() => void checkIn(appointment)} assign={() => setAssigning(appointment)} emergency={() => void emergencyRelease(appointment)} />)}{!appointments.length && <div className="py-14 text-center"><Clock3 className="mx-auto text-slate-300" size={38} /><p className="mt-4 font-bold text-slate-700">No appointments yet</p><p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">Set the consultation fee, create a booking, then clear, assign, and check in the patient.</p>{mayManage && <button onClick={() => setBookingOpen(true)} className="mt-5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">Book first appointment</button>}</div>}</div>}</section>
    <section className="grid gap-4 lg:grid-cols-3"><FlowStep icon={<CalendarCheck2 size={19} />} number="1" title="Book & confirm" text="Tie the visit to a patient and permitted branch." /><FlowStep icon={<Stethoscope size={19} />} number="2" title="Check in" text="Creates the open outpatient encounter for the doctor." /><FlowStep icon={<CheckCircle2 size={19} />} number="3" title="Continue care" text="The encounter is selected for lab orders and prescriptions." /></section>
    {bookingOpen && <BookingModalWithProviders patients={patients} branches={branches} providers={providers} close={() => setBookingOpen(false)} submit={book} />}
    {assigning && <AssignModal appointment={assigning} providers={providers.filter((provider) => !provider.branch_id || provider.branch_id === assigning.branch_id)} close={() => setAssigning(null)} submit={assign} />}
  </main></PermissionGate></DashboardShell>;
}

function AppointmentRow({ item, branch, manage, confirm, cancel, noShow, complete, checkIn, assign, emergency }: { item: Appointment; branch?: Branch; manage: boolean; confirm: () => void; cancel: () => void; noShow: () => void; complete: () => void; checkIn: () => void; assign: () => void; emergency: () => void }) { const date = new Date(item.scheduled_for); return <article className="flex flex-col justify-between gap-4 py-5 lg:flex-row lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{item.patient_name || "Patient"}</h3><Status status={item.status} /></div><p className="mt-1 text-sm text-slate-500">{date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {item.duration_minutes} min · {branch?.name || "Branch"}</p>{item.status === "pending_payment" && <p className="mt-2 text-xs font-semibold text-amber-700">Awaiting consultation payment, verified HMO cover, or emergency authorization.{item.consultation_invoice_id ? ` Invoice ${item.consultation_invoice_id.slice(0, 8)}.` : ""}</p>}{item.preferred_clinician_id && !item.clinician_id && <p className="mt-1 text-xs text-slate-500">Patient preference recorded; no clinician slot is held yet.</p>}{item.reason && <p className="mt-2 text-sm text-slate-600">{item.reason}</p>}{item.encounter_id && <p className="mt-2 text-xs font-semibold text-teal-700">Doctor encounter {item.encounter_id.slice(0, 8)} linked</p>}{item.cancellation_reason && <p className="mt-2 text-xs text-rose-600">Cancellation: {item.cancellation_reason}</p>}</div>{manage && <div className="flex flex-wrap gap-2">{item.status === "pending_payment" && <button onClick={emergency} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">Emergency override</button>}{!item.locked && ["pending_payment", "booked", "confirmed"].includes(item.status) && <button onClick={assign} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white">Assign clinician</button>}{item.status === "assigned" && <button onClick={checkIn} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white">Check in</button>}{item.status === "checked_in" && <button onClick={complete} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Complete visit</button>}{["pending_payment", "booked", "confirmed", "assigned"].includes(item.status) && <><button onClick={noShow} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">No-show</button><button onClick={cancel} className="rounded-lg border border-rose-100 px-3 py-2 text-xs font-bold text-rose-600">Cancel</button></>}</div>}</article>; }
function AssignModal({ appointment, providers, close, submit }: { appointment: Appointment; providers: Provider[]; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void submit(event)} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Assign clinician</h2><p className="mt-1 text-sm text-slate-500">Availability is rechecked atomically when you save.</p></div><button type="button" onClick={close}><X size={18}/></button></div><FormSelect name="clinician_id" required defaultValue={appointment.preferred_clinician_id || ""} className="mt-5 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="">Select available clinician</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}{provider.job_title ? ` · ${provider.job_title}` : ""}</option>)}</FormSelect><button className="mt-6 w-full rounded-xl bg-teal-600 p-3 text-sm font-bold text-white">Assign clinician</button></form></div>; }
function BookingModal({ patients, branches, close, submit }: { patients: Patient[]; branches: Branch[]; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) { const input = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500"; return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void submit(event)} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Book appointment</h2><p className="mt-1 text-sm text-slate-500">Arrival will open the branch-scoped doctor encounter.</p></div><button type="button" onClick={close}><X size={18} /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Patient"><FormSelect name="patient_id" required className={input}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} ({patient.patient_number})</option>)}</FormSelect></Field><Field label="Branch"><FormSelect name="branch_id" required className={input}><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}</FormSelect></Field><Field label="Date & time"><input name="scheduled_for" type="datetime-local" required className={input} /></Field><Field label="Duration"><FormSelect name="duration_minutes" defaultValue="30" className={input}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></FormSelect></Field><Field label="Visit reason" wide><textarea name="reason" rows={3} className={input} placeholder="Reason for visit, symptoms, or service requested" /></Field></div><button className="mt-6 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Book appointment</button></form></div>; }
function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) { return <label className={`text-xs font-bold text-slate-600 ${wide ? "sm:col-span-2" : ""}`}>{label}{children}</label>; }
function Status({ status }: { status: string }) { const color: Record<string, string> = { pending_payment: "bg-amber-50 text-amber-700", booked: "bg-amber-50 text-amber-700", confirmed: "bg-sky-50 text-sky-700", assigned: "bg-indigo-50 text-indigo-700", checked_in: "bg-teal-50 text-teal-700", completed: "bg-emerald-50 text-emerald-700", cancelled: "bg-rose-50 text-rose-700", no_show: "bg-slate-100 text-slate-600" }; return <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${color[status] || "bg-slate-100 text-slate-600"}`}>{status.replaceAll("_", " ")}</span>; }
function Metric({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "teal" | "emerald" | "rose" }) { const colors = { slate: "text-slate-950", teal: "text-teal-600", emerald: "text-emerald-600", rose: "text-rose-600" }; return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold text-slate-400">{label}</p><p className={`mt-2 text-2xl font-bold ${colors[tone]}`}>{value}</p></div>; }
function Notice({ tone, text }: { tone: "rose" | "emerald"; text: string }) { return <div className={`rounded-2xl border px-4 py-3 text-sm ${tone === "rose" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>{text}</div>; }
function FlowStep({ icon, number, title, text }: { icon: ReactNode; number: string; title: string; text: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3 text-teal-600"><span className="grid h-8 w-8 place-items-center rounded-full bg-teal-50 text-xs font-bold">{number}</span>{icon}</div><h2 className="mt-4 font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{text}</p></div>; }
