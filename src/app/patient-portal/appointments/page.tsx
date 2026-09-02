"use client";

import FormSelect from "@/components/form-select";
import { FormEvent, useEffect, useRef, useState } from "react";
import DashboardShell from "@/components/dashboard-shell";
import PermissionGate from "@/components/permission-gate";
import { api, ApiError } from "@/lib/api";

type Branch = { id: string; name: string };
type Provider = { id: string; name: string; job_title?: string | null; branch_id?: string | null };
type Availability = { available: boolean; message: string };

export default function Page() {
  const [branches, setBranches] = useState<Branch[]>([]); const [providers, setProviders] = useState<Provider[]>([]); const [branchId, setBranchId] = useState(""); const [clinicianId, setClinicianId] = useState(""); const [scheduledFor, setScheduledFor] = useState(""); const [availability, setAvailability] = useState<Availability | null>(null); const [checking, setChecking] = useState(false); const [submitting, setSubmitting] = useState(false); const [notice, setNotice] = useState(""); const [error, setError] = useState("");
  const bookingStarted = useRef(false);

  useEffect(() => {
    void Promise.all([api.get<Branch[]>("/api/v1/catalog/branches"), api.get<Provider[]>("/api/v1/hospital/providers")])
      .then(([branchRows, providerRows]) => { setBranches(branchRows); setProviders(providerRows); })
      .catch((caught) => { if (!bookingStarted.current) setError(caught instanceof ApiError ? caught.message : "Unable to load booking options."); });
  }, []);

  useEffect(() => {
    if (!branchId || !clinicianId || !scheduledFor) { setAvailability(null); return; }
    let active = true;
    setChecking(true);
    void api.get<Availability>(`/api/v1/hospital/providers/${clinicianId}/availability?branch_id=${encodeURIComponent(branchId)}&scheduled_for=${encodeURIComponent(new Date(scheduledFor).toISOString())}&duration_minutes=30`)
      .then((value) => { if (active) setAvailability(value); })
      .catch((caught) => { if (active) setAvailability({ available: false, message: caught instanceof ApiError ? caught.message : "Unable to check clinician availability." }); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [branchId, clinicianId, scheduledFor]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    bookingStarted.current = true;
    setError("");
    if (!availability?.available) { setError("Select an available clinician and appointment time."); return; }
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      await api.post("/api/v1/hospital/patient-portal/appointments", { branch_id: branchId, clinician_id: clinicianId, scheduled_for: new Date(scheduledFor).toISOString(), duration_minutes: 30, reason: form.get("reason") });
      setNotice("Appointment requested. We will confirm your care and payment details.");
      setScheduledFor(""); setAvailability(null); event.currentTarget.reset(); setBranchId(""); setClinicianId("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to book appointment.");
    } finally {
      setSubmitting(false);
    }
  }

  const availableProviders = providers.filter((provider) => !provider.branch_id || provider.branch_id === branchId);
  return <DashboardShell title="Book appointment" subtitle="Choose a location, clinician, and an available time"><PermissionGate permission="patient.portal.access" module="hospital"><main className="mx-auto max-w-[900px] space-y-6"><header><h1 className="text-3xl font-bold">Book an appointment</h1><p className="mt-2 text-sm text-slate-500">Choose a clinician and a time within their working hours. Availability is checked again when you submit.</p></header>{notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<form onSubmit={submit} className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2"><label className="block text-sm font-semibold">Hospital or clinic<FormSelect value={branchId} onChange={(event) => { setBranchId(event.target.value); setClinicianId(""); }} required className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="">Select location</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</FormSelect></label><label className="block text-sm font-semibold">Clinician<FormSelect value={clinicianId} onChange={(event) => setClinicianId(event.target.value)} required disabled={!branchId} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm disabled:bg-slate-50"><option value="">Select clinician</option>{availableProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}{provider.job_title ? ` · ${provider.job_title}` : ""}</option>)}</FormSelect></label><label className="block text-sm font-semibold md:col-span-2">Date and time<input value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} type="datetime-local" min={new Date().toISOString().slice(0, 16)} required className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>{clinicianId && scheduledFor && <p className={`rounded-xl p-3 text-sm md:col-span-2 ${checking ? "bg-slate-50 text-slate-600" : availability?.available ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{checking ? "Checking clinician availability…" : availability?.message}</p>}<label className="block text-sm font-semibold md:col-span-2">Reason for visit<textarea name="reason" required minLength={2} maxLength={2000} rows={4} placeholder="Briefly describe why you need care" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label><button disabled={submitting || checking || !availability?.available} className="rounded-xl bg-teal-600 p-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2">{submitting ? "Requesting appointment…" : checking ? "Checking availability…" : "Request appointment"}</button></form></main></PermissionGate></DashboardShell>;
}
