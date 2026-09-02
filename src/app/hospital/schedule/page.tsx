"use client";

import FormSelect from "@/components/form-select";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Plus, RefreshCw, X } from "lucide-react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";
import { can, type AuthorizationContext } from "@/lib/authorization";

type Provider = { id: string; name: string; job_title: string | null; branch_id: string | null };
type Branch = { id: string; name: string; code: string };
type Appointment = { id: string; patient_name: string | null; clinician_id: string | null; scheduled_for: string; duration_minutes: number; status: string; reason: string | null };
type ProviderSchedule = { id: string; clinician_id: string; clinician_name: string; weekday: number | null; start_time: string | null; end_time: string | null; schedule_type: "working" | "leave"; effective_from: string | null; effective_to: string | null };

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Page() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [schedules, setSchedules] = useState<ProviderSchedule[]>([]);
  const [auth, setAuth] = useState<AuthorizationContext | null>(null);
  const [selected, setSelected] = useState("all");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);
  const [scheduleType, setScheduleType] = useState<"working" | "leave">("working");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setBusy(true); setError("");
    try {
      const [providerList, appointmentList, scheduleList, branchList, authorization] = await Promise.all([
        api.get<Provider[]>("/api/v1/hospital/providers"),
        api.get<Appointment[]>("/api/v1/hospital/appointments"),
        api.get<ProviderSchedule[]>("/api/v1/hospital/providers/schedules"),
        api.get<Branch[]>("/api/v1/catalog/branches"),
        api.get<AuthorizationContext>("/api/v1/auth/me/authorization"),
      ]);
      setProviders(providerList); setAppointments(appointmentList); setSchedules(scheduleList); setBranches(branchList); setAuth(authorization);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load provider schedule.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const rows = useMemo(() => appointments.filter((item) => item.scheduled_for.slice(0, 10) === date && (selected === "all" || item.clinician_id === selected)).sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)), [appointments, date, selected]);
  const mayManage = can(auth, "hospital.appointments.manage");
  const providerName = (id: string | null) => providers.find((item) => item.id === id)?.name || "Unassigned";

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (scheduleType === "leave" && (!String(form.get("effective_from") || "") || !String(form.get("effective_to") || ""))) {
      setError("Choose the start and end dates of leave so the clinician is not blocked indefinitely.");
      return;
    }
    setSaving(true); setError("");
    try {
      await api.post("/api/v1/hospital/providers/schedules", {
        clinician_id: String(form.get("clinician_id")),
        branch_id: String(form.get("branch_id") || "") || null,
        schedule_type: scheduleType,
        weekday: scheduleType === "working" ? Number(form.get("weekday")) : null,
        start_time: scheduleType === "working" ? String(form.get("start_time")) : null,
        end_time: scheduleType === "working" ? String(form.get("end_time")) : null,
        effective_from: String(form.get("effective_from") || "") || null,
        effective_to: String(form.get("effective_to") || "") || null,
      });
      setOpen(false); setNotice(scheduleType === "leave" ? "Clinician leave recorded." : "Clinician working hours saved.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to save clinician availability.");
    } finally {
      setSaving(false);
    }
  }

  async function retire(schedule: ProviderSchedule) {
    try {
      await api.delete(`/api/v1/hospital/providers/schedules/${schedule.id}`);
      setNotice("Availability rule retired.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to retire availability rule.");
    }
  }

  return <DashboardShell title="Provider schedule" subtitle="Configure clinician availability and coordinate patient flow"><PermissionGate permission="hospital.appointments.read" module="hospital"><main className="mx-auto max-w-[1100px] space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Hospital operations</p><h1 className="mt-2 text-3xl font-bold">Provider schedule</h1><p className="mt-2 text-sm text-slate-500">Working hours and leave are checked before a clinician can be selected for an appointment.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold"><RefreshCw size={16} /> Refresh</button>{mayManage && <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} /> Add availability</button>}</div></header>
    {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}{notice && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="space-y-6"><section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row"><label className="text-xs font-bold text-slate-600">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><label className="text-xs font-bold text-slate-600">Clinician<FormSelect value={selected} onChange={(event) => setSelected(event.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="all">All clinicians</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</FormSelect></label></section><section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">{busy ? <p className="p-8 text-sm text-slate-500">Loading schedule…</p> : !rows.length ? <div className="p-12 text-center"><CalendarDays className="mx-auto text-slate-300" size={38} /><p className="mt-4 font-bold text-slate-700">No appointments for this day</p><p className="mt-1 text-sm text-slate-500">Bookings will appear here once a visit is scheduled.</p></div> : <div className="divide-y divide-slate-100">{rows.map((item) => <article key={item.id} className="grid gap-3 p-5 sm:grid-cols-[120px_1fr_auto] sm:items-center"><div><p className="text-lg font-bold text-teal-700">{new Date(item.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p><p className="text-xs text-slate-400">{item.duration_minutes} minutes</p></div><div><p className="font-bold">{item.patient_name || "Patient"}</p><p className="text-sm text-slate-500">{providerName(item.clinician_id)}{item.reason ? ` · ${item.reason}` : ""}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-center text-xs font-bold capitalize text-slate-600">{item.status.replaceAll("_", " ")}</span></article>)}</div>}</section></div><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><Clock3 className="text-teal-600" size={20} /><div><h2 className="font-bold">Availability rules</h2><p className="mt-1 text-xs text-slate-500">Active working hours and leave.</p></div></div><div className="mt-5 space-y-3">{schedules.map((schedule) => <article key={schedule.id} className="rounded-2xl bg-slate-50 p-4 text-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-800">{schedule.clinician_name}</p><p className="mt-1 text-xs font-semibold capitalize text-slate-500">{schedule.schedule_type === "leave" ? "Unavailable / leave" : `${schedule.weekday === null ? "Working" : weekdays[schedule.weekday]} · ${schedule.start_time?.slice(0, 5)}–${schedule.end_time?.slice(0, 5)}`}</p>{(schedule.effective_from || schedule.effective_to) && <p className="mt-1 text-xs text-slate-400">{schedule.effective_from || "Any date"} to {schedule.effective_to || "ongoing"}</p>}</div>{mayManage && <button onClick={() => void retire(schedule)} className="text-xs font-bold text-rose-700">Remove</button>}</div></article>)}{!schedules.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No hours or leave recorded. Clinicians remain bookable at any time until rules are added.</p>}</div></section></section>
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void saveSchedule(event)} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Clinician availability</p><h2 className="mt-1 text-2xl font-bold">Add working hours or leave</h2><p className="mt-1 text-sm text-slate-500">Leave blocks the full selected date range. Working hours are checked at appointment booking.</p></div><button type="button" onClick={() => setOpen(false)}><X size={18} /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600 sm:col-span-2">Clinician<FormSelect name="clinician_id" required className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="">Select clinician</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}{provider.job_title ? ` · ${provider.job_title}` : ""}</option>)}</FormSelect></label><label className="text-xs font-bold text-slate-600">Rule<FormSelect value={scheduleType} onChange={(event) => setScheduleType(event.target.value as "working" | "leave")} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="working">Working hours</option><option value="leave">Leave / unavailable</option></FormSelect></label><label className="text-xs font-bold text-slate-600">Branch<FormSelect name="branch_id" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="">Any assigned branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</FormSelect></label>{scheduleType === "working" && <><label className="text-xs font-bold text-slate-600">Day<FormSelect name="weekday" defaultValue="0" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm">{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</FormSelect></label><label className="text-xs font-bold text-slate-600">Start time<input name="start_time" type="time" required className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label><label className="text-xs font-bold text-slate-600">End time<input name="end_time" type="time" required className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label></>}<label className="text-xs font-bold text-slate-600">Effective from<input name="effective_from" type="date" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label><label className="text-xs font-bold text-slate-600">Effective to<input name="effective_to" type="date" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label></div><button disabled={saving} className="mt-6 w-full rounded-xl bg-teal-600 p-3 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving…" : scheduleType === "leave" ? "Record leave" : "Save working hours"}</button></form></div>}
  </main></PermissionGate></DashboardShell>;
}
