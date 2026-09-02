"use client";

import FormSelect from "@/components/form-select";
import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, ApiError } from "@/lib/api";

type Patient = { id: string; patient_number: string; full_name: string };
type Branch = { id: string; name: string; code: string };
type Provider = { id: string; name: string; job_title: string | null; department: string | null };
type Availability = { available: boolean; reason: string; message: string };

export default function BookingModal({ patients, branches, providers, close, submit }: { patients: Patient[]; branches: Branch[]; providers: Provider[]; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  const input = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500";
  const [clinicianId, setClinicianId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [duration, setDuration] = useState("30");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  useEffect(() => {
    if (!clinicianId || !branchId || !scheduledFor) {
      setAvailability(null);
      setAvailabilityError("");
      return;
    }
    let active = true;
    setCheckingAvailability(true);
    setAvailabilityError("");
    const query = new URLSearchParams({
      branch_id: branchId,
      scheduled_for: new Date(scheduledFor).toISOString(),
      duration_minutes: duration,
    });
    void api.get<Availability>(`/api/v1/hospital/providers/${clinicianId}/availability?${query}`)
      .then((result) => { if (active) setAvailability(result); })
      .catch((caught) => { if (active) setAvailabilityError(caught instanceof ApiError ? caught.message : "Unable to check clinician availability."); })
      .finally(() => { if (active) setCheckingAvailability(false); });
    return () => { active = false; };
  }, [branchId, clinicianId, duration, scheduledFor]);

  async function book(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (clinicianId && availability && !availability.available) return;
    await submit(event);
  }

  const selectedClinician = providers.find((provider) => provider.id === clinicianId);
  const cannotBook = checkingAvailability || Boolean(clinicianId && availability && !availability.available);

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void book(event)} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Book appointment</h2><p className="mt-1 text-sm text-slate-500">Assign a clinician now or leave the visit unassigned.</p></div><button type="button" onClick={close}><X size={18} /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Patient<FormSelect name="patient_id" required className={input}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} ({patient.patient_number})</option>)}</FormSelect></label><label className="text-xs font-bold text-slate-600">Branch<FormSelect name="branch_id" required value={branchId} onChange={(event) => setBranchId(event.target.value)} className={input}><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}</FormSelect></label><label className="text-xs font-bold text-slate-600">Clinician<FormSelect name="clinician_id" value={clinicianId} onChange={(event) => setClinicianId(event.target.value)} className={input}><option value="">Assign later</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}{provider.job_title ? ` · ${provider.job_title}` : ""}</option>)}</FormSelect></label><label className="text-xs font-bold text-slate-600">Date & time<input name="scheduled_for" type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} required className={input} /></label><label className="text-xs font-bold text-slate-600">Duration<FormSelect name="duration_minutes" value={duration} onChange={(event) => setDuration(event.target.value)} className={input}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></FormSelect></label><label className="text-xs font-bold text-slate-600 sm:col-span-2">Visit reason<textarea name="reason" rows={3} className={input} placeholder="Reason for visit, symptoms, or service requested" /></label></div>{selectedClinician && <div aria-live="polite" className={`mt-5 rounded-2xl border p-4 text-sm ${checkingAvailability ? "border-slate-200 bg-slate-50 text-slate-600" : availability?.available ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-rose-100 bg-rose-50 text-rose-800"}`}>{!scheduledFor || !branchId ? <p>Select the branch and date/time to check <strong>{selectedClinician.name}</strong>&apos;s availability.</p> : checkingAvailability ? <p>Checking <strong>{selectedClinician.name}</strong>&apos;s availability…</p> : availability ? <p>{availability.message}</p> : <p>{availabilityError || "Availability will be confirmed when you save the appointment."}</p>}</div>}<button disabled={cannotBook} className="mt-6 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{checkingAvailability ? "Checking availability…" : clinicianId && availability && !availability.available ? "Choose another date, time, or clinician" : "Book appointment"}</button></form></div>;
}
