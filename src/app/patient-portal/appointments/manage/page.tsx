"use client";

import { FormEvent, useEffect, useState } from "react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError, downloadApiFile } from "@/lib/api";

type Appointment = { id: string; scheduled_for: string; status: string; reason: string | null };
const manageable = ["pending_payment", "booked", "confirmed", "assigned"];

export default function Page() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState("");

  async function load() {
    try {
      setItems((await api.get<{ appointments: Appointment[] }>("/api/v1/hospital/patient-portal/me")).appointments);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load appointments.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function calendar(item: Appointment) {
    setError("");
    setDownloading(item.id);
    try {
      await downloadApiFile(`/api/v1/hospital/patient-portal/appointments/${item.id}/calendar`, "appointment.ics");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to download the calendar event.");
    } finally {
      setDownloading("");
    }
  }

  async function cancel(id: string) {
    const reason = window.prompt("Optional cancellation reason") || "Cancelled by patient";
    try {
      await api.post(`/api/v1/hospital/patient-portal/appointments/${id}/cancel`, { reason });
      setNotice("Appointment cancelled.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to cancel appointment.");
    }
  }

  async function arrive(id: string) {
    try {
      const result = await api.post<{ queue_ahead: number; arrival_code: string; message: string }>(`/api/v1/hospital/patient-portal/appointments/${id}/arrive`, {});
      setNotice(`${result.message} Queue ahead: ${result.queue_ahead}. Arrival code: ${result.arrival_code}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to record arrival.");
    }
  }

  async function reschedule(event: FormEvent) {
    event.preventDefault();
    if (!selected || !when) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/v1/hospital/patient-portal/appointments/${selected.id}/reschedule`, { scheduled_for: new Date(when).toISOString() });
      setNotice("Appointment rescheduled. Your clinician availability was checked again.");
      setSelected(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to reschedule appointment.");
    } finally {
      setBusy(false);
    }
  }

  return <DashboardShell title="Manage appointments" subtitle="Reschedule, add to your calendar, or arrive for eligible visits"><PermissionGate permission="patient.portal.access" module="hospital"><main className="mx-auto max-w-[1000px] space-y-6"><header><h1 className="text-3xl font-bold">Your appointments</h1><p className="mt-2 text-sm text-slate-500">Changes are checked against clinician availability before they are saved.</p></header>{notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<section className="space-y-3">{items.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><p className="font-bold">{new Date(item.scheduled_for).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}</p><p className="mt-1 text-sm text-slate-500">{item.reason || "Hospital appointment"} · <span className="capitalize">{item.status.replaceAll("_", " ")}</span></p></div>{manageable.includes(item.status) && <div className="flex flex-wrap gap-2"><button disabled={downloading === item.id} onClick={() => void calendar(item)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-60">{downloading === item.id ? "Preparing…" : "Calendar"}</button><button onClick={() => void arrive(item.id)} className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">I have arrived</button><button onClick={() => { setSelected(item); setWhen(new Date(item.scheduled_for).toISOString().slice(0, 16)); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Reschedule</button><button onClick={() => void cancel(item.id)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white">Cancel</button></div>}</article>)}{!items.length && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No appointments found.</p>}</section>{selected && <div className="fixed inset-0 z-50 bg-slate-950/40 p-4"><form onSubmit={reschedule} className="mx-auto mt-12 w-full max-w-xl space-y-5 rounded-3xl bg-white p-6 shadow-xl"><div><h2 className="text-xl font-bold">Reschedule appointment</h2><p className="mt-1 text-sm text-slate-500">We will check the clinician’s availability before saving this change.</p></div><label className="block text-sm font-semibold">New date and time<input required type="datetime-local" min={new Date().toISOString().slice(0, 16)} value={when} onChange={(event) => setWhen(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3" /></label><div className="flex gap-3"><button type="button" onClick={() => setSelected(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold">Keep current time</button><button disabled={busy} className="flex-1 rounded-xl bg-teal-600 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? "Checking…" : "Save new time"}</button></div></form></div>}</main></PermissionGate></DashboardShell>;
}
